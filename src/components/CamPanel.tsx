import React from 'react'
import type { CamJob, CamTool, PostId, Toolpath, XYOrigin } from '../cam/types'
import { POST_PROCESSORS, getPost } from '../cam/postProcessors'
import { TOOL_LIBRARY, findTool } from '../cam/toolLibrary'
import { Wrench, Clock, Play, Download, Settings2, AlertTriangle, Cpu, Loader2, X } from 'lucide-react'

export interface CamRunState {
  running: boolean
  stage: string
  fraction: number
  error: string | null
  warnings: string[]
  stale: boolean
}

interface CamPanelProps {
  mode: 'relief3d' | 'engrave2d'
  job: CamJob
  onJobChange: (job: CamJob) => void
  postId: PostId
  onPostChange: (id: PostId) => void
  forceSeparate: boolean
  onForceSeparateChange: (v: boolean) => void
  engraveDepthMm: number
  onEngraveDepthChange: (v: number) => void
  engraveTool: CamTool
  onEngraveToolChange: (t: CamTool) => void
  useLaser: boolean
  onUseLaserChange: (v: boolean) => void
  laserPower: number
  onLaserPowerChange: (v: number) => void
  runState: CamRunState
  toolpaths: Toolpath[]
  outputFiles: Array<{ name: string }>
  onCompute: () => void
  onCancel: () => void
  onDownload: (index: number) => void
  onSendToCNC: (index: number) => void
  isCNCConnected: boolean
  isStreaming: boolean
}

const inputCls = 'w-full bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white font-mono text-xs'
const boxCls = 'bg-[#141312] p-3 rounded-xl border border-[#2e2a24] flex flex-col gap-2'
const titleCls = 'text-xs font-bold text-amber-400 flex items-center gap-1.5'

