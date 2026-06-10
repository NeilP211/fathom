import * as THREE from 'three/webgpu'
import { createRenderer } from './engine/renderer.js'
import { DebugHud } from './engine/debugHud.js'
import { createDensityField } from './world/density.js'
import { WorkerPool } from './world/workerPool.js'
import { ChunkManager } from './world/chunkManager.js'
import { visibilityAtDepth, fogDensityFor, loadRadiusFor } from './world/visibility.js'
import { DiveController } from './player/diveController.js'

const SEED = 1986

async function main() {
  const canvas = document.getElementById('app')
  const { renderer, backendName } = await createRenderer(canvas)

  const scene = new THREE.Scene()
  const waterColor = new THREE.Color(0x062b3f)
  scene.background = waterColor.clone() // opaque background (r185 prep, spec section 3)
  scene.fog = new THREE.FogExp2(waterColor.clone(), fogDensityFor(visibilityAtDepth(8)))

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 300)
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  })

  // Light: a sun from above plus soft ambient; depth grading lands in M2.
  const sun = new THREE.DirectionalLight(0xbfe8ff, 2.2)
  sun.position.set(0.3, 1, 0.2)
  scene.add(sun)
  scene.add(new THREE.HemisphereLight(0x9fd4e8, 0x0a2230, 0.7))

  const pool = new WorkerPool(
    Math.max(1, (navigator.hardwareConcurrency || 4) - 1),
    () => new Worker(new URL('./world/chunkWorker.js', import.meta.url), { type: 'module' }),
  )
  const chunkManager = new ChunkManager(scene, pool, SEED)
  const density = createDensityField(SEED)
  const controller = new DiveController(camera, canvas, density)
  const hud = new DebugHud(document.getElementById('hud'))
  const hint = document.getElementById('hint')

  // Dev hooks for verification tooling.
  window.__fathom = { stats: {}, seed: SEED, controller, chunkManager }

  // Plain performance.now() delta: THREE.Timer is not guaranteed in the
  // three/webgpu export, and importing it from three/addons would pull in the
  // bare 'three' build (the double-bundle trap, spec section 3).
  let last = performance.now()

  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    controller.update(dt)

    const depth = -controller.state.pos.y
    const visibility = visibilityAtDepth(depth)
    scene.fog.density = fogDensityFor(visibility)
    chunkManager.update(controller.state.pos, loadRadiusFor(visibility))

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
      pos: controller.state.pos,
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
