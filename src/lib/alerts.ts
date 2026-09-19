// Incoming-message alerts shared by the DM and group pipelines:
// always a sound blip, plus a native notification when the chat is not open.

import { useApp } from '../store/app'
import { notifyUser } from './notify'
import { playSound } from './sound'

function openChatKey(): string | null {
  const s = useApp.getState()
  if (s.selectedFriend) return s.selectedFriend
  if (s.selectedGroup) return `g:${s.selectedGroup}`
  return null
}

function backgrounded(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

export function alertIncomingDM(friendId: string, preview: string): void {
  playSound('message')
  if (openChatKey() !== friendId || backgrounded()) {
    const name =
      useApp.getState().friends.find((f) => f.userId === friendId)?.displayName ?? 'Someone'
    void notifyUser(name, preview.slice(0, 140))
  }
}

export function alertIncomingGroup(chatKey: string, senderId: string, preview: string): void {
  playSound('message')
  if (openChatKey() !== chatKey || backgrounded()) {
    const s = useApp.getState()
    const gid = chatKey.startsWith('g:') ? chatKey.slice(2) : chatKey
    const groupName = s.groups[gid]?.name ?? 'Group'
    const sender =
      s.friends.find((f) => f.userId === senderId)?.displayName ?? 'Someone'
    void notifyUser(`${sender} in ${groupName}`, preview.slice(0, 140))
  }
}

export function alertFriendRequest(displayName: string): void {
  playSound('request')
  void notifyUser('New friend request', `${displayName} wants to connect on Rascals.`)
}

export function alertCallMissed(peerName: string): void {
  playSound('request')
  void notifyUser('Missed voice call', `${peerName} called while you were away.`)
}
