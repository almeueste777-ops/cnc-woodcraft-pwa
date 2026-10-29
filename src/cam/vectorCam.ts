/**
 * CAM vectorial 2.5D pornind dintr-o mască de formă (1 = în interiorul formei):
 * gravură V-carve, buzunar (pocket), profil cu punți, găurire.
 *
 * Coordonate interne ale mașinii: X spre dreapta, Y în SUS (Y = 0 = marginea de jos a piesei),
 * Z = 0 = fața de sus a lemnului, tăierea merge spre Z negativ. Masca are rândul 0 SUS
 * (convenția imaginilor), deci Y se răstoarnă: y = heightMm - (j + 0.5) * heightMm / h.
 *
 * Totul pornește de la câmpul de distanțe cu semn (SDF, în mm, pozitiv în interior): din el ies
 * izoliniile (decalaje exacte ale conturului), crestele (axa mediană pentru V-carve) și
 * limitele în care scula încape. Algoritmii sunt O(pixeli), pentru Web Worker.
 */
import type { CamJob, CamTool, Toolpath } from './types'
import { MOVE_FEED, MOVE_PLUNGE, MOVE_RAPID } from './types'
import { computeStats, simplifyPolyline, toolProfile } from './engine'

// ───────────────────────── tipuri publice ─────────────────────────

export interface ShapeMask {
  data: Uint8Array // 1 = în formă (lemn de scos la V-carve/buzunar; piesa la profil), 0 = în afară
  w: number
  h: number // pixeli; rândul 0 = marginea de SUS a piesei
  widthMm: number
  heightMm: number // dimensiunea fizică = job.widthMm × job.heightMm
}

export interface SignedDistanceField {
  d: Float32Array // mm, pozitiv în interior, negativ în exterior
  w: number
  h: number
  pxMm: number // mm per pixel pe X
  pyMm: number // mm per pixel pe Y (egal cu pxMm la măști cu pixeli pătrați)
  heightMm: number // h * pyMm, pentru răsturnarea Y
}

export interface Isoline {
  pts: number[] // x,y în mm mașină, plat; la bucle închise primul punct NU se repetă la sfârșit
  closed: boolean
}

export interface VcarveOptions {
  flatDepthMm?: number // limita de adâncime a V-ului; 0/lipsă = fără limită (doar tăișul sculei)
  startDepthMm?: number // adâncimea la care începe gravura (implicit 0)
  wallSpacingMm?: number // distanța dintre izolinii (implicit ~0.4·R) — plase de siguranță + sarcină mică
  floorToleranceMm?: number // zona plată: creasta maximă admisă între treceri (implicit 0.04)
  // fundul plat golit de o freză dreaptă cu această rază (buzunar cu adaos Dcap, deci centrele ei stau
  // unde D ≥ Dcap + R): V-bit-ul curăță din zona plată doar ce discul ei nu poate atinge (colțurile)
  flatClearToolRadiusMm?: number
}

export interface PocketOptions {
  depthMm: number
  ramp?: { enabled: boolean; angleDeg: number }
  finishAllowanceMm?: number // adaos lăsat pe pereți pentru o trecere de finisare
}

export interface ProfileOptions {
  side: 'outside' | 'inside' | 'on'
  depthMm: number
  tabs?: { count: number; widthMm: number; heightMm: number }
  ramp?: { enabled: boolean; angleDeg: number }
}

export interface DrillOptions {
  depthMm: number
  peckMm: number // 0 = fără găurire în trepte
}

// ───────────────────────── câmp de distanțe ─────────────────────────

const EDT_INF = 1e12 // mm², mult peste orice distanță reală

/** Transformarea distanței Euclidiene 1D (Felzenszwalb–Huttenlocher), poziții q·step în mm */
function edtLine(f: Float64Array, n: number, step: number, v: Int32Array, z: Float64Array, out: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  const cross = (q: number, p: number) =>
    ((f[q] + q * step * q * step) - (f[p] + p * step * p * step)) / (2 * step * (q - p))
  for (let q = 1; q < n; q++) {
    let s = cross(q, v[k])
    while (s <= z[k] && k > 0) {
      k--
      s = cross(q, v[k])
    }
    if (s <= z[k]) { // k = 0: parabola nouă domină tot
      v[0] = q
      z[0] = -Infinity
      z[1] = Infinity
    } else {
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = Infinity
    }
  }
  k = 0
  for (let q = 0; q < n; q++) {
    const pos = q * step
    while (z[k + 1] < pos) k++
    const dp = pos - v[k] * step
    out[q] = dp * dp + f[v[k]]
  }
}

/** EDT 2D separabilă, pe loc: coloane (pas sy), apoi rânduri (pas sx); rezultatul în mm² */
function edt2d(buf: Float64Array, W: number, H: number, sx: number, sy: number): void {
  const n = Math.max(W, H)
  const f = new Float64Array(n)
  const out = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = buf[y * W + x]
    edtLine(f, H, sy, v, z, out)
    for (let y = 0; y < H; y++) buf[y * W + x] = out[y]
  }
  for (let y = 0; y < H; y++) {
    const o = y * W
    for (let x = 0; x < W; x++) f[x] = buf[o + x]
    edtLine(f, W, sx, v, z, out)
    for (let x = 0; x < W; x++) buf[o + x] = out[x]
  }
}

/**
 * Distanța euclidiană exactă (FH) la frontiera dintre pixeli, în mm: pozitivă în interior,
 * negativă în exterior. Convenția „jumătate de pixel”: distanța de la centrul unui pixel la
 * centrul celui mai apropiat pixel de cealaltă parte, minus jumătate de pixel, deci nivelul
 * zero trece exact pe marginea dintre un pixel interior și unul exterior. Marginea imaginii
 * se consideră „exterior”. Anizotropia (pxX ≠ pxY) intră exact în transformare; doar scăderea
 * de jumătate de pixel folosește pixelul mai mic (exactă pentru pixeli pătrați, cazul uzual).
 */
export function signedDistanceField(mask: ShapeMask): SignedDistanceField {
  const { w, h, data } = mask
  const pxX = mask.widthMm / w
  const pxY = mask.heightMm / h
  const hp = 0.5 * Math.min(pxX, pxY)
  const W = w + 2
  const H = h + 2
  const buf = new Float64Array(W * H)
  const d = new Float32Array(w * h)

  // distanța din interior la cel mai apropiat pixel exterior (chenarul adăugat = exterior)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) buf[(j + 1) * W + i + 1] = data[j * w + i] ? EDT_INF : 0
  }
  edt2d(buf, W, H, pxX, pxY)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (data[j * w + i]) d[j * w + i] = Math.sqrt(buf[(j + 1) * W + i + 1]) - hp
    }
  }
  // distanța din exterior la cel mai apropiat pixel interior
  buf.fill(EDT_INF)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) buf[(j + 1) * W + i + 1] = data[j * w + i] ? 0 : EDT_INF
  }
  edt2d(buf, W, H, pxX, pxY)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!data[j * w + i]) {
        const q = buf[(j + 1) * W + i + 1]
        d[j * w + i] = q >= EDT_INF * 0.5 ? -1e4 : -(Math.sqrt(q) - hp)
      }
    }
  }
  return { d, w, h, pxMm: pxX, pyMm: pxY, heightMm: h * pxY }
}

/** Valoarea SDF (mm) în punctul (x, y) din coordonate mașină, interpolare biliniară */
export function sampleSdf(s: SignedDistanceField, x: number, y: number): number {
  let fx = x / s.pxMm - 0.5
  let fy = (s.heightMm - y) / s.pyMm - 0.5
  fx = Math.min(s.w - 1, Math.max(0, fx))
  fy = Math.min(s.h - 1, Math.max(0, fy))
  const i = Math.min(s.w - 2, Math.floor(fx))
  const j = Math.min(s.h - 2, Math.floor(fy))
  const tx = fx - i
  const ty = fy - j
  const o = j * s.w + i
  const a = s.d[o] + (s.d[o + 1] - s.d[o]) * tx
  const b = s.d[o + s.w] + (s.d[o + s.w + 1] - s.d[o + s.w]) * tx
  return a + (b - a) * ty
}

