/**
 * Detaliile din poză peste harta AI (src/utils/aiDetail.ts).
 * npx tsx tests/aidetail-check.ts
 */
import { addPhotoDetail, blurGrey } from '../src/utils/aiDetail'

let fails = 0
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) fails++ }

const W = 400, H = 600, N = W * H
// volum: o „figură” ridicată în mijloc (0.8), fundal jos (0.2)
const depth = new Float32Array(N)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) depth[y * W + x] = (x > 120 && x < 280 && y > 100 && y < 500) ? 0.8 : 0.2

{
  const flat = new Float32Array(N).fill(0.37)
  const b = blurGrey(flat, W, H, 10)
  ok(b.every(v => Math.abs(v - 0.37) < 1e-5), 'estomparea unei zone uniforme nu schimbă nimic (și la margini)')
  const dot = new Float32Array(N); dot[300 * W + 200] = 1
  const bd = blurGrey(dot, W, H, 4)
  let s = 0; for (const v of bd) s += v
  ok(Math.abs(s - 1) < 1e-3 && bd[300 * W + 200] < 0.05 && bd[300 * W + 200] > bd[300 * W + 210], `estomparea păstrează cantitatea și scade din centru spre afară (sumă ${s.toFixed(4)})`)
}
{
  const grey = new Float32Array(N).fill(0.5)
  const out = addPhotoDetail(depth, grey, W, H, 0)
  ok(out.every((v, i) => v === depth[i]), 'tăria 0 = harta AI neschimbată')
}
{
  // pată mare închisă la culoare pe jumătatea de sus: nu trebuie să coboare volumul în interiorul ei
  const grey = new Float32Array(N)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grey[y * W + x] = y < 300 ? 0.1 : 0.9
  const out = addPhotoDetail(depth, grey, W, H, 1)
  const inDark = out[150 * W + 200], inLight = out[450 * W + 200]
  ok(Math.abs(inDark - inLight) < 0.02, `o pată mare închisă nu sapă figura (sus ${inDark.toFixed(3)}, jos ${inLight.toFixed(3)})`)
  ok(out[300 * W + 200] > out[300 * W + 20], 'figura rămâne mai sus decât fundalul')
}
{
  // linii subțiri închise (ca ochii, părul) pe figură: apar ca șanțuri, figura rămâne sus
  const grey = new Float32Array(N).fill(0.7)
  for (let y = 200; y < 400; y += 12) for (let x = 140; x < 260; x++) { grey[y * W + x] = 0.1; grey[(y + 1) * W + x] = 0.1 }
  const out = addPhotoDetail(depth, grey, W, H, 1)
  const line = out[200 * W + 200], between = out[206 * W + 200]
  ok(between - line > 0.03, `liniile închise devin șanțuri (linie ${line.toFixed(3)}, între ${between.toFixed(3)})`)
  ok(out[300 * W + 200] > 0.5 && out[300 * W + 20] < 0.3, 'volumul AI se păstrează: figura sus, fundalul jos')
  ok(out.every(v => v >= 0 && v <= 1 && Number.isFinite(v)), 'rezultatul e în 0..1, fără NaN')
  const strong = addPhotoDetail(depth, grey, W, H, 2)
  ok(strong[206 * W + 200] - strong[200 * W + 200] > between - line, 'tăria 2 adâncește șanțurile mai mult decât tăria 1')
}
{
  const bad = addPhotoDetail(depth, new Float32Array(10), W, H, 1)
  ok(bad.length === N && bad.every((v, i) => v === depth[i]), 'poză de altă mărime: harta AI rămâne neschimbată, fără prăbușire')
  const nanDepth = Float32Array.from(depth); nanDepth[5] = NaN
  const r = addPhotoDetail(nanDepth, new Float32Array(N).fill(0.5), W, H, 1)
  ok(r.every(v => Number.isFinite(v)), 'un pixel NaN în hartă nu strică rezultatul')
}

{
  // hartă AI aproape plată + câteva reflexii albe: harta NU se întinde pe toată adâncimea, fără vârfuri
  const flatD = new Float32Array(N).fill(0.5)
  const grey = new Float32Array(N).fill(0.4)
  for (let k = 0; k < 30; k++) grey[(100 + k * 15) * W + 200] = 1
  const out = addPhotoDetail(flatD, grey, W, H, 1)
  let mn = 1, mx = 0; for (const v of out) { mn = Math.min(mn, v); mx = Math.max(mx, v) }
  ok(Math.abs(out[50 * W + 50] - 0.5) < 0.01, `zona plată rămâne la 0.5 (${out[50 * W + 50].toFixed(3)})`)
  ok(mx - 0.5 < 0.11 && 0.5 - mn < 0.11, `reflexiile albe nu fac vârfuri mari (între ${mn.toFixed(3)} și ${mx.toFixed(3)})`)
  const out2 = addPhotoDetail(flatD, grey, W, H, 2)
  let mx2 = 0; for (const v of out2) mx2 = Math.max(mx2, v)
  ok(mx2 - 0.5 < 0.21, `nici la tăria 2 (cel mult ${mx2.toFixed(3)})`)
}
{
  // poză mică (64×64): nu se prăbușește harta
  const w = 64, h = 64, d = new Float32Array(w * h), g = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) { d[i] = (i % w) / (w - 1); g[i] = (i >> 3) % 2 ? 0.2 : 0.8 }
  const out = addPhotoDetail(d, g, w, h, 1)
  let mn = 1, mx = 0; for (const v of out) { mn = Math.min(mn, v); mx = Math.max(mx, v) }
  ok(mx - mn > 0.8 && Math.abs(out[32 * w + 63] - out[32 * w]) > 0.8, `poza mică păstrează volumul (între ${mn.toFixed(2)} și ${mx.toFixed(2)})`)
}

console.log(fails ? `\n${fails} verificări au picat` : '\nToate verificările au trecut')
process.exit(fails ? 1 : 0)
