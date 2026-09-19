// Invite codes: `rascal1:<userId>:<displayName>` (room hash added in Phase 1).
// Friend adds work by pasting / scanning this code — no usernames, no server.

export function encodeInvite(userId: string, displayName: string): string {
  return `rascal1:${userId}:${encodeURIComponent(displayName)}`
}

export function decodeInvite(
  code: string,
): { userId: string; displayName: string } | null {
  const m = /^rascal1:([^:]+):(.+)$/.exec(code.trim())
  if (!m) return null
  try {
    return { userId: m[1], displayName: decodeURIComponent(m[2]) }
  } catch {
    return null
  }
}
