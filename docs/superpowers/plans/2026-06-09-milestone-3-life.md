# FATHOM Milestone 3: Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Compact plan format (see M2 plan note).

**Goal:** The ocean is alive: thousands of fish school and flow around the player on GPU boids, kelp sways and coral clusters on the seafloor, and a stimulus system makes the ecosystem react to the player's light and noise.

**Architecture:** Fish are the webgpu_compute_birds pattern adapted to fish: CPU-seeded instancedArrays (position/velocity/phase), an O(n^2) velocity kernel (separation/alignment/cohesion + stimulus forces + vertical containment), a position kernel with player-centered wrap, and a TSL vertex node that orients each fish along its velocity with a spine-wave tail. WebGPU-only (neighbor reads cannot run on the fallback); the WebGL2 path gets ambient fish on parametric circular paths instead (spec section 3). Stimuli are 8 uniformArray vec4 slots (xyz + signed strength) + radius array, managed by a CPU StimulusSystem (decay, slot reuse) and consumed by the fish kernel; the flashlight feeds slot 0 while on. Kelp/coral are two InstancedMeshes whose matrices rebuild from seeded placement (floorY + anchor-carve rejection) over a 7x7 chunk-column window when the player crosses a column boundary; kelp sways via positionNode.

**Tech Stack:** three/tsl uniformArray + Loop (verified present in r184), alea seeding, procedural fish geometry (9 tris, geometry-of-revolution spirit per spec assets rule).

---

### Task 1: Stimulus system (pure, TDD)
- `src/fx/stimulus.js`: 8 slots {pos, strength, radius, ttl}; `push()` reuses expired/weakest slot; `update(dt)` exponential decay + expiry; `setContinuous(slot, pos, strength, radius)` for the flashlight; `writeTo(posArray4, radiusArray)` fills uniformArray values.
- `tests/stimulus.test.js`: slot allocation, decay to expiry, continuous slot stability, writeTo packing.

### Task 2: Fish geometry + school (WebGPU boids)
- `src/fx/fishGeometry.js`: ~9-triangle fish (forward +z, ~1m, computeVertexNormals).
- `src/fx/fishSchool.js`: 5000 fish; seeded Float32Array init (alea, deterministic); velocity kernel (sep 1.2m / align 4m / cohesion 6m, speed cap, stimulus Loop over 8 slots, vertical containment -6..-52m); position kernel (advect + wrap into 160m player box); render material MeshBasicNodeMaterial, positionNode = velocity-aligned mat3 * (local + tail wave by phase), colorNode hash-tinted two-tone; update(renderer, dt, playerPos).
- WebGPU backend only; constructed when `renderer.backend.isWebGLBackend === false`.

### Task 3: Ambient fish (fallback path)
- `src/fx/ambientFish.js`: 800 instanced fish on parametric circles (per-instance hash center/radius/speed/phase), positionNode path + tangent orientation, wraps around player. Used only on the WebGL2 backend.

### Task 4: Kelp and coral
- `src/fx/kelp.js`: `VegetationField(seed, density, ops, uTime)`; 7x7 chunk-column window; per column: alea(`seed:veg:cx:cz`), ~8 kelp + 5 coral candidates at floorY, rejected where stamped water (applyOps < 0 just below floor) or floor deeper than 90m (kelp is a shallow biome); kelp = 6-segment tapered ribbon swaying by height^1.5 in positionNode; coral = low-poly cone clusters, hash-tinted; two InstancedMeshes (1500/600 cap), matrices rebuilt only on column-window change.
- `tests/kelp.test.js`: placement determinism for a column, carve rejection at the anchor site, window diff math.

### Task 5: Flashlight + wiring
- main.js: SpotLight head-mounted (F toggles), feeds stimulus slot 0 (attract small fish, strength +); fish/ambient-fish per backend; kelp window update; stimulus.update each frame; HUD shows fish count.
- Verify both backends in browser (60fps with 5000 boids + 50k snow on WebGPU; ambient fish on WebGL2), screenshots, suite, merge.
