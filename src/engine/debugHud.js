const WRITE_INTERVAL = 0.15 // seconds; DOM writes throttled to ~7Hz

export class DebugHud {
  constructor(el) {
    this.el = el
    this.fps = 60
    this.sinceWrite = Infinity // write immediately on first update
  }

  update(dt, info) {
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05 // smoothed every frame
    this.sinceWrite += dt
    if (this.sinceWrite < WRITE_INTERVAL) return // throttle DOM/string work
    this.sinceWrite = 0
    this.el.textContent =
      `FATHOM dev | ${info.backendName}\n` +
      `fps ${this.fps.toFixed(0)}\n` +
      `depth ${(-info.pos.y).toFixed(1)}m  vis ${info.visibility.toFixed(0)}m\n` +
      `pos ${info.pos.x.toFixed(0)}, ${info.pos.y.toFixed(0)}, ${info.pos.z.toFixed(0)}\n` +
      `chunks ${info.residentChunks} resident, ${info.pendingJobs} generating\n` +
      `seed ${info.seed}`
  }
}
