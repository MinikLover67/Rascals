// Clipboard paste collection: screenshots (Snipping Tool), Explorer file
// copies, and browser-copied images. Pure function over the ClipboardEvent
// payload so it stays unit-testable without touching the real clipboard.

/** Blank-but-typed files (screenshots) get a usable name. */
export function pastedFileName(file: File): string {
  if (file.name) return file.name
  const ext = file.type.startsWith('image/') ? file.type.slice(6).split(/[+;]/)[0] || 'png' : 'bin'
  return `pasted-${Date.now()}.${ext}`
}

/** Pull every pasted file out of a clipboard event payload. Never throws.
 *
 * One timestamp per call: unnamed files (screenshots) appear in BOTH
 * dt.files and dt.items, and naming each loop separately (two Date.now()
 * calls) defeats the dedupe and stages the image twice. Naming happens
 * once, after deduping, so the same file always matches itself.
 */
export function collectPastedFiles(dt: DataTransfer | null | undefined): File[] {
  const out: File[] = []
  const seen = new Set<string>()
  const push = (f: File): void => {
    const key = `${f.size}:${f.lastModified}:${f.type}:${f.name}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(f)
  }
  try {
    if (!dt) return out
    if (dt.files && dt.files.length > 0) {
      for (const f of Array.from(dt.files)) push(f)
    }
    if (dt.items) {
      for (const item of Array.from(dt.items)) {
        if (item.kind !== 'file') continue
        const f = item.getAsFile()
        if (f) push(f)
      }
    }
  } catch {
    // unreadable payload — paste falls back to text
  }
  const unnamed = out.filter((f) => !f.name).length
  if (unnamed === 0) return out
  const now = Date.now()
  let n = 0
  return out.map((f) => {
    if (f.name) return f
    const ext = f.type.startsWith('image/') ? f.type.slice(6).split(/[+;]/)[0] || 'png' : 'bin'
    const name = unnamed > 1 ? `pasted-${now}-${n}.${ext}` : `pasted-${now}.${ext}`
    n++
    try {
      return new File([f], name, { type: f.type, lastModified: f.lastModified })
    } catch {
      return f
    }
  })
}
