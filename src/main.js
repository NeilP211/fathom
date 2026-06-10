import * as THREE from 'three/webgpu'
import { uniform } from 'three/tsl'
import { createRenderer } from './engine/renderer.js'
import { DebugHud } from './engine/debugHud.js'
import { AudioEngine } from './engine/audio.js'
import { createDensityField } from './world/density.js'
import { WorkerPool } from './world/workerPool.js'
import { ChunkManager } from './world/chunkManager.js'
import { visibilityAtDepth, fogDensityFor, loadRadiusFor } from './world/visibility.js'
import { colorAtDepth, lightFalloff } from './world/waterColor.js'
import { anchorsForSeed } from './world/anchors.js'
import { DiveController } from './player/diveController.js'
import { MarineSnow } from './fx/marineSnow.js'
import { createTerrainMaterial } from './fx/terrainMaterial.js'
import { createSurface } from './fx/surface.js'
import { StimulusSystem } from './fx/stimulus.js'
import { FishSchool } from './fx/fishSchool.js'
import { AmbientFish } from './fx/ambientFish.js'
import { VegetationField } from './fx/kelp.js'
import {
  createState,
  tick,
  addItem,
  craft,
  scanFragment,
  recoverLog,
  signalsToFire,
  markSignalFired,
  serialize,
  deserialize,
  suitRating,
  SIGNALS,
} from './game/state.js'
import { saveGame, loadGame } from './game/save.js'
import { createSubState, tickSub, createSubMesh, subCrushDepth } from './game/sub.js'
import { SubController } from './player/subController.js'
import { createBuoy, inBuoyZone, BUOY_POS } from './game/buoy.js'
import { PickupField } from './game/pickups.js'
import { siteDefs, buildSiteGroup } from './game/sites.js'
import { GameHud } from './ui/gameHud.js'
import { Pda } from './ui/pda.js'
import { Predator, Hunter } from './game/creatures.js'
import { noiseLevel } from './game/threat.js'
import { Sonar, SONAR_TUNING } from './fx/sonar.js'
import { FlareSystem } from './game/flares.js'

const SEED = 1986
const SPAWN = { x: 0, y: -8, z: 0 }

