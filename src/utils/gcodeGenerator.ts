import type { ToolSettings, GCodeStats } from '../types/cnc'
import type { VectorContour } from './vectorizer'

// Folosit doar pentru gravura LASER (GRBL, M4 cu putere dinamică).
// Frezarea (relief 3D și gravură cu freză) trece prin src/cam: motor CAM + post-procesoare.

export interface GCodeOutput {
  gcode: string
  stats: GCodeStats
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
