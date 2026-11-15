// Regression: mutual simultaneous friend-add race.
// A verified incoming knock (direction 'in') used to overwrite OUR pending
// 'out' request keyed by the same userId, stranding the hello handshake.
// The store guard + session-level mutual-add handling (session.ts) must keep
// the 'out' record until the handshake completes. See e2e-mutual-add.
import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from './app'

const OUT = {
  userId: 'peerA',
  displayName: 'Peer A',
  direction: 'out' as const,
  ts: 1,
}
const IN = {
  userId: 'peerA',
  displayName: 'Peer A',
  direction: 'in' as const,
  ts: 2,
}

describe('upsertRequest direction guard', () => {
  beforeEach(() => {
    useApp.setState({ requests: [], friends: [] })
  })

  it("keeps OUR 'out' request when their duplicate 'in' knock arrives", () => {
    const s = useApp.getState()
    s.upsertRequest(OUT)
    s.upsertRequest(IN)
    const reqs = useApp.getState().requests
    expect(reqs).toHaveLength(1)
    expect(reqs[0].direction).toBe('out')
  })

  it("still records a plain 'in' request from a stranger", () => {
    const s = useApp.getState()
    s.upsertRequest(IN)
    expect(useApp.getState().requests).toHaveLength(1)
    expect(useApp.getState().requests[0].direction).toBe('in')
  })

  it("a later 'out' upsert replaces an existing 'in' record", () => {
    const s = useApp.getState()
    s.upsertRequest(IN)
    s.upsertRequest(OUT)
    expect(useApp.getState().requests[0].direction).toBe('out')
  })

  it('removeRequest clears the record so the handshake can complete', () => {
    const s = useApp.getState()
    s.upsertRequest(OUT)
    s.upsertRequest(IN) // must be a no-op on the 'out' record
    s.removeRequest('peerA')
    expect(useApp.getState().requests).toHaveLength(0)
  })

  it('never records requests for existing friends', () => {
    useApp.setState({
      friends: [{ userId: 'peerA', displayName: 'Peer A', online: false, addedAt: 1 }],
    })
    useApp.getState().upsertRequest(IN)
    expect(useApp.getState().requests).toHaveLength(0)
  })
})
