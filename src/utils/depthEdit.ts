/**
 * Editarea hărții de adâncime, ca la softurile premium (Aspire „componente”, ArtCAM „relief”):
 * - straturi: alte hărți (PNG 16 biți, imagine, STL, hartă AI) puse peste relief, combinate
 *   prin adunare, scădere, cel mai înalt, cel mai jos sau înlocuire, cu poziție și mărime;
 * - retuș cu pensula: ridică, coboară, netezește, nivelează, șterge retușul.
 *
 * Toate înălțimile sunt normalizate 0..1 (1 = fața lemnului, 0 = fundul reliefului),
 * rândul 0 = marginea de sus a piesei, la fel ca harta din processImageHeightmap.
 * Ordinea: relieful de bază → straturile, în ordine → retușul (o diferență, pe pixel) → 0..1.
 */

export type LayerMode = 'add' | 'subtract' | 'max' | 'min' | 'replace'

export interface DepthLayer {
  id: string
  name: string
  data: Float32Array // 0..1, rândul 0 = sus; 0 = gol (nu schimbă nimic)
  w: number
  h: number
  mode: LayerMode
  strength: number   // cât din adâncimea piesei înseamnă alb-ul stratului (1 = toată adâncimea)
  offset: number     // ridicarea stratului (doar la „cel mai înalt / cel mai jos / înlocuire”)
  cx: number         // centrul stratului, fracție din lățimea piesei (0 = stânga)
  cy: number         // centrul stratului, fracție din înălțimea piesei (0 = sus)
  widthFrac: number  // lățimea stratului, fracție din lățimea piesei; înălțimea după proporția lui
  visible: boolean
}

export interface Retouch { data: Float32Array; w: number; h: number }

export type BrushTool = 'raise' | 'lower' | 'smooth' | 'flatten' | 'erase'

export const LAYER_MODES: Array<{ id: LayerMode; label: string; hint: string }> = [
  { id: 'add', label: 'Adună', hint: 'stratul se pune deasupra reliefului (ex. un ornament pe ramă)' },
  { id: 'subtract', label: 'Scade', hint: 'stratul se sapă în relief (ex. litere adâncite)' },
  { id: 'max', label: 'Cel mai înalt', hint: 'rămâne punctul mai înalt dintre relief și strat' },
  { id: 'min', label: 'Cel mai jos', hint: 'rămâne punctul mai jos (taie din relief forma stratului)' },
  { id: 'replace', label: 'Înlocuiește', hint: 'unde stratul are formă, relieful de dedesubt dispare' }
]

const EMPTY = 1e-3 // sub atât, pixelul stratului e „gol” (fundal negru)

/** Unde cade stratul pe harta de bază (în pixeli ai hărții de bază) */
export function layerRect(layer: DepthLayer, baseW: number, baseH: number, pieceWmm: number, pieceHmm: number) {
  const wMm = layer.widthFrac * pieceWmm
  const hMm = wMm * (layer.h / layer.w)
  const pw = (wMm / pieceWmm) * baseW
  const ph = (hMm / pieceHmm) * baseH
  return { x0: layer.cx * baseW - pw / 2, y0: layer.cy * baseH - ph / 2, pw, ph }
}

function sampleBilinear(data: Float32Array, w: number, h: number, fx: number, fy: number, emptyAware = false): number {
  const x = Math.max(0, Math.min(w - 1, fx)), y = Math.max(0, Math.min(h - 1, fy))
  if (w < 2 || h < 2) return data[Math.round(y) * w + Math.round(x)] ?? 0
  const x0 = Math.min(w - 2, Math.floor(x)), y0 = Math.min(h - 2, Math.floor(y))
  const tx = x - x0, ty = y - y0
  const a = data[y0 * w + x0], b = data[y0 * w + x0 + 1], c = data[(y0 + 1) * w + x0], d = data[(y0 + 1) * w + x0 + 1]
  // la straturi: un vecin gol nu trebuie să tragă marginea formei în jos (ar face o pantă falsă)
  if (emptyAware && Math.min(a, b, c, d) <= EMPTY) {
    const v = tx < 0.5 ? (ty < 0.5 ? a : c) : (ty < 0.5 ? b : d)
    return v
  }
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty
}

/** Relieful de bază cu straturile aplicate (fără retuș). Nu modifică intrarea. */
export function applyLayers(
  base: Float32Array, w: number, h: number, layers: DepthLayer[], pieceWmm: number, pieceHmm: number
): Float32Array {
  const out = base.slice()
  for (const L of layers) {
    if (!L.visible || L.w < 1 || L.h < 1) continue
    const { x0, y0, pw, ph } = layerRect(L, w, h, pieceWmm, pieceHmm)
    const i0 = Math.max(0, Math.floor(x0)), i1 = Math.min(w - 1, Math.ceil(x0 + pw))
    const j0 = Math.max(0, Math.floor(y0)), j1 = Math.min(h - 1, Math.ceil(y0 + ph))
    const sx = L.w / pw, sy = L.h / ph
    for (let j = j0; j <= j1; j++) {
      const ly = (j + 0.5 - y0) * sy - 0.5
      if (ly < -0.5 || ly > L.h - 0.5) continue
      for (let i = i0; i <= i1; i++) {
        const lx = (i + 0.5 - x0) * sx - 0.5
        if (lx < -0.5 || lx > L.w - 0.5) continue
        const v = sampleBilinear(L.data, L.w, L.h, lx, ly, true)
        if (v <= EMPTY) continue
        const k = j * w + i
        const lv = L.offset + L.strength * v
        switch (L.mode) {
          case 'add': out[k] += L.strength * v; break
          case 'subtract': out[k] -= L.strength * v; break
          case 'max': out[k] = Math.max(out[k], lv); break
          case 'min': out[k] = Math.min(out[k], lv); break
          case 'replace': out[k] = lv; break
        }
      }
    }
  }
  return out
}

