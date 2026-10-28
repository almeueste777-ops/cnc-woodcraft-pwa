import type { ImageProcessingOptions, ToolSettings, GCodeStats } from '../types/cnc'
import type { VectorContour } from './vectorizer'
import { sampleBicubicHeight } from './surfaceInterpolation'

export interface GCodeOutput {
  gcode: string
  stats: GCodeStats
}

/**
 * Generează G-Code profesional pentru sculptură 3D de relief în lemn
 * Folosește interpolare sub-pixel bicubică pentru ca freza să alunece lin
 * fără vibrații, trepte de pixel sau socuri pe motoarele pas-cu-pas.
 */
export function generate3DReliefGCode(
  heightmap: Float32Array,
  imgWidth: number,
  imgHeight: number,
  imgOptions: ImageProcessingOptions,
  toolSettings: ToolSettings
): GCodeOutput {
  const { widthMm, heightMm, maxDepthMm } = imgOptions
  const {
    toolDiameterMm,
    stepoverPercent,
    feedRateMmMin,
    plungeRateMmMin,
    safeZMm,
    spindleRpm,
    carvingStrategy
  } = toolSettings

  const stepoverMm = Math.max(0.08, (toolDiameterMm * (stepoverPercent / 100)))
  // Rezoluție puncte fină de-a lungul fiecărei linii (0.25mm)
  const samplePitchMm = Math.max(0.18, toolDiameterMm * 0.12)

  const lines: string[] = []
  let totalDistance = 0
  let curX = 0
  let curY = 0
  let curZ = safeZMm

  // Header G-Code standard industrial
  lines.push('; ======================================================')
  lines.push('; CNC WoodCraft Studio - 3D Continuous Spline Carving')
  lines.push(`; Dimensiuni lemn: ${widthMm} x ${heightMm} x ${maxDepthMm} mm`)
  lines.push(`; Scula: ${toolSettings.toolType} D=${toolDiameterMm}mm, Pas lateral=${stepoverMm.toFixed(2)}mm (${stepoverPercent}%)`)
  lines.push(`; Viteza avans: ${feedRateMmMin} mm/min, Z-plunge: ${plungeRateMmMin} mm/min`)
  lines.push('; Interpolare: Sub-pixel Bicubic Catmull-Rom (Fara trepte de pixel)')
  lines.push('; ======================================================')
  lines.push('G21 ; Unitati milimetri')
  lines.push('G90 ; Coordonate absolute')
  lines.push('G17 ; Plan de lucru XY')
  lines.push(`M3 S${spindleRpm} ; Pornire arbore principal / freza`)
  lines.push(`G4 P1.5 ; Pauza 1.5s accelerare rotatie`)
  lines.push(`G0 Z${safeZMm.toFixed(3)} ; Ridicare siguranta`)

  let minZ = 0
  let maxZ = safeZMm

  // Interpolare continuă zecimală sub-pixel
  const getZAt = (xMm: number, yMm: number): number => {
    const nx = Math.max(0, Math.min(1, xMm / widthMm))
    const ny = Math.max(0, Math.min(1, 1 - (yMm / heightMm)))
    const norm = sampleBicubicHeight(heightmap, imgWidth, imgHeight, nx, ny)
    const z = - (1.0 - norm) * maxDepthMm
    return Math.round(z * 1000) / 1000
  }

  // Strategie X-Raster (Zig-zag continuu)
  if (carvingStrategy === 'rasterX' || carvingStrategy === 'cross') {
    const numYPasses = Math.ceil(heightMm / stepoverMm)
    const numXPoints = Math.ceil(widthMm / samplePitchMm)

    let reverse = false

    for (let py = 0; py <= numYPasses; py++) {
      const y = Math.min(heightMm, py * stepoverMm)

      const startX = reverse ? widthMm : 0
      const endX = reverse ? 0 : widthMm

      if (py === 0) {
        lines.push(`G0 X${startX.toFixed(3)} Y${y.toFixed(3)}`)
        const zFirst = getZAt(startX, y)
        lines.push(`G1 Z${zFirst.toFixed(3)} F${plungeRateMmMin}`)
        curX = startX
        curY = y
        curZ = zFirst
      } else {
        const zNext = getZAt(curX, y)
        lines.push(`G1 Y${y.toFixed(3)} Z${zNext.toFixed(3)} F${feedRateMmMin}`)
        curY = y
        curZ = zNext
      }

      for (let px = 1; px <= numXPoints; px++) {
        const t = px / numXPoints
        const x = startX + (endX - startX) * t
        const z = getZAt(x, y)

        if (z < minZ) minZ = z
        totalDistance += Math.hypot(x - curX, y - curY, z - curZ)

        lines.push(`G1 X${x.toFixed(3)} Z${z.toFixed(3)} F${feedRateMmMin}`)
        curX = x
        curZ = z
      }

      reverse = !reverse
    }
  }

  lines.push(`G0 Z${safeZMm.toFixed(3)} ; Retragere siguranta`)
  lines.push(`G0 X0 Y0 ; Revenire la zero piesa`)
  lines.push('M5 ; Oprire arbore')
  lines.push('M30 ; Sfarsit program')

  const averageFeed = feedRateMmMin * 0.85
  const estimatedTimeMin = Math.round((totalDistance / averageFeed) * 10) / 10

  return {
    gcode: lines.join('\n'),
    stats: {
      totalLines: lines.length,
      estimatedTimeMin,
      boundsMm: {
        minX: 0,
        maxX: widthMm,
        minY: 0,
        maxY: heightMm,
        minZ,
        maxZ
      },
      totalDistanceMm: Math.round(totalDistance)
    }
  }
}

