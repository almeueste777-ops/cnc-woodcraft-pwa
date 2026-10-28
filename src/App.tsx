import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type {
  AppMode,
  ImageProcessingOptions,
  WoodTextureType,
  CNCStatus
} from './types/cnc'
import type { CamJob, CamTool, PostId, Toolpath } from './cam/types'
import { Header } from './components/Header'
import { Viewer3D } from './components/Viewer3D'
import { Viewer2D } from './components/Viewer2D'
import { ImageControls } from './components/ImageControls'
import { CamPanel, type CamRunState } from './components/CamPanel'
import { CNCJogController } from './components/CNCJogController'
import { TutorialHub } from './components/TutorialHub'
import { processImageHeightmap } from './utils/imageProcessing'
import { generateReliefMesh, type MeshResult } from './utils/meshGenerator'
import { traceImageToVectors, type VectorContour } from './utils/vectorizer'
import { generateVectorEngraveGCode } from './utils/gcodeGenerator'
import { cncController } from './utils/serialConnection'
import { generateSampleIconCanvas } from './utils/sampleImages'
import { stlToDepth, depthToCanvas, loadImageFile, type DepthSource } from './utils/modelImport'
import { serializeProject, parseProject } from './utils/project'
import { runCamInWorker, cancelCam } from './cam/camClient'
import { planOutputFiles, type PlannedFile } from './cam/postProcessors'
import { vectorEngraveToolpath } from './cam/vectorToolpath'
import { findTool } from './cam/toolLibrary'
import { CheckCircle2, FolderOpen, Save, Eye, Box } from 'lucide-react'

type CamSettings = Omit<CamJob, 'widthMm' | 'heightMm' | 'maxDepthMm' | 'stockThicknessMm'>

const MAX_IMAGE_DIM = 1600

function loadSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function saveSetting(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* fără stocare: nu e grav */ }
}

