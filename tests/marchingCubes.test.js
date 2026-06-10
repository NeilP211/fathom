import { describe, it, expect } from 'vitest'
import { meshChunk, CHUNK, GRID } from '../src/world/marchingCubes.js'

// Build a GRID^3 density grid from an analytic function of LOCAL coords -1..33.
function buildGrid(fn) {
  const grid = new Float32Array(GRID * GRID * GRID)
  let i = 0
  for (let z = -1; z <= CHUNK + 1; z++)
    for (let y = -1; y <= CHUNK + 1; y++)
      for (let x = -1; x <= CHUNK + 1; x++) grid[i++] = fn(x, y, z)
  return grid
}

const sphere = (cx, cy, cz, r) => (x, y, z) =>
  r - Math.hypot(x - cx, y - cy, z - cz) // >0 inside the sphere (solid)

describe('meshChunk', () => {
  it('returns empty output for all-water and all-rock grids', () => {
    const water = meshChunk(buildGrid(() => -1))
    expect(water.positions.length).toBe(0)
    expect(water.indices.length).toBe(0)
    const rock = meshChunk(buildGrid(() => 1))
    expect(rock.positions.length).toBe(0)
    expect(rock.indices.length).toBe(0)
  })

  it('meshes a sphere as indexed triangles with welded vertices near the surface', () => {
    const { positions, normals, indices } = meshChunk(buildGrid(sphere(16, 16, 16, 8)))
    expect(indices.length % 3).toBe(0)
    expect(indices.length / 3).toBeGreaterThan(300) // a sphere of triangles
    expect(normals.length).toBe(positions.length)
    // welding: indexed mesh must have far fewer vertices than 3 per triangle
    expect(positions.length / 3).toBeLessThan(indices.length / 2)
    for (let i = 0; i < positions.length; i += 3) {
      const r = Math.hypot(positions[i] - 16, positions[i + 1] - 16, positions[i + 2] - 16)
      expect(r).toBeGreaterThan(7)
      expect(r).toBeLessThan(9)
    }
    // every index points at a real vertex
    for (const ix of indices) expect(ix).toBeLessThan(positions.length / 3)
  })

  it('normals point out of the rock and triangles wind to face the water', () => {
    const { positions, normals, indices } = meshChunk(buildGrid(sphere(16, 16, 16, 8)))
    let gradDot = 0
    let windDot = 0
    const tris = indices.length / 3
    const px = (vi) => positions[vi * 3]
    const py = (vi) => positions[vi * 3 + 1]
    const pz = (vi) => positions[vi * 3 + 2]
    for (let t = 0; t < tris; t++) {
      const v0 = indices[t * 3]
      const v1 = indices[t * 3 + 1]
      const v2 = indices[t * 3 + 2]
      // outward radial direction at the first vertex
      const rx = px(v0) - 16, ry = py(v0) - 16, rz = pz(v0) - 16
      const rl = Math.hypot(rx, ry, rz)
      gradDot += (normals[v0 * 3] * rx + normals[v0 * 3 + 1] * ry + normals[v0 * 3 + 2] * rz) / rl
      // geometric face normal from winding
      const ax = px(v1) - px(v0), ay = py(v1) - py(v0), az = pz(v1) - pz(v0)
      const bx = px(v2) - px(v0), by = py(v2) - py(v0), bz = pz(v2) - pz(v0)
      const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx
      const fl = Math.hypot(fx, fy, fz) || 1
      windDot += (fx * rx + fy * ry + fz * rz) / (fl * rl)
    }
    expect(gradDot / tris).toBeGreaterThan(0.8) // gradient normals point outward
    expect(windDot / tris).toBeGreaterThan(0.5) // winding agrees (front faces the water)
  })

  it('is deterministic', () => {
    const g = buildGrid(sphere(10, 20, 12, 6))
    const a = meshChunk(g)
    const b = meshChunk(g)
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true)
    expect(Buffer.from(a.normals.buffer).equals(Buffer.from(b.normals.buffer))).toBe(true)
    expect(Buffer.from(a.indices.buffer).equals(Buffer.from(b.indices.buffer))).toBe(true)
  })
})