// ───────────────────────── izolinii (marching squares) ─────────────────────────

/** Douglas–Peucker 2D pe o polilinie deschisă [x,y,...]; capetele rămân */
function simplify2D(pts: number[], tol: number): number[] {
  const n = pts.length / 2
  if (n <= 2) return pts
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack: number[] = [0, n - 1]
  const tol2 = tol * tol
  while (stack.length) {
    const b = stack.pop()!
    const a = stack.pop()!
    const ax = pts[2 * a], ay = pts[2 * a + 1]
    const dx = pts[2 * b] - ax, dy = pts[2 * b + 1] - ay
    const len2 = dx * dx + dy * dy
    let maxD = -1
    let idx = -1
    for (let k = a + 1; k < b; k++) {
      const px = pts[2 * k] - ax, py = pts[2 * k + 1] - ay
      let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0
      t = Math.max(0, Math.min(1, t))
      const ex = px - t * dx, ey = py - t * dy
      const d2 = ex * ex + ey * ey
      if (d2 > maxD) { maxD = d2; idx = k }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1
      stack.push(a, idx, idx, b)
    }
  }
  const out: number[] = []
  for (let k = 0; k < n; k++) if (keep[k]) out.push(pts[2 * k], pts[2 * k + 1])
  return out
}

/** DP pe o buclă închisă: se taie la cel mai îndepărtat punct de primul, ca ambele jumătăți să aibă capete fixe */
function simplifyClosed(pts: number[], tol: number): number[] {
  const n = pts.length / 2
  if (n <= 4) return pts
  let m = 0
  let best = -1
  for (let k = 1; k < n; k++) {
    const d2 = (pts[2 * k] - pts[0]) ** 2 + (pts[2 * k + 1] - pts[1]) ** 2
    if (d2 > best) { best = d2; m = k }
  }
  const a = simplify2D(pts.slice(0, 2 * m + 2), tol)
  const b = simplify2D(pts.slice(2 * m).concat(pts[0], pts[1]), tol)
  const out = a.slice()
  for (let k = 1; k < b.length / 2 - 1; k++) out.push(b[2 * k], b[2 * k + 1])
  return out
}

/**
 * Izolinia câmpului la nivelul `level` (mm): marching squares cu interpolare LINIARĂ (sub-pixel),
 * lanțuri de segmente, apoi Douglas–Peucker cu toleranța `tolMm`.
 * Orientare: regiunea d > level rămâne în STÂNGA sensului de mers, deci conturul exterior al unei
 * forme e trigonometric (CCW), iar găurile sunt orare (CW). Buclele ating marginea imaginii doar
 * la niveluri negative; atunci ies linii deschise (closed = false).
 */
export function isolines(sdf: SignedDistanceField, level: number, tolMm = 0.015): Isoline[] {
  const { d, w, h, pxMm: px, pyMm: py, heightMm: H } = sdf
  // marginile celulei: 0 sus, 1 dreapta, 2 jos, 3 stânga; colțuri 0 SS, 1 SD, 2 JD, 3 JS
  const EC = [[0, 1], [1, 2], [3, 2], [0, 3]]
  const cx = new Float64Array(4)
  const cy = new Float64Array(4)
  const cv = new Float64Array(4)
  const cb = new Uint8Array(4)
  const eid = new Int32Array(4)
  const segA: number[] = []
  const segB: number[] = []

  const crossAt = (e: number, out: Float64Array) => {
    const a = EC[e][0], b = EC[e][1]
    const t = (level - cv[a]) / (cv[b] - cv[a])
    out[0] = cx[a] + t * (cx[b] - cx[a])
    out[1] = cy[a] + t * (cy[b] - cy[a])
  }
  const pa = new Float64Array(2)
  const pb = new Float64Array(2)
  // true dacă mersul de la muchia ea la eb are zona „sus” (d > level) în stânga
  const orientOk = (ea: number, eb: number) => {
    crossAt(ea, pa)
    crossAt(eb, pb)
    const vx = pb[0] - pa[0], vy = pb[1] - pa[1]
    let score = 0
    for (const c of EC[ea]) {
      score += (vx * (cy[c] - pa[1]) - vy * (cx[c] - pa[0])) * (cb[c] ? 1 : -1)
    }
    return score > 0
  }
  const addSeg = (ea: number, eb: number) => {
    if (orientOk(ea, eb)) { segA.push(eid[ea]); segB.push(eid[eb]) } else { segA.push(eid[eb]); segB.push(eid[ea]) }
  }
  const cornerEdges = [[0, 3], [0, 1], [1, 2], [2, 3]] // muchiile care se întâlnesc în fiecare colț

  for (let j = 0; j < h - 1; j++) {
    const row = j * w
    for (let i = 0; i < w - 1; i++) {
      const v0 = d[row + i], v1 = d[row + i + 1], v2 = d[row + w + i + 1], v3 = d[row + w + i]
      const b0 = v0 > level, b1 = v1 > level, b2 = v2 > level, b3 = v3 > level
      if (b0 === b1 && b1 === b2 && b2 === b3) continue
      const x0 = (i + 0.5) * px
      const y0 = H - (j + 0.5) * py
      cx[0] = x0; cx[1] = x0 + px; cx[2] = x0 + px; cx[3] = x0
      cy[0] = y0; cy[1] = y0; cy[2] = y0 - py; cy[3] = y0 - py
      cv[0] = v0; cv[1] = v1; cv[2] = v2; cv[3] = v3
      cb[0] = b0 ? 1 : 0; cb[1] = b1 ? 1 : 0; cb[2] = b2 ? 1 : 0; cb[3] = b3 ? 1 : 0
      eid[0] = 2 * (row + i)
      eid[1] = 2 * (row + i + 1) + 1
      eid[2] = 2 * (row + w + i)
      eid[3] = 2 * (row + i) + 1
      const cr0 = b0 !== b1, cr1 = b1 !== b2, cr2 = b3 !== b2, cr3 = b0 !== b3
      const nCross = (cr0 ? 1 : 0) + (cr1 ? 1 : 0) + (cr2 ? 1 : 0) + (cr3 ? 1 : 0)
      if (nCross === 2) {
        let e1 = -1, e2 = -1
        if (cr0) { e1 = 0 }
        if (cr1) { if (e1 < 0) e1 = 1; else e2 = 1 }
        if (cr2) { if (e1 < 0) e1 = 2; else e2 = 2 }
        if (cr3) { e2 = 3 }
        addSeg(e1, e2)
      } else {
        // șa: centrul decide ce colțuri se taie
        const centreHigh = (v0 + v1 + v2 + v3) / 4 > level
        for (let c = 0; c < 4; c++) {
          if ((cb[c] === 1) !== centreHigh) addSeg(cornerEdges[c][0], cornerEdges[c][1])
        }
      }
    }
  }

  // lanțuri
  const nSeg = segA.length
  const next = new Map<number, number>()
  for (let k = 0; k < nSeg; k++) next.set(segA[k], k)
  const ends = new Set<number>(segB)
  const visited = new Uint8Array(nSeg)
  const pointOf = (id: number, out: number[]) => {
    const idx = id >> 1
    const j = Math.floor(idx / w)
    const i = idx - j * w
    if (id & 1) {
      const t = (level - d[idx]) / (d[idx + w] - d[idx])
      out.push((i + 0.5) * px, H - (j + 0.5 + t) * py)
    } else {
      const t = (level - d[idx]) / (d[idx + 1] - d[idx])
      out.push((i + 0.5 + t) * px, H - (j + 0.5) * py)
    }
  }
  const result: Isoline[] = []
  const emit = (ids: number[], closed: boolean) => {
    let pts: number[] = []
    for (const id of ids) pointOf(id, pts)
    if (closed) pts = simplifyClosed(pts, tolMm)
    else pts = simplify2D(pts, tolMm)
    if (pts.length / 2 < (closed ? 3 : 2)) return
    result.push({ pts, closed })
  }
  const walk = (k0: number) => {
    const ids: number[] = [segA[k0]]
    let k = k0
    let closed = false
    for (;;) {
      visited[k] = 1
      ids.push(segB[k])
      const nk = next.get(segB[k])
      if (nk === undefined) break
      if (visited[nk]) { closed = nk === k0; break }
      k = nk
    }
    if (closed) ids.pop() // ultimul id = primul
    emit(ids, closed)
  }
  for (let k = 0; k < nSeg; k++) if (!visited[k] && !ends.has(segA[k])) walk(k)
  for (let k = 0; k < nSeg; k++) if (!visited[k]) walk(k)
  return result
}

