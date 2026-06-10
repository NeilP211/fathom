import * as THREE from 'three/webgpu'
import alea from 'alea'
import { sitePositionsForSeed } from '../world/anchors.js'

// The five Meridian wreck sites (spec section 6): positions come from the
// story corridor (anchors.js); loot escalates the gear ladder; each carries
// one log of the breadcrumb chain. Ids stay stable so saves carry forward.
const SITE_LOOT = {
  sig1: [
    { kind: 'fragment', recipeId: 'o2tank2' },
    { kind: 'fragment', recipeId: 'o2tank2' },
    { kind: 'fragment', recipeId: 'fins' },
    { kind: 'fragment', recipeId: 'fins' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'log', logId: 'log-sig1' },
  ],
  sig2: [
    { kind: 'fragment', recipeId: 'suit2' },
    { kind: 'fragment', recipeId: 'suit2' },
    { kind: 'fragment', recipeId: 'suit2' },
    { kind: 'fragment', recipeId: 'sub' },
    { kind: 'fragment', recipeId: 'sub' },
    { kind: 'fragment', recipeId: 'sub' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'biolume' },
    { kind: 'pickup', item: 'biolume' },
    { kind: 'log', logId: 'log-sig2' },
    { kind: 'cradle' },
  ],
  sig3: [
    { kind: 'fragment', recipeId: 'hull2' },
    { kind: 'fragment', recipeId: 'hull2' },
    { kind: 'fragment', recipeId: 'hull2' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'biolume' },
    { kind: 'log', logId: 'log-sig3' },
  ],
  sig4: [
    { kind: 'fragment', recipeId: 'hull3' },
    { kind: 'fragment', recipeId: 'hull3' },
    { kind: 'fragment', recipeId: 'hull3' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'pickup', item: 'scrap' },
    { kind: 'log', logId: 'log-sig4' },
  ],
  sig5: [
    { kind: 'core' },
    { kind: 'log', logId: 'log-sig5' },
  ],
}

export function siteDefs(seed, density) {
  return sitePositionsForSeed(seed, density).map((p) => {
    const entities = []
    const er = alea(`${seed}:site:${p.id}`)
    SITE_LOOT[p.id].forEach((l, i) => {
      const ex = p.x + (er() - 0.5) * 10
      const ez = p.z + (er() - 0.5) * 10
      const ey = density.floorY(ex, ez) + 0.5
      entities.push({ ...l, id: `site:${p.id}:${i}`, x: ex, y: ey, z: ez })
    })
    return { id: p.id, x: p.x, y: p.y, z: p.z, dist: p.dist, entities }
  })
}

// Visuals: wreck diorama per site (broken hull, containers, antenna mast)
// plus glowing fragment panels and log tablets. One group per site.
export function buildSiteGroup(site, siteIndex = 0) {
  const group = new THREE.Group()

  const wreckMat = new THREE.MeshStandardMaterial({
    color: 0x5a6258,
    roughness: 0.85,
    metalness: 0.5,
  })

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.1, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x6a6f5a, roughness: 0.8, metalness: 0.4 }),
  )
  crate.position.set(site.x, site.y + 0.55, site.z)
  crate.rotation.y = 0.6
  group.add(crate)

  // broken hull section: a split cylinder lying on the floor, larger per site
  const hullR = 2 + siteIndex * 0.5
  const hull = new THREE.Mesh(
    new THREE.CylinderGeometry(hullR, hullR, hullR * 3.2, 12, 1, true, 0, Math.PI * 1.25),
    wreckMat,
  )
  hull.material.side = THREE.DoubleSide
  hull.rotation.set(Math.PI / 2, 0, 0.9 + siteIndex)
  hull.position.set(site.x - 7 - siteIndex, site.y + hullR * 0.4, site.z + 6)
  group.add(hull)

  // containers
  for (let i = 0; i < 2 + siteIndex; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.3), wreckMat)
    const a = i * 2.4 + siteIndex
    c.position.set(site.x + Math.cos(a) * (6 + i), site.y + 0.6, site.z + Math.sin(a) * (6 + i))
    c.rotation.y = a
    c.rotation.z = (i % 2) * 0.35
    group.add(c)
  }

  // fallen antenna mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 9 + siteIndex * 2, 6), wreckMat)
  mast.rotation.set(Math.PI / 2 - 0.12, 0, 0.4 + siteIndex * 0.7)
  mast.position.set(site.x + 4, site.y + 0.5, site.z - 8)
  group.add(mast)

  const fragmentMaterial = new THREE.MeshStandardMaterial({
    color: 0x2e3b44,
    emissive: 0x4aa3ff,
    emissiveIntensity: 1.1,
    roughness: 0.5,
  })
  const logMaterial = new THREE.MeshStandardMaterial({
    color: 0x202326,
    emissive: 0xffa133,
    emissiveIntensity: 1.3,
    roughness: 0.5,
  })
  const pickupMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d9499,
    roughness: 0.6,
    metalness: 0.7,
  })

  const meshes = new Map()
  for (const e of site.entities) {
    let mesh
    if (e.kind === 'core') {
      // the evidence core: a slowly pulsing deep-red vault of answers
      mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.55, 1),
        new THREE.MeshStandardMaterial({
          color: 0x401418,
          emissive: 0xc23030,
          emissiveIntensity: 2.2,
          roughness: 0.3,
          metalness: 0.4,
        }),
      )
      mesh.position.set(e.x, e.y + 0.4, e.z)
      group.add(mesh)
      meshes.set(e.id, mesh)
      continue
    }
    if (e.kind === 'cradle') {
      // the salvage cradle: an open frame the sub is assembled in
      mesh = new THREE.Group()
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x55636b,
        roughness: 0.55,
        metalness: 0.7,
        emissive: 0x123038,
        emissiveIntensity: 0.5,
      })
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 6), frameMat)
        rail.position.set(side * 2, 0.15, 0)
        mesh.add(rail)
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), frameMat)
        post.position.set(side * 2, 1.2, -2.6)
        mesh.add(post)
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.25, 0.25), frameMat)
      beam.position.set(0, 2.3, -2.6)
      mesh.add(beam)
      mesh.position.set(e.x, e.y - 0.4, e.z)
      group.add(mesh)
      meshes.set(e.id, mesh)
      continue
    }
    if (e.kind === 'fragment') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.12), fragmentMaterial)
      mesh.rotation.set(-0.4, Math.abs(e.x * 13) % 1, 0) // deterministic scatter
    } else if (e.kind === 'log') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.06), logMaterial)
      mesh.rotation.x = -0.7
    } else {
      mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28), pickupMaterial)
    }
    mesh.position.set(e.x, e.y, e.z)
    group.add(mesh)
    meshes.set(e.id, mesh)
  }
  return { group, meshes }
}
