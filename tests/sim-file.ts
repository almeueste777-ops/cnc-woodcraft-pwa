// Verifică un fișier G-code oarecare în simulator, din linia de comandă:
//   npx tsx tests/sim-file.ts fisier.nc [latime] [inaltime] [grosime] [bottomLeft|center|topLeft] [top|bed] [idFreza]
import { readFileSync } from 'node:fs'
import { buildProgram, StockSimulator } from '../src/cam/simulator'
import { findTool } from '../src/cam/toolLibrary'
import type { CamJob } from '../src/cam/types'

const [file, w = '200', h = '300', t = '22', origin = 'bottomLeft', zz = 'top', toolId = 'bn3175'] = process.argv.slice(2)
const tool = findTool(toolId)
const job: CamJob = {
  widthMm: Number(w), heightMm: Number(h), maxDepthMm: Number(t), stockThicknessMm: Number(t),
  xyOrigin: origin as CamJob['xyOrigin'], zZero: zz as CamJob['zZero'], safeZMm: 5, rapidRateMmMin: 3000,
  roughingEnabled: false, roughingTool: tool, roughingAllowanceMm: 0, finishingEnabled: true, finishingTool: tool, finishStrategy: 'rasterX'
}
const prog = buildProgram([{ name: file, text: readFileSync(file, 'utf8') }], job, () => tool)
const sim = new StockSimulator(prog)
sim.runAll()
console.log(`${prog.moves.length / 4} mișcări, ${(sim.totalTime / 60).toFixed(0)} min`)
for (const e of sim.events) console.log(`[${e.kind}] ${e.message}`)
if (!sim.events.length) console.log('Nicio problemă.')
