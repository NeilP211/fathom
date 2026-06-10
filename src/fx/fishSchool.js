import * as THREE from 'three/webgpu'
import {
  Fn,
  If,
  Loop,
  Continue,
  uniform,
  uniformArray,
  instancedArray,
  instanceIndex,
  positionLocal,
  normalize,
  cross,
  mat3,
  hash,
  float,
  vec3,
  uint,
  length,
  mix,
} from 'three/tsl'
import alea from 'alea'
import { createFishGeometry } from './fishGeometry.js'
import { STIMULUS_SLOTS } from './stimulus.js'

// GPU boids fish school: the webgpu_compute_birds pattern adapted to fish.
// WebGPU-only: the velocity kernel reads neighbor elements, which the WebGL2
// transform-feedback fallback cannot do (spec section 3). Construct only when
// renderer.backend.isWebGLBackend === false; ambientFish.js covers fallback.
const WRAP = 160 // player-centered wrap box, meters

export class FishSchool {
  constructor(count, seed) {
    this.count = count

    // CPU-seeded deterministic init (no init kernel needed).
    const rng = alea(`${seed}:fish`)
    const posArr = new Float32Array(count * 3)
    const velArr = new Float32Array(count * 3)
    const phaseArr = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      posArr[i * 3] = (rng() - 0.5) * WRAP
      posArr[i * 3 + 1] = -8 - rng() * 38 // mid-water column
      posArr[i * 3 + 2] = (rng() - 0.5) * WRAP
      velArr[i * 3] = (rng() - 0.5) * 1.5
      velArr[i * 3 + 1] = (rng() - 0.5) * 0.4
      velArr[i * 3 + 2] = (rng() - 0.5) * 1.5
      phaseArr[i] = rng() * 6.283
    }

    const positions = instancedArray(posArr, 'vec3').setName('fishPositions')
    const velocities = instancedArray(velArr, 'vec3').setName('fishVelocities')
    const phases = instancedArray(phaseArr, 'float').setName('fishPhases')
    positions.setPBO(true)
    velocities.setPBO(true)
    phases.setPBO(true)

    this.uDt = uniform(0)
    this.uPlayer = uniform(new THREE.Vector3(0, -8, 0))
    // Backing arrays shared with StimulusSystem.writeTo (mutated in place,
    // uploaded by the uniformArray nodes each frame).
    this.stimPosVectors = Array.from({ length: STIMULUS_SLOTS }, () => new THREE.Vector4())
    this.stimRadiusVectors = Array.from(
      { length: STIMULUS_SLOTS },
      () => new THREE.Vector4(12, 0, 0, 0),
    )
    this.stimPos = uniformArray(this.stimPosVectors)
    this.stimRadius = uniformArray(this.stimRadiusVectors)

    const uDt = this.uDt
    const uPlayer = this.uPlayer
    const stimPos = this.stimPos
    const stimRadius = this.stimRadius

    const SEP = float(1.2)
    const ALIGN = float(4.0)
    const COHESION = float(6.0)
    const MAX_SPEED = float(2.5)