// ───────────────────────── utilitare comune ─────────────────────────

/** Scrie mișcările [tip, x, y, z] și ține minte poziția sculei */
class Writer {
  m: number[] = []
  x = 0
  y = 0
  z: number
  safe: number
  started = false
  constructor(safe: number) {
    this.safe = safe
    this.z = safe
  }
  rapid(x: number, y: number, z: number) {
    this.m.push(MOVE_RAPID, x, y, z)
    this.x = x; this.y = y; this.z = z
    this.started = true
  }
  feed(x: number, y: number, z: number) {
    this.m.push(MOVE_FEED, x, y, z)
    this.x = x; this.y = y; this.z = z
  }
  plunge(x: number, y: number, z: number) {
    this.m.push(MOVE_PLUNGE, x, y, z)
    this.x = x; this.y = y; this.z = z
  }
  /** Ridică la Z sigur, pe loc */
  up() {
    if (this.started && this.z < this.safe - 1e-9) this.rapid(this.x, this.y, this.safe)
  }
  /** La Z sigur, apoi rapid în XY */
  travel(x: number, y: number) {
    if (!this.started) { this.rapid(x, y, this.safe); return }
    this.up()
    if (Math.abs(x - this.x) > 1e-9 || Math.abs(y - this.y) > 1e-9) this.rapid(x, y, this.safe)
  }
  /** Coboară rapid deasupra lemnului (zTop + 1 mm), apoi cu avans de plonjare până la zTo */
  descend(x: number, y: number, zTop: number, zTo: number) {
    this.travel(x, y)
    const hover = Math.min(this.safe, zTop + 1)
    if (hover < this.safe - 1e-9) this.rapid(x, y, hover)
    if (zTo < this.z - 1e-9) this.plunge(x, y, zTo)
  }
  /** Schimbă doar Z, pe loc: jos = plonjare, sus = avans */
  goZ(z: number) {
    if (z < this.z - 1e-9) this.plunge(this.x, this.y, z)
    else if (z > this.z + 1e-9) this.feed(this.x, this.y, z)
  }
}

function finishPath(name: string, tool: CamTool, job: CamJob, wr: Writer): Toolpath {
  wr.up()
  if (wr.m.length === 0) wr.rapid(0, 0, job.safeZMm)
  const moves = Float64Array.from(wr.m)
  return { name, tool, moves, stats: computeStats(moves, tool, job) }
}

function stepsFor(tool: CamTool, depth: number): number[] {
  const sd = Math.max(0.05, tool.stepDownMm)
  const zs: number[] = []
  for (let z = sd; z < depth - 1e-9; z += sd) zs.push(-z)
  zs.push(-depth)
  return zs
}

function areaOf(pts: number[]): number {
  let a = 0
  const n = pts.length / 2
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n
    a += pts[2 * k] * pts[2 * k2 + 1] - pts[2 * k2] * pts[2 * k + 1]
  }
  return a / 2
}

function reversePts(pts: number[]): number[] {
  const out: number[] = []
  for (let k = pts.length / 2 - 1; k >= 0; k--) out.push(pts[2 * k], pts[2 * k + 1])
  return out
}

/** Cel mai apropiat vârf al unei polilinii; `stride` > 1 doar ca estimare rapidă */
function nearestVertex(pts: number[], x: number, y: number, stride = 1): { idx: number; d2: number } {
  let best = Infinity
  let idx = 0
  const n = pts.length / 2
  for (let k = 0; k < n; k += stride) {
    const d2 = (pts[2 * k] - x) ** 2 + (pts[2 * k + 1] - y) ** 2
    if (d2 < best) { best = d2; idx = k }
  }
  return { idx, d2: best }
}

/** Ordine „cel mai apropiat vecin” între bucle, pornind din (x, y); întoarce permutarea */
function orderNearest(items: Array<{ pts: number[] }>, x: number, y: number): number[] {
  const left = items.map((_, k) => k)
  const order: number[] = []
  let cx = x
  let cy = y
  while (left.length) {
    let bi = 0
    let bd = Infinity
    for (let a = 0; a < left.length; a++) {
      const pts = items[left[a]].pts
      const stride = Math.max(1, Math.floor(pts.length / 2 / 24))
      const nv = nearestVertex(pts, cx, cy, stride)
      if (nv.d2 < bd) { bd = nv.d2; bi = a }
    }
    const pick = left.splice(bi, 1)[0]
    order.push(pick)
    const pts = items[pick].pts
    const nv = nearestVertex(pts, cx, cy)
    cx = pts[2 * nv.idx]
    cy = pts[2 * nv.idx + 1]
  }
  return order
}

/** Linie dreaptă care rămâne cu SDF ≥ minD (verificare la fiecare ~jumătate de pixel) */
function segmentInside(sdf: SignedDistanceField, x0: number, y0: number, x1: number, y1: number, minD: number): boolean {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const n = Math.max(1, Math.ceil(len / (0.5 * Math.min(sdf.pxMm, sdf.pyMm))))
  for (let k = 0; k <= n; k++) {
    const t = k / n
    if (sampleSdf(sdf, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) < minD) return false
  }
  return true
}

/** Componente conexe (4-vecini) ale măștii; întoarce etichetele și numărul lor */
function labelComponents(data: Uint8Array, w: number, h: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(w * h)
  const stack = new Int32Array(w * h)
  let count = 0
  for (let s = 0; s < w * h; s++) {
    if (!data[s] || labels[s]) continue
    count++
    let sp = 0
    stack[sp++] = s
    labels[s] = count
    while (sp > 0) {
      const p = stack[--sp]
      const i = p % w
      const j = (p - i) / w
      if (i > 0 && data[p - 1] && !labels[p - 1]) { labels[p - 1] = count; stack[sp++] = p - 1 }
      if (i < w - 1 && data[p + 1] && !labels[p + 1]) { labels[p + 1] = count; stack[sp++] = p + 1 }
      if (j > 0 && data[p - w] && !labels[p - w]) { labels[p - w] = count; stack[sp++] = p - w }
      if (j < h - 1 && data[p + w] && !labels[p + w]) { labels[p + w] = count; stack[sp++] = p + w }
    }
  }
  return { labels, count }
}

/** Câte zone conexe ale formei sunt prea înguste pentru ca scula de rază `radiusMm` să încapă în ele */
function countNarrow(sdf: SignedDistanceField, mask: ShapeMask, radiusMm: number): number {
  const { labels, count } = labelComponents(mask.data, mask.w, mask.h)
  const maxD = new Float32Array(count + 1)
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p]
    if (l && sdf.d[p] > maxD[l]) maxD[l] = sdf.d[p]
  }
  let narrow = 0
  for (let l = 1; l <= count; l++) if (maxD[l] < radiusMm) narrow++
  return narrow
}

/** Câte zone ale formei sunt prea înguste pentru scula dată (nu încape în ele, deci buzunarul le sare) */
export function narrowZones(mask: ShapeMask, tool: CamTool): number {
  return countNarrow(signedDistanceField(mask), mask, tool.diameterMm / 2)
}

// ───────────────────────── cale parametrizată pe lungime de arc ─────────────────────────

