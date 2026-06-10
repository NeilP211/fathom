import { describe, it, expect } from 'vitest'
import { colorAtDepth, lightFalloff } from '../src/world/waterColor.js'

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

describe('colorAtDepth', () => {
  it('matches the surface and abyss stops', () => {
    const surface = colorAtDepth(0)
    expect(surface[0]).toBeCloseTo(0x0a / 255, 3)
    expect(surface[1]).toBeCloseTo(0x4d / 255, 3)
    expect(surface[2]).toBeCloseTo(0x66 / 255, 3)
    const abyss = colorAtDepth(900) // clamped past the last stop
    expect(abyss[0]).toBeCloseTo(0x00 / 255, 3)
    expect(abyss[1]).toBeCloseTo(0x02 / 255, 3)
    expect(abyss[2]).toBeCloseTo(0x04 / 255, 3)
  })

  it('gets monotonically darker with depth', () => {
    let prev = Infinity
    for (let d = 0; d <= 900; d += 25) {
      const lum = luminance(colorAtDepth(d))
      expect(lum).toBeLessThanOrEqual(prev + 1e-9)
      prev = lum
    }
  })
})

describe('lightFalloff', () => {
  it('is 1 at the surface, decays, and floors at 0.02', () => {
    expect(lightFalloff(0)).toBe(1)
    expect(lightFalloff(90)).toBeCloseTo(Math.exp(-1), 5)
    expect(lightFalloff(800)).toBe(0.02)
    let prev = 2
    for (let d = 0; d <= 900; d += 50) {
      const f = lightFalloff(d)
      expect(f).toBeLessThanOrEqual(prev)
      expect(f).toBeGreaterThanOrEqual(0.02)
      prev = f
    }
  })
})
