/**
 * Simulator de mașină: execută programul în timp (după avansuri), scoate lemnul cu
 * forma reală a frezei și semnalează problemele cum le-ar vedea un operator:
 * deplasare rapidă prin lemn (coliziune), tăiere în masa mașinii, plonjeu prea adânc,
 * lucru în afara piesei.
 */
import type { CamJob, CamTool } from './types'
import { MOVE_PLUNGE, MOVE_RAPID } from './types'
import { toolProfile, effectiveDiameter } from './engine'
import { machineTransform } from './postProcessors'
import { parseGCode } from './gcodeParser'

export interface SimProgram {
  moves: Float64Array     // [tip, x, y, z] în coordonate interne (Y în sus, Z0 = fața lemnului)
  feeds: Float32Array     // mm/min; 0 = rapid
  lineOf: Int32Array      // indice în `lines`
  toolIdx: Uint16Array    // indice în `tools`
  tools: CamTool[]
  lines: string[]
  endTime: Float64Array   // secunda la care se termină fiecare mișcare
  files: Array<{ name: string; firstMove: number; firstLine: number }>
  job: CamJob
  unsupported: string[]
}

export type SimEventKind = 'collision' | 'spoilboard' | 'deepPlunge' | 'outside' | 'toolChange'

export interface SimEvent {
  kind: SimEventKind
  moveIndex: number
  line: number
  message: string
}

export interface ProgramFile { name: string; text: string }

/**
 * Programul de simulat se construiește DIN TEXTUL G-CODE (exact ce primește mașina).
 * `toolFor(tNumber, fileIndex)` alege freza: după numărul T sau după fișier.
 */
export function buildProgram(files: ProgramFile[], job: CamJob, toolFor: (t: number, fileIndex: number) => CamTool): SimProgram {
  const { ox, oy, oz } = machineTransform(job)
  const moves: number[] = []
  const feeds: number[] = []
  const lineOf: number[] = []
  const toolIdx: number[] = []
  const tools: CamTool[] = []
  const toolKey = new Map<string, number>()
  const lines: string[] = []
  const outFiles: SimProgram['files'] = []
  const unsupported = new Set<string>()

  files.forEach((f, fi) => {
    const p = parseGCode(f.text, { x: -ox, y: -oy, z: job.safeZMm + oz })
    p.unsupported.forEach(u => unsupported.add(u))
    outFiles.push({ name: f.name, firstMove: moves.length / 4, firstLine: lines.length })
    const lineBase = lines.length
    for (const l of p.lines) lines.push(l)
    for (let k = 0; k < p.moves.length / 4; k++) {
      const tool = toolFor(p.toolOf[k], fi)
      const key = `${fi}:${p.toolOf[k]}`
      let idx = toolKey.get(key)
      if (idx === undefined) { idx = tools.length; tools.push(tool); toolKey.set(key, idx) }
      moves.push(p.moves[k * 4], p.moves[k * 4 + 1] + ox, p.moves[k * 4 + 2] + oy, p.moves[k * 4 + 3] - oz)
      feeds.push(p.feeds[k])
      lineOf.push(lineBase + p.lineOf[k])
      toolIdx.push(idx)
    }
  })

  // timpul: avans pentru lucru, viteza de rapid a jobului pentru G0
  const n = moves.length / 4
  const endTime = new Float64Array(n)
  let t = 0
  let px = 0, py = 0, pz = job.safeZMm
  for (let k = 0; k < n; k++) {
    const x = moves[k * 4 + 1], y = moves[k * 4 + 2], z = moves[k * 4 + 3]
    const d = Math.hypot(x - px, y - py, z - pz)
    const rate = moves[k * 4] === MOVE_RAPID ? job.rapidRateMmMin : Math.max(1, feeds[k])
    t += (d / rate) * 60
    endTime[k] = t
    px = x; py = y; pz = z
  }

  return {
    moves: Float64Array.from(moves),
    feeds: Float32Array.from(feeds),
    lineOf: Int32Array.from(lineOf),
    toolIdx: Uint16Array.from(toolIdx),
    tools,
    lines,
    endTime,
    files: outFiles,
    job,
    unsupported: [...unsupported]
  }
}

