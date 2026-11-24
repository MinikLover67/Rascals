// Unified chat API: routes every action to the DM or group backend by chat key.
// DM keys are bare userIds; group keys are 'g:' + group id.

import type { SendFileOpts } from './chat'
import { getChat, getGroupChat } from './session'

export interface UnifiedChat {
  sendText: (chatKey: string, body: string, replyTo?: string | null) => Promise<void>
  sendEdit: (chatKey: string, id: string, body: string) => Promise<void>
  sendDelete: (chatKey: string, id: string) => Promise<void>
  sendTyping: (chatKey: string, typing: boolean, name?: string) => Promise<void>
  sendReaction: (chatKey: string, msgId: string, emoji: string) => Promise<void>
  sendPin: (chatKey: string, msgId: string, pinned: boolean) => Promise<void>
  sendFile: (
    chatKey: string,
    blob: Blob,
    name: string,
    opts?: SendFileOpts,
  ) => Promise<string | null>
  requestFile: (chatKey: string, fileId: string, fromSeq?: number) => Promise<void>
}

const done = (): Promise<void> => Promise.resolve()

export function isGroupChat(chatKey: string): boolean {
  return chatKey.startsWith('g:')
}

export function chatFor(chatKey: string): UnifiedChat {
  if (!isGroupChat(chatKey)) {
    return {
      sendText: (c, b, r) => getChat()?.sendText(c, b, r ?? null) ?? done(),
      sendEdit: (c, id, b) => getChat()?.sendEdit(c, id, b) ?? done(),
      sendDelete: (c, id) => getChat()?.sendDelete(c, id) ?? done(),
      sendTyping: (c, t) => getChat()?.sendTyping(c, t) ?? done(),
      sendReaction: (c, id, e) => getChat()?.sendReaction(c, id, e) ?? done(),
      sendPin: (c, id, p) => getChat()?.sendPin(c, id, p) ?? done(),
      sendFile: (c, b, n, o) => getChat()?.sendFile(c, b, n, o) ?? Promise.resolve('Chat not ready.'),
      requestFile: (c, f, s) => getChat()?.requestFile(c, f, s) ?? done(),
    }
  }
  return {
    sendText: (c, b, r) => getGroupChat()?.sendText(c, b, r ?? null) ?? done(),
    sendEdit: (c, id, b) => getGroupChat()?.sendEdit(c, id, b) ?? done(),
    sendDelete: (c, id) => getGroupChat()?.sendDelete(c, id) ?? done(),
    sendTyping: (c, t, n) => getGroupChat()?.sendTyping(c, t, n ?? '') ?? done(),
    sendReaction: (c, id, e) => getGroupChat()?.sendReaction(c, id, e) ?? done(),
    sendPin: (c, id, p) => getGroupChat()?.sendPin(c, id, p) ?? done(),
    sendFile: (c, b, n, o) => getGroupChat()?.sendFile(c, b, n, o) ?? Promise.resolve('Chat not ready.'),
    requestFile: (c, f, s) => getGroupChat()?.requestFile(c, f, s) ?? done(),
  }
}
