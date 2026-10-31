/**
 * Harta de adâncime a unei icoane din trei modele AI gratuite (rulate în iconRelief.worker.ts):
 *  - BiRefNet_lite (MIT): masca sfântului — ce e figură și ce e fundal;
 *  - Depth Anything V2 small (Apache-2.0): volumul mare al figurii;
 *  - DeepBump (GPL-3.0, Hugo Tini): normalele suprafeței citite din umbrele pozei → relieful sculptat
 *    (fața, penele, faldurile), adus la înălțime prin integrarea Frankot–Chellappa.
 * Aici sunt doar calculele, fără browser (verificate în tests/iconrelief-check.ts).
 */
import { blurGrey } from './aiDetail'
import { resizeDepth } from './depthEdit'

export const DEEPBUMP_TILE = 256
export const DEEPBUMP_OVERLAP = 64

/** colțurile pătratelor de 256 px care acoperă imaginea (cu suprapunere), pentru DeepBump */
export function deepbumpTiles(w: number, h: number, T = DEEPBUMP_TILE, O = DEEPBUMP_OVERLAP): Array<{ ox: number; oy: number }> {
  const S = T - O
  const xs: number[] = [], ys: number[] = []
  for (let x = 0; ; x += S) { const ox = Math.max(0, Math.min(x, w - T)); if (!xs.includes(ox)) xs.push(ox); if (x + T >= w) break }
  for (let y = 0; ; y += S) { const oy = Math.max(0, Math.min(y, h - T)); if (!ys.includes(oy)) ys.push(oy); if (y + T >= h) break }
  const out: Array<{ ox: number; oy: number }> = []
  for (const oy of ys) for (const ox of xs) out.push({ ox, oy })
  return out
}

/** greutatea fiecărui pixel din pătrat: mare în mijloc, mică la margini (cusături nevăzute) */
export function tileWeights(T = DEEPBUMP_TILE): Float32Array {
  const m = new Float32Array(T * T)
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) m[y * T + x] = Math.min(x + 1, T - x, y + 1, T - y) / (T / 2)
  return m
}

/** imagine gri mărită cu margini repetate până la cel puțin T×T (DeepBump cere pătrate întregi) */
export function padGrey(g: Float32Array, w: number, h: number, T = DEEPBUMP_TILE): { data: Float32Array; w: number; h: number } {
  const W = Math.max(w, T), H = Math.max(h, T)
  if (W === w && H === h) return { data: g, w, h }
  const out = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = g[Math.min(h - 1, y) * w + Math.min(w - 1, x)]
  return { data: out, w: W, h: H }
}

export interface NormalAcc { nx: Float32Array; ny: Float32Array; nz: Float32Array; wsum: Float32Array; w: number; h: number }
export function newNormalAcc(w: number, h: number): NormalAcc {
  return { nx: new Float32Array(w * h), ny: new Float32Array(w * h), nz: new Float32Array(w * h), wsum: new Float32Array(w * h), w, h }
}

/** adună ieșirea DeepBump a unui pătrat (3×T×T, 0..1, normale OpenGL: x dreapta, y sus, z spre privitor) */
export function accumulateTile(acc: NormalAcc, out: ArrayLike<number>, ox: number, oy: number, weights: Float32Array, T = DEEPBUMP_TILE) {
  const TT = T * T
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (oy + y) * acc.w + ox + x, m = weights[y * T + x], k = y * T + x
      acc.nx[i] += (out[k] - 0.5) * m
      acc.ny[i] += (out[TT + k] - 0.5) * m
      acc.nz[i] += (out[2 * TT + k] - 0.5) * m
      acc.wsum[i] += m
    }
  }
}

/** pantele înălțimii din normale (y-ul imaginii în jos), tăiate la ±L ca un pixel ciudat să nu strice tot */
export function normalsToGradients(acc: NormalAcc, w: number, h: number, L = 8): { hx: Float32Array; hy: Float32Array } {
  const hx = new Float32Array(w * h), hy = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * acc.w + x, o = y * w + x, ws = acc.wsum[i] || 1
      let nx = acc.nx[i] / ws, ny = -acc.ny[i] / ws, nz = acc.nz[i] / ws
      const l = Math.hypot(nx, ny, nz) || 1
      nx /= l; ny /= l; nz = Math.max(0.05, nz / l)
      hx[o] = Math.max(-L, Math.min(L, -nx / nz))
      hy[o] = Math.max(-L, Math.min(L, -ny / nz))
    }
  }
  return { hx, hy }
}

