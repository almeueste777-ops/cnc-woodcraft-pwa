import type { ImageProcessingOptions } from '../types/cnc'

/**
 * Procesează imaginea sursă și produce un ImageData normalizat (0-255 nivel de gri)
 * gata de folosit ca hartă de adâncime (Heightmap) pentru sculptură 3D sau gravură.
 */
export function processImageHeightmap(
  sourceCanvas: HTMLCanvasElement,
  options: ImageProcessingOptions
): {
  processedCanvas: HTMLCanvasElement
  heightmapData: Float32Array
  width: number
  height: number
} {
  const width = sourceCanvas.width
  const height = sourceCanvas.height

  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = width
  outputCanvas.height = height
  const ctx = outputCanvas.getContext('2d', { willReadFrequently: true })!
  
  ctx.drawImage(sourceCanvas, 0, 0)
  const imgData = ctx.getImageData(0, 0, width, height)
  const pixels = imgData.data

  const totalPixels = width * height
  let rawGrayscale: any = new Float32Array(totalPixels)

  // 1. Conversie la gri perceptual (Luminance)
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4
    const r = pixels[idx]
    const g = pixels[idx + 1]
    const b = pixels[idx + 2]
    // Perceptual luminance formula Rec. 709
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    rawGrayscale[i] = lum
  }

  // 2. Netezire Gaussian / Box blur pentru a elimina pixelarea lemnului
  if (options.blurRadius > 0) {
    rawGrayscale = applySeparableBlur(rawGrayscale, width, height, options.blurRadius)
  }

  // 3. Accentuare contururi (Unsharp Mask) dacă e activat
  if (options.edgeSharpen > 0) {
    rawGrayscale = applySharpen(rawGrayscale, rawGrayscale, width, height, options.edgeSharpen / 50)
  }

  const smoothed = rawGrayscale

  // 4. Transformări de contrast, luminozitate și gamma
  const contrastFactor = options.contrast / 100 // 1.0 = normal
  const brightnessOffset = options.brightness // -100 to 100
  const gamma = Math.max(0.1, options.gamma)

  // 5. Aplicare ramă sau arcadă (boltă de icoană)
  const frameBorderX = (options.frameWidthMm / Math.max(1, options.widthMm)) * width
  const frameBorderY = (options.frameWidthMm / Math.max(1, options.heightMm)) * height

  const heightmap = new Float32Array(totalPixels)

  for (let y = 0; y < height; y++) {
    const ny = y / height // 0 la 1
    for (let x = 0; x < width; x++) {
      const nx = x / width // 0 la 1
      const i = y * width + x
      let val = smoothed[i]

      // Contrast & Brightness
      val = (val - 128) * contrastFactor + 128 + brightnessOffset
      val = Math.max(0, Math.min(255, val))

      // Gamma correction: normalizeaza 0-1, aplica exponent, readu la 0-1
      let norm = val / 255.0
      norm = Math.pow(norm, 1 / gamma)

      // Halo Boost pentru Icoane (ridică nimbul sfinților)
      if (options.haloBoost > 0) {
        // Presupunem centrul aureolei în treimea superioară
        const haloCenterX = 0.5
        const haloCenterY = 0.35
        const dx = (nx - haloCenterX) * (width / height)
        const dy = ny - haloCenterY
        const dist = Math.sqrt(dx * dx + dy * dy)
        // Daca distanta este in raza nimbului (aprox 0.15 - 0.28)
        if (dist > 0.12 && dist < 0.28) {
          const ringStrength = Math.sin(((dist - 0.12) / 0.16) * Math.PI)
          norm = Math.min(1.0, norm + ringStrength * (options.haloBoost / 150))
        }
      }

      // Inversare dacă albul este adâncit sau ieșit
      if (options.invert) {
        norm = 1.0 - norm
      }

      // Ramă decorativă / Arcadă icoană
      if (options.frameStyle !== 'none' && options.frameWidthMm > 0) {
        norm = applyFrameProfile(norm, x, y, width, height, frameBorderX, frameBorderY, options.frameStyle)
      }

      heightmap[i] = Math.max(0, Math.min(1, norm))

      // Re-scriem în ImageData pentru canvas
      const displayVal = Math.round(heightmap[i] * 255)
      const pIdx = i * 4
      pixels[pIdx] = displayVal
      pixels[pIdx + 1] = displayVal
      pixels[pIdx + 2] = displayVal
      pixels[pIdx + 3] = 255
    }
  }

  ctx.putImageData(imgData, 0, 0)

  return {
    processedCanvas: outputCanvas,
    heightmapData: heightmap,
    width,
    height
  }
}

/**
 * Aplică profilul de ramă pe margini (ex. ramă simplă cu profil convex sau arcadă de icoană)
 */
