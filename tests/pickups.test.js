import { describe, it, expect } from 'vitest'
import { nodesForColumn } from '../src/game/pickups.js'
import { siteDefs } from '../src/game/sites.js'
import { createDensityField } from '../src/world/density.js'
import { anchorsForSeed } from '../src/world/anchors.js'

const seed = 777
const density = createDensityField(seed)
const ops = anchorsForSeed(seed, density)

describe('nodesForColumn', () => {
  it('is deterministic and sits just above the floor', () => {
    const a = nodesForColumn(seed, density, ops, 2, 3)
    expect(a).toEqual(nodesForColumn(seed, density, ops, 2, 3))
    for (const n of a) {
      expect(n.y).toBeGreaterThan(density.floorY(n.x, n.z))
      expect(n.y - density.floorY(n.x, n.z)).toBeLessThan(0.5)
      expect(n.id).toMatch(/^n:2:3:/)
    }
  })

  it('varies between columns', () => {
    expect(nodesForColumn(seed, density, ops, 2, 3)).not.toEqual(
      nodesForColumn(seed, density, ops, 3, 3),
    )
  })
})

describe('siteDefs', () => {
  it('is deterministic with stable entity ids and the right loot', () => {
    const a = siteDefs(seed, density)
    expect(a).toEqual(siteDefs(seed, density))
    expect(a.map((s) => s.id)).toEqual(['sig1', 'sig2'])
    const sig1 = a[0]
    expect(sig1.entities.filter((e) => e.kind === 'fragment').length).toBe(4)
    expect(sig1.entities.find((e) => e.kind === 'log').logId).toBe('log-sig1')
    expect(Math.hypot(sig1.x, sig1.z)).toBeCloseTo(230, 0)
  })
})
