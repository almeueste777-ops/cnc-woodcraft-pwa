import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { WoodTextureType } from '../types/cnc'
import type { MeshResult } from '../utils/meshGenerator'
import {
  Box,
  Eye,
  Layers,
  SunMedium,
  Download,
  Gauge
} from 'lucide-react'

interface Viewer3DProps {
  meshResult: MeshResult | null
  woodType: WoodTextureType
  onWoodTypeChange: (type: WoodTextureType) => void
  onDownloadSTL: () => void
  onDownloadDepth?: () => void
}

export const Viewer3D: React.FC<Viewer3DProps> = ({
  meshResult,
  woodType,
  onWoodTypeChange,
  onDownloadSTL,
  onDownloadDepth
}) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)
  const meshResultRef = useRef<MeshResult | null>(null)
  useEffect(() => { meshResultRef.current = meshResult }, [meshResult])
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null)

  const [lightAngle, setLightAngle] = useState(45)
  const [hoverDepthMm, setHoverDepthMm] = useState<number | null>(null)
  const [showToolpathSimulation, setShowToolpathSimulation] = useState(false)
  const toolpathLinesRef = useRef<THREE.LineSegments | null>(null)

  // Creare textură procedurală fotorealistă sau hartă termică (Topo)
  const createTexture = (type: WoodTextureType): THREE.Texture => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    if (type === 'topo') {
      // Hartă termică de înălțimi (False Color Topography: Albastru -> Cyan -> Verde -> Galben -> Roșu)
      const grad = ctx.createLinearGradient(0, 512, 0, 0)
      grad.addColorStop(0.0, '#1e1b4b') // Adâncime maximă (Mov închis)
      grad.addColorStop(0.25, '#0284c7') // Albastru
      grad.addColorStop(0.5, '#10b981') // Verde mediu
      grad.addColorStop(0.75, '#f59e0b') // Galben / Portocaliu
      grad.addColorStop(1.0, '#ef4444') // Suprafață maximă Z0 (Roșu)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 512, 512)

      // Izolinii / Curbe de nivel de atelier
      ctx.strokeStyle = '#ffffff'
      ctx.globalAlpha = 0.25
      ctx.lineWidth = 1.5
      for (let y = 16; y < 512; y += 24) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(512, y)
        ctx.stroke()
      }

      const tex = new THREE.CanvasTexture(canvas)
      return tex
    }

    if (type === 'gold') {
      // Aur Bizantin Patinat
      const grad = ctx.createLinearGradient(0, 0, 512, 512)
      grad.addColorStop(0.0, '#d97706')
      grad.addColorStop(0.5, '#fef08a')
      grad.addColorStop(1.0, '#78350f')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 512, 512)

      ctx.fillStyle = '#451a03'
      ctx.globalAlpha = 0.15
      for (let i = 0; i < 300; i++) {
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
      }
      return new THREE.CanvasTexture(canvas)
    }

    if (type === 'studio') {
      // Gri Studio de laborator pentru inspecția precisă a umbrelor
      ctx.fillStyle = '#b0b0b0'
      ctx.fillRect(0, 0, 512, 512)
      return new THREE.CanvasTexture(canvas)
    }

    // Esențe de lemn
    let baseColor = '#eadecc' // Tei (Basswood) - foarte luminos, fin
    let ringColor = '#c7b496'

    if (type === 'oak') {
      baseColor = '#c29759'
      ringColor = '#7a5523'
    } else if (type === 'walnut') {
      baseColor = '#4a3327'
      ringColor = '#2d1d15'
    } else if (type === 'cherry') {
      baseColor = '#9e4e37'
      ringColor = '#662615'
    }

    ctx.fillStyle = baseColor
    ctx.fillRect(0, 0, 512, 512)

    // Fibre fine paralele
    ctx.fillStyle = ringColor
    ctx.globalAlpha = 0.16
    for (let i = 0; i < 600; i++) {
      const y = Math.random() * 512
      const h = 1 + Math.random() * 2.5
      ctx.fillRect(0, y, 512, h)
    }

    // Inele anuale moi
    ctx.globalAlpha = 0.07
    for (let r = 20; r < 700; r += 16) {
      ctx.beginPath()
      ctx.arc(256, 800, r, 0, Math.PI * 2)
      ctx.lineWidth = 3
      ctx.strokeStyle = ringColor
      ctx.stroke()
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(1.5, 1.5)
    return texture
  }

  // Inițializare Scenă Three.js
  useEffect(() => {
    if (!mountRef.current) return

    const container = mountRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x131211)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 4000)
    camera.position.set(0, -290, 260)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.innerHTML = ''
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lumini profesionale de studio
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65)
    scene.add(ambientLight)

    // Lumină principală (Key light) cu umbră dinamică
    const dirLight = new THREE.DirectionalLight(0xfffaed, 2.0)
    dirLight.position.set(160, -180, 280)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    dirLight.shadow.normalBias = 0.4 // fără „solzi” de umbră pe relief
    scene.add(dirLight)
    dirLightRef.current = dirLight

    // Lumină de umplere rece (Rim / Fill light)
    const fillLight = new THREE.DirectionalLight(0x94b4e0, 0.45)
    fillLight.position.set(-160, 180, 150)
    scene.add(fillLight)

    // Grilă de bază
    const grid = new THREE.GridHelper(500, 25, 0x443e35, 0x24201b)
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.5
    scene.add(grid)

    // Interacțiune Mouse / Touch (Rotire & Zoom)
    let isDragging = false
    let prevMouseX = 0
    let prevMouseY = 0
    let rotX = 0.35
    let rotZ = 0

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true
      prevMouseX = e.clientX
      prevMouseY = e.clientY
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging || !meshRef.current) return
      const deltaX = e.clientX - prevMouseX
      const deltaY = e.clientY - prevMouseY
      prevMouseX = e.clientX
      prevMouseY = e.clientY

      rotZ += deltaX * 0.009
      rotX += deltaY * 0.009
      rotX = Math.max(-1.3, Math.min(1.3, rotX))

      meshRef.current.rotation.z = rotZ
      meshRef.current.rotation.x = rotX

      if (toolpathLinesRef.current) {
        toolpathLinesRef.current.rotation.z = rotZ
        toolpathLinesRef.current.rotation.x = rotX
      }
    }

    const onPointerUp = () => { isDragging = false }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      camera.position.z += e.deltaY * 0.3
      camera.position.z = Math.max(70, Math.min(800, camera.position.z))
      camera.position.y = -camera.position.z * 1.15
      camera.lookAt(0, 0, 0)
    }

    const dom = renderer.domElement
    dom.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('wheel', onWheel, { passive: false })

    // Citirea adâncimii sub mouse (Inspector). Raza se urmărește direct pe harta de înălțimi:
    // intersecția cu un milion de triunghiuri ar costa ~100 ms la fiecare mișcare a mouse-ului.
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const inv = new THREE.Matrix4()
    let hoverQueued = false
    let lastEvent: MouseEvent | null = null

    const inspect = () => {
      hoverQueued = false
      const e = lastEvent
      const mesh = meshRef.current, mr = meshResultRef.current
      if (!e || !mesh || !mr || isDragging) return
      const rect = dom.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      inv.copy(mesh.matrixWorld).invert()
      const ray = raycaster.ray.clone().applyMatrix4(inv)
      const { origin: o, direction: d } = ray
      const zTop = mr.dimensions.z
      // de la planul de sus al piesei în jos, cu pași de 0,25 mm, apoi înjumătățire
      const tStart = d.z < -1e-6 ? Math.max(0, (zTop - o.z) / d.z) : 0
      const step = 0.25
      let prev = tStart, hit = -1
      for (let k = 0; k < 6000; k++) {
        const t = tStart + k * step
        const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t
        if (z < -1) break
        if (z <= mr.surfaceZAt(x, y)) { hit = t; break }
        prev = t
      }
      if (hit < 0) { setHoverDepthMm(null); return }
      let a = prev, b = hit
      for (let k = 0; k < 12; k++) {
        const m = (a + b) / 2
        if (o.z + d.z * m <= mr.surfaceZAt(o.x + d.x * m, o.y + d.y * m)) b = m
        else a = m
      }
      setHoverDepthMm(Math.round((o.z + d.z * b) * 10) / 10)
    }
    const onHoverInspect = (e: MouseEvent) => {
      lastEvent = e
      if (!hoverQueued) { hoverQueued = true; requestAnimationFrame(inspect) }
    }
    dom.addEventListener('mousemove', onHoverInspect)

    // Buclă de animație
    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animId)
      dom.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('wheel', onWheel)
      dom.removeEventListener('mousemove', onHoverInspect)
      window.removeEventListener('resize', onResize)
      dirLight.shadow.map?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }, [])

  // Actualizare Mesh & Material la schimbarea geometriei sau modului de vizualizare
  useEffect(() => {
    if (!sceneRef.current || !meshResult) return

    if (meshRef.current) {
      sceneRef.current.remove(meshRef.current)
      // geometria se eliberează doar când se schimbă plasa (altfel s-ar retrimite zeci de MB
      // plăcii video la fiecare clic pe o esență de lemn)
      if (meshRef.current.geometry !== meshResult.geometry) meshRef.current.geometry.dispose()
      const mats = Array.isArray(meshRef.current.material) ? meshRef.current.material : [meshRef.current.material]
      for (const m of mats) {
        ;(m as THREE.MeshStandardMaterial).map?.dispose()
        m.dispose()
      }
      meshRef.current = null
    }
    // culorile „Topo” ocupă memorie video doar cât e aleasă harta Topo
    if (woodType !== 'topo' && meshResult.geometry.getAttribute('color')) meshResult.geometry.deleteAttribute('color')

    let material: THREE.Material

    if (woodType === 'wireframe') {
      material = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        wireframe: true
      })
    } else if (woodType === 'gold') {
      const goldTex = createTexture('gold')
      material = new THREE.MeshStandardMaterial({
        map: goldTex,
        metalness: 0.85,
        roughness: 0.28
      })
    } else if (woodType === 'studio') {
      material = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.7,
        metalness: 0.05
      })
    } else if (woodType === 'topo') {
      // culoarea după înălțimea reliefului (fără placa de bază): cel mai adânc = mov, suprafața = roșu
      const geo = meshResult.geometry
      if (!geo.getAttribute('color')) {
        const pos = geo.getAttribute('position')
        const base = meshResult.baseMm
        const span = Math.max(0.001, meshResult.dimensions.z - base)
        const stops = [[0x1e, 0x1b, 0x4b], [0x02, 0x84, 0xc7], [0x10, 0xb9, 0x81], [0xf5, 0x9e, 0x0b], [0xef, 0x44, 0x44]]
        const colors = new Float32Array(pos.count * 3)
        for (let i = 0; i < pos.count; i++) {
          const f = Math.max(0, Math.min(1, (pos.getZ(i) - base) / span)) * (stops.length - 1)
          const k = Math.min(stops.length - 2, Math.floor(f)), r = f - k
          for (let c = 0; c < 3; c++) colors[i * 3 + c] = (stops[k][c] + (stops[k + 1][c] - stops[k][c]) * r) / 255
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      }
      material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.08 })
    } else {
      const tex = createTexture(woodType)
      material = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.5,
        metalness: 0.08,
        flatShading: false
      })
    }

    // umbra trebuie să acopere toată piesa (harta de umbră rămâne aceeași, doar cadrul se schimbă)
    if (dirLightRef.current) {
      const half = Math.max(meshResult.dimensions.x, meshResult.dimensions.y) * 0.75
      const cam = dirLightRef.current.shadow.camera
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half
      cam.near = 1; cam.far = 1200
      cam.updateProjectionMatrix()
    }

    const mesh = new THREE.Mesh(meshResult.geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    sceneRef.current.add(mesh)
    meshRef.current = mesh

    // Simulare trasee sculă de frezare (Toolpaths)
    if (toolpathLinesRef.current) {
      sceneRef.current.remove(toolpathLinesRef.current)
      toolpathLinesRef.current = null
    }

    if (showToolpathSimulation) {
      const linesGeo = generateToolpathLinesGeometry(meshResult)
      const linesMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, opacity: 0.55, transparent: true })
      const lines = new THREE.LineSegments(linesGeo, linesMat)
      sceneRef.current.add(lines)
      toolpathLinesRef.current = lines
    }
  }, [meshResult, woodType, showToolpathSimulation])

  // Ajustare unghi de iluminare
  useEffect(() => {
    if (!dirLightRef.current) return
    const rad = (lightAngle * Math.PI) / 180
    dirLightRef.current.position.set(Math.cos(rad) * 240, Math.sin(rad) * 240, 280)
  }, [lightAngle])

  return (
    <div className="relative w-full h-full min-h-[460px] bg-[#141312] rounded-xl overflow-hidden border border-[#2f2b26] flex flex-col shadow-2xl">
      {/* 3D Viewport */}
      <div ref={mountRef} className="flex-1 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Bară de Sus: Selector Esențe Lemn & Moduri Vizualizare */}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center gap-1 bg-[#1a1815]/95 backdrop-blur-md p-1.5 rounded-xl border border-[#3b3630] pointer-events-auto shadow-2xl">
          <Layers className="w-4 h-4 text-amber-500 ml-1 mr-1" />
          <button
            onClick={() => onWoodTypeChange('lime')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${woodType === 'lime' ? 'bg-amber-600 text-white shadow' : 'text-stone-300 hover:bg-[#2b2721]'}`}
            title="Lemn de Tei - Esența nobilă a icoanelor bizantine"
          >
            Tei (Icoane)
          </button>
          <button
            onClick={() => onWoodTypeChange('oak')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${woodType === 'oak' ? 'bg-amber-600 text-white shadow' : 'text-stone-300 hover:bg-[#2b2721]'}`}
            title="Stejar Nobil"
          >
            Stejar
          </button>
          <button
            onClick={() => onWoodTypeChange('walnut')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${woodType === 'walnut' ? 'bg-amber-600 text-white shadow' : 'text-stone-300 hover:bg-[#2b2721]'}`}
            title="Lemn de Nuc Închis"
          >
            Nuc
          </button>
          <button
            onClick={() => onWoodTypeChange('topo')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${woodType === 'topo' ? 'bg-sky-600 text-white shadow' : 'text-sky-300 hover:bg-[#2b2721]'}`}
            title="Hartă Termică Înălțimi (Inspectare adâncime de sculptură)"
          >
            Hartă Topo (Cote)
          </button>
          <button
            onClick={() => onWoodTypeChange('gold')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${woodType === 'gold' ? 'bg-amber-500 text-stone-900 font-extrabold shadow' : 'text-amber-300 hover:bg-[#2b2721]'}`}
            title="Aur Bizantin Patinat"
          >
            ✨ Aur
          </button>
          <button
            onClick={() => onWoodTypeChange('studio')}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${woodType === 'studio' ? 'bg-stone-600 text-white shadow' : 'text-stone-300 hover:bg-[#2b2721]'}`}
            title="Lumină Razantă Studio (Inspecție umbre fine)"
          >
            Studio Gri
          </button>
          <button
            onClick={() => onWoodTypeChange('wireframe')}
            className={`px-2 py-1 text-xs font-medium rounded-lg transition ${woodType === 'wireframe' ? 'bg-amber-600 text-white shadow' : 'text-stone-400 hover:bg-[#2b2721]'}`}
            title="Rețea de Triunghiuri STL"
          >
            Wireframe
          </button>
        </div>

        {/* Buton Export STL & Toggle Trasee Sculă */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setShowToolpathSimulation(!showToolpathSimulation)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition shadow-lg ${
              showToolpathSimulation
                ? 'bg-sky-600 text-white border-sky-400'
                : 'bg-[#1e1c19]/90 text-stone-300 border-[#3b3630] hover:bg-[#2b2721]'
            }`}
            title="Afișează traseele parcurse de freza CNC peste suprafața 3D"
          >
            <Gauge className="w-3.5 h-3.5 text-sky-400" />
            Trasee Sculă
          </button>

          <button
            onClick={onDownloadSTL}
            disabled={!meshResult}
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold shadow-xl transition disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export STL 3D
          </button>
          {onDownloadDepth && (
            <button
              onClick={onDownloadDepth}
              disabled={!meshResult}
              className="flex items-center gap-1.5 bg-[#25221d] hover:bg-[#322e27] border border-[#443e35] text-stone-200 px-3 py-1.5 rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
              title="Hartă de adâncime PNG gri pe 16 biți (alb = sus), pentru Aspire, ArtCAM, Carveco, Photoshop"
            >
              <Download className="w-3.5 h-3.5 text-amber-500" />
              Hartă adâncime
            </button>
          )}
        </div>
      </div>

      {/* Bară de Jos: Iluminare Razantă & Inspector Cotă Z */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 pointer-events-none">
        {/* Slider unghi lumină pentru umbre adânci */}
        <div className="flex items-center gap-2 bg-[#1a1815]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#3b3630] pointer-events-auto shadow-2xl text-xs text-stone-300">
          <SunMedium className="w-4 h-4 text-amber-400" />
          <span>Unghi Lumină Relief:</span>
          <input
            type="range"
            min="0"
            max="360"
            value={lightAngle}
            onChange={(e) => setLightAngle(Number(e.target.value))}
            className="w-24 accent-amber-500 cursor-pointer"
          />
        </div>

        {/* Inspector Adâncime la Hover & Dimensiuni */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {hoverDepthMm !== null && (
            <div className="bg-[#121110]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-500/50 text-xs font-mono text-amber-300 shadow-xl flex items-center gap-1.5 animate-pulse">
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
              <span>Cotă Înălțime: {hoverDepthMm.toFixed(1)} mm</span>
            </div>
          )}

          {meshResult && (
            <div className="bg-[#1a1815]/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#3b3630] text-xs text-stone-300 shadow-2xl flex items-center gap-3">
              <span className="flex items-center gap-1 font-semibold">
                <Box className="w-3.5 h-3.5 text-amber-500" />
                {meshResult.dimensions.x.toFixed(0)} × {meshResult.dimensions.y.toFixed(0)} × {meshResult.dimensions.z.toFixed(1)} mm
              </span>
              <span className="text-stone-500">|</span>
              <span className="flex items-center gap-1 text-stone-400">
                <Eye className="w-3.5 h-3.5" />
                {meshResult.triangleCount.toLocaleString()} fețe
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Generează liniile de simulare ale parcursului de frezare (Raster toolpaths)
 */
function generateToolpathLinesGeometry(meshResult: MeshResult): THREE.BufferGeometry {
  const linePoints: number[] = []
  const { x: wMm, y: hMm, z: maxZ } = meshResult.dimensions
  const stepMm = 2.5 // la fiecare 2.5mm aratam o linie de trecere

  for (let y = -hMm / 2; y <= hMm / 2; y += stepMm) {
    linePoints.push(-wMm / 2, y, maxZ + 0.5)
    linePoints.push(wMm / 2, y, maxZ + 0.5)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3))
  return geo
}
