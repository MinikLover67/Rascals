// Clipboard paste collection: screenshots (Snipping Tool), Explorer file
// copies, and browser-copied images. Pure function over the ClipboardEvent
// payload so it stays unit-testable without touching the real clipboard.

/** Blank-but-typed files (screenshots) get a usable name. */
export function pastedFileName(file: File): string {
  if (file.name) return file.name
  const ext = file.type.startsWith('image/') ? file.type.slice(6).split(/[+;]/)[0] || 'png' : 'bin'
  return `pasted-${Date.now()}.${ext}`
}

function withName(f: File): File {
  if (f.name) return f
  try {
    return new File([f], pastedFileName(f), { type: f.type, lastModified: f.lastModified })
  } catch {
    return f
  }
}

/** Pull every pasted file out of a clipboard event payload. Never throws. */
export function collectPastedFiles(dt: DataTransfer | null | undefined): File[] {
  const out: File[] = []
  try {
    if (!dt) return out
    if (dt.files && dt.files.length > 0) {
      for (const f of Array.from(dt.files)) out.push(withName(f))
    }
    if (dt.items) {
      for (const item of Array.from(dt.items)) {
        if (item.kind !== 'file') continue
        const f = item.getAsFile()
        if (!f) continue
        const named = withName(f)
        const dup = out.some(
          (g) => g.name === named.name && g.size === named.size && g.lastModified === named.lastModified,
        )
        if (!dup) out.push(named)
      }
    }
  } catch {
    // unreadable payload — paste falls back to text
  }
  return out
}
