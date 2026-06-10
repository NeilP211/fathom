import * as THREE from 'three/webgpu'
import { CHUNK } from './marchingCubes.js'

export const chunkKey = (cx, cy, cz) => `${cx},${cy},${cz}`

const VERTICAL_CLAMP = 3 // chunks above/below the player (spec section 4)

export function computeWantedChunks(center, radius) {
  const out = []
  for (let dz = -radius; dz <= radius; dz++)
    for (let dy = -Math.min(radius, VERTICAL_CLAMP); dy <= Math.min(radius, VERTICAL_CLAMP); dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > radius * radius) continue // sphere clip
        const cx = center.cx + dx
        const cy = center.cy + dy
        const cz = center.cz + dz
        out.push({ cx, cy, cz, key: chunkKey(cx, cy, cz), d2 })
      }
  out.sort((a, b) => a.d2 - b.d2)
  return out
}

const MAX_UPLOADS_PER_FRAME = 4 // spec section 4: cap geometry uploads

export class ChunkManager {
  constructor(scene, pool, seed) {
    this.scene = scene
    this.pool = pool
    this.seed = seed
    this.chunks = new Map() // key -> { state: 'pending' | 'ready', mesh: Mesh | null }
    this.uploadQueue = [] // results awaiting geometry upload
    this.material = new THREE.MeshStandardMaterial({
      color: 0x55706a,
      roughness: 0.95,
      metalness: 0.0,
    })
  }

  get residentCount() {
    let n = 0
    for (const c of this.chunks.values()) if (c.state === 'ready') n++
    return n
  }

  // Call once per frame.
  update(playerPos, radius) {
    const center = {
      cx: Math.floor(playerPos.x / CHUNK),
      cy: Math.floor(playerPos.y / CHUNK),
      cz: Math.floor(playerPos.z / CHUNK),
    }
    const wanted = computeWantedChunks(center, radius)
    const wantedKeys = new Set(wanted.map((w) => w.key))

    // Request missing chunks, nearest first.
    for (const w of wanted) {
      if (this.chunks.has(w.key)) continue
      this.chunks.set(w.key, { state: 'pending', mesh: null })
      this.pool
        .run({ seed: this.seed, cx: w.cx, cy: w.cy, cz: w.cz })
        .then((r) => this.uploadQueue.push(r))
    }

    // Dispose chunks that left the radius.
    for (const [key, c] of this.chunks) {
      if (wantedKeys.has(key)) continue
      if (c.mesh) {
        this.scene.remove(c.mesh)
        c.mesh.geometry.dispose()
      }
      this.chunks.delete(key)
    }

    // Upload a bounded number of finished chunks per frame.
    let uploads = 0
    while (this.uploadQueue.length > 0 && uploads < MAX_UPLOADS_PER_FRAME) {
      const r = this.uploadQueue.shift()
      const key = chunkKey(r.cx, r.cy, r.cz)
      const c = this.chunks.get(key)
      if (!c) continue // evicted while generating
      if (r.positions.length === 0) {
        c.state = 'ready' // empty water/rock chunk, nothing to draw
        continue
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(r.positions, 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(r.normals, 3))
      const mesh = new THREE.Mesh(geometry, this.material)
      mesh.position.set(r.cx * CHUNK, r.cy * CHUNK, r.cz * CHUNK)
      mesh.frustumCulled = true
      this.scene.add(mesh)
      c.mesh = mesh
      c.state = 'ready'
      uploads++
    }
  }
}
