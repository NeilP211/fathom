import * as THREE from 'three/webgpu'

// Boot per spec section 3: forceWebGL via ?webgl query param, await init(),
// detect the active backend afterward.
export async function createRenderer(canvas) {
  const params = new URLSearchParams(location.search)
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    forceWebGL: params.has('webgl'),
  })
  await renderer.init()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  const backendName = renderer.backend.isWebGLBackend ? 'WebGL2' : 'WebGPU'
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
  return { renderer, backendName }
}