interface Kernel { di: Int16Array; dj: Int16Array; h: Float32Array }

export class StockSimulator {
  readonly nx: number
  readonly ny: number
  readonly cellX: number
  readonly cellY: number
  readonly data: Float32Array
  readonly program: SimProgram
  events: SimEvent[] = []
  // indicele mișcării în curs și punctul până la care s-a „tăiat” deja
  private moveIdx = 0
  private stampedX = 0
  private stampedY = 0
  private stampedZ = 0
  private kernels = new Map<number, Kernel>()
  private lastTool = -1
  private reported = new Set<string>()
  private checkedMove = -1
  dirty = { i0: Infinity, i1: -Infinity, j0: Infinity, j1: -Infinity }

  constructor(program: SimProgram, maxCells = 220_000) {
    this.program = program
    const { widthMm: W, heightMm: H } = program.job
    const cell = Math.max(0.2, Math.sqrt((W * H) / maxCells))
    this.nx = Math.max(2, Math.round(W / cell) + 1)
    this.ny = Math.max(2, Math.round(H / cell) + 1)
    this.cellX = W / (this.nx - 1)
    this.cellY = H / (this.ny - 1)
    this.data = new Float32Array(this.nx * this.ny)
    this.reset()
  }

  reset() {
    this.data.fill(0)
    this.events = []
    this.reported.clear()
    this.moveIdx = 0
    this.checkedMove = -1
    this.lastTool = -1
    this.stampedX = 0
    this.stampedY = 0
    this.stampedZ = this.program.job.safeZMm
    this.markAllDirty()
  }

  markAllDirty() { this.dirty = { i0: 0, i1: this.nx - 1, j0: 0, j1: this.ny - 1 } }
  clearDirty() { this.dirty = { i0: Infinity, i1: -Infinity, j0: Infinity, j1: -Infinity } }

  get currentMove() { return this.moveIdx }
  get totalTime() { const e = this.program.endTime; return e.length ? e[e.length - 1] : 0 }

  private kernel(toolIndex: number): Kernel {
    let k = this.kernels.get(toolIndex)
    if (k) return k
    const tool = this.program.tools[toolIndex]
    const R = tool.diameterMm / 2
    const ri = Math.ceil(R / this.cellX), rj = Math.ceil(R / this.cellY)
    const di: number[] = [], dj: number[] = [], h: number[] = []
    for (let b = -rj; b <= rj; b++) for (let a = -ri; a <= ri; a++) {
      const r = Math.hypot(a * this.cellX, b * this.cellY)
      if (r <= R + 1e-9) { di.push(a); dj.push(b); h.push(toolProfile(tool, Math.min(r, R))) }
    }
    // o freză mai mică decât o celulă tot trebuie să lase urmă
    if (!di.length) { di.push(0); dj.push(0); h.push(0) }
    k = { di: Int16Array.from(di), dj: Int16Array.from(dj), h: Float32Array.from(h) }
    this.kernels.set(toolIndex, k)
    return k
  }

  heightAt(x: number, y: number): number {
    const i = Math.round(x / this.cellX), j = Math.round(y / this.cellY)
    if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return -Infinity
    return this.data[j * this.nx + i]
  }

  private event(kind: SimEventKind, moveIndex: number, message: string, onceKey: string = kind) {
    if (this.reported.has(onceKey) || this.events.length >= 200) return
    this.reported.add(onceKey)
    this.events.push({ kind, moveIndex, line: this.program.lineOf[moveIndex], message })
  }

