# FATHOM Milestone 5: The Sub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Compact plan format (see M2 plan note).

**Goal:** The diver-to-sub arc: scan sub fragments, assemble the submersible at the salvage cradle (signal site 2), pilot it first-person from a cockpit with its own HUD (power, hull, crush warning), refill air inside, hear the world muffle through the hull, and have it all persist.

**Architecture:** Sub state (built, pose, power, hull) is a fourth-bucket save citizen with a pure `tickSub` (power drain by throttle/lights, solar trickle above 20m, fast charge at the buoy, crush damage below MK1 300m rating, death when the hull fails with the player inside). Piloting reuses `stepMovement` with sub tuning (6 m/s, heavier drag, 1.6m collision radius parameter added). Mode switching swaps which controller drives the camera; the cockpit is a non-walkable camera + control swap per spec. Audio gains `setInside`: the exterior bus collapses to a sub-300Hz rumble and an interior hum + throttle-following engine tone runs on the interior bus.

**Tech Stack:** Existing stack; procedural sub mesh (capsule hull, glass nose, skids, twin floodlights).

---

### Task 1: Sub core (pure, TDD)
- `src/game/sub.js`: `createSubState()` (built=false, power/hull 100, MK1 crushDepth 300); `tickSub(sub, env, dt)` events (power drain moving/lights, recharge solar/buoy, crush damage + 'hull-stress' warning band 280m+, 'sub-destroyed' at hull 0); `subMaxSpeed(sub)` (6, limps at 1 when power 0); mesh factory `createSubMesh()`.
- `tests/sub.test.js`: drain/recharge, no-power limp, crush warning then damage then destruction, rating respected above 300m.
- `src/player/movement.js`: add collision radius parameter (diver 0.6, sub 1.6).

### Task 2: Acquisition content
- `state.js`: add `sub` recipe (3 fragments, scrap x8 + biolume x2, cradleOnly flag).
- `sites.js`: site 2 gains 3 sub fragments and a `cradle` entity + cradle frame mesh (the assemble point).
- PDA shows cradleOnly recipes as "assemble at the salvage cradle" unless crafting there.

### Task 3: Piloting + mode switch
- `SubController` (mouse steers hull yaw + clamped pitch, WASD/Space/Shift thrust, stepMovement with sub tuning); main.js mode state: enter via E at hatch (3m), exit via E (places diver at hatch; pressure rule applies immediately, warning toast if below suit rating); camera handoff; diver hidden state preserved.
- Sub HUD: power bar + hull bar + crush-warning flash replace the O2 emphasis while aboard (O2 shows full; cabin air refills it).

### Task 4: Audio + persistence
- `audio.js` `setInside(bool)`: exterior lowpass collapse + level duck; interior hum oscillator + engine tone following throttle.
- Save snapshot gains `sub` bucket; autosave on entering the sub; sub restored on load (mesh + pose).

### Task 5: Verification
- Browser: assemble at cradle (dev-assisted), enter, pilot, power drain + solar recharge, exit at depth pressure warning, muffled audio state flip, persistence reload, death-in-sub at crush depth; both backends; suite; merge.
