import { describe, it, expect } from 'vitest'
import { computeWantedChunks, chunkKey } from '../src/world/chunkManager.js'

describe('computeWantedChunks', () => {
  it('returns a sphere-clipped, vertically clamped set sorted nearest-first', () => {
    const wanted = computeWantedChunks({ cx: 0, cy: -2, cz: 0 }, 4)
    const keys = new Set(wanted.map((w) => w.key))
    expect(keys.has(chunkKey(0, -2, 0))).toBe(true)
    for (const w of wanted) {
      const dx = w.cx - 0, dy = w.cy + 2, dz = w.cz - 0
      expect(dx * dx + dy * dy + dz * dz).toBeLessThanOrEqual(16) // sphere clip r=4
      expect(Math.abs(dy)).toBeLessThanOrEqual(3) // vertical clamp (spec section 4)
    }
    // sorted nearest-first
    for (let i = 1; i < wanted.length; i++) {
      expect(wanted[i].d2).toBeGreaterThanOrEqual(wanted[i - 1].d2)
    }
    // radius-4 sphere with |dy|<=3 has between 150 and 300 cells (spec budget)
    expect(wanted.length).toBeGreaterThan(150)
    expect(wanted.length).toBeLessThan(300)
  })

  it('is centered on the given chunk', () => {
    const wanted = computeWantedChunks({ cx: 10, cy: -1, cz: -7 }, 2)
    expect(wanted[0]).toMatchObject({ cx: 10, cy: -1, cz: -7, d2: 0 })
  })
})
