/**
 * Împărțire pe plăci (tiling): o piesă mai mare decât cursa mașinii se lucrează pe
 * bucăți. Fiecare bucată are originea în colțul ei din stânga-jos; între bucăți placa
 * se mută (sau freza se re-zerează pe colțul bucății următoare, marcat pe lemn).
 * Traseele se taie la marginea bucății: la ieșire freza urcă la Z siguranță, la
 * intrare coboară din nou pe verticală.
 */
import type { CamJob, Toolpath } from './types'
import { MOVE_PLUNGE, MOVE_RAPID } from './types'
import { computeStats } from './engine'

export interface Tile {
  index: number
  col: number
  row: number
  x0: number
  y0: number
  widthMm: number
  heightMm: number
  job: CamJob
  toolpaths: Toolpath[]
}

export function tileCount(job: CamJob, bedX: number, bedY: number): { cols: number; rows: number } {
  if (!(bedX > 0) || !(bedY > 0)) return { cols: 1, rows: 1 }
  return { cols: Math.max(1, Math.ceil(job.widthMm / bedX - 1e-9)), rows: Math.max(1, Math.ceil(job.heightMm / bedY - 1e-9)) }
}

function clipToolpath(tp: Toolpath, job: CamJob, x0: number, y0: number, x1: number, y1: number): Toolpath {
  const m = tp.moves
  const out: number[] = []
  const safe = job.safeZMm
  const inside = (x: number, y: number) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && y >= y0 - 1e-6 && y <= y1 + 1e-6
  let px = m[1], py = m[2], pz = safe
  // „down” = freza e într-o poziție continuă cu traseul original, în interiorul bucății;
  // altfel e sus, la Z siguranță, într-un punct oarecare
  let down = false
  let cx = px, cy = py, cz = safe

  const emit = (t: number, x: number, y: number, z: number) => { out.push(t, x - x0, y - y0, z); cx = x; cy = y; cz = z }
  const liftUp = () => { if (out.length && cz < safe) emit(MOVE_RAPID, cx, cy, safe); down = false }

  for (let k = 0; k < m.length; k += 4) {
    const t = m[k], x = m[k + 1], y = m[k + 2], z = m[k + 3]
    if (t === MOVE_RAPID) {
      // generatoarele fac rapiduri doar la Z siguranță sau vertical în jos, deasupra
      // lemnului deja tăiat; le imităm doar în interiorul bucății
      if (!inside(x, y)) { if (down) liftUp() }
      else if (down) emit(MOVE_RAPID, x, y, z)
      else {
        if (out.length && cz < safe) emit(MOVE_RAPID, cx, cy, safe)
        emit(MOVE_RAPID, x, y, safe)
        if (z < safe) emit(MOVE_RAPID, x, y, z)
        down = true
      }
      px = x; py = y; pz = z
      continue
    }
    // segment de tăiere: îl tăiem cu dreptunghiul bucății (Liang–Barsky)
    const dx = x - px, dy = y - py
    let ta = 0, tb = 1
    const clip = (p: number, q: number) => {
      if (Math.abs(p) < 1e-12) return q >= -1e-9
      const r = q / p
      if (p < 0) { if (r > tb) return false; if (r > ta) ta = r }
      else { if (r < ta) return false; if (r < tb) tb = r }
      return true
    }
    const visible = clip(-dx, px - x0) && clip(dx, x1 - px) && clip(-dy, py - y0) && clip(dy, y1 - py)
    if (visible && tb >= ta) {
      const ax = px + dx * ta, ay = py + dy * ta, az = pz + (z - pz) * ta
      const bx = px + dx * tb, by = py + dy * tb, bz = pz + (z - pz) * tb
      if (!down || ta > 0) {
        // intrare în bucată: de sus, apoi coborâre verticală la punctul de intrare
        liftUp()
        emit(MOVE_RAPID, ax, ay, safe)
        emit(MOVE_PLUNGE, ax, ay, az)
        down = true
      }
      emit(t, bx, by, bz)
      if (tb < 1) liftUp() // iese din bucată
    } else if (down) {
      liftUp()
    }
    px = x; py = y; pz = z
  }
  if (out.length && cz < safe) emit(MOVE_RAPID, cx, cy, safe)
  const moves = Float64Array.from(out)
  return { ...tp, moves, stats: computeStats(moves, tp.tool, job) }
}

export function splitIntoTiles(toolpaths: Toolpath[], job: CamJob, bedX: number, bedY: number): Tile[] {
  const { cols, rows } = tileCount(job, bedX, bedY)
  const tw = job.widthMm / cols, th = job.heightMm / rows
  const tiles: Tile[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * tw, y0 = r * th
      // originea fiecărei bucăți e colțul ei din stânga-jos
      const tileJob: CamJob = { ...job, widthMm: tw, heightMm: th, xyOrigin: 'bottomLeft' }
      tiles.push({
        index: tiles.length + 1, col: c + 1, row: r + 1, x0, y0, widthMm: tw, heightMm: th, job: tileJob,
        toolpaths: toolpaths.map(tp => clipToolpath(tp, tileJob, x0, y0, x0 + tw, y0 + th)).filter(tp => tp.moves.length > 0)
      })
    }
  }
  return tiles
}
