// Verifică plasa 3D a sculpturii: corp închis (fiecare muchie în exact 2 triunghiuri), normale spre
// exterior (volum cu semn = volumul real), fața de sus netedă (normale mediate, nu pe triunghi).
// Rulare: npx tsx tests/mesh-check.ts
import { generateReliefMesh } from '../src/utils/meshGenerator'
import type { ImageProcessingOptions } from '../src/types/cnc'

let failed = 0
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'OK  ' : 'PICĂ'} ${msg}`)
  if (!ok) failed++
}

function run(w: number, h: number, cap: number, label: string, base = 0) {
  const hm = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x / (w - 1) - 0.5, dy = y / (h - 1) - 0.5
      hm[y * w + x] = Math.max(0, 1 - Math.hypot(dx, dy) * 1.6) // un dom
    }
  }
  const options = { widthMm: 200, heightMm: 200 * h / w, maxDepthMm: 6, baseThicknessMm: base } as ImageProcessingOptions
  const t0 = performance.now()
  const m = generateReliefMesh(hm, w, h, options, cap)
  const ms = performance.now() - t0
  const pos = m.geometry.getAttribute('position')
  const idx = m.geometry.getIndex()!
  const key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`

  // muchii după coordonate (STL-ul e „supă” de triunghiuri: contează coordonatele, nu indicii)
  const edges = new Map<string, number>()
  let vol = 0
  for (let k = 0; k < idx.count; k += 3) {
    const a = idx.getX(k), b = idx.getX(k + 1), c = idx.getX(k + 2)
    const ka = key(a), kb = key(b), kc = key(c)
    for (const [p, q] of [[ka, kb], [kb, kc], [kc, ka]]) {
      const e = p < q ? `${p}|${q}` : `${q}|${p}`
      edges.set(e, (edges.get(e) ?? 0) + 1)
    }
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a)
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b)
    const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c)
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  let bad = 0
  for (const n of edges.values()) if (n !== 2) bad++
  check(bad === 0, `${label}: corp închis (${bad} muchii deschise din ${edges.size})`)

  // volumul real al domului, integrat numeric pe o grilă fină
  let ref = 0
  const N = 400
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    ref += Math.max(0, 1 - Math.hypot((x + 0.5) / N - 0.5, (y + 0.5) / N - 0.5) * 1.6) * 6
  }
  ref *= (options.widthMm * options.heightMm) / (N * N)
  ref += base * options.widthMm * options.heightMm
  check(vol > 0, `${label}: normale spre exterior (volum ${vol.toFixed(0)} mm³ > 0)`)
  check(Math.abs(vol - ref) / ref < 0.02, `${label}: volum corect (${vol.toFixed(0)} vs. ${ref.toFixed(0)} mm³)`)

  // netezime: pe dom, două triunghiuri vecine din mijloc au același vârf comun cu O SINGURĂ normală
  const nor = m.geometry.getAttribute('normal')
  const centre = Math.floor(pos.count / 2)
  check(Math.abs(Math.hypot(nor.getX(centre), nor.getY(centre), nor.getZ(centre)) - 1) < 1e-3, `${label}: normale mediate pe vârfuri`)
  check(!!m.geometry.getAttribute('uv'), `${label}: are coordonate de textură`)

  const stl = m.getStlBlob()
  check(stl.size === 84 + 50 * m.triangleCount, `${label}: STL ${(stl.size / 1e6).toFixed(1)} MB, ${m.triangleCount.toLocaleString()} triunghiuri`)
  console.log(`     ${label}: ${pos.count.toLocaleString()} vârfuri, generat în ${ms.toFixed(0)} ms`)
}

run(120, 90, 800, 'imagine mică (grilă nativă)')
run(1600, 1200, 800, 'imagine mare (bicubic, plafon 800)')
run(950, 1266, 1000, 'simulare 30×40 cm (plafon 1000)')
run(300, 400, 800, 'icoană cu placă de bază 8 mm', 8)

if (failed) { console.log(`\n${failed} verificări au picat`); process.exit(1) }
console.log('\nToate verificările au trecut')
