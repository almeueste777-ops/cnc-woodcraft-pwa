import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { LAYER_MODES, resizeDepth, type DepthLayer, type LayerMode, type Retouch } from '../utils/depthEdit'
import { decodeDepthPng16 } from '../utils/depthMapIO'
import { stlToDepth, loadImageFile } from '../utils/modelImport'
import { estimateDepthAI, type AiDepthResult } from '../utils/aiDepth'
import { addPhotoDetail, canvasGrey } from '../utils/aiDetail'
import { cancelIconMaps, estimateIconMaps, type IconMaps } from '../utils/iconReliefAi'
import { finishIconRelief, prepareIconRelief, ICON_RELIEF_DEFAULTS, type IconReliefOpts } from '../utils/iconRelief'
import { Brush, Layers, Trash, Sparkles, Eye, EyeOff, ArrowUp, ArrowDown, Plus, Loader2 } from 'lucide-react'
import { DepthBrush } from './DepthBrush'
import { Slider, boxCls, titleCls, btn } from './editorUi'

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

export const DepthEditor: React.FC<Props> = ({ under, retouch, onRetouchChange, layers, onLayersChange, pieceWmm, pieceHmm, maxDepthMm, sourceCanvas, onUseAsRelief, notify }) => {
  const [ai, setAi] = useState<{ busy: boolean; text: string; fraction: number | null; result: AiDepthResult | null }>({ busy: false, text: '', fraction: null, result: null })
  // cât din detaliile fine ale pozei (față, falduri, pene, litere) se pun peste volumul dat de AI
  const [detail, setDetail] = useState(1)
  // o hartă AI ține de poza din care a ieșit: la poză nouă o uităm (altfel s-ar pune peste altă imagine)
  // fiecare rulare are un număr; doar ultima are voie să scrie starea (o rulare veche care se termină târziu e ignorată)
  const aiRun = useRef(0)
  // „icon” = 3 modele (sfântul separat de fundal + volum + relief sculptat); „photo” = un singur model, rapid
  const [aiMode, setAiMode] = useState<'icon' | 'photo'>('icon')
  const [icon, setIcon] = useState<IconMaps | null>(null)
  const [iconOpts, setIconOpts] = useState<IconReliefOpts>(ICON_RELIEF_DEFAULTS)
  const shownOpts = useDeferredValue(iconOpts) // glisorul rămâne lin; harta se reface imediat după
  // partea grea (estompări, praguri) o dată pe icoană; glisoarele refac doar partea rapidă
  const iconPrep = useMemo(() => (icon ? prepareIconRelief(icon.depth, icon.mask, icon.height, icon.width, icon.height_) : null), [icon])
  const iconRelief = useMemo(() => (iconPrep ? finishIconRelief(iconPrep, shownOpts) : null), [iconPrep, shownOpts])
  // la clic: exact valorile de pe glisoare acum (previzualizarea poate fi cu o clipă în urmă)
  const iconNow = () => (iconPrep ? finishIconRelief(iconPrep, iconOpts) : null)
  const iconPreview = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = iconPreview.current
    if (!cv || !icon || !iconRelief) return
    cv.width = icon.width
    cv.height = icon.height_
    const img = new ImageData(icon.width, icon.height_)
    for (let i = 0; i < iconRelief.length; i++) {
      const g = Math.round(iconRelief[i] * 255)
      img.data[i * 4] = g; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = g; img.data[i * 4 + 3] = 255
    }
    cv.getContext('2d')!.putImageData(img, 0, 0)
  }, [icon, iconRelief])
  useEffect(() => { aiRun.current++; cancelIconMaps(); setAi({ busy: false, text: '', fraction: null, result: null }); setIcon(null) }, [sourceCanvas])
  // ieși din atelier (alt mod al aplicației) în timp ce lucrează AI-ul: calculul se oprește, memoria se eliberează
  useEffect(() => () => { aiRun.current++; cancelIconMaps() }, [])
  const withDetail = (r: AiDepthResult): AiDepthResult => {
    if (!sourceCanvas || detail <= 0) return r
    return { ...r, data: addPhotoDetail(r.data, canvasGrey(sourceCanvas, r.width, r.height), r.width, r.height, detail) }
  }
  const layerInput = useRef<HTMLInputElement>(null)


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
    const run = ++aiRun.current
    setAi({ busy: true, text: 'Pornesc...', fraction: null, result: null })
    setIcon(null)
    const progress = (text: string, fraction: number | null) => { if (aiRun.current === run) setAi(a => ({ ...a, text, fraction })) }
    try {
      if (aiMode === 'icon') {
        const maps = await estimateIconMaps(sourceCanvas, progress)
        if (aiRun.current !== run) return
        setIcon(maps)
        setAi({ busy: false, text: '', fraction: null, result: null })
        return
      }
      const res = await estimateDepthAI(sourceCanvas, progress)
      if (aiRun.current !== run) return
      setAi({ busy: false, text: '', fraction: null, result: res })
    } catch (err) {
      if (aiRun.current !== run) return
      setAi({ busy: false, text: err instanceof Error ? err.message : String(err), fraction: null, result: null })
    }
  }


  return (
    <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4 text-stone-200 flex flex-col gap-3 shadow-xl">
      <span className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
        <Brush className="w-4 h-4" /> Atelier hartă de adâncime
      </span>

      {/* Hartă AI */}
      <div className={boxCls}>
        <span className={titleCls}><Sparkles className="w-4 h-4" /> Hartă făcută de AI din poză</span>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setAiMode('icon')} disabled={ai.busy} className={btn(aiMode === 'icon')}>Icoană (3 modele, cel mai bun)</button>
          <button onClick={() => setAiMode('photo')} disabled={ai.busy} className={btn(aiMode === 'photo')}>Fotografie (1 model, rapid)</button>
        </div>
        {aiMode === 'icon' ? (
          <span className="text-[10px] text-stone-400">
            Trei modele AI lucrează împreună: ISNet desparte sfântul de fundal (fundalul rămâne plat, jos), Depth Anything dă
            volumul figurii, DeepBump citește umbrele picturii și sculptează fața, mâinile, penele, faldurile. Prima dată descarcă
            ~170 MB (modelele + motorul AI, o singură dată), apoi merge și fără internet; durează ~1 minut pe icoană.
            Poza ta nu pleacă din calculator. Cel mai bine iese pe o poză decupată doar pe icoană (fără perete, fără ramă de lemn).
            <span className="block text-stone-500 mt-0.5">
              Modele: ISNet (Qin et al., ECCV 2022; AGPL-3.0 pe onnx-community), Depth Anything V2 (Apache-2.0), DeepBump (GPL-3.0, Hugo Tini).
              Aplicația e software liber, GPL-3.0 sau mai nouă; codul sursă:{' '}
              <a href="https://github.com/almeueste777-ops/cnc-woodcraft-pwa" target="_blank" rel="noreferrer" className="underline">github.com/almeueste777-ops/cnc-woodcraft-pwa</a>.
            </span>
          </span>
        ) : (
          <span className="text-[10px] text-stone-400">
            Un singur model (Depth Anything) „ghicește” ce e aproape și ce e departe în poză; peste el se pun detaliile fine din
            luminozitatea pozei, cât alegi tu. Prima dată descarcă ~27 MB; poza ta nu pleacă din calculator.
          </span>
        )}
        <button onClick={runAi} disabled={!sourceCanvas || ai.busy} className="self-start flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">
          {ai.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {aiMode === 'icon' ? 'Fă harta de icoană din poza încărcată' : 'Fă harta AI din poza încărcată'}
        </button>
        {aiMode === 'icon' && sourceCanvas && Math.max(sourceCanvas.width, sourceCanvas.height) < 400 && (
          <span className="text-[11px] text-amber-300">
            Poza e mică ({sourceCanvas.width}×{sourceCanvas.height} px): AI-ul poate greși conturul sfântului. O poză de cel puțin 600 px pe latura mare iese mult mai bine.
          </span>
        )}
        {icon && iconRelief && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-emerald-300">Harta de icoană e gata ({icon.width}×{icon.height_}). Potrivește-o, apoi alege ce faci cu ea:</span>
            <canvas ref={iconPreview} className="self-center w-full max-w-[260px] rounded-md border border-[#3a352c] bg-black" aria-label="Previzualizarea hărții de icoană" />
            <Slider label="Detalii sculptate (DeepBump)" value={iconOpts.detail} min={0} max={2} step={0.1}
              onChange={v => setIconOpts(o => ({ ...o, detail: v }))}
              shown={iconOpts.detail === 0 ? 'fără' : iconOpts.detail <= 0.6 ? 'puține' : iconOpts.detail <= 1.2 ? 'obișnuit' : 'adânci'} />
            <Slider label="Înălțimea fundalului" value={iconOpts.background} min={0} max={0.5} step={0.01}
              onChange={v => setIconOpts(o => ({ ...o, background: v }))} shown={`${(iconOpts.background * maxDepthMm).toFixed(1)} mm`} />
            <Slider label="Cât iese sfântul din fundal" value={iconOpts.figureBase} min={0} max={0.8} step={0.01}
              onChange={v => setIconOpts(o => ({ ...o, figureBase: v }))} shown={`${Math.round(iconOpts.figureBase * 100)}%`} />
            <div className="flex flex-wrap gap-1.5">
              <button className={btn(false)} onClick={() => { onUseAsRelief({ data: iconNow() ?? iconRelief, width: icon.width, height: icon.height_ }, 'harta_icoana'); setIcon(null) }}>
                Folosește-o ca relief
              </button>
              <button className={btn(false)} onClick={() => {
                onLayersChange([...layers, newLayer('Hartă de icoană', { data: iconNow() ?? iconRelief, w: icon.width, h: icon.height_ }, 'replace', 1)])
                setIcon(null)
                notify('Harta de icoană a fost adăugată ca strat (înlocuiește relieful sub ea). O poți muta și micșora din „Straturi”.')
              }}>
                Adaug-o ca strat
              </button>
              <button className={btn(false)} onClick={() => setIconOpts(ICON_RELIEF_DEFAULTS)}>Valorile obișnuite</button>
            </div>
          </div>
        )}
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
            <Slider label="Detalii din poză" value={detail} min={0} max={2} step={0.25} onChange={setDetail}
              shown={detail === 0 ? 'fără (doar AI)' : detail <= 0.5 ? 'puține' : detail <= 1 ? 'mediu (recomandat)' : detail <= 1.5 ? 'multe' : 'foarte multe'} />
            <div className="flex flex-wrap gap-1.5">
              <button className={btn(false)} onClick={() => { onUseAsRelief(withDetail(ai.result!), 'harta_AI'); setAi(a => ({ ...a, result: null })) }}>
                Folosește-o ca relief
              </button>
              <button className={btn(false)} onClick={() => {
                const r = withDetail(ai.result!)
                onLayersChange([...layers, newLayer('Hartă AI', { data: r.data, w: r.width, h: r.height }, 'add', 0.4)])
                setAi(a => ({ ...a, result: null }))
                notify('Harta AI a fost adăugată ca strat peste relieful icoanei: volum de la AI, detalii din icoană.')
              }}>
                Adaug-o ca strat (volum și detalii peste relieful icoanei)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pensula, cu zoom */}
      <DepthBrush under={under} retouch={retouch} onRetouchChange={onRetouchChange} layers={layers}
        pieceWmm={pieceWmm} pieceHmm={pieceHmm} maxDepthMm={maxDepthMm} resetKey={sourceCanvas} notify={notify} />

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
