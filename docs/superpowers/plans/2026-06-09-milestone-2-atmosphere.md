# FATHOM Milestone 2: Atmosphere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Note: compact plan format (contracts + formulas, not full code listings); Neil
> directed fully autonomous milestone execution, and the implementer is the
> author. TDD still applies to every pure module.

**Goal:** The ocean feels alive and deep: light and color fade with depth, marine snow drifts everywhere, the surface glows overhead, caustics dance in the shallows, an ambient audio bed muffles as you sink, and the first authored anchor site (a wreck clearing) is stamped into the infinite terrain.

**Architecture:** Depth-driven scene grading lives in pure functions (waterColor.js, audio cutoff). Marine snow is a TSL compute particle system (map-style kernel, setPBO, fallback-safe) wrapped in a player-centered box. Caustics are a TSL colorNode on the terrain material (noise ridges masked by depth and up-facing normals). Anchors are world-space SDF ops (carve = min(d, s), add = max(d, -s)) applied inside chunkGen after the base density, cached per seed.

**Tech Stack:** three@0.184.0 three/webgpu + three/tsl (patterns copied from pinned r184 examples webgpu_compute_particles + webgpu_compute_birds), Web Audio API (synthesized brown-noise bed; no assets).

---

### Task 1: Depth-graded water color (pure, TDD)
- Create `src/world/waterColor.js`: `colorAtDepth(depth) -> [r,g,b]` piecewise-lerped through stops (0m teal 0x0a4d66 to 800m near-black 0x000204); `lightFalloff(depth) = max(exp(-depth/90), 0.02)`.
- Test `tests/waterColor.test.js`: endpoints match stops, relative luminance strictly non-increasing every 25m to 900m, falloff bounds.

### Task 2: Audio engine foundation (pure math TDD; graph browser-verified)
- Create `src/engine/audio.js`: `cutoffForDepth(depth) = 18000 * (500/18000)^(min(depth/800,1))`; class `AudioEngine` (lazy ctx on first user gesture): exterior bus (gain -> lowpass -> master), interior bus (gain -> master, idle until M5), synthesized brown-noise ambient bed + 0.05Hz LFO swell on the exterior bus; `setDepth()` throttled (coalesced setTargetAtTime).
- Test `tests/audio.test.js`: cutoff monotonic decreasing, 18kHz at 0m, ~500Hz at 800m+, throttling logic.

### Task 3: Marine snow (TSL compute)
- Create `src/fx/marineSnow.js`: `MarineSnow(count)` with instancedArray positions (setPBO(true)), init kernel (hash-scatter in 90m box), update kernel (per-particle sink speed 0.12-0.37 m/s, sinusoidal drift, wrap into player-centered 90m box via floor-mod), SpriteNodeMaterial (shapeCircle, fog on, depthWrite off), `update(renderer, dt, time, playerPos)`.
- Counts: 50k default, 8k with ?q=low.
- Verify in browser on BOTH backends (this is the fallback-safe compute path).

### Task 4: Caustics + terrain material
- Create `src/fx/terrainMaterial.js`: `createTerrainMaterial(uTime)` returning MeshStandardNodeMaterial; colorNode = base * (1 + caustic * shallowMask * upMask): two scrolling mx_noise_float octaves squared into ridges, shallowMask = 1 - clamp(depth/100), upMask = clamp(normalWorld.y). ChunkManager takes the material as a constructor arg (material creation leaves chunkManager).
- Browser-verify shimmering light on shallow up-facing terrain, none below 100m.

### Task 5: Surface from below + sun glow
- Create `src/fx/surface.js`: 4000m bright plane at y=0 facing down (fog on) following the player on x/z; additive radial-gradient sprite (canvas texture) as the sun glow, opacity scaled by lightFalloff(depth).

### Task 6: Anchor stamping pipeline (pure, TDD)
- Create `src/world/anchors.js`: `sdBox`, `applyOps(d, ops, x,y,z)` (carve = min(d, sdf), add = max(d, -sdf)), `anchorsForSeed(seed, density)` returning the M2 test site: a 28m carved clearing at (64, floor, 64) with three added debris boxes (hull chunk, crate row, beam), all placed off floorY(64,64).
- Integrate in `src/world/chunkGen.js`: cache ops per seed; apply only when the op AABB (padded 80m) intersects the chunk; world-space ops keep chunk borders consistent.
- Test `tests/anchors.test.js`: sdBox signs, carve makes water inside / add makes solid, generateChunk determinism with anchors, adjacent-chunk border vertex equality across the site, far-away chunks byte-identical to pre-anchor output.

### Task 7: Wiring + verification
- main.js: per-frame depth grading (background, fog color, sun + hemi intensity), marine snow update, surface follow, audio start on first canvas click (same gesture as pointer lock), ?q= quality param.
- Full suite + forceWebGL smoke + browser screenshots (shallow vs 200m) + perf check (60fps with 50k particles both backends) + commit + merge.
