/**
 * Harta de icoană din 3 modele: calculele (fără modele), verificate exact.
 * npx tsx tests/iconrelief-check.ts
 */
import {
  composeIconRelief, prepareIconRelief, finishIconRelief, deepbumpTiles, frankotChellappa, padGrey, tileWeights, newNormalAcc, accumulateTile,
  normalsToGradients, DEEPBUMP_TILE, ICON_RELIEF_DEFAULTS
} from '../src/utils/iconRelief'

let fails = 0
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) fails++ }

// 1. Frankot–Chellappa reface o cupolă din pantele ei
{
  const w = 180, h = 140, z = new Float32Array(w * h), hx = new Float32Array(w * h), hy = new Float32Array(w * h)
  const g = (x: number, y: number) => 20 * Math.exp(-((x - 90) ** 2 + (y - 70) ** 2) / (2 * 25 ** 2))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    z[y * w + x] = g(x, y)
    hx[y * w + x] = (g(x + 0.5, y) - g(x - 0.5, y))
    hy[y * w + x] = (g(x, y + 0.5) - g(x, y - 0.5))
  }
  const r = frankotChellappa(hx, hy, w, h)
  let mz = 0, mr = 0
  for (let i = 0; i < w * h; i++) { mz += z[i]; mr += r[i] }
  mz /= w * h; mr /= w * h
  let err = 0
  for (let i = 0; i < w * h; i++) err = Math.max(err, Math.abs(r[i] - mr - (z[i] - mz)))
  ok(err < 0.4, `cupola de 20 refăcută din pante: abatere maximă ${err.toFixed(3)}`)
}
// 1b. mărimi nepătrate, departe de puteri ale lui 2 (ca pozele adevărate): fără strâmbături la margini
for (const [w, h] of [[350, 500], [512, 224], [301, 677]] as const) {
  const z = new Float32Array(w * h), hx = new Float32Array(w * h), hy = new Float32Array(w * h)
  const s = Math.min(w, h) / 5
  const g = (x: number, y: number) => 20 * Math.exp(-((x - w / 2) ** 2 + (y - h / 2) ** 2) / (2 * s * s))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    z[y * w + x] = g(x, y)
    hx[y * w + x] = g(x + 0.5, y) - g(x - 0.5, y)
    hy[y * w + x] = g(x, y + 0.5) - g(x, y - 0.5)
  }
  const r = frankotChellappa(hx, hy, w, h)
  let mz = 0, mr = 0
  for (let i = 0; i < w * h; i++) { mz += z[i]; mr += r[i] }
  mz /= w * h; mr /= w * h
  let err = 0
  for (let i = 0; i < w * h; i++) err = Math.max(err, Math.abs(r[i] - mr - (z[i] - mz)))
  ok(err < 0.6, `cupolă pe ${w}×${h}: abatere maximă ${err.toFixed(3)} din 20 (sub 3%)`)
}
// 1c. pregătirea + finisarea dau exact compunerea întreagă
{
  const w = 120, h = 90, n = w * h
  const d = Float32Array.from({ length: n }, (_, i) => (i % w) / w), mk = Float32Array.from({ length: n }, (_, i) => ((i % w) > 30 && (i % w) < 90 ? 1 : 0))
  const hh = Float32Array.from({ length: n }, (_, i) => Math.sin(i / 7))
  const opts = { detail: 1.3, background: 0.12, figureBase: 0.4 }
  const a = composeIconRelief(d, mk, hh, w, h, opts), b = finishIconRelief(prepareIconRelief(d, mk, hh, w, h), opts)
  ok(a.every((v, i) => v === b[i]), 'pregătire + finisare = compunerea întreagă (glisoarele nu refac calculele grele)')
}

// 2. pătratele DeepBump acoperă toată imaginea, și la imagini mici
{
  for (const [w, h] of [[732, 1024], [256, 256], [300, 257], [1024, 559]] as const) {
    const t = deepbumpTiles(w, h)
    const cover = new Uint8Array(w * h)
    for (const { ox, oy } of t) for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) cover[(oy + y) * w + ox + x] = 1
    ok(t.every(p => p.ox >= 0 && p.oy >= 0 && p.ox + 256 <= w && p.oy + 256 <= h) && cover.every(v => v === 1), `pătrate ${w}×${h}: ${t.length}, acoperă tot, nu ies afară`)
  }
  const small = padGrey(new Float32Array(100 * 50).fill(0.3), 100, 50)
  ok(small.w === 256 && small.h === 256 && small.data.every(v => Math.abs(v - 0.3) < 1e-6), 'imaginea mică e completată până la 256 cu marginile ei')
}

