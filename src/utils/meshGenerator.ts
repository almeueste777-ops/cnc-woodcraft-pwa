import * as THREE from 'three'
import type { ImageProcessingOptions } from '../types/cnc'

export interface MeshResult {
  geometry: THREE.BufferGeometry
  stlBlob: Blob
  stlBinaryBuffer: ArrayBuffer
  triangleCount: number
  dimensions: { x: number; y: number; z: number }
}

/**
 * Generează geometria 3D solidă și fișierul STL binar
 * direct din matricea de adâncime (Heightmap).
 */
export function generateReliefMesh(
  heightmap: Float32Array,
  imgWidth: number,
  imgHeight: number,
  options: ImageProcessingOptions,
  resolutionCap = 250 // Rezoluție rețea puncte (echilibru optim între finețe și viteză)
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
  resX = Math.max(16, resX)
  resY = Math.max(16, resY)

  // Creăm matricea de puncte Z eșantionată
  const gridZ = new Float32Array(resX * resY)
  for (let gy = 0; gy < resY; gy++) {
    const srcY = Math.floor((gy / (resY - 1)) * (imgHeight - 1))
    for (let gx = 0; gx < resX; gx++) {
      const srcX = Math.floor((gx / (resX - 1)) * (imgWidth - 1))
      const norm = heightmap[srcY * imgWidth + srcX]
      // Z variază de la baseThicknessMm până la baseThicknessMm + maxDepthMm
      gridZ[gy * resX + gx] = baseThicknessMm + norm * maxDepthMm
    }
  }

  // Calculăm triunghiurile pentru:
  // 1. Suprafața de relief de sus (resX - 1) * (resY - 1) * 2 triunghiuri
  // 2. Pereții laterali (4 laturi * 2 triunghiuri pe segment)
  // 3. Baza plată de jos (resX - 1) * (resY - 1) * 2 triunghiuri
  const topQuads = (resX - 1) * (resY - 1)
  const bottomQuads = (resX - 1) * (resY - 1)
  const sideQuads = (resX - 1) * 2 + (resY - 1) * 2
  const totalTriangles = (topQuads + bottomQuads + sideQuads) * 2

  // Fiecare triunghi are 3 vârfuri, fiecare vârf are 3 coordonate (x, y, z)
  const positions = new Float32Array(totalTriangles * 9)
  let pIdx = 0

  const getCoord = (gx: number, gy: number): [number, number, number] => {
    const x = (gx / (resX - 1) - 0.5) * widthMm
    // Invert Y for 3D coordinates system (Y sus)
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

  // 1. Fața superioară (Top Relief)
  for (let gy = 0; gy < resY - 1; gy++) {
    for (let gx = 0; gx < resX - 1; gx++) {
      const pTL = getCoord(gx, gy)
      const pTR = getCoord(gx + 1, gy)
      const pBL = getCoord(gx, gy + 1)
      const pBR = getCoord(gx + 1, gy + 1)

      // Triunghi 1
      addTriangle(pTL, pBL, pTR)
      // Triunghi 2
      addTriangle(pTR, pBL, pBR)
    }
  }

  // 2. Baza inferioară plată (Bottom Z = 0)
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

      // Normala spre jos (inversăm ordinea vârfurilor)
      addTriangle(bTL, bTR, bBL)
      addTriangle(bTR, bBR, bBL)
    }
  }

  // 3. Pereții laterali
  // Latura de Sus (gy = 0)
  for (let gx = 0; gx < resX - 1; gx++) {
    const tL = getCoord(gx, 0)
    const tR = getCoord(gx + 1, 0)
    const bL: [number, number, number] = [tL[0], tL[1], 0]
    const bR: [number, number, number] = [tR[0], tR[1], 0]
    addTriangle(tL, tR, bL)
    addTriangle(tR, bR, bL)
  }

  // Latura de Jos (gy = resY - 1)
  for (let gx = 0; gx < resX - 1; gx++) {
    const tL = getCoord(gx, resY - 1)
    const tR = getCoord(gx + 1, resY - 1)
    const bL: [number, number, number] = [tL[0], tL[1], 0]
    const bR: [number, number, number] = [tR[0], tR[1], 0]
    addTriangle(tL, bL, tR)
    addTriangle(tR, bL, bR)
  }

  // Latura din Stânga (gx = 0)
  for (let gy = 0; gy < resY - 1; gy++) {
    const tT = getCoord(0, gy)
    const tB = getCoord(0, gy + 1)
    const bT: [number, number, number] = [tT[0], tT[1], 0]
    const bB: [number, number, number] = [tB[0], tB[1], 0]
    addTriangle(tT, bT, tB)
    addTriangle(tB, bT, bB)
  }

  // Latura din Dreapta (gx = resX - 1)
  for (let gy = 0; gy < resY - 1; gy++) {
    const tT = getCoord(resX - 1, gy)
    const tB = getCoord(resX - 1, gy + 1)
    const bT: [number, number, number] = [tT[0], tT[1], 0]
    const bB: [number, number, number] = [tB[0], tB[1], 0]
    addTriangle(tT, tB, bT)
    addTriangle(tB, bB, bT)
  }

  // Construim Three.js BufferGeometry
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()

  // Generăm fișierul STL Binar
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
 * Generează formatul STL binar standard industrial (84 bytes header + 50 bytes per triunghi)
 */
function exportBinarySTL(positions: Float32Array, triangleCount: number): ArrayBuffer {
  const headerSize = 80
  const countSize = 4
  const triangleSize = 50 // 12 bytes normal + 36 bytes (3 vertices * 3 floats * 4 bytes) + 2 bytes attribute
  const totalBytes = headerSize + countSize + triangleCount * triangleSize

  const buffer = new ArrayBuffer(totalBytes)
  const view = new DataView(buffer)

  // 1. Header (80 bytes)
  const headerString = 'CNC WoodCraft Studio PWA - Watertight Solid STL'
  for (let i = 0; i < headerSize; i++) {
    view.setUint8(i, i < headerString.length ? headerString.charCodeAt(i) : 0x20)
  }

  // 2. Număr de triunghiuri (Uint32, Little-endian)
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

    // Calculăm normala triunghiului prin produs vectorial
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

    // Normal vector
    view.setFloat32(byteOffset, nx, true)
    view.setFloat32(byteOffset + 4, ny, true)
    view.setFloat32(byteOffset + 8, nz, true)

    // Vertex 1
    view.setFloat32(byteOffset + 12, x1, true)
    view.setFloat32(byteOffset + 16, y1, true)
    view.setFloat32(byteOffset + 20, z1, true)

    // Vertex 2
    view.setFloat32(byteOffset + 24, x2, true)
    view.setFloat32(byteOffset + 28, y2, true)
    view.setFloat32(byteOffset + 32, z2, true)

    // Vertex 3
    view.setFloat32(byteOffset + 36, x3, true)
    view.setFloat32(byteOffset + 40, y3, true)
    view.setFloat32(byteOffset + 44, z3, true)

    // Attribute byte count (2 bytes uint16, 0)
    view.setUint16(byteOffset + 48, 0, true)

    byteOffset += 50
  }

  return buffer
}
