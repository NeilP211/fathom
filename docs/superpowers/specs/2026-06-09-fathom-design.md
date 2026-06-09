# FATHOM - Design Document

Date: 2026-06-09
Status: approved by Neil (brainstorming session, all three design rounds signed
off). Revised same day after a three-lens adversarial review (consistency,
implementability, scope): 30 findings fixed, including 6 blockers.

## 1. Vision

An infinite procedurally generated ocean in the browser. The player is a salvage
diver investigating why the Meridian deep-survey expedition went silent eight
months ago. They scavenge the sunlit shallows, build a one-person submersible,
and descend through ever-darker depth bands to piece together what happened,
while something that can hear their engine hunts them.

One sentence: Subnautica's loop, browser-native, WebGPU-powered, built solo.

- Genre: survival-horror exploration with an environmental-mystery storyline
- Tone: horror-forward (tense from early on; dread through atmosphere, not jumpscares)
- Length: a complete experience targeting 2 hours (4 as stretch), persistent save
- Platform: desktop browser, keyboard + mouse, 60fps target
- Target hardware: M-series MacBooks and mid-range Windows laptops (Intel Iris Xe class)

## 2. Decisions already made

These were explicit user choices during brainstorming. Do not relitigate them.

| Decision | Choice |
|---|---|
| Direction | Visually jaw-dropping browser experience |
| World | Infinite procedural living ocean |
| Experience | Storyline blending exploration and discovery |
| Story delivery | Environmental mystery (no cutscenes; story IS discovery) |
| Tone | Horror-forward |
| Stakes | Hunted + oxygen |
| Structure | Persistent survival save (multi-hour, upgrades, resupply) |
| Player body | Diver who builds a sub |
| Tech | WebGPU-first (option B), three.js |
| Title | FATHOM |

## 3. Renderer strategy

- three.js pinned at exactly `three@0.184.0` (r184, current stable as of 2026-06-09).
  Upgrade one release at a time, re-reading the migration guide each time.
- Import exclusively from `three/webgpu` and `three/tsl`. Never import bare
  `three` anywhere in the app: it silently bundles a second copy of the library
  (the WebGL build) and breaks instanceof checks.
- WebGPU-first with the automatic WebGL2 fallback left ON. `WebGPURenderer`
  falls back to a WebGL2 backend by itself and TSL node materials transpile to
  GLSL, so one codebase covers both. Detect the active backend after
  `await renderer.init()` via `renderer.backend.isWebGLBackend`.
- The fallback is a degraded compatibility tier, not a parity target:
  - TSL `compute()` on WebGL2 is transform-feedback emulation. It can only run
    map-style kernels (each invocation writes its own `instanceIndex` element).
    No neighbor reads, no atomics, no workgroup memory or barriers, no storage
    textures, no scatter writes, no indirect or multi-dimensional dispatch.
  - Consequence: the boids fish simulation is WebGPU-only. On the fallback,
    fish swim on precomputed paths as plain instanced meshes and particle
    counts drop. The game must remain fully playable.
  - Any storage node a render shader reads on the fallback path needs
    `setPBO(true)` or it renders garbage only on fallback machines.
- Boot sequence: check `navigator.gpu` exists AND
  `await navigator.gpu.requestAdapter() !== null` (the adapter can be null on
  driver-blocklisted mid-range Windows laptops even when navigator.gpu exists).
  Show a small "Renderer: WebGPU / WebGL2" badge in the UI.
- Always `await renderer.init()` (or rely on `setAnimationLoop`) before any
  render or compute call. `computeAsync`/`renderAsync` are deprecated (r181).
- Pre-adapt to already-published r185 changes: set an opaque scene background /
  clear color from day one (premultiplied-alpha change), use `Timer` not
  `Clock`, `BloomNode` not `AnamorphicNode`, `RenderPipeline` not
  `PostProcessing` (PostProcessing is the r185 rename; the r168-r183 renames
  are listed separately in section 13).
- Hosting: HTTPS only (GitHub Pages). WebGPU silently disappears
  (`navigator.gpu` undefined) on insecure non-localhost origins, so LAN-IP
  demos in the style of earlier projects will not work. Localhost dev is fine.
- Build tool: Vite, no special config.

### Browser support reality (verified 2026-06-09)

