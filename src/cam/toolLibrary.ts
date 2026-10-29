import type { CamTool } from './types'

// Valori de pornire pentru lemn de esență moale/medie (tei, paltin, cireș) pe router de hobby.
// Pentru stejar/nuc scădeți avansul cu ~20%.
export const TOOL_LIBRARY: CamTool[] = [
  { id: 'em6', name: 'Freză dreaptă 6 mm', shape: 'endmill', diameterMm: 6, tipAngleDeg: 0, stepoverPercent: 40, stepDownMm: 3, feedRateMmMin: 2000, plungeRateMmMin: 500, spindleRpm: 18000, toolNumber: 1 },
  { id: 'em3175', name: 'Freză dreaptă 3.175 mm (1/8")', shape: 'endmill', diameterMm: 3.175, tipAngleDeg: 0, stepoverPercent: 40, stepDownMm: 1.5, feedRateMmMin: 1500, plungeRateMmMin: 400, spindleRpm: 18000, toolNumber: 2 },
  { id: 'em4', name: 'Freză dreaptă 4 mm', shape: 'endmill', diameterMm: 4, tipAngleDeg: 0, stepoverPercent: 40, stepDownMm: 2, feedRateMmMin: 1700, plungeRateMmMin: 450, spindleRpm: 18000, toolNumber: 3 },
  { id: 'bn3175', name: 'Sferică 3.175 mm (R1.59)', shape: 'ballnose', diameterMm: 3.175, tipAngleDeg: 0, stepoverPercent: 10, stepDownMm: 1.5, feedRateMmMin: 2000, plungeRateMmMin: 500, spindleRpm: 18000, toolNumber: 4 },
  { id: 'bn2', name: 'Sferică 2 mm (R1)', shape: 'ballnose', diameterMm: 2, tipAngleDeg: 0, stepoverPercent: 10, stepDownMm: 1, feedRateMmMin: 1600, plungeRateMmMin: 400, spindleRpm: 20000, toolNumber: 5 },
  { id: 'bn1', name: 'Sferică 1 mm (R0.5) — detalii fine', shape: 'ballnose', diameterMm: 1, tipAngleDeg: 0, stepoverPercent: 12, stepDownMm: 0.5, feedRateMmMin: 1200, plungeRateMmMin: 300, spindleRpm: 22000, toolNumber: 6 },
  { id: 'bn6', name: 'Sferică 6 mm (R3)', shape: 'ballnose', diameterMm: 6, tipAngleDeg: 0, stepoverPercent: 10, stepDownMm: 3, feedRateMmMin: 2400, plungeRateMmMin: 600, spindleRpm: 16000, toolNumber: 7 },
  // conice cu vârf sferic: tija de 3.175 mm, conul și vârful modelate exact
  { id: 'tb05', name: 'Conică sferică R0.25, 15° (icoane: chipuri, mâini)', shape: 'taperedball', diameterMm: 3.175, tipAngleDeg: 15, tipDiameterMm: 0.5, stepoverPercent: 15, stepDownMm: 0.5, feedRateMmMin: 1500, plungeRateMmMin: 300, spindleRpm: 22000, toolNumber: 12 },
  { id: 'tb1', name: 'Conică sferică R0.5, 10° (detalii, rezistentă)', shape: 'taperedball', diameterMm: 3.175, tipAngleDeg: 10, tipDiameterMm: 1, stepoverPercent: 12, stepDownMm: 0.8, feedRateMmMin: 1800, plungeRateMmMin: 350, spindleRpm: 20000, toolNumber: 13 },
  { id: 'tbn05', name: 'Sferică 0.5 mm (R0.25) — micro-detalii', shape: 'ballnose', diameterMm: 0.5, tipAngleDeg: 0, stepoverPercent: 15, stepDownMm: 0.3, feedRateMmMin: 1000, plungeRateMmMin: 250, spindleRpm: 22000, toolNumber: 8 },
  { id: 'vb30', name: 'V-bit 30°', shape: 'vbit', diameterMm: 3.175, tipAngleDeg: 30, stepoverPercent: 8, stepDownMm: 1, feedRateMmMin: 1500, plungeRateMmMin: 400, spindleRpm: 20000, toolNumber: 9 },
  { id: 'vb60', name: 'V-bit 60°', shape: 'vbit', diameterMm: 6, tipAngleDeg: 60, stepoverPercent: 8, stepDownMm: 1.5, feedRateMmMin: 1800, plungeRateMmMin: 450, spindleRpm: 18000, toolNumber: 10 },
  { id: 'vb90', name: 'V-bit 90°', shape: 'vbit', diameterMm: 6, tipAngleDeg: 90, stepoverPercent: 8, stepDownMm: 1.5, feedRateMmMin: 1800, plungeRateMmMin: 450, spindleRpm: 18000, toolNumber: 11 }
]

export function findTool(id: string): CamTool {
  return { ...(TOOL_LIBRARY.find(t => t.id === id) ?? TOOL_LIBRARY[0]) }
}
