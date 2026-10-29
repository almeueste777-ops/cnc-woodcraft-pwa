/**
 * Cititor de G-code pentru simulator: transformă orice fișier (al nostru sau adus din
 * altă parte — Aspire, ArtCAM, Carveco, Fusion) în mișcări liniare cu avans și sculă.
 * Suportă G0/G1/G2/G3 (arcele se împart în segmente), G90/G91, G20/G21, F, T/M6,
 * comentarii „;” și „( )”, numere de linie N.
 */
import { MOVE_FEED, MOVE_PLUNGE, MOVE_RAPID } from './types'

export interface ParsedGCode {
  moves: Float64Array     // [tip, x, y, z] în coordonatele MAȘINII (mm)
  feeds: Float32Array     // avansul fiecărei mișcări (mm/min); 0 = rapid
  lineOf: Int32Array      // linia din fișier (0-based) pentru fiecare mișcare
  toolOf: Uint16Array     // numărul sculei active (T) la fiecare mișcare
  lines: string[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
  unsupported: string[]   // comenzi ignorate (doar informativ)
  toolNumbers: number[]
}

const WORD = /([A-Z])\s*([-+]?\d*\.?\d+)/g

export function parseGCode(text: string, startPos = { x: 0, y: 0, z: 0 }): ParsedGCode {
  const lines = text.split(/\r?\n/)
  const moves: number[] = []
  const feeds: number[] = []
  const lineOf: number[] = []
  const toolOf: number[] = []
  const unsupported = new Set<string>()
  const toolNumbers = new Set<number>()

  let x = startPos.x, y = startPos.y, z = startPos.z
  let absolute = true
  let unit = 1 // 25.4 pentru inch
  let motion = 0 // 0,1,2,3
  let feed = 1000
  let tool = 0
  let pendingTool = 0
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }

  const push = (type: number, nx: number, ny: number, nz: number, li: number) => {
    moves.push(type, nx, ny, nz)
    feeds.push(type === MOVE_RAPID ? 0 : feed)
    lineOf.push(li)
    toolOf.push(tool)
    if (nx < b.minX) b.minX = nx; if (nx > b.maxX) b.maxX = nx
    if (ny < b.minY) b.minY = ny; if (ny > b.maxY) b.maxY = ny
    if (nz < b.minZ) b.minZ = nz; if (nz > b.maxZ) b.maxZ = nz
  }

  for (let li = 0; li < lines.length; li++) {
    const code = lines[li].replace(/\([^)]*\)/g, '').replace(/;.*$/, '').toUpperCase().trim()
    if (!code || code === '%' || /^O\d+/.test(code)) continue
    if (code.startsWith('$')) continue // comenzi GRBL de sistem

    const words: Array<[string, number]> = []
    WORD.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WORD.exec(code))) words.push([m[1], Number(m[2])])

    let nx: number | undefined, ny: number | undefined, nz: number | undefined
    let ci: number | undefined, cj: number | undefined, cr: number | undefined
    let hasMotionWord = false
    let skipMove = false

    for (const [letter, val] of words) {
      switch (letter) {
        case 'G': {
          const g = Math.round(val * 10) / 10
          if (g === 0 || g === 1 || g === 2 || g === 3) { motion = g; hasMotionWord = true }
          else if (g === 90) absolute = true
          else if (g === 91) absolute = false
          else if (g === 20) unit = 25.4
          else if (g === 21) unit = 1
          else if (g === 53 || g === 28 || g === 30 || g === 92 || g === 10) { skipMove = true; unsupported.add(`G${g}`) }
          else if (![4, 17, 94, 54, 40, 49, 43, 80, 61, 64].includes(g)) unsupported.add(`G${g}`)
          break
        }
        case 'X': nx = val * unit; break
        case 'Y': ny = val * unit; break
        case 'Z': nz = val * unit; break
        case 'I': ci = val * unit; break
        case 'J': cj = val * unit; break
        case 'R': cr = val * unit; break
        case 'F': feed = val * unit; break
        case 'T': pendingTool = Math.round(val); toolNumbers.add(pendingTool); break
        case 'M':
          if (Math.round(val) === 6) tool = pendingTool
          break
      }
    }
    // fără M6 (GRBL, fișiere pe sculă): T-ul singur devine scula activă
    if (pendingTool && !tool) tool = pendingTool
    if (skipMove) {
      // G53/G28/G30 cu Z: aproape mereu „ridică freza sus” în coordonate mașină, pe care
      // nu le cunoaștem; o considerăm ridicată la înălțimea de start (sigură)
      if (nz !== undefined && !/G\s*0*(10|92)\b/.test(code)) {
        z = Math.max(z, startPos.z)
        push(MOVE_RAPID, x, y, z, li)
      }
      continue
    }
    if (nx === undefined && ny === undefined && nz === undefined) continue
    if (!hasMotionWord && words.some(w => w[0] === 'G' && w[1] === 4)) continue

    const tx = nx === undefined ? x : absolute ? nx : x + nx
    const ty = ny === undefined ? y : absolute ? ny : y + ny
    const tz = nz === undefined ? z : absolute ? nz : z + nz

    if (motion === 0) {
      push(MOVE_RAPID, tx, ty, tz, li)
    } else if (motion === 1) {
      const vertical = tx === x && ty === y && tz < z
      push(vertical ? MOVE_PLUNGE : MOVE_FEED, tx, ty, tz, li)
    } else {
      // arc G2 (orar) / G3 (antiorar) în planul XY, cu centru I/J sau rază R
      const cw = motion === 2
      let cx: number, cy: number
      if (cr !== undefined) {
        const dx = tx - x, dy = ty - y
        const d = Math.hypot(dx, dy)
        const h = Math.sqrt(Math.max(0, cr * cr - (d * d) / 4))
        const sgn = (cw ? 1 : -1) * (cr < 0 ? -1 : 1)
        cx = x + dx / 2 + (sgn * h * dy) / Math.max(d, 1e-9)
        cy = y + dy / 2 - (sgn * h * dx) / Math.max(d, 1e-9)
      } else {
        cx = x + (ci ?? 0)
        cy = y + (cj ?? 0)
      }
      const r = Math.hypot(x - cx, y - cy)
      let a0 = Math.atan2(y - cy, x - cx)
      let a1 = Math.atan2(ty - cy, tx - cx)
      if (cw) { if (a1 >= a0) a1 -= Math.PI * 2 } else if (a1 <= a0) a1 += Math.PI * 2
      if (Math.abs(tx - x) < 1e-9 && Math.abs(ty - y) < 1e-9) a1 = a0 + (cw ? -1 : 1) * Math.PI * 2 // cerc complet
      const segs = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / 0.5))
      for (let s = 1; s <= segs; s++) {
        const f = s / segs
        const a = a0 + (a1 - a0) * f
        push(MOVE_FEED, cx + r * Math.cos(a), cy + r * Math.sin(a), z + (tz - z) * f, li)
      }
    }
    x = tx; y = ty; z = tz
  }

  if (!moves.length) Object.assign(b, { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 })
  return {
    moves: Float64Array.from(moves),
    feeds: Float32Array.from(feeds),
    lineOf: Int32Array.from(lineOf),
    toolOf: Uint16Array.from(toolOf),
    lines,
    bounds: b,
    unsupported: [...unsupported],
    toolNumbers: [...toolNumbers]
  }
}
