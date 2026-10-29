import * as THREE from 'three'
import type { ImageProcessingOptions } from '../types/cnc'
import { sampleBicubicHeight } from './surfaceInterpolation'

export interface MeshResult {
  geometry: THREE.BufferGeometry
  /** STL-ul binar se construiește doar la descărcare (la rezoluție mare ar ocupa zeci de MB în memorie) */
  getStlBlob: () => Blob
  triangleCount: number
  dimensions: { x: number; y: number; z: number }
  /** grosimea plăcii de bază: relieful se întinde de la baseMm la dimensions.z */
  baseMm: number
  /** înălțimea feței de sus în coordonatele plasei (centrul piesei = 0,0), -Infinity în afara ei */
  surfaceZAt: (x: number, y: number) => number
}

/**
 * Generează corpul 3D solid (relief + pereți + bază) din harta de adâncime.
 *
 * Fața de sus e o plasă INDEXATĂ: fiecare vârf e comun celor 6 triunghiuri din jur, deci
 * normalele se mediază și lumina curge neted. (O plasă cu triunghiuri separate primește câte
 * o normală pe triunghi și, la mărire, arată ca niște „pixeli” fațetați.)
 * Pereții și baza au vârfuri proprii, ca muchiile să rămână drepte. Corpul e închis
 * (fără găuri), deci STL-ul merge direct în Aspire, ArtCAM, Fusion sau la imprimare 3D.
 *
 * @param resolutionCap numărul maxim de puncte pe latura lungă. Nu se depășește rezoluția
 *   imaginii: mai multe puncte decât pixeli doar ar interpola, fără detaliu nou.
 */
