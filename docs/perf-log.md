# FATHOM perf log

## 2026-06-09 Milestone 1 gate (M-series MacBook, Chrome via Playwright)

| Scene | Backend | FPS |
|---|---|---|
| FATHOM infinite ocean (post-M1) | WebGPU | 60 (vsync cap, no drops) |
| FATHOM infinite ocean (post-M1) | WebGL2 (forceWebGL) | 60 (vsync cap, no drops) |
| three.js webgpu_compute_birds (8k boids) | WebGPU | 60 (vsync cap, no drops) |
| three.js webgpu_compute_particles | WebGPU | 60 (vsync cap, no drops) |

Notes:

- All scenes sit at the 60fps vsync cap with zero dropped frames over 3s
  rAF sampling windows. requestAnimationFrame cannot measure above the
  display refresh rate, so "120fps headroom" is not directly observable;
  the meaningful result is that FATHOM AND both ecosystem-budget validator
  examples hold the cap simultaneously on the primary dev machine.
- Streaming stress: a 500m teleport queued 101 chunk jobs and re-settled to
  255 resident chunks (budget band 150-300) with no fps drop.
- Gate (spec section 4): PASS on the M-series Mac. Intel Iris Xe numbers
  remain projections until a Windows laptop is borrowed (pre-launch task).

## 2026-06-09 Post-review fixes (same machine)

Adversarial review (19 agents) confirmed and fixed: FogExp2 exponential-squared
density formula (fog wall was at 0.506x the designed distance), stale-result
mesh leak in chunk streaming (generation token), per-column floor noise
precompute, indexed welded mesher output, worker error rejection path,
vertical speed cap, HUD write throttle, preset chunk bounding spheres,
visibility-tracking far plane.

| Metric | Before | After |
|---|---|---|
| Surface chunk generation (avg) | ~11.3ms (over 10ms budget) | 5.40ms |
| Surface chunk generation (max of 40) | ~12.6ms | 6.57ms |
| Empty chunk generation | ~6.9ms | 3.46ms |
| Vertices per ~4k-tri chunk | ~12,200 (soup) | ~2,100 (welded + indexed) |
| FATHOM fps (WebGPU / WebGL2) | 60 / 60 | 60 / 60 |
