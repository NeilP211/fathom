import * as THREE from 'three/webgpu'

// The submersible (spec section 5 "The sub IS the base"). MK1 in M5; hull
// tiers MK2/MK3 arrive with the depth content in M7. All numbers tuning.

export const SUB_TUNING = {
  maxSpeed: 6, // m/s MK1
  limpSpeed: 1, // with dead batteries
  radius: 1.6, // collision capsule
  powerMax: 100,
  hullMax: 100,
  drainMoving: 1.1, // per second at full throttle
  drainLights: 0.45,
  solarPerSec: 2, // above solarDepth
  solarDepth: 20,
  buoyChargePerSec: 8,
  crushDepths: [300, 600, 900], // MK1/2/3
  warnMargin: 25, // hull-stress warning band before crush depth
  crushDamagePerSec: 5,
}

export function createSubState() {
  return {
    built: false,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    power: SUB_TUNING.powerMax,
    hull: SUB_TUNING.hullMax,
    tier: 1,
    lights: false,
  }
}

export function subCrushDepth(sub) {
  return SUB_TUNING.crushDepths[Math.min(sub.tier, SUB_TUNING.crushDepths.length) - 1]
}

export function subMaxSpeed(sub) {
  return sub.power > 0 ? SUB_TUNING.maxSpeed : SUB_TUNING.limpSpeed
}

// env: { depth, throttle (0..1), atBuoy, occupied }
// events: 'hull-stress' | 'crush-damage' | 'sub-destroyed'
export function tickSub(sub, env, dt) {
  const events = []
  if (!sub.built) return events

  // power
  let drain = env.throttle * SUB_TUNING.drainMoving
  if (sub.lights) drain += SUB_TUNING.drainLights
  sub.power = Math.max(0, sub.power - drain * dt)
  if (env.atBuoy) {
    sub.power = Math.min(SUB_TUNING.powerMax, sub.power + SUB_TUNING.buoyChargePerSec * dt)
  } else if (env.depth < SUB_TUNING.solarDepth) {
    sub.power = Math.min(SUB_TUNING.powerMax, sub.power + SUB_TUNING.solarPerSec * dt)
  }

  // hull
  const crush = subCrushDepth(sub)
  if (env.depth > crush - SUB_TUNING.warnMargin && env.depth <= crush) {
    events.push('hull-stress')
  } else if (env.depth > crush) {
    sub.hull = Math.max(0, sub.hull - SUB_TUNING.crushDamagePerSec * dt)
    events.push('crush-damage')
    if (sub.hull <= 0) events.push('sub-destroyed')
  }

  return events
}

export function createSubMesh() {
  const group = new THREE.Group()
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xb8a23a,
    roughness: 0.45,
    metalness: 0.65,
  })
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x20262b,
    roughness: 0.35,
    metalness: 0.6,
  })

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.2, 6, 14), hullMat)
  body.rotation.x = Math.PI / 2 // capsule axis along z (forward)
  group.add(body)

  // forward is -z to match the controller convention (yaw 0 faces -z)
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 18, 14),
    new THREE.MeshStandardMaterial({
      color: 0x0b2330,
      roughness: 0.1,
      metalness: 0.2,
      emissive: 0x06222e,
      emissiveIntensity: 0.5,
    }),
  )
  nose.position.set(0, 0.1, -1.95)
  group.add(nose)

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 1.0), darkMat)
  fin.position.set(0, 1.15, 1.3)
  group.add(fin)

  for (const side of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 2.6), darkMat)
    skid.position.set(side * 0.95, -1.25, 0)
    group.add(skid)
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.3, 10),
      new THREE.MeshStandardMaterial({
        color: 0xfff2d8,
        emissive: 0xfff2d8,
        emissiveIntensity: 0.25,
      }),
    )
    lamp.rotation.x = Math.PI / 2
    lamp.position.set(side * 0.75, -0.35, -1.9)
    group.add(lamp)
  }

  return group
}
