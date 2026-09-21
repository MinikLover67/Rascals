// Web auto-login ("weblink"): the desktop app publishes a snapshot of its
// whole account (identity, friends, groups, servers, history, settings —
// every rascals.* localStorage entry) to its private app-data dir; the local
// static server exposes it at /rascals-account.json (localhost only); a
// browser with no identity of its own applies it on boot and reloads signed
// in with everything. Same-machine only. File blobs stay in IndexedDB and
// re-download from peers on demand — message metadata carries them.

import { importIdentity, type Identity } from './identity'
import { isTauri } from './platform'

export const WEBLINK_URL = '/rascals-account.json'
const APPLIED_FLAG = 'rascals.weblink-applied'
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024

// Small critical keys first so a quota squeeze drops history last, never identity.
const SNAP_ORDER = [
  'rascals.identity.v1',
  'rascals.friends.v1',
  'rascals.groups.v1',
  'rascals.servers.v1',
  'rascals.settings.v1',
  'rascals.requests.v1',
  'rascals.recent.v1',
  'rascals.gkeys.v1',
  'rascals.fkeys.v1',
  'rascals.reactions.v1',
  'rascals.pins.v1',
  'rascals.lastread.v1',
  'rascals.drafts.v1',
  'rascals.files.v1',
  'rascals.messages.v2',
]

function collectSnapshot(): Record<string, string> {
  const data: Record<string, string> = {}
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('rascals.') && k !== APPLIED_FLAG) keys.push(k)
    }
    keys.sort((a, b) => {
      const ia = SNAP_ORDER.indexOf(a)
      const ib = SNAP_ORDER.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
    for (const k of keys) {
      try {
        const v = localStorage.getItem(k)
        if (v !== null) data[k] = v
      } catch {
        // unreadable entry — skip it
      }
    }
  } catch {
    // storage unavailable — snapshot stays empty
  }
  return data
}

/** Desktop only: publish the whole account for the web server. Throws with a message. */
export async function publishWeblink(): Promise<void> {
  if (!isTauri()) return
  const data = collectSnapshot()
  if (!data['rascals.identity.v1']) throw new Error('No identity to share yet.')
  const text = JSON.stringify({ app: 'rascals-snapshot', v: 1, data })
  if (text.length > MAX_SNAPSHOT_BYTES) throw new Error('Account too large to share.')
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('write_weblink', { contents: text })
}

/** Desktop only: remove the published login. Never throws. */
export async function unpublishWeblink(): Promise<void> {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('clear_weblink')
  } catch {
    // already gone or desktop too old — nothing to do
  }
}

/** Validate an exported identity object (same rules as a backup file). */
function shapeExportedIdentity(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (
    typeof o.userId !== 'string' ||
    typeof o.name !== 'string' ||
    typeof o.publicKey !== 'string' ||
    typeof o.secretKey !== 'string' ||
    typeof o.createdAt !== 'number' ||
    !o.userId ||
    !o.secretKey
  )
    return null
  return { userId: o.userId, name: o.name, publicKey: o.publicKey, secretKey: o.secretKey, createdAt: o.createdAt }
}

function shapeSnapshot(raw: unknown): Record<string, string> | null {  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  // Legacy identity-only file: just the login, no history/keys.
  if (o.app === 'rascals-identity') {
    const id = shapeExportedIdentity(o.identity)
    return id ? { 'rascals.identity.v1': JSON.stringify(id) } : null
  }
  if (o.app !== 'rascals-snapshot' || typeof o.data !== 'object' || o.data === null) return null
  const data: Record<string, string> = {}
  for (const [k, v] of Object.entries(o.data as Record<string, unknown>)) {
    if (typeof k === 'string' && k.startsWith('rascals.') && typeof v === 'string') data[k] = v
  }
  return Object.keys(data).length > 0 ? data : null
}

/**
 * Web only: fetch the desktop-published snapshot and write it into this
 * browser's storage. Returns true when applied — the caller must reload so
 * the store boots with the transferred account. Never throws.
 */
