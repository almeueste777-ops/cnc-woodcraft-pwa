/**
 * Lucrările vectoriale împreună: V-carve cu fund plat golit de freză dreaptă, ordinea lucrărilor,
 * lista de găuri. Verificat exact: freza dreaptă nu atinge pereții în V, fundul iese complet.
 * npx tsx tests/vectorjob-check.ts
 */
import { runVectorCam, parseHoleList, type VectorOps } from '../src/cam/vectorJob'
import { toolProfile } from '../src/cam/engine'
import { findTool } from '../src/cam/toolLibrary'
import type { CamJob, Toolpath } from '../src/cam/types'
import { MOVE_RAPID } from '../src/cam/types'

let fails = 0
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) fails++ }

// piesă 60 × 40, formă = dreptunghi 40 × 24 (latura mică 24 → fund plat lat) cu colț interior (L)
const WMM = 60, HMM = 40, PX = 0.025
const w = Math.round(WMM / PX), h = Math.round(HMM / PX)
// L: dreptunghi [10,50]×[8,32] minus colțul [35,50]×[20,32] (coordonate mașină, Y în sus)
const inShape = (x: number, y: number) => x > 10 && x < 50 && y > 8 && y < 32 && !(x > 35 && y > 20)
const data = new Uint8Array(w * h)
for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[j * w + i] = inShape((i + 0.5) * PX, HMM - (j + 0.5) * PX) ? 1 : 0
const mask = { data, w, h, widthMm: WMM, heightMm: HMM }
// distanța exactă până la marginea formei (poligon)
const segs: Array<[number, number, number, number]> = [[10, 8, 50, 8], [50, 8, 50, 20], [50, 20, 35, 20], [35, 20, 35, 32], [35, 32, 10, 32], [10, 32, 10, 8]]
const dist = (x: number, y: number) => {
  let best = Infinity
  for (const [ax, ay, bx, by] of segs) {
    const dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy))
  }
  return inShape(x, y) ? best : -best
}

const job: CamJob = {
  widthMm: WMM, heightMm: HMM, maxDepthMm: 3, stockThicknessMm: 18, xyOrigin: 'bottomLeft', zZero: 'top', safeZMm: 5, rapidRateMmMin: 3000,
  roughingEnabled: false, roughingTool: findTool('em6'), roughingAllowanceMm: 0, finishingEnabled: false, finishingTool: findTool('bn3175'), finishStrategy: 'rasterX'
}
const vbit = findTool('vb60'), flat = 1.5
const tan = Math.tan(Math.PI / 6)
const base: VectorOps = {
  vcarve: { enabled: true, tool: vbit, flatDepthMm: flat, clearEnabled: true, clearTool: findTool('em3175') },
  pocket: { enabled: false, tool: findTool('em3175'), depthMm: 3, ramp: { enabled: true, angleDeg: 5 } },
  profile: { enabled: false, tool: findTool('em3175'), side: 'outside', depthMm: 5, tabs: { count: 0, widthMm: 6, heightMm: 2 }, ramp: { enabled: true, angleDeg: 5 } },
  drill: { enabled: false, tool: findTool('em3175'), depthMm: 5, peckMm: 2, fromShapes: false, maxHoleMm: 6, manual: '' }
}

/** Adâncimea tăiată în fiecare punct al unei grile de 0.1 mm (frezele „ștampilate” exact) */
function carve(tps: Toolpath[]) {
  const G = 0.1, nx = Math.round(WMM / G) + 1, ny = Math.round(HMM / G) + 1
  const cut = new Float32Array(nx * ny)
  for (const tp of tps) {
    const R = tp.tool.diameterMm / 2, m = tp.moves
    for (let k = 4; k < m.length; k += 4) {
      if (m[k] === MOVE_RAPID) continue
      const ax = m[k - 3], ay = m[k - 2], az = m[k - 1], bx = m[k + 1], by = m[k + 2], bz = m[k + 3]
      if (Math.min(az, bz) >= 0) continue
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.02))
      for (let s = 0; s <= n; s++) {
        const f = s / n, x = ax + (bx - ax) * f, y = ay + (by - ay) * f, z = az + (bz - az) * f
        if (z >= 0) continue
        // doar raza la care scula e sub fața lemnului
        let rr = R
        if (tp.tool.shape === 'vbit') rr = Math.min(R, -z * tan)
        const i0 = Math.max(0, Math.ceil((x - rr) / G)), i1 = Math.min(nx - 1, Math.floor((x + rr) / G))
        const j0 = Math.max(0, Math.ceil((y - rr) / G)), j1 = Math.min(ny - 1, Math.floor((y + rr) / G))
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const r = Math.hypot(i * G - x, j * G - y)
          if (r > rr) continue
          const d = -(z + toolProfile(tp.tool, r))
          if (d > cut[j * nx + i]) cut[j * nx + i] = d
        }
      }
    }
  }
  let overcut = 0, leftover = 0, where = ''
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = i * G, y = j * G, D = dist(x, y)
    const ideal = D > 0 ? Math.min(D / tan, flat) : 0
    const c = cut[j * nx + i]
    if (c - ideal > overcut) { overcut = c - ideal; where = `x=${x.toFixed(1)} y=${y.toFixed(1)}` }
    // lângă margine adâncimea ideală e sub un pixel de mască / tan: nu cerem acolo
    if (D > 0.1 && ideal - c > leftover) leftover = ideal - c
  }
  return { overcut, leftover, where }
}

