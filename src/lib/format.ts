// Shared display formatters (kept here so components only export components).

export const MAX_NAME_CHARS = 64

// Shape any inbound display name (peer hello, invite, request): trim,
// collapse whitespace/newlines to single spaces, cap length. Peers can send
// anything — this is what keeps a 99-char (or 10 KB) name from breaking
// layout. Matches the local renameIdentity cap so both sides agree.
export function shapeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const clean = raw.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return [...clean].slice(0, MAX_NAME_CHARS).join('')
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function shortUid(userId: string): string {
  return userId.length > 12 ? `${userId.slice(0, 8)}...` : userId
}
