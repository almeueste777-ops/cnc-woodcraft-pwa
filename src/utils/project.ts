import type { ImageProcessingOptions } from '../types/cnc'
import type { CamJob, CamTool, PostId } from '../cam/types'
import type { DepthSource } from './modelImport'

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
}

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
  p: Omit<ProjectFile, 'app' | 'version' | 'sourcePng' | 'depth'>,
  source: HTMLCanvasElement,
  depth: DepthSource | null
): string {
  const file: ProjectFile = {
    app: 'cnc-woodcraft-studio',
    version: 1,
    ...p,
    sourcePng: source.toDataURL('image/png'),
    depth: depth
      ? { width: depth.width, height: depth.height, sizeMm: depth.sizeMm, name: depth.name, base64: floatToBase64(depth.data) }
      : undefined
  }
  return JSON.stringify(file)
}

export async function parseProject(text: string): Promise<{
  project: ProjectFile
  canvas: HTMLCanvasElement
  depth: DepthSource | null
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
  return { project, canvas, depth }
}
