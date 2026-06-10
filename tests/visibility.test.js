import { describe, it, expect } from 'vitest'
import { visibilityAtDepth, fogDensityFor, loadRadiusFor } from '../src/world/visibility.js'

describe('visibility curve', () => {
  it('is 96m at the surface and shrinks monotonically with depth', () => {
    expect(visibilityAtDepth(0)).toBe(96)
    let prev = Infinity
    for (let depth = 0; depth <= 900; depth += 50) {
      const v = visibilityAtDepth(depth)
      expect(v).toBeLessThanOrEqual(prev)
      expect(v).toBeGreaterThan(0)
      prev = v
    }
    expect(visibilityAtDepth(800)).toBeLessThanOrEqual(20)
  })

  it('fog density gives 2% transmittance at the visibility distance', () => {
    // FogExp2 factor is exp(-density * distance); at d = visibility it must be 0.02
    const v = 96
    const density = fogDensityFor(v)
    expect(Math.exp(-density * v)).toBeCloseTo(0.02, 5)
  })

  it('load radius is ceil(visibility / 32) + 1 (spec invariant)', () => {
    expect(loadRadiusFor(96)).toBe(4)
    expect(loadRadiusFor(97)).toBe(5)
    expect(loadRadiusFor(64)).toBe(3)
    expect(loadRadiusFor(20)).toBe(2)
  })
})
