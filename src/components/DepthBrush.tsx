/**
 * Pensula pe harta de adâncime, cu zoom puternic (până la 48 de pixeli de ecran pe un pixel al hărții).
 * Zoom: rotița (în jurul mausului), butoanele +/−, două degete. Mutare: butonul din mijloc, clic dreapta,
 * Spațiu + tras, unealta „Mână”.
 * Pensula: mărime 0,2–80 mm, putere, duritate, mână liniștită, presiunea creionului, limite de înălțime,
 * nivel fix ales cu pipeta (Alt+clic), linie dreaptă cu Shift+clic, anulare și refacere pe 50 de pași.
 */
import React, { useEffect, useRef, useState } from 'react'
import { brushDab, composeDepth, layerRect, type BrushTool, type DepthLayer, type Retouch } from '../utils/depthEdit'
import { Brush, Undo2, Redo2, Trash, ZoomIn, ZoomOut, Maximize2, Minimize2, Hand, Pipette, Scan } from 'lucide-react'
import { Slider, boxCls, titleCls, btn } from './editorUi'

const TOOLS: Array<{ id: BrushTool; label: string; hint: string; code: string }> = [
  { id: 'raise', label: 'Ridică', hint: 'adaugă lemn (urcă relieful)', code: 'Digit1' },
  { id: 'lower', label: 'Coboară', hint: 'sapă (coboară relieful)', code: 'Digit2' },
  { id: 'smooth', label: 'Netezește', hint: 'scoate asperitățile și treptele', code: 'Digit3' },
  { id: 'sharpen', label: 'Accentuează', hint: 'scoate mai tare muchiile și liniile mici', code: 'Digit4' },
  { id: 'flatten', label: 'Nivelează', hint: 'aduce zona la o înălțime: de unde ai început trăsătura sau una aleasă cu pipeta', code: 'Digit5' },
  { id: 'erase', label: 'Șterge retușul', hint: 'readuce zona cum era înainte de pensulă', code: 'Digit6' }
]

const UNDO_MAX = 50
const MAX_SCREEN_PX = 48 // cel mai mare zoom: un pixel al hărții = 48 de pixeli pe ecran
const SIZE_MIN = 0.2, SIZE_MAX = 80
const sizeFromSlider = (s: number) => SIZE_MIN * Math.pow(SIZE_MAX / SIZE_MIN, s / 100)
const sliderFromSize = (mm: number) => (100 * Math.log(mm / SIZE_MIN)) / Math.log(SIZE_MAX / SIZE_MIN)
const clampSize = (mm: number) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, mm))
const mmText = (mm: number) => (mm < 2 ? mm.toFixed(1) : mm < 10 ? mm.toFixed(1) : mm.toFixed(0))

interface Props {
  under: { data: Float32Array; w: number; h: number } | null // relieful cu straturi, fără retuș
  retouch: Retouch | null
  onRetouchChange: (r: Retouch | null) => void
  layers: DepthLayer[]
  pieceWmm: number
  pieceHmm: number
  maxDepthMm: number
  resetKey: unknown // la o imagine nouă se golesc anularea și refacerea
  notify: (msg: string) => void
}

type View = { z: number; tx: number; ty: number }

