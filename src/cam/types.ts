// Tipuri pentru motorul CAM (scule, job, trasee, post-procesoare)
import type { CutoutSettings } from './cutout'

// taperedball = freză conică cu vârf sferic (detalii fine la icoane, flancuri rezistente)
export type CutterShape = 'ballnose' | 'endmill' | 'vbit' | 'taperedball'

export interface CamTool {
  id: string
  name: string
  shape: CutterShape
  diameterMm: number       // diametrul tijei / al părții tăietoare
  tipAngleDeg: number      // V-bit și conică: unghiul INCLUS al conului (ex. 15°)
  tipDiameterMm?: number   // conică-sferică: diametrul vârfului sferic (ex. 0.5)
  stepoverPercent: number
  stepDownMm: number
  feedRateMmMin: number
  plungeRateMmMin: number
  spindleRpm: number
  toolNumber: number       // T# pentru mașinile cu schimbător
}

export type XYOrigin = 'bottomLeft' | 'center' | 'topLeft'
export type ZZero = 'top' | 'bed'
export type FinishStrategy = 'rasterX' | 'rasterY' | 'cross'

export interface CamJob {
  widthMm: number
  heightMm: number
  maxDepthMm: number
  stockThicknessMm: number
  xyOrigin: XYOrigin
  zZero: ZZero
  safeZMm: number
  rapidRateMmMin: number   // doar pentru estimarea timpului

  roughingEnabled: boolean
  roughingTool: CamTool
  roughingAllowanceMm: number

  finishingEnabled: boolean
  finishingTool: CamTool
  finishStrategy: FinishStrategy

  cutout?: CutoutSettings

  // cursa utilă a mașinii; dacă piesa e mai mare, se împarte pe bucăți (0 = nelimitat)
  bedXMm?: number
  bedYMm?: number
  // împărțire cerută de mână (0 / lipsă = cât cere cursa mașinii); nu scade sub cât e nevoie
  tileCols?: number
  tileRows?: number
  // moveBoard = o singură placă, mutată sub mașină; separateBoards = plăci separate, lipite după
  tileMode?: TileMode
}

export type TileMode = 'moveBoard' | 'separateBoards'

// Mișcări: plat [tip, x, y, z, ...], tip 0 = rapid, 1 = avans lucru, 2 = coborâre
export const MOVE_RAPID = 0
export const MOVE_FEED = 1
export const MOVE_PLUNGE = 2

export interface Toolpath {
  name: string
  tool: CamTool
  moves: Float64Array
  stats: ToolpathStats
}

export interface ToolpathStats {
  cutDistanceMm: number
  rapidDistanceMm: number
  estimatedTimeMin: number
  minZ: number
  moveCount: number
}

export interface SimulationResult {
  // Înălțimi normalizate 0..1 (rândul 0 = sus), gata pentru generateReliefMesh
  heightmap: Float32Array
  width: number
  height: number
}

export type PostId =
  | 'grbl'
  | 'fluidnc'
  | 'mach3'
  | 'linuxcnc'
  | 'uccnc'
  | 'marlin'
  | 'richauto'
  | 'weihong'
  | 'iso'
