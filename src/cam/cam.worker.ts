/// <reference lib="webworker" />
// Calculul traseelor rulează aici ca interfața să nu înghețe
import { runCam, type CamInput } from './engine'
import { runVectorCam, type VectorInput } from './vectorJob'

type Msg = { id: number; kind?: 'relief'; input: CamInput } | { id: number; kind: 'vector'; input: VectorInput }

self.onmessage = (e: MessageEvent<Msg>) => {
  const msg = e.data
  const id = msg.id
  const progress = (stage: string, fraction: number) => self.postMessage({ id, type: 'progress', stage, fraction })
  try {
    const out = msg.kind === 'vector' ? runVectorCam(msg.input, progress) : runCam(msg.input, progress)
    const transfer: Transferable[] = out.toolpaths.map(t => t.moves.buffer as ArrayBuffer)
    if (out.simulation) transfer.push(out.simulation.heightmap.buffer as ArrayBuffer)
    self.postMessage({ id, type: 'done', out }, { transfer })
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
