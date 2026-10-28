import { useState, useEffect, useCallback } from 'react'
import type {
  AppMode,
  ImageProcessingOptions,
  ToolSettings,
  WoodTextureType,
  CNCStatus,
  GCodeStats
} from './types/cnc'
import { Header } from './components/Header'
import { Viewer3D } from './components/Viewer3D'
import { Viewer2D } from './components/Viewer2D'
import { ImageControls } from './components/ImageControls'
import { GCodePanel } from './components/GCodePanel'
import { CNCJogController } from './components/CNCJogController'
import { TutorialHub } from './components/TutorialHub'
import { processImageHeightmap } from './utils/imageProcessing'
import { generateReliefMesh, type MeshResult } from './utils/meshGenerator'
import { traceImageToVectors, type VectorContour } from './utils/vectorizer'
import { generate3DReliefGCode, generateVectorEngraveGCode } from './utils/gcodeGenerator'
import { cncController } from './utils/serialConnection'
import { generateSampleIconCanvas } from './utils/sampleImages'
import { CheckCircle2 } from 'lucide-react'

export function App() {
  const [mode, setMode] = useState<AppMode>('relief3d')
  const [woodType, setWoodType] = useState<WoodTextureType>('lime')

  // Imagine sursă canvas curentă
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null)
  const [processedCanvas, setProcessedCanvas] = useState<HTMLCanvasElement | null>(null)
  const [heightmapData, setHeightmapData] = useState<Float32Array | null>(null)

  // Rezultate 3D Mesh & Vectori
  const [meshResult, setMeshResult] = useState<MeshResult | null>(null)
  const [contours, setContours] = useState<VectorContour[]>([])
  const [svgString, setSvgString] = useState<string>('')
  const [dxfString, setDxfString] = useState<string>('')

  // G-Code generat
  const [currentGCode, setCurrentGCode] = useState<string>('')
  const [gcodeStats, setGcodeStats] = useState<GCodeStats | null>(null)

  // Status CNC
  const [cncStatus, setCncStatus] = useState<CNCStatus>({
    connected: false,
    isSimulated: false,
    state: 'Disconnected',
    mPos: { x: 0, y: 0, z: 0 },
    wPos: { x: 0, y: 0, z: 0 },
    feedRate: 0,
    spindleSpeed: 0
  })

  // Notificări toast
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Opțiuni prelucrare imagine (implicit optimizate pentru icoane pe lemn)
  const [imageOptions, setImageOptions] = useState<ImageProcessingOptions>({
    widthMm: 200,
    heightMm: 280,
    maxDepthMm: 16,
    baseThicknessMm: 6,
    invert: false,
    contrast: 125,
    brightness: 5,
    gamma: 1.15,
    blurRadius: 2,
    edgeSharpen: 45,
    haloBoost: 55,
    frameStyle: 'arch',
    frameWidthMm: 16,
    reliefMode: 'smartIcon',
    macroDomeVolume: 75,
    microDetailStrength: 65,
    antiHoleProtection: 85,
    bgSeparationLevel: 70,
    facialSmoothing: 60
  })

  // Parametri sculă & prelucrare CNC
  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    toolType: 'ballnose',
    toolDiameterMm: 3.175, // 1/8 inch standard
    tipAngleDeg: 30,
    stepoverPercent: 10,   // 10% pas lateral pentru finisaj oglindă în lemn
    feedRateMmMin: 1800,
    plungeRateMmMin: 400,
    safeZMm: 6,
    spindleRpm: 18000,
    laserPowerMax: 1000,
    roughingPass: false,
    roughingStepDownMm: 3,
    carvingStrategy: 'rasterX'
  })

  // Încarcă o mostră de icoană inițială
  useEffect(() => {
    const initCanvas = generateSampleIconCanvas('virginMary')
    setSourceCanvas(initCanvas)
  }, [])

  // Ascultător stare CNC
  useEffect(() => {
    const unsub = (s: CNCStatus) => setCncStatus(s)
    cncController.addStatusListener(unsub)
    return () => {
      cncController.removeStatusListener(unsub)
    }
  }, [])

  // Recalculare procesare imagine, mesh 3D și vectori la schimbarea parametrilor
  useEffect(() => {
    if (!sourceCanvas) return

    // 1. Procesare înălțime (Heightmap)
    const { processedCanvas: pCanvas, heightmapData: hData, width, height } = processImageHeightmap(
      sourceCanvas,
      imageOptions
    )
    setProcessedCanvas(pCanvas)
    setHeightmapData(hData)

    // 2. Generare Mesh 3D & STL de înaltă definiție (fără trepte de pixel)
    const mResult = generateReliefMesh(hData, width, height, imageOptions, 360)
    setMeshResult(mResult)

    // 3. Generare vectori (pentru gravură contur / export DXF/SVG)
    const vecResult = traceImageToVectors(
      pCanvas,
      128,
      0.4,
      imageOptions.widthMm,
      imageOptions.heightMm
    )
    setContours(vecResult.contours)
    setSvgString(vecResult.svgString)
    setDxfString(vecResult.dxfString)
  }, [sourceCanvas, imageOptions])

  // Încărcare mostră icoană
  const handleLoadPresetIcon = (type: 'virginMary' | 'christ' | 'cross') => {
    const canvas = generateSampleIconCanvas(type)
    setSourceCanvas(canvas)
    showToast(`Mostră încărcată: ${type === 'virginMary' ? 'Icoana Maicii Domnului' : type === 'christ' ? 'Icoana Mântuitorului' : 'Cruce Maramureșeană'}`)
  }

  // Încărcare imagine proprie de la utilizator cu super-rezoluție
  const handleImageUploaded = (img: HTMLImageElement) => {
    const canvas = document.createElement('canvas')
    // Păstrăm rezoluție Ultra-HD de până la 1600px pentru contururi de maximă finețe
    const maxDim = 1600
    let w = img.width
    let h = img.height
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w)
        w = maxDim
      } else {
        w = Math.round((w * maxDim) / h)
        h = maxDim
      }
    }
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)

    // Ajustăm și dimensiunile fizice păstrând raportul de aspect al imaginii
    const aspect = w / h
    const newHeightMm = Math.round(imageOptions.widthMm / aspect)
    setImageOptions(prev => ({ ...prev, heightMm: newHeightMm }))

    setSourceCanvas(canvas)
    showToast(`Imagine încărcată cu succes (${w}x${h} px)`)
  }

  // Generare G-Code
  const handleGenerateGCode = useCallback(() => {
    if (!heightmapData || !processedCanvas) return

    if (mode === 'engrave2d') {
      // Mod Gravură Vectorială
      const out = generateVectorEngraveGCode(
        contours,
        toolSettings,
        1.0,
        toolSettings.toolType === 'laser'
      )
      setCurrentGCode(out.gcode)
      setGcodeStats(out.stats)
      showToast(`G-Code Gravură calculat: ${out.stats.totalLines} linii, ~${Math.round(out.stats.estimatedTimeMin)} min.`)
    } else {
      // Mod Sculptură 3D Relief
      const out = generate3DReliefGCode(
        heightmapData,
        processedCanvas.width,
        processedCanvas.height,
        imageOptions,
        toolSettings
      )
      setCurrentGCode(out.gcode)
      setGcodeStats(out.stats)
      showToast(`G-Code 3D Relief calculat: ${out.stats.totalLines} linii, ~${Math.floor(out.stats.estimatedTimeMin / 60)}h ${Math.round(out.stats.estimatedTimeMin % 60)}m.`)
    }
  }, [heightmapData, processedCanvas, mode, contours, toolSettings, imageOptions])

  // Descărcare fișiere
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(`Descărcat: ${filename}`)
  }

  const handleDownloadSTL = () => {
    if (!meshResult) return
    downloadBlob(meshResult.stlBlob, `sculptura_3d_${imageOptions.widthMm}x${imageOptions.heightMm}mm.stl`)
  }

  const handleDownloadSVG = () => {
    if (!svgString) return
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    downloadBlob(blob, `gravura_vectoriala_${imageOptions.widthMm}x${imageOptions.heightMm}mm.svg`)
  }

  const handleDownloadDXF = () => {
    if (!dxfString) return
    const blob = new Blob([dxfString], { type: 'application/dxf' })
    downloadBlob(blob, `vectori_autocad_${imageOptions.widthMm}x${imageOptions.heightMm}mm.dxf`)
  }

  const handleDownloadGCode = (extension: 'nc' | 'gcode' | 'tap') => {
    if (!currentGCode) {
      handleGenerateGCode()
      return
    }
    const blob = new Blob([currentGCode], { type: 'text/plain' })
    downloadBlob(blob, `cnc_${mode === 'relief3d' ? 'relief3d' : 'gravura'}.${extension}`)
  }

  const handleSendToCNC = () => {
    if (!currentGCode) {
      handleGenerateGCode()
    }
    if (!cncStatus.connected) {
      showToast('Eroare: Conectați întâi utilajul CNC prin cablu USB!')
      return
    }
    cncController.startStreaming(currentGCode)
    setMode('controller')
    showToast('Execuție pornită pe CNC! Comutare în panoul de monitorizare...')
  }

  return (
    <div className="min-h-screen bg-[#11100e] text-stone-200 flex flex-col font-sans select-none">
      {/* Antet Aplicație */}
      <Header
        mode={mode}
        onModeChange={setMode}
        cncStatus={cncStatus}
      />

      {/* Mesaj Toast Notificare */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-amber-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 border border-amber-400 animate-slide-up">
          <CheckCircle2 className="w-4 h-4 text-amber-200" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Conținut Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col gap-4">
        {mode === 'tutorials' ? (
          /* Vedere Centru de Învățare & Tutoriale Video & Fusion 360 */
          <TutorialHub />
        ) : mode === 'controller' ? (
          /* Vedere Control CNC Direct (Jog, Zero, Terminal, Streaming) */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Viewer3D
                meshResult={meshResult}
                woodType={woodType}
                onWoodTypeChange={setWoodType}
                onDownloadSTL={handleDownloadSTL}
              />
            </div>
            <div>
              <CNCJogController />
            </div>
          </div>
        ) : (
          /* Vedere Standard: Vizualizator 3D / 2D (Stânga) + Controale Prelucrare & CAM (Dreapta) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Coloană Vizualizare (3D sau 2D) */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              {mode === 'relief3d' ? (
                <Viewer3D
                  meshResult={meshResult}
                  woodType={woodType}
                  onWoodTypeChange={setWoodType}
                  onDownloadSTL={handleDownloadSTL}
                />
              ) : (
                <Viewer2D
                  processedCanvas={processedCanvas}
                  contours={contours}
                  widthMm={imageOptions.widthMm}
                  heightMm={imageOptions.heightMm}
                  onDownloadSVG={handleDownloadSVG}
                  onDownloadDXF={handleDownloadDXF}
                />
              )}

              {/* Panou G-Code & CAM integrat jos */}
              <GCodePanel
                toolSettings={toolSettings}
                onToolSettingsChange={setToolSettings}
                gcodeStats={gcodeStats}
                onGenerateGCode={handleGenerateGCode}
                onDownloadGCode={handleDownloadGCode}
                onSendToCNC={handleSendToCNC}
                isStreaming={cncStatus.state === 'Run'}
                isCNCConnected={cncStatus.connected}
              />
            </div>

            {/* Coloană Filtre Prelucrare & Parametri Icoană / Lemn */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <ImageControls
                options={imageOptions}
                onOptionsChange={setImageOptions}
                onLoadPresetIcon={handleLoadPresetIcon}
                onImageUploaded={handleImageUploaded}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#25221d] py-2 px-4 text-center text-[11px] text-stone-500 bg-[#12110f]">
        CNC WoodCraft Studio PWA • Funcționează 100% Offline • Compatibil GRBL, Marlin, FluidNC, Mach3, Aspire • Generare directă STL, DXF & G-Code
      </footer>
    </div>
  )
}
export default App