  /**
   * Verificările de operator pentru o mișcare ÎNTREAGĂ, pe lemnul de dinaintea ei.
   * Se fac o singură dată, când freza intră în mișcare — altfel, la redare lentă,
   * bucata tăiată în cadrul anterior „curăță” deja lemnul din fața frezei și
   * coliziunea sau plonjeul adânc nu s-ar mai vedea.
   */
  private checkMove(moveIndex: number, x0: number, y0: number, z0: number) {
    const p = this.program
    const type = p.moves[moveIndex * 4]
    const x1 = p.moves[moveIndex * 4 + 1], y1 = p.moves[moveIndex * 4 + 2], z1 = p.moves[moveIndex * 4 + 3]
    const toolIndex = p.toolIdx[moveIndex]
    const tool = p.tools[toolIndex]
    const R = tool.diameterMm / 2
    const line = p.lineOf[moveIndex] + 1
    const { widthMm: W, heightMm: H, stockThicknessMm: T } = p.job
    const len = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.ceil(len / (Math.min(this.cellX, this.cellY) * 0.7)))

    if (type === MOVE_RAPID) {
      // centrul și 8 puncte pe marginea frezei: un G0 prin lemn atinge întâi cu marginea
      const ring = [[0, 0]]
      for (let a = 0; a < 8; a++) ring.push([Math.cos((a * Math.PI) / 4) * R * 0.9, Math.sin((a * Math.PI) / 4) * R * 0.9])
      outer: for (let s = 1; s <= n; s++) {
        const f = s / n
        const cx = x0 + (x1 - x0) * f, cy = y0 + (y1 - y0) * f, cz = z0 + (z1 - z0) * f
        for (const [dx, dy] of ring) {
          const top = this.heightAt(cx + dx, cy + dy)
          if (top > cz + 0.05) {
            this.event('collision', moveIndex, `COLIZIUNE la linia ${line}: deplasare rapidă (G0) prin lemn, la Z ${cz.toFixed(2)} sub suprafața de ${top.toFixed(2)} mm. Pe mașina reală freza se rupe sau piesa se smulge.`, `col${line}`)
            break outer
          }
        }
      }
      return
    }

