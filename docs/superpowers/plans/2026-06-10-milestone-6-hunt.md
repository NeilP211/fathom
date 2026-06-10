# FATHOM Milestone 6: The Hunt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Compact plan format (see M2 plan note).

**Goal:** The ocean starts hunting back: a band-parameterized predator archetype stalks and strikes, the Hunter leviathan owns a deterministic territory you hear long before you see, light and sound genuinely attract danger, sonar is a risk-reward tool, flares buy escapes, and the soundscape ducks into dread around the threat.

**Architecture:** One predator archetype (spec: parameterized per band, no species roster) as a CPU state machine (patrol/stalk/strike/cooldown/flee) steering by density samples, rendered as a scaled dark fish with the same procedural tail. The Hunter is territory-based (lair seeded from the world seed, persisted): outside the dread radius it does not exist; inside, synthesized rumble stingers + ambience ducking; inside the hunt radius it has a body and stalks by player noise (pure `noiseLevel()` from speed/lights/engine/sonar). Strikes damage diver or sub hull with knockback, then it circles. Sonar (Q, sub only) is an expanding pulse ring + compass contacts + a loud stimulus the Hunter investigates. Flares (G) are sinking light points with a strong Hunter-attract stimulus.

**Tech Stack:** Existing stack; all creature meshes procedural (scaled fish geometry, no skeletons per spec assets rule); all threat audio synthesized.

---

### Task 1: Threat math (pure, TDD)
- `src/game/threat.js`: `noiseLevel({speed, maxSpeed, lights, engineThrottle, sonarPingAge})` in [0,1.5]; `hunterMood(dist, radii, noise)` returning 'dormant' | 'dread' | 'hunting' | 'striking' bands; predator tuning table per depth band (sense radius, aggression, light response: 'flee' shallow / 'attracted' dusk+).
- `tests/threat.test.js`: noise bounds + monotonicity, mood thresholds, band parameter lookup.

### Task 2: Predator
- `src/game/creatures.js` `Predator`: states patrol (seeded waypoints) / stalk (detected: within senseRadius scaled by noise) / strike (lunge, 12 damage on 2.2m contact, 3s cooldown) / flee (light response per band); density-ahead steering (sample 4m ahead, steer up/over); 2-3 instances maintained near the player; scaled (2.6m) dark fish mesh + tail wave; predators feed the fish-school fear slots (stimulus push, strength negative).

### Task 3: The Hunter
- Same file, `Hunter`: lair = seeded bearing at ~620m from origin (persisted in save world bucket); radii: hunt/mesh 80m, dread 220m (tuning); mood machine from threat.js; while hunting, approach speed scales with noiseLevel, strike (40 diver / 25 hull + knockback) then circle-out 15s; flare/sonar stimuli override its target (light attraction, spec counterplay); 19m elongated silhouette mesh, never lit (MeshBasicNodeMaterial near-black, fog does the rest).

### Task 4: Sonar + flares
- `src/fx/sonar.js`: Q in sub (4s cooldown, 5 power): expanding additive ring shell + synthesized ping; compass contact chevrons (Hunter/predators/signal sites within 150m, 4s); pushes a loud stimulus at the player.
- `src/game/flares.js`: G (consumes a flare item): sinking orange point light + sprite, 25s life, strong attract stimulus slot; `flares` recipe (1 scrap -> 2, known from start).

### Task 5: Audio dread + wiring + verification
- `audio.js`: `playRumble(intensity)` (low sine boom + noise swell, irregular), `setDuck(level)` on the ambient bed.
- main.js: spawn/update threats, damage application, ducking by Hunter mood, Q/G keys, dev hooks (`__fathom.hunter`, `.predators`).
- Verify in browser: predator stalk + strike damage, Hunter dread audio flags -> body -> strike -> circle, flare distraction, sonar contacts + Hunter investigation, both backends, suite, merge.
