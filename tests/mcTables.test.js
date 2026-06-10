import { describe, it, expect } from 'vitest'
import { edgeTable, triTable } from '../src/world/mcTables.js'

describe('marching cubes tables', () => {
  it('has the canonical sizes', () => {
    expect(edgeTable.length).toBe(256)
    expect(triTable.length).toBe(4096)
  })
  it('has empty configs at both ends', () => {
    expect(edgeTable[0]).toBe(0)
    expect(edgeTable[255]).toBe(0)
    expect(triTable[0]).toBe(-1)
    expect(triTable[4095]).toBe(-1)
  })
})
