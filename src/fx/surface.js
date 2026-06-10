import * as THREE from 'three/webgpu'

// The ocean surface seen from below: a huge bright plane at y = 0 facing down,
// fogged so it vanishes naturally with depth, following the player on x/z.
// Above-water rendering is out of scope (spec section 12); the camera never
// crosses y = -1.2.
export function createSurface() {
  const group = new THREE.Group()

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshBasicMaterial({ color: 0xbfeaff, fog: true }),
  )
  plane.rotation.x = Math.PI / 2 // face downward, visible from below
  plane.position.y = 0
  group.add(plane)

  // Sun glow: an additive radial-gradient billboard hanging below the surface.
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const g = canvas.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255, 250, 220, 0.9)')
  grad.addColorStop(0.35, 'rgba(190, 230, 250, 0.35)')
  grad.addColorStop(1, 'rgba(190, 230, 250, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)

  const glowMaterial = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  })
  const glow = new THREE.Sprite(glowMaterial)
  glow.scale.set(160, 160, 1)
  glow.position.set(30, -2, 20) // toward the sun direction, just under the surface
  group.add(glow)

  return {
    group,
    // Follow the player horizontally; fade the glow with depth.
    update(playerPos, falloff) {
      group.position.x = playerPos.x
      group.position.z = playerPos.z
      glowMaterial.opacity = Math.min(1, falloff * 1.2)
    },
  }
}
