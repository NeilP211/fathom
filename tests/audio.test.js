import { describe, it, expect } from 'vitest'
import { cutoffForDepth } from '../src/engine/audio.js'

describe('cutoffForDepth', () => {
  it('is 18kHz at the surface and ~500Hz at 800m and below', () => {
    expect(cutoffForDepth(0)).toBeCloseTo(18000, 0)
    expect(cutoffForDepth(800)).toBeCloseTo(500, 0)
    expect(cutoffForDepth(1200)).toBeCloseTo(500, 0) // clamped
  })

  it('decreases monotonically with depth', () => {
    let prev = Infinity
    for (let d = 0; d <= 900; d += 30) {
      const f = cutoffForDepth(d)
      expect(f).toBeLessThanOrEqual(prev)
      expect(f).toBeGreaterThan(0)
      prev = f
    }
  })
})