export async function applyWeblinkSnapshot(): Promise<boolean> {
  try {
    if (sessionStorage.getItem(APPLIED_FLAG)) return false // already tried: no loop
    const res = await fetch(WEBLINK_URL, { cache: 'no-store' })
    if (!res.ok) return false
    const text = await res.text()
    if (!text || text.length > MAX_SNAPSHOT_BYTES) return false
    const data = shapeSnapshot(JSON.parse(text) as unknown)
    if (!data || !data['rascals.identity.v1']) return false
    // The keypair must actually verify before anything is written.
    const idRaw = data['rascals.identity.v1']
    let idObj: unknown = null
    try {
      idObj = JSON.parse(idRaw) as unknown
    } catch {
      return false
    }
    const shaped = shapeExportedIdentity(idObj)
    if (!shaped) return false
    const valid = await importIdentity(
      JSON.stringify({ app: 'rascals-identity', v: 1, identity: shaped }),
    ).catch(() => null)
    if (!valid) return false
    const ordered = Object.keys(data).sort((a, b) => {
      const ia = SNAP_ORDER.indexOf(a)
      const ib = SNAP_ORDER.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
    for (const k of ordered) {
      try {
        localStorage.setItem(k, data[k])
      } catch {
        // quota squeeze — small keys already won, history loses first
        break
      }
    }
    // Confirm the identity actually landed before claiming success.
    let ok = false
    try {
      ok = localStorage.getItem('rascals.identity.v1') !== null
    } catch {
      ok = false
    }
    try {
      sessionStorage.setItem(APPLIED_FLAG, '1')
    } catch {
      // private mode — reload still safe, boot finds the keys or retries once
    }
    return ok
  } catch {
    return false
  }
}

/** Web only: drop this browser's account so the next boot pulls the desktop
 * snapshot (friends, groups, history and all). Fixes being stuck on a stray
 * web-only identity. Reloads when done. Never throws (reloads regardless). */
export async function replaceWithDesktopAccount(): Promise<void> {
  try {
    const gone: string[] = []
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith('rascals.')) gone.push(k)
    }
    for (const k of gone) {
      try {
        localStorage.removeItem(k)
      } catch {
        // keep going — best effort
      }
    }
    try {
      sessionStorage.clear()
    } catch {
      // private mode — boot guard just retries once
    }
    // Drop cached blobs too (orphaned without their account); best effort.
    try {
      const dbs = await indexedDB.databases()
      await Promise.all(
        dbs
          .map((d) => d.name)
          .filter((n): n is string => typeof n === 'string' && n.toLowerCase().includes('rascals'))
          .map(
            (n) =>
              new Promise<void>((resolve) => {
                try {
                  const req = indexedDB.deleteDatabase(n)
                  req.onsuccess = () => resolve()
                  req.onerror = () => resolve()
                  req.onblocked = () => resolve()
                } catch {
                  resolve()
                }
              }),
          ),
      )
    } catch {
      // indexedDB unavailable — blobs simply stay orphaned
    }
  } finally {
    window.location.reload()
  }
}

/** Web only: peek at the desktop snapshot without writing anything. */
export async function describeSnapshot(): Promise<{ friends: number; sameIdentity: boolean } | null> {
  try {
    const res = await fetch(WEBLINK_URL, { cache: 'no-store' })
    if (!res.ok) return null
    const text = await res.text()
    if (!text || text.length > MAX_SNAPSHOT_BYTES) return null
    const parsed = JSON.parse(text) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const o = parsed as Record<string, unknown>
    if (o.app !== 'rascals-snapshot' || typeof o.data !== 'object' || o.data === null) return null
    const data = o.data as Record<string, unknown>
    const idRaw = data['rascals.identity.v1']
    if (typeof idRaw !== 'string') return null
    let snapUserId = ''
    try {
      snapUserId = (JSON.parse(idRaw) as { userId?: unknown }).userId as string
    } catch {
      return null
    }
    if (typeof snapUserId !== 'string' || !snapUserId) return null
    let friends = 0
    try {
      const fr = data['rascals.friends.v1']
      if (typeof fr === 'string') {
        const arr = JSON.parse(fr) as unknown
        if (Array.isArray(arr)) friends = arr.length
      }
    } catch {
      friends = 0
    }
    let mine = ''
    try {
      mine = readLocalUserId()
    } catch {
      mine = ''
    }
    return { friends, sameIdentity: mine !== '' && mine === snapUserId }
  } catch {
    return null
  }
}

function readLocalUserId(): string {
  try {
    const raw = localStorage.getItem('rascals.identity.v1')
    if (!raw) return ''
    const id = JSON.parse(raw) as { userId?: unknown }
    return typeof id.userId === 'string' ? id.userId : ''
  } catch {
    return ''
  }
}

/** Web only: fetch the desktop-published login identity, if the server has one. */
export async function fetchWeblinkIdentity(): Promise<Identity | null> {
  try {
    const res = await fetch(WEBLINK_URL, { cache: 'no-store' })
    if (!res.ok) return null
    const text = await res.text()
    if (!text || text.length > MAX_SNAPSHOT_BYTES) return null
    const parsed = JSON.parse(text) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const o = parsed as Record<string, unknown>
    // Full snapshot: identity lives inside data.
    if (o.app === 'rascals-snapshot' && typeof o.data === 'object' && o.data !== null) {
      const idRaw = (o.data as Record<string, unknown>)['rascals.identity.v1']
      if (typeof idRaw !== 'string') return null
      return await importIdentity(
        JSON.stringify({ app: 'rascals-identity', v: 1, identity: JSON.parse(idRaw) }),
      ).catch(() => null)
    }
    // Legacy identity-only file.
    if (o.app === 'rascals-identity') {
      return await importIdentity(text).catch(() => null)
    }
    return null
  } catch {
    return null
  }
}
