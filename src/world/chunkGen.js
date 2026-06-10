import { createDensityField } from './density.js'
import { meshChunk, CHUNK, GRID } from './marchingCubes.js'
import { anchorsForSeed, opsForChunk, applyOps } from './anchors.js'

const worldCache = new Map() // seed -> { density, ops }

const EMPTY = () => ({
  positions: new Float32Array(0),
  normals: new Float32Array(0),
  indices: new Uint32Array(0),
})

function worldFor(seed) {
  let w = worldCache.get(seed)
  if (!w) {
    const density = createDensityField(seed)
    w = { density, ops: anchorsForSeed(seed, density) }
    worldCache.set(seed, w)
  }
  return w
}

export function generateChunk(seed, cx, cy, cz) {
  const { density, ops } = worldFor(seed)
  const chunkOps = opsForChunk(ops, cx, cy, cz, CHUNK)

  const ox = cx * CHUNK
  const oy = cy * CHUNK
  const oz = cz * CHUNK

  // Per-column floor precompute: floorY depends only on (x, z), so computing
  // it once per column instead of once per sample removes 34/35ths of the 2D
  // noise calls (the dominant generation cost; review finding, bit-identical).
  const floorCol = new Float64Array(GRID * GRID) // [z * GRID + x]
  let ci = 0
  for (let z = -1; z <= CHUNK + 1; z++)
    for (let x = -1; x <= CHUNK + 1; x++) floorCol[ci++] = density.floorY(ox + x, oz + z)

  const grid = new Float32Array(GRID * GRID * GRID)
  let min = Infinity
  let max = -Infinity
  let i = 0
  const stamped = chunkOps.length > 0
  for (let z = -1; z <= CHUNK + 1; z++)
    for (let y = -1; y <= CHUNK + 1; y++)
      for (let x = -1; x <= CHUNK + 1; x++) {
        const wx = ox + x
        const wy = oy + y
        const wz = oz + z
        let d = density.atWithFloor(floorCol[(z + 1) * GRID + (x + 1)], wx, wy, wz)
        if (stamped) d = applyOps(d, chunkOps, wx, wy, wz)
        grid[i++] = d
        if (d < min) min = d
        if (d > max) max = d
      }

  if (min > 0 || max < 0) {
    return { cx, cy, cz, ...EMPTY() }
  }
  const { positions, normals, indices } = meshChunk(grid)
  return { cx, cy, cz, positions, normals, indices }
}
