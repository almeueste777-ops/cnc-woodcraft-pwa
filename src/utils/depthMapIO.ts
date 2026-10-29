/**
 * Hărți de adâncime ca fișiere: PNG gri pe 16 biți (65 536 de niveluri, nu 256 ca un JPG/PNG
 * obișnuit — fără trepte pe pantele line). Alb = sus (fața lemnului), negru = cel mai adânc.
 * Aspire, ArtCAM, Carveco și Photoshop le citesc direct.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function zlibCompress(data: Uint8Array): Promise<Uint8Array> {
  // „deflate” din CompressionStream produce exact formatul zlib cerut de PNG
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** heightmap: valori 0..1, rândul 0 = sus. Rezultat: PNG gri 16 biți. */
export async function encodeDepthPng16(heightmap: Float32Array, width: number, height: number): Promise<Blob> {
  const rowLen = 1 + width * 2
  const raw = new Uint8Array(rowLen * height)
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0 // fără filtru
    for (let x = 0; x < width; x++) {
      const v = Math.round(Math.max(0, Math.min(1, heightmap[y * width + x])) * 65535)
      raw[y * rowLen + 1 + x * 2] = v >> 8
      raw[y * rowLen + 2 + x * 2] = v & 0xff
    }
  }
  const ihdr = new Uint8Array(13)
  const iv = new DataView(ihdr.buffer)
  iv.setUint32(0, width)
  iv.setUint32(4, height)
  ihdr[8] = 16 // biți pe canal
  ihdr[9] = 0 // gri
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const parts = [signature, chunk('IHDR', ihdr), chunk('IDAT', await zlibCompress(raw)), chunk('IEND', new Uint8Array(0))]
  return new Blob(parts as BlobPart[], { type: 'image/png' })
}

/**
 * Citește un PNG gri pe 16 biți păstrând toată precizia (browserul l-ar reduce la 8 biți).
 * Întoarce null dacă fișierul nu e un PNG gri de 16 biți neîntrețesut — atunci se folosește
 * citirea obișnuită prin imagine.
 */
export async function decodeDepthPng16(buffer: ArrayBuffer): Promise<{ data: Float32Array; width: number; height: number } | null> {
  const bytes = new Uint8Array(buffer)
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 33 || sig.some((v, i) => bytes[i] !== v)) return null
  const view = new DataView(buffer)
  let pos = 8
  let width = 0, height = 0, depth = 0, color = 0, interlace = 0
  const idat: Uint8Array[] = []
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos)
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8))
    const data = bytes.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8); height = view.getUint32(pos + 12)
      depth = data[8]; color = data[9]; interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (depth !== 16 || color !== 0 || interlace !== 0 || !width || !height) return null
  const stream = new Blob(idat as BlobPart[]).stream().pipeThrough(new DecompressionStream('deflate'))
  const raw = new Uint8Array(await new Response(stream).arrayBuffer())
  const bpp = 2, rowLen = width * bpp
  const out = new Float32Array(width * height)
  let prev = new Uint8Array(rowLen)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (rowLen + 1)]
    const line = raw.slice(y * (rowLen + 1) + 1, (y + 1) * (rowLen + 1))
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0
      let add = 0
      if (filter === 1) add = a
      else if (filter === 2) add = b
      else if (filter === 3) add = (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      line[i] = (line[i] + add) & 0xff
    }
    for (let x = 0; x < width; x++) out[y * width + x] = ((line[x * 2] << 8) | line[x * 2 + 1]) / 65535
    prev = line
  }
  return { data: out, width, height }
}
