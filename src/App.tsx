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
import { LessonsHub } from './components/LessonsHub'
import { HelpCenter, CodeCard } from './components/HelpCenter'
import { SimulatorPage, type SimSet } from './components/SimulatorPage'
import { splitIntoTiles, tileCount } from './cam/tiling'
import { WorkflowGuide } from './components/WorkflowGuide'
import { PreflightChecklist } from './components/PreflightChecklist'
import { explainControllerLine, type ControllerCode, type LessonId } from './help/knowledge'
import { processImageHeightmap } from './utils/imageProcessing'
import { generateReliefMesh, type MeshResult } from './utils/meshGenerator'
import { decodeDepthPng16, encodeDepthPng16 } from './utils/depthMapIO'
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
import { DepthEditor } from './components/DepthEditor'
import { applyLayers, composeDepth, type DepthLayer, type Retouch } from './utils/depthEdit'
import type { AiDepthResult } from './utils/aiDepth'
import { VectorPanel } from './components/VectorPanel'
import { buildShapeMask, maskPreviewUrl, FONTS, type ShapeSource, type TextSpec } from './utils/shapeMask'
import type { ShapeMask } from './cam/vectorCam'
import type { VectorOps } from './cam/vectorJob'
import { runVectorInWorker } from './cam/camClient'
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
  // mărimea hărții de mai sus (vine la ~40 ms după imaginea procesată; nu se ia din canvas)
  const [hmSize, setHmSize] = useState({ w: 0, h: 0 })
  // atelierul hărții: relieful calculat din imagine, straturile puse peste el și retușul cu pensula
  const [baseMap, setBaseMap] = useState<{ data: Float32Array; w: number; h: number } | null>(null)
  const [layers, setLayers] = useState<DepthLayer[]>([])
  const [retouch, setRetouch] = useState<Retouch | null>(null)

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
    finishStrategy: 'rasterX',
    cutout: {
      enabled: false,
      shape: 'arch',
      marginMm: 5,
      cornerRadiusMm: 10,
      tool: { ...findTool('em3175'), stepDownMm: 2 },
      tabCount: 4,
      tabWidthMm: 6,
      tabHeightMm: 2
    }
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

  // Lucrări vectoriale (ca în V-Carve Pro): forma vine din imagine și/sau dintr-un text
  const [vectorOps, setVectorOps] = useState<VectorOps>(() => {
    const def: VectorOps = {
      vcarve: { enabled: false, tool: findTool('vb60'), flatDepthMm: 0, clearEnabled: false, clearTool: findTool('em3175') },
      pocket: { enabled: false, tool: findTool('em3175'), depthMm: 3, ramp: { enabled: true, angleDeg: 5 } },
      profile: { enabled: false, tool: findTool('em3175'), side: 'outside', depthMm: 10, tabs: { count: 4, widthMm: 6, heightMm: 2 }, ramp: { enabled: true, angleDeg: 5 } },
      drill: { enabled: false, tool: findTool('em3175'), depthMm: 10, peckMm: 3, fromShapes: true, maxHoleMm: 6, manual: '' }
    }
    // setările salvate de o versiune mai veche pot să nu aibă toate câmpurile: completăm pe fiecare lucrare
    const saved = loadSetting<Partial<VectorOps>>('cnc.vectorOps', {})
    return {
      vcarve: { ...def.vcarve, ...saved.vcarve },
      pocket: { ...def.pocket, ...saved.pocket, ramp: { ...def.pocket.ramp, ...saved.pocket?.ramp } },
      profile: { ...def.profile, ...saved.profile, tabs: { ...def.profile.tabs, ...saved.profile?.tabs }, ramp: { ...def.profile.ramp, ...saved.profile?.ramp } },
      drill: { ...def.drill, ...saved.drill, manual: saved.drill?.manual ?? '' }
    }
  })
  useEffect(() => saveSetting('cnc.vectorOps', vectorOps), [vectorOps])
  const [contourEnabled, setContourEnabled] = useState(true)
  const [shapeSource, setShapeSource] = useState<ShapeSource>('image')
  const [maskThreshold, setMaskThreshold] = useState(128)
  const [maskInvert, setMaskInvert] = useState(false)
  const [textSpec, setTextSpec] = useState<TextSpec>({ text: '', font: FONTS[0].id, sizeMm: 20, bold: false, italic: false, xFrac: 0.5, yFrac: 0.5, lineSpacing: 1.2 })
  const [shapeMask, setShapeMask] = useState<ShapeMask | null>(null)
  const [maskUrl, setMaskUrl] = useState<string | null>(null)
  const vectorOpsOn = vectorOps.vcarve.enabled || vectorOps.pocket.enabled || vectorOps.profile.enabled || vectorOps.drill.enabled

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
  // Împărțirea pe bucăți nu schimbă traseele (doar le taie în fișiere), deci nu le învechește.
  const { bedXMm: _bx, bedYMm: _by, tileCols: _tc, tileRows: _tr, tileMode: _tm, ...pathSettings } = camJob
  const pathKey = JSON.stringify(pathSettings)
  const tiling = useMemo(
    () => ({ bedXMm: camJob.bedXMm, bedYMm: camJob.bedYMm, tileCols: camJob.tileCols, tileRows: camJob.tileRows, tileMode: camJob.tileMode }),
    [camJob.bedXMm, camJob.bedYMm, camJob.tileCols, camJob.tileRows, camJob.tileMode]
  )
  const inputsVersion = useRef(0)
  useEffect(() => {
    inputsVersion.current++
    setRunState(s => (s.stale ? s : { ...s, stale: true }))
    setSimulatedOk(false)
  }, [heightmapData, pathKey, engraveTool, engraveDepthMm, useLaser, laserPower, shapeMask, vectorOps, contourEnabled])

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

  // Orice eroare/alarmă de la mașină apare imediat, explicată în română, oriunde ai fi în aplicație
  const [machineAlert, setMachineAlert] = useState<ControllerCode | null>(null)
  const [everRan, setEverRan] = useState(false)
  useEffect(() => {
    const onMsg = (line: string, dir: 'in' | 'out') => {
      if (dir !== 'in') return
      const code = explainControllerLine(line)
      if (code) setMachineAlert(code)
    }
    cncController.addMessageListener(onMsg)
    return () => cncController.removeMessageListener(onMsg)
  }, [])

  // Lecții / ghid / verificare
  const [lessonToOpen, setLessonToOpen] = useState<LessonId>('intro')
  const openLesson = (id: LessonId) => { setLessonToOpen(id); setMode('tutorials') }
  const [simulatedOk, setSimulatedOk] = useState(false)
  // traseele calculate în alt mod (relief vs. gravură) nu sunt valabile în modul curent
  const [computedFor, setComputedFor] = useState<AppMode | null>(null)
  useEffect(() => {
    if ((mode === 'relief3d' || mode === 'engrave2d') && computedFor && computedFor !== mode) {
      setRunState(s => (s.stale ? s : { ...s, stale: true }))
    }
  }, [mode, computedFor])
  const [preflightIndex, setPreflightIndex] = useState<number | null>(null)

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
      setBaseMap({ data: hData, w: width, h: height })

      const vecResult = traceImageToVectors(pCanvas, 128, 0.4, imageOptions.widthMm, imageOptions.heightMm)
      setContours(vecResult.contours)
      setSvgString(vecResult.svgString)
      setDxfString(vecResult.dxfString)
    }, 120)
    return () => clearTimeout(timer)
  }, [sourceCanvas, depthSource, imageOptions])

  // forma lucrărilor vectoriale: doar în modul gravură, cu mică întârziere (textul se scrie literă cu literă)
  useEffect(() => {
    if (mode !== 'engrave2d') return
    const timer = setTimeout(() => {
      const m = buildShapeMask({
        widthMm: imageOptions.widthMm, heightMm: imageOptions.heightMm, source: shapeSource,
        image: processedCanvas, threshold: maskThreshold, invertImage: maskInvert, text: textSpec
      })
      setShapeMask(m)
      setMaskUrl(maskPreviewUrl(m))
    }, 200)
    return () => clearTimeout(timer)
  }, [mode, imageOptions.widthMm, imageOptions.heightMm, shapeSource, processedCanvas, maskThreshold, maskInvert, textSpec])

  // oglindirea stânga-dreapta întoarce relieful; retușul (pe pixeli) se întoarce odată cu el
  const prevMirror = useRef(!!imageOptions.mirrorX)
  useEffect(() => {
    const m = !!imageOptions.mirrorX
    if (m === prevMirror.current) return
    prevMirror.current = m
    setRetouch(r => {
      if (!r) return r
      const out = new Float32Array(r.data.length)
      for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) out[j * r.w + i] = r.data[j * r.w + (r.w - 1 - i)]
      return { ...r, data: out }
    })
  }, [imageOptions.mirrorX])

  // relieful final = bază + straturi + retuș; din el se fac plasa 3D, traseele și harta descărcată
  const underMap = useMemo(() => {
    if (!baseMap) return null
    if (!layers.some(l => l.visible)) return baseMap
    return { data: applyLayers(baseMap.data, baseMap.w, baseMap.h, layers, imageOptions.widthMm, imageOptions.heightMm), w: baseMap.w, h: baseMap.h }
  }, [baseMap, layers, imageOptions.widthMm, imageOptions.heightMm])
  const meshOptions = useRef(imageOptions)
  meshOptions.current = imageOptions
  useEffect(() => {
    if (!underMap) return
    const timer = setTimeout(() => {
      const hasEdits = underMap !== baseMap || (retouch && retouch.w === underMap.w && retouch.h === underMap.h)
      const final = hasEdits ? composeDepth(underMap.data, retouch, underMap.w, underMap.h) : underMap.data
      setHeightmapData(final)
      setHmSize({ w: underMap.w, h: underMap.h })
      setMeshResult(generateReliefMesh(final, underMap.w, underMap.h, meshOptions.current, 800))
    }, 40)
    return () => clearTimeout(timer)
  }, [underMap, baseMap, retouch])

  const resetResults = () => {
    cancelCam()
    setToolpaths([])
    setLaserGCode(null)
    setSimMesh(null)
    setShowSim(false)
    setRunState({ running: false, stage: '', fraction: 0, error: null, warnings: [], stale: false })
    // retușul ține de pixelii imaginii vechi; straturile rămân (se pot pune pe orice relief)
    setRetouch(null)
  }

  // o hartă de adâncime gata făcută (PNG 16 biți, hartă AI) devine relieful, fără prelucrări
  const applyDepthSource = (src: { data: Float32Array; width: number; height: number }, name: string, msg: string) => {
    let { data, width: dw, height: dh } = src
    if (dw > MAX_IMAGE_DIM || dh > MAX_IMAGE_DIM) {
      const k = MAX_IMAGE_DIM / Math.max(dw, dh)
      const nw = Math.max(1, Math.round(dw * k)), nh = Math.max(1, Math.round(dh * k))
      const small = new Float32Array(nw * nh)
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        small[y * nw + x] = data[Math.min(dh - 1, Math.floor((y + 0.5) / k)) * dw + Math.min(dw - 1, Math.floor((x + 0.5) / k))]
      }
      data = small; dw = nw; dh = nh
    }
    const depth: DepthSource = { data, width: dw, height: dh, name, sizeMm: { x: 0, y: 0, z: 0 } }
    resetResults()
    setDepthSource(depth)
    setSourceCanvas(depthToCanvas(depth))
    setImageOptions(prev => ({
      ...prev,
      reliefMode: 'depthmap',
      heightMm: Math.round(prev.widthMm / (dw / dh)),
      blurRadius: 0, edgeSharpen: 0, haloBoost: 0, contrast: 100, brightness: 0, gamma: 1, invert: false,
      frameStyle: 'none', frameWidthMm: 0
    }))
    showToast(msg)
  }
  const handleAiAsRelief = (d: AiDepthResult, name: string) =>
    applyDepthSource(d, name, `Harta AI folosită ca relief (${d.width}×${d.height}). O poți retușa cu pensula.`)

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

      // hartă de adâncime PNG pe 16 biți: citită cu toată precizia (browserul ar păstra doar 256 de niveluri)
      if (/\.png$/i.test(file.name)) {
        const d16 = await decodeDepthPng16(await file.arrayBuffer())
        if (d16) {
          applyDepthSource(d16, file.name, `Hartă de adâncime pe 16 biți încărcată (${d16.width}×${d16.height}, 65 536 de niveluri)`)
          return
        }
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
    if (heightmapData.length !== hmSize.w * hmSize.h) { showToast('Harta se pregătește — mai apasă o dată peste o clipă.'); return }
    // verificările care nu pornesc niciun calcul: înainte de a marca traseele vechi ca „ale acestui mod”
    if (mode === 'engrave2d' && !useLaser && !contourEnabled && !vectorOpsOn) {
      setRunState(s => ({ ...s, error: 'Bifează cel puțin o lucrare: V-carve, buzunar, profil, găuri sau gravură pe contur.' }))
      return
    }
    if (mode !== 'engrave2d' && !camJob.roughingEnabled && !camJob.finishingEnabled) {
      setRunState(s => ({ ...s, error: 'Activați cel puțin degroșarea sau finisarea.' }))
      return
    }
    const versionAtStart = inputsVersion.current
    const jobAtStart = camJob
    setToolpathJob(jobAtStart)
    setComputedFor(mode)
    setSimulatedOk(false)

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
      setLaserGCode(null)
      const tps: Toolpath[] = contourEnabled ? [vectorEngraveToolpath(contours, engraveTool, jobAtStart, engraveDepthMm)] : []
      if (!vectorOpsOn || !shapeMask) {
        setToolpaths(tps)
        setSimMesh(null)
        setShowSim(false)
        setRunState({ running: false, stage: '', fraction: 1, error: null, warnings: [], stale: false })
        return
      }
      setRunState({ running: true, stage: 'Pornire...', fraction: 0, error: null, warnings: [], stale: false })
      try {
        // gravura pe contur întâi, apoi găuri → buzunar → V-carve → profil (decuparea la final);
        // toate intră în simularea 3D
        const out = await runVectorInWorker({ mask: shapeMask, job: jobAtStart, ops: vectorOps, extraToolpaths: tps }, (stage, fraction) => setRunState(s => ({ ...s, stage, fraction })))
        const all = out.toolpaths
        setToolpaths(all)
        if (out.simulation) {
          const simOpts = { ...imageOptions, maxDepthMm: out.simDepthMm, baseThicknessMm: Math.max(1, jobAtStart.stockThicknessMm - out.simDepthMm) }
          setSimMesh(generateReliefMesh(out.simulation.heightmap, out.simulation.width, out.simulation.height, simOpts, 1000))
          setShowSim(true)
        }
        setRunState({ running: false, stage: '', fraction: 1, error: null, warnings: out.warnings, stale: inputsVersion.current !== versionAtStart })
        const total = all.reduce((s, t) => s + t.stats.estimatedTimeMin, 0)
        showToast(`Trasee gata: ${all.length}, ~${Math.floor(total / 60)}h ${Math.round(total % 60)}m. Vezi simularea 3D.`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg === 'Calcul anulat' || msg.startsWith('Înlocuit')) setRunState(s => ({ ...s, running: false }))
        else setRunState(s => ({ ...s, running: false, error: `Calculul a eșuat: ${msg}` }))
      }
      return
    }

    setLaserGCode(null)
    setRunState({ running: true, stage: 'Pornire...', fraction: 0, error: null, warnings: [], stale: false })
    try {
      const out = await runCamInWorker(
        { heightmap: heightmapData, imgW: hmSize.w, imgH: hmSize.h, job: jobAtStart },
        (stage, fraction) => setRunState(s => ({ ...s, stage, fraction }))
      )
      setToolpaths(out.toolpaths)
      if (out.simulation) {
        setSimMesh(generateReliefMesh(out.simulation.heightmap, out.simulation.width, out.simulation.height, imageOptions, 1000))
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

  // numele vine din tipul lucrării calculate, nu din pagina pe care stai (simulator, control...)
  const baseName = `${(computedFor ?? mode) === 'engrave2d' ? 'gravura' : 'relief3d'}_${imageOptions.widthMm}x${imageOptions.heightMm}`
  // seturi de fișiere: piesa întreagă sau câte unul pe bucată, dacă piesa nu încape pe mașină
  const simSets: SimSet[] = useMemo(() => {
    if (laserGCode || !toolpaths.length) return []
    // traseele cu job-ul de la calcul, împărțirea cu setările de acum
    const job = { ...(toolpathJob ?? camJob), ...tiling }
    const { cols, rows } = tileCount(job, job.bedXMm ?? 0, job.bedYMm ?? 0)
    if (cols * rows === 1) {
      return [{ label: 'Piesa întreagă', job, toolpaths, files: planOutputFiles(toolpaths, job, postId, baseName, forceSeparate) }]
    }
    return splitIntoTiles(toolpaths, job, job.bedXMm ?? 0, job.bedYMm ?? 0).map(t => ({
      label: `${job.tileMode === 'separateBoards' ? 'Placa' : 'Bucata'} ${t.index} (coloana ${t.col}, rândul ${t.row})`,
      job: t.job,
      toolpaths: t.toolpaths,
      files: planOutputFiles(t.toolpaths, t.job, postId, `${baseName}_${job.tileMode === 'separateBoards' ? 'placa' : 'bucata'}${t.index}`, forceSeparate)
    }))
  }, [laserGCode, toolpaths, toolpathJob, camJob, tiling, postId, baseName, forceSeparate])
  // imaginea icoanei, micșorată, pentru schița bucăților
  const tilePreviewUrl = useMemo(() => {
    if (!sourceCanvas) return null
    const s = Math.min(1, 320 / Math.max(sourceCanvas.width, sourceCanvas.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(sourceCanvas.width * s))
    c.height = Math.max(1, Math.round(sourceCanvas.height * s))
    c.getContext('2d')?.drawImage(sourceCanvas, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.8)
  }, [sourceCanvas])
  const outputFiles: PlannedFile[] = useMemo(() => {
    if (laserGCode) return [{ name: `${baseName}_laser.nc`, render: () => laserGCode }]
    return simSets.flatMap(s => s.files)
  }, [laserGCode, baseName, simSets])
  // job-ul fiecărui fișier (la bucăți: originea e colțul bucății, nu cea aleasă pentru piesă)
  const outputFileInfo = useMemo(
    () => simSets.flatMap(s => s.files.map(() => ({ job: s.job, setLabel: simSets.length > 1 ? s.label : null }))),
    [simSets]
  )
  // altă mașină / alt mod de împărțire = alt G-code, care trebuie verificat din nou
  useEffect(() => { setSimulatedOk(false) }, [postId, forceSeparate, tiling])

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

  // Trimiterea trece întâi prin lista de verificare
  const handleSendToCNC = (index: number) => {
    if (!outputFiles[index]) return
    if (!cncStatus.connected) {
      showToast('Conectați întâi utilajul CNC prin cablu USB (sau porniți Mod Simulator).')
      return
    }
    setPreflightIndex(index)
  }
  const startStreaming = (index: number) => {
    const f = outputFiles[index]
    setPreflightIndex(null)
    if (!f) return
    cncController.startStreaming(f.render())
    setEverRan(true)
    setMode('controller')
    showToast(`Execuție pornită: ${f.name}`)
  }
  const preflightTool = (index: number): string => {
    if (laserGCode) return 'Laser'
    const tools = outputFiles[index]?.tools ?? []
    return tools.length ? tools.map(t => t.name).join(', apoi ') : '—'
  }

  const handleDownloadSTL = () => {
    const m = simHere ? simMesh : meshResult
    if (!m) return
    downloadBlob(m.getStlBlob(), `${simHere ? 'simulare_frezare' : 'sculptura_3d'}_${imageOptions.widthMm}x${imageOptions.heightMm}mm.stl`)
  }

  // harta de adâncime a reliefului proiectat (nu a simulării), PNG gri 16 biți, alb = sus
  const handleDownloadDepth = async () => {
    if (!heightmapData || !processedCanvas) return
    if (heightmapData.length !== hmSize.w * hmSize.h) return
    const blob = await encodeDepthPng16(heightmapData, hmSize.w, hmSize.h)
    downloadBlob(blob, `harta_adancime_${imageOptions.widthMm}x${imageOptions.heightMm}x${imageOptions.maxDepthMm}mm_16bit.png`)
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
    const text = serializeProject({
      imageOptions, camJob, postId, engraveTool, engraveDepthMm,
      vector: { ops: vectorOps, text: textSpec, source: shapeSource, threshold: maskThreshold, invert: maskInvert, contourEnabled }
    }, sourceCanvas, depthSource, { layers, retouch })
    downloadBlob(new Blob([text], { type: 'application/json' }), `proiect_cnc_${imageOptions.widthMm}x${imageOptions.heightMm}.json`)
  }
  const openProjectFile = async (file: File) => {
    const { project, canvas, depth, edits } = await parseProject(await file.text())
    resetResults()
    setLayers(edits.layers)
    // retușul din fișier e deja în orientarea proiectului: nu se mai întoarce la schimbarea oglindirii
    prevMirror.current = !!project.imageOptions.mirrorX
    setRetouch(edits.retouch)
    setDepthSource(depth)
    setSourceCanvas(canvas)
    setImageOptions(project.imageOptions)
    const { widthMm: _w, heightMm: _h, maxDepthMm: _d, stockThicknessMm: _s, ...settings } = project.camJob
    setCamSettings(settings)
    setPostId(project.postId)
    setEngraveTool(project.engraveTool)
    setEngraveDepthMm(project.engraveDepthMm)
    if (project.vector) {
      setVectorOps(project.vector.ops)
      setTextSpec(project.vector.text)
      setShapeSource(project.vector.source)
      setMaskThreshold(project.vector.threshold)
      setMaskInvert(project.vector.invert)
      setContourEnabled(project.vector.contourEnabled)
    }
    showToast(`Proiect deschis: ${file.name}`)
  }

  // simularea se arată doar în modul în care s-a calculat (cea vectorială nu e relieful)
  const simHere = showSim && !!simMesh && (computedFor === mode || (mode === 'controller' && computedFor === 'relief3d'))
  const viewerMesh = simHere ? simMesh : meshResult
  const simToggle = simMesh && (mode === 'relief3d' || mode === 'engrave2d') && computedFor === mode && (
    <div className="flex gap-1.5 bg-[#1a1815] border border-[#2f2b26] rounded-xl p-1 w-fit">
      <button onClick={() => setShowSim(false)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${!showSim ? 'bg-amber-600 text-white' : 'text-stone-400'}`}>
        <Box className="w-3.5 h-3.5" /> {mode === 'engrave2d' ? 'Vectori 2D' : 'Model dorit'}
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

      {machineAlert && (
        <div className="fixed bottom-6 left-6 z-50 max-w-md w-[calc(100%-3rem)] shadow-2xl">
          <div className="relative">
            <button onClick={() => setMachineAlert(null)} className="absolute top-2 right-2 text-stone-400 hover:text-white text-xs" aria-label="Închide">✕</button>
            <CodeCard code={machineAlert} onOpenLesson={id => { setMachineAlert(null); openLesson(id) }} />
          </div>
        </div>
      )}

      {preflightIndex !== null && outputFiles[preflightIndex] && (
        <PreflightChecklist
          fileName={outputFiles[preflightIndex].name}
          toolName={preflightTool(preflightIndex)}
          job={outputFileInfo[preflightIndex]?.job ?? toolpathJob ?? camJob}
          tileLabel={outputFileInfo[preflightIndex]?.setLabel ?? null}
          simulatedOk={simulatedOk}
          status={cncStatus}
          onConfirm={() => startStreaming(preflightIndex)}
          onCancel={() => setPreflightIndex(null)}
          onOpenSimulator={() => { setPreflightIndex(null); setMode('simulator') }}
        />
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col gap-4">
        <WorkflowGuide
          state={{
            hasImage: !!sourceCanvas,
            hasToolpaths: (toolpaths.length > 0 || !!laserGCode) && !runState.stale,
            simulatedOk,
            connected: cncStatus.connected,
            running: everRan
          }}
          mode={mode}
          onNavigate={setMode}
          onOpenLesson={openLesson}
        />

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
          <LessonsHub initialLesson={lessonToOpen} onNavigate={setMode} />
        ) : mode === 'help' ? (
          <HelpCenter onOpenLesson={openLesson} />
        ) : mode === 'simulator' ? (
          <SimulatorPage
            sets={simSets}
            stale={runState.stale}
            camJob={camJob}
            onGoToCam={() => setMode('relief3d')}
            onOursChecked={setSimulatedOk}
          />
        ) : mode === 'controller' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Viewer3D meshResult={viewerMesh} woodType={woodType} onWoodTypeChange={setWoodType} onDownloadSTL={handleDownloadSTL} onDownloadDepth={handleDownloadDepth} />
            </div>
            <div>
              <CNCJogController />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 flex flex-col gap-4">
              {mode === 'relief3d' ? (
                <Viewer3D meshResult={viewerMesh} woodType={woodType} onWoodTypeChange={setWoodType} onDownloadSTL={handleDownloadSTL} onDownloadDepth={handleDownloadDepth} />
              ) : showSim && simMesh && computedFor === 'engrave2d' ? (
                <Viewer3D meshResult={simMesh} woodType={woodType} onWoodTypeChange={setWoodType} onDownloadSTL={handleDownloadSTL} />
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
                previewUrl={tilePreviewUrl}
                contourEnabled={contourEnabled}
                onContourEnabledChange={setContourEnabled}
                extraTools={[
                  ...(vectorOps.vcarve.enabled ? [{ label: 'V-carve', tool: vectorOps.vcarve.tool, onApply: (t: CamTool) => setVectorOps(o => ({ ...o, vcarve: { ...o.vcarve, tool: t } })) }] : []),
                  ...(vectorOps.vcarve.enabled && vectorOps.vcarve.flatDepthMm > 0 && vectorOps.vcarve.clearEnabled && vectorOps.vcarve.clearTool ? [{ label: 'Fund plat', tool: vectorOps.vcarve.clearTool, onApply: (t: CamTool) => setVectorOps(o => ({ ...o, vcarve: { ...o.vcarve, clearTool: t } })) }] : []),
                  ...(vectorOps.pocket.enabled ? [{ label: 'Buzunar', tool: vectorOps.pocket.tool, onApply: (t: CamTool) => setVectorOps(o => ({ ...o, pocket: { ...o.pocket, tool: t } })) }] : []),
                  ...(vectorOps.profile.enabled ? [{ label: 'Profil', tool: vectorOps.profile.tool, slot: true, onApply: (t: CamTool) => setVectorOps(o => ({ ...o, profile: { ...o.profile, tool: t } })) }] : []),
                  ...(vectorOps.drill.enabled ? [{ label: 'Găuri', tool: vectorOps.drill.tool, slot: true, onApply: (t: CamTool) => setVectorOps(o => ({ ...o, drill: { ...o.drill, tool: t } })) }] : [])
                ]}
                vectorSlot={
                  <VectorPanel
                    job={camJob}
                    source={shapeSource}
                    onSourceChange={setShapeSource}
                    threshold={maskThreshold}
                    onThresholdChange={setMaskThreshold}
                    invertImage={maskInvert}
                    onInvertImageChange={setMaskInvert}
                    text={textSpec}
                    onTextChange={setTextSpec}
                    ops={vectorOps}
                    onOpsChange={setVectorOps}
                    maskUrl={maskUrl}
                  />
                }
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
              {mode === 'relief3d' && (
                <DepthEditor
                  under={underMap}
                  retouch={retouch}
                  onRetouchChange={setRetouch}
                  layers={layers}
                  onLayersChange={setLayers}
                  pieceWmm={imageOptions.widthMm}
                  pieceHmm={imageOptions.heightMm}
                  maxDepthMm={imageOptions.maxDepthMm}
                  sourceCanvas={sourceCanvas}
                  onUseAsRelief={handleAiAsRelief}
                  notify={showToast}
                />
              )}
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
