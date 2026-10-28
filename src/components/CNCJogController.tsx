import React, { useState, useEffect, useRef } from 'react'
import type { CNCStatus } from '../types/cnc'
import {
  cncController,
  type MessageListener,
  type StatusListener,
  type ProgressListener
} from '../utils/serialConnection'
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Home,
  Target,
  Pause,
  Play,
  OctagonAlert,
  Terminal,
  Send,
  Zap,
  Unlock,
  Radio
} from 'lucide-react'

export const CNCJogController: React.FC = () => {
  const [status, setStatus] = useState<CNCStatus>({
    connected: false,
    isSimulated: false,
    state: 'Disconnected',
    mPos: { x: 0, y: 0, z: 0 },
    wPos: { x: 0, y: 0, z: 0 },
    feedRate: 0,
    spindleSpeed: 0
  })

  const [jogStepMm, setJogStepMm] = useState<number>(10)
  const [jogFeedRate] = useState<number>(1200)

  const [streamProgress, setStreamProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0
  })

  const [terminalLogs, setTerminalLogs] = useState<{ text: string; dir: 'in' | 'out'; time: string }[]>([])
  const [manualCmd, setManualCmd] = useState('')
  const terminalEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onStatus: StatusListener = (newStatus) => setStatus(newStatus)
    const onProgress: ProgressListener = (current, total) => setStreamProgress({ current, total })
    const onMessage: MessageListener = (line, dir) => {
      const time = new Date().toLocaleTimeString().split(' ')[0]
      setTerminalLogs(prev => [...prev.slice(-80), { text: line, dir, time }])
    }

    cncController.addStatusListener(onStatus)
    cncController.addProgressListener(onProgress)
    cncController.addMessageListener(onMessage)

    return () => {
      cncController.removeStatusListener(onStatus)
      cncController.removeProgressListener(onProgress)
      cncController.removeMessageListener(onMessage)
    }
  }, [])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLogs])

  const handleSendManual = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!manualCmd.trim()) return
    cncController.sendCommand(manualCmd.trim())
    setManualCmd('')
  }

  const getStateBadgeClass = () => {
    switch (status.state) {
      case 'Idle': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
      case 'Run': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 animate-pulse'
      case 'Hold': return 'bg-amber-500/20 text-amber-400 border-amber-500/40'
      case 'Alarm': return 'bg-red-500/20 text-red-400 border-red-500/40'
      default: return 'bg-stone-500/20 text-stone-400 border-stone-500/40'
    }
  }

  return (
    <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-4 text-stone-200 flex flex-col gap-4 shadow-xl">
      {/* Bară de Stare Utilaj CNC */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#141312] p-3 rounded-xl border border-[#2e2a24]">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${status.connected ? 'text-emerald-400' : 'text-stone-500'}`} />
          <span className="text-xs font-bold text-stone-300">
            {status.connected
              ? (status.isSimulated ? 'CNC Virtual (Simulator)' : 'CNC Conectat USB')
              : 'CNC Neconectat'}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${getStateBadgeClass()}`}>
            {status.state}
          </span>
        </div>

        {/* Coordonate WPos */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-1 bg-[#1e1c19] px-2 py-1 rounded border border-[#3b352b]">
            <span className="text-red-400 font-bold">X:</span>
            <span className="text-white font-bold">{status.wPos.x.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1 bg-[#1e1c19] px-2 py-1 rounded border border-[#3b352b]">
            <span className="text-emerald-400 font-bold">Y:</span>
            <span className="text-white font-bold">{status.wPos.y.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1 bg-[#1e1c19] px-2 py-1 rounded border border-[#3b352b]">
            <span className="text-sky-400 font-bold">Z:</span>
            <span className="text-amber-300 font-bold">{status.wPos.z.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Bară Progres Execuție G-Code (Când rulează o lucrare) */}
      {streamProgress.total > 0 && (
        <div className="bg-[#141312] p-3 rounded-xl border border-amber-900/50 flex flex-col gap-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-amber-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 animate-bounce" />
              Execuție Sculptură pe Lemn în curs...
            </span>
            <span className="text-stone-300 font-mono">
              {streamProgress.current} / {streamProgress.total} ({((streamProgress.current / streamProgress.total) * 100).toFixed(1)}%)
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-[#201d19] h-2.5 rounded-full overflow-hidden border border-[#383228]">
            <div
              className="bg-gradient-to-r from-amber-500 to-amber-400 h-full transition-all duration-150"
              style={{ width: `${(streamProgress.current / streamProgress.total) * 100}%` }}
            />
          </div>

          {/* Butoane Pauză / Reluare / E-Stop */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => cncController.pauseStreaming()}
              className="flex items-center gap-1 px-3 py-1 bg-amber-700/80 hover:bg-amber-600 text-white rounded text-xs font-medium"
            >
              <Pause className="w-3.5 h-3.5" />
              Pauză Lucrare
            </button>
            <button
              onClick={() => cncController.resumeStreaming()}
              className="flex items-center gap-1 px-3 py-1 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded text-xs font-medium"
            >
              <Play className="w-3.5 h-3.5" />
              Continuă
            </button>
            <button
              onClick={() => cncController.stopStreaming()}
              className="flex items-center gap-1 px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-xs font-bold"
            >
              Anulează
            </button>
          </div>
        </div>
      )}

      {/* Grid: Jogging Pad (Stânga) + Comenzi Rapide & Terminal (Dreapta) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Jog Pad */}
        <div className="bg-[#141312] p-3 rounded-xl border border-[#2e2a24] flex flex-col items-center justify-between gap-3">
          <div className="w-full flex items-center justify-between text-xs">
            <span className="font-bold text-amber-500">Deplasare Manuală (Jogging)</span>
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-stone-400">Pas:</span>
              {[0.1, 1, 10, 50].map((step) => (
                <button
                  key={step}
                  onClick={() => setJogStepMm(step)}
                  className={`px-1.5 py-0.5 rounded font-mono font-bold ${jogStepMm === step ? 'bg-amber-600 text-white' : 'bg-[#221f1b] text-stone-300 hover:bg-[#2c2822]'}`}
                >
                  {step}
                </button>
              ))}
              <span className="text-stone-400">mm</span>
            </div>
          </div>

          {/* D-Pad X / Y și Z */}
          <div className="flex items-center justify-center gap-6 my-2">
            {/* Pad XY */}
            <div className="grid grid-cols-3 gap-1.5 w-36 h-36">
              <div />
              <button
                onClick={() => cncController.jog('Y', jogStepMm, jogFeedRate)}
                className="bg-[#221f1b] hover:bg-[#302b24] active:bg-amber-600 border border-[#3d372e] rounded-lg flex items-center justify-center font-bold text-stone-200 transition"
                title="Y+ (Spate)"
              >
                <ArrowUp className="w-5 h-5 text-emerald-400" />
              </button>
              <div />

              <button
                onClick={() => cncController.jog('X', -jogStepMm, jogFeedRate)}
                className="bg-[#221f1b] hover:bg-[#302b24] active:bg-amber-600 border border-[#3d372e] rounded-lg flex items-center justify-center font-bold text-stone-200 transition"
                title="X- (Stânga)"
              >
                <ArrowLeft className="w-5 h-5 text-red-400" />
              </button>

              <button
                onClick={() => cncController.goToZero()}
                className="bg-[#2d271f] hover:bg-amber-700/60 border border-amber-600/40 rounded-lg flex flex-col items-center justify-center text-[10px] font-bold text-amber-300 transition"
                title="Mergi la Origine X0 Y0"
              >
                <Target className="w-4 h-4 text-amber-400" />
                <span>Origine</span>
              </button>

              <button
                onClick={() => cncController.jog('X', jogStepMm, jogFeedRate)}
                className="bg-[#221f1b] hover:bg-[#302b24] active:bg-amber-600 border border-[#3d372e] rounded-lg flex items-center justify-center font-bold text-stone-200 transition"
                title="X+ (Dreapta)"
              >
                <ArrowRight className="w-5 h-5 text-red-400" />
              </button>

              <div />
              <button
                onClick={() => cncController.jog('Y', -jogStepMm, jogFeedRate)}
                className="bg-[#221f1b] hover:bg-[#302b24] active:bg-amber-600 border border-[#3d372e] rounded-lg flex items-center justify-center font-bold text-stone-200 transition"
                title="Y- (Față)"
              >
                <ArrowDown className="w-5 h-5 text-emerald-400" />
              </button>
              <div />
            </div>

            {/* Axa Z Pad */}
            <div className="flex flex-col items-center gap-1.5 w-14">
              <span className="text-[10px] font-bold text-sky-400">Axa Z</span>
              <button
                onClick={() => cncController.jog('Z', jogStepMm, jogFeedRate / 2)}
                className="w-12 h-14 bg-[#221f1b] hover:bg-[#302b24] active:bg-amber-600 border border-[#3d372e] rounded-lg flex flex-col items-center justify-center text-xs font-bold text-sky-300 transition"
                title="Z+ (Ridică freza deasupra lemnului)"
              >
                <ChevronUp className="w-5 h-5 text-sky-400" />
                <span>Z+</span>
              </button>
              <button
                onClick={() => cncController.jog('Z', -jogStepMm, jogFeedRate / 2)}
                className="w-12 h-14 bg-[#221f1b] hover:bg-[#302b24] active:bg-amber-600 border border-[#3d372e] rounded-lg flex flex-col items-center justify-center text-xs font-bold text-sky-300 transition"
                title="Z- (Coboară freza în lemn)"
              >
                <ChevronDown className="w-5 h-5 text-sky-400" />
                <span>Z-</span>
              </button>
            </div>
          </div>

          {/* Viteză Jogging */}
          <div className="w-full flex items-center justify-between text-xs text-stone-400 border-t border-[#25221d] pt-2">
            <span>Viteză Jogging:</span>
            <span className="text-white font-mono">{jogFeedRate} mm/min</span>
          </div>
        </div>

        {/* Panou Acțiuni CNC & Terminal */}
        <div className="flex flex-col gap-3">
          {/* Butoane Setare Zero & Reset */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => cncController.zeroWorkCoordinates()}
              className="py-2 px-2.5 bg-[#201d19] hover:bg-[#2b2721] border border-[#3b352b] rounded-lg font-bold text-amber-300 transition flex items-center justify-center gap-1.5"
            >
              <Target className="w-3.5 h-3.5 text-amber-400" />
              Setează Zero (X0 Y0 Z0)
            </button>
            <button
              onClick={() => cncController.zeroWorkCoordinates('Z')}
              className="py-2 px-2.5 bg-[#201d19] hover:bg-[#2b2721] border border-[#3b352b] rounded-lg font-bold text-sky-300 transition flex items-center justify-center gap-1.5"
            >
              <Target className="w-3.5 h-3.5 text-sky-400" />
              Setează Doar Zero Z
            </button>
            <button
              onClick={() => cncController.sendCommand('$H')}
              className="py-2 px-2.5 bg-[#201d19] hover:bg-[#2b2721] border border-[#3b352b] rounded-lg font-medium text-stone-300 transition flex items-center justify-center gap-1.5"
            >
              <Home className="w-3.5 h-3.5 text-stone-400" />
              Homing ($H)
            </button>
            <button
              onClick={() => cncController.sendCommand('$X')}
              className="py-2 px-2.5 bg-[#201d19] hover:bg-[#2b2721] border border-[#3b352b] rounded-lg font-medium text-stone-300 transition flex items-center justify-center gap-1.5"
            >
              <Unlock className="w-3.5 h-3.5 text-amber-400" />
              Deblocare Alarmă ($X)
            </button>
          </div>

          {/* STOP DE URGENȚĂ (E-STOP) */}
          <button
            onClick={() => cncController.sendRealtimeChar('\x18')}
            className="w-full py-2.5 bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 hover:to-rose-600 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg transition flex items-center justify-center gap-2 border border-red-500/50"
          >
            <OctagonAlert className="w-4 h-4 fill-current animate-pulse" />
            STOP DE URGENȚĂ (E-STOP)
          </button>

          {/* Terminal Console Live */}
          <div className="bg-[#100f0e] rounded-xl border border-[#2e2a24] p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] text-stone-400 border-b border-[#25221d] pb-1.5">
              <span className="flex items-center gap-1 font-semibold text-stone-300">
                <Terminal className="w-3.5 h-3.5 text-amber-500" />
                Consolă Terminal CNC (G-Code Live)
              </span>
              <button
                onClick={() => setTerminalLogs([])}
                className="text-[10px] text-stone-500 hover:text-stone-300"
              >
                Șterge istoric
              </button>
            </div>

            {/* Scrollable logs */}
            <div className="h-28 overflow-y-auto font-mono text-[11px] flex flex-col gap-0.5 pr-1 select-text">
              {terminalLogs.length === 0 ? (
                <span className="text-stone-600 italic">Niciun mesaj. Conectați utilajul sau tastați comenzi.</span>
              ) : (
                terminalLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`leading-tight ${log.dir === 'out' ? 'text-cyan-400' : (log.text.startsWith('error') || log.text.startsWith('ALARM') ? 'text-red-400' : 'text-stone-300')}`}
                  >
                    <span className="text-stone-600 mr-1.5">[{log.time}]</span>
                    <span className="font-bold mr-1">{log.dir === 'out' ? '>' : '<'}</span>
                    <span>{log.text}</span>
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>

            {/* Input linie comandă */}
            <form onSubmit={handleSendManual} className="flex gap-1.5">
              <input
                type="text"
                placeholder="Comandă G-code (ex: $$, ? , G0 X50 Y50, M3 S1000)..."
                value={manualCmd}
                onChange={(e) => setManualCmd(e.target.value)}
                className="flex-1 bg-[#1a1815] border border-[#3a352c] rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1 rounded text-xs font-bold transition flex items-center gap-1"
              >
                <Send className="w-3 h-3" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
