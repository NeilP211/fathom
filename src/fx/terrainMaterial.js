import * as THREE from 'three/webgpu'
import { positionWorld, normalWorld, vec3, float, mx_noise_float } from 'three/tsl'

// Terrain material with animated caustics in the shallows (M2): two scrolling
// noise octaves squared into bright ridges, masked to the top 100m and to
// up-facing surfaces. uTime is a shared uniform node updated by the main loop.
export function createTerrainMaterial(uTime) {
  const material = new THREE.MeshStandardNodeMaterial({
    roughness: 0.95,
    metalness: 0.0,
  })

  const base = vec3(0x55 / 255, 0x70 / 255, 0x6a / 255)

  const depth = positionWorld.y.negate()
  const shallowMask = float(1).sub(depth.div(100)).clamp(0, 1)
  const upMask = normalWorld.y.clamp(0, 1)

  const n1 = mx_noise_float(
    vec3(positionWorld.x.mul(0.15), positionWorld.z.mul(0.15), uTime.mul(0.35)),
  )
  const n2 = mx_noise_float(
    vec3(positionWorld.x.mul(0.22).add(31.4), positionWorld.z.mul(0.22), uTime.mul(0.5)),
  )
  const ridges = n1.add(n2).abs().oneMinus().clamp(0, 1).pow(6)

  const caustic = ridges.mul(shallowMask).mul(upMask).mul(1.4)
  material.colorNode = base.mul(caustic.add(1))

  return material
}
