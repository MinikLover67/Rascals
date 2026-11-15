import { describe, expect, it } from 'vitest'
import { decodeInvite, encodeInvite } from './invite'

describe('invite codes', () => {
  it('round-trips userId + displayName', () => {
    const code = encodeInvite('abc123', 'Minik')
    expect(decodeInvite(code)).toEqual({ userId: 'abc123', displayName: 'Minik' })
  })

  it('rejects garbage', () => {
    for (const bad of ['', 'hello', 'rascal1:', 'rascal1:onlyone', 'rascal2:a:b', '  ']) {
      expect(decodeInvite(bad)).toBeNull()
    }
  })

  it('caps peer-claimed names at 64 chars (long-name hardening)', () => {
    const long = 'user' + '1'.repeat(200)
    const parsed = decodeInvite(encodeInvite('u1', long))
    expect(parsed).not.toBeNull()
    expect([...(parsed as { displayName: string }).displayName].length).toBeLessThanOrEqual(64)
  })

  it('rejects whitespace-only names', () => {
    expect(decodeInvite(encodeInvite('u1', '   '))).toBeNull()
  })

  it('keeps unicode names intact within the cap', () => {
    const name = 'Mínik 🎉 test-name_123'
    expect(decodeInvite(encodeInvite('u9', name))?.displayName).toBe(name)
  })
})