- Chrome/Edge 113+ (Win/Mac): WebGPU since May 2023. Primary tier.
- Safari 26 (macOS Tahoe, iOS 26): shipped Sept 2025. Macs that cannot run
  Tahoe have NO WebGPU in Safari at all (Chrome/Firefox on the same Mac do).
- Firefox: Windows since 141 (July 2025); Apple Silicon Macs since 145/147;
  Intel Macs and Linux: no default WebGPU as of mid-2026.
- Net: a recruiter on a random 2024-2026 laptop hits WebGPU roughly 90% of the
  time; the WebGL2 fallback covers the rest. Linux is explicitly not a target.

## 4. Infinite world

### Terrain

- A 3D density field: 2D fractal-noise seafloor heightfield converted to
  density, plus 3D noise carve for caves, overhangs, and arches. Real geology,
  not a heightmap.
- Meshed with marching cubes in 32^3-voxel chunks (32m at 1m voxels). Corner
  samples come from a 35^3 grid (a one-voxel apron on every side): the 33^3
  corner lattice meshes the cells and shares border planes so positions match
  across chunks, and the apron makes central-difference gradient normals valid
  at border vertices. Without the apron, positions line up but normals seam,
  producing visible lighting cracks at every chunk border.
- Naive surface nets is the approved drop-in swap if triangle counts hurt
  (roughly half the triangles). three.js's bundled MarchingCubes addon is a
  metaballs toy, not a terrain mesher; implement chunked marching cubes
  ourselves (study softxels, github.com/danielesteban/softxels, first).
- Generation runs in a Web Worker pool (`navigator.hardwareConcurrency - 1`
  workers), returning positions/normals/indices as transferable ArrayBuffers
  (always pass the transfer list; structured-clone copies silently double
  memory). Main thread assembles BufferGeometry, capped at 2-4 chunk uploads
  per frame. Skip fully-empty / fully-solid chunks by testing density min/max
  before meshing.
- CPU generation is the single source of truth. GPU float math is not
  reproducible across vendors, so no GPU-computed value may ever leak into
  world-gen truth or saves. GPU compute is for visuals only (particles, boids),
  not terrain, in v1.
- No runtime terrain edits ship in v1 (deformation is cut). Anchor templates
  (section 6) are stamped into the density field at generation time, so chunk
  invalidation machinery is dev-tooling only: the anchor authoring hot-reload
  regenerates dirty chunks in dev builds.

### Fog and visibility (the load-bearing trick)

- Visibility is defined as the distance at which FogExp2 transmittance drops
  below 2% (fog density = -ln(0.02) / visibility).
- Visibility is a per-depth-band curve, not a constant: 96m maximum at the
  Shelf, shrinking with depth toward near-zero at the Floor. Murk is
  simultaneously the horror, the performance budget, and the infinite illusion.
- Invariant: chunk load radius (in chunks) = ceil(visibility / 32) + 1, so
  there is always at least one fully loaded chunk ring beyond the fog wall to
  hide pop-in. At the 96m maximum this is radius 4: 150-300 resident chunks,
  2k-5k triangles per surface chunk, 300k-800k resident triangles total.
- This budget holds 60fps with NO mesh LOD system, which dodges marching
  cubes' hardest problem (Transvoxel seam stitching).
- Large-creature silhouettes spawn at exactly the visibility distance (the
  documented thalassophobia trigger). The light gradient overhead is the one
  reliable "which way is up" cue, until the Floor takes it away.
- Fog distance is a gameplay AND performance dial: resident chunks grow with
  the cube of radius. Do not raise visibility casually.

### Determinism and extent

- One uint32 world seed feeds `alea` PRNG instances feeding
  `simplex-noise@4.0.3` (`createNoise2D`/`createNoise3D`). API trap: each
  createNoise call needs its own fresh alea instance.
- Same seed regenerates the identical ocean on every load. Saves store diffs
  only, never terrain.
- The ocean is infinite in every horizontal direction. Depth is structured down
  to an abyssal floor at roughly 800m where the finale lives.

### Collision and movement

- Collision is density-field collision, not mesh collision and not a physics
  engine: the CPU density function is already the single source of truth, so
  the diver capsule, the sub capsule, predator steering, and sonar terrain
  queries all sample it directly. Penetration resolution pushes along the
  density gradient (central differences). No triangle raycasts in the movement
  path.
