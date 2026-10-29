import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { SimProgram, SimEvent } from '../cam/simulator'
import { StockSimulator } from '../cam/simulator'
import type { CamTool } from '../cam/types'
import { Play, Pause, RotateCcw, FastForward, AlertTriangle, Crosshair, CheckCircle2, Wrench } from 'lucide-react'

interface Props {
  program: SimProgram | null
  emptyHint?: React.ReactNode
  compact?: boolean          // pentru lecții: fără listă de probleme și cod
  autoPlaySpeed?: number     // pornește singur (lecții)
  onEvents?: (events: SimEvent[]) => void
  onCheckResult?: (ok: boolean) => void // rezultatul verificării complete
}

const SPEEDS = [1, 5, 20, 100, 500]

const fmt = (sec: number) => {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

function toolMesh(tool: CamTool): THREE.Group {
  const g = new THREE.Group()
  const R = tool.diameterMm / 2
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.85, roughness: 0.25 })
  const flute = new THREE.MeshStandardMaterial({ color: 0xe8b44a, metalness: 0.7, roughness: 0.3 })
  const fluteLen = Math.max(6, tool.diameterMm * 3)
  if (tool.shape === 'ballnose') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flute)
    ball.rotation.x = -Math.PI / 2
    ball.position.z = R
    g.add(ball)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, fluteLen - R, 24), flute)
    body.rotation.x = Math.PI / 2
    body.position.z = R + (fluteLen - R) / 2
    g.add(body)
  } else if (tool.shape === 'taperedball') {
    const rt = (tool.tipDiameterMm ?? 0.5) / 2
    const a = ((tool.tipAngleDeg || 15) * Math.PI) / 360
    const coneH = (R - rt * Math.cos(a)) / Math.tan(a)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(rt, 16, 8), flute)
    tip.position.z = rt
    g.add(tip)
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(R, rt * Math.cos(a), coneH, 24), flute)
    cone.rotation.x = Math.PI / 2
    cone.position.z = rt - rt * Math.sin(a) + coneH / 2
    g.add(cone)
  } else if (tool.shape === 'vbit') {
    const coneH = R / Math.tan(((tool.tipAngleDeg || 60) * Math.PI) / 360)
    const cone = new THREE.Mesh(new THREE.ConeGeometry(R, coneH, 24), flute)
    cone.rotation.x = -Math.PI / 2
    cone.position.z = coneH / 2
    g.add(cone)
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, fluteLen, 24), flute)
    body.rotation.x = Math.PI / 2
    body.position.z = fluteLen / 2
    g.add(body)
  }
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(R, 1.6), Math.max(R, 1.6), 25, 20), steel)
  shank.rotation.x = Math.PI / 2
  shank.position.z = fluteLen + 12.5
  g.add(shank)
  const collet = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 14, 24), new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.6, roughness: 0.4 }))
  collet.rotation.x = Math.PI / 2
  collet.position.z = fluteLen + 32
  g.add(collet)
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 60, 32), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.3, roughness: 0.6 }))
  motor.rotation.x = Math.PI / 2
  motor.position.z = fluteLen + 70
  g.add(motor)
  return g
}

