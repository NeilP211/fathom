// Two-bus audio architecture (spec section 7). The AudioContext is created
// suspended-by-default semantics: nothing is constructed until the first user
// gesture calls start(), or the whole horror channel silently fails.

// Exterior lowpass cutoff by depth: 18kHz at the surface gliding to 500Hz at
// 800m (exponential, so each band sounds progressively more muffled).
export function cutoffForDepth(depth) {
  const t = Math.min(depth / 800, 1)
  return 18000 * Math.pow(500 / 18000, t)
}

// Brown noise: leaky-integrated white noise, the classic deep-water bed.
function fillBrownNoise(channel) {
  let last = 0
  for (let i = 0; i < channel.length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    channel[i] = last * 3.5
  }
}

export class AudioEngine {
  constructor() {
    this.ctx = null
    this.lastDepthUpdate = 0
  }

  get started() {
    return this.ctx != null
  }

  // Call from a user gesture (title/canvas click).
  start() {
    if (this.ctx) return
    const ctx = new AudioContext()
    this.ctx = ctx

    this.master = ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(ctx.destination)

    // Exterior bus: world sounds, lowpassed by depth and (M5) by being inside
    // the sub. Interior bus: cockpit sounds, always clear.
    this.exteriorFilter = ctx.createBiquadFilter()
    this.exteriorFilter.type = 'lowpass'
    this.exteriorFilter.frequency.value = cutoffForDepth(0)
    this.exteriorFilter.connect(this.master)

    this.exterior = ctx.createGain()
    this.exterior.gain.value = 1
    this.exterior.connect(this.exteriorFilter)

    this.interior = ctx.createGain()
    this.interior.gain.value = 1
    this.interior.connect(this.master)

    // Ambient bed: 4s looping brown noise with a slow LFO swell.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
    fillBrownNoise(buffer.getChannelData(0))
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    noise.loop = true

    this.bedGain = ctx.createGain()
    this.bedGain.gain.value = 0.16
    noise.connect(this.bedGain)
    this.bedGain.connect(this.exterior)

    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.05
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.06
    lfo.connect(lfoGain)
    lfoGain.connect(this.bedGain.gain)

    noise.start()
    lfo.start()
    if (ctx.state === 'suspended') ctx.resume()
  }

  // Throttled to ~5Hz: stacking setTargetAtTime every frame degrades the
  // audio thread (spec section 7: coalesce automation ramps).
  setDepth(depth) {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    if (now - this.lastDepthUpdate < 0.2) return
    this.lastDepthUpdate = now
    this.exteriorFilter.frequency.setTargetAtTime(cutoffForDepth(depth), now, 0.25)
  }
}
