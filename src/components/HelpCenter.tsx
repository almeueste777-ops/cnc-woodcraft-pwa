import React, { useMemo, useState } from 'react'
import { PROBLEMS, GRBL_ERRORS, GRBL_ALARMS, searchProblems, explainControllerLine, type LessonId, type Problem, type ControllerCode } from '../help/knowledge'
import { Search, LifeBuoy, GraduationCap, ChevronDown, ChevronRight, Terminal } from 'lucide-react'

const CATEGORIES: Array<{ id: Problem['category'] | 'all'; label: string }> = [
  { id: 'all', label: 'Toate' },
  { id: 'surface', label: 'Suprafața piesei' },
  { id: 'tool', label: 'Freza' },
  { id: 'machine', label: 'Mașina' },
  { id: 'connection', label: 'Conexiune USB' },
  { id: 'software', label: 'Aplicația / fișierul' },
  { id: 'safety', label: 'Siguranță' }
]

export const CodeCard: React.FC<{ code: ControllerCode; onOpenLesson?: (id: LessonId) => void }> = ({ code, onOpenLesson }) => (
  <div className="bg-[#141312] border border-red-900/50 rounded-xl p-3 flex flex-col gap-1.5">
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs bg-red-900/60 text-red-100 px-2 py-0.5 rounded">{code.code}</span>
      <span className="text-sm font-bold text-white">{code.short}</span>
    </div>
    <p className="text-xs text-stone-300">{code.explanation}</p>
    <ol className="list-decimal list-inside text-xs text-stone-200 flex flex-col gap-0.5">
      {code.fixes.map(f => <li key={f}>{f}</li>)}
    </ol>
    {code.lessonId && onOpenLesson && (
      <button onClick={() => onOpenLesson(code.lessonId!)} className="self-start text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1">
        <GraduationCap className="w-3.5 h-3.5" /> Vezi lecția care explică
      </button>
    )}
  </div>
)

const ProblemCard: React.FC<{ p: Problem; open: boolean; onToggle: () => void; onOpenLesson: (id: LessonId) => void }> = ({ p, open, onToggle, onOpenLesson }) => (
  <div className="bg-[#141312] border border-[#2e2a24] rounded-xl">
    <button onClick={onToggle} className="w-full text-left p-3 flex items-center gap-2">
      {open ? <ChevronDown className="w-4 h-4 text-amber-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-stone-500 shrink-0" />}
      <span className="text-sm font-bold text-stone-100">{p.title}</span>
    </button>
    {open && (
      <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-amber-400 font-bold mb-1">Ce vezi</div>
          <ul className="list-disc list-inside text-stone-300 flex flex-col gap-0.5">{p.symptoms.map(s => <li key={s}>{s}</li>)}</ul>
        </div>
        <div>
          <div className="text-amber-400 font-bold mb-1">De ce se întâmplă</div>
          <ul className="list-disc list-inside text-stone-300 flex flex-col gap-0.5">{p.causes.map(s => <li key={s}>{s}</li>)}</ul>
        </div>
        <div>
          <div className="text-emerald-400 font-bold mb-1">Cum rezolvi</div>
          <ol className="list-decimal list-inside text-stone-100 flex flex-col gap-0.5">{p.fixes.map(s => <li key={s}>{s}</li>)}</ol>
          {p.lessonId && (
            <button onClick={() => onOpenLesson(p.lessonId!)} className="mt-2 text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5" /> Vezi lecția
            </button>
          )}
        </div>
      </div>
    )}
  </div>
)

export const HelpCenter: React.FC<{ onOpenLesson: (id: LessonId) => void; initialQuery?: string }> = ({ onOpenLesson, initialQuery = '' }) => {
  const [query, setQuery] = useState(initialQuery)
  const [cat, setCat] = useState<Problem['category'] | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [machineLine, setMachineLine] = useState('')

  const results = useMemo(() => {
    const base = query.trim() ? searchProblems(query) : PROBLEMS
    return cat === 'all' ? base : base.filter(p => p.category === cat)
  }, [query, cat])

  const explained = machineLine.trim() ? explainControllerLine(machineLine.trim()) : null
  const allCodes = [...Object.values(GRBL_ALARMS), ...Object.values(GRBL_ERRORS)]

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4 flex flex-col gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><LifeBuoy className="w-5 h-5 text-amber-500" /> Probleme & Soluții</h2>
        <p className="text-xs text-stone-400">Scrie ce vezi sau ce auzi („arde”, „trepte”, „s-a mutat”, „nu se mișcă”), sau lipește mesajul primit de la mașină.</p>
        <div className="flex items-center gap-2 bg-[#100f0e] border border-[#3a352c] rounded-lg px-3">
          <Search className="w-4 h-4 text-stone-500" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ex: freza arde lemnul" className="flex-1 bg-transparent py-2 text-sm text-white outline-none" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)} className={`px-2.5 py-1 rounded-lg text-xs font-bold ${cat === c.id ? 'bg-amber-600 text-white' : 'bg-[#221f1b] text-stone-300'}`}>{c.label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-2">
          {results.length === 0 && <div className="text-sm text-stone-400">Nimic găsit. Încearcă alte cuvinte.</div>}
          {results.map(p => (
            <ProblemCard key={p.id} p={p} open={openId === p.id || results.length === 1} onToggle={() => setOpenId(openId === p.id ? null : p.id)} onOpenLesson={onOpenLesson} />
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-3 flex flex-col gap-2">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5"><Terminal className="w-4 h-4" /> Mesaj de la mașină</span>
            <input value={machineLine} onChange={e => setMachineLine(e.target.value)} placeholder="ex: ALARM:2 sau error:20" className="bg-[#100f0e] border border-[#3a352c] rounded px-2 py-1.5 font-mono text-sm text-white" />
            {machineLine.trim() && !explained && <span className="text-xs text-stone-400">Nu recunosc mesajul. Scrie-l exact cum apare (ex. „error:9”).</span>}
            {explained && <CodeCard code={explained} onOpenLesson={onOpenLesson} />}
          </div>
          <details className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-3">
            <summary className="text-xs font-bold text-stone-300 cursor-pointer">Toate codurile GRBL ({allCodes.length})</summary>
            <div className="flex flex-col gap-1 mt-2 max-h-96 overflow-auto">
              {allCodes.map(c => (
                <button key={c.code} onClick={() => setMachineLine(c.code)} className="text-left text-[11px] text-stone-300 hover:text-amber-300">
                  <span className="font-mono text-stone-500 inline-block w-16">{c.code}</span>{c.short}
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
