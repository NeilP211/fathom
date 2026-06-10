# FATHOM Milestone 4: Survival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Compact plan format (see M2 plan note).

**Goal:** FATHOM becomes a game: oxygen and health with real death, scrap to collect, a scanner that unlocks blueprints from fragments, crafting at the buoy, a dive HUD with compass and signal bearings, a PDA (inventory/craft/journal), the first two radio signals with stub sites, and a persistent IndexedDB save with death-as-rollback.

**Architecture:** All rules live in a pure, fully tested `src/game/state.js` (tick, damage, death, craft, scan, signals); the DOM layer (`src/ui/`) renders state and forwards intents; world content (pickups, sites, buoy) follows the vegetation pattern (seeded, windowed, consumed-set filtered). Saves serialize four buckets (player/progression/story/worldDiffs) keyed by seed; death reloads the last save (rollback semantics per spec section 5). Suit pressure rule gates depth (tier 1: 100m, tier 2: 200m).

**Tech Stack:** Pure JS game core + Vitest; DOM HUD/PDA (no framework); IndexedDB.

---

### Task 1: Game state core (pure, TDD)
- `src/game/state.js`: `createState()`; `RECIPES` (scanner known from start; o2tank2/fins/suit2/flashlight2 fragment-gated); `tick(state, env, dt)` returning events (oxygen drain by activity, surface/buoy refill, pressure damage below suit rating, blackout at 0 O2 then death event); `addItem/craft` (resource checks, effect application: oxygenMax, speedMult, suitRating); `scanFragment` (progress per blueprint, unlock at 100%); `recoverLog` + `signalsToFire` (trigger: previous site's log recovered); serialize/deserialize roundtrip.
- `tests/state.test.js`: oxygen drain/refill, blackout->death sequence, pressure damage gating by suit tier, craft happy/insufficient paths, scan unlock, signal chain, serialize roundtrip.

### Task 2: Persistence
- `src/game/save.js`: IndexedDB (db `fathom`, store `saves`, key = seed): `saveGame(seed, snapshot)`, `loadGame(seed)`, snapshot = state.serialize() + player pos. Browser-verified; serialization tested in Task 1.

### Task 3: World content (buoy, pickups, sites)
- `src/game/buoy.js`: buoy mesh at origin (pole + float + blinking light), zone radius 10m: oxygen refill, autosave (throttled), fabricator access, radio (signals fire only in zone pre-sub).
- `src/game/pickups.js`: windowed per-column seeded resource nodes (scrap on the Shelf floor, biolume in kelp range), InstancedMesh render, consumed-id Set filter, `nearest(pos)` for interaction.
- `src/game/sites.js`: two stub signal sites at seeded bearings/distances (crate mesh + 4 pickups + 1 fragment + 1 log entity each).
- `tests/pickups.test.js`: placement determinism, consumed filtering.

### Task 4: HUD + PDA (DOM)
- `src/ui/gameHud.js`: oxygen bar (dominant), health bar, depth readout, compass strip (cardinal ticks + active-signal chevron via bearing math), interaction prompt, toast feed, blackout vignette, death screen ("RECOVERED AT LAST SAVE").
- `src/ui/pda.js`: Tab-toggled panel with Inventory / Craft / Journal (Scans, Logs, Signals) tabs; craft buttons enabled by resource check; pauses look input while open.
- index.html: HUD DOM skeleton + styles (clean monospace over dark translucent panels, spec section 5).

### Task 5: Wiring + verification
- Controller: E interact (tap = pickup, hold 1.5s = scan with progress ring), Tab PDA, speedMult applied to movement max speed.
- main.js: game loop integration (tick env: depth, nearSurface, inBuoyZone, moving), death -> reload save -> respawn at buoy, signal firing + toast + journal entry, load-on-boot.
- Verify: fresh boot first-five-minutes loop (collect scrap, craft scanner at buoy, get signal 1), death rollback, reload persistence, both backends, suite, merge.
