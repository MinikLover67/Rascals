import { describe, expect, it } from 'vitest'
import { hashPin, pinValid, randomSalt, verifyPin } from './applock'

describe('applock', () => {
  it('pinValid enforces 4-16 chars, no whitespace', () => {
    expect(pinValid('1234')).toBe(true)
    expect(pinValid('long-enough-pin')).toBe(true)
    expect(pinValid('123')).toBe(false)
    expect(pinValid('1'.repeat(17))).toBe(false)
    expect(pinValid('12 4')).toBe(false)
    expect(pinValid('')).toBe(false)
  })

  it('hash is deterministic per (pin, salt) and never the plaintext', async () => {
    const salt = randomSalt()
    const h = await hashPin('9876', salt)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashPin('9876', salt)).toBe(h)
    expect(h).not.toContain('9876')
  })

  it('different salts produce different hashes', async () => {
    const a = await hashPin('9876', randomSalt())
    const b = await hashPin('9876', randomSalt())
    expect(a).not.toBe(b)
  })

  it('verifyPin accepts the right pin and rejects others', async () => {
    const salt = randomSalt()
    const hash = await hashPin('2468', salt)
    expect(await verifyPin('2468', salt, hash)).toBe(true)
    expect(await verifyPin('2469', salt, hash)).toBe(false)
    expect(await verifyPin('24681', salt, hash)).toBe(false)
  })

  it('salts are unique', () => {
    const s = new Set(Array.from({ length: 20 }, () => randomSalt()))
    expect(s.size).toBe(20)
  })
})
