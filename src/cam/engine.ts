/**
 * Motor CAM pentru relief 3D (fără DOM — rulează în Web Worker și în teste Node)
 *
 * Coordonate interne: X spre dreapta, Y în sus (Y=0 = marginea de jos a piesei),
 * Z=0 = fața de sus a lemnului, relieful coboară în negativ până la -maxDepthMm.
 */
import { sampleBicubicHeight } from '../utils/surfaceInterpolation'
import type {
  CamJob,
  CamTool,
  SimulationResult,
  Toolpath,
  ToolpathStats
} from './types'
import { MOVE_FEED, MOVE_PLUNGE, MOVE_RAPID } from './types'
import { cutoutToolpath } from './cutout'

export interface Grid {
  nx: number
  ny: number
  cellX: number
  cellY: number
  data: Float32Array // data[j * nx + i] = Z la (i*cellX, j*cellY)
}

export type ProgressFn = (stage: string, fraction: number) => void

const MAX_GRID_CELLS = 3_000_000

function makeGrid(widthMm: number, heightMm: number, targetCell: number): Grid {
  let cell = targetCell
  while ((widthMm / cell + 1) * (heightMm / cell + 1) > MAX_GRID_CELLS) cell *= 1.1
  const nx = Math.max(2, Math.round(widthMm / cell) + 1)
  const ny = Math.max(2, Math.round(heightMm / cell) + 1)
  return {
    nx,
    ny,
    cellX: widthMm / (nx - 1),
    cellY: heightMm / (ny - 1),
    data: new Float32Array(nx * ny)
  }
}

/** Suprafața finală (Z în mm) eșantionată bicubic din harta de adâncime */
export function buildSurfaceGrid(
  heightmap: Float32Array,
  imgW: number,
  imgH: number,
  job: CamJob,
  targetCell: number
): Grid {
  const g = makeGrid(job.widthMm, job.heightMm, targetCell)
  for (let j = 0; j < g.ny; j++) {
    const v = 1 - j / (g.ny - 1) // rândul 0 al imaginii = marginea de sus
    for (let i = 0; i < g.nx; i++) {
      const norm = sampleBicubicHeight(heightmap, imgW, imgH, i / (g.nx - 1), v)
      g.data[j * g.nx + i] = -(1 - norm) * job.maxDepthMm
    }
  }
  return g
}

/**
 * Grilă rară construită ca „înfășurătoare de sus” a unei grile fine: fiecare nod
 * păstrează maximul din celula lui și din vecini. Așa nicio creastă îngustă (mai
 * îngustă decât o celulă rară) nu cade între noduri și nu e tăiată la degroșare.
 */
export function maxPoolGrid(fine: Grid, widthMm: number, heightMm: number, targetCell: number): Grid {
  const g = makeGrid(widthMm, heightMm, Math.max(targetCell, fine.cellX, fine.cellY))
  const ri = Math.ceil(g.cellX / fine.cellX)
  const rj = Math.ceil(g.cellY / fine.cellY)
  // maxim pe rânduri, apoi pe coloane (separabil)
  const tmp = new Float32Array(fine.ny * g.nx)
  for (let j = 0; j < fine.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      const c = Math.round((i * g.cellX) / fine.cellX)
      let m = -Infinity
      for (let k = Math.max(0, c - ri); k <= Math.min(fine.nx - 1, c + ri); k++) m = Math.max(m, fine.data[j * fine.nx + k])
      tmp[j * g.nx + i] = m
    }
  }
  for (let j = 0; j < g.ny; j++) {
    const c = Math.round((j * g.cellY) / fine.cellY)
    for (let i = 0; i < g.nx; i++) {
      let m = -Infinity
      for (let k = Math.max(0, c - rj); k <= Math.min(fine.ny - 1, c + rj); k++) m = Math.max(m, tmp[k * g.nx + i])
      g.data[j * g.nx + i] = m
    }
  }
  return g
}

/** Diametrul care contează pentru pasul lateral (la conică: vârful sferic, nu tija) */
export function effectiveDiameter(tool: CamTool): number {
  return tool.shape === 'taperedball' ? Math.max(0.05, tool.tipDiameterMm ?? 0.5) : tool.diameterMm
}

