import React, { useRef, useEffect, useState } from 'react'
import type { VectorContour } from '../utils/vectorizer'
import { Download, Sliders, Sparkles, Layers } from 'lucide-react'

interface Viewer2DProps {
  processedCanvas: HTMLCanvasElement | null
  contours: VectorContour[]
  widthMm: number
  heightMm: number
  onDownloadSVG: () => void
  onDownloadDXF: () => void
}

export const Viewer2D: React.FC<Viewer2DProps> = ({
  processedCanvas,
  contours,
  widthMm,
  heightMm,
  onDownloadSVG,
  onDownloadDXF
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewMode, setViewMode] = useState<'depthmap' | 'vector' | 'both'>('both')

  useEffect(() => {
    if (!canvasRef.current || !processedCanvas) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!

    canvas.width = processedCanvas.width
    canvas.height = processedCanvas.height

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 1. Desenează harta de adâncime
    if (viewMode === 'depthmap' || viewMode === 'both') {
      ctx.drawImage(processedCanvas, 0, 0)
    } else {
      ctx.fillStyle = '#11100e'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // 2. Desenează căile vectoriale
    if ((viewMode === 'vector' || viewMode === 'both') && contours.length > 0) {
      const scaleX = canvas.width / widthMm
      const scaleY = canvas.height / heightMm

      ctx.save()
      ctx.strokeStyle = viewMode === 'both' ? '#f59e0b' : '#38bdf8'
      ctx.lineWidth = viewMode === 'both' ? 1.5 : 2.0
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      for (const c of contours) {
        if (c.points.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(c.points[0].x * scaleX, c.points[0].y * scaleY)
        for (let i = 1; i < c.points.length; i++) {
          ctx.lineTo(c.points[i].x * scaleX, c.points[i].y * scaleY)
        }
        if (c.isClosed) ctx.closePath()
        ctx.stroke()
      }
      ctx.restore()
    }
  }, [processedCanvas, contours, viewMode, widthMm, heightMm])

  return (
    <div className="relative w-full h-full min-h-[420px] bg-[#141312] rounded-xl overflow-hidden border border-[#2f2b26] flex flex-col">
      {/* Top Bar Switcher */}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 z-10 pointer-events-none">
        <div className="flex items-center gap-1 bg-[#1e1c19]/90 backdrop-blur-md p-1.5 rounded-lg border border-[#3b3630] pointer-events-auto shadow-lg">
          <Layers className="w-4 h-4 text-amber-500 ml-1 mr-1" />
          <button
            onClick={() => setViewMode('both')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${viewMode === 'both' ? 'bg-amber-600 text-white font-bold' : 'text-stone-300 hover:bg-[#2e2a24]'}`}
          >
            Suprapus
          </button>
          <button
            onClick={() => setViewMode('depthmap')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${viewMode === 'depthmap' ? 'bg-amber-600 text-white font-bold' : 'text-stone-300 hover:bg-[#2e2a24]'}`}
          >
            Hartă Relief (Gri)
          </button>
          <button
            onClick={() => setViewMode('vector')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${viewMode === 'vector' ? 'bg-amber-600 text-white font-bold' : 'text-stone-300 hover:bg-[#2e2a24]'}`}
          >
            Vectori Linii
          </button>
        </div>

        {/* Butoane Descărcare Vectori */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={onDownloadSVG}
            disabled={contours.length === 0}
            className="flex items-center gap-1.5 bg-[#25221d] hover:bg-[#322e27] border border-[#443e35] text-stone-200 px-3 py-1.5 rounded-lg text-xs font-medium shadow-md transition disabled:opacity-50"
            title="Descarcă format SVG vectorial"
          >
            <Download className="w-3.5 h-3.5 text-amber-500" />
            SVG
          </button>
          <button
            onClick={onDownloadDXF}
            disabled={contours.length === 0}
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-lg transition disabled:opacity-50"
            title="Descarcă format DXF AutoCAD pentru orice soft CAM/CNC"
          >
            <Download className="w-3.5 h-3.5" />
            DXF (AutoCAD)
          </button>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className="flex-1 w-full h-full flex items-center justify-center p-4 overflow-auto">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-[500px] object-contain rounded-lg shadow-2xl border border-[#3b3630]"
        />
      </div>

      {/* Info bar jos */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-stone-400 bg-[#1e1c19]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[#3b3630]">
        <span className="flex items-center gap-1">
          <Sliders className="w-3.5 h-3.5 text-amber-500" />
          Fizic: {widthMm} × {heightMm} mm
        </span>
        <span className="flex items-center gap-1 text-amber-400">
          <Sparkles className="w-3.5 h-3.5" />
          {contours.length} trasee vectoriale detectate
        </span>
      </div>
    </div>
  )
}
