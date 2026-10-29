import type { ImageProcessingOptions } from '../types/cnc'
import type { DepthSource } from './modelImport'

/**
 * Motor profesional de procesare a imaginii pentru Basorelief & Icoane 3D
 * Transformă orice imagine într-o hartă de relief (Heightmap) fără deformări,
 * prevenind „gropile” din zonele întunecate (barbă, ochi, veșminte) și
 * creând un volum organic convex pe care se gravează detaliile fine.
 */
export function processImageHeightmap(
  sourceCanvas: HTMLCanvasElement,
  options: ImageProcessingOptions,
  depthSource: DepthSource | null = null
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
  const rawLuminance: any = new Float32Array(totalPixels)

  // 1. Extragere luminanță perceptuală (Rec. 709)
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4
    const r = pixels[idx]
    const g = pixels[idx + 1]
    const b = pixels[idx + 2]
    rawLuminance[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  let finalRelief: Float32Array

  if (options.reliefMode === 'depthmap') {
    // =========================================================================
    // HARTĂ DE ADÂNCIME DIRECTĂ (model STL, depth map, heightmap gata făcut)
    // Înălțimile se folosesc exact; netezirea opțională scoate treptele de 8 biți.
    // =========================================================================
    const useDepth = depthSource && depthSource.width === width && depthSource.height === height
    let base: Float32Array = useDepth ? depthSource!.data.slice() : rawLuminance.map((v: number) => v / 255)
    if (options.blurRadius > 0) base = applySeparableBlur(base, width, height, options.blurRadius)
    finalRelief = base
  } else if (options.reliefMode === 'smartIcon') {
    // =========================================================================
    // MODUL SMART ICON SCULPTOR (Algoritm Multi-Scară pentru Icoane)
    // =========================================================================

    // A. Extragere Volum Convex de Bază (Macro Dome Cushion - Frecvențe Joase)
    // Folosim o netezire largă pentru a crea „perna” organică a corpului și nimbului
    const wideRadius = Math.max(12, Math.round(width * 0.045))
    const macroDome = applySeparableBlur(rawLuminance, width, height, wideRadius)

    // B. Extragere Detalii Fine de Suprafață (Micro Detail - Frecvențe Înalte)
    // Netezire fină locală pentru a elimina doar zgomotul de senzor/jpeg
    const fineSmooth = applySeparableBlur(rawLuminance, width, height, Math.max(1, options.blurRadius))
    
    // Gradient Sobel pentru detecția liniilor sculptate (falduri veșminte, barbă, ochi)
    const edgeMag = computeSobelMagnitude(fineSmooth, width, height)

    // C. Protecție împotriva „gropilor” în trăsăturile negre (Anti-Hole Protection)
    // În icoane: barba, pletele, pupilele și veșmintele vișinii sunt negre/închise la culoare.
    // În loc să se scufunde într-o groapă, ridicăm nivelul de bază și adăugăm crestele firelor de păr.
    const antiHoleFactor = options.antiHoleProtection / 100 // 0 la 1
    const domeWeight = options.macroDomeVolume / 100       // Forța pernei de volum
    const detailWeight = (options.microDetailStrength / 100) * 1.6

    finalRelief = new Float32Array(totalPixels)

    // Centru estimat pentru nimb și chip (partea superioară centrală)
    const haloCx = width * 0.5
    const haloCy = height * 0.35
    const haloRadiusMax = Math.min(width, height) * 0.38

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const rawLum = fineSmooth[i] / 255.0
        const baseDomeNorm = macroDome[i] / 255.0
        const edge = edgeMag[i] / 255.0

        // 1. Calcul volum convex de bază:
        // Distanța față de centrul icoanei (crează o curbură eliptică frumoasă spre privitor)
        const dx = (x - haloCx) / (width * 0.5)
        const dy = (y - height * 0.5) / (height * 0.5)
        const distCenterSq = dx * dx + dy * dy
        const anatomicalCushion = Math.max(0, 1.0 - Math.min(1.0, distCenterSq * 0.6))

        // 2. Corecție zone întunecate: dacă lumina este mică, dar există contururi (barbă, veșmânt),
        // nu lăsăm adâncimea să cadă sub nivelul anatomic de bază!
        let correctedLuma = rawLum
        if (antiHoleFactor > 0) {
          const darkDeficit = Math.max(0, 0.55 - rawLum)
          // Înlocuim groapa cu relief pozitiv bazat pe volumul pernei și contururile muchiilor
          correctedLuma = rawLum + darkDeficit * antiHoleFactor * (0.7 + edge * 0.8)
        }

        // 3. Îmbinare multi-scară: Volum Macro + Detalii Gravate
        let heightVal =
          baseDomeNorm * 0.35 * domeWeight +
          anatomicalCushion * 0.35 * domeWeight +
          correctedLuma * 0.35 +
          edge * detailWeight * 0.35

        // 4. Boost Nimb / Aureolă Sfântă cu ramă circulară în trepte
        if (options.haloBoost > 0) {
          const hdx = x - haloCx
          const hdy = y - haloCy
          const hDist = Math.hypot(hdx, hdy)
          if (hDist < haloRadiusMax) {
            const haloNorm = 1.0 - (hDist / haloRadiusMax)
            // Platou nimb ridicat
            const haloLift = Math.pow(Math.max(0, haloNorm), 0.5) * (options.haloBoost / 140)
            // Ramă exterioară perlată a nimbului (muchie accentuată pe margine)
            const ringDist = Math.abs(hDist - haloRadiusMax * 0.9)
            const ringBead = ringDist < 6 ? (1.0 - ringDist / 6) * 0.15 : 0

            heightVal = Math.min(1.0, heightVal + haloLift + ringBead)
          }
        }

        // 5. Curățare și coborâre fundal (Separare Subiect - Fundal Lemn)
        if (options.bgSeparationLevel > 0) {
          const bgThreshold = 0.22 * (options.bgSeparationLevel / 100)
          if (baseDomeNorm < bgThreshold && distCenterSq > 0.6) {
            const drop = (bgThreshold - baseDomeNorm) / bgThreshold
            heightVal *= Math.max(0, 1.0 - drop * 0.9)
          }
        }

        finalRelief[i] = Math.max(0, Math.min(1.0, heightVal))
      }
    }

    // Netezire fină anti-zgârieturi (elimină vârfurile de pixel izolate)
    finalRelief = applyLaplacianAntiSpike(finalRelief, width, height)

  } else {
    // =========================================================================
    // MODUL STANDARD / FOTO
    // =========================================================================
    let smoothed = rawLuminance
    if (options.blurRadius > 0) {
      smoothed = applySeparableBlur(rawLuminance, width, height, options.blurRadius)
    }
    if (options.edgeSharpen > 0) {
      smoothed = applySharpen(smoothed, rawLuminance, width, height, options.edgeSharpen / 50)
    }

    finalRelief = new Float32Array(totalPixels)
    for (let i = 0; i < totalPixels; i++) {
      finalRelief[i] = Math.max(0, Math.min(1.0, smoothed[i] / 255.0))
    }
  }

  // 4. Aplicare Contrast, Luminozitate și Gamma pe tot modelul
  const contrastFactor = options.contrast / 100
  const brightnessOffset = options.brightness / 255
  const gamma = Math.max(0.1, options.gamma)

  const frameBorderX = (options.frameWidthMm / Math.max(1, options.widthMm)) * width
  const frameBorderY = (options.frameWidthMm / Math.max(1, options.heightMm)) * height

  if (options.mirrorX) {
    for (let y = 0; y < height; y++) finalRelief.subarray(y * width, (y + 1) * width).reverse()
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      let val = finalRelief[i]

      // Contrast și Luminozitate
      val = (val - 0.5) * contrastFactor + 0.5 + brightnessOffset
      val = Math.max(0, Math.min(1.0, val))

      // Curbă Gamma
      val = Math.pow(val, 1 / gamma)

      // Inversare dacă albul este adâncit
      if (options.invert) {
        val = 1.0 - val
      }

      // Ramă sau Arcadă Bizantină (Boltă de Icoană)
      if (options.frameStyle !== 'none' && options.frameWidthMm > 0) {
        val = applyFrameProfile(val, x, y, width, height, frameBorderX, frameBorderY, options.frameStyle)
      }

      finalRelief[i] = Math.max(0, Math.min(1.0, val))

      // Actualizare pixeli pe canvas pentru vizualizare 2D
      const displayVal = Math.round(finalRelief[i] * 255)
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
    heightmapData: finalRelief,
    width,
    height
  }
}