/** Cât de sus e flancul sculei față de vârf, la distanța radială r */
export function toolProfile(tool: CamTool, r: number): number {
  const R = tool.diameterMm / 2
  if (r > R) return Infinity
  switch (tool.shape) {
    case 'ballnose':
      return R - Math.sqrt(Math.max(0, R * R - r * r))
    case 'vbit':
      return r / Math.tan(((tool.tipAngleDeg || 60) * Math.PI) / 360)
    case 'taperedball': {
      // sferă de rază rt în vârf, tangentă la un con cu semi-unghiul a
      const rt = Math.max(0.01, (tool.tipDiameterMm ?? 0.5) / 2)
      const a = ((tool.tipAngleDeg || 15) * Math.PI) / 360
      const rTan = rt * Math.cos(a)
      if (r <= rTan) return rt - Math.sqrt(Math.max(0, rt * rt - r * r))
      return rt - rt * Math.sin(a) + (r - rTan) / Math.tan(a)
    }
    default:
      return 0
  }
}

interface KernelEntry { di: number; dj: number; h: number }

function toolKernel(tool: CamTool, cellX: number, cellY: number): KernelEntry[] {
  const R = tool.diameterMm / 2
  const ri = Math.ceil(R / cellX)
  const rj = Math.ceil(R / cellY)
  const out: KernelEntry[] = []
  for (let dj = -rj; dj <= rj; dj++) {
    for (let di = -ri; di <= ri; di++) {
      const r = Math.hypot(di * cellX, dj * cellY)
      if (r <= R + 1e-9) out.push({ di, dj, h: toolProfile(tool, Math.min(r, R)) })
    }
  }
  return out
}

/**
 * Compensare sculă (drop-cutter): pentru fiecare poziție a centrului sculei,
 * cea mai joasă cotă a vârfului la care scula atinge suprafața dar NU o taie.
 * În afara piesei nu există material, deci flancurile pot ieși peste margine.
 */
export function compensateForTool(surface: Grid, tool: CamTool, onProgress?: (f: number) => void): Grid {
  const { nx, ny, data } = surface
  const out = new Float32Array(nx * ny).fill(-Infinity)
  const kernel = toolKernel(tool, surface.cellX, surface.cellY)
  for (let k = 0; k < kernel.length; k++) {
    const { di, dj, h } = kernel[k]
    const j0 = Math.max(0, -dj)
    const j1 = Math.min(ny, ny - dj)
    const i0 = Math.max(0, -di)
    const i1 = Math.min(nx, nx - di)
    for (let j = j0; j < j1; j++) {
      const row = j * nx
      const srow = (j + dj) * nx + di
      for (let i = i0; i < i1; i++) {
        const v = data[srow + i] - h
        if (v > out[row + i]) out[row + i] = v
      }
    }
    if (onProgress && (k & 15) === 0) onProgress(k / kernel.length)
  }
  return { ...surface, data: out }
}

/**
 * Ce rămâne după o freză care a mers peste tot pe suprafața ei compensată: în fiecare nod,
 * cel mai de jos punct atins de vreo poziție a frezei (înfășurătoarea de jos a sculei).
 * Diferența față de suprafața dorită = materialul de rest (colțuri, șanțuri înguste).
 */
export function toolEnvelope(comp: Grid, tool: CamTool): Grid {
  const { nx, ny, data } = comp
  const out = new Float32Array(nx * ny).fill(Infinity)
  const kernel = toolKernel(tool, comp.cellX, comp.cellY)
  for (let k = 0; k < kernel.length; k++) {
    const { di, dj, h } = kernel[k]
    const j0 = Math.max(0, -dj), j1 = Math.min(ny, ny - dj)
    const i0 = Math.max(0, -di), i1 = Math.min(nx, nx - di)
    for (let j = j0; j < j1; j++) {
      const row = j * nx
      const srow = (j + dj) * nx + di
      for (let i = i0; i < i1; i++) {
        const v = data[srow + i] + h
        if (v < out[row + i]) out[row + i] = v
      }
    }
  }
  for (let k = 0; k < out.length; k++) out[k] = Math.min(0, out[k]) // peste fața lemnului nu e nimic de tăiat
  return { ...comp, data: out }
}

/**
 * Finisare de rest: freza mică merge DOAR unde cea mare a lăsat material (peste prag),
 * pe rânduri raster, cu o margine de o rază a frezei mici în jurul zonelor.
 */
