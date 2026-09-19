import sodium from 'libsodium-wrappers'

export const APP_ID = 'rascals.chat'

/** Personal lobby room: you join yours at startup; others join it to reach you. */
export function lobbyRoomFor(userId: string): string {
  return `rascals-lobby:${userId}`
}

/** Shared room for a group chat — knowledge of the id grants nothing by itself:
 *  every envelope is identity-signed and verified against the member list. */
export function groupRoomFor(groupId: string): string {
  return `rascals-group:${groupId}`
}

/** Shared room for a server descriptor + op log (content signed, see chat-server). */
export function serverRoomFor(serverId: string): string {
  return `rascals-server:${serverId}`
}

/** Pairwise room for two users — identical for both sides. */
export async function dmRoomFor(a: string, b: string): Promise<string> {
  await sodium.ready
  const [x, y] = [a, b].sort()
  const h = sodium.crypto_generichash(
    32,
    sodium.from_string(`rascals-dm:${x}:${y}`),
    null,
  )
  return `rascals-dm:${sodium.to_base64(h, sodium.base64_variants.URLSAFE_NO_PADDING)}`
}