- Movement is a simple kinematic model: acceleration toward input direction,
  exponential drag, mild negative buoyancy when idle (slow sink reads as
  underwater), and a vertical speed slightly below horizontal speed. All
  constants are named tuning values: diver max speed ~3 m/s, sub MK1 ~6 m/s
  (tiers raise it), drag, acceleration.
- Predator pathing steers by sampling the density field ahead (no navmesh).

### The surface

- The camera is permanently clamped underwater. The "surface" is a bright
  animated plane seen from below; the buoy interaction happens at about -1m.
  Above-water rendering (sky, waves, horizon) is out of scope (section 12).

### Performance budgets (designed against, not hoped for)

- Terrain render: well under 8ms of the 16.6ms frame.
- Worker generation: <= 10ms per chunk; ~8 chunks/s sustained at swim speed,
  ~25 chunks/s at sub speed.
- Week-1 validation gate, on hardware that actually exists in this household:
  the official three.js r184 8k-boid example plus a 200k-particle example
  simultaneously on the M-series MacBook in Chrome must hold WELL above 60fps
  (target 120fps headroom, since the Mac is roughly 2x the floor hardware),
  plus the same scene under `forceWebGL: true`. Re-validate on a real Intel
  Iris Xe Windows laptop (borrow one) before public launch; until then treat
  Iris Xe numbers as projections.

## 5. Gameplay systems

### Controls and camera

- Strictly first-person, both as diver and in the sub. Pointer Lock API on
  canvas click for mouse-look (mandatory in a browser).
- Diver: WASD relative to look direction, Space ascend, Shift descend (C as
  alternate), F flashlight toggle, E interact (hold E to scan with the scanner
  equipped), Tab inventory/journal, Esc releases pointer lock / pause.
- Sub: same WASD + Space/Shift scheme (it pilots like a heavier, faster
  diver), F floodlights, Q sonar ping, E interact (dock, pick up with the
  claw), G drop a flare decoy.
- Enter/exit: E at the sub hatch. Disembarking is allowed at any depth, but
  the diver suit has its own pressure rating (see depth bands), so exiting
  below suit rating means taking pressure damage on a timer. This makes
  deep-water exits a desperate, deliberate choice instead of a hard block.

### Core loop

Dive, scavenge, scan, surface, craft, go deeper. The player must complete one
full loop iteration (dive, grab scrap, surface, craft something at the buoy
fabricator) within the first five minutes. Oxygen starts brutally short (about
45 seconds). Upgrades buy reach; they never remove the fear.

### The start

- New game spawns the player at the surface buoy, placed deterministically at
  world origin. The buoy is three things: the pre-sub save point, the
  fabricator (crafting station), and the radio (story signals arrive here
  until the sub is built, then also in the sub).
- The scanner is NOT scan-gated (bootstrap carve-out): its blueprint is known
  from the start as the salvage contractor's standard kit. The first five
  minutes are: dive, grab scrap, surface, fabricate the scanner. Every other
  blueprint unlock comes from scanning.
- Crafting happens at the buoy fabricator and, once built, in the sub.

### Depth bands

| Band | Depth | Character |
|---|---|---|
| The Shelf | 0-100m | Bright, safe, teaching zone. Reefs, kelp, scrap fields, first wrecks. |
| The Dusk | 100-300m | Dim. The predator appears. Sub strongly recommended below. |
| The Dark | 300-600m | Hunter territory. Bioluminescence only. Hull MK2 required. |
| The Floor | 600-800m+ | Story climax. Instruments degrade. Sonar-only navigation in absolute black (the new mechanic that prevents a late-game plateau). |

- Hard gates: hull crush depth (MK1: 300m, MK2: 600m, MK3: 900m), with an
  audible hull-stress warning BEFORE damage starts. The game warns, then kills.
- The diver has an explicit pressure rule: the suit rating (Tier 1: 100m,
  Tier 2: 200m, both tuning values) is the free-swim limit; below it the diver
  takes escalating pressure damage. Oxygen-tank upgrades therefore cannot
  bypass the hull-tier progression; the deep belongs to the sub.
- Soft gates: oxygen (diver), power (sub).
- At the Floor, instruments degrade concretely: the compass spins, the depth
  gauge stutters and occasionally lies (which doubles as foreshadowing,
  section 6), floodlight range is halved, and sonar becomes the primary
  navigation sense.

### Scanner as tutorial, signals as quests

