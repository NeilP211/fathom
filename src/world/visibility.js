// Visibility in meters by depth band (piecewise linear; spec section 4).
// Depth is positive meters below the surface.
const CURVE = [
  [0, 96],
  [100, 80],
  [300, 55],
  [600, 30],
  [800, 18],
]

export function visibilityAtDepth(depth) {
  if (depth <= CURVE[0][0]) return CURVE[0][1]
  for (let i = 1; i < CURVE.length; i++) {
    const [d1, v1] = CURVE[i]
    const [d0, v0] = CURVE[i - 1]
    if (depth <= d1) {
      const t = (depth - d0) / (d1 - d0)
      return v0 + t * (v1 - v0)
    }
  }
  return CURVE[CURVE.length - 1][1]
}

// Visibility is where FogExp2 transmittance reaches 2% (spec section 4).
export function fogDensityFor(visibility) {
  return -Math.log(0.02) / visibility
}

// Spec invariant: always at least one loaded chunk ring beyond the fog wall.
export function loadRadiusFor(visibility) {
  return Math.ceil(visibility / 32) + 1
}