function restMachining(surface: Grid, bigComp: Grid, job: CamJob, smallTool: CamTool, thresholdMm: number, tol: number): { mb: MoveBuffer; areaFrac: number } {
  const env = toolEnvelope(bigComp, job.finishingTool)
  const { nx, ny, cellX, cellY } = surface
  const need = new Uint8Array(nx * ny)
  let count = 0
  for (let k = 0; k < need.length; k++) if (env.data[k] - surface.data[k] > thresholdMm) { need[k] = 1; count++ }
  // dilatare cu raza frezei mici + o celulă: freza intră și iese din zonă pe material deja curat
  const rr = effectiveDiameter(smallTool) / 2 + Math.max(cellX, cellY)
  const ri = Math.ceil(rr / cellX), rj = Math.ceil(rr / cellY)
  const tmp = new Uint8Array(nx * ny), zone = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let v = 0
    for (let d = -ri; d <= ri && !v; d++) { const ii = i + d; if (ii >= 0 && ii < nx && need[j * nx + ii]) v = 1 }
    tmp[j * nx + i] = v
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    let v = 0
    for (let d = -rj; d <= rj && !v; d++) { const jj = j + d; if (jj >= 0 && jj < ny && tmp[jj * nx + i]) v = 1 }
    zone[j * nx + i] = v
  }

  const comp = compensateForTool(surface, smallTool)
  const mb = new MoveBuffer()
  // pasul lateral: cel cerut, dar nu mai mare decât lasă creste sub prag între rânduri
  // (sferă de rază r: creasta ≈ s²/8r; V/vârf ascuțit: s/2 / tan(semi-unghi))
  let step = Math.max(0.02, (effectiveDiameter(smallTool) * smallTool.stepoverPercent) / 100)
  const half = ((smallTool.tipAngleDeg || 60) * Math.PI) / 360
  const tipR = smallTool.shape === 'ballnose' ? smallTool.diameterMm / 2 : smallTool.shape === 'taperedball' ? effectiveDiameter(smallTool) / 2 : 0
  const scallopStep = smallTool.shape === 'vbit' ? 2 * thresholdMm * Math.tan(half) : tipR > 0 ? Math.sqrt(8 * tipR * thresholdMm) : Infinity
  step = Math.max(0.02, Math.min(step, scallopStep))
  const rows = rowIndices(ny, cellY, step)
  // niveluri pe Z, ca la degroșare: freza fină nu ia niciodată mai mult de un pas Z dintr-o trecere
  const sd = Math.max(0.05, smallTool.stepDownMm)
  let top = -Infinity, bottom = Infinity
  for (let k = 0; k < zone.length; k++) {
    if (!zone[k]) continue
    if (env.data[k] > top) top = env.data[k]
    if (comp.data[k] < bottom) bottom = comp.data[k]
  }
  const levels: number[] = []
  for (let L = top - sd; L > bottom + 1e-4; L -= sd) levels.push(L)
  levels.push(-Infinity) // ultimul nivel: până pe suprafața finală
  // cel mai înalt material rămas sub freză (după finisare), ca să coboare repede până la 1 mm deasupra lui
  const R = smallTool.diameterMm / 2
  const clearAbove = (x: number, y: number) => {
    let top = -Infinity
    for (let j = Math.max(0, Math.floor((y - R) / cellY)); j <= Math.min(ny - 1, Math.ceil((y + R) / cellY)); j++) {
      for (let i = Math.max(0, Math.floor((x - R) / cellX)); i <= Math.min(nx - 1, Math.ceil((x + R) / cellX)); i++) {
        top = Math.max(top, env.data[j * nx + i])
      }
    }
    return Math.min(job.safeZMm, top + 1)
  }
  const linkCells = Math.ceil((2 * step) / cellX) + 1
  // la nivelul L freza nu coboară sub L (z = max(suprafața compensată, L))
  const clampTo = (pts: number[], L: number) => {
    for (let k = 2; k < pts.length; k += 3) if (pts[k] < L) pts[k] = L
    return pts
  }
  let prevLevel = Infinity
  for (const L of levels) {
    let forward = true
    let last: { ri: number; i: number } | null = null
    rows.forEach((r, ri) => {
      // doar unde a mai rămas material sub nivelul anterior și există lemn deasupra nivelului curent
      const runs: Array<[number, number]> = []
      let s = -1
      for (let i = 0; i <= nx; i++) {
        const k = r * nx + i
        const want = i < nx && zone[k] && comp.data[k] < prevLevel - 1e-4 && env.data[k] > L + 1e-4
        if (want) { if (s < 0) s = i }
        else if (s >= 0) { runs.push([s, i - 1]); s = -1 }
      }
      if (!forward) runs.reverse()
      for (const [a, b] of runs) {
        const from = forward ? a : b, to = forward ? b : a
        const simple = simplifyPolyline(clampTo(gridLine(comp, surface, smallTool, true, r, from, to), L), tol)
        if (last && last.ri === ri - 1 && Math.abs(last.i - from) <= linkCells) {
          // rândul vecin începe aproape de unde s-a terminat cel de dinainte: legătură pe suprafață,
          // fără ridicare (ca la finisare), întâi pe Y, apoi pe X, tot la nivelul curent
          const up = clampTo(gridLine(comp, surface, smallTool, false, last.i, rows[ri - 1], r), L)
          mb.feedPolyline(up.slice(3))
          if (last.i !== from) mb.feedPolyline(clampTo(gridLine(comp, surface, smallTool, true, r, last.i, from), L).slice(3, -3))
          mb.feedPolyline(simple)
        } else {
          if (mb.started) mb.push(MOVE_RAPID, mb.x, mb.y, job.safeZMm)
          mb.push(MOVE_RAPID, simple[0], simple[1], job.safeZMm)
          const clear = clearAbove(simple[0], simple[1])
          if (clear < job.safeZMm) mb.push(MOVE_RAPID, simple[0], simple[1], clear)
          mb.push(MOVE_PLUNGE, simple[0], simple[1], simple[2])
          mb.feedPolyline(simple.slice(3))
        }
        last = { ri, i: to }
      }
      if (runs.length) forward = !forward
    })
    prevLevel = L
  }
  if (mb.started) mb.push(MOVE_RAPID, mb.x, mb.y, job.safeZMm)
  return { mb, areaFrac: count / need.length }
}

