# FATHOM Milestone 1: Infinite Ocean Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser app where you click, pointer-lock, and swim forever through an infinite procedurally generated ocean floor with caves and overhangs, at 60fps, on WebGPU with a WebGL2 fallback.

**Architecture:** CPU-deterministic worldgen (seeded simplex noise density field) meshed by chunked marching cubes in a Web Worker pool, streamed around the player by a chunk manager whose load radius derives from fog visibility. Collision and movement sample the density field directly (no physics engine, no mesh raycasts). Rendering is three.js r184 `WebGPURenderer` with its automatic WebGL2 fallback.

**Tech Stack:** three@0.184.0 (`three/webgpu` imports only), simplex-noise@4.0.3, alea@1.0.1, Vite, Vitest.

**Read first:** `docs/superpowers/specs/2026-06-09-fathom-design.md` sections 3, 4, and 5 (Controls and camera). Spec section 13 lists API traps. Key conventions used everywhere below:

- Density convention: `density(x,y,z) > 0` means solid rock, `<= 0` means water. The surface is the zero crossing. Near the surface the value approximates meters of penetration.
- World units are meters. Ocean surface is `y = 0`; depth below surface is `-y`.
- Chunk = 32 cubic meters of cells; chunk `(cx,cy,cz)` spans world `[cx*32, cx*32+32)` etc.
- Em dashes and en dashes are forbidden in all files (a PreToolUse hook blocks them). Use hyphens.
- Commit style: short one-line plain English, no co-author trailers.

---

### Task 1: Project skeleton

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.js`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "fathom",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "three": "0.184.0",
    "simplex-noise": "4.0.3",
    "alea": "1.0.1"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write vite.config.js**

```js
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
})
```

- [ ] **Step 3: Write index.html**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FATHOM</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #03141f; }
    #app { width: 100%; height: 100%; display: block; }
    #hud {
      position: fixed; top: 10px; left: 10px; color: #9fd8c9;
      font: 12px/1.5 ui-monospace, monospace; white-space: pre;
      text-shadow: 0 1px 2px #000; pointer-events: none; user-select: none;
    }
    #hint {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      color: #cfeee4; font: 16px ui-monospace, monospace; text-shadow: 0 1px 3px #000;
      pointer-events: none; user-select: none;
    }
  </style>
</head>
<body>
  <canvas id="app"></canvas>
  <div id="hud"></div>
  <div id="hint">click to dive</div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write a placeholder src/main.js (proves the toolchain runs; replaced in Task 9)**

```js
document.getElementById('hud').textContent = 'FATHOM boot...'
```

- [ ] **Step 5: Install and verify**

Run: `npm install && npm run build`
Expected: build succeeds; `dist/` is created. Then `npm test`; expected: "No test files found" exit 0 or vitest passes with zero tests (either is fine at this point; if vitest exits non-zero for zero tests, add `--passWithNoTests` to the test script).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Scaffold Vite project"
```

---

### Task 2: Deterministic density field

**Files:**
- Create: `src/world/density.js`
- Test: `tests/density.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/density.test.js
import { describe, it, expect } from 'vitest'
import { createDensityField } from '../src/world/density.js'

describe('density field', () => {
  it('is deterministic for the same seed', () => {
    const a = createDensityField(1234)
    const b = createDensityField(1234)
    for (let i = 0; i < 200; i++) {
      const x = (i * 37) % 500 - 250
      const y = -((i * 13) % 120)
      const z = (i * 91) % 500 - 250
      expect(a(x, y, z)).toBe(b(x, y, z))
    }
  })

  it('differs between seeds', () => {
    const a = createDensityField(1)
    const b = createDensityField(2)
    let differing = 0
    for (let i = 0; i < 50; i++) {
      if (a(i * 10, -40, i * 7) !== b(i * 10, -40, i * 7)) differing++
    }
    expect(differing).toBeGreaterThan(40)
  })

  it('is water at the surface and rock far below the floor', () => {
    for (const seed of [1, 42, 999]) {
      const d = createDensityField(seed)
      for (const [x, z] of [[0, 0], [100, -50], [-300, 220]]) {
        expect(d(x, 0, z)).toBeLessThan(0)      // surface is always water
        expect(d(x, -120, z)).toBeGreaterThan(0) // 120m down is always inside rock
      }
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/density.test.js`
Expected: FAIL (cannot resolve `src/world/density.js`).

- [ ] **Step 3: Implement src/world/density.js**

The seafloor sits around -45m (varying +/-18m), 3D noise adds rocky relief and
overhangs, and a second 3D noise carves cave tunnels. The bounds in the test
hold because: max floor height is -45 + 18 + 6 = -21 (water above), and at
-120m minimum solid density is (-63 + 120) - 6 - 22 = 29 > 0.

```js
// src/world/density.js
import { createNoise2D, createNoise3D } from 'simplex-noise'
import alea from 'alea'

// density > 0 is solid rock, <= 0 is water; approximate meters near the surface.
// IMPORTANT (spec section 13): each createNoiseXD call gets its own fresh alea
// instance, or the world silently changes.
export function createDensityField(seed) {
  const floorNoise = createNoise2D(alea(`${seed}:floor`))
  const reliefNoise = createNoise3D(alea(`${seed}:relief`))
  const carveNoise = createNoise3D(alea(`${seed}:carve`))

  function fbm2(x, z) {
    let v = 0, amp = 1, f = 1, norm = 0
    for (let o = 0; o < 4; o++) {
      v += amp * floorNoise(x * f, z * f)
      norm += amp
      amp *= 0.5
      f *= 2
    }
    return v / norm // in [-1, 1]
  }

  return function density(x, y, z) {
    const floorY = -45 + 18 * fbm2(x * 0.008, z * 0.008)
    let d = floorY - y // positive below the seafloor surface
    d += 6 * reliefNoise(x * 0.03, y * 0.03, z * 0.03) // rocky relief and overhangs
    const carve = carveNoise(x * 0.02, y * 0.02, z * 0.02)
    if (carve > 0.45) d -= (carve - 0.45) * 40 // cave tunnels through the rock
    return d
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/density.test.js`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/world/density.js tests/density.test.js && git commit -m "Add deterministic density field"
```

---

### Task 3: Vendor marching cubes tables

**Files:**
- Create: `scripts/extract-mc-tables.mjs`, `src/world/mcTables.js` (generated)
- Test: `tests/mcTables.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/mcTables.test.js
import { describe, it, expect } from 'vitest'
import { edgeTable, triTable } from '../src/world/mcTables.js'