/** Harta finală: straturi + retuș, limitată la 0..1 */
export function composeDepth(under: Float32Array, retouch: Retouch | null, w: number, h: number): Float32Array {
  const out = new Float32Array(under.length)
  const r = retouch && retouch.w === w && retouch.h === h && retouch.data.length === under.length ? retouch.data : null
  for (let k = 0; k < out.length; k++) {
    const v = under[k] + (r ? r[k] : 0)
    out[k] = v < 0 ? 0 : v > 1 ? 1 : v
  }
  return out
}

/**
 * O „apăsare” de pensulă în (px, py) (pixeli ai hărții), cu raza R pixeli și puterea 0..1.
 * Modifică retușul și harta finală (composed) în zona pensulei; întoarce dreptunghiul atins.
 * level = înălțimea la care nivelează „flatten” (luată la începutul trăsăturii).
 */
export function brushDab(
  tool: BrushTool,
  under: Float32Array, retouch: Float32Array, composed: Float32Array, w: number, h: number,
  px: number, py: number, R: number, strength: number, level: number
): { i0: number; j0: number; i1: number; j1: number } {
  const i0 = Math.max(0, Math.floor(px - R)), i1 = Math.min(w - 1, Math.ceil(px + R))
  const j0 = Math.max(0, Math.floor(py - R)), j1 = Math.min(h - 1, Math.ceil(py + R))
  // la netezire: media locală se ia din harta de dinaintea apăsării (altfel ar depinde de ordinea pixelilor)
  let src: Float32Array | null = null
  const br = Math.max(1, Math.round(R / 4))
  let sw = 0
  if (tool === 'smooth') {
    const a0 = Math.max(0, i0 - br), a1 = Math.min(w - 1, i1 + br), b0 = Math.max(0, j0 - br), b1 = Math.min(h - 1, j1 + br)
    sw = a1 - a0 + 1
    src = new Float32Array(sw * (b1 - b0 + 1))
    for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) src[(j - b0) * sw + (i - a0)] = composed[j * w + i]
    // medie pe fereastră, separabilă (rânduri, apoi coloane), pe zona copiată
    const sh = b1 - b0 + 1
    const tmp = new Float32Array(src.length)
    for (let j = 0; j < sh; j++) {
      for (let i = 0; i < sw; i++) {
        let s = 0, n = 0
        for (let d = -br; d <= br; d++) { const ii = i + d; if (ii >= 0 && ii < sw) { s += src[j * sw + ii]; n++ } }
        tmp[j * sw + i] = s / n
      }
    }
    for (let i = 0; i < sw; i++) {
      for (let j = 0; j < sh; j++) {
        let s = 0, n = 0
        for (let d = -br; d <= br; d++) { const jj = j + d; if (jj >= 0 && jj < sh) { s += tmp[jj * sw + i]; n++ } }
        src[j * sw + i] = s / n
      }
    }
    // indicii în src sunt relativi la (a0, b0)
    const ox = a0, oy = b0
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const f = falloff(Math.hypot(i + 0.5 - px, j + 0.5 - py) / R)
        if (f <= 0) continue
        const k = j * w + i
        const target = src[(j - oy) * sw + (i - ox)]
        retouch[k] += (target - composed[k]) * strength * f
        composed[k] = clamp01(under[k] + retouch[k])
      }
    }
    return { i0, j0, i1, j1 }
  }
  const step = 0.02 * strength // ridicare/coborâre pe apăsare: 2% din adâncime la putere maximă
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const f = falloff(Math.hypot(i + 0.5 - px, j + 0.5 - py) / R)
      if (f <= 0) continue
      const k = j * w + i
      switch (tool) {
        case 'raise': retouch[k] += step * f; break
        case 'lower': retouch[k] -= step * f; break
        case 'flatten': retouch[k] += (level - composed[k]) * strength * f; break
        case 'erase': retouch[k] *= 1 - strength * f; break
      }
      // retușul nu crește la nesfârșit peste limite: ce iese din 0..1 nu se mai vede oricum
      const v = under[k] + retouch[k]
      if (v > 1) retouch[k] = 1 - under[k]
      else if (v < 0) retouch[k] = -under[k]
      composed[k] = clamp01(under[k] + retouch[k])
    }
  }
  return { i0, j0, i1, j1 }
}

function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v }

/** Margine moale: 1 în centru, 0 la marginea pensulei, fără treaptă */
function falloff(t: number): number {
  if (t >= 1) return 0
  const u = 1 - t * t
  return u * u
}

/** Redimensionare bilineară (hărți mari aduse la mărimea de lucru) */
export function resizeDepth(data: Float32Array, w: number, h: number, nw: number, nh: number): Float32Array {
  const out = new Float32Array(nw * nh)
  for (let j = 0; j < nh; j++) {
    const fy = ((j + 0.5) * h) / nh - 0.5
    for (let i = 0; i < nw; i++) {
      out[j * nw + i] = sampleBilinear(data, w, h, ((i + 0.5) * w) / nw - 0.5, fy)
    }
  }
  return out
}
