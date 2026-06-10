import { createNoise2D, createNoise3D } from 'simplex-noise'
import alea from 'alea'

// density > 0 is solid rock, <= 0 is water; approximate meters near the surface.
// IMPORTANT (spec section 13): each createNoiseXD call gets its own fresh alea
// instance, or the world silently changes.
//
// The returned function also exposes two helpers used by chunk generation to
// avoid recomputing the (x, z)-only floor noise for every y in a column:
//   density.floorY(x, z)                 -> the seafloor height for a column
//   density.atWithFloor(floorY, x, y, z) -> density given a precomputed floorY
// density(x, y, z) === density.atWithFloor(density.floorY(x, z), x, y, z)
// bit-for-bit, so CPU generation stays the single deterministic source of truth.
export function createDensityField(seed) {
  const floorNoise = createNoise2D(alea(`${seed}:floor`))
  const reliefNoise = createNoise3D(alea(`${seed}:relief`))
  const carveNoise = createNoise3D(alea(`${seed}:carve`))

  function fbm2(x, z) {
    let v = 0, amp = 1, f = 1, norm = 0
    for (let o = 0; o < 4; o++) {
      v += amp * floorNoise(x * f, z * f)
      norm += amp
      amp *= 0.5
      f *= 2
    }
    return v / norm // in [-1, 1]
  }

  // The descent (spec section 5 depth bands, M7): the Shelf holds within
  // 250m of the origin, then the seafloor ramps smoothly down to an abyssal
  // plain ~780m deep by 1500m out. Radial, so every bearing descends; the
  // story corridor just picks one.
  function descentAt(r) {
    if (r <= 250) return 0
    const t = Math.min((r - 250) / 1250, 1)
    const s = t * t * (3 - 2 * t) // smoothstep
    return 780 * s
  }

  function floorY(x, z) {
    const r = Math.hypot(x, z)
    return -45 - descentAt(r) + 18 * fbm2(x * 0.008, z * 0.008)
  }

  function atWithFloor(fY, x, y, z) {
    let d = fY - y // positive below the seafloor surface
    d += 6 * reliefNoise(x * 0.03, y * 0.03, z * 0.03) // rocky relief and overhangs
    const carve = carveNoise(x * 0.02, y * 0.02, z * 0.02)
    if (carve > 0.45) d -= (carve - 0.45) * 40 // cave tunnels through the rock
    return d
  }

  const density = (x, y, z) => atWithFloor(floorY(x, z), x, y, z)
  density.floorY = floorY
  density.atWithFloor = atWithFloor
  density.descentAt = descentAt
  return density
}
