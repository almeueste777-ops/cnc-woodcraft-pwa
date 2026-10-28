import type { VectorContour } from '../utils/vectorizer'
import type { CamJob, CamTool, Toolpath } from './types'
import { MOVE_FEED, MOVE_PLUNGE, MOVE_RAPID } from './types'
import { computeStats } from './engine'

/**
 * Gravură pe contur (V-carve simplu / urmărire linie) cu mai multe treceri pe adâncime.
 * Vectorizatorul dă Y în jos (ca în imagine); mașina are Y în sus, deci întoarcem Y,
 * altfel gravura iese răsturnată.
 */
export function vectorEngraveToolpath(
  rawContours: VectorContour[],
  tool: CamTool,
  job: CamJob,
  depthMm: number
): Toolpath {
  const contours = rawContours.map(c => ({ ...c, points: c.points.map(p => ({ x: p.x, y: job.heightMm - p.y })) }))
  const buf: number[] = []
  const passDepth = Math.max(0.1, tool.stepDownMm)
  const total = Math.abs(depthMm)
  const passes = Math.max(1, Math.ceil(total / passDepth - 1e-9))

  // ordonare „cel mai apropiat următor”, ca să nu traverseze piesa degeaba
  const remaining = contours.filter(c => c.points.length >= 2)
  const ordered: VectorContour[] = []
  let cx = 0, cy = 0
  while (remaining.length) {
    let best = 0, bestD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i].points[0]
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2
      if (d < bestD) { bestD = d; best = i }
    }
    const c = remaining.splice(best, 1)[0]
    ordered.push(c)
    const last = c.isClosed ? c.points[0] : c.points[c.points.length - 1]
    cx = last.x; cy = last.y
  }

  for (const c of ordered) {
    const p0 = c.points[0]
    buf.push(MOVE_RAPID, p0.x, p0.y, job.safeZMm)
    for (let pass = 1; pass <= passes; pass++) {
      const z = -Math.min(total, pass * passDepth)
      buf.push(MOVE_PLUNGE, p0.x, p0.y, z)
      for (let i = 1; i < c.points.length; i++) buf.push(MOVE_FEED, c.points[i].x, c.points[i].y, z)
      if (c.isClosed) buf.push(MOVE_FEED, p0.x, p0.y, z)
      else if (pass < passes) {
        // contur deschis: ridicare și revenire la început pentru trecerea următoare
        const last = c.points[c.points.length - 1]
        buf.push(MOVE_RAPID, last.x, last.y, 1)
        buf.push(MOVE_RAPID, p0.x, p0.y, 1)
      }
    }
    const end = c.isClosed ? p0 : c.points[c.points.length - 1]
    buf.push(MOVE_RAPID, end.x, end.y, job.safeZMm)
  }

  const moves = Float64Array.from(buf)
  return {
    name: `Gravură contur ${tool.name} (${passes} treceri)`,
    tool,
    moves,
    stats: computeStats(moves, tool, job)
  }
}
