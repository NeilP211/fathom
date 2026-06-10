import { stepMovement } from './movement.js'
import { SUB_TUNING, subMaxSpeed } from '../game/sub.js'

const MOUSE_SENSITIVITY = 0.0016 // heavier than the diver
const PITCH_LIMIT = 0.6 // the hull does not somersault

// Pilots like a heavier, faster diver (spec section 5 controls): same key
// scheme, mouse steers the hull, camera locked to the cockpit.
export class SubController {
  constructor(camera, canvas, density, subState) {
    this.camera = camera
    this.canvas = canvas
    this.density = density
    this.sub = subState
    this.active = false
    this.throttle = 0
    this.state = {
      pos: { x: subState.x, y: subState.y, z: subState.z },
      vel: { x: 0, y: 0, z: 0 },
      yaw: subState.yaw,
      pitch: 0,
    }
    this.keys = new Set()

    document.addEventListener('mousemove', (e) => {
      if (!this.active || document.pointerLockElement !== canvas) return
      this.state.yaw -= e.movementX * MOUSE_SENSITIVITY
      this.state.pitch -= e.movementY * MOUSE_SENSITIVITY
      this.state.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.state.pitch))
    })
    document.addEventListener('keydown', (e) => this.keys.add(e.code))
    document.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
  }

  enter(diverPos) {
    this.active = true
    this.state.pos = { x: this.sub.x, y: this.sub.y, z: this.sub.z }
    this.state.vel = { x: 0, y: 0, z: 0 }
    this.state.yaw = this.sub.yaw
    this.state.pitch = 0
    this.entryPoint = { ...diverPos }
  }

  exit() {
    this.active = false
    this.throttle = 0
    // hatch position: just above and beside the hull
    return {
      x: this.state.pos.x + Math.cos(this.state.yaw) * 2.2,
      y: this.state.pos.y + 1.2,
      z: this.state.pos.z - Math.sin(this.state.yaw) * 2.2,
    }
  }

  update(dt) {
    if (!this.active) return
    const k = this.keys
    const input = {
      forward: (k.has('KeyW') ? 1 : 0) + (k.has('KeyS') ? -1 : 0),
      strafe: (k.has('KeyD') ? 1 : 0) + (k.has('KeyA') ? -1 : 0),
      up:
        (k.has('Space') ? 1 : 0) +
        (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyC') ? -1 : 0),
    }
    if (document.pointerLockElement !== this.canvas) {
      input.forward = 0
      input.strafe = 0
      input.up = 0
    }
    this.throttle = Math.min(1, Math.hypot(input.forward, input.strafe, input.up))
    stepMovement(this.state, input, dt, this.density, subMaxSpeed(this.sub), SUB_TUNING.radius)

    // write pose back into the persistent sub state
    this.sub.x = this.state.pos.x
    this.sub.y = this.state.pos.y
    this.sub.z = this.state.pos.z
    this.sub.yaw = this.state.yaw

    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.y = this.state.yaw
    this.camera.rotation.x = this.state.pitch
    // cockpit eye point: slightly up and forward in the nose
    this.camera.position.set(
      this.state.pos.x - Math.sin(this.state.yaw) * 0.9,
      this.state.pos.y + 0.35,
      this.state.pos.z - Math.cos(this.state.yaw) * 0.9,
    )
  }
}
