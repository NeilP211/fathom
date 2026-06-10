// The dive HUD (spec section 5 HUD and UI): DOM overlay, one minimal style.
// Renders from game state every frame; no game logic lives here.

const wrapPi = (a) => {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

export class GameHud {
  constructor(root) {
    root.innerHTML = `
      <div id="compass"><div id="compass-inner"></div></div>
      <div id="objective"></div>
      <div id="bars">
        <div class="bar o2"><div class="fill" id="o2fill"></div><span>O2</span></div>
        <div class="bar hp"><div class="fill" id="hpfill"></div><span>HP</span></div>
        <div class="bar pwr" style="display:none"><div class="fill" id="pwrfill"></div><span>PWR</span></div>
        <div class="bar hull" style="display:none"><div class="fill" id="hullfill"></div><span>HULL</span></div>
      </div>
      <div id="crushwarn" style="display:none">HULL STRESS</div>
      <div id="depth-readout">0m</div>
      <div id="prompt"></div>
      <div id="scanring"><div id="scanfill"></div></div>
      <div id="toasts"></div>
      <div id="vignette"></div>
      <div id="deathscreen"><div>SIGNAL LOST</div><small>RECOVERED AT LAST SAVE</small></div>
      <div id="credits">
        <div class="title">FATHOM</div>
        <p>The core broke the surface at dawn. Whatever Meridian woke is still
        down there, circling the borehole, learning the sound of every engine
        that passes. The evidence is on its way to people who will argue about
        it in bright rooms very far from the water.</p>
        <p>You went dark. You went quiet. You went up.</p>
        <small>click to keep diving - the ocean is still open</small>
      </div>
    `
    this.o2fill = root.querySelector('#o2fill')
    this.hpfill = root.querySelector('#hpfill')
    this.pwrBar = root.querySelector('.bar.pwr')
    this.hullBar = root.querySelector('.bar.hull')
    this.pwrfill = root.querySelector('#pwrfill')
    this.hullfill = root.querySelector('#hullfill')
    this.crushwarn = root.querySelector('#crushwarn')
    this.depthEl = root.querySelector('#depth-readout')
    this.promptEl = root.querySelector('#prompt')
    this.scanring = root.querySelector('#scanring')
    this.scanfill = root.querySelector('#scanfill')
    this.toastsEl = root.querySelector('#toasts')
    this.vignette = root.querySelector('#vignette')
    this.deathEl = root.querySelector('#deathscreen')
    this.creditsEl = root.querySelector('#credits')
    this.compassInner = root.querySelector('#compass-inner')
    this.objectiveEl = root.querySelector('#objective')
    this.degraded = false
  }

  setObjective(text) {
    if (this.objectiveEl.textContent !== (text || '')) {
      this.objectiveEl.textContent = text || ''
    }
    this.objectiveEl.style.display = text ? 'block' : 'none'
  }

  setDegraded(flag) {
    this.degraded = flag
  }

  showCredits() {
    this.creditsEl.style.display = 'flex'
    // the postgame must be reachable: any click dismisses the credits
    this.creditsEl.addEventListener(
      'click',
      () => {
        this.creditsEl.style.display = 'none'
      },
      { once: true },
    )
  }

  toast(text) {
    const el = document.createElement('div')
    el.className = 'toast'
    el.textContent = text
    this.toastsEl.appendChild(el)
    setTimeout(() => el.classList.add('out'), 3600)
    setTimeout(() => el.remove(), 4300)
  }

  setPrompt(text) {
    this.promptEl.textContent = text || ''
    this.promptEl.style.display = text ? 'block' : 'none'
  }

  setScanProgress(t) {
    // t in [0,1] or null to hide
    if (t == null) {
      this.scanring.style.display = 'none'
      return
    }
    this.scanring.style.display = 'block'
    this.scanfill.style.width = `${Math.round(t * 100)}%`
  }

  showDeath(show) {
    this.deathEl.style.display = show ? 'flex' : 'none'
  }

  // sub: { aboard, power, hull, stress } | null
  setSubMode(sub) {
    const aboard = !!(sub && sub.aboard)
    this.pwrBar.style.display = aboard ? 'block' : 'none'
    this.hullBar.style.display = aboard ? 'block' : 'none'
    if (aboard) {
      this.pwrfill.style.width = `${sub.power}%`
      this.hullfill.style.width = `${sub.hull}%`
      this.hullfill.style.background = sub.hull < 35 ? '#e04f3a' : '#7aa3c8'
    }
    this.crushwarn.style.display = aboard && sub.stress ? 'block' : 'none'
  }

  // signalTarget: {x, z, name} | null; contacts: [{x, z, kind}]
  update(state, depth, yaw, pos, signalTarget, contacts = []) {
    this.o2fill.style.width = `${(100 * state.oxygen) / state.oxygenMax}%`
    this.o2fill.style.background = state.oxygen / state.oxygenMax < 0.25 ? '#e04f3a' : '#37c8ab'
    this.hpfill.style.width = `${state.health}%`
    // on the Floor the depth gauge stutters and lies (spec: instruments
    // degrade; the lie doubles as foreshadowing)
    if (this.degraded && Math.random() < 0.12) {
      this.depthEl.textContent = `${(depth + (Math.random() * 160 - 80)).toFixed(0)}m`
    } else {
      this.depthEl.textContent = `${depth.toFixed(0)}m`
    }

    // blackout vignette ramps as the grace window burns
    const black = state.oxygen <= 0 ? Math.min(1, state.blackout / 5) : 0
    this.vignette.style.opacity = black > 0 ? String(0.35 + black * 0.65) : '0'

    // compass: cardinal ticks + signal chevron, positioned by relative bearing
    const marks = [
      ['N', 0],
      ['E', Math.PI / 2],
      ['S', Math.PI],
      ['W', -Math.PI / 2],
    ]
    let html = ''
    for (const [label, ang] of marks) {
      const rel = wrapPi(ang - yaw)
      if (Math.abs(rel) < 1.15) {
        // a degraded compass spins and drops ticks
        if (this.degraded && Math.random() < 0.25) continue
        const jitter = this.degraded ? (Math.random() - 0.5) * 14 : 0
        const xPct = 50 + (rel / 1.15) * 50 + jitter
        html += `<i style="left:${xPct}%">${label}</i>`
      }
    }
    if (signalTarget) {
      const ang = Math.atan2(signalTarget.x - pos.x, -(signalTarget.z - pos.z))
      const rel = wrapPi(ang - yaw)
      const dist = Math.hypot(signalTarget.x - pos.x, signalTarget.z - pos.z)
      const xPct = Math.max(2, Math.min(98, 50 + (rel / 1.15) * 50))
      const label = signalTarget.label ? ` ${signalTarget.label}` : ''
      html += `<b style="left:${xPct}%">&#9660;<u>${dist.toFixed(0)}m${label}</u></b>`
    }
    for (const c of contacts) {
      const ang = Math.atan2(c.x - pos.x, -(c.z - pos.z))
      const rel = wrapPi(ang - yaw)
      const xPct = Math.max(2, Math.min(98, 50 + (rel / 1.15) * 50))
      const cls = c.kind === 'hunter' ? 'big' : ''
      html += `<s class="${cls}" style="left:${xPct}%">&#9670;</s>`
    }
    this.compassInner.innerHTML = html
  }
}
