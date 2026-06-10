import * as THREE from 'three/webgpu'

// Flare decoys (spec section 5 The Hunter counterplay): a sinking light that
// outshouts you. The Hunter's light-attraction makes it chase the flare.
export const FLARE_TUNING = {
  lifeSeconds: 25,
  sinkSpeed: 0.4,
  stimulusStrength: 1.0,
  stimulusRadius: 60,
}

export class FlareSystem {
  constructor(scene) {
    this.scene = scene
    this.active = [] // { pos, t, light, sprite }
  }

  drop(pos) {
    const light = new THREE.PointLight(0xff8a3a, 60, 35)
    const sprite = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffa050,
        emissive: 0xff7a20,
        emissiveIntensity: 6,
      }),
    )
    light.position.set(pos.x, pos.y - 0.6, pos.z)
    sprite.position.copy(light.position)
    this.scene.add(light)
    this.scene.add(sprite)
    this.active.push({ pos: { x: pos.x, y: pos.y - 0.6, z: pos.z }, t: 0, light, sprite })
  }

  // Returns the strongest active flare position (the Hunter lure) or null.
  update(dt) {
    let lure = null
    for (const f of this.active) {
      f.t += dt
      f.pos.y -= FLARE_TUNING.sinkSpeed * dt
      f.light.position.set(f.pos.x, f.pos.y, f.pos.z)
      f.sprite.position.copy(f.light.position)
      const life = 1 - f.t / FLARE_TUNING.lifeSeconds
      f.light.intensity = 60 * Math.max(0, life) * (0.85 + 0.15 * Math.sin(f.t * 11))
      if (life > 0 && !lure) lure = f.pos
    }
    for (const f of this.active.filter((x) => x.t >= FLARE_TUNING.lifeSeconds)) {
      this.scene.remove(f.light)
      this.scene.remove(f.sprite)
      f.light.dispose()
    }
    this.active = this.active.filter((x) => x.t < FLARE_TUNING.lifeSeconds)
    return lure
  }
}
