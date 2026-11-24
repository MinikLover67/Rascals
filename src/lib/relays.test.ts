import { describe, expect, it } from 'vitest'
import { BUILTIN_TURN, roomOpts } from './relays'

const base = { turnUrl: '', turnUser: '', turnPass: '', hideIp: false, defaultTurn: true }

describe('roomOpts — built-in TURN fallback', () => {
  it('user TURN wins over the built-in relay', () => {
    const o = roomOpts({ ...base, turnUrl: 'turn:mine.example:3478', turnUser: 'u', turnPass: 'p' })
    expect(o.turnConfig).toEqual([{ urls: 'turn:mine.example:3478', username: 'u', credential: 'p' }])
    expect(JSON.stringify(o.rtcConfig?.iceServers ?? [])).not.toContain('openrelay')
  })

  it('hideIp + user TURN = relay-only', () => {
    const o = roomOpts({ ...base, turnUrl: 'turn:mine.example:3478', hideIp: true })
    expect(o.rtcConfig).toEqual({ iceTransportPolicy: 'relay' })
  })

  it('hideIp + no user TURN + defaultTurn = built-in relay-only (zero-setup hide IP)', () => {
    const o = roomOpts({ ...base, hideIp: true })
    expect(o.turnConfig).toEqual([BUILTIN_TURN])
    expect(o.rtcConfig).toEqual({ iceTransportPolicy: 'relay' })
  })

  it('hideIp + no TURN at all = no policy (useless without a relay)', () => {
    const o = roomOpts({ ...base, hideIp: true, defaultTurn: false })
    expect(o.turnConfig).toBeUndefined()
    expect(o.rtcConfig).toBeUndefined()
  })

  it('normal path + defaultTurn = STUN plus built-in TURN as fallback candidate', () => {
    const o = roomOpts(base)
    const servers = o.rtcConfig?.iceServers ?? []
    expect(servers.length).toBe(2)
    expect(JSON.stringify(servers[1])).toContain('openrelay.metered.ca')
    expect(JSON.stringify(servers[1])).toContain('openrelayproject')
  })

  it('normal path + defaultTurn off = STUN only (no third-party relay)', () => {
    const o = roomOpts({ ...base, defaultTurn: false })
    const servers = o.rtcConfig?.iceServers ?? []
    expect(servers.length).toBe(1)
    expect(JSON.stringify(servers)).not.toContain('openrelay')
  })

  it('built-in TURN exposes tcp fallback for port-blocking networks', () => {
    const urls = Array.isArray(BUILTIN_TURN.urls) ? BUILTIN_TURN.urls : [BUILTIN_TURN.urls]
    expect(urls.some((u) => u.includes('transport=tcp'))).toBe(true)
  })
})
