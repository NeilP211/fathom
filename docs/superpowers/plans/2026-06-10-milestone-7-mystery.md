# FATHOM Milestone 7: The Mystery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Compact plan format (see M2 plan note).

**Goal:** The full story arc becomes playable: the seafloor descends from the Shelf to an 800m abyssal floor along a seeded story corridor, five Meridian wreck sites carry the breadcrumb log chain (optimism to silence), hull MK2/MK3 and the deep gate progression work, instruments degrade on the Floor, and recovering the evidence core triggers an enraged hunted ascent ending in credits.

**Architecture:** `floorY` gains a radial descent profile (shelf within 250m of origin, smooth ramp to ~-780m by 1500m): every existing system (visibility, water color, pressure, crush, bands) starts mattering for free since they are all depth-driven. Story geography is a seeded corridor bearing: all five sites sit along it at increasing distances (so increasing depth), positions computed in `anchors.js` (single source shared by SDF stamps, loot sites, and the Hunter's lair on the corridor at 620m). Signals 3-5 extend the chain rule; hull2/hull3 are fragment recipes whose effects apply to sub tier in main. The finale: the evidence core at site 5 (~770m) requires a desperate suit-rated-200m diver exit; carrying it enrages the Hunter (no dormancy, speed bonus) until the player surfaces, which rolls credits and unlocks a calm postgame.

**Tech Stack:** Existing stack; no new dependencies.

---

### Task 1: The descent (pure, TDD)
- `density.js`: `descentAt(r)` radial ramp (0 within 250m, smoothstep to 780 at 1500m) subtracted in floorY; update density tests (shelf-only assertions near origin, new test: floor below -600m at 1400m out, monotonic descent).
- Verify chunk border/determinism tests still pass untouched.

### Task 2: Story geography (anchors as the single source)
- `anchors.js`: `STORY_SITES` [sig1 230m, sig2 470m, sig3 760m, sig4 1060m, sig5 1380m] along a seeded corridor bearing (plus the tutorial clearing at 64,64); `sitePositionsForSeed(seed, density)`; anchor ops per site (carve clearing + debris adds, scaled by site index).
- `sites.js` consumes sitePositionsForSeed; loot: sig3 = hull2 fragments x3 + cache, sig4 = hull3 fragments x3 + flare cache, sig5 = the evidence core + final log; richer diorama meshes per tier (broken hull cylinders, containers, antenna mast).
- `creatures.js`: Hunter lair on the corridor at 620m.
- Update anchors/pickups tests (5 sites, corridor monotonic distance + depth).

### Task 3: Chain and recipes
- `state.js`: SIGNALS 3-5 + LOGS 3-5 (tone: unease -> dread -> silence), `hull2`/`hull3` recipes (fragment-gated; effects applied in main to subState.tier), `flags.coreRecovered` + `flags.finished`; signal chain tests extended.
- main onCraft: hull upgrades require the sub built; toasts describe the new rating.

### Task 4: The Floor and the finale
- Instrument degradation below 600m: compass ticks jitter/vanish, depth readout stutters, flashlight range halved (gameHud `setDegraded` + main).
- Evidence core entity at site 5: E pickup (diver only: the desperate exit) -> coreRecovered, objective toast, autosave; Hunter env.enraged: never dormant, +2.5 speed, dread audio constant; surfacing with the core -> credits overlay (#credits, story resolution + restart hint), flags.finished, postgame calm (enraged off, hunter returns to lair).

### Task 5: Verification
- Browser: descent profile spot checks (floor depth at 800/1400m out), full signal chain dev-walk (recover logs 1-5), hull2/3 crafting + crush depth changes, degradation at 650m, core pickup -> enraged -> surface -> credits; suite; both backends; merge.
