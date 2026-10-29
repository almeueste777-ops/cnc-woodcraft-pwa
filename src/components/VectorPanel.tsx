import React from 'react'
import type { CamJob } from '../cam/types'
import type { VectorOps } from '../cam/vectorJob'
import { FONTS, type ShapeSource, type TextSpec } from '../utils/shapeMask'
import { NumField, ToolEditor } from './CamPanel'
import { Type, PenTool, Square, CircleDot, Drill } from 'lucide-react'

interface Props {
  job: CamJob
  source: ShapeSource
  onSourceChange: (s: ShapeSource) => void
  threshold: number
  onThresholdChange: (v: number) => void
  invertImage: boolean
  onInvertImageChange: (v: boolean) => void
  text: TextSpec
  onTextChange: (t: TextSpec) => void
  ops: VectorOps
  onOpsChange: (o: VectorOps) => void
  maskUrl: string | null
}

const boxCls = 'bg-[#141312] p-3 rounded-xl border border-[#2e2a24] flex flex-col gap-2'
const titleCls = 'text-xs font-bold text-amber-400 flex items-center gap-1.5'
const inputCls = 'w-full bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white text-xs'
const btn = (on: boolean) => `py-1.5 px-2 rounded-lg text-[11px] font-bold border ${on ? 'bg-amber-600 border-amber-500 text-white' : 'bg-[#201d19] border-[#383228] text-stone-300'}`

const Ramp: React.FC<{ value: { enabled: boolean; angleDeg: number }; onChange: (v: { enabled: boolean; angleDeg: number }) => void }> = ({ value, onChange }) => (
  <div className="flex items-end gap-2">
    <label className="flex items-center gap-1.5 text-[11px] text-stone-300 pb-1.5">
      <input type="checkbox" checked={value.enabled} onChange={e => onChange({ ...value, enabled: e.target.checked })} className="accent-amber-500" />
      Intrare în rampă (nu înfige freza vertical)
    </label>
    {value.enabled && <div className="w-28"><NumField label="Unghi rampă (°)" value={value.angleDeg} min={1} max={45} onChange={v => onChange({ ...value, angleDeg: Math.max(1, Math.min(45, v)) })} /></div>}
  </div>
)

