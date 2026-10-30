/**
 * Atelierul hărții: straturi (combinare) și pensulă (retuș), verificate exact.
 * npx tsx tests/depthedit-check.ts
 */
import { applyLayers, brushDab, composeDepth, layerRect, resizeDepth, type DepthLayer } from '../src/utils/depthEdit'
import { normalizeDepth } from '../src/utils/aiDepth'

let fails = 0
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); if (!cond) fails++ }
const near = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) <= eps

// bază 200×100 px pentru o piesă de 200×100 mm (1 mm/pixel), plată la 0.5
const W = 200, H = 100
const base = new Float32Array(W * H).fill(0.5)

// strat 20×20 plin cu 1, pus în centru, lat de 40 mm → acoperă 40×40 px în jurul (100, 50)
const square = (v: number): DepthLayer => ({
  id: 'a', name: 'pătrat', data: new Float32Array(400).fill(v), w: 20, h: 20,
  mode: 'add', strength: 0.2, offset: 0, cx: 0.5, cy: 0.5, widthFrac: 0.2, visible: true
})

{
  const L = square(1)
  const r = layerRect(L, W, H, 200, 100)
  ok(near(r.pw, 40) && near(r.ph, 40) && near(r.x0, 80) && near(r.y0, 30), `poziția stratului: ${JSON.stringify(r)}`)
  const out = applyLayers(base, W, H, [L], 200, 100)
  ok(near(out[50 * W + 100], 0.7) && near(out[50 * W + 10], 0.5), 'adună: 0.5 + 0.2 în interior, neschimbat în afară')
  ok(near(out[31 * W + 81], 0.7) && near(out[29 * W + 79], 0.5), 'marginea stratului cade unde trebuie (±1 px)')
  ok(base[50 * W + 100] === 0.5, 'baza nu e modificată')
  const sub = applyLayers(base, W, H, [{ ...L, mode: 'subtract' }], 200, 100)
  ok(near(sub[50 * W + 100], 0.3), 'scade: 0.5 − 0.2')
  const hi = applyLayers(base, W, H, [{ ...L, mode: 'max', strength: 0.3, offset: 0.1 }], 200, 100)
  ok(near(hi[50 * W + 100], 0.5), 'cel mai înalt: max(0.5, 0.1+0.3) = 0.5')
  const hi2 = applyLayers(base, W, H, [{ ...L, mode: 'max', strength: 0.3, offset: 0.4 }], 200, 100)
  ok(near(hi2[50 * W + 100], 0.7), 'cel mai înalt: max(0.5, 0.4+0.3) = 0.7')
  const lo = applyLayers(base, W, H, [{ ...L, mode: 'min', strength: 0.3, offset: 0 }], 200, 100)
  ok(near(lo[50 * W + 100], 0.3), 'cel mai jos: min(0.5, 0.3)')
  const rep = applyLayers(base, W, H, [{ ...L, mode: 'replace', strength: 0.1, offset: 0.05 }], 200, 100)
  ok(near(rep[50 * W + 100], 0.15) && near(rep[50 * W + 10], 0.5), 'înlocuiește doar sub strat')
  const hidden = applyLayers(base, W, H, [{ ...L, visible: false }], 200, 100)
  ok(hidden.every(v => v === 0.5), 'stratul ascuns nu schimbă nimic')
  // negrul stratului = gol: la „înlocuiește” nu face groapă
  const ring = square(1)
  for (let j = 5; j < 15; j++) for (let i = 5; i < 15; i++) ring.data[j * 20 + i] = 0
  const rep2 = applyLayers(base, W, H, [{ ...ring, mode: 'replace', strength: 0.9 }], 200, 100)
  ok(near(rep2[50 * W + 100], 0.5) && near(rep2[33 * W + 83], 0.9), 'negrul din strat rămâne transparent la înlocuire')
  // ordinea contează: întâi adună, apoi „cel mai jos” taie
  const two = applyLayers(base, W, H, [L, { ...L, id: 'b', mode: 'min', strength: 0.6 }], 200, 100)
  ok(near(two[50 * W + 100], 0.6), 'straturile se aplică în ordine (0.7 apoi min cu 0.6)')
  // proporția stratului: 40×20 px, lat 40 mm → înalt 20 mm
  const wide: DepthLayer = { ...L, data: new Float32Array(800).fill(1), w: 40, h: 20 }
  const rw = layerRect(wide, W, H, 200, 100)
  ok(near(rw.pw, 40) && near(rw.ph, 20), 'stratul își păstrează proporția')
}

