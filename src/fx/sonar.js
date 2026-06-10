import * as THREE from 'three/webgpu'

// Sonar pulse (spec section 5 light and sonar): an expanding additive shell
// plus 4s of compass contacts. The loud part (stimulus + Hunter interest) is
// wired in main.
export const SONAR_TUNING = {
  cooldown: 4,
  powerCost: 5,
  range: 150,
  contactSeconds: 4,
  pulseSeconds: 2.2,
}

export class Sonar {
  constructor(scene) {
    this.scene = scene
    this.cooldown = 0
    this.pulseT = -1
    this.lastPingAt = -Infinity
    this.contacts = [] // {x, z, kind, until}
    this.shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0x6fffe0,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    )
    this.shell.visible = false
    scene.add(this.shell)
  }

  canPing(power) {
    return this.cooldown <= 0 && power >= SONAR_TUNING.powerCost
  }

  // targets: [{x, z, kind}] within range, computed by the caller
  ping(origin, targets, elapsed) {
    this.cooldown = SONAR_TUNING.cooldown
    this.pulseT = 0
    this.lastPingAt = elapsed
    this.shell.position.set(origin.x, origin.y, origin.z)
    this.contacts = targets.map((t) => ({ ...t, until: elapsed + SONAR_TUNING.contactSeconds }))
  }

  update(dt, elapsed) {
    this.cooldown = Math.max(0, this.cooldown - dt)
    if (this.pulseT >= 0) {
      this.pulseT += dt
      const t = this.pulseT / SONAR_TUNING.pulseSeconds
      if (t >= 1) {
        this.pulseT = -1
        this.shell.visible = false
      } else {
        this.shell.visible = true
        const r = 2 + t * SONAR_TUNING.range
        this.shell.scale.setScalar(r)
        this.shell.material.opacity = 0.16 * (1 - t)
      }
    }
    this.contacts = this.contacts.filter((c) => c.until > elapsed)
  }

  pingAge(elapsed) {
    return elapsed - this.lastPingAt
  }
}
