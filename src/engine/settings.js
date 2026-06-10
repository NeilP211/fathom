// Tiny user settings (volume, invert Y, quality). localStorage is allowed
// here per spec section 9 (only saves need IndexedDB; settings are ~100B).
const KEY = 'fathom:settings'

const DEFAULTS = { volume: 0.9, invertY: false, quality: 'high' }

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
