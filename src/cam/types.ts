// Tipuri pentru motorul CAM (scule, job, trasee, post-procesoare)

export type CutterShape = 'ballnose' | 'endmill' | 'vbit'

export interface CamTool {
  id: string
  name: string
  shape: CutterShape
  diameterMm: number
  tipAngleDeg: number      // doar pentru V-bit
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
}

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
