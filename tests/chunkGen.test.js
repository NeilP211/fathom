import { describe, it, expect } from 'vitest'
import { generateChunk } from '../src/world/chunkGen.js'

describe('generateChunk', () => {
  it('is deterministic (byte-identical buffers)', () => {
    const a = generateChunk(777, 0, -2, 0)
    const b = generateChunk(777, 0, -2, 0)
    expect(a.positions.length).toBeGreaterThan(0)
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true)
    expect(Buffer.from(a.normals.buffer).equals(Buffer.from(b.normals.buffer))).toBe(true)
  })

  it('returns empty buffers for all-water chunks (high above the floor)', () => {
    const r = generateChunk(777, 0, 5, 0) // y in [160, 192], far above any terrain
    expect(r.positions.length).toBe(0)
  })

  it('adjacent chunks share identical border vertices', () => {
    const a = generateChunk(777, 0, -2, 0) // x in [0, 32)
    const b = generateChunk(777, 1, -2, 0) // x in [32, 64)
    const onPlane = (res, planeLocalX) => {
      const set = new Set()
      for (let i = 0; i < res.positions.length; i += 3) {
        if (Math.abs(res.positions[i] - planeLocalX) < 1e-4) {
          set.add(`${res.positions[i + 1].toFixed(4)}:${res.positions[i + 2].toFixed(4)}`)
        }
      }
      return set
    }
    const aSet = onPlane(a, 32) // local x = 32 is world x = 32
    const bSet = onPlane(b, 0) // local x = 0 is world x = 32
    expect(aSet.size).toBeGreaterThan(0)
    expect(aSet).toEqual(bSet)
  })
})
