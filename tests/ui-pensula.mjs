// Probă cap-coadă a pensulei și a zoomului, în Edge ascuns (profil propriu), prin DevTools (CDP).
// node proba-pensula.mjs <dosar-iesire> <imagine>
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = process.argv[2], IMG = process.argv[3]
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9337
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
    try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (tabs.some(t => t.type === 'page')) break } catch { /* încă pornește */ }
    await sleep(200)
  }
  const page = tabs.find(t => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise(r => { ws.onopen = r })
  let id = 0
  const pend = new Map()
  const errors = []
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
  const shot = async name => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')) }
  const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra })
  const key = async (code, k, vk, modifiers = 0) => {
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: k, windowsVirtualKeyCode: vk, modifiers })
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk, modifiers })
    await sleep(150)
  }
  const VP = `document.querySelector('[aria-label^="Harta de adâncime: trage"]')`
  const rect = () => ev(`(() => { const e = ${VP}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`)
  const zoomTxt = () => ev(`[...document.querySelectorAll('span')].find(s => s.className.includes('w-14') && /%$/.test(s.textContent.trim()))?.textContent.trim()`)
  const readout = () => ev(`[...document.querySelectorAll('span')].find(s => s.textContent.includes('înălțime') && s.textContent.startsWith('x '))?.textContent`)
  const parseRead = t => { const m = /x ([\d.]+) mm · y ([\d.]+) mm · înălțime ([\d.]+) mm/.exec(t || ''); return m ? { x: +m[1], y: +m[2], z: +m[3] } : null }
  const sizeTxt = () => ev(`[...document.querySelectorAll('label')].find(l => l.textContent.startsWith('Mărime pensulă'))?.querySelector('.font-mono')?.textContent`)
  const click = t => ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(t)})); if (b) b.click(); return !!b })()`)
  const transform = () => ev(`${VP}.firstElementChild.style.transform`)
  const at = async (x, y) => { await mouse('mouseMoved', x, y); await sleep(80); return parseRead(await readout()) }
  const wheel = async (x, y, dy, n) => { for (let i = 0; i < n; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); await sleep(40) } await sleep(150) }

  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('DOM.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await sleep(5000)
  const doc = await cdp('DOM.getDocument', { depth: -1 })
  const q = await cdp('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file][accept*="image"]' })
  ok(q.nodeId > 0, 'găsit butonul de încărcare a imaginii')
  await cdp('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [IMG] })
  await sleep(6000)
  await ev(`${VP}?.scrollIntoView({ block: 'center' })`)
  await sleep(300)
  let r = await rect()
  ok(!!r && r.w > 100, `fereastra hărții apare (${r ? Math.round(r.w) + '×' + Math.round(r.h) : 'lipsă'})`)
  ok((await zoomTxt()) === '100%', `zoom la început: ${await zoomTxt()}`)

  ok(await click('Ecran mare'), 'butonul „Ecran mare”')
  await sleep(500)
  r = await rect()
  ok(r.w > 1200, `ecranul mare ocupă lățimea (${Math.round(r.w)} px)`)
  const cx = Math.round(r.x + r.w / 2), cy = Math.round(r.y + r.h / 2)

  // zoom cu rotița: punctul de sub maus rămâne pe loc
  const p0 = await at(cx + 40, cy - 30)
  await wheel(cx + 40, cy - 30, -300, 6)
  const z1 = await zoomTxt()
  const p1 = await at(cx + 40, cy - 30)
  ok(parseInt(z1) > 300, `rotița mărește: ${z1}`)
  ok(p0 && p1 && Math.abs(p0.x - p1.x) < 1 && Math.abs(p0.y - p1.y) < 1, `punctul de sub maus rămâne pe loc (${p0?.x},${p0?.y} → ${p1?.x},${p1?.y} mm)`)
  await shot('1-zoom.png')

  // pensula Ridică: trăsătură orizontală
  ok(await click('Ridică'), 'unealta Ridică')
  const before = await at(cx + 30, cy)
  await mouse('mousePressed', cx - 30, cy, { button: 'left', buttons: 1, clickCount: 1 })
  for (let k = 1; k <= 12; k++) { await mouse('mouseMoved', cx - 30 + k * 10, cy, { button: 'left', buttons: 1 }); await sleep(15) }
  await mouse('mouseReleased', cx + 90, cy, { button: 'left', buttons: 0, clickCount: 1 })
  await sleep(300)
  const after = await at(cx + 30, cy)
  ok(before && after && after.z > before.z + 0.05, `Ridică urcă lemnul: ${before?.z} → ${after?.z} mm`)
  await shot('2-trasatura.png')

  // anulează / refă cu tastatura
  await key('KeyZ', 'z', 90, 2)
  const undone = await at(cx + 30, cy)
  ok(undone && Math.abs(undone.z - before.z) < 0.011, `Ctrl+Z readuce: ${undone?.z} mm`)
  await key('KeyY', 'y', 89, 2)
  const redone = await at(cx + 30, cy)
  ok(redone && Math.abs(redone.z - after.z) < 0.011, `Ctrl+Y reface: ${redone?.z} mm`)

  // mărimea cu tastele [ ]
  const s0 = await sizeTxt()
  await key('BracketRight', ']', 221)
  await key('BracketRight', ']', 221)
  const s1 = await sizeTxt()
  await key('BracketLeft', '[', 219)
  const s2 = await sizeTxt()
  ok(parseFloat(s1) > parseFloat(s0) && parseFloat(s2) < parseFloat(s1), `tastele [ ] schimbă mărimea: ${s0} → ${s1} → ${s2}`)

  // limită de sus: nu urcă peste
  // mutare cu clic dreapta
  const t0 = await transform()
  await mouse('mousePressed', cx, cy, { button: 'right', buttons: 2, clickCount: 1 })
  await mouse('mouseMoved', cx - 120, cy - 60, { button: 'right', buttons: 2 })
  await mouse('mouseReleased', cx - 120, cy - 60, { button: 'right', buttons: 0, clickCount: 1 })
  await sleep(200)
  const t1 = await transform()
  ok(t0 !== t1, `clic dreapta + tras mută harta (${t0} → ${t1})`)

  // pipeta cu Alt+clic
  await mouse('mousePressed', cx, cy, { button: 'left', buttons: 1, clickCount: 1, modifiers: 1 })
  await mouse('mouseReleased', cx, cy, { button: 'left', buttons: 0, clickCount: 1, modifiers: 1 })
  await sleep(300)
  const fixed = await ev(`[...document.querySelectorAll('label')].some(l => l.textContent.startsWith('Nivel fix'))`)
  ok(fixed, 'Alt+clic alege nivelul (apare „Nivel fix”)')

  // netezire trasă mult peste marginea hărții (eroare găsită de audit la 31.10)
  await key('Digit0', '0', 48)
  ok(await click('Netezește'), 'unealta Netezește')
  r = await rect()
  const mx0 = Math.round(r.x + r.w / 2), my0 = Math.round(r.y + r.h / 2)
  await mouse('mousePressed', mx0, my0, { button: 'left', buttons: 1, clickCount: 1 })
  for (let k = 1; k <= 20; k++) { await mouse('mouseMoved', mx0 + k * 40, my0, { button: 'left', buttons: 1 }); await sleep(10) }
  await mouse('mouseReleased', mx0 + 800, my0, { button: 'left', buttons: 0, clickCount: 1 })
  await sleep(300)
  ok(errors.length === 0, `netezirea trasă peste marginea hărții, fără erori${errors.length ? ': ' + errors[0] : ''}`)

  // pipeta nu mai aruncă zoomul înapoi (glisorul „Nivel fix” e deja afișat; măresc și schimb nivelul)
  await wheel(mx0, my0, -300, 4)
  const zBefore = await zoomTxt()
  ok(await click('Nivel de la începutul'), 'butonul „Nivel de la începutul trăsăturii”')
  await sleep(400)
  ok((await zoomTxt()) === zBefore, `zoomul rămâne când dispare un glisor (${zBefore} → ${await zoomTxt()})`)

  // zoom maxim: pixeli vizibili
  await wheel(cx, cy, -400, 25)
  const zmax = await zoomTxt()
  const rend = await ev(`${VP}.querySelector('canvas').style.imageRendering`)
  ok(parseInt(zmax) >= 1500 && rend === 'pixelated', `zoom maxim ${zmax}, pixeli văzuți întregi (${rend})`)
  await shot('3-zoom-maxim.png')
  await key('Digit0', '0', 48)
  ok((await zoomTxt()) === '100%', `tasta 0 arată toată harta: ${await zoomTxt()}`)

  await key('Escape', 'Escape', 27)
  r = await rect()
  ok(r.w < 900, `Esc iese din ecranul mare (${Math.round(r.w)} px)`)
  await shot('4-normal.png')
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
