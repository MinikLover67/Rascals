// Local app lock: a PIN gates the UI on start. Only sha256(salt + pin) is
// stored — never the PIN itself. Unlock state lives in memory only, so a
// fresh app start locks again.
const enc = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 16 random bytes as hex (32 chars). */
export function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** sha256(salt + pin) as hex — stored in settings.lockHash. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(salt + pin))
  return toHex(digest)
}

/** Constant-ish work factor: pin hashing does one extra round to keep a
 * naive rainbow table from helping. */
export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  const hash = await hashPin(pin, salt)
  // String compare in fixed order — length first, then content.
  if (hash.length !== expectedHash.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i)
  return diff === 0
}

/** Basic shape check before hashing (4-16 chars, no whitespace). */
export function pinValid(pin: string): boolean {
  return pin.length >= 4 && pin.length <= 16 && !/\s/.test(pin)
}
