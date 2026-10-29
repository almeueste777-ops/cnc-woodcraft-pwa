/**
 * Forma de prelucrat la lucrările vectoriale (V-carve, buzunar, profil): o mască alb/negru
 * pe toată piesa, din părțile întunecate ale imaginii și/sau dintr-un text scris cu un font.
 * Masca se desenează cu netezire (anti-aliasing) și abia apoi se taie la prag, ca marginile
 * să cadă între pixeli, nu în trepte de câte un pixel al imaginii.
 */
import type { ShapeMask } from '../cam/vectorCam'

export interface TextSpec {
  text: string
  font: string
  sizeMm: number      // înălțimea literelor mari (aproximativ), în mm
  bold: boolean
  italic: boolean
  yFrac: number       // centrul textului: 0 = sus, 1 = jos
  xFrac: number       // centrul textului: 0 = stânga, 1 = dreapta
  lineSpacing: number // între rânduri, în înălțimi de literă
}

export type ShapeSource = 'image' | 'text' | 'both'

export const FONTS: Array<{ id: string; label: string }> = [
  { id: '"Times New Roman", Times, serif', label: 'Times (clasic, cu serife)' },
  { id: 'Georgia, serif', label: 'Georgia (elegant)' },
  { id: '"Palatino Linotype", "Book Antiqua", Palatino, serif', label: 'Palatino (carte veche)' },
  { id: 'Arial, Helvetica, sans-serif', label: 'Arial (simplu)' },
  { id: 'Verdana, sans-serif', label: 'Verdana (lat, ușor de frezat)' },
  { id: '"Segoe Script", "Brush Script MT", cursive', label: 'Scris de mână' },
  { id: '"Old English Text MT", "Monotype Corsiva", fantasy', label: 'Gotic / caligrafic' }
]

/**
 * Mărimea pixelului măștii: cât mai fină, dar cel mult ~9 milioane de pixeli (~2 s de calcul).
 * Marginea formei e cunoscută cu ±½ pixel; la V-bit adâncimea greșește cu atât / tan(semi-unghi).
 */
export function maskPixelMm(widthMm: number, heightMm: number): number {
  return Math.max(0.05, Math.sqrt((widthMm * heightMm) / 9_000_000))
}

export function buildShapeMask(opts: {
  widthMm: number
  heightMm: number
  source: ShapeSource
  image: HTMLCanvasElement | null
  threshold: number   // 0..255: mai întunecat decât atât = formă
  invertImage: boolean
  text: TextSpec
}): ShapeMask {
  const px = maskPixelMm(opts.widthMm, opts.heightMm)
  const w = Math.max(2, Math.round(opts.widthMm / px)), h = Math.max(2, Math.round(opts.heightMm / px))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const data = new Uint8Array(w * h)

  if ((opts.source === 'image' || opts.source === 'both') && opts.image) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(opts.image, 0, 0, w, h)
    const p = ctx.getImageData(0, 0, w, h).data
    for (let i = 0; i < w * h; i++) {
      const g = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]
      data[i] = (g < opts.threshold) !== opts.invertImage ? 1 : 0
    }
  }

  if ((opts.source === 'text' || opts.source === 'both') && opts.text.text.trim()) {
    const t = opts.text
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    // înălțimea literelor mari ≈ 0.7 din mărimea fontului
    const fontPx = t.sizeMm / 0.7 / px
    ctx.font = `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${fontPx}px ${t.font}`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lines = t.text.split('\n')
    const lh = fontPx * Math.max(0.6, t.lineSpacing)
    const y0 = t.yFrac * h - ((lines.length - 1) * lh) / 2
    lines.forEach((line, k) => ctx.fillText(line, t.xFrac * w, y0 + k * lh))
    const p = ctx.getImageData(0, 0, w, h).data
    for (let i = 0; i < w * h; i++) if (p[i * 4] >= 128) data[i] = 1
  }

  return { data, w, h, widthMm: opts.widthMm, heightMm: opts.heightMm }
}

/** Imaginea măștii (pentru previzualizare): forma în chihlimbar pe fond închis */
export function maskPreviewUrl(mask: ShapeMask, maxSide = 520): string {
  const k = Math.min(1, maxSide / Math.max(mask.w, mask.h))
  const w = Math.max(1, Math.round(mask.w * k)), h = Math.max(1, Math.round(mask.h * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = mask.data[Math.min(mask.h - 1, Math.floor(j / k)) * mask.w + Math.min(mask.w - 1, Math.floor(i / k))]
    const o = (j * w + i) * 4
    img.data[o] = v ? 245 : 32; img.data[o + 1] = v ? 158 : 29; img.data[o + 2] = v ? 11 : 25; img.data[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}