function fft1(re: Float64Array, im: Float64Array, n: number, off: number, stride: number, xr: Float64Array, xi: Float64Array) {
  for (let i = 0; i < n; i++) { xr[i] = re[off + i * stride]; xi[i] = im[off + i * stride] }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { let t = xr[i]; xr[i] = xr[j]; xr[j] = t; t = xi[i]; xi[i] = xi[j]; xi[j] = t }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const tr = xr[b] * cr - xi[b] * ci, ti = xr[b] * ci + xi[b] * cr
        xr[b] = xr[a] - tr; xi[b] = xi[a] - ti; xr[a] += tr; xi[a] += ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr; cr = ncr
      }
    }
  }
  for (let i = 0; i < n; i++) { re[off + i * stride] = xr[i]; im[off + i * stride] = xi[i] }
}
function fft2(re: Float64Array, im: Float64Array, W: number, H: number, inverse: boolean) {
  const xr = new Float64Array(Math.max(W, H)), xi = new Float64Array(Math.max(W, H))
  if (inverse) for (let i = 0; i < im.length; i++) im[i] = -im[i]
  for (let y = 0; y < H; y++) fft1(re, im, W, y * W, 1, xr, xi)
  for (let x = 0; x < W; x++) fft1(re, im, H, x, W, xr, xi)
  if (inverse) { const s = 1 / (W * H); for (let i = 0; i < im.length; i++) { re[i] *= s; im[i] = -im[i] * s } }
}

/**
 * Frankot–Chellappa: înălțimea care se potrivește cel mai bine pantelor hx, hy (w×h).
 * Pantele se aduc întâi la laturi puteri ale lui 2 (cu pantele scalate pe măsură), apoi imaginea e oglindită
 * exact pe ambele axe: așa rămâne periodică pentru FFT, fără salturi la margini (cu umplere cu zero,
 * pozele nepătrate ieșeau strâmbe la margini — găsit de audit).
 */
export function frankotChellappa(hx: Float32Array, hy: Float32Array, w: number, h: number): Float32Array {
  const w2 = 1 << Math.ceil(Math.log2(Math.max(2, w))), h2 = 1 << Math.ceil(Math.log2(Math.max(2, h)))
  const gx = w2 === w && h2 === h ? hx : resizeDepth(hx, w, h, w2, h2).map(v => v * (w / w2))
  const gy = w2 === w && h2 === h ? hy : resizeDepth(hy, w, h, w2, h2).map(v => v * (h / h2))
  const W = 2 * w2, H = 2 * h2
  const pr = new Float64Array(W * H), pi = new Float64Array(W * H), qr = new Float64Array(W * H), qi = new Float64Array(W * H)
  for (let y = 0; y < H; y++) {
    const yy = y < h2 ? y : 2 * h2 - 1 - y, sy = y < h2 ? 1 : -1
    for (let x = 0; x < W; x++) {
      const xx = x < w2 ? x : 2 * w2 - 1 - x, sx = x < w2 ? 1 : -1
      pr[y * W + x] = gx[yy * w2 + xx] * sx
      qr[y * W + x] = gy[yy * w2 + xx] * sy
    }
  }
  fft2(pr, pi, W, H, false)
  fft2(qr, qi, W, H, false)
  // rezultatul se scrie peste pr/pi (mai puțină memorie: 4 tablouri în loc de 6)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (2 * Math.PI * (x < W / 2 ? x : x - W)) / W, v = (2 * Math.PI * (y < H / 2 ? y : y - H)) / H
      const d = u * u + v * v
      const i = y * W + x
      if (d === 0) { pr[i] = 0; pi[i] = 0; continue }
      const zr = (u * pi[i] + v * qi[i]) / d, zi = (-u * pr[i] - v * qr[i]) / d
      pr[i] = zr; pi[i] = zi
    }
  }
  fft2(pr, pi, W, H, true)
  const z2 = new Float32Array(w2 * h2)
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) z2[y * w2 + x] = pr[y * W + x]
  return w2 === w && h2 === h ? z2 : resizeDepth(z2, w2, h2, w, h)
}

function percentiles(a: Float32Array, pick: (i: number) => boolean, lo: number, hi: number): [number, number] | null {
  const n = a.length, stride = Math.max(1, Math.floor(n / 200_000))
  const s: number[] = []
  for (let i = 0; i < n; i += stride) if (pick(i) && Number.isFinite(a[i])) s.push(a[i])
  if (s.length < 16) return null
  s.sort((x, y) => x - y)
  return [s[Math.floor(s.length * lo)], s[Math.min(s.length - 1, Math.floor(s.length * hi))]]
}

