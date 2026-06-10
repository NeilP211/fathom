export class DebugHud {
  constructor(el) {
    this.el = el
    this.fps = 60
  }

  update(dt, info) {
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05 // smoothed
    this.el.textContent =
      `FATHOM dev | ${info.backendName}\n` +
      `fps ${this.fps.toFixed(0)}\n` +
      `depth ${(-info.pos.y).toFixed(1)}m  vis ${info.visibility.toFixed(0)}m\n` +
      `pos ${info.pos.x.toFixed(0)}, ${info.pos.y.toFixed(0)}, ${info.pos.z.toFixed(0)}\n` +
      `chunks ${info.residentChunks} resident, ${info.pendingJobs} generating\n` +
      `seed ${info.seed}`
  }
}