export const DepthBrush: React.FC<Props> = ({ under, retouch, onRetouchChange, layers, pieceWmm, pieceHmm, maxDepthMm, resetKey, notify }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vpRef = useRef<HTMLDivElement>(null)
  const [tool, setTool] = useState<BrushTool>('smooth')
  const [sizeMm, setSizeMm] = useState(12)
  const [strength, setStrength] = useState(0.5)
  const [hardness, setHardness] = useState(0)
  const [steady, setSteady] = useState(0)
  const [usePressure, setUsePressure] = useState(true)
  const [loF, setLoF] = useState(0)
  const [hiF, setHiF] = useState(1)
  const [fixedLevel, setFixedLevel] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const [hand, setHand] = useState(false)
  const [shaded, setShaded] = useState(true)
  const [big, setBig] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [cursor, setCursor] = useState<{ sx: number; sy: number; x: number; y: number } | null>(null)
  const [undo, setUndo] = useState<Array<Retouch | null>>([])
  const [redo, setRedo] = useState<Array<Retouch | null>>([])
  const lastEnd = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => { setUndo([]); setRedo([]); setFixedLevel(null); lastEnd.current = null }, [resetKey])
  // retușul trimis de pensulă; dacă vine altul din afară (oglindire, proiect deschis), pașii vechi nu se mai potrivesc
  const emitted = useRef<Retouch | null>(retouch)
  const emit = (r: Retouch | null) => { emitted.current = r; onRetouchChange(r) }
  useEffect(() => {
    if (retouch === emitted.current) return
    emitted.current = retouch
    setUndo([]); setRedo([]); lastEnd.current = null
  }, [retouch])

  const w = under?.w ?? 0, h = under?.h ?? 0
  const hasMap = !!under
  const pxMm = w ? pieceWmm / w : 1
  const R = Math.max(0.75, sizeMm / 2 / pxMm) // raza în pixeli ai hărții
  // câți pași de anulare încap în ~200 MB (o copie = toată harta): 50 pe hărți mici, mai puțini pe cele mari
  const undoMax = Math.max(5, Math.min(UNDO_MAX, Math.floor(200e6 / Math.max(1, w * h * 4 * 2))))

  // ---------- fereastra și zoomul ----------
  const [vp, setVp] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = vpRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasMap])
  const fitW = w && vp.w && vp.h ? Math.min(vp.w, vp.h * (w / h)) : 0
  const fitH = w ? fitW * (h / w) : 0
  const maxZ = fitW ? Math.max(1, (MAX_SCREEN_PX * w) / fitW) : 1
  const geo = useRef({ fitW, fitH, maxZ, vw: vp.w, vh: vp.h })
  geo.current = { fitW, fitH, maxZ, vw: vp.w, vh: vp.h }
  const [view, setViewState] = useState<View>({ z: 1, tx: 0, ty: 0 })
  const viewRef = useRef(view)
  const setView = (v: View) => {
    const g = geo.current
    const z = Math.min(g.maxZ, Math.max(1, v.z))
    const iw = g.fitW * z, ih = g.fitH * z, m = 40 // măcar 40 px din hartă rămân la vedere
    const c = { z, tx: Math.min(g.vw - m, Math.max(m - iw, v.tx)), ty: Math.min(g.vh - m, Math.max(m - ih, v.ty)) }
    viewRef.current = c
    setViewState(c)
  }
  const fit = () => {
    const g = geo.current
    const c = { z: 1, tx: (g.vw - g.fitW) / 2, ty: (g.vh - g.fitH) / 2 }
    viewRef.current = c
    setViewState(c)
  }
  // hartă de altă mărime sau încă nemărită → toată harta; altfel zoomul rămâne (doar harta se ține la vedere),
  // ca un glisor nou apărut deasupra să nu arunce zoomul înapoi
  const fittedFor = useRef('')
  useEffect(() => {
    const key = `${w}x${h}`
    if (fittedFor.current !== key || viewRef.current.z === 1) { fittedFor.current = key; fit() }
    else setView(viewRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitW, fitH, vp.w, vp.h])
  const zoomAt = (sx: number, sy: number, factor: number) => {
    const v = viewRef.current
    const z2 = Math.min(geo.current.maxZ, Math.max(1, v.z * factor))
    const k = z2 / v.z
    setView({ z: z2, tx: sx - (sx - v.tx) * k, ty: sy - (sy - v.ty) * k })
  }
  const zoomCenter = (factor: number) => zoomAt(geo.current.vw / 2, geo.current.vh / 2, factor)
  const oneToOne = () => { if (fitW) zoomCenter(w / fitW / viewRef.current.z) }
  const local = (e: { clientX: number; clientY: number }) => {
    const r = vpRef.current!.getBoundingClientRect()
    return { sx: e.clientX - r.left, sy: e.clientY - r.top }
  }
  const toMap = (sx: number, sy: number) => {
    const v = viewRef.current, s = (geo.current.fitW * v.z) / Math.max(1, w)
    return { x: (sx - v.tx) / s, y: (sy - v.ty) / s }
  }

  // rotița: zoom în jurul mausului (ascultător „nepasiv”, ca pagina să nu se deruleze)
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {})
  wheelRef.current = (e: WheelEvent) => {
    e.preventDefault()
    const p = local(e)
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
    zoomAt(p.sx, p.sy, Math.exp(-dy * 0.0015))
  }
  useEffect(() => {
    const el = vpRef.current
    if (!el) return
    const f = (e: WheelEvent) => wheelRef.current(e)
    el.addEventListener('wheel', f, { passive: false })
    return () => el.removeEventListener('wheel', f)
  }, [hasMap])

  // ecranul mare: pagina din spate nu se mai derulează
  useEffect(() => {
    if (!big) return
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = old }
  }, [big])

  // ---------- harta de lucru și desenul ----------
  const work = useRef<{ retouch: Float32Array; composed: Float32Array; img: ImageData | null } | null>(null)
  // x, y = vârful pensulei; mx, my = unde e mausul acum (diferă cu „mână liniștită”)
  const stroke = useRef<{ x: number; y: number; mx: number; my: number; pr: number; level: number; before: Retouch | null; pid: number } | null>(null)

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
    const r = retouch && retouch.w === w && retouch.h === h && retouch.data.length === w * h ? retouch.data.slice() : new Float32Array(w * h)
    const cv = canvasRef.current
    if (cv) { cv.width = w; cv.height = h }
    work.current = { retouch: r, composed: composeDepth(under.data, { data: r, w, h }, w, h), img: cv ? new ImageData(w, h) : null }
    paint(0, 0, w - 1, h - 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [under, retouch, shaded])

  const validRetouch = (r: Retouch | null) => (r && r.w === w && r.h === h && r.data.length === w * h ? r : null)
  const levelAt = (x: number, y: number): number | null => {
    const wk = work.current
    if (!wk || x < 0 || y < 0 || x >= w || y >= h) return null
    return wk.composed[Math.floor(y) * w + Math.floor(x)]
  }
  const pressureOf = (e: React.PointerEvent) => (usePressure && e.pointerType === 'pen' ? Math.max(0.05, Math.min(1, e.pressure || 0.5)) : 1)

  const dab = (x: number, y: number, pressure: number) => {
    const wk = work.current, st = stroke.current
    if (!wk || !under || !st) return
    const box = brushDab(tool, under.data, wk.retouch, wk.composed, w, h, x, y, R, Math.min(1, strength * pressure), fixedLevel ?? st.level,
      { hardness, minLevel: loF, maxLevel: hiF })
    paint(box.i0, box.j0, box.i1, box.j1)
  }
  const spacing = () => Math.max(0.25, R / 4)
  // linie dreaptă; capătul de pornire e deja lucrat (de trăsătura de dinainte), deci nu se mai apasă o dată
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, pressure: number) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    if (d < 1e-6) return
    const n = Math.max(1, Math.ceil(d / spacing()))
    for (let s = 1; s <= n; s++) dab(a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n, pressure)
  }
  // trăsătura începută se anulează (ex. al doilea deget a venit pentru zoom)
  const cancelStroke = () => {
    const st = stroke.current, wk = work.current
    stroke.current = null
    if (!st || !wk || !under) return
    wk.retouch = st.before ? st.before.data.slice() : new Float32Array(w * h)
    wk.composed = composeDepth(under.data, { data: wk.retouch, w, h }, w, h)
    paint(0, 0, w - 1, h - 1)
  }

  // ---------- mausul, creionul, degetele ----------
  const ptrs = useRef(new Map<number, { sx: number; sy: number }>())
  const pan = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null)
  const pinch = useRef<{ d: number; mx: number; my: number; v: View } | null>(null)
  const hover = useRef(false)

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = local(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    ptrs.current.set(e.pointerId, p)
    if (ptrs.current.size === 2) {
      if (stroke.current) cancelStroke()
      pan.current = null
      const [a, b] = [...ptrs.current.values()]
      pinch.current = { d: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2, v: viewRef.current }
      return
    }
    if (ptrs.current.size > 2) return
    if (e.button === 1 || e.button === 2 || hand || spaceHeld) {
      e.preventDefault() // butonul din mijloc: fără derularea automată a browserului
      pan.current = { sx: p.sx, sy: p.sy, tx: viewRef.current.tx, ty: viewRef.current.ty }
      return
    }
    if (e.button !== 0 || !work.current) return
    const m = toMap(p.sx, p.sy)
    if (picking || e.altKey) {
      e.preventDefault()
      const v = levelAt(m.x, m.y)
      setPicking(false)
      if (v === null) return
      setFixedLevel(v)
      setTool('flatten')
      notify(`Nivel ales: ${(v * maxDepthMm).toFixed(2)} mm. „Nivelează” duce acum zona exact la această înălțime.`)
      return
    }
    const cx = Math.max(0, Math.min(w - 1, Math.floor(m.x))), cy = Math.max(0, Math.min(h - 1, Math.floor(m.y)))
    const start = e.shiftKey && lastEnd.current ? lastEnd.current : m
    stroke.current = {
      x: m.x, y: m.y, mx: m.x, my: m.y, pr: pressureOf(e), pid: e.pointerId,
      level: work.current.composed[Math.max(0, Math.min(h - 1, Math.floor(start.y))) * w + Math.max(0, Math.min(w - 1, Math.floor(start.x)))] ?? work.current.composed[cy * w + cx],
      before: validRetouch(retouch)
    }
    if (e.shiftKey && lastEnd.current) line(lastEnd.current, m, pressureOf(e))
    else dab(m.x, m.y, pressureOf(e))
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = local(e)
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, p)
    const pc = pinch.current
    if (pc && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()]
      const z2 = Math.min(geo.current.maxZ, Math.max(1, (pc.v.z * (Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1)) / pc.d))
      const k = z2 / pc.v.z
      setView({ z: z2, tx: (a.sx + b.sx) / 2 - (pc.mx - pc.v.tx) * k, ty: (a.sy + b.sy) / 2 - (pc.my - pc.v.ty) * k })
      return
    }
    const m = toMap(p.sx, p.sy)
    setCursor({ sx: p.sx, sy: p.sy, x: m.x, y: m.y })
    if (pan.current) {
      setView({ ...viewRef.current, tx: pan.current.tx + p.sx - pan.current.sx, ty: pan.current.ty + p.sy - pan.current.sy })
      return
    }
    const st = stroke.current
    if (!st || st.pid !== e.pointerId) return
    st.mx = m.x; st.my = m.y; st.pr = pressureOf(e)
    // mână liniștită: vârful pensulei urmează mausul cu întârziere, ca un fir elastic (tremurul se pierde)
    const nx = st.x + (m.x - st.x) * (1 - steady), ny = st.y + (m.y - st.y) * (1 - steady)
    const d = Math.hypot(nx - st.x, ny - st.y)
    const sp = spacing()
    if (d < sp) return
    const n = Math.floor(d / sp), pr = pressureOf(e)
    for (let s = 1; s <= n; s++) dab(st.x + ((nx - st.x) * s) / n, st.y + ((ny - st.y) * s) / n, pr)
    st.x = st.x + ((nx - st.x) * n * sp) / d
    st.y = st.y + ((ny - st.y) * n * sp) / d
  }

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    ptrs.current.delete(e.pointerId)
    if (pinch.current) { if (ptrs.current.size < 2) pinch.current = null; return }
    if (pan.current) { pan.current = null; return }
    const st = stroke.current, wk = work.current
    if (!st || st.pid !== e.pointerId) return
    // cu „mână liniștită” vârful rămâne în urmă: trăsătura se termină unde ai ridicat mausul
    if (steady > 0) { line({ x: st.x, y: st.y }, { x: st.mx, y: st.my }, st.pr); st.x = st.mx; st.y = st.my }
    stroke.current = null
    lastEnd.current = { x: st.x, y: st.y }
    if (!wk) return
    setUndo(u => [...u.slice(-(undoMax - 1)), st.before])
    setRedo([])
    emit({ data: wk.retouch.slice(), w, h })
  }
  // gest anulat de sistem (palma pe ecran, fereastră schimbată): trăsătura începută se aruncă
  const onCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    ptrs.current.delete(e.pointerId)
    if (ptrs.current.size < 2) pinch.current = null
    pan.current = null
    if (stroke.current?.pid === e.pointerId) cancelStroke()
  }

  // ---------- anulare / refacere ----------
  const doUndo = () => {
    if (!undo.length) return
    const prev = undo[undo.length - 1]
    setUndo(u => u.slice(0, -1))
    setRedo(r => [...r.slice(-(undoMax - 1)), validRetouch(retouch)])
    emit(validRetouch(prev))
  }
  const doRedo = () => {
    if (!redo.length) return
    const next = redo[redo.length - 1]
    setRedo(r => r.slice(0, -1))
    setUndo(u => [...u.slice(-(undoMax - 1)), validRetouch(retouch)])
    emit(validRetouch(next))
  }
  const clearAll = () => {
    setUndo(u => [...u.slice(-(undoMax - 1)), validRetouch(retouch)])
    setRedo([])
    emit(null)
  }

  // ---------- tastatura (doar cu mausul pe hartă sau pe ecranul mare) ----------
  const keyRef = useRef<(e: KeyboardEvent, down: boolean) => void>(() => {})
  keyRef.current = (e: KeyboardEvent, down: boolean) => {
    if (e.code === 'Space' && !down) { setSpaceHeld(false); return }
    if (!down || !(hover.current || big)) return
    const t = e.target as HTMLElement | null
    if (t && ((t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
    // AltGr (pe tastatura românească) vine ca Ctrl+Alt: nu e Ctrl
    const ctrl = (e.ctrlKey || e.metaKey) && !e.altKey
    // tasta fizică de lângă P (ă / î pe tastatura românească) sau caracterul [ ] (AltGr+F / AltGr+G)
    const left = e.code === 'BracketLeft' || e.key === '[' || e.key === '{'
    const right = e.code === 'BracketRight' || e.key === ']' || e.key === '}'
    let done = true
    if (e.code === 'Space') setSpaceHeld(true)
    else if (ctrl && e.code === 'KeyZ' && !e.shiftKey) doUndo()
    else if (ctrl && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) doRedo()
    else if (ctrl) done = false
    else if (left && e.shiftKey) setHardness(x => Math.max(0, Math.round((x - 0.1) * 10) / 10))
    else if (right && e.shiftKey) setHardness(x => Math.min(1, Math.round((x + 0.1) * 10) / 10))
    else if (left) setSizeMm(x => clampSize(x / 1.15))
    else if (right) setSizeMm(x => clampSize(x * 1.15))
    else if (e.code === 'Digit0' || e.code === 'Numpad0') fit()
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomCenter(1.25)
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomCenter(0.8)
    else if (e.code === 'Escape') { setPicking(false); setBig(false) }
    else if (e.key === 'Alt') { /* Alt = pipetă la clic; oprim meniul browserului */ }
    else {
      const tl = e.altKey ? undefined : TOOLS.find(x => x.code === e.code) // AltGr+cifră scrie alte semne
      if (tl) setTool(tl.id)
      else done = false
    }
    if (done) e.preventDefault()
  }
  useEffect(() => {
    const d = (e: KeyboardEvent) => keyRef.current(e, true)
    const u = (e: KeyboardEvent) => keyRef.current(e, false)
    // fereastra a pierdut atenția (Alt+Tab) cu Spațiul ținut: nu rămâne „apăsat”
    const b = () => setSpaceHeld(false)
    window.addEventListener('keydown', d)
    window.addEventListener('keyup', u)
    window.addEventListener('blur', b)
    return () => { window.removeEventListener('keydown', d); window.removeEventListener('keyup', u); window.removeEventListener('blur', b) }
  }, [])

  // ---------- desenul ferestrei ----------
  const scr = fitW && w ? (fitW * view.z) / w : 1 // pixeli de ecran pe un pixel al hărții
  const ringR = R * scr
  const panning = hand || spaceHeld || pan.current !== null
  const hereV = cursor ? levelAt(cursor.x, cursor.y) : null
  const mm = (f: number) => (f * maxDepthMm).toFixed(2)

  return (
    <div className={big ? 'fixed inset-0 z-50 bg-[#141312] p-3 flex flex-col gap-2 overflow-auto' : boxCls}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={titleCls}><Brush className="w-4 h-4" /> Retușare cu pensula</span>
        <button onClick={() => setBig(b => !b)} className={`${btn(big)} ml-auto flex items-center gap-1`} title="Harta pe tot ecranul (Esc = înapoi)">
          {big ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />} {big ? 'Înapoi (Esc)' : 'Ecran mare'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {TOOLS.map((t, i) => (
          <button key={t.id} title={`${t.hint} (tasta ${i + 1})`} onClick={() => { setTool(t.id); setHand(false) }} className={btn(tool === t.id && !hand)}>{t.label}</button>
        ))}
      </div>
      <span className="text-[10px] text-stone-500">{TOOLS.find(t => t.id === tool)?.hint}.</span>

      <div className={`grid gap-2 ${big ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2'}`}>
        <Slider label="Mărime pensulă" value={sliderFromSize(sizeMm)} min={0} max={100} step={0.5}
          onChange={v => setSizeMm(Math.round(sizeFromSlider(v) * 10) / 10)}
          shown={`${mmText(sizeMm)} mm · ${Math.max(1, Math.round(2 * R))} px`} title="Tastele [ și ] o micșorează / măresc" />
        <Slider label="Putere" value={strength} min={0.02} max={1} step={0.01} onChange={setStrength} shown={`${Math.round(strength * 100)}%`} />
        <Slider label="Duritate (margine)" value={hardness} min={0} max={1} step={0.05} onChange={setHardness}
          shown={hardness === 0 ? 'moale' : hardness >= 1 ? 'tare' : `${Math.round(hardness * 100)}%`} title="Shift+[ și Shift+] o schimbă" />
        <Slider label="Mână liniștită" value={steady} min={0} max={0.95} step={0.05} onChange={setSteady}
          shown={steady === 0 ? 'oprită' : `${Math.round(steady * 100)}%`} title="Pensula urmează mausul cu întârziere: tremurul mâinii nu mai apare în lemn" />
        <Slider label="Nu coborî sub" value={loF} min={0} max={1} step={0.005} onChange={v => setLoF(Math.min(v, hiF))} shown={`${mm(loF)} mm`} />
        <Slider label="Nu urca peste" value={hiF} min={0} max={1} step={0.005} onChange={v => setHiF(Math.max(v, loF))} shown={`${mm(hiF)} mm`} />
        {fixedLevel !== null && (
          <Slider label="Nivel fix (Nivelează)" value={fixedLevel} min={0} max={1} step={0.002} onChange={setFixedLevel} shown={`${mm(fixedLevel)} mm`} />
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        <button onClick={() => setPicking(p => !p)} className={`${btn(picking)} flex items-center gap-1`} title="Clic pe hartă alege înălțimea pentru „Nivelează” (sau Alt+clic oricând)">
          <Pipette className="w-3.5 h-3.5" /> Pipetă nivel
        </button>
        {fixedLevel !== null && (
          <button onClick={() => setFixedLevel(null)} className={btn(false)} title="„Nivelează” folosește iar înălțimea de unde începi trăsătura">Nivel de la începutul trăsăturii</button>
        )}
        <label className="flex items-center gap-1 text-[11px] text-stone-300" title="Cu creion pe tabletă sau pe ecran: apăsarea mai tare = putere mai mare">
          <input type="checkbox" checked={usePressure} onChange={e => setUsePressure(e.target.checked)} className="accent-amber-500" /> Presiunea creionului
        </label>
        <label className="flex items-center gap-1 text-[11px] text-stone-300 ml-auto">
          <input type="checkbox" checked={shaded} onChange={e => setShaded(e.target.checked)} className="accent-amber-500" /> Umbre (altfel gri)
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        <button onClick={doUndo} disabled={!undo.length} className={`${btn(false)} flex items-center gap-1 disabled:opacity-40`} title="Ctrl+Z"><Undo2 className="w-3.5 h-3.5" /> Anulează</button>
        <button onClick={doRedo} disabled={!redo.length} className={`${btn(false)} flex items-center gap-1 disabled:opacity-40`} title="Ctrl+Y"><Redo2 className="w-3.5 h-3.5" /> Refă</button>
        <button onClick={clearAll} disabled={!retouch} className={`${btn(false)} flex items-center gap-1 disabled:opacity-40`}><Trash className="w-3.5 h-3.5" /> Șterge tot retușul</button>
        <span className="ml-auto flex items-center gap-1">
          <button onClick={() => zoomCenter(0.8)} className={btn(false)} title="Micșorează (−)"><ZoomOut className="w-3.5 h-3.5" /></button>
          <span className="text-[11px] font-mono text-stone-200 w-14 text-center">{Math.round(view.z * 100)}%</span>
          <button onClick={() => zoomCenter(1.25)} className={btn(false)} title="Mărește (+)"><ZoomIn className="w-3.5 h-3.5" /></button>
          <button onClick={fit} className={btn(false)} title="Toată harta (0)"><Scan className="w-3.5 h-3.5" /></button>
          <button onClick={oneToOne} className={btn(false)} title="Un pixel al hărții = un pixel pe ecran">1:1</button>
          <button onClick={() => setHand(x => !x)} className={`${btn(hand)} flex items-center gap-1`} title="Mută harta cu mausul sau cu degetul (sau ține Spațiu)"><Hand className="w-3.5 h-3.5" /></button>
        </span>
      </div>

      {under ? (
        <div
          ref={vpRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onPointerEnter={() => { hover.current = true }}
          onPointerLeave={() => { hover.current = false; setCursor(null) }}
          onContextMenu={e => e.preventDefault()}
          className={`relative overflow-hidden rounded-lg border border-[#3a352c] bg-[#0b0a09] touch-none select-none ${big ? 'flex-1 min-h-[240px]' : ''}`}
          style={{ height: big ? undefined : 460, cursor: panning ? 'grab' : picking ? 'crosshair' : 'none' }}
          aria-label="Harta de adâncime: trage cu pensula ca s-o retușezi; rotița face zoom"
        >
          <div className="absolute left-0 top-0" style={{ width: fitW, height: fitH, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`, transformOrigin: '0 0' }}>
            <canvas ref={canvasRef} className="block w-full h-full" style={{ imageRendering: scr >= 3 ? 'pixelated' : 'auto' }} />
            {layers.filter(l => l.visible).map(l => {
              const r = layerRect(l, w, h, pieceWmm, pieceHmm)
              return <div key={l.id} className="absolute pointer-events-none border-dashed border-sky-400/70"
                style={{ borderWidth: 1 / view.z, left: `${(r.x0 / w) * 100}%`, top: `${(r.y0 / h) * 100}%`, width: `${(r.pw / w) * 100}%`, height: `${(r.ph / h) * 100}%` }} />
            })}
          </div>
          {cursor && !panning && !picking && (ringR >= 3 ? (
            <>
              <div className="absolute pointer-events-none rounded-full border-2 border-amber-400/90 shadow-[0_0_0_1px_#0008]"
                style={{ left: cursor.sx - ringR, top: cursor.sy - ringR, width: 2 * ringR, height: 2 * ringR }} />
              {hardness > 0.05 && hardness < 1 && (
                <div className="absolute pointer-events-none rounded-full border border-dashed border-amber-200/80"
                  style={{ left: cursor.sx - ringR * hardness, top: cursor.sy - ringR * hardness, width: 2 * ringR * hardness, height: 2 * ringR * hardness }} />
              )}
            </>
          ) : (
            <>
              <div className="absolute pointer-events-none bg-amber-400" style={{ left: cursor.sx - 6, top: cursor.sy, width: 13, height: 1 }} />
              <div className="absolute pointer-events-none bg-amber-400" style={{ left: cursor.sx, top: cursor.sy - 6, width: 1, height: 13 }} />
            </>
          ))}
        </div>
      ) : <span className="text-[11px] text-stone-500">Încarcă o imagine ca să apară harta.</span>}

      {under && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-stone-400 font-mono">
          <span>1 pixel = {pxMm.toFixed(2)} mm</span>
          {cursor && hereV !== null && (
            <span className="text-stone-200">x {(cursor.x * pxMm).toFixed(1)} mm · y {(cursor.y * pxMm).toFixed(1)} mm · înălțime {mm(hereV)} mm</span>
          )}
        </div>
      )}
      <span className="text-[10px] text-stone-500">
        Rotița = zoom · Spațiu, clic dreapta sau butonul din mijloc + tras = mută harta · două degete = zoom pe ecran tactil ·
        [ ] = mărime (pe tastatura românească: tastele ă și î de lângă P) · Shift+aceleași = duritate · 1–6 = unelte ·
        Alt+clic = pipetă · Shift+clic = linie dreaptă de la ultima trăsătură · Ctrl+Z / Ctrl+Y = anulează / refă
        ({undoMax} pași pe harta asta) · 0 = toată harta
      </span>
    </div>
  )
}
