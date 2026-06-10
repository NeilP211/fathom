import { describe, it, expect } from 'vitest'
import { noiseLevel, hunterMood, predatorBandFor, HUNTER_TUNING } from '../src/game/threat.js'

describe('noiseLevel', () => {
  it('is 0 when drifting dark and silent, and capped at 1.5', () => {
    expect(noiseLevel({})).toBe(0)
    expect(
      noiseLevel({ speed: 6, maxSpeed: 6, lights: true, engineThrottle: 1, sonarPingAge: 0 }),
    ).toBe(1.5)
  })

  it('rises with each emitter and decays after a sonar ping', () => {
    const quiet = noiseLevel({ speed: 1, maxSpeed: 3 })
    const lit = noiseLevel({ speed: 1, maxSpeed: 3, lights: true })
    const pingFresh = noiseLevel({ sonarPingAge: 0 })
    const pingOld = noiseLevel({ sonarPingAge: 5.9 })
    expect(lit).toBeGreaterThan(quiet)
    expect(pingFresh).toBeGreaterThan(pingOld)
    expect(noiseLevel({ sonarPingAge: 10 })).toBe(0)
  })
})

describe('hunterMood', () => {
  it('moves through dormant, dread, hunting, striking with distance', () => {
    expect(hunterMood(500, 1)).toBe('dormant')
    expect(hunterMood(150, 1)).toBe('dread')
    expect(hunterMood(40, 1)).toBe('hunting')
    expect(hunterMood(5, 1)).toBe('striking')
  })

  it('never strikes a silent player', () => {
    expect(hunterMood(5, 0)).toBe('hunting')
  })
})

describe('predatorBandFor', () => {
  it('escalates with depth', () => {
    expect(predatorBandFor(50).lightResponse).toBe('flee')
    expect(predatorBandFor(200).lightResponse).toBe('attracted')
    expect(predatorBandFor(700).aggression).toBe(1.0)
    expect(predatorBandFor(700).sense).toBeGreaterThan(predatorBandFor(50).sense)
  })
})

describe('tuning sanity', () => {
  it('keeps the dread radius outside the hunt radius', () => {
    expect(HUNTER_TUNING.dreadRadius).toBeGreaterThan(HUNTER_TUNING.huntRadius)
  })
})