/** Drop-cutter exact într-un punct oarecare (nu doar în noduri) */
function dropCutterAt(surface: Grid, tool: CamTool, x: number, y: number): number {
  const R = tool.diameterMm / 2
  const { nx, ny, cellX, cellY, data } = surface
  const i0 = Math.max(0, Math.ceil((x - R) / cellX)), i1 = Math.min(nx - 1, Math.floor((x + R) / cellX))
  const j0 = Math.max(0, Math.ceil((y - R) / cellY)), j1 = Math.min(ny - 1, Math.floor((y + R) / cellY))
  // suprafața de exact sub vârf (bilineară): un vârf ascuțit (V, conică) ar „cădea”
  // altfel între noduri, până la 1,7 × jumătate de celulă sub fundul real
  const fx = Math.max(0, Math.min(nx - 1, x / cellX)), fy = Math.max(0, Math.min(ny - 1, y / cellY))
  const ia = Math.min(nx - 2, Math.floor(fx)), ja = Math.min(ny - 2, Math.floor(fy))
  const tx = fx - ia, ty = fy - ja
  const s00 = data[ja * nx + ia], s10 = data[ja * nx + ia + 1], s01 = data[(ja + 1) * nx + ia], s11 = data[(ja + 1) * nx + ia + 1]
  let best = (s00 + (s10 - s00) * tx) * (1 - ty) + (s01 + (s11 - s01) * tx) * ty
  for (let j = j0; j <= j1; j++) {
    const dy = j * cellY - y
    for (let i = i0; i <= i1; i++) {
      const r = Math.hypot(i * cellX - x, dy)
      if (r > R) continue
      const v = data[j * nx + i] - toolProfile(tool, r)
      if (v > best) best = v
    }
  }
  return best
}

/**
 * Între două puncte vecine cu salt mare de înălțime (perete abrupt) înălțimea
 * compensată poate sări oriunde pe segment; linia dreaptă dintre ele ar tăia colțul.
 * Subîmpărțim cu drop-cutter exact până la 0.01 mm, doar acolo unde e abrupt.
 */