export const VectorPanel: React.FC<Props> = props => {
  const { job, ops, onOpsChange, text, onTextChange } = props
  const set = <K extends keyof VectorOps>(k: K, patch: Partial<VectorOps[K]>) => onOpsChange({ ...ops, [k]: { ...ops[k], ...patch } })
  const setText = (patch: Partial<TextSpec>) => onTextChange({ ...text, ...patch })
  const usesText = props.source !== 'image'
  const usesImage = props.source !== 'text'

  return (
    <>
      <div className={boxCls}>
        <span className={titleCls}><Type className="w-4 h-4" /> Forma de prelucrat</span>
        <div className="grid grid-cols-3 gap-1.5">
          {([['image', 'Din imagine'], ['text', 'Text'], ['both', 'Imagine + text']] as const).map(([id, label]) => (
            <button key={id} onClick={() => props.onSourceChange(id)} className={btn(props.source === id)}>{label}</button>
          ))}
        </div>
        {usesImage && (
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
              <span className="flex justify-between"><span>Prag: ce e mai întunecat devine formă</span><span className="font-mono text-stone-200">{props.threshold}</span></span>
              <input type="range" min={5} max={250} value={props.threshold} onChange={e => props.onThresholdChange(Number(e.target.value))} className="accent-amber-500" />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-stone-300">
              <input type="checkbox" checked={props.invertImage} onChange={e => props.onInvertImageChange(e.target.checked)} className="accent-amber-500" />
              Invers (partea luminoasă e forma)
            </label>
          </div>
        )}
        {usesText && (
          <div className="flex flex-col gap-1.5">
            <textarea value={text.text} onChange={e => setText({ text: e.target.value })} rows={2} placeholder="Scrie textul (Enter = rând nou)" className={`${inputCls} font-serif text-sm`} />
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
                <span>Font</span>
                <select value={text.font} onChange={e => setText({ font: e.target.value })} className={inputCls}>
                  {FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </label>
              <NumField label="Înălțime litere (mm)" value={text.sizeMm} step={1} min={2} onChange={v => setText({ sizeMm: Math.max(2, v) })} />
            </div>
            <div className="flex gap-3 text-[11px] text-stone-300">
              <label className="flex items-center gap-1"><input type="checkbox" checked={text.bold} onChange={e => setText({ bold: e.target.checked })} className="accent-amber-500" /> Îngroșat</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={text.italic} onChange={e => setText({ italic: e.target.checked })} className="accent-amber-500" /> Înclinat</label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <NumField label="Centru X (mm)" value={Math.round(text.xFrac * job.widthMm)} step={1} onChange={v => setText({ xFrac: Math.max(0, Math.min(1, v / job.widthMm)) })} />
              <NumField label="Centru Y de sus (mm)" value={Math.round(text.yFrac * job.heightMm)} step={1} onChange={v => setText({ yFrac: Math.max(0, Math.min(1, v / job.heightMm)) })} />
              <NumField label="Spațiu rânduri" value={text.lineSpacing} step={0.1} min={0.6} onChange={v => setText({ lineSpacing: Math.max(0.6, v) })} />
            </div>
          </div>
        )}
        {props.maskUrl && (
          <img src={props.maskUrl} alt="Forma de prelucrat" className="w-full rounded-lg border border-[#3a352c] self-center" style={{ maxWidth: 420, imageRendering: 'auto' }} />
        )}
        <span className="text-[10px] text-stone-500">Zona chihlimbarie e forma pe care lucrează V-carve, buzunarul și profilul.</span>
      </div>

      <div className={boxCls}>
        <label className={`${titleCls} cursor-pointer`}>
          <input type="checkbox" checked={ops.vcarve.enabled} onChange={e => set('vcarve', { enabled: e.target.checked })} className="accent-amber-500" />
          <PenTool className="w-4 h-4" /> V-carve (litere și ornamente sculptate în V)
        </label>
        {ops.vcarve.enabled && (
          <>
            <ToolEditor tool={ops.vcarve.tool} onChange={t => set('vcarve', { tool: t })} allowed={['vbit']} />
            <NumField label="Adâncime plată maximă (mm, 0 = fără limită)" value={ops.vcarve.flatDepthMm} step={0.5} min={0} onChange={v => set('vcarve', { flatDepthMm: Math.max(0, v) })} hint="părțile late se sapă până aici cu fund plat, nu în V adânc" />
            {ops.vcarve.flatDepthMm > 0 && (
              <>
                <label className="flex items-center gap-1.5 text-[11px] text-stone-300">
                  <input type="checkbox" checked={!!ops.vcarve.clearEnabled} onChange={e => set('vcarve', { clearEnabled: e.target.checked, clearTool: ops.vcarve.clearTool ?? ops.pocket.tool })} className="accent-amber-500" />
                  Golire fund plat cu freză dreaptă (mult mai repede la litere late și suprafețe mari)
                </label>
                {ops.vcarve.clearEnabled && (
                  <ToolEditor tool={ops.vcarve.clearTool ?? ops.pocket.tool} onChange={t => set('vcarve', { clearTool: t })} allowed={['endmill']} />
                )}
              </>
            )}
            <span className="text-[10px] text-stone-500">
              Freza în V coboară mai adânc unde forma e mai lată și urcă în colțuri: muchiile literelor ies ascuțite, ca la sculptura de mână.
            </span>
          </>
        )}
      </div>

      <div className={boxCls}>
        <label className={`${titleCls} cursor-pointer`}>
          <input type="checkbox" checked={ops.pocket.enabled} onChange={e => set('pocket', { enabled: e.target.checked })} className="accent-amber-500" />
          <Square className="w-4 h-4" /> Buzunar (golește forma până la un fund plat)
        </label>
        {ops.pocket.enabled && (
          <>
            <ToolEditor tool={ops.pocket.tool} onChange={t => set('pocket', { tool: t })} allowed={['endmill']} />
            <NumField label="Adâncime buzunar (mm)" value={ops.pocket.depthMm} step={0.5} min={0.1} onChange={v => set('pocket', { depthMm: Math.max(0.1, v) })} />
            <Ramp value={ops.pocket.ramp} onChange={r => set('pocket', { ramp: r })} />
          </>
        )}
      </div>

      <div className={boxCls}>
        <label className={`${titleCls} cursor-pointer`}>
          <input type="checkbox" checked={ops.profile.enabled} onChange={e => set('profile', { enabled: e.target.checked })} className="accent-amber-500" />
          <CircleDot className="w-4 h-4" /> Profil (decupare pe contur, cu punți)
        </label>
        {ops.profile.enabled && (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {([['outside', 'Pe dinafară'], ['inside', 'Pe dinăuntru'], ['on', 'Pe linie']] as const).map(([id, label]) => (
                <button key={id} onClick={() => set('profile', { side: id })} className={btn(ops.profile.side === id)}>{label}</button>
              ))}
            </div>
            <ToolEditor tool={ops.profile.tool} onChange={t => set('profile', { tool: t })} allowed={['endmill']} />
            <NumField label="Adâncime (mm)" value={ops.profile.depthMm} step={0.5} min={0.1} onChange={v => set('profile', { depthMm: Math.max(0.1, v) })} hint={`lemnul are ${job.stockThicknessMm} mm; pentru decupare pune ${(job.stockThicknessMm + 0.3).toFixed(1)}`} />
            <div className="grid grid-cols-3 gap-2">
              <NumField label="Punți pe contur" value={ops.profile.tabs.count} min={0} max={12} onChange={v => set('profile', { tabs: { ...ops.profile.tabs, count: Math.max(0, Math.round(v)) } })} />
              <NumField label="Lățime punte (mm)" value={ops.profile.tabs.widthMm} step={0.5} min={1} onChange={v => set('profile', { tabs: { ...ops.profile.tabs, widthMm: Math.max(1, v) } })} />
              <NumField label="Grosime punte (mm)" value={ops.profile.tabs.heightMm} step={0.5} min={0.5} onChange={v => set('profile', { tabs: { ...ops.profile.tabs, heightMm: Math.max(0.5, v) } })} />
            </div>
            <Ramp value={ops.profile.ramp} onChange={r => set('profile', { ramp: r })} />
          </>
        )}
      </div>

      <div className={boxCls}>
        <label className={`${titleCls} cursor-pointer`}>
          <input type="checkbox" checked={ops.drill.enabled} onChange={e => set('drill', { enabled: e.target.checked })} className="accent-amber-500" />
          <Drill className="w-4 h-4" /> Găurire (cu retrageri pentru așchii)
        </label>
        {ops.drill.enabled && (
          <>
            <ToolEditor tool={ops.drill.tool} onChange={t => set('drill', { tool: t })} allowed={['endmill']} showStepDown={false} />
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Adâncime gaură (mm)" value={ops.drill.depthMm} step={0.5} min={0.1} onChange={v => set('drill', { depthMm: Math.max(0.1, v) })} />
              <NumField label="Coborâre pe pas (mm, 0 = dintr-o dată)" value={ops.drill.peckMm} step={0.5} min={0} onChange={v => set('drill', { peckMm: Math.max(0, v) })} />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-stone-300">
              <input type="checkbox" checked={ops.drill.fromShapes} onChange={e => set('drill', { fromShapes: e.target.checked })} className="accent-amber-500" />
              Găurește în centrul formelor mici (puncte, cercuri) de până la
              <input type="number" min={0.5} step={0.5} value={ops.drill.maxHoleMm} onChange={e => set('drill', { maxHoleMm: Math.max(0.5, Number(e.target.value) || 0.5) })} className="w-16 bg-[#201d19] border border-[#3a352c] rounded px-1 text-white font-mono" /> mm
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
              <span>Găuri la coordonate (câte una pe rând: X, Y în mm de la colțul stânga-jos)</span>
              <textarea value={ops.drill.manual} onChange={e => set('drill', { manual: e.target.value })} rows={3} placeholder={'10, 10\n190, 10'} className={`${inputCls} font-mono`} />
            </label>
          </>
        )}
      </div>
    </>
  )
}
