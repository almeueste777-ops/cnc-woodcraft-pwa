// Hărți de adâncime PNG 16 biți: scriere → citire fără pierdere; citirea unui PNG făcut de alt program
// (cu filtre PNG) dacă e dat ca argument: npx tsx tests/depth-check.ts [fisier16.png valoriReferinta.json]
import { readFileSync } from 'node:fs'
import { encodeDepthPng16, decodeDepthPng16 } from '../src/utils/depthMapIO'

let failed = 0
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'OK  ' : 'PICĂ'} ${msg}`); if (!ok) failed++ }

const w = 317, h = 211
const hm = new Float32Array(w * h)
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hm[y * w + x] = 0.5 + 0.5 * Math.sin(x / 13) * Math.cos(y / 7)
const blob = await encodeDepthPng16(hm, w, h)
const back = await decodeDepthPng16(await blob.arrayBuffer())
let worst = 0
if (back) for (let i = 0; i < hm.length; i++) worst = Math.max(worst, Math.abs(back.data[i] - hm[i]))
check(!!back && back.width === w && back.height === h && worst <= 0.5 / 65535 + 1e-7,
  `scriere/citire ${w}×${h}: abatere ${(worst * 65535).toFixed(2)} niveluri din 65535, ${(blob.size / 1024).toFixed(0)} KB`)

const [ext, ref] = process.argv.slice(2)
if (ext && ref) {
  const r = JSON.parse(readFileSync(ref, 'utf8')) as { width: number; height: number; values: number[] }
  const d = await decodeDepthPng16(readFileSync(ext).buffer as ArrayBuffer)
  let e = 0
  if (d) for (let i = 0; i < r.values.length; i++) e = Math.max(e, Math.abs(Math.round(d.data[i] * 65535) - r.values[i]))
  check(!!d && d.width === r.width && e === 0, `PNG 16 biți din alt program (${ext.split(/[\\/]/).pop()}): abatere ${e} niveluri`)
}
if (failed) process.exit(1)
console.log('Toate verificările au trecut')
