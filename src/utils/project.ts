import type { ImageProcessingOptions } from '../types/cnc'
import type { CamJob, CamTool, PostId } from '../cam/types'
import type { DepthSource } from './modelImport'
import type { DepthLayer, Retouch } from './depthEdit'
import type { VectorOps } from '../cam/vectorJob'
import type { ShapeSource, TextSpec } from './shapeMask'

export interface ProjectFile {
  app: 'cnc-woodcraft-studio'
  version: 1
  imageOptions: ImageProcessingOptions
  camJob: CamJob
  postId: PostId
  engraveTool: CamTool
  engraveDepthMm: number
  sourcePng: string // imaginea sursă (data URL)
  depth?: { width: number; height: number; sizeMm: DepthSource['sizeMm']; name: string; base64: string }
  // lucrările vectoriale: textul, forma, frezele și opțiunile fiecărei lucrări
  vector?: {
    ops: VectorOps
    text: TextSpec
    source: ShapeSource
    threshold: number
    invert: boolean
    contourEnabled: boolean
  }
  // atelierul hărții: straturile și retușul cu pensula
  edits?: {
    layers: Array<Omit<DepthLayer, 'data'> & { base64: string }>
    retouch?: { w: number; h: number; base64: string }
  }
}

export interface DepthEdits { layers: DepthLayer[]; retouch: Retouch | null }

function floatToBase64(a: Float32Array): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function base64ToFloat(b64: string): Float32Array {
  const s = atob(b64)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

export function serializeProject(
  p: Omit<ProjectFile, 'app' | 'version' | 'sourcePng' | 'depth' | 'edits'>,
  source: HTMLCanvasElement,
  depth: DepthSource | null,
  edits?: DepthEdits
): string {
  const file: ProjectFile = {
    app: 'cnc-woodcraft-studio',
    version: 1,
    ...p,
    sourcePng: source.toDataURL('image/png'),
    depth: depth
      ? { width: depth.width, height: depth.height, sizeMm: depth.sizeMm, name: depth.name, base64: floatToBase64(depth.data) }
      : undefined,
    edits: edits && (edits.layers.length || edits.retouch)
      ? {
          layers: edits.layers.map(({ data, ...rest }) => ({ ...rest, base64: floatToBase64(data) })),
          retouch: edits.retouch ? { w: edits.retouch.w, h: edits.retouch.h, base64: floatToBase64(edits.retouch.data) } : undefined
        }
      : undefined
  }
  return JSON.stringify(file)
}

export async function parseProject(text: string): Promise<{
  project: ProjectFile
  canvas: HTMLCanvasElement
  depth: DepthSource | null
  edits: DepthEdits
}> {
  const project = JSON.parse(text) as ProjectFile
  if (project.app !== 'cnc-woodcraft-studio') throw new Error('Fișierul nu este un proiect CNC WoodCraft Studio.')
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Imaginea din proiect este deteriorată.'))
    img.src = project.sourcePng
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  const depth = project.depth
    ? { width: project.depth.width, height: project.depth.height, sizeMm: project.depth.sizeMm, name: project.depth.name, data: base64ToFloat(project.depth.base64) }
    : null
  const edits: DepthEdits = {
    layers: (project.edits?.layers ?? []).map(({ base64, ...rest }) => ({ ...rest, data: base64ToFloat(base64) })),
    retouch: project.edits?.retouch
      ? { w: project.edits.retouch.w, h: project.edits.retouch.h, data: base64ToFloat(project.edits.retouch.base64) }
      : null
  }
  return { project, canvas, depth, edits }
}
