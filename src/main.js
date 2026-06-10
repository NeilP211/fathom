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
import { DiveController } from './player/diveController.js'
import { MarineSnow } from './fx/marineSnow.js'
import { createTerrainMaterial } from './fx/terrainMaterial.js'
import { createSurface } from './fx/surface.js'
import { StimulusSystem } from './fx/stimulus.js'
import { FishSchool } from './fx/fishSchool.js'
import { AmbientFish } from './fx/ambientFish.js'
import { VegetationField } from './fx/kelp.js'
import { anchorsForSeed } from './world/anchors.js'

const SEED = 1986

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
  const controller = new DiveController(camera, canvas, density)
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
  const vegetation = new VegetationField(SEED, density, anchorsForSeed(SEED, density), uTime)
  scene.add(vegetation.group)

  // Head-mounted flashlight: F toggles; while on it feeds stimulus slot 0
  // (a forward attractor for small fish; later the thing that gets you found).
  const flashlight = new THREE.SpotLight(0xfff2d8, 0, 60, Math.PI / 7, 0.45, 1.2)
  flashlight.visible = false
  scene.add(flashlight)
  scene.add(flashlight.target)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') {
      flashlight.visible = !flashlight.visible
      flashlight.intensity = flashlight.visible ? 900 : 0
      if (!flashlight.visible) stimulus.clearContinuous(0)
    }
  })
  const fwd = new THREE.Vector3()

  // Dev hooks for verification tooling.
  window.__fathom = { stats: {}, seed: SEED, controller, chunkManager, audio }

  // Plain performance.now() delta: THREE.Timer is not guaranteed in the
  // three/webgpu export, and importing it from three/addons would pull in the
  // bare 'three' build (the double-bundle trap, spec section 3).
  let last = performance.now()
  let elapsed = 0

  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    elapsed += dt
    uTime.value = elapsed

    controller.update(dt)
    const pos = controller.state.pos
    const depth = -pos.y

    // Depth grading: water color, fog, light all follow the dive.
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

    // Clip everything past the fog wall plus a margin: those chunks are
    // >98% fogged anyway, so the far plane tracks visibility.
    const far = visibility + 48
    if (Math.abs(camera.far - far) > 0.5) {
      camera.far = far
      camera.updateProjectionMatrix()
    }

    hint.style.display = controller.locked ? 'none' : 'flex'
    const info = {
      backendName,
      pos,
      visibility,
      residentChunks: chunkManager.residentCount,
      pendingJobs: pool.pending,
      seed: SEED,
    }
    hud.update(dt, info)
    window.__fathom.stats = { fps: hud.fps, ...info }

    renderer.render(scene, camera)
  })
}

main()
