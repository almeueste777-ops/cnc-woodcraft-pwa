/**
 * Decupare pe contur cu punți (tabs): scoate piesa din placă, prin toată grosimea,
 * în treceri pe adâncime. Punțile rămân ca piesa (sau resturile) să nu se miște/smulgă.
 *
 * - „arcadă”: bolta reliefului (aceeași geometrie ca rama din imageProcessing) merge pe
 *   toată lățimea plăcii, deci se taie doar arcul, de la o margine la alta. Freza coboară
 *   în aer, în afara plăcii, nu în lemn plin.
 * - „rounded”: dreptunghi cu colțuri rotunde, în interiorul plăcii, contur închis.
 *
 * Sens: freza merge în sens ORAR în jurul piesei. Cu arborele rotind în sens orar (M3),
 * pe peretele piesei dinții taie împotriva avansului = frezare convențională, mai
 * blândă pe mașinile hobby (fără „smucituri” când jocul mecanic e mare).
 */
import type { CamJob, CamTool, Toolpath } from './types'
import { MOVE_FEED, MOVE_PLUNGE, MOVE_RAPID } from './types'
import { computeStats } from './engine'

export interface CutoutSettings {
  enabled: boolean
  shape: 'arch' | 'rounded'
  marginMm: number          // doar la „rounded”: cât de departe de marginea plăcii
  cornerRadiusMm: number    // doar la „rounded”
  tool: CamTool
  tabCount: number
  tabWidthMm: number
  tabHeightMm: number
}

/** Geometria bolții: semiaxe a (orizontal) și b (vertical), baza la 65% din înălțime */
export function archGeometry(job: CamJob) {
  const a = 0.5 * job.widthMm
  return { cx: job.widthMm / 2, yb: 0.65 * job.heightMm, a, b: 0.7 * a }
}

type Pt = [number, number]

/** Conturul piesei, sens trigonometric (exteriorul la dreapta direcției de mers) */
export function cutoutOutline(job: CamJob, c: CutoutSettings): { pts: Pt[]; closed: boolean } {
  const pts: Pt[] = []
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5))
    for (let k = 0; k < n; k++) pts.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n])
  }
  const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, inclusive = false) => {
    const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / 0.5))
    for (let k = 0; k < n + (inclusive ? 1 : 0); k++) {
      const a = a0 + ((a1 - a0) * k) / n
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
    }
  }
  if (c.shape === 'arch') {
    const { cx, yb, a, b } = archGeometry(job)
    arc(cx, yb, a, b, 0, Math.PI, true) // de la dreapta la stânga, pe deasupra
    return { pts, closed: false }
  }
  const W = job.widthMm, H = job.heightMm
  const m = Math.max(0, c.marginMm)
  const r = Math.max(0, Math.min(c.cornerRadiusMm, (W - 2 * m) / 2, (H - 2 * m) / 2))
  const L = m, R = W - m, B = m, T = H - m
  line(L + r, B, R - r, B)
  if (r > 0) arc(R - r, B + r, r, r, -Math.PI / 2, 0)
  line(R, B + r, R, T - r)
  if (r > 0) arc(R - r, T - r, r, r, 0, Math.PI / 2)
  line(R - r, T, L + r, T)
  if (r > 0) arc(L + r, T - r, r, r, Math.PI / 2, Math.PI)
  line(L, T - r, L, B + r)
  if (r > 0) arc(L + r, B + r, r, r, Math.PI, Math.PI * 1.5)
  return { pts, closed: true }
}

/**
 * Decalaj exterior cu raza R pentru un contur convex: fiecare latură se mută pe normala ei,
 * iar la colțuri centrul frezei ocolește vârful pe un arc de rază R (nu taie colțul).
 */