function refineLine(nodePts: number[], surface: Grid, tool: CamTool): number[] {
  const out: number[] = nodePts.slice(0, 3)
  const refine = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const len = Math.hypot(bx - ax, by - ay)
    if (Math.abs(bz - az) <= Math.max(0.05, 1.5 * len) || len < 0.01) return
    const mx = (ax + bx) / 2, my = (ay + by) / 2
    const mz = dropCutterAt(surface, tool, mx, my)
    refine(ax, ay, az, mx, my, mz)
    out.push(mx, my, mz)
    refine(mx, my, mz, bx, by, bz)
  }
  for (let k = 3; k < nodePts.length; k += 3) {
    refine(nodePts[k - 3], nodePts[k - 2], nodePts[k - 1], nodePts[k], nodePts[k + 1], nodePts[k + 2])
    out.push(nodePts[k], nodePts[k + 1], nodePts[k + 2])
  }
  return out
}

/** Simplificare Douglas-Peucker 3D a unei polilinii [x,y,z,...] */
export function simplifyPolyline(pts: number[], tol: number): number[] {
  const n = pts.length / 3
  if (n <= 2) return pts
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack: number[] = [0, n - 1]
  const tol2 = tol * tol
  while (stack.length) {
    const b = stack.pop()!
    const a = stack.pop()!
    const ax = pts[a * 3], ay = pts[a * 3 + 1], az = pts[a * 3 + 2]
    const dx = pts[b * 3] - ax, dy = pts[b * 3 + 1] - ay, dz = pts[b * 3 + 2] - az
    const len2 = dx * dx + dy * dy + dz * dz
    let maxD = -1
    let idx = -1
    for (let k = a + 1; k < b; k++) {
      const px = pts[k * 3] - ax, py = pts[k * 3 + 1] - ay, pz = pts[k * 3 + 2] - az
      let t = len2 > 0 ? (px * dx + py * dy + pz * dz) / len2 : 0
      t = Math.max(0, Math.min(1, t))
      const ex = px - t * dx, ey = py - t * dy, ez = pz - t * dz
      const d2 = ex * ex + ey * ey + ez * ez
      if (d2 > maxD) { maxD = d2; idx = k }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1
      stack.push(a, idx, idx, b)
    }
  }
  const out: number[] = []
  for (let k = 0; k < n; k++) if (keep[k]) out.push(pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2])
  return out
}

class MoveBuffer {
  private buf: number[] = []
  x = 0
  y = 0
  z = 0
  started = false

  push(type: number, x: number, y: number, z: number) {
    this.buf.push(type, x, y, z)
    this.x = x
    this.y = y
    this.z = z
    this.started = true
  }

  feedPolyline(pts: number[]) {
    for (let k = 0; k < pts.length; k += 3) this.push(MOVE_FEED, pts[k], pts[k + 1], pts[k + 2])
  }

  toArray(): Float64Array { return Float64Array.from(this.buf) }
}

/**
 * Indicii de rând ai grilei pe care merg trecerile. Trecerile stau EXACT pe noduri:
 * lângă pereți abrupți înălțimea compensată sare brusc, iar interpolarea între
 * noduri ar coborî freza în perete.
 */
function rowIndices(nodes: number, cell: number, step: number): number[] {
  const last = nodes - 1
  const n = Math.max(1, Math.ceil((last * cell) / step - 1e-9))
  const out: number[] = []
  for (let k = 0; k <= n; k++) {
    const idx = Math.min(last, Math.round((k * last) / n))
    if (out[out.length - 1] !== idx) out.push(idx)
  }
  return out
}

/** Linie de noduri ale grilei compensate, rafinată adaptiv lângă pereți */
function gridLine(comp: Grid, surface: Grid, tool: CamTool, alongX: boolean, row: number, from: number, to: number): number[] {
  const pts: number[] = []
  const dir = to >= from ? 1 : -1
  for (let a = from; dir > 0 ? a <= to : a >= to; a += dir) {
    const i = alongX ? a : row
    const j = alongX ? row : a
    pts.push(i * comp.cellX, j * comp.cellY, comp.data[j * comp.nx + i])
  }
  const refined = refineLine(pts, surface, tool)
  for (let k = 2; k < refined.length; k += 3) refined[k] = Math.min(0, refined[k])
  return refined
}

