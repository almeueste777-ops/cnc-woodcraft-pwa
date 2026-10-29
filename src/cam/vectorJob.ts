/**
 * Lucrările vectoriale ale unei piese (ca în V-Carve Pro): V-carve, buzunar, profil, găuri
 * și gravura pe contur, toate pe aceeași formă (masca), în ordinea în care se lucrează:
 * găuri → buzunar → V-carve → profil (decuparea la final, ca piesa să stea prinsă cât se lucrează).
 */
import type { CamJob, CamTool, Toolpath, SimulationResult } from './types'
import { simulateMaterialRemoval, toolProfile } from './engine'
import { depthCapRadius, drillToolpath, maskFromHoles, pocketToolpath, profileToolpath, vcarveToolpath, type ShapeMask } from './vectorCam'

export interface RampSettings { enabled: boolean; angleDeg: number }

export interface VectorOps {
  vcarve: { enabled: boolean; tool: CamTool; flatDepthMm: number; clearEnabled?: boolean; clearTool?: CamTool }
  pocket: { enabled: boolean; tool: CamTool; depthMm: number; ramp: RampSettings }
  profile: {
    enabled: boolean
    tool: CamTool
    side: 'outside' | 'inside' | 'on'
    depthMm: number
    tabs: { count: number; widthMm: number; heightMm: number }
    ramp: RampSettings
  }
  drill: { enabled: boolean; tool: CamTool; depthMm: number; peckMm: number; fromShapes: boolean; maxHoleMm: number; manual: string }
}

// extraToolpaths: trasee făcute în afară (gravura pe contur), puse primele și incluse în simulare
export interface VectorInput { mask: ShapeMask; job: CamJob; ops: VectorOps; extraToolpaths?: Toolpath[] }
export interface VectorOutput { toolpaths: Toolpath[]; simulation: SimulationResult | null; simDepthMm: number; warnings: string[] }

/** „x, y” pe fiecare rând (mm, de la colțul stânga-jos al piesei) */
export function parseHoleList(text: string): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  for (const line of (text ?? '').split(/\r?\n/)) {
    const m = line.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)$/)
    if (m) out.push({ x: Number(m[1].replace(',', '.')), y: Number(m[2].replace(',', '.')) })
  }
  return out
}