/** Polilinie (închisă sau deschisă) parametrizată după lungimea de arc, cu înfășurare la cele închise */
class Path {
  xs: number[] = []
  ys: number[] = []
  cum: number[] = []
  closed: boolean
  total = 0
  constructor(pts: number[], closed: boolean) {
    this.closed = closed
    const n = pts.length / 2
    for (let k = 0; k < n; k++) {
      this.xs.push(pts[2 * k])
      this.ys.push(pts[2 * k + 1])
      this.cum.push(k === 0 ? 0 : this.cum[k - 1] + Math.hypot(pts[2 * k] - pts[2 * k - 2], pts[2 * k + 1] - pts[2 * k - 1]))
    }
    this.total = n < 2 ? 0 : this.cum[n - 1] + (closed ? Math.hypot(this.xs[0] - this.xs[n - 1], this.ys[0] - this.ys[n - 1]) : 0)
  }
  wrap(s: number): number {
    if (!this.closed) return Math.min(this.total, Math.max(0, s))
    const T = this.total
    return T > 0 ? ((s % T) + T) % T : 0
  }
  at(s: number): [number, number] {
    const n = this.xs.length
    const t = this.wrap(s)
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.cum[mid] <= t) lo = mid; else hi = mid - 1
    }
    const k = lo
    const hasNext = k + 1 < n
    const k2 = hasNext ? k + 1 : this.closed ? 0 : k
    const segLen = hasNext ? this.cum[k + 1] - this.cum[k] : this.total - this.cum[k]
    const f = segLen > 1e-12 ? (t - this.cum[k]) / segLen : 0
    return [this.xs[k] + (this.xs[k2] - this.xs[k]) * f, this.ys[k] + (this.ys[k2] - this.ys[k]) * f]
  }
  /** Vârfurile aflate strict între a și b (a < b), cu arcul desfășurat: [s, x, y] */
  vertexArcs(a: number, b: number): Array<[number, number, number]> {
    const out: Array<[number, number, number]> = []
    const n = this.xs.length
    const T = this.total
    const m0 = this.closed && T > 0 ? Math.floor(a / T) : 0
    const m1 = this.closed && T > 0 ? Math.floor(b / T) : 0
    for (let m = m0; m <= m1; m++) {
      for (let k = 0; k < n; k++) {
        const s = this.cum[k] + m * T
        if (s > a + 1e-9 && s < b - 1e-9) out.push([s, this.xs[k], this.ys[k]])
      }
    }
    return out
  }
}

/** Valorile periodice base_k + m·T aflate strict în (lo, hi) */
function periodic(base: number[], T: number, lo: number, hi: number): number[] {
  const out: number[] = []
  const m0 = Math.floor(lo / T) - 1
  const m1 = Math.floor(hi / T) + 1
  for (let m = m0; m <= m1; m++) {
    for (const b of base) {
      const s = b + m * T
      if (s > lo + 1e-9 && s < hi - 1e-9) out.push(s)
    }
  }
  return out
}

function pathBreaks(P: Path, s0: number, s1: number, extra: number[]): Array<[number, number, number]> {
  const lo = Math.min(s0, s1)
  const hi = Math.max(s0, s1)
  const out = P.vertexArcs(lo, hi)
  if (extra.length) {
    for (const e of extra) {
      const [x, y] = P.at(e)
      out.push([e, x, y])
    }
    out.sort((p, q) => p[0] - q[0])
  }
  if (s1 < s0) out.reverse()
  return out
}

/** Merge pe cale de la s0 la s1 (și înapoi, dacă s1 < s0) cu Z dat de `zf` (constant pe fiecare interval între puncte de rupere) */
function walkFlat(wr: Writer, P: Path, s0: number, s1: number, zf: (sMid: number) => number, extra: number[] = []): void {
  if (Math.abs(s1 - s0) < 1e-9) return
  let prev = s0
  const step = (s: number, x: number, y: number) => {
    const z = zf((prev + s) / 2)
    if (z < wr.z - 1e-9) wr.plunge(wr.x, wr.y, z)
    else if (z > wr.z + 1e-9) wr.feed(wr.x, wr.y, z)
    wr.feed(x, y, z)
    prev = s
  }
  for (const [s, x, y] of pathBreaks(P, s0, s1, extra)) step(s, x, y)
  const [xe, ye] = P.at(s1)
  step(s1, xe, ye)
}

/** Merge pe cale cu Z liniar între (s0, zA) și (s1, zB) — rampa */
function walkLinear(wr: Writer, P: Path, s0: number, s1: number, zA: number, zB: number): void {
  if (Math.abs(s1 - s0) < 1e-9) return
  for (const [s, x, y] of pathBreaks(P, s0, s1, [])) wr.feed(x, y, zA + ((zB - zA) * (s - s0)) / (s1 - s0))
  const [xe, ye] = P.at(s1)
  wr.feed(xe, ye, zB)
}

/**
 * Rampă în zigzag pe fereastra [a, b] a căii (înainte și înapoi) până la zTo, apoi trecere plată
 * peste toată fereastra, ca porțiunea înclinată să fie tăiată la adâncime. Dacă `endAtB`, se termină în b.
 */
function bounceRamp(
  wr: Writer, P: Path, a: number, b: number, zFrom: number, zTo: number, tanA: number,
  zf: (sMid: number) => number, endAtB: boolean, extra: number[]
): void {
  if (b - a < 1e-6) { wr.goZ(zTo); return }
  let s = a
  let dir = 1
  let z = zFrom
  let remaining = zFrom - zTo
  while (remaining > 1e-9) {
    const target = dir > 0 ? b : a
    const drop = Math.abs(target - s) * tanA
    if (drop >= remaining - 1e-12) {
      const sEnd = s + (dir * remaining) / tanA
      walkLinear(wr, P, s, sEnd, z, zTo)
      s = sEnd
      break
    }
    walkLinear(wr, P, s, target, z, z - drop)
    z -= drop
    remaining -= drop
    s = target
    dir = -dir
  }
  if (dir > 0) {
    walkFlat(wr, P, s, b, zf, extra)
    walkFlat(wr, P, b, a, zf, extra)
    if (endAtB) walkFlat(wr, P, a, b, zf, extra)
  } else {
    walkFlat(wr, P, s, a, zf, extra)
    walkFlat(wr, P, a, b, zf, extra)
  }
}

// ───────────────────────── V-carve ─────────────────────────

/** Cea mai mare distanță D ≤ R la care adâncimea sculei nu depășește `flat` (0 = fără limită) */
export function depthCapRadius(tool: CamTool, flat: number): number {
  const R = tool.diameterMm / 2
  if (!(flat > 0) || toolProfile(tool, R) <= flat) return R
  let lo = 0
  let hi = R
  for (let it = 0; it < 50; it++) {
    const mid = (lo + hi) / 2
    if (toolProfile(tool, mid) <= flat) lo = mid; else hi = mid
  }
  return lo
}

export interface Ridge {
  pts: number[] // [x, y, D, ...] D = distanța până la frontieră în punctul crestei
}

/**
 * Creasta (axa mediană) a SDF-ului ca lanțuri de puncte cu sub-pixel: maxime locale ale lui d
 * pe direcția cea mai curbată (diferența a doua cu pas 2 px peste prag), subțiate Zhang–Suen,
 * urmărite ca lanțuri și rafinate: poziția exactă a muchiei din cele trei valori ale lui d.
 */
