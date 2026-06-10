// IndexedDB persistence (spec section 9): one slot per seed, four buckets
// flattened into a single snapshot object. localStorage is too small and
// synchronous; this is the only allowed store.

const DB_NAME = 'fathom'
const STORE = 'saves'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveGame(seed, snapshot) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(snapshot, String(seed))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadGame(seed) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(String(seed))
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}
