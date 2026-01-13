import type { ChatDetail, ChatMessage, ChatSummary } from '../types/app'

const CHAT_CACHE_TTL_MS = 5 * 60 * 1000
const CHAT_MESSAGES_MAX = 200

type CacheEntry<T> = {
  value: T
  updatedAt: number
}

const chatListCache = new Map<string, CacheEntry<ChatSummary[]>>()
const chatDetailCache = new Map<string, CacheEntry<ChatDetail>>()
const chatMessagesCache = new Map<string, CacheEntry<ChatMessage[]>>()

const buildKey = (apiBase: string, userId: string, chatId?: number) =>
  `${apiBase}::${userId}${chatId ? `::${chatId}` : ''}`

const isFresh = (entry?: CacheEntry<unknown> | null) =>
  entry && Date.now() - entry.updatedAt < CHAT_CACHE_TTL_MS

export const getCachedChatList = (apiBase: string, userId: string) => {
  const entry = chatListCache.get(buildKey(apiBase, userId))
  return isFresh(entry) ? entry!.value : null
}

export const setCachedChatList = (
  apiBase: string,
  userId: string,
  value: ChatSummary[]
) => {
  chatListCache.set(buildKey(apiBase, userId), {
    value,
    updatedAt: Date.now(),
  })
}

export const getCachedChatDetail = (
  apiBase: string,
  userId: string,
  chatId: number
) => {
  const entry = chatDetailCache.get(buildKey(apiBase, userId, chatId))
  return isFresh(entry) ? entry!.value : null
}

export const setCachedChatDetail = (
  apiBase: string,
  userId: string,
  chatId: number,
  value: ChatDetail
) => {
  chatDetailCache.set(buildKey(apiBase, userId, chatId), {
    value,
    updatedAt: Date.now(),
  })
}

export const getCachedChatMessages = (
  apiBase: string,
  userId: string,
  chatId: number
) => {
  const entry = chatMessagesCache.get(buildKey(apiBase, userId, chatId))
  return isFresh(entry) ? entry!.value : null
}

export const setCachedChatMessages = (
  apiBase: string,
  userId: string,
  chatId: number,
  value: ChatMessage[]
) => {
  const trimmed =
    value.length > CHAT_MESSAGES_MAX ? value.slice(-CHAT_MESSAGES_MAX) : value
  chatMessagesCache.set(buildKey(apiBase, userId, chatId), {
    value: trimmed,
    updatedAt: Date.now(),
  })
}
