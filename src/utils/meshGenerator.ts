import * as THREE from 'three'
import type { ImageProcessingOptions } from '../types/cnc'
import { sampleBicubicHeight } from './surfaceInterpolation'

export interface MeshResult {
  geometry: THREE.BufferGeometry
  stlBlob: Blob
  stlBinaryBuffer: ArrayBuffer
  triangleCount: number
  dimensions: { x: number; y: number; z: number }
}

/**
 * Generează geometria 3D solidă și fișierul STL binar
 * direct din matricea de adâncime (Heightmap) folosind interpolare sub-pixel Bicubică Catmull-Rom.
 * Garantează că nu există pixelare, trepte sau fațete poligonale aspre!
 */
export function generateReliefMesh(
  heightmap: Float32Array,
  imgWidth: number,
  imgHeight: number,
  options: ImageProcessingOptions,
  resolutionCap = 340 // Densitate crescută pentru detalii ultra-fine pe lemn
): MeshResult {
  const { widthMm, heightMm, maxDepthMm, baseThicknessMm } = options

  // Calculăm numărul de puncte pe X și Y păstrând raportul de aspect
  const aspect = imgWidth / imgHeight
  let resX = resolutionCap
  let resY = Math.round(resolutionCap / aspect)
  if (aspect < 1.0) {
    resY = resolutionCap
    resX = Math.round(resolutionCap * aspect)
  }
  resX = Math.max(20, resX)
  resY = Math.max(20, resY)

  // Creăm matricea de puncte Z eșantionată prin interpolare sub-pixel bicubică (fără trepte!)
  const gridZ = new Float32Array(resX * resY)
  for (let gy = 0; gy < resY; gy++) {
    const v = gy / (resY - 1)
    for (let gx = 0; gx < resX; gx++) {
      const u = gx / (resX - 1)
      // Eșantionare continuă Catmull-Rom
      const norm = sampleBicubicHeight(heightmap, imgWidth, imgHeight, u, v)
      gridZ[gy * resX + gx] = baseThicknessMm + norm * maxDepthMm
    }
  }

  // Calculăm triunghiurile pentru un corp 3D solid etanș (Watertight Manifold):
  // 1. Suprafața de relief de sus
  // 2. Pereții laterali verticali
  // 3. Baza inferioară plată (Z = 0)
  const topQuads = (resX - 1) * (resY - 1)
  const bottomQuads = (resX - 1) * (resY - 1)
  const sideQuads = (resX - 1) * 2 + (resY - 1) * 2
  const totalTriangles = (topQuads + bottomQuads + sideQuads) * 2

  const positions = new Float32Array(totalTriangles * 9)
  let pIdx = 0

  const getCoord = (gx: number, gy: number): [number, number, number] => {
    const x = (gx / (resX - 1) - 0.5) * widthMm
    const y = ((resY - 1 - gy) / (resY - 1) - 0.5) * heightMm
    const z = gridZ[gy * resX + gx]
    return [x, y, z]
  }

  const addTriangle = (
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ) => {
    positions[pIdx++] = p1[0]
    positions[pIdx++] = p1[1]
    positions[pIdx++] = p1[2]

    positions[pIdx++] = p2[0]
    positions[pIdx++] = p2[1]
    positions[pIdx++] = p2[2]

    positions[pIdx++] = p3[0]
    positions[pIdx++] = p3[1]
    positions[pIdx++] = p3[2]
  }

  // 1. Fața superioară (Top Relief curbat fin)
  for (let gy = 0; gy < resY - 1; gy++) {
    for (let gx = 0; gx < resX - 1; gx++) {
      const pTL = getCoord(gx, gy)
      const pTR = getCoord(gx + 1, gy)
      const pBL = getCoord(gx, gy + 1)
      const pBR = getCoord(gx + 1, gy + 1)

      addTriangle(pTL, pBL, pTR)
      addTriangle(pTR, pBL, pBR)
    }
  }

  // 2. Baza inferioară plată (Z = 0)
  for (let gy = 0; gy < resY - 1; gy++) {
    for (let gx = 0; gx < resX - 1; gx++) {
      const x0 = (gx / (resX - 1) - 0.5) * widthMm
      const x1 = ((gx + 1) / (resX - 1) - 0.5) * widthMm
      const y0 = ((resY - 1 - gy) / (resY - 1) - 0.5) * heightMm
      const y1 = ((resY - 1 - (gy + 1)) / (resY - 1) - 0.5) * heightMm

      const bTL: [number, number, number] = [x0, y0, 0]
      const bTR: [number, number, number] = [x1, y0, 0]
      const bBL: [number, number, number] = [x0, y1, 0]
      const bBR: [number, number, number] = [x1, y1, 0]

      addTriangle(bTL, bTR, bBL)
      addTriangle(bTR, bBR, bBL)
    }
  }

  // 3. Pereții laterali verticali
  // Sus
  for (let gx = 0; gx < resX - 1; gx++) {
    const tL = getCoord(gx, 0)
    const tR = getCoord(gx + 1, 0)
    const bL: [number, number, number] = [tL[0], tL[1], 0]
    const bR: [number, number, number] = [tR[0], tR[1], 0]
    addTriangle(tL, tR, bL)
    addTriangle(tR, bR, bL)
  }

  // Jos
  for (let gx = 0; gx < resX - 1; gx++) {
    const tL = getCoord(gx, resY - 1)
    const tR = getCoord(gx + 1, resY - 1)
    const bL: [number, number, number] = [tL[0], tL[1], 0]
    const bR: [number, number, number] = [tR[0], tR[1], 0]
    addTriangle(tL, bL, tR)
    addTriangle(tR, bL, bR)
  }

  // Stânga
  for (let gy = 0; gy < resY - 1; gy++) {
    const tT = getCoord(0, gy)
    const tB = getCoord(0, gy + 1)
    const bT: [number, number, number] = [tT[0], tT[1], 0]
    const bB: [number, number, number] = [tB[0], tB[1], 0]
    addTriangle(tT, bT, tB)
    addTriangle(tB, bT, bB)
  }

  // Dreapta
  for (let gy = 0; gy < resY - 1; gy++) {
    const tT = getCoord(resX - 1, gy)
    const tB = getCoord(resX - 1, gy + 1)
    const bT: [number, number, number] = [tT[0], tT[1], 0]
    const bB: [number, number, number] = [tB[0], tB[1], 0]
    addTriangle(tT, tB, bT)
    addTriangle(tB, bB, bT)
  }

  // Geometrie Three.js cu recalculare normale pentru reflexii catifelate
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()

  // Export fișier STL Binar
  const stlBuffer = exportBinarySTL(positions, totalTriangles)
  const stlBlob = new Blob([stlBuffer], { type: 'application/octet-stream' })

  return {
    geometry,
    stlBlob,
    stlBinaryBuffer: stlBuffer,
    triangleCount: totalTriangles,
    dimensions: {
      x: widthMm,
      y: heightMm,
      z: baseThicknessMm + maxDepthMm
    }
  }
}

