import * as THREE from 'three/webgpu'
import { Fn, uniform, positionLocal, vec3 } from 'three/tsl'
import alea from 'alea'
import { createFishGeometry } from '../fx/fishGeometry.js'
import { noiseLevel, hunterMood, predatorBandFor, HUNTER_TUNING } from './threat.js'

// CPU creatures (spec section 5): the predator archetype and the Hunter.
// Meshes are scaled dark fish silhouettes with a procedural tail wave; no
// skeletons anywhere (spec assets rule). Steering samples the density field.

function makeCreatureMesh(scale, tint, uTime, phaseOffset) {
  const material = new THREE.MeshBasicNodeMaterial()
  const uPhase = uniform(phaseOffset)
  material.positionNode = Fn(() => {
    const local = positionLocal.toVar()
    const tailMask = positionLocal.z.negate().add(0.1).max(0)
    local.x.addAssign(uTime.mul(5).add(uPhase).add(positionLocal.z.mul(2.0)).sin().mul(tailMask).mul(0.16))
    return local
  })()
  const c = new THREE.Color(tint)
  material.colorNode = vec3(c.r, c.g, c.b)
  const mesh = new THREE.Mesh(createFishGeometry(), material)
  mesh.scale.setScalar(scale)
  mesh.frustumCulled = false
  return mesh
}

// Steer around terrain: if the water ahead is rock, push up and away.
function terrainAvoid(density, pos, dir, lookahead = 5) {
  const ax = pos.x + dir.x * lookahead
  const ay = pos.y + dir.y * lookahead
  const az = pos.z + dir.z * lookahead
  if (density(ax, ay, az) > -1.5) {
    dir.y += 0.6
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1
    dir.x /= len
    dir.y /= len
    dir.z /= len
  }
}

export class Predator {
  constructor(seed, index, density, uTime) {
    this.density = density
    this.rng = alea(`${seed}:predator:${index}`)
    this.state = 'patrol'
    this.cooldown = 0
    this.band = predatorBandFor(20)
    this.mesh = makeCreatureMesh(this.band.scale, this.band.tint, uTime, this.rng() * 20)
    this.pos = { x: 0, y: -25, z: 0 }
    this.vel = { x: 0, y: 0, z: 0 }
    this.waypoint = null
    this.respawn({ x: 0, y: -20, z: 0 })
  }

  respawn(playerPos) {
    const a = this.rng() * Math.PI * 2
    const r = 45 + this.rng() * 50
    this.pos = {
      x: playerPos.x + Math.cos(a) * r,
      y: Math.min(-10, playerPos.y + (this.rng() - 0.5) * 18),
      z: playerPos.z + Math.sin(a) * r,
    }
    this.state = 'patrol'
    this.waypoint = null
  }

  update(dt, player, env, events) {
    const depth = -player.pos.y
    this.band = predatorBandFor(depth)
    this.mesh.scale.setScalar(this.band.scale)

    const dx = player.pos.x - this.pos.x
    const dy = player.pos.y - this.pos.y
    const dz = player.pos.z - this.pos.z
    const dist = Math.hypot(dx, dy, dz)

    // too far behind: bring the threat back near the player
    if (dist > 160) this.respawn(player.pos)

    this.cooldown = Math.max(0, this.cooldown - dt)
    const detect = this.band.sense * (0.6 + env.noise)

    // light response decides flee vs attraction (spec: counterplay varies)
    if (env.lights && this.band.lightResponse === 'flee' && dist < 25) this.state = 'flee'
    else if (this.state === 'flee' && (!env.lights || dist > 40)) this.state = 'patrol'

    if (this.state !== 'flee') {
      if (dist < detect && this.cooldown === 0) this.state = 'stalk'
      else if (this.state === 'stalk' && dist > detect * 1.6) this.state = 'patrol'
      if (this.state === 'stalk' && dist < 2.4 + this.band.scale * 0.4) {
        events.push({ type: 'predator-hit', damage: Math.round(12 * this.band.aggression) })
        this.cooldown = 3
        this.state = 'patrol'
        this.waypoint = null
      }
    }

    // pick a direction
    let dir
    const speed =
      this.state === 'stalk'
        ? 3.2 + this.band.aggression * 1.6
        : this.state === 'flee'
          ? 4.2
          : 1.6
    if (this.state === 'stalk') {
      dir = { x: dx / dist, y: dy / dist, z: dz / dist }
    } else if (this.state === 'flee') {
      dir = { x: -dx / dist, y: -dy / dist + 0.15, z: -dz / dist }
    } else {
      if (!this.waypoint || Math.hypot(this.waypoint.x - this.pos.x, this.waypoint.z - this.pos.z) < 6) {
        const a = this.rng() * Math.PI * 2
        this.waypoint = {
          x: this.pos.x + Math.cos(a) * 30,
          y: Math.min(-8, this.pos.y + (this.rng() - 0.5) * 10),
          z: this.pos.z + Math.sin(a) * 30,
        }
      }
      const wd = Math.hypot(
        this.waypoint.x - this.pos.x,
        this.waypoint.y - this.pos.y,
        this.waypoint.z - this.pos.z,
      )
      dir = {
        x: (this.waypoint.x - this.pos.x) / wd,
        y: (this.waypoint.y - this.pos.y) / wd,
        z: (this.waypoint.z - this.pos.z) / wd,
      }
    }
    terrainAvoid(this.density, this.pos, dir)

    this.pos.x += dir.x * speed * dt
    this.pos.y = Math.min(-4, this.pos.y + dir.y * speed * dt)
    this.pos.z += dir.z * speed * dt

    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z)
    // face travel direction (forward is -z)
    this.mesh.rotation.y = Math.atan2(-dir.x, -dir.z)
  }
}

