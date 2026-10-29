/**
 * Post-procesoare: transformă traseele în dialectul G-code al fiecărui controler.
 * Fiecare post știe: stilul comentariilor, extensia fișierului, cum se face pauza,
 * dacă are schimbător de sculă (M6) și dacă acceptă mai multe scule într-un fișier.
 */
import type { CamJob, CamTool, PostId, Toolpath } from './types'
import { MOVE_PLUNGE, MOVE_RAPID } from './types'

export interface PostProcessor {
  id: PostId
  name: string
  description: string
  extension: string
  comments: 'semicolon' | 'paren' | 'none'
  lineNumbers: boolean
  decimals: number
  // pauza după pornirea frezei (secunde) — null = controlerul nu acceptă/nu are nevoie
  dwell: ((sec: number) => string) | null
  // GRBL/Marlin nu permit mișcarea mașinii în pauza M0, deci nu se poate reface Z0
  // după schimbarea frezei: acolo fiecare sculă primește fișierul ei
  toolChange: 'M6' | 'separateFiles'
  spindle: boolean
  twoDigitCodes: boolean // G00/G01 în loc de G0/G1 (DSP-urile vechi)
  footer: string[]
  programStart?: string[] // ex. „%” și „O0001” pentru Fanuc
  programEnd?: string[]
  maxLineNumber?: number   // după atât numerotarea reia de la N10
}

export const POST_PROCESSORS: PostProcessor[] = [
  {
    id: 'grbl',
    name: 'GRBL 0.9 / 1.1',
    description: 'Routere hobby (3018, 6040 cu Arduino/placă GRBL), Candle, UGS, LaserGRBL',
    extension: 'nc',
    comments: 'semicolon',
    lineNumbers: false,
    decimals: 3,
    dwell: s => `G4 P${s.toFixed(1)}`,
    toolChange: 'separateFiles',
    spindle: true,
    twoDigitCodes: false,
    footer: ['M5', 'M30']
  },
  {
    id: 'fluidnc',
    name: 'FluidNC / grblHAL (ESP32)',
    description: 'Controlere ESP32, plăci MKS DLC32, Teensy grblHAL',
    extension: 'nc',
    comments: 'semicolon',
    lineNumbers: false,
    decimals: 3,
    dwell: s => `G4 P${s.toFixed(1)}`,
    toolChange: 'separateFiles',
    spindle: true,
    twoDigitCodes: false,
    footer: ['M5', 'M30']
  },
  {
    id: 'mach3',
    name: 'Mach3 / Mach4',
    description: 'PC cu Mach3/Mach4 prin port paralel, USB (UC100) sau Ethernet',
    extension: 'tap',
    comments: 'paren',
    lineNumbers: false,
    decimals: 4,
    dwell: s => `G4 P${s.toFixed(1)}`,
    toolChange: 'M6',
    spindle: true,
    twoDigitCodes: false,
    footer: ['M5', 'M30']
  },
  {
    id: 'linuxcnc',
    name: 'LinuxCNC',
    description: 'PC cu LinuxCNC (Mesa, port paralel)',
    extension: 'ngc',
    comments: 'paren',
    lineNumbers: false,
    decimals: 4,
    dwell: s => `G4 P${s.toFixed(1)}`,
    toolChange: 'M6',
    spindle: true,
    twoDigitCodes: false,
    footer: ['M5', 'M2']
  },
  {
    id: 'uccnc',
    name: 'UCCNC',
    description: 'Controlere CNCdrive UC300/UC400/AXBB',
    extension: 'nc',
    comments: 'paren',
    lineNumbers: false,
    decimals: 4,
    dwell: s => `G4 P${s.toFixed(1)}`,
    toolChange: 'M6',
    spindle: true,
    twoDigitCodes: false,
    footer: ['M5', 'M30']
  },
  {
    id: 'marlin',
    name: 'Marlin (CNC din imprimantă 3D)',
    description: 'MPCNC, Lowrider, plăci Marlin cu SPINDLE_FEATURE',
    extension: 'gcode',
    comments: 'semicolon',
    lineNumbers: false,
    decimals: 3,
    dwell: s => `G4 S${Math.round(s)}`,
    toolChange: 'separateFiles',
    spindle: true,
    twoDigitCodes: false,
    footer: ['M5']
  },
  {
    id: 'richauto',
    name: 'RichAuto DSP (A11/A12/A18)',
    description: 'Telecomanda DSP de pe routerele chinezești; fișier pe stick USB',
    extension: 'nc',
    comments: 'none',
    lineNumbers: false,
    decimals: 3,
    dwell: null,
    toolChange: 'separateFiles',
    spindle: true,
    twoDigitCodes: true,
    footer: ['M05', 'M30']
  },
  {
    id: 'weihong',
    name: 'Weihong NcStudio / NK105 / Syntec',
    description: 'Routere industriale cu NcStudio sau controler NK',
    extension: 'nc',
    comments: 'paren',
    lineNumbers: false,
    decimals: 3,
    dwell: null,
    toolChange: 'separateFiles',
    spindle: true,
    twoDigitCodes: true,
    footer: ['M05', 'M30']
  },
  {
    id: 'iso',
    name: 'ISO generic (Fanuc, cu numere de linie)',
    description: 'Controlere industriale generice care cer N10, N20…',
    extension: 'nc',
    comments: 'paren',
    lineNumbers: true,
    decimals: 3,
    // Fanuc: P fără zecimale și în milisecunde; X în secunde e acceptat peste tot
    dwell: s => `G4 X${s.toFixed(1)}`,
    toolChange: 'M6',
    spindle: true,
    twoDigitCodes: false,
    footer: ['M5', 'M30'],
    programStart: ['%', 'O0001'],
    programEnd: ['%'],
    maxLineNumber: 99990
  }
]

