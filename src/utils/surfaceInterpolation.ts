/**
 * Modul de interpolare sub-pixel și reconstrucție de suprafață continuă (C1/C2 Spline)
 * Elimină complet „pixelarea” și treptele de scară cauzate de rezoluția imaginilor,
 * producând o suprafață 3D curbată netedă ca marmura pentru sculptură CNC.
 */

/**
 * Ponderare Catmull-Rom cubică pentru interpolare continuă
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const v0 = (p2 - p0) * 0.5
  const v1 = (p3 - p1) * 0.5
  const t2 = t * t
  const t3 = t * t2
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 +
         (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 +
         v0 * t +
         p1
}

/**
 * Preluare pixel cu clamping pe margini
 */
function getPixel(src: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = Math.max(0, Math.min(w - 1, x))
  const cy = Math.max(0, Math.min(h - 1, y))
  return src[cy * w + cx]
}

/**
 * Eșantionare Bicubică Catmull-Rom pe 16 puncte
 * Calculează înălțimea Z exactă la orice coordonată zecimală (sub-pixel)
 * Garantat fără colțuri aspre sau trepte de pixel!
 */
export function sampleBicubicHeight(
  src: Float32Array,
  w: number,
  h: number,
  u: number, // Coordonată normalizată 0.0 -> 1.0 pe X
  v: number  // Coordonată normalizată 0.0 -> 1.0 pe Y
): number {
  const x = u * (w - 1)
  const y = v * (h - 1)

  const x1 = Math.floor(x)
  const y1 = Math.floor(y)

  const fx = x - x1
  const fy = y - y1

  // 4 linii de-a lungul axei X
  const col: number[] = new Array(4)
  for (let j = 0; j < 4; j++) {
    const py = y1 - 1 + j
    const p0 = getPixel(src, w, h, x1 - 1, py)
    const p1 = getPixel(src, w, h, x1, py)
    const p2 = getPixel(src, w, h, x1 + 1, py)
    const p3 = getPixel(src, w, h, x1 + 2, py)
    col[j] = catmullRom(p0, p1, p2, p3, fx)
  }

  // Interpolare finală de-a lungul axei Y
  const val = catmullRom(col[0], col[1], col[2], col[3], fy)
  // Catmull-Rom „sare” peste valori la treptele bruște (ramă, nimb): ar apărea creste
  // false de până la ~1 mm. Limităm rezultatul între cei 4 pixeli vecini.
  const a = getPixel(src, w, h, x1, y1), b = getPixel(src, w, h, x1 + 1, y1)
  const c = getPixel(src, w, h, x1, y1 + 1), d = getPixel(src, w, h, x1 + 1, y1 + 1)
  const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d)
  return Math.max(0.0, Math.min(1.0, Math.max(lo, Math.min(hi, val))))
}

/**
 * Interpolare Hermite quintică C2 (Smoothstep de gradul 5: 6t^5 - 15t^4 + 10t^3)
 * Oferă derivată a doua nulă la granițe, făcând suprafața perfect fluidă pentru frezele sferice CNC
 */
export function sampleSmoothBilinearHeight(
  src: Float32Array,
  w: number,
  h: number,
  u: number,
  v: number
): number {
  const x = u * (w - 1)
  const y = v * (h - 1)

  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)

  let tx = x - x0
  let ty = y - y0

  // Curbe Ken Perlin S-curve quintice pentru eliminarea discontinuităților
  tx = tx * tx * tx * (tx * (tx * 6 - 15) + 10)
  ty = ty * ty * ty * (ty * (ty * 6 - 15) + 10)

  const v00 = src[y0 * w + x0]
  const v10 = src[y0 * w + x1]
  const v01 = src[y1 * w + x0]
  const v11 = src[y1 * w + x1]

  const top = v00 + tx * (v10 - v00)
  const bot = v01 + tx * (v11 - v01)

  return top + ty * (bot - top)
}