    this.computeVelocity = Fn(() => {
      const position = positions.element(instanceIndex).toVar()
      const velocity = velocities.element(instanceIndex).toVar()

      const sepForce = vec3(0).toVar()
      const alignSum = vec3(0).toVar()
      const cohSum = vec3(0).toVar()
      const alignCount = float(0).toVar()
      const cohCount = float(0).toVar()

      Loop({ start: uint(0), end: uint(this.count), type: 'uint', condition: '<' }, ({ i }) => {
        If(i.equal(instanceIndex), () => {
          Continue()
        })
        const other = positions.element(i)
        const delta = position.sub(other)
        const dist = length(delta)
        If(dist.lessThan(SEP).and(dist.greaterThan(0.0001)), () => {
          sepForce.addAssign(delta.div(dist).mul(SEP.sub(dist)))
        })
        If(dist.lessThan(ALIGN), () => {
          alignSum.addAssign(velocities.element(i))
          alignCount.addAssign(1)
        })
        If(dist.lessThan(COHESION), () => {
          cohSum.addAssign(other)
          cohCount.addAssign(1)
        })
      })

      velocity.addAssign(sepForce.mul(uDt).mul(4.0))
      If(alignCount.greaterThan(0), () => {
        velocity.addAssign(alignSum.div(alignCount).sub(velocity).mul(uDt).mul(1.2))
      })
      If(cohCount.greaterThan(0), () => {
        velocity.addAssign(cohSum.div(cohCount).sub(position).mul(uDt).mul(0.6))
      })

      // Stimuli: attract (w > 0) or repel (w < 0) within radius, scaled by
      // proximity. Slot strengths come from the CPU StimulusSystem.
      Loop({ start: uint(0), end: uint(STIMULUS_SLOTS), type: 'uint', condition: '<' }, ({ i }) => {
        const s = stimPos.element(i)
        If(s.w.abs().greaterThan(0.001), () => {
          const dir = s.xyz.sub(position)
          const dist = length(dir)
          const radius = stimRadius.element(i).x
          If(dist.lessThan(radius).and(dist.greaterThan(0.001)), () => {
            const falloff = float(1).sub(dist.div(radius))
            velocity.addAssign(dir.div(dist).mul(s.w).mul(falloff).mul(uDt).mul(6.0))
          })
        })
      })

      // Vertical containment: stay in open water (below surface, above floor).
      If(position.y.greaterThan(-6), () => {
        velocity.y.subAssign(uDt.mul(2.0))
      })
      If(position.y.lessThan(-52), () => {
        velocity.y.addAssign(uDt.mul(2.0))
      })

      // Speed limits: cap, and keep a gentle minimum cruise.
      const speed = length(velocity)
      If(speed.greaterThan(MAX_SPEED), () => {
        velocity.assign(velocity.div(speed).mul(MAX_SPEED))
      })
      If(speed.lessThan(0.4), () => {
        velocity.assign(velocity.div(speed.max(0.001)).mul(0.4))
      })

      velocities.element(instanceIndex).assign(velocity)
    })().compute(count).setName('Fish Velocity')

    this.computePosition = Fn(() => {
      const p = positions.element(instanceIndex)
      p.addAssign(velocities.element(instanceIndex).mul(uDt))
      // swim phase advances with speed
      const phase = phases.element(instanceIndex)
      phase.assign(
        phase.add(uDt.mul(length(velocities.element(instanceIndex)).mul(4.0).add(3.0))).mod(6.283),
      )
      // wrap horizontally around the player (vertical containment is steered)
      const half = float(WRAP / 2)
      const size = float(WRAP)
      p.x.assign(p.x.sub(uPlayer.x).add(half).mod(size).sub(half).add(uPlayer.x))
      p.z.assign(p.z.sub(uPlayer.z).add(half).mod(size).sub(half).add(uPlayer.z))
    })().compute(count).setName('Fish Position')

    // Render: orient along velocity, tail wave by phase, two-tone hash tint.
    const material = new THREE.MeshBasicNodeMaterial()
    material.positionNode = Fn(() => {
      const vel = velocities.element(instanceIndex)
      const forward = normalize(vel)
      const right = normalize(cross(vec3(0, 1, 0), forward))
      const up = cross(forward, right)
      const basis = mat3(right, up, forward)

      const local = positionLocal.toVar()
      // spine wave: amplitude grows toward the tail (negative z)
      const tailMask = positionLocal.z.negate().add(0.1).max(0)
      const wave = phases.element(instanceIndex).add(positionLocal.z.mul(2.5)).sin()
      local.x.addAssign(wave.mul(tailMask).mul(0.18))
      // per-instance size variation 0.55-1.0
      const scale = hash(instanceIndex.add(11)).mul(0.45).add(0.55)
      return basis.mul(local.mul(scale)).add(positions.element(instanceIndex))
    })()
    const tintA = vec3(0.55, 0.65, 0.7)
    const tintB = vec3(0.3, 0.45, 0.55)
    material.colorNode = mix(tintA, tintB, hash(instanceIndex.add(5)))
      .mul(positionLocal.y.mul(1.5).add(1.0).clamp(0.6, 1.2))

    this.mesh = new THREE.Mesh(createFishGeometry(), material)
    this.mesh.count = count
    this.mesh.frustumCulled = false
  }

  update(renderer, dt, playerPos, stimulusSystem) {
    this.uDt.value = Math.min(dt, 0.033)
    this.uPlayer.value.set(playerPos.x, playerPos.y, playerPos.z)
    stimulusSystem.writeTo(this.stimPosVectors, this.stimRadiusVectors)
    renderer.compute(this.computeVelocity)
    renderer.compute(this.computePosition)
  }
}
