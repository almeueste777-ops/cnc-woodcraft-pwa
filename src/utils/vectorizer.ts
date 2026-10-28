export interface Point {
  x: number
  y: number
}

export interface VectorContour {
  points: Point[]
  isClosed: boolean
}

/**
 * Trasează contururile dintr-un canvas procesat pe baza unui prag de contrast (Threshold)
 * folosind algoritmul Marching Squares și simplificare Ramer-Douglas-Peucker.
 */
export function traceImageToVectors(
  canvas: HTMLCanvasElement,
  threshold = 128,
  simplifyToleranceMm = 0.5,
  widthMm = 200,
  heightMm = 300
): {
  contours: VectorContour[]
  svgString: string
  dxfString: string
} {
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data

  // Matrice booleană: pixelul este peste sau sub threshold
  const binaryGrid = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4
    const gray = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]
    binaryGrid[i] = gray < threshold ? 1 : 0
  }

  // Segmentare Marching Squares
  interface Segment {
    p1: Point
    p2: Point
  }
  const segments: Segment[] = []

  const scaleX = widthMm / w
  const scaleY = heightMm / h

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const tl = binaryGrid[y * w + x]
      const tr = binaryGrid[y * w + (x + 1)]
      const br = binaryGrid[(y + 1) * w + (x + 1)]
      const bl = binaryGrid[(y + 1) * w + x]

      const cellType = (tl << 3) | (tr << 2) | (br << 1) | bl
      if (cellType === 0 || cellType === 15) continue

      // Puncte de mijloc pe laturile celulei (în milimetri)
      const topP: Point = { x: (x + 0.5) * scaleX, y: y * scaleY }
      const rightP: Point = { x: (x + 1) * scaleX, y: (y + 0.5) * scaleY }
      const bottomP: Point = { x: (x + 0.5) * scaleX, y: (y + 1) * scaleY }
      const leftP: Point = { x: x * scaleX, y: (y + 0.5) * scaleY }

      switch (cellType) {
        case 1: segments.push({ p1: leftP, p2: bottomP }); break
        case 2: segments.push({ p1: bottomP, p2: rightP }); break
        case 3: segments.push({ p1: leftP, p2: rightP }); break
        case 4: segments.push({ p1: topP, p2: rightP }); break
        case 5:
          segments.push({ p1: leftP, p2: topP })
          segments.push({ p1: bottomP, p2: rightP })
          break
        case 6: segments.push({ p1: topP, p2: bottomP }); break
        case 7: segments.push({ p1: leftP, p2: topP }); break
        case 8: segments.push({ p1: leftP, p2: topP }); break
        case 9: segments.push({ p1: topP, p2: bottomP }); break
        case 10:
          segments.push({ p1: topP, p2: rightP })
          segments.push({ p1: leftP, p2: bottomP })
          break
        case 11: segments.push({ p1: topP, p2: rightP }); break
        case 12: segments.push({ p1: leftP, p2: rightP }); break
        case 13: segments.push({ p1: bottomP, p2: rightP }); break
        case 14: segments.push({ p1: leftP, p2: bottomP }); break
      }
    }
  }

  // Înlănțuire segmente în polilinii continue
  const rawContours = chainSegments(segments)

  // Simplificare geometrie (Ramer-Douglas-Peucker) pentru viteză mare la CNC
  const contours: VectorContour[] = rawContours.map(c => ({
    points: simplifyPoints(c.points, simplifyToleranceMm),
    isClosed: c.isClosed
  })).filter(c => c.points.length >= 3)

  // Generare SVG
  const svgString = generateSVG(contours, widthMm, heightMm)

  // Generare DXF AutoCAD R12 (universal compatibil cu toate utilajele CNC)
  const dxfString = generateDXF(contours)

  return {
    contours,
    svgString,
    dxfString
  }
}

/**
 * Conectează segmente individuale în polilinii închise sau deschise
 */
function chainSegments(segments: { p1: Point; p2: Point }[]): VectorContour[] {
  const result: VectorContour[] = []
  const pool = [...segments]
  const epsilon = 0.05 // toleranță de conectare în mm

  const distSq = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

  while (pool.length > 0) {
    const first = pool.pop()!
    const poly: Point[] = [first.p1, first.p2]
    let changed = true

    while (changed) {
      changed = false
      const head = poly[0]
      const tail = poly[poly.length - 1]

      for (let i = pool.length - 1; i >= 0; i--) {
        const seg = pool[i]
        if (distSq(tail, seg.p1) < epsilon * epsilon) {
          poly.push(seg.p2)
          pool.splice(i, 1)
          changed = true
          break
        } else if (distSq(tail, seg.p2) < epsilon * epsilon) {
          poly.push(seg.p1)
          pool.splice(i, 1)
          changed = true
          break
        } else if (distSq(head, seg.p2) < epsilon * epsilon) {
          poly.unshift(seg.p1)
          pool.splice(i, 1)
          changed = true
          break
        } else if (distSq(head, seg.p1) < epsilon * epsilon) {
          poly.unshift(seg.p2)
          pool.splice(i, 1)
          changed = true
          break
        }
      }
    }

    const isClosed = distSq(poly[0], poly[poly.length - 1]) < epsilon * epsilon * 4
    result.push({ points: poly, isClosed })
  }

  return result
}

/**
 * Ramer-Douglas-Peucker algorithm
 */
function simplifyPoints(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points

  let maxDist = 0
  let index = 0
  const first = points[0]
  const last = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPoints(points.slice(0, index + 1), tolerance)
    const right = simplifyPoints(points.slice(index), tolerance)
    return left.slice(0, left.length - 1).concat(right)
  } else {
    return [first, last]
  }
}

function perpendicularDistance(p: Point, l1: Point, l2: Point): number {
  const dx = l2.x - l1.x
  const dy = l2.y - l1.y
  const lineLenSq = dx * dx + dy * dy
  if (lineLenSq === 0) return Math.hypot(p.x - l1.x, p.y - l1.y)
  const num = Math.abs(dy * p.x - dx * p.y + l2.x * l1.y - l2.y * l1.x)
  return num / Math.sqrt(lineLenSq)
}

function generateSVG(contours: VectorContour[], wMm: number, hMm: number): string {
  let pathData = ''
  for (const c of contours) {
    if (c.points.length === 0) continue
    const start = c.points[0]
    pathData += `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} `
    for (let i = 1; i < c.points.length; i++) {
      const p = c.points[i]
      pathData += `L ${p.x.toFixed(2)} ${p.y.toFixed(2)} `
    }
    if (c.isClosed) pathData += 'Z '
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}mm" height="${hMm}mm" viewBox="0 0 ${wMm} ${hMm}">
  <rect width="${wMm}" height="${hMm}" fill="none" stroke="#666" stroke-width="0.5" stroke-dasharray="2,2"/>
  <path d="${pathData}" fill="none" stroke="#d97706" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`
}

function generateDXF(contours: VectorContour[]): string {
  let dxf = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n`
  dxf += `0\nSECTION\n2\nENTITIES\n`

  for (const c of contours) {
    if (c.points.length < 2) continue
    dxf += `0\nPOLYLINE\n8\nCNC_ENGRAVING\n66\n1\n70\n${c.isClosed ? 1 : 0}\n`
    for (const p of c.points) {
      dxf += `0\nVERTEX\n8\nCNC_ENGRAVING\n10\n${p.x.toFixed(3)}\n20\n${(-p.y).toFixed(3)}\n30\n0.0\n`
    }
    dxf += `0\nSEQEND\n`
  }

  dxf += `0\nENDSEC\n0\nEOF\n`
  return dxf
}
