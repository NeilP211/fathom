// The pure game-state core (spec section 5). No DOM, no three.js: every rule
// lives here so it can be tested. All numbers are tuning values.

export const TUNING = {
  oxygenBase: 45, // seconds of air at tier 1 (spec: brutally short)
  oxygenDrainMoving: 1.15, // multiplier while swimming hard
  blackoutSeconds: 5, // grace window at 0 oxygen before death
  healthMax: 100,
  pressureDamagePerSec: 6, // below suit rating
  suitRatings: [100, 200], // meters by suit tier (1-indexed tiers)
  refillPerSec: 30, // oxygen refill rate at surface/buoy
}

export const RECIPES = [
  {
    id: 'scanner',
    name: 'Scanner',
    cost: { scrap: 2 },
    known: true, // bootstrap carve-out: standard salvage-contractor kit
    desc: 'Hold E near fragments to scan them into blueprints.',
  },
  {
    id: 'o2tank2',
    name: 'O2 Tank II',
    cost: { scrap: 4 },
    fragmentsNeeded: 2,
    desc: 'Doubles your air supply.',
    effect: (s) => {
      s.oxygenMax = 90
    },
  },
  {
    id: 'fins',
    name: 'Fins',
    cost: { scrap: 3 },
    fragmentsNeeded: 2,
    desc: 'Swim 30% faster.',
    effect: (s) => {
      s.speedMult = 1.3
    },
  },
  {
    id: 'suit2',
    name: 'Pressure Suit II',
    cost: { scrap: 6, biolume: 2 },
    fragmentsNeeded: 3,
    desc: 'Free-swim safely to 200m.',
    effect: (s) => {
      s.suitTier = 2
    },
  },
  {
    id: 'sub',
    name: 'Submersible MK1',
    cost: { scrap: 8, biolume: 2 },
    fragmentsNeeded: 3,
    cradleOnly: true,
    desc: 'A one-person sub. Hull rated to 300m. Assemble at the salvage cradle.',
  },
]

// Signals: the entire quest system (spec section 5). M4 ships the first two;
// the chain continues in M7. Trigger rule: a signal fires when its
// predecessor's log has been recovered (signal 1 fires after the first craft).
export const SIGNALS = [
  {
    id: 'sig1',
    name: 'MERIDIAN BUOY 7 - automated distress',
    after: 'firstCraft',
    log: 'log-sig1',
  },
  {
    id: 'sig2',
    name: 'MERIDIAN SURVEY POST A - last transmission',
    after: 'log-sig1',
    log: 'log-sig2',
  },
]

export const LOGS = {
  'log-sig1': {
    title: 'Buoy 7 maintenance slate',
    body:
      'Day 12. Resupply skiff never showed. Comms to the survey post answer ' +
      'with carrier tone only. Weather is flat calm, which makes the quiet ' +
      'worse. If anyone reads this, the post is south-southwest of here. ' +
      '- T. Okafor, tender',
  },
  'log-sig2': {
    title: 'Survey Post A duty log',
    body:
      'Entry 31. Drilling team went deep again against my objection. The ' +
      'returns came back wrong: the echo sounder shows a floor where there ' +
      'is no floor. Symons says instruments lie at depth. Instruments do ' +
      'not flinch, though. People flinch. - A. Reyes, postmaster',
  },
}

export function createState() {
  return {
    health: TUNING.healthMax,
    oxygen: TUNING.oxygenBase,
    oxygenMax: TUNING.oxygenBase,
    suitTier: 1,
    speedMult: 1,
    blackout: 0, // seconds spent at 0 oxygen
    dead: false,
    inventory: {}, // item -> count
    crafted: [], // recipe ids
    fragments: {}, // recipeId -> fragments scanned
    logs: [], // recovered log ids
    firedSignals: [], // signal ids announced to the player
    consumed: [], // consumed world node ids (worldDiffs bucket)
    flags: { firstCraft: false },
  }
}

export function suitRating(state) {
  return TUNING.suitRatings[Math.min(state.suitTier, TUNING.suitRatings.length) - 1]
}

// env: { depth, refilling, moving }
// Returns events: ['blackout-start'] | ['death'] | ['pressure-damage'] etc.
export function tick(state, env, dt) {
  const events = []
  if (state.dead) return events

  if (env.refilling) {
    if (state.oxygen < state.oxygenMax) {
      state.oxygen = Math.min(state.oxygenMax, state.oxygen + TUNING.refillPerSec * dt)
    }
    state.blackout = 0
  } else {
    const drain = env.moving ? TUNING.oxygenDrainMoving : 1
    state.oxygen = Math.max(0, state.oxygen - drain * dt)
  }

  if (state.oxygen <= 0) {
    if (state.blackout === 0) events.push('blackout-start')
    state.blackout += dt
    if (state.blackout >= TUNING.blackoutSeconds) {
      state.dead = true
      events.push('death')
      return events
    }
  } else {
    state.blackout = 0
  }

  if (env.depth > suitRating(state)) {
    state.health -= TUNING.pressureDamagePerSec * dt
    events.push('pressure-damage')
    if (state.health <= 0) {
      state.health = 0
      state.dead = true
      events.push('death')
    }
  }

  return events
}

export function addItem(state, item, n = 1) {
  state.inventory[item] = (state.inventory[item] || 0) + n
}

export function canCraft(state, recipeId) {
  const r = RECIPES.find((x) => x.id === recipeId)
  if (!r) return false
  if (state.crafted.includes(recipeId)) return false
  const known = r.known || (state.fragments[recipeId] || 0) >= (r.fragmentsNeeded || Infinity)
  if (!known) return false
  for (const [item, n] of Object.entries(r.cost)) {
    if ((state.inventory[item] || 0) < n) return false
  }
  return true
}

export function craft(state, recipeId) {
  if (!canCraft(state, recipeId)) return false
  const r = RECIPES.find((x) => x.id === recipeId)
  for (const [item, n] of Object.entries(r.cost)) state.inventory[item] -= n
  state.crafted.push(recipeId)
  if (r.effect) r.effect(state)
  state.flags.firstCraft = true
  return true
}

// Scanning a fragment for a blueprint; returns 'progress' | 'unlocked' | 'done'.
export function scanFragment(state, recipeId) {
  const r = RECIPES.find((x) => x.id === recipeId)
  if (!r || !r.fragmentsNeeded) return 'done'
  const have = state.fragments[recipeId] || 0
  if (have >= r.fragmentsNeeded) return 'done'
  state.fragments[recipeId] = have + 1
  return state.fragments[recipeId] >= r.fragmentsNeeded ? 'unlocked' : 'progress'
}

export function recoverLog(state, logId) {
  if (!state.logs.includes(logId)) state.logs.push(logId)
}

// Which signals should fire now (announce + journal) given the chain rule.
export function signalsToFire(state) {
  const out = []
  for (const sig of SIGNALS) {
    if (state.firedSignals.includes(sig.id)) continue
    const ok =
      sig.after === 'firstCraft' ? state.flags.firstCraft : state.logs.includes(sig.after)
    if (ok) out.push(sig)
  }
  return out
}

export function markSignalFired(state, sigId) {
  if (!state.firedSignals.includes(sigId)) state.firedSignals.push(sigId)
}

export function serialize(state) {
  return JSON.parse(JSON.stringify(state))
}

export function deserialize(obj) {
  const s = createState()
  Object.assign(s, JSON.parse(JSON.stringify(obj)))
  // re-apply crafted effects (functions do not serialize)
  for (const id of s.crafted) {
    const r = RECIPES.find((x) => x.id === id)
    if (r && r.effect) r.effect(s)
  }
  return s
}
