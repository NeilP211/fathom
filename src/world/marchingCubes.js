import { edgeTable, triTable } from './mcTables.js'

export const CHUNK = 32 // cells per axis
export const GRID = CHUNK + 3 // 35 samples per axis: grid index i = local coord + 1, local -1..33

export const gridIndex = (x, y, z) => (z * GRID + y) * GRID + x

// Standard marching cubes corner offsets (flat arrays: no destructuring in the
// hot loop) and, for each of the 12 edges, the canonical base corner (the
// lower end) plus the axis the edge runs along. The canonical form lets
// adjacent cells share one welded vertex per grid edge.
const CORNER_X = [0, 1, 1, 0, 0, 1, 1, 0]
const CORNER_Y = [0, 0, 1, 1, 0, 0, 1, 1]
const CORNER_Z = [0, 0, 0, 0, 1, 1, 1, 1]
const EDGE_BX = [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0]
const EDGE_BY = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1]
const EDGE_BZ = [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0]
const EDGE_AXIS = [0, 1, 0, 1, 0, 1, 0, 1, 2, 2, 2, 2]

// grid: Float32Array(GRID^3) densities (>0 solid). Returns indexed geometry
// { positions, normals, indices } in LOCAL chunk coordinates (0..32 per axis).
// Vertices are welded: each grid edge crossing is computed exactly once and
// shared by every triangle that uses it (spec section 4: indexed output).
export function meshChunk(grid) {
  const positions = []
  const normals = []
  const indices = []
  const edgeMap = new Map() // canonical edge key -> vertex index
  const eVert = new Int32Array(12) // per-cell scratch: edge -> vertex index
  const d = new Float64Array(8)
  let vcount = 0

  // Compute (or reuse) the welded vertex on the grid edge starting at base
  // grid coords (gbx, gby, gbz) along axis. Returns the vertex index.
  function edgeVertex(gbx, gby, gbz, axis) {
    const baseIdx = gridIndex(gbx, gby, gbz)
    const key = baseIdx * 3 + axis
    const cached = edgeMap.get(key)
    if (cached !== undefined) return cached

    const sx = axis === 0 ? 1 : 0
    const sy = axis === 1 ? 1 : 0
    const sz = axis === 2 ? 1 : 0
    const d0 = grid[baseIdx]
    const d1 = grid[gridIndex(gbx + sx, gby + sy, gbz + sz)]
    const t = d0 / (d0 - d1) // zero crossing along the edge

    positions.push(gbx - 1 + t * sx, gby - 1 + t * sy, gbz - 1 + t * sz)

    // Central-difference gradients at both edge ends (valid everywhere thanks
    // to the one-voxel apron), interpolated and negated: out of the rock.
    const g0x = grid[gridIndex(gbx + 1, gby, gbz)] - grid[gridIndex(gbx - 1, gby, gbz)]
    const g0y = grid[gridIndex(gbx, gby + 1, gbz)] - grid[gridIndex(gbx, gby - 1, gbz)]
    const g0z = grid[gridIndex(gbx, gby, gbz + 1)] - grid[gridIndex(gbx, gby, gbz - 1)]
    const ex = gbx + sx
    const ey = gby + sy
    const ez = gbz + sz
    const g1x = grid[gridIndex(ex + 1, ey, ez)] - grid[gridIndex(ex - 1, ey, ez)]
    const g1y = grid[gridIndex(ex, ey + 1, ez)] - grid[gridIndex(ex, ey - 1, ez)]
    const g1z = grid[gridIndex(ex, ey, ez + 1)] - grid[gridIndex(ex, ey, ez - 1)]
    const nx = -(g0x + t * (g1x - g0x))
    const ny = -(g0y + t * (g1y - g0y))
    const nz = -(g0z + t * (g1z - g0z))
    const len = Math.hypot(nx, ny, nz) || 1
    normals.push(nx / len, ny / len, nz / len)

    const vi = vcount++
    edgeMap.set(key, vi)
    return vi
  }

  for (let cz = 0; cz < CHUNK; cz++)
    for (let cy = 0; cy < CHUNK; cy++)
      for (let cx = 0; cx < CHUNK; cx++) {
        let cubeIndex = 0
        for (let i = 0; i < 8; i++) {
          const di = grid[gridIndex(cx + CORNER_X[i] + 1, cy + CORNER_Y[i] + 1, cz + CORNER_Z[i] + 1)]
          d[i] = di
          if (di < 0) cubeIndex |= 1 << i // bit set in WATER (Bourke convention: below isolevel)
        }
        const edges = edgeTable[cubeIndex]
        if (edges === 0) continue

        for (let e = 0; e < 12; e++) {
          if (!(edges & (1 << e))) continue
          eVert[e] = edgeVertex(cx + EDGE_BX[e] + 1, cy + EDGE_BY[e] + 1, cz + EDGE_BZ[e] + 1, EDGE_AXIS[e])
        }

        for (let i = cubeIndex * 16; triTable[i] !== -1; i += 3) {
          indices.push(eVert[triTable[i]], eVert[triTable[i + 1]], eVert[triTable[i + 2]])
        }
      }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  }
}