export interface IconReliefOpts {
  /** cât de adânc se sculptează detaliile DeepBump: 0 = deloc, 1 = obișnuit, 2 = tare */
  detail: number
  /** înălțimea fundalului (0..1 din adâncime); 0 = jos de tot */
  background: number
  /** de unde pornește figura (0..1): cât iese sfântul deasupra fundalului înainte de volum */
  figureBase: number
}
export const ICON_RELIEF_DEFAULTS: IconReliefOpts = { detail: 1, background: 0.08, figureBase: 0.35 }

/**
 * Pune împreună: depth = Depth Anything (0..1, alb = aproape), mask = BiRefNet (0..1), height = DeepBump integrat.
 * Fundalul devine plat la `background`; figura = baza + volumul AI (întins doar în figură) + detaliile sculptate.
 * Dacă masca e (aproape) goală — peisaj, logo — toată imaginea e tratată ca figură.
 */
export function composeIconRelief(depth: Float32Array, mask: Float32Array, height: Float32Array, w: number, h: number, opts: IconReliefOpts = ICON_RELIEF_DEFAULTS): Float32Array {
  return finishIconRelief(prepareIconRelief(depth, mask, height, w, h), opts)
}

/** partea care nu depinde de glisoare (estompări, praguri): se face o dată pe icoană */
export interface IconReliefPrep { n: number; m: Float32Array; glob: Float32Array; det: Float32Array }
export function prepareIconRelief(depth: Float32Array, mask: Float32Array, height: Float32Array, w: number, h: number): IconReliefPrep {
  const n = w * h
  const sc = Math.max(w, h) / 1024
  const clean = (a: Float32Array) => a.length === n ? a.map(v => (Number.isFinite(v) ? v : 0)) : new Float32Array(n)
  const D = clean(depth), Mraw = clean(mask), Hraw = clean(height)
  // margine moale a măștii (fără trepte de pixel în lemn)
  const mb = blurGrey(Mraw, w, h, 1.5 * Math.max(1, sc))
  let m = mb.map(v => Math.min(1, Math.max(0, (v - 0.3) / 0.4)))
  let inside = 0
  for (let i = 0; i < n; i++) if (m[i] > 0.5) inside++
  if (inside < n * 0.01) m = new Float32Array(n).fill(1)
  // volumul: Depth Anything întins doar pe figură (fundalul nu mai „fură” din adâncime)
  const pd = percentiles(D, i => m[i] > 0.5, 0.02, 0.98) ?? [0, 1]
  const spanD = pd[1] - pd[0] || 1
  // detaliile: înălțimea DeepBump fără valurile mari (le dă deja volumul), în două benzi
  const ph = percentiles(Hraw, () => true, 0.01, 0.99) ?? [0, 1]
  const spanH = ph[1] - ph[0] || 1
  const Hn = Hraw.map(v => Math.min(1, Math.max(0, (v - ph[0]) / spanH)))
  const b1 = blurGrey(Hn, w, h, 12.5 * sc), b2 = blurGrey(Hn, w, h, 40 * sc)
  const glob = new Float32Array(n), det = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    glob[i] = Math.min(1, Math.max(0, (D[i] - pd[0]) / spanD))
    det[i] = 1.2 * (Hn[i] - b1[i]) + 0.8 * (b1[i] - b2[i])
  }
  return { n, m, glob, det }
}

/** partea rapidă (zeci de ms), refăcută la fiecare mișcare de glisor */
export function finishIconRelief(p: IconReliefPrep, opts: IconReliefOpts = ICON_RELIEF_DEFAULTS): Float32Array {
  const { n, m, glob, det } = p
  const out = new Float32Array(n)
  const base = Math.min(1, Math.max(0, opts.figureBase)), bg = Math.min(1, Math.max(0, opts.background)), k = Math.max(0, opts.detail)
  for (let i = 0; i < n; i++) {
    const fig = base + (1 - base) * glob[i] + k * det[i]
    out[i] = m[i] * fig + (1 - m[i]) * bg
  }
  // partea cea mai înaltă (de obicei fața) nu se taie la 1: dacă detaliile trec peste, se strânge
  // tot ce e deasupra fundalului, ca fața să-și păstreze ochii și nasul; fundalul rămâne exact unde l-ai pus
  const top = percentiles(out, () => true, 0, 0.997)
  const hi = top ? Math.max(1, top[1]) : 1
  const s = hi > 1 && hi > bg ? (1 - bg) / (hi - bg) : 1
  for (let i = 0; i < n; i++) {
    const v = s === 1 ? out[i] : bg + (out[i] - bg) * s
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v
  }
  return out
}