/** Finisare raster pe suprafața compensată (zig-zag continuu, cu legături care urmăresc suprafața) */
function finishingRaster(comp: Grid, surface: Grid, job: CamJob, alongX: boolean, tol: number): MoveBuffer {
  const tool = job.finishingTool
  const step = Math.max(0.02, (effectiveDiameter(tool) * tool.stepoverPercent) / 100)
  const last = (alongX ? comp.nx : comp.ny) - 1
  const rows = rowIndices(alongX ? comp.ny : comp.nx, alongX ? comp.cellY : comp.cellX, step)
  const mb = new MoveBuffer()
  let forward = true

  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri]
    const simple = simplifyPolyline(gridLine(comp, surface, tool, alongX, r, forward ? 0 : last, forward ? last : 0), tol)

    if (!mb.started) {
      mb.push(MOVE_RAPID, simple[0], simple[1], job.safeZMm)
      mb.push(MOVE_PLUNGE, simple[0], simple[1], simple[2])
      mb.feedPolyline(simple.slice(3))
    } else {
      // legătură între rânduri: urmărește suprafața pe direcția perpendiculară
      const link = gridLine(comp, surface, tool, !alongX, forward ? 0 : last, rows[ri - 1], r)
      mb.feedPolyline(link.slice(3, -3))
      mb.feedPolyline(simple)
    }
    forward = !forward
  }
  mb.push(MOVE_RAPID, mb.x, mb.y, job.safeZMm)
  return mb
}

/** Degroșare pe niveluri Z (waterline raster) cu freză dreaptă și adaos de material */
function roughingLevels(comp: Grid, surface: Grid, job: CamJob, offsetTool: CamTool, tol: number): MoveBuffer {
  const tool = job.roughingTool
  const step = Math.max(0.1, (tool.diameterMm * tool.stepoverPercent) / 100)
  const stepDown = Math.max(0.1, tool.stepDownMm)
  const allowance = Math.max(0, job.roughingAllowanceMm)

  let minT = Infinity
  for (let k = 0; k < comp.data.length; k++) minT = Math.min(minT, comp.data[k] + allowance)

  const mb = new MoveBuffer()
  // rândurile (rafinate) se calculează o singură dată și se refolosesc pe fiecare nivel
  const rows = rowIndices(comp.ny, comp.cellY, step).map(r => gridLine(comp, surface, offsetTool, true, r, 0, comp.nx - 1))
  let prevLevel = 0

  while (prevLevel > minT + 1e-4) {
    const level = Math.max(prevLevel - stepDown, minT)
    let forward = true
    for (const line of rows) {
      const n = line.length / 3
      const cut = new Uint8Array(n)
      for (let k = 0; k < n; k++) cut[k] = line[k * 3 + 2] + allowance < prevLevel - 1e-4 ? 1 : 0
      // segmente continue de material de îndepărtat
      const runs: Array<[number, number]> = []
      let s = -1
      for (let k = 0; k <= n; k++) {
        if (k < n && cut[k]) { if (s < 0) s = k }
        else if (s >= 0) { runs.push([s, k - 1]); s = -1 }
      }
      if (!forward) runs.reverse()
      for (const [a, b] of runs) {
        const pts: number[] = []
        const from = forward ? a : b
        const to = forward ? b : a
        const dir = forward ? 1 : -1
        for (let k = from; dir > 0 ? k <= to : k >= to; k += dir) {
          pts.push(line[k * 3], line[k * 3 + 1], Math.max(level, line[k * 3 + 2] + allowance))
        }
        const simple = simplifyPolyline(pts, tol)
        if (mb.started) mb.push(MOVE_RAPID, mb.x, mb.y, job.safeZMm)
        mb.push(MOVE_RAPID, simple[0], simple[1], job.safeZMm)
        mb.push(MOVE_RAPID, simple[0], simple[1], Math.min(job.safeZMm, prevLevel + 1))
        mb.push(MOVE_PLUNGE, simple[0], simple[1], simple[2])
        mb.feedPolyline(simple.slice(3))
      }
      forward = !forward
    }
    prevLevel = level
  }
  if (mb.started) mb.push(MOVE_RAPID, mb.x, mb.y, job.safeZMm)
  return mb
}

