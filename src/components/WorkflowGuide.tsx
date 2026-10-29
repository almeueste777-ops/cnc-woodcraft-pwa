import React from 'react'
import type { AppMode } from '../types/cnc'
import type { LessonId } from '../help/knowledge'
import { Check, GraduationCap } from 'lucide-react'

export interface WorkflowState {
  hasImage: boolean
  hasToolpaths: boolean
  simulatedOk: boolean
  connected: boolean
  running: boolean
}

interface Step {
  title: string
  hint: string
  mode: AppMode
  lesson: LessonId
  done: (s: WorkflowState) => boolean
}

const STEPS: Step[] = [
  { title: 'Învață', hint: 'Lecția 1: drumul complet', mode: 'tutorials', lesson: 'intro', done: () => false },
  { title: 'Imaginea', hint: 'Încarcă icoana sau un STL', mode: 'relief3d', lesson: 'image', done: s => s.hasImage },
  { title: 'Trasee', hint: 'Mașina, frezele, Calculează', mode: 'relief3d', lesson: 'toolpaths', done: s => s.hasToolpaths },
  { title: 'Simulare', hint: 'Verifică fără probleme', mode: 'simulator', lesson: 'simulate', done: s => s.simulatedOk },
  { title: 'Mașina', hint: 'Prinde lemnul, conectează', mode: 'controller', lesson: 'machine-setup', done: s => s.connected },
  { title: 'Origine', hint: 'X0 Y0 și Z0 cu hârtia', mode: 'controller', lesson: 'zeroing', done: s => s.running },
  { title: 'Pornește', hint: 'Lista de verificare, Start', mode: 'relief3d', lesson: 'run', done: s => s.running }
]

export const WorkflowGuide: React.FC<{ state: WorkflowState; mode: AppMode; onNavigate: (m: AppMode) => void; onOpenLesson: (id: LessonId) => void }> = ({ state, mode, onNavigate, onOpenLesson }) => {
  // pasul recomandat = primul nefăcut (fără „Învață”, care rămâne mereu la îndemână)
  const current = STEPS.findIndex((s, i) => i > 0 && !s.done(state))
  return (
    <div className="bg-[#1a1815] border border-[#2f2b26] rounded-xl p-2 flex gap-1 overflow-x-auto" aria-label="Ghid pas cu pas">
      {STEPS.map((s, i) => {
        const done = s.done(state)
        const isCurrent = i === current
        return (
          <div key={s.title} className={`flex-1 min-w-[120px] rounded-lg px-2 py-1.5 border ${isCurrent ? 'border-amber-500 bg-amber-600/15' : done ? 'border-emerald-900 bg-emerald-950/30' : 'border-[#2e2a24]'}`}>
            <button onClick={() => onNavigate(s.mode)} className="w-full text-left">
              <div className={`text-[11px] font-bold flex items-center gap-1 ${isCurrent ? 'text-amber-300' : done ? 'text-emerald-300' : 'text-stone-300'}`}>
                <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${done ? 'bg-emerald-600 text-white' : isCurrent ? 'bg-amber-600 text-white' : 'bg-[#2a2620] text-stone-400'}`}>
                  {done ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                {s.title}{mode === s.mode && i > 0 ? ' •' : ''}
              </div>
              <div className="text-[10px] text-stone-500 leading-tight">{s.hint}</div>
            </button>
            <button onClick={() => onOpenLesson(s.lesson)} className="text-[10px] text-amber-500 hover:text-amber-300 flex items-center gap-0.5 mt-0.5">
              <GraduationCap className="w-3 h-3" /> lecția
            </button>
          </div>
        )
      })}
    </div>
  )
}
