import React, { useState } from 'react'
import type { CamTool } from '../cam/types'
import { effectiveDiameter } from '../cam/engine'
import { Calculator } from 'lucide-react'

/**
 * Calculator de avans după „chipload” (grosimea așchiei pe dinte), ca la V-Carve Pro / Aspire:
 * avans (mm/min) = turație × număr de dinți × așchie pe dinte.
 * Valorile de pornire sunt pentru lemn de esență tare pe router; se înmulțesc cu factorul
 * materialului și al mașinii. Așchia prea subțire = freza freacă și arde lemnul;
 * prea groasă = rupe freza sau smulge fibra.
 */

// așchie pe dinte (mm) pentru lemn tare, după diametrul frezei
const CHIP_HARDWOOD: Array<[number, number]> = [
  [0.5, 0.008], [1, 0.015], [2, 0.03], [3.175, 0.05], [4, 0.065], [6, 0.1], [8, 0.13], [12, 0.18]
]

const MATERIALS: Array<{ id: string; label: string; factor: number; stepDownFactor: number }> = [
  { id: 'soft', label: 'Lemn moale (tei, brad, plop)', factor: 1.2, stepDownFactor: 1 },
  { id: 'hard', label: 'Lemn tare (stejar, nuc, fag, cireș)', factor: 1, stepDownFactor: 0.5 },
  { id: 'mdf', label: 'MDF', factor: 1.3, stepDownFactor: 1 },
  { id: 'ply', label: 'Placaj', factor: 1.1, stepDownFactor: 0.75 }
]

const MACHINE_CLASSES: Array<{ id: string; label: string; factor: number }> = [
  { id: 'hobby', label: 'Hobby ușoară (3018, 3040, motor 300–500 W)', factor: 0.5 },
  { id: 'mid', label: 'Medie (6040, 6090, ax 1,5–2,2 kW)', factor: 0.8 },
  { id: 'pro', label: 'Rigidă / industrială (1325, ax 3+ kW)', factor: 1 }
]

function recommendedChipload(diameterMm: number, materialFactor: number, machineFactor: number): number {
  const d = Math.max(0.2, diameterMm)
  let chip = CHIP_HARDWOOD[CHIP_HARDWOOD.length - 1][1]
  for (let k = 0; k < CHIP_HARDWOOD.length; k++) {
    const [dk, ck] = CHIP_HARDWOOD[k]
    if (d <= dk) {
      if (k === 0) { chip = ck * (d / dk); break }
      const [d0, c0] = CHIP_HARDWOOD[k - 1]
      chip = c0 + ((ck - c0) * (d - d0)) / (dk - d0)
      break
    }
  }
  return chip * materialFactor * machineFactor
}

/**
 * Diametrul după care se ia așchia: la V-bit și conică, ca în bazele de scule ale producătorilor,
 * cel al tijei (conul e gros și rezistent), cu o rezervă de 20%. Vârful fin nu e cel care limitează.
 */
function chipDiameter(t: CamTool): number {
  return t.shape === 'vbit' || t.shape === 'taperedball' ? 0.8 * t.diameterMm : t.diameterMm
}

/**
 * Subțierea așchiei: cu pas lateral sub 50% dintele intră doar puțin în lemn și așchia reală
 * e mai subțire decât avansul pe dinte, deci se poate merge mai repede (maxim de 2,5 ori).
 * Nu se aplică la V-bit: în V-carve freza taie pe toată lățimea șanțului.
 */
function thinningFactor(t: CamTool): number {
  if (t.shape === 'vbit') return 1
  const s = Math.min(0.5, Math.max(0.02, t.stepoverPercent / 100))
  return Math.min(2.5, 1 / (2 * Math.sqrt(s * (1 - s))))
}

const inputCls = 'w-full bg-[#201d19] border border-[#3a352c] rounded px-2 py-1 text-white font-mono text-xs'