export function computeStats(moves: Float64Array, tool: CamTool, job: CamJob): ToolpathStats {
  let cut = 0, rapid = 0, plunge = 0, minZ = 0
  let px = 0, py = 0, pz = job.safeZMm
  for (let k = 0; k < moves.length; k += 4) {
    const t = moves[k], x = moves[k + 1], y = moves[k + 2], z = moves[k + 3]
    const d = Math.hypot(x - px, y - py, z - pz)
    if (t === MOVE_RAPID) rapid += d
    else if (t === MOVE_PLUNGE) plunge += d
    else cut += d
    if (z < minZ) minZ = z
    px = x; py = y; pz = z
  }
  // factor 1.15 pentru accelerații/decelerații pe segmente scurte
  const minutes =
    (cut / Math.max(1, tool.feedRateMmMin) +
      plunge / Math.max(1, tool.plungeRateMmMin) +
      rapid / Math.max(1, job.rapidRateMmMin)) * 1.15
  return {
    cutDistanceMm: cut + plunge,
    rapidDistanceMm: rapid,
    estimatedTimeMin: minutes,
    minZ,
    moveCount: moves.length / 4
  }
}

/** Simulare de îndepărtare a materialului: „ștampilează” scula de-a lungul traseelor */
export function simulateMaterialRemoval(toolpaths: Toolpath[], job: CamJob): SimulationResult {
  const target = Math.sqrt((job.widthMm * job.heightMm) / 1_200_000)
  const stock = makeGrid(job.widthMm, job.heightMm, Math.max(0.15, target))
  const { nx, ny, cellX, cellY, data } = stock
  data.fill(0)

  for (const tp of toolpaths) {
    const kernel = toolKernel(tp.tool, cellX, cellY)
    const stepLen = Math.min(cellX, cellY) * 0.6
    const m = tp.moves
    let px = m[1], py = m[2], pz = m[3]
    for (let k = 4; k < m.length; k += 4) {
      const t = m[k], x = m[k + 1], y = m[k + 2], z = m[k + 3]
      if (t !== MOVE_RAPID && Math.min(z, pz) < 0) {
        const n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / stepLen))
        for (let s = 1; s <= n; s++) {
          const f = s / n
          const cx = px + (x - px) * f, cy = py + (y - py) * f, cz = pz + (z - pz) * f
          const ci = Math.round(cx / cellX), cj = Math.round(cy / cellY)
          for (let q = 0; q < kernel.length; q++) {
            const ii = ci + kernel[q].di, jj = cj + kernel[q].dj
            if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue
            const idx = jj * nx + ii
            const v = cz + kernel[q].h
            if (v < data[idx]) data[idx] = v
          }
        }
      }
      px = x; py = y; pz = z
    }
  }

  const out = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const z = data[j * nx + i]
      out[(ny - 1 - j) * nx + i] = Math.max(0, Math.min(1, 1 + z / job.maxDepthMm))
    }
  }
  return { heightmap: out, width: nx, height: ny }
}

export interface CamInput {
  heightmap: Float32Array
  imgW: number
  imgH: number
  job: CamJob
}

export interface CamOutput {
  toolpaths: Toolpath[]
  simulation: SimulationResult | null
  warnings: string[]
}

export function roughingCell(tool: CamTool): number {
  return Math.max(0.15, tool.diameterMm / 12)
}

/** Grila de finisare nu e mai rară decât pixelul imaginii: eroarea laterală rămâne sub un pixel */
export function finishingCell(job: CamJob, imgW: number, imgH: number): number {
  const pixelMm = Math.min(job.widthMm / imgW, job.heightMm / imgH)
  // grila servește și finisării de rest: se potrivește frezei celei mai fine
  const tools = job.restEnabled && job.restTool ? [job.finishingTool, job.restTool] : [job.finishingTool]
  let cell = Math.min(0.25, pixelMm)
  for (const t of tools) {
    const tipLimit = t.shape === 'taperedball' ? effectiveDiameter(t) / 3 : Infinity
    cell = Math.min(cell, t.diameterMm / 16, tipLimit)
  }
  return Math.max(0.08, cell)
}