{
  // compunere cu retuș, limitată la 0..1
  const r = new Float32Array(W * H)
  r[0] = 0.8; r[1] = -0.9
  const c = composeDepth(base, { data: r, w: W, h: H }, W, H)
  ok(c[0] === 1 && c[1] === 0 && c[2] === 0.5, 'retușul se adună și se limitează la 0..1')
  const c2 = composeDepth(base, { data: r, w: 10, h: 10 }, W, H)
  ok(c2[0] === 0.5, 'un retuș de altă mărime (altă imagine) e ignorat')
  // retuș cu w/h „potrivite” dar date de altă lungime (anulare după o imagine nouă): ignorat, fără NaN
  const c3 = composeDepth(base, { data: new Float32Array(50).fill(0.1), w: W, h: H }, W, H)
  ok(c3.every(v => v === 0.5), 'retuș cu date de altă lungime: ignorat, nicio valoare NaN')
}

{
  // pensula: ridică în centru, nimic în afara razei
  const under = base.slice(), ret = new Float32Array(W * H), comp = composeDepth(under, null, W, H)
  brushDab('raise', under, ret, comp, W, H, 100, 50, 10, 1, 0)
  ok(comp[50 * W + 100] > 0.5 && near(comp[50 * W + 100], 0.5 + 0.02, 0.002), `ridică: centru ${comp[50 * W + 100].toFixed(4)}`)
  ok(comp[50 * W + 111] === 0.5 && comp[39 * W + 100] === 0.5, 'în afara razei nu se schimbă nimic')
  ok(comp[50 * W + 105] > 0.5 && comp[50 * W + 105] < comp[50 * W + 100], 'margine moale: scade spre margine')
  for (let i = 0; i < 200; i++) brushDab('raise', under, ret, comp, W, H, 100, 50, 10, 1, 0)
  ok(comp[50 * W + 100] === 1 && near(ret[50 * W + 100], 0.5), 'ridicarea se oprește la fața lemnului (retușul nu crește la infinit)')
  brushDab('erase', under, ret, comp, W, H, 100, 50, 10, 1, 0)
  // centrul pixelului e la 0.0707 R de centrul pensulei → f = (1 − 0.005)² și rămâne (1 − f) din retușul de 0.5
  const f = (1 - 0.005) ** 2
  ok(near(comp[50 * W + 100], 0.5 + 0.5 * (1 - f), 1e-5), `ștergerea retușului readuce centrul la bază (${comp[50 * W + 100].toFixed(4)})`)

  // netezire: o treaptă se înmoaie, media zonei se păstrează aproximativ
  const step = new Float32Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) step[j * W + i] = i < 100 ? 0.2 : 0.8
  const r2 = new Float32Array(W * H), c2 = step.slice()
  const before = c2[50 * W + 99]
  for (let k = 0; k < 10; k++) brushDab('smooth', step, r2, c2, W, H, 100, 50, 12, 1, 0)
  ok(c2[50 * W + 99] > before + 0.1 && c2[50 * W + 100] < 0.7, `netezire: treapta 0.2|0.8 devine ${c2[50 * W + 99].toFixed(2)}|${c2[50 * W + 100].toFixed(2)}`)
  ok(c2[50 * W + 50] === step[50 * W + 50], 'netezirea nu atinge ce e departe')

  // nivelare: zona ajunge la înălțimea de start
  const r3 = new Float32Array(W * H), c3 = step.slice()
  for (let k = 0; k < 20; k++) brushDab('flatten', step, r3, c3, W, H, 100, 50, 8, 1, 0.5)
  ok(near(c3[50 * W + 100], 0.5, 0.01) && near(c3[50 * W + 99], 0.5, 0.01), `nivelare la 0.5: ${c3[50 * W + 99].toFixed(3)} / ${c3[50 * W + 100].toFixed(3)}`)
}

