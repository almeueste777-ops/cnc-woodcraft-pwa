/**
 * Verificare simulator:  npx tsx tests/sim-check.ts
 * - fișierele noastre (pe toate posturile) trec fără coliziuni și cu relieful corect
 * - un fișier stricat intenționat e prins (rapid prin lemn, tăiere în masă, plonjeu adânc)
 * - arcele G2/G3 și unitățile în inch sunt citite corect
 */
import { runCam } from '../src/cam/engine'
import { planOutputFiles, POST_PROCESSORS, toolForFile } from '../src/cam/postProcessors'
import { findTool } from '../src/cam/toolLibrary'
import { buildProgram, StockSimulator } from '../src/cam/simulator'
import { parseGCode } from '../src/cam/gcodeParser'
import { splitIntoTiles } from '../src/cam/tiling'
import { archGeometry, cutoutOutline, offsetOutline } from '../src/cam/cutout'
import type { CamJob } from '../src/cam/types'

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`)
  if (!ok) failures++
}

const w = 200, h = 280
const hm = new Float32Array(w * h)
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const u = x / (w - 1), v = y / (h - 1)
  hm[y * w + x] = Math.max(0, 1 - ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 6) * 0.8 + 0.1
}
const job: CamJob = {
  widthMm: 100, heightMm: 140, maxDepthMm: 8, stockThicknessMm: 14,
  xyOrigin: 'center', zZero: 'bed', safeZMm: 5, rapidRateMmMin: 3000,
  roughingEnabled: true, roughingTool: findTool('em6'), roughingAllowanceMm: 0.5,
  finishingEnabled: true, finishingTool: findTool('bn3175'), finishStrategy: 'rasterX'
}
const out = runCam({ heightmap: hm, imgW: w, imgH: h, job })

for (const post of POST_PROCESSORS) {
  for (const separate of [true, false]) {
    const files = planOutputFiles(out.toolpaths, job, post.id, 't', separate)
    const prog = buildProgram(files.map(f => ({ name: f.name, text: f.render() })), job, (t, fi) => toolForFile(files[fi], t)!)
    const sim = new StockSimulator(prog)
    sim.runAll()
    const bad = sim.events.filter(e => e.kind !== 'toolChange')
    // adâncimea maximă tăiată trebuie să fie cea a reliefului
    let minZ = 0
    for (const v of sim.data) minZ = Math.min(minZ, v)
    const tag = `${post.name} (${files.length} fișier${files.length > 1 ? 'e' : ''})`
    check(bad.length === 0 && minZ > -job.maxDepthMm - 0.05 && minZ < -job.maxDepthMm * 0.5,
      `${tag}: ${prog.moves.length / 4} mișcări, ${(sim.totalTime / 60).toFixed(0)} min, adâncime ${minZ.toFixed(2)} mm${bad.length ? ' — ' + bad[0].message : ''}`)
    if (post.toolChange === 'separateFiles') break // la aceste posturi rezultatul e același
  }
}

// decupare arcadă cu punți: prin toată grosimea, fără probleme, punțile rămân
{
  const cj: CamJob = {
    ...job, xyOrigin: 'bottomLeft', zZero: 'top', finishStrategy: 'cross',
    cutout: { enabled: true, shape: 'arch', marginMm: 5, cornerRadiusMm: 10, tool: { ...findTool('em3175'), stepDownMm: 2 }, tabCount: 4, tabWidthMm: 6, tabHeightMm: 2 }
  }
  const o = runCam({ heightmap: hm, imgW: w, imgH: h, job: cj })
  const files = planOutputFiles(o.toolpaths, cj, 'grbl', 'c', true)
  const prog = buildProgram(files.map(f => ({ name: f.name, text: f.render() })), cj, (t, fi) => toolForFile(files[fi], t)!)
  // decuparea trebuie simulată cu freza ei (dreaptă), nu cu cea a traseului anterior
  const cutTool = prog.tools[prog.toolIdx[prog.moves.length / 4 - 1]]
  check(cutTool.id === cj.cutout!.tool.id, `decupare simulată cu freza corectă: ${cutTool.name}`)
  const sim = new StockSimulator(prog)
  sim.runAll()
  const bad = sim.events.filter(e => e.kind !== 'toolChange')
  // de-a lungul arcului (pe linia centrului frezei): tăiat complet; la punți rămân 2 mm;
  // iar sub arc (în piesă) relieful e neatins de decupare
  const { cx, yb, a, b } = archGeometry(cj)
  const R = cj.cutout!.tool.diameterMm / 2
  let through = 0, tabs = 0, other = 0
  for (let th = 0.05; th < Math.PI - 0.05; th += 0.01) {
    const nx0 = Math.cos(th) / a, ny0 = Math.sin(th) / b, nl = Math.hypot(nx0, ny0)
    const x = cx + a * Math.cos(th) + (R * nx0) / nl, y = yb + b * Math.sin(th) + (R * ny0) / nl
    const z = sim.heightAt(x, y)
    if (z <= -cj.stockThicknessMm) through++
    else if (Math.abs(z + cj.stockThicknessMm - 2) < 0.3) tabs++
    else other++
  }
  check(bad.length === 0 && through > 200 && tabs > 10 && other < 10,
    `decupare arcadă: ${files.length} fișiere, ${bad.length} probleme${bad.length ? ' — ' + bad[0].message : ''}; pe arc ${through} puncte tăiate complet, ${tabs} în punți, ${other} altfel`)
}

// împărțire pe plăci: 2×3 bucăți, simulate separat, lipite la loc = piesa întreagă
{
  const fullFiles = planOutputFiles(out.toolpaths, job, 'grbl', 'f', true)
  const full = new StockSimulator(buildProgram(fullFiles.map(f => ({ name: f.name, text: f.render() })), job, (t, fi) => toolForFile(fullFiles[fi], t)!))
  full.runAll()
  const tiles = splitIntoTiles(out.toolpaths, job, 60, 50)
  let worst = 0, problems = 0, firstProblem = ''
  for (const tile of tiles) {
    const files = planOutputFiles(tile.toolpaths, tile.job, 'grbl', `p${tile.index}`, true)
    const prog = buildProgram(files.map(f => ({ name: f.name, text: f.render() })), tile.job, (t, fi) => toolForFile(files[fi], t)!)
    const sim = new StockSimulator(prog)
    sim.runAll()
    const bad = sim.events.filter(e => e.kind !== 'toolChange' && e.kind !== 'outside')
    problems += bad.length
    if (bad.length && !firstProblem) firstProblem = `bucata ${tile.index}: ${bad[0].message}`
    // comparăm interiorul bucății (fără 3 mm la margini, unde freza depășește bucata)
    for (let y = tile.y0 + 3; y < tile.y0 + tile.heightMm - 3; y += 1.3) {
      for (let x = tile.x0 + 3; x < tile.x0 + tile.widthMm - 3; x += 1.3) {
        worst = Math.max(worst, Math.abs(sim.heightAt(x - tile.x0, y - tile.y0) - full.heightAt(x, y)))
      }
    }
  }
  check(problems === 0 && worst < 0.15,
    `împărțire în ${tiles.length} bucăți: ${problems} probleme${firstProblem ? ' — ' + firstProblem : ''}; diferență maximă față de piesa întreagă ${worst.toFixed(3)} mm`)
}

// plăci separate, lipite după: fiecare placă trebuie să fie completă PÂNĂ ÎN MUCHIE (la îmbinare),
// nu doar în interior. (Tăierea „o placă mutată” diferă doar pe pantele abrupte de lângă muchie;
// pe reliefuri line abaterea ei e tot mică — se afișează doar ca informație.)
{
  const fullFiles = planOutputFiles(out.toolpaths, job, 'grbl', 'f', true)
  const full = new StockSimulator(buildProgram(fullFiles.map(f => ({ name: f.name, text: f.render() })), job, (t, fi) => toolForFile(fullFiles[fi], t)!), 700_000)
  full.runAll()
  const seamError = (mode: 'separateBoards' | 'moveBoard') => {
    const tiles = splitIntoTiles(out.toolpaths, { ...job, tileMode: mode }, 60, 50)
    let worst = 0, problems = 0, firstProblem = ''
    for (const tile of tiles) {
      const files = planOutputFiles(tile.toolpaths, tile.job, 'grbl', `p${tile.index}`, true)
      const prog = buildProgram(files.map(f => ({ name: f.name, text: f.render() })), tile.job, (t, fi) => toolForFile(files[fi], t)!)
      const sim = new StockSimulator(prog, 300_000)
      sim.runAll()
      const bad = sim.events.filter(e => e.kind !== 'toolChange')
      problems += bad.length
      if (bad.length && !firstProblem) firstProblem = `placa ${tile.index}: ${bad[0].message}`
      // toată placa, inclusiv lângă muchii (0,3 mm de la margine)
      for (let y = tile.y0 + 0.3; y < tile.y0 + tile.heightMm - 0.3; y += 0.7) {
        for (let x = tile.x0 + 0.3; x < tile.x0 + tile.widthMm - 0.3; x += 0.7) {
          worst = Math.max(worst, Math.abs(sim.heightAt(x - tile.x0, y - tile.y0) - full.heightAt(x, y)))
        }
      }
    }
    return { worst, problems, firstProblem, n: tiles.length }
  }
  const sep = seamError('separateBoards'), mv = seamError('moveBoard')
  check(sep.problems === 0 && sep.worst < 0.2,
    `plăci separate (${sep.n}): ${sep.problems} probleme${sep.firstProblem ? ' — ' + sep.firstProblem : ''}; până în muchie diferă cu max ${sep.worst.toFixed(3)} mm (tăiate ca „o placă mutată”: ${mv.worst.toFixed(3)} mm)`)

  // pantă abruptă chiar pe îmbinare: aici se vede de ce plăcile separate trec peste muchie
  const steepW = 80, steepH = 40, imgW = 160, imgH = 80
  const hm = new Float32Array(imgW * imgH)
  for (let y = 0; y < imgH; y++) for (let x = 0; x < imgW; x++) hm[y * imgW + x] = Math.max(0, Math.min(1, 0.5 + (x - imgW / 2) / 12))
  const sj = { ...job, widthMm: steepW, heightMm: steepH, roughingEnabled: false, finishingTool: findTool('bn3175') }
  const steep = runCam({ heightmap: hm, imgW, imgH, job: sj })
  const steepFull = new StockSimulator(buildProgram(planOutputFiles(steep.toolpaths, sj, 'grbl', 's', true).map(f => ({ name: f.name, text: f.render() })), sj, () => sj.finishingTool), 300_000)
  steepFull.runAll()
  const seam = (mode: 'separateBoards' | 'moveBoard') => {
    let worst = 0
    for (const tile of splitIntoTiles(steep.toolpaths, { ...sj, tileMode: mode }, 40, 40)) {
      const files = planOutputFiles(tile.toolpaths, tile.job, 'grbl', 't', true)
      const sim = new StockSimulator(buildProgram(files.map(f => ({ name: f.name, text: f.render() })), tile.job, () => sj.finishingTool), 300_000)
      sim.runAll()
      for (let y = 2; y < steepH - 2; y += 0.5) for (let x = tile.x0 + 0.2; x < tile.x0 + tile.widthMm - 0.2; x += 0.2) {
        worst = Math.max(worst, Math.abs(sim.heightAt(x - tile.x0, y) - steepFull.heightAt(x, y)))
      }
    }
    return worst
  }
  const sepSteep = seam('separateBoards'), mvSteep = seam('moveBoard')
  check(sepSteep < 0.2, `pantă abruptă pe îmbinare: plăci separate diferă cu ${sepSteep.toFixed(3)} mm; tăiate ca „o placă mutată” ar lăsa ${mvSteep.toFixed(2)} mm`)
}

// decalajul conturului: centrul frezei nu se apropie de contur la mai puțin de R (colțuri drepte)
{
  const R = 3
  for (const corner of [0, 10]) {
    const settings = { enabled: true, shape: 'rounded' as const, marginMm: 10, cornerRadiusMm: corner, tool: findTool('em6'), tabCount: 0, tabWidthMm: 5, tabHeightMm: 2 }
    const { pts } = cutoutOutline(job, settings)
    const path = offsetOutline(pts, true, R)
    let minD = Infinity
    for (const [px, py] of path) for (let k = 0; k < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % pts.length]
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
      minD = Math.min(minD, Math.hypot(px - ax - t * dx, py - ay - t * dy))
    }
    check(minD > R - 0.01, `contur cu colțuri de rază ${corner} mm: distanța minimă freză–contur ${minD.toFixed(3)} mm (raza ${R})`)
  }
}

// fișier stricat intenționat: rapid prin lemn, plonjeu adânc, sub masă
{
  const bad = ['G21 G90', 'G0 Z5', 'G0 X10 Y10', 'G1 Z-9 F300', 'G0 X40 Y10', 'G1 Z-20 F300', 'G0 Z5', 'M30'].join('\n')
  const j = { ...job, xyOrigin: 'bottomLeft' as const, zZero: 'top' as const }
  const prog = buildProgram([{ name: 'rau.nc', text: bad }], j, () => findTool('em3175'))
  const sim = new StockSimulator(prog)
  sim.runAll()
  const kinds = new Set(sim.events.map(e => e.kind))
  check(kinds.has('collision') && kinds.has('deepPlunge') && kinds.has('spoilboard'),
    `fișier greșit prins: ${sim.events.map(e => e.kind + '@L' + (e.line + 1)).join(', ')}`)

  // redare lentă (ca la 1×, cadru cu cadru): trebuie să prindă aceleași probleme
  const slow = new StockSimulator(prog)
  for (let t = 0; t <= slow.totalTime; t += 1 / 60) {
    const p = slow.positionAt(t)
    slow.advanceTo(p.move, p.frac)
  }
  const slowKinds = new Set(slow.events.map(e => e.kind))
  check(slowKinds.has('collision') && slowKinds.has('deepPlunge') && slowKinds.has('spoilboard'),
    `redare lentă cadru cu cadru prinde: ${[...slowKinds].join(', ')}`)
}

// G0 înapoi prin șanțul abia tăiat: pe același loc NU e coliziune (oricare freză, oricare rețea);
// deplasat lateral cu 1 mm în peretele de lemn ESTE coliziune (la densitatea verificării complete)
{
  const j = { ...job, widthMm: 300, heightMm: 400, xyOrigin: 'bottomLeft' as const, zZero: 'top' as const }
  const groove = (y0: number, d: number) => ['G21 G90', 'G0 Z5', `G0 X20 Y${y0}`, 'G1 Z-3 F300', `G1 X280 Y${y0} F1000`, `G0 X30 Y${(y0 + d).toFixed(3)}`, 'G0 Z5', 'M30'].join('\n')
  const collides = (tool: string, cells: number, y0: number, d: number) => {
    const s = new StockSimulator(buildProgram([{ name: 'g.nc', text: groove(y0, d) }], j, () => findTool(tool)), cells)
    s.runAll()
    return s.events.some(e => e.kind === 'collision')
  }
  let falseAlarms = 0, missed = 0, total = 0
  for (const tool of ['em6', 'em3175', 'bn2', 'bn1', 'vb60']) {
    for (const cells of [120_000, 220_000, 400_000]) for (const y0 of [100, 100.37, 100.71]) {
      total++
      if (collides(tool, cells, y0, 0)) falseAlarms++
    }
    for (const y0 of [100, 100.37, 100.71]) if (!collides(tool, 400_000, y0, 1)) missed++
  }
  check(falseAlarms === 0 && missed === 0, `G0 prin șanț: ${falseAlarms}/${total} alarme false, ${missed}/15 coliziuni de 1 mm ratate`)
}

// arce și inch
{
  const p = parseGCode('G20 G90\nG0 X0 Y0 Z0.1\nG1 Z-0.04 F20\nG2 X0 Y0 I1 J0\nG3 X2 Y0 R1')
  const m = p.moves
  let maxDist = 0
  for (let k = 0; k < m.length; k += 4) if (m[k] !== 0) maxDist = Math.max(maxDist, Math.hypot(m[k + 1] - 25.4, m[k + 2]))
  const last = [m[m.length - 3], m[m.length - 2]]
  check(Math.abs(maxDist - 25.4) < 0.05 && Math.abs(last[0] - 50.8) < 0.01 && Math.abs(last[1]) < 0.01,
    `arc G2 complet în inch: rază ${maxDist.toFixed(2)} mm (cerut 25.40); arc G3 cu R termină la X${last[0].toFixed(2)}`)
}

console.log(failures ? `\n${failures} verificări au picat` : '\nToate verificările au trecut')
process.exit(failures ? 1 : 0)