/** Două trasee folosesc aceeași freză fizică dacă au aceeași formă și dimensiuni */
export function toolIdentity(t: CamTool): string {
  return `${t.shape}-${t.diameterMm}-${t.tipAngleDeg}-${t.tipDiameterMm ?? ''}`
}

export function getPost(id: PostId): PostProcessor {
  return POST_PROCESSORS.find(p => p.id === id) ?? POST_PROCESSORS[0]
}

/** Transformare din coordonatele interne în coordonatele mașinii (origine XY, zero Z) */
export function machineTransform(job: CamJob) {
  const ox = job.xyOrigin === 'center' ? job.widthMm / 2 : 0
  const oy = job.xyOrigin === 'center' ? job.heightMm / 2 : job.xyOrigin === 'topLeft' ? job.heightMm : 0
  const oz = job.zZero === 'bed' ? job.stockThicknessMm : 0
  return { ox, oy, oz }
}

function asciiOnly(s: string): string {
  // controlerele vechi nu acceptă diacritice nici în comentarii
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '')
}

class GWriter {
  private lines: string[] = []
  private n = 10
  private last: Record<string, string> = {}
  private post: PostProcessor
  constructor(post: PostProcessor) {
    this.post = post
  }

  comment(text: string) {
    const t = asciiOnly(text).replace(/[()"]/g, '')
    if (this.post.comments === 'semicolon') this.raw(`; ${t}`)
    else if (this.post.comments === 'paren') this.raw(`(${t})`)
  }

  raw(line: string) {
    if (this.post.lineNumbers && !line.startsWith(';')) {
      this.lines.push(`N${this.n} ${line}`)
      this.n += 10
      if (this.post.maxLineNumber && this.n > this.post.maxLineNumber) this.n = 10
    } else {
      this.lines.push(line)
    }
  }

  code(c: string): string {
    if (!this.post.twoDigitCodes) return c
    return c.replace(/^([GM])(\d)$/, '$10$2')
  }

  /** Mișcare cu suprimarea cuvintelor modale care nu s-au schimbat */
  move(g: 'G0' | 'G1', x: number, y: number, z: number, feed?: number) {
    const d = this.post.decimals
    const words: string[] = []
    const gc = this.code(g)
    if (this.last.G !== gc) words.push(gc)
    const add = (axis: string, v: number) => {
      const s = v.toFixed(d)
      if (this.last[axis] !== s) { words.push(axis + s); this.last[axis] = s }
    }
    add('X', x)
    add('Y', y)
    add('Z', z)
    if (words.length === 0 || (words.length === 1 && words[0] === gc)) return
    if (g === 'G1' && feed !== undefined) {
      const f = String(Math.round(feed))
      if (this.last.F !== f) { words.push('F' + f); this.last.F = f }
    }
    this.last.G = gc
    this.raw(words.join(' '))
  }

  forgetPosition() {
    delete this.last.X
    delete this.last.Y
    delete this.last.Z
    delete this.last.G
  }

  get text() { return this.lines.join('\n') + '\n' }
  get count() { return this.lines.length }
}

/**
 * Generează G-code pentru o listă de trasee. Dacă postul cere fișiere separate
 * pe sculă, apelați funcția câte un traseu pe rând.
 */
export function postProcess(allToolpaths: Toolpath[], job: CamJob, postId: PostId, title = 'Relief 3D'): string {
  const post = getPost(postId)
  const { ox, oy, oz } = machineTransform(job)
  const w = new GWriter(post)
  const toolpaths = allToolpaths.filter(t => t.moves.length > 0)
  const totalMin = toolpaths.reduce((s, t) => s + t.stats.estimatedTimeMin, 0)

  post.programStart?.forEach(l => w.raw(l))
  w.comment(`CNC WoodCraft Studio - ${title}`)
  w.comment(`Post: ${post.name}`)
  w.comment(`Piesa: ${job.widthMm} x ${job.heightMm} mm, adancime relief ${job.maxDepthMm} mm, grosime lemn ${job.stockThicknessMm} mm`)
  w.comment(`Origine XY: ${job.xyOrigin === 'center' ? 'centru' : job.xyOrigin === 'topLeft' ? 'stanga-sus' : 'stanga-jos'}, Z0: ${job.zZero === 'top' ? 'fata de sus a lemnului' : 'masa masinii'}`)
  w.comment(`Timp estimat: ${Math.floor(totalMin / 60)}h ${Math.round(totalMin % 60)}m`)
  toolpaths.forEach((tp, i) => w.comment(`Traseu ${i + 1}: ${tp.name} - D${tp.tool.diameterMm} ${tp.tool.shape}`))

  w.raw(w.code('G90'))
  w.raw('G21')
  w.raw('G17')
  if (post.id !== 'marlin') w.raw('G94')

  let currentTool: string | null = null
  toolpaths.forEach(tp => {
    const t = tp.tool
    const toolKey = toolIdentity(t)
    w.comment(`=== ${tp.name} ===`)

    if (toolKey !== currentTool) {
      if (currentTool !== null) {
        // traseele se termină deja la Z de siguranță
        if (post.spindle) w.raw(w.code('M5'))
        w.comment(`Schimbare scula: T${t.toolNumber} ${t.name}`)
        w.forgetPosition()
      }
      if (post.toolChange === 'M6') {
        w.raw(`T${t.toolNumber} ${w.code('M6')}`)
        // lungimea sculei din tabela controlerului; fără ea freza nouă ar lucra cu Z0-ul celei vechi
        w.raw(`G43 H${t.toolNumber}`)
      }
      // întâi doar ridicare pe Z, abia apoi deplasare în XY
      w.raw(`${w.code('G0')} Z${(job.safeZMm + oz).toFixed(post.decimals)}`)
      w.forgetPosition()
      if (post.spindle) {
        w.raw(`${w.code('M3')} S${Math.round(t.spindleRpm)}`)
        if (post.dwell) w.raw(post.dwell(3))
      }
      currentTool = toolKey
    }

    const m = tp.moves
    for (let k = 0; k < m.length; k += 4) {
      const type = m[k]
      const x = m[k + 1] - ox
      const y = m[k + 2] - oy
      const z = m[k + 3] + oz
      if (type === MOVE_RAPID) w.move('G0', x, y, z)
      else w.move('G1', x, y, z, type === MOVE_PLUNGE ? t.plungeRateMmMin : t.feedRateMmMin)
    }
  })

  const last = toolpaths[toolpaths.length - 1]
  if (last) {
    const lx = last.moves[last.moves.length - 3] - ox
    const ly = last.moves[last.moves.length - 2] - oy
    w.move('G0', lx, ly, job.safeZMm + oz)
  }
  w.move('G0', 0, 0, job.safeZMm + oz)
  post.footer.forEach(f => w.raw(f))
  post.programEnd?.forEach(l => w.raw(l))
  return w.text
}

export interface PlannedFile {
  name: string
  render: () => string // generarea textului e scumpă: se face doar la descărcare/trimitere
  tools?: CamTool[]    // frezele din fișier, în ordine (pentru simulator și lista de verificare)
}

/** Freza pentru simulator: după numărul T (fișier combinat cu M6) sau prima a fișierului */
export function toolForFile(file: PlannedFile, tNumber: number): CamTool | undefined {
  const tools = file.tools ?? []
  return tools.find(t => t.toolNumber === tNumber) ?? tools[0]
}

/** Fișierele de produs: unul combinat sau câte unul pe sculă, după post */
export function planOutputFiles(
  toolpaths: Toolpath[],
  job: CamJob,
  postId: PostId,
  baseName: string,
  forceSeparate = false
): PlannedFile[] {
  toolpaths = toolpaths.filter(t => t.moves.length > 0)
  if (!toolpaths.length) return []
  const post = getPost(postId)
  const distinctTools = new Set(toolpaths.map(t => toolIdentity(t.tool)))
  if ((post.toolChange !== 'separateFiles' && !forceSeparate) || distinctTools.size <= 1) {
    const tools = toolpaths.map(t => t.tool).filter((t, i, a) => a.findIndex(x => toolIdentity(x) === toolIdentity(t)) === i)
    return [{ name: `${baseName}.${post.extension}`, render: () => postProcess(toolpaths, job, postId), tools }]
  }
  // grupăm traseele consecutive cu aceeași sculă
  const groups: Toolpath[][] = []
  let key = ''
  for (const tp of toolpaths) {
    const k = toolIdentity(tp.tool)
    if (k !== key) { groups.push([]); key = k }
    groups[groups.length - 1].push(tp)
  }
  return groups.map((g, i) => ({
    name: `${baseName}_${i + 1}_${g[0].tool.shape}_D${g[0].tool.diameterMm}.${post.extension}`,
    render: () => postProcess(g, job, postId, g.map(t => t.name).join(' + ')),
    tools: [g[0].tool]
  }))
}

export function buildOutputFiles(
  toolpaths: Toolpath[],
  job: CamJob,
  postId: PostId,
  baseName: string,
  forceSeparate = false
): Array<{ name: string; content: string }> {
  return planOutputFiles(toolpaths, job, postId, baseName, forceSeparate).map(f => ({ name: f.name, content: f.render() }))
}