export function runVectorCam(input: VectorInput, onProgress: (stage: string, fraction: number) => void = () => {}): VectorOutput {
  const { mask, job, ops } = input
  const toolpaths: Toolpath[] = [...(input.extraToolpaths ?? [])]
  const warnings: string[] = []
  let deepest = toolpaths.reduce((m, t) => Math.max(m, -t.stats.minZ), 0)
  let any = false
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) { any = true; break }

  if (ops.drill.enabled) {
    onProgress('Găuri', 0)
    const pts = [
      ...(ops.drill.fromShapes && any ? maskFromHoles(mask, ops.drill.maxHoleMm).map(h => ({ x: h.x, y: h.y })) : []),
      ...parseHoleList(ops.drill.manual).filter(p => p.x >= 0 && p.y >= 0 && p.x <= job.widthMm && p.y <= job.heightMm)
    ]
    if (pts.length) {
      toolpaths.push(drillToolpath(pts, ops.drill.tool, job, { depthMm: ops.drill.depthMm, peckMm: ops.drill.peckMm }))
      deepest = Math.max(deepest, ops.drill.depthMm)
    } else warnings.push('Găuri: n-am găsit nicio gaură (nici forme mici, nici coordonate scrise).')
  }

  if (!any && (ops.pocket.enabled || ops.vcarve.enabled || ops.profile.enabled)) {
    warnings.push('Forma e goală: scrie un text sau alege pragul imaginii ca să apară forma (zona chihlimbarie din previzualizare).')
  } else {
    if (ops.pocket.enabled) {
      onProgress('Buzunar', 0.2)
      const tp = pocketToolpath(mask, ops.pocket.tool, job, { depthMm: ops.pocket.depthMm, ramp: ops.pocket.ramp })
      if (tp.moves.length > 8) { toolpaths.push(tp); deepest = Math.max(deepest, ops.pocket.depthMm) }
      else warnings.push(`Buzunar: freza de ${ops.pocket.tool.diameterMm} mm nu încape nicăieri în formă — alege o freză mai subțire.`)
    }
    if (ops.vcarve.enabled) {
      const flat = ops.vcarve.flatDepthMm > 0 ? ops.vcarve.flatDepthMm : 0
      let clearR: number | undefined
      if (flat > 0 && ops.vcarve.clearEnabled && ops.vcarve.clearTool) {
        // ca la V-Carve Pro: freza dreaptă golește fundul plat; adaosul pe pereți = cât ocupă peretele în V
        // (Dcap), deci discul ei nu atinge niciodată peretele. V-bit-ul curăță apoi doar colțurile
        // fundului în care discul rotund nu intră
        onProgress('V-carve: golire fund plat', 0.35)
        const Dcap = depthCapRadius(ops.vcarve.tool, flat)
        // fundul real = cât ajunge V-bit-ul la Dcap (mai puțin decât „flat” dacă tăișul e prea scurt)
        const floor = Math.min(flat, toolProfile(ops.vcarve.tool, Dcap))
        const ct = ops.vcarve.clearTool
        const tp = pocketToolpath(mask, ct, job, { depthMm: floor, finishAllowanceMm: Dcap, ramp: { enabled: true, angleDeg: 5 } })
        if (tp.moves.length > 8) {
          toolpaths.push({ ...tp, name: `V-carve: golire fund plat ${ct.name}` })
          clearR = ct.diameterMm / 2
          deepest = Math.max(deepest, floor)
        }
        if (floor < flat - 1e-6) warnings.push(`V-carve: V-bit-ul de ${ops.vcarve.tool.diameterMm} mm ajunge doar la ${floor.toFixed(2)} mm adâncime, nu la ${flat} mm; fundul plat e la ${floor.toFixed(2)} mm.`)
      }
      onProgress('V-carve', 0.45)
      const tp = vcarveToolpath(mask, ops.vcarve.tool, job, { flatDepthMm: flat || undefined, flatClearToolRadiusMm: clearR })
      toolpaths.push(tp)
      deepest = Math.max(deepest, -tp.stats.minZ)
      if (tp.stats.estimatedTimeMin > 180 && !clearR) {
        warnings.push(`V-carve durează ~${Math.round(tp.stats.estimatedTimeMin / 60)} ore: forma are suprafețe late pe care V-bit-ul le curăță în treceri foarte dese. Pune o „adâncime plată maximă” și bifează „golire fund plat cu freză dreaptă”.`)
      }
    }
    if (ops.profile.enabled) {
      onProgress('Profil', 0.7)
      const tp = profileToolpath(mask, ops.profile.tool, job, {
        side: ops.profile.side,
        depthMm: ops.profile.depthMm,
        tabs: ops.profile.tabs.count > 0 ? ops.profile.tabs : undefined,
        ramp: ops.profile.ramp
      })
      toolpaths.push(tp)
      deepest = Math.max(deepest, ops.profile.depthMm)
      if (ops.profile.depthMm >= job.stockThicknessMm && ops.profile.tabs.count < 2) {
        warnings.push('Profil prin toată placa cu mai puțin de 2 punți: piesa se poate desprinde și smulge la final.')
      }
    }
  }

  for (const tp of toolpaths) {
    if (-tp.stats.minZ > job.stockThicknessMm + 0.5) warnings.push(`${tp.name}: coboară la ${(-tp.stats.minZ).toFixed(1)} mm, mai mult decât grosimea lemnului (${job.stockThicknessMm} mm).`)
  }
  if (job.safeZMm < 1) warnings.push('Z de siguranță sub 1 mm — risc de lovire a piesei la deplasări rapide.')

  onProgress('Simulare material', 0.9)
  const simDepthMm = Math.max(0.5, deepest)
  const simulation = toolpaths.length ? simulateMaterialRemoval(toolpaths, { ...job, maxDepthMm: simDepthMm }) : null
  onProgress('Gata', 1)
  return { toolpaths, simulation, simDepthMm, warnings }
}
