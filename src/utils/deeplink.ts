const BOOKING_START_PREFIX = 'book'

const buildStartToken = (masterId: string) => {
  const normalized = String(masterId ?? '').trim()
  if (!normalized) return ''
  return `${BOOKING_START_PREFIX}_${normalized}`
}

export const buildBookingStartParam = (masterId: string) =>
  buildStartToken(masterId)

export const parseBookingStartParam = (value?: string | null) => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^book[_:-](.+)$/i)
  if (!match) return null
  const masterId = match[1]?.trim()
  return masterId ? masterId : null
}
