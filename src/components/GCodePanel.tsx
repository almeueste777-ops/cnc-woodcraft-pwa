import React from 'react'
import type { ToolSettings, GCodeStats } from '../types/cnc'
import { Wrench, Clock, Play, Download, Settings2 } from 'lucide-react'

interface GCodePanelProps {
  toolSettings: ToolSettings
  onToolSettingsChange: (settings: ToolSettings) => void
  gcodeStats: GCodeStats | null
  onGenerateGCode: () => void
  onDownloadGCode: (extension: 'nc' | 'gcode' | 'tap') => void
  onSendToCNC: () => void
  isStreaming: boolean
  isCNCConnected: boolean
}

export const GCodePanel: React.FC<GCodePanelProps> = ({
  toolSettings,
  onToolSettingsChange,
  gcodeStats,
  onGenerateGCode,
  onDownloadGCode,
  onSendToCNC,
  isStreaming,
  isCNCConnected
}) => {
  const stepoverMm = (toolSettings.toolDiameterMm * (toolSettings.stepoverPercent / 100)).toFixed(2)

  return (
    <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4 text-stone-200 flex flex-col gap-4 shadow-xl">
      {/* Header Secțiune */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
          <Wrench className="w-4 h-4" />
          Parametri Sculă & Prelucrare CNC
        </span>
        <button
          onClick={onGenerateGCode}
          className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg transition shadow-md flex items-center gap-1.5"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Calculează Traseu G-Code
        </button>
      </div>

      {/* Setări Sculă Așchietoare */}
      <div className="grid grid-cols-2 gap-3 text-xs bg-[#141312] p-3 rounded-xl border border-[#2e2a24]">
        <div>
          <label className="text-stone-400 block mb-1">Tip Sculă:</label>
          <select
            value={toolSettings.toolType}
            onChange={(e) => onToolSettingsChange({ ...toolSettings, toolType: e.target.value as any })}
            className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2.5 py-1 text-white text-xs font-medium"
          >
            <option value="ballnose">Freză Sferică (Ball-Nose) - Recomandat Relief</option>
            <option value="vbit">Gravor V-Bit (30° / 60° / 90°)</option>
            <option value="endmill">Freză Dreaptă Cilindrică (Degroșare)</option>
            <option value="laser">Diodă Laser (Gravură optică)</option>
          </select>
        </div>

        <div>
          <label className="text-stone-400 block mb-1">Diametru Freză (mm):</label>
          <input
            type="number"
            min="0.1"
            max="30"
            step="0.1"
            value={toolSettings.toolDiameterMm}
            onChange={(e) => onToolSettingsChange({ ...toolSettings, toolDiameterMm: Number(e.target.value) })}
            className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2.5 py-1 text-white font-mono"
          />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <span className="text-stone-400">Pas Lateral (Stepover):</span>
            <span className="text-amber-400 font-mono">{toolSettings.stepoverPercent}% ({stepoverMm} mm)</span>
          </div>
          <input
            type="range"
            min="5"
            max="50"
            step="1"
            value={toolSettings.stepoverPercent}
            onChange={(e) => onToolSettingsChange({ ...toolSettings, stepoverPercent: Number(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer"
          />
          <span className="text-[10px] text-stone-500">
            8-12% pentru suprafață fină în lemn fără șlefuire ulterioară
          </span>
        </div>

        <div>
          <label className="text-stone-400 block mb-1">Strategie Sculptură:</label>
          <select
            value={toolSettings.carvingStrategy}
            onChange={(e) => onToolSettingsChange({ ...toolSettings, carvingStrategy: e.target.value as any })}
            className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2.5 py-1 text-white text-xs"
          >
            <option value="rasterX">Zig-zag de-a lungul axei X (Rapid)</option>
            <option value="rasterY">Zig-zag de-a lungul axei Y</option>
            <option value="cross">Dublă trecere încrucișată (Super-finisare)</option>
          </select>
        </div>

        <div>
          <label className="text-stone-400 block mb-1">Viteză Avans Lucru (mm/min):</label>
          <input
            type="number"
            min="100"
            max="10000"
            step="100"
            value={toolSettings.feedRateMmMin}
            onChange={(e) => onToolSettingsChange({ ...toolSettings, feedRateMmMin: Number(e.target.value) })}
            className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2.5 py-1 text-white font-mono"
          />
        </div>

        <div>
          <label className="text-stone-400 block mb-1">Viteză Coborâre Z (mm/min):</label>
          <input
            type="number"
            min="50"
            max="3000"
            step="50"
            value={toolSettings.plungeRateMmMin}
            onChange={(e) => onToolSettingsChange({ ...toolSettings, plungeRateMmMin: Number(e.target.value) })}
            className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2.5 py-1 text-white font-mono"
          />
        </div>

        <div>
          <label className="text-stone-400 block mb-1">Z Siguranță Retragere (mm):</label>
          <input
            type="number"
            min="1"
            max="50"
            value={toolSettings.safeZMm}
            onChange={(e) => onToolSettingsChange({ ...toolSettings, safeZMm: Number(e.target.value) })}
            className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2.5 py-1 text-white font-mono"
          />
        </div>

        <div>
          <label className="text-stone-400 block mb-1">Turație Freză (RPM):</label>
          <input
            type="number"
            min="1000"
            max="30000"
            step="1000"
            value={toolSettings.spindleRpm}
            onChange={(e) => onToolSettingsChange({ ...toolSettings, spindleRpm: Number(e.target.value) })}
            className="w-full bg-[#201d19] border border-[#3a352c] rounded px-2.5 py-1 text-white font-mono"
          />
        </div>
      </div>

      {/* Statistici Prelucrare & Estimare Timp */}
      {gcodeStats && (
        <div className="bg-[#141312] p-3 rounded-xl border border-amber-900/40 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-bold text-amber-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Timp Estimat de Sculptură:
            </span>
            <span className="text-base text-amber-300 font-mono">
              {Math.floor(gcodeStats.estimatedTimeMin / 60)}h {Math.round(gcodeStats.estimatedTimeMin % 60)}m
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px] text-stone-300">
            <div className="bg-[#1e1c19] p-2 rounded border border-[#2e2a24]">
              <span className="text-stone-500 block">Linii G-Code:</span>
              <span className="font-mono font-bold text-white">{gcodeStats.totalLines.toLocaleString()}</span>
            </div>
            <div className="bg-[#1e1c19] p-2 rounded border border-[#2e2a24]">
              <span className="text-stone-500 block">Distanță Traseu:</span>
              <span className="font-mono font-bold text-white">{(gcodeStats.totalDistanceMm / 1000).toFixed(2)} m</span>
            </div>
            <div className="bg-[#1e1c19] p-2 rounded border border-[#2e2a24]">
              <span className="text-stone-500 block">Cursă Z lucru:</span>
              <span className="font-mono font-bold text-amber-300">{gcodeStats.boundsMm.minZ.toFixed(1)} mm</span>
            </div>
          </div>
        </div>
      )}

      {/* Butoane Acțiuni Export & Trimitere Directă */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onDownloadGCode('nc')}
            disabled={!gcodeStats}
            className="flex items-center justify-center gap-1 bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3d362c] text-stone-200 py-2 rounded-lg text-xs font-bold transition disabled:opacity-50"
            title="Fișier .NC standard GRBL / Mach3 / LinuxCNC"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            Descărcare .NC
          </button>
          <button
            onClick={() => onDownloadGCode('gcode')}
            disabled={!gcodeStats}
            className="flex items-center justify-center gap-1 bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3d362c] text-stone-200 py-2 rounded-lg text-xs font-bold transition disabled:opacity-50"
            title="Fișier .GCODE pentru imprimante 3D / routere CNC"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            Descărcare .GCODE
          </button>
          <button
            onClick={() => onDownloadGCode('tap')}
            disabled={!gcodeStats}
            className="flex items-center justify-center gap-1 bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3d362c] text-stone-200 py-2 rounded-lg text-xs font-bold transition disabled:opacity-50"
            title="Fișier .TAP pentru Mach3 / RichAuto DSP Handheld Controller"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            Descărcare .TAP
          </button>
        </div>

        {/* Trimitere Directă prin Web Serial la CNC */}
        <button
          onClick={onSendToCNC}
          disabled={!gcodeStats || !isCNCConnected || isStreaming}
          className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4 fill-current" />
          {isStreaming ? 'Lucrare în Curs de Frezare...' : 'Trimite & Execută Imediat pe CNC (USB)'}
        </button>
        {!isCNCConnected && (
          <span className="text-[10px] text-center text-stone-400">
            * Conectați CNC-ul din panoul de sus prin cablu USB pentru execuție directă, sau descărcați fișierul G-code pe stick.
          </span>
        )}
      </div>
    </div>
  )
}