export function ridgeChains(sdf: SignedDistanceField, dMin: number): Ridge[] {
  const { d, w, h, pxMm: px, pyMm: py, heightMm: H } = sdf
  const cand = new Uint8Array(w * h)
  const bd = new Uint8Array(w * h)
  const DX = [1, 0, 1, 1]
  const DY = [0, 1, 1, -1]
  const OFF = DX.map((dx, k) => DY[k] * w + dx)
  const STEP = DX.map((dx, k) => Math.hypot(dx, DY[k]))
  // peste o creastă de unghi θ diferența a doua e ~4·px·cos(θ/2): pragul 1.1·px prinde colțurile până la
  // ~150° (cu 2.4·px rămâneau neprinse cele peste 106°: hexagon, octogon). O creastă în plus e sigură:
  // adâncimea ei vine din D, deci conul nu trece de margine
  const T2 = 1.1 * px
  let list: number[] = []
  for (let j = 2; j < h - 2; j++) {
    for (let i = 2; i < w - 2; i++) {
      const idx = j * w + i
      const d0 = d[idx]
      if (d0 < dMin) continue
      let best = -1
      let bestC = T2
      for (let k = 0; k < 4; k++) {
        const o2 = 2 * OFF[k]
        const c2 = 2 * d0 - d[idx + o2] - d[idx - o2]
        if (c2 > bestC) { bestC = c2; best = k }
      }
      if (best < 0) continue
      const o = OFF[best]
      if (d0 > d[idx - o] && d0 >= d[idx + o]) {
        cand[idx] = 1
        bd[idx] = best
        list.push(idx)
      }
    }
  }
  // subțiere Guo–Hall pe mulțimea candidaților (Zhang–Suen șterge liniile diagonale late de 2 pixeli,
  // iar crestele de 45° ies exact așa pe grila pătrată)
  const N = [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1] // p2..p9 = N, NE, E, SE, S, SV, V, NV
  const nb = new Uint8Array(8)
  let changed = true
  while (changed) {
    changed = false
    for (let pass = 0; pass < 2; pass++) {
      const del: number[] = []
      for (const idx of list) {
        if (!cand[idx]) continue
        for (let q = 0; q < 8; q++) nb[q] = cand[idx + N[q]]
        const p2 = nb[0], p3 = nb[1], p4 = nb[2], p5 = nb[3], p6 = nb[4], p7 = nb[5], p8 = nb[6], p9 = nb[7]
        const C = (p2 ? 0 : p3 | p4) + (p4 ? 0 : p5 | p6) + (p6 ? 0 : p7 | p8) + (p8 ? 0 : p9 | p2)
        if (C !== 1) continue
        const n1 = (p9 | p2) + (p3 | p4) + (p5 | p6) + (p7 | p8)
        const n2 = (p2 | p3) + (p4 | p5) + (p6 | p7) + (p8 | p9)
        const nmin = Math.min(n1, n2)
        if (nmin < 2 || nmin > 3) continue
        if (pass === 0) {
          if (((p2 | p3 | (p5 ? 0 : 1)) & p4) !== 0) continue
        } else if (((p6 | p7 | (p9 ? 0 : 1)) & p8) !== 0) continue
        del.push(idx)
      }
      if (del.length) {
        changed = true
        for (const idx of del) cand[idx] = 0
      }
    }
    list = list.filter(idx => cand[idx])
  }

  // poziție și înălțime rafinate pentru un pixel de creastă
  const refine = (idx: number): [number, number, number] => {
    const k = bd[idx]
    const o = OFF[k]
    const d0 = d[idx]
    const dp = d[idx + o]
    const dm = d[idx - o]
    const c1 = 2 * d0 - dp - dm
    let x0 = 0
    let M = d0
    if (c1 > 1e-9) {
      const r = (dp - dm) / c1
      const ax = Math.min(0.5, Math.abs(r) / (1 + Math.abs(r)))
      x0 = r < 0 ? -ax : ax
      M = d0 + Math.min(0.5 * STEP[k] * px, (c1 * ax) / (2 * (1 - ax)))
    }
    const j = Math.floor(idx / w)
    const i = idx - j * w
    return [(i + 0.5 + x0 * DX[k]) * px, H - (j + 0.5 + x0 * DY[k]) * py, M]
  }

  // urmărire lanțuri (8-vecini)
  const chains: Ridge[] = []
  const visited = new Uint8Array(w * h)
  const nbrs = (idx: number, onlyFree: boolean): number[] => {
    const out: number[] = []
    for (let q = 0; q < 8; q++) {
      const t = idx + N[q]
      if (cand[t] && (!onlyFree || !visited[t])) out.push(t)
    }
    return out
  }
  const trace = (startPix: number, from: number) => {
    const chain: number[] = []
    if (from >= 0) chain.push(from)
    let cur = startPix
    for (;;) {
      visited[cur] = 1
      chain.push(cur)
      const free = nbrs(cur, true)
      if (free.length === 0) break
      // preferă vecinul pe 4 direcții
      let pick = free[0]
      for (const t of free) if (Math.abs(t - cur) === 1 || Math.abs(t - cur) === w) { pick = t; break }
      cur = pick
    }
    const pts: number[] = []
    for (const p of chain) pts.push(...refine(p))
    chains.push({ pts })
  }
  for (const idx of list) if (!visited[idx] && nbrs(idx, false).length <= 1) trace(idx, -1)
  for (const idx of list) {
    if (visited[idx]) continue
    const vis = nbrs(idx, false).find(t => visited[t])
    trace(idx, vis === undefined ? -1 : vis)
  }
  return chains
}

/**
 * V-carve adevărat. La poziția centrului p cu distanța interioară D(p), vârful sculei coboară la
 * z = -startDepth - toolProfile(D(p)) (la V-bit: D / tan(semi-unghi)): conul atinge frontiera, nu o
 * depășește niciodată. Rezultatul ideal în x este −toolProfile(D(x)), iar la un V-bit îl taie exact
 * conul cu vârful pe axa mediană (creasta) în punctul unde normala din x ajunge la creastă.
 *
 * Trasee (în ordinea executării):
 *  1. izolinii la d₀ = ~0.75 px, apoi din `wallSpacing` în `wallSpacing`, de la exterior spre interior,
 *     fiecare la adâncimea ei: marginea curată și plasă de siguranță; chiar dacă creasta lipsește
 *     undeva, restul rămâne tăiat la ≤ spațiere;
 *  2. creasta (axa mediană) 3D, Z variabil din D: taie EXACT vârfurile, colțurile și zonele înguste;
 *  3. zona plată (D ≥ Dcap, unde adâncimea e limitată de `flatDepthMm` sau de tăișul sculei): treceri
 *     paralele pe X, în straturi de `stepDownMm`, cu distanța 2·tol·tan(semi-unghi) între ele, ca
 *     fundul (zimțat de conul sculei) să fie curățat până la crestele de înălțime ≤ tol.
 * Trecerea e într-o singură adâncime (fără trepte) în zonele de V; doar zona plată se face pe straturi.
 * Limită de precizie: masca e binară, deci frontiera se cunoaște doar cu ± ~0.5 pixel; adâncimile la
 * creste au aceeași incertitudine, împărțită la tan(semi-unghi).
 */
