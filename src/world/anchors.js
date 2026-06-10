// Anchor stamping pipeline (spec section 6): hand-authored templates placed
// deterministically by the world seed and stamped into the density field at
// generation time. Density convention: > 0 solid.
//
// SDF ops in the positive-inside-density convention:
//   carve (make water): d' = min(d, sdf)   (sdf negative inside the shape)
//   add (make solid):   d' = max(d, -sdf)

export function sdBox(px, py, pz, cx, cy, cz, hx, hy, hz) {
  const dx = Math.abs(px - cx) - hx
  const dy = Math.abs(py - cy) - hy
  const dz = Math.abs(pz - cz) - hz
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  const az = Math.max(dz, 0)
  const outside = Math.hypot(ax, ay, az)
  const inside = Math.min(Math.max(dx, Math.max(dy, dz)), 0)
  return outside + inside
}

export function applyOps(d, ops, x, y, z) {
  for (const op of ops) {
    const [cx, cy, cz] = op.center
    const [hx, hy, hz] = op.half
    const s = sdBox(x, y, z, cx, cy, cz, hx, hy, hz)
    if (op.type === 'carve') d = Math.min(d, s)
    else d = Math.max(d, -s)
  }
  return d
}

// Ops only matter within this distance of their AABB (min/max caps are no-ops
// where |sdf| exceeds any plausible |density|); used to skip untouched chunks.
export const OP_PAD = 80

export function opsForChunk(ops, cx, cy, cz, chunkSize) {
  const x0 = cx * chunkSize - OP_PAD
  const y0 = cy * chunkSize - OP_PAD
  const z0 = cz * chunkSize - OP_PAD
  const x1 = (cx + 1) * chunkSize + OP_PAD
  const y1 = (cy + 1) * chunkSize + OP_PAD
  const z1 = (cz + 1) * chunkSize + OP_PAD
  return ops.filter((op) => {
    const [ocx, ocy, ocz] = op.center
    const [hx, hy, hz] = op.half
    return (
      ocx + hx >= x0 && ocx - hx <= x1 &&
      ocy + hy >= y0 && ocy - hy <= y1 &&
      ocz + hz >= z0 && ocz - hz <= z1
    )
  })
}

// Story geography (M7): all five Meridian sites sit on a seeded corridor
// bearing at increasing distance, so increasing depth (the descent profile is
// radial). This module is the single source of truth for site positions:
// SDF stamps, loot sites, and the Hunter's lair all derive from it.
import alea from 'alea'

export const STORY_SITES = [
  { id: 'sig1', dist: 230 },
  { id: 'sig2', dist: 470 },
  { id: 'sig3', dist: 760 },
  { id: 'sig4', dist: 1060 },
  { id: 'sig5', dist: 1380 },
]

export const HUNTER_LAIR_DIST = 620 // on the corridor, between sites 2 and 3

export function corridorBearing(seed) {
  return alea(`${seed}:corridor`)() * Math.PI * 2
}

// Returns [{id, x, y, z, dist}] with y = local floor height.
export function sitePositionsForSeed(seed, density) {
  const bearing = corridorBearing(seed)
  const jitter = alea(`${seed}:corridor:jitter`)
  return STORY_SITES.map((s) => {
    const a = bearing + (jitter() - 0.5) * 0.22 // slight wander, same heading
    const x = Math.cos(a) * s.dist
    const z = Math.sin(a) * s.dist
    return { id: s.id, x, y: density.floorY(x, z), z, dist: s.dist }
  })
}

// SDF stamps: the tutorial clearing near spawn plus a carved clearing and
// debris field at every story site (bigger with depth).
export function anchorsForSeed(seed, density) {
  const ops = []
  const clearing = (fx, fz, size) => {
    const fy = density.floorY(fx, fz)
    ops.push({ type: 'carve', center: [fx, fy + 5, fz], half: [size, 7, size] })
    ops.push({ type: 'add', center: [fx - size * 0.35, fy - 0.6, fz + size * 0.2], half: [4, 1.6, 1.5] })
    ops.push({ type: 'add', center: [fx + size * 0.4, fy - 0.9, fz - size * 0.3], half: [1.5, 1.2, 3] })
    ops.push({ type: 'add', center: [fx, fy - 1.2, fz + size * 0.55], half: [2.5, 0.9, 0.9] })
  }
  clearing(64, 64, 14) // the tutorial wreck (M2)
  const sites = sitePositionsForSeed(seed, density)
  sites.forEach((s, i) => clearing(s.x, s.z, 14 + i * 3))
  return ops
}