// 3. normale plate (0.5, 0.5, 1) → pante zero; înclinate spre dreapta → înălțimea urcă spre stânga
{
  const T = DEEPBUMP_TILE, wts = tileWeights(T)
  const acc = newNormalAcc(T, T)
  const out = new Float32Array(3 * T * T)
  for (let k = 0; k < T * T; k++) { out[k] = 0.5; out[T * T + k] = 0.5; out[2 * T * T + k] = 1 }
  accumulateTile(acc, out, 0, 0, wts)
  const { hx, hy } = normalsToGradients(acc, T, T)
  ok(hx.every(v => Math.abs(v) < 1e-6) && hy.every(v => Math.abs(v) < 1e-6), 'normale drepte în sus → nicio pantă')
  const acc2 = newNormalAcc(T, T)
  for (let k = 0; k < T * T; k++) out[k] = 0.8 // normala înclinată spre dreapta = suprafața coboară spre dreapta
  accumulateTile(acc2, out, 0, 0, wts)
  const g2 = normalsToGradients(acc2, T, T)
  ok(g2.hx[128 * T + 128] < 0, `normala spre dreapta → panta x negativă (${g2.hx[128 * T + 128].toFixed(3)})`)
}

// 4. compunerea
{
  const w = 200, h = 300, n = w * h
  const mask = new Float32Array(n), depth = new Float32Array(n), height = new Float32Array(n)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, inFig = (x - 100) ** 2 / 60 ** 2 + (y - 150) ** 2 / 110 ** 2 < 1
    mask[i] = inFig ? 1 : 0
    depth[i] = inFig ? 0.5 + 0.2 * Math.cos((y - 150) / 70) : 0.9 // fundalul (chenarul) „aproape” pentru AI: greșeala de la Ilie
    height[i] = 0.5
  }
  const out = composeIconRelief(depth, mask, height, w, h, ICON_RELIEF_DEFAULTS)
  ok(Math.abs(out[5 * w + 5] - 0.08) < 1e-6, `fundalul e plat la nivelul ales (${out[5 * w + 5].toFixed(3)}), chiar dacă AI-ul îl credea aproape`)
  ok(out[150 * w + 100] > out[5 * w + 5] + 0.3, `figura iese deasupra fundalului (${out[150 * w + 100].toFixed(3)})`)
  ok(out[150 * w + 100] > out[60 * w + 100], 'volumul AI rămâne în figură (mijlocul mai sus decât capătul)')
  ok(out.every(v => v >= 0 && v <= 1 && Number.isFinite(v)), 'rezultatul e în 0..1')
  const bg2 = composeIconRelief(depth, mask, height, w, h, { ...ICON_RELIEF_DEFAULTS, background: 0.25 })
  ok(Math.abs(bg2[5 * w + 5] - 0.25) < 1e-6, 'glisorul fundalului mută fundalul')

  // detalii: o creastă în harta DeepBump apare doar cu detail > 0
  const hgt = new Float32Array(n).fill(0.5)
  for (let y = 140; y < 160; y++) for (let x = 60; x < 140; x++) hgt[y * w + x] = 0.9
  const d0 = composeIconRelief(depth, mask, hgt, w, h, { ...ICON_RELIEF_DEFAULTS, detail: 0 })
  const d1 = composeIconRelief(depth, mask, hgt, w, h, ICON_RELIEF_DEFAULTS)
  ok(Math.abs(d0[150 * w + 100] - out[150 * w + 100]) < 1e-6, 'detaliu 0 = fără DeepBump')
  // chiar pe partea cea mai înaltă a figurii (unde volumul e deja 1) creasta trebuie să se vadă față de vecini
  const rise0 = d0[150 * w + 100] - d0[175 * w + 100], rise1 = d1[150 * w + 100] - d1[175 * w + 100]
  ok(rise1 > rise0 + 0.03, `creasta DeepBump se sculptează și pe vârful figurii (diferență față de vecin ${rise0.toFixed(3)} → ${rise1.toFixed(3)})`)
  ok(Math.abs(d1[5 * w + 5] - 0.08) < 1e-6, 'cu detalii, fundalul rămâne exact la nivelul ales')

  // mască goală (logo, peisaj): toată imaginea e figură, fără fund plat
  const empty = composeIconRelief(depth, new Float32Array(n), height, w, h, ICON_RELIEF_DEFAULTS)
  ok(empty[5 * w + 5] > 0.5, `mască goală → nu se aplatizează tot (${empty[5 * w + 5].toFixed(3)})`)

  // intrări stricate: NaN și mărimi greșite nu dau NaN
  const bad = Float32Array.from(depth); bad[10] = NaN
  const r = composeIconRelief(bad, mask, new Float32Array(5), w, h, ICON_RELIEF_DEFAULTS)
  ok(r.every(v => Number.isFinite(v)), 'NaN sau hartă de altă mărime: fără NaN în rezultat')
}

console.log(fails ? `\n${fails} verificări au picat` : '\nToate verificările au trecut')
process.exit(fails ? 1 : 0)