/**
 * Format STL binar industrial
 */
function exportBinarySTL(positions: Float32Array, triangleCount: number): ArrayBuffer {
  const headerSize = 80
  const countSize = 4
  const triangleSize = 50
  const totalBytes = headerSize + countSize + triangleCount * triangleSize

  const buffer = new ArrayBuffer(totalBytes)
  const view = new DataView(buffer)

  const headerString = 'CNC WoodCraft Studio - Continuous Sub-pixel Surface STL'
  for (let i = 0; i < headerSize; i++) {
    view.setUint8(i, i < headerString.length ? headerString.charCodeAt(i) : 0x20)
  }

  view.setUint32(headerSize, triangleCount, true)

  let byteOffset = headerSize + countSize
  let posIdx = 0

  for (let t = 0; t < triangleCount; t++) {
    const x1 = positions[posIdx++]
    const y1 = positions[posIdx++]
    const z1 = positions[posIdx++]

    const x2 = positions[posIdx++]
    const y2 = positions[posIdx++]
    const z2 = positions[posIdx++]

    const x3 = positions[posIdx++]
    const y3 = positions[posIdx++]
    const z3 = positions[posIdx++]

    const ax = x2 - x1
    const ay = y2 - y1
    const az = z2 - z1

    const bx = x3 - x1
    const by = y3 - y1
    const bz = z3 - z1

    let nx = ay * bz - az * by
    let ny = az * bx - ax * bz
    let nz = ax * by - ay * bx
    const len = Math.hypot(nx, ny, nz)
    if (len > 0.000001) {
      nx /= len
      ny /= len
      nz /= len
    } else {
      nx = 0
      ny = 0
      nz = 1
    }

    view.setFloat32(byteOffset, nx, true)
    view.setFloat32(byteOffset + 4, ny, true)
    view.setFloat32(byteOffset + 8, nz, true)

    view.setFloat32(byteOffset + 12, x1, true)
    view.setFloat32(byteOffset + 16, y1, true)
    view.setFloat32(byteOffset + 20, z1, true)

    view.setFloat32(byteOffset + 24, x2, true)
    view.setFloat32(byteOffset + 28, y2, true)
    view.setFloat32(byteOffset + 32, z2, true)

    view.setFloat32(byteOffset + 36, x3, true)
    view.setFloat32(byteOffset + 40, y3, true)
    view.setFloat32(byteOffset + 44, z3, true)

    view.setUint16(byteOffset + 48, 0, true)

    byteOffset += 50
  }

  return buffer
}