/**
 * Filtru Sobel pentru calculul magnitudinii muchiilor (contururi falduri și trăsături)
 */
function computeSobelMagnitude(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    const rowPrev = (y - 1) * w
    const rowCur = y * w
    const rowNext = (y + 1) * w
    for (let x = 1; x < w - 1; x++) {
      const p00 = src[rowPrev + x - 1]
      const p01 = src[rowPrev + x]
      const p02 = src[rowPrev + x + 1]
      const p10 = src[rowCur + x - 1]
      const p12 = src[rowCur + x + 1]
      const p20 = src[rowNext + x - 1]
      const p21 = src[rowNext + x]
      const p22 = src[rowNext + x + 1]

      const gx = -p00 + p02 - 2 * p10 + 2 * p12 - p20 + p22
      const gy = -p00 - 2 * p01 - p02 + p20 + 2 * p21 + p22
      out[rowCur + x] = Math.min(255, Math.hypot(gx, gy) * 0.7)
    }
  }
  return out
}

/**
 * Elimină vârfurile de ac (Needle Spikes) cauzate de compresia JPEG pentru o frezare lină
 */
function applyLaplacianAntiSpike(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(src.length)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const center = src[i]
      const avgNeighbors = (src[i - 1] + src[i + 1] + src[i - w] + src[i + w]) * 0.25
      // Dacă pixelul este un spike izolat exagerat, îl limităm
      if (center - avgNeighbors > 0.08) {
        out[i] = avgNeighbors + 0.04
      } else {
        out[i] = center
      }
    }
  }
  return out
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
 * Profil ramă sau arcadă bizantină
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

  if (style === 'arch') {
    const cx = w / 2
    // bolta ocupă toată lățimea: se potrivește cu decuparea „arcadă” (src/cam/cutout.ts)
    const archRadius = w * 0.5
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
    const t = Math.max(0, minBorderDist)
    let frameElevation = 0
    if (style === 'ornate') {
      frameElevation = 0.5 + 0.5 * Math.sin(t * Math.PI * 2.5) * Math.sin(t * Math.PI * 0.5)
    } else {
      frameElevation = Math.sin(t * Math.PI * 0.5)
    }
    return Math.max(originalNorm * t, frameElevation * 0.85 + 0.15 * originalNorm)
  }

  return originalNorm
}
