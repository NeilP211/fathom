import { createDensityField } from './density.js'
import { meshChunk, CHUNK, GRID } from './marchingCubes.js'

const fieldCache = new Map() // seed -> density function (one per worker)

const EMPTY = () => ({
  positions: new Float32Array(0),
  normals: new Float32Array(0),
  indices: new Uint32Array(0),
})

export function generateChunk(seed, cx, cy, cz) {
  let density = fieldCache.get(seed)
  if (!density) {
    density = createDensityField(seed)
    fieldCache.set(seed, density)
  }

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
  for (let z = -1; z <= CHUNK + 1; z++)
    for (let y = -1; y <= CHUNK + 1; y++)
      for (let x = -1; x <= CHUNK + 1; x++) {
        const d = density.atWithFloor(floorCol[(z + 1) * GRID + (x + 1)], ox + x, oy + y, oz + z)
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
