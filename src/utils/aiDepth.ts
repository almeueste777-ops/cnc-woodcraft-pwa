/**
 * Partea din aplicație a hărții AI: trimite poza la firul separat, primește adâncimea
 * și o aduce la 0..1 (aproape = sus = alb), cu marginile extreme tăiate (1% / 99%),
 * ca un singur pixel ciudat să nu turtească tot relieful.
 */
export interface AiDepthResult { data: Float32Array; width: number; height: number }
export type AiProgress = (text: string, fraction: number | null) => void

const MAX_SIDE = 1024 // modelul lucrează oricum la ~518 px; harta se întoarce la mărimea pozei trimise

let worker: Worker | null = null
let nextId = 1

export function estimateDepthAI(source: HTMLCanvasElement, onProgress: AiProgress): Promise<AiDepthResult> {
  const k = Math.min(1, MAX_SIDE / Math.max(source.width, source.height))
  const w = Math.max(1, Math.round(source.width * k)), h = Math.max(1, Math.round(source.height * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, w, h)
  const rgba = ctx.getImageData(0, 0, w, h).data

  if (!worker) worker = new Worker(new URL('./aiDepth.worker.ts', import.meta.url), { type: 'module' })
  const id = nextId++
  const files = new Map<string, { loaded: number; total: number }>()
  onProgress('Pornesc modelul AI...', null)

  return new Promise((resolve, reject) => {
    const w0 = worker!
    // firul s-a stricat (nu s-a putut încărca, a rămas fără memorie): îl aruncăm, data viitoare se face altul
    const onFail = (e: Event) => {
      w0.removeEventListener('message', onMsg)
      w0.removeEventListener('error', onFail)
      w0.removeEventListener('messageerror', onFail)
      w0.terminate()
      if (worker === w0) worker = null
      reject(new Error(friendlyError(e instanceof ErrorEvent && e.message ? e.message : 'firul de calcul AI s-a oprit (posibil memorie insuficientă)')))
    }
    w0.addEventListener('error', onFail)
    w0.addEventListener('messageerror', onFail)
    const done = () => {
      w0.removeEventListener('message', onMsg)
      w0.removeEventListener('error', onFail)
      w0.removeEventListener('messageerror', onFail)
    }
    const onMsg = (e: MessageEvent) => {
      const m = e.data
      if (m.type === 'download') {
        files.set(m.file, { loaded: m.loaded, total: m.total })
        let loaded = 0, total = 0
        for (const f of files.values()) { loaded += f.loaded; total += f.total }
        onProgress(`Încarc modelul AI (prima dată din internet, apoi din memoria browserului): ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`, total ? loaded / total : null)
        return
      }
      if (m.id !== id) return
      if (m.type === 'stage') onProgress(m.stage, null)
      else if (m.type === 'done') {
        done()
        resolve({ data: normalizeDepth(m.data), width: m.width, height: m.height })
      } else if (m.type === 'error') {
        done()
        // transformers.js pune rularile la coada: dupa o eroare firul ramane stricat, deci il inchidem
        w0.terminate()
        if (worker === w0) worker = null
        reject(new Error(friendlyError(m.message)))
      }
    }
    w0.addEventListener('message', onMsg)
    w0.postMessage({ id, rgba, width: w, height: h }, [rgba.buffer])
  })
}

function friendlyError(msg: string): string {
  if (/fetch|network|Failed to load|404|ENOTFOUND/i.test(msg)) {
    return 'Modelul AI nu s-a putut descărca. Prima folosire are nevoie de internet; după aceea merge și fără.'
  }
  return `Harta AI a eșuat: ${msg}`
}

/** 0..1 cu tăierea extremelor (percentila 1 și 99) */
export function normalizeDepth(raw: Float32Array): Float32Array {
  const n = raw.length
  const stride = Math.max(1, Math.floor(n / 200_000))
  const sample: number[] = []
  for (let i = 0; i < n; i += stride) if (Number.isFinite(raw[i])) sample.push(raw[i])
  sample.sort((a, b) => a - b)
  const lo = sample[Math.floor(sample.length * 0.01)] ?? 0
  const hi = sample[Math.min(sample.length - 1, Math.floor(sample.length * 0.99))] ?? 1
  const span = hi - lo || 1
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const v = (raw[i] - lo) / span
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v
  }
  return out
}
