import React, { useEffect, useRef, useState } from 'react'
import type { CamJob, CamTool, Toolpath, XYOrigin } from '../cam/types'
import { toolForFile, type PlannedFile } from '../cam/postProcessors'
import { buildProgram, type SimProgram } from '../cam/simulator'
import { TOOL_LIBRARY, findTool } from '../cam/toolLibrary'
import { MachineSimulator } from './MachineSimulator'
import { FileCode2, Loader2, Upload } from 'lucide-react'

export interface SimSet {
  label: string
  job: CamJob
  toolpaths: Toolpath[]
  files: PlannedFile[]
}

interface Props {
  sets: SimSet[]
  stale: boolean
  camJob: CamJob
  onGoToCam: () => void
  onOursChecked: (ok: boolean) => void
}

type Source = 'ours' | 'external'

export const SimulatorPage: React.FC<Props> = ({ sets, stale, camJob, onGoToCam, onOursChecked }) => {
  const [source, setSource] = useState<Source>(sets.length ? 'ours' : 'external')
  const [setIndex, setSetIndex] = useState(0)
  const current = sets[Math.min(setIndex, sets.length - 1)]
  const toolpaths = current?.toolpaths ?? []
  const toolpathJob = current?.job ?? null
  const outputFiles = current?.files ?? []
  // verificarea „fără probleme” contează doar dacă au trecut TOATE bucățile
  const [okSets, setOkSets] = useState<Set<number>>(new Set())
  const [program, setProgram] = useState<SimProgram | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // fișier extern
  const [extText, setExtText] = useState<{ name: string; text: string } | null>(null)
  const [extJob, setExtJob] = useState({ widthMm: camJob.widthMm, heightMm: camJob.heightMm, stockThicknessMm: camJob.stockThicknessMm, xyOrigin: camJob.xyOrigin as XYOrigin, zZero: camJob.zZero })
  const [extTool, setExtTool] = useState<CamTool>(() => findTool('bn3175'))
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setError(null)
    if (source === 'ours') {
      if (!toolpaths.length || !toolpathJob) { setProgram(null); return }
      setBusy(true)
      // lăsăm interfața să afișeze „se pregătește” înainte de munca grea
      const id = setTimeout(() => {
        try {
          const files = outputFiles.map(f => ({ name: f.name, text: f.render() }))
          setProgram(buildProgram(files, toolpathJob, (t, fi) => toolForFile(outputFiles[fi], t) ?? toolpaths[0].tool))
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        } finally {
          setBusy(false)
        }
      }, 30)
      return () => clearTimeout(id)
    }
    if (!extText) { setProgram(null); return }
    setBusy(true)
    const id = setTimeout(() => {
      try {
        const job: CamJob = {
          ...camJob,
          ...extJob,
          maxDepthMm: Math.max(1, extJob.stockThicknessMm),
          finishingTool: extTool
        }
        const p = buildProgram([extText], job, () => extTool)
        if (!p.moves.length) setError('Fișierul nu conține mișcări G0/G1/G2/G3.')
        setProgram(p)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    }, 30)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, current, extText, extJob, extTool, camJob])

  const numInput = (label: string, value: number, set: (v: number) => void) => (
    <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
      {label}
      <input type="number" value={value} onChange={e => Number.isFinite(Number(e.target.value)) && set(Number(e.target.value))}
        className="bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white font-mono text-xs" />
    </label>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-500">Simulator de frezare</span>
          <div className="flex bg-[#100f0e] p-1 rounded-xl border border-[#2c2822] ml-auto">
            <button onClick={() => setSource('ours')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${source === 'ours' ? 'bg-amber-600 text-white' : 'text-stone-400'}`}>Traseele mele calculate</button>
            <button onClick={() => setSource('external')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${source === 'external' ? 'bg-amber-600 text-white' : 'text-stone-400'}`}>Fișier G-code din alt program</button>
          </div>
        </div>
        <p className="text-[11px] text-stone-400">
          Simulatorul citește exact fișierul G-code care ajunge la mașină și îl execută în timp real: freza scoate lemnul,
          iar orice deplasare periculoasă (rapid prin lemn, tăiere în masă, plonjeu adânc) oprește simularea și îți arată linia.
        </p>

        {source === 'ours' && sets.length > 1 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-stone-400">Piesa e împărțită pe bucăți — verifică fiecare:</span>
            {sets.map((s, i) => (
              <button key={s.label} onClick={() => setSetIndex(i)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 ${i === setIndex ? 'bg-amber-600 text-white' : 'bg-[#221f1b] text-stone-300'}`}>
                {okSets.has(i) && '✓ '}{s.label}
              </button>
            ))}
          </div>
        )}

        {source === 'ours' && stale && toolpaths.length > 0 && (
          <div className="text-xs text-amber-200 bg-amber-950/40 border border-amber-700/50 rounded-lg p-2">
            Ai schimbat parametrii după calcul — simulezi traseele vechi. <button onClick={onGoToCam} className="underline">Recalculează</button>
          </div>
        )}

        {source === 'external' && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
            <input ref={fileRef} type="file" accept=".nc,.gcode,.gc,.ngc,.tap,.txt,.cnc,.nc1" className="hidden" onChange={async e => {
              const f = e.target.files?.[0]
              if (f) setExtText({ name: f.name, text: await f.text() })
              e.target.value = ''
            }} />
            <button onClick={() => fileRef.current?.click()} className="col-span-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg py-1.5 text-xs font-bold flex items-center justify-center gap-1.5">
              <Upload className="w-4 h-4" /> {extText ? extText.name : 'Alege fișierul .nc / .gcode / .tap'}
            </button>
            {numInput('Lățime lemn X', extJob.widthMm, v => setExtJob(j => ({ ...j, widthMm: Math.max(1, v) })))}
            {numInput('Înălțime lemn Y', extJob.heightMm, v => setExtJob(j => ({ ...j, heightMm: Math.max(1, v) })))}
            {numInput('Grosime lemn', extJob.stockThicknessMm, v => setExtJob(j => ({ ...j, stockThicknessMm: Math.max(0.5, v) })))}
            <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
              Freza
              <select value={extTool.id} onChange={e => setExtTool(findTool(e.target.value))} className="bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white text-xs">
                {TOOL_LIBRARY.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-stone-400 col-span-2 md:col-span-3">
              Unde e X0 Y0 în fișier
              <select value={extJob.xyOrigin} onChange={e => setExtJob(j => ({ ...j, xyOrigin: e.target.value as XYOrigin }))} className="bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white text-xs">
                <option value="bottomLeft">Colțul stânga-jos</option>
                <option value="center">Centrul plăcii</option>
                <option value="topLeft">Colțul stânga-sus</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-stone-400 col-span-2 md:col-span-3">
              Unde e Z0 în fișier
              <select value={extJob.zZero} onChange={e => setExtJob(j => ({ ...j, zZero: e.target.value as CamJob['zZero'] }))} className="bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white text-xs">
                <option value="top">Fața de sus a lemnului</option>
                <option value="bed">Masa mașinii</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {busy ? (
        <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-8 text-center text-sm text-amber-300 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Se citește G-code-ul și se pregătește lemnul...
        </div>
      ) : error ? (
        <div className="text-sm text-red-300 bg-red-950/40 border border-red-800/50 rounded-lg p-3">{error}</div>
      ) : (
        <MachineSimulator
          program={program}
          onCheckResult={ok => {
            if (source !== 'ours' || stale) return
            const next = new Set(okSets)
            if (ok) next.add(setIndex)
            else next.delete(setIndex)
            setOkSets(next)
            onOursChecked(next.size === sets.length)
          }}
          emptyHint={source === 'ours'
            ? <span>Nu ai încă trasee calculate. <button onClick={onGoToCam} className="text-amber-400 underline">Mergi la Sculptură 3D → Calculează traseele</button></span>
            : <span className="flex items-center justify-center gap-2"><FileCode2 className="w-5 h-5" /> Alege un fișier G-code ca să-l verifici înainte să-l pui pe mașină.</span>}
        />
      )}
    </div>
  )
}
