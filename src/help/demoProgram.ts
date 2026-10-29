import { runCam } from '../cam/engine'
import { planOutputFiles, toolForFile } from '../cam/postProcessors'
import { buildProgram, type SimProgram } from '../cam/simulator'
import { findTool } from '../cam/toolLibrary'
import type { CamJob } from '../cam/types'
import { generateSampleIconCanvas } from '../utils/sampleImages'
import { processImageHeightmap } from '../utils/imageProcessing'

let cached: SimProgram | null = null

/** O icoană mică (60×84 mm), calculată cu motorul real, pentru simularea din lecții */
export function getDemoProgram(): SimProgram {
  if (cached) return cached
  const big = generateSampleIconCanvas('virginMary')
  const canvas = document.createElement('canvas')
  canvas.width = 180
  canvas.height = Math.round((180 * big.height) / big.width)
  canvas.getContext('2d')!.drawImage(big, 0, 0, canvas.width, canvas.height)

  const widthMm = 60
  const heightMm = Math.round((60 * canvas.height) / canvas.width)
  const { heightmapData, width, height } = processImageHeightmap(canvas, {
    widthMm, heightMm, maxDepthMm: 5, baseThicknessMm: 5, invert: false, contrast: 120, brightness: 0,
    gamma: 1.1, blurRadius: 1, edgeSharpen: 30, haloBoost: 40, frameStyle: 'simple', frameWidthMm: 5,
    reliefMode: 'smartIcon', macroDomeVolume: 75, microDetailStrength: 60, antiHoleProtection: 85,
    bgSeparationLevel: 70, facialSmoothing: 60
  })
  const job: CamJob = {
    widthMm, heightMm, maxDepthMm: 5, stockThicknessMm: 10, xyOrigin: 'bottomLeft', zZero: 'top',
    safeZMm: 4, rapidRateMmMin: 3000, roughingEnabled: true,
    roughingTool: { ...findTool('em3175'), stepDownMm: 2 }, roughingAllowanceMm: 0.4,
    finishingEnabled: true, finishingTool: { ...findTool('bn3175'), stepoverPercent: 15 }, finishStrategy: 'rasterX'
  }
  const out = runCam({ heightmap: heightmapData, imgW: width, imgH: height, job })
  const files = planOutputFiles(out.toolpaths, job, 'grbl', 'demo', true)
  cached = buildProgram(files.map(f => ({ name: f.name, text: f.render() })), job, (t, fi) => toolForFile(files[fi], t) ?? out.toolpaths[0].tool)
  return cached
}
