import { edgeTable, triTable } from './mcTables.js'

export const CHUNK = 32 // cells per axis
export const GRID = CHUNK + 3 // 35 samples per axis: grid index i = local coord + 1, local -1..33

export const gridIndex = (x, y, z) => (z * GRID + y) * GRID + x

// Standard marching cubes corner offsets and the corner pairs joined by each edge.
const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
]

// grid: Float32Array(GRID^3) densities (>0 solid). Returns non-indexed
// { positions, normals } in LOCAL chunk coordinates (0..32 on each axis).
export function meshChunk(grid) {
  const positions = []
  const normals = []
  const vert = new Array(12)
  const norm = new Array(12)
  const d = new Array(8)
  const g0 = [0, 0, 0]
  const g1 = [0, 0, 0]

  // Density gradient at a grid point (points INTO the rock).
  function gradient(gx, gy, gz, out) {
    out[0] = grid[gridIndex(gx + 1, gy, gz)] - grid[gridIndex(gx - 1, gy, gz)]
    out[1] = grid[gridIndex(gx, gy + 1, gz)] - grid[gridIndex(gx, gy - 1, gz)]
    out[2] = grid[gridIndex(gx, gy, gz + 1)] - grid[gridIndex(gx, gy, gz - 1)]
  }

  for (let cz = 0; cz < CHUNK; cz++)
    for (let cy = 0; cy < CHUNK; cy++)
      for (let cx = 0; cx < CHUNK; cx++) {
        let cubeIndex = 0
        for (let i = 0; i < 8; i++) {
          const [ox, oy, oz] = CORNERS[i]
          d[i] = grid[gridIndex(cx + ox + 1, cy + oy + 1, cz + oz + 1)]
          if (d[i] < 0) cubeIndex |= 1 << i // bit set in WATER (Bourke convention: below isolevel)
        }
        const edges = edgeTable[cubeIndex]
        if (edges === 0) continue

        for (let e = 0; e < 12; e++) {
          if (!(edges & (1 << e))) continue
          const [a, b] = EDGES[e]
          const t = d[a] / (d[a] - d[b]) // zero crossing along the edge
          const [ax, ay, az] = CORNERS[a]
          const [bx, by, bz] = CORNERS[b]
          vert[e] = [cx + ax + t * (bx - ax), cy + ay + t * (by - ay), cz + az + t * (bz - az)]
          gradient(cx + ax + 1, cy + ay + 1, cz + az + 1, g0)
          gradient(cx + bx + 1, cy + by + 1, cz + bz + 1, g1)
          // Negated interpolated gradient: out of the rock, into the water.
          const nx = -(g0[0] + t * (g1[0] - g0[0]))
          const ny = -(g0[1] + t * (g1[1] - g0[1]))
          const nz = -(g0[2] + t * (g1[2] - g0[2]))
          const len = Math.hypot(nx, ny, nz) || 1
          norm[e] = [nx / len, ny / len, nz / len]
        }

        for (let i = cubeIndex * 16; triTable[i] !== -1; i += 3) {
          for (const e of [triTable[i], triTable[i + 1], triTable[i + 2]]) {
            positions.push(vert[e][0], vert[e][1], vert[e][2])
            normals.push(norm[e][0], norm[e][1], norm[e][2])
          }
        }
      }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals) }
}
