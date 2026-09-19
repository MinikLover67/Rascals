// Pairwise E2EE: X25519 ECDH from our Ed25519 identity keys, hashed into a
// secretbox key. Both sides derive the SAME key independently — no key
// exchange messages needed (peers are already authenticated via hello).

import sodium from 'libsodium-wrappers'

export async function sessionKey(
  mySecretKeyB64: string,
  theirUserId: string,
): Promise<Uint8Array> {
  await sodium.ready
  const myCurveSec = sodium.crypto_sign_ed25519_sk_to_curve25519(
    sodium.from_base64(mySecretKeyB64),
  )
  const theirCurvePub = sodium.crypto_sign_ed25519_pk_to_curve25519(
    sodium.from_base64(
      theirUserId,
      sodium.base64_variants.URLSAFE_NO_PADDING,
    ),
  )
  const shared = sodium.crypto_box_beforenm(theirCurvePub, myCurveSec)
  return sodium.crypto_generichash(32, shared, null)
}

export async function seal(
  key: Uint8Array,
  plaintext: string,
): Promise<{ nonce: string; box: string }> {
  await sodium.ready
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const box = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    key,
  )
  return { nonce: sodium.to_base64(nonce), box: sodium.to_base64(box) }
}

/** Returns plaintext, or null when authentication fails. */
export async function openBox(
  key: Uint8Array,
  nonceB64: string,
  boxB64: string,
): Promise<string | null> {
  await sodium.ready
  try {
    const m = sodium.crypto_secretbox_open_easy(
      sodium.from_base64(boxB64),
      sodium.from_base64(nonceB64),
      key,
    )
    return sodium.to_string(m)
  } catch {
    return null
  }
}