export function offsetOutline(pts: Pt[], closed: boolean, R: number): Pt[] {
  const n = pts.length
  const normalOf = (a: Pt, b: Pt): Pt => {
    const tx = b[0] - a[0], ty = b[1] - a[1]
    const len = Math.hypot(tx, ty) || 1
    return [ty / len, -tx / len] // dreapta direcției = exterior, la contur trigonometric
  }
  const out: Pt[] = []
  for (let k = 0; k < n; k++) {
    const hasIn = closed || k > 0
    const hasOut = closed || k < n - 1
    const nIn = hasIn ? normalOf(pts[(k - 1 + n) % n], pts[k]) : null
    const nOut = hasOut ? normalOf(pts[k], pts[(k + 1) % n]) : null
    const a0 = Math.atan2((nIn ?? nOut)![1], (nIn ?? nOut)![0])
    let a1 = Math.atan2((nOut ?? nIn)![1], (nOut ?? nIn)![0])
    // la un contur convex trigonometric normala se rotește în sens trigonometric
    while (a1 < a0 - 1e-9) a1 += Math.PI * 2
    if (a1 - a0 > Math.PI) a1 -= Math.PI * 2
    const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 18)))
    for (let s = 0; s <= steps; s++) {
      if (s > 0 && Math.abs(a1 - a0) < 1e-6) break
      const a = a0 + ((a1 - a0) * s) / steps
      out.push([pts[k][0] + R * Math.cos(a), pts[k][1] + R * Math.sin(a)])
    }
  }
  return out
}

export function cutoutToolpath(job: CamJob, c: CutoutSettings): Toolpath {
  const tool = c.tool
  const R = tool.diameterMm / 2
  const { pts, closed } = cutoutOutline(job, c)

  // centrul frezei în AFARA conturului, apoi sens orar = frezare convențională
  const path = offsetOutline(pts, closed, R).reverse()
  if (closed) path.push(path[0])

  // lungimea cumulată, pentru poziția punților
  const sAt: number[] = [0]
  for (let k = 1; k < path.length; k++) sAt.push(sAt[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]))
  const total = sAt[sAt.length - 1]
  const count = Math.max(0, Math.round(c.tabCount))
  const tabs = Array.from({ length: count }, (_, i) => ((i + 0.5) * total) / Math.max(1, count))
  const tabHalf = c.tabWidthMm / 2 + R // lățimea reală de lemn rămas + raza frezei
  const inTab = (s: number) => tabs.some(t => Math.abs(s - t) < tabHalf)

  const floor = -(job.stockThicknessMm + 0.3) // 0.3 mm în masa de sacrificiu: tăietură completă
  const tabTop = -(job.stockThicknessMm - Math.max(0, c.tabHeightMm))
  const stepDown = Math.max(0.2, tool.stepDownMm)
  const levels: number[] = []
  for (let z = -stepDown; z > floor; z -= stepDown) levels.push(z)
  levels.push(floor)

  const moves: number[] = []
  const start = path[0]
  moves.push(MOVE_RAPID, start[0], start[1], job.safeZMm)
  for (const level of levels) {
    const zAt = (s: number) => (inTab(s) && level < tabTop ? tabTop : level)
    if (!closed) {
      // contur deschis (arcadă): fiecare trecere pornește din același capăt, din aer
      moves.push(MOVE_RAPID, start[0], start[1], job.safeZMm)
    }
    moves.push(MOVE_RAPID, start[0], start[1], closed ? Math.min(job.safeZMm, level + stepDown + 1) : 1)
    moves.push(MOVE_PLUNGE, start[0], start[1], zAt(0))
    for (let k = 1; k < path.length; k++) {
      // la punți: urcarea se face ÎNAINTE de punte, coborârea DUPĂ ea, pe verticală
      const zPrev = zAt(sAt[k - 1]), z = zAt(sAt[k])
      if (z > zPrev) {
        moves.push(MOVE_FEED, path[k - 1][0], path[k - 1][1], z)
        moves.push(MOVE_FEED, path[k][0], path[k][1], z)
      } else if (z < zPrev) {
        moves.push(MOVE_FEED, path[k][0], path[k][1], zPrev)
        moves.push(MOVE_PLUNGE, path[k][0], path[k][1], z)
      } else {
        moves.push(MOVE_FEED, path[k][0], path[k][1], z)
      }
    }
    if (!closed) moves.push(MOVE_RAPID, path[path.length - 1][0], path[path.length - 1][1], job.safeZMm)
  }
  const last = path[path.length - 1]
  moves.push(MOVE_RAPID, last[0], last[1], job.safeZMm)

  const arr = Float64Array.from(moves)
  return {
    name: `Decupare ${c.shape === 'arch' ? 'arcadă' : 'contur'} ${tool.name} (${count} punți)`,
    tool,
    moves: arr,
    stats: computeStats(arr, tool, job)
  }
}
