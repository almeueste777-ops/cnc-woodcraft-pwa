/**
 * Harta de icoană din 3 modele AI, într-un fir separat (interfața nu îngheață), toate pe procesor (wasm):
 *  1. Depth Anything V2 small (Apache-2.0) — volumul;
 *  2. ISNet / DIS (AGPL-3.0, Qin et al., onnx-community/ISNet-ONNX, fp16) — masca sfântului, la 1024 px;
 *  3. DeepBump (GPL-3.0, Hugo Tini, github.com/HugoTini/DeepBump) — normalele din umbre → relief sculptat.
 * De ce ISNet și nu BiRefNet: BiRefNet la 1024 px depășește cei 4 GB ai motorului din browser (măsurat: std::bad_alloc),
 * iar pe placa video motorul ONNX cere 17 zone de memorie într-un shader, unde placa ei permite 16; ISNet: 1 GB, ~20 s.
 * Prima dată se descarcă ~27 + ~88 + ~27 MB (plus motorul AI ~27 MB); apoi rămân în memoria browserului.
 * La orice eroare firul se închide (vezi iconReliefAi.ts): transformers.js pune toate rulările la coadă, iar o eroare
 * ar „otrăvi” coada pentru tot restul sesiunii.
 */
import { pipeline, AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers'
// același modul ONNX pe care îl folosește transformers.js (altfel ar fi două motoare și două memorii în fir)
import * as ort from 'onnxruntime-web/webgpu'
import { resizeDepth } from './depthEdit'
import {
  DEEPBUMP_TILE, accumulateTile, deepbumpTiles, frankotChellappa, newNormalAcc, normalsToGradients, padGrey, tileWeights
} from './iconRelief'

env.allowLocalModels = false

const DEPTH_MODEL = 'onnx-community/depth-anything-v2-small'
const MASK_MODEL = 'onnx-community/ISNet-ONNX'
// fixat pe o versiune anume a depozitului DeepBump (fișierul nu se schimbă sub noi)
export const DEEPBUMP_URL = 'https://raw.githubusercontent.com/HugoTini/DeepBump/fad19ba87daed12b1d0410a57e74f3d79e82f78d/deepbump256.onnx'
const CACHE = 'cnc-modele-ai-v1'

type Req = { id: number; rgba: Uint8ClampedArray; width: number; height: number }
type Progress = { status?: string; name?: string; file?: string; loaded?: number; total?: number }

// cheia de progres = model + fișier (toate modelele au un „config.json”, un „onnx/model_fp16.onnx”...)
const onDownload = (p: Progress) => {
  if (p.status === 'progress' && p.total) self.postMessage({ type: 'download', file: `${p.name ?? ''}/${p.file ?? ''}`, loaded: p.loaded ?? 0, total: p.total })
}

let depthP: Promise<(img: RawImage) => Promise<unknown>> | null = null
function getDepth() {
  if (!depthP) {
    depthP = pipeline('depth-estimation', DEPTH_MODEL, { dtype: 'q8', device: 'wasm', progress_callback: onDownload }) as unknown as Promise<(img: RawImage) => Promise<unknown>>
    depthP.catch(() => { depthP = null })
  }
  return depthP
}

type MaskRunner = { model: (x: unknown) => Promise<Record<string, { data: ArrayLike<number>; dims: number[] }>>; proc: (img: RawImage) => Promise<{ pixel_values: unknown }> }
let maskP: Promise<MaskRunner> | null = null
function getMask() {
  if (!maskP) {
    maskP = (async () => {
      const [model, proc] = await Promise.all([
        AutoModel.from_pretrained(MASK_MODEL, { dtype: 'fp16', device: 'wasm', progress_callback: onDownload }),
        AutoProcessor.from_pretrained(MASK_MODEL, { progress_callback: onDownload })
      ])
      return { model: model as never, proc: proc as never }
    })()
    maskP.catch(() => { maskP = null })
  }
  return maskP
}

/** DeepBump: din memoria browserului dacă e acolo, altfel descărcat (cu progres) și pus deoparte */
async function deepbumpBytes(): Promise<ArrayBuffer> {
  let cache: Cache | null = null
  try { cache = await caches.open(CACHE) } catch { /* fără Cache API (navigare privată): doar descărcare */ }
  const hit = cache ? await cache.match(DEEPBUMP_URL) : undefined
  if (hit) return hit.arrayBuffer()
  const res = await fetch(DEEPBUMP_URL)
  if (!res.ok || !res.body) throw new Error(`DeepBump nu s-a putut descărca (HTTP ${res.status})`)
  const total = Number(res.headers.get('content-length')) || 26_706_979
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    loaded += value.length
    self.postMessage({ type: 'download', file: 'deepbump256.onnx', loaded, total })
  }
  if (res.headers.get('content-length') && loaded !== total) throw new Error('DeepBump s-a descărcat incomplet (conexiune întreruptă); încearcă din nou.')
  const buf = new Uint8Array(loaded)
  let o = 0
  for (const p of parts) { buf.set(p, o); o += p.length }
  if (cache) { try { await cache.put(DEEPBUMP_URL, new Response(buf.slice().buffer)) } catch { /* plin: nu-i nimic */ } }
  return buf.buffer
}
let bumpP: Promise<ort.InferenceSession> | null = null
function getBump() {
  if (!bumpP) {
    // de obicei transformers.js a pus deja calea motorului (același CDN, aceeași versiune); dacă nu, o punem noi
    if (!ort.env.wasm.wasmPaths) ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`
    bumpP = deepbumpBytes().then(b => ort.InferenceSession.create(new Uint8Array(b), { executionProviders: ['wasm'] }))
    bumpP.catch(async () => {
      bumpP = null
      // un fișier stricat în memoria browserului ar strica fiecare rulare: îl scoatem, data viitoare se descarcă iar
      try { await (await caches.open(CACHE)).delete(DEEPBUMP_URL) } catch { /* fără Cache API */ }
    })
  }
  return bumpP
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, rgba, width: w, height: h } = e.data
  const stage = (s: string) => self.postMessage({ type: 'stage', id, stage: s })
  try {
    const image = new RawImage(rgba, w, h, 4)

    stage('1/3 Volumul figurii (Depth Anything)...')
    const runDepth = await getDepth()
    const dOut = (await runDepth(image)) as { predicted_depth: { data: Float32Array; dims: number[] } }
    const [dh, dw] = dOut.predicted_depth.dims.slice(-2)
    let depth: Float32Array<ArrayBufferLike> = Float32Array.from(dOut.predicted_depth.data)
    if (dw !== w || dh !== h) depth = resizeDepth(depth, dw, dh, w, h)

    stage('2/3 Sfântul față de fundal (ISNet)...')
    const { model, proc } = await getMask()
    const { pixel_values } = await proc(image)
    const mOut = await model({ input: pixel_values })
    const t = mOut[Object.keys(mOut)[0]]
    const [mh, mw] = t.dims.slice(-2)
    // ISNet dă direct 0..1 (sigmoida e în model)
    let mask: Float32Array<ArrayBufferLike> = Float32Array.from(t.data, v => Math.min(1, Math.max(0, Number(v))))
    if (mw !== w || mh !== h) mask = resizeDepth(mask, mw, mh, w, h)

    stage('3/3 Relieful sculptat (DeepBump)...')
    const sess = await getBump()
    const grey = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) grey[i] = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3 / 255
    const pad = padGrey(grey, w, h)
    const T = DEEPBUMP_TILE, wts = tileWeights(T), acc = newNormalAcc(pad.w, pad.h)
    const tiles = deepbumpTiles(pad.w, pad.h)
    const tile = new Float32Array(T * T)
    for (let n = 0; n < tiles.length; n++) {
      const { ox, oy } = tiles[n]
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) tile[y * T + x] = pad.data[(oy + y) * pad.w + ox + x]
      const r = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', tile.slice(), [1, 1, T, T]) })
      accumulateTile(acc, r[sess.outputNames[0]].data as Float32Array, ox, oy, wts, T)
      if (n % 4 === 3) stage(`3/3 Relieful sculptat (DeepBump): ${n + 1} / ${tiles.length}`)
    }
    const { hx, hy } = normalsToGradients(acc, w, h)
    const height = frankotChellappa(hx, hy, w, h)

    self.postMessage({ type: 'done', id, depth, mask, height, width: w, height_: h }, { transfer: [depth.buffer, mask.buffer, height.buffer] })
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
