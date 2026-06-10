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

// M2: one authored test site proving the pipeline (spec section 6 requires
// this in milestone 2, not milestone 7). A carved clearing on the seafloor
// near spawn with wreck debris forms inside it. Placement derives from the
// seed via the deterministic floor height.
export function anchorsForSeed(seed, density) {
  const fx = 64
  const fz = 64
  const fy = density.floorY(fx, fz)
  return [
    // flatten a clearing: carve from 2m below the local floor up to +12m
    { type: 'carve', center: [fx, fy + 5, fz], half: [14, 7, 14] },
    // hull section
    { type: 'add', center: [fx - 5, fy - 0.6, fz + 3], half: [4, 1.6, 1.5] },
    // crate row
    { type: 'add', center: [fx + 6, fy - 0.9, fz - 4], half: [1.5, 1.2, 3] },
    // fallen beam
    { type: 'add', center: [fx, fy - 1.2, fz + 8], half: [2.5, 0.9, 0.9] },
  ]
}