/**
 * Generează G-Code pentru gravură vectorială 2D/2.5D (contururi SVG/DXF)
 */
export function generateVectorEngraveGCode(
  contours: VectorContour[],
  toolSettings: ToolSettings,
  engraveDepthMm = 0.5,
  useLaser = false
): GCodeOutput {
  const {
    feedRateMmMin,
    plungeRateMmMin,
    safeZMm,
    spindleRpm,
    laserPowerMax
  } = toolSettings

  const lines: string[] = []
  let totalDistance = 0
  let curX = 0
  let curY = 0

  lines.push('; ======================================================')
  lines.push(`; CNC WoodCraft Studio - Vector Engraving (${useLaser ? 'Laser' : 'Mecanic/Router'})`)
  lines.push(`; Numar contururi: ${contours.length}`)
  lines.push(`; Viteza: ${feedRateMmMin} mm/min`)
  lines.push('; ======================================================')
  lines.push('G21 ; Milimetri')
  lines.push('G90 ; Coordonate absolute')

  if (!useLaser) {
    lines.push(`M3 S${spindleRpm} ; Pornire freza`)
    lines.push('G4 P1.5')
    lines.push(`G0 Z${safeZMm.toFixed(3)}`)
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

  for (const c of contours) {
    if (c.points.length < 2) continue

    const p0 = c.points[0]
    lines.push(`G0 X${p0.x.toFixed(3)} Y${p0.y.toFixed(3)}`)
    totalDistance += Math.hypot(p0.x - curX, p0.y - curY)
    curX = p0.x
    curY = p0.y

    if (useLaser) {
      lines.push(`M4 S${laserPowerMax}`)
    } else {
      lines.push(`G1 Z${(-Math.abs(engraveDepthMm)).toFixed(3)} F${plungeRateMmMin}`)
    }

    for (let i = 1; i < c.points.length; i++) {
      const p = c.points[i]
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)

      totalDistance += Math.hypot(p.x - curX, p.y - curY)
      lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} F${feedRateMmMin}`)
      curX = p.x
      curY = p.y
    }

    if (c.isClosed) {
      totalDistance += Math.hypot(p0.x - curX, p0.y - curY)
      lines.push(`G1 X${p0.x.toFixed(3)} Y${p0.y.toFixed(3)} F${feedRateMmMin}`)
      curX = p0.x
      curY = p0.y
    }

    if (useLaser) {
      lines.push('M5')
    } else {
      lines.push(`G0 Z${safeZMm.toFixed(3)}`)
    }
  }

  lines.push('G0 X0 Y0')
  lines.push('M5')
  lines.push('M30')

  const estimatedTimeMin = Math.round((totalDistance / feedRateMmMin) * 10) / 10

  return {
    gcode: lines.join('\n'),
    stats: {
      totalLines: lines.length,
      estimatedTimeMin,
      boundsMm: {
        minX: minX === Infinity ? 0 : minX,
        maxX: maxX === -Infinity ? 0 : maxX,
        minY: minY === Infinity ? 0 : minY,
        maxY: maxY === -Infinity ? 0 : maxY,
        minZ: useLaser ? 0 : -engraveDepthMm,
        maxZ: safeZMm
      },
      totalDistanceMm: Math.round(totalDistance)
    }
  }
}
