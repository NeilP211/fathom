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
import { createBuoy, inBuoyZone, BUOY_POS } from './game/buoy.js'
import { PickupField } from './game/pickups.js'
import { siteDefs, buildSiteGroup } from './game/sites.js'
import { GameHud } from './ui/gameHud.js'
import { Pda } from './ui/pda.js'

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
  const loaded = await loadGame(SEED).catch(() => null)
  if (loaded) {
    state = deserialize(loaded.state)
    Object.assign(controller.state.pos, loaded.pos)
  }

  const gameHud = new GameHud(document.getElementById('gamehud'))
  const pda = new Pda(document.getElementById('pda'), {
    onCraft: (id) => {
      if (craft(state, id)) {
        gameHud.toast(`CRAFTED: ${id.toUpperCase()}`)
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

  let saving = false
  async function autosave() {
    if (saving || state.dead) return
    saving = true
    try {
      await saveGame(SEED, { state: serialize(state), pos: { ...controller.state.pos } })
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
    } else if (target.type === 'fabricator') {
      setPda(true)
      pda.tab = 'craft'
      pda.render()
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
    } else {
      state = createState()
      Object.assign(controller.state.pos, SPAWN)
    }
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
    chunkManager,
    audio,
    get state() {
      return state
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

    controller.maxSpeed = 3 * state.speedMult
    controller.update(dt)
    const pos = controller.state.pos
    const depth = -pos.y

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
      const speed = Math.hypot(controller.state.vel.x, controller.state.vel.y, controller.state.vel.z)
      const env = { depth, refilling: pos.y > -3 || inZone, moving: speed > 1.2 }
      const events = tick(state, env, dt)
      if (events.includes('blackout-start')) gameHud.toast('OUT OF AIR')
      if (events.includes('death')) handleDeath()

      if (inZone && !wasInZone) {
        autosave()
        gameHud.toast('PROGRESS SAVED')
      }
      if (inZone) {
        for (const sig of signalsToFire(state)) {
          markSignalFired(state, sig.id)
          gameHud.toast(`RADIO: ${sig.name}`)
          autosave()
        }
      }
      wasInZone = inZone

      pickups.update(pos, state.consumed)

      // interaction
      const target = pdaOpen ? null : findTarget(pos)
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
            fabricator: 'E - fabricator',
          }
          gameHud.setPrompt(labels[target.type])
          if (eHeld) {
            eHeld = false
            interactTap(target)
          }
        }
      } else {
        gameHud.setPrompt(null)
        gameHud.setScanProgress(null)
        scanTimer = 0
      }

      // active signal: latest fired whose log is not yet recovered
      let signalTarget = null
      for (const id of state.firedSignals) {
        const sig = SIGNALS.find((x) => x.id === id)
        if (sig && !state.logs.includes(sig.log)) {
          const site = sites.find((s) => s.id === id)
          if (site) signalTarget = { x: site.x, z: site.z }
        }
      }
      gameHud.update(state, depth, controller.state.yaw, pos, signalTarget)
    }

    // far plane tracks visibility (fog wall + margin)
    const far = visibility + 48
    if (Math.abs(camera.far - far) > 0.5) {
      camera.far = far
      camera.updateProjectionMatrix()
    }

    hint.style.display = controller.locked || pdaOpen || dying ? 'none' : 'flex'
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
