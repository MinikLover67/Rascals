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
