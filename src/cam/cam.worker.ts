/// <reference lib="webworker" />
// Calculul traseelor rulează aici ca interfața să nu înghețe
import { runCam, type CamInput } from './engine'

self.onmessage = (e: MessageEvent<{ id: number; input: CamInput }>) => {
  const { id, input } = e.data
  try {
    const out = runCam(input, (stage, fraction) => {
      self.postMessage({ id, type: 'progress', stage, fraction })
    })
    const transfer: Transferable[] = out.toolpaths.map(t => t.moves.buffer as ArrayBuffer)
    if (out.simulation) transfer.push(out.simulation.heightmap.buffer as ArrayBuffer)
    self.postMessage({ id, type: 'done', out }, { transfer })
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