export const FeedCalculator: React.FC<{
  // slot = freza taie pe toată lățimea (profil, decupare, găuri, gravură pe contur): fără subțierea așchiei
  tools: Array<{ label: string; tool: CamTool; onApply: (t: CamTool) => void; slot?: boolean }>
}> = ({ tools }) => {
  const [open, setOpen] = useState(false)
  const [material, setMaterial] = useState('soft')
  const [machine, setMachine] = useState('hobby')
  const [flutes, setFlutes] = useState(2)
  const mat = MATERIALS.find(m => m.id === material)!
  const mach = MACHINE_CLASSES.find(m => m.id === machine)!

  return (
    <div className="bg-[#141312] p-3 rounded-xl border border-[#2e2a24] flex flex-col gap-2">
      <button onClick={() => setOpen(o => !o)} className="text-xs font-bold text-amber-400 flex items-center gap-1.5 text-left">
        <Calculator className="w-4 h-4" /> Calculator de avans (așchie pe dinte) {open ? '▾' : '▸'}
      </button>
      {open && (
        <>
          <span className="text-[10px] text-stone-400">
            Avans = turație × dinți × așchie pe dinte (cu pas lateral mic, așchia reală e mai subțire, deci se ține cont de el). Așchie prea subțire: freza freacă, lemnul se înnegrește și freza se tocește.
            Prea groasă: freza se rupe sau smulge fibra. Ascultă mașina: un șuierat ascuțit = prea încet; un sunet greu = prea repede.
          </span>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
              <span>Material</span>
              <select value={material} onChange={e => setMaterial(e.target.value)} className={inputCls}>
                {MATERIALS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
              <span>Mașina</span>
              <select value={machine} onChange={e => setMachine(e.target.value)} className={inputCls}>
                {MACHINE_CLASSES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-stone-400">
              <span>Număr de dinți (tăișuri)</span>
              <input type="number" min={1} max={6} value={flutes} onChange={e => setFlutes(Math.max(1, Math.min(6, Math.round(Number(e.target.value) || 1))))} className={inputCls} />
            </label>
          </div>
          <table className="w-full text-[11px] text-stone-300">
            <thead>
              <tr className="text-stone-500 text-left">
                <th className="font-normal">Freza</th><th className="font-normal text-right">Acum</th><th className="font-normal text-right">Recomandat</th><th />
              </tr>
            </thead>
            <tbody>
              {tools.map(({ label, tool, onApply, slot }) => {
                const d = chipDiameter(tool)
                const chip = recommendedChipload(d, mat.factor, mach.factor) * (slot ? 1 : thinningFactor(tool))
                const rpm = tool.spindleRpm || 18000
                const feed = Math.round((rpm * flutes * chip) / 10) * 10
                const nowChip = tool.feedRateMmMin / (rpm * flutes)
                const ratio = nowChip / chip
                const status = ratio < 0.5 ? { t: 'prea încet: arde', c: 'text-red-300' } : ratio > 1.6 ? { t: 'prea repede: rupe', c: 'text-red-300' } : ratio < 0.75 ? { t: 'cam încet', c: 'text-amber-300' } : ratio > 1.25 ? { t: 'cam repede', c: 'text-amber-300' } : { t: 'bine', c: 'text-emerald-300' }
                // pas Z sigur: freză dreaptă ≤ diametru (lemn moale) / jumătate (lemn tare); la vârfuri fine mult mai puțin
                const stepDown = Math.max(0.1, Math.round(effectiveDiameter(tool) * mat.stepDownFactor * (tool.shape === 'endmill' ? 1 : 0.5) * 10) / 10)
                return (
                  <tr key={label} className="border-t border-[#2e2a24] align-top">
                    <td className="py-1 pr-1">
                      <b className="text-stone-200">{label}</b>
                      <span className="block text-[10px] text-stone-500">{tool.name}, {rpm} RPM</span>
                    </td>
                    <td className="py-1 text-right font-mono">
                      {tool.feedRateMmMin}
                      <span className={`block text-[10px] font-sans ${status.c}`}>{nowChip.toFixed(3)} mm/dinte, {status.t}</span>
                    </td>
                    <td className="py-1 text-right font-mono text-amber-300">
                      {feed}
                      <span className="block text-[10px] font-sans text-stone-500">{chip.toFixed(3)} mm/dinte; coborâre {Math.round(feed / 3 / 10) * 10}; pas Z ≤ {stepDown}</span>
                    </td>
                    <td className="py-1 pl-1">
                      <button
                        onClick={() => onApply({ ...tool, id: 'custom', feedRateMmMin: feed, plungeRateMmMin: Math.max(10, Math.round(feed / 3 / 10) * 10), stepDownMm: Math.min(tool.stepDownMm, stepDown) })}
                        className="px-2 py-1 rounded-md text-[10px] font-bold border bg-[#201d19] border-[#383228] text-stone-200 hover:bg-[#2a2620]"
                      >
                        Aplică
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <span className="text-[10px] text-stone-500">
            Valori de pornire. Fă o probă pe o bucată din același lemn și ajustează cu ±20%. „Aplică” schimbă avansul, coborârea și (doar în jos) pasul Z.
          </span>
        </>
      )}
    </div>
  )
}
