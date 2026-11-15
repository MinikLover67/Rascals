// Signed hello: proves the sender owns the userId (ed25519 pubkey) they claim.
// Both friend requests and DM-room hellos use this envelope.

import sodium from 'libsodium-wrappers'

function helloMessage(userId: string, name: string, ts: number): string {
  const b64name = sodium.to_base64(
    sodium.from_string(name),
    sodium.base64_variants.URLSAFE_NO_PADDING,
  )
  return `rascals-hello-v1:${userId}:${b64name}:${ts}`
}

export async function signHello(
  secretKeyB64: string,
  userId: string,
  name: string,
  ts: number,
): Promise<string> {
  await sodium.ready
  const sig = sodium.crypto_sign_detached(
    sodium.from_string(helloMessage(userId, name, ts)),
    sodium.from_base64(secretKeyB64),
  )
  return sodium.to_base64(sig)
}

export async function verifyHello(
  userId: string,
  name: string,
  ts: number,
  sigB64: string,
): Promise<boolean> {
  await sodium.ready
  try {
    const pk = sodium.from_base64(
      userId,
      sodium.base64_variants.URLSAFE_NO_PADDING,
    )
    return sodium.crypto_sign_verify_detached(
      sodium.from_base64(sigB64),
      sodium.from_string(helloMessage(userId, name, ts)),
      pk,
    )
  } catch {
    return false
  }
}

/** Sign arbitrary protocol text with the identity key (group envelopes). */
export async function signText(secretKeyB64: string, text: string): Promise<string> {
  await sodium.ready
  const sig = sodium.crypto_sign_detached(
    sodium.from_string(text),
    sodium.from_base64(secretKeyB64),
  )
  return sodium.to_base64(sig)
}

/** Verify text signed by the owner of userId. */
export async function verifyText(
  userId: string,
  text: string,
  sigB64: string,
): Promise<boolean> {
  await sodium.ready
  try {
    const pk = sodium.from_base64(
      userId,
      sodium.base64_variants.URLSAFE_NO_PADDING,
    )
    return sodium.crypto_sign_verify_detached(
      sodium.from_base64(sigB64),
      sodium.from_string(text),
      pk,
    )
  } catch {
    return false
  }
}
