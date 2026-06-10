import * as THREE from 'three/webgpu'
import {
  Fn,
  uniform,
  instanceIndex,
  positionLocal,
  normalize,
  cross,
  mat3,
  hash,
  float,
  vec3,
  mix,
} from 'three/tsl'
import { createFishGeometry } from './fishGeometry.js'

// Fallback-tier fish for the WebGL2 backend (spec section 3): no neighbor
// reads, so no boids. Each instance swims a parametric circle derived from
// hashes; positions wrap around the player so the water never looks dead.
const WRAP = 160

export class AmbientFish {
  constructor(count) {
    this.count = count
    this.uTime = uniform(0)
    this.uPlayer = uniform(new THREE.Vector3(0, -8, 0))

    const uTime = this.uTime
    const uPlayer = this.uPlayer

    const material = new THREE.MeshBasicNodeMaterial()
    material.positionNode = Fn(() => {
      const cx = hash(instanceIndex).sub(0.5).mul(WRAP)
      const cy = hash(instanceIndex.add(1)).mul(-38).sub(8)
      const cz = hash(instanceIndex.add(2)).sub(0.5).mul(WRAP)
      const radius = hash(instanceIndex.add(3)).mul(14).add(4)
      const speed = hash(instanceIndex.add(4)).mul(0.25).add(0.1)
      const angle = uTime.mul(speed).add(hash(instanceIndex.add(5)).mul(6.283))

      // circle center wrapped around the player
      const half = float(WRAP / 2)
      const size = float(WRAP)
      const wx = cx.sub(uPlayer.x).add(half).mod(size).sub(half).add(uPlayer.x)
      const wz = cz.sub(uPlayer.z).add(half).mod(size).sub(half).add(uPlayer.z)

      const px = wx.add(angle.cos().mul(radius))
      const py = cy.add(angle.mul(0.5).sin().mul(0.8))
      const pz = wz.add(angle.sin().mul(radius))

      // face the path tangent
      const forward = normalize(vec3(angle.sin().negate(), 0, angle.cos()))
      const right = normalize(cross(vec3(0, 1, 0), forward))
      const up = cross(forward, right)
      const basis = mat3(right, up, forward)

      const local = positionLocal.toVar()
      const tailMask = positionLocal.z.negate().add(0.1).max(0)
      local.x.addAssign(uTime.mul(6).add(hash(instanceIndex).mul(9)).sin().mul(tailMask).mul(0.18))
      const scale = hash(instanceIndex.add(11)).mul(0.45).add(0.55)
      return basis.mul(local.mul(scale)).add(vec3(px, py, pz))
    })()
    material.colorNode = mix(vec3(0.55, 0.65, 0.7), vec3(0.3, 0.45, 0.55), hash(instanceIndex.add(5)))

    this.mesh = new THREE.Mesh(createFishGeometry(), material)
    this.mesh.count = count
    this.mesh.frustumCulled = false
  }

  update(dt, time, playerPos) {
    this.uTime.value = time
    this.uPlayer.value.set(playerPos.x, playerPos.y, playerPos.z)
  }
}