export function generateReliefMesh(
  heightmap: Float32Array,
  imgWidth: number,
  imgHeight: number,
  options: ImageProcessingOptions,
  resolutionCap = 800
): MeshResult {
  const { widthMm, heightMm, maxDepthMm, baseThicknessMm } = options

  const aspect = imgWidth / imgHeight
  // imaginile mici se netezesc bicubic până la 360 de puncte, ca înainte
  const longSide = Math.min(resolutionCap, Math.max(imgWidth, imgHeight, 360))
  let resX = longSide
  let resY = Math.round(longSide / aspect)
  if (aspect < 1.0) {
    resY = longSide
    resX = Math.round(longSide * aspect)
  }
  resX = Math.max(20, resX)
  resY = Math.max(20, resY)
  // pe grila exactă a imaginii nu e nevoie de interpolare (iese pixelul însuși)
  const native = resX === imgWidth && resY === imgHeight

  const topCount = resX * resY
  const wallCount = 2 * (2 * resX + 2 * resY)
  const bottomCount = 2 * resX + 2 * resY - 4 + 1 // perimetrul + centrul
  const positions = new Float32Array((topCount + wallCount + bottomCount) * 3)
  const uvs = new Float32Array((topCount + wallCount + bottomCount) * 2)

  const xAt = (gx: number) => (gx / (resX - 1) - 0.5) * widthMm
  const yAt = (gy: number) => ((resY - 1 - gy) / (resY - 1) - 0.5) * heightMm

  let v = 0
  const addVertex = (x: number, y: number, z: number) => {
    positions[v * 3] = x
    positions[v * 3 + 1] = y
    positions[v * 3 + 2] = z
    uvs[v * 2] = x / widthMm + 0.5
    uvs[v * 2 + 1] = y / heightMm + 0.5
    return v++
  }

  // 1. Fața de sus: vârfurile grilei (rândul 0 = marginea de sus a imaginii)
  for (let gy = 0; gy < resY; gy++) {
    const vv = gy / (resY - 1)
    for (let gx = 0; gx < resX; gx++) {
      const norm = native
        ? heightmap[gy * imgWidth + gx]
        : sampleBicubicHeight(heightmap, imgWidth, imgHeight, gx / (resX - 1), vv)
      addVertex(xAt(gx), yAt(gy), baseThicknessMm + norm * maxDepthMm)
    }
  }
  const top = (gx: number, gy: number) => gy * resX + gx

  const topTris = (resX - 1) * (resY - 1) * 2
  const perimeter = 2 * (resX - 1) + 2 * (resY - 1)
  const triangleCount = topTris + perimeter * 2 + perimeter
  const IndexArray = positions.length / 3 > 65535 ? Uint32Array : Uint16Array
  const index = new IndexArray(triangleCount * 3)
  let t = 0
  const tri = (a: number, b: number, c: number) => {
    index[t++] = a
    index[t++] = b
    index[t++] = c
  }

  for (let gy = 0; gy < resY - 1; gy++) {
    for (let gx = 0; gx < resX - 1; gx++) {
      const tl = top(gx, gy), tr = top(gx + 1, gy), bl = top(gx, gy + 1), br = top(gx + 1, gy + 1)
      tri(tl, bl, tr)
      tri(tr, bl, br)
    }
  }

  // Conturul, în sens trigonometric privit de sus: jos (st→dr), dreapta (jos→sus), sus (dr→st), stânga (sus→jos)
  const ring: [number, number][] = []
  for (let gx = 0; gx < resX - 1; gx++) ring.push([gx, resY - 1])
  for (let gy = resY - 1; gy > 0; gy--) ring.push([resX - 1, gy])
  for (let gx = resX - 1; gx > 0; gx--) ring.push([gx, 0])
  for (let gy = 0; gy < resY - 1; gy++) ring.push([0, gy])

  // 2. Pereții: fiecare latură are vârfuri proprii (muchia rămâne dreaptă, nu rotunjită de normale
  //    mediate), în același sens ca inelul, cu ambele colțuri incluse
  const sides: [number, number][][] = [
    Array.from({ length: resX }, (_, k) => [k, resY - 1]),
    Array.from({ length: resY }, (_, k) => [resX - 1, resY - 1 - k]),
    Array.from({ length: resX }, (_, k) => [resX - 1 - k, 0]),
    Array.from({ length: resY }, (_, k) => [0, k]),
  ]
  for (const s of sides) {
    const upper: number[] = [], lower: number[] = []
    for (const [gx, gy] of s) {
      upper.push(addVertex(xAt(gx), yAt(gy), positions[top(gx, gy) * 3 + 2]))
      lower.push(addVertex(xAt(gx), yAt(gy), 0))
    }
    for (let k = 0; k < s.length - 1; k++) {
      // inelul merge în sens trigonometric privit de sus → normala iese în afară.
      // Unde relieful atinge Z = 0 pe margine, triunghiul ar fi turtit (muchii dublate în STL): se omite.
      if (positions[upper[k] * 3 + 2] > 1e-6) tri(upper[k], lower[k], lower[k + 1])
      if (positions[upper[k + 1] * 3 + 2] > 1e-6) tri(upper[k], lower[k + 1], upper[k + 1])
    }
  }

  // 3. Baza plată (Z = 0): evantai din centru spre aceleași puncte ale conturului (fără găuri în STL)
  const bottomStart = v
  for (const [gx, gy] of ring) addVertex(xAt(gx), yAt(gy), 0)
  const center = addVertex(0, 0, 0)
  for (let k = 0; k < ring.length; k++) tri(center, bottomStart + (k + 1) % ring.length, bottomStart + k)

  const used = v
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, used * 3), 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs.subarray(0, used * 2), 2))
  geometry.setIndex(new THREE.BufferAttribute(index.subarray(0, t), 1))
  geometry.computeVertexNormals()

  const finalPositions = positions.subarray(0, used * 3)
  const finalIndex = index.subarray(0, t)
  const surfaceZAt = (x: number, y: number) => {
    const fx = (x / widthMm + 0.5) * (resX - 1), fy = (0.5 - y / heightMm) * (resY - 1)
    if (fx < 0 || fy < 0 || fx > resX - 1 || fy > resY - 1) return -Infinity
    const gx = Math.min(resX - 2, Math.floor(fx)), gy = Math.min(resY - 2, Math.floor(fy))
    const tx = fx - gx, ty = fy - gy
    const z = (a: number, b: number) => positions[top(a, b) * 3 + 2]
    const z0 = z(gx, gy) + (z(gx + 1, gy) - z(gx, gy)) * tx
    const z1 = z(gx, gy + 1) + (z(gx + 1, gy + 1) - z(gx, gy + 1)) * tx
    return z0 + (z1 - z0) * ty
  }
  return {
    geometry,
    getStlBlob: () => new Blob([exportBinarySTL(finalPositions, finalIndex)], { type: 'application/octet-stream' }),
    triangleCount: t / 3,
    dimensions: {
      x: widthMm,
      y: heightMm,
      z: baseThicknessMm + maxDepthMm
    },
    baseMm: baseThicknessMm,
    surfaceZAt
  }
}

/**
 * Format STL binar industrial
 */
function exportBinarySTL(positions: ArrayLike<number>, index: ArrayLike<number>): ArrayBuffer {
  const headerSize = 80
  const countSize = 4
  const triangleSize = 50
  const triangleCount = index.length / 3
  const buffer = new ArrayBuffer(headerSize + countSize + triangleCount * triangleSize)
  const view = new DataView(buffer)

  const headerString = 'CNC WoodCraft Studio - Continuous Sub-pixel Surface STL'
  for (let i = 0; i < headerSize; i++) {
    view.setUint8(i, i < headerString.length ? headerString.charCodeAt(i) : 0x20)
  }
  view.setUint32(headerSize, triangleCount, true)

  let byteOffset = headerSize + countSize
  for (let k = 0; k < triangleCount; k++) {
    const a = index[k * 3] * 3, b = index[k * 3 + 1] * 3, c = index[k * 3 + 2] * 3
    const x1 = positions[a], y1 = positions[a + 1], z1 = positions[a + 2]
    const x2 = positions[b], y2 = positions[b + 1], z2 = positions[b + 2]
    const x3 = positions[c], y3 = positions[c + 1], z3 = positions[c + 2]

    const ax = x2 - x1, ay = y2 - y1, az = z2 - z1
    const bx = x3 - x1, by = y3 - y1, bz = z3 - z1
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
