import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { WoodTextureType } from '../types/cnc'
import type { MeshResult } from '../utils/meshGenerator'
import { Box, Eye, Layers, SunMedium, Download } from 'lucide-react'

interface Viewer3DProps {
  meshResult: MeshResult | null
  woodType: WoodTextureType
  onWoodTypeChange: (type: WoodTextureType) => void
  onDownloadSTL: () => void
}

export const Viewer3D: React.FC<Viewer3DProps> = ({
  meshResult,
  woodType,
  onWoodTypeChange,
  onDownloadSTL
}) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null)

  const [lightAngle, setLightAngle] = useState(45)

  // Creare textură procedurală realistă de lemn
  const createWoodTexture = (type: WoodTextureType): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')!

    let baseColor = '#e8d8b8' // Tei (Basswood) - tradițional pentru icoane
    let ringColor = '#c4b08c'

    if (type === 'oak') {
      baseColor = '#c9a063'
      ringColor = '#8c6835'
    } else if (type === 'walnut') {
      baseColor = '#5c4033'
      ringColor = '#3b2820'
    } else if (type === 'cherry') {
      baseColor = '#ab5b42'
      ringColor = '#733723'
    }

    ctx.fillStyle = baseColor
    ctx.fillRect(0, 0, 512, 512)

    // Fibre de lemn longitudinale
    ctx.fillStyle = ringColor
    ctx.globalAlpha = 0.18
    for (let i = 0; i < 500; i++) {
      const y = Math.random() * 512
      const h = 1 + Math.random() * 3
      ctx.fillRect(0, y, 512, h)
    }

    // Inele anuale subtile
    ctx.globalAlpha = 0.08
    for (let r = 20; r < 600; r += 14) {
      ctx.beginPath()
      ctx.arc(256, 700, r, 0, Math.PI * 2)
      ctx.lineWidth = 4
      ctx.strokeStyle = ringColor
      ctx.stroke()
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(2, 2)
    return texture
  }

  // Inițializare Three.js
  useEffect(() => {
    if (!mountRef.current) return

    const container = mountRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1918)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000)
    camera.position.set(0, -280, 260)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    container.innerHTML = ''
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lumini
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xfff6e6, 1.8)
    dirLight.position.set(150, -150, 300)
    scene.add(dirLight)
    dirLightRef.current = dirLight

    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.5)
    fillLight.position.set(-150, 150, 100)
    scene.add(fillLight)

    // Grilă suport
    const grid = new THREE.GridHelper(500, 25, 0x444444, 0x2a2a2a)
    grid.rotation.x = Math.PI / 2
    grid.position.z = -0.5
    scene.add(grid)

    // Control rotire cu mouse / touch
    let isDragging = false
    let prevMouseX = 0
    let prevMouseY = 0
    let rotX = 0.3
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

      rotZ += deltaX * 0.01
      rotX += deltaY * 0.01
      rotX = Math.max(-1.2, Math.min(1.2, rotX))

      meshRef.current.rotation.z = rotZ
      meshRef.current.rotation.x = rotX
    }

    const onPointerUp = () => { isDragging = false }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      camera.position.z += e.deltaY * 0.3
      camera.position.z = Math.max(80, Math.min(800, camera.position.z))
      camera.position.y = -camera.position.z * 1.1
      camera.lookAt(0, 0, 0)
    }

    const dom = renderer.domElement
    dom.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('wheel', onWheel, { passive: false })

    // Loop randare
    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()

    // Resize
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
      window.removeEventListener('resize', onResize)
      renderer.dispose()
    }
  }, [])

  // Actualizare Mesh la schimbarea modelului sau texturii de lemn
  useEffect(() => {
    if (!sceneRef.current || !meshResult) return

    if (meshRef.current) {
      sceneRef.current.remove(meshRef.current)
      meshRef.current.geometry.dispose()
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach(m => m.dispose())
      } else {
        meshRef.current.material.dispose()
      }
      meshRef.current = null
    }

    let material: THREE.Material

    if (woodType === 'wireframe') {
      material = new THREE.MeshStandardMaterial({
        color: 0xe6a23c,
        wireframe: true
      })
    } else {
      const woodTex = createWoodTexture(woodType)
      material = new THREE.MeshStandardMaterial({
        map: woodTex,
        roughness: 0.55,
        metalness: 0.08,
        flatShading: false
      })
    }

    const mesh = new THREE.Mesh(meshResult.geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    sceneRef.current.add(mesh)
    meshRef.current = mesh
  }, [meshResult, woodType])

  // Ajustare unghi lumină pentru evidențiere relief
  useEffect(() => {
    if (!dirLightRef.current) return
    const rad = (lightAngle * Math.PI) / 180
    dirLightRef.current.position.set(Math.cos(rad) * 220, Math.sin(rad) * 220, 250)
  }, [lightAngle])

  return (
    <div className="relative w-full h-full min-h-[420px] bg-[#141312] rounded-xl overflow-hidden border border-[#2f2b26] flex flex-col">
      {/* 3D Canvas Mount */}
      <div ref={mountRef} className="flex-1 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Bară de control 3D suprapusă */}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Selector Esență Lemn */}
        <div className="flex items-center gap-1 bg-[#1e1c19]/90 backdrop-blur-md p-1.5 rounded-lg border border-[#3b3630] pointer-events-auto shadow-lg">
          <Layers className="w-4 h-4 text-amber-500 ml-1 mr-1" />
          <button
            onClick={() => onWoodTypeChange('lime')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${woodType === 'lime' ? 'bg-amber-600 text-white font-bold' : 'text-stone-300 hover:bg-[#2e2a24]'}`}
            title="Lemn de Tei - Culoare deschisă, tradițional pentru sculptură de icoane"
          >
            Tei (Icoane)
          </button>
          <button
            onClick={() => onWoodTypeChange('oak')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${woodType === 'oak' ? 'bg-amber-600 text-white font-bold' : 'text-stone-300 hover:bg-[#2e2a24]'}`}
            title="Lemn de Stejar - Fibruos cu textură maronie"
          >
            Stejar
          </button>
          <button
            onClick={() => onWoodTypeChange('walnut')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${woodType === 'walnut' ? 'bg-amber-600 text-white font-bold' : 'text-stone-300 hover:bg-[#2e2a24]'}`}
            title="Lemn de Nuc - Maro închis nobil"
          >
            Nuc
          </button>
          <button
            onClick={() => onWoodTypeChange('wireframe')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${woodType === 'wireframe' ? 'bg-amber-600 text-white font-bold' : 'text-stone-300 hover:bg-[#2e2a24]'}`}
            title="Vedere Wireframe / Rețea de triunghiuri"
          >
            Wireframe
          </button>
        </div>

        {/* Buton Descărcare STL */}
        <div className="pointer-events-auto">
          <button
            onClick={onDownloadSTL}
            disabled={!meshResult}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Export STL 3D
          </button>
        </div>
      </div>

      {/* Control Iluminare Studio & Info model */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 pointer-events-none">
        {/* Slider unghi umbră relief */}
        <div className="flex items-center gap-2 bg-[#1e1c19]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[#3b3630] pointer-events-auto shadow-lg text-xs text-stone-300">
          <SunMedium className="w-3.5 h-3.5 text-amber-400" />
          <span>Iluminare relief:</span>
          <input
            type="range"
            min="0"
            max="360"
            value={lightAngle}
            onChange={(e) => setLightAngle(Number(e.target.value))}
            className="w-24 accent-amber-500 cursor-pointer"
          />
        </div>

        {/* Dimensiuni și statistici model */}
        {meshResult && (
          <div className="bg-[#1e1c19]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[#3b3630] text-xs text-stone-300 shadow-lg flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Box className="w-3.5 h-3.5 text-amber-500" />
              {meshResult.dimensions.x.toFixed(0)} × {meshResult.dimensions.y.toFixed(0)} × {meshResult.dimensions.z.toFixed(1)} mm
            </span>
            <span className="text-stone-500">|</span>
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-stone-400" />
              {meshResult.triangleCount.toLocaleString()} triunghiuri
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
