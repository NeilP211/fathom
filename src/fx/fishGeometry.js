import * as THREE from 'three/webgpu'

// A ~9-triangle fish, forward along +z, about 1m long before instance scaling.
// Procedural per the spec assets rule: no modeling, no skeletons.
export function createFishGeometry() {
  const nose = [0, 0, 0.55]
  const top = [0, 0.13, 0.1]
  const bot = [0, -0.13, 0.1]
  const left = [-0.07, 0, 0.1]
  const right = [0.07, 0, 0.1]
  const tailBase = [0, 0, -0.35]
  const tailTop = [0, 0.2, -0.62]
  const tailBot = [0, -0.2, -0.62]

  const tris = [
    [nose, top, left],
    [nose, right, top],
    [nose, left, bot],
    [nose, bot, right],
    [top, tailBase, left],
    [top, right, tailBase],
    [bot, left, tailBase],
    [bot, tailBase, right],
    [tailBase, tailTop, tailBot],
  ]

  const positions = new Float32Array(tris.length * 9)
  let i = 0
  for (const t of tris) for (const v of t) for (const c of v) positions[i++] = c

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}
