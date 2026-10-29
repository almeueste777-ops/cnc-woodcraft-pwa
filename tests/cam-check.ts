/**
 * Verificare motor CAM fără browser:  npx tsx tests/cam-check.ts [imagine-heightmap.png]
 * - nicio tăietură sub suprafața dorită (fără „gouging”)
 * - degroșarea nu coboară mai mult de un pas Z odată
 * - G-code valid pentru fiecare post-procesor
 */
import { readFileSync } from 'node:fs'
import { runCam, buildSurfaceGrid, simulateMaterialRemoval, toolProfile, finishingCell } from '../src/cam/engine'
import { POST_PROCESSORS, buildOutputFiles } from '../src/cam/postProcessors'
import { findTool } from '../src/cam/toolLibrary'
import type { CamJob } from '../src/cam/types'
import { MOVE_PLUNGE } from '../src/cam/types'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`)
  if (!ok) failures++
}

// Harta de test: chip bombat + nimb + linii fine + muchii abrupte (cazurile grele pentru freză)
function syntheticHeightmap(w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1), v = y / (h - 1)
      const face = Math.max(0, 1 - ((u - 0.5) ** 2 + (v - 0.4) ** 2) * 12)
      const halo = Math.hypot(u - 0.5, v - 0.3) < 0.25 ? 0.25 : 0
      const lines = 0.08 * Math.sin(u * 90) * Math.sin(v * 70)
      const frame = u < 0.06 || u > 0.94 || v < 0.05 || v > 0.95 ? 0.9 : 0
      // creste foarte înguste (1 px și 3 px, 2 mm înălțime): pe grila rară a degroșării cad între noduri
      const ridge = (x === 120 || (x >= 300 && x < 303)) && v > 0.55 && v < 0.85 ? 0.125 : 0
      out[y * w + x] = Math.max(0, Math.min(1, 0.1 + 0.6 * Math.sqrt(face) + halo + lines + frame + ridge))
    }
  }
  return out
}

async function loadPng(path: string): Promise<{ data: Float32Array; w: number; h: number }> {
  // fără dependențe: acceptăm doar PGM (P5) pentru imagini reale convertite
  const buf = readFileSync(path)
  const header = buf.toString('latin1', 0, 64).split(/\s+/)
  if (header[0] !== 'P5') throw new Error('Folosiți o imagine .pgm (P5)')
  const w = Number(header[1]), h = Number(header[2]), max = Number(header[3])
  const offset = buf.length - w * h
  const data = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) data[i] = buf[offset + i] / max
  return { data, w, h }
}

const arg = process.argv[2]
const img = arg ? await loadPng(arg) : { data: syntheticHeightmap(400, 560), w: 400, h: 560 }
console.log(`Hartă ${img.w}x${img.h}${arg ? ' din ' + arg : ' sintetică'}`)

const job: CamJob = {
  widthMm: 200, heightMm: 280, maxDepthMm: 16, stockThicknessMm: 22,
  xyOrigin: 'bottomLeft', zZero: 'top', safeZMm: 6, rapidRateMmMin: 3000,
  roughingEnabled: true, roughingTool: findTool('em6'), roughingAllowanceMm: 0.5,
  finishingEnabled: true, finishingTool: findTool('bn3175'), finishStrategy: 'rasterX'
}

const t0 = Date.now()
const out = runCam({ heightmap: img.data, imgW: img.w, imgH: img.h, job })
console.log(`Calcul: ${((Date.now() - t0) / 1000).toFixed(1)} s, trasee: ${out.toolpaths.map(t => `${t.name} (${t.stats.moveCount} mișcări, ${t.stats.estimatedTimeMin.toFixed(0)} min)`).join(', ')}`)

// 1. Fără gouging, verificat exact: freza pusă în fiecare punct al traseului
//    nu are voie să intre în suprafața dorită (grilă fină 0.1 mm)
const surf = buildSurfaceGrid(img.data, img.w, img.h, job, 0.1)
function gougeCheck(out: ReturnType<typeof runCam>, job: CamJob) {
// La finisare, poziția unui perete e cunoscută doar cu precizia grilei (≤ un pixel al
// imaginii): referința e suprafața „subțiată” lateral cu o celulă de finisare.
const fCell = finishingCell(job, img.w, img.h) * 1.5
const eroded = { ...surf, data: new Float32Array(surf.data.length) }
{
  const rr = Math.ceil(fCell / surf.cellX)
  for (let j = 0; j < surf.ny; j++) for (let i = 0; i < surf.nx; i++) {
    let mn = Infinity
    for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
      const ii = i + di, jj = j + dj
      if (ii < 0 || jj < 0 || ii >= surf.nx || jj >= surf.ny) continue
      if (Math.hypot(di * surf.cellX, dj * surf.cellY) > fCell + 1e-9) continue
      mn = Math.min(mn, surf.data[jj * surf.nx + ii])
    }
    eroded.data[j * surf.nx + i] = mn
  }
}
console.log(`     Celulă finisare ${fCell.toFixed(3)} mm`)
for (const tp of out.toolpaths) {
  const R = tp.tool.diameterMm / 2
  const isRough = tp.name.startsWith('Degro')
  const allowance = isRough ? job.roughingAllowanceMm : 0
  const ref = isRough ? surf : eroded
  let worst = Infinity
  let where = ''
  const m = tp.moves
  // verificăm vârfurile traseului ȘI punctele de pe segmente (din 0.05 în 0.05 mm)
  const probes: number[] = []
  const segOf: number[] = []
  for (let k = 4; k < m.length; k += 4) {
    if (m[k] === 0) continue
    const n = Math.max(1, Math.ceil(Math.hypot(m[k + 1] - m[k - 3], m[k + 2] - m[k - 2]) / 0.05))
    for (let s = 0; s <= n; s++) {
      const f = s / n
      segOf.push(k)
      probes.push(m[k - 3] + (m[k + 1] - m[k - 3]) * f, m[k - 2] + (m[k + 2] - m[k - 2]) * f, m[k - 1] + (m[k + 3] - m[k - 1]) * f)
    }
  }
  for (let k = 0; k < probes.length; k += 3) {
    const x = probes[k], y = probes[k + 1], z = probes[k + 2]
    if (z > 0) continue
    const i0 = Math.ceil((x - R) / surf.cellX), i1 = Math.floor((x + R) / surf.cellX)
    const j0 = Math.ceil((y - R) / surf.cellY), j1 = Math.floor((y + R) / surf.cellY)
    for (let j = Math.max(0, j0); j <= Math.min(surf.ny - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(surf.nx - 1, i1); i++) {
        const r = Math.hypot(i * surf.cellX - x, j * surf.cellY - y)
        if (r > R) continue
        const clearance = z + toolProfile(tp.tool, r) - ref.data[j * surf.nx + i]
        if (clearance < worst) {
          worst = clearance
          const s = segOf[k / 3]
          const p = (o: number) => `[${m[s + o]}] ${m[s + o + 1].toFixed(2)},${m[s + o + 2].toFixed(2)},${m[s + o + 3].toFixed(3)}`
          where = `X${x.toFixed(2)} Y${y.toFixed(2)} Z${z.toFixed(3)} pe segmentul ${p(-4)} -> ${p(0)}`
        }
      }
    }
  }
  // degroșarea trebuie să lase adaosul cerut (toleranță 0.1 mm: interpolarea sub-pixel între
  // nodurile grilei fine), finisarea să nu intre în relief (0.03 mm: toleranța de simplificare)
  check(worst >= allowance - (isRough ? 0.1 : 0.03),
    `${tp.name}: distanța minimă sculă–relief final ${worst.toFixed(3)} mm (adaos cerut ${allowance}) la ${where}`)
}
}
gougeCheck(out, job)

// 1a. Aceeași verificare pentru freza conică-sferică și V-bit, pe raster Y, doar finisare
for (const id of ['tb05', 'vb60']) {
  const j2: CamJob = { ...job, roughingEnabled: false, finishingTool: findTool(id), finishStrategy: 'rasterY' }
  const t1 = Date.now()
  const o2 = runCam({ heightmap: img.data, imgW: img.w, imgH: img.h, job: j2 })
  console.log(`     ${j2.finishingTool.name}: ${((Date.now() - t1) / 1000).toFixed(1)} s, ${o2.toolpaths[0].stats.moveCount} mișcări`)
  gougeCheck(o2, j2)
}

// 1b. Material rămas după toate traseele (informativ)
{
  const sim = simulateMaterialRemoval(out.toolpaths, job)
  let sumLeft = 0, n = 0
  for (let j = 0; j < sim.height; j++) {
    for (let i = 0; i < sim.width; i++) {
      const zSim = (sim.heightmap[(sim.height - 1 - j) * sim.width + i] - 1) * job.maxDepthMm
      const si = Math.round(((i / (sim.width - 1)) * job.widthMm) / surf.cellX)
      const sj = Math.round(((j / (sim.height - 1)) * job.heightMm) / surf.cellY)
      sumLeft += Math.max(0, zSim - surf.data[sj * surf.nx + si]); n++
    }
  }
  console.log(`     Material rămas mediu după finisare: ${(sumLeft / n).toFixed(3)} mm`)
}

// 2. Degroșarea: niciun plonjeu mai adânc de un pas Z sub nivelul anterior
const rough = out.toolpaths.find(t => t.name.startsWith('Degro'))!
let maxPlunge = 0
for (let k = 4; k < rough.moves.length; k += 4) {
  if (rough.moves[k] === MOVE_PLUNGE) maxPlunge = Math.max(maxPlunge, rough.moves[k - 1] - rough.moves[k + 3])
}
check(maxPlunge <= job.roughingTool.stepDownMm + 1.01, `Degroșare: plonjeu maxim ${maxPlunge.toFixed(2)} mm (pas Z ${job.roughingTool.stepDownMm} mm + 1 mm apropiere)`)

// 3. G-code valid pentru fiecare post
const minZ = Math.min(...out.toolpaths.map(t => t.stats.minZ))
check(minZ >= -job.maxDepthMm - 0.01, `Z minim ${minZ.toFixed(3)} ≥ -${job.maxDepthMm}`)
for (const post of POST_PROCESSORS) {
  // combinat (forceSeparate=false), ca să testăm și M6/G43 pe posturile care le au
  const files = buildOutputFiles(out.toolpaths, { ...job, zZero: 'bed', xyOrigin: 'center' }, post.id, 'test', false)
  let bad = ''
  if (post.toolChange === 'M6' && !files[0].content.includes('G43 H')) bad = 'lipsește G43 după M6'
  let zMin = Infinity
  for (const f of files) {
    for (const line of f.content.split('\n')) {
      const l = line.replace(/^N\d+ /, '').trim()
      if (!l || l.startsWith(';') || l.startsWith('(') || l === '%' || /^O\d{4}$/.test(l)) continue
      if (!/^([GMTSFXYZPH]-?\d+(\.\d+)?\s?)+$/.test(l)) { bad = l; break }
      if (post.id === 'iso' && /P\d+\.\d/.test(l)) { bad = 'Fanuc nu acceptă P cu zecimale: ' + l; break }
      if (/^N(\d+)/.test(line) && Number(line.match(/^N(\d+)/)![1]) > 99999) { bad = 'număr de linie > 99999'; break }
      const z = l.match(/Z(-?\d+\.\d+)/)
      if (z) zMin = Math.min(zMin, Number(z[1]))
      if (post.comments === 'none' && /[;(]/.test(line)) { bad = 'comentariu: ' + line; break }
    }
  }
  const expectedMin = job.stockThicknessMm - job.maxDepthMm
  check(!bad && zMin >= expectedMin - 0.01,
    `${post.name}: ${files.length} fișier(e) ${files.map(f => f.name).join(', ')}; Z min ${zMin.toFixed(3)} (lemnul are ${job.stockThicknessMm}, fundul reliefului la ${expectedMin})${bad ? ' — linie invalidă: ' + bad : ''}`)
}

console.log(failures ? `\n${failures} verificări au picat` : '\nToate verificările au trecut')
process.exit(failures ? 1 : 0)
