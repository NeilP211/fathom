export const MAX_SPEED = 3 // m/s, diver (spec section 4)
export const MAX_VERTICAL_SPEED = 2.4 // m/s, slightly below horizontal (spec section 4)
export const ACCEL = 12 // m/s^2
export const DRAG = 2.2 // 1/s, exponential
export const SINK_SPEED = 0.25 // m/s, mild negative buoyancy when idle
export const PLAYER_RADIUS = 0.6 // meters

// Push pos out of solid terrain (density > 0 is rock). Density approximates
// meters near the surface, so (d + radius) is the penetration estimate.
export function resolveCollision(density, pos, radius = PLAYER_RADIUS) {
  for (let i = 0; i < 4; i++) {
    const d = density(pos.x, pos.y, pos.z)
    if (d <= -radius) return // comfortably in water
    const eps = 0.5
    const gx = density(pos.x + eps, pos.y, pos.z) - density(pos.x - eps, pos.y, pos.z)
    const gy = density(pos.x, pos.y + eps, pos.z) - density(pos.x, pos.y - eps, pos.z)
    const gz = density(pos.x, pos.y, pos.z + eps) - density(pos.x, pos.y, pos.z - eps)
    const len = Math.hypot(gx, gy, gz) || 1
    const push = (d + radius) * 0.6 // damped gradient step (gradient points INTO rock)
    pos.x -= (gx / len) * push
    pos.y -= (gy / len) * push
    pos.z -= (gz / len) * push
  }
}

// state: { pos, vel, yaw, pitch }; input: { forward, strafe, up } each in [-1, 1].
// maxSpeed scales with gear (fins multiply it; spec section 5 crafting).
// radius: collision capsule (diver 0.6m, sub 1.6m).
export function stepMovement(state, input, dt, density, maxSpeed = MAX_SPEED, radius = PLAYER_RADIUS) {
  // Look-relative movement basis (yaw only; pitch applies to forward's y).
  const sy = Math.sin(state.yaw)
  const cy = Math.cos(state.yaw)
  const sp = Math.sin(state.pitch)
  const cp = Math.cos(state.pitch)

  // forward at yaw 0, pitch 0 is (0, 0, -1); pitching up tilts it upward
  const fx = -sy * cp
  const fy = sp
  const fz = -cy * cp
  // strafe right is (cos yaw, 0, -sin yaw)
  const rx = cy
  const rz = -sy

  let ax = fx * input.forward + rx * input.strafe
  let ay = fy * input.forward + input.up
  let az = fz * input.forward + rz * input.strafe
  const alen = Math.hypot(ax, ay, az)
  if (alen > 1) {
    ax /= alen
    ay /= alen
    az /= alen
  }

  state.vel.x += ax * ACCEL * dt
  state.vel.y += ay * ACCEL * dt
  state.vel.z += az * ACCEL * dt

  // Exponential drag.
  const drag = Math.exp(-DRAG * dt)
  state.vel.x *= drag
  state.vel.y *= drag
  state.vel.z *= drag

  // Mild negative buoyancy when there is no vertical input.
  if (input.up === 0 && alen === 0) {
    state.vel.y += (-SINK_SPEED - state.vel.y) * Math.min(1, dt * 2) * 0.5
  }

  // Speed cap.
  const speed = Math.hypot(state.vel.x, state.vel.y, state.vel.z)
  if (speed > maxSpeed) {
    const s = maxSpeed / speed
    state.vel.x *= s
    state.vel.y *= s
    state.vel.z *= s
  }
  // Vertical cap: ascending/descending is slightly slower than swimming
  // horizontally (spec section 4 movement model).
  const maxVert = maxSpeed * (MAX_VERTICAL_SPEED / MAX_SPEED)
  if (state.vel.y > maxVert) state.vel.y = maxVert
  else if (state.vel.y < -maxVert) state.vel.y = -maxVert

  state.pos.x += state.vel.x * dt
  state.pos.y += state.vel.y * dt
  state.pos.z += state.vel.z * dt

  // Never above the surface (spec: camera permanently clamped underwater).
  if (state.pos.y > -1.2) {
    state.pos.y = -1.2
    if (state.vel.y > 0) state.vel.y = 0
  }

  resolveCollision(density, state.pos, radius)
}
