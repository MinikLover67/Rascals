import { describe, expect, it } from 'vitest'
import { collectPastedFiles } from './clipboard'
// NOTE: File/DataTransfer here are the Node 20+ globals (vitest runs in
// node); the same structural shapes exercise the browser code path.

// Minimal clipboard stand-in (structural typing only — no DOM needed).
function dt(files: File[], items: File[]) {
  return {
    files,
    items: items.map((f) => ({ kind: 'file', getAsFile: () => f })),
  } as unknown as DataTransfer
}

const png = (name: string, size: number, lm: number) =>
  new File([new Uint8Array(size)], name, { type: 'image/png', lastModified: lm })

describe('collectPastedFiles', () => {
  it('returns empty for null payloads', () => {
    expect(collectPastedFiles(null)).toEqual([])
    expect(collectPastedFiles(undefined)).toEqual([])
  })

  it('dedupes the same shot across files[] and items[]', () => {
    const a = png('', 100, 111)
    const b = png('', 100, 111)
    const out = collectPastedFiles(dt([a], [b]))
    expect(out).toHaveLength(1)
    expect(out[0].name).toMatch(/^pasted-\d+\.png$/)
  })

  it('drops BMP dupes when a real format is present', () => {
    const good = png('shot.png', 100, 1)
    const dib = new File([new Uint8Array(5000)], '', { type: 'image/dib', lastModified: 2 })
    const out = collectPastedFiles(dt([good], [dib]))
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('image/png')
  })

  it('keeps genuinely different files', () => {
    const out = collectPastedFiles(dt([png('a.png', 100, 1), png('b.png', 200, 2)], []))
    expect(out).toHaveLength(2)
  })

  it('keeps a lone BMP (nothing better to prefer)', () => {
    const dib = new File([new Uint8Array(5000)], '', { type: 'image/bmp', lastModified: 2 })
    const out = collectPastedFiles(dt([], [dib]))
    expect(out).toHaveLength(1)
  })
})