export function vcarveToolpath(mask: ShapeMask, tool: CamTool, job: CamJob, opts: VcarveOptions = {}): Toolpath {
  const wr = new Writer(job.safeZMm)
  const R = tool.diameterMm / 2
  if (tool.shape === 'endmill' || !(toolProfile(tool, R * 0.5) > 1e-9)) {
    return finishPath(`V-carve ${tool.name}: scula nu are profil conic`, tool, job, wr)
  }
  const sdf = signedDistanceField(mask)
  const px = sdf.pxMm
  const start = Math.max(0, opts.startDepthMm ?? 0)
  const flat = opts.flatDepthMm && opts.flatDepthMm > 0 ? opts.flatDepthMm : 0
  const Dcap = depthCapRadius(tool, flat)
  const depthOf = (D: number) => toolProfile(tool, Math.min(Math.max(D, 0), Dcap))
  const zOf = (D: number) => -start - depthOf(D)
  let maxD = 0
  for (let p = 0; p < sdf.d.length; p++) if (sdf.d[p] > maxD) maxD = sdf.d[p]
  const capped = maxD > Dcap + 0.25 * px
  const hover = Math.min(job.safeZMm, 1)
  let warn = ''

  // 0.5 mm: pe bisectoarele colțurilor foarte deschise (octogon, 135°) creasta poate lipsi, iar ce
  // rămâne între izolinii crește cu distanța dintre ele (1 mm lăsa 0.13 mm de lemn)
  const sw = Math.max(1e-3, opts.wallSpacingMm ?? Math.min(0.5, Math.max(6 * px, 0.4 * R)))
  const levels: number[] = [Math.max(0.75 * px, 0.01)]
  const topLevel = Math.min(Dcap, maxD)
  for (let L = sw; L < topLevel - 0.3 * px; L += sw) levels.push(L)
  if (capped && Dcap - levels[levels.length - 1] > 0.3 * px) levels.push(Dcap)

  /** Link scurt care taie la adâncimea ideală a fiecărui punct; false dacă nu e sigur */
  const tryLink = (x1: number, y1: number, maxLen: number): boolean => {
    if (!wr.started) return false
    const len = Math.hypot(x1 - wr.x, y1 - wr.y)
    if (len > maxLen || wr.z >= hover) return false
    const n = Math.max(1, Math.ceil(len / (0.5 * px)))
    const zs: number[] = []
    for (let k = 1; k <= n; k++) {
      const t = k / n
      const D = sampleSdf(sdf, wr.x + (x1 - wr.x) * t, wr.y + (y1 - wr.y) * t)
      if (D < 0.4 * px) return false
      zs.push(zOf(D))
    }
    const x0 = wr.x
    const y0 = wr.y
    for (let k = 1; k <= n; k++) wr.feed(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, zs[k - 1])
    return true
  }
  const linkMax = 2.5 * sw + 4 * px

  // 1. izolinii, de la exterior spre interior
  for (const L of levels) {
    const loops = isolines(sdf, L, 0.01)
    if (!loops.length) continue
    const z = zOf(L)
    const order = orderNearest(loops.map(l => ({ pts: l.pts })), wr.x, wr.y)
    for (const li of order) {
      const lp = loops[li]
      const n = lp.pts.length / 2
      const nv = nearestVertex(lp.pts, wr.started ? wr.x : lp.pts[0], wr.started ? wr.y : lp.pts[1])
      const i0 = lp.closed ? nv.idx : (nv.idx * 2 > n ? n - 1 : 0)
      const x0 = lp.pts[2 * i0], y0 = lp.pts[2 * i0 + 1]
      if (!tryLink(x0, y0, linkMax)) wr.descend(x0, y0, 0, z)
      wr.goZ(z)
      const dir = lp.closed || i0 === 0 ? 1 : -1
      const count = lp.closed ? n : n - 1
      for (let k = 1; k <= count; k++) {
        const v = ((i0 + dir * k) % n + n) % n
        wr.feed(lp.pts[2 * v], lp.pts[2 * v + 1], z)
      }
    }
  }

  // 2. creasta (axa mediană), Z variabil
  const dMin = Math.max(0.5 * px, 0.005)
  const ridgePieces: number[][] = []
  for (const rc of ridgeChains(sdf, dMin)) {
    // peste Dcap adâncimea rămâne la cea limită (depthOf strânge D): creasta urmărește fundul plat
    const n = rc.pts.length / 3
    if (n === 0) continue
    const xyz: number[] = []
    for (let k = 0; k < n; k++) xyz.push(rc.pts[3 * k], rc.pts[3 * k + 1], depthOf(rc.pts[3 * k + 2]))
    ridgePieces.push(simplifyPolyline(xyz, 0.004))
  }
  const rleft = ridgePieces.map((_, k) => k)
  while (rleft.length) {
    let bi = 0
    let bd = Infinity
    let bRev = false
    for (let a = 0; a < rleft.length; a++) {
      const pc = ridgePieces[rleft[a]]
      const n = pc.length / 3
      const dS = (pc[0] - wr.x) ** 2 + (pc[1] - wr.y) ** 2
      const dE = (pc[3 * n - 3] - wr.x) ** 2 + (pc[3 * n - 2] - wr.y) ** 2
      if (dS < bd) { bd = dS; bi = a; bRev = false }
      if (dE < bd) { bd = dE; bi = a; bRev = true }
    }
    const pc = ridgePieces[rleft.splice(bi, 1)[0]]
    const n = pc.length / 3
    const idxs = Array.from({ length: n }, (_, k) => (bRev ? n - 1 - k : k))
    const x0 = pc[3 * idxs[0]], y0 = pc[3 * idxs[0] + 1], z0 = -start - pc[3 * idxs[0] + 2]
    if (!tryLink(x0, y0, linkMax)) wr.descend(x0, y0, 0, z0)
    wr.goZ(z0)
    for (let k = 1; k < n; k++) wr.feed(pc[3 * idxs[k]], pc[3 * idxs[k] + 1], -start - pc[3 * idxs[k] + 2])
  }

  // 3. zona plată
  if (capped) {
    const capDepth = depthOf(Dcap)
    const tanHalf = Math.max(1e-3, Dcap / Math.max(capDepth, 1e-9))
    const tol = Math.max(0.005, opts.floorToleranceMm ?? 0.04)
    let fine = 2 * tol * tanHalf
    const bandMin = Dcap + 0.25 * px
    // ce a golit deja freza dreaptă: punctele la cel mult R de mulțimea centrelor ei (D ≥ Dcap + R),
    // aflate exact cu încă o hartă de distanțe. De-a lungul pereților drepți discul ajunge fix la Dcap
    // (acolo izolinia V-bit-ului de la Dcap face racordul), deci rămân pentru V-bit doar colțurile
    let cleared: Uint8Array | null = null
    const Rc = opts.flatClearToolRadiusMm ?? 0
    if (Rc > 0) {
      const centers = new Uint8Array(sdf.w * sdf.h)
      for (let p = 0; p < centers.length; p++) centers[p] = sdf.d[p] >= Dcap + Rc ? 1 : 0
      const toCenters = signedDistanceField({ data: centers, w: sdf.w, h: sdf.h, widthMm: sdf.w * sdf.pxMm, heightMm: sdf.heightMm })
      cleared = new Uint8Array(centers.length)
      const reach = Rc - 0.25 * px
      for (let p = 0; p < centers.length; p++) cleared[p] = toCenters.d[p] >= -reach ? 1 : 0
    }
    // limitele zonei plate
    let ymin = Infinity, ymax = -Infinity
    for (let j = 0; j < sdf.h; j++) {
      for (let i = 0; i < sdf.w; i++) {
        const dv = sdf.d[j * sdf.w + i]
        if (dv >= bandMin && !(cleared && cleared[j * sdf.w + i])) {
          const y = sdf.heightMm - (j + 0.5) * sdf.pyMm
          if (y < ymin) ymin = y
          if (y > ymax) ymax = y
        }
      }
    }
    if (ymax >= ymin) {
      const maxRows = 40000
      if ((ymax - ymin) / fine > maxRows) {
        fine = (ymax - ymin) / maxRows
        warn += ', zona plată cu pas mărit'
      }
      const sd = Math.max(0.05, tool.stepDownMm)
      const layers: number[] = []
      for (let dz = sd; dz < capDepth - 1e-9; dz += sd) layers.push(dz)
      layers.push(capDepth)
      let flip = false
      for (let li = 0; li < layers.length; li++) {
        const last = li === layers.length - 1
        const spacing = last ? fine : Math.min(fine * 4, Math.max(fine, Dcap))
        const z = -start - layers[li]
        const nRows = Math.max(1, Math.ceil((ymax - ymin) / spacing))
        for (let r = 0; r < nRows; r++) {
          const y = ymin + ((r + 0.5) * (ymax - ymin)) / nRows
          // intervalele în care d ≥ bandMin pe rândul y
          const fy = (sdf.heightMm - y) / sdf.pyMm - 0.5
          const j0 = Math.max(0, Math.min(sdf.h - 2, Math.floor(fy)))
          const ty = Math.min(1, Math.max(0, fy - j0))
          const ivs: Array<[number, number]> = []
          let inRun = false
          let xa = 0
          let prevV = 0
          for (let i = 0; i < sdf.w; i++) {
            const v = sdf.d[j0 * sdf.w + i] * (1 - ty) + sdf.d[(j0 + 1) * sdf.w + i] * ty
            const x = (i + 0.5) * px
            // pixelul cel mai apropiat pentru zona golită (rândul cu ponderea mai mare)
            const done = cleared ? cleared[(ty < 0.5 ? j0 : j0 + 1) * sdf.w + i] === 1 : false
            const inside = v >= bandMin && !done
            if (inside && !inRun) {
              inRun = true
              // marginea dinspre perete se interpolează exact; cea dinspre zona golită e acoperită de suprapunere
              xa = i > 0 && prevV < bandMin ? x - px + (px * (bandMin - prevV)) / (v - prevV) : x
            } else if (!inside && inRun) {
              inRun = false
              const xb = v < bandMin ? x - px + (px * (prevV - bandMin)) / (prevV - v) : x
              if (xb > xa) ivs.push([xa, xb])
            }
            prevV = v
          }
          if (inRun) ivs.push([xa, (sdf.w - 0.5) * px])
          if (!ivs.length) continue
          if (flip) ivs.reverse()
          for (const iv of ivs) {
            const xs = flip ? iv[1] : iv[0]
            const xe = flip ? iv[0] : iv[1]
            let ok = false
            if (wr.started && Math.abs(wr.z - z) < 1e-9 && Math.abs(wr.x - xs) < 2 * spacing + 1e-6 && Math.abs(wr.y - y) < 2 * spacing + 1e-6) {
              ok = segmentInside(sdf, wr.x, wr.y, xs, y, bandMin - 0.3 * px)
              if (ok) wr.feed(xs, y, z)
            }
            if (!ok) wr.descend(xs, y, 0, z)
            wr.feed(xe, y, z)
          }
          flip = !flip
        }
      }
    }
  }

  let name = `V-carve ${tool.name}`
  if (capped) name += flat > 0 ? ` (adâncime limitată la ${flat} mm)` : ' (adâncime limitată de tăișul sculei)'
  name += warn
  return finishPath(name, tool, job, wr)
}

