import type { ChatDetail, ChatMessage, ChatSummary } from '../types/app'

const CHAT_CACHE_TTL_MS = 5 * 60 * 1000
const CHAT_MESSAGES_MAX = 200
const STORAGE_PREFIX = 'kiven:chat-cache'

type CacheEntry<T> = {
  value: T
  updatedAt: number
}

const chatListCache = new Map<string, CacheEntry<ChatSummary[]>>()
const chatDetailCache = new Map<string, CacheEntry<ChatDetail>>()
const chatMessagesCache = new Map<string, CacheEntry<ChatMessage[]>>()

const buildKey = (apiBase: string, userId: string, chatId?: number) =>
  `${apiBase}::${userId}${chatId ? `::${chatId}` : ''}`

const normalizePart = (value: string) =>
  encodeURIComponent(value.trim().toLowerCase())

const buildStorageKey = (
  scope: 'list' | 'detail' | 'messages',
  apiBase: string,
  userId: string,
  chatId?: number
) =>
  `${STORAGE_PREFIX}:${scope}:${normalizePart(apiBase)}:${normalizePart(userId)}${
    typeof chatId === 'number' ? `:${chatId}` : ''
  }`

const readStorage = <T>(key: string): CacheEntry<T> | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (!parsed || typeof parsed.updatedAt !== 'number') return null
    return parsed
  } catch (error) {
    console.warn('Chat cache read failed:', error)
    return null
  }
}

const writeStorage = <T>(key: string, entry: CacheEntry<T>) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(entry))
  } catch (error) {
    console.warn('Chat cache write failed:', error)
  }
}

const clearStorage = (key: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch (error) {
    console.warn('Chat cache clear failed:', error)
  }
}

const isFresh = (entry?: CacheEntry<unknown> | null) =>
  entry && Date.now() - entry.updatedAt < CHAT_CACHE_TTL_MS

export const getCachedChatList = (apiBase: string, userId: string) => {
  const entry = chatListCache.get(buildKey(apiBase, userId))
  if (isFresh(entry)) return entry!.value
  const storageKey = buildStorageKey('list', apiBase, userId)
  const stored = readStorage<ChatSummary[]>(storageKey)
  if (isFresh(stored)) {
    chatListCache.set(buildKey(apiBase, userId), stored!)
    return stored!.value
  }
  if (stored) {
    clearStorage(storageKey)
  }
  return null
}

export const setCachedChatList = (
  apiBase: string,
  userId: string,
  value: ChatSummary[]
) => {
  const entry = { value, updatedAt: Date.now() }
  chatListCache.set(buildKey(apiBase, userId), entry)
  writeStorage(buildStorageKey('list', apiBase, userId), entry)
}

export const getCachedChatDetail = (
  apiBase: string,
  userId: string,
  chatId: number
) => {
  const entry = chatDetailCache.get(buildKey(apiBase, userId, chatId))
  if (isFresh(entry)) return entry!.value
  const storageKey = buildStorageKey('detail', apiBase, userId, chatId)
  const stored = readStorage<ChatDetail>(storageKey)
  if (isFresh(stored)) {
    chatDetailCache.set(buildKey(apiBase, userId, chatId), stored!)
    return stored!.value
  }
  if (stored) {
    clearStorage(storageKey)
  }
  return null
}

export const setCachedChatDetail = (
  apiBase: string,
  userId: string,
  chatId: number,
  value: ChatDetail
) => {
  const entry = { value, updatedAt: Date.now() }
  chatDetailCache.set(buildKey(apiBase, userId, chatId), entry)
  writeStorage(buildStorageKey('detail', apiBase, userId, chatId), entry)
}

export const getCachedChatMessages = (
  apiBase: string,
  userId: string,
  chatId: number
) => {
  const entry = chatMessagesCache.get(buildKey(apiBase, userId, chatId))
  if (isFresh(entry)) return entry!.value
  const storageKey = buildStorageKey('messages', apiBase, userId, chatId)
  const stored = readStorage<ChatMessage[]>(storageKey)
  if (isFresh(stored)) {
    chatMessagesCache.set(buildKey(apiBase, userId, chatId), stored!)
    return stored!.value
  }
  if (stored) {
    clearStorage(storageKey)
  }
  return null
}

export const setCachedChatMessages = (
  apiBase: string,
  userId: string,
  chatId: number,
  value: ChatMessage[]
) => {
  const trimmed =
    value.length > CHAT_MESSAGES_MAX ? value.slice(-CHAT_MESSAGES_MAX) : value
  const entry = { value: trimmed, updatedAt: Date.now() }
  chatMessagesCache.set(buildKey(apiBase, userId, chatId), entry)
  writeStorage(buildStorageKey('messages', apiBase, userId, chatId), entry)
}

export const resetChatCache = () => {
  chatListCache.clear()
  chatDetailCache.clear()
  chatMessagesCache.clear()
  if (typeof window === 'undefined') return
  try {
    const prefix = `${STORAGE_PREFIX}:`
    const keysToRemove: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key)
    })
  } catch (error) {
    console.warn('Chat cache reset failed:', error)
  }
}
