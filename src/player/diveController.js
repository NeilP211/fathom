import { stepMovement } from './movement.js'

const MOUSE_SENSITIVITY = 0.0022
const PITCH_LIMIT = 1.55 // radians, just short of straight up/down

export class DiveController {
  constructor(camera, canvas, density, spawn = { x: 0, y: -8, z: 0 }, settings = null) {
    this.camera = camera
    this.density = density
    this.settings = settings
    this.state = {
      pos: { ...spawn },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
    }
    this.keys = new Set()
    this.maxSpeed = 3 // scaled by gear from game state (fins)
    this.frozen = false // death/PDA freeze

    canvas.addEventListener('click', () => canvas.requestPointerLock())
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return
      const ySign = this.settings?.invertY ? -1 : 1
      this.state.yaw -= e.movementX * MOUSE_SENSITIVITY
      this.state.pitch -= e.movementY * MOUSE_SENSITIVITY * ySign
      this.state.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.state.pitch))
    })
    document.addEventListener('keydown', (e) => this.keys.add(e.code))
    document.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
  }

  get locked() {
    return document.pointerLockElement != null
  }

  update(dt) {
    const k = this.keys
    const input = {
      forward: (k.has('KeyW') ? 1 : 0) + (k.has('KeyS') ? -1 : 0),
      strafe: (k.has('KeyD') ? 1 : 0) + (k.has('KeyA') ? -1 : 0),
      up:
        (k.has('Space') ? 1 : 0) +
        (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyC') ? -1 : 0),
    }
    if (!this.locked || this.frozen) {
      input.forward = 0
      input.strafe = 0
      input.up = 0
    }
    stepMovement(this.state, input, dt, this.density, this.maxSpeed)
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.y = this.state.yaw
    this.camera.rotation.x = this.state.pitch
    this.camera.position.set(this.state.pos.x, this.state.pos.y, this.state.pos.z)
  }
}
