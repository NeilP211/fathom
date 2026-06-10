// Threat math (spec section 5 The Hunter / Light and sonar). Pure and tested.
// noiseLevel is the currency of the hunt: how loudly the player exists.

export const HUNTER_TUNING = {
  huntRadius: 80, // inside this it has a body (mesh + HRTF voice)
  dreadRadius: 220, // inside this you hear it and the music ducks
  strikeRange: 7,
  diverDamage: 40,
  hullDamage: 25,
  circleSeconds: 15,
  baseSpeed: 4.5,
  noiseSpeedBonus: 5, // extra m/s at full noise
  length: 19,
}

// One predator archetype, parameterized per depth band (spec: no roster).
export const PREDATOR_BANDS = [
  { maxDepth: 100, sense: 18, aggression: 0.35, lightResponse: 'flee', scale: 2.0, tint: 0x4a5a52 },
  { maxDepth: 300, sense: 30, aggression: 0.7, lightResponse: 'attracted', scale: 2.6, tint: 0x37424d },
  { maxDepth: Infinity, sense: 42, aggression: 1.0, lightResponse: 'attracted', scale: 3.2, tint: 0x232c33 },
]

export function predatorBandFor(depth) {
  return PREDATOR_BANDS.find((b) => depth <= b.maxDepth)
}

// How loudly the player exists, in [0, 1.5].
export function noiseLevel({ speed = 0, maxSpeed = 3, lights = false, engineThrottle = 0, sonarPingAge = Infinity }) {
  let n = (speed / Math.max(maxSpeed, 0.001)) * 0.45
  if (lights) n += 0.35
  n += engineThrottle * 0.5
  if (sonarPingAge < 6) n += (1 - sonarPingAge / 6) * 0.7 // a ping screams
  return Math.min(1.5, Math.max(0, n))
}

// The Hunter's mood from distance to player, in bands.
export function hunterMood(dist, noise) {
  if (dist > HUNTER_TUNING.dreadRadius) return 'dormant'
  if (dist > HUNTER_TUNING.huntRadius) return 'dread'
  if (dist > HUNTER_TUNING.strikeRange + 2 || noise < 0.05) return 'hunting'
  return 'striking'
}