export function App() {
  const [mode, setMode] = useState<AppMode>('relief3d')
  const [woodType, setWoodType] = useState<WoodTextureType>('lime')

  // Imagine sursă (sau model 3D convertit în hartă de adâncime)
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null)
  const [depthSource, setDepthSource] = useState<DepthSource | null>(null)
  const depthSourceRef = useRef<DepthSource | null>(null)
  depthSourceRef.current = depthSource
  const [processedCanvas, setProcessedCanvas] = useState<HTMLCanvasElement | null>(null)
  const [heightmapData, setHeightmapData] = useState<Float32Array | null>(null)

  // Rezultate 3D Mesh & Vectori
  const [meshResult, setMeshResult] = useState<MeshResult | null>(null)
  const [contours, setContours] = useState<VectorContour[]>([])
  const [svgString, setSvgString] = useState<string>('')
  const [dxfString, setDxfString] = useState<string>('')

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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = (msg: string) => {
    setToastMessage(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMessage(null), 4000)
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
    facialSmoothing: 60,
    mirrorX: false
  })

  // Setările CAM se păstrează între sesiuni (mașina și sculele nu se schimbă des)
  const [camSettings, setCamSettings] = useState<CamSettings>(() => loadSetting<CamSettings>('cnc.camSettings', {
    xyOrigin: 'bottomLeft',
    zZero: 'top',
    safeZMm: 6,
    rapidRateMmMin: 3000,
    roughingEnabled: true,
    roughingTool: findTool('em6'),
    roughingAllowanceMm: 0.5,
    finishingEnabled: true,
    finishingTool: findTool('bn3175'),
    finishStrategy: 'rasterX'
  }))
  const [postId, setPostId] = useState<PostId>(() => loadSetting('cnc.post', { id: 'grbl' as PostId }).id)
  // implicit fișiere separate pe freză: fără tabelă de lungimi, Z0 trebuie refăcut la fiecare freză
  const [forceSeparate, setForceSeparate] = useState(true)
  const [engraveTool, setEngraveTool] = useState<CamTool>(() => findTool('vb60'))
  const [engraveDepthMm, setEngraveDepthMm] = useState(1.0)
  const [useLaser, setUseLaser] = useState(false)
  const [laserPower, setLaserPower] = useState(1000)

  useEffect(() => saveSetting('cnc.camSettings', camSettings), [camSettings])
  useEffect(() => saveSetting('cnc.post', { id: postId }), [postId])

  const camJob: CamJob = useMemo(() => ({
    ...camSettings,
    widthMm: imageOptions.widthMm,
    heightMm: imageOptions.heightMm,
    maxDepthMm: imageOptions.maxDepthMm,
    stockThicknessMm: imageOptions.baseThicknessMm + imageOptions.maxDepthMm
  }), [camSettings, imageOptions.widthMm, imageOptions.heightMm, imageOptions.maxDepthMm, imageOptions.baseThicknessMm])

  // Rezultate CAM
  const [toolpaths, setToolpaths] = useState<Toolpath[]>([])
  const [laserGCode, setLaserGCode] = useState<string | null>(null)
  const [simMesh, setSimMesh] = useState<MeshResult | null>(null)
  const [showSim, setShowSim] = useState(false)
  const [runState, setRunState] = useState<CamRunState>({ running: false, stage: '', fraction: 0, error: null, warnings: [], stale: false })

  // job-ul exact cu care s-au calculat traseele: fișierele se generează cu el, nu cu cel curent
  const [toolpathJob, setToolpathJob] = useState<CamJob | null>(null)

  // Orice schimbare de imagine/parametri face traseele vechi (dar nu le șterge).
  // Contorul prinde și schimbările făcute ÎN TIMPUL unui calcul.
  const inputsVersion = useRef(0)
  useEffect(() => {
    inputsVersion.current++
    setRunState(s => (s.stale ? s : { ...s, stale: true }))
  }, [heightmapData, camJob, mode, engraveTool, engraveDepthMm, useLaser, laserPower])

  // „Mergi la zero” din panoul CNC urcă la înălțimea sigură a lucrării curente
  useEffect(() => {
    cncController.safeRetractZ = camJob.safeZMm + (camJob.zZero === 'bed' ? camJob.stockThicknessMm : 0)
  }, [camJob])

  // Încarcă o mostră de icoană inițială
  useEffect(() => {
    setSourceCanvas(generateSampleIconCanvas('virginMary'))
  }, [])

  // Ascultător stare CNC
  useEffect(() => {
    const unsub = (s: CNCStatus) => setCncStatus(s)
    cncController.addStatusListener(unsub)
    return () => cncController.removeStatusListener(unsub)
  }, [])

  // Recalculare relief, mesh 3D și vectori (cu mică întârziere: glisoarele nu blochează interfața)
  useEffect(() => {
    if (!sourceCanvas) return
    const timer = setTimeout(() => {
      const { processedCanvas: pCanvas, heightmapData: hData, width, height } = processImageHeightmap(
        sourceCanvas,
        imageOptions,
        depthSource
      )
      setProcessedCanvas(pCanvas)
      setHeightmapData(hData)
      setMeshResult(generateReliefMesh(hData, width, height, imageOptions, 360))

      const vecResult = traceImageToVectors(pCanvas, 128, 0.4, imageOptions.widthMm, imageOptions.heightMm)
      setContours(vecResult.contours)
      setSvgString(vecResult.svgString)
      setDxfString(vecResult.dxfString)
    }, 120)
    return () => clearTimeout(timer)
  }, [sourceCanvas, depthSource, imageOptions])

  const resetResults = () => {
    cancelCam()
    setToolpaths([])
    setLaserGCode(null)
    setSimMesh(null)
    setShowSim(false)
    setRunState({ running: false, stage: '', fraction: 0, error: null, warnings: [], stale: false })
  }

  // Încărcare mostră icoană
  const handleLoadPresetIcon = (type: 'virginMary' | 'christ' | 'cross') => {
    resetResults()
    setDepthSource(null)
    setSourceCanvas(generateSampleIconCanvas(type))
    showToast(`Mostră încărcată: ${type === 'virginMary' ? 'Icoana Maicii Domnului' : type === 'christ' ? 'Icoana Mântuitorului' : 'Cruce Maramureșeană'}`)
  }

  // Încărcare fișier: orice imagine sau model 3D STL
  const handleFile = useCallback(async (file: File) => {
    try {
      if (/\.json$/i.test(file.name)) {
        await openProjectFile(file)
        return
      }
      if (/\.stl$/i.test(file.name)) {
        const depth = stlToDepth(await file.arrayBuffer(), file.name)
        resetResults()
        setDepthSource(depth)
        setSourceCanvas(depthToCanvas(depth))
        const { x, y, z } = depth.sizeMm
        setImageOptions(prev => ({
          ...prev,
          reliefMode: 'depthmap',
          widthMm: Math.round(x * 10) / 10,
          heightMm: Math.round(y * 10) / 10,
          maxDepthMm: Math.round(z * 100) / 100,
          blurRadius: 0,
          edgeSharpen: 0,
          haloBoost: 0,
          contrast: 100,
          brightness: 0,
          gamma: 1,
          invert: false,
          frameStyle: 'none',
          frameWidthMm: 0
        }))
        showToast(`Model 3D încărcat: ${x.toFixed(0)} × ${y.toFixed(0)} × ${z.toFixed(1)} mm (${depth.width}×${depth.height} puncte)`)
        return
      }

      const img = await loadImageFile(file)
      let w = img.naturalWidth || img.width || 1000
      let h = img.naturalHeight || img.height || 1000
      if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) {
        const k = MAX_IMAGE_DIM / Math.max(w, h)
        w = Math.round(w * k)
        h = Math.round(h * k)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff' // fundal alb pentru PNG/SVG transparente
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)

      resetResults()
      setDepthSource(null)
      setImageOptions(prev => ({
        ...prev,
        heightMm: Math.round(prev.widthMm / (w / h)),
        // după un STL rămânea modul „adâncime exactă”, nepotrivit pentru o poză
        ...(depthSourceRef.current ? { reliefMode: 'smartIcon' as const, contrast: 125, gamma: 1.15, blurRadius: 2 } : {})
      }))
      setSourceCanvas(canvas)
      showToast(`Imagine încărcată (${w}×${h} px)`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fișierul nu a putut fi citit.')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tragere fișier peste aplicație
  const [dragOver, setDragOver] = useState(false)
  useEffect(() => {
    const over = (e: DragEvent) => { e.preventDefault(); setDragOver(true) }
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragOver(false) }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) handleFile(file)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [handleFile])

  // Calcul trasee
  const handleCompute = async () => {
    if (!heightmapData || !processedCanvas) return
    const versionAtStart = inputsVersion.current
    const jobAtStart = camJob
    setToolpathJob(jobAtStart)

    if (mode === 'engrave2d') {
      if (useLaser) {
        // laserul are dialectul lui (M4 + putere S); doar GRBL / LaserGRBL / LightBurn
        const flipped = contours.map(c => ({ ...c, points: c.points.map(p => ({ x: p.x, y: imageOptions.heightMm - p.y })) }))
        const out = generateVectorEngraveGCode(flipped, {
          toolType: 'laser', toolDiameterMm: 0.1, tipAngleDeg: 0, stepoverPercent: 10,
          feedRateMmMin: engraveTool.feedRateMmMin, plungeRateMmMin: engraveTool.plungeRateMmMin,
          safeZMm: camJob.safeZMm, spindleRpm: 0, laserPowerMax: laserPower,
          roughingPass: false, roughingStepDownMm: 1, carvingStrategy: 'rasterX'
        }, 0, true)
        setToolpaths([])
        setLaserGCode(out.gcode)
        setRunState({ running: false, stage: '', fraction: 1, error: null, warnings: [], stale: false })
        showToast(`Gravură laser: ${contours.length} contururi, ~${Math.round(out.stats.estimatedTimeMin)} min`)
        return
      }
      const tp = vectorEngraveToolpath(contours, engraveTool, camJob, engraveDepthMm)
      setLaserGCode(null)
      setToolpaths([tp])
      setSimMesh(null)
      setRunState({ running: false, stage: '', fraction: 1, error: null, warnings: [], stale: false })
      return
    }

    if (!camJob.roughingEnabled && !camJob.finishingEnabled) {
      setRunState(s => ({ ...s, error: 'Activați cel puțin degroșarea sau finisarea.' }))
      return
    }

    setLaserGCode(null)
    setRunState({ running: true, stage: 'Pornire...', fraction: 0, error: null, warnings: [], stale: false })
    try {
      const out = await runCamInWorker(
        { heightmap: heightmapData, imgW: processedCanvas.width, imgH: processedCanvas.height, job: jobAtStart },
        (stage, fraction) => setRunState(s => ({ ...s, stage, fraction }))
      )
      setToolpaths(out.toolpaths)
      if (out.simulation) {
        setSimMesh(generateReliefMesh(out.simulation.heightmap, out.simulation.width, out.simulation.height, imageOptions, 360))
        setShowSim(true)
      }
      setRunState({ running: false, stage: '', fraction: 1, error: null, warnings: out.warnings, stale: inputsVersion.current !== versionAtStart })
      const total = out.toolpaths.reduce((s, t) => s + t.stats.estimatedTimeMin, 0)
      showToast(`Trasee gata: ${out.toolpaths.length}, ~${Math.floor(total / 60)}h ${Math.round(total % 60)}m. Vedeți simularea 3D.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'Calcul anulat' || msg.startsWith('Înlocuit')) {
        setRunState(s => ({ ...s, running: false }))
      } else {
        setRunState(s => ({ ...s, running: false, error: `Calculul a eșuat: ${msg}` }))
      }
    }
  }

  const baseName = `${mode === 'relief3d' ? 'relief3d' : 'gravura'}_${imageOptions.widthMm}x${imageOptions.heightMm}`
  const outputFiles: PlannedFile[] = useMemo(() => {
    if (laserGCode) return [{ name: `${baseName}_laser.nc`, render: () => laserGCode }]
    return planOutputFiles(toolpaths, toolpathJob ?? camJob, postId, baseName, forceSeparate)
  }, [laserGCode, toolpaths, toolpathJob, camJob, postId, baseName, forceSeparate])

  // Descărcare fișiere
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast(`Descărcat: ${filename}`)
  }

  const handleDownloadFile = (index: number) => {
    const f = outputFiles[index]
    if (f) downloadBlob(new Blob([f.render()], { type: 'text/plain' }), f.name)
  }

  const handleSendToCNC = (index: number) => {
    const f = outputFiles[index]
    if (!f) return
    if (!cncStatus.connected) {
      showToast('Conectați întâi utilajul CNC prin cablu USB (sau porniți simulatorul).')
      return
    }
    cncController.startStreaming(f.render())
    setMode('controller')
    showToast(`Execuție pornită: ${f.name}`)
  }

  const handleDownloadSTL = () => {
    const m = showSim && simMesh ? simMesh : meshResult
    if (!m) return
    downloadBlob(m.stlBlob, `${showSim && simMesh ? 'simulare_frezare' : 'sculptura_3d'}_${imageOptions.widthMm}x${imageOptions.heightMm}mm.stl`)
  }

  const handleDownloadSVG = () => {
    if (svgString) downloadBlob(new Blob([svgString], { type: 'image/svg+xml' }), `gravura_vectoriala_${imageOptions.widthMm}x${imageOptions.heightMm}mm.svg`)
  }

  const handleDownloadDXF = () => {
    if (dxfString) downloadBlob(new Blob([dxfString], { type: 'application/dxf' }), `vectori_autocad_${imageOptions.widthMm}x${imageOptions.heightMm}mm.dxf`)
  }

  // Proiect: salvare / deschidere
  const projectInputRef = useRef<HTMLInputElement>(null)
  const handleSaveProject = () => {
    if (!sourceCanvas) return
    const text = serializeProject({ imageOptions, camJob, postId, engraveTool, engraveDepthMm }, sourceCanvas, depthSource)
    downloadBlob(new Blob([text], { type: 'application/json' }), `proiect_cnc_${imageOptions.widthMm}x${imageOptions.heightMm}.json`)
  }
  const openProjectFile = async (file: File) => {
    const { project, canvas, depth } = await parseProject(await file.text())
    resetResults()
    setDepthSource(depth)
    setSourceCanvas(canvas)
    setImageOptions(project.imageOptions)
    const { widthMm: _w, heightMm: _h, maxDepthMm: _d, stockThicknessMm: _s, ...settings } = project.camJob
    setCamSettings(settings)
    setPostId(project.postId)
    setEngraveTool(project.engraveTool)
    setEngraveDepthMm(project.engraveDepthMm)
    showToast(`Proiect deschis: ${file.name}`)
  }

  const viewerMesh = showSim && simMesh ? simMesh : meshResult
  const simToggle = simMesh && mode === 'relief3d' && (
    <div className="flex gap-1.5 bg-[#1a1815] border border-[#2f2b26] rounded-xl p-1 w-fit">
      <button onClick={() => setShowSim(false)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${!showSim ? 'bg-amber-600 text-white' : 'text-stone-400'}`}>
        <Box className="w-3.5 h-3.5" /> Model dorit
      </button>
      <button onClick={() => setShowSim(true)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${showSim ? 'bg-amber-600 text-white' : 'text-stone-400'}`}>
        <Eye className="w-3.5 h-3.5" /> Simulare frezare (cum iese din lemn)
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#11100e] text-stone-200 flex flex-col font-sans select-none">
      <Header mode={mode} onModeChange={setMode} cncStatus={cncStatus} />

      {dragOver && (
        <div className="fixed inset-0 z-50 bg-amber-900/40 border-4 border-dashed border-amber-400 flex items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-white bg-black/60 px-6 py-3 rounded-xl">Lăsați fișierul aici (imagine, STL sau proiect .json)</span>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-amber-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 border border-amber-400 animate-slide-up max-w-md">
          <CheckCircle2 className="w-4 h-4 text-amber-200 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col gap-4">
        {(mode === 'relief3d' || mode === 'engrave2d') && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={projectInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) openProjectFile(f).catch(err => showToast(err.message))
                e.target.value = ''
              }}
            />
            <button onClick={() => projectInputRef.current?.click()} className="flex items-center gap-1.5 text-xs bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3d362c] px-3 py-1.5 rounded-lg font-bold">
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" /> Deschide proiect
            </button>
            <button onClick={handleSaveProject} className="flex items-center gap-1.5 text-xs bg-[#221f1b] hover:bg-[#2e2a24] border border-[#3d362c] px-3 py-1.5 rounded-lg font-bold">
              <Save className="w-3.5 h-3.5 text-amber-400" /> Salvează proiect
            </button>
            {simToggle}
          </div>
        )}

        {mode === 'tutorials' ? (
          <TutorialHub />
        ) : mode === 'controller' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Viewer3D meshResult={viewerMesh} woodType={woodType} onWoodTypeChange={setWoodType} onDownloadSTL={handleDownloadSTL} />
            </div>
            <div>
              <CNCJogController />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 flex flex-col gap-4">
              {mode === 'relief3d' ? (
                <Viewer3D meshResult={viewerMesh} woodType={woodType} onWoodTypeChange={setWoodType} onDownloadSTL={handleDownloadSTL} />
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

              <CamPanel
                mode={mode === 'engrave2d' ? 'engrave2d' : 'relief3d'}
                job={camJob}
                onJobChange={j => {
                  const { widthMm: _w, heightMm: _h, maxDepthMm: _d, stockThicknessMm: _s, ...settings } = j
                  setCamSettings(settings)
                }}
                postId={postId}
                onPostChange={setPostId}
                forceSeparate={forceSeparate}
                onForceSeparateChange={setForceSeparate}
                engraveDepthMm={engraveDepthMm}
                onEngraveDepthChange={setEngraveDepthMm}
                engraveTool={engraveTool}
                onEngraveToolChange={setEngraveTool}
                useLaser={useLaser}
                onUseLaserChange={setUseLaser}
                laserPower={laserPower}
                onLaserPowerChange={setLaserPower}
                runState={runState}
                toolpaths={laserGCode ? [] : toolpaths}
                outputFiles={runState.stale ? [] : outputFiles}
                onCompute={handleCompute}
                onCancel={() => cancelCam()}
                onDownload={handleDownloadFile}
                onSendToCNC={handleSendToCNC}
                isCNCConnected={cncStatus.connected}
                isStreaming={cncController.streaming}
              />
              {laserGCode && !runState.stale && (
                <div className="flex gap-2">
                  <button onClick={() => handleDownloadFile(0)} className="flex-1 bg-[#221f1b] border border-[#3d362c] py-2 rounded-lg text-xs font-bold">Descarcă {outputFiles[0]?.name}</button>
                  <button onClick={() => handleSendToCNC(0)} disabled={!cncStatus.connected} className="px-3 bg-emerald-700 text-white font-bold text-xs rounded-lg disabled:opacity-40">Trimite USB</button>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 flex flex-col gap-4">
              <ImageControls
                options={imageOptions}
                onOptionsChange={setImageOptions}
                onLoadPresetIcon={handleLoadPresetIcon}
                onFileSelected={handleFile}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-[#25221d] py-2 px-4 text-center text-[11px] text-stone-500 bg-[#12110f]">
        CNC WoodCraft Studio • Funcționează offline • GRBL, FluidNC, Mach3/4, LinuxCNC, UCCNC, Marlin, RichAuto, Weihong/NK, ISO • STL, DXF, SVG, G-Code
      </footer>
    </div>
  )
}
export default App
