import * as THREE from 'three/webgpu'
import alea from 'alea'

// Stub signal sites (spec section 10 milestone 4): seeded coordinates plus a
// loot crate, fragments, and a log tablet. Upgraded to full wreck dioramas in
// milestone 7; ids and placement stay stable so saves carry forward.
export function siteDefs(seed, density) {
  const rng = alea(`${seed}:sites`)
  const defs = []
  const specs = [
    {
      id: 'sig1',
      dist: 230,
      loot: [
        { kind: 'fragment', recipeId: 'o2tank2' },
        { kind: 'fragment', recipeId: 'o2tank2' },
        { kind: 'fragment', recipeId: 'fins' },
        { kind: 'fragment', recipeId: 'fins' },
        { kind: 'pickup', item: 'scrap' },
        { kind: 'pickup', item: 'scrap' },
        { kind: 'pickup', item: 'scrap' },
        { kind: 'log', logId: 'log-sig1' },
      ],
    },
    {
      id: 'sig2',
      dist: 470,
      loot: [
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
    },
  ]
  for (const spec of specs) {
    const angle = rng() * Math.PI * 2
    const x = Math.cos(angle) * spec.dist
    const z = Math.sin(angle) * spec.dist
    const y = density.floorY(x, z)
    const entities = []
    const er = alea(`${seed}:site:${spec.id}`)
    spec.loot.forEach((l, i) => {
      const ex = x + (er() - 0.5) * 10
      const ez = z + (er() - 0.5) * 10
      const ey = density.floorY(ex, ez) + 0.5
      entities.push({ ...l, id: `site:${spec.id}:${i}`, x: ex, y: ey, z: ez })
    })
    defs.push({ id: spec.id, x, y, z, entities })
  }
  return defs
}

// Visuals: crate + glowing fragment panels + log tablet. One group per site.
export function buildSiteGroup(site) {
  const group = new THREE.Group()

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.1, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x6a6f5a, roughness: 0.8, metalness: 0.4 }),
  )
  crate.position.set(site.x, site.y + 0.55, site.z)
  crate.rotation.y = 0.6
  group.add(crate)

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
