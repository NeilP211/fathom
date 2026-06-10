import { describe, it, expect } from 'vitest'
import { stepMovement, resolveCollision } from '../src/player/movement.js'

const openWater = () => -10 // density: water everywhere
// Solid floor at y = -5: density = (-5) - y, so y < -5 is rock
const flatFloor = (x, y, z) => -5 - y

describe('stepMovement', () => {
  it('accelerates toward input and respects the speed cap', () => {
    const state = { pos: { x: 0, y: -2, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 }
    for (let i = 0; i < 600; i++) stepMovement(state, { forward: 1, strafe: 0, up: 0 }, 1 / 60, openWater)
    const speed = Math.hypot(state.vel.x, state.vel.y, state.vel.z)
    expect(speed).toBeGreaterThan(2.0)
    expect(speed).toBeLessThanOrEqual(3.05) // MAX_SPEED 3 + tolerance
    expect(state.pos.z).toBeLessThan(0) // yaw 0 looks down -z, so forward is -z
  })

  it('drag brings the diver to rest and idle sinking pulls gently down', () => {
    const state = { pos: { x: 0, y: -2, z: 0 }, vel: { x: 3, y: 0, z: 0 }, yaw: 0, pitch: 0 }
    for (let i = 0; i < 600; i++) stepMovement(state, { forward: 0, strafe: 0, up: 0 }, 1 / 60, openWater)
    expect(Math.hypot(state.vel.x, 0, state.vel.z)).toBeLessThan(0.1)
    expect(state.vel.y).toBeLessThan(0) // mild negative buoyancy (spec section 4)
    expect(state.vel.y).toBeGreaterThan(-1)
  })

  it('caps vertical speed below horizontal max', () => {
    const state = { pos: { x: 0, y: -50, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 }
    for (let i = 0; i < 600; i++) stepMovement(state, { forward: 0, strafe: 0, up: 1 }, 1 / 60, openWater)
    expect(state.vel.y).toBeGreaterThan(2.0)
    expect(state.vel.y).toBeLessThanOrEqual(2.45) // MAX_VERTICAL_SPEED 2.4 + tolerance
  })

  it('collision keeps the diver out of the floor', () => {
    const state = { pos: { x: 0, y: -4.5, z: 0 }, vel: { x: 0, y: -5, z: 0 }, yaw: 0, pitch: 0 }
    for (let i = 0; i < 300; i++) stepMovement(state, { forward: 0, strafe: 0, up: -1 }, 1 / 60, flatFloor)
    // Floor surface is y = -5; diver radius 0.6 must hold the camera above it
    expect(state.pos.y).toBeGreaterThan(-5.0)
  })
})

describe('resolveCollision', () => {
  it('pushes a point out of solid rock along the gradient', () => {
    const pos = { x: 0, y: -6, z: 0 } // 1m inside the floor
    resolveCollision(flatFloor, pos, 0.6)
    expect(pos.y).toBeGreaterThan(-4.6) // outside, with the radius margin
  })

  it('leaves open-water positions alone', () => {
    const pos = { x: 1, y: -2, z: 3 }
    resolveCollision(openWater, pos, 0.6)
    expect(pos).toEqual({ x: 1, y: -2, z: 3 })
  })
})
