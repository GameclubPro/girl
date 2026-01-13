const BOOKING_START_PREFIX = 'book'
const CHAT_START_PREFIX = 'chat'

const buildStartToken = (prefix: string, value: string | number) => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''
  return `${prefix}_${normalized}`
}

export const buildBookingStartParam = (masterId: string) =>
  buildStartToken(BOOKING_START_PREFIX, masterId)

export const buildChatStartParam = (chatId: number | string) =>
  buildStartToken(CHAT_START_PREFIX, chatId)

const parseStartParam = (value: string | null | undefined, prefix: string) => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = trimmed.match(new RegExp(`^${prefix}[_:-](.+)$`, 'i'))
  if (!match) return null
  const id = match[1]?.trim()
  return id ? id : null
}

export const parseBookingStartParam = (value?: string | null) =>
  parseStartParam(value, BOOKING_START_PREFIX)

export const parseChatStartParam = (value?: string | null) =>
  parseStartParam(value, CHAT_START_PREFIX)