- Zero tutorial screens. Every blueprint unlock (except the starter scanner)
  comes from scanning wreck fragments or creatures; each scan writes a journal
  entry that explains itself.
- The entire quest system is 5-8 radio signals, each pulling the player one
  band deeper and carrying the mystery. Trigger rule: the next signal fires
  when the previous site's log is recovered (plus a short delay).
- Wayfinding: the HUD compass strip shows a bearing chevron and distance
  readout for the active signal, and the journal lists all received signals.
  Signals are received at the buoy radio and in the sub.
- Every mandatory blueprint sits at a signal site. No RNG-hidden critical
  path; only optional upgrades are hidden in the procedural wild.

### The sub IS the base

- Start as a diver: suit, tanks, fins, scanner, flashlight upgrades.
- Mid-game: assemble one submersible at a salvage cradle (a signal site). It
  is the mobile base: save point, oxygen refill, large storage (resource
  ferrying must never happen), and the safe room.
- The interior is NOT a walkable space: entering the sub swaps to a fixed
  first-person cockpit camera and the sub control scheme; storage, crafting,
  and saving are UI panels from the cockpit. (A walkable interior is weeks of
  scope for zero mechanical gain; explicitly cut, section 12.)
- Sub hull integrity is a stat. It is damaged by exceeding crush depth and by
  Hunter strikes (predators harass the diver, not the hull). The cockpit is
  physically safe (nothing reaches inside) but NOT unconditionally safe: the
  sub around you can be wounded. Repair: a crafted repair tool, used while
  parked, restores integrity. Hull state persists in the save.
- Power: drained by the engine, floodlights, and sonar. One replenishment
  path: the reactor trickle-recharges automatically above 20m depth (sunlight)
  and recharges fast when docked at the buoy. Crafted spare power cells are
  explicitly out of scope (keeps the cut power economy cut).
