const DB_NAME = 'coffee_pos_offline_db'
const DB_VERSION = 1
const STORE_NAME = 'order_queue'

function branchKey(branchId?: string | null) {
  const normalized = String(branchId || '').trim()
  return normalized || 'all'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'branchKey' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
  })
}

export async function readPosOfflineQueue<T>(branchId?: string | null): Promise<T[]> {
  const key = branchKey(branchId)
  try {
    const db = await openDb()
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(key)
      request.onsuccess = () => {
        const queue = request.result?.queue
        resolve(Array.isArray(queue) ? (queue as T[]) : [])
      }
      request.onerror = () => reject(request.error || new Error('Failed to read offline queue'))
      tx.oncomplete = () => db.close()
    })
  } catch {
    return []
  }
}

export async function writePosOfflineQueue<T>(branchId: string | null | undefined, queue: T[]): Promise<void> {
  const key = branchKey(branchId)
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({
      branchKey: key,
      queue: Array.isArray(queue) ? queue : [],
      updatedAt: new Date().toISOString(),
    })
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error || new Error('Failed to write offline queue'))
  })
}