// ───────────────────────── buzunar ─────────────────────────

/**
 * Buzunar cu freză dreaptă: contururi decalate la nivelurile R(+adaos), R+s, R+2s... ale distanței
 * interioare (s = diametru·pas lateral), de la interior spre exterior, pe straturi de `stepDownMm`;
 * ultimul strat exact la −depthMm. Insulele sunt zone 0 din mască, deci distanța lor le ocolește.
 * Centrul sculei rămâne mereu la distanță ≥ R de frontieră: nu taie în perete.
 * Zonele mai înguste decât scula sunt sărite; numărul lor apare în nume (și în `narrowZones`).
 * Intrare: plonjare la începutul fiecărei bucle sau, cu rampă, înclinat pe însăși bucla (la bucla mai
 * scurtă decât lungimea rampei se face mai multe ture, apoi o tură plată pentru porțiunea înclinată).
 */
export function pocketToolpath(mask: ShapeMask, tool: CamTool, job: CamJob, opts: PocketOptions): Toolpath {
  const wr = new Writer(job.safeZMm)
  const sdf = signedDistanceField(mask)
  const px = sdf.pxMm
  const R = tool.diameterMm / 2
  const allow = Math.max(0, opts.finishAllowanceMm ?? 0)
  const step = Math.max(0.05, Math.min(tool.diameterMm * 0.95, (tool.diameterMm * tool.stepoverPercent) / 100))
  const L0 = R + allow
  let maxD = 0
  for (let p = 0; p < sdf.d.length; p++) if (sdf.d[p] > maxD) maxD = sdf.d[p]
  const narrow = countNarrow(sdf, mask, L0)
  const loops: Array<{ P: Path; pts: number[] }> = []
  if (maxD > L0) {
    const lv: number[] = []
    for (let L = L0; L < maxD - 1e-4; L += step) lv.push(L)
    // de la nivelul cel mai adânc spre perete: interior întâi
    for (let a = lv.length - 1; a >= 0; a--) {
      const found = isolines(sdf, lv[a], 0.01).filter(l => l.closed || l.pts.length >= 4)
      const order = orderNearest(found.map(l => ({ pts: l.pts })), wr.x, wr.y)
      for (const k of order) loops.push({ P: new Path(found[k].pts, found[k].closed), pts: found[k].pts })
    }
  }
  const zs = stepsFor(tool, opts.depthMm)
  const useRamp = !!opts.ramp?.enabled && opts.ramp.angleDeg > 0.1
  const tanA = useRamp ? Math.tan((opts.ramp!.angleDeg * Math.PI) / 180) : 0
  const linkMax = 3 * step + 2 * px

  for (let li = 0; li < zs.length; li++) {
    const zTo = zs[li]
    const zFrom = li === 0 ? 0 : zs[li - 1]
    const seq = li % 2 === 0 ? loops : loops.slice().reverse()
    for (const { P, pts } of seq) {
      if (P.total <= 0) continue
      const nv = nearestVertex(pts, wr.started ? wr.x : pts[0], wr.started ? wr.y : pts[1])
      const s0 = P.closed ? P.cum[nv.idx] : 0
      const [x0, y0] = P.at(s0)
      const T = P.total
      const zfl = () => zTo
      if (
        wr.started && Math.abs(wr.z - zTo) < 1e-9 && Math.hypot(x0 - wr.x, y0 - wr.y) <= linkMax &&
        segmentInside(sdf, wr.x, wr.y, x0, y0, L0 - 0.5 * px)
      ) {
        wr.feed(x0, y0, zTo)
        walkFlat(wr, P, s0, P.closed ? s0 + T : T, zfl)
        continue
      }
      wr.descend(x0, y0, zFrom, useRamp ? zFrom : zTo)
      if (!useRamp) {
        walkFlat(wr, P, s0, P.closed ? s0 + T : T, zfl)
      } else {
        const L = (zFrom - zTo) / tanA
        if (P.closed) {
          walkLinear(wr, P, s0, s0 + L, zFrom, zTo)
          walkFlat(wr, P, s0 + L, s0 + L + T, zfl)
        } else {
          bounceRamp(wr, P, 0, T, zFrom, zTo, tanA, zfl, false, [])
        }
      }
    }
  }
  let name = `Buzunar ${tool.name}`
  if (maxD <= L0) name += ' (scula nu încape nicăieri)'
  else if (narrow > 0) name += ` (${narrow} zone prea înguste sărite)`
  return finishPath(name, tool, job, wr)
}

// ───────────────────────── profil ─────────────────────────

/**
 * Profil pe conturul formei: decalat cu +R în afară, −R în interior sau pe linie. În trepte de
 * `stepDownMm` până la −depthMm; găurile (insulele) se taie înaintea conturului exterior.
 *
 * Sens: frezare convențională ca la cutout.ts (arbore M3 în sens orar). La profilul exterior freza
 * merge ORAR în jurul piesei (piesa rămâne în dreapta ei), la cel interior ANTIORAR (piesa, adică
 * lemnul din afara formei, tot în dreapta). „Pe linie” folosește sensul profilului interior.
 *
 * Punți: pe ultimele treceri (cele mai adânci decât vârful punții), pe bucle închise suficient de
 * lungi, repartizate egal; freza urcă vertical la înălțimea punții pe lungimea widthMm + 2R și coboară
 * vertical după ea (ca la cutout.ts). Coborârea de după punte e în canalul trecerii anterioare (cel
 * mult o treaptă de lemn plin); rampa nu se aplică acolo.
 * Rampă: la fiecare trecere, coborârea de la adâncimea trecerii anterioare se face înclinat pe
 * însăși bucla (la buclele cu punți, în porțiunea dintre două punți; dacă nu încape, în zigzag).
 */
