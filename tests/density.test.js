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

  it('is water at the surface and rock far below the floor', () => {
    for (const seed of [1, 42, 999]) {
      const d = createDensityField(seed)
      for (const [x, z] of [[0, 0], [100, -50], [-300, 220]]) {
        expect(d(x, 0, z)).toBeLessThan(0) // surface is always water
        expect(d(x, -120, z)).toBeGreaterThan(0) // 120m down is always inside rock
      }
    }
  })
})
