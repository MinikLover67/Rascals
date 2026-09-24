import { describe, expect, it } from 'vitest'
import { fmtBytes, fmtDuration, shapeDisplayName, shortUid } from './format'

describe('shapeDisplayName', () => {
  it('trims and collapses whitespace/newlines', () => {
    expect(shapeDisplayName('  hi\n\nthere\t\t!  ')).toBe('hi there !')
  })

  it('caps at 64 code points (emoji-safe)', () => {
    const emoji = '👍'.repeat(100)
    const out = shapeDisplayName(emoji)
    expect([...out].length).toBe(64)
    expect(out).toBe('👍'.repeat(64))
  })

  it('rejects empty and non-string input', () => {
    for (const bad of ['', '   ', '\n\t ', null, undefined, 42, {}, []]) {
      expect(shapeDisplayName(bad)).toBe('')
    }
  })
})

describe('fmtBytes', () => {
  it('formats B/KB/MB', () => {
    expect(fmtBytes(0)).toBe('0 B')
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(2048)).toBe('2.0 KB')
    expect(fmtBytes(5 * 1048576)).toBe('5.0 MB')
  })
})

describe('fmtDuration', () => {
  it('formats m:ss', () => {
    expect(fmtDuration(0)).toBe('0:00')
    expect(fmtDuration(65)).toBe('1:05')
    expect(fmtDuration(600)).toBe('10:00')
  })
})

describe('shortUid', () => {
  it('truncates long ids, keeps short ones', () => {
    expect(shortUid('abc')).toBe('abc')
    expect(shortUid('abcdefghijklmnop')).toBe('abcdefgh...')
  })
})
