import { createDensityField } from './density.js'
import { meshChunk, CHUNK, GRID } from './marchingCubes.js'

const fieldCache = new Map() // seed -> density function (one per worker)

export function generateChunk(seed, cx, cy, cz) {
  let density = fieldCache.get(seed)
  if (!density) {
    density = createDensityField(seed)
    fieldCache.set(seed, density)
  }

  const grid = new Float32Array(GRID * GRID * GRID)
  const ox = cx * CHUNK
  const oy = cy * CHUNK
  const oz = cz * CHUNK
  let min = Infinity
  let max = -Infinity
  let i = 0
  for (let z = -1; z <= CHUNK + 1; z++)
    for (let y = -1; y <= CHUNK + 1; y++)
      for (let x = -1; x <= CHUNK + 1; x++) {
        const d = density(ox + x, oy + y, oz + z)
        grid[i++] = d
        if (d < min) min = d
        if (d > max) max = d
      }

  if (min > 0 || max < 0) {
    return { cx, cy, cz, positions: new Float32Array(0), normals: new Float32Array(0) }
  }
  const { positions, normals } = meshChunk(grid)
  return { cx, cy, cz, positions, normals }
}
