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

    // Interior layer (idle until the player is inside the sub): a low cabin
    // hum plus an engine tone that follows throttle. All synthesized.
    this.hum = ctx.createOscillator()
    this.hum.type = 'triangle'
    this.hum.frequency.value = 52
    this.humGain = ctx.createGain()
    this.humGain.gain.value = 0
    this.hum.connect(this.humGain)
    this.humGain.connect(this.interior)
    this.hum.start()

    this.engine = ctx.createOscillator()
    this.engine.type = 'sawtooth'
    this.engine.frequency.value = 38
    this.engineFilter = ctx.createBiquadFilter()
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.value = 160
    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0
    this.engine.connect(this.engineFilter)
    this.engineFilter.connect(this.engineGain)
    this.engineGain.connect(this.interior)
    this.engine.start()

    this.inside = false
    if (ctx.state === 'suspended') ctx.resume()
  }

  // Inside the sub the world collapses to a muffled rumble and the cabin
  // comes alive (spec section 7 two-bus design).
  setInside(inside) {
    if (!this.ctx || this.inside === inside) return
    this.inside = inside
    const t = this.ctx.currentTime
    this.exterior.gain.setTargetAtTime(inside ? 0.35 : 1, t, 0.3)
    this.humGain.gain.setTargetAtTime(inside ? 0.1 : 0, t, 0.4)
    if (!inside) this.engineGain.gain.setTargetAtTime(0, t, 0.2)
  }

  // throttle 0..1; only audible inside.
  setEngine(throttle) {
    if (!this.ctx || !this.inside) return
    const t = this.ctx.currentTime
    this.engineGain.gain.setTargetAtTime(throttle * 0.12, t, 0.15)
    this.engine.frequency.setTargetAtTime(38 + throttle * 30, t, 0.15)
  }

  // Throttled to ~5Hz: stacking setTargetAtTime every frame degrades the
  // audio thread (spec section 7: coalesce automation ramps).
  setDepth(depth) {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    if (now - this.lastDepthUpdate < 0.2) return
    this.lastDepthUpdate = now
    // Inside the sub the hull caps everything at a rumble regardless of depth.
    const cutoff = this.inside ? Math.min(cutoffForDepth(depth), 300) : cutoffForDepth(depth)
    this.exteriorFilter.frequency.setTargetAtTime(cutoff, now, 0.25)
  }
}