async function main() {
  const canvas = document.getElementById('app')
  const params = new URLSearchParams(location.search)
  const { renderer, backendName } = await createRenderer(canvas)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color() // opaque background (r185 prep, spec section 3)
  scene.fog = new THREE.FogExp2(new THREE.Color(), fogDensityFor(visibilityAtDepth(8)))

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300)
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  })

  const sun = new THREE.DirectionalLight(0xbfe8ff, 2.2)
  sun.position.set(0.3, 1, 0.2)
  scene.add(sun)
  const hemi = new THREE.HemisphereLight(0x9fd4e8, 0x0a2230, 0.7)
  scene.add(hemi)

  const uTime = uniform(0)

  const pool = new WorkerPool(
    Math.max(1, (navigator.hardwareConcurrency || 4) - 1),
    () => new Worker(new URL('./world/chunkWorker.js', import.meta.url), { type: 'module' }),
  )
  const chunkManager = new ChunkManager(scene, pool, SEED, createTerrainMaterial(uTime))
  const density = createDensityField(SEED)
  const ops = anchorsForSeed(SEED, density)
  const controller = new DiveController(camera, canvas, density, SPAWN)
  const hud = new DebugHud(document.getElementById('hud'))
  const hint = document.getElementById('hint')

  // Atmosphere (M2)
  const lowQuality = params.get('q') === 'low'
  const snow = new MarineSnow(lowQuality ? 8000 : 50000)
  scene.add(snow.sprite)
  const surface = createSurface()
  scene.add(surface.group)
  const audio = new AudioEngine()
  canvas.addEventListener('click', () => audio.start(), { once: true })

  // Life (M3)
  const stimulus = new StimulusSystem()
  const isWebGPU = backendName === 'WebGPU'
  const fish = isWebGPU
    ? new FishSchool(lowQuality ? 2000 : 5000, SEED)
    : new AmbientFish(lowQuality ? 300 : 800)
  scene.add(fish.mesh)
  const vegetation = new VegetationField(SEED, density, ops, uTime)
  scene.add(vegetation.group)

  const flashlight = new THREE.SpotLight(0xfff2d8, 0, 60, Math.PI / 7, 0.45, 1.2)
  flashlight.visible = false
  scene.add(flashlight)
  scene.add(flashlight.target)
  const fwd = new THREE.Vector3()

  // Survival (M4)
  let state = createState()
  const subState = createSubState()
  const loaded = await loadGame(SEED).catch(() => null)
  if (loaded) {
    state = deserialize(loaded.state)
    Object.assign(controller.state.pos, loaded.pos)
    if (loaded.sub) Object.assign(subState, loaded.sub)
  }

  // The sub (M5)
  const subMesh = createSubMesh()
  subMesh.visible = subState.built
  scene.add(subMesh)
  const subController = new SubController(camera, canvas, density, subState)
  let aboard = false
  let modeCooldown = 0

  const gameHud = new GameHud(document.getElementById('gamehud'))
  const pda = new Pda(document.getElementById('pda'), {
    onCraft: (id) => {
      if ((id === 'hull2' || id === 'hull3') && !subState.built) {
        gameHud.toast('hull plating needs a sub to bolt onto')
        return
      }
      if (craft(state, id)) {
        gameHud.toast(`CRAFTED: ${id.toUpperCase()}`)
        if (id === 'hull2') {
          subState.tier = 2
          gameHud.toast('SUB RATED TO 600m')
        }
        if (id === 'hull3') {
          subState.tier = 3
          gameHud.toast('SUB RATED TO 900m - the bottom is open')
        }
        if (id === 'sub') {
          // assembled in the cradle: spawn it beside the player
          subState.built = true
          subState.x = controller.state.pos.x + 4
          subState.y = controller.state.pos.y + 1
          subState.z = controller.state.pos.z
          subState.yaw = controller.state.yaw
          subMesh.visible = true
          gameHud.toast('THE SUB IS YOURS - E at the hull to board')
        }
        autosave()
      }
    },
  })

  const buoy = createBuoy()
  scene.add(buoy.group)
  const pickups = new PickupField(SEED, density, ops)
  scene.add(pickups.group)
  pickups.rebuild(controller.state.pos, state.consumed)

  const sites = siteDefs(SEED, density)
  const siteMeshes = new Map() // entityId -> mesh
  for (const site of sites) {
    const { group, meshes } = buildSiteGroup(site)
    scene.add(group)
    for (const [id, mesh] of meshes) {
      siteMeshes.set(id, mesh)
      mesh.visible = !state.consumed.includes(id)
    }
  }

  // The hunt (M6)
  const predators = [0, 1, 2].map((i) => new Predator(SEED, i, density, uTime))
  for (const p of predators) scene.add(p.mesh)
  const hunter = new Hunter(SEED, density, uTime)
  scene.add(hunter.mesh)
  const sonar = new Sonar(scene)
  const flares = new FlareSystem(scene)
  let sonarRequested = false
  let flareRequested = false
  let fearTimer = 0
  let lastDuck = -1
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyQ') sonarRequested = true
    if (e.code === 'KeyG') flareRequested = true
  })

  let saving = false
  async function autosave() {
    if (saving || state.dead) return
    saving = true
    try {
      await saveGame(SEED, {
        state: serialize(state),
        pos: { ...controller.state.pos },
        sub: { ...subState },
      })
    } finally {
      saving = false
    }
  }

  // PDA toggle
  let pdaOpen = false
  function setPda(open) {
    pdaOpen = open
    pda.setOpen(open, state)
    controller.frozen = open
    if (open) document.exitPointerLock()
  }
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault()
      setPda(!pdaOpen)
    }
    if (e.code === 'KeyF') {
      flashlight.visible = !flashlight.visible
      flashlight.intensity = flashlight.visible ? 900 : 0
      if (!flashlight.visible) stimulus.clearContinuous(0)
    }
  })

  // Interaction (E tap / E hold-to-scan)
  let eHeld = false
  let scanTimer = 0
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') eHeld = true
  })
  document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') {
      eHeld = false
      scanTimer = 0
    }
  })

  function consumeEntity(id, mesh) {
    state.consumed.push(id)
    if (mesh) mesh.visible = false
  }

  // Find the current interaction target. Site entities take priority, then
  // world pickups, then the buoy fabricator.
  function findTarget(pos) {
    let best = null
    let bestD = 2.8
    for (const site of sites) {
      for (const e of site.entities) {
        if (state.consumed.includes(e.id)) continue
        const d = Math.hypot(e.x - pos.x, e.y - pos.y, e.z - pos.z)
        if (d < bestD) {
          bestD = d
          best = { type: e.kind, entity: e, mesh: siteMeshes.get(e.id) }
        }
      }
    }
    if (!best) {
      const n = pickups.nearest(pos)
      if (n) best = { type: 'node', entity: n }
    }
    if (!best) {
      const d = Math.hypot(pos.x - BUOY_POS.x, pos.y - -7, pos.z - BUOY_POS.z)
      if (d < 3.5) best = { type: 'fabricator' }
    }
    if (!best && subState.built) {
      const d = Math.hypot(pos.x - subState.x, pos.y - subState.y, pos.z - subState.z)
      if (d < 3.4) best = { type: 'board' }
    }
    return best
  }

  function interactTap(target) {
    const e = target.entity
    if (target.type === 'node') {
      addItem(state, e.kind === 'scrap' ? 'scrap' : 'biolume')
      consumeEntity(e.id)
      pickups.rebuild(controller.state.pos, state.consumed)
      gameHud.toast(`+1 ${e.kind}`)
    } else if (target.type === 'pickup') {
      addItem(state, e.item)
      consumeEntity(e.id, target.mesh)
      gameHud.toast(`+1 ${e.item}`)
    } else if (target.type === 'log') {
      recoverLog(state, e.logId)
      consumeEntity(e.id, target.mesh)
      gameHud.toast('LOG RECOVERED - see journal (TAB)')
      autosave()
    } else if (target.type === 'core') {
      state.flags.coreRecovered = true
      consumeEntity(e.id, target.mesh)
      gameHud.toast('EVIDENCE CORE RECOVERED')
      gameHud.toast('GO DARK. GO QUIET. GO UP.')
      autosave()
    } else if (target.type === 'fabricator') {
      pda.atCradle = false
      setPda(true)
      pda.tab = 'craft'
      pda.render()
    } else if (target.type === 'cradle') {
      pda.atCradle = true
      setPda(true)
      pda.tab = 'craft'
      pda.render()
    } else if (target.type === 'board') {
      aboard = true
      modeCooldown = 0.6
      subController.enter(controller.state.pos)
      audio.setInside(true)
      gameHud.toast('ABOARD - cabin air online')
      autosave()
    }
  }

  // Death and respawn: rollback to the last save (spec section 5).
  let dying = false
  async function handleDeath() {
    if (dying) return
    dying = true
    gameHud.showDeath(true)
    document.exitPointerLock()
    await new Promise((r) => setTimeout(r, 2600))
    const snap = await loadGame(SEED).catch(() => null)
    if (snap) {
      state = deserialize(snap.state)
      Object.assign(controller.state.pos, snap.pos)
      if (snap.sub) Object.assign(subState, snap.sub)
    } else {
      state = createState()
      Object.assign(controller.state.pos, SPAWN)
    }
    aboard = false
    audio.setInside(false)
    subMesh.visible = subState.built
    controller.state.vel = { x: 0, y: 0, z: 0 }
    pickups.rebuild(controller.state.pos, state.consumed)
    for (const [id, mesh] of siteMeshes) mesh.visible = !state.consumed.includes(id)
    gameHud.showDeath(false)
    dying = false
  }

  // Dev hooks for verification tooling.
  window.__fathom = {
    stats: {},
    seed: SEED,
    controller,
    subController,
    subState,
    chunkManager,
    audio,
    hunter,
    predators,
    sonar,
    flares,
    get state() {
      return state
    },
    get aboard() {
      return aboard
    },
    setState(s) {
      state = s
    },
    autosave,
  }

  let wasInZone = false
  let last = performance.now()
  let elapsed = 0

  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    elapsed += dt
    uTime.value = elapsed

    modeCooldown = Math.max(0, modeCooldown - dt)
    controller.maxSpeed = 3 * state.speedMult
    if (aboard) {
      subController.update(dt)
      // the diver rides along (keeps streaming/save anchors coherent)
      Object.assign(controller.state.pos, subController.state.pos)
      controller.state.vel = { x: 0, y: 0, z: 0 }
    } else {
      controller.update(dt)
    }
    const pos = aboard ? subController.state.pos : controller.state.pos
    const depth = -pos.y

    // sub pose + systems
    if (subState.built) {
      subMesh.position.set(subState.x, subState.y, subState.z)
      subMesh.rotation.set(aboard ? -subController.state.pitch * 0.5 : 0, subState.yaw, 0, 'YXZ')
      subState.lights = aboard && flashlight.visible
      const subEvents = tickSub(
        subState,
        {
          depth: -subState.y,
          throttle: aboard ? subController.throttle : 0,
          atBuoy: inBuoyZone({ x: subState.x, y: subState.y, z: subState.z }),
        },
        dt,
      )
      gameHud.setSubMode({
        aboard,
        power: subState.power,
        hull: subState.hull,
        stress: subEvents.includes('hull-stress') || subEvents.includes('crush-damage'),
      })
      if (subEvents.includes('crush-damage') && Math.random() < dt * 2) {
        gameHud.toast(`HULL FAILING - rated ${subCrushDepth(subState)}m`)
      }
      if (subEvents.includes('sub-destroyed') && aboard && !dying) handleDeath()
      audio.setEngine(aboard ? subController.throttle : 0)
    } else {
      gameHud.setSubMode(null)
    }

    // Depth grading (M2)
    const visibility = visibilityAtDepth(depth)
    scene.fog.density = fogDensityFor(visibility)
    const [r, g, b] = colorAtDepth(depth)
    scene.background.setRGB(r, g, b)
    scene.fog.color.setRGB(r, g, b)
    const falloff = lightFalloff(depth)
    sun.intensity = 2.2 * falloff
    hemi.intensity = 0.7 * falloff + 0.08

    chunkManager.update(pos, loadRadiusFor(visibility))
    snow.update(renderer, dt, elapsed, pos)
    surface.update(pos, falloff)
    audio.setDepth(depth)
    buoy.update(elapsed)

    // Life (M3)
    if (flashlight.visible) {
      camera.getWorldDirection(fwd)
      flashlight.position.set(pos.x, pos.y, pos.z)
      flashlight.target.position.set(pos.x + fwd.x * 30, pos.y + fwd.y * 30, pos.z + fwd.z * 30)
      stimulus.setContinuous(
        0,
        { x: pos.x + fwd.x * 8, y: pos.y + fwd.y * 8, z: pos.z + fwd.z * 8 },
        0.45,
        14,
      )
    }
    stimulus.update(dt)
    if (isWebGPU) fish.update(renderer, dt, pos, stimulus)
    else fish.update(dt, elapsed, pos)
    vegetation.update(pos)

    // Survival (M4)
    if (!dying) {
      const inZone = inBuoyZone(pos)
      const speed = aboard
        ? 0
        : Math.hypot(controller.state.vel.x, controller.state.vel.y, controller.state.vel.z)
      // the cabin holds one atmosphere: suit pressure only applies in the water
      const env = {
        depth: aboard ? 0 : depth,
        refilling: pos.y > -3 || inZone || aboard,
        moving: speed > 1.2,
      }
      const events = tick(state, env, dt)
      if (events.includes('blackout-start')) gameHud.toast('OUT OF AIR')
      if (events.includes('death')) handleDeath()

      if (inZone && !wasInZone) {
        autosave()
        gameHud.toast('PROGRESS SAVED')
      }
      // the radio lives at the buoy and in the sub (spec section 5)
      if (inZone || aboard) {
        for (const sig of signalsToFire(state)) {
          markSignalFired(state, sig.id)
          gameHud.toast(`RADIO: ${sig.name}`)
          autosave()
        }
      }
      wasInZone = inZone

      pickups.update(pos, state.consumed)

      // ---- the hunt (M6) ----
      const playerSpeed = aboard
        ? Math.hypot(subController.state.vel.x, subController.state.vel.y, subController.state.vel.z)
        : speed
      const noise = noiseLevel({
        speed: playerSpeed,
        maxSpeed: aboard ? 6 : controller.maxSpeed,
        lights: flashlight.visible,
        engineThrottle: aboard ? subController.throttle : 0,
        sonarPingAge: sonar.pingAge(elapsed),
      })
      const threatEvents = []
      const playerRef = { pos }
      for (const p of predators) {
        p.update(dt, playerRef, { noise, lights: flashlight.visible }, threatEvents)
      }
      const lure = flares.update(dt)
      const enraged = state.flags.coreRecovered && !state.flags.finished
      hunter.update(dt, playerRef, { noise, aboard, enraged }, threatEvents, lure)
      sonar.update(dt, elapsed)

      // the finale: surface with the core
      if (enraged && pos.y > -4) {
        state.flags.finished = true
        gameHud.showCredits()
        document.exitPointerLock()
        autosave()
      }

      // predators spook the fish school (repulsion stimuli at 5Hz)
      fearTimer -= dt
      if (fearTimer <= 0) {
        fearTimer = 0.2
        for (const p of predators) stimulus.push(p.pos, -0.8, 16, 0.4)
        if (hunter.mesh.visible) stimulus.push(hunter.pos, -1.2, 40, 0.4)
      }

      function applyPlayerDamage(amount, label) {
        state.health -= amount
        gameHud.toast(label)
        if (state.health <= 0 && !state.dead) {
          state.health = 0
          state.dead = true
          handleDeath()
        }
      }
      for (const ev of threatEvents) {
        if (ev.type === 'predator-hit' && !aboard) applyPlayerDamage(ev.damage, 'BITTEN')
        else if (ev.type === 'hunter-rumble') audio.playRumble(ev.intensity)
        else if (ev.type === 'hunter-strike-diver' && !aboard) {
          controller.state.vel.x += ev.dir.x * 9
          controller.state.vel.z += ev.dir.z * 9
          applyPlayerDamage(ev.damage, 'SOMETHING ENORMOUS HIT YOU')
        } else if (ev.type === 'hunter-strike-sub' && aboard) {
          subState.hull = Math.max(0, subState.hull - ev.damage)
          subController.state.vel.x += ev.dir.x * 7
          subController.state.vel.z += ev.dir.z * 7
          gameHud.toast('HULL IMPACT')
          if (subState.hull <= 0) handleDeath()
        }
      }

      // dread ducking follows the Hunter's mood
      const duck = hunter.mood === 'dormant' ? 0 : hunter.mood === 'dread' ? 0.5 : 1
      if (Math.abs(duck - lastDuck) > 0.05) {
        lastDuck = duck
        audio.setDuck(duck)
      }

      // sonar (sub only)
      if (sonarRequested) {
        sonarRequested = false
        if (aboard && sonar.canPing(subState.power)) {
          subState.power -= SONAR_TUNING.powerCost
          const targets = []
          const inRange = (x, z) => Math.hypot(x - pos.x, z - pos.z) < SONAR_TUNING.range
          if (inRange(hunter.pos.x, hunter.pos.z)) {
            targets.push({ x: hunter.pos.x, z: hunter.pos.z, kind: 'hunter' })
          }
          for (const p of predators) {
            if (inRange(p.pos.x, p.pos.z)) targets.push({ x: p.pos.x, z: p.pos.z, kind: 'predator' })
          }
          for (const s of sites) {
            if (inRange(s.x, s.z)) targets.push({ x: s.x, z: s.z, kind: 'site' })
          }
          sonar.ping(pos, targets, elapsed)
          audio.playPing()
          stimulus.push(pos, -1, 30, 2) // fish scatter from the blast
          gameHud.toast(`sonar: ${targets.length} contact${targets.length === 1 ? '' : 's'}`)
        }
      }

      // flares
      if (flareRequested) {
        flareRequested = false
        if ((state.inventory.flare || 0) > 0) {
          state.inventory.flare--
          flares.drop(pos)
          stimulus.push(pos, 0.9, 50, 25)
          gameHud.toast('flare away')
        } else {
          gameHud.toast('no flares (craft at the fabricator)')
        }
      }
      // ---- end the hunt ----

      // aboard: the only interaction is disembarking
      if (aboard) {
        gameHud.setPrompt('E - disembark')
        gameHud.setScanProgress(null)
        if (eHeld && modeCooldown === 0) {
          eHeld = false
          aboard = false
          modeCooldown = 0.6
          const hatch = subController.exit()
          Object.assign(controller.state.pos, hatch)
          controller.state.vel = { x: 0, y: 0, z: 0 }
          audio.setInside(false)
          if (depth > suitRating(state)) {
            gameHud.toast(`WARNING: suit rated ${suitRating(state)}m - pressure damage`)
          }
          autosave()
        }
      }

      // interaction
      const target = pdaOpen || aboard ? null : findTarget(pos)
      if (target) {
        if (target.type === 'fragment') {
          const hasScanner = state.crafted.includes('scanner')
          gameHud.setPrompt(hasScanner ? 'hold E - scan fragment' : 'fragment (requires scanner)')
          if (eHeld && hasScanner) {
            scanTimer += dt
            gameHud.setScanProgress(Math.min(1, scanTimer / 1.5))
            if (scanTimer >= 1.5) {
              const result = scanFragment(state, target.entity.recipeId)
              consumeEntity(target.entity.id, target.mesh)
              gameHud.setScanProgress(null)
              scanTimer = 0
              eHeld = false
              gameHud.toast(
                result === 'unlocked'
                  ? `BLUEPRINT UNLOCKED: ${target.entity.recipeId}`
                  : `scan stored: ${target.entity.recipeId}`,
              )
              autosave()
            }
          } else {
            gameHud.setScanProgress(null)
            scanTimer = 0
          }
        } else {
          gameHud.setScanProgress(null)
          scanTimer = 0
          const labels = {
            node: `E - collect ${target.entity?.kind}`,
            pickup: `E - collect ${target.entity?.item}`,
            log: 'E - recover log',
            core: 'E - recover the evidence core',
            fabricator: 'E - fabricator',
            cradle: 'E - salvage cradle',
            board: 'E - board the sub',
          }
          gameHud.setPrompt(labels[target.type])
          if (eHeld && modeCooldown === 0) {
            eHeld = false
            interactTap(target)
          }
        }
      } else {
        gameHud.setPrompt(null)
        gameHud.setScanProgress(null)
        scanTimer = 0
      }

      // active signal: latest fired whose log is not yet recovered; with the
      // core aboard the only objective is home
      let signalTarget = null
      for (const id of state.firedSignals) {
        const sig = SIGNALS.find((x) => x.id === id)
        if (sig && !state.logs.includes(sig.log)) {
          const site = sites.find((s) => s.id === id)
          if (site) signalTarget = { x: site.x, z: site.z }
        }
      }
      if (enraged) signalTarget = { x: 0, z: 0 }

      // the Floor eats instruments (spec section 5 depth bands)
      const degraded = depth > 600
      gameHud.setDegraded(degraded)
      flashlight.distance = degraded ? 30 : 60

      const activeYaw = aboard ? subController.state.yaw : controller.state.yaw
      gameHud.update(state, depth, activeYaw, pos, signalTarget, sonar.contacts)
    }

    // far plane tracks visibility (fog wall + margin)
    const far = visibility + 48
    if (Math.abs(camera.far - far) > 0.5) {
      camera.far = far
      camera.updateProjectionMatrix()
    }

    hint.style.display =
      controller.locked || pdaOpen || dying || state.flags.finished ? 'none' : 'flex'
    const info = {
      backendName,
      pos,
      visibility,
      residentChunks: chunkManager.residentCount,
      pendingJobs: pool.pending,
      seed: SEED,
    }
    hud.update(dt, info)
    window.__fathom.stats = { fps: hud.fps, suit: suitRating(state), ...info }

    renderer.render(scene, camera)
  })
}

main()
