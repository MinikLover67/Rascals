// Identity: Ed25519 keypair generated locally, persisted on this PC only.
// Phase 0 uses localStorage so `npm run dev` works without Rust/SQLite.
// Phase 1 will migrate the secret key into the Tauri store / OS keychain
// and add avatar + invite-code sharing.

import sodium from 'libsodium-wrappers'

export interface Identity {
  userId: string // base64url(ed25519 public key)
  name: string
  publicKey: string // base64
  secretKey: string // base64 — NEVER leaves this device
  createdAt: number
}

const KEY = 'rascals.identity.v1'

async function load(): Promise<Identity | null> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Identity
    if (!parsed.userId || !parsed.secretKey) return null
    return parsed
  } catch {
    return null
  }
}

/** Return existing identity, or null if onboarding hasn't run yet. */
export async function ensureIdentity(name?: string): Promise<Identity | null> {
  await sodium.ready
  const existing = await load()
  if (existing) return existing
  if (!name) return null
  const kp = sodium.crypto_sign_keypair()
  const id: Identity = {
    userId: sodium.to_base64(kp.publicKey, sodium.base64_variants.URLSAFE_NO_PADDING),
    name,
    publicKey: sodium.to_base64(kp.publicKey),
    secretKey: sodium.to_base64(kp.privateKey),
    createdAt: Date.now(),
  }
  localStorage.setItem(KEY, JSON.stringify(id))
  return id
}

/** Rename the local identity (display name only — keys never change). */
export async function renameIdentity(name: string): Promise<Identity | null> {
  const clean = name.trim().slice(0, 64)
  if (!clean) return null
  const existing = await load()
  if (!existing) return null
  const next = { ...existing, name: clean }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

function shapeIdentity(raw: unknown): Identity | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (
    typeof o.userId !== 'string' ||
    typeof o.name !== 'string' ||
    typeof o.publicKey !== 'string' ||
    typeof o.secretKey !== 'string' ||
    typeof o.createdAt !== 'number'
  )
    return null
  if (!o.userId || !o.secretKey || o.name.length > 64) return null
  return {
    userId: o.userId,
    name: o.name,
    publicKey: o.publicKey,
    secretKey: o.secretKey,
    createdAt: o.createdAt,
  }
}

/** Serialize the identity for backup (contains the secret key — keep private). */
export async function exportIdentity(): Promise<string | null> {
  const existing = await load()
  if (!existing) return null
  return JSON.stringify({ app: 'rascals-identity', v: 1, identity: existing })
}

/** Restore an identity from an export file. Returns null when invalid. */
export async function importIdentity(text: string): Promise<Identity | null> {
  try {
    const raw = JSON.parse(text) as { app?: unknown; identity?: unknown }
    if (raw.app !== 'rascals-identity') return null
    const id = shapeIdentity(raw.identity)
    if (!id) return null
    // Sanity: the keypair must actually work before we trust the file.
    await sodium.ready
    const test = sodium.crypto_sign_detached(
      sodium.from_string('rascals-backup-check'),
      sodium.from_base64(id.secretKey),
    )
    const ok = sodium.crypto_sign_verify_detached(
      test,
      sodium.from_string('rascals-backup-check'),
      sodium.from_base64(id.publicKey),
    )
    if (!ok) return null
    localStorage.setItem(KEY, JSON.stringify(id))
    return id
  } catch {
    return null
  }
}
