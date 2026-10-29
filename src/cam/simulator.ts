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
    this.tipTrack = new Float32Array(this.nx * this.ny)
    this.reset()
  }

  // cel mai jos Z la care a trecut VÂRFUL unei freze prin dreptul fiecărui nod (± ½ diagonală):
  // un șanț în V mai îngust decât o celulă nu coboară nodurile, dar vârful a trecut pe acolo
  private readonly tipTrack: Float32Array

  reset() {
    this.data.fill(0)
    this.tipTrack.fill(Infinity)
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
   * Pasul ștampilelor de-a lungul traseului. La freza dreaptă contează doar cât de drept e peretele
   * (0,7 celule ajung). La frezele sferice, V și conice adâncimea depinde de distanța la centru,
   * iar jumătatea de pas devine rezervă la verificarea coliziunilor: pasul rămâne sub 0,25 mm,
   * altfel pe piese mari (celule mari) un G0 adânc printr-un V-bit ar trece nevăzut.
   */
  private stampStep(tool: CamTool): number {
    const c = 0.7 * Math.min(this.cellX, this.cellY)
    return tool.shape === 'endmill' ? c : Math.min(c, 0.25)
  }

  // profilul frezei după r² (tabel): toolProfile cu tan/cos la fiecare celulă ar tripla timpul
  private profiles = new Map<CamTool, Float32Array>()
  private static readonly PROFILE_STEPS = 4096
  private profileTable(tool: CamTool): Float32Array {
    let t = this.profiles.get(tool)
    if (!t) {
      const R = tool.diameterMm / 2, N = StockSimulator.PROFILE_STEPS
      t = new Float32Array(N + 2)
      for (let k = 0; k <= N + 1; k++) t[k] = toolProfile(tool, Math.min(R, Math.sqrt((Math.min(k, N) / N) * R * R)))
      this.profiles.set(tool, t)
    }
    return t
  }
  // raza urmei vârfului: ½ diagonală de celulă + ½ din cel mai lung pas de ștampilare
  private tipRadius() { return 0.5 * Math.hypot(this.cellX, this.cellY) + 0.35 * Math.min(this.cellX, this.cellY) }
  private profileAt(tool: CamTool, table: Float32Array, r2: number): number {
    const R2 = (tool.diameterMm / 2) ** 2
    if (R2 <= 0) return 0
    const f = Math.max(0, Math.min(1, r2 / R2)) * StockSimulator.PROFILE_STEPS
    const k = Math.floor(f)
    return table[k] + (table[k + 1] - table[k]) * (f - k)
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
      // Toate celulele de sub freză, cu forma ei (sferică, V), nu doar câteva puncte pe margine.
      // Tăieturile anterioare sunt „ștampilate” din poziția exactă a frezei, cu pasul stampStep:
      // cea mai apropiată ștampilă poate fi la o jumătate de pas de-a lungul traseului, deci o
      // celulă la distanța r e sigur tăiată doar până la adâncimea frezei la √(r² + ½pas²).
      // Fără această rezervă ar ieși coliziuni false care apar/dispar după densitatea rețelei
      // (verificat exact pe G-code real: 0 mm lemn atins).
      if (Math.min(z0, z1) >= 0) return
      const half = this.stampStep(tool) / 2
      const table = this.profileTable(tool)
      const R2 = R * R
      const tol = 0.05
      const slope = len > 1e-9 ? Math.abs(z1 - z0) / len : 0
      const reachTip = this.tipRadius()
      const hit = (top: number, cz: number) => {
        this.event('collision', moveIndex, `COLIZIUNE la linia ${line}: deplasare rapidă (G0) prin lemn, la Z ${cz.toFixed(2)} sub suprafața de ${top.toFixed(2)} mm. Pe mașina reală freza se rupe sau piesa se smulge.`, `col${line}`)
      }
      for (let s = 0; s <= n; s++) {
        const f = s / n
        const cx = x0 + (x1 - x0) * f, cy = y0 + (y1 - y0) * f, cz = z0 + (z1 - z0) * f
        if (cz >= 0) continue
        let checked = false
        const i0 = Math.max(0, Math.ceil((cx - R) / this.cellX)), i1 = Math.min(this.nx - 1, Math.floor((cx + R) / this.cellX))
        const j0 = Math.max(0, Math.ceil((cy - R) / this.cellY)), j1 = Math.min(this.ny - 1, Math.floor((cy + R) / this.cellY))
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const dx = i * this.cellX - cx, dy = j * this.cellY - cy
          // aici trebuia să fi trecut deja o ștampilă (altfel celula e la marginea tăieturii)
          const re2 = dx * dx + dy * dy + half * half
          if (re2 > R2) continue
          checked = true
          const top = this.data[j * this.nx + i]
          if (top > cz + this.profileAt(tool, table, re2) + tol) { hit(top, cz); return }
        }
        // vârful frezei: în nodul cel mai apropiat e lemn mai sus decât vârful și nicio freză
        // nu a trecut cu vârful pe acolo la adâncimea asta → vârful e în lemn. Prinde frezele
        // ascuțite sau mai mici decât celula, pe care cercul de mai sus nu le „vede”.
        const i = Math.round(cx / this.cellX), j = Math.round(cy / this.cellY)
        if (i >= 0 && j >= 0 && i < this.nx && j < this.ny) {
          const k = j * this.nx + i
          const top = this.data[k]
          if (!checked) {
            const dx = i * this.cellX - cx, dy = j * this.cellY - cy
            const re2 = Math.min(R2, dx * dx + dy * dy + half * half)
            if (top > cz + this.profileAt(tool, table, re2) + tol) { hit(top, cz); return }
          }
          // vârful anterior a trecut la cel mult ½ diagonală + ½ pas de aici: pe o pantă, Z-ul lui
          // diferă cu panta × distanța asta
          if (top > cz + tol && this.tipTrack[k] > cz + tol + slope * reachTip) { hit(top, cz); return }
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
    const tool = p.tools[p.toolIdx[moveIndex]]
    const R = tool.diameterMm / 2, R2 = R * R
    const flat = tool.shape === 'endmill'
    const table = this.profileTable(tool)
    const len = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.ceil(len / this.stampStep(tool)))
    const { nx, ny, data, cellX, cellY } = this

    for (let s = 1; s <= n; s++) {
      const f = s / n
      const cx = x0 + (x1 - x0) * f, cy = y0 + (y1 - y0) * f, cz = z0 + (z1 - z0) * f
      if (cz >= 0.001) continue
      // urma vârfului: nodurile ale căror celule le poate atinge acest punct (plus o jumătate
      // de pas, ca verificarea dintre două ștampile să găsească una dintre ele)
      {
        const rt = this.tipRadius(), rt2 = rt * rt
        const a0 = Math.max(0, Math.ceil((cx - rt) / cellX)), a1 = Math.min(nx - 1, Math.floor((cx + rt) / cellX))
        const b0 = Math.max(0, Math.ceil((cy - rt) / cellY)), b1 = Math.min(ny - 1, Math.floor((cy + rt) / cellY))
        for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
          const dx = a * cellX - cx, dy = b * cellY - cy
          if (dx * dx + dy * dy <= rt2 && cz < this.tipTrack[b * nx + a]) this.tipTrack[b * nx + a] = cz
        }
      }
      // distanța se măsoară de la poziția EXACTĂ a frezei (nu rotunjită la celulă): pereții
      // tăieturilor stau la locul lor real, iar verificarea coliziunilor poate fi strânsă
      const i0 = Math.max(0, Math.ceil((cx - R) / cellX)), i1 = Math.min(nx - 1, Math.floor((cx + R) / cellX))
      const j0 = Math.max(0, Math.ceil((cy - R) / cellY)), j1 = Math.min(ny - 1, Math.floor((cy + R) / cellY))
      // o freză mai mică decât o celulă tot trebuie să lase urmă
      if (i0 > i1 || j0 > j1) {
        const ii = Math.round(cx / cellX), jj = Math.round(cy / cellY)
        if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && cz < data[jj * nx + ii]) {
          data[jj * nx + ii] = cz
          this.markDirty(ii, jj)
        }
        continue
      }
      for (let jj = j0; jj <= j1; jj++) {
        const dy = jj * cellY - cy
        for (let ii = i0; ii <= i1; ii++) {
          const dx = ii * cellX - cx
          const r2 = dx * dx + dy * dy
          if (r2 > R2) continue
          const idx = jj * nx + ii
          const v = flat ? cz : cz + this.profileAt(tool, table, r2)
          if (v < data[idx]) {
            data[idx] = v
            this.markDirty(ii, jj)
          }
        }
      }
    }
  }

  private markDirty(ii: number, jj: number) {
    if (ii < this.dirty.i0) this.dirty.i0 = ii
    if (ii > this.dirty.i1) this.dirty.i1 = ii
    if (jj < this.dirty.j0) this.dirty.j0 = jj
    if (jj > this.dirty.j1) this.dirty.j1 = jj
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
