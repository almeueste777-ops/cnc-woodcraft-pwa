import type { CamInput, CamOutput } from './engine'
import type { VectorInput, VectorOutput } from './vectorJob'

let worker: Worker | null = null
let pendingReject: ((e: Error) => void) | null = null
let nextId = 1

function stopWorker(reason: string) {
  if (worker) worker.terminate()
  worker = null
  if (pendingReject) pendingReject(new Error(reason))
  pendingReject = null
}

/** Pornește calculul CAM în worker; un calcul nou îl anulează pe cel vechi */
export function runCamInWorker(
  input: CamInput,
  onProgress: (stage: string, fraction: number) => void
): Promise<CamOutput> {
  return start({ kind: 'relief', input: { ...input, heightmap: input.heightmap.slice() } }, onProgress)
}

/** Lucrările vectoriale (V-carve, buzunar, profil, găuri), în același worker */
export function runVectorInWorker(
  input: VectorInput,
  onProgress: (stage: string, fraction: number) => void
): Promise<VectorOutput> {
  return start({ kind: 'vector', input: { ...input, mask: { ...input.mask, data: input.mask.data.slice() } } }, onProgress)
}

function start<T>(payload: { kind: 'relief' | 'vector'; input: unknown }, onProgress: (stage: string, fraction: number) => void): Promise<T> {
  stopWorker('Înlocuit de un calcul nou')
  const w = new Worker(new URL('./cam.worker.ts', import.meta.url), { type: 'module' })
  worker = w
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pendingReject = reject
    const finish = () => {
      w.terminate()
      if (worker === w) { worker = null; pendingReject = null }
    }
    w.onmessage = e => {
      const msg = e.data
      if (msg.id !== id) return
      if (msg.type === 'progress') onProgress(msg.stage, msg.fraction)
      else if (msg.type === 'done') { finish(); resolve(msg.out) }
      else if (msg.type === 'error') { finish(); reject(new Error(msg.message)) }
    }
    w.onerror = e => { finish(); reject(new Error(e.message || 'Eroare în calculul traseelor')) }
    // datele se trimit ca o copie, ca originalul să rămână folosibil în interfață
    w.postMessage({ id, ...payload })
  })
}

export function cancelCam() {
  stopWorker('Calcul anulat')
}
