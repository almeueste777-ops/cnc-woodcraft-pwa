/** Bucăți mici de interfață comune atelierului hărții (cutii, titluri, butoane, glisoare) */
import React from 'react'

export const boxCls = 'bg-[#141312] p-3 rounded-xl border border-[#2e2a24] flex flex-col gap-2'
export const titleCls = 'text-xs font-bold text-amber-400 flex items-center gap-1.5'
export const btn = (on: boolean) => `px-2 py-1 rounded-md text-[11px] font-bold border ${on ? 'bg-amber-600 border-amber-500 text-white' : 'bg-[#201d19] border-[#383228] text-stone-300 hover:bg-[#2a2620]'}`

export const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; shown?: string; title?: string }> = ({ label, value, min, max, step, onChange, shown, title }) => (
  <label className="flex flex-col gap-0.5 text-[11px] text-stone-400" title={title}>
    <span className="flex justify-between"><span>{label}</span><span className="text-stone-200 font-mono">{shown ?? value}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="accent-amber-500" />
  </label>
)
