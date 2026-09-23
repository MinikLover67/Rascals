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
 * Field dedupe alone is not enough: one Ctrl+V can carry the same shot
 * twice (two encodings like PNG+DIB, or mismatched lastModified between
 * dt.files and dt.items). Identical names/sizes are matched cheaply first;
 * remaining image multiples are compared by actual pixels below.
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

// Preferred encoding when one paste carries the same shot twice
// (e.g. PNG + DIB from a screenshot tool): keep the smallest sane one.
function imageRank(type: string): number {
  const t = type.toLowerCase()
  if (t === 'image/png') return 0
  if (t === 'image/jpeg' || t === 'image/jpg') return 1
  if (t === 'image/gif') return 2
  if (t === 'image/webp') return 3
  return 4
}

async function imageFingerprint(f: File): Promise<string | null> {  try {
    const bmp = await createImageBitmap(f)
    const w = bmp.width
    const h = bmp.height
    if (!w || !h || w * h > 40_000_000) {
      bmp.close()
      return null // absurdly large — don't pixel-compare, keep it
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      bmp.close()
      return null
    }
    ctx.drawImage(bmp, 0, 0)
    bmp.close()
    const data = ctx.getImageData(0, 0, w, h).data
    // Cheap hash over dimensions + sampled pixels (every 257th byte).
    let hash = `${w}x${h}:`
    let h1 = 0x811c9dc5
    for (let i = 0; i < data.length; i += 257) {
      h1 ^= data[i]
      h1 = Math.imul(h1, 0x01000193) >>> 0
    }
    hash += h1.toString(36)
    return hash
  } catch {
    return null // undecodable — never drop a file we can't read
  }
}

/** Exact pixel equality (slow path, only for suspected duplicates). */
async function pixelsEqual(a: File, b: File): Promise<boolean> {
  try {
    const [ba, bb] = await Promise.all([createImageBitmap(a), createImageBitmap(b)])
    try {
      if (ba.width !== bb.width || ba.height !== bb.height || !ba.width || !ba.height) return false
      if (ba.width * ba.height > 40_000_000) return false
      const canvas = document.createElement('canvas')
      canvas.width = ba.width
      canvas.height = ba.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return false
      ctx.drawImage(ba, 0, 0)
      const da = ctx.getImageData(0, 0, ba.width, ba.height).data
      ctx.clearRect(0, 0, ba.width, ba.height)
      ctx.drawImage(bb, 0, 0)
      const db = ctx.getImageData(0, 0, ba.width, ba.height).data
      if (da.length !== db.length) return false
      for (let i = 0; i < da.length; i++) {
        if (da[i] !== db[i]) return false
      }
      return true
    } finally {
      ba.close()
      bb.close()
    }
  } catch {
    return false // undecodable — never drop on doubt
  }
}

/**
 * Drop pixel-identical image duplicates from one paste (same screenshot in
 * two encodings, or metadata mismatches between files[] and items[]).
 * Genuinely different images always survive. Never throws; on any doubt
 * the input list is returned untouched.
 */
export async function dedupeImageDupes(files: File[]): Promise<File[]> {
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (images.length < 2) return files
  try {
    const prints = await Promise.all(images.map((f) => imageFingerprint(f)))
    const seen = new Map<string, File>()
    const winners = new Set<File>()
    for (let i = 0; i < images.length; i++) {
      const f = images[i]
      const fp = prints[i]
      if (fp === null) {
        winners.add(f) // unreadable — keep, never drop
        continue
      }
      const prev = seen.get(fp)
      if (!prev) {
        seen.set(fp, f)
        winners.add(f)
        continue
      }
      // Same sampled hash: verify pixel-for-pixel before dropping anything.
      if (!(await pixelsEqual(prev, f))) {
        winners.add(f)
        continue
      }
      // Same pixels twice: keep the better encoding.
      if (imageRank(f.type) < imageRank(prev.type)) {
        winners.delete(prev)
        winners.add(f)
        seen.set(fp, f)
      }
    }
    if (winners.size === images.length) return files
    const keep = new Set(winners)
    return files.filter((f) => !f.type.startsWith('image/') || keep.has(f))
  } catch {
    return files
  }
}
