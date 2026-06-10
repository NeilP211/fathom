import { describe, it, expect } from 'vitest'
import { createDensityField } from '../src/world/density.js'

describe('density field', () => {
  it('is deterministic for the same seed', () => {
    const a = createDensityField(1234)
    const b = createDensityField(1234)
    for (let i = 0; i < 200; i++) {
      const x = (i * 37) % 500 - 250
      const y = -((i * 13) % 120)
      const z = (i * 91) % 500 - 250
      expect(a(x, y, z)).toBe(b(x, y, z))
    }
  })

  it('differs between seeds', () => {
    const a = createDensityField(1)
    const b = createDensityField(2)
    let differing = 0
    for (let i = 0; i < 50; i++) {
      if (a(i * 10, -40, i * 7) !== b(i * 10, -40, i * 7)) differing++
    }
    expect(differing).toBeGreaterThan(40)
  })

  it('is water at the surface and rock far below the shelf floor', () => {
    for (const seed of [1, 42, 999]) {
      const d = createDensityField(seed)
      for (const [x, z] of [[0, 0], [100, -50], [-150, 120]]) {
        expect(d(x, 0, z)).toBeLessThan(0) // surface is always water
        expect(d(x, -120, z)).toBeGreaterThan(0) // shelf: 120m down is inside rock
      }
    }
  })

  it('descends from the shelf to an abyssal plain (M7)', () => {
    const d = createDensityField(777)
    expect(d.descentAt(100)).toBe(0) // the Shelf holds
    expect(d.descentAt(250)).toBe(0)
    let prev = 0
    for (let r = 250; r <= 1600; r += 50) {
      const v = d.descentAt(r)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
    expect(d.descentAt(1500)).toBe(780)
    // the floor at 1400m out is in Floor-band depth
    expect(d.floorY(1400, 0)).toBeLessThan(-600)
    // and still water above it, rock below it
    expect(d(1400, -200, 0)).toBeLessThan(0)
    expect(d(1400, -900, 0)).toBeGreaterThan(0)
  })
})