export function profileToolpath(mask: ShapeMask, tool: CamTool, job: CamJob, opts: ProfileOptions): Toolpath {
  const wr = new Writer(job.safeZMm)
  const sdf = signedDistanceField(mask)
  const R = tool.diameterMm / 2
  const level = opts.side === 'outside' ? -R : opts.side === 'inside' ? R : 0
  const found = isolines(sdf, level, 0.005)
  const items = found.map(l => {
    const area = l.closed ? areaOf(l.pts) : 0
    return { pts: opts.side === 'outside' ? reversePts(l.pts) : l.pts, closed: l.closed, hole: area < 0 }
  })
  // găurile (insulele piesei) primele, apoi conturul exterior
  const holes = items.filter(i => i.hole)
  const outers = items.filter(i => !i.hole)
  const ordered: typeof items = []
  for (const grp of [holes, outers]) {
    const ord = orderNearest(grp, wr.started ? wr.x : 0, wr.started ? wr.y : 0)
    for (const k of ord) ordered.push(grp[k])
  }

  const zs = stepsFor(tool, opts.depthMm)
  const useRamp = !!opts.ramp?.enabled && opts.ramp.angleDeg > 0.1
  const tanA = useRamp ? Math.tan((opts.ramp!.angleDeg * Math.PI) / 180) : 0
  const tabCount = Math.max(0, Math.round(opts.tabs?.count ?? 0))
  const tabHeight = Math.max(0, opts.tabs?.heightMm ?? 0)
  const tabTop = -(opts.depthMm - tabHeight)
  const tabHalf = (opts.tabs?.widthMm ?? 0) / 2 + R
  let tabsMade = 0

  for (const it of ordered) {
    const P = new Path(it.pts, it.closed)
    const T = P.total
    if (T <= 0) continue
    // începutul buclei: cel mai apropiat vârf de poziția curentă
    const nv = nearestVertex(it.pts, wr.started ? wr.x : it.pts[0], wr.started ? wr.y : it.pts[1])
    const sBase = it.closed ? P.cum[nv.idx] : 0
    // punțile se măsoară de la începutul buclei
    const tabCenters: number[] = []
    let tabInts: Array<[number, number]> = []
    let winA = 0
    let winG = 0
    const tabsOk = it.closed && tabCount > 0 && tabHeight > 0 && tabTop < 0 && T / tabCount - 2 * tabHalf >= 2
    if (tabsOk) {
      for (let k = 0; k < tabCount; k++) tabCenters.push(sBase + ((k + 0.5) * T) / tabCount)
      tabInts = tabCenters.map(c => [c - tabHalf, c + tabHalf] as [number, number])
      const gap = T / tabCount - 2 * tabHalf
      const margin = Math.min(0.5, gap / 4)
      winA = tabCenters[0] + tabHalf + margin
      winG = gap - 2 * margin
      tabsMade += tabCount
    }
    const inTab = (s: number) => {
      const sw = P.wrap(s - sBase) + sBase
      for (const [a, b] of tabInts) {
        for (let m = -1; m <= 1; m++) if (sw + m * T > a && sw + m * T < b) return true
      }
      return false
    }
    const tabEdges: number[] = []
    for (const [a, b] of tabInts) tabEdges.push(a, b)
    const edgesIn = (lo: number, hi: number) => (tabsOk ? periodic(tabEdges, T, Math.min(lo, hi), Math.max(lo, hi)) : [])

    let zPrev = 0
    let zfPrev: (s: number) => number = () => 0
    let sCur = sBase
    let positioned = false
    for (const z of zs) {
      const tabsOn = tabsOk && z < tabTop - 1e-9
      const zf: (s: number) => number = tabsOn ? (s => (inTab(s) ? tabTop : z)) : () => z
      const xtra = (lo: number, hi: number) => (tabsOn ? edgesIn(lo, hi) : [])
      if (!it.closed) {
        // linie deschisă: la fiecare trecere se pornește din nou de la un capăt
        const [x0, y0] = P.at(0)
        wr.descend(x0, y0, zPrev, useRamp ? zPrev : z)
        if (useRamp) bounceRamp(wr, P, 0, T, zPrev, z, tanA, zf, false, [])
        else walkFlat(wr, P, 0, T, zf)
        zPrev = z
        continue
      }
      let sS = sCur
      if (tabsOn) sS = winA
      if (!positioned) {
        const [x0, y0] = P.at(sS)
        wr.descend(x0, y0, 0, 0)
        positioned = true
      } else if (tabsOn) {
        let dlt = P.wrap(winA - sCur)
        if (dlt > T / 2) dlt -= T
        walkFlat(wr, P, sCur, sCur + dlt, zfPrev, edgesIn(sCur, sCur + dlt))
      }
      if (!useRamp) {
        wr.goZ(z)
        walkFlat(wr, P, sS, sS + T, zf, xtra(sS, sS + T))
        sCur = sS
      } else {
        const L = (zPrev - z) / tanA
        if (!tabsOn) {
          walkLinear(wr, P, sS, sS + L, zPrev, z)
          walkFlat(wr, P, sS + L, sS + L + T, zf)
          sCur = sS + L
        } else if (L <= winG) {
          walkLinear(wr, P, sS, sS + L, zPrev, z)
          walkFlat(wr, P, sS + L, sS + T + L, zf, xtra(sS + L, sS + T + L))
          sCur = sS + L
        } else {
          bounceRamp(wr, P, sS, sS + winG, zPrev, z, tanA, zf, true, [])
          walkFlat(wr, P, sS + winG, sS + T, zf, xtra(sS + winG, sS + T))
          sCur = sS
        }
      }
      zPrev = z
      zfPrev = zf
    }
  }
  const sideTxt = opts.side === 'outside' ? 'exterior' : opts.side === 'inside' ? 'interior' : 'pe linie'
  return finishPath(`Profil ${sideTxt} ${tool.name} (${tabsMade} punți)`, tool, job, wr)
}

// ───────────────────────── găurire ─────────────────────────

/**
 * Găurire: G0 deasupra fiecărei găuri, plonjare în trepte de `peckMm` cu retragere completă la 1 mm
 * deasupra suprafeței între trepte (plonjare în jos, rapid în sus; fără cicluri fixe), în ordinea
 * celui mai apropiat vecin.
 */
export function drillToolpath(points: Array<{ x: number; y: number }>, tool: CamTool, job: CamJob, opts: DrillOptions): Toolpath {
  const wr = new Writer(job.safeZMm)
  const depth = Math.max(0.01, opts.depthMm)
  const hover = Math.min(job.safeZMm, 1)
  const left = points.slice()
  let cx = 0
  let cy = 0
  while (left.length) {
    let bi = 0
    let bd = Infinity
    for (let a = 0; a < left.length; a++) {
      const dd = (left[a].x - cx) ** 2 + (left[a].y - cy) ** 2
      if (dd < bd) { bd = dd; bi = a }
    }
    const p = left.splice(bi, 1)[0]
    cx = p.x
    cy = p.y
    wr.travel(p.x, p.y)
    if (hover < wr.z) wr.rapid(p.x, p.y, hover)
    if (opts.peckMm > 0 && opts.peckMm < depth) {
      let z = 0
      while (z > -depth + 1e-9) {
        z = Math.max(-depth, z - opts.peckMm)
        wr.plunge(p.x, p.y, z)
        if (z > -depth + 1e-9) wr.rapid(p.x, p.y, hover)
      }
    } else {
      wr.plunge(p.x, p.y, -depth)
    }
    wr.rapid(p.x, p.y, job.safeZMm)
  }
  return finishPath(`Găurire ${tool.name} (${points.length} găuri)`, tool, job, wr)
}

/**
 * Centrele formelor mici și închise (componente conexe cu diametrul echivalent ≤ maxDiameterMm),
 * în coordonate mașină, pentru găurire.
 */
export function maskFromHoles(mask: ShapeMask, maxDiameterMm: number): Array<{ x: number; y: number; diameterMm: number }> {
  const { w, h } = mask
  const pxX = mask.widthMm / w
  const pxY = mask.heightMm / h
  const { labels, count } = labelComponents(mask.data, w, h)
  const area = new Float64Array(count + 1)
  const sx = new Float64Array(count + 1)
  const sy = new Float64Array(count + 1)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const l = labels[j * w + i]
      if (!l) continue
      area[l]++
      sx[l] += i + 0.5
      sy[l] += j + 0.5
    }
  }
  const out: Array<{ x: number; y: number; diameterMm: number }> = []
  for (let l = 1; l <= count; l++) {
    const dia = 2 * Math.sqrt((area[l] * pxX * pxY) / Math.PI)
    if (dia <= maxDiameterMm) {
      out.push({ x: (sx[l] / area[l]) * pxX, y: mask.heightMm - (sy[l] / area[l]) * pxY, diameterMm: dia })
    }
  }
  return out
}