describe('marching cubes tables', () => {
  it('has the canonical sizes', () => {
    expect(edgeTable.length).toBe(256)
    expect(triTable.length).toBe(4096)
  })
  it('has empty configs at both ends', () => {
    expect(edgeTable[0]).toBe(0)
    expect(edgeTable[255]).toBe(0)
    expect(triTable[0]).toBe(-1)
    expect(triTable[4095]).toBe(-1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcTables.test.js`
Expected: FAIL (cannot resolve `src/world/mcTables.js`).

- [ ] **Step 3: Write the extraction script**

The canonical tables are vendored from the exact pinned three.js release tag
(MIT license), per spec section 13 ("copy example code from the exact pinned
release tag").

```js
// scripts/extract-mc-tables.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const src = readFileSync('/tmp/mc-r184.js', 'utf8').replace(/\/\/[^\n]*/g, '')
const arrays = [...src.matchAll(/new Int32Array\(\s*\[([\s\S]*?)\]\s*\)/g)]
  .map((m) => m[1].split(',').map((s) => parseInt(s.trim())))
const edgeTable = arrays.find((a) => a.length === 256)
const triTable = arrays.find((a) => a.length === 4096)
if (!edgeTable || !triTable) {
  throw new Error(`tables not found; array lengths seen: ${arrays.map((a) => a.length).join(', ')}`)
}
writeFileSync(
  'src/world/mcTables.js',
  '// Vendored from three.js r184 examples/jsm/objects/MarchingCubes.js (MIT).\n' +
    '// Generated by scripts/extract-mc-tables.mjs; do not edit by hand.\n' +
    `export const edgeTable = new Int32Array([${edgeTable.join(',')}])\n` +
    `export const triTable = new Int32Array([${triTable.join(',')}])\n`,
)
console.log('ok: edgeTable', edgeTable.length, 'triTable', triTable.length)
```

- [ ] **Step 4: Fetch the source and generate**

Run:

```bash
curl -sL https://raw.githubusercontent.com/mrdoob/three.js/r184/examples/jsm/objects/MarchingCubes.js -o /tmp/mc-r184.js
node scripts/extract-mc-tables.mjs
```

Expected: `ok: edgeTable 256 triTable 4096`. If the regex finds nothing, open
/tmp/mc-r184.js and check how the two big lookup tables are declared (they may
be plain arrays rather than Int32Array in this release); adjust the single
regex accordingly and re-run until the ok line prints.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/mcTables.test.js`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add scripts/extract-mc-tables.mjs src/world/mcTables.js tests/mcTables.test.js
git commit -m "Vendor marching cubes tables from three r184"
```

---

### Task 4: Marching cubes mesher

**Files:**
- Create: `src/world/marchingCubes.js`
- Test: `tests/marchingCubes.test.js`

- [ ] **Step 1: Write the failing tests**

The orientation test is load-bearing: it pins both the winding and the normal
direction so lighting is correct and there is no guesswork later.

```js
// tests/marchingCubes.test.js
import { describe, it, expect } from 'vitest'
import { meshChunk, CHUNK, GRID, gridIndex } from '../src/world/marchingCubes.js'

// Build a GRID^3 density grid from an analytic function of LOCAL coords -1..33.
function buildGrid(fn) {
  const grid = new Float32Array(GRID * GRID * GRID)
  let i = 0
  for (let z = -1; z <= CHUNK + 1; z++)
    for (let y = -1; y <= CHUNK + 1; y++)
      for (let x = -1; x <= CHUNK + 1; x++) grid[i++] = fn(x, y, z)
  return grid
}

const sphere = (cx, cy, cz, r) => (x, y, z) =>
  r - Math.hypot(x - cx, y - cy, z - cz) // >0 inside the sphere (solid)

describe('meshChunk', () => {
  it('returns empty output for all-water and all-rock grids', () => {
    expect(meshChunk(buildGrid(() => -1)).positions.length).toBe(0)
    expect(meshChunk(buildGrid(() => 1)).positions.length).toBe(0)
  })

  it('meshes a sphere with vertices near the surface', () => {
    const { positions, normals } = meshChunk(buildGrid(sphere(16, 16, 16, 8)))
    expect(positions.length).toBeGreaterThan(900) // a sphere of triangles
    expect(positions.length % 9).toBe(0) // whole triangles, non-indexed
    expect(normals.length).toBe(positions.length)
    for (let i = 0; i < positions.length; i += 3) {
      const r = Math.hypot(positions[i] - 16, positions[i + 1] - 16, positions[i + 2] - 16)
      expect(r).toBeGreaterThan(7)
      expect(r).toBeLessThan(9)
    }
  })

  it('normals point out of the rock and triangles wind to face the water', () => {
    const { positions, normals } = meshChunk(buildGrid(sphere(16, 16, 16, 8)))
    let gradDot = 0
    let windDot = 0
    const tris = positions.length / 9
    for (let t = 0; t < tris; t++) {
      const o = t * 9
      // outward radial direction at the first vertex
      const rx = positions[o] - 16, ry = positions[o + 1] - 16, rz = positions[o + 2] - 16
      const rl = Math.hypot(rx, ry, rz)
      gradDot += (normals[o] * rx + normals[o + 1] * ry + normals[o + 2] * rz) / rl
      // geometric face normal from winding
      const ax = positions[o + 3] - positions[o], ay = positions[o + 4] - positions[o + 1], az = positions[o + 5] - positions[o + 2]
      const bx = positions[o + 6] - positions[o], by = positions[o + 7] - positions[o + 1], bz = positions[o + 8] - positions[o + 2]
      const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx
      const fl = Math.hypot(fx, fy, fz) || 1
      windDot += (fx * rx + fy * ry + fz * rz) / (fl * rl)
    }
    expect(gradDot / tris).toBeGreaterThan(0.8) // gradient normals point outward
    expect(windDot / tris).toBeGreaterThan(0.5) // winding agrees (front faces the water)
  })

  it('is deterministic', () => {
    const g = buildGrid(sphere(10, 20, 12, 6))
    const a = meshChunk(g)
    const b = meshChunk(g)
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true)
    expect(Buffer.from(a.normals.buffer).equals(Buffer.from(b.normals.buffer))).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/marchingCubes.test.js`
Expected: FAIL (cannot resolve `src/world/marchingCubes.js`).

- [ ] **Step 3: Implement src/world/marchingCubes.js**

Grid layout: `GRID = 35` samples per axis covering LOCAL coordinates -1..33
(one-voxel apron per spec section 4, so central-difference normals are valid at
chunk borders). `gridIndex(x,y,z)` takes 0-based grid indices; local coord `c`
maps to grid index `c + 1`. Output is non-indexed triangles (vertex dedup is a
later optimization; triangle budget already fits, spec section 4).

```js
// src/world/marchingCubes.js
import { edgeTable, triTable } from './mcTables.js'

export const CHUNK = 32 // cells per axis
export const GRID = CHUNK + 3 // 35 samples per axis: grid index i = local coord + 1, local -1..33

export const gridIndex = (x, y, z) => (z * GRID + y) * GRID + x

// Standard marching cubes corner offsets and the corner pairs joined by each edge.
const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
]
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
]

// grid: Float32Array(GRID^3) densities (>0 solid). Returns non-indexed
// { positions, normals } in LOCAL chunk coordinates (0..32 on each axis).
export function meshChunk(grid) {
  const positions = []
  const normals = []
  const vert = new Array(12)
  const norm = new Array(12)
  const d = new Array(8)
  const g0 = [0, 0, 0]
  const g1 = [0, 0, 0]

  // Density gradient at a grid point (points INTO the rock).
  function gradient(gx, gy, gz, out) {
    out[0] = grid[gridIndex(gx + 1, gy, gz)] - grid[gridIndex(gx - 1, gy, gz)]
    out[1] = grid[gridIndex(gx, gy + 1, gz)] - grid[gridIndex(gx, gy - 1, gz)]
    out[2] = grid[gridIndex(gx, gy, gz + 1)] - grid[gridIndex(gx, gy, gz - 1)]
  }

  for (let cz = 0; cz < CHUNK; cz++)
    for (let cy = 0; cy < CHUNK; cy++)
      for (let cx = 0; cx < CHUNK; cx++) {
        let cubeIndex = 0
        for (let i = 0; i < 8; i++) {
          const [ox, oy, oz] = CORNERS[i]
          d[i] = grid[gridIndex(cx + ox + 1, cy + oy + 1, cz + oz + 1)]
          if (d[i] < 0) cubeIndex |= 1 << i // bit set in WATER (Bourke convention: below isolevel)
        }
        const edges = edgeTable[cubeIndex]
        if (edges === 0) continue

        for (let e = 0; e < 12; e++) {
          if (!(edges & (1 << e))) continue
          const [a, b] = EDGES[e]
          const t = d[a] / (d[a] - d[b]) // zero crossing along the edge
          const [ax, ay, az] = CORNERS[a]
          const [bx, by, bz] = CORNERS[b]
          vert[e] = [cx + ax + t * (bx - ax), cy + ay + t * (by - ay), cz + az + t * (bz - az)]
          gradient(cx + ax + 1, cy + ay + 1, cz + az + 1, g0)
          gradient(cx + bx + 1, cy + by + 1, cz + bz + 1, g1)
          // Negated interpolated gradient: out of the rock, into the water.
          const nx = -(g0[0] + t * (g1[0] - g0[0]))
          const ny = -(g0[1] + t * (g1[1] - g0[1]))
          const nz = -(g0[2] + t * (g1[2] - g0[2]))
          const len = Math.hypot(nx, ny, nz) || 1
          norm[e] = [nx / len, ny / len, nz / len]
        }

        for (let i = cubeIndex * 16; triTable[i] !== -1; i += 3) {
          for (const e of [triTable[i], triTable[i + 1], triTable[i + 2]]) {
            positions.push(vert[e][0], vert[e][1], vert[e][2])
            normals.push(norm[e][0], norm[e][1], norm[e][2])
          }
        }
      }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/marchingCubes.test.js`
Expected: 4 passed. Pay attention to the orientation test. If `gradDot` passes
but `windDot` FAILS NEGATIVE, the winding is inverted for our density
convention: fix it by emitting each triangle's vertices in the order
`triTable[i], triTable[i + 2], triTable[i + 1]` (swap the last two) and re-run.
Exactly one of the two orders passes; commit whichever does. Do NOT fix a
winding failure by changing the cubeIndex bit condition (that breaks the
gradient test).

- [ ] **Step 5: Commit**

```bash
git add src/world/marchingCubes.js tests/marchingCubes.test.js
git commit -m "Add chunked marching cubes mesher"
```

---

### Task 5: Chunk generation (the pure function the worker wraps)

**Files:**
- Create: `src/world/chunkGen.js`
- Test: `tests/chunkGen.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/chunkGen.test.js
import { describe, it, expect } from 'vitest'
import { generateChunk } from '../src/world/chunkGen.js'

describe('generateChunk', () => {
  it('is deterministic (byte-identical buffers)', () => {
    const a = generateChunk(777, 0, -2, 0)
    const b = generateChunk(777, 0, -2, 0)
    expect(a.positions.length).toBeGreaterThan(0)
    expect(Buffer.from(a.positions.buffer).equals(Buffer.from(b.positions.buffer))).toBe(true)
    expect(Buffer.from(a.normals.buffer).equals(Buffer.from(b.normals.buffer))).toBe(true)
  })

  it('returns empty buffers for all-water chunks (high above the floor)', () => {
    const r = generateChunk(777, 0, 5, 0) // y in [160, 192], far above any terrain
    expect(r.positions.length).toBe(0)
  })

  it('adjacent chunks share identical border vertices', () => {
    const a = generateChunk(777, 0, -2, 0) // x in [0, 32)
    const b = generateChunk(777, 1, -2, 0) // x in [32, 64)
    const onPlane = (res, ox, planeLocalX) => {
      const set = new Set()
      for (let i = 0; i < res.positions.length; i += 3) {
        if (Math.abs(res.positions[i] - planeLocalX) < 1e-4) {
          set.add(`${(res.positions[i + 1]).toFixed(4)}:${(res.positions[i + 2]).toFixed(4)}`)
        }
      }
      return set
    }
    const aSet = onPlane(a, 0, 32) // local x = 32 is world x = 32
    const bSet = onPlane(b, 32, 0) // local x = 0 is world x = 32
    expect(aSet.size).toBeGreaterThan(0)
    expect(aSet).toEqual(bSet)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/chunkGen.test.js`
Expected: FAIL (cannot resolve `src/world/chunkGen.js`).

- [ ] **Step 3: Implement src/world/chunkGen.js**

Positions are LOCAL to the chunk (0..32); the chunk manager places the mesh at
the chunk origin. The min/max early-out skips meshing fully-water or
fully-rock chunks (spec section 4). The fill loop order (x innermost) must
match `gridIndex` (x fastest).

```js
// src/world/chunkGen.js
import { createDensityField } from './density.js'
import { meshChunk, CHUNK, GRID } from './marchingCubes.js'

const fieldCache = new Map() // seed -> density function (one per worker)

export function generateChunk(seed, cx, cy, cz) {
  let density = fieldCache.get(seed)
  if (!density) {
    density = createDensityField(seed)
    fieldCache.set(seed, density)
  }

  const grid = new Float32Array(GRID * GRID * GRID)
  const ox = cx * CHUNK
  const oy = cy * CHUNK
  const oz = cz * CHUNK
  let min = Infinity
  let max = -Infinity
  let i = 0
  for (let z = -1; z <= CHUNK + 1; z++)
    for (let y = -1; y <= CHUNK + 1; y++)
      for (let x = -1; x <= CHUNK + 1; x++) {
        const d = density(ox + x, oy + y, oz + z)
        grid[i++] = d
        if (d < min) min = d
        if (d > max) max = d
      }

  if (min > 0 || max < 0) {
    return { cx, cy, cz, positions: new Float32Array(0), normals: new Float32Array(0) }
  }
  const { positions, normals } = meshChunk(grid)
  return { cx, cy, cz, positions, normals }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/chunkGen.test.js`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/world/chunkGen.js tests/chunkGen.test.js && git commit -m "Add pure chunk generation"
```

---

### Task 6: Worker and worker pool

**Files:**
- Create: `src/world/chunkWorker.js`, `src/world/workerPool.js`
- Test: `tests/workerPool.test.js`

- [ ] **Step 1: Write the failing test**

The pool is tested with a fake worker (an object with `postMessage`/`onmessage`)
so no DOM or real Worker is needed in Vitest.

```js
// tests/workerPool.test.js
import { describe, it, expect } from 'vitest'
import { WorkerPool } from '../src/world/workerPool.js'

function makeFakeWorker() {
  const w = {
    postMessage(msg) {
      // echo back asynchronously, like a real worker
      setTimeout(() => w.onmessage({ data: { jobId: msg.jobId, echoed: msg.value * 2 } }), 0)
    },
    onmessage: null,
    terminate() {},
  }
  return w
}

describe('WorkerPool', () => {
  it('resolves jobs with matching jobIds across workers', async () => {
    const pool = new WorkerPool(3, makeFakeWorker)
    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6, 7].map((value) => pool.run({ value })),
    )
    expect(results.map((r) => r.echoed)).toEqual([2, 4, 6, 8, 10, 12, 14])
    expect(pool.pending).toBe(0)
    pool.dispose()
  })

  it('tracks pending count while jobs are in flight', async () => {
    const pool = new WorkerPool(1, makeFakeWorker)
    const p1 = pool.run({ value: 1 })
    const p2 = pool.run({ value: 2 })
    expect(pool.pending).toBe(2)
    await Promise.all([p1, p2])
    expect(pool.pending).toBe(0)
    pool.dispose()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workerPool.test.js`
Expected: FAIL (cannot resolve `src/world/workerPool.js`).

- [ ] **Step 3: Implement src/world/workerPool.js**

```js
// src/world/workerPool.js
export class WorkerPool {
  constructor(size, makeWorker) {
    this.workers = []
    this.jobs = new Map() // jobId -> resolve
    this.nextJobId = 1
    this.nextWorker = 0
    for (let i = 0; i < size; i++) {
      const w = makeWorker()
      w.onmessage = (e) => {
        const resolve = this.jobs.get(e.data.jobId)
        if (resolve) {
          this.jobs.delete(e.data.jobId)
          resolve(e.data)
        }
      }
      this.workers.push(w)
    }
  }

  get pending() {
    return this.jobs.size
  }

  run(msg, transfer = []) {
    const jobId = this.nextJobId++
    return new Promise((resolve) => {
      this.jobs.set(jobId, resolve)
      const w = this.workers[this.nextWorker]
      this.nextWorker = (this.nextWorker + 1) % this.workers.length
      w.postMessage({ ...msg, jobId }, transfer)
    })
  }

  dispose() {
    for (const w of this.workers) w.terminate()
    this.workers = []
    this.jobs.clear()
  }
}
```

- [ ] **Step 4: Implement src/world/chunkWorker.js (browser-only; exercised in Task 9)**

```js
// src/world/chunkWorker.js
import { generateChunk } from './chunkGen.js'

self.onmessage = (e) => {
  const { jobId, seed, cx, cy, cz } = e.data
  const r = generateChunk(seed, cx, cy, cz)
  // Transfer the buffers (spec section 13: forgetting the transfer list
  // silently doubles memory and causes hitches).
  self.postMessage(
    { jobId, cx: r.cx, cy: r.cy, cz: r.cz, positions: r.positions, normals: r.normals },
    [r.positions.buffer, r.normals.buffer],
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/workerPool.test.js`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/world/workerPool.js src/world/chunkWorker.js tests/workerPool.test.js
git commit -m "Add chunk worker and worker pool"
```

---

### Task 7: Visibility, fog, and load radius math

**Files:**
- Create: `src/world/visibility.js`
- Test: `tests/visibility.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/visibility.test.js
import { describe, it, expect } from 'vitest'
import { visibilityAtDepth, fogDensityFor, loadRadiusFor } from '../src/world/visibility.js'

describe('visibility curve', () => {
  it('is 96m at the surface and shrinks monotonically with depth', () => {
    expect(visibilityAtDepth(0)).toBe(96)
    let prev = Infinity
    for (let depth = 0; depth <= 900; depth += 50) {
      const v = visibilityAtDepth(depth)
      expect(v).toBeLessThanOrEqual(prev)
      expect(v).toBeGreaterThan(0)
      prev = v
    }
    expect(visibilityAtDepth(800)).toBeLessThanOrEqual(20)
  })

  it('fog density gives 2% transmittance at the visibility distance', () => {
    // FogExp2 factor is exp(-density * distance); at d = visibility it must be 0.02
    const v = 96
    const density = fogDensityFor(v)
    expect(Math.exp(-density * v)).toBeCloseTo(0.02, 5)
  })

  it('load radius is ceil(visibility / 32) + 1 (spec invariant)', () => {
    expect(loadRadiusFor(96)).toBe(4)
    expect(loadRadiusFor(97)).toBe(5)
    expect(loadRadiusFor(64)).toBe(3)
    expect(loadRadiusFor(20)).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/visibility.test.js`
Expected: FAIL (cannot resolve `src/world/visibility.js`).

- [ ] **Step 3: Implement src/world/visibility.js**

```js
// src/world/visibility.js

// Visibility in meters by depth band (piecewise linear; spec section 4).
// Depth is positive meters below the surface.
const CURVE = [
  [0, 96],
  [100, 80],
  [300, 55],
  [600, 30],
  [800, 18],
]

export function visibilityAtDepth(depth) {
  if (depth <= CURVE[0][0]) return CURVE[0][1]
  for (let i = 1; i < CURVE.length; i++) {
    const [d1, v1] = CURVE[i]
    const [d0, v0] = CURVE[i - 1]
    if (depth <= d1) {
      const t = (depth - d0) / (d1 - d0)
      return v0 + t * (v1 - v0)
    }
  }
  return CURVE[CURVE.length - 1][1]
}

// Visibility is where FogExp2 transmittance reaches 2% (spec section 4).
export function fogDensityFor(visibility) {
  return -Math.log(0.02) / visibility
}

// Spec invariant: always at least one loaded chunk ring beyond the fog wall.
export function loadRadiusFor(visibility) {
  return Math.ceil(visibility / 32) + 1
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/visibility.test.js`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/world/visibility.js tests/visibility.test.js && git commit -m "Add visibility and fog math"
```

---

### Task 8: Chunk manager

**Files:**
- Create: `src/world/chunkManager.js`
- Test: `tests/chunkManager.test.js`

- [ ] **Step 1: Write the failing tests (pure wanted-set math only)**

```js
// tests/chunkManager.test.js
import { describe, it, expect } from 'vitest'
import { computeWantedChunks, chunkKey } from '../src/world/chunkManager.js'

describe('computeWantedChunks', () => {
  it('returns a sphere-clipped, vertically clamped set sorted nearest-first', () => {
    const wanted = computeWantedChunks({ cx: 0, cy: -2, cz: 0 }, 4)
    const keys = new Set(wanted.map((w) => w.key))
    expect(keys.has(chunkKey(0, -2, 0))).toBe(true)
    for (const w of wanted) {
      const dx = w.cx - 0, dy = w.cy + 2, dz = w.cz - 0
      expect(dx * dx + dy * dy + dz * dz).toBeLessThanOrEqual(16) // sphere clip r=4
      expect(Math.abs(dy)).toBeLessThanOrEqual(3) // vertical clamp (spec section 4)
    }
    // sorted nearest-first
    for (let i = 1; i < wanted.length; i++) {
      expect(wanted[i].d2).toBeGreaterThanOrEqual(wanted[i - 1].d2)
    }
    // radius-4 sphere with |dy|<=3 has between 150 and 300 cells (spec budget)
    expect(wanted.length).toBeGreaterThan(150)
    expect(wanted.length).toBeLessThan(300)
  })

  it('is centered on the given chunk', () => {
    const wanted = computeWantedChunks({ cx: 10, cy: -1, cz: -7 }, 2)
    expect(wanted[0]).toMatchObject({ cx: 10, cy: -1, cz: -7, d2: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/chunkManager.test.js`
Expected: FAIL (cannot resolve `src/world/chunkManager.js`).

- [ ] **Step 3: Implement src/world/chunkManager.js**

The pure function is tested; the `ChunkManager` class is browser-integration
code verified in Task 9. It imports from `three/webgpu` ONLY (spec section 3).

```js
// src/world/chunkManager.js
import * as THREE from 'three/webgpu'
import { CHUNK } from './marchingCubes.js'

export const chunkKey = (cx, cy, cz) => `${cx},${cy},${cz}`

const VERTICAL_CLAMP = 3 // chunks above/below the player (spec section 4)

export function computeWantedChunks(center, radius) {
  const out = []
  for (let dz = -radius; dz <= radius; dz++)
    for (let dy = -Math.min(radius, VERTICAL_CLAMP); dy <= Math.min(radius, VERTICAL_CLAMP); dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > radius * radius) continue // sphere clip
        const cx = center.cx + dx
        const cy = center.cy + dy
        const cz = center.cz + dz
        out.push({ cx, cy, cz, key: chunkKey(cx, cy, cz), d2 })
      }
  out.sort((a, b) => a.d2 - b.d2)
  return out
}

const MAX_UPLOADS_PER_FRAME = 4 // spec section 4: cap geometry uploads

export class ChunkManager {
  constructor(scene, pool, seed) {
    this.scene = scene
    this.pool = pool
    this.seed = seed
    this.chunks = new Map() // key -> { state: 'pending' | 'ready', mesh: Mesh | null }
    this.uploadQueue = [] // results awaiting geometry upload
    this.material = new THREE.MeshStandardMaterial({
      color: 0x55706a,
      roughness: 0.95,
      metalness: 0.0,
    })
  }

  get residentCount() {
    let n = 0
    for (const c of this.chunks.values()) if (c.state === 'ready') n++
    return n
  }

  // Call once per frame.
  update(playerPos, radius) {
    const center = {
      cx: Math.floor(playerPos.x / CHUNK),
      cy: Math.floor(playerPos.y / CHUNK),
      cz: Math.floor(playerPos.z / CHUNK),
    }
    const wanted = computeWantedChunks(center, radius)
    const wantedKeys = new Set(wanted.map((w) => w.key))

    // Request missing chunks, nearest first.
    for (const w of wanted) {
      if (this.chunks.has(w.key)) continue
      this.chunks.set(w.key, { state: 'pending', mesh: null })
      this.pool
        .run({ seed: this.seed, cx: w.cx, cy: w.cy, cz: w.cz })
        .then((r) => this.uploadQueue.push(r))
    }

    // Dispose chunks that left the radius.
    for (const [key, c] of this.chunks) {
      if (wantedKeys.has(key)) continue
      if (c.mesh) {
        this.scene.remove(c.mesh)
        c.mesh.geometry.dispose()
      }
      this.chunks.delete(key)
    }

    // Upload a bounded number of finished chunks per frame.
    let uploads = 0
    while (this.uploadQueue.length > 0 && uploads < MAX_UPLOADS_PER_FRAME) {
      const r = this.uploadQueue.shift()
      const key = chunkKey(r.cx, r.cy, r.cz)
      const c = this.chunks.get(key)
      if (!c) continue // evicted while generating
      if (r.positions.length === 0) {
        c.state = 'ready' // empty water/rock chunk, nothing to draw
        continue
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(r.positions, 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(r.normals, 3))
      const mesh = new THREE.Mesh(geometry, this.material)
      mesh.position.set(r.cx * CHUNK, r.cy * CHUNK, r.cz * CHUNK)
      mesh.frustumCulled = true
      this.scene.add(mesh)
      c.mesh = mesh
      c.state = 'ready'
      uploads++
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/chunkManager.test.js`
Expected: 2 passed. (Importing `three/webgpu` in Vitest's node environment
must not crash at import time; if it does, move the two pure exports
`chunkKey`/`computeWantedChunks` into a new file `src/world/wanted.js`, have
`chunkManager.js` re-export them, and point the test's import at
`src/world/wanted.js`.)

- [ ] **Step 5: Commit**

```bash
git add src/world/chunkManager.js tests/chunkManager.test.js && git commit -m "Add streaming chunk manager"
```

---

### Task 9: Movement, collision, renderer boot, and the wired-up app

**Files:**
- Create: `src/player/movement.js`, `src/player/diveController.js`, `src/engine/renderer.js`, `src/engine/debugHud.js`
- Modify: `src/main.js` (replace the Task 1 placeholder entirely)
- Test: `tests/movement.test.js`

- [ ] **Step 1: Write the failing tests (pure movement + collision math)**

```js
// tests/movement.test.js
import { describe, it, expect } from 'vitest'
import { stepMovement, resolveCollision } from '../src/player/movement.js'

const openWater = () => -10 // density: water everywhere
// Solid floor at y = -5: density = (-5) - y, so y < -5 is rock
const flatFloor = (x, y, z) => -5 - y

describe('stepMovement', () => {
  it('accelerates toward input and respects the speed cap', () => {
    const state = { pos: { x: 0, y: -2, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 }
    for (let i = 0; i < 600; i++) stepMovement(state, { forward: 1, strafe: 0, up: 0 }, 1 / 60, openWater)
    const speed = Math.hypot(state.vel.x, state.vel.y, state.vel.z)
    expect(speed).toBeGreaterThan(2.0)
    expect(speed).toBeLessThanOrEqual(3.05) // MAX_SPEED 3 + tolerance
    expect(state.pos.z).toBeLessThan(0) // yaw 0 looks down -z, so forward is -z
  })

  it('drag brings the diver to rest and idle sinking pulls gently down', () => {
    const state = { pos: { x: 0, y: -2, z: 0 }, vel: { x: 3, y: 0, z: 0 }, yaw: 0, pitch: 0 }
    for (let i = 0; i < 600; i++) stepMovement(state, { forward: 0, strafe: 0, up: 0 }, 1 / 60, openWater)
    expect(Math.hypot(state.vel.x, 0, state.vel.z)).toBeLessThan(0.1)
    expect(state.vel.y).toBeLessThan(0) // mild negative buoyancy (spec section 4)
    expect(state.vel.y).toBeGreaterThan(-1)
  })

  it('collision keeps the diver out of the floor', () => {
    const state = { pos: { x: 0, y: -4.5, z: 0 }, vel: { x: 0, y: -5, z: 0 }, yaw: 0, pitch: 0 }
    for (let i = 0; i < 300; i++) stepMovement(state, { forward: 0, strafe: 0, up: -1 }, 1 / 60, flatFloor)
    // Floor surface is y = -5; diver radius 0.6 must hold the camera above it
    expect(state.pos.y).toBeGreaterThan(-5.0)
  })
})

describe('resolveCollision', () => {
  it('pushes a point out of solid rock along the gradient', () => {
    const pos = { x: 0, y: -6, z: 0 } // 1m inside the floor
    resolveCollision(flatFloor, pos, 0.6)
    expect(pos.y).toBeGreaterThan(-4.6) // outside, with the radius margin
  })

  it('leaves open-water positions alone', () => {
    const pos = { x: 1, y: -2, z: 3 }
    resolveCollision(openWater, pos, 0.6)
    expect(pos).toEqual({ x: 1, y: -2, z: 3 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/movement.test.js`
Expected: FAIL (cannot resolve `src/player/movement.js`).

- [ ] **Step 3: Implement src/player/movement.js**

All constants are named tuning values per spec section 4 (Collision and
movement). Forward at yaw 0 is -z (three.js camera convention).

```js
// src/player/movement.js

export const MAX_SPEED = 3 // m/s, diver (spec section 4)
export const ACCEL = 12 // m/s^2
export const DRAG = 2.2 // 1/s, exponential
export const SINK_SPEED = 0.25 // m/s, mild negative buoyancy when idle
export const PLAYER_RADIUS = 0.6 // meters

// Push pos out of solid terrain (density > 0 is rock). Density approximates
// meters near the surface, so (d + radius) is the penetration estimate.
export function resolveCollision(density, pos, radius = PLAYER_RADIUS) {
  for (let i = 0; i < 4; i++) {
    const d = density(pos.x, pos.y, pos.z)
    if (d <= -radius) return // comfortably in water
    const eps = 0.5
    const gx = density(pos.x + eps, pos.y, pos.z) - density(pos.x - eps, pos.y, pos.z)
    const gy = density(pos.x, pos.y + eps, pos.z) - density(pos.x, pos.y - eps, pos.z)
    const gz = density(pos.x, pos.y, pos.z + eps) - density(pos.x, pos.y, pos.z - eps)
    const len = Math.hypot(gx, gy, gz) || 1
    const push = (d + radius) * 0.6 // damped gradient step (gradient points INTO rock)
    pos.x -= (gx / len) * push
    pos.y -= (gy / len) * push
    pos.z -= (gz / len) * push
  }
}

// state: { pos, vel, yaw, pitch }; input: { forward, strafe, up } each in [-1, 1].
export function stepMovement(state, input, dt, density) {
  // Look-relative movement basis (yaw only; pitch applies to forward's y).
  const sy = Math.sin(state.yaw)
  const cy = Math.cos(state.yaw)
  const sp = Math.sin(state.pitch)
  const cp = Math.cos(state.pitch)

  // forward at yaw 0, pitch 0 is (0, 0, -1); pitching up tilts it upward
  const fx = -sy * cp
  const fy = sp
  const fz = -cy * cp
  // strafe right is (cos yaw, 0, -sin yaw)
  const rx = cy
  const rz = -sy

  let ax = fx * input.forward + rx * input.strafe
  let ay = fy * input.forward + input.up
  let az = fz * input.forward + rz * input.strafe
  const alen = Math.hypot(ax, ay, az)
  if (alen > 1) {
    ax /= alen
    ay /= alen
    az /= alen
  }

  state.vel.x += ax * ACCEL * dt
  state.vel.y += ay * ACCEL * dt
  state.vel.z += az * ACCEL * dt

  // Exponential drag.
  const drag = Math.exp(-DRAG * dt)
  state.vel.x *= drag
  state.vel.y *= drag
  state.vel.z *= drag

  // Mild negative buoyancy when there is no vertical input.
  if (input.up === 0 && alen === 0) {
    state.vel.y += (-SINK_SPEED - state.vel.y) * Math.min(1, dt * 2) * 0.5
  }

  // Speed cap.
  const speed = Math.hypot(state.vel.x, state.vel.y, state.vel.z)
  if (speed > MAX_SPEED) {
    const s = MAX_SPEED / speed
    state.vel.x *= s
    state.vel.y *= s
    state.vel.z *= s
  }

  state.pos.x += state.vel.x * dt
  state.pos.y += state.vel.y * dt
  state.pos.z += state.vel.z * dt

  // Never above the surface (spec: camera permanently clamped underwater).
  if (state.pos.y > -1.2) {
    state.pos.y = -1.2
    if (state.vel.y > 0) state.vel.y = 0
  }

  resolveCollision(density, state.pos)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/movement.test.js`
Expected: 5 passed.

- [ ] **Step 5: Implement src/player/diveController.js (DOM wrapper; verified in browser)**

```js
// src/player/diveController.js
import { stepMovement } from './movement.js'

const MOUSE_SENSITIVITY = 0.0022
const PITCH_LIMIT = 1.55 // radians, just short of straight up/down

export class DiveController {
  constructor(camera, canvas, density, spawn = { x: 0, y: -8, z: 0 }) {
    this.camera = camera
    this.density = density
    this.state = {
      pos: { ...spawn },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
    }
    this.keys = new Set()

    canvas.addEventListener('click', () => canvas.requestPointerLock())
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return
      this.state.yaw -= e.movementX * MOUSE_SENSITIVITY
      this.state.pitch -= e.movementY * MOUSE_SENSITIVITY
      this.state.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.state.pitch))
    })
    document.addEventListener('keydown', (e) => this.keys.add(e.code))
    document.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
  }

  get locked() {
    return document.pointerLockElement != null
  }

  update(dt) {
    const k = this.keys
    const input = {
      forward: (k.has('KeyW') ? 1 : 0) + (k.has('KeyS') ? -1 : 0),
      strafe: (k.has('KeyD') ? 1 : 0) + (k.has('KeyA') ? -1 : 0),
      up:
        (k.has('Space') ? 1 : 0) +
        (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyC') ? -1 : 0),
    }
    if (!this.locked) {
      input.forward = 0
      input.strafe = 0
      input.up = 0
    }
    stepMovement(this.state, input, dt, this.density)
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.y = this.state.yaw
    this.camera.rotation.x = this.state.pitch
    this.camera.position.set(this.state.pos.x, this.state.pos.y, this.state.pos.z)
  }
}
```

- [ ] **Step 6: Implement src/engine/renderer.js**

```js
// src/engine/renderer.js
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
```

- [ ] **Step 7: Implement src/engine/debugHud.js**

```js
// src/engine/debugHud.js
export class DebugHud {
  constructor(el) {
    this.el = el
    this.fps = 60
  }

  update(dt, info) {
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05 // smoothed
    this.el.textContent =
      `FATHOM dev | ${info.backendName}\n` +
      `fps ${this.fps.toFixed(0)}\n` +
      `depth ${(-info.pos.y).toFixed(1)}m  vis ${info.visibility.toFixed(0)}m\n` +
      `pos ${info.pos.x.toFixed(0)}, ${info.pos.y.toFixed(0)}, ${info.pos.z.toFixed(0)}\n` +
      `chunks ${info.residentChunks} resident, ${info.pendingJobs} generating\n` +
      `seed ${info.seed}`
  }
}
```

- [ ] **Step 8: Replace src/main.js entirely**

```js
// src/main.js
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
  window.__fathom = { stats: {}, seed: SEED }

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
```

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: all tests pass (density 3, mcTables 2, marchingCubes 4, chunkGen 3, workerPool 2, visibility 3, chunkManager 2, movement 5 = 24 tests).

- [ ] **Step 10: Manual browser verification**

Run: `npm run dev` (background), then open http://localhost:5173 in a real
browser (or drive it with the browser tooling). Verify, and capture a
screenshot as evidence:

- The page boots with no console errors; HUD shows "WebGPU" on capable browsers.
- Click locks the pointer; WASD + mouse-look swims; Space/Shift moves up/down.
- A foggy seafloor with hills is visible below; swimming horizontally for 60+
  seconds keeps streaming new terrain (infinite); chunks appear beyond the fog
  (no visible pop-in).
- Swimming into the floor is blocked by collision; you slide, never clip through.
- HUD chunk count settles in the 150-300 range; fps at or near 60.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "Wire up swimmable infinite ocean"
```

---

### Task 10: Fallback smoke test, performance gate, README, push

**Files:**
- Create: `README.md`, `docs/perf-log.md`

- [ ] **Step 1: forceWebGL smoke test (spec section 10 preamble: every milestone)**

With `npm run dev` still running, load http://localhost:5173/?webgl=1 in the
browser. Verify: HUD badge reads "WebGL2", the ocean renders and is swimmable,
no console errors. Record pass/fail.

- [ ] **Step 2: Performance gate (spec section 4)**

In the browser (Chrome on the M-series Mac), after swimming around for ~30
seconds on each of the two URLs (plain and ?webgl=1), read
`window.__fathom.stats.fps` via the console or automation. Then also load the
official upstream stress examples to validate the ecosystem budget for later
milestones:

- https://threejs.org/examples/?q=compute#webgpu_compute_birds
- https://threejs.org/examples/?q=compute#webgpu_compute_particles

Record all numbers in `docs/perf-log.md`:

```markdown
# FATHOM perf log

## 2026-06-09 Milestone 1 gate (M-series MacBook, Chrome)

| Scene | Backend | FPS |
|---|---|---|
| FATHOM infinite ocean (post-M1) | WebGPU | <measured> |
| FATHOM infinite ocean (post-M1) | WebGL2 (forceWebGL) | <measured> |
| three.js webgpu_compute_birds (8k boids) | WebGPU | <measured> |
| three.js webgpu_compute_particles | WebGPU | <measured> |

Gate (spec section 4): FATHOM must hold 60fps with clear headroom (target
~120fps) since this Mac is roughly 2x the Iris Xe floor hardware. Iris Xe
numbers remain projections until a Windows laptop is borrowed (pre-launch).
```

Replace each `<measured>` with the real number. If FATHOM is below 60fps,
STOP and profile before proceeding to Milestone 2 (the debug HUD's chunk and
worker counts are the first suspects; check uploads-per-frame and resident
chunk count against the budgets in spec section 4).

- [ ] **Step 3: Write README.md**

```markdown
# FATHOM

A survival-horror exploration game set in an infinite procedurally generated
ocean, running in the browser on WebGPU (three.js r184) with a WebGL2
fallback. Dive from the sunlit shallows toward the abyssal floor to find out
why the Meridian expedition went silent.

Status: in development. Milestone 1 (infinite swimmable ocean) complete.

## Run

    npm install
    npm run dev

Open http://localhost:5173 in Chrome, Edge, Safari 26+, or Firefox 141+.
Click to dive. WASD + mouse to swim, Space to rise, Shift to sink.
Append ?webgl=1 to force the WebGL2 fallback renderer.

Note: WebGPU requires a secure context. localhost works; plain http over a
LAN IP does not (the game will silently fall back to WebGL2).

## Test

    npm test

## Design

See docs/superpowers/specs/2026-06-09-fathom-design.md.
```

- [ ] **Step 4: Full suite, dash check, commit, push**

```bash
npm test
grep -rnP '[\x{2013}\x{2014}]' src tests README.md docs/perf-log.md && echo "DASHES FOUND: fix before commit" || echo clean
git add -A && git commit -m "Add README and milestone 1 perf log"
git push
```

Expected: tests pass, dash check prints clean, push succeeds.

---

## Verification checklist (milestone 1 definition of done)

- [ ] `npm test`: 24 tests pass
- [ ] Browser: pointer-lock swim through infinite terrain with caves/overhangs, no clipping
- [ ] HUD: WebGPU badge on the primary browser; WebGL2 badge and working scene with ?webgl=1
- [ ] Resident chunks settle in the 150-300 band; no visible chunk pop-in (fog hides it)
- [ ] Perf gate recorded in docs/perf-log.md; 60fps+ held on the M-series Mac
- [ ] All work committed and pushed to NeilP211/fathom