export function runCam(input: CamInput, onProgress: ProgressFn = () => {}): CamOutput {
  const { heightmap, imgW, imgH, job } = input
  const toolpaths: Toolpath[] = []
  const warnings: string[] = []

  // suprafața fină (rezoluția pixelului) se calculează o dată și servește ambelor trasee
  onProgress('Suprafață de referință', 0)
  const fineSurface = buildSurfaceGrid(heightmap, imgW, imgH, job, finishingCell(job, imgW, imgH))

  if (job.roughingEnabled) {
    const tool = job.roughingTool
    // grila rară e maximul grilei fine: crestele înguste nu se pierd între noduri
    const surface = maxPoolGrid(fineSurface, job.widthMm, job.heightMm, roughingCell(tool))
    const cell = Math.max(surface.cellX, surface.cellY)
    // adaosul se aplică 3D: freza „umflată” cu adaosul (și cu 1.5 celule de grilă, ca
    // pereții care cad între noduri, inclusiv pe diagonală, să fie acoperiți)
    const offsetTool: CamTool = { ...tool, diameterMm: tool.diameterMm + 2 * (job.roughingAllowanceMm + 1.5 * cell) }
    const comp = compensateForTool(surface, offsetTool, f => onProgress('Degroșare: compensare sculă', f))
    onProgress('Degroșare: trasee pe niveluri', 0)
    const moves = roughingLevels(comp, surface, job, offsetTool, 0.02).toArray()
    if (moves.length) toolpaths.push({ name: `Degroșare ${tool.name}`, tool, moves, stats: computeStats(moves, tool, job) })
    else warnings.push('Relieful e prea puțin adânc pentru degroșare — s-a generat doar finisarea.')
  }

  if (job.finishingEnabled) {
    const tool = job.finishingTool
    const surface = fineSurface
    const comp = compensateForTool(surface, tool, f => onProgress('Finisare: compensare sculă', f))
    const strategies = job.finishStrategy === 'cross' ? [true, false] : [job.finishStrategy === 'rasterX']
    strategies.forEach((alongX, idx) => {
      onProgress(`Finisare: raster ${alongX ? 'X' : 'Y'}`, idx / strategies.length)
      const moves = finishingRaster(comp, surface, job, alongX, 0.005).toArray()
      toolpaths.push({
        name: `Finisare ${alongX ? 'X' : 'Y'} ${tool.name}`,
        tool,
        moves,
        stats: computeStats(moves, tool, job)
      })
    })

    if (job.restEnabled && job.restTool) {
      const small = job.restTool
      if (effectiveDiameter(small) >= effectiveDiameter(tool) - 1e-6 && small.shape === tool.shape) {
        warnings.push('Finisarea de rest are nevoie de o freză mai fină decât cea de finisare — n-am generat-o.')
      } else {
        onProgress('Finisare de rest: unde n-a ajuns freza mare', 0)
        const { mb, areaFrac } = restMachining(surface, comp, job, small, Math.max(0.01, job.restThresholdMm ?? 0.1), 0.005)
        const moves = mb.toArray()
        if (moves.length) {
          toolpaths.push({ name: `Finisare de rest ${small.name} (${(areaFrac * 100).toFixed(1)}% din suprafață)`, tool: small, moves, stats: computeStats(moves, small, job) })
        } else {
          warnings.push('Freza de finisare ajunge peste tot — finisarea de rest nu e necesară.')
        }
      }
    }

    if (!job.roughingEnabled) {
      // la conică contează vârful subțire, nu tija
      const d = effectiveDiameter(tool)
      if (job.maxDepthMm / d > 1) {
        warnings.push(
          `Fără degroșare, freza (${tool.shape === 'taperedball' ? `vârf de ${d} mm` : `${d} mm`}) ar tăia până la ${job.maxDepthMm} mm adâncime dintr-o trecere — risc mare de rupere. Activați degroșarea.`
        )
      }
    }
  }

  if (job.cutout?.enabled) {
    onProgress('Decupare din placă', 0)
    toolpaths.push(cutoutToolpath(job, job.cutout))
    if (job.cutout.tabCount < 2) warnings.push('Decupare cu mai puțin de 2 punți: piesa se poate desprinde și smulge la final.')
  }

  if (job.safeZMm < 1) warnings.push('Z de siguranță sub 1 mm — risc de lovire a piesei la deplasări rapide.')

  onProgress('Simulare material', 0)
  const simulation = toolpaths.length ? simulateMaterialRemoval(toolpaths, job) : null
  onProgress('Gata', 1)
  return { toolpaths, simulation, warnings }
}
