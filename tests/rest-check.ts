/**
 * Finisare de rest: freza mică merge doar unde cea mare n-a ajuns, nu taie în relief
 * și chiar scoate materialul rămas. npx tsx tests/rest-check.ts
 */
import { runCam, buildSurfaceGrid, toolProfile, simulateMaterialRemoval, finishingCell } from '../src/cam/engine'
import { findTool } from '../src/cam/toolLibrary'
import type { CamJob } from '../src/cam/types'
import { MOVE_RAPID } from '../src/cam/types'

let fails = 0
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) fails++ }

// piesă 40 × 30 mm, adâncime 4 mm: platou la −1 mm cu un șanț în V îngust (lățime 1.2 mm sus, adânc 3 mm)
// și o gaură rotundă de 1 mm diametru — locuri unde sfera de 3.175 nu încape
const W = 400, H = 300, WMM = 40, HMM = 30, DEPTH = 4
const hm = new Float32Array(W * H)
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = (i + 0.5) * WMM / W, y = HMM - (j + 0.5) * HMM / H
  let z = -1
  const dx = Math.abs(x - 15)
  if (y > 5 && y < 25 && dx < 0.6) z = Math.min(z, -1 - 3 * (1 - dx / 0.6))
  if (Math.hypot(x - 30, y - 15) < 0.5) z = -3.5
  hm[j * W + i] = 1 + z / DEPTH
}

const job: CamJob = {
  widthMm: WMM, heightMm: HMM, maxDepthMm: DEPTH, stockThicknessMm: 10,
  xyOrigin: 'bottomLeft', zZero: 'top', safeZMm: 5, rapidRateMmMin: 3000,
  roughingEnabled: false, roughingTool: findTool('em6'), roughingAllowanceMm: 0,
  finishingEnabled: true, finishingTool: findTool('bn3175'), finishStrategy: 'rasterX',
  restEnabled: true, restTool: { ...findTool('tbn05'), stepoverPercent: 15 }, restThresholdMm: 0.1
}

