import * as THREE from 'three/webgpu'
import { Fn, uniform, instanceIndex, positionLocal, hash, vec3, mix } from 'three/tsl'
import alea from 'alea'
import { applyOps } from '../world/anchors.js'

// Seafloor vegetation over a sliding window of chunk columns around the
// player. Placement is deterministic per (seed, column); matrices rebuild
// only when the player crosses into a new column. Kelp is a shallow biome:
// nothing grows below KELP_MAX_DEPTH.
const COLUMN = 32 // meters, matches chunk size
const WINDOW = 3 // columns each side -> 7x7 window
const KELP_MAX_DEPTH = 90
const KELP_CAP = 1500
const CORAL_CAP = 600

// Pure: deterministic plant placements for one column. Returns array of
// { kind: 'kelp' | 'coral', x, y, z, scale, rot }.
export function plantsForColumn(seed, density, ops, colX, colZ) {
  const rng = alea(`${seed}:veg:${colX}:${colZ}`)
  const out = []
  const tries = 13
  for (let i = 0; i < tries; i++) {
    const x = colX * COLUMN + rng() * COLUMN
    const z = colZ * COLUMN + rng() * COLUMN
    const kind = rng() < 0.6 ? 'kelp' : 'coral'
    const scale = 0.6 + rng() * 0.9
    const rot = rng() * Math.PI * 2
    const fy = density.floorY(x, z)
    if (-fy > KELP_MAX_DEPTH) continue
    // reject where the floor was carved away (anchor clearings) or there is
    // no rock just below the nominal floor (cave roofs)
    const dBelow = applyOps(density(x, fy - 0.6, z), ops, x, fy - 0.6, z)
    if (dBelow <= 0) continue
    out.push({ kind, x, y: fy, z, scale, rot })
  }
  return out
}

function createKelpGeometry() {
  // a tapered 6-segment ribbon, 4m tall, origin at the base
  const geo = new THREE.PlaneGeometry(0.45, 4, 1, 6)
  geo.translate(0, 2, 0)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const taper = 1 - (y / 4) * 0.7
    pos.setX(i, pos.getX(i) * taper)
  }
  geo.computeVertexNormals()
  return geo
}

function createCoralGeometry() {
  // a small cluster of cones
  const cones = []
  const specs = [
    [0, 0, 0, 0.5, 1.1],
    [0.45, 0, 0.2, 0.32, 0.7],
    [-0.4, 0, -0.15, 0.36, 0.85],
  ]
  for (const [x, y, z, r, h] of specs) {
    const c = new THREE.ConeGeometry(r, h, 5)
    c.translate(x, y + h / 2, z)
    cones.push(c)
  }
  // manual merge (BufferGeometryUtils lives in three/addons; avoid the
  // double-bundle trap by concatenating attributes here)
  const nonIndexed = cones.map((c) => c.toNonIndexed())
  let total = 0
  for (const c of nonIndexed) total += c.attributes.position.count
  const positions = new Float32Array(total * 3)
  const normals = new Float32Array(total * 3)
  let vo = 0
  for (const c of nonIndexed) {
    positions.set(c.attributes.position.array, vo * 3)
    normals.set(c.attributes.normal.array, vo * 3)
    vo += c.attributes.position.count
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  return geo
}

export class VegetationField {
  constructor(seed, density, ops, uTime) {
    this.seed = seed
    this.density = density
    this.ops = ops
    this.lastKey = ''

    const kelpMaterial = new THREE.MeshStandardNodeMaterial({
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    // sway grows with height^1.5; dephased per instance
    kelpMaterial.positionNode = Fn(() => {
      const local = positionLocal.toVar()
      const h = positionLocal.y.div(4).clamp(0, 1)
      const sway = uTime.mul(1.1).add(hash(instanceIndex).mul(21)).sin().mul(h.pow(1.5)).mul(0.45)
      local.x.addAssign(sway)
      local.z.addAssign(sway.mul(0.4))
      return local
    })()
    kelpMaterial.colorNode = mix(
      vec3(0.16, 0.34, 0.18),
      vec3(0.25, 0.42, 0.2),
      hash(instanceIndex.add(3)),
    )

    const coralMaterial = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 })
    coralMaterial.colorNode = mix(
      vec3(0.75, 0.35, 0.25),
      vec3(0.6, 0.3, 0.55),
      hash(instanceIndex.add(7)),
    )

    this.kelp = new THREE.InstancedMesh(createKelpGeometry(), kelpMaterial, KELP_CAP)
    this.coral = new THREE.InstancedMesh(createCoralGeometry(), coralMaterial, CORAL_CAP)
    this.kelp.count = 0
    this.coral.count = 0
    // instances spread far from the geometry's local bound; cull manually never
    this.kelp.frustumCulled = false
    this.coral.frustumCulled = false
    this.group = new THREE.Group()
    this.group.add(this.kelp)
    this.group.add(this.coral)
  }

  update(playerPos) {
    const colX = Math.floor(playerPos.x / COLUMN)
    const colZ = Math.floor(playerPos.z / COLUMN)
    const key = `${colX},${colZ}`
    if (key === this.lastKey) return
    this.lastKey = key

    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const s = new THREE.Vector3()
    let kelpN = 0
    let coralN = 0
    for (let dz = -WINDOW; dz <= WINDOW; dz++)
      for (let dx = -WINDOW; dx <= WINDOW; dx++) {
        const plants = plantsForColumn(this.seed, this.density, this.ops, colX + dx, colZ + dz)
        for (const p of plants) {
          q.setFromAxisAngle(up, p.rot)
          s.setScalar(p.scale)
          m.compose(new THREE.Vector3(p.x, p.y - 0.15, p.z), q, s)
          if (p.kind === 'kelp' && kelpN < KELP_CAP) this.kelp.setMatrixAt(kelpN++, m)
          else if (p.kind === 'coral' && coralN < CORAL_CAP) this.coral.setMatrixAt(coralN++, m)
        }
      }
    this.kelp.count = kelpN
    this.coral.count = coralN
    this.kelp.instanceMatrix.needsUpdate = true
    this.coral.instanceMatrix.needsUpdate = true
  }
}
