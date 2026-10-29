import React, { useEffect, useRef, useState } from 'react'
import {
  LAYER_MODES, brushDab, composeDepth, layerRect, resizeDepth,
  type BrushTool, type DepthLayer, type LayerMode, type Retouch
} from '../utils/depthEdit'
import { decodeDepthPng16 } from '../utils/depthMapIO'
import { stlToDepth, loadImageFile } from '../utils/modelImport'
import { estimateDepthAI, type AiDepthResult } from '../utils/aiDepth'
import { Brush, Layers, Undo2, Trash, Sparkles, Eye, EyeOff, ArrowUp, ArrowDown, Plus, Loader2 } from 'lucide-react'

interface Props {
  under: { data: Float32Array; w: number; h: number } | null // relieful cu straturi, fără retuș
  retouch: Retouch | null
  onRetouchChange: (r: Retouch | null) => void
  layers: DepthLayer[]
  onLayersChange: (l: DepthLayer[]) => void
  pieceWmm: number
  pieceHmm: number
  maxDepthMm: number
  sourceCanvas: HTMLCanvasElement | null
  onUseAsRelief: (d: AiDepthResult, name: string) => void
  notify: (msg: string) => void
}

const LAYER_MAX_SIDE = 1024

const TOOLS: Array<{ id: BrushTool; label: string; hint: string }> = [
  { id: 'raise', label: 'Ridică', hint: 'adaugă lemn (urcă relieful)' },
  { id: 'lower', label: 'Coboară', hint: 'sapă (coboară relieful)' },
  { id: 'smooth', label: 'Netezește', hint: 'scoate asperitățile și treptele' },
  { id: 'flatten', label: 'Nivelează', hint: 'aduce zona la înălțimea de unde ai început trăsătura' },
  { id: 'erase', label: 'Șterge retușul', hint: 'readuce zona cum era înainte de pensulă' }
]

/** Orice fișier → hartă 0..1: PNG 16 biți exact, STL privit de sus, imagine după luminozitate */
async function fileToDepth(file: File): Promise<{ data: Float32Array; w: number; h: number }> {
  let data: Float32Array, w: number, h: number
  if (/\.stl$/i.test(file.name)) {
    const d = stlToDepth(await file.arrayBuffer(), file.name, LAYER_MAX_SIDE)
    data = d.data; w = d.width; h = d.height
  } else {
    const d16 = /\.png$/i.test(file.name) ? await decodeDepthPng16(await file.arrayBuffer()) : null
    if (d16) {
      data = d16.data; w = d16.width; h = d16.height
    } else {
      const img = await loadImageFile(file)
      w = img.naturalWidth || img.width; h = img.naturalHeight || img.height
      const k = Math.min(1, LAYER_MAX_SIDE / Math.max(w, h))
      w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k))
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, w, h)
      const px = ctx.getImageData(0, 0, w, h).data
      data = new Float32Array(w * h)
      // transparent = gol; altfel luminozitatea (alb = sus)
      for (let i = 0; i < w * h; i++) data[i] = px[i * 4 + 3] < 128 ? 0 : (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255
    }
  }
  if (Math.max(w, h) > LAYER_MAX_SIDE) {
    const k = LAYER_MAX_SIDE / Math.max(w, h)
    const nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k))
    data = resizeDepth(data, w, h, nw, nh); w = nw; h = nh
  }
  return { data, w, h }
}

/** Cupolă eliptică netedă (componentă gata făcută, ca la Aspire) */
function domeLayer(): { data: Float32Array; w: number; h: number } {
  const n = 256, data = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n * 2 - 1, y = (j + 0.5) / n * 2 - 1
    const r2 = x * x + y * y
    data[j * n + i] = r2 < 1 ? Math.sqrt(1 - r2) : 0
  }
  return { data, w: n, h: n }
}

let layerSeq = 1
function newLayer(name: string, d: { data: Float32Array; w: number; h: number }, mode: LayerMode, strength: number, widthFrac = 1): DepthLayer {
  return { id: `L${Date.now()}_${layerSeq++}`, name, data: d.data, w: d.w, h: d.h, mode, strength, offset: 0, cx: 0.5, cy: 0.5, widthFrac, visible: true }
}

