import React, { useState } from 'react'
import type { CamJob } from '../cam/types'
import type { CNCStatus } from '../types/cnc'
import { ShieldCheck, AlertTriangle, X, Play } from 'lucide-react'

interface Props {
  fileName: string
  toolName: string
  job: CamJob
  simulatedOk: boolean
  status: CNCStatus
  onConfirm: () => void
  onCancel: () => void
  onOpenSimulator: () => void
  tileLabel?: string | null // când piesa e împărțită pe bucăți
}

const ORIGIN = { bottomLeft: 'colțul din stânga-jos', center: 'centrul plăcii', topLeft: 'colțul din stânga-sus' }

/** Lista de verificare de dinaintea pornirii: fiecare rând previne o greșeală care strică piesa */
export const PreflightChecklist: React.FC<Props> = ({ fileName, toolName, job, simulatedOk, status, onConfirm, onCancel, onOpenSimulator, tileLabel }) => {
  const items = [
    `Lemnul e prins bine, nu se mișcă, iar clemele sunt mai jos de ${job.safeZMm} mm (Z siguranță).`,
    `Freza montată și strânsă: ${toolName}.`,
    tileLabel
      ? `X0 Y0 e setat în colțul stânga-jos al bucății: ${tileLabel}.`
      : `X0 Y0 e setat în ${ORIGIN[job.xyOrigin]}.`,
    job.zZero === 'top'
      ? 'Z0 e setat pe fața lemnului, cu freza ACEASTA (metoda hârtiei).'
      : `Z0 e setat pe masa mașinii (lemnul are ${job.stockThicknessMm} mm).`,
    'Aspirația e pornită, port ochelari și antifoane.',
    'Știu unde e STOP DE URGENȚĂ și stau lângă mașină.'
  ]
  const [checked, setChecked] = useState<boolean[]>(items.map(() => false))
  const alarm = status.state === 'Alarm'
  const all = checked.every(Boolean) && !alarm

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-[#1a1815] border border-amber-700 rounded-2xl max-w-lg w-full p-5 flex flex-col gap-3 text-stone-200 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-amber-400" /> Înainte de pornire</h3>
          <button onClick={onCancel} aria-label="Închide"><X className="w-5 h-5 text-stone-400" /></button>
        </div>
        <p className="text-xs text-stone-400">Fișier: <span className="font-mono text-stone-200">{fileName}</span></p>

        {!simulatedOk && (
          <div className="text-xs text-amber-200 bg-amber-950/40 border border-amber-700/50 rounded-lg p-2 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Nu ai verificat acest program în simulator. <button onClick={onOpenSimulator} className="underline">Verifică acum</button> (durează câteva secunde).</span>
          </div>
        )}
        {alarm && (
          <div className="text-xs text-red-200 bg-red-950/40 border border-red-800/50 rounded-lg p-2">
            Mașina e în ALARMĂ. Apasă Homing ($H) sau Deblocare Alarmă ($X) în Control CNC, apoi refă originea.
          </div>
        )}

        <div className="flex flex-col gap-2">
          {items.map((it, i) => (
            <label key={it} className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={checked[i]} onChange={e => setChecked(c => c.map((v, k) => (k === i ? e.target.checked : v)))} className="mt-1 w-4 h-4 accent-amber-500" />
              <span>{it}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-[#221f1b] border border-[#3d362c] text-sm">Nu încă</button>
          <button onClick={onConfirm} disabled={!all} className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
            <Play className="w-4 h-4 fill-current" /> Pornește lucrarea
          </button>
        </div>
      </div>
    </div>
  )
}
