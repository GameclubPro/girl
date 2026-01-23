import type { ChatMessage } from '../types/app'

const OUTBOX_PREFIX = 'kiven:chat-outbox'
const OUTBOX_LIMIT = 50

export type OutboxItem = {
  clientMessageId: string
  tempId: number
  chatId: number
  createdAt: string
  retryCount: number
  lastAttemptAt: number | null
  payload: {
    type: ChatMessage['type']
    body?: string | null
    meta?: Record<string, unknown> | null
    attachmentPath?: string | null
    attachmentUrl?: string | null
    localAttachmentUrl?: string | null
  }
}

const normalizePart = (value: string) =>
  encodeURIComponent(value.trim().toLowerCase())

const buildKey = (apiBase: string, userId: string) =>
  `${OUTBOX_PREFIX}:${normalizePart(apiBase)}:${normalizePart(userId)}`

const readOutbox = (key: string) => {
  if (typeof window === 'undefined') return [] as OutboxItem[]
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as OutboxItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('Chat outbox read failed:', error)
    return []
  }
}

const writeOutbox = (key: string, items: OutboxItem[]) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(items))
  } catch (error) {
    console.warn('Chat outbox write failed:', error)
  }
}

export const getOutbox = (apiBase: string, userId: string) =>
  readOutbox(buildKey(apiBase, userId))

export const enqueueOutbox = (
  apiBase: string,
  userId: string,
  item: OutboxItem
) => {
  const key = buildKey(apiBase, userId)
  const current = readOutbox(key)
  const exists = current.some(
    (entry) => entry.clientMessageId === item.clientMessageId
  )
  const next = exists ? current : [...current, item]
  const trimmed = next.slice(-OUTBOX_LIMIT)
  writeOutbox(key, trimmed)
}

export const updateOutboxItem = (
  apiBase: string,
  userId: string,
  clientMessageId: string,
  updates: Partial<OutboxItem>
) => {
  const key = buildKey(apiBase, userId)
  const current = readOutbox(key)
  const next = current.map((entry) =>
    entry.clientMessageId === clientMessageId ? { ...entry, ...updates } : entry
  )
  writeOutbox(key, next)
}

export const removeOutboxItem = (
  apiBase: string,
  userId: string,
  clientMessageId: string
) => {
  const key = buildKey(apiBase, userId)
  const current = readOutbox(key)
  const next = current.filter((entry) => entry.clientMessageId !== clientMessageId)
  writeOutbox(key, next)
}

export const pruneOutbox = (
  apiBase: string,
  userId: string,
  predicate: (item: OutboxItem) => boolean
) => {
  const key = buildKey(apiBase, userId)
  const current = readOutbox(key)
  const next = current.filter((entry) => !predicate(entry))
  if (next.length !== current.length) {
    writeOutbox(key, next)
  }
}