export const MachineSimulator: React.FC<Props> = ({ program, emptyHint, compact = false, autoPlaySpeed, onEvents, onCheckResult }) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<StockSimulator | null>(null)
  const stateRef = useRef({ t: 0, playing: false, speed: 20, follow: false, seekTo: -1 })
  const [ui, setUi] = useState({ t: 0, total: 0, line: 0, x: 0, y: 0, z: 0, feed: 0, tool: '', playing: false })
  const [speed, setSpeed] = useState(20)
  const [follow, setFollow] = useState(false)
  const [events, setEvents] = useState<SimEvent[]>([])
  const [fullCheck, setFullCheck] = useState<SimEvent[] | null>(null)
  const onEventsRef = useRef(onEvents)
  onEventsRef.current = onEvents

  useEffect(() => {
    stateRef.current.speed = speed
  }, [speed])
  useEffect(() => {
    stateRef.current.follow = follow
  }, [follow])

  useEffect(() => {
    const container = mountRef.current
    if (!container || !program || !program.moves.length) return
    const sim = new StockSimulator(program)
    simRef.current = sim
    setEvents([])
    setFullCheck(null)
    const st = stateRef.current
    st.t = 0
    st.playing = !!autoPlaySpeed
    if (autoPlaySpeed) { st.speed = autoPlaySpeed; setSpeed(autoPlaySpeed) }

    const { widthMm: W, heightMm: H, maxDepthMm: D } = program.job
    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x131211)
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 5000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xfff4e0, 2.2)
    key.position.set(W * 0.6, -H * 0.8, 300)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x9db8e0, 0.5)
    fill.position.set(-W, H, 200)
    scene.add(fill)

    // Lemnul: grilă de înălțimi actualizată pe măsură ce freza taie
    const geo = new THREE.PlaneGeometry(W, H, sim.nx - 1, sim.ny - 1)
    const colors = new Float32Array(sim.nx * sim.ny * 3)
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const woodTop = new THREE.Color(0xb98b5a)
    const woodCut = new THREE.Color(0xf0dcb8)
    const woodDeep = new THREE.Color(0xc9a77a)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const col = geo.attributes.color as THREE.BufferAttribute
    const tmp = new THREE.Color()
    const writeRegion = (i0: number, i1: number, j0: number, j1: number) => {
      for (let j = j0; j <= j1; j++) {
        const row = (sim.ny - 1 - j) * sim.nx // rândul 0 al planului e sus
        for (let i = i0; i <= i1; i++) {
          const z = sim.data[j * sim.nx + i]
          const v = row + i
          pos.setZ(v, z)
          if (z > -0.02) tmp.copy(woodTop)
          else tmp.copy(woodCut).lerp(woodDeep, Math.min(1, -z / Math.max(1, D)))
          col.setXYZ(v, tmp.r, tmp.g, tmp.b)
        }
      }
      pos.needsUpdate = true
      col.needsUpdate = true
    }
    writeRegion(0, sim.nx - 1, 0, sim.ny - 1)
    geo.computeVertexNormals()
    const stock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide }))
    scene.add(stock)

    // pereții laterali ai plăcii și masa mașinii
    const T = program.job.stockThicknessMm
    const sides = new THREE.Mesh(new THREE.BoxGeometry(W, H, T - 0.2), new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.9 }))
    sides.position.z = -T / 2 - 0.15
    scene.add(sides)
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W + 120, H + 120, 4), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.9 }))
    bed.position.z = -T - 2
    scene.add(bed)

    // freza
    let toolIndex = -1
    let toolObj: THREE.Group | null = null
    const setTool = (idx: number) => {
      if (idx === toolIndex) return
      toolIndex = idx
      if (toolObj) {
        scene.remove(toolObj)
        toolObj.traverse(o => {
          const m = o as THREE.Mesh
          m.geometry?.dispose()
          ;(m.material as THREE.Material | undefined)?.dispose?.()
        })
      }
      toolObj = toolMesh(program.tools[idx])
      scene.add(toolObj)
    }
    setTool(program.toolIdx[0])

    // cameră orbitală simplă
    let theta = -Math.PI / 2.6, phi = 0.95, radius = Math.max(W, H) * 1.6
    const target = new THREE.Vector3(0, 0, -D / 2)
    const placeCamera = () => {
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.cos(theta),
        target.y + radius * Math.sin(phi) * Math.sin(theta),
        target.z + radius * Math.cos(phi)
      )
      camera.up.set(0, 0, 1)
      camera.lookAt(target)
    }
    placeCamera()
    let drag = false, px = 0, py = 0
    const dom = renderer.domElement
    const down = (e: PointerEvent) => { drag = true; px = e.clientX; py = e.clientY }
    const move = (e: PointerEvent) => {
      if (!drag) return
      theta -= (e.clientX - px) * 0.008
      phi = Math.max(0.05, Math.min(1.5, phi - (e.clientY - py) * 0.008))
      px = e.clientX; py = e.clientY
      placeCamera()
    }
    const up = () => { drag = false }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      radius = Math.max(20, Math.min(3000, radius * (1 + e.deltaY * 0.001)))
      placeCamera()
    }
    dom.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    dom.addEventListener('wheel', wheel, { passive: false })

    let last = performance.now()
    let lastUi = 0
    let lastNormals = 0
    let anim = 0
    let reportedEvents = 0
    const loop = (now: number) => {
      anim = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now

      if (st.seekTo >= 0) {
        const target = st.seekTo
        st.seekTo = -1
        if (target < st.t) {
          sim.reset()
          reportedEvents = 0
          setEvents([]) // altfel rămâne afișat mesajul roșu al unei probleme de după punctul nou
        }
        st.t = target
      } else if (st.playing) {
        st.t = Math.min(sim.totalTime, st.t + dt * st.speed)
        if (st.t >= sim.totalTime) st.playing = false
      }
      const p = sim.positionAt(st.t)
      sim.advanceTo(p.move, p.frac)
      setTool(program.toolIdx[p.move])
      if (toolObj) toolObj.position.set(p.x - W / 2, p.y - H / 2, p.z)

      const d = sim.dirty
      if (d.i1 >= d.i0) {
        writeRegion(Math.max(0, d.i0), Math.min(sim.nx - 1, d.i1), Math.max(0, d.j0), Math.min(sim.ny - 1, d.j1))
        sim.clearDirty()
        if (now - lastNormals > 180) { geo.computeVertexNormals(); lastNormals = now }
      }

      if (st.follow) {
        target.set(p.x - W / 2, p.y - H / 2, p.z)
        radius = Math.min(radius, 90)
        placeCamera()
      }

      if (now - lastUi > 100) {
        lastUi = now
        const k = p.move
        setUi({
          t: st.t, total: sim.totalTime, line: program.lineOf[k], x: p.x, y: p.y, z: p.z,
          feed: program.feeds[k], tool: program.tools[program.toolIdx[k]].name, playing: st.playing
        })
        if (sim.events.length !== reportedEvents) {
          reportedEvents = sim.events.length
          setEvents([...sim.events])
          onEventsRef.current?.(sim.events)
          // la o problemă reală simulatorul se oprește, ca un operator atent
          const lastEv = sim.events[sim.events.length - 1]
          if (lastEv && lastEv.kind !== 'toolChange' && st.playing) st.playing = false
        }
      }
      renderer.render(scene, camera)
    }
    anim = requestAnimationFrame(loop)

    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(anim)
      dom.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      dom.removeEventListener('wheel', wheel)
      window.removeEventListener('resize', onResize)
      // eliberăm tot ce ține de placa video: browserul permite doar ~16 contexte 3D
      scene.traverse(obj => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat?.dispose()
      })
      renderer.dispose()
      renderer.forceContextLoss()
      simRef.current = null
    }
  }, [program, autoPlaySpeed])

  const togglePlay = () => {
    const st = stateRef.current
    if (st.t >= (simRef.current?.totalTime ?? 0)) st.seekTo = 0
    st.playing = !st.playing
    setUi(u => ({ ...u, playing: st.playing }))
  }
  const restart = () => {
    stateRef.current.seekTo = 0
    stateRef.current.playing = false
    setUi(u => ({ ...u, playing: false }))
  }
  const seek = (t: number) => { stateRef.current.seekTo = t }

  const runFullCheck = () => {
    if (!program) return
    // verificare completă pe o copie separată, fără să strice animația
    const check = new StockSimulator(program, 120_000)
    check.runAll()
    const found = check.events.filter(e => e.kind !== 'toolChange')
    setFullCheck(found)
    onCheckResultRef.current?.(found.length === 0)
  }
  const onCheckResultRef = useRef(onCheckResult)
  onCheckResultRef.current = onCheckResult

  // verificarea completă pornește singură la fiecare program nou (câteva secunde)
  useEffect(() => {
    if (!program || compact || !program.moves.length) return
    const id = setTimeout(runFullCheck, 400)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, compact])

  const jumpToEvent = (e: SimEvent) => {
    if (!program) return
    const t = e.moveIndex > 0 ? program.endTime[e.moveIndex - 1] : 0
    stateRef.current.playing = false
    seek(t)
  }

  if (!program || !program.moves.length) {
    return (
      <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-8 text-center text-sm text-stone-400">
        {emptyHint ?? 'Nimic de simulat încă.'}
      </div>
    )
  }

  const problems = events.filter(e => e.kind !== 'toolChange')
  const codeLines = program.lines.slice(Math.max(0, ui.line - 3), ui.line + 4)
  const codeStart = Math.max(0, ui.line - 3)

  return (
    <div className="bg-[#1a1815] rounded-xl border border-[#2f2b26] p-3 flex flex-col gap-3 text-stone-200">
      <div className="relative">
        <div ref={mountRef} className={`w-full ${compact ? 'h-[300px]' : 'h-[480px]'} rounded-lg overflow-hidden`} />
        <div className="absolute top-2 left-2 bg-black/60 rounded-lg px-2.5 py-1.5 text-[11px] font-mono leading-5">
          <div>X {ui.x.toFixed(2)} &nbsp;Y {ui.y.toFixed(2)} &nbsp;Z <span className={ui.z < 0 ? 'text-amber-300' : ''}>{ui.z.toFixed(2)}</span></div>
          <div className="text-stone-400">{ui.feed ? `Avans ${Math.round(ui.feed)} mm/min` : 'Deplasare rapidă'} · {ui.tool}</div>
        </div>
        {problems.length > 0 && (
          <div className="absolute top-2 right-2 bg-red-900/85 border border-red-500 rounded-lg px-2.5 py-1.5 text-[11px] text-red-100 max-w-xs flex gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {problems[problems.length - 1].message}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={togglePlay} className="bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
          {ui.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {ui.playing ? 'Pauză' : 'Pornește'}
        </button>
        <button onClick={restart} title="De la început" className="bg-[#221f1b] border border-[#3d362c] rounded-lg px-2 py-1.5"><RotateCcw className="w-4 h-4" /></button>
        <div className="flex items-center gap-1 text-xs">
          <FastForward className="w-4 h-4 text-stone-400" />
          {SPEEDS.map(s => (
            <button key={s} onClick={() => setSpeed(s)} className={`px-2 py-1 rounded font-mono ${speed === s ? 'bg-amber-600 text-white' : 'bg-[#221f1b] text-stone-300'}`}>{s}×</button>
          ))}
        </div>
        <button onClick={() => setFollow(f => !f)} className={`text-xs rounded-lg px-2.5 py-1.5 flex items-center gap-1 ${follow ? 'bg-amber-600 text-white' : 'bg-[#221f1b] border border-[#3d362c]'}`}>
          <Crosshair className="w-3.5 h-3.5" /> Urmărește freza
        </button>
        <span className="ml-auto text-xs font-mono text-stone-300">{fmt(ui.t)} / {fmt(ui.total)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={ui.total || 1}
        step={0.1}
        value={ui.t}
        onChange={e => seek(Number(e.target.value))}
        className="w-full accent-amber-500"
        aria-label="Derulare simulare"
      />

      {!compact && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-[#0f0e0d] rounded-lg p-2 font-mono text-[11px] leading-5 overflow-hidden">
            <div className="text-stone-500 mb-1">G-code trimis mașinii (linia {ui.line + 1}{program.files.length > 1 ? `, ${program.files.filter(f => f.firstLine <= ui.line).slice(-1)[0]?.name}` : ''})</div>
            {codeLines.map((l, i) => (
              <div key={codeStart + i} className={codeStart + i === ui.line ? 'bg-amber-600/30 text-amber-200' : 'text-stone-400'}>
                <span className="text-stone-600 inline-block w-14">{codeStart + i + 1}</span>{l || ' '}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={runFullCheck} className="bg-[#221f1b] border border-[#3d362c] hover:bg-[#2e2a24] rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1.5">
              <Wrench className="w-4 h-4 text-amber-400" /> Verifică tot programul acum (fără să aștepți)
            </button>
            {fullCheck && (fullCheck.length === 0 ? (
              <div className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-2 flex gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Nicio problemă: fără coliziuni, fără tăiere în masă, fără plonjeuri periculoase. Timp real estimat {fmt(program.endTime[program.endTime.length - 1] * 1.1)}.
              </div>
            ) : (
              <div className="text-xs text-red-200 bg-red-950/40 border border-red-800/50 rounded-lg p-2">
                {fullCheck.length} problem{fullCheck.length === 1 ? 'ă' : 'e'} găsit{fullCheck.length === 1 ? 'ă' : 'e'} — click pe una ca să o vezi:
              </div>
            ))}
            <div className="flex flex-col gap-1 max-h-40 overflow-auto">
              {(fullCheck ?? problems).map((e, i) => (
                <button key={i} onClick={() => jumpToEvent(e)} className="text-left text-[11px] bg-red-950/30 hover:bg-red-900/40 border border-red-900/50 rounded px-2 py-1 text-red-100">
                  {e.message}
                </button>
              ))}
            </div>
            {program.unsupported.length > 0 && (
              <div className="text-[10px] text-stone-500">Comenzi ignorate de simulator: {program.unsupported.join(', ')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
