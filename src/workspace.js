const USER_KEY = 'user_id'
const DB_NAME = 'promptvault-workflows-v1'
let database

export function visitorId(prefix = 'pv') {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return prefix + '_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export async function visitor(fresh = false) {
  function select() {
    const next = visitorId()
    try {
      const previous = localStorage.getItem(USER_KEY)
      if (!fresh && /^pv_[a-f0-9]{32}$/.test(previous || '')) return { id: previous, persistent: true }
      localStorage.setItem(USER_KEY, next)
      return { id: next, persistent: true }
    } catch {
      return { id: next, persistent: false }
    }
  }
  if (globalThis.navigator?.locks) {
    try { return await navigator.locks.request('promptvault-identity', select) } catch { /* Some local file origins disable Web Locks. */ }
  }
  return select()
}

function connect() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('workflows', { keyPath: 'id' })
        store.createIndex('owner', 'owner')
      }
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); database = undefined }
        resolve(request.result)
      }
      request.onerror = () => reject(request.error)
    }).catch(error => { database = undefined; throw error })
  }
  return database
}

export async function listWorkflows(owner) {
  const db = await connect()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('workflows', 'readonly')
    const query = tx.objectStore('workflows').index('owner').getAll(owner)
    tx.oncomplete = () => resolve(query.result.sort((a, b) => b.updated - a.updated))
    tx.onabort = () => reject(tx.error || new Error('Could not read workflows.'))
  })
}

export async function saveWorkflow(owner, draft) {
  const title = draft.title.trim()
  const prompt = draft.prompt.trim()
  if (!title || !prompt || title.length > 100 || prompt.length > 12000) {
    throw new Error('Enter a title (1-100 characters) and a prompt (1-12,000 characters).')
  }
  const db = await connect()
  return new Promise((resolve, reject) => {
    // Read and write in one transaction so simultaneous first saves have one winner.
    const tx = db.transaction('workflows', 'readwrite')
    const store = tx.objectStore('workflows')
    const existing = store.get(draft.id)
    const count = store.index('owner').count(owner)
    let record
    count.onsuccess = () => {
      if (existing.result && existing.result.owner !== owner) { tx.abort(); return }
      const now = Date.now()
      record = { id: draft.id, owner, title, prompt, created: existing.result?.created ?? now, updated: now }
      store.put(record)
    }
    tx.oncomplete = () => resolve({ record, first: count.result === 0 })
    tx.onabort = () => reject(tx.error || new Error('Storage did not commit the workflow.'))
  })
}
