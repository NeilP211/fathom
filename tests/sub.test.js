import { describe, it, expect } from 'vitest'
import { createSubState, tickSub, subMaxSpeed, subCrushDepth, SUB_TUNING } from '../src/game/sub.js'

const built = () => {
  const s = createSubState()
  s.built = true
  return s
}

describe('sub power', () => {
  it('drains with throttle and lights, limps when dead', () => {
    const s = built()
    s.lights = true
    tickSub(s, { depth: 50, throttle: 1, atBuoy: false }, 10)
    expect(s.power).toBeCloseTo(100 - (SUB_TUNING.drainMoving + SUB_TUNING.drainLights) * 10, 5)
    expect(subMaxSpeed(s)).toBe(SUB_TUNING.maxSpeed)
    s.power = 0
    expect(subMaxSpeed(s)).toBe(SUB_TUNING.limpSpeed)
  })

  it('solar-trickles above 20m and fast-charges at the buoy', () => {
    const s = built()
    s.power = 50
    tickSub(s, { depth: 10, throttle: 0, atBuoy: false }, 5)
    expect(s.power).toBeCloseTo(60, 5)
    tickSub(s, { depth: 10, throttle: 0, atBuoy: true }, 5)
    expect(s.power).toBeCloseTo(100, 5)
    tickSub(s, { depth: 100, throttle: 0, atBuoy: false }, 5)
    expect(s.power).toBe(100) // no recharge deep
  })
})

describe('sub hull', () => {
  it('warns in the stress band, damages past crush depth, destroys at zero', () => {
    const s = built()
    expect(subCrushDepth(s)).toBe(300)
    expect(tickSub(s, { depth: 285, throttle: 0, atBuoy: false }, 1)).toContain('hull-stress')
    expect(s.hull).toBe(100)
    const ev = tickSub(s, { depth: 320, throttle: 0, atBuoy: false }, 2)
    expect(ev).toContain('crush-damage')
    expect(s.hull).toBeCloseTo(90, 5)
    const all = []
    for (let i = 0; i < 30; i++) all.push(...tickSub(s, { depth: 320, throttle: 0, atBuoy: false }, 1))
    expect(all).toContain('sub-destroyed')
    expect(s.hull).toBe(0)
  })

  it('is safe above the warning band', () => {
    const s = built()
    expect(tickSub(s, { depth: 200, throttle: 0, atBuoy: false }, 1)).toEqual([])
  })
})
