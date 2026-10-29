/**
 * Verificare CAM vectorial:  npx tsx tests/vcarve-check.ts
 * Măști construite din forme analitice (dreptunghi, inel, L, T, cerc, linie subțire); toate verificările
 * se fac față de forma ANALITICĂ, nu față de câmpul de distanțe propriu:
 * - V-carve: conul nu iese din formă (supra-tăiere), iar fiecare punct e tăiat la adâncimea ideală
 * - buzunar: fundul curățat, pereții neatinși, insule respectate, Z final exact, rampă fără plonjare în lemn plin
 * - profil: decalaje, punți, adâncime, rampă
 * - găurire: adâncime, trepte, retrageri
 * - timp pe o mască 2000×2000
 */
import {
  drillToolpath, isolines, maskFromHoles, narrowZones, pocketToolpath, profileToolpath,
  signedDistanceField, vcarveToolpath
} from '../src/cam/vectorCam'
import type { ShapeMask } from '../src/cam/vectorCam'
import { findTool } from '../src/cam/toolLibrary'
import { MOVE_FEED, MOVE_PLUNGE, MOVE_RAPID } from '../src/cam/types'
import type { CamJob, CamTool, Toolpath } from '../src/cam/types'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`)
  if (!ok) failures++
}

// ───────────── forme analitice ─────────────

class Shape {
  segs: number[][] = []
  circles: number[][] = []
  inside: (x: number, y: number) => boolean
  constructor(inside: (x: number, y: number) => boolean, segs: number[][], circles: number[][]) {
    this.inside = inside
    this.segs = segs
    this.circles = circles
  }
  /** distanța cu semn până la frontieră: pozitivă în interior */
  dist(x: number, y: number): number {
    let best = Infinity
    for (const [x0, y0, x1, y1] of this.segs) {
      const dx = x1 - x0, dy = y1 - y0
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)))
      best = Math.min(best, Math.hypot(x - x0 - t * dx, y - y0 - t * dy))
    }
    for (const [cx, cy, r] of this.circles) best = Math.min(best, Math.abs(Math.hypot(x - cx, y - cy) - r))
    return this.inside(x, y) ? best : -best
  }
}

function polygon(rings: number[][][]): Shape {
  const segs: number[][] = []
  for (const ring of rings) {
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length]
      segs.push([a[0], a[1], b[0], b[1]])
    }
  }
  const inside = (x: number, y: number) => {
    let c = false
    for (const [x0, y0, x1, y1] of segs) {
      if ((y0 > y) !== (y1 > y) && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) c = !c
    }
    return c
  }
  return new Shape(inside, segs, [])
}
const rect = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const disc = (cx: number, cy: number, r: number) => new Shape((x, y) => Math.hypot(x - cx, y - cy) < r, [], [[cx, cy, r]])
const annulus = (cx: number, cy: number, r1: number, r2: number) =>
  new Shape((x, y) => { const d = Math.hypot(x - cx, y - cy); return d < r1 && d > r2 }, [], [[cx, cy, r1], [cx, cy, r2]])

function rasterize(shape: Shape, wMm: number, hMm: number, px: number): ShapeMask {
  const w = Math.round(wMm / px), h = Math.round(hMm / px)
  const data = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) data[j * w + i] = shape.inside((i + 0.5) * px, hMm - (j + 0.5) * px) ? 1 : 0
  }
  return { data, w, h, widthMm: wMm, heightMm: hMm }
}

function makeJob(wMm: number, hMm: number): CamJob {
  return {
    widthMm: wMm, heightMm: hMm, maxDepthMm: 8, stockThicknessMm: 14, xyOrigin: 'bottomLeft', zZero: 'top',
    safeZMm: 5, rapidRateMmMin: 3000, roughingEnabled: false, roughingTool: findTool('em6'), roughingAllowanceMm: 0,
    finishingEnabled: false, finishingTool: findTool('vb60'), finishStrategy: 'rasterX'
  }
}

// ───────────── utilitare de mișcări ─────────────

type Seg = { t: number; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }
function segments(tp: Toolpath): Seg[] {
  const m = tp.moves
  const out: Seg[] = []
  for (let k = 4; k < m.length; k += 4) {
    out.push({ t: m[k], x0: m[k - 3], y0: m[k - 2], z0: m[k - 1], x1: m[k + 1], y1: m[k + 2], z1: m[k + 3] })
  }
  return out
}
/** puncte la cel mult `ds` mm unul de altul pe toate segmentele de tăiere (avans/plonjare) */
function forSamples(tp: Toolpath, ds: number, cb: (x: number, y: number, z: number, s: Seg) => void) {
  for (const s of segments(tp)) {
    if (s.t === MOVE_RAPID) continue
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0)
    const n = Math.max(1, Math.ceil(len / ds))
    for (let k = 0; k <= n; k++) {
      const t = k / n
      cb(s.x0 + (s.x1 - s.x0) * t, s.y0 + (s.y1 - s.y0) * t, s.z0 + (s.z1 - s.z0) * t, s)
    }
  }
}
function checkStructure(tp: Toolpath, job: CamJob, label: string) {
  const m = tp.moves
  let ok = m[0] === MOVE_RAPID && m[3] === job.safeZMm && m[m.length - 4] === MOVE_RAPID && m[m.length - 1] === job.safeZMm
  let badRapid = 0
  for (const s of segments(tp)) {
    if (s.t === MOVE_RAPID && Math.hypot(s.x1 - s.x0, s.y1 - s.y0) > 1e-9 && (s.z0 !== job.safeZMm || s.z1 !== job.safeZMm)) badRapid++
  }
  ok = ok && badRapid === 0
  check(ok, `${label}: începe/se termină cu rapid la Z sigur, rapid în XY doar la Z sigur (${badRapid} abateri)`)
}

// ───────────── SDF și izolinii ─────────────
console.log('— SDF și izolinii —')
{
  const px = 0.05
  const shape = polygon([rect(5, 5, 25, 15)])
  const mask = rasterize(shape, 30, 20, px)
  const sdf = signedDistanceField(mask)
  // în exterior, lângă colțuri, distanța la CENTRUL pixelului interior diferă de cea la colțul analitic cu
  // cel mult o jumătate de pixel (informația măștii binare nu poate fi mai bună)
  let worst = 0
  for (let j = 0; j < sdf.h; j += 3) {
    for (let i = 0; i < sdf.w; i += 3) {
      const x = (i + 0.5) * px, y = 20 - (j + 0.5) * px
      if (!shape.inside(x, y)) worst = Math.max(worst, Math.abs(sdf.d[j * sdf.w + i] - shape.dist(x, y)))
    }
  }
  check(worst <= 0.5 * px, `SDF în exterior: abatere maximă ${worst.toFixed(4)} mm ≤ ½ pixel (${(0.5 * px).toFixed(3)})`)
  let worstIn = 0
  for (let j = 0; j < sdf.h; j += 3) {
    for (let i = 0; i < sdf.w; i += 3) {
      const x = (i + 0.5) * px, y = 20 - (j + 0.5) * px
      if (shape.inside(x, y)) worstIn = Math.max(worstIn, Math.abs(sdf.d[j * sdf.w + i] - shape.dist(x, y)))
    }
  }
  check(worstIn < 1e-3, `SDF în interior = distanța analitică (dreptunghi aliniat la grilă), abatere ${worstIn.toFixed(5)} mm`)

  const ringShape = annulus(15, 10, 8, 3)
  const rsdf = signedDistanceField(rasterize(ringShape, 30, 20, px))
  const lines = isolines(rsdf, 1.5, 0.01)
  const closedAll = lines.every(l => l.closed)
  const areas = lines.map(l => {
    let a = 0
    const n = l.pts.length / 2
    for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; a += l.pts[2 * k] * l.pts[2 * k2 + 1] - l.pts[2 * k2] * l.pts[2 * k + 1] }
    return a / 2
  })
  const outer = lines.findIndex((_, k) => areas[k] > 0)
  const hole = lines.findIndex((_, k) => areas[k] < 0)
  check(lines.length === 2 && closedAll && outer >= 0 && hole >= 0, `izolinie inel la 1.5 mm: ${lines.length} bucle, toate închise, una CCW (exterior) și una CW (gaură)`)
  let worstR = 0
  for (const [k, expect] of [[outer, 6.5], [hole, 4.5]] as Array<[number, number]>) {
    for (let q = 0; q < lines[k].pts.length; q += 2) {
      worstR = Math.max(worstR, Math.abs(Math.hypot(lines[k].pts[q] - 15, lines[k].pts[q + 1] - 10) - expect))
    }
  }
  // masca binară cunoaște frontiera doar cu ± ½ pixel; peste asta nu se poate cere
  check(worstR <= 0.5 * px, `izolinie inel: raza abate cel mult ${worstR.toFixed(4)} mm de cea analitică (6.5 / 4.5), limita măștii ½ pixel = ${(0.5 * px).toFixed(3)}`)
  const l0 = isolines(rsdf, 0, 0.01)
  check(l0.length === 2 && l0.every(l => l.closed), `izolinie la nivelul 0: ${l0.length} bucle închise (frontiera măștii)`)
}

// ───────────── V-carve ─────────────
console.log('— V-carve —')

function vcarveEval(tp: Toolpath, shape: Shape, tool: CamTool, Dcap: number, wMm: number, hMm: number, startDepth = 0) {
  const R = tool.diameterMm / 2
  const tanHalf = Math.tan((tool.tipAngleDeg * Math.PI) / 360)
  let maxOver = 0
  const g = 0.05
  const nx = Math.ceil(wMm / g), ny = Math.ceil(hMm / g)
  const buf = new Float32Array(nx * ny)
  const rr = Math.ceil(R / g)
  // supra-tăiere: puncte la ≤ 0.05 mm pe toate segmentele de tăiere
  forSamples(tp, 0.05, (x, y, z) => {
    if (z >= -startDepth) return
    const r0 = Math.min((-z - startDepth) * tanHalf, R)
    maxOver = Math.max(maxOver, r0 - shape.dist(x, y))
  })
  // material tăiat: segmentele la Z constant se ștampilează EXACT (distanța celulei la segment),
  // cele înclinate (creasta) prin puncte la ≤ 0.02 mm
  const stampPoint = (x: number, y: number, z: number) => {
    const ci = Math.round(x / g - 0.5), cj = Math.round(y / g - 0.5)
    for (let dj = -rr; dj <= rr; dj++) {
      const j = cj + dj
      if (j < 0 || j >= ny) continue
      for (let di = -rr; di <= rr; di++) {
        const i = ci + di
        if (i < 0 || i >= nx) continue
        const dd = Math.hypot((i + 0.5) * g - x, (j + 0.5) * g - y)
        if (dd > R) continue
        const zc = z + dd / tanHalf
        if (zc < buf[j * nx + i]) buf[j * nx + i] = zc
      }
    }
  }
  for (const s of segments(tp)) {
    if (s.t === MOVE_RAPID) continue
    if (Math.abs(s.z1 - s.z0) < 1e-9 && s.z0 < -startDepth) {
      const dx = s.x1 - s.x0, dy = s.y1 - s.y0
      const l2 = dx * dx + dy * dy
      const i0 = Math.max(0, Math.floor((Math.min(s.x0, s.x1) - R) / g)), i1 = Math.min(nx - 1, Math.ceil((Math.max(s.x0, s.x1) + R) / g))
      const j0 = Math.max(0, Math.floor((Math.min(s.y0, s.y1) - R) / g)), j1 = Math.min(ny - 1, Math.ceil((Math.max(s.y0, s.y1) + R) / g))
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cx = (i + 0.5) * g, cy = (j + 0.5) * g
          const t = l2 > 0 ? Math.max(0, Math.min(1, ((cx - s.x0) * dx + (cy - s.y0) * dy) / l2)) : 0
          const dd = Math.hypot(cx - s.x0 - t * dx, cy - s.y0 - t * dy)
          if (dd > R) continue
          const zc = s.z0 + dd / tanHalf
          if (zc < buf[j * nx + i]) buf[j * nx + i] = zc
        }
      }
    } else if (s.z0 < -startDepth || s.z1 < -startDepth) {
      const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0)
      const n = Math.max(1, Math.ceil(len / 0.02))
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const z = s.z0 + (s.z1 - s.z0) * t
        if (z < -startDepth) stampPoint(s.x0 + (s.x1 - s.x0) * t, s.y0 + (s.y1 - s.y0) * t, z)
      }
    }
  }
  let maxLeft = 0, maxOverDepth = 0, leftAt = ''
  let maxLeftFar = 0
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * g, y = (j + 0.5) * g
      const Dan = shape.dist(x, y)
      if (Dan <= 0) continue
      const ideal = Math.min(Dan, Dcap) / tanHalf + startDepth
      const achieved = Math.max(-buf[j * nx + i], startDepth) // până la startDepth lemnul e deja scos
      const left = ideal - achieved
      if (left > maxLeft) { maxLeft = left; leftAt = `(${x.toFixed(2)}, ${y.toFixed(2)}) D=${Dan.toFixed(3)}` }
      if (Dan > 0.1 && left > maxLeftFar) maxLeftFar = left
      maxOverDepth = Math.max(maxOverDepth, achieved - ideal)
    }
  }
  return { maxOver, maxLeft, maxLeftFar, maxOverDepth, leftAt }
}

const vb60: CamTool = { ...findTool('vb60'), diameterMm: 3, stepDownMm: 1 }
const vb90: CamTool = { ...findTool('vb90'), diameterMm: 6, stepDownMm: 1 }
{
  const px = 0.025
  const W = 30, H = 30
  const job = makeJob(W, H)
  const cases: Array<[string, Shape]> = [
    ['dreptunghi 20×2.4 (<tool)', polygon([rect(5, 12, 25, 14.4)])],
    ['literă L', polygon([[[6, 5], [9, 5], [9, 22], [24, 22], [24, 25], [6, 25]]])],
    ['literă T', polygon([[[5, 22], [25, 22], [25, 25], [16.5, 25], [16.5, 5], [13.5, 5], [13.5, 25], [5, 25]]])],
    ['cerc r=1.45', disc(15, 15, 1.45)],
    ['inel 6.5/4.5', annulus(15, 15, 6.5, 4.5)],
    ['linie subțire 0.6 (<tool)', polygon([rect(4, 14.7, 26, 15.3)])]
  ]
  for (const [name, shape] of cases) {
    const mask = rasterize(shape, W, H, px)
    const t0 = performance.now()
    const tp = vcarveToolpath(mask, vb60, job, {})
    const ms = performance.now() - t0
    const ev = vcarveEval(tp, shape, vb60, vb60.diameterMm / 2, W, H)
    console.log(`  ${name}: ${tp.moves.length / 4} mișcări, ${ms.toFixed(0)} ms, supra-tăiere laterală max ${ev.maxOver.toFixed(4)} mm, adâncime în plus max ${ev.maxOverDepth.toFixed(4)}, rest max ${ev.maxLeft.toFixed(4)} (la ${ev.leftAt}), rest max la D>0.1: ${ev.maxLeftFar.toFixed(4)}`)
    check(ev.maxOver <= 0.05, `V-carve ${name}: conul iese din formă cu cel mult ${ev.maxOver.toFixed(4)} mm (≤ 0.05)`)
    check(ev.maxLeft <= 0.05 && ev.maxOverDepth <= 0.05, `V-carve ${name}: rest max ${ev.maxLeft.toFixed(4)}, exces de adâncime max ${ev.maxOverDepth.toFixed(4)} (≤ 0.05)`)
    checkStructure(tp, job, `V-carve ${name}`)
  }
}
{
  // adâncime limitată: freză 90°, fund plat la 1 mm
  const px = 0.025
  const W = 30, H = 30
  const job = makeJob(W, H)
  const shape = polygon([rect(4, 6, 26, 22)])
  const mask = rasterize(shape, W, H, px)
  const t0 = performance.now()
  const tp = vcarveToolpath(mask, vb90, job, { flatDepthMm: 1 })
  const ms = performance.now() - t0
  const ev = vcarveEval(tp, shape, vb90, 1, W, H)
  console.log(`  dreptunghi 22×16, fund plat 1 mm: ${tp.moves.length / 4} mișcări, ${ms.toFixed(0)} ms, supra-tăiere max ${ev.maxOver.toFixed(4)}, rest max ${ev.maxLeft.toFixed(4)} (la ${ev.leftAt}), adâncime în plus ${ev.maxOverDepth.toFixed(4)}`)
  check(ev.maxOver <= 0.05, `V-carve cu fund plat: conul iese din formă cu cel mult ${ev.maxOver.toFixed(4)} mm`)
  check(ev.maxLeft <= 0.05 && ev.maxOverDepth <= 0.05, `V-carve cu fund plat: rest max ${ev.maxLeft.toFixed(4)}, exces ${ev.maxOverDepth.toFixed(4)} (≤ 0.05)`)
  check(tp.stats.minZ >= -1 - 1e-6, `V-carve cu fund plat: Z minim ${tp.stats.minZ.toFixed(4)} ≥ −1`)
  checkStructure(tp, job, 'V-carve fund plat')
}
{
  // adâncime de pornire: gravura începe la −0.8 mm (de ex. într-un buzunar făcut înainte)
  const px = 0.025
  const W = 30, H = 30
  const job = makeJob(W, H)
  const shape = polygon([[[6, 5], [9, 5], [9, 22], [24, 22], [24, 25], [6, 25]]])
  const mask = rasterize(shape, W, H, px)
  const tp = vcarveToolpath(mask, vb60, job, { startDepthMm: 0.8 })
  const ev = vcarveEval(tp, shape, vb60, 1.5, W, H, 0.8)
  const maxD = 1.5 / Math.tan((vb60.tipAngleDeg * Math.PI) / 360)
  console.log(`  L cu start la 0.8 mm: supra-tăiere max ${ev.maxOver.toFixed(4)}, rest max ${ev.maxLeft.toFixed(4)}, exces ${ev.maxOverDepth.toFixed(4)}, Z min ${tp.stats.minZ.toFixed(3)} (așteptat ≈ −${(0.8 + maxD).toFixed(3)})`)
  check(ev.maxOver <= 0.05 && ev.maxLeft <= 0.05 && ev.maxOverDepth <= 0.05 && tp.stats.minZ >= -(0.8 + maxD) - 0.03, 'V-carve cu adâncime de pornire: la fel de exact, nimic sub vârful sculei')
}

// ───────────── buzunar ─────────────
console.log('— Buzunar —')
const em3: CamTool = { ...findTool('em3175'), diameterMm: 3, stepDownMm: 1, stepoverPercent: 40 }

/** simulare simplă a lemnului: cea mai adâncă tăietură la fiecare celulă; verifică rampa */
function rampCheck(tp: Toolpath, R: number, tanA: number, wMm: number, hMm: number) {
  const g = 0.1
  const nx = Math.ceil(wMm / g), ny = Math.ceil(hMm / g)
  const cut = new Float32Array(nx * ny)
  const rr = Math.ceil(R / g)
  let bad = 0
  let worstSlope = 0
  let downMoves = 0
  for (const s of segments(tp)) {
    if (s.t === MOVE_RAPID) continue
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0)
    const n = Math.max(1, Math.ceil(len / 0.05))
    const dz = s.z1 - s.z0
    const horiz = Math.hypot(s.x1 - s.x0, s.y1 - s.y0)
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const x = s.x0 + (s.x1 - s.x0) * t, y = s.y0 + (s.y1 - s.y0) * t, z = s.z0 + dz * t
      const ci = Math.round(x / g - 0.5), cj = Math.round(y / g - 0.5)
      if (ci < 0 || cj < 0 || ci >= nx || cj >= ny) continue
      if (dz < -1e-9 && z < cut[cj * nx + ci] - 1e-6 && z < -1e-6) {
        // coboară în lemn plin: panta orizontală/vertical trebuie să respecte unghiul
        downMoves++
        const slope = horiz / Math.abs(dz) // mm orizontal per mm de coborâre
        const need = 1 / tanA
        worstSlope = Math.max(worstSlope, 1 / Math.max(slope, 1e-9))
        if (slope < need * (1 - 1e-3)) { bad++; break }
      }
      for (let dj = -rr; dj <= rr; dj++) {
        const j = cj + dj
        if (j < 0 || j >= ny) continue
        for (let di = -rr; di <= rr; di++) {
          const i = ci + di
          if (i < 0 || i >= nx) continue
          if (Math.hypot((i + 0.5) * g - x, (j + 0.5) * g - y) <= R && z < cut[j * nx + i]) cut[j * nx + i] = z
        }
      }
    }
  }
  return { bad, worstTan: worstSlope, downMoves }
}

function pocketEval(tp: Toolpath, shape: Shape, R: number, depth: number, wMm: number, hMm: number) {
  // pereți: discul sculei nu iese din formă
  let maxOut = 0
  let minZ = 0
  forSamples(tp, 0.05, (x, y, z) => {
    if (z < -1e-9) {
      maxOut = Math.max(maxOut, R - shape.dist(x, y))
      if (z < minZ) minZ = z
    }
  })
  // fundul: celule curățate de discul sculei la adâncimea finală
  const g = 0.1
  const nx = Math.ceil(wMm / g), ny = Math.ceil(hMm / g)
  const cleared = new Uint8Array(nx * ny)
  const rr = Math.ceil(R / g)
  forSamples(tp, 0.03, (x, y, z) => {
    if (z > -depth + 1e-6) return
    const ci = Math.round(x / g - 0.5), cj = Math.round(y / g - 0.5)
    for (let dj = -rr; dj <= rr; dj++) {
      const j = cj + dj
      if (j < 0 || j >= ny) continue
      for (let di = -rr; di <= rr; di++) {
        const i = ci + di
        if (i < 0 || i >= nx) continue
        if (Math.hypot((i + 0.5) * g - x, (j + 0.5) * g - y) <= R + 1e-9) cleared[j * nx + i] = 1
      }
    }
  })
  // mulțimea accesibilă: puncte la ≤ R − 0.1 de un centru permis (distanța interioară ≥ R + 0.1)
  const centre = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (shape.dist((i + 0.5) * g, (j + 0.5) * g) >= R + 0.1) centre[j * nx + i] = 1
  const rs = Math.floor((R - 0.1) / g)
  let reachable = 0, missed = 0
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let near = false
      for (let dj = -rs; dj <= rs && !near; dj++) {
        const jj = j + dj
        if (jj < 0 || jj >= ny) continue
        for (let di = -rs; di <= rs; di++) {
          const ii = i + di
          if (ii < 0 || ii >= nx) continue
          if (centre[jj * nx + ii] && Math.hypot(di * g, dj * g) <= R - 0.1) { near = true; break }
        }
      }
      if (near) {
        reachable++
        if (!cleared[j * nx + i]) missed++
      }
    }
  }
  return { maxOut, minZ, reachable, missed }
}

{
  const px = 0.025
  const W = 34, H = 28
  const job = makeJob(W, H)
  // ramă cu insulă dreptunghiulară + un cerc separat
  const frame = polygon([rect(2, 2, 22, 26), rect(8, 9, 16, 19)]) // insulă 8×10 în mijloc
  const mask = rasterize(frame, W, H, px)
  const depth = 2.5
  for (const ramp of [false, true]) {
    const tp = pocketToolpath(mask, em3, job, { depthMm: depth, ramp: { enabled: ramp, angleDeg: 5 } })
    const ev = pocketEval(tp, frame, 1.5, depth, W, H)
    console.log(`  ramă cu insulă, rampă=${ramp}: ${tp.moves.length / 4} mișcări, nume "${tp.name}", ieșire peste perete max ${ev.maxOut.toFixed(4)} mm, zonă accesibilă ${ev.reachable} celule, nețăiate ${ev.missed}, Z min ${ev.minZ}`)
    check(ev.maxOut <= 0.02, `buzunar (rampă=${ramp}): discul sculei iese din formă cu cel mult ${ev.maxOut.toFixed(4)} mm (≤ 0.02), insula respectată`)
    check(ev.missed === 0 && ev.reachable > 1000, `buzunar (rampă=${ramp}): fundul curățat peste tot unde scula încape (${ev.missed} celule necurățate din ${ev.reachable})`)
    check(Math.abs(ev.minZ + depth) < 1e-9 && tp.stats.minZ === -depth, `buzunar (rampă=${ramp}): Z final exact −${depth} (minZ ${tp.stats.minZ}), nimic mai adânc`)
    checkStructure(tp, job, `buzunar rampă=${ramp}`)
    const rc = rampCheck(tp, 1.5, Math.tan((5 * Math.PI) / 180), W, H)
    if (ramp) {
      check(rc.bad === 0 && rc.downMoves > 0, `buzunar cu rampă 5°: ${rc.downMoves} coborâri în lemn plin, toate cu pantă ≤ tan(5°) (${rc.bad} abateri)`)
    } else {
      check(rc.bad > 0, `buzunar fără rampă: plonjează vertical (probă de control pentru verificarea rampei: ${rc.bad} plonjări în lemn plin)`)
    }
  }
  // zone înguste: o linie de 1 mm nu primește buzunar cu freza de 3 mm
  const thin = polygon([rect(2, 2, 30, 3), rect(6, 12, 20, 24)])
  const tmask = rasterize(thin, W, H, px)
  const tpn = pocketToolpath(tmask, em3, job, { depthMm: 1 })
  check(narrowZones(tmask, em3) === 1 && tpn.name.includes('1 zone prea înguste'), `zonă prea îngustă sărită și raportată: narrowZones=${narrowZones(tmask, em3)}, nume "${tpn.name}"`)
  const evn = pocketEval(tpn, thin, 1.5, 1, W, H)
  check(evn.maxOut <= 0.02, `buzunar cu zonă îngustă: sculă în afara formei cu cel mult ${evn.maxOut.toFixed(4)} mm`)
  // adaos de finisare
  const tpa = pocketToolpath(mask, em3, job, { depthMm: 1, finishAllowanceMm: 0.3 })
  const eva = pocketEval(tpa, frame, 1.5 + 0.3, 1, W, H)
  check(eva.maxOut <= 0.02, `buzunar cu adaos 0.3 mm: centrul sculei rămâne la ≥ R + 0.3 de perete (abatere ${eva.maxOut.toFixed(4)})`)
}

// ───────────── profil ─────────────
console.log('— Profil —')
const em3p: CamTool = { ...findTool('em3175'), diameterMm: 3, stepDownMm: 1.5 }
{
  const px = 0.025
  const W = 40, H = 40
  const job = makeJob(W, H)
  const circle = disc(20, 20, 12)
  const mask = rasterize(circle, W, H, px)
  const R = 1.5
  for (const side of ['outside', 'inside', 'on'] as const) {
    const tp = profileToolpath(mask, em3p, job, { side, depthMm: 6 })
    const expect = side === 'outside' ? -R : side === 'inside' ? R : 0
    let worst = 0
    let n = 0
    forSamples(tp, 0.05, (x, y, z) => {
      if (z < -1e-9) { worst = Math.max(worst, Math.abs(circle.dist(x, y) - expect)); n++ }
    })
    check(worst <= 0.02 && n > 1000, `profil ${side}: distanța centrului sculei la frontieră = ${expect >= 0 ? '+' : ''}${expect} ± ${worst.toFixed(4)} mm (≤ 0.02), ${n} puncte`)
    check(tp.stats.minZ === -6, `profil ${side}: adâncime finală atinsă, Z min ${tp.stats.minZ}`)
    // sens: exterior orar, interior antiorar (aria cu semn a traseului la ultima trecere)
    let a = 0
    let px0 = NaN, py0 = NaN
    for (const s of segments(tp)) {
      if (s.t === MOVE_FEED && Math.abs(s.z0 + 6) < 1e-9 && Math.abs(s.z1 + 6) < 1e-9) {
        a += s.x0 * s.y1 - s.x1 * s.y0
        px0 = s.x1; py0 = s.y1
      }
    }
    void px0; void py0
    const wantCW = side === 'outside'
    check(wantCW ? a < 0 : a > 0, `profil ${side}: sens ${a < 0 ? 'orar' : 'antiorar'} (așteptat ${wantCW ? 'orar' : 'antiorar'})`)
    checkStructure(tp, job, `profil ${side}`)
  }
  // punți
  const tabs = { count: 4, widthMm: 4, heightMm: 2.5 }
  const tpT = profileToolpath(mask, em3p, job, { side: 'outside', depthMm: 6, tabs })
  const tabTop = -(6 - 2.5)
  let tabLen = 0, belowTab = 0, tabPasses = 0
  let lastZ = NaN
  for (const s of segments(tpT)) {
    if (s.t === MOVE_FEED && Math.abs(s.z0 - tabTop) < 1e-9 && Math.abs(s.z1 - tabTop) < 1e-9) tabLen += Math.hypot(s.x1 - s.x0, s.y1 - s.y0)
    // segmente de avans deasupra punții, adânci: nu trebuie să existe în zona punții la ultimele două treceri
    if (s.t === MOVE_FEED && s.z0 < tabTop - 1e-9 && s.z1 < tabTop - 1e-9) belowTab += Math.hypot(s.x1 - s.x0, s.y1 - s.y0)
    if (s.z1 !== lastZ) lastZ = s.z1
  }
  // trecerea de la −3 (= −4.5?) : nivelurile sunt −1.5, −3, −4.5, −6; punți pe cele mai adânci de −3.5 → −4.5 și −6
  tabPasses = 2
  const expectTab = tabPasses * tabs.count * (tabs.widthMm + 2 * R)
  const circ = 2 * Math.PI * (12 + R)
  const expectBelow = tabPasses * (circ - tabs.count * (tabs.widthMm + 2 * R))
  console.log(`  punți: lungime la vârful punții ${tabLen.toFixed(3)} (așteptat ${expectTab}), lungime sub vârf ${belowTab.toFixed(2)} (așteptat ~${expectBelow.toFixed(2)})`)
  check(Math.abs(tabLen - expectTab) < 0.15, `punți: lungimea totală la vârf = ${tabLen.toFixed(3)} mm = ${tabPasses} treceri × ${tabs.count} × (${tabs.widthMm} + 2R)`)
  check(Math.abs(belowTab - expectBelow) / expectBelow < 0.01, `punți: restul conturului tăiat adânc (${belowTab.toFixed(1)} mm față de ${expectBelow.toFixed(1)})`)
  check(tpT.stats.minZ === -6 && tpT.name.includes('4 punți'), `profil cu punți: adâncime finală ${tpT.stats.minZ}, nume "${tpT.name}"`)
  // punți pe o buclă prea scurtă: nu se pun
  const small = rasterize(disc(20, 20, 3), W, H, px)
  const tpS = profileToolpath(small, em3p, job, { side: 'outside', depthMm: 6, tabs })
  check(tpS.name.includes('0 punți'), `buclă scurtă fără punți: "${tpS.name}"`)
  checkStructure(tpT, job, 'profil cu punți')

  // rampă
  for (const withTabs of [false, true]) {
    const tpR = profileToolpath(mask, em3p, job, { side: 'outside', depthMm: 6, ramp: { enabled: true, angleDeg: 4 }, tabs: withTabs ? tabs : undefined })
    const rc = rampCheck(tpR, R, Math.tan((4 * Math.PI) / 180), W, H)
    let worst = 0
    forSamples(tpR, 0.05, (x, y, z) => { if (z < -1e-9) worst = Math.max(worst, Math.abs(circle.dist(x, y) + R)) })
    // la punți, coborârea de după punte e verticală în canalul trecerii anterioare (documentat): se acceptă doar aceea
    const allowed = withTabs ? 2 * tabs.count : 0
    console.log(`  profil cu rampă 4°${withTabs ? ' + punți' : ''}: ${rc.downMoves} coborâri în lemn plin, ${rc.bad} abateri, nume "${tpR.name}"`)
    check(rc.bad <= allowed && rc.downMoves > 0, `profil cu rampă${withTabs ? ' și punți' : ''}: coborâri în lemn plin cu pantă ≤ tan(4°) (${rc.bad} abateri, permise ${allowed} pentru coborârea de după punte)`)
    check(worst <= 0.02 && tpR.stats.minZ === -6, `profil cu rampă${withTabs ? ' și punți' : ''}: pe contur ± ${worst.toFixed(4)}, Z final ${tpR.stats.minZ}`)
    // lungimea parcursă la adâncimea finală: tot conturul (fără punți), nicio porțiune înclinată rămasă netăiată
    let atFinal = 0, atTab = 0
    for (const s of segments(tpR)) {
      if (s.t !== MOVE_FEED) continue
      const l = Math.hypot(s.x1 - s.x0, s.y1 - s.y0)
      if (Math.abs(s.z0 + 6) < 1e-9 && Math.abs(s.z1 + 6) < 1e-9) atFinal += l
      if (Math.abs(s.z0 - tabTop) < 1e-9 && Math.abs(s.z1 - tabTop) < 1e-9) atTab += l
    }
    const circR = 2 * Math.PI * (12 + R)
    const needFinal = withTabs ? circR - tabs.count * (tabs.widthMm + 2 * R) : circR
    check(atFinal >= needFinal * 0.995 && atFinal <= needFinal * 1.2, `profil cu rampă${withTabs ? ' și punți' : ''}: la −6 se taie ${atFinal.toFixed(1)} mm (contur ${needFinal.toFixed(1)}); lungime la vârf de punte ${atTab.toFixed(1)}${withTabs ? ` (așteptat ${2 * tabs.count * (tabs.widthMm + 2 * R)})` : ''}`)
  }
  // inel: găurile se taie primele
  const ringMask = rasterize(annulus(20, 20, 14, 5), W, H, px)
  const tpRing = profileToolpath(ringMask, em3p, job, { side: 'outside', depthMm: 3 })
  let firstR = NaN
  for (const s of segments(tpRing)) {
    if (s.t === MOVE_FEED) { firstR = Math.hypot(s.x1 - 20, s.y1 - 20); break }
  }
  check(firstR < 8, `inel: se taie întâi gaura din mijloc (raza primului avans ${firstR.toFixed(2)} mm < 8)`)
}

// ───────────── găurire ─────────────
console.log('— Găurire —')
{
  const job = makeJob(50, 50)
  const drill: CamTool = { ...findTool('em3175'), diameterMm: 2 }
  const pts = [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 25, y: 35 }]
  const tp = drillToolpath(pts, drill, job, { depthMm: 7, peckMm: 2 })
  const segs = segments(tp)
  // plonjări în jos: pe fiecare gaură, adâncimile succesive
  let ok = true
  let maxPeck = 0
  let retracts = 0
  const bottoms = new Map<string, number[]>()
  for (const s of segs) {
    if (s.t === MOVE_PLUNGE && s.z1 < s.z0 && s.z1 < 0) {
      const key = `${s.x1},${s.y1}`
      const arr = bottoms.get(key) ?? []
      arr.push(s.z1)
      bottoms.set(key, arr)
    }
    if (s.t === MOVE_RAPID && Math.abs(s.z1 - 1) < 1e-9 && s.z0 < 0) retracts++
  }
  for (const arr of bottoms.values()) {
    let prev = 0
    for (const z of arr) { maxPeck = Math.max(maxPeck, prev - z); prev = z }
    ok = ok && Math.abs(arr[arr.length - 1] + 7) < 1e-9
  }
  check(bottoms.size === 3 && ok, `găurire: ${bottoms.size} găuri, fiecare ajunge la −7`)
  check(maxPeck <= 2 + 1e-9, `găurire: treapta maximă ${maxPeck} mm ≤ 2`)
  check(retracts === 3 * 3, `găurire: ${retracts} retrageri complete la +1 mm (3 găuri × 3 trepte; ultima treaptă se retrage sus la Z sigur)`)
  checkStructure(tp, job, 'găurire')
  const tp0 = drillToolpath(pts, drill, job, { depthMm: 7, peckMm: 0 })
  check(tp0.stats.minZ === -7, `găurire fără trepte: Z min ${tp0.stats.minZ}`)
  // găuri din mască
  const mk = rasterize(new Shape((x, y) => Math.hypot(x - 10, y - 10) < 1.5 || Math.hypot(x - 30, y - 20) < 2 || (x > 5 && x < 40 && y > 30 && y < 45), [], []), 50, 50, 0.05)
  const holes = maskFromHoles(mk, 5)
  const hA = holes.find(h => Math.abs(h.x - 10) < 0.2 && Math.abs(h.y - 10) < 0.2)
  const hB = holes.find(h => Math.abs(h.x - 30) < 0.2 && Math.abs(h.y - 20) < 0.2)
  check(holes.length === 2 && !!hA && !!hB && Math.abs(hA.diameterMm - 3) < 0.1 && Math.abs(hB.diameterMm - 4) < 0.1,
    `maskFromHoles: ${holes.length} găuri mici (forma mare ignorată): (${hA?.x.toFixed(2)}, ${hA?.y.toFixed(2)}) Ø ${hA?.diameterMm.toFixed(2)} și (${hB?.x.toFixed(2)}, ${hB?.y.toFixed(2)}) Ø ${hB?.diameterMm.toFixed(2)}`)
}

// ───────────── timp ─────────────
console.log('— Timp pe mască 2000×2000 (0.1 mm/pixel) —')
{
  const W = 200, H = 200
  const job = makeJob(W, H)
  const big = new Shape((x, y) => {
    const d = Math.hypot(x - 100, y - 100)
    const ringIn = d < 80 && d > 40
    const bar = x > 60 && x < 140 && y > 95 && y < 105
    const blob = Math.hypot(x - 30, y - 170) < 20
    return ringIn || bar || blob
  }, [], [])
  const mask = rasterize(big, W, H, 0.1)
  const vb = { ...findTool('vb60'), diameterMm: 6 }
  const t0 = performance.now()
  const tpV = vcarveToolpath(mask, vb, job, {})
  const msV = performance.now() - t0
  const t1 = performance.now()
  const tpP = pocketToolpath(mask, { ...findTool('em6'), stepDownMm: 3 }, job, { depthMm: 6 })
  const msP = performance.now() - t1
  const t2 = performance.now()
  const tpF = profileToolpath(mask, { ...findTool('em6'), stepDownMm: 3 }, job, { side: 'outside', depthMm: 6, tabs: { count: 4, widthMm: 6, heightMm: 2 } })
  const msF = performance.now() - t2
  console.log(`  V-carve ${msV.toFixed(0)} ms (${tpV.moves.length / 4} mișcări), buzunar ${msP.toFixed(0)} ms (${tpP.moves.length / 4}), profil ${msF.toFixed(0)} ms (${tpF.moves.length / 4})`)
  check(msV < 5000, `V-carve 2000×2000 în ${msV.toFixed(0)} ms (< 5000)`)
  check(msP < 5000, `buzunar 2000×2000 în ${msP.toFixed(0)} ms (< 5000)`)
  check(msF < 5000, `profil 2000×2000 în ${msF.toFixed(0)} ms (< 5000)`)
}

console.log(failures === 0 ? '\nTOATE VERIFICĂRILE AU TRECUT' : `\n${failures} VERIFICĂRI AU PICAT`)
if (failures) process.exit(1)
