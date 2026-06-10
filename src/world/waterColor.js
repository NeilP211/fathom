// Depth-graded water palette (spec section 5 atmosphere; M2).
// Stops are [depth, r, g, b] with 0-255 channels, lerped piecewise.
const STOPS = [
  [0, 0x0a, 0x4d, 0x66],
  [30, 0x06, 0x2b, 0x3f],
  [100, 0x04, 0x20, 0x2f],
  [300, 0x02, 0x10, 0x18],
  [600, 0x01, 0x08, 0x10],
  [800, 0x00, 0x02, 0x04],
]

export function colorAtDepth(depth) {
  if (depth <= STOPS[0][0]) {
    const [, r, g, b] = STOPS[0]
    return [r / 255, g / 255, b / 255]
  }
  for (let i = 1; i < STOPS.length; i++) {
    if (depth <= STOPS[i][0]) {
      const [d0, r0, g0, b0] = STOPS[i - 1]
      const [d1, r1, g1, b1] = STOPS[i]
      const t = (depth - d0) / (d1 - d0)
      return [
        (r0 + t * (r1 - r0)) / 255,
        (g0 + t * (g1 - g0)) / 255,
        (b0 + t * (b1 - b0)) / 255,
      ]
    }
  }
  const [, r, g, b] = STOPS[STOPS.length - 1]
  return [r / 255, g / 255, b / 255]
}

// Sunlight falloff with depth: 1 at the surface, floored so the abyss is
// never pure black (the floor is the bioluminescence-only baseline).
export function lightFalloff(depth) {
  return Math.max(Math.exp(-depth / 90), 0.02)
}