{
  // duritate: la 0.8 R pensula moale abia atinge, cea tare lucrează cu putere întreagă
  const u = base.slice()
  const rs = new Float32Array(W * H), cs = composeDepth(u, null, W, H)
  brushDab('raise', u, rs, cs, W, H, 100.5, 50.5, 10, 1, 0, { hardness: 0 })
  const rh = new Float32Array(W * H), ch = composeDepth(u, null, W, H)
  brushDab('raise', u, rh, ch, W, H, 100.5, 50.5, 10, 1, 0, { hardness: 1 })
  ok(near(ch[50 * W + 108], 0.52, 1e-6) && cs[50 * W + 108] < 0.505, `duritate: la 0.8 R tare ${ch[50 * W + 108].toFixed(4)}, moale ${cs[50 * W + 108].toFixed(4)}`)
  ok(ch[50 * W + 111] === 0.5, 'nici pensula tare nu iese din rază')

  // limite de înălțime
  const rl = new Float32Array(W * H), cl = composeDepth(u, null, W, H)
  for (let k = 0; k < 50; k++) brushDab('raise', u, rl, cl, W, H, 100, 50, 10, 1, 0, { maxLevel: 0.55 })
  let mx = 0; for (const v of cl) mx = Math.max(mx, v)
  ok(mx <= 0.55 + 1e-6 && near(cl[50 * W + 100], 0.55, 1e-6), `ridicarea se oprește la limita de sus (${mx.toFixed(4)})`)
  const high = new Float32Array(W * H).fill(0.8), rr = new Float32Array(W * H), cc = high.slice()
  brushDab('raise', high, rr, cc, W, H, 100, 50, 10, 1, 0, { maxLevel: 0.55 })
  ok(cc[50 * W + 100] === high[50 * W + 100], 'ce era deja peste limită nu e tăiat de pensulă')
  const rd = new Float32Array(W * H), cd = composeDepth(u, null, W, H)
  for (let k = 0; k < 50; k++) brushDab('lower', u, rd, cd, W, H, 100, 50, 10, 1, 0, { minLevel: 0.45 })
  let mn = 1; for (const v of cd) mn = Math.min(mn, v)
  ok(mn >= 0.45 - 1e-6 && near(cd[50 * W + 100], 0.45, 1e-6), `coborârea se oprește la limita de jos (${mn.toFixed(4)})`)
  ok(near(rd[50 * W + 100], -0.05, 1e-6), 'retușul ține pasul cu harta (valoare − bază)')

  // accentuare: treapta 0.2|0.8 devine mai abruptă
  const st2 = new Float32Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) st2[j * W + i] = i < 100 ? 0.2 : 0.8
  const ra = new Float32Array(W * H), ca = st2.slice()
  brushDab('sharpen', st2, ra, ca, W, H, 100, 50, 12, 1, 0)
  ok(ca[50 * W + 101] > 0.82 && ca[50 * W + 98] < 0.18, `accentuare: treapta 0.2|0.8 devine ${ca[50 * W + 98].toFixed(2)}|${ca[50 * W + 101].toFixed(2)}`)
  ok(ca[50 * W + 50] === st2[50 * W + 50] && ca[50 * W + 150] === st2[50 * W + 150], 'accentuarea nu atinge ce e departe sau plat')

  // pensula trasă peste marginea hărții: nicio eroare, nimic schimbat
  const ro = new Float32Array(W * H), co = st2.slice()
  let threw = false
  try {
    for (const t of ['smooth', 'sharpen', 'raise', 'flatten', 'erase'] as const) {
      for (const [x, y] of [[-50, 50], [W + 50, 50], [100, -40], [100, H + 40]]) brushDab(t, st2, ro, co, W, H, x, y, 3, 1, 0.5)
    }
  } catch { threw = true }
  ok(!threw && co.every((v, i) => v === st2[i]), 'pensula în afara hărții nu dă eroare și nu schimbă nimic')

  // straturi care urcă baza peste 1: o netezire pe zona plată nu lasă retuș ascuns
  const over = new Float32Array(W * H).fill(1.2), rov = new Float32Array(W * H), cov = composeDepth(over, null, W, H)
  brushDab('smooth', over, rov, cov, W, H, 100, 50, 10, 1, 0)
  ok(rov.every(v => v === 0), 'baza peste 1 (straturi): netezirea fără efect nu lasă retuș ascuns')
  brushDab('lower', over, rov, cov, W, H, 100, 50, 10, 1, 0)
  ok(cov[50 * W + 100] < 0.99 && cov[50 * W + 100] > 0.97, `baza peste 1: „Coboară” se vede de la prima apăsare (${cov[50 * W + 100].toFixed(3)})`)
  ok(Math.abs(over[50 * W + 100] + rov[50 * W + 100] - cov[50 * W + 100]) < 1e-6, 'retușul arată exact ce se vede (fără rest ascuns)')
}

{
  const big = new Float32Array(4 * 4).map((_, i) => i / 15)
  const r = resizeDepth(big, 4, 4, 8, 8)
  ok(r.every(v => v >= 0 && v <= 1) && near(r[0], 0, 1e-6) && near(r[63], 1, 1e-6), 'redimensionare bilineară păstrează capetele')
  const n = normalizeDepth(Float32Array.from([5, 6, 7, 8, 1000, ...Array(200).fill(7)]))
  ok(n.every(v => v >= 0 && v <= 1) && n[4] === 1, 'AI: normalizare 0..1, valoarea extremă tăiată')
}

console.log(fails ? `\n${fails} verificări au picat` : '\nToate verificările au trecut')
process.exit(fails ? 1 : 0)
