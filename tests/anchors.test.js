import { describe, it, expect } from 'vitest'
import { sdBox, applyOps, anchorsForSeed, opsForChunk } from '../src/world/anchors.js'
import { createDensityField } from '../src/world/density.js'
import { generateChunk } from '../src/world/chunkGen.js'

describe('sdBox', () => {
  it('is negative inside, positive outside, ~distance when far', () => {
    expect(sdBox(0, 0, 0, 0, 0, 0, 2, 2, 2)).toBe(-2)
    expect(sdBox(1.5, 0, 0, 0, 0, 0, 2, 2, 2)).toBeLessThan(0)
    expect(sdBox(12, 0, 0, 0, 0, 0, 2, 2, 2)).toBeCloseTo(10, 5)
  })
})

describe('applyOps', () => {
  const carve = [{ type: 'carve', center: [0, 0, 0], half: [5, 5, 5] }]
  const add = [{ type: 'add', center: [0, 0, 0], half: [5, 5, 5] }]

  it('carve turns solid rock to water inside the shape', () => {
    expect(applyOps(20, carve, 0, 0, 0)).toBeLessThan(0)
    expect(applyOps(20, carve, 100, 0, 0)).toBe(20) // far away untouched
  })

  it('add turns water to solid inside the shape', () => {
    expect(applyOps(-20, add, 0, 0, 0)).toBeGreaterThan(0)
    expect(applyOps(-20, add, 100, 0, 0)).toBe(-20)
  })
})

describe('anchor site in the world', () => {
  const seed = 777
  const density = createDensityField(seed)
  const ops = anchorsForSeed(seed, density)

  it('is deterministic for a seed', () => {
    expect(anchorsForSeed(seed, createDensityField(seed))).toEqual(ops)
  })

  it('carves a clearing and adds solid debris at the site', () => {
    const fy = density.floorY(64, 64)
    // mid-clearing, a few meters above the floor: must be water even though
    // debris sits below
    const dCarved = applyOps(density(64, fy + 8, 64), ops, 64, fy + 8, 64)
    expect(dCarved).toBeLessThan(0)
    // inside the hull-section debris box: solid
    const dDebris = applyOps(density(64 - 5, fy - 0.6, 64 + 3), ops, 64 - 5, fy - 0.6, 64 + 3)
    expect(dDebris).toBeGreaterThan(0)
  })

  it('opsForChunk excludes chunks far from the site', () => {
    expect(opsForChunk(ops, 2, -2, 2, 32).length).toBeGreaterThan(0)
    expect(opsForChunk(ops, 50, -2, 50, 32).length).toBe(0)
  })

  it('keeps adjacent chunk borders crack-free across the site', () => {
    const a = generateChunk(seed, 1, -2, 2) // x in [32, 64)
    const b = generateChunk(seed, 2, -2, 2) // x in [64, 96): contains the site
    const onPlane = (res, planeLocalX) => {
      const set = new Set()
      for (let i = 0; i < res.positions.length; i += 3) {
        if (Math.abs(res.positions[i] - planeLocalX) < 1e-4) {
          set.add(`${res.positions[i + 1].toFixed(4)}:${res.positions[i + 2].toFixed(4)}`)
        }
      }
      return set
    }
    const aSet = onPlane(a, 32)
    const bSet = onPlane(b, 0)
    expect(aSet.size).toBeGreaterThan(0)
    expect(aSet).toEqual(bSet)
  })

  it('generateChunk stays deterministic with anchors applied', () => {
    const a = generateChunk(seed, 2, -2, 2)
    const b = generateChunk(seed, 2, -2, 2)
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true)
    expect(Buffer.from(a.indices.buffer).equals(Buffer.from(b.indices.buffer))).toBe(true)
  })
})
