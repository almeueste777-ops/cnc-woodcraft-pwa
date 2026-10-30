/**
 * Detaliile fine din poză puse peste harta AI.
 * AI-ul dă volumul mare (figura iese, fundalul stă jos), dar pierde fața, faldurile, penele, literele.
 * Le luăm din luminozitatea pozei, doar pe bucăți mici (filtru „trece-sus”): o pată mare închisă
 * la culoare NU coboară relieful, doar marginile și liniile din interiorul ei se văd.
 * Rezultatul e adus iar la 0..1 (alb = sus), ca harta AI.
 */

/** cât din fiecare bandă de detaliu intră la tăria 1 („mediu”), probat pe icoane reale */
const K_FINE = 0.15 // linii subțiri: ochi, păr, pene (≈1–6 px la 1024)
const K_MID = 0.10 // forme mici: falduri, degete (≈6–24 px la 1024)

/** estompare aproape gaussiană: 3 treceri de medie pe fereastră, pe rânduri și pe coloane */
export function blurGrey(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0) return Float32Array.from(src)
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2))
  let a = Float32Array.from(src)
  let b = new Float32Array(a.length)
  const pass = (from: Float32Array, to: Float32Array, len: number, lines: number, step: number, lineStep: number) => {
    const inv = 1 / (2 * r + 1)
    for (let l = 0; l < lines; l++) {
      const o = l * lineStep
      let acc = 0
      for (let k = -r; k <= r; k++) acc += from[o + Math.min(len - 1, Math.max(0, k)) * step]
      for (let i = 0; i < len; i++) {
        to[o + i * step] = acc * inv
        acc += from[o + Math.min(len - 1, i + r + 1) * step] - from[o + Math.max(0, i - r) * step]
      }
    }
  }
  for (let t = 0; t < 3; t++) {
    pass(a, b, w, h, 1, w); [a, b] = [b, a]
    pass(a, b, h, w, w, 1); [a, b] = [b, a]
  }
  return a
}

/**
 * Înapoi în 0..1 FĂRĂ a întinde harta: dacă detaliile ies puțin peste 0 sau 1, se strânge tot;
 * dacă harta AI e aproape plată, rămâne plată (nu umflăm zgomotul pe toată adâncimea).
 */
function fitToRange(a: Float32Array, cut: number): Float32Array {
  const n = a.length
  const stride = Math.max(1, Math.floor(n / 200_000))
  const s: number[] = []
  for (let i = 0; i < n; i += stride) if (Number.isFinite(a[i])) s.push(a[i])
  s.sort((x, y) => x - y)
  const lo = Math.min(0, s[Math.floor(s.length * cut)] ?? 0)
  const hi = Math.max(1, s[Math.min(s.length - 1, Math.floor(s.length * (1 - cut)))] ?? 1)
  const span = hi - lo
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const v = (a[i] - lo) / span
    out[i] = Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0
  }
  return out
}

/**
 * depth: harta AI 0..1; grey: luminozitatea pozei 0..1, aceeași mărime (w×h);
 * strength: 0 = harta AI neschimbată, 1 = mediu (recomandat), 2 = tare.
 */
export function addPhotoDetail(depth: Float32Array, grey: Float32Array, w: number, h: number, strength: number): Float32Array {
  if (strength <= 0 || depth.length !== w * h || grey.length !== w * h) return Float32Array.from(depth)
  const sc = Math.max(w, h) / 1024 // filtrele sunt gândite la 1024 px pe latura mare
  const L1 = blurGrey(grey, w, h, 1.2 * sc)
  const L6 = blurGrey(grey, w, h, 6 * sc)
  const L24 = blurGrey(grey, w, h, 24 * sc)
  const kf = K_FINE * strength, km = K_MID * strength
  // limită moale: o reflexie albă, un scris alb pe negru sau zgomotul JPEG nu fac vârfuri;
  // fiecare bandă urcă/coboară cel mult 40% din tăria ei (la „mediu”: ±6% și ±4% din adâncime)
  const af = 0.4 * kf, am = 0.4 * km
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) {
    const d = Number.isFinite(depth[i]) ? depth[i] : 0
    out[i] = d + af * Math.tanh((kf * (L1[i] - L6[i])) / af) + am * Math.tanh((km * (L6[i] - L24[i])) / am)
  }
  return fitToRange(out, 0.003)
}

/** luminozitatea pozei (0..1) adusă la mărimea hărții; doar în browser */
export function canvasGrey(source: HTMLCanvasElement, w: number, h: number): Float32Array {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data
  const g = new Float32Array(w * h)
  // părțile transparente (PNG) se socotesc albe, ca hârtia: fără muchii false la marginea desenului
  for (let i = 0; i < g.length; i++) {
    const a = px[i * 4 + 3] / 255
    g[i] = a * (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255 + (1 - a)
  }
  return g
}
