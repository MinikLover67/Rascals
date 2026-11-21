// Full-backup export/import: identity + every social/local bucket in one
// JSON file, so a dead PC no longer means lost identity, contacts, servers
// and chats. Media blobs stay local (IndexedDB) — messages carry their
// metadata and re-stream from peers on reconnect.
import { exportIdentity, importIdentity } from './identity'
import { BACKUP_KEYS } from '../store/app'

export interface BackupResult {
  ok: boolean
  /** Human-readable summary of what was restored. */
  summary?: string
  error?: string
}

/** Serialize identity + all local state for backup. Contains the secret
 * key and chat history — the user should keep the file private. */
export async function exportBackup(): Promise<string | null> {
  const identity = await exportIdentity().catch(() => null)
  if (!identity) return null
  const state: Record<string, unknown> = {}
  for (const k of BACKUP_KEYS) {
    const raw = localStorage.getItem(k)
    if (raw === null) continue
    try {
      state[k] = JSON.parse(raw)
    } catch {
      // Corrupt bucket: skip it rather than poisoning the whole backup.
    }
  }
  return JSON.stringify({
    app: 'rascals-backup-full',
    v: 1,
    created: new Date().toISOString(),
    identity: (JSON.parse(identity) as { identity: unknown }).identity,
    state,
  })
}

/** Restore a full backup. Also accepts plain identity-only exports. The
 * caller must reload the app afterwards so every module re-reads storage. */
export async function importBackup(text: string): Promise<BackupResult> {
  let raw: { app?: unknown; identity?: unknown; state?: Record<string, unknown> }
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Could not read that file.' }
  }

  if (raw.app === 'rascals-identity') {
    const id = await importIdentity(text).catch(() => null)
    if (!id) return { ok: false, error: 'That identity backup failed verification.' }
    return { ok: true, summary: 'Identity restored.' }
  }
  if (raw.app !== 'rascals-backup-full' || !raw.identity || typeof raw.state !== 'object') {
    return { ok: false, error: 'That file is not a Rascals backup.' }
  }

  // Identity first — its keypair is verified before anything else lands.
  const id = await importIdentity(
    JSON.stringify({ app: 'rascals-identity', v: 1, identity: raw.identity }),
  ).catch(() => null)
  if (!id) return { ok: false, error: 'Backup identity failed verification.' }

  let restored = 0
  for (const k of BACKUP_KEYS) {
    if (!(k in raw.state)) continue
    try {
      localStorage.setItem(k, JSON.stringify(raw.state[k]))
      restored += 1
    } catch {
      // Leave existing bucket untouched when one entry is malformed.
    }
  }
  return {
    ok: true,
    summary: `Identity + ${restored} data bucket${restored === 1 ? '' : 's'} restored. Restart the app to apply.`,
  }
}