const boxCls = 'bg-[#141312] p-3 rounded-xl border border-[#2e2a24] flex flex-col gap-2'
const titleCls = 'text-xs font-bold text-amber-400 flex items-center gap-1.5'
const btn = (on: boolean) => `px-2 py-1 rounded-md text-[11px] font-bold border ${on ? 'bg-amber-600 border-amber-500 text-white' : 'bg-[#201d19] border-[#383228] text-stone-300 hover:bg-[#2a2620]'}`

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; shown?: string }> = ({ label, value, min, max, step, onChange, shown }) => (
  <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
    <span className="flex justify-between"><span>{label}</span><span className="text-stone-200 font-mono">{shown ?? value}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="accent-amber-500" />
  </label>
)

export const DepthEditor: React.FC<Props> = ({ under, retouch, onRetouchChange, layers, onLayersChange, pieceWmm, pieceHmm, maxDepthMm, sourceCanvas, onUseAsRelief, notify }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<BrushTool>('smooth')
  const [sizeMm, setSizeMm] = useState(12)
  const [strength, setStrength] = useState(0.5)
  const [shaded, setShaded] = useState(true)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  // fiecare pas reține și mărimea hărții; la o imagine nouă lista se golește (retușul vechi nu se potrivește)
  const [undo, setUndo] = useState<Array<Retouch | null>>([])
  useEffect(() => { setUndo([]) }, [sourceCanvas])
  const [ai, setAi] = useState<{ busy: boolean; text: string; fraction: number | null; result: AiDepthResult | null }>({ busy: false, text: '', fraction: null, result: null })
  const layerInput = useRef<HTMLInputElement>(null)

  const w = under?.w ?? 0, h = under?.h ?? 0
  const pxMm = w ? pieceWmm / w : 1
  // copiile de lucru: retușul și harta finală, modificate pe loc cât ții apăsat
  const work = useRef<{ retouch: Float32Array; composed: Float32Array; img: ImageData | null } | null>(null)
  const stroke = useRef<{ x: number; y: number; level: number; before: Retouch | null } | null>(null)

  const paint = (i0: number, j0: number, i1: number, j1: number) => {
    const cv = canvasRef.current, wk = work.current
    if (!cv || !wk || !wk.img) return
    const { composed, img } = wk
    const px = img.data
    // pantă în mm/mm, ca umbrele să arate adâncimea reală a lemnului
    const k = maxDepthMm / pxMm
    const a0 = Math.max(0, i0 - 1), a1 = Math.min(w - 1, i1 + 1), b0 = Math.max(0, j0 - 1), b1 = Math.min(h - 1, j1 + 1)
    for (let j = b0; j <= b1; j++) {
      for (let i = a0; i <= a1; i++) {
        const v = composed[j * w + i]
        let r: number, g: number, b: number
        if (shaded) {
          const dx = (composed[j * w + Math.min(w - 1, i + 1)] - composed[j * w + Math.max(0, i - 1)]) * 0.5 * k
          const dy = (composed[Math.min(h - 1, j + 1) * w + i] - composed[Math.max(0, j - 1) * w + i]) * 0.5 * k
          // lumină din stânga-sus, joasă: scoate în evidență orice treaptă.
          // normala (−dx, −dy, 1), lumina (−1, −1, 1.2)/1.855 (Y-ul imaginii în jos)
          const lam = Math.max(0, (dx + dy + 1.2) / (Math.sqrt(dx * dx + dy * dy + 1) * 1.855))
          const s = Math.min(1, 0.12 + lam) * (0.7 + 0.3 * v)
          r = 235 * s; g = 196 * s; b = 140 * s
        } else {
          r = g = b = v * 255
        }
        const o = (j * w + i) * 4
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255
      }
    }
    cv.getContext('2d')!.putImageData(img, 0, 0, a0, b0, a1 - a0 + 1, b1 - b0 + 1)
  }

  // la orice schimbare din afară (imagine, straturi, retuș salvat) refac copiile și desenul
  useEffect(() => {
    if (!under) { work.current = null; return }
    const r = retouch && retouch.w === w && retouch.h === h ? retouch.data.slice() : new Float32Array(w * h)
    const cv = canvasRef.current
    if (cv) { cv.width = w; cv.height = h }
    work.current = { retouch: r, composed: composeDepth(under.data, { data: r, w, h }, w, h), img: cv ? new ImageData(w, h) : null }
    paint(0, 0, w - 1, h - 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [under, retouch, shaded])

  const toMap = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * w, y: ((e.clientY - rect.top) / rect.height) * h, sx: e.clientX - rect.left, sy: e.clientY - rect.top }
  }
  const R = Math.max(1, sizeMm / 2 / pxMm)

  const dab = (x: number, y: number) => {
    const wk = work.current, st = stroke.current
    if (!wk || !under || !st) return
    const box = brushDab(tool, under.data, wk.retouch, wk.composed, w, h, x, y, R, strength, st.level)
    paint(box.i0, box.j0, box.i1, box.j1)
  }

  const onDown = (e: React.PointerEvent) => {
    if (!work.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toMap(e)
    const k = Math.max(0, Math.min(h - 1, Math.floor(p.y))) * w + Math.max(0, Math.min(w - 1, Math.floor(p.x)))
    stroke.current = { x: p.x, y: p.y, level: work.current.composed[k], before: retouch && retouch.w === w && retouch.h === h ? retouch : null }
    dab(p.x, p.y)
  }
  const onMove = (e: React.PointerEvent) => {
    const p = toMap(e)
    setCursor({ x: p.sx, y: p.sy })
    const st = stroke.current
    if (!st) return
    // apăsări dese de-a lungul mișcării (un sfert de rază), ca urma să fie continuă
    const d = Math.hypot(p.x - st.x, p.y - st.y)
    const spacing = Math.max(0.5, R / 4)
    if (d < spacing) return
    const n = Math.floor(d / spacing)
    for (let s = 1; s <= n; s++) dab(st.x + ((p.x - st.x) * s) / n, st.y + ((p.y - st.y) * s) / n)
    st.x = p.x; st.y = p.y
  }
  const onUp = () => {
    const st = stroke.current, wk = work.current
    stroke.current = null
    if (!st || !wk) return
    setUndo(u => [...u.slice(-14), st.before])
    onRetouchChange({ data: wk.retouch.slice(), w, h })
  }

  const doUndo = () => {
    if (!undo.length) return
    const prev = undo[undo.length - 1]
    setUndo(u => u.slice(0, -1))
    onRetouchChange(prev && prev.w === w && prev.h === h && prev.data.length === w * h ? prev : null)
  }

  const setLayer = (id: string, patch: Partial<DepthLayer>) => onLayersChange(layers.map(l => (l.id === id ? { ...l, ...patch } : l)))
  const moveLayer = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= layers.length) return
    const next = layers.slice()
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onLayersChange(next)
  }

  const addLayerFile = async (file: File) => {
    try {
      const d = await fileToDepth(file)
      onLayersChange([...layers, newLayer(file.name, d, 'add', 0.3, Math.min(1, d.w / Math.max(d.w, d.h)))])
      notify(`Strat adăugat: ${file.name} (${d.w}×${d.h})`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Fișierul nu a putut fi citit ca hartă.')
    }
  }

  const runAi = async () => {
    if (!sourceCanvas || ai.busy) return
    setAi({ busy: true, text: 'Pornesc...', fraction: null, result: null })
    try {
      const res = await estimateDepthAI(sourceCanvas, (text, fraction) => setAi(a => ({ ...a, text, fraction })))
      setAi({ busy: false, text: '', fraction: null, result: res })
    } catch (err) {
      setAi({ busy: false, text: err instanceof Error ? err.message : String(err), fraction: null, result: null })
    }
  }

  // cercul pensulei, în pixeli de ecran
  const cssScale = canvasRef.current ? canvasRef.current.getBoundingClientRect().width / Math.max(1, w) : 1

  return (
    <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4 text-stone-200 flex flex-col gap-3 shadow-xl">
      <span className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
        <Brush className="w-4 h-4" /> Atelier hartă de adâncime
      </span>

      {/* Hartă AI */}
      <div className={boxCls}>
        <span className={titleCls}><Sparkles className="w-4 h-4" /> Hartă făcută de AI din poză</span>
        <span className="text-[10px] text-stone-400">
          AI-ul „ghicește” ce e aproape și ce e departe în poză (chip, mâini, veșminte) și face din asta relief. Merge pe fotografii
          și pe icoane. Prima dată descarcă modelul (~27 MB); poza ta nu pleacă din calculator.
        </span>
        <button onClick={runAi} disabled={!sourceCanvas || ai.busy} className="self-start flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">
          {ai.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Fă harta AI din poza încărcată
        </button>
        {ai.text && (
          <div className="flex flex-col gap-1">
            <span className={`text-[11px] ${ai.busy ? 'text-amber-300' : 'text-red-300'}`}>{ai.text}</span>
            {ai.busy && ai.fraction !== null && (
              <div className="h-1.5 bg-[#2a2620] rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${Math.round(ai.fraction * 100)}%` }} /></div>
            )}
          </div>
        )}
        {ai.result && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-emerald-300">Harta AI e gata ({ai.result.width}×{ai.result.height}). Ce fac cu ea?</span>
            <div className="flex flex-wrap gap-1.5">
              <button className={btn(false)} onClick={() => { onUseAsRelief(ai.result!, 'harta_AI'); setAi(a => ({ ...a, result: null })) }}>
                Folosește-o ca relief
              </button>
              <button className={btn(false)} onClick={() => {
                const r = ai.result!
                onLayersChange([...layers, newLayer('Hartă AI', { data: r.data, w: r.width, h: r.height }, 'add', 0.4)])
                setAi(a => ({ ...a, result: null }))
                notify('Harta AI a fost adăugată ca strat peste relieful icoanei: volum de la AI, detalii din icoană.')
              }}>
                Adaug-o ca strat (volum peste relieful icoanei)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pensula */}
      <div className={boxCls}>
        <span className={titleCls}><Brush className="w-4 h-4" /> Retușare cu pensula</span>
        <div className="flex flex-wrap gap-1">
          {TOOLS.map(t => <button key={t.id} title={t.hint} onClick={() => setTool(t.id)} className={btn(tool === t.id)}>{t.label}</button>)}
        </div>
        <span className="text-[10px] text-stone-500">{TOOLS.find(t => t.id === tool)?.hint}. Trage cu mouse-ul sau cu degetul peste hartă.</span>
        <div className="grid grid-cols-2 gap-2">
          <Slider label="Mărime pensulă" value={sizeMm} min={1} max={80} step={1} onChange={setSizeMm} shown={`${sizeMm} mm`} />
          <Slider label="Putere" value={strength} min={0.05} max={1} step={0.05} onChange={setStrength} shown={`${Math.round(strength * 100)}%`} />
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <button onClick={doUndo} disabled={!undo.length} className={`${btn(false)} flex items-center gap-1 disabled:opacity-40`}><Undo2 className="w-3.5 h-3.5" /> Anulează</button>
          <button onClick={() => { setUndo(u => [...u.slice(-14), retouch && retouch.w === w && retouch.h === h ? retouch : null]); onRetouchChange(null) }} disabled={!retouch} className={`${btn(false)} flex items-center gap-1 disabled:opacity-40`}><Trash className="w-3.5 h-3.5" /> Șterge tot retușul</button>
          <label className="flex items-center gap-1 text-[11px] text-stone-300 ml-auto">
            <input type="checkbox" checked={shaded} onChange={e => setShaded(e.target.checked)} className="accent-amber-500" /> Umbre (altfel gri)
          </label>
        </div>
        {under ? (
          <div className="relative self-center w-full" style={{ maxWidth: Math.min(520, 420 * (w / Math.max(1, h)) + 0.0001) }} onPointerLeave={() => setCursor(null)}>
            <canvas
              ref={canvasRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className="w-full rounded-lg border border-[#3a352c] cursor-none touch-none"
              aria-label="Harta de adâncime: trage cu pensula ca s-o retușezi"
            />
            {cursor && (
              <div className="absolute pointer-events-none rounded-full border-2 border-amber-400/90 shadow-[0_0_0_1px_#0008]"
                style={{ left: cursor.x - R * cssScale, top: cursor.y - R * cssScale, width: 2 * R * cssScale, height: 2 * R * cssScale }} />
            )}
            {layers.filter(l => l.visible).map(l => {
              const r = layerRect(l, w, h, pieceWmm, pieceHmm)
              return <div key={l.id} className="absolute pointer-events-none border border-dashed border-sky-400/70"
                style={{ left: `${(r.x0 / w) * 100}%`, top: `${(r.y0 / h) * 100}%`, width: `${(r.pw / w) * 100}%`, height: `${(r.ph / h) * 100}%` }} />
            })}
          </div>
        ) : <span className="text-[11px] text-stone-500">Încarcă o imagine ca să apară harta.</span>}
      </div>

      {/* Straturi */}
      <div className={boxCls}>
        <span className={titleCls}><Layers className="w-4 h-4" /> Combinare de hărți (straturi)</span>
        <span className="text-[10px] text-stone-400">
          Pune peste relief alte hărți: PNG 16 biți (Aspire, ArtCAM, Carveco), STL, orice imagine (alb = sus) sau harta AI.
          Negrul stratului e „gol” și nu schimbă nimic.
        </span>
        <input ref={layerInput} type="file" accept=".png,.jpg,.jpeg,.webp,.bmp,.stl,image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) addLayerFile(f); e.target.value = '' }} />
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => layerInput.current?.click()} className={`${btn(false)} flex items-center gap-1`}><Plus className="w-3.5 h-3.5" /> Strat din fișier</button>
          <button onClick={() => onLayersChange([...layers, newLayer('Cupolă', domeLayer(), 'add', 0.3, 0.3)])} className={`${btn(false)} flex items-center gap-1`}><Plus className="w-3.5 h-3.5" /> Cupolă</button>
        </div>
        {layers.map((l, idx) => (
          <div key={l.id} className="border border-[#3a352c] rounded-lg p-2 flex flex-col gap-1.5 bg-[#1a1815]">
            <div className="flex items-center gap-1.5">
              <button onClick={() => setLayer(l.id, { visible: !l.visible })} title={l.visible ? 'Ascunde' : 'Arată'} className="text-stone-300">
                {l.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <span className="text-[11px] font-bold text-stone-200 truncate flex-1">{idx + 1}. {l.name}</span>
              <button onClick={() => moveLayer(idx, -1)} disabled={idx === 0} title="Mai jos în ordine (se aplică mai devreme)" className="text-stone-400 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => moveLayer(idx, 1)} disabled={idx === layers.length - 1} title="Mai sus în ordine (se aplică mai târziu)" className="text-stone-400 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
              <button onClick={() => onLayersChange(layers.filter(x => x.id !== l.id))} title="Șterge stratul" className="text-red-400"><Trash className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex flex-wrap gap-1">
              {LAYER_MODES.map(m => <button key={m.id} title={m.hint} onClick={() => setLayer(l.id, { mode: m.id })} className={btn(l.mode === m.id)}>{m.label}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <Slider label="Înălțime strat" value={l.strength} min={0} max={1.5} step={0.01} onChange={v => setLayer(l.id, { strength: v })} shown={`${(l.strength * maxDepthMm).toFixed(1)} mm`} />
              {(l.mode === 'max' || l.mode === 'min' || l.mode === 'replace') && (
                <Slider label="Ridicare de bază" value={l.offset} min={0} max={1} step={0.01} onChange={v => setLayer(l.id, { offset: v })} shown={`${(l.offset * maxDepthMm).toFixed(1)} mm`} />
              )}
              <Slider label="Mărime" value={l.widthFrac} min={0.05} max={1.5} step={0.01} onChange={v => setLayer(l.id, { widthFrac: v })} shown={`${(l.widthFrac * pieceWmm).toFixed(0)} mm lățime`} />
              <Slider label="Poziție stânga–dreapta" value={l.cx} min={0} max={1} step={0.005} onChange={v => setLayer(l.id, { cx: v })} shown={`${(l.cx * pieceWmm).toFixed(0)} mm`} />
              <Slider label="Poziție sus–jos" value={l.cy} min={0} max={1} step={0.005} onChange={v => setLayer(l.id, { cy: v })} shown={`${(l.cy * pieceHmm).toFixed(0)} mm de sus`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