    const zMin = Math.min(z0, z1)
    // decuparea intră intenționat ~0,3 mm în masa de sacrificiu; alarmăm doar peste 0,5 mm
    if (zMin < -T - 0.5) {
      this.event('spoilboard', moveIndex, `La linia ${line} freza coboară la Z ${zMin.toFixed(2)}, sub grosimea lemnului (${T} mm): taie în masa mașinii.`)
    }
    // în afara piesei: pe coordonate exacte (centrul poate depăși marginea cu o rază)
    const out = (x: number, y: number) => x < -R - 0.01 || y < -R - 0.01 || x > W + R + 0.01 || y > H + R + 0.01
    if (zMin < 0 && (out(x0, y0) || out(x1, y1))) {
      const [ox, oy] = out(x1, y1) ? [x1, y1] : [x0, y0]
      this.event('outside', moveIndex, `La linia ${line} freza taie în afara piesei (X ${ox.toFixed(1)}, Y ${oy.toFixed(1)}). Verificați originea X0Y0.`)
    }
    // plonjeu vertical adânc în material plin
    if (type === MOVE_PLUNGE && len < 1e-6) {
      const depthInMaterial = Math.min(0, this.heightAt(x1, y1)) - z1
      if (depthInMaterial > effectiveDiameter(tool) * 1.5 + 0.5) {
        this.event('deepPlunge', moveIndex, `La linia ${line} freza intră vertical ${depthInMaterial.toFixed(1)} mm în lemn plin (de peste 1,5× diametrul ei): risc de ardere sau rupere. Folosiți degroșarea pe niveluri.`, `plunge`)
      }
    }
  }

  /** Scoate materialul de-a lungul segmentului */
  private stampSegment(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, moveIndex: number) {
    const p = this.program
    const toolIndex = p.toolIdx[moveIndex]
    const kern = this.kernel(toolIndex)
    const len = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.ceil(len / (Math.min(this.cellX, this.cellY) * 0.7)))
    const { nx, ny, data } = this

    for (let s = 1; s <= n; s++) {
      const f = s / n
      const cx = x0 + (x1 - x0) * f, cy = y0 + (y1 - y0) * f, cz = z0 + (z1 - z0) * f
      if (cz >= 0.001) continue
      const ci = Math.round(cx / this.cellX), cj = Math.round(cy / this.cellY)

      for (let q = 0; q < kern.di.length; q++) {
        const ii = ci + kern.di[q], jj = cj + kern.dj[q]
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue
        const idx = jj * nx + ii
        const v = cz + kern.h[q]
        if (v < data[idx]) {
          data[idx] = v
          if (ii < this.dirty.i0) this.dirty.i0 = ii
          if (ii > this.dirty.i1) this.dirty.i1 = ii
          if (jj < this.dirty.j0) this.dirty.j0 = jj
          if (jj > this.dirty.j1) this.dirty.j1 = jj
        }
      }
    }
  }

  /** Avansează simularea până la mișcarea `target`, fracțiunea `frac` (0..1) din ea */
  advanceTo(target: number, frac: number) {
    const p = this.program
    const n = p.moves.length / 4
    target = Math.min(target, n - 1)
    while (this.moveIdx <= target) {
      const k = this.moveIdx
      const ti = p.toolIdx[k]
      if (ti !== this.lastTool) {
        if (this.lastTool >= 0) {
          this.events.push({ kind: 'toolChange', moveIndex: k, line: p.lineOf[k], message: `Schimbare sculă: ${p.tools[ti].name}` })
        }
        this.lastTool = ti
      }
      const ex = p.moves[k * 4 + 1], ey = p.moves[k * 4 + 2], ez = p.moves[k * 4 + 3]
      const f = k === target ? frac : 1
      const sx = this.stampedX, sy = this.stampedY, sz = this.stampedZ
      // capătul parțial al mișcării curente, pornind de la începutul ei real
      const start = k > 0 ? [p.moves[(k - 1) * 4 + 1], p.moves[(k - 1) * 4 + 2], p.moves[(k - 1) * 4 + 3]] : [sx, sy, sz]
      if (this.checkedMove !== k) {
        this.checkMove(k, start[0], start[1], start[2])
        this.checkedMove = k
      }
      const tx = start[0] + (ex - start[0]) * f
      const ty = start[1] + (ey - start[1]) * f
      const tz = start[2] + (ez - start[2]) * f
      this.stampSegment(sx, sy, sz, tx, ty, tz, k)
      this.stampedX = tx; this.stampedY = ty; this.stampedZ = tz
      if (f < 1) break
      this.moveIdx++
    }
  }

  /** Poziția sculei la secunda t (pentru animație) */
  positionAt(t: number): { move: number; frac: number; x: number; y: number; z: number } {
    const p = this.program
    const e = p.endTime
    const n = e.length
    if (!n) return { move: 0, frac: 0, x: 0, y: 0, z: p.job.safeZMm }
    let lo = 0, hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (e[mid] < t) lo = mid + 1
      else hi = mid
    }
    const t0 = lo > 0 ? e[lo - 1] : 0
    const frac = e[lo] > t0 ? Math.max(0, Math.min(1, (t - t0) / (e[lo] - t0))) : 1
    const sx = lo > 0 ? p.moves[(lo - 1) * 4 + 1] : 0
    const sy = lo > 0 ? p.moves[(lo - 1) * 4 + 2] : 0
    const sz = lo > 0 ? p.moves[(lo - 1) * 4 + 3] : p.job.safeZMm
    return {
      move: lo,
      frac,
      x: sx + (p.moves[lo * 4 + 1] - sx) * frac,
      y: sy + (p.moves[lo * 4 + 2] - sy) * frac,
      z: sz + (p.moves[lo * 4 + 3] - sz) * frac
    }
  }

  /** Rulează tot programul dintr-o dată (pentru verificarea completă înainte de pornire) */
  runAll() {
    const n = this.program.moves.length / 4
    if (n) this.advanceTo(n - 1, 1)
  }
}
