import * as THREE from 'three/webgpu'
import { CHUNK } from './marchingCubes.js'

export const chunkKey = (cx, cy, cz) => `${cx},${cy},${cz}`

// Deliberate perf trade, NOT a spec invariant: vertically the one-ring-beyond-
// the-fog-wall guarantee is allowed to lapse when looking straight up/down at
// maximum visibility (saves the sphere poles; revisit for deep cave traversal).
const VERTICAL_CLAMP = 3

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

// All chunks share one local-space bound: center (16,16,16), half-diagonal.
// Presetting it skips three.js's lazy full-attribute scan on first cull.
const CHUNK_BOUND_CENTER = new THREE.Vector3(CHUNK / 2, CHUNK / 2, CHUNK / 2)
const CHUNK_BOUND_RADIUS = (CHUNK / 2) * Math.sqrt(3)

export class ChunkManager {
  constructor(scene, pool, seed) {
    this.scene = scene
    this.pool = pool
    this.seed = seed
    this.chunks = new Map() // key -> { state, mesh, gen }
    this.uploadQueue = [] // worker results awaiting geometry upload
    this.gen = 0 // generation token: stale worker results are dropped
    this.lastScanKey = '' // skip the request/evict scan when nothing changed
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

    // The wanted set only changes when the center chunk or radius changes;
    // skip the whole request/evict pass otherwise (review finding: avoids
    // ~46k allocations/s of steady-state churn).
    const scanKey = `${center.cx},${center.cy},${center.cz}:${radius}`
    if (scanKey !== this.lastScanKey) {
      this.lastScanKey = scanKey
      const wanted = computeWantedChunks(center, radius)
      const wantedKeys = new Set(wanted.map((w) => w.key))

      // Request missing chunks, nearest first.
      for (const w of wanted) {
        if (this.chunks.has(w.key)) continue
        const rec = { state: 'pending', mesh: null, gen: ++this.gen }
        this.chunks.set(w.key, rec)
        this.pool
          .run({ seed: this.seed, cx: w.cx, cy: w.cy, cz: w.cz })
          .then((r) => this.uploadQueue.push({ ...r, gen: rec.gen }))
          .catch(() => {
            // Worker failure: clear the entry and force a rescan so the chunk
            // is re-requested on a later frame instead of holing the terrain.
            if (this.chunks.get(w.key) === rec) this.chunks.delete(w.key)
            this.lastScanKey = ''
          })
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
    }

    // Upload a bounded number of finished chunks per frame.
    let uploads = 0
    while (this.uploadQueue.length > 0 && uploads < MAX_UPLOADS_PER_FRAME) {
      const r = this.uploadQueue.shift()
      const key = chunkKey(r.cx, r.cy, r.cz)
      const c = this.chunks.get(key)
      // Generation check (review finding): a chunk evicted and re-requested
      // while its first job was in flight must not accept the stale result,
      // or the first mesh leaks into the scene forever.
      if (!c || c.gen !== r.gen) continue
      if (r.positions.length === 0) {
        c.state = 'ready' // empty water/rock chunk, nothing to draw
        continue
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(r.positions, 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(r.normals, 3))
      geometry.setIndex(new THREE.BufferAttribute(r.indices, 1))
      geometry.boundingSphere = new THREE.Sphere(CHUNK_BOUND_CENTER.clone(), CHUNK_BOUND_RADIUS)
      if (c.mesh) {
        // Defensive: never orphan a previously attached mesh.
        this.scene.remove(c.mesh)
        c.mesh.geometry.dispose()
      }
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
