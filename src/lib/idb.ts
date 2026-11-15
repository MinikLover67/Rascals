// Attachment bytes live in IndexedDB (localStorage cannot hold blobs).
// Works in plain browsers and the Tauri webview. Best-effort LRU cap.

const DB_NAME = 'rascals-files'
const STORE = 'blobs'
const KV = 'kv'
const MAX_BYTES = 200 * 1024 * 1024

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode)
      const req = fn(t.objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function putBlob(fileId: string, blob: Blob): Promise<void> {
  await tx('readwrite', (s) =>
    s.put({ blob, size: blob.size, at: Date.now() }, fileId),
  )
  void evictIfNeeded().catch(() => {})
}

export async function getBlob(fileId: string): Promise<Blob | null> {
  try {
    const rec = await tx('readonly', (s) => s.get(fileId))
    const recObj = rec as { blob?: Blob } | undefined
    return recObj?.blob ?? null
  } catch {
    return null
  }
}

async function evictIfNeeded(): Promise<void> {
  const db = await openDb()
  try {
    const all: Array<{ key: string; size: number; at: number }> = await new Promise(
      (resolve, reject) => {
        const out: Array<{ key: string; size: number; at: number }> = []
        const t = db.transaction(STORE, 'readonly')
        const cursor = t.objectStore(STORE).openCursor()
        cursor.onsuccess = () => {
          const c = cursor.result
          if (!c) {
            resolve(out)
            return
          }
          const v = c.value as { size?: number; at?: number } | undefined
          out.push({
            key: String(c.key),
            size: v?.size ?? 0,
            at: v?.at ?? 0,
          })
          c.continue()
        }
        cursor.onerror = () => reject(cursor.error)
      },
    )
    let total = all.reduce((n, r) => n + r.size, 0)
    if (total <= MAX_BYTES) return
    all.sort((a, b) => a.at - b.at)
    const t = db.transaction(STORE, 'readwrite')
    const store = t.objectStore(STORE)
    for (const r of all) {
      if (total <= MAX_BYTES) break
      store.delete(r.key)
      total -= r.size
    }
    await new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  } finally {
    db.close()
  }
}

// In-memory object URL cache so <img>/<audio> don't re-read IndexedDB.
const urlCache = new Map<string, string>()

export async function blobUrl(fileId: string): Promise<string | null> {
  const hit = urlCache.get(fileId)
  if (hit) return hit
  const blob = await getBlob(fileId)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlCache.set(fileId, url)
  return url
}

// Small key/value sidecar (custom sound packs, etc.).
async function kvTx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(KV, mode)
      const req = fn(t.objectStore(KV))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function kvGet(key: string): Promise<Blob | null> {
  try {
    const v = await kvTx('readonly', (s) => s.get(key))
    return (v as Blob | undefined) ?? null
  } catch {
    return null
  }
}

export async function kvSet(key: string, value: Blob): Promise<void> {
  try {
    await kvTx('readwrite', (s) => s.put(value, key))
  } catch {
    // storage unavailable — custom sounds just won't persist
  }
}

export async function kvDel(key: string): Promise<void> {
  try {
    await kvTx('readwrite', (s) => s.delete(key))
  } catch {
    // ignore
  }
}
