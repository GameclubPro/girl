const BOOKING_START_PREFIX = 'book'
const CHAT_START_PREFIX = 'chat'
const UNSUB_START_PREFIX = 'unsub'
const ACCOUNT_LINK_START_PREFIX = 'link'
const ACCOUNT_LINK_RESULT_START_PREFIX = 'linked'

const buildStartToken = (prefix: string, value: string | number) => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''
  return `${prefix}_${normalized}`
}

export const buildBookingStartParam = (masterId: string) =>
  buildStartToken(BOOKING_START_PREFIX, masterId)

export const buildChatStartParam = (chatId: number | string) =>
  buildStartToken(CHAT_START_PREFIX, chatId)

export const buildUnsubscribeStartParam = (masterId: string) =>
  buildStartToken(UNSUB_START_PREFIX, masterId)

export const buildAccountLinkStartParam = (token: string) =>
  buildStartToken(ACCOUNT_LINK_START_PREFIX, token)

export const buildAccountLinkResultStartParam = (
  status: 'linked' | 'merged',
  nonce: string | number
) => buildStartToken(ACCOUNT_LINK_RESULT_START_PREFIX, `${status}_${nonce}`)

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

export const parseUnsubscribeStartParam = (value?: string | null) =>
  parseStartParam(value, UNSUB_START_PREFIX)

export const parseAccountLinkStartParam = (value?: string | null) =>
  parseStartParam(value, ACCOUNT_LINK_START_PREFIX)

export const parseAccountLinkResultStartParam = (
  value?: string | null
): { status: 'linked' | 'merged'; nonce: string } | null => {
  const parsed = parseStartParam(value, ACCOUNT_LINK_RESULT_START_PREFIX)
  if (!parsed) return null
  const [rawStatus, ...nonceParts] = parsed.split('_')
  const status = rawStatus === 'linked' || rawStatus === 'merged' ? rawStatus : null
  const nonce = nonceParts.join('_').trim()
  if (!status || !nonce) return null
  return { status, nonce }
}
