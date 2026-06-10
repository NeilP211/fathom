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
