import { RECIPES, LOGS, SIGNALS, canCraft } from '../game/state.js'

// The PDA: Tab-toggled panel with Inventory / Craft / Journal tabs
// (spec section 5: list-based, no drag-and-drop, click recipe to craft).
export class Pda {
  constructor(root, { onCraft }) {
    this.root = root
    this.onCraft = onCraft
    this.tab = 'inventory'
    this.open = false
    root.innerHTML = `
      <div id="pda-panel">
        <div id="pda-tabs"></div>
        <div id="pda-body"></div>
        <div id="pda-hint">TAB to close</div>
      </div>
    `
    this.tabsEl = root.querySelector('#pda-tabs')
    this.bodyEl = root.querySelector('#pda-body')
    this.tabsEl.addEventListener('click', (e) => {
      if (e.target.dataset.tab) {
        this.tab = e.target.dataset.tab
        this.render()
      }
    })
    this.bodyEl.addEventListener('click', (e) => {
      const id = e.target.dataset.craft
      if (id) {
        this.onCraft(id)
        this.render()
      }
    })
  }

  setOpen(open, state) {
    this.open = open
    this.state = state
    this.root.style.display = open ? 'flex' : 'none'
    if (open) this.render()
  }

  render() {
    const s = this.state
    const tabs = ['inventory', 'craft', 'journal']
    this.tabsEl.innerHTML = tabs
      .map((t) => `<span data-tab="${t}" class="${t === this.tab ? 'on' : ''}">${t.toUpperCase()}</span>`)
      .join('')

    if (this.tab === 'inventory') {
      const rows = Object.entries(s.inventory).filter(([, n]) => n > 0)
      this.bodyEl.innerHTML = rows.length
        ? rows.map(([item, n]) => `<div class="row"><span>${item}</span><b>x${n}</b></div>`).join('')
        : '<div class="empty">nothing collected yet</div>'
    } else if (this.tab === 'craft') {
      this.bodyEl.innerHTML = RECIPES.map((r) => {
        const crafted = !r.repeatable && s.crafted.includes(r.id)
        const known = r.known || (s.fragments[r.id] || 0) >= (r.fragmentsNeeded || Infinity)
        const cost = Object.entries(r.cost)
          .map(([i, n]) => `${i} x${n}`)
          .join(', ')
        if (crafted) return `<div class="row done"><span>${r.name}</span><b>CRAFTED</b></div>`
        if (!known) {
          const have = s.fragments[r.id] || 0
          return `<div class="row locked"><span>${r.name}</span><b>fragments ${have}/${r.fragmentsNeeded}</b></div>`
        }
        if (r.cradleOnly && !this.atCradle) {
          return `<div class="row locked"><span>${r.name}<small>${r.desc}</small></span><b>CRADLE ONLY</b></div>`
        }
        const ok = canCraft(s, r.id)
        return `<div class="row"><span>${r.name}<small>${r.desc} (${cost})</small></span>` +
          `<button data-craft="${r.id}" ${ok ? '' : 'disabled'}>CRAFT</button></div>`
      }).join('')
    } else {
      const sigRows = s.firedSignals
        .map((id) => {
          const sig = SIGNALS.find((x) => x.id === id)
          const found = s.logs.includes(sig.log)
          return `<div class="row"><span>${sig.name}</span><b>${found ? 'RECOVERED' : 'ACTIVE'}</b></div>`
        })
        .join('')
      const logRows = s.logs
        .map((id) => {
          const log = LOGS[id]
          return log ? `<div class="log"><b>${log.title}</b><p>${log.body}</p></div>` : ''
        })
        .join('')
      this.bodyEl.innerHTML =
        `<div class="section">SIGNALS</div>${sigRows || '<div class="empty">no signals yet</div>'}` +
        `<div class="section">RECOVERED LOGS</div>${logRows || '<div class="empty">none recovered</div>'}`
    }
  }
}
