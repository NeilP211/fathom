import * as THREE from 'three/webgpu'

// The surface buoy at world origin (spec section 5 "The start"): spawn point,
// fabricator, radio, save point, oxygen refill.
export const BUOY_POS = { x: 0, y: -2, z: 0 }
export const BUOY_RADIUS = 10

export function createBuoy() {
  const group = new THREE.Group()

  const float = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xc24b2e, roughness: 0.5, metalness: 0.3 }),
  )
  float.position.set(0, -1.2, 0)
  group.add(float)

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 6, 8),
    new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.8 }),
  )
  pole.position.set(0, -4.2, 0)
  group.add(pole)

  const cage = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.9, 0.9),
    new THREE.MeshStandardMaterial({
      color: 0x3a4a52,
      roughness: 0.6,
      metalness: 0.5,
      emissive: 0x16323c,
      emissiveIntensity: 0.6,
    }),
  )
  cage.position.set(0, -7, 0) // the fabricator hangs below, reachable while diving
  group.add(cage)

  const beacon = new THREE.PointLight(0xff5533, 8, 24)
  beacon.position.set(0, -0.5, 0)
  group.add(beacon)

  return {
    group,
    beacon,
    update(elapsed) {
      beacon.intensity = 4 + 5 * Math.max(0, Math.sin(elapsed * 2.2))
    },
  }
}

// The buoy zone is a column: near the buoy horizontally, anywhere from the
// surface down past the hanging fabricator.
export function inBuoyZone(pos) {
  return Math.hypot(pos.x - BUOY_POS.x, pos.z - BUOY_POS.z) < BUOY_RADIUS && pos.y > -14
}
