export type AppMode = 'relief3d' | 'engrave2d' | 'controller' | 'tutorials' | 'export'

export type WoodTextureType = 'lime' | 'oak' | 'walnut' | 'cherry' | 'wireframe'

export interface ImageProcessingOptions {
  widthMm: number           // Dimensiune fizică pe X (mm)
  heightMm: number          // Dimensiune fizică pe Y (mm)
  maxDepthMm: number        // Adâncime maximă sculptură (mm, ex: 15mm)
  baseThicknessMm: number   // Grosime bază lemn suport (mm, ex: 5mm)
  invert: boolean           // Negativ / Pozitiv (înnegrit = adânc sau ieșit în relief)
  contrast: number          // 0 - 200
  brightness: number        // -100 - 100
  gamma: number             // 0.2 - 3.0
  blurRadius: number        // Netezire lemn (pentru a elimina zgomotul de pixeli la frezare)
  edgeSharpen: number       // Accentuare contururi fine (cute veșminte, barbă, ochi)
  haloBoost: number         // Ridicare nimb / aură icoană (0 - 100)
  frameStyle: 'none' | 'simple' | 'arch' | 'ornate' // Ramă clasică sau arcadă/boltă de icoană
  frameWidthMm: number      // Lățime ramă exterioară
}

export type ToolType = 'ballnose' | 'endmill' | 'vbit' | 'laser'

export interface ToolSettings {
  toolType: ToolType
  toolDiameterMm: number    // Diametru freză (ex: 3.175mm, 4mm, 6mm, 1mm)
  tipAngleDeg: number       // Pentru V-bit (ex: 30, 60, 90 grade)
  stepoverPercent: number   // Pas lateral freză (ex: 10% pentru sferică = finisare fină)
  feedRateMmMin: number     // Viteză avans lucru (ex: 1500 mm/min)
  plungeRateMmMin: number   // Viteză pătrundere Z (ex: 300 mm/min)
  safeZMm: number           // Z de siguranță deasupra piesei (ex: 5mm)
  spindleRpm: number        // Turație freză (ex: 18000 RPM)
  laserPowerMax: number     // Putere laser S (ex: 1000)
  roughingPass: boolean     // Degroșare prealabilă cu freză dreaptă
  roughingStepDownMm: number// Pas pe adâncime la degroșare
  carvingStrategy: 'rasterX' | 'rasterY' | 'cross'
}

export interface CNCStatus {
  connected: boolean
  isSimulated: boolean
  portName?: string
  state: 'Idle' | 'Run' | 'Hold' | 'Alarm' | 'Door' | 'Check' | 'Home' | 'Sleep' | 'Disconnected'
  mPos: { x: number; y: number; z: number }
  wPos: { x: number; y: number; z: number }
  feedRate: number
  spindleSpeed: number
  bufferFree?: number
}

export interface GCodeStats {
  totalLines: number
  estimatedTimeMin: number
  boundsMm: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
  totalDistanceMm: number
}
