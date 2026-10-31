// Probă cap-coadă a hărții de icoană (3 modele AI) în Edge ascuns, cu profil propriu, prin DevTools (CDP).
// Cere `npm run dev` pornit și internet la prima rulare (~170 MB de modele, apoi din memoria browserului).
// node tests/ui-icoana.mjs <dosar-iesire> <imagine>
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = process.argv[2], IMG = process.argv[3]
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9338
fs.mkdirSync(OUT, { recursive: true })
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, 'profil-edge')}`,
  '--window-size=1400,1000', '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let fails = 0
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fails++ }

let ws
try {
  let tabs = []
  for (let i = 0; i < 75; i++) {
    try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (tabs.some(t => t.type === 'page')) break } catch { /* pornește */ }
    await sleep(200)
  }
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => { ws.onopen = r })
  let id = 0
  const pend = new Map(), errors = []
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result) }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '))
  }
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async expr => {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  const shot = async name => { const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')) }
  const click = t => ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(t)})); if (b) { b.scrollIntoView({ block: 'center' }); b.click() } return !!b })()`)
  const aiText = () => ev(`[...document.querySelectorAll('span')].map(s => s.textContent).find(t => /Încarc modelele|1\\/3|2\\/3|3\\/3|Pornesc|eșuat|nu s-au putut|Nu a ajuns/.test(t)) ?? ''`)
  // ce e în memoria browserului (Cache Storage): modelele transformers.js și DeepBump
  const cached = () => ev(`(async () => { const out = {}; for (const k of await caches.keys()) { const c = await caches.open(k); out[k] = (await c.keys()).map(r => r.url.split('/').slice(-4).join('/')) } return out })()`)
  const ready = () => ev(`[...document.querySelectorAll('span')].some(s => s.textContent.startsWith('Harta de icoană e gata'))`)
  const preview = () => ev(`(() => { const c = document.querySelector('canvas[aria-label="Previzualizarea hărții de icoană"]'); if (!c || !c.width) return null
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let mn = 255, mx = 0
    for (let i = 0; i < d.length; i += 4) { mn = Math.min(mn, d[i]); mx = Math.max(mx, d[i]) }
    return { w: c.width, h: c.height, mn, mx, corner: d[0], center: d[((c.height >> 1) * c.width + (c.width >> 1)) * 4] } })()`)
  const setSlider = (label, value) => ev(`(() => { const l = [...document.querySelectorAll('label')].find(l => l.textContent.startsWith(${JSON.stringify(label)})); const i = l?.querySelector('input'); if (!i) return false
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(String(value))}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)

  const runOnce = async (tag) => {
    await cdp('Page.navigate', { url: 'http://127.0.0.1:5173/' })
    await sleep(5000)
    const doc = await cdp('DOM.getDocument', { depth: -1 })
    const q = await cdp('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file][accept*="image"]' })
    await cdp('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [IMG] })
    await sleep(5000)
    ok(await click('Fă harta de icoană'), `${tag}: butonul „Fă harta de icoană”`)
    const t0 = Date.now()
    let sawDownload = false, last = ''
    while (Date.now() - t0 < 15 * 60_000) {
      await sleep(700)
      const t = await aiText()
      if (t && t !== last) {
        if (/Încarc/.test(t)) sawDownload = true
        // jurnal: fiecare etapă nouă (descărcările doar la fiecare ~25%), ca să se vadă unde stă dacă se blochează
        const stageChanged = t.replace(/\d+/g, '') !== last.replace(/\d+/g, '')
        if (stageChanged || !/Încarc/.test(t) || Math.random() < 0.1) console.log(`     ${tag} +${Math.round((Date.now() - t0) / 1000)}s: ${t}`)
        last = t
      }
      if (await ready()) break
      if (/eșuat|nu s-au putut|Nu a ajuns/.test(t)) break
    }
    const secs = Math.round((Date.now() - t0) / 1000)
    ok(await ready(), `${tag}: harta de icoană gata în ${secs} s${(await ready()) ? '' : ' — ultimul mesaj: ' + last}`)
    return { secs, sawDownload }
  }

  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('DOM.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false })

  const first = await runOnce('prima rulare')
  const p1 = await preview()
  ok(p1 && p1.mx - p1.mn > 120, `previzualizarea are relief (gri ${p1?.mn}..${p1?.mx}, ${p1?.w}×${p1?.h})`)
  ok(p1 && p1.corner < 40, `fundalul din colț e jos și plat (${p1?.corner})`)
  await shot('1-harta-icoana.png')
  ok(await setSlider('Înălțimea fundalului', 0.3), 'glisorul „Înălțimea fundalului”')
  await sleep(2500)
  const p2 = await preview()
  ok(p2 && p2.corner > p1.corner + 40, `fundalul urcă după glisor (${p1?.corner} → ${p2?.corner})`)
  await setSlider('Înălțimea fundalului', 0.08)
  await sleep(1500)
  ok(await click('Folosește-o ca relief'), 'butonul „Folosește-o ca relief”')
  await sleep(2500)
  const toast = await ev(`document.body.innerText.includes('folosită ca relief')`)
  ok(toast, 'harta a devenit relieful (mesajul de confirmare)')
  await shot('2-relief.png')

  // după prima rulare, toate cele trei modele trebuie să fie în memoria browserului (merge și fără internet)
  const c = await cached()
  const all = Object.values(c).flat().join(' ')
  ok(/ISNet-ONNX.*model_fp16\.onnx|model_fp16\.onnx.*ISNet/.test(all) || /ISNet-ONNX/.test(all), `ISNet e în memoria browserului`)
  ok(/depth-anything-v2-small/.test(all), 'Depth Anything e în memoria browserului')
  ok(/deepbump256\.onnx/.test(all), 'DeepBump e în memoria browserului')
  if (!/ISNet-ONNX/.test(all)) console.log('     conținut:', JSON.stringify(c).slice(0, 600))

  const second = await runOnce('a doua rulare (din memoria browserului)')
  ok(second.secs > 0, `a doua rulare (prima: ${first.secs} s, a doua: ${second.secs} s)`)
  await shot('3-a-doua.png')

  ok(errors.length === 0, `fără erori în consolă${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`)
} catch (e) {
  console.log('FAIL proba s-a oprit:', e.message)
  fails++
} finally {
  try { ws?.close() } catch { /* */ }
  try { execSync(`taskkill /PID ${edge.pid} /T /F`, { stdio: 'ignore' }) } catch { /* deja închis */ }
}
console.log(fails ? `\n${fails} verificări au picat` : '\nToate verificările au trecut')
process.exit(fails ? 1 : 0)
