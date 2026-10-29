import React, { useState } from 'react'
import type { AppMode, CNCStatus } from '../types/cnc'
import { cncController } from '../utils/serialConnection'
import {
  Hammer,
  Layers,
  Compass,
  Cpu,
  Wifi,
  WifiOff,
  Usb,
  ChevronDown,
  GraduationCap,
  PlayCircle,
  LifeBuoy
} from 'lucide-react'

interface HeaderProps {
  mode: AppMode
  onModeChange: (m: AppMode) => void
  cncStatus: CNCStatus
}

export const Header: React.FC<HeaderProps> = ({ mode, onModeChange, cncStatus }) => {
  const [baudRate, setBaudRate] = useState<number>(115200)
  const [isConnecting, setIsConnecting] = useState(false)
  const [showBaudMenu, setShowBaudMenu] = useState(false)

  const handleConnectUSB = async () => {
    if (cncStatus.connected) {
      await cncController.disconnect()
    } else {
      setIsConnecting(true)
      try {
        await cncController.connectSerial(baudRate)
      } finally {
        setIsConnecting(false)
      }
    }
  }

  const handleToggleSimulation = () => {
    if (cncStatus.connected && cncStatus.isSimulated) {
      cncController.disconnect()
    } else {
      cncController.connectSimulation()
    }
  }

  return (
    <header className="bg-[#181614] border-b border-[#2f2a24] px-4 py-3 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Logo și Titlu */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-900/30">
            <Hammer className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-white tracking-tight">
                CNC WoodCraft Studio
              </h1>
              <span className="text-[10px] uppercase font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                PWA Offline
              </span>
            </div>
            <p className="text-[11px] text-stone-400">
              Sculptură 3D în lemn • Icoane • STL & DXF • Conexiune Universală CNC
            </p>
          </div>
        </div>

        {/* Meniu Moduri de Lucru */}
        <nav className="flex flex-wrap items-center bg-[#100f0e] p-1 rounded-xl border border-[#2c2822]">
          <button
            onClick={() => onModeChange('relief3d')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${mode === 'relief3d' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <Layers className="w-3.5 h-3.5" />
            Sculptură 3D (Relief)
          </button>
          <button
            onClick={() => onModeChange('engrave2d')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${mode === 'engrave2d' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <Compass className="w-3.5 h-3.5" />
            Gravură Vectorială
          </button>
          <button
            onClick={() => onModeChange('simulator')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${mode === 'simulator' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Simulator
          </button>
          <button
            onClick={() => onModeChange('controller')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${mode === 'controller' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Control CNC Direct
          </button>
          <button
            onClick={() => onModeChange('tutorials')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${mode === 'tutorials' ? 'bg-amber-600 text-white shadow-md' : 'text-amber-400 hover:text-amber-300'}`}
          >
            <GraduationCap className="w-4 h-4 text-amber-400" />
            Lecții
          </button>
          <button
            onClick={() => onModeChange('help')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${mode === 'help' ? 'bg-amber-600 text-white shadow-md' : 'text-stone-400 hover:text-stone-200'}`}
          >
            <LifeBuoy className="w-3.5 h-3.5" />
            Probleme & Soluții
          </button>
        </nav>

        {/* Secțiune Conexiune CNC (Web Serial USB / Simulator) */}
        <div className="flex items-center gap-2">
          {/* Selector Baud Rate */}
          <div className="relative">
            <button
              onClick={() => setShowBaudMenu(!showBaudMenu)}
              className="flex items-center gap-1 bg-[#221f1b] border border-[#3b362c] text-stone-300 px-2 py-1.5 rounded-lg text-xs font-mono hover:bg-[#2c2822]"
              title="Viteză transmisie port serial (Baud)"
            >
              <span>{baudRate}</span>
              <ChevronDown className="w-3 h-3 text-stone-400" />
            </button>

            {showBaudMenu && (
              <div className="absolute right-0 mt-1 w-28 bg-[#201d19] border border-[#3d372e] rounded-lg shadow-2xl py-1 z-50 text-xs font-mono">
                {[115200, 250000, 57600, 9600].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => {
                      setBaudRate(rate)
                      setShowBaudMenu(false)
                    }}
                    className={`w-full text-left px-3 py-1 hover:bg-amber-600 hover:text-white ${baudRate === rate ? 'text-amber-400 font-bold' : 'text-stone-300'}`}
                  >
                    {rate}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Buton Conectare USB Real */}
          <button
            onClick={handleConnectUSB}
            disabled={isConnecting}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-md transition ${
              cncStatus.connected && !cncStatus.isSimulated
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            {isConnecting
              ? 'Conectare...'
              : cncStatus.connected && !cncStatus.isSimulated
              ? 'Conectat USB (Deconectare)'
              : 'Conectare CNC (USB)'}
          </button>

          {/* Buton Simulator Virtual */}
          <button
            onClick={handleToggleSimulation}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
              cncStatus.connected && cncStatus.isSimulated
                ? 'bg-cyan-600/20 text-cyan-300 border-cyan-500/40'
                : 'bg-[#221f1b] text-stone-400 border-[#38332a] hover:text-stone-200'
            }`}
            title="Activează un CNC Virtual pentru teste fără a avea utilajul conectat fizic"
          >
            {cncStatus.connected && cncStatus.isSimulated ? <Wifi className="w-3 h-3 text-cyan-400" /> : <WifiOff className="w-3 h-3" />}
            {cncStatus.connected && cncStatus.isSimulated ? 'Simulare Activă' : 'Mod Simulator'}
          </button>
        </div>
      </div>
    </header>
  )
}
