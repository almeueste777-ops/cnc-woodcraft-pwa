/**
 * Import model 3D STL (binar sau ASCII) -> hartă de adâncime de precizie (Float32).
 * Modelul e privit de sus (axa Z în sus, ca la orice relief/basorelief); fiecare
 * celulă păstrează cel mai înalt punct al triunghiurilor de deasupra ei.
 */

export interface DepthSource {
  data: Float32Array // 0..1, rândul 0 = sus
  width: number
  height: number
  // dimensiunile reale ale modelului (mm), ca sugestie pentru piesă
  sizeMm: { x: number; y: number; z: number }
  name: string
}

function parseStl(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer)
  if (buffer.byteLength >= 84) {
    const count = view.getUint32(80, true)
    // binar dacă numărul de triunghiuri se potrivește cu mărimea; unele programe adaugă
    // câțiva octeți la final. Antetul binar poate începe și el cu „solid”, deci nu ne bazăm pe el.
    const expected = 84 + count * 50
    if (count > 0 && expected <= buffer.byteLength && buffer.byteLength - expected < 50) {
      const tri = new Float32Array(count * 9)
      for (let t = 0; t < count; t++) {
        const base = 84 + t * 50 + 12
        for (let k = 0; k < 9; k++) tri[t * 9 + k] = view.getFloat32(base + k * 4, true)
      }
      return tri
    }
  }
  // ASCII
  const text = new TextDecoder().decode(buffer)
  const nums: number[] = []
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) nums.push(Number(m[1]), Number(m[2]), Number(m[3]))
  if (nums.length < 9) throw new Error('Fișierul STL nu conține triunghiuri valide.')
  return Float32Array.from(nums.slice(0, nums.length - (nums.length % 9)))
}

export function stlToDepth(buffer: ArrayBuffer, name: string, maxRes = 1400): DepthSource {
  const tri = parseStl(buffer)
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let k = 0; k < tri.length; k += 3) {
    const x = tri[k], y = tri[k + 1], z = tri[k + 2]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ
  if (!(sx > 0 && sy > 0 && sz > 0)) throw new Error('Model STL plat sau gol.')

  const scale = (maxRes - 1) / Math.max(sx, sy)
  const width = Math.max(2, Math.round(sx * scale) + 1)
  const height = Math.max(2, Math.round(sy * scale) + 1)
  // scară separată pe fiecare axă: primul și ultimul pixel cad exact pe marginile modelului
  const kx = (width - 1) / sx
  const ky = (height - 1) / sy
  const zbuf = new Float32Array(width * height).fill(-Infinity)

  // rasterizare cu coordonate baricentrice, păstrând Z maxim (vedere de sus)
  for (let t = 0; t < tri.length; t += 9) {
    const ax = (tri[t] - minX) * kx, ay = (maxY - tri[t + 1]) * ky, az = tri[t + 2]
    const bx = (tri[t + 3] - minX) * kx, by = (maxY - tri[t + 4]) * ky, bz = tri[t + 5]
    const cx = (tri[t + 6] - minX) * kx, cy = (maxY - tri[t + 7]) * ky, cz = tri[t + 8]
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if (Math.abs(den) < 1e-12) continue // triunghi vertical: nu se vede de sus
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)))
    const x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)))
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)))
    const y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)))
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den
        const w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den
        const w3 = 1 - w1 - w2
        if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue
        const z = w1 * az + w2 * bz + w3 * cz
        const idx = py * width + px
        if (z > zbuf[idx]) zbuf[idx] = z
      }
    }
  }

  const data = new Float32Array(width * height)
  for (let i = 0; i < data.length; i++) {
    data[i] = zbuf[i] === -Infinity ? 0 : (zbuf[i] - minZ) / sz
  }
  return { data, width, height, sizeMm: { x: sx, y: sy, z: sz }, name }
}

/** Imagine de previzualizare (tonuri de gri) pentru o hartă de adâncime */
export function depthToCanvas(src: DepthSource): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = src.width
  canvas.height = src.height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(src.width, src.height)
  for (let i = 0; i < src.data.length; i++) {
    const v = Math.round(src.data[i] * 255)
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** Citește orice imagine pe care browserul o poate decoda (JPG, PNG, WebP, BMP, GIF, AVIF, SVG) */
export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Formatul fișierului „${file.name}” nu poate fi citit. Folosiți JPG, PNG, WebP, BMP, SVG sau STL.`))
    }
    img.src = url
  })
}
