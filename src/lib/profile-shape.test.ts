import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, shapeProfile } from '../store/app'
import { BANNER_PRESETS, NAME_STYLES, bannerPresetCss, nameStyleProps } from './namestyles'

describe('shapeProfile', () => {
  it('returns defaults for garbage', () => {
    expect(shapeProfile(null)).toEqual(DEFAULT_PROFILE)
    expect(shapeProfile('nope')).toEqual(DEFAULT_PROFILE)
    expect(shapeProfile({})).toEqual(DEFAULT_PROFILE)
  })

  it('accepts valid colors and trims the rest', () => {
    const p = shapeProfile({
      themePrimary: '#ff0000',
      themeAccent: 'not-a-color',
      nameStyle: 'neon',
      avatar: { id: 'av-1', mime: 'image/gif' },
      banner: { kind: 'gradient', value: 'linear-gradient(red, blue)' },
    })
    expect(p.themePrimary).toBe('#ff0000')
    expect(p.themeAccent).toBe(DEFAULT_PROFILE.themeAccent)
    expect(p.nameStyle).toBe('neon')
    expect(p.avatar).toEqual({ id: 'av-1', mime: 'image/gif' })
    expect(p.banner).toEqual({ kind: 'gradient', value: 'linear-gradient(red, blue)' })
  })

  it('rejects non-image avatar refs and overlong ids', () => {
    expect(shapeProfile({ avatar: { id: 'x'.repeat(200), mime: 'text/plain' } }).avatar).toBeNull()
    expect(shapeProfile({ avatar: 'nope' }).avatar).toBeNull()
  })

  it('rejects malformed banners', () => {
    expect(shapeProfile({ banner: { kind: 'image' } }).banner).toBeNull()
    expect(shapeProfile({ banner: { kind: 'weird' } }).banner).toBeNull()
  })
})

describe('name styles', () => {
  it('every style resolves to an object, unknown falls back', () => {
    for (const s of NAME_STYLES) {
      expect(typeof nameStyleProps(s.id)).toBe('object')
    }
    expect(nameStyleProps('nope')).toEqual({})
    expect(nameStyleProps(undefined)).toEqual({})
  })

  it('gradient styles clip text', () => {
    const sunset = nameStyleProps('sunset')
    expect(sunset.backgroundClip).toBe('text')
    expect(sunset.color).toBe('transparent')
  })
})

describe('banner presets', () => {
  it('every preset resolves css, unknown returns null', () => {
    for (const p of BANNER_PRESETS) {
      expect(bannerPresetCss(p.id)).toBe(p.css)
    }
    expect(bannerPresetCss('nope')).toBeNull()
  })
})