export class Hunter {
  constructor(seed, density, uTime) {
    this.density = density
    const rng = alea(`${seed}:hunter`)
    const a = rng() * Math.PI * 2
    this.lair = { x: Math.cos(a) * 620, y: -40, z: Math.sin(a) * 620 }
    this.pos = { ...this.lair }
    this.mood = 'dormant'
    this.circleTimer = 0
    this.rumbleTimer = 4
    this.mesh = makeCreatureMesh(HUNTER_TUNING.length, 0x0a1014, uTime, 7)
    this.mesh.visible = false
  }

  // events sink: { type: 'hunter-rumble' | 'hunter-strike-diver' | 'hunter-strike-sub' }
  update(dt, player, env, events, lure) {
    const target = lure || player.pos
    const dx = target.x - this.pos.x
    const dy = target.y - this.pos.y
    const dz = target.z - this.pos.z
    const distToTarget = Math.hypot(dx, dy, dz) || 0.001
    const distToPlayer = Math.hypot(
      player.pos.x - this.pos.x,
      player.pos.y - this.pos.y,
      player.pos.z - this.pos.z,
    )

    this.mood = hunterMood(distToPlayer, env.noise)
    this.circleTimer = Math.max(0, this.circleTimer - dt)

    // dormant: drift home, no body
    if (this.mood === 'dormant') {
      this.mesh.visible = false
      const hx = this.lair.x - this.pos.x
      const hy = this.lair.y - this.pos.y
      const hz = this.lair.z - this.pos.z
      const hd = Math.hypot(hx, hy, hz)
      if (hd > 5) {
        this.pos.x += (hx / hd) * 3 * dt
        this.pos.y += (hy / hd) * 3 * dt
        this.pos.z += (hz / hd) * 3 * dt
      }
      return
    }

    // dread: heard, not seen
    this.rumbleTimer -= dt
    if (this.rumbleTimer <= 0) {
      this.rumbleTimer = 5 + Math.random() * 9
      events.push({ type: 'hunter-rumble', intensity: this.mood === 'dread' ? 0.5 : 1 })
    }

    this.mesh.visible = this.mood !== 'dread' ? true : distToPlayer < HUNTER_TUNING.huntRadius * 1.1

    let speed = HUNTER_TUNING.baseSpeed + env.noise * HUNTER_TUNING.noiseSpeedBonus
    let dir = { x: dx / distToTarget, y: dy / distToTarget, z: dz / distToTarget }

    if (this.circleTimer > 0) {
      // circle out after a strike: orbit tangentially, slowly closing again
      dir = { x: -dir.z, y: 0.05, z: dir.x }
      speed = HUNTER_TUNING.baseSpeed * 0.8
    } else if (this.mood === 'striking' && !lure) {
      events.push({
        type: env.aboard ? 'hunter-strike-sub' : 'hunter-strike-diver',
        damage: env.aboard ? HUNTER_TUNING.hullDamage : HUNTER_TUNING.diverDamage,
        dir: { x: dx / distToTarget, z: dz / distToTarget },
      })
      this.circleTimer = HUNTER_TUNING.circleSeconds
    }

    terrainAvoid(this.density, this.pos, dir, 12)
    this.pos.x += dir.x * speed * dt
    this.pos.y = Math.min(-6, this.pos.y + dir.y * speed * dt)
    this.pos.z += dir.z * speed * dt

    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z)
    this.mesh.rotation.y = Math.atan2(-dir.x, -dir.z)
  }
}

export { noiseLevel, HUNTER_TUNING }