const t0 = Date.now()
const out = runVectorCam({ mask, job, ops: base })
const tClear = Date.now() - t0
const names = out.toolpaths.map(t => t.name)
console.log(`cu golire: ${tClear} ms; ${names.join(' | ')}`)
ok(names.length === 2 && names[0].includes('golire fund plat') && names[1].startsWith('V-carve'), 'întâi golirea fundului, apoi V-carve')
const clear = out.toolpaths[0], vc = out.toolpaths[1]
ok(Math.abs(clear.stats.minZ + flat) < 1e-6, `freza dreaptă coboară exact la fundul plat (${clear.stats.minZ.toFixed(4)})`)
// freza dreaptă nu atinge pereții: centrul ei e la cel puțin Dcap + R de margine
{
  const Dcap = flat * tan, R = clear.tool.diameterMm / 2
  let worst = Infinity
  const m = clear.moves
  for (let k = 4; k < m.length; k += 4) {
    if (m[k] === MOVE_RAPID || m[k + 3] >= 0) continue
    const n = Math.max(1, Math.ceil(Math.hypot(m[k + 1] - m[k - 3], m[k + 2] - m[k - 2]) / 0.05))
    for (let s = 0; s <= n; s++) {
      const f = s / n
      worst = Math.min(worst, dist(m[k - 3] + (m[k + 1] - m[k - 3]) * f, m[k - 2] + (m[k + 2] - m[k - 2]) * f))
    }
  }
  ok(worst >= Dcap + R - 0.03, `freza dreaptă stă departe de pereți: ${worst.toFixed(3)} mm (minim ${(Dcap + R).toFixed(3)})`)
}
const r1 = carve(out.toolpaths)
console.log(`  rezultat cu golire: supra-tăiere ${r1.overcut.toFixed(3)} mm (${r1.where}), rest ${r1.leftover.toFixed(3)} mm`)
ok(r1.overcut < 0.06, 'nicio supra-tăiere (≤ 0.06: un pixel de mască / tan 30°)')
ok(r1.leftover < 0.06, 'fundul și pereții ies complet')

const out2 = runVectorCam({ mask, job, ops: { ...base, vcarve: { ...base.vcarve, clearEnabled: false } } })
const r2 = carve(out2.toolpaths)
const tA = out.toolpaths.reduce((s, t) => s + t.stats.estimatedTimeMin, 0), tB = out2.toolpaths[0].stats.estimatedTimeMin
console.log(`  fără golire: supra-tăiere ${r2.overcut.toFixed(3)}, rest ${r2.leftover.toFixed(3)}; timp ${tB.toFixed(0)} min față de ${tA.toFixed(0)} min cu golire`)
ok(r2.overcut < 0.06 && r2.leftover < 0.06, 'același rezultat și doar cu V-bit-ul')
ok(tA < tB * 0.6, 'golirea cu freza dreaptă scurtează mult lucrarea')

// adâncime plată cerută mai mare decât ajunge V-bit-ul (90°, Ø6 → 3 mm): freza dreaptă nu are voie mai jos
{
  const vb90 = findTool('vb90')
  const o = runVectorCam({ mask, job, ops: { ...base, vcarve: { ...base.vcarve, tool: vb90, flatDepthMm: 4 } } })
  const reach = toolProfile(vb90, vb90.diameterMm / 2)
  const minAll = Math.min(...o.toolpaths.map(t => t.stats.minZ))
  ok(Math.abs(minAll + reach) < 1e-6, `fund plat cerut 4 mm, V-bit-ul ajunge ${reach.toFixed(2)}: nimic nu coboară mai jos (${minAll.toFixed(3)})`)
  ok(o.warnings.some(x => x.includes('ajunge doar')), 'avertizare: V-bit-ul nu ajunge la adâncimea cerută')
  ok(Math.abs(o.simDepthMm - reach) < 1e-6, 'simularea folosește adâncimea reală')
}

// gravura pe contur, făcută în afară, intră prima și în simulare
{
  const extra = { name: 'Gravură contur test', tool: findTool('vb60'), moves: Float64Array.from([0, 30, 20, 5, 2, 30, 20, -0.7, 1, 40, 20, -0.7, 0, 40, 20, 5]), stats: { cutDistanceMm: 10.7, rapidDistanceMm: 0, estimatedTimeMin: 0.1, minZ: -0.7, moveCount: 4 } }
  const o = runVectorCam({ mask, job, ops: { ...base, vcarve: { ...base.vcarve, enabled: false }, drill: { ...base.drill, enabled: true, manual: '5,5' } }, extraToolpaths: [extra] })
  ok(o.toolpaths[0] === extra && o.simDepthMm >= 5, `trasee din afară: primele, simularea până la ${o.simDepthMm} mm`)
}

// lista de găuri
const holes = parseHoleList('10, 10\n 190,5 ; 20\nx\n3.5 4,25')
ok(holes.length === 3 && holes[1].x === 190.5 && holes[2].y === 4.25, `coordonate citite: ${JSON.stringify(holes)}`)
const out3 = runVectorCam({ mask, job, ops: { ...base, vcarve: { ...base.vcarve, enabled: false }, drill: { ...base.drill, enabled: true, manual: '5,5\n55,35\n99,99' }, profile: { ...base.profile, enabled: true } } })
ok(out3.toolpaths[0].name.startsWith('Găurire') && out3.toolpaths[out3.toolpaths.length - 1].name.startsWith('Profil'), `ordinea: ${out3.toolpaths.map(t => t.name.split(' ')[0]).join(' → ')}`)
ok(out3.toolpaths[0].name.includes('2 găuri'), 'gaura din afara piesei e ignorată')

const empty = runVectorCam({ mask: { ...mask, data: new Uint8Array(w * h) }, job, ops: base })
ok(empty.toolpaths.length === 0 && empty.warnings.some(x => x.includes('Forma e goală')), 'formă goală: avertizare clară')

console.log(fails ? `\n${fails} verificări au picat` : '\nToate verificările au trecut')
process.exit(fails ? 1 : 0)
