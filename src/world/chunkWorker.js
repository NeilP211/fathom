import { generateChunk } from './chunkGen.js'

self.onmessage = (e) => {
  const { jobId, seed, cx, cy, cz } = e.data
  const r = generateChunk(seed, cx, cy, cz)
  // Transfer the buffers (spec section 13: forgetting the transfer list
  // silently doubles memory and causes hitches).
  self.postMessage(
    { jobId, cx: r.cx, cy: r.cy, cz: r.cz, positions: r.positions, normals: r.normals, indices: r.indices },
    [r.positions.buffer, r.normals.buffer, r.indices.buffer],
  )
}
