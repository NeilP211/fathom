import * as THREE from 'three/webgpu'
import alea from 'alea'
import { applyOps } from '../world/anchors.js'

// Windowed, seeded resource nodes on the seafloor (vegetation pattern).
// Consumed ids live in game state (worldDiffs bucket) so pickups stay gone
// across saves.
const COLUMN = 32
const WINDOW = 2 // 5x5 columns: pickups only matter near the player
const CAP = 400

export function nodesForColumn(seed, density, ops, colX, colZ) {
  const rng = alea(`${seed}:nodes:${colX}:${colZ}`)
  const out = []
  for (let i = 0; i < 5; i++) {
    const x = colX * COLUMN + rng() * COLUMN
    const z = colZ * COLUMN + rng() * COLUMN
    const roll = rng()
    const fy = density.floorY(x, z)
    const dBelow = applyOps(density(x, fy - 0.6, z), ops, x, fy - 0.6, z)
    if (dBelow <= 0) continue
    if (roll < 0.65) {
      out.push({ id: `n:${colX}:${colZ}:${i}`, kind: 'scrap', x, y: fy + 0.25, z })
    } else if (-fy < 90) {
      out.push({ id: `n:${colX}:${colZ}:${i}`, kind: 'biolume', x, y: fy + 0.3, z })
    }
  }
  return out
}

export class PickupField {
  constructor(seed, density, ops) {
    this.seed = seed
    this.density = density
    this.ops = ops
    this.lastKey = ''
    this.active = [] // visible, unconsumed nodes

    this.scrap = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.28),
      new THREE.MeshStandardMaterial({ color: 0x8d9499, roughness: 0.6, metalness: 0.7 }),
      CAP,
    )
    this.biolume = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.24),
      new THREE.MeshStandardMaterial({
        color: 0x46e6c8,
        emissive: 0x2bd4b4,
        emissiveIntensity: 1.6,
      }),
      CAP,
    )
    this.scrap.frustumCulled = false
    this.biolume.frustumCulled = false
    this.group = new THREE.Group()
    this.group.add(this.scrap)
    this.group.add(this.biolume)
  }

  rebuild(playerPos, consumedSet) {
    const colX = Math.floor(playerPos.x / COLUMN)
    const colZ = Math.floor(playerPos.z / COLUMN)
    this.active = []
    const m = new THREE.Matrix4()
    let scrapN = 0
    let bioN = 0
    for (let dz = -WINDOW; dz <= WINDOW; dz++)
      for (let dx = -WINDOW; dx <= WINDOW; dx++) {
        for (const n of nodesForColumn(this.seed, this.density, this.ops, colX + dx, colZ + dz)) {
          if (consumedSet.includes(n.id)) continue
          this.active.push(n)
          m.makeTranslation(n.x, n.y, n.z)
          if (n.kind === 'scrap' && scrapN < CAP) this.scrap.setMatrixAt(scrapN++, m)
          else if (n.kind === 'biolume' && bioN < CAP) this.biolume.setMatrixAt(bioN++, m)
        }
      }
    this.scrap.count = scrapN
    this.biolume.count = bioN
    this.scrap.instanceMatrix.needsUpdate = true
    this.biolume.instanceMatrix.needsUpdate = true
    this.lastKey = `${colX},${colZ}`
  }

  update(playerPos, consumedSet) {
    const key = `${Math.floor(playerPos.x / COLUMN)},${Math.floor(playerPos.z / COLUMN)}`
    if (key !== this.lastKey) this.rebuild(playerPos, consumedSet)
  }

  nearest(pos, maxDist = 2.8) {
    let best = null
    let bestD = maxDist
    for (const n of this.active) {
      const d = Math.hypot(n.x - pos.x, n.y - pos.y, n.z - pos.z)
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    return best
  }
}
