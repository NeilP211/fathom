import { describe, it, expect } from 'vitest'
import { StimulusSystem, STIMULUS_SLOTS } from '../src/fx/stimulus.js'

const at = (x, y, z) => ({ x, y, z })

describe('StimulusSystem', () => {
  it('allocates expired slots first and decays transients to expiry', () => {
    const sys = new StimulusSystem()
    sys.push(at(1, 2, 3), -2, 10, 1)
    const slot = sys.slots.find((s) => s.strength !== 0)
    expect(slot).toBeTruthy()
    expect(slot.x).toBe(1)
    for (let i = 0; i < 120; i++) sys.update(1 / 60) // 2s >> 1s ttl
    expect(sys.slots.every((s) => s.strength === 0)).toBe(true)
  })

  it('keeps continuous slots alive through update and clears on demand', () => {
    const sys = new StimulusSystem()
    sys.setContinuous(0, at(5, -10, 5), 0.5, 12)
    for (let i = 0; i < 600; i++) sys.update(1 / 60)
    expect(sys.slots[0].strength).toBe(0.5)
    sys.clearContinuous(0)
    expect(sys.slots[0].strength).toBe(0)
  })

  it('push never steals a continuous slot', () => {
    const sys = new StimulusSystem()
    sys.setContinuous(0, at(0, 0, 0), 0.5, 12)
    for (let i = 0; i < STIMULUS_SLOTS + 3; i++) sys.push(at(i, 0, 0), -1, 5, 2)
    expect(sys.slots[0].continuous).toBe(true)
    expect(sys.slots[0].strength).toBe(0.5)
  })

  it('writeTo packs xyz + strength and radius', () => {
    const sys = new StimulusSystem()
    sys.setContinuous(0, at(7, -8, 9), 0.4, 15)
    const vecs = Array.from({ length: STIMULUS_SLOTS }, () => ({
      set(x, y, z, w) {
        this.x = x; this.y = y; this.z = z; this.w = w
      },
    }))
    const radii = Array.from({ length: STIMULUS_SLOTS }, () => ({
      set(x, y, z, w) {
        this.x = x; this.y = y; this.z = z; this.w = w
      },
    }))
    sys.writeTo(vecs, radii)
    expect(vecs[0]).toMatchObject({ x: 7, y: -8, z: 9, w: 0.4 })
    expect(radii[0].x).toBe(15)
    expect(vecs[1].w).toBe(0)
  })
})
