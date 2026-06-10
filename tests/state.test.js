import { describe, it, expect } from 'vitest'
import {
  createState,
  tick,
  addItem,
  canCraft,
  craft,
  scanFragment,
  recoverLog,
  signalsToFire,
  markSignalFired,
  serialize,
  deserialize,
  suitRating,
  TUNING,
} from '../src/game/state.js'

const swim = { depth: 10, refilling: false, moving: false }

describe('oxygen and death', () => {
  it('drains oxygen, blacks out at zero, then dies after the grace window', () => {
    const s = createState()
    const events = []
    for (let t = 0; t < 60; t += 0.1) events.push(...tick(s, swim, 0.1))
    expect(events).toContain('blackout-start')
    expect(events).toContain('death')
    expect(s.dead).toBe(true)
  })

  it('refills at the surface and clears blackout', () => {
    const s = createState()
    s.oxygen = 0.5
    tick(s, swim, 0.4)
    tick(s, swim, 0.2) // hits zero, blackout starts
    expect(s.blackout).toBeGreaterThan(0)
    for (let i = 0; i < 30; i++) tick(s, { ...swim, refilling: true }, 0.1)
    expect(s.oxygen).toBeGreaterThan(40)
    expect(s.blackout).toBe(0)
    expect(s.dead).toBe(false)
  })

  it('moving drains faster', () => {
    const a = createState()
    const b = createState()
    tick(a, { ...swim, moving: true }, 10)
    tick(b, swim, 10)
    expect(a.oxygen).toBeLessThan(b.oxygen)
  })
})

describe('pressure', () => {
  it('damages below suit rating and kills at zero health', () => {
    const s = createState()
    expect(suitRating(s)).toBe(100)
    const events = tick(s, { depth: 150, refilling: false, moving: false }, 1)
    expect(events).toContain('pressure-damage')
    expect(s.health).toBeLessThan(TUNING.healthMax)
    const all = []
    for (let i = 0; i < 60; i++) all.push(...tick(s, { depth: 150, refilling: true }, 1))
    expect(all).toContain('death')
  })

  it('suit tier 2 raises the rating to 200m', () => {
    const s = createState()
    s.suitTier = 2
    expect(suitRating(s)).toBe(200)
    const events = tick(s, { depth: 150, refilling: true, moving: false }, 1)
    expect(events).not.toContain('pressure-damage')
  })
})

describe('crafting', () => {
  it('crafts the scanner from the start with enough scrap', () => {
    const s = createState()
    expect(canCraft(s, 'scanner')).toBe(false)
    addItem(s, 'scrap', 2)
    expect(canCraft(s, 'scanner')).toBe(true)
    expect(craft(s, 'scanner')).toBe(true)
    expect(s.inventory.scrap).toBe(0)
    expect(s.flags.firstCraft).toBe(true)
    expect(canCraft(s, 'scanner')).toBe(false) // no recrafting
  })

  it('fragment-gated recipes need scans first, and effects apply', () => {
    const s = createState()
    addItem(s, 'scrap', 10)
    expect(canCraft(s, 'o2tank2')).toBe(false)
    expect(scanFragment(s, 'o2tank2')).toBe('progress')
    expect(scanFragment(s, 'o2tank2')).toBe('unlocked')
    expect(canCraft(s, 'o2tank2')).toBe(true)
    craft(s, 'o2tank2')
    expect(s.oxygenMax).toBe(90)
  })
})

describe('signals', () => {
  it('fires the chain: first craft, then each recovered log', () => {
    const s = createState()
    expect(signalsToFire(s)).toEqual([])
    s.flags.firstCraft = true
    let fire = signalsToFire(s)
    expect(fire.map((x) => x.id)).toEqual(['sig1'])
    markSignalFired(s, 'sig1')
    expect(signalsToFire(s)).toEqual([])
    recoverLog(s, 'log-sig1')
    fire = signalsToFire(s)
    expect(fire.map((x) => x.id)).toEqual(['sig2'])
  })
})

describe('persistence', () => {
  it('serialize/deserialize roundtrips and re-applies craft effects', () => {
    const s = createState()
    addItem(s, 'scrap', 8)
    scanFragment(s, 'fins')
    scanFragment(s, 'fins')
    craft(s, 'fins')
    recoverLog(s, 'log-sig1')
    const restored = deserialize(serialize(s))
    expect(restored.speedMult).toBeCloseTo(1.3)
    expect(restored.logs).toEqual(['log-sig1'])
    expect(restored.inventory.scrap).toBe(5)
  })
})
