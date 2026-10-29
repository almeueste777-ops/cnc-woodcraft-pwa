/**
 * Împărțire pe bucăți (tiling): o piesă mai mare decât cursa mașinii se lucrează pe
 * bucăți. Fiecare bucată are originea în colțul ei din stânga-jos. Două feluri:
 *  - moveBoard: o singură placă mare, mutată sub mașină (sau freza re-zerată pe colțul
 *    bucății următoare, marcat pe lemn). Traseele se taie exact la marginea bucății:
 *    fâșia de lângă margine o termină bucata vecină.
 *  - separateBoards: plăci separate, sculptate pe rând și lipite la sfârșit. Aici nu
 *    există bucată vecină pe aceeași placă, deci la marginile interioare freza trece
 *    cu centrul încă o rază dincolo de margine (prin aer), ca relieful să fie complet
 *    până în muchie și să se continue fără treaptă la îmbinare.
 * La ieșirea din bucată freza urcă la Z siguranță, la intrare coboară pe verticală.
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

/** Raza celei mai mari freze din lucrare (la plăci separate freza iese atât peste muchie) */
export function maxToolRadius(job: CamJob): number {
  const r = [job.finishingEnabled ? job.finishingTool.diameterMm : 0, job.roughingEnabled ? job.roughingTool.diameterMm : 0, job.cutout?.enabled ? job.cutout.tool.diameterMm : 0]
  return Math.max(0, ...r) / 2
}

export function tileCount(job: CamJob, bedX: number, bedY: number): { cols: number; rows: number } {
  // la plăci separate, o bucată din mijloc are nevoie de lățimea ei + câte o rază de freză pe
  // fiecare parte (freza trece peste muchie): altfel ar ieși din cursa mașinii
  const extra = job.tileMode === 'separateBoards' ? 2 * maxToolRadius(job) : 0
  const need = (size: number, bed: number) => {
    if (!(bed > 0)) return 1
    if (size <= bed + 1e-9) return 1
    return Math.ceil(size / Math.max(1, bed - extra) - 1e-9)
  }
  // cerut de mână: doar mai multe bucăți decât e nevoie, niciodată mai puține (n-ar încăpea)
  const want = (n: number | undefined) => (n && n > 0 ? Math.min(20, Math.floor(n)) : 0)
  return {
    cols: Math.max(1, need(job.widthMm, bedX), want(job.tileCols)),
    rows: Math.max(1, need(job.heightMm, bedY), want(job.tileRows))
  }
}

/** Cel mai mic număr de bucăți care încap pe mașină (cursa 0 = nelimitat) */
export function autoTileCount(job: CamJob): { cols: number; rows: number } {
  return tileCount({ ...job, tileCols: 0, tileRows: 0 }, job.bedXMm ?? 0, job.bedYMm ?? 0)
}

// x0..x1, y0..y1 = bucata; cx0..cy1 = dreptunghiul în care are voie centrul frezei
function clipToolpath(tp: Toolpath, job: CamJob, x0: number, y0: number, cx0: number, cy0: number, cx1: number, cy1: number): Toolpath {
  const m = tp.moves
  const out: number[] = []
  const safe = job.safeZMm
  const inside = (x: number, y: number) => x >= cx0 - 1e-6 && x <= cx1 + 1e-6 && y >= cy0 - 1e-6 && y <= cy1 + 1e-6
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
    const visible = clip(-dx, px - cx0) && clip(dx, cx1 - px) && clip(-dy, py - cy0) && clip(dy, cy1 - py)
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
  const separate = job.tileMode === 'separateBoards'
  const tiles: Tile[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * tw, y0 = r * th
      // originea fiecărei bucăți e colțul ei din stânga-jos
      const tileJob: CamJob = { ...job, widthMm: tw, heightMm: th, xyOrigin: 'bottomLeft' }
      const clipped = toolpaths.map(tp => {
        // plăci separate: la marginile interioare centrul frezei trece o rază dincolo de muchie
        const R = separate ? tp.tool.diameterMm / 2 : 0
        return clipToolpath(tp, tileJob, x0, y0,
          c > 0 ? x0 - R : x0, r > 0 ? y0 - R : y0,
          c < cols - 1 ? x0 + tw + R : x0 + tw, r < rows - 1 ? y0 + th + R : y0 + th)
      })
      tiles.push({
        index: tiles.length + 1, col: c + 1, row: r + 1, x0, y0, widthMm: tw, heightMm: th, job: tileJob,
        toolpaths: clipped.filter(tp => tp.moves.length > 0)
      })
    }
  }
  return tiles
}
