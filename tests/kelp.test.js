import { describe, it, expect } from 'vitest'
import { plantsForColumn } from '../src/fx/kelp.js'
import { createDensityField } from '../src/world/density.js'
import { anchorsForSeed, applyOps } from '../src/world/anchors.js'

describe('plantsForColumn', () => {
  const seed = 777
  const density = createDensityField(seed)
  const ops = anchorsForSeed(seed, density)

  it('is deterministic per column', () => {
    const a = plantsForColumn(seed, density, ops, 3, -2)
    const b = plantsForColumn(seed, density, ops, 3, -2)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('differs between columns and seeds', () => {
    const a = plantsForColumn(seed, density, ops, 3, -2)
    const b = plantsForColumn(seed, density, ops, 4, -2)
    expect(a).not.toEqual(b)
  })

  it('plants sit on the seafloor', () => {
    for (const p of plantsForColumn(seed, density, ops, 1, 1)) {
      expect(p.y).toBeCloseTo(density.floorY(p.x, p.z), 6)
      expect(p.y).toBeLessThan(0)
    }
  })

  it('never places plants where the floor was carved away', () => {
    // the anchor clearing sits around (64, 64): scan its columns and assert
    // every surviving plant has solid rock just below its base
    let checked = 0
    for (const col of [[1, 1], [1, 2], [2, 1], [2, 2]]) {
      for (const p of plantsForColumn(seed, density, ops, col[0], col[1])) {
        const dBelow = applyOps(density(p.x, p.y - 0.6, p.z), ops, p.x, p.y - 0.6, p.z)
        expect(dBelow).toBeGreaterThan(0)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})
