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
      <div id="bars">
        <div class="bar o2"><div class="fill" id="o2fill"></div><span>O2</span></div>
        <div class="bar hp"><div class="fill" id="hpfill"></div><span>HP</span></div>
      </div>
      <div id="depth-readout">0m</div>
      <div id="prompt"></div>
      <div id="scanring"><div id="scanfill"></div></div>
      <div id="toasts"></div>
      <div id="vignette"></div>
      <div id="deathscreen"><div>SIGNAL LOST</div><small>RECOVERED AT LAST SAVE</small></div>
    `
    this.o2fill = root.querySelector('#o2fill')
    this.hpfill = root.querySelector('#hpfill')
    this.depthEl = root.querySelector('#depth-readout')
    this.promptEl = root.querySelector('#prompt')
    this.scanring = root.querySelector('#scanring')
    this.scanfill = root.querySelector('#scanfill')
    this.toastsEl = root.querySelector('#toasts')
    this.vignette = root.querySelector('#vignette')
    this.deathEl = root.querySelector('#deathscreen')
    this.compassInner = root.querySelector('#compass-inner')
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

  // signalTarget: {x, z, name} | null
  update(state, depth, yaw, pos, signalTarget) {
    this.o2fill.style.width = `${(100 * state.oxygen) / state.oxygenMax}%`
    this.o2fill.style.background = state.oxygen / state.oxygenMax < 0.25 ? '#e04f3a' : '#37c8ab'
    this.hpfill.style.width = `${state.health}%`
    this.depthEl.textContent = `${depth.toFixed(0)}m`

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
        const xPct = 50 + (rel / 1.15) * 50
        html += `<i style="left:${xPct}%">${label}</i>`
      }
    }
    if (signalTarget) {
      const ang = Math.atan2(signalTarget.x - pos.x, -(signalTarget.z - pos.z))
      const rel = wrapPi(ang - yaw)
      const dist = Math.hypot(signalTarget.x - pos.x, signalTarget.z - pos.z)
      const xPct = Math.max(2, Math.min(98, 50 + (rel / 1.15) * 50))
      html += `<b style="left:${xPct}%">&#9660;<u>${dist.toFixed(0)}m</u></b>`
    }
    this.compassInner.innerHTML = html
  }
}