function applyFrameProfile(
  originalNorm: number,
  x: number,
  y: number,
  w: number,
  h: number,
  borderX: number,
  borderY: number,
  style: 'simple' | 'arch' | 'ornate'
): number {
  const distLeft = x
  const distRight = w - 1 - x
  const distBottom = h - 1 - y
  let distTop = y

  // Pentru arcada de icoană: curbă la partea superioară
  if (style === 'arch') {
    const cx = w / 2
    const archRadius = w * 0.48
    const dx = Math.abs(x - cx)
    if (dx < archRadius && y < h * 0.4) {
      const archY = (h * 0.35) - Math.sqrt(Math.max(0, archRadius * archRadius - dx * dx)) * 0.7
      if (archY > 0) {
        distTop = Math.max(0, y - archY)
      }
    }
  }

  const minBorderDist = Math.min(distLeft / borderX, distRight / borderX, distBottom / borderY, distTop / borderY)

  if (minBorderDist < 1.0) {
    // Suntem în zona ramei: generăm un profil de ramură lemn clasic
    const t = Math.max(0, minBorderDist)
    let frameElevation = 0
    if (style === 'ornate') {
      // Profil triplu canelat clasic de icoană bizantină
      frameElevation = 0.5 + 0.5 * Math.sin(t * Math.PI * 2.5) * Math.sin(t * Math.PI * 0.5)
    } else {
      // Profil rotunjit sfert de cerc (cove/roundover)
      frameElevation = Math.sin(t * Math.PI * 0.5)
    }
    return Math.max(originalNorm * t, frameElevation * 0.85 + 0.15 * originalNorm)
  }

  return originalNorm
}

/**
 * Separable Blur rapid pentru netezirea hărților de relief
 */
function applySeparableBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.round(radius)
  if (r <= 0) return src
  const temp = new Float32Array(src.length)
  const result = new Float32Array(src.length)
  const kernelSize = 2 * r + 1

  // Orizontal
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w
    let sum = 0
    // Init sum
    for (let k = -r; k <= r; k++) {
      const px = Math.min(Math.max(k, 0), w - 1)
      sum += src[rowOffset + px]
    }
    temp[rowOffset] = sum / kernelSize

    for (let x = 1; x < w; x++) {
      const outX = Math.min(x + r, w - 1)
      const inX = Math.max(x - r - 1, 0)
      sum += src[rowOffset + outX] - src[rowOffset + inX]
      temp[rowOffset + x] = sum / kernelSize
    }
  }

  // Vertical
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let k = -r; k <= r; k++) {
      const py = Math.min(Math.max(k, 0), h - 1)
      sum += temp[py * w + x]
    }
    result[x] = sum / kernelSize

    for (let y = 1; y < h; y++) {
      const outY = Math.min(y + r, h - 1)
      const inY = Math.max(y - r - 1, 0)
      sum += temp[outY * w + x] - temp[inY * w + x]
      result[y * w + x] = sum / kernelSize
    }
  }

  return result
}

/**
 * Unsharp mask pentru evidențiere detalii
 */
function applySharpen(smoothed: Float32Array, original: Float32Array, _w: number, _h: number, amount: number): Float32Array {
  const out = new Float32Array(smoothed.length)
  for (let i = 0; i < smoothed.length; i++) {
    const diff = original[i] - smoothed[i]
    out[i] = Math.max(0, Math.min(255, smoothed[i] + diff * amount))
  }
  return out
}

/**
 * Dithering Floyd-Steinberg pentru gravură foto laser/mecanică
 */
export function floydSteinbergDither(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width
  const h = canvas.height
  const output = document.createElement('canvas')
  output.width = w
  output.height = h
  const ctx = output.getContext('2d')!
  ctx.drawImage(canvas, 0, 0)
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data

  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4
    gray[i] = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const oldPixel = gray[i]
      const newPixel = oldPixel < 128 ? 0 : 255
      gray[i] = newPixel
      const err = oldPixel - newPixel

      if (x + 1 < w) gray[i + 1] += (err * 7) / 16
      if (x - 1 >= 0 && y + 1 < h) gray[i + w - 1] += (err * 3) / 16
      if (y + 1 < h) gray[i + w] += (err * 5) / 16
      if (x + 1 < w && y + 1 < h) gray[i + w + 1] += (err * 1) / 16
    }
  }

  for (let i = 0; i < w * h; i++) {
    const val = Math.max(0, Math.min(255, gray[i]))
    const idx = i * 4
    d[idx] = val
    d[idx + 1] = val
    d[idx + 2] = val
    d[idx + 3] = 255
  }

  ctx.putImageData(imgData, 0, 0)
  return output
}
