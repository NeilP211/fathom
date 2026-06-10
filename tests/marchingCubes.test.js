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
    expect(meshChunk(buildGrid(() => -1)).positions.length).toBe(0)
    expect(meshChunk(buildGrid(() => 1)).positions.length).toBe(0)
  })

  it('meshes a sphere with vertices near the surface', () => {
    const { positions, normals } = meshChunk(buildGrid(sphere(16, 16, 16, 8)))
    expect(positions.length).toBeGreaterThan(900) // a sphere of triangles
    expect(positions.length % 9).toBe(0) // whole triangles, non-indexed
    expect(normals.length).toBe(positions.length)
    for (let i = 0; i < positions.length; i += 3) {
      const r = Math.hypot(positions[i] - 16, positions[i + 1] - 16, positions[i + 2] - 16)
      expect(r).toBeGreaterThan(7)
      expect(r).toBeLessThan(9)
    }
  })

  it('normals point out of the rock and triangles wind to face the water', () => {
    const { positions, normals } = meshChunk(buildGrid(sphere(16, 16, 16, 8)))
    let gradDot = 0
    let windDot = 0
    const tris = positions.length / 9
    for (let t = 0; t < tris; t++) {
      const o = t * 9
      // outward radial direction at the first vertex
      const rx = positions[o] - 16, ry = positions[o + 1] - 16, rz = positions[o + 2] - 16
      const rl = Math.hypot(rx, ry, rz)
      gradDot += (normals[o] * rx + normals[o + 1] * ry + normals[o + 2] * rz) / rl
      // geometric face normal from winding
      const ax = positions[o + 3] - positions[o], ay = positions[o + 4] - positions[o + 1], az = positions[o + 5] - positions[o + 2]
      const bx = positions[o + 6] - positions[o], by = positions[o + 7] - positions[o + 1], bz = positions[o + 8] - positions[o + 2]
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
  })
})