- Explicitly cut (Subnautica's documented scope killers): base building,
  food/water, multiple vehicles, farming/power economy, persistent terrain
  deformation.
- Three hull tiers must change the FEEL (speed, light radius, engine sound,
  creak behavior), not just a number, or the mid-game plateau critique applies.

### Death and consequences

- Oxygen at zero: vision tunnels and blacks out over ~5 seconds (one last
  chance to surface), then death.
- Damage sources (all tuning values): predator hits, Hunter strikes (lethal in
  2-3 hits to a diver), pressure damage below suit rating, crush damage below
  hull rating (to the sub).
- Death = rollback to the last save: respawn at the most recent save point
  (buoy or sub) with the exact saved state. Anything gained since the last
  save is lost; nothing additional is taken. This is coherent, brutal enough
  for horror stakes, and free to implement on top of the save system.
- Oxygen refills passively at the surface, at the buoy, and inside the sub.

### HUD and UI

One deliberately minimal overlay style (clean monospace-adjacent type over
dark translucent panels; diegetic-leaning, no cartoon game chrome). Every
screen in the game, enumerated so none get invented mid-milestone:

- Dive HUD: oxygen bar (dominant), depth readout, health, compass strip with
  signal bearing chevron, subtle suit-rating warning state.
- Sub HUD: power, hull integrity, depth, crush-warning state, compass strip,
  sonar cooldown.
- Inventory: a flat list with counts (no grids, no drag-and-drop, no Tetris).
  Transfer between diver and sub storage is a two-pane list.
- Crafting: a list of recipes; click to craft if resources suffice; greyed
  rows show missing ingredients. Same panel at buoy and sub.
- Journal: full-screen text panel with three tabs: scans (blueprint lore),
  story logs (recovered Meridian logs), signals (received, with bearings).
- Title screen (click to start: doubles as the AudioContext resume gesture),
  pause/settings (volume, quality preset, invert Y, renderer badge), death
  screen (fade to black, "RECOVERED AT LAST SAVE"), credits after the finale.
- Debug HUD (dev builds): frame time, resident chunks, worker queue depth,
  compute dispatches, position/depth/seed.

### Ecosystem

- 5,000-8,000 schooling fish in one TSL compute velocity+position pass over
  `instancedArray` buffers (copy the `webgpu_compute_birds` pattern, which is
  naive O(n^2) and proven at 8,192 agents). Do not exceed ~10k fish without
  adding a spatial grid (cost grows quadratically).
- Fish render as InstancedMesh (300-800 tris each); the material reads the
  position/velocity buffers and applies procedural spine-wave swim deformation
  in the vertex stage (phase from a position hash, amplitude masked toward the
  tail). No vertex animation textures, no skeletons, anywhere in the game.
- ~150k ambient particles (50k marine snow + bubbles + bioluminescent plankton
  that lights when disturbed), expandable to 250k on M-series via a quality
  setting. Keep total compute dispatches per frame under 6.
- Stimulus system: one uniform array (16 x vec4 position+strength, plus
  radius/decay/cone data) shared by fish and particle passes. Floodlight is a
  persistent cone attractor for small fish. Engine noise, sonar pings, and
  impacts push decaying stimuli (2-5s). The ecosystem visibly reacts to the
  player: this is both the beauty channel and the horror channel.
- ONE predator archetype, parameterized per depth band (size, color, sense
  keying, aggro tuning on the same mesh and state machine). 2-4 instances
  alive near the player, simulated on CPU as ordinary entities (state
  machines, density-field steering, aggro), injected into the fish pass as
  fear/repulsion uniforms. Fish scatter around a cruising predator, so the
  player often sees the wake before the predator. Distinct predator species
  are out of scope (section 12).
- Never read per-fish state back to the CPU (async readback stalls). Any
  gameplay rule must not require per-fish CPU knowledge; fake density queries
  from spawn-region metadata if needed.

### The Hunter

- One leviathan-class creature. Not a roster.
- Territorial: its lair is seeded deterministically from the world seed,
  persistent in the save, learnable across sessions. Random ambushes read as
  unfair; a known dread-zone the route crosses reads as horror.
- Audio-first, with explicit radii (tuning values): hunt radius = mesh radius
  ~80m (inside this it has a body and an HRTF positional voice); outer dread
  radius 2-3x hunt radius (~160-240m) with distant non-positional rumble
  stingers and music ducking. The player must hear it across multiple sessions
  before ever seeing it.
- Senses light and sound: floodlight and engine are beacons. Counterplay is
  evasion, going dark, and flare decoys exploiting its light attraction.
- Built cheap by design: a low-poly silhouette mesh (CC0 source or simple
  authored geometry) animated by the same procedural spine-wave vertex
  deformation as the fish. No skeleton, no keyframes. The fog and never-fully-
  lit rule mean silhouette + sound IS the creature.
- Never shown in full light; stats never published. It is evidence, not just
  hazard (see story): players cheese or mod away monsters that serve no story.
- No combat depth anywhere: evasion, decoys, and repel tools only. Fun combat
  converts fear into mastery (Frictional).

### Light and sonar as risk-reward

- Darkness has real cost (cannot read terrain or spot resources), so the
  floodlight dilemma stays live: light to see = be seen.
- Sonar ping renders terrain through fog as a fading wireframe pulse. Tuning
  values: range ~150m, fade ~6s, cooldown ~4s, a visible power cost, and an
  aggro check radius on sound-sensitive creatures.
- The predator archetype keys on light in some bands and sound in others, so
  counterplay varies by zone; the Hunter senses both.

## 6. Story

### Premise

Eight months ago the Meridian deep-survey expedition stopped transmitting. The
player is the salvage contractor sent to find out why. The answer is at the
bottom: the expedition drilled into something at the Floor and woke it.

### Structure

- Degasi-breadcrumb pattern: a chain of authored wreck dioramas (5 sites,
  hard cap), each with a short recovered log and a bearing to the next site,
  always deeper.
- Logs are text-only (styled terminal/notebook UI). No voice acting, ever.
- Log tone degrades with depth: optimism, unease, dread, silence.
- Foreshadowing through instruments: sonar contacts too large for the display,
  a ping that returns twice, a depth reading where there should not be a floor.
- The Hunter is evidence: understanding the creature IS solving the mystery.
- Ending: recover the final evidence core at ~800m and survive the ascent in
  the sub (one scripted hunted-climb finale: Hunter strikes disable systems
  one by one, hull holds, sonar-guided climb), then credits and a free-dive
  postgame.

### Authored content in an infinite world (the core design tension, resolved)

Depth-as-progression normally relies on hand-authored worlds; pure procedural
oceans feel empty, not scary. The fix is a deterministic anchor layer on top of
the procedural stream: signal sites, wreck dioramas, the Hunter's lair, and
calm sanctuary pockets are hand-authored templates, placed by the world seed at
guaranteed depths and distances and stamped into the terrain density field.
Generation explicitly guarantees calm zones between hostile depth bands so
dread-release pacing survives procedurality.

The authoring format is defined NOW, not at milestone 7, because it is the
hidden tooling subproject: an anchor template is (1) a code-defined list of
SDF primitives (box/sphere/capsule, add or subtract) stamped into the density
field, plus (2) a JSON prop-placement list (model id, position, rotation,
loot/log id). Authored live in-engine: a dev fly-cam plus hot reload that
regenerates dirty chunks. One stamped test site ships as part of milestone 2
terrain work to prove the pipeline early.

## 7. Audio architecture

- Two buses, not one master filter (an earlier draft said one master lowpass;
  that cannot simultaneously muffle the ocean and keep the cockpit clear):
  - Exterior bus: all world sounds. Its lowpass cutoff maps to depth (the
    ocean muffles as you sink) and drops hard when the player is inside the
    sub (the world becomes a distant rumble through the hull).
  - Interior bus: cockpit sounds (instruments, hums, UI, your own breath),
    always warm and clear. The safe-room feeling is made of this contrast.
- One shared ConvolverNode reverb with a short impulse on a send bus for
  hull/interior spaces. Never per-source convolvers.
- three.js PositionalAudio defaults EVERY instance to HRTF panning; override
  `panner.panningModel = 'equalpower'` for all ambient emitters. Strict budget
  of 4-8 simultaneous HRTF sources reserved for the Hunter, sonar contacts, and
  hull creaks. Moving sources are the worst HRTF case; keep fast creatures off
  HRTF except the Hunter's close-range voice.
- AudioContext created suspended; `resume()` on the first user gesture (title
  screen click). Otherwise the entire horror channel silently fails.
- Coalesce music-ducking ramps; do not stack setTargetAtTime every frame.
- Music: 2-4 CC-licensed ambient/drone tracks with simple gain ducking driven
  by Hunter proximity and depth band. Not a composed adaptive score.

## 8. Assets (sourcing strategy, decided up front)

Hard rule: nothing in the game may require skeletal animation, keyframe
animation, or custom 3D modeling skill. Everything animates procedurally
(vertex deformation in TSL) or not at all.

- Terrain, kelp, coral, scrap, rocks: procedural geometry (noise-displaced
  primitives, instanced), generated in code.
- Fish, predator, Hunter, sub, buoy, wreck props: CC0 low-poly models
  (Quaternius, Kenney, Sketchfab CC0 filter) or simple authored
  geometry-of-revolution, deformed procedurally. Budget: one fish family
  re-tinted per band, one predator mesh, one Hunter mesh, one sub, one buoy,
  roughly 10 wreck props reused across dioramas.
- SFX: Freesound CC0 + Web Audio synthesis (sonar ping, UI, creaks are
  synthesizable). Engine/creak variants per hull tier come from pitch/filter
  processing of the same base samples, not new recordings.
- Music: 2-4 CC ambient drone tracks (Free Music Archive / CC0 sources).
- Fonts: one open-license face (e.g. a clean mono from Google Fonts).
- An ASSETS.md ledger records every asset's source and license at the moment
  it enters the repo.

## 9. Persistence

- IndexedDB (localStorage's ~5MB cap is too small and synchronous), keyed to
  the world seed. Four buckets:
  1. player: position, health, oxygen, inventory, suit tier
  2. progression: unlocked blueprints, crafted upgrades
  3. story: fired signals, found logs, scanned lore IDs
  4. world diffs: consumed resource nodes, triggered events, sub position,
     upgrades, and hull integrity
- Terrain is never serialized; the seed regenerates it.
- Save semantics: one slot per seed. Autosave fires on entering the buoy zone
  or the sub cockpit; no manual save UI. Progress since the last autosave is
  intentionally lost on death or tab close (the game says so on the death
  screen).
- Save points double as oxygen refill points (buoy, sub).

## 10. Milestones

Each milestone ends playable in the browser, verified, AND passes the
`forceWebGL: true` smoke test (the fallback is exercised every milestone, not
just before ship).

1. Swim in an infinite ocean: Vite + r184 WebGPU/fallback boot, worker
   marching-cubes terrain, density-field collision, pointer-lock dive
   controller, fog/visibility system. Includes the week-1 performance gate
   (section 4) on the M-series MacBook.
2. Atmosphere: depth-graded light and color, marine snow, surface-from-below
   plane with sun shafts, cheap projected-noise caustics in the Shelf, base
   audio bed (two buses + depth lowpass), AND the first stamped anchor test
   site (proves the SDF authoring pipeline early).
3. Life: GPU fish schools, instanced kelp/coral, stimulus system, debug HUD.
4. Survival: oxygen, health, damage, death/respawn, scanner, fragments,
   crafting at the buoy, inventory, dive HUD, journal, first two signals with
   stub sites (seeded coordinates + a loot crate; upgraded to dioramas in
   milestone 7), AND minimal save/load (player + progression buckets). Saves
   land here, not at the end: retrofitting persistence is a known trap.
5. The sub: pilot one hull tier (MK1), enter/exit, cockpit camera + control
   swap, power system, oxygen refill, sub HUD, interior/exterior audio bus
   swap, autosave on entry, full save (all four buckets).
6. The hunt: the predator archetype (band-parameterized), senses and aggro,
   the Hunter with territory + dread/hunt radii, light/sonar risk-reward,
   flare decoys, music ducking.
7. The mystery: all five wreck dioramas via the anchor layer, logs and journal
   story tab, hull MK2/MK3 with feel differentiation, suit tier 2, Floor
   instrument degradation, finale and ending, credits.
8. Ship it: settings/quality presets, perf pass, full browser matrix run, at
   least two complete seed-fresh playthroughs (at least one by someone who is
   not the developer) for pacing tuning, public repo flip, deploy to GitHub
   Pages.

## 11. Testing

- Determinism unit tests: same seed produces byte-identical chunk meshes.
- forceWebGL smoke test at every milestone (see section 10 preamble).
- Real-browser matrix before sharing the link: Chrome on Mac (primary), Safari
  26 on macOS Tahoe, Firefox on Apple Silicon, Chrome on a borrowed mid-range
  Windows laptop, plus one forceWebGL run.
- Perf instrumentation from day one: the debug HUD (section 5) showing frame
  time, resident chunks, worker queue depth, compute dispatch count.

## 12. Out of scope (v1)

Base building, food/water, multiple vehicles, farming/power economy, crafted
spare power cells, persistent terrain deformation, runtime terrain editing,
walkable sub interior, distinct predator species (one parameterized archetype
only), ambient creature types beyond the fish schools, voice acting, composed
adaptive music, above-water rendering, multiplayer, mobile/touch, gamepad,
Linux WebGPU, long-range view modes (reintroduces LOD seam stitching),
GPU-compute terrain generation, GPU caustics (the Shelf caustics are a cheap
projected noise texture).

## 13. Known traps for the implementing agent

Hard-won research findings. Read before writing code.

- AI-generated TSL/WebGPU code is stale by default: `tslFn`, `storageObject`,
  `renderer.computeAsync`, `varying()`, `TextureNode.uv()`, `label()` are all
  renamed or deprecated (r168-r183), and `PostProcessing` becomes
  `RenderPipeline` in r185. Validate every snippet against the r184 examples
  directory and the TSL wiki.
- Copy example code from the exact pinned release tag, not the dev branch;
  examples are rewritten between releases.
- Forgetting `setPBO(true)` on fallback-read storage nodes produces bugs that
  appear ONLY on fallback machines.
- `simplex-noise` 4.x: fresh alea instance per createNoise call, or the world
  silently changes.
- Forgetting the transferable list on worker postMessage silently doubles
  memory and causes hitches.
- Subnautica's exact oxygen drain rates are disputed between wikis; treat all
  rates as tuning values. Only the escalating-by-band structure is load-bearing.
- WebGPU atomics are 32-bit integer only (future spatial grid: encode cell
  counts as uint).
- Re-verify the Safari-on-Sequoia and Firefox-Linux support cells if launch
  slips past Q4 2026.

## 14. References

- GDC: "The Design of Subnautica" (Cleveland) and "Subnautica Postmortem"
  (Boetel): the two primary design sources.
- three.js r184 examples: webgpu_compute_birds, webgpu_compute_particles.
- softxels (danielesteban): closest existing artifact to the terrain layer.
- Frictional Games: "9 Years, 9 Lessons on Horror" (Grip).
- Horror references: Subnautica, Iron Lung, SOMA, Barotrauma.
