// Stimulus system (spec section 5 ecosystem): a small fixed pool of
// attract/repel points shared by the GPU ecosystem passes. CPU manages slots
// and decay; writeTo() packs them for uniformArray consumption.
// strength > 0 attracts, < 0 repels; expired slots have strength 0.

export const STIMULUS_SLOTS = 8

export class StimulusSystem {
  constructor() {
    this.slots = []
    for (let i = 0; i < STIMULUS_SLOTS; i++) {
      this.slots.push({ x: 0, y: 0, z: 0, strength: 0, radius: 1, ttl: 0, continuous: false })
    }
  }

  // Transient event (impact, sonar ping, noise): decays over ttl seconds.
  push(pos, strength, radius, ttl = 3) {
    // pick the first expired slot, else the weakest non-continuous one
    let best = null
    for (const s of this.slots) {
      if (s.continuous) continue
      if (s.ttl <= 0) {
        best = s
        break
      }
      if (!best || Math.abs(s.strength) < Math.abs(best.strength)) best = s
    }
    if (!best) return
    Object.assign(best, { x: pos.x, y: pos.y, z: pos.z, strength, radius, ttl, continuous: false })
  }

  // Persistent emitter (flashlight cone focus point). Slot stays until cleared.
  setContinuous(index, pos, strength, radius) {
    const s = this.slots[index]
    Object.assign(s, { x: pos.x, y: pos.y, z: pos.z, strength, radius, ttl: Infinity, continuous: true })
  }

  clearContinuous(index) {
    const s = this.slots[index]
    s.continuous = false
    s.ttl = 0
    s.strength = 0
  }

  update(dt) {
    for (const s of this.slots) {
      if (s.continuous || s.ttl <= 0) continue
      s.ttl -= dt
      if (s.ttl <= 0) {
        s.strength = 0
        s.ttl = 0
      } else {
        s.strength *= Math.exp(-1.2 * dt) // fades audibly fast (2-5s events)
      }
    }
  }

  // posArray4: array of Vector4-likes (xyz + strength in w).
  // radiusArray4: array of Vector4-likes (radius in x; yzw unused). Both are
  // typically the backing arrays of TSL uniformArray nodes, mutated in place.
  writeTo(posArray4, radiusArray4) {
    for (let i = 0; i < STIMULUS_SLOTS; i++) {
      const s = this.slots[i]
      posArray4[i].set(s.x, s.y, s.z, s.ttl > 0 ? s.strength : 0)
      radiusArray4[i].set(s.radius, 0, 0, 0)
    }
  }
}
