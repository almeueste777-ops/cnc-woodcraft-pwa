/**
 * Partea din aplicație a hărții de icoană (3 modele, vezi iconRelief.worker.ts):
 * trimite poza la firul separat și primește cele trei hărți brute; compunerea se face apoi
 * cu prepare/finishIconRelief (iconRelief.ts), ca glisoarele să schimbe rezultatul fără a rula iar modelele.
 */
import { normalizeDepth } from './aiDepth'

export interface IconMaps { depth: Float32Array; mask: Float32Array; height: Float32Array; width: number; height_: number }
export type IconProgress = (text: string, fraction: number | null) => void

const MAX_SIDE = 1024 // ISNet lucrează la 1024; mai mult nu aduce nimic, doar memorie
const EXPECTED_BYTES = 142e6 // cele trei modele; bara nu mai sare înapoi când apare următorul fișier

let worker: Worker | null = null
let nextId = 1
let pending: { reject: (e: Error) => void } | null = null

function dropWorker() {
  worker?.terminate()
  worker = null
}

/** oprește o hartă de icoană în lucru (poză nouă, alt clic): firul se închide, memoria se eliberează */
export function cancelIconMaps() {
  if (!pending) return
  const p = pending
  pending = null
  dropWorker()
  p.reject(new Error('Oprit: s-a cerut altă hartă.'))
}

export function estimateIconMaps(source: HTMLCanvasElement, onProgress: IconProgress): Promise<IconMaps> {
  cancelIconMaps() // niciodată două rulări deodată (memoria s-ar dubla)
  const k = Math.min(1, MAX_SIDE / Math.max(source.width, source.height))
  const w = Math.max(1, Math.round(source.width * k)), h = Math.max(1, Math.round(source.height * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  // fundal alb sub părțile transparente (PNG): altfel culoarea lor ar fi la întâmplare
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(source, 0, 0, w, h)
  const rgba = ctx.getImageData(0, 0, w, h).data

  if (!worker) worker = new Worker(new URL('./iconRelief.worker.ts', import.meta.url), { type: 'module' })
  const id = nextId++
  const files = new Map<string, { loaded: number; total: number }>()
  onProgress('Pornesc cele trei modele AI...', null)

  return new Promise((resolve, reject) => {
    const w0 = worker!
    pending = { reject }
    const cleanup = () => {
      if (pending?.reject === reject) pending = null
      w0.removeEventListener('message', onMsg)
      w0.removeEventListener('error', onFail)
      w0.removeEventListener('messageerror', onFail)
    }
    const onFail = (e: Event) => {
      cleanup()
      if (worker === w0) dropWorker()
      reject(new Error(friendly(e instanceof ErrorEvent && e.message ? e.message : 'firul de calcul AI s-a oprit (posibil memorie insuficientă)')))
    }
    const onMsg = (e: MessageEvent) => {
      const m = e.data
      if (m.type === 'download') {
        files.set(m.file, { loaded: m.loaded, total: m.total })
        let loaded = 0, total = 0
        for (const f of files.values()) { loaded += f.loaded; total += f.total }
        const all = Math.max(total, EXPECTED_BYTES)
        // transformers.js raportează la fel și citirea din memoria browserului: „încarc”, nu „descarc”
        onProgress(`Încarc modelele AI (prima dată din internet, apoi din memoria browserului): ${(loaded / 1e6).toFixed(0)} / ~${(all / 1e6).toFixed(0)} MB`, Math.min(1, loaded / all))
        return
      }
      if (m.id !== id) return
      if (m.type === 'stage') onProgress(m.stage, null)
      else if (m.type === 'done') {
        cleanup()
        // memoria motorului din browser nu scade niciodată (~1 GB după ISNet): închidem firul;
        // data viitoare modelele se încarcă din memoria browserului, în câteva secunde
        if (worker === w0) dropWorker()
        resolve({ depth: normalizeDepth(m.depth), mask: m.mask, height: m.height, width: m.width, height_: m.height_ })
      } else if (m.type === 'error') {
        cleanup()
        // după o eroare, coada internă a transformers.js rămâne stricată: firul se închide, următoarea rulare pornește curat
        if (worker === w0) dropWorker()
        reject(new Error(friendly(m.message)))
      }
    }
    w0.addEventListener('message', onMsg)
    w0.addEventListener('error', onFail)
    w0.addEventListener('messageerror', onFail)
    w0.postMessage({ id, rgba, width: w, height: h }, [rgba.buffer])
  })
}

function friendly(msg: string): string {
  if (/fetch|network|Failed to load|404|ENOTFOUND|descărca/i.test(msg)) {
    return 'Modelele AI nu s-au putut descărca. Prima folosire are nevoie de internet; după aceea merge și fără.'
  }
  if (/memory|memorie|allocation|bad_alloc|OOM/i.test(msg)) return 'Nu a ajuns memoria pentru cele trei modele. Închide alte file și încearcă din nou.'
  return `Harta de icoană a eșuat: ${msg}`
}
