import { describe, expect, it } from 'vitest'
import { dmRoomFor, groupRoomFor, lobbyRoomFor, serverRoomFor } from './rooms'

describe('room ids', () => {
  it('lobby/group/server rooms are stable and namespaced', async () => {
    expect(lobbyRoomFor('u1')).toBe('rascals-lobby:u1')
    expect(groupRoomFor('g1')).toBe('rascals-group:g1')
    expect(serverRoomFor('s1')).toBe('rascals-server:s1')
    expect(groupRoomFor('x')).not.toBe(serverRoomFor('x'))
  })

  it('DM rooms are identical from both sides', async () => {
    const ab = await dmRoomFor('alice', 'bob')
    const ba = await dmRoomFor('bob', 'alice')
    expect(ab).toBe(ba)
    expect(ab.startsWith('rascals-dm:')).toBe(true)
  })

  it('DM rooms differ per pair', async () => {
    expect(await dmRoomFor('alice', 'bob')).not.toBe(await dmRoomFor('alice', 'carol'))
  })
})