const fmtTime = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`

const NumField: React.FC<{ label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; hint?: string }> = ({ label, value, onChange, step = 1, min, max, hint }) => (
  <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
    <span>{label}</span>
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : 0}
      onChange={e => {
        const v = Number(e.target.value)
        if (Number.isFinite(v)) onChange(v)
      }}
      className={inputCls}
    />
    {hint && <span className="text-[10px] text-stone-500">{hint}</span>}
  </label>
)

const ToolEditor: React.FC<{ tool: CamTool; onChange: (t: CamTool) => void; allowed?: CamTool['shape'][]; showStepDown?: boolean }> = ({ tool, onChange, allowed, showStepDown = true }) => {
  const choices = TOOL_LIBRARY.filter(t => !allowed || allowed.includes(t.shape))
  const set = (patch: Partial<CamTool>) => onChange({ ...tool, ...patch, id: 'custom' })
  return (
    <div className="flex flex-col gap-2">
      <select
        value={choices.some(t => t.id === tool.id) ? tool.id : 'custom'}
        onChange={e => e.target.value !== 'custom' && onChange(findTool(e.target.value))}
        className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white text-xs"
      >
        {choices.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        <option value="custom">Personalizată: {tool.shape} D{tool.diameterMm}</option>
      </select>
      <div className="grid grid-cols-3 gap-2">
        <NumField label="Diametru (mm)" value={tool.diameterMm} step={0.1} min={0.1} onChange={v => set({ diameterMm: Math.max(0.1, v) })} />
        {tool.shape === 'vbit'
          ? <NumField label="Unghi vârf (°)" value={tool.tipAngleDeg} min={10} max={150} onChange={v => set({ tipAngleDeg: v })} />
          : <NumField label="Pas lateral (%)" value={tool.stepoverPercent} min={2} max={90} onChange={v => set({ stepoverPercent: Math.max(2, v) })} />}
        {showStepDown
          ? <NumField label="Pas Z (mm)" value={tool.stepDownMm} step={0.1} min={0.1} onChange={v => set({ stepDownMm: Math.max(0.1, v) })} />
          : <NumField label="Nr. sculă T" value={tool.toolNumber} min={1} onChange={v => set({ toolNumber: Math.max(1, Math.round(v)) })} />}
        {tool.shape === 'vbit' && <NumField label="Pas lateral (%)" value={tool.stepoverPercent} min={2} max={90} onChange={v => set({ stepoverPercent: Math.max(2, v) })} />}
        <NumField label="Avans (mm/min)" value={tool.feedRateMmMin} step={100} min={10} onChange={v => set({ feedRateMmMin: Math.max(10, v) })} />
        <NumField label="Coborâre (mm/min)" value={tool.plungeRateMmMin} step={50} min={10} onChange={v => set({ plungeRateMmMin: Math.max(10, v) })} />
        <NumField label="Turație (RPM)" value={tool.spindleRpm} step={1000} min={0} onChange={v => set({ spindleRpm: Math.max(0, v) })} />
      </div>
      <span className="text-[10px] text-stone-500">
        Pas lateral real: {((tool.diameterMm * tool.stepoverPercent) / 100).toFixed(2)} mm
      </span>
    </div>
  )
}

const ORIGINS: Array<{ id: XYOrigin; label: string }> = [
  { id: 'bottomLeft', label: 'Stânga-jos' },
  { id: 'center', label: 'Centru' },
  { id: 'topLeft', label: 'Stânga-sus' }
]

export const CamPanel: React.FC<CamPanelProps> = props => {
  const { job, onJobChange, runState, toolpaths, mode } = props
  const post = getPost(props.postId)
  const setJob = (patch: Partial<CamJob>) => onJobChange({ ...job, ...patch })
  const totalMin = toolpaths.reduce((s, t) => s + t.stats.estimatedTimeMin, 0)
  const hasResult = toolpaths.length > 0 && !runState.stale

  return (
    <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4 text-stone-200 flex flex-col gap-3 shadow-xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
          <Wrench className="w-4 h-4" />
          Trasee CNC (CAM)
        </span>
        {runState.running ? (
          <button onClick={props.onCancel} className="text-xs bg-stone-700 hover:bg-stone-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <X className="w-3.5 h-3.5" /> Anulează
          </button>
        ) : (
          <button onClick={props.onCompute} className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg transition shadow-md flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5" />
            {toolpaths.length && runState.stale ? 'Recalculează traseele' : 'Calculează traseele'}
          </button>
        )}
      </div>

      {/* Mașina */}
      <div className={boxCls}>
        <span className={titleCls}><Cpu className="w-4 h-4" /> Mașina / controlerul tău</span>
        <select
          value={props.postId}
          onChange={e => props.onPostChange(e.target.value as PostId)}
          className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white text-xs"
        >
          {POST_PROCESSORS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="text-[10px] text-stone-500">
          {post.description}. Fișier .{post.extension}
          {post.toolChange === 'separateFiles' ? ', câte un fișier pentru fiecare freză' : ', schimbare sculă cu M6'}.
        </span>
        {post.toolChange === 'M6' && (
          <label className="flex items-center gap-2 text-[11px] text-stone-300">
            <input type="checkbox" checked={!props.forceSeparate} onChange={e => props.onForceSeparateChange(!e.target.checked)} className="accent-amber-500" />
            Un singur fișier cu M6 + G43 (doar dacă ai schimbător automat sau lungimile frezelor în tabela de scule)
          </label>
        )}
      </div>

      {/* Piesa și originea */}
      <div className={boxCls}>
        <span className={titleCls}>Origine și siguranță</span>
        <div className="grid grid-cols-3 gap-1.5">
          {ORIGINS.map(o => (
            <button
              key={o.id}
              onClick={() => setJob({ xyOrigin: o.id })}
              className={`py-1.5 rounded-lg text-[11px] font-bold border ${job.xyOrigin === o.id ? 'bg-amber-600 border-amber-500 text-white' : 'bg-[#201d19] border-[#383228] text-stone-300'}`}
            >
              X0Y0: {o.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
            <span>Z0 este pe</span>
            <select value={job.zZero} onChange={e => setJob({ zZero: e.target.value as CamJob['zZero'] })} className="bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white text-xs">
              <option value="top">Fața lemnului</option>
              <option value="bed">Masa mașinii</option>
            </select>
          </label>
          <NumField label="Z siguranță (mm)" value={job.safeZMm} step={0.5} min={1} onChange={v => setJob({ safeZMm: v })} />
          <NumField label="Viteză rapid (mm/min)" value={job.rapidRateMmMin} step={500} min={100} onChange={v => setJob({ rapidRateMmMin: Math.max(100, v) })} hint="doar pt. estimare timp" />
        </div>
        <span className="text-[10px] text-stone-500">
          Lemn: {job.widthMm} × {job.heightMm} × {job.stockThicknessMm} mm (din dimensiunile piesei). Fundul reliefului la −{job.maxDepthMm} mm.
        </span>
      </div>

      {mode === 'relief3d' ? (
        <>
          <div className={boxCls}>
            <label className={`${titleCls} cursor-pointer`}>
              <input type="checkbox" checked={job.roughingEnabled} onChange={e => setJob({ roughingEnabled: e.target.checked })} className="accent-amber-500" />
              1. Degroșare pe niveluri (scoate grosul de material)
            </label>
            {job.roughingEnabled && (
              <>
                <ToolEditor tool={job.roughingTool} onChange={t => setJob({ roughingTool: t })} allowed={['endmill', 'ballnose']} />
                <NumField label="Adaos lăsat pentru finisare (mm)" value={job.roughingAllowanceMm} step={0.1} min={0} onChange={v => setJob({ roughingAllowanceMm: Math.max(0, v) })} />
              </>
            )}
          </div>

          <div className={boxCls}>
            <label className={`${titleCls} cursor-pointer`}>
              <input type="checkbox" checked={job.finishingEnabled} onChange={e => setJob({ finishingEnabled: e.target.checked })} className="accent-amber-500" />
              2. Finisare 3D (suprafața finală)
            </label>
            {job.finishingEnabled && (
              <>
                <ToolEditor tool={job.finishingTool} onChange={t => setJob({ finishingTool: t })} showStepDown={false} />
                <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
                  <span>Strategie</span>
                  <select value={job.finishStrategy} onChange={e => setJob({ finishStrategy: e.target.value as CamJob['finishStrategy'] })} className="bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white text-xs">
                    <option value="rasterX">Raster pe X (zig-zag orizontal)</option>
                    <option value="rasterY">Raster pe Y (zig-zag vertical)</option>
                    <option value="cross">Încrucișat X + Y (cea mai fină suprafață, timp dublu)</option>
                  </select>
                </label>
              </>
            )}
          </div>
        </>
      ) : (
        <div className={boxCls}>
          <span className={titleCls}>Gravură pe contur</span>
          <label className="flex items-center gap-2 text-[11px] text-stone-300">
            <input type="checkbox" checked={props.useLaser} onChange={e => props.onUseLaserChange(e.target.checked)} className="accent-amber-500" />
            Laser (GRBL, mod M4) în loc de freză
          </label>
          {props.useLaser ? (
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Putere laser S" value={props.laserPower} step={50} min={1} onChange={props.onLaserPowerChange} hint="$30 din GRBL (de obicei 1000)" />
              <NumField label="Viteză (mm/min)" value={props.engraveTool.feedRateMmMin} step={100} min={10} onChange={v => props.onEngraveToolChange({ ...props.engraveTool, feedRateMmMin: v })} />
            </div>
          ) : (
            <>
              <ToolEditor tool={props.engraveTool} onChange={props.onEngraveToolChange} />
              <NumField label="Adâncime gravură (mm)" value={props.engraveDepthMm} step={0.1} min={0.05} onChange={v => props.onEngraveDepthChange(Math.max(0.05, v))} hint="se taie în treceri de „Pas Z”" />
            </>
          )}
        </div>
      )}

      {/* Progres / erori / avertizări */}
      {runState.running && (
        <div className="bg-[#141312] p-3 rounded-xl border border-amber-900/40 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <Loader2 className="w-4 h-4 animate-spin" /> {runState.stage}
          </div>
          <div className="h-1.5 bg-[#2a2620] rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.round(runState.fraction * 100)}%` }} />
          </div>
        </div>
      )}
      {runState.error && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-800/50 rounded-lg p-2">{runState.error}</div>
      )}
      {runState.warnings.map(w => (
        <div key={w} className="text-xs text-amber-200 bg-amber-950/40 border border-amber-700/50 rounded-lg p-2 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" /> {w}
        </div>
      ))}
      {toolpaths.length > 0 && runState.stale && !runState.running && (
        <div className="text-xs text-stone-300 bg-[#141312] border border-[#3a352c] rounded-lg p-2">
          Ai schimbat imaginea sau parametrii — traseele de mai jos sunt vechi. Apasă „Recalculează traseele”.
        </div>
      )}

      {hasResult && (
        <div className="bg-[#141312] p-3 rounded-xl border border-amber-900/40 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-bold text-amber-400">
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> Timp total estimat</span>
            <span className="text-base text-amber-300 font-mono">{fmtTime(totalMin)}</span>
          </div>
          <table className="w-full text-[11px] text-stone-300">
            <tbody>
              {toolpaths.map(tp => (
                <tr key={tp.name} className="border-t border-[#2e2a24]">
                  <td className="py-1">{tp.name}</td>
                  <td className="py-1 text-right font-mono">{(tp.stats.cutDistanceMm / 1000).toFixed(1)} m</td>
                  <td className="py-1 text-right font-mono text-amber-300">{fmtTime(tp.stats.estimatedTimeMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasResult && (
        <div className="flex flex-col gap-2">
          {props.outputFiles.map((f, i) => (
            <div key={f.name} className="flex gap-2">
              <button
                onClick={() => props.onDownload(i)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3d362c] text-stone-200 py-2 rounded-lg text-xs font-bold transition"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                {props.outputFiles.length > 1 ? `${i + 1}. ` : ''}{f.name}
              </button>
              <button
                onClick={() => props.onSendToCNC(i)}
                disabled={!props.isCNCConnected || props.isStreaming}
                title={props.isCNCConnected ? 'Trimite direct la CNC prin USB' : 'Conectați întâi CNC-ul (sus, dreapta)'}
                className="px-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> USB
              </button>
            </div>
          ))}
          {props.outputFiles.length > 1 && (
            <span className="text-[10px] text-stone-400">
              Rulați fișierele în ordine. Între ele: montați freza următoare și refaceți doar Z0 (nu mutați X0/Y0).
            </span>
          )}
        </div>
      )}
    </div>
  )
}
