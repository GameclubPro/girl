export type ServiceItem = {
  name: string
  price?: number | null
  duration?: number | null
}

export type PortfolioItem = {
  url: string
  title?: string | null
}

const SERVICE_PREFIX = 'svc:'
const PORTFOLIO_PREFIX = 'pf:'

const normalizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const parseJson = (value: string) => {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch (error) {
    return null
  }
}

const parseServiceItem = (value: string): ServiceItem | null => {
  const raw = normalizeText(value)
  if (!raw) return null
  if (raw.startsWith(SERVICE_PREFIX)) {
    const payload = parseJson(raw.slice(SERVICE_PREFIX.length))
    const name = normalizeText(payload?.name)
    if (!name) return null
    return {
      name,
      price: toNumber(payload?.price),
      duration: toNumber(payload?.duration),
    }
  }
  return { name: raw, price: null, duration: null }
}

const parsePortfolioItem = (value: string): PortfolioItem | null => {
  const raw = normalizeText(value)
  if (!raw) return null
  if (raw.startsWith(PORTFOLIO_PREFIX)) {
    const payload = parseJson(raw.slice(PORTFOLIO_PREFIX.length))
    const url = normalizeText(payload?.url)
    if (!url) return null
    const title = normalizeText(payload?.title)
    return {
      url,
      title: title || null,
    }
  }
  return { url: raw, title: null }
}

export const parseServiceItems = (values: string[]) =>
  (Array.isArray(values) ? values : [])
    .map((value) => (typeof value === 'string' ? parseServiceItem(value) : null))
    .filter((item): item is ServiceItem => Boolean(item))

export const parsePortfolioItems = (values: string[]) =>
  (Array.isArray(values) ? values : [])
    .map((value) => (typeof value === 'string' ? parsePortfolioItem(value) : null))
    .filter((item): item is PortfolioItem => Boolean(item))

export const stringifyServiceItem = (item: ServiceItem) => {
  const name = normalizeText(item.name)
  if (!name) return ''
  return `${SERVICE_PREFIX}${JSON.stringify({
    name,
    price: toNumber(item.price),
    duration: toNumber(item.duration),
  })}`
}

export const stringifyPortfolioItem = (item: PortfolioItem) => {
  const url = normalizeText(item.url)
  if (!url) return ''
  const title = normalizeText(item.title)
  return `${PORTFOLIO_PREFIX}${JSON.stringify({
    url,
    title: title || null,
  })}`
}

export const toServiceStrings = (items: ServiceItem[]) =>
  items.map(stringifyServiceItem).filter(Boolean)

export const toPortfolioStrings = (items: PortfolioItem[]) =>
  items.map(stringifyPortfolioItem).filter(Boolean)

export const formatServiceMeta = (item: ServiceItem) => {
  const parts: string[] = []
  if (typeof item.price === 'number') {
    parts.push(`${item.price} ₽`)
  }
  if (typeof item.duration === 'number') {
    parts.push(`${item.duration} мин`)
  }
  return parts.join(' • ')
}

export const isImageUrl = (value: string) => {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return false
  if (normalized.startsWith('data:image/')) return true
  const safeValue = normalized.split('?')[0]?.split('#')[0] ?? normalized
  return /\.(png|jpe?g|webp|gif)$/.test(safeValue)
}
