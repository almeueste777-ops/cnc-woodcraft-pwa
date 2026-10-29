/**
 * Hartă de adâncime făcută de AI dintr-o fotografie (Depth Anything V2, varianta mică),
 * rulată în browser, într-un fir separat (interfața nu îngheață).
 * Prima dată se descarcă modelul (~27 MB) și motorul (~10 MB); apoi rămân în memoria browserului.
 */
import { pipeline, RawImage, env } from '@huggingface/transformers'

env.allowLocalModels = false

const MODEL = 'onnx-community/depth-anything-v2-small'

type Req = { id: number; rgba: Uint8ClampedArray; width: number; height: number }

let estimator: Promise<(img: RawImage) => Promise<unknown>> | null = null

function getEstimator() {
  if (!estimator) {
    estimator = pipeline('depth-estimation', MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status === 'progress' && p.total) {
          self.postMessage({ type: 'download', file: p.file ?? '', loaded: p.loaded ?? 0, total: p.total })
        }
      }
    }) as unknown as Promise<(img: RawImage) => Promise<unknown>>
    estimator.catch(() => { estimator = null }) // la eroare (fără internet) se poate încerca din nou
  }
  return estimator
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, rgba, width, height } = e.data
  try {
    const run = await getEstimator()
    self.postMessage({ type: 'stage', id, stage: 'Calculez adâncimea...' })
    const image = new RawImage(rgba, width, height, 4)
    const out = (await run(image)) as { predicted_depth: { data: Float32Array; dims: number[] } }
    const pred = out.predicted_depth
    const [h, w] = pred.dims.slice(-2)
    const data = Float32Array.from(pred.data)
    self.postMessage({ type: 'done', id, data, width: w, height: h }, { transfer: [data.buffer] })
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}
