import { describe, expect, it } from 'vitest'
import { inkOn, inkOnGradient } from './color'

describe('inkOn', () => {
  it('keeps white ink on dark and classic mid-tone accents', () => {
    expect(inkOn('#7c6cff')).toBe('rgb(255, 255, 255)')
    expect(inkOn('#08080a')).toBe('rgb(255, 255, 255)')
    expect(inkOn('#ff5d5d')).toBe('rgb(255, 255, 255)')
  })

  it('flips to dark ink on bright backgrounds (white accent case)', () => {
    expect(inkOn('#ffffff')).toBe('rgb(17, 16, 20)')
    expect(inkOn('#3ddc84')).toBe('rgb(17, 16, 20)')
    expect(inkOn('#ffd76a')).toBe('rgb(17, 16, 20)')
    expect(inkOn('#b8f135')).toBe('rgb(17, 16, 20)')
  })

  it('applies alpha to the chosen ink', () => {
    expect(inkOn('#ffffff', 0.75)).toBe('rgba(17, 16, 20, 0.75)')
    expect(inkOn('#111111', 0.4)).toBe('rgba(255, 255, 255, 0.4)')
  })

  it('falls back to white ink for malformed colors', () => {
    expect(inkOn('not-a-color')).toBe('#ffffff')
  })

  it('flips to dark ink when either gradient end is bright', () => {
    // Bio sits on the accent (bottom) end, name on the primary (top) end —
    // one shared ink must stay readable on both, so a single bright end
    // (the old "both ends bright" rule hid the bio on a white accent).
    expect(inkOnGradient('#111111', '#ffffff')).toBe('rgb(17, 16, 20)')
    expect(inkOnGradient('#ffffff', '#111111')).toBe('rgb(17, 16, 20)')
    expect(inkOnGradient('#ffffff', '#ffffff')).toBe('rgb(17, 16, 20)')
    expect(inkOnGradient('#7c6cff', '#a78bfa')).toBe('rgb(255, 255, 255)')
  })
})