const t0 = Date.now()
const out = runCam({ heightmap: hm, imgW: W, imgH: H, job })
console.log(`runCam: ${Date.now() - t0} ms; trasee: ${out.toolpaths.map(t => t.name).join(' | ')}`)
const rest = out.toolpaths.find(t => t.name.startsWith('Finisare de rest'))
ok(!!rest, 'există traseul de rest')
if (rest) {
  const tool = rest.tool
  const R = tool.diameterMm / 2
  // 1. nicăieri sub suprafața dorită: verificat pe suprafața exactă (fină), la 0.02 mm pe segmente
  // ca în cam-check: poziția unui perete vertical e cunoscută doar cu precizia grilei de calcul,
  // deci referința e suprafața „subțiată” lateral cu 1.5 celule (altfel 0.05 mm lateral pe un
  // perete vertical apar ca milimetri „în Z”)
  const surf = buildSurfaceGrid(hm, W, H, job, 0.05)
  const fCell = finishingCell(job, W, H) * 1.5
  const rr = Math.ceil(fCell / surf.cellX)
  const eroded = new Float32Array(surf.data.length)
  for (let j = 0; j < surf.ny; j++) for (let i = 0; i < surf.nx; i++) {
    let mn = Infinity
    for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
      const ii = i + di, jj = j + dj
      if (ii < 0 || jj < 0 || ii >= surf.nx || jj >= surf.ny || Math.hypot(di * surf.cellX, dj * surf.cellY) > fCell + 1e-9) continue
      mn = Math.min(mn, surf.data[jj * surf.nx + ii])
    }
    eroded[j * surf.nx + i] = mn
  }
  const zSurf = (x: number, y: number) => {
    const i = Math.round(x / surf.cellX), j = Math.round(y / surf.cellY)
    return eroded[Math.max(0, Math.min(surf.ny - 1, j)) * surf.nx + Math.max(0, Math.min(surf.nx - 1, i))]
  }
  let worst = 0, xMin = Infinity, xMax = -Infinity, worstAt = ''
  const m = rest.moves
  for (let k = 4; k < m.length; k += 4) {
    if (m[k] === MOVE_RAPID) continue
    const ax = m[k - 3], ay = m[k - 2], az = m[k - 1], bx = m[k + 1], by = m[k + 2], bz = m[k + 3]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.02))
    for (let s = 0; s <= n; s++) {
      const f = s / n, x = ax + (bx - ax) * f, y = ay + (by - ay) * f, z = az + (bz - az) * f
      if (z < -0.01) { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x) }
      for (let dj = -R; dj <= R + 1e-9; dj += 0.05) for (let di = -R; di <= R + 1e-9; di += 0.05) {
        const r = Math.hypot(di, dj)
        if (r > R) continue
        const pen = zSurf(x + di, y + dj) - (z + toolProfile(tool, r))
        if (pen > worst) { worst = pen; worstAt = `x=${x.toFixed(2)} y=${y.toFixed(2)} z=${z.toFixed(2)} move ${k / 4} type ${m[k]} (${ax.toFixed(2)},${ay.toFixed(2)},${az.toFixed(2)})→(${bx.toFixed(2)},${by.toFixed(2)},${bz.toFixed(2)})` }
      }
    }
  }
  // 0.03 mm = toleranța de simplificare a traseului, ca la finisare
  ok(worst < 0.03, `freza mică nu taie în relief: pătrundere maximă ${worst.toFixed(3)} mm ${worst >= 0.03 ? worstAt : ''}`)
  ok(xMin > 15 - 3 && xMax < 30 + 3, `tăie doar lângă șanț și gaură: X între ${xMin.toFixed(2)} și ${xMax.toFixed(2)}`)
  // lungimea în plan (XY): pe pereții șanțului în V traseul coboară 3 mm la fiecare rând, deci lungimea 3D nu spune cât acoperă
  const xyLen = (mv: Float64Array) => {
    let s = 0
    for (let k = 4; k < mv.length; k += 4) if (mv[k] !== MOVE_RAPID) s += Math.hypot(mv[k + 1] - mv[k - 3], mv[k + 2] - mv[k - 2])
    return s
  }
  // cu pas Z, freza mică trece de mai multe ori peste aceeași zonă: contează CÂT din suprafață atinge
  const restXY = xyLen(rest.moves), finXY = xyLen(out.toolpaths[0].moves)
  const touched = new Set<number>()
  for (let k = 4; k < rest.moves.length; k += 4) {
    if (rest.moves[k] === MOVE_RAPID || rest.moves[k + 3] > -0.01) continue
    touched.add(Math.round(rest.moves[k + 2] / 0.5) * 1000 + Math.round(rest.moves[k + 1] / 0.5))
  }
  const frac = touched.size / ((WMM / 0.5) * (HMM / 0.5))
  ok(frac < 0.1, `traseul de rest atinge ${(frac * 100).toFixed(1)}% din suprafață (${restXY.toFixed(0)} mm în plan pe toate nivelurile, finisarea ${finXY.toFixed(0)} mm)`)
  let plunges = 0
  for (let k = 0; k < rest.moves.length; k += 4) if (rest.moves[k] === 2) plunges++
  ok(plunges < 120, `rândurile vecine se leagă pe suprafață: doar ${plunges} coborâri`)

  // pas Z: lemnul rămas după finisare, ștampilat exact pe o grilă de 0.1 mm; apoi fiecare punct al
  // traseului de rest măsoară cât lemn are deasupra vârfului ÎNAINTE să taie (≤ pasul Z al frezei mici)
  const G = 0.1, gx = Math.round(WMM / G) + 1, gy = Math.round(HMM / G) + 1
  const stock = new Float32Array(gx * gy)
  const stamp = (tp: { tool: typeof rest.tool; moves: Float64Array }, measure: boolean) => {
    const R2 = tp.tool.diameterMm / 2, m2 = tp.moves
    let worstBite = 0
    for (let k = 4; k < m2.length; k += 4) {
      if (m2[k] === MOVE_RAPID) continue
      const ax = m2[k - 3], ay = m2[k - 2], az = m2[k - 1], bx = m2[k + 1], by = m2[k + 2], bz = m2[k + 3]
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.05))
      for (let s = 0; s <= n; s++) {
        const f = s / n, x = ax + (bx - ax) * f, y = ay + (by - ay) * f, z = az + (bz - az) * f
        if (measure && m2[k] === 1) {
          const ci = Math.round(x / G), cj = Math.round(y / G)
          if (ci >= 0 && cj >= 0 && ci < gx && cj < gy) worstBite = Math.max(worstBite, stock[cj * gx + ci] - z)
        }
        const i0 = Math.max(0, Math.ceil((x - R2) / G)), i1 = Math.min(gx - 1, Math.floor((x + R2) / G))
        const j0 = Math.max(0, Math.ceil((y - R2) / G)), j1 = Math.min(gy - 1, Math.floor((y + R2) / G))
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const r = Math.hypot(i * G - x, j * G - y)
          if (r > R2) continue
          const v = z + toolProfile(tp.tool, r)
          if (v < stock[j * gx + i]) stock[j * gx + i] = v
        }
      }
    }
    return worstBite
  }
  stamp(out.toolpaths[0], false)
  const bite = stamp(rest, true)
  // toleranță: grila de 0.1 mm pe pereții de 5:1 ai șanțului (0.05 mm lateral = 0.25 mm în Z)
  ok(bite <= rest.tool.stepDownMm + 0.3, `freza mică ia cel mult un pas Z: ${bite.toFixed(2)} mm (pas Z ${rest.tool.stepDownMm} mm)`)

  // 2. chiar scoate materialul: fundul șanțului, cu și fără rest
  const simNo = simulateMaterialRemoval(out.toolpaths.filter(t => t !== rest), job)
  const simYes = simulateMaterialRemoval(out.toolpaths, job)
  const at = (s: typeof simNo, x: number, y: number) => {
    const i = Math.round(x / WMM * (s.width - 1)), j = Math.round((1 - y / HMM) * (s.height - 1))
    return -(1 - s.heightmap[j * s.width + i]) * DEPTH
  }
  const grooveNo = at(simNo, 15, 15), grooveYes = at(simYes, 15, 15)
  const holeNo = at(simNo, 30, 15), holeYes = at(simYes, 30, 15)
  console.log(`  șanț: fără rest ${grooveNo.toFixed(2)} mm, cu rest ${grooveYes.toFixed(2)} mm (dorit −4.00)`)
  console.log(`  gaură: fără rest ${holeNo.toFixed(2)} mm, cu rest ${holeYes.toFixed(2)} mm (dorit −3.50)`)
  ok(grooveYes < grooveNo - 1, 'restul coboară mult în șanț')
  ok(holeYes < holeNo - 1, 'restul coboară mult în gaură')
}

// freza de rest nu mai mică decât cea de finisare → avertizare, fără traseu
const out2 = runCam({ heightmap: hm, imgW: W, imgH: H, job: { ...job, restTool: findTool('bn6') } })
ok(!out2.toolpaths.some(t => t.name.startsWith('Finisare de rest')) && out2.warnings.some(w => w.includes('mai fină')), 'freză de rest prea mare: avertizare, fără traseu')

console.log(fails ? `\n${fails} verificări au picat` : '\nToate verificările au trecut')
process.exit(fails ? 1 : 0)
