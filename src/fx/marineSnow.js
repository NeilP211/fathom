import * as THREE from 'three/webgpu'
import {
  Fn,
  uniform,
  instancedArray,
  instanceIndex,
  hash,
  float,
  vec3,
  shapeCircle,
} from 'three/tsl'

// Player-centered wrap volume. Particles live in world space but are wrapped
// into a BOX-sized cube around the player every frame, so the snowfield is
// effectively infinite while costing a fixed budget.
const BOX = 90

// Marine snow: the fallback-safe TSL compute path (map-style kernel only;
// each invocation writes its own instanceIndex element; setPBO for the WebGL2
// transform-feedback backend; spec section 3).
export class MarineSnow {
  constructor(count) {
    this.count = count

    this.positions = instancedArray(count, 'vec3')
    this.positions.setPBO(true)

    this.uPlayer = uniform(new THREE.Vector3(0, -8, 0))
    this.uDt = uniform(0)
    this.uTime = uniform(0)

    const positions = this.positions
    const uPlayer = this.uPlayer
    const uDt = this.uDt
    const uTime = this.uTime

    this.computeInit = Fn(() => {
      const p = positions.element(instanceIndex)
      p.x = hash(instanceIndex).sub(0.5).mul(BOX).add(uPlayer.x)
      p.y = hash(instanceIndex.add(1)).sub(0.5).mul(BOX).add(uPlayer.y)
      p.z = hash(instanceIndex.add(2)).sub(0.5).mul(BOX).add(uPlayer.z)
    })().compute(count).setName('Init Marine Snow')

    this.computeUpdate = Fn(() => {
      const p = positions.element(instanceIndex)
      // per-particle sink speed in 0.12-0.37 m/s
      const sink = hash(instanceIndex.add(7)).mul(0.25).add(0.12)
      p.y.subAssign(sink.mul(uDt))
      // gentle sideways drift, dephased per particle
      const phase = hash(instanceIndex.add(13)).mul(50)
      p.x.addAssign(uTime.mul(0.31).add(phase).sin().mul(0.12).mul(uDt))
      p.z.addAssign(uTime.mul(0.23).add(phase).cos().mul(0.12).mul(uDt))
      // wrap into the player-centered box (floor-mod keeps it stable)
      const half = float(BOX / 2)
      const size = float(BOX)
      p.x.assign(p.x.sub(uPlayer.x).add(half).mod(size).sub(half).add(uPlayer.x))
      p.y.assign(p.y.sub(uPlayer.y).add(half).mod(size).sub(half).add(uPlayer.y))
      p.z.assign(p.z.sub(uPlayer.z).add(half).mod(size).sub(half).add(uPlayer.z))
    })().compute(count).setName('Update Marine Snow')

    const material = new THREE.SpriteNodeMaterial()
    material.positionNode = positions.toAttribute()
    material.scaleNode = float(0.04).add(hash(instanceIndex.add(3)).mul(0.05))
    material.colorNode = vec3(0.75, 0.85, 0.9)
    material.opacityNode = shapeCircle().mul(0.35)
    material.transparent = true
    material.depthWrite = false

    this.sprite = new THREE.Sprite(material)
    this.sprite.count = count
    this.sprite.frustumCulled = false
    this.initialized = false
  }

  update(renderer, dt, time, playerPos) {
    this.uPlayer.value.set(playerPos.x, playerPos.y, playerPos.z)
    this.uDt.value = dt
    this.uTime.value = time
    if (!this.initialized) {
      this.initialized = true
      renderer.compute(this.computeInit)
    }
    renderer.compute(this.computeUpdate)
  }
}
