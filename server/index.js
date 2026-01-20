import dotenv from 'dotenv'
import cors from 'cors'
import express from 'express'
import { WebSocketServer } from 'ws'
import { Pool } from 'pg'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

dotenv.config()

const app = express()
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000)
const corsOrigin = process.env.CORS_ORIGIN ?? '*'
const uploadsRoot = path.join(process.cwd(), 'uploads')
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024
const STORY_DEFAULT_TTL_HOURS = 24
const STORY_MIN_TTL_HOURS = 1
const STORY_MAX_TTL_HOURS = 72
const STORY_MAX_ACTIVE = 30
const STORY_CAPTION_LIMIT = 200
const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const REQUEST_INITIAL_BATCH_SIZE = 15
const REQUEST_EXPANDED_BATCH_SIZE = 20
const REQUEST_RESPONSE_WINDOW_MINUTES = 30
const REQUEST_DISPATCH_SCAN_INTERVAL_MS = 60_000
const REQUEST_DISPATCH_CANDIDATE_LIMIT = 200
const OUTCOME_PROMPT_SCAN_INTERVAL_MS = 90_000
const OUTCOME_PROMPT_BATCH_LIMIT = 20
const OUTCOME_PROMPT_ACTION_WINDOW_HOURS = 48
const BOOKING_DURATION_FALLBACK_MINUTES = 60
const CHAT_MESSAGE_DEFAULT_LIMIT = 30
const CHAT_MESSAGE_MAX_LIMIT = 80
const CHAT_STREAM_PATH = '/api/chats/stream'
const TRUST_BASE_SCORE = 60
const TRUST_HALF_LIFE_DAYS = 90
const TRUST_CONFIDENCE_SCALE = 8
const TRUST_LEVEL_THRESHOLDS = {
  new: 0.35,
  medium: 0.7,
}
const TRUST_EVENT_WEIGHTS = {
  visit_on_time: 5,
  visit_late: -5,
  visit_rescheduled: -3,
  visit_no_show: -30,
}
const TRUST_EVENT_TYPE_LIST = Object.keys(TRUST_EVENT_WEIGHTS)
const TRUST_EVENT_TYPES = new Set(TRUST_EVENT_TYPE_LIST)
const BOOKING_OUTCOME_LABELS = {
  on_time: 'Вовремя',
  late: 'Опоздал',
  no_show: 'Не пришёл',
  late_cancel: 'Поздняя отмена',
}
const MAX_CERTIFICATES = 12
const SUPPORT_AGENT_IDS = Array.from(
  new Set(
    (process.env.SUPPORT_AGENT_IDS ?? '5510721194,7226796630')
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  )
)
const SUPPORT_CONTEXT_ID = 1
const SUPPORT_WELCOME_MESSAGE =
  'Здравствуйте! Это поддержка KIVEN. Опишите ситуацию, добавьте номер заявки/записи (если есть) и приложите фото или скриншот.'
const chatMessageTypes = new Set([
  'text',
  'image',
  'system',
  'offer_price',
  'offer_time',
  'offer_location',
])

app.use(cors({ origin: corsOrigin }))
app.use(express.json({ limit: '12mb' }))
app.use('/uploads', express.static(uploadsRoot))

const createPool = () => {
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL })
  }

  const host = process.env.DB_HOST ?? 'localhost'
  const port = Number(process.env.DB_PORT ?? 5432)
  const database = process.env.DB_NAME
  const user = process.env.DB_USER
  const password = process.env.DB_PASSWORD

  if (!database || !user) {
    throw new Error('Database configuration is missing.')
  }

  return new Pool({ host, port, database, user, password })
}

const pool = createPool()
const chatClientsByUserId = new Map()

const normalizeText = (value) => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const normalizeStoryCaption = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return null
  if (normalized.length > STORY_CAPTION_LIMIT) {
    return normalized.slice(0, STORY_CAPTION_LIMIT)
  }
  return normalized
}

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

const parseOptionalInt = (value) => {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null
  }
  const normalized = normalizeText(value)
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isInteger(parsed) ? parsed : null
}

const resolveBookingDurationMinutes = (value) => {
  const parsed = parseOptionalInt(value)
  if (!parsed || parsed <= 0) return BOOKING_DURATION_FALLBACK_MINUTES
  return parsed
}

const clampStoryHours = (value) => {
  const parsed = parseOptionalInt(value)
  if (!parsed) return STORY_DEFAULT_TTL_HOURS
  return Math.min(STORY_MAX_TTL_HOURS, Math.max(STORY_MIN_TTL_HOURS, parsed))
}

const parseOptionalFloat = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const normalized = normalizeText(value)
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const parseDateParam = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const parseRangeDays = (value) => {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return 30
  const map = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '365d': 365,
    week: 7,
    month: 30,
    quarter: 90,
    year: 365,
  }
  if (map[normalized]) return map[normalized]
  const numeric = parseOptionalInt(normalized)
  if (numeric && numeric > 0 && numeric <= 365) return numeric
  return 30
}

const buildOutcomePromptActionExpiresAt = (scheduledAt, durationMinutes) => {
  const scheduledMs = new Date(scheduledAt).getTime()
  if (Number.isNaN(scheduledMs)) return null
  const safeDuration = resolveBookingDurationMinutes(durationMinutes)
  const endMs = scheduledMs + safeDuration * 60 * 1000
  const expiresMs =
    endMs + OUTCOME_PROMPT_ACTION_WINDOW_HOURS * 60 * 60 * 1000
  return new Date(expiresMs).toISOString()
}

const DAY_MS = 24 * 60 * 60 * 1000

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value))

const getTrustLevelLabel = (confidence) => {
  const safeConfidence = Number.isFinite(confidence) ? confidence : 0
  if (safeConfidence < TRUST_LEVEL_THRESHOLDS.new) return 'Новый'
  if (safeConfidence <= TRUST_LEVEL_THRESHOLDS.medium) return 'Средняя уверенность'
  return 'Высокая уверенность'
}

const summarizeTrustEvents = (events) => {
  const now = Date.now()
  const grouped = new Map()
  let totalImpact = 0
  let usedEvents = 0

  events.forEach((event) => {
    if (!TRUST_EVENT_TYPES.has(event.eventType)) return
    const weight = Number(event.weight)
    if (!Number.isFinite(weight)) return
    const createdAt = new Date(event.createdAt)
    const createdMs = createdAt.getTime()
    if (Number.isNaN(createdMs)) return
    const days = Math.max(0, (now - createdMs) / DAY_MS)
    const decay = Math.exp(-Math.LN2 * (days / TRUST_HALF_LIFE_DAYS))
    const impact = weight * decay
    usedEvents += 1
    totalImpact += impact

    const existing = grouped.get(event.eventType) ?? {
      eventType: event.eventType,
      count: 0,
      value: 0,
      lastAt: event.createdAt,
    }
    existing.count += 1
    existing.value += impact
    if (new Date(existing.lastAt).getTime() < createdMs) {
      existing.lastAt = event.createdAt
    }
    grouped.set(event.eventType, existing)
  })

  const entries = Array.from(grouped.values()).map((entry) => ({
    ...entry,
    value: Number(entry.value.toFixed(2)),
  }))
  const positive = entries
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
  const negative = entries
    .filter((entry) => entry.value < 0)
    .sort((a, b) => a.value - b.value)
    .slice(0, 3)

  const score = clampValue(
    Math.round(TRUST_BASE_SCORE + totalImpact),
    0,
    100
  )
  const eventCount = usedEvents
  const confidence = 1 - Math.exp(-eventCount / TRUST_CONFIDENCE_SCALE)

  return {
    score,
    confidence,
    reasons: { positive, negative },
    eventCount,
  }
}

const toDateKey = (value, tzOffsetMinutes) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const shifted = new Date(parsed.getTime() - tzOffsetMinutes * 60000)
  return shifted.toISOString().slice(0, 10)
}

const formatUserDisplayName = (firstName, lastName, username, fallback) => {
  const parts = [normalizeText(firstName), normalizeText(lastName)].filter(Boolean)
  const name = parts.join(' ').trim()
  if (name) return name
  const handle = normalizeText(username)
  if (handle) return `@${handle}`
  return fallback
}

const normalizeServiceName = (value) => normalizeText(value).toLowerCase()

const parseServiceItem = (value) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('svc:')) {
    try {
      const payload = JSON.parse(trimmed.slice(4))
      const name = normalizeText(payload?.name)
      if (!name) return null
      return {
        name,
        price: parseOptionalInt(payload?.price),
        duration: parseOptionalInt(payload?.duration),
      }
    } catch (error) {
      return null
    }
  }
  return { name: trimmed, price: null, duration: null }
}

const parseServiceItems = (values) =>
  (Array.isArray(values) ? values : [])
    .map((value) => parseServiceItem(value))
    .filter(Boolean)

const parseTimeToMinutes = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return null
  const [hoursRaw, minutesRaw] = normalized.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

const dayKeyOrder = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const getDayKeyFromDate = (date) =>
  dayKeyOrder[date.getDay()] ?? 'mon'

const buildDayBounds = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return { start, end }
}

const toRadians = (value) => (value * Math.PI) / 180

const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
  const earthRadiusKm = 6371
  const deltaLat = toRadians(lat2 - lat1)
  const deltaLng = toRadians(lng2 - lng1)
  const lat1Rad = toRadians(lat1)
  const lat2Rad = toRadians(lat2)
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

const roundDistanceKm = (value) => Math.round(value * 10) / 10

const addMinutes = (date, minutes) =>
  new Date(date.getTime() + minutes * 60 * 1000)

const addDays = (date, days) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const normalizeDayKeys = (value) =>
  Array.isArray(value)
    ? value
        .map((item) => normalizeText(item).toLowerCase())
        .filter(Boolean)
    : []

const isScheduleCompatible = (profile, request) => {
  const scheduleDays = normalizeDayKeys(profile?.scheduleDays)
  const scheduleStartMinutes = parseTimeToMinutes(profile?.scheduleStart)
  const scheduleEndMinutes = parseTimeToMinutes(profile?.scheduleEnd)
  const hasTimeWindow =
    scheduleStartMinutes !== null &&
    scheduleEndMinutes !== null &&
    scheduleStartMinutes < scheduleEndMinutes

  const requestDateOption = normalizeText(request?.dateOption)
  const requestDateTime = normalizeText(request?.dateTime)

  if (requestDateOption === 'choose' && requestDateTime) {
    const scheduledDate = new Date(requestDateTime)
    if (Number.isNaN(scheduledDate.getTime())) return false
    if (scheduleDays.length === 0 || !hasTimeWindow) return false
    const dayKey = getDayKeyFromDate(scheduledDate)
    if (!scheduleDays.includes(dayKey)) return false
    const scheduledMinutes =
      scheduledDate.getHours() * 60 + scheduledDate.getMinutes()
    if (
      scheduledMinutes < scheduleStartMinutes ||
      scheduledMinutes > scheduleEndMinutes
    ) {
      return false
    }
    return true
  }

  if (requestDateOption === 'today' || requestDateOption === 'tomorrow') {
    if (scheduleDays.length === 0) return true
    const baseDate = new Date()
    baseDate.setHours(0, 0, 0, 0)
    const day = requestDateOption === 'tomorrow' ? addDays(baseDate, 1) : baseDate
    const dayKey = getDayKeyFromDate(day)
    return scheduleDays.includes(dayKey)
  }

  return true
}

const buildDispatchExpiry = (baseDate = new Date()) =>
  addMinutes(baseDate, REQUEST_RESPONSE_WINDOW_MINUTES)

const sanitizePathSegment = (value) => {
  const normalized = normalizeText(value)
  return normalized.replace(/[^a-zA-Z0-9_-]/g, '') || 'user'
}

const parseImageDataUrl = (dataUrl) => {
  if (typeof dataUrl !== 'string') return null
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null
  const [, mime, base64] = match
  if (!allowedImageTypes.has(mime)) return null
  const buffer = Buffer.from(base64, 'base64')
  return { mime, buffer }
}

const getImageExtension = (mime) => {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'bin'
}

const buildRequestUploadPath = (safeUserId, mime) => {
  const ext = getImageExtension(mime)
  const filename = `request-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
  const relativePath = path.posix.join('requests', safeUserId, filename)
  const absolutePath = path.join(uploadsRoot, relativePath)
  return { relativePath, absolutePath }
}

const buildChatUploadPath = (safeUserId, mime) => {
  const ext = getImageExtension(mime)
  const filename = `chat-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
  const relativePath = path.posix.join('chats', safeUserId, filename)
  const absolutePath = path.join(uploadsRoot, relativePath)
  return { relativePath, absolutePath }
}

const buildCertificateUploadPath = (safeUserId, mime) => {
  const ext = getImageExtension(mime)
  const filename = `certificate-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
  const relativePath = path.posix.join(
    'masters',
    safeUserId,
    'certificates',
    filename
  )
  const absolutePath = path.join(uploadsRoot, relativePath)
  return { relativePath, absolutePath }
}

const buildStoryUploadPath = (safeUserId, mime) => {
  const ext = getImageExtension(mime)
  const filename = `story-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
  const relativePath = path.posix.join('masters', safeUserId, 'stories', filename)
  const absolutePath = path.join(uploadsRoot, relativePath)
  return { relativePath, absolutePath }
}

const normalizeUploadPath = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  const withoutProtocol = normalized.replace(/^https?:\/\/[^/]+/i, '')
  const withoutPrefix = withoutProtocol
    .replace(/^\/+/, '')
    .replace(/^uploads\//, '')
  return path.posix.normalize(withoutPrefix)
}

const resolvePublicUrl = (req, value) => {
  const normalized = normalizeText(value)
  if (!normalized) return null
  if (/^https?:\/\//i.test(normalized)) return normalized
  const safePath = normalizeUploadPath(normalized)
  return buildPublicUrl(req, safePath)
}

const normalizeExternalUrl = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return null
  if (/^https?:\/\//i.test(normalized)) return normalized
  return null
}

const normalizeCertificateUrl = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return null
  if (/^https?:\/\//i.test(normalized)) return normalized
  return normalizeUploadPath(normalized)
}

const normalizeCertificateEntry = (value) => {
  if (!value || typeof value !== 'object') return null
  const id = normalizeText(value.id) || randomUUID()
  const title = normalizeText(value.title)
  const issuer = normalizeText(value.issuer)
  const rawYear = parseOptionalInt(value.year)
  const currentYear = new Date().getFullYear() + 1
  const year =
    rawYear && rawYear >= 1900 && rawYear <= currentYear ? rawYear : null
  const url = normalizeCertificateUrl(value.url)
  const verifyUrl = normalizeExternalUrl(value.verifyUrl)
  if (!title && !url) return null
  return {
    id,
    title: title || null,
    issuer: issuer || null,
    year,
    url,
    verifyUrl,
  }
}

const normalizeCertificates = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => normalizeCertificateEntry(item))
    .filter(Boolean)
    .slice(0, MAX_CERTIFICATES)
}

const resolveCertificateUrls = (req, value) =>
  normalizeCertificates(value).map((certificate) => ({
    ...certificate,
    url: certificate.url ? resolvePublicUrl(req, certificate.url) : null,
  }))

const extractPortfolioUrl = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (normalized.startsWith('pf:')) {
    try {
      const payload = JSON.parse(normalized.slice(3))
      return normalizeText(payload?.url)
    } catch (error) {
      return ''
    }
  }
  return normalized
}

const isSafeRequestUploadPath = (safeUserId, relativePath) => {
  if (!relativePath || relativePath.includes('..')) return false
  const prefix = `requests/${safeUserId}/`
  if (!relativePath.startsWith(prefix)) return false
  const absolutePath = path.join(uploadsRoot, relativePath)
  const safeBase = path.join(uploadsRoot, 'requests', safeUserId)
  return path.normalize(absolutePath).startsWith(safeBase)
}

const isSafeStoryUploadPath = (safeUserId, relativePath) => {
  if (!relativePath || relativePath.includes('..')) return false
  const prefix = `masters/${safeUserId}/stories/`
  if (!relativePath.startsWith(prefix)) return false
  const absolutePath = path.join(uploadsRoot, relativePath)
  const safeBase = path.join(uploadsRoot, 'masters', safeUserId, 'stories')
  return path.normalize(absolutePath).startsWith(safeBase)
}

const isSafeChatUploadPath = (safeUserId, relativePath) => {
  if (!relativePath || relativePath.includes('..')) return false
  const prefix = `chats/${safeUserId}/`
  if (!relativePath.startsWith(prefix)) return false
  const absolutePath = path.join(uploadsRoot, relativePath)
  const safeBase = path.join(uploadsRoot, 'chats', safeUserId)
  return path.normalize(absolutePath).startsWith(safeBase)
}

const buildPublicUrl = (req, relativePath) => {
  const normalized = normalizeText(relativePath)
  if (!normalized) return null
  if (/^https?:\/\//i.test(normalized)) return normalized
  const baseUrl =
    process.env.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get('host')}`
  const safePath = normalized.replace(/^\/+/, '')
  return `${baseUrl}/uploads/${safePath}`
}

const safeJson = (value) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

const telegramBotToken = normalizeText(process.env.BOT_TOKEN)
const telegramWebAppUrl = normalizeText(process.env.WEB_APP_URL)
const telegramApiBase = 'https://api.telegram.org'

const buildStartAppUrl = (baseUrl, startParam) => {
  if (!baseUrl || !startParam) return ''
  const encodedParam = encodeURIComponent(startParam)
  if (/startapp=/i.test(baseUrl)) {
    return baseUrl.replace(/startapp=[^&]*/i, `startapp=${encodedParam}`)
  }
  const joiner = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${joiner}startapp=${encodedParam}`
}

const resolveUserDisplayName = async (userId) => {
  const result = await pool.query(
    `
      SELECT
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.username AS "username",
        mp.display_name AS "displayName"
      FROM users u
      LEFT JOIN master_profiles mp ON mp.user_id = u.user_id
      WHERE u.user_id = $1
    `,
    [userId]
  )
  const row = result.rows[0]
  if (!row) return ''
  if (row.displayName) return row.displayName
  return formatUserDisplayName(row.firstName, row.lastName, row.username, '')
}

const sendTelegramMessage = async ({ recipientId, text, url, webAppUrl }) => {
  if (!telegramBotToken) return
  if (typeof fetch !== 'function') return
  const button = webAppUrl
    ? { text: 'Открыть чат', web_app: { url: webAppUrl } }
    : url
      ? { text: 'Открыть чат', url }
      : null
  const payload = {
    chat_id: recipientId,
    text,
    disable_web_page_preview: true,
    ...(button
      ? {
          reply_markup: {
            inline_keyboard: [[button]],
          },
        }
      : {}),
  }

  try {
    await fetch(`${telegramApiBase}/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    console.error('Telegram notification failed:', error)
  }
}

const sendChatNotification = async ({
  chatId,
  senderId,
  preview,
  title,
  text,
  audience,
}) => {
  if (!telegramBotToken || !telegramWebAppUrl) return
  const normalizedAudience = normalizeText(audience)
  const result = await pool.query(
    `
      SELECT user_id AS "userId", role
      FROM chat_members
      WHERE chat_id = $1
    `,
    [chatId]
  )
  const recipients = result.rows
    .filter((row) => {
      if (!row.userId || row.userId === senderId) return false
      if (!normalizedAudience || normalizedAudience === 'all') return true
      if (normalizedAudience === 'master' || normalizedAudience === 'master_only') {
        return row.role === 'master'
      }
      if (normalizedAudience === 'client' || normalizedAudience === 'client_only') {
        return row.role === 'client'
      }
      return true
    })
    .map((row) => row.userId)
  if (recipients.length === 0) return

  const senderName = senderId ? await resolveUserDisplayName(senderId) : ''
  const fallbackTitle = senderName
    ? `Новое сообщение от ${senderName}`
    : 'Новое сообщение'
  const titleText = title ?? fallbackTitle
  const messageText = text ?? (preview ? `${titleText}\n${preview}` : titleText)
  const link = buildStartAppUrl(telegramWebAppUrl, `chat_${chatId}`)

  await Promise.all(
    recipients.map((recipientId) =>
      sendTelegramMessage({
        recipientId,
        text: messageText,
        webAppUrl: link,
        url: link,
      })
    )
  )
}

const getProfileStatusSummary = (profile) => {
  const safeProfile = profile ?? {}
  const normalizedName = normalizeText(safeProfile.displayName)
  const categories = Array.isArray(safeProfile.categories)
    ? safeProfile.categories.filter(Boolean)
    : []
  const worksAtClient = Boolean(safeProfile.worksAtClient)
  const worksAtMaster = Boolean(safeProfile.worksAtMaster)
  const parsedCityId = parseOptionalInt(safeProfile.cityId)
  const parsedDistrictId = parseOptionalInt(safeProfile.districtId)
  const hasCity = parsedCityId !== null && parsedCityId > 0
  const hasDistrict = parsedDistrictId !== null && parsedDistrictId > 0
  const hasLocation = hasCity && hasDistrict

  const missingFields = []
  if (!normalizedName) missingFields.push('displayName')
  if (categories.length === 0) missingFields.push('categories')
  if (!worksAtClient && !worksAtMaster) missingFields.push('workFormat')
  if (!hasCity) missingFields.push('cityId')
  if (!hasDistrict) missingFields.push('districtId')

  const hasAbout =
    Boolean(normalizeText(safeProfile.about)) ||
    parseOptionalInt(safeProfile.experienceYears) !== null
  const hasPrice =
    parseOptionalInt(safeProfile.priceFrom) !== null ||
    parseOptionalInt(safeProfile.priceTo) !== null
  const hasServices = Array.isArray(safeProfile.services) && safeProfile.services.length > 0
  const hasPortfolio =
    Array.isArray(safeProfile.portfolioUrls) && safeProfile.portfolioUrls.length > 0

  const checklist = [
    Boolean(normalizedName),
    categories.length > 0,
    worksAtClient || worksAtMaster,
    hasLocation,
    hasAbout,
    hasPrice,
    hasServices,
    hasPortfolio,
  ]
  const completed = checklist.filter(Boolean).length
  const completeness = Math.round((completed / checklist.length) * 100)
  const profileStatus =
    missingFields.length === 0
      ? completeness === 100
        ? 'complete'
        : 'ready'
      : 'draft'

  const isFilterReady = categories.length > 0 && (worksAtClient || worksAtMaster) && hasLocation
  const isResponseReady = isFilterReady && Boolean(normalizedName)

  return {
    profileStatus,
    missingFields,
    completeness,
    isFilterReady,
    isResponseReady,
  }
}

const ensureUser = async (userId) => {
  await pool.query(
    `
      INSERT INTO users (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  )
}

const loadClientTrustScore = async (userId) => {
  const result = await pool.query(
    `
      SELECT
        user_id AS "userId",
        score,
        confidence,
        reasons,
        updated_at AS "updatedAt"
      FROM client_trust_scores
      WHERE user_id = $1
    `,
    [userId]
  )
  return result.rows[0] ?? null
}

const refreshClientTrustScore = async (userId) => {
  const eventsResult = await pool.query(
    `
      SELECT
        event_type AS "eventType",
        weight,
        created_at AS "createdAt"
      FROM client_trust_events
      WHERE user_id = $1
        AND event_type = ANY($2::text[])
    `,
    [userId, TRUST_EVENT_TYPE_LIST]
  )

  const summary = summarizeTrustEvents(eventsResult.rows)
  const updatedAt = new Date().toISOString()
  await pool.query(
    `
      INSERT INTO client_trust_scores (user_id, score, confidence, updated_at, reasons)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE
      SET score = EXCLUDED.score,
          confidence = EXCLUDED.confidence,
          updated_at = EXCLUDED.updated_at,
          reasons = EXCLUDED.reasons
    `,
    [
      userId,
      summary.score,
      summary.confidence,
      updatedAt,
      JSON.stringify(summary.reasons ?? { positive: [], negative: [] }),
    ]
  )

  return {
    score: summary.score,
    confidence: summary.confidence,
    reasons: summary.reasons ?? { positive: [], negative: [] },
    updatedAt,
    level: getTrustLevelLabel(summary.confidence),
    eventCount: summary.eventCount,
  }
}

const buildTrustPayload = (row, options = {}) => {
  if (!row) return null
  const scoreKey = options.scoreKey ?? 'score'
  const confidenceKey = options.confidenceKey ?? 'confidence'
  const updatedAtKey = options.updatedAtKey ?? 'updatedAt'
  const reasonsKey = options.reasonsKey ?? 'reasons'
  const includeReasons = Boolean(options.includeReasons)

  const scoreRaw = row[scoreKey]
  if (scoreRaw === null || scoreRaw === undefined) return null
  const score = Number(scoreRaw)
  if (!Number.isFinite(score)) return null
  const confidence = Number(row[confidenceKey] ?? 0)
  const updatedAt = row[updatedAtKey] ?? null
  const payload = {
    score,
    confidence,
    level: getTrustLevelLabel(confidence),
    updatedAt,
  }
  if (includeReasons) {
    payload.reasons = row[reasonsKey] ?? { positive: [], negative: [] }
  }
  return payload
}

const logClientTrustEvent = async ({
  userId,
  eventType,
  meta,
  occurredAt,
  skipRefresh,
}) => {
  const normalizedUserId = normalizeText(userId)
  const normalizedEventType = normalizeText(eventType)
  if (!normalizedUserId || !normalizedEventType) {
    return { inserted: false }
  }

  const weight = TRUST_EVENT_WEIGHTS[normalizedEventType]
  if (typeof weight !== 'number') {
    return { inserted: false }
  }

  const safeMeta =
    meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}
  const ref =
    typeof safeMeta.ref === 'string' ? safeMeta.ref.trim() : ''

  if (ref) {
    const existing = await pool.query(
      `
        SELECT id
        FROM client_trust_events
        WHERE user_id = $1
          AND event_type = $2
          AND meta->>'ref' = $3
        LIMIT 1
      `,
      [normalizedUserId, normalizedEventType, ref]
    )
    if (existing.rows.length > 0) {
      return { inserted: false }
    }
  }

  await ensureUser(normalizedUserId)

  if (occurredAt) {
    await pool.query(
      `
        INSERT INTO client_trust_events (user_id, event_type, weight, meta, created_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        normalizedUserId,
        normalizedEventType,
        weight,
        JSON.stringify(safeMeta),
        occurredAt,
      ]
    )
  } else {
    await pool.query(
      `
        INSERT INTO client_trust_events (user_id, event_type, weight, meta)
        VALUES ($1, $2, $3, $4)
      `,
      [normalizedUserId, normalizedEventType, weight, JSON.stringify(safeMeta)]
    )
  }

  if (!skipRefresh) {
    await refreshClientTrustScore(normalizedUserId)
  }

  return { inserted: true }
}

const ensureMasterProfile = async (userId) => {
  await ensureUser(userId)
  const profileResult = await pool.query(
    `
      SELECT 1
      FROM master_profiles
      WHERE user_id = $1
    `,
    [userId]
  )
  if (profileResult.rows.length > 0) return
  const displayName = (await resolveUserDisplayName(userId)) || 'Мастер'
  await pool.query(
    `
      INSERT INTO master_profiles (user_id, display_name)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId, displayName]
  )
}

const registerChatClient = (userId, ws) => {
  const normalized = normalizeText(userId)
  if (!normalized) return
  const bucket = chatClientsByUserId.get(normalized) ?? new Set()
  bucket.add(ws)
  chatClientsByUserId.set(normalized, bucket)

  ws.on('close', () => {
    const current = chatClientsByUserId.get(normalized)
    if (!current) return
    current.delete(ws)
    if (current.size === 0) {
      chatClientsByUserId.delete(normalized)
    }
  })
}

const broadcastToUser = (userId, payload) => {
  const normalized = normalizeText(userId)
  if (!normalized) return
  const bucket = chatClientsByUserId.get(normalized)
  if (!bucket || bucket.size === 0) return
  const message = JSON.stringify(payload)
  bucket.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message)
    }
  })
}

const notifyChatMembers = async (chatId, payload, options) => {
  const resolved =
    typeof options === 'string'
      ? { excludeUserId: options }
      : options ?? {}
  const excludeUserId = resolved.excludeUserId
  const normalizedAudience = normalizeText(resolved.audience)
  const result = await pool.query(
    `
      SELECT user_id AS "userId", role
      FROM chat_members
      WHERE chat_id = $1
    `,
    [chatId]
  )
  result.rows.forEach((row) => {
    if (excludeUserId && row.userId === excludeUserId) return
    if (normalizedAudience && normalizedAudience !== 'all') {
      if (
        (normalizedAudience === 'master' ||
          normalizedAudience === 'master_only') &&
        row.role !== 'master'
      ) {
        return
      }
      if (
        (normalizedAudience === 'client' ||
          normalizedAudience === 'client_only') &&
        row.role !== 'client'
      ) {
        return
      }
    }
    broadcastToUser(row.userId, payload)
  })
}

const loadChatAccess = async (chatId, userId) => {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.context_type AS "contextType",
        c.context_id AS "contextId",
        c.request_id AS "requestId",
        c.booking_id AS "bookingId",
        c.client_id AS "clientId",
        c.master_id AS "masterId",
        c.status,
        c.last_message_id AS "lastMessageId",
        c.last_message_at AS "lastMessageAt",
        cm.role AS "memberRole",
        cm.last_read_message_id AS "lastReadMessageId",
        cm.unread_count AS "unreadCount"
      FROM chat_members cm
      JOIN chats c ON c.id = cm.chat_id
      WHERE cm.chat_id = $1
        AND cm.user_id = $2
    `,
    [chatId, userId]
  )
  return result.rows[0] ?? null
}

const lockChatPair = async (db, clientId, masterId) => {
  const key = `${clientId}:${masterId}`
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key])
}

const findExistingChat = async ({ clientId, masterId }, options = {}) => {
  const db = options.client ?? pool
  const fallback = await db.query(
    `
      SELECT
        id,
        context_type AS "contextType",
        context_id AS "contextId"
      FROM chats
      WHERE client_id = $1
        AND master_id = $2
        AND context_type <> 'support'
      ORDER BY last_message_at DESC NULLS LAST, updated_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [clientId, masterId]
  )
  return fallback.rows[0] ?? null
}

const upsertChatContext = async (
  { chatId, contextType, contextId, requestId, bookingId, responseId },
  options = {}
) => {
  const db = options.client ?? pool
  await db.query(
    `
      INSERT INTO chat_contexts (
        chat_id,
        context_type,
        context_id,
        request_id,
        booking_id,
        response_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (chat_id, context_type, context_id)
      DO UPDATE SET
        request_id = COALESCE(EXCLUDED.request_id, chat_contexts.request_id),
        booking_id = COALESCE(EXCLUDED.booking_id, chat_contexts.booking_id),
        response_id = COALESCE(EXCLUDED.response_id, chat_contexts.response_id),
        updated_at = NOW()
    `,
    [
      chatId,
      contextType,
      contextId,
      requestId ?? null,
      bookingId ?? null,
      responseId ?? null,
    ]
  )
}

const createChatForRequest = async ({
  requestId,
  responseId,
  clientId,
  masterId,
  serviceName,
  actorId,
}) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await lockChatPair(client, clientId, masterId)

    const existingChat = await findExistingChat({ clientId, masterId }, { client })
    const previousContextType = existingChat?.contextType ?? null
    const previousContextId = existingChat?.contextId ?? null

    let chatId = existingChat?.id ?? null
    let isNew = false
    if (chatId) {
      await client.query(
        `
          UPDATE chats
          SET context_type = 'request',
              context_id = $1,
              request_id = $1,
              response_id = $2,
              booking_id = NULL,
              updated_at = NOW()
          WHERE id = $3
        `,
        [requestId, responseId, chatId]
      )
    } else {
      const insertResult = await client.query(
        `
          INSERT INTO chats (
            context_type,
            context_id,
            request_id,
            response_id,
            client_id,
            master_id,
            status
          )
          VALUES ('request', $1, $1, $2, $3, $4, 'active')
          RETURNING id
        `,
        [requestId, responseId, clientId, masterId]
      )
      chatId = insertResult.rows[0]?.id ?? null
      if (!chatId) {
        throw new Error('chat_insert_failed')
      }
      isNew = true
    }

    await client.query(
      `
        INSERT INTO chat_members (chat_id, user_id, role)
        VALUES ($1, $2, 'client')
        ON CONFLICT (chat_id, user_id) DO NOTHING
      `,
      [chatId, clientId]
    )
    await client.query(
      `
        INSERT INTO chat_members (chat_id, user_id, role)
        VALUES ($1, $2, 'master')
        ON CONFLICT (chat_id, user_id) DO NOTHING
      `,
      [chatId, masterId]
    )

    const contextChanged =
      !isNew &&
      (previousContextType !== 'request' || previousContextId !== requestId)

    if (chatId && contextChanged && previousContextType && previousContextId) {
      await upsertChatContext(
        {
          chatId,
          contextType: previousContextType,
          contextId: previousContextId,
          requestId: previousContextType === 'request' ? previousContextId : null,
          bookingId: previousContextType === 'booking' ? previousContextId : null,
        },
        { client }
      )
    }

    await upsertChatContext(
      {
        chatId,
        contextType: 'request',
        contextId: requestId,
        requestId,
        responseId,
      },
      { client }
    )

    let systemMessageId = null
    let systemMessageCreatedAt = null
    let systemMessage = null
    if (isNew || contextChanged) {
      const body = isNew
        ? serviceName
          ? `Заявка согласована по услуге «${serviceName}». Обсудите детали.`
          : 'Заявка согласована. Обсудите детали.'
        : serviceName
          ? `Заявка обновлена по услуге «${serviceName}».`
          : 'Заявка обновлена.'
      const meta = {
        event: isNew ? 'request_accepted' : 'request_updated',
        serviceName: serviceName ?? null,
        requestId,
      }
      const messageResult = await insertSystemMessage(
        { chatId, body, meta, actorId },
        { client }
      )
      systemMessageId = messageResult.id
      systemMessageCreatedAt = messageResult.createdAt
      systemMessage = {
        id: systemMessageId,
        chatId,
        senderId: null,
        type: 'system',
        body,
        meta,
        attachmentUrl: null,
        createdAt: systemMessageCreatedAt,
      }
    }

    await client.query('COMMIT')
    return {
      chatId,
      isNew,
      systemMessageId,
      systemMessageCreatedAt,
      systemMessage,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const createChatForBooking = async (
  { bookingId, clientId, masterId, serviceName, actorId },
  options = {}
) => {
  const externalClient = options.client
  const client = externalClient ?? (await pool.connect())
  const shouldManageTransaction = !externalClient
  if (shouldManageTransaction) {
    await client.query('BEGIN')
  }
  try {
    await lockChatPair(client, clientId, masterId)

    const existingChat = await findExistingChat({ clientId, masterId }, { client })
    const previousContextType = existingChat?.contextType ?? null
    const previousContextId = existingChat?.contextId ?? null

    let chatId = existingChat?.id ?? null
    let isNew = false
    if (chatId) {
      await client.query(
        `
          UPDATE chats
          SET context_type = 'booking',
              context_id = $1,
              booking_id = $1,
              request_id = NULL,
              response_id = NULL,
              updated_at = NOW()
          WHERE id = $2
        `,
        [bookingId, chatId]
      )
    } else {
      const insertResult = await client.query(
        `
          INSERT INTO chats (
            context_type,
            context_id,
            booking_id,
            client_id,
            master_id,
            status
          )
          VALUES ('booking', $1, $1, $2, $3, 'active')
          RETURNING id
        `,
        [bookingId, clientId, masterId]
      )
      chatId = insertResult.rows[0]?.id ?? null
      if (!chatId) {
        throw new Error('chat_insert_failed')
      }
      isNew = true
    }

    await client.query(
      `
        INSERT INTO chat_members (chat_id, user_id, role)
        VALUES ($1, $2, 'client')
        ON CONFLICT (chat_id, user_id) DO NOTHING
      `,
      [chatId, clientId]
    )
    await client.query(
      `
        INSERT INTO chat_members (chat_id, user_id, role)
        VALUES ($1, $2, 'master')
        ON CONFLICT (chat_id, user_id) DO NOTHING
      `,
      [chatId, masterId]
    )

    const contextChanged =
      !isNew &&
      (previousContextType !== 'booking' || previousContextId !== bookingId)

    if (chatId && contextChanged && previousContextType && previousContextId) {
      await upsertChatContext(
        {
          chatId,
          contextType: previousContextType,
          contextId: previousContextId,
          requestId: previousContextType === 'request' ? previousContextId : null,
          bookingId: previousContextType === 'booking' ? previousContextId : null,
        },
        { client }
      )
    }

    await upsertChatContext(
      {
        chatId,
        contextType: 'booking',
        contextId: bookingId,
        bookingId,
      },
      { client }
    )

    let systemMessageId = null
    let systemMessageCreatedAt = null
    let systemMessage = null

    if (isNew || contextChanged) {
      const body = isNew
        ? serviceName
          ? `Запись подтверждена по услуге «${serviceName}». Можно обсудить детали.`
          : 'Запись подтверждена. Можно обсудить детали.'
        : serviceName
          ? `Запись обновлена по услуге «${serviceName}».`
          : 'Запись обновлена.'
      const meta = {
        event: isNew ? 'booking_confirmed' : 'booking_updated',
        serviceName: serviceName ?? null,
        bookingId,
      }
      const messageResult = await insertSystemMessage(
        { chatId, body, meta, actorId },
        { client }
      )
      systemMessageId = messageResult.id
      systemMessageCreatedAt = messageResult.createdAt
      systemMessage = {
        id: systemMessageId,
        chatId,
        senderId: null,
        type: 'system',
        body,
        meta,
        attachmentUrl: null,
        createdAt: systemMessageCreatedAt,
      }
    }

    if (shouldManageTransaction) {
      await client.query('COMMIT')
    }
    return {
      chatId,
      isNew,
      systemMessageId,
      systemMessageCreatedAt,
      systemMessage,
    }
  } catch (error) {
    if (shouldManageTransaction) {
      await client.query('ROLLBACK')
    }
    throw error
  } finally {
    if (shouldManageTransaction) {
      client.release()
    }
  }
}

const insertSystemMessage = async (
  { chatId, body, meta, actorId, audience },
  options = {}
) => {
  const db = options.client ?? pool
  const shouldManageTransaction = !options.client
  if (shouldManageTransaction) {
    await db.query('BEGIN')
  }
  try {
    const normalizedAudience = normalizeText(audience)
    const audienceKey =
      normalizedAudience === 'master_only'
        ? 'master'
        : normalizedAudience === 'client_only'
          ? 'client'
          : normalizedAudience || 'all'
    const messageResult = await db.query(
      `
        INSERT INTO chat_messages (chat_id, sender_id, type, body, meta)
        VALUES ($1, NULL, 'system', $2, $3)
        RETURNING id, created_at AS "createdAt"
      `,
      [chatId, body ?? null, meta ?? null]
    )
    const messageId = messageResult.rows[0]?.id ?? null
    const createdAt = messageResult.rows[0]?.createdAt ?? null
    if (!messageId) {
      throw new Error('system_message_insert_failed')
    }

    await db.query(
      `
        UPDATE chats
        SET last_message_id = $2,
            last_message_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [chatId, messageId]
    )

    await db.query(
      `
        UPDATE chat_members
        SET unread_count = CASE
              WHEN user_id = $2 THEN 0
              WHEN $4 = 'all' THEN unread_count + 1
              WHEN $4 = 'master' AND role = 'master' THEN unread_count + 1
              WHEN $4 = 'client' AND role = 'client' THEN unread_count + 1
              ELSE unread_count
            END,
            last_read_message_id = CASE
              WHEN user_id = $2 THEN $3
              ELSE last_read_message_id
            END,
            updated_at = NOW()
        WHERE chat_id = $1
      `,
      [chatId, actorId ?? null, messageId, audienceKey]
    )

    if (shouldManageTransaction) {
      await db.query('COMMIT')
    }

    return { id: messageId, createdAt }
  } catch (error) {
    if (shouldManageTransaction) {
      await db.query('ROLLBACK')
    }
    throw error
  }
}

const createSupportChat = async ({ userId }) => {
  if (SUPPORT_AGENT_IDS.length === 0) {
    throw new Error('support_agents_missing')
  }
  const supportMembers = SUPPORT_AGENT_IDS.filter((id) => id !== userId)
  const primarySupportId = supportMembers[0] ?? SUPPORT_AGENT_IDS[0]
  const uniqueSupportMembers = Array.from(new Set(supportMembers))
  const uniqueUserIds = Array.from(
    new Set([userId, primarySupportId, ...uniqueSupportMembers].filter(Boolean))
  )

  await Promise.all(uniqueUserIds.map((id) => ensureUser(id)))

  await pool.query('BEGIN')
  try {
    const insertResult = await pool.query(
      `
        INSERT INTO chats (
          context_type,
          context_id,
          client_id,
          master_id,
          status
        )
        VALUES ('support', $1, $2, $3, 'active')
        ON CONFLICT (context_type, context_id, client_id, master_id)
        DO UPDATE SET updated_at = NOW()
        RETURNING id, (xmax = 0) AS "isNew"
      `,
      [SUPPORT_CONTEXT_ID, userId, primarySupportId]
    )

    const chatId = insertResult.rows[0]?.id ?? null
    const isNew = Boolean(insertResult.rows[0]?.isNew)
    if (!chatId) {
      await pool.query('ROLLBACK')
      return null
    }

    await pool.query(
      `
        INSERT INTO chat_members (chat_id, user_id, role)
        VALUES ($1, $2, 'client')
        ON CONFLICT (chat_id, user_id) DO NOTHING
      `,
      [chatId, userId]
    )

    for (const supportId of uniqueSupportMembers) {
      await pool.query(
        `
          INSERT INTO chat_members (chat_id, user_id, role)
          VALUES ($1, $2, 'master')
          ON CONFLICT (chat_id, user_id) DO NOTHING
        `,
        [chatId, supportId]
      )
    }

    let systemMessageId = null
    let systemMessageCreatedAt = null
    let systemMessage = null

    if (isNew) {
      const body = SUPPORT_WELCOME_MESSAGE
      const meta = { event: 'support_welcome' }
      const messageResult = await pool.query(
        `
          INSERT INTO chat_messages (chat_id, sender_id, type, body, meta)
          VALUES ($1, NULL, 'system', $2, $3)
          RETURNING id, created_at AS "createdAt"
        `,
        [chatId, body, meta]
      )
      const messageId = messageResult.rows[0]?.id ?? null
      systemMessageId = messageId
      systemMessageCreatedAt = messageResult.rows[0]?.createdAt ?? null
      if (messageId) {
        systemMessage = {
          id: messageId,
          chatId,
          senderId: null,
          type: 'system',
          body,
          meta,
          attachmentUrl: null,
          createdAt: systemMessageCreatedAt,
        }
        await pool.query(
          `
            UPDATE chats
            SET last_message_id = $2,
                last_message_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
          `,
          [chatId, messageId]
        )
        await pool.query(
          `
            UPDATE chat_members
            SET unread_count = CASE
                  WHEN user_id = $2 THEN 0
                  ELSE unread_count + 1
                END,
                last_read_message_id = CASE
                  WHEN user_id = $2 THEN $3
                  ELSE last_read_message_id
                END,
                updated_at = NOW()
            WHERE chat_id = $1
          `,
          [chatId, userId, messageId]
        )
      }
    }

    await pool.query('COMMIT')
    return {
      chatId,
      isNew,
      systemMessageId,
      systemMessageCreatedAt,
      systemMessage,
    }
  } catch (error) {
    await pool.query('ROLLBACK')
    throw error
  }
}

const loadMasterProfile = async (userId) => {
  const result = await pool.query(
    `
      SELECT
        user_id AS "userId",
        display_name AS "displayName",
        about,
        city_id AS "cityId",
        district_id AS "districtId",
        experience_years AS "experienceYears",
        price_from AS "priceFrom",
        price_to AS "priceTo",
        avatar_path AS "avatarPath",
        cover_path AS "coverPath",
        categories,
        services,
        portfolio_urls AS "portfolioUrls",
        certificates,
        is_active AS "isActive",
        schedule_days AS "scheduleDays",
        schedule_start AS "scheduleStart",
        schedule_end AS "scheduleEnd",
        works_at_client AS "worksAtClient",
        works_at_master AS "worksAtMaster"
      FROM master_profiles
      WHERE user_id = $1
    `,
    [userId]
  )

  return result.rows[0] ?? null
}

const loadUserLocation = async (userId) => {
  const result = await pool.query(
    `
      SELECT
        user_id AS "userId",
        lat,
        lng,
        accuracy,
        share_to_clients AS "shareToClients",
        share_to_masters AS "shareToMasters",
        updated_at AS "updatedAt"
      FROM user_locations
      WHERE user_id = $1
    `,
    [userId]
  )
  return result.rows[0] ?? null
}

const loadRequestForDispatch = async (requestId) => {
  const result = await pool.query(
    `
      SELECT
        id,
        user_id AS "userId",
        city_id AS "cityId",
        district_id AS "districtId",
        category_id AS "categoryId",
        location_type AS "locationType",
        date_option AS "dateOption",
        date_time AS "dateTime",
        status
      FROM service_requests
      WHERE id = $1
    `,
    [requestId]
  )

  return result.rows[0] ?? null
}

const fetchDispatchCandidates = async (request) => {
  const parsedCityId = parseOptionalInt(request?.cityId)
  const parsedDistrictId = parseOptionalInt(request?.districtId)
  const normalizedCategoryId = normalizeText(request?.categoryId)
  const normalizedLocationType = normalizeText(request?.locationType)
  const requestUserId = normalizeText(request?.userId)

  if (
    !requestUserId ||
    parsedCityId === null ||
    parsedDistrictId === null ||
    !normalizedCategoryId ||
    !['client', 'master', 'any'].includes(normalizedLocationType)
  ) {
    return []
  }

  const result = await pool.query(
    `
      SELECT
        mp.user_id AS "userId",
        mp.display_name AS "displayName",
        mp.schedule_days AS "scheduleDays",
        mp.schedule_start AS "scheduleStart",
        mp.schedule_end AS "scheduleEnd",
        mp.updated_at AS "updatedAt",
        ul.lat AS "locationLat",
        ul.lng AS "locationLng",
        ul.share_to_clients AS "shareToClients",
        COALESCE(mr.reviews_count, 0) AS "reviewsCount",
        COALESCE(mr.reviews_average, 0) AS "reviewsAverage"
      FROM master_profiles mp
      LEFT JOIN user_locations ul ON ul.user_id = mp.user_id
      LEFT JOIN (
        SELECT
          master_id,
          COUNT(*)::int AS reviews_count,
          AVG(rating)::float AS reviews_average
        FROM master_reviews
        GROUP BY master_id
      ) mr ON mr.master_id = mp.user_id
      WHERE mp.is_active = true
        AND mp.user_id <> $1
        AND mp.city_id = $2
        AND mp.district_id = $3
        AND $4 = ANY(mp.categories)
        AND (
          ($5 = 'client' AND mp.works_at_client)
          OR ($5 = 'master' AND mp.works_at_master)
          OR ($5 = 'any' AND (mp.works_at_client OR mp.works_at_master))
        )
        AND mp.display_name IS NOT NULL
        AND mp.display_name <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM request_dispatches rd
          WHERE rd.request_id = $6
            AND rd.master_id = mp.user_id
        )
      ORDER BY mp.updated_at DESC
      LIMIT $7
    `,
    [
      requestUserId,
      parsedCityId,
      parsedDistrictId,
      normalizedCategoryId,
      normalizedLocationType,
      request?.id ?? 0,
      REQUEST_DISPATCH_CANDIDATE_LIMIT,
    ]
  )

  return result.rows
}

const rankDispatchCandidates = (candidates, clientLocation) => {
  const hasClientLocation =
    clientLocation?.shareToMasters &&
    typeof clientLocation.lat === 'number' &&
    typeof clientLocation.lng === 'number'

  return [...candidates]
    .map((candidate) => {
      let distanceKm = null
      if (
        hasClientLocation &&
        candidate.shareToClients &&
        typeof candidate.locationLat === 'number' &&
        typeof candidate.locationLng === 'number'
      ) {
        distanceKm = calculateDistanceKm(
          clientLocation.lat,
          clientLocation.lng,
          candidate.locationLat,
          candidate.locationLng
        )
      }
      return { ...candidate, distanceKm }
    })
    .sort((a, b) => {
      const aDistance =
        typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY
      const bDistance =
        typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY
      if (aDistance !== bDistance) {
        return aDistance - bDistance
      }
      const aAverage = Number(a.reviewsAverage) || 0
      const bAverage = Number(b.reviewsAverage) || 0
      if (aAverage !== bAverage) {
        return bAverage - aAverage
      }
      const aCount = Number(a.reviewsCount) || 0
      const bCount = Number(b.reviewsCount) || 0
      if (aCount !== bCount) {
        return bCount - aCount
      }
      return (
        Number(new Date(b.updatedAt ?? 0)) - Number(new Date(a.updatedAt ?? 0))
      )
    })
}

const dispatchRequestBatch = async (request, batchSize, batch) => {
  if (!request || request.status !== 'open') {
    return { dispatched: 0, expiresAt: null }
  }
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    return { dispatched: 0, expiresAt: null }
  }

  const clientLocation = await loadUserLocation(request.userId)
  const candidates = await fetchDispatchCandidates(request)
  const scheduleFiltered = candidates.filter((candidate) =>
    isScheduleCompatible(candidate, request)
  )
  const ranked = rankDispatchCandidates(scheduleFiltered, clientLocation)
  const selected = ranked.slice(0, batchSize)

  if (selected.length === 0) {
    return { dispatched: 0, expiresAt: null }
  }

  const now = new Date()
  const expiresAt = buildDispatchExpiry(now)
  const values = []
  const placeholders = selected.map((candidate, index) => {
    const offset = index * 5
    values.push(
      request.id,
      candidate.userId,
      Number.isInteger(batch) && batch > 0 ? batch : 1,
      now.toISOString(),
      expiresAt.toISOString()
    )
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${
      offset + 5
    })`
  })

  await pool.query(
    `
      INSERT INTO request_dispatches (
        request_id,
        master_id,
        batch,
        sent_at,
        expires_at
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (request_id, master_id) DO NOTHING
    `,
    values
  )

  return { dispatched: selected.length, expiresAt }
}

const expireStaleDispatches = async () => {
  await pool.query(
    `
      UPDATE request_dispatches
      SET status = 'expired',
          updated_at = NOW()
      WHERE status = 'sent'
        AND expires_at <= NOW()
    `
  )
}

let dispatchCycleRunning = false

const runRequestDispatchCycle = async () => {
  if (dispatchCycleRunning) return
  dispatchCycleRunning = true

  try {
    await expireStaleDispatches()

    const result = await pool.query(
      `
        SELECT
          r.id,
          r.user_id AS "userId",
          r.city_id AS "cityId",
          r.district_id AS "districtId",
          r.category_id AS "categoryId",
          r.location_type AS "locationType",
          r.date_option AS "dateOption",
          r.date_time AS "dateTime",
          r.status,
          COALESCE(MAX(rd.batch), 0)::int AS "lastBatch",
          COUNT(rd.id)::int AS "dispatchCount"
        FROM service_requests r
        LEFT JOIN request_dispatches rd ON rd.request_id = r.id
        WHERE r.status = 'open'
          AND NOT EXISTS (
            SELECT 1
            FROM request_responses rr
            WHERE rr.request_id = r.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM request_dispatches rd2
            WHERE rd2.request_id = r.id
              AND rd2.status = 'sent'
              AND rd2.expires_at > NOW()
          )
        GROUP BY r.id
      `
    )

    for (const request of result.rows) {
      const dispatchCount = Number(request.dispatchCount) || 0
      const batchSize =
        dispatchCount === 0
          ? REQUEST_INITIAL_BATCH_SIZE
          : REQUEST_EXPANDED_BATCH_SIZE
      const batchNumber = dispatchCount === 0 ? 1 : (request.lastBatch ?? 0) + 1

      if (batchSize > 0) {
        await dispatchRequestBatch(request, batchSize, batchNumber)
      }
    }
  } catch (error) {
    console.error('Request dispatch cycle failed:', error)
  } finally {
    dispatchCycleRunning = false
  }
}

let outcomePromptCycleRunning = false

const runBookingOutcomePromptCycle = async () => {
  if (outcomePromptCycleRunning) return
  outcomePromptCycleRunning = true

  try {
    const candidatesResult = await pool.query(
      `
        SELECT id
        FROM service_bookings
        WHERE status = 'confirmed'
          AND outcome IS NULL
          AND outcome_prompted_at IS NULL
          AND scheduled_at + make_interval(mins => COALESCE(service_duration, $1)) <= NOW()
        ORDER BY scheduled_at ASC
        LIMIT $2
      `,
      [BOOKING_DURATION_FALLBACK_MINUTES, OUTCOME_PROMPT_BATCH_LIMIT]
    )

    for (const row of candidatesResult.rows) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const bookingResult = await client.query(
          `
            SELECT
              id,
              client_id AS "clientId",
              master_id AS "masterId",
              service_name AS "serviceName",
              scheduled_at AS "scheduledAt",
              service_duration AS "serviceDuration"
            FROM service_bookings
            WHERE id = $1
              AND status = 'confirmed'
              AND outcome IS NULL
              AND outcome_prompted_at IS NULL
              AND scheduled_at + make_interval(mins => COALESCE(service_duration, $2)) <= NOW()
            FOR UPDATE
          `,
          [row.id, BOOKING_DURATION_FALLBACK_MINUTES]
        )
        const booking = bookingResult.rows[0]
        if (!booking) {
          await client.query('ROLLBACK')
          continue
        }

        const chatPayload = await createChatForBooking(
          {
            bookingId: booking.id,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: booking.masterId,
          },
          { client }
        )

        if (!chatPayload?.chatId) {
          await client.query('ROLLBACK')
          continue
        }

        const actionExpiresAt = buildOutcomePromptActionExpiresAt(
          booking.scheduledAt,
          booking.serviceDuration
        )
        const meta = {
          event: 'booking_outcome_prompt',
          visibility: 'master_only',
          audience: 'master_only',
          bookingId: booking.id,
          serviceName: booking.serviceName ?? null,
          scheduledAt: booking.scheduledAt ?? null,
          serviceDuration: booking.serviceDuration ?? null,
          actionExpiresAt,
        }
        const body = 'Как прошла запись? Отметьте явку/вовремя.'
        const messageResult = await insertSystemMessage(
          {
            chatId: chatPayload.chatId,
            body,
            meta,
            actorId: null,
            audience: 'master',
          },
          { client }
        )

        await client.query(
          `
            UPDATE service_bookings
            SET outcome_prompted_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
          `,
          [booking.id]
        )

        await client.query('COMMIT')

        if (chatPayload.isNew) {
          void notifyChatMembers(chatPayload.chatId, {
            type: 'chat:created',
            chatId: chatPayload.chatId,
            bookingId: booking.id,
          })
          if (chatPayload.systemMessage) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'message:new',
              chatId: chatPayload.chatId,
              message: chatPayload.systemMessage,
            })
          } else if (chatPayload.systemMessageId) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'message:new',
              chatId: chatPayload.chatId,
              messageId: chatPayload.systemMessageId,
            })
          }
        }

        const messagePayload = {
          id: messageResult.id,
          chatId: chatPayload.chatId,
          senderId: null,
          type: 'system',
          body,
          meta,
          attachmentUrl: null,
          createdAt: messageResult.createdAt,
        }
        void notifyChatMembers(chatPayload.chatId, {
          type: 'message:new',
          chatId: chatPayload.chatId,
          message: messagePayload,
        }, { audience: 'master' })
        void sendChatNotification({
          chatId: chatPayload.chatId,
          audience: 'master',
          title: 'Итог визита',
          text: 'Как прошла запись? Отметьте явку/вовремя.',
        })
      } catch (error) {
        await client.query('ROLLBACK')
        console.error('Booking outcome prompt failed:', error)
      } finally {
        client.release()
      }
    }
  } catch (error) {
    console.error('Outcome prompt cycle failed:', error)
  } finally {
    outcomePromptCycleRunning = false
  }
}

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      username TEXT,
      language_code TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cities (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS districts (
      id SERIAL PRIMARY KEY,
      city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      UNIQUE (city_id, name)
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_addresses (
      user_id TEXT PRIMARY KEY,
      city_id INTEGER REFERENCES cities(id),
      district_id INTEGER REFERENCES districts(id),
      address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_locations (
      user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      accuracy INTEGER,
      share_to_clients BOOLEAN NOT NULL DEFAULT true,
      share_to_masters BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE user_locations
    ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
  `)

  await pool.query(`
    ALTER TABLE user_locations
    ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
  `)

  await pool.query(`
    ALTER TABLE user_locations
    ADD COLUMN IF NOT EXISTS accuracy INTEGER;
  `)

  await pool.query(`
    ALTER TABLE user_locations
    ADD COLUMN IF NOT EXISTS share_to_clients BOOLEAN NOT NULL DEFAULT true;
  `)

  await pool.query(`
    ALTER TABLE user_locations
    ADD COLUMN IF NOT EXISTS share_to_masters BOOLEAN NOT NULL DEFAULT true;
  `)

  await pool.query(`
    ALTER TABLE user_locations
    ALTER COLUMN share_to_clients SET DEFAULT true;
  `)

  await pool.query(`
    ALTER TABLE user_locations
    ALTER COLUMN share_to_masters SET DEFAULT true;
  `)

  await pool.query(`
    UPDATE user_locations
    SET share_to_clients = true
    WHERE share_to_clients IS NOT TRUE;
  `)

  await pool.query(`
    UPDATE user_locations
    SET share_to_masters = true
    WHERE share_to_masters IS NOT TRUE;
  `)

  await pool.query(`
    ALTER TABLE user_addresses
    ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES cities(id);
  `)

  await pool.query(`
    ALTER TABLE user_addresses
    ADD COLUMN IF NOT EXISTS district_id INTEGER REFERENCES districts(id);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      about TEXT,
      city_id INTEGER REFERENCES cities(id),
      district_id INTEGER REFERENCES districts(id),
      experience_years INTEGER,
      price_from INTEGER,
      price_to INTEGER,
      avatar_path TEXT,
      cover_path TEXT,
      works_at_client BOOLEAN NOT NULL DEFAULT false,
      works_at_master BOOLEAN NOT NULL DEFAULT false,
      categories TEXT[] NOT NULL DEFAULT '{}',
      services TEXT[] NOT NULL DEFAULT '{}',
      portfolio_urls TEXT[] NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      schedule_days TEXT[] NOT NULL DEFAULT '{}',
      schedule_start TEXT,
      schedule_end TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_showcases (
      user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
      showcase_urls TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_reviews (
      id SERIAL PRIMARY KEY,
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      reviewer_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      service_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_reviews_master_idx
    ON master_reviews (master_id);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_followers (
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      follower_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (master_id, follower_id)
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_followers_master_idx
    ON master_followers (master_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_followers_follower_idx
    ON master_followers (follower_id);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_profile_views (
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      viewer_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      view_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (master_id, viewer_id, view_date)
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_profile_views_master_idx
    ON master_profile_views (master_id, created_at);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_profile_views_date_idx
    ON master_profile_views (master_id, view_date);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_stories (
      id SERIAL PRIMARY KEY,
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      media_path TEXT NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'image',
      caption TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_stories_master_idx
    ON master_stories (master_id, created_at DESC);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_stories_expiry_idx
    ON master_stories (expires_at DESC);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_story_views (
      story_id INTEGER NOT NULL REFERENCES master_stories(id) ON DELETE CASCADE,
      viewer_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (story_id, viewer_id)
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_story_views_viewer_idx
    ON master_story_views (viewer_id);
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS schedule_days TEXT[] NOT NULL DEFAULT '{}';
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS schedule_start TEXT;
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS schedule_end TEXT;
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS avatar_path TEXT;
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS cover_path TEXT;
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS certificates JSONB NOT NULL DEFAULT '[]'::jsonb;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_requests (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      city_id INTEGER REFERENCES cities(id),
      district_id INTEGER REFERENCES districts(id),
      address TEXT,
      category_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      tags TEXT[] NOT NULL DEFAULT '{}',
      location_type TEXT NOT NULL,
      date_option TEXT NOT NULL,
      date_time TIMESTAMPTZ,
      budget TEXT,
      details TEXT,
      photo_urls TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_bookings (
      id SERIAL PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      city_id INTEGER REFERENCES cities(id),
      district_id INTEGER REFERENCES districts(id),
      address TEXT,
      category_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      service_price INTEGER,
      service_duration INTEGER,
      location_type TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      photo_urls TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      proposed_price INTEGER,
      client_comment TEXT,
      cancelled_by TEXT,
      cancelled_at TIMESTAMPTZ,
      outcome TEXT,
      outcome_prompted_at TIMESTAMPTZ,
      attendance_at TIMESTAMPTZ,
      late_minutes INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS outcome TEXT;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS outcome_prompted_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS attendance_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS late_minutes INTEGER;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_trust_events (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      weight INTEGER NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS client_trust_events_user_idx
    ON client_trust_events (user_id, created_at DESC);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS client_trust_events_type_idx
    ON client_trust_events (event_type);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_trust_scores (
      user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      confidence REAL NOT NULL,
      reasons JSONB NOT NULL DEFAULT '{"positive": [], "negative": []}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS client_trust_scores_updated_idx
    ON client_trust_scores (updated_at DESC);
  `)

  await pool.query(`
    ALTER TABLE master_reviews
    ADD COLUMN IF NOT EXISTS booking_id INTEGER REFERENCES service_bookings(id)
    ON DELETE SET NULL;
  `)

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS master_reviews_booking_idx
    ON master_reviews (booking_id)
    WHERE booking_id IS NOT NULL;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_responses (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      price INTEGER,
      comment TEXT,
      proposed_time TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_dispatches (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      batch INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'sent',
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      responded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (request_id, master_id)
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS request_dispatches_request_idx
    ON request_dispatches (request_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS request_dispatches_master_status_idx
    ON request_dispatches (master_id, status);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS request_dispatches_request_status_idx
    ON request_dispatches (request_id, status, expires_at);
  `)

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS request_responses_request_master_idx
    ON request_responses (request_id, master_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS request_responses_request_idx
    ON request_responses (request_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS service_bookings_master_idx
    ON service_bookings (master_id, scheduled_at);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS service_bookings_client_idx
    ON service_bookings (client_id, scheduled_at);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS service_requests_user_idx
    ON service_requests (user_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS service_requests_status_created_idx
    ON service_requests (status, created_at DESC);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      context_type TEXT NOT NULL,
      context_id INTEGER NOT NULL,
      request_id INTEGER REFERENCES service_requests(id) ON DELETE SET NULL,
      response_id INTEGER REFERENCES request_responses(id) ON DELETE SET NULL,
      booking_id INTEGER REFERENCES service_bookings(id) ON DELETE SET NULL,
      client_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      last_message_id INTEGER,
      last_message_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (context_type, context_id, client_id, master_id)
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_members (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'client',
      last_read_message_id INTEGER,
      unread_count INTEGER NOT NULL DEFAULT 0,
      muted_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (chat_id, user_id)
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
      type TEXT NOT NULL DEFAULT 'text',
      body TEXT,
      meta JSONB,
      attachment_path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_contexts (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      context_type TEXT NOT NULL,
      context_id INTEGER NOT NULL,
      request_id INTEGER REFERENCES service_requests(id) ON DELETE SET NULL,
      response_id INTEGER REFERENCES request_responses(id) ON DELETE SET NULL,
      booking_id INTEGER REFERENCES service_bookings(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (chat_id, context_type, context_id)
    );
  `)

  await pool.query(`
    ALTER TABLE chat_contexts
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS chats_client_idx
    ON chats (client_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS chats_master_idx
    ON chats (master_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS chats_context_idx
    ON chats (context_type, context_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_members_user_idx
    ON chat_members (user_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_chat_idx
    ON chat_messages (chat_id, id DESC);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_contexts_chat_idx
    ON chat_contexts (chat_id, created_at DESC);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_contexts_context_idx
    ON chat_contexts (context_type, context_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_contexts_request_idx
    ON chat_contexts (request_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_contexts_booking_idx
    ON chat_contexts (booking_id);
  `)
}

const seedLocations = async () => {
  const cityName = 'Ростов-на-Дону'
  const extraCityNames = [
    'Москва',
    'Санкт-Петербург',
    'Казань',
    'Новосибирск',
    'Екатеринбург',
  ]
  const districtNames = [
    'Пролетарский',
    'Октябрьский',
    'Ленинский',
    'Железнодорожный',
    'Кировский',
    'Первомайский',
    'Ворошиловский',
    'Советский',
  ]

  const cityResult = await pool.query(
    `
      INSERT INTO cities (name)
      VALUES ($1)
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `,
    [cityName]
  )

  const cityId = cityResult.rows[0]?.id

  if (!cityId) {
    throw new Error('Failed to seed city.')
  }

  for (const districtName of districtNames) {
    await pool.query(
      `
        INSERT INTO districts (city_id, name)
        VALUES ($1, $2)
        ON CONFLICT (city_id, name) DO NOTHING
      `,
      [cityId, districtName]
    )
  }

  for (const extraCity of extraCityNames) {
    await pool.query(
      `
        INSERT INTO cities (name)
        VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      `,
      [extraCity]
    )
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/user', async (req, res) => {
  const { userId, firstName, lastName, username, languageCode, photoUrl } =
    req.body ?? {}
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : ''

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const normalizeOptional = (value) => {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    return trimmed.length ? trimmed : null
  }

  const normalizedPhotoUrl = normalizeExternalUrl(photoUrl)

  try {
    await pool.query(
      `
        INSERT INTO users (
          user_id,
          first_name,
          last_name,
          username,
          language_code,
          avatar_url
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id) DO UPDATE
        SET first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            username = EXCLUDED.username,
            language_code = EXCLUDED.language_code,
            avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
            updated_at = NOW()
      `,
      [
        normalizedUserId,
        normalizeOptional(firstName),
        normalizeOptional(lastName),
        normalizeOptional(username),
        normalizeOptional(languageCode),
        normalizedPhotoUrl,
      ]
    )

    res.json({ ok: true })
  } catch (error) {
    console.error('POST /api/user failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/cities', async (_req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT id, name
        FROM cities
        ORDER BY name ASC
      `
    )
    res.json(result.rows)
  } catch (error) {
    console.error('GET /api/cities failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/cities/:cityId/districts', async (req, res) => {
  const cityId = Number(req.params.cityId)

  if (!Number.isInteger(cityId)) {
    res.status(400).json({ error: 'cityId_invalid' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT id, city_id AS "cityId", name
        FROM districts
        WHERE city_id = $1
        ORDER BY name ASC
      `,
      [cityId]
    )
    res.json(result.rows)
  } catch (error) {
    console.error('GET /api/cities/:cityId/districts failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/address', async (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : ''

  if (!userId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          user_id AS "userId",
          city_id AS "cityId",
          district_id AS "districtId",
          address,
          updated_at AS "updatedAt"
        FROM user_addresses
        WHERE user_id = $1
      `,
      [userId]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('GET /api/address failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/address', async (req, res) => {
  const { userId, address, cityId, districtId } = req.body ?? {}
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : ''

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const normalizedAddress = typeof address === 'string' ? address.trim() : ''
  const addressValue = normalizedAddress || null

  const parsedCityId = Number(cityId)
  const parsedDistrictId = Number(districtId)

  if (!Number.isInteger(parsedCityId)) {
    res.status(400).json({ error: 'city_required' })
    return
  }

  if (!Number.isInteger(parsedDistrictId)) {
    res.status(400).json({ error: 'district_required' })
    return
  }

  try {
    const cityCheck = await pool.query(`SELECT id FROM cities WHERE id = $1`, [
      parsedCityId,
    ])
    if (cityCheck.rows.length === 0) {
      res.status(400).json({ error: 'city_not_found' })
      return
    }

    const districtCheck = await pool.query(
      `SELECT id FROM districts WHERE id = $1 AND city_id = $2`,
      [parsedDistrictId, parsedCityId]
    )
    if (districtCheck.rows.length === 0) {
      res.status(400).json({ error: 'district_not_found' })
      return
    }

    await pool.query(
      `
        INSERT INTO user_addresses (user_id, city_id, district_id, address)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE
        SET city_id = EXCLUDED.city_id,
            district_id = EXCLUDED.district_id,
            address = EXCLUDED.address,
            updated_at = NOW()
      `,
      [normalizedUserId, parsedCityId, parsedDistrictId, addressValue]
    )

    res.json({ ok: true })
  } catch (error) {
    console.error('POST /api/address failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/location', async (req, res) => {
  const normalizedUserId = normalizeText(req.query.userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const location = await loadUserLocation(normalizedUserId)
    if (!location) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json(location)
  } catch (error) {
    console.error('GET /api/location failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/location', async (req, res) => {
  const { userId, lat, lng, accuracy } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const parsedLat = parseOptionalFloat(lat)
  const parsedLng = parseOptionalFloat(lng)
  if (parsedLat === null || parsedLng === null) {
    res.status(400).json({ error: 'location_required' })
    return
  }
  if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
    res.status(400).json({ error: 'location_invalid' })
    return
  }

  const parsedAccuracy = parseOptionalInt(accuracy)
  const nextShareToClients = true
  const nextShareToMasters = true

  try {
    await ensureUser(normalizedUserId)

    await pool.query(
      `
        INSERT INTO user_locations (
          user_id,
          lat,
          lng,
          accuracy,
          share_to_clients,
          share_to_masters
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id) DO UPDATE
        SET lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            accuracy = EXCLUDED.accuracy,
            share_to_clients = EXCLUDED.share_to_clients,
            share_to_masters = EXCLUDED.share_to_masters,
            updated_at = NOW()
      `,
      [
        normalizedUserId,
        parsedLat,
        parsedLng,
        parsedAccuracy,
        nextShareToClients,
        nextShareToMasters,
      ]
    )

    const location = await loadUserLocation(normalizedUserId)
    res.json({ ok: true, location })
  } catch (error) {
    console.error('POST /api/location failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.patch('/api/location/share', async (req, res) => {
  const { userId, shareToClients, shareToMasters } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const hasShareToClients = typeof shareToClients === 'boolean'
  const hasShareToMasters = typeof shareToMasters === 'boolean'

  if (!hasShareToClients && !hasShareToMasters) {
    res.status(400).json({ error: 'share_required' })
    return
  }

  try {
    const location = await loadUserLocation(normalizedUserId)
    if (!location) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    const updates = []
    const values = []
    if (hasShareToClients) {
      values.push(shareToClients)
      updates.push(`share_to_clients = $${values.length}`)
    }
    if (hasShareToMasters) {
      values.push(shareToMasters)
      updates.push(`share_to_masters = $${values.length}`)
    }

    values.push(normalizedUserId)

    await pool.query(
      `
        UPDATE user_locations
        SET ${updates.join(', ')},
            updated_at = NOW()
        WHERE user_id = $${values.length}
      `,
      values
    )

    const nextLocation = await loadUserLocation(normalizedUserId)
    res.json({ ok: true, location: nextLocation })
  } catch (error) {
    console.error('PATCH /api/location/share failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.delete('/api/location', async (req, res) => {
  const normalizedUserId = normalizeText(req.query.userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    await pool.query(`DELETE FROM user_locations WHERE user_id = $1`, [
      normalizedUserId,
    ])
    res.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/location failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/clients/:id/trust', async (req, res) => {
  const clientId = normalizeText(req.params.id)
  const normalizedUserId = normalizeText(req.query.userId)

  if (!clientId) {
    res.status(400).json({ error: 'clientId_required' })
    return
  }

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (normalizedUserId !== clientId) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  try {
    let trustRow = await loadClientTrustScore(clientId)
    if (!trustRow) {
      trustRow = await refreshClientTrustScore(clientId)
    }
    const payload =
      buildTrustPayload(trustRow, { includeReasons: true }) ?? {
        score: TRUST_BASE_SCORE,
        confidence: 0,
        level: getTrustLevelLabel(0),
        updatedAt: null,
        reasons: { positive: [], negative: [] },
      }
    res.json(payload)
  } catch (error) {
    console.error('GET /api/clients/:id/trust failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/masters', async (req, res) => {
  const cityId = Number(req.query.cityId)
  const districtId = Number(req.query.districtId)
  const categoryId = normalizeText(req.query.categoryId ?? req.query.category)
  const limitParam = Number(req.query.limit)
  const clientLat = parseOptionalFloat(req.query.clientLat)
  const clientLng = parseOptionalFloat(req.query.clientLng)
  const sortMode = normalizeText(req.query.sort)
  const hasClientLocation = clientLat !== null && clientLng !== null

  const conditions = []
  const values = []
  if (Number.isInteger(cityId)) {
    values.push(cityId)
    conditions.push(`mp.city_id = $${values.length}`)
  }
  if (Number.isInteger(districtId)) {
    values.push(districtId)
    conditions.push(`mp.district_id = $${values.length}`)
  }
  if (categoryId) {
    values.push(categoryId)
    conditions.push(`$${values.length} = ANY(mp.categories)`)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  let limitClause = 'LIMIT 50'
  if (Number.isInteger(limitParam)) {
    if (limitParam > 0) {
      values.push(limitParam)
      limitClause = `LIMIT $${values.length}`
    } else {
      limitClause = ''
    }
  }

  try {
    const result = await pool.query(
      `
        SELECT
          mp.user_id AS "userId",
          mp.display_name AS "displayName",
          mp.about,
          mp.city_id AS "cityId",
          mp.district_id AS "districtId",
          c.name AS "cityName",
          d.name AS "districtName",
          mp.experience_years AS "experienceYears",
          mp.price_from AS "priceFrom",
          mp.price_to AS "priceTo",
          COALESCE(mp.avatar_path, u.avatar_url) AS "avatarPath",
          mp.cover_path AS "coverPath",
          mp.is_active AS "isActive",
          mp.schedule_days AS "scheduleDays",
          mp.works_at_client AS "worksAtClient",
          mp.works_at_master AS "worksAtMaster",
          mp.categories,
          mp.services,
          mp.portfolio_urls AS "portfolioUrls",
          COALESCE(mp.certificates, '[]'::jsonb) AS "certificates",
          COALESCE(ms.showcase_urls, '{}'::text[]) AS "showcaseUrls",
          COALESCE(mr.reviews_count, 0) AS "reviewsCount",
          COALESCE(mr.reviews_average, 0) AS "reviewsAverage",
          COALESCE(mf.followers_count, 0) AS "followersCount",
          mp.updated_at AS "updatedAt",
          ul.lat AS "locationLat",
          ul.lng AS "locationLng",
          ul.share_to_clients AS "shareToClients"
        FROM master_profiles mp
        LEFT JOIN users u ON u.user_id = mp.user_id
        LEFT JOIN cities c ON c.id = mp.city_id
        LEFT JOIN districts d ON d.id = mp.district_id
        LEFT JOIN master_showcases ms ON ms.user_id = mp.user_id
        LEFT JOIN user_locations ul ON ul.user_id = mp.user_id
        LEFT JOIN (
          SELECT
            master_id,
            COUNT(*)::int AS reviews_count,
            AVG(rating)::float AS reviews_average
          FROM master_reviews
          GROUP BY master_id
        ) mr ON mr.master_id = mp.user_id
        LEFT JOIN (
          SELECT
            master_id,
            COUNT(*)::int AS followers_count
          FROM master_followers
          GROUP BY master_id
        ) mf ON mf.master_id = mp.user_id
        ${whereClause}
        ORDER BY mp.updated_at DESC
        ${limitClause}
      `,
      values
    )
    const seenPairs = new Set()
    const rows = (result.rows ?? []).filter((row) => {
      if (row.contextType === 'support') return true
      const key = `${row.clientId}:${row.masterId}`
      if (seenPairs.has(key)) return false
      seenPairs.add(key)
      return true
    })

    const payload = rows.map((row) => {
      const distanceKm =
        hasClientLocation &&
        row.shareToClients &&
        typeof row.locationLat === 'number' &&
        typeof row.locationLng === 'number'
          ? roundDistanceKm(
              calculateDistanceKm(
                clientLat,
                clientLng,
                row.locationLat,
                row.locationLng
              )
            )
          : null
      const average = Number(row.reviewsAverage)
      const certificates = resolveCertificateUrls(req, row.certificates)
      return {
        userId: row.userId,
        displayName: row.displayName,
        about: row.about,
        cityId: row.cityId,
        districtId: row.districtId,
        cityName: row.cityName,
        districtName: row.districtName,
        experienceYears: row.experienceYears,
        priceFrom: row.priceFrom,
        priceTo: row.priceTo,
        isActive: row.isActive,
        scheduleDays: row.scheduleDays,
        worksAtClient: row.worksAtClient,
        worksAtMaster: row.worksAtMaster,
        categories: row.categories,
        services: row.services,
        portfolioUrls: row.portfolioUrls,
        certificates,
        showcaseUrls: row.showcaseUrls,
        updatedAt: row.updatedAt,
        distanceKm,
        reviewsAverage: Number.isFinite(average) ? average : 0,
        reviewsCount: Number.isFinite(Number(row.reviewsCount))
          ? Number(row.reviewsCount)
          : 0,
        followersCount: Number.isFinite(Number(row.followersCount))
          ? Number(row.followersCount)
          : 0,
        avatarUrl: buildPublicUrl(req, row.avatarPath),
        coverUrl: buildPublicUrl(req, row.coverPath),
      }
    })
    if (sortMode === 'distance' && hasClientLocation) {
      payload.sort((a, b) => {
        const aDistance =
          typeof a.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY
        const bDistance =
          typeof b.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY
        if (aDistance !== bDistance) {
          return aDistance - bDistance
        }
        return Number(new Date(b.updatedAt ?? 0)) - Number(new Date(a.updatedAt ?? 0))
      })
    }
    res.json(payload)
  } catch (error) {
    console.error('GET /api/masters failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/masters/:userId', async (req, res) => {
  const normalizedUserId = normalizeText(req.params.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          mp.user_id AS "userId",
          mp.display_name AS "displayName",
          mp.about,
          mp.city_id AS "cityId",
          mp.district_id AS "districtId",
          c.name AS "cityName",
          d.name AS "districtName",
          mp.experience_years AS "experienceYears",
          mp.price_from AS "priceFrom",
          mp.price_to AS "priceTo",
          COALESCE(mp.avatar_path, u.avatar_url) AS "avatarPath",
          (mp.avatar_path IS NOT NULL) AS "hasAvatar",
          mp.cover_path AS "coverPath",
          mp.is_active AS "isActive",
          mp.schedule_days AS "scheduleDays",
          mp.schedule_start AS "scheduleStart",
          mp.schedule_end AS "scheduleEnd",
          mp.works_at_client AS "worksAtClient",
          mp.works_at_master AS "worksAtMaster",
          mp.categories,
          mp.services,
          mp.portfolio_urls AS "portfolioUrls",
          COALESCE(mp.certificates, '[]'::jsonb) AS "certificates",
          COALESCE(ms.showcase_urls, '{}'::text[]) AS "showcaseUrls",
          COALESCE(mr.reviews_count, 0) AS "reviewsCount",
          COALESCE(mr.reviews_average, 0) AS "reviewsAverage",
          COALESCE(mf.followers_count, 0) AS "followersCount",
          mp.updated_at AS "updatedAt"
        FROM master_profiles mp
        LEFT JOIN users u ON u.user_id = mp.user_id
        LEFT JOIN cities c ON c.id = mp.city_id
        LEFT JOIN districts d ON d.id = mp.district_id
        LEFT JOIN master_showcases ms ON ms.user_id = mp.user_id
        LEFT JOIN (
          SELECT
            master_id,
            COUNT(*)::int AS reviews_count,
            AVG(rating)::float AS reviews_average
          FROM master_reviews
          GROUP BY master_id
        ) mr ON mr.master_id = mp.user_id
        LEFT JOIN (
          SELECT
            master_id,
            COUNT(*)::int AS followers_count
          FROM master_followers
          GROUP BY master_id
        ) mf ON mf.master_id = mp.user_id
        WHERE mp.user_id = $1
      `,
      [normalizedUserId]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    const row = result.rows[0]
    const summary = getProfileStatusSummary(row)
    const average = Number(row.reviewsAverage)
    const reviewsAverage = Number.isFinite(average) ? average : 0
    const reviewsCount = Number.isFinite(Number(row.reviewsCount))
      ? Number(row.reviewsCount)
      : 0
    const followersCount = Number.isFinite(Number(row.followersCount))
      ? Number(row.followersCount)
      : 0
    const certificates = resolveCertificateUrls(req, row.certificates)
    res.json({
      ...row,
      certificates,
      reviewsAverage,
      reviewsCount,
      followersCount,
      avatarUrl: buildPublicUrl(req, row.avatarPath),
      coverUrl: buildPublicUrl(req, row.coverPath),
      ...summary,
    })
  } catch (error) {
    console.error('GET /api/masters/:userId failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/masters/:userId/view', async (req, res) => {
  const masterId = normalizeText(req.params.userId)
  const viewerId = normalizeText(req.body?.userId ?? req.body?.viewerId)
  if (!masterId || !viewerId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  if (masterId === viewerId) {
    res.json({ ok: true, skipped: 'self' })
    return
  }
  const tzOffsetMinutes = parseOptionalInt(req.body?.tzOffset) ?? 0
  const viewDate = toDateKey(new Date(), tzOffsetMinutes) || new Date().toISOString().slice(0, 10)

  try {
    await pool.query(
      `
        INSERT INTO master_profile_views (master_id, viewer_id, view_date)
        VALUES ($1, $2, $3::date)
        ON CONFLICT DO NOTHING
      `,
      [masterId, viewerId, viewDate]
    )
    res.json({ ok: true })
  } catch (error) {
    console.error('POST /api/masters/:userId/view failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/masters/:userId/follow', async (req, res) => {
  const masterId = normalizeText(req.params.userId)
  const followerId = normalizeText(req.body?.userId ?? req.body?.followerId)
  if (!masterId || !followerId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  if (masterId === followerId) {
    res.status(400).json({ error: 'self_follow_forbidden' })
    return
  }

  try {
    await pool.query(
      `
        INSERT INTO master_followers (master_id, follower_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [masterId, followerId]
    )
    res.json({ ok: true })
  } catch (error) {
    console.error('POST /api/masters/:userId/follow failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/masters/:userId/unfollow', async (req, res) => {
  const masterId = normalizeText(req.params.userId)
  const followerId = normalizeText(req.body?.userId ?? req.body?.followerId)
  if (!masterId || !followerId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  if (masterId === followerId) {
    res.status(400).json({ error: 'self_unfollow_forbidden' })
    return
  }

  try {
    await pool.query(
      `
        DELETE FROM master_followers
        WHERE master_id = $1 AND follower_id = $2
      `,
      [masterId, followerId]
    )
    res.json({ ok: true })
  } catch (error) {
    console.error('POST /api/masters/:userId/unfollow failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/masters/:userId/bookings', async (req, res) => {
  const normalizedUserId = normalizeText(req.params.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const fromParam = normalizeText(req.query.from)
  const toParam = normalizeText(req.query.to)
  const fromDate = fromParam ? new Date(fromParam) : new Date()
  const toDate = toParam
    ? new Date(toParam)
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    res.status(400).json({ error: 'date_range_invalid' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          scheduled_at AS "scheduledAt",
          service_duration AS "serviceDuration",
          status
        FROM service_bookings
        WHERE master_id = $1
          AND status NOT IN ('declined', 'cancelled')
          AND scheduled_at >= $2
          AND scheduled_at <= $3
        ORDER BY scheduled_at ASC
      `,
      [normalizedUserId, fromDate.toISOString(), toDate.toISOString()]
    )
    res.json(result.rows)
  } catch (error) {
    console.error('GET /api/masters/:userId/bookings failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/masters/:userId/reviews', async (req, res) => {
  const normalizedUserId = normalizeText(req.params.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const limitParam = Number(req.query.limit)
  const limit = Number.isInteger(limitParam)
    ? Math.min(Math.max(limitParam, 1), 50)
    : 8

  try {
    const summaryResult = await pool.query(
      `
        SELECT
          COUNT(*)::int AS count,
          COALESCE(AVG(rating), 0) AS average,
          SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END)::int AS rating5,
          SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END)::int AS rating4,
          SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END)::int AS rating3,
          SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END)::int AS rating2,
          SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END)::int AS rating1
        FROM master_reviews
        WHERE master_id = $1
      `,
      [normalizedUserId]
    )

    const reviewsResult = await pool.query(
      `
        SELECT
          mr.id,
          mr.rating,
          mr.comment,
          mr.service_name AS "serviceName",
          mr.created_at AS "createdAt",
          u.first_name AS "reviewerFirstName",
          u.last_name AS "reviewerLastName",
          u.username AS "reviewerUsername"
        FROM master_reviews mr
        LEFT JOIN users u ON u.user_id = mr.reviewer_id
        WHERE mr.master_id = $1
        ORDER BY mr.created_at DESC
        LIMIT $2
      `,
      [normalizedUserId, limit]
    )

    const summaryRow = summaryResult.rows[0] ?? {}
    const average = Number(summaryRow.average)
    const summary = {
      count: summaryRow.count ?? 0,
      average: Number.isFinite(average) ? average : 0,
      distribution: [
        { rating: 5, count: summaryRow.rating5 ?? 0 },
        { rating: 4, count: summaryRow.rating4 ?? 0 },
        { rating: 3, count: summaryRow.rating3 ?? 0 },
        { rating: 2, count: summaryRow.rating2 ?? 0 },
        { rating: 1, count: summaryRow.rating1 ?? 0 },
      ],
    }

    res.json({
      summary,
      reviews: reviewsResult.rows,
    })
  } catch (error) {
    console.error('GET /api/masters/:userId/reviews failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/masters/:userId/followers', async (req, res) => {
  const normalizedUserId = normalizeText(req.params.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const limitParam = Number(req.query.limit)
  const limit = Number.isInteger(limitParam)
    ? Math.min(Math.max(limitParam, 1), 50)
    : 30
  const offsetParam = Number(req.query.offset)
  const offset = Number.isInteger(offsetParam) ? Math.max(offsetParam, 0) : 0
  const searchQuery = normalizeText(req.query.q)
  const searchValue = searchQuery ? `%${searchQuery}%` : null

  try {
    const baseValues = [normalizedUserId]
    let searchClause = ''
    if (searchValue) {
      baseValues.push(searchValue)
      const searchIndex = baseValues.length
      searchClause = `
        AND (
          u.first_name ILIKE $${searchIndex}
          OR u.last_name ILIKE $${searchIndex}
          OR u.username ILIKE $${searchIndex}
          OR mp.display_name ILIKE $${searchIndex}
        )
      `
    }

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM master_followers mf
        LEFT JOIN users u ON u.user_id = mf.follower_id
        LEFT JOIN master_profiles mp ON mp.user_id = mf.follower_id
        WHERE mf.master_id = $1
        ${searchClause}
      `,
      baseValues
    )

    const values = [...baseValues, limit, offset]
    const dataResult = await pool.query(
      `
        SELECT
          mf.follower_id AS "userId",
          mf.created_at AS "followedAt",
          u.first_name AS "firstName",
          u.last_name AS "lastName",
          u.username AS "username",
          u.updated_at AS "updatedAt",
          mp.user_id AS "proUserId",
          mp.display_name AS "displayName",
          COALESCE(mp.avatar_path, u.avatar_url) AS "avatarPath"
        FROM master_followers mf
        LEFT JOIN users u ON u.user_id = mf.follower_id
        LEFT JOIN master_profiles mp ON mp.user_id = mf.follower_id
        WHERE mf.master_id = $1
        ${searchClause}
        ORDER BY mf.created_at DESC
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    )

    const total = countResult.rows[0]?.total ?? 0
    const followers = dataResult.rows.map((row) => ({
      userId: row.userId,
      firstName: row.firstName ?? null,
      lastName: row.lastName ?? null,
      username: row.username ?? null,
      updatedAt: row.updatedAt ?? null,
      followedAt: row.followedAt ?? null,
      displayName: row.displayName ?? null,
      isPro: Boolean(row.proUserId),
      avatarUrl: buildPublicUrl(req, row.avatarPath),
    }))

    res.json({ total, followers })
  } catch (error) {
    console.error('GET /api/masters/:userId/followers failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/masters/:userId/stories', async (req, res) => {
  const normalizedUserId = normalizeText(req.params.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          s.id,
          s.media_path AS "mediaPath",
          s.media_type AS "mediaType",
          s.caption,
          s.created_at AS "createdAt",
          s.expires_at AS "expiresAt",
          COUNT(v.viewer_id)::int AS "viewsCount"
        FROM master_stories s
        LEFT JOIN master_story_views v ON v.story_id = s.id
        WHERE s.master_id = $1
          AND s.expires_at > NOW()
        GROUP BY s.id
        ORDER BY s.created_at DESC
      `,
      [normalizedUserId]
    )

    const stories = result.rows.map((row) => ({
      id: row.id,
      mediaUrl: resolvePublicUrl(req, row.mediaPath),
      mediaType: row.mediaType,
      caption: row.caption ?? null,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      viewsCount: Number(row.viewsCount) || 0,
    }))

    res.json(stories)
  } catch (error) {
    console.error('GET /api/masters/:userId/stories failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/masters/:userId/stories', async (req, res) => {
  const normalizedUserId = normalizeText(req.params.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const mediaUrl = normalizeText(
    req.body?.mediaUrl ?? req.body?.url ?? req.body?.mediaPath
  )
  if (!mediaUrl) {
    res.status(400).json({ error: 'media_required' })
    return
  }
  const normalizedMediaPath = normalizeUploadPath(mediaUrl)
  if (!normalizedMediaPath) {
    res.status(400).json({ error: 'media_required' })
    return
  }
  const safeUserId = sanitizePathSegment(normalizedUserId)
  if (!isSafeStoryUploadPath(safeUserId, normalizedMediaPath)) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const caption = normalizeStoryCaption(req.body?.caption)
  const expiresInHours = clampStoryHours(req.body?.expiresInHours)
  const expiresAt = addMinutes(new Date(), expiresInHours * 60)

  try {
    const profileResult = await pool.query(
      `
        SELECT user_id
        FROM master_profiles
        WHERE user_id = $1
      `,
      [normalizedUserId]
    )

    if (profileResult.rows.length === 0) {
      res.status(404).json({ error: 'profile_not_found' })
      return
    }

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM master_stories
        WHERE master_id = $1
          AND expires_at > NOW()
      `,
      [normalizedUserId]
    )
    const total = countResult.rows[0]?.total ?? 0
    if (total >= STORY_MAX_ACTIVE) {
      res.status(409).json({ error: 'story_limit_reached' })
      return
    }

    const insertResult = await pool.query(
      `
        INSERT INTO master_stories (master_id, media_path, media_type, caption, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at AS "createdAt", expires_at AS "expiresAt"
      `,
      [normalizedUserId, normalizedMediaPath, 'image', caption, expiresAt]
    )

    const row = insertResult.rows[0]
    res.json({
      ok: true,
      id: row?.id ?? null,
      createdAt: row?.createdAt ?? null,
      expiresAt: row?.expiresAt ?? null,
    })
  } catch (error) {
    console.error('POST /api/masters/:userId/stories failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.delete('/api/masters/:userId/stories/:storyId', async (req, res) => {
  const normalizedUserId = normalizeText(req.params.userId)
  const storyId = parseOptionalInt(req.params.storyId)
  if (!normalizedUserId || !storyId) {
    res.status(400).json({ error: 'storyId_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        DELETE FROM master_stories
        WHERE id = $1 AND master_id = $2
        RETURNING media_path AS "mediaPath"
      `,
      [storyId, normalizedUserId]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    const mediaPath = normalizeUploadPath(result.rows[0]?.mediaPath)
    const safeUserId = sanitizePathSegment(normalizedUserId)
    if (mediaPath && isSafeStoryUploadPath(safeUserId, mediaPath)) {
      const absolutePath = path.join(uploadsRoot, mediaPath)
      fs.unlink(absolutePath).catch(() => {})
    }

    res.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/masters/:userId/stories/:storyId failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/stories', async (req, res) => {
  const normalizedUserId = normalizeText(req.query.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          s.id,
          s.master_id AS "masterId",
          s.media_path AS "mediaPath",
          s.media_type AS "mediaType",
          s.caption,
          s.created_at AS "createdAt",
          s.expires_at AS "expiresAt",
          mp.display_name AS "displayName",
          COALESCE(mp.avatar_path, u.avatar_url) AS "avatarPath",
          mp.categories,
          mp.updated_at AS "updatedAt",
          CASE WHEN v.story_id IS NULL THEN false ELSE true END AS "isSeen"
        FROM master_followers mf
        JOIN master_stories s ON s.master_id = mf.master_id
        LEFT JOIN master_profiles mp ON mp.user_id = s.master_id
        LEFT JOIN users u ON u.user_id = s.master_id
        LEFT JOIN master_story_views v
          ON v.story_id = s.id AND v.viewer_id = $1
        WHERE mf.follower_id = $1
          AND s.expires_at > NOW()
        ORDER BY s.created_at DESC
      `,
      [normalizedUserId]
    )

    const grouped = new Map()
    result.rows.forEach((row) => {
      const masterId = row.masterId
      if (!masterId) return
      const existing = grouped.get(masterId)
      const item = {
        id: row.id,
        mediaUrl: resolvePublicUrl(req, row.mediaPath),
        mediaType: row.mediaType,
        caption: row.caption ?? null,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        isSeen: Boolean(row.isSeen),
      }
      if (!existing) {
        grouped.set(masterId, {
          masterId,
          masterName: row.displayName?.trim() || 'Мастер',
          masterAvatarUrl: buildPublicUrl(req, row.avatarPath),
          categories: Array.isArray(row.categories) ? row.categories : [],
          updatedAt: row.updatedAt ?? null,
          latestStoryAt: row.createdAt,
          items: [item],
        })
      } else {
        existing.items.push(item)
        if (
          row.createdAt &&
          (!existing.latestStoryAt ||
            new Date(row.createdAt).getTime() >
              new Date(existing.latestStoryAt).getTime())
        ) {
          existing.latestStoryAt = row.createdAt
        }
      }
    })

    const payload = Array.from(grouped.values()).map((group) => {
      const sortedItems = group.items
        .slice()
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      const unseenCount = sortedItems.filter((item) => !item.isSeen).length
      return {
        ...group,
        items: sortedItems,
        unseenCount,
        hasUnseen: unseenCount > 0,
      }
    })

    payload.sort((a, b) => {
      if (a.hasUnseen !== b.hasUnseen) {
        return a.hasUnseen ? -1 : 1
      }
      return (
        new Date(b.latestStoryAt ?? 0).getTime() -
        new Date(a.latestStoryAt ?? 0).getTime()
      )
    })

    res.json(payload)
  } catch (error) {
    console.error('GET /api/stories failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/stories/:storyId/view', async (req, res) => {
  const storyId = parseOptionalInt(req.params.storyId)
  const viewerId = normalizeText(req.body?.userId ?? req.body?.viewerId)
  if (!storyId || !viewerId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const storyResult = await pool.query(
      `
        SELECT master_id AS "masterId", expires_at AS "expiresAt"
        FROM master_stories
        WHERE id = $1
      `,
      [storyId]
    )

    if (storyResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    const story = storyResult.rows[0]
    if (story.masterId === viewerId) {
      res.json({ ok: true, skipped: 'self' })
      return
    }
    const expiresAt = story.expiresAt ? new Date(story.expiresAt) : null
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      res.json({ ok: true, skipped: 'expired' })
      return
    }

    await pool.query(
      `
        INSERT INTO master_story_views (story_id, viewer_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [storyId, viewerId]
    )

    res.json({ ok: true })
  } catch (error) {
    console.error('POST /api/stories/:storyId/view failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/masters/media', async (req, res) => {
  const { userId, kind, dataUrl } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedKind = normalizeText(kind)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (normalizedKind !== 'avatar' && normalizedKind !== 'cover') {
    res.status(400).json({ error: 'invalid_kind' })
    return
  }

  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) {
    res.status(400).json({ error: 'invalid_image' })
    return
  }

  if (parsed.buffer.length > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: 'image_too_large' })
    return
  }

  try {
    let profileResult = await pool.query(
      `
        SELECT avatar_path, cover_path
        FROM master_profiles
        WHERE user_id = $1
      `,
      [normalizedUserId]
    )

    if (profileResult.rows.length === 0) {
      await ensureMasterProfile(normalizedUserId)
      profileResult = await pool.query(
        `
          SELECT avatar_path, cover_path
          FROM master_profiles
          WHERE user_id = $1
        `,
        [normalizedUserId]
      )
      if (profileResult.rows.length === 0) {
        res.status(404).json({ error: 'profile_not_found' })
        return
      }
    }

    const safeUserId = sanitizePathSegment(normalizedUserId)
    const ext = getImageExtension(parsed.mime)
    const filename = `${normalizedKind}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
    const relativePath = path.posix.join('masters', safeUserId, filename)
    const absolutePath = path.join(uploadsRoot, relativePath)

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, parsed.buffer)

    const column = normalizedKind === 'avatar' ? 'avatar_path' : 'cover_path'
    const previousPath =
      normalizedKind === 'avatar'
        ? profileResult.rows[0].avatar_path
        : profileResult.rows[0].cover_path

    await pool.query(
      `
        UPDATE master_profiles
        SET ${column} = $2,
            updated_at = NOW()
        WHERE user_id = $1
      `,
      [normalizedUserId, relativePath]
    )

    if (previousPath) {
      const previousAbsolute = path.join(uploadsRoot, previousPath)
      fs.unlink(previousAbsolute).catch(() => {})
    }

    res.json(
      normalizedKind === 'avatar'
        ? { ok: true, avatarUrl: buildPublicUrl(req, relativePath) }
        : { ok: true, coverUrl: buildPublicUrl(req, relativePath) }
    )
  } catch (error) {
    console.error('POST /api/masters/media failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/masters/portfolio', async (req, res) => {
  const { userId, dataUrl } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) {
    res.status(400).json({ error: 'invalid_image' })
    return
  }

  if (parsed.buffer.length > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: 'image_too_large' })
    return
  }

  try {
    await ensureUser(normalizedUserId)

    const safeUserId = sanitizePathSegment(normalizedUserId)
    const ext = getImageExtension(parsed.mime)
    const filename = `portfolio-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
    const relativePath = path.posix.join(
      'masters',
      safeUserId,
      'portfolio',
      filename
    )
    const absolutePath = path.join(uploadsRoot, relativePath)

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, parsed.buffer)

    res.json({ ok: true, url: buildPublicUrl(req, relativePath), path: relativePath })
  } catch (error) {
    console.error('POST /api/masters/portfolio failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/masters/stories/media', async (req, res) => {
  const { userId, dataUrl } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) {
    res.status(400).json({ error: 'invalid_image' })
    return
  }

  if (parsed.buffer.length > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: 'image_too_large' })
    return
  }

  try {
    await ensureUser(normalizedUserId)

    const safeUserId = sanitizePathSegment(normalizedUserId)
    const { relativePath, absolutePath } = buildStoryUploadPath(
      safeUserId,
      parsed.mime
    )

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, parsed.buffer)

    res.json({ ok: true, url: buildPublicUrl(req, relativePath), path: relativePath })
  } catch (error) {
    console.error('POST /api/masters/stories/media failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/masters/certificates', async (req, res) => {
  const { userId, dataUrl } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) {
    res.status(400).json({ error: 'invalid_image' })
    return
  }

  if (parsed.buffer.length > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: 'image_too_large' })
    return
  }

  try {
    await ensureUser(normalizedUserId)

    const safeUserId = sanitizePathSegment(normalizedUserId)
    const { relativePath, absolutePath } = buildCertificateUploadPath(
      safeUserId,
      parsed.mime
    )

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, parsed.buffer)

    res.json({ ok: true, url: buildPublicUrl(req, relativePath), path: relativePath })
  } catch (error) {
    console.error('POST /api/masters/certificates failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/requests/media', async (req, res) => {
  const { userId, dataUrl } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) {
    res.status(400).json({ error: 'invalid_image' })
    return
  }

  if (parsed.buffer.length > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: 'image_too_large' })
    return
  }

  try {
    await ensureUser(normalizedUserId)

    const safeUserId = sanitizePathSegment(normalizedUserId)
    const { relativePath, absolutePath } = buildRequestUploadPath(
      safeUserId,
      parsed.mime
    )

    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, parsed.buffer)

    res.json({
      ok: true,
      url: buildPublicUrl(req, relativePath),
      path: relativePath,
    })
  } catch (error) {
    console.error('POST /api/requests/media failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.delete('/api/requests/media', async (req, res) => {
  const { userId, path: requestPath } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedPath = normalizeUploadPath(requestPath)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (!normalizedPath) {
    res.status(400).json({ error: 'path_required' })
    return
  }

  try {
    const safeUserId = sanitizePathSegment(normalizedUserId)
    if (!isSafeRequestUploadPath(safeUserId, normalizedPath)) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const absolutePath = path.join(uploadsRoot, normalizedPath)
    await fs.unlink(absolutePath).catch(() => {})

    res.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/requests/media failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.delete('/api/masters/media', async (req, res) => {
  const { userId, kind } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedKind = normalizeText(kind)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (normalizedKind !== 'avatar' && normalizedKind !== 'cover') {
    res.status(400).json({ error: 'invalid_kind' })
    return
  }

  try {
    let profileResult = await pool.query(
      `
        SELECT avatar_path, cover_path
        FROM master_profiles
        WHERE user_id = $1
      `,
      [normalizedUserId]
    )

    if (profileResult.rows.length === 0) {
      await ensureMasterProfile(normalizedUserId)
      profileResult = await pool.query(
        `
          SELECT avatar_path, cover_path
          FROM master_profiles
          WHERE user_id = $1
        `,
        [normalizedUserId]
      )
      if (profileResult.rows.length === 0) {
        res.status(404).json({ error: 'profile_not_found' })
        return
      }
    }

    const column = normalizedKind === 'avatar' ? 'avatar_path' : 'cover_path'
    const previousPath =
      normalizedKind === 'avatar'
        ? profileResult.rows[0].avatar_path
        : profileResult.rows[0].cover_path

    await pool.query(
      `
        UPDATE master_profiles
        SET ${column} = NULL,
            updated_at = NOW()
        WHERE user_id = $1
      `,
      [normalizedUserId]
    )

    if (previousPath) {
      const previousAbsolute = path.join(uploadsRoot, previousPath)
      fs.unlink(previousAbsolute).catch(() => {})
    }

    res.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/masters/media failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/masters', async (req, res) => {
  const {
    userId,
    displayName,
    about,
    cityId,
    districtId,
    experienceYears,
    priceFrom,
    priceTo,
    isActive,
    scheduleDays,
    scheduleStart,
    scheduleEnd,
    worksAtClient,
    worksAtMaster,
    categories,
    services,
    portfolioUrls,
    showcaseUrls,
    certificates,
  } = req.body ?? {}

  const normalizedUserId = normalizeText(userId)
  const normalizedName = normalizeText(displayName)
  const normalizedAbout = normalizeText(about)
  const categoryList = normalizeStringArray(categories)
  const serviceList = normalizeStringArray(services)
  const portfolioList = Array.isArray(portfolioUrls)
    ? normalizeStringArray(portfolioUrls)
    : null
  const hasShowcase = Array.isArray(showcaseUrls)
  const showcaseList = hasShowcase ? normalizeStringArray(showcaseUrls) : null
  const certificateList = normalizeCertificates(certificates)
  const certificatePayload = JSON.stringify(certificateList)
  const scheduleDayList = normalizeStringArray(scheduleDays)
  const normalizedScheduleStart = normalizeText(scheduleStart) || null
  const normalizedScheduleEnd = normalizeText(scheduleEnd) || null

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const parsedCityId = parseOptionalInt(cityId)
  const parsedDistrictId = parseOptionalInt(districtId)
  const hasCity = parsedCityId !== null && parsedCityId > 0
  const hasDistrict = parsedDistrictId !== null && parsedDistrictId > 0

  if (hasDistrict && !hasCity) {
    res.status(400).json({ error: 'city_required' })
    return
  }

  const parsedExperienceYears = parseOptionalInt(experienceYears)
  const parsedPriceFrom = parseOptionalInt(priceFrom)
  const parsedPriceTo = parseOptionalInt(priceTo)

  if (
    parsedPriceFrom !== null &&
    parsedPriceTo !== null &&
    parsedPriceFrom > parsedPriceTo
  ) {
    res.status(400).json({ error: 'price_range_invalid' })
    return
  }

  const workAtClient = Boolean(worksAtClient)
  const workAtMaster = Boolean(worksAtMaster)
  const activeValue = typeof isActive === 'boolean' ? isActive : true

  try {
    await ensureUser(normalizedUserId)

    if (hasCity) {
      const cityCheck = await pool.query(`SELECT id FROM cities WHERE id = $1`, [
        parsedCityId,
      ])
      if (cityCheck.rows.length === 0) {
        res.status(400).json({ error: 'city_not_found' })
        return
      }
    }

    if (hasDistrict) {
      const districtCheck = await pool.query(
        `SELECT id FROM districts WHERE id = $1 AND city_id = $2`,
        [parsedDistrictId, parsedCityId]
      )
      if (districtCheck.rows.length === 0) {
        res.status(400).json({ error: 'district_not_found' })
        return
      }
    }

    await pool.query(
      `
        INSERT INTO master_profiles (
          user_id,
          display_name,
          about,
          city_id,
          district_id,
          experience_years,
          price_from,
          price_to,
          is_active,
          schedule_days,
          schedule_start,
          schedule_end,
          works_at_client,
          works_at_master,
          categories,
          services,
          portfolio_urls,
          certificates
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          COALESCE($17, '{}'::text[]),
          $18::jsonb
        )
        ON CONFLICT (user_id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            about = EXCLUDED.about,
            city_id = EXCLUDED.city_id,
            district_id = EXCLUDED.district_id,
            experience_years = EXCLUDED.experience_years,
            price_from = EXCLUDED.price_from,
            price_to = EXCLUDED.price_to,
            is_active = EXCLUDED.is_active,
            schedule_days = EXCLUDED.schedule_days,
            schedule_start = EXCLUDED.schedule_start,
            schedule_end = EXCLUDED.schedule_end,
            works_at_client = EXCLUDED.works_at_client,
            works_at_master = EXCLUDED.works_at_master,
            categories = EXCLUDED.categories,
            services = EXCLUDED.services,
            portfolio_urls =
              CASE
                WHEN $17 IS NULL THEN master_profiles.portfolio_urls
                ELSE $17
              END,
            certificates = EXCLUDED.certificates,
            updated_at = NOW()
      `,
      [
        normalizedUserId,
        normalizedName,
        normalizedAbout || null,
        hasCity ? parsedCityId : null,
        hasDistrict ? parsedDistrictId : null,
        parsedExperienceYears,
        parsedPriceFrom,
        parsedPriceTo,
        activeValue,
        scheduleDayList,
        normalizedScheduleStart,
        normalizedScheduleEnd,
        workAtClient,
        workAtMaster,
        categoryList,
        serviceList,
        portfolioList,
        certificatePayload,
      ]
    )

    if (hasShowcase) {
      await pool.query(
        `
          INSERT INTO master_showcases (user_id, showcase_urls)
          VALUES ($1, $2)
          ON CONFLICT (user_id) DO UPDATE
          SET showcase_urls = EXCLUDED.showcase_urls,
              updated_at = NOW()
        `,
        [normalizedUserId, showcaseList ?? []]
      )
    }

    const summary = getProfileStatusSummary({
      displayName: normalizedName,
      about: normalizedAbout || null,
      cityId: hasCity ? parsedCityId : null,
      districtId: hasDistrict ? parsedDistrictId : null,
      experienceYears: parsedExperienceYears,
      priceFrom: parsedPriceFrom,
      priceTo: parsedPriceTo,
      worksAtClient: workAtClient,
      worksAtMaster: workAtMaster,
      categories: categoryList,
      services: serviceList,
      portfolioUrls: portfolioList ?? [],
    })

    res.json({ ok: true, ...summary })
  } catch (error) {
    console.error('POST /api/masters failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/masters/status', async (req, res) => {
  const { userId, isActive, scheduleDays, scheduleStart, scheduleEnd } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const profile = await loadMasterProfile(normalizedUserId)
    if (!profile) {
      res.status(404).json({ error: 'profile_not_found' })
      return
    }

    const nextActive =
      typeof isActive === 'boolean' ? isActive : Boolean(profile.isActive)
    const nextScheduleDays = Array.isArray(scheduleDays)
      ? normalizeStringArray(scheduleDays)
      : Array.isArray(profile.scheduleDays)
        ? profile.scheduleDays
        : []
    const normalizedScheduleStart = normalizeText(scheduleStart)
    const normalizedScheduleEnd = normalizeText(scheduleEnd)
    const nextScheduleStart =
      scheduleStart === undefined
        ? profile.scheduleStart ?? null
        : normalizedScheduleStart || null
    const nextScheduleEnd =
      scheduleEnd === undefined ? profile.scheduleEnd ?? null : normalizedScheduleEnd || null

    await pool.query(
      `
        UPDATE master_profiles
        SET is_active = $2,
            schedule_days = $3,
            schedule_start = $4,
            schedule_end = $5,
            updated_at = NOW()
        WHERE user_id = $1
      `,
      [
        normalizedUserId,
        nextActive,
        nextScheduleDays,
        nextScheduleStart,
        nextScheduleEnd,
      ]
    )

    res.json({
      ok: true,
      isActive: nextActive,
      scheduleDays: nextScheduleDays,
      scheduleStart: nextScheduleStart,
      scheduleEnd: nextScheduleEnd,
    })
  } catch (error) {
    console.error('POST /api/masters/status failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/pro/requests', async (req, res) => {
  const normalizedUserId = normalizeText(req.query.userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const profile = await loadMasterProfile(normalizedUserId)
    const summary = getProfileStatusSummary(profile)
    if (!profile) {
      res.json({ ...summary, isActive: false, requests: [] })
      return
    }

    const masterLocation = await loadUserLocation(normalizedUserId)
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.user_id AS "userId",
          u.first_name AS "clientFirstName",
          u.last_name AS "clientLastName",
          u.username AS "clientUsername",
          r.city_id AS "cityId",
          r.district_id AS "districtId",
          c.name AS "cityName",
          d.name AS "districtName",
          r.address,
          r.category_id AS "categoryId",
          r.service_name AS "serviceName",
          r.tags,
          r.location_type AS "locationType",
          r.date_option AS "dateOption",
          r.date_time AS "dateTime",
          r.budget,
          r.details,
          r.photo_urls AS "photoUrls",
          r.status,
          r.created_at AS "createdAt",
          rd.batch AS "dispatchBatch",
          rd.status AS "dispatchStatus",
          rd.sent_at AS "dispatchSentAt",
          rd.expires_at AS "dispatchExpiresAt",
          rr.id AS "responseId",
          rr.status AS "responseStatus",
          rr.price AS "responsePrice",
          rr.comment AS "responseComment",
          rr.proposed_time AS "responseProposedTime",
          rr.created_at AS "responseCreatedAt",
          COALESCE(ch.id, legacy_ch.id) AS "chatId",
          ul.lat AS "clientLat",
          ul.lng AS "clientLng",
          ul.share_to_masters AS "clientShareToMasters",
          cts.score AS "clientTrustScore",
          cts.confidence AS "clientTrustConfidence",
          cts.updated_at AS "clientTrustUpdatedAt"
        FROM request_dispatches rd
        JOIN service_requests r ON r.id = rd.request_id
        LEFT JOIN users u ON u.user_id = r.user_id
        LEFT JOIN cities c ON c.id = r.city_id
        LEFT JOIN districts d ON d.id = r.district_id
        LEFT JOIN user_locations ul ON ul.user_id = r.user_id
        LEFT JOIN request_responses rr
          ON rr.request_id = r.id AND rr.master_id = rd.master_id
        LEFT JOIN client_trust_scores cts ON cts.user_id = r.user_id
        LEFT JOIN LATERAL (
          SELECT ch.id
          FROM chat_contexts cc
          JOIN chats ch ON ch.id = cc.chat_id
          WHERE cc.context_type = 'request'
            AND cc.context_id = r.id
            AND ch.master_id = rd.master_id
            AND ch.client_id = r.user_id
          ORDER BY ch.updated_at DESC NULLS LAST
          LIMIT 1
        ) ch ON true
        LEFT JOIN LATERAL (
          SELECT id
          FROM chats
          WHERE request_id = r.id
            AND master_id = rd.master_id
            AND context_type = 'request'
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1
        ) legacy_ch ON true
        WHERE rd.master_id = $1
          AND (
            (rd.status = 'sent' AND rd.expires_at > NOW())
            OR rr.id IS NOT NULL
          )
          AND (r.status = 'open' OR rr.id IS NOT NULL)
          AND r.user_id <> $1
        ORDER BY r.created_at DESC
        LIMIT 50
      `,
      [normalizedUserId]
    )

    const dedupedRows = []
    const seenPairs = new Set()
    result.rows.forEach((row) => {
      if (row.contextType === 'support') {
        dedupedRows.push(row)
        return
      }
      const pairKey = `${row.clientId}:${row.masterId}`
      if (seenPairs.has(pairKey)) return
      seenPairs.add(pairKey)
      dedupedRows.push(row)
    })

    const payload = dedupedRows.map((row) => {
      const clientName = formatUserDisplayName(
        row.clientFirstName,
        row.clientLastName,
        row.clientUsername,
        'Клиент'
      )
      const clientTrust = buildTrustPayload(row, {
        scoreKey: 'clientTrustScore',
        confidenceKey: 'clientTrustConfidence',
        updatedAtKey: 'clientTrustUpdatedAt',
      })
      const distanceKm =
        masterLocation &&
        row.clientShareToMasters &&
        typeof row.clientLat === 'number' &&
        typeof row.clientLng === 'number' &&
        typeof masterLocation.lat === 'number' &&
        typeof masterLocation.lng === 'number'
          ? roundDistanceKm(
              calculateDistanceKm(
                masterLocation.lat,
                masterLocation.lng,
                row.clientLat,
                row.clientLng
              )
            )
          : null
      return {
        ...row,
        clientName,
        distanceKm,
        clientTrust,
        clientLat: undefined,
        clientLng: undefined,
        clientShareToMasters: undefined,
        clientFirstName: undefined,
        clientLastName: undefined,
        clientUsername: undefined,
        clientTrustScore: undefined,
        clientTrustConfidence: undefined,
        clientTrustUpdatedAt: undefined,
      }
    })
    res.json({ ...summary, isActive: profile.isActive, requests: payload })
  } catch (error) {
    console.error('GET /api/pro/requests failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/bookings', async (req, res) => {
  const normalizedUserId = normalizeText(req.query.userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          b.id,
          b.client_id AS "clientId",
          b.master_id AS "masterId",
          mp.display_name AS "masterName",
          COALESCE(mp.avatar_path, u.avatar_url) AS "masterAvatarPath",
          b.city_id AS "cityId",
          b.district_id AS "districtId",
          c.name AS "cityName",
          d.name AS "districtName",
          b.address,
          b.category_id AS "categoryId",
          b.service_name AS "serviceName",
          b.service_price AS "servicePrice",
          b.service_duration AS "serviceDuration",
          b.location_type AS "locationType",
          b.scheduled_at AS "scheduledAt",
          b.photo_urls AS "photoUrls",
          b.status,
          b.proposed_price AS "proposedPrice",
          b.client_comment AS "comment",
          b.outcome,
          b.attendance_at AS "attendanceAt",
          b.late_minutes AS "lateMinutes",
          b.outcome_prompted_at AS "outcomePromptedAt",
          b.created_at AS "createdAt",
          mr.id AS "reviewId",
          COALESCE(bc.id, legacy_bc.id) AS "chatId"
        FROM service_bookings b
        LEFT JOIN master_profiles mp ON mp.user_id = b.master_id
        LEFT JOIN users u ON u.user_id = b.master_id
        LEFT JOIN master_reviews mr ON mr.booking_id = b.id
        LEFT JOIN LATERAL (
          SELECT ch.id
          FROM chat_contexts cc
          JOIN chats ch ON ch.id = cc.chat_id
          WHERE cc.context_type = 'booking'
            AND cc.context_id = b.id
            AND ch.client_id = b.client_id
            AND ch.master_id = b.master_id
          ORDER BY ch.updated_at DESC NULLS LAST
          LIMIT 1
        ) bc ON true
        LEFT JOIN LATERAL (
          SELECT id
          FROM chats
          WHERE booking_id = b.id
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1
        ) legacy_bc ON true
        LEFT JOIN cities c ON c.id = b.city_id
        LEFT JOIN districts d ON d.id = b.district_id
        WHERE b.client_id = $1
        ORDER BY b.created_at DESC
      `,
      [normalizedUserId]
    )

    const payload = result.rows.map((row) => ({
      ...row,
      masterName: row.masterName || 'Мастер',
      masterAvatarUrl: buildPublicUrl(req, row.masterAvatarPath),
    }))

    res.json(payload)
  } catch (error) {
    console.error('GET /api/bookings failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/pro/bookings', async (req, res) => {
  const normalizedUserId = normalizeText(req.query.userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const masterLocation = await loadUserLocation(normalizedUserId)
    const result = await pool.query(
      `
        SELECT
          b.id,
          b.client_id AS "clientId",
          b.master_id AS "masterId",
          u.first_name AS "clientFirstName",
          u.last_name AS "clientLastName",
          u.username AS "clientUsername",
          b.city_id AS "cityId",
          b.district_id AS "districtId",
          c.name AS "cityName",
          d.name AS "districtName",
          b.address,
          b.category_id AS "categoryId",
          b.service_name AS "serviceName",
          b.service_price AS "servicePrice",
          b.service_duration AS "serviceDuration",
          b.location_type AS "locationType",
          b.scheduled_at AS "scheduledAt",
          b.photo_urls AS "photoUrls",
          b.status,
          b.proposed_price AS "proposedPrice",
          b.client_comment AS "comment",
          b.outcome,
          b.attendance_at AS "attendanceAt",
          b.late_minutes AS "lateMinutes",
          b.outcome_prompted_at AS "outcomePromptedAt",
          b.created_at AS "createdAt",
          COALESCE(bc.id, legacy_bc.id) AS "chatId",
          ul.lat AS "clientLat",
          ul.lng AS "clientLng",
          ul.share_to_masters AS "clientShareToMasters",
          cts.score AS "clientTrustScore",
          cts.confidence AS "clientTrustConfidence",
          cts.updated_at AS "clientTrustUpdatedAt"
        FROM service_bookings b
        LEFT JOIN users u ON u.user_id = b.client_id
        LEFT JOIN cities c ON c.id = b.city_id
        LEFT JOIN districts d ON d.id = b.district_id
        LEFT JOIN user_locations ul ON ul.user_id = b.client_id
        LEFT JOIN LATERAL (
          SELECT ch.id
          FROM chat_contexts cc
          JOIN chats ch ON ch.id = cc.chat_id
          WHERE cc.context_type = 'booking'
            AND cc.context_id = b.id
            AND ch.client_id = b.client_id
            AND ch.master_id = b.master_id
          ORDER BY ch.updated_at DESC NULLS LAST
          LIMIT 1
        ) bc ON true
        LEFT JOIN LATERAL (
          SELECT id
          FROM chats
          WHERE booking_id = b.id
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1
        ) legacy_bc ON true
        LEFT JOIN client_trust_scores cts ON cts.user_id = b.client_id
        WHERE b.master_id = $1
        ORDER BY b.created_at DESC
      `,
      [normalizedUserId]
    )

    const payload = result.rows.map((row) => {
      const nameParts = [row.clientFirstName, row.clientLastName]
        .filter(Boolean)
        .join(' ')
        .trim()
      const clientName = nameParts || (row.clientUsername ? `@${row.clientUsername}` : 'Клиент')
      const clientTrust = buildTrustPayload(row, {
        scoreKey: 'clientTrustScore',
        confidenceKey: 'clientTrustConfidence',
        updatedAtKey: 'clientTrustUpdatedAt',
      })
      const distanceKm =
        masterLocation &&
        row.clientShareToMasters &&
        typeof row.clientLat === 'number' &&
        typeof row.clientLng === 'number' &&
        typeof masterLocation.lat === 'number' &&
        typeof masterLocation.lng === 'number'
          ? roundDistanceKm(
              calculateDistanceKm(
                masterLocation.lat,
                masterLocation.lng,
                row.clientLat,
                row.clientLng
              )
            )
          : null
      return {
        ...row,
        clientName,
        distanceKm,
        clientTrust,
        clientLat: undefined,
        clientLng: undefined,
        clientShareToMasters: undefined,
        clientTrustScore: undefined,
        clientTrustConfidence: undefined,
        clientTrustUpdatedAt: undefined,
      }
    })

    res.json(payload)
  } catch (error) {
    console.error('GET /api/pro/bookings failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

const loadProAnalyticsRange = async (
  userId,
  start,
  end,
  tzOffsetMinutes
) => {
  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1
  )
  const dateKeys = Array.from({ length: days }, (_, index) =>
    toDateKey(new Date(start.getTime() + index * DAY_MS), tzOffsetMinutes)
  ).filter(Boolean)
  const series = dateKeys.map((date) => ({
    date,
    revenue: 0,
    bookings: 0,
    requests: 0,
    responses: 0,
    followers: 0,
    reviews: 0,
    profileViews: 0,
  }))
  const seriesIndex = new Map(dateKeys.map((date, index) => [date, index]))

  const [
    bookingsResult,
    dispatchResult,
    responsesResult,
    chatsResult,
    reviewsResult,
    followersResult,
    followersTotalResult,
    profileViewsResult,
  ] = await Promise.all([
    pool.query(
      `
          SELECT
            b.id,
            b.client_id AS "clientId",
            b.category_id AS "categoryId",
            b.service_price AS "servicePrice",
            b.proposed_price AS "proposedPrice",
            b.status,
            b.created_at AS "createdAt",
            u.first_name AS "clientFirstName",
            u.last_name AS "clientLastName",
            u.username AS "clientUsername"
          FROM service_bookings b
          LEFT JOIN users u ON u.user_id = b.client_id
          WHERE b.master_id = $1
            AND b.created_at >= $2
            AND b.created_at <= $3
        `,
      [userId, start, end]
    ),
    pool.query(
      `
          SELECT request_id AS "requestId", sent_at AS "sentAt"
          FROM request_dispatches
          WHERE master_id = $1
            AND sent_at >= $2
            AND sent_at <= $3
        `,
      [userId, start, end]
    ),
    pool.query(
      `
          SELECT request_id AS "requestId", status, created_at AS "createdAt"
          FROM request_responses
          WHERE master_id = $1
            AND created_at >= $2
            AND created_at <= $3
        `,
      [userId, start, end]
    ),
    pool.query(
      `
          SELECT id, created_at AS "createdAt"
          FROM chats
          WHERE master_id = $1
            AND created_at >= $2
            AND created_at <= $3
        `,
      [userId, start, end]
    ),
    pool.query(
      `
          SELECT rating, created_at AS "createdAt"
          FROM master_reviews
          WHERE master_id = $1
            AND created_at >= $2
            AND created_at <= $3
        `,
      [userId, start, end]
    ),
    pool.query(
      `
          SELECT created_at AS "createdAt"
          FROM master_followers
          WHERE master_id = $1
            AND created_at >= $2
            AND created_at <= $3
        `,
      [userId, start, end]
    ),
    pool.query(
      `
          SELECT COUNT(*)::int AS total
          FROM master_followers
          WHERE master_id = $1
        `,
      [userId]
    ),
    pool.query(
      `
          SELECT created_at AS "createdAt"
          FROM master_profile_views
          WHERE master_id = $1
            AND created_at >= $2
            AND created_at <= $3
        `,
      [userId, start, end]
    ),
  ])

  const bookings = bookingsResult.rows ?? []
  const dispatches = dispatchResult.rows ?? []
  const responses = responsesResult.rows ?? []
  const chats = chatsResult.rows ?? []
  const reviews = reviewsResult.rows ?? []
  const followers = followersResult.rows ?? []
  const profileViews = profileViewsResult.rows ?? []

  const statusCounts = {}
  const categoryMap = new Map()
  const clientMap = new Map()
  const pendingStatuses = new Set(['pending', 'price_pending', 'price_proposed'])
  const cancelledStatuses = new Set(['declined', 'cancelled'])

  let confirmedRevenue = 0
  let projectedRevenue = 0
  let lostRevenue = 0
  let confirmedBookings = 0
  let pendingBookings = 0
  let cancelledBookings = 0

  bookings.forEach((booking) => {
    const amount = Number(booking.servicePrice ?? booking.proposedPrice ?? 0) || 0
    const status = booking.status

    statusCounts[status] = (statusCounts[status] ?? 0) + 1
    if (status === 'confirmed') {
      confirmedBookings += 1
      confirmedRevenue += amount
    } else if (pendingStatuses.has(status)) {
      pendingBookings += 1
      projectedRevenue += amount
    } else if (cancelledStatuses.has(status)) {
      cancelledBookings += 1
      lostRevenue += amount
    }

    const dateKey = toDateKey(booking.createdAt, tzOffsetMinutes)
    const seriesIdx = seriesIndex.get(dateKey)
    if (seriesIdx !== undefined) {
      series[seriesIdx].bookings += 1
      if (status === 'confirmed') {
        series[seriesIdx].revenue += amount
      }
    }

    if (status === 'confirmed' && booking.categoryId) {
      const entry = categoryMap.get(booking.categoryId) ?? {
        id: booking.categoryId,
        count: 0,
        revenue: 0,
      }
      entry.count += 1
      entry.revenue += amount
      categoryMap.set(booking.categoryId, entry)
    }

    if (booking.clientId) {
      const existing = clientMap.get(booking.clientId) ?? {
        id: booking.clientId,
        name: formatUserDisplayName(
          booking.clientFirstName,
          booking.clientLastName,
          booking.clientUsername,
          'Клиент'
        ),
        visits: 0,
        revenue: 0,
        lastSeenAt: null,
      }
      existing.visits += 1
      if (status === 'confirmed') {
        existing.revenue += amount
      }
      const createdAt = new Date(booking.createdAt)
      if (!Number.isNaN(createdAt.getTime())) {
        if (!existing.lastSeenAt || createdAt > existing.lastSeenAt) {
          existing.lastSeenAt = createdAt
        }
      }
      clientMap.set(booking.clientId, existing)
    }
  })

  dispatches.forEach((dispatch) => {
    const dateKey = toDateKey(dispatch.sentAt, tzOffsetMinutes)
    const seriesIdx = seriesIndex.get(dateKey)
    if (seriesIdx !== undefined) {
      series[seriesIdx].requests += 1
    }
  })

  responses.forEach((response) => {
    const dateKey = toDateKey(response.createdAt, tzOffsetMinutes)
    const seriesIdx = seriesIndex.get(dateKey)
    if (seriesIdx !== undefined) {
      series[seriesIdx].responses += 1
    }
  })

  followers.forEach((follower) => {
    const dateKey = toDateKey(follower.createdAt, tzOffsetMinutes)
    const seriesIdx = seriesIndex.get(dateKey)
    if (seriesIdx !== undefined) {
      series[seriesIdx].followers += 1
    }
  })

  profileViews.forEach((view) => {
    const dateKey = toDateKey(view.createdAt, tzOffsetMinutes)
    const seriesIdx = seriesIndex.get(dateKey)
    if (seriesIdx !== undefined) {
      series[seriesIdx].profileViews += 1
    }
  })

  let ratingSum = 0
  reviews.forEach((review) => {
    const dateKey = toDateKey(review.createdAt, tzOffsetMinutes)
    const seriesIdx = seriesIndex.get(dateKey)
    if (seriesIdx !== undefined) {
      series[seriesIdx].reviews += 1
    }
    const ratingValue = Number(review.rating) || 0
    ratingSum += ratingValue
  })

  const averageRating = reviews.length > 0 ? ratingSum / reviews.length : 0
  const followersTotal = followersTotalResult.rows[0]?.total ?? 0

  const categories = Array.from(categoryMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)
  const statuses = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
  }))
  const clients = Array.from(clientMap.values())
    .sort((a, b) => {
      const revenueDiff = b.revenue - a.revenue
      if (revenueDiff !== 0) return revenueDiff
      return b.visits - a.visits
    })
    .slice(0, 12)
    .map((client) => ({
      ...client,
      lastSeenAt: client.lastSeenAt ? client.lastSeenAt.toISOString() : null,
    }))

  const waterfall = [
    { label: 'Подтверждено', value: confirmedRevenue },
    { label: 'В ожидании', value: projectedRevenue },
    { label: 'Потери', value: -lostRevenue },
    {
      label: 'Итого',
      value: confirmedRevenue + projectedRevenue - lostRevenue,
      isTotal: true,
    },
  ]

  return {
    range: {
      start: dateKeys[0] ?? '',
      end: dateKeys[dateKeys.length - 1] ?? '',
      days,
    },
    summary: {
      revenue: {
        confirmed: confirmedRevenue,
        projected: confirmedRevenue + projectedRevenue,
        lost: lostRevenue,
        avgCheck: confirmedBookings ? confirmedRevenue / confirmedBookings : 0,
      },
      bookings: {
        total: bookings.length,
        confirmed: confirmedBookings,
        pending: pendingBookings,
        cancelled: cancelledBookings,
      },
      requests: {
        total: dispatches.length,
        responded: responses.length,
        accepted: responses.filter((item) => item.status === 'accepted').length,
      },
      followers: {
        total: followersTotal,
        new: followers.length,
      },
      reviews: {
        count: reviews.length,
        average: averageRating,
      },
      profileViews: {
        total: profileViews.length,
      },
    },
    timeseries: series,
    categories,
    statuses,
    funnel: {
      requests: dispatches.length,
      responses: responses.length,
      chats: chats.length,
      bookings: bookings.length,
      confirmed: confirmedBookings,
    },
    clients,
    waterfall,
  }
}

app.get('/api/pro/analytics', async (req, res) => {
  const normalizedUserId = normalizeText(req.query.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const tzOffsetMinutes = parseOptionalInt(req.query.tzOffset) ?? 0
  const startParam = parseDateParam(req.query.start)
  const endParam = parseDateParam(req.query.end)
  const rangeDays = parseRangeDays(req.query.range)

  const now = new Date()
  const endTime = endParam ?? now
  const startTime = startParam ?? new Date(endTime.getTime() - (rangeDays - 1) * DAY_MS)
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    res.status(400).json({ error: 'date_invalid' })
    return
  }

  const start = startTime <= endTime ? startTime : endTime
  const end = startTime <= endTime ? endTime : startTime
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1)
  const compareParam = normalizeText(req.query.compare).toLowerCase()
  const shouldCompare = ['1', 'true', 'yes', 'on'].includes(compareParam)

  try {
    const payload = await loadProAnalyticsRange(
      normalizedUserId,
      start,
      end,
      tzOffsetMinutes
    )

    if (shouldCompare) {
      const compareEnd = new Date(start.getTime() - DAY_MS)
      const compareStart = new Date(
        compareEnd.getTime() - (days - 1) * DAY_MS
      )
      const comparePayload = await loadProAnalyticsRange(
        normalizedUserId,
        compareStart,
        compareEnd,
        tzOffsetMinutes
      )
      payload.compare = {
        range: comparePayload.range,
        summary: comparePayload.summary,
        timeseries: comparePayload.timeseries,
      }
    }

    res.json(payload)
  } catch (error) {
    console.error('GET /api/pro/analytics failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/bookings', async (req, res) => {
  const {
    userId,
    masterId,
    cityId,
    districtId,
    address,
    categoryId,
    serviceName,
    locationType,
    scheduledAt,
    photoUrls,
    comment,
  } = req.body ?? {}

  const normalizedUserId = normalizeText(userId)
  const normalizedMasterId = normalizeText(masterId)
  const normalizedCategoryId = normalizeText(categoryId)
  const normalizedServiceName = normalizeText(serviceName)
  const normalizedLocationType = normalizeText(locationType)
  const normalizedAddress = normalizeText(address)
  const normalizedComment = normalizeText(comment)
  const photoList = normalizeStringArray(photoUrls)

  if (!normalizedUserId || !normalizedMasterId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (!normalizedCategoryId || !normalizedServiceName) {
    res.status(400).json({ error: 'service_required' })
    return
  }

  if (!['client', 'master'].includes(normalizedLocationType)) {
    res.status(400).json({ error: 'locationType_invalid' })
    return
  }

  if (!normalizeText(scheduledAt)) {
    res.status(400).json({ error: 'scheduledAt_required' })
    return
  }

  const scheduledDate = new Date(scheduledAt)
  if (Number.isNaN(scheduledDate.getTime())) {
    res.status(400).json({ error: 'scheduledAt_invalid' })
    return
  }

  const parsedCityId = Number(cityId)
  const parsedDistrictId = Number(districtId)
  if (!Number.isInteger(parsedCityId) || !Number.isInteger(parsedDistrictId)) {
    res.status(400).json({ error: 'location_required' })
    return
  }

  try {
    const profile = await loadMasterProfile(normalizedMasterId)
    if (!profile) {
      res.status(404).json({ error: 'master_not_found' })
      return
    }

    const categories = Array.isArray(profile.categories) ? profile.categories : []
    if (!categories.includes(normalizedCategoryId)) {
      res.status(403).json({ error: 'category_mismatch' })
      return
    }

    const serviceItems = parseServiceItems(profile.services ?? [])
    const normalizedRequestedService = normalizeServiceName(normalizedServiceName)
    const matchedService = serviceItems.find(
      (item) => normalizeServiceName(item.name) === normalizedRequestedService
    )
    if (!matchedService) {
      res.status(403).json({ error: 'service_mismatch' })
      return
    }

    if (normalizedLocationType === 'client' && !profile.worksAtClient) {
      res.status(403).json({ error: 'location_type_mismatch' })
      return
    }
    if (normalizedLocationType === 'master' && !profile.worksAtMaster) {
      res.status(403).json({ error: 'location_type_mismatch' })
      return
    }

    const profileCityId = parseOptionalInt(profile.cityId)
    const profileDistrictId = parseOptionalInt(profile.districtId)
    if (
      (profileCityId && profileCityId !== parsedCityId) ||
      (profileDistrictId && profileDistrictId !== parsedDistrictId)
    ) {
      res.status(403).json({ error: 'location_mismatch' })
      return
    }

    const scheduleDays = Array.isArray(profile.scheduleDays)
      ? profile.scheduleDays.map((day) => normalizeText(day).toLowerCase())
      : []
    const scheduleStartMinutes = parseTimeToMinutes(profile.scheduleStart)
    const scheduleEndMinutes = parseTimeToMinutes(profile.scheduleEnd)

    if (
      scheduleDays.length === 0 ||
      scheduleStartMinutes === null ||
      scheduleEndMinutes === null ||
      scheduleStartMinutes >= scheduleEndMinutes
    ) {
      res.status(409).json({ error: 'schedule_unavailable' })
      return
    }

    const dayKey = getDayKeyFromDate(scheduledDate)
    if (!scheduleDays.includes(dayKey)) {
      res.status(409).json({ error: 'day_unavailable' })
      return
    }

    const serviceDuration = matchedService.duration ?? 60
    const scheduledMinutes =
      scheduledDate.getHours() * 60 + scheduledDate.getMinutes()
    if (
      scheduledMinutes < scheduleStartMinutes ||
      scheduledMinutes + serviceDuration > scheduleEndMinutes
    ) {
      res.status(409).json({ error: 'time_unavailable' })
      return
    }

    if (scheduledDate.getTime() < Date.now()) {
      res.status(409).json({ error: 'time_unavailable' })
      return
    }

    const { start: dayStart, end: dayEnd } = buildDayBounds(scheduledDate)
    const existing = await pool.query(
      `
        SELECT
          scheduled_at AS "scheduledAt",
          service_duration AS "serviceDuration"
        FROM service_bookings
        WHERE master_id = $1
          AND status NOT IN ('declined', 'cancelled')
          AND scheduled_at >= $2
          AND scheduled_at < $3
      `,
      [normalizedMasterId, dayStart.toISOString(), dayEnd.toISOString()]
    )

    const startMs = scheduledDate.getTime()
    const endMs = startMs + serviceDuration * 60 * 1000
    const hasConflict = existing.rows.some((row) => {
      const existingStart = new Date(row.scheduledAt).getTime()
      const existingDuration = Number(row.serviceDuration) || 60
      const existingEnd = existingStart + existingDuration * 60 * 1000
      return startMs < existingEnd && endMs > existingStart
    })
    if (hasConflict) {
      res.status(409).json({ error: 'time_unavailable' })
      return
    }

    await ensureUser(normalizedUserId)
    await ensureUser(normalizedMasterId)

    const status = matchedService.price !== null ? 'pending' : 'price_pending'
    const result = await pool.query(
      `
        INSERT INTO service_bookings (
          client_id,
          master_id,
          city_id,
          district_id,
          address,
          category_id,
          service_name,
          service_price,
          service_duration,
          location_type,
          scheduled_at,
          photo_urls,
          status,
          proposed_price,
          client_comment
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL, $14)
        RETURNING id, created_at AS "createdAt"
      `,
      [
        normalizedUserId,
        normalizedMasterId,
        parsedCityId,
        parsedDistrictId,
        normalizedAddress || null,
        normalizedCategoryId,
        normalizedServiceName,
        matchedService.price ?? null,
        serviceDuration,
        normalizedLocationType,
        scheduledDate.toISOString(),
        photoList,
        status,
        normalizedComment || null,
      ]
    )

    res.json({
      ok: true,
      id: result.rows[0]?.id,
      createdAt: result.rows[0]?.createdAt,
      status,
    })
  } catch (error) {
    console.error('POST /api/bookings failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.patch('/api/bookings/:id', async (req, res) => {
  const bookingId = Number(req.params.id)
  if (!Number.isInteger(bookingId)) {
    res.status(400).json({ error: 'bookingId_invalid' })
    return
  }

  const { userId, action, price, outcome, lateMinutes } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedAction = normalizeText(action)
  const parsedPrice = parseOptionalInt(price)
  const normalizedOutcome = normalizeText(outcome)
  const parsedLateMinutes = parseOptionalInt(lateMinutes)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (!normalizedAction) {
    res.status(400).json({ error: 'action_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          client_id AS "clientId",
          master_id AS "masterId",
          status,
          service_name AS "serviceName",
          service_price AS "servicePrice",
          proposed_price AS "proposedPrice",
          scheduled_at AS "scheduledAt",
          cancelled_at AS "cancelledAt",
          outcome
        FROM service_bookings
        WHERE id = $1
      `,
      [bookingId]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    const booking = result.rows[0]
    const isMaster = booking.masterId === normalizedUserId
    const isClient = booking.clientId === normalizedUserId

    if (!isMaster && !isClient) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    if (normalizedAction === 'master-accept') {
      if (!isMaster) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (booking.status !== 'pending' || booking.servicePrice === null) {
        res.status(409).json({ error: 'status_invalid' })
        return
      }

      await pool.query(
        `
          UPDATE service_bookings
          SET status = 'confirmed',
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId]
      )

      let chatPayload = null
      try {
        chatPayload = await createChatForBooking({
          bookingId,
          clientId: booking.clientId,
          masterId: booking.masterId,
          serviceName: booking.serviceName,
          actorId: normalizedUserId,
        })
        if (chatPayload?.chatId) {
          void notifyChatMembers(chatPayload.chatId, {
            type: 'chat:created',
            chatId: chatPayload.chatId,
            bookingId,
          })
          if (chatPayload.systemMessage) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'message:new',
              chatId: chatPayload.chatId,
              message: chatPayload.systemMessage,
            })
          } else if (chatPayload.systemMessageId) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'message:new',
              chatId: chatPayload.chatId,
              messageId: chatPayload.systemMessageId,
            })
          }
        }
      } catch (chatError) {
        console.error('Failed to create chat for booking:', chatError)
      }

      res.json({ ok: true, status: 'confirmed', chatId: chatPayload?.chatId ?? null })
      return
    }

    if (normalizedAction === 'master-decline') {
      if (!isMaster) {
        res.status(403).json({ error: 'forbidden' })
        return
      }

      await pool.query(
        `
          UPDATE service_bookings
          SET status = 'declined',
              cancelled_by = 'master',
              cancelled_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId]
      )

      res.json({ ok: true, status: 'declined' })
      return
    }

    if (normalizedAction === 'master-propose-price') {
      if (!isMaster) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (parsedPrice === null) {
        res.status(400).json({ error: 'price_required' })
        return
      }
      if (!['pending', 'price_pending', 'price_proposed'].includes(booking.status)) {
        res.status(409).json({ error: 'status_invalid' })
        return
      }

      await pool.query(
        `
          UPDATE service_bookings
          SET proposed_price = $2,
              status = 'price_proposed',
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId, parsedPrice]
      )

      res.json({ ok: true, status: 'price_proposed', proposedPrice: parsedPrice })
      return
    }

    if (normalizedAction === 'client-accept-price') {
      if (!isClient) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (booking.status !== 'price_proposed' || booking.proposedPrice === null) {
        res.status(409).json({ error: 'status_invalid' })
        return
      }

      await pool.query(
        `
          UPDATE service_bookings
          SET service_price = $2,
              proposed_price = NULL,
              status = 'confirmed',
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId, booking.proposedPrice]
      )

      let chatPayload = null
      try {
        chatPayload = await createChatForBooking({
          bookingId,
          clientId: booking.clientId,
          masterId: booking.masterId,
          serviceName: booking.serviceName,
          actorId: normalizedUserId,
        })
        if (chatPayload?.chatId) {
          void notifyChatMembers(chatPayload.chatId, {
            type: 'chat:created',
            chatId: chatPayload.chatId,
            bookingId,
          })
          if (chatPayload.systemMessage) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'message:new',
              chatId: chatPayload.chatId,
              message: chatPayload.systemMessage,
            })
          } else if (chatPayload.systemMessageId) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'message:new',
              chatId: chatPayload.chatId,
              messageId: chatPayload.systemMessageId,
            })
          }
        }
      } catch (chatError) {
        console.error('Failed to create chat for booking:', chatError)
      }

      res.json({
        ok: true,
        status: 'confirmed',
        servicePrice: booking.proposedPrice,
        chatId: chatPayload?.chatId ?? null,
      })
      return
    }

    if (normalizedAction === 'client-decline-price') {
      if (!isClient) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (booking.status !== 'price_proposed') {
        res.status(409).json({ error: 'status_invalid' })
        return
      }

      const cancelledAt = new Date().toISOString()

      await pool.query(
        `
          UPDATE service_bookings
          SET status = 'cancelled',
              cancelled_by = 'client',
              cancelled_at = $2,
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId, cancelledAt]
      )

      res.json({ ok: true, status: 'cancelled' })
      return
    }

    if (normalizedAction === 'client-cancel') {
      if (!isClient) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (!['pending', 'confirmed', 'price_proposed', 'price_pending'].includes(booking.status)) {
        res.status(409).json({ error: 'status_invalid' })
        return
      }

      const cancelledDate = new Date()
      const cancelledAt = cancelledDate.toISOString()
      const scheduledAt = new Date(booking.scheduledAt ?? '')
      const outcomeValue =
        !Number.isNaN(scheduledAt.getTime()) &&
        scheduledAt.getTime() - cancelledDate.getTime() < 24 * 60 * 60 * 1000
          ? 'late_cancel'
          : null

      await pool.query(
        `
          UPDATE service_bookings
          SET status = 'cancelled',
              cancelled_by = 'client',
              cancelled_at = $2,
              outcome = $3,
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId, cancelledAt, outcomeValue]
      )

      await logClientTrustEvent({
        userId: booking.clientId,
        eventType: 'visit_rescheduled',
        meta: {
          ref: `booking:${bookingId}`,
          bookingId,
          scheduledAt: booking.scheduledAt,
        },
      })

      res.json({ ok: true, status: 'cancelled' })
      return
    }

    if (normalizedAction === 'set-outcome') {
      if (!isMaster) {
        res.status(403).json({ error: 'forbidden' })
        return
      }

      if (!['on_time', 'late', 'no_show', 'late_cancel'].includes(normalizedOutcome)) {
        res.status(400).json({ error: 'outcome_invalid' })
        return
      }

      if (booking.status !== 'confirmed') {
        res.status(409).json({ error: 'status_invalid' })
        return
      }

      if (booking.outcome) {
        res.status(409).json({ error: 'outcome_locked' })
        return
      }

      if (normalizedOutcome === 'late' && (!parsedLateMinutes || parsedLateMinutes <= 0)) {
        res.status(400).json({ error: 'late_minutes_required' })
        return
      }

      const updates = ['outcome = $2', 'updated_at = NOW()']
      const values = [bookingId, normalizedOutcome]
      const pushValue = (value) => {
        values.push(value)
        return `$${values.length}`
      }

      if (normalizedOutcome === 'late') {
        updates.push(`late_minutes = ${pushValue(parsedLateMinutes)}`)
        updates.push('attendance_at = NOW()')
      } else {
        updates.push('late_minutes = NULL')
        updates.push(normalizedOutcome === 'on_time' ? 'attendance_at = NOW()' : 'attendance_at = NULL')
      }

      if (normalizedOutcome === 'late_cancel') {
        updates.push(`cancelled_by = COALESCE(cancelled_by, 'client')`)
        updates.push(`cancelled_at = COALESCE(cancelled_at, NOW())`)
      }

      const outcomeLabel =
        BOOKING_OUTCOME_LABELS[normalizedOutcome] ?? normalizedOutcome
      const outcomeDetail =
        normalizedOutcome === 'late' && parsedLateMinutes
          ? `Опоздал на ${parsedLateMinutes} мин.`
          : outcomeLabel
      const systemBody = `Мастер отметил: ${outcomeDetail}.`
      const systemMeta = {
        event: 'booking_outcome_marked',
        visibility: 'master_only',
        audience: 'master_only',
        bookingId,
        outcome: normalizedOutcome,
        lateMinutes: normalizedOutcome === 'late' ? parsedLateMinutes : null,
        scheduledAt: booking.scheduledAt ?? null,
        serviceName: booking.serviceName ?? null,
      }

      let chatPayload = null
      let systemMessagePayload = null
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
          },
          { client }
        )
        if (!chatPayload?.chatId) {
          throw new Error('chat_unavailable')
        }

        await client.query(
          `
            UPDATE service_bookings
            SET ${updates.join(', ')}
            WHERE id = $1
          `,
          values
        )

        const messageResult = await insertSystemMessage(
          {
            chatId: chatPayload.chatId,
            body: systemBody,
            meta: systemMeta,
            actorId: normalizedUserId,
            audience: 'master',
          },
          { client }
        )
        systemMessagePayload = {
          id: messageResult.id,
          chatId: chatPayload.chatId,
          senderId: null,
          type: 'system',
          body: systemBody,
          meta: systemMeta,
          attachmentUrl: null,
          createdAt: messageResult.createdAt,
        }

        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }

      const trustMeta = {
        ref: `booking:${bookingId}`,
        bookingId,
        scheduledAt: booking.scheduledAt,
        ...(normalizedOutcome === 'late'
          ? { lateMinutes: parsedLateMinutes }
          : {}),
        ...(normalizedOutcome === 'late_cancel'
          ? { source: 'outcome' }
          : {}),
      }
      const trustEventType =
        normalizedOutcome === 'on_time'
          ? 'visit_on_time'
          : normalizedOutcome === 'late'
            ? 'visit_late'
            : normalizedOutcome === 'no_show'
              ? 'visit_no_show'
              : 'visit_rescheduled'

      await logClientTrustEvent({
        userId: booking.clientId,
        eventType: trustEventType,
        meta: trustMeta,
        skipRefresh: true,
      })
      const trust = await refreshClientTrustScore(booking.clientId)

      if (chatPayload?.chatId) {
        if (chatPayload.isNew) {
          void notifyChatMembers(chatPayload.chatId, {
            type: 'chat:created',
            chatId: chatPayload.chatId,
            bookingId,
          })
          if (chatPayload.systemMessage) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'message:new',
              chatId: chatPayload.chatId,
              message: chatPayload.systemMessage,
            })
          } else if (chatPayload.systemMessageId) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'message:new',
              chatId: chatPayload.chatId,
              messageId: chatPayload.systemMessageId,
            })
          }
        }
        if (systemMessagePayload) {
          void notifyChatMembers(chatPayload.chatId, {
            type: 'message:new',
            chatId: chatPayload.chatId,
            message: systemMessagePayload,
          }, { audience: 'master' })
        }
        void notifyChatMembers(chatPayload.chatId, {
          type: 'trust:update',
          chatId: chatPayload.chatId,
          userId: booking.clientId,
          trust,
        })
      }

      res.json({
        ok: true,
        outcome: normalizedOutcome,
        lateMinutes: normalizedOutcome === 'late' ? parsedLateMinutes : null,
        trust,
        systemMessage: systemMessagePayload,
        chatId: chatPayload?.chatId ?? null,
      })
      return
    }

    if (normalizedAction === 'client-delete') {
      if (!isClient) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (!['cancelled', 'declined'].includes(booking.status)) {
        res.status(409).json({ error: 'status_invalid' })
        return
      }

      await pool.query(
        `
          DELETE FROM service_bookings
          WHERE id = $1
        `,
        [bookingId]
      )

      res.json({ ok: true, deleted: true })
      return
    }

    res.status(400).json({ error: 'action_invalid' })
  } catch (error) {
    console.error('PATCH /api/bookings/:id failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/bookings/:id/review', async (req, res) => {
  const bookingId = Number(req.params.id)
  if (!Number.isInteger(bookingId)) {
    res.status(400).json({ error: 'bookingId_invalid' })
    return
  }

  const { userId, rating, comment } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const parsedRating = parseOptionalInt(rating)
  const normalizedComment = normalizeText(comment)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
    res.status(400).json({ error: 'rating_invalid' })
    return
  }

  try {
    const bookingResult = await pool.query(
      `
        SELECT
          id,
          client_id AS "clientId",
          master_id AS "masterId",
          status,
          service_name AS "serviceName",
          scheduled_at AS "scheduledAt"
        FROM service_bookings
        WHERE id = $1
      `,
      [bookingId]
    )

    if (bookingResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    const booking = bookingResult.rows[0]
    if (booking.clientId !== normalizedUserId) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    if (booking.status !== 'confirmed') {
      res.status(409).json({ error: 'status_invalid' })
      return
    }

    const scheduledAt = new Date(booking.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() > Date.now()) {
      res.status(409).json({ error: 'time_not_passed' })
      return
    }

    const existing = await pool.query(
      `
        SELECT id
        FROM master_reviews
        WHERE booking_id = $1
      `,
      [bookingId]
    )

    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'review_exists' })
      return
    }

    await ensureUser(normalizedUserId)
    await ensureUser(booking.masterId)

    const insertResult = await pool.query(
      `
        INSERT INTO master_reviews (
          master_id,
          reviewer_id,
          rating,
          comment,
          service_name,
          booking_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [
        booking.masterId,
        normalizedUserId,
        parsedRating,
        normalizedComment || null,
        booking.serviceName ?? null,
        bookingId,
      ]
    )

    await pool.query(
      `
        UPDATE service_bookings
        SET outcome = COALESCE(outcome, 'on_time'),
            updated_at = NOW()
        WHERE id = $1
      `,
      [bookingId]
    )

    await logClientTrustEvent({
      userId: booking.clientId,
      eventType: 'visit_on_time',
      meta: {
        ref: `booking:${bookingId}`,
        bookingId,
        scheduledAt: booking.scheduledAt,
        source: 'review',
      },
    })

    res.json({ ok: true, reviewId: insertResult.rows[0]?.id })
  } catch (error) {
    console.error('POST /api/bookings/:id/review failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/requests', async (req, res) => {
  const normalizedUserId = normalizeText(req.query.userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.user_id AS "userId",
          r.city_id AS "cityId",
          r.district_id AS "districtId",
          c.name AS "cityName",
          d.name AS "districtName",
          r.address,
          r.category_id AS "categoryId",
          r.service_name AS "serviceName",
          r.tags,
          r.location_type AS "locationType",
          r.date_option AS "dateOption",
          r.date_time AS "dateTime",
          r.budget,
          r.details,
          r.photo_urls AS "photoUrls",
          r.status,
          r.created_at AS "createdAt",
          (
            SELECT COUNT(*)
            FROM request_responses rr
            WHERE rr.request_id = r.id
          )::int AS "responsesCount",
          COALESCE(rp.preview, '[]'::json) AS "responsePreview",
          (
            SELECT COUNT(*)
            FROM request_dispatches rd
            WHERE rd.request_id = r.id
          )::int AS "dispatchedCount",
          (
            SELECT COALESCE(MAX(rd.batch), 0)
            FROM request_dispatches rd
            WHERE rd.request_id = r.id
          )::int AS "dispatchBatch",
          (
            SELECT MAX(rd.expires_at)
            FROM request_dispatches rd
            WHERE rd.request_id = r.id
              AND rd.status = 'sent'
              AND rd.expires_at > NOW()
          ) AS "dispatchExpiresAt"
        FROM service_requests r
        LEFT JOIN cities c ON c.id = r.city_id
        LEFT JOIN districts d ON d.id = r.district_id
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'masterId', preview.master_id,
              'displayName', preview.display_name,
              'avatarPath', preview.avatar_path
            )
          ) AS preview
          FROM (
            SELECT
              rr.master_id,
              mp.display_name,
              COALESCE(mp.avatar_path, u.avatar_url) AS avatar_path
            FROM request_responses rr
            LEFT JOIN master_profiles mp ON mp.user_id = rr.master_id
            LEFT JOIN users u ON u.user_id = rr.master_id
            WHERE rr.request_id = r.id
            ORDER BY rr.created_at DESC
            LIMIT 3
          ) preview
        ) rp ON true
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC
      `,
      [normalizedUserId]
    )
    const payload = result.rows.map((row) => {
      let previews = []
      if (Array.isArray(row.responsePreview)) {
        previews = row.responsePreview
      } else if (typeof row.responsePreview === 'string') {
        try {
          const parsed = JSON.parse(row.responsePreview)
          if (Array.isArray(parsed)) {
            previews = parsed
          }
        } catch (error) {
          previews = []
        }
      }
      const responsePreview = previews.map((item) => ({
        masterId: item.masterId,
        displayName: item.displayName ?? null,
        avatarUrl: resolvePublicUrl(req, item.avatarPath),
      }))
      return {
        ...row,
        responsePreview,
      }
    })

    res.json(payload)
  } catch (error) {
    console.error('GET /api/requests failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/requests/:id', async (req, res) => {
  const requestId = Number(req.params.id)
  if (!Number.isInteger(requestId)) {
    res.status(400).json({ error: 'requestId_invalid' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.user_id AS "userId",
          r.city_id AS "cityId",
          r.district_id AS "districtId",
          c.name AS "cityName",
          d.name AS "districtName",
          r.address,
          r.category_id AS "categoryId",
          r.service_name AS "serviceName",
          r.tags,
          r.location_type AS "locationType",
          r.date_option AS "dateOption",
          r.date_time AS "dateTime",
          r.budget,
          r.details,
          r.photo_urls AS "photoUrls",
          r.status,
          r.created_at AS "createdAt"
        FROM service_requests r
        LEFT JOIN cities c ON c.id = r.city_id
        LEFT JOIN districts d ON d.id = r.district_id
        WHERE r.id = $1
      `,
      [requestId]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('GET /api/requests/:id failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/requests/:id/responses', async (req, res) => {
  const requestId = Number(req.params.id)
  if (!Number.isInteger(requestId)) {
    res.status(400).json({ error: 'requestId_invalid' })
    return
  }

  const normalizedUserId = normalizeText(req.query.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const requestCheck = await pool.query(
      `SELECT user_id AS "userId" FROM service_requests WHERE id = $1`,
      [requestId]
    )
    if (requestCheck.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    if (requestCheck.rows[0].userId !== normalizedUserId) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const result = await pool.query(
      `
        SELECT
          rr.id,
          rr.request_id AS "requestId",
          rr.master_id AS "masterId",
          mp.display_name AS "displayName",
          mp.experience_years AS "experienceYears",
          mp.price_from AS "priceFrom",
          mp.price_to AS "priceTo",
          COALESCE(mp.avatar_path, u.avatar_url) AS "avatarPath",
          mp.portfolio_urls AS "portfolioUrls",
          COALESCE(ms.showcase_urls, '{}'::text[]) AS "showcaseUrls",
          rr.price,
          rr.comment,
          rr.proposed_time AS "proposedTime",
          rr.status,
          rr.created_at AS "createdAt",
          COALESCE(ch.id, legacy_ch.id) AS "chatId",
          COALESCE(mr.reviews_count, 0) AS "reviewsCount",
          COALESCE(mr.reviews_average, 0) AS "reviewsAverage"
        FROM request_responses rr
        LEFT JOIN master_profiles mp ON mp.user_id = rr.master_id
        LEFT JOIN users u ON u.user_id = rr.master_id
        LEFT JOIN master_showcases ms ON ms.user_id = rr.master_id
        LEFT JOIN LATERAL (
          SELECT ch.id
          FROM chat_contexts cc
          JOIN chats ch ON ch.id = cc.chat_id
          WHERE cc.context_type = 'request'
            AND cc.context_id = rr.request_id
            AND ch.master_id = rr.master_id
          ORDER BY ch.updated_at DESC NULLS LAST
          LIMIT 1
        ) ch ON true
        LEFT JOIN LATERAL (
          SELECT id
          FROM chats
          WHERE request_id = rr.request_id
            AND master_id = rr.master_id
            AND context_type = 'request'
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1
        ) legacy_ch ON true
        LEFT JOIN (
          SELECT
            master_id,
            COUNT(*)::int AS reviews_count,
            AVG(rating)::float AS reviews_average
          FROM master_reviews
          GROUP BY master_id
        ) mr ON mr.master_id = rr.master_id
        WHERE rr.request_id = $1
        ORDER BY rr.created_at DESC
      `,
      [requestId]
    )

    const payload = result.rows.map((row) => {
      const showcaseUrls = Array.isArray(row.showcaseUrls) ? row.showcaseUrls : []
      const portfolioUrls = Array.isArray(row.portfolioUrls) ? row.portfolioUrls : []
      const previewSource = showcaseUrls.length > 0 ? showcaseUrls : portfolioUrls
      const previewUrls = previewSource
        .map((value) => extractPortfolioUrl(value))
        .filter(Boolean)
        .slice(0, 3)
        .map((value) => resolvePublicUrl(req, value))
        .filter(Boolean)
      const average = Number(row.reviewsAverage)
      const reviewsAverage = Number.isFinite(average) ? average : 0
      const reviewsCount = Number.isFinite(Number(row.reviewsCount))
        ? Number(row.reviewsCount)
        : 0
      return {
        id: row.id,
        requestId: row.requestId,
        masterId: row.masterId,
        displayName: row.displayName,
        experienceYears: row.experienceYears,
        priceFrom: row.priceFrom,
        priceTo: row.priceTo,
        price: row.price,
        comment: row.comment,
        proposedTime: row.proposedTime,
        status: row.status,
        createdAt: row.createdAt,
        chatId: row.chatId ?? null,
        avatarUrl: resolvePublicUrl(req, row.avatarPath),
        reviewsAverage,
        reviewsCount,
        previewUrls,
      }
    })

    res.json(payload)
  } catch (error) {
    console.error('GET /api/requests/:id/responses failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/requests/:id/responses', async (req, res) => {
  const requestId = Number(req.params.id)
  if (!Number.isInteger(requestId)) {
    res.status(400).json({ error: 'requestId_invalid' })
    return
  }

  const { userId, price, comment, proposedTime } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedComment = normalizeText(comment)
  const normalizedProposedTime = normalizeText(proposedTime)
  const parsedPrice = parseOptionalInt(price)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (!normalizedComment && parsedPrice === null && !normalizedProposedTime) {
    res.status(400).json({ error: 'response_required' })
    return
  }

  try {
    const profile = await loadMasterProfile(normalizedUserId)
    if (!profile) {
      const summary = getProfileStatusSummary(null)
      res.status(409).json({ error: 'profile_incomplete', ...summary })
      return
    }

    const summary = getProfileStatusSummary(profile)
    if (profile.isActive === false) {
      res.status(409).json({ error: 'profile_paused', ...summary })
      return
    }
    if (!summary.isResponseReady) {
      res.status(409).json({ error: 'profile_incomplete', ...summary })
      return
    }

    const requestResult = await pool.query(
      `
        SELECT
          id,
          user_id AS "userId",
          city_id AS "cityId",
          district_id AS "districtId",
          category_id AS "categoryId",
          location_type AS "locationType",
          status
        FROM service_requests
        WHERE id = $1
      `,
      [requestId]
    )

    if (requestResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    const request = requestResult.rows[0]
    if (request.userId === normalizedUserId) {
      res.status(400).json({ error: 'self_response_not_allowed' })
      return
    }

    if (request.status !== 'open') {
      res.status(400).json({ error: 'request_closed' })
      return
    }

    const categoryAllowed =
      Array.isArray(profile.categories) &&
      profile.categories.includes(request.categoryId)
    if (!categoryAllowed) {
      res.status(403).json({ error: 'category_mismatch' })
      return
    }

    if (request.cityId !== profile.cityId || request.districtId !== profile.districtId) {
      res.status(403).json({ error: 'location_mismatch' })
      return
    }

    const acceptsClient = Boolean(profile.worksAtClient)
    const acceptsMaster = Boolean(profile.worksAtMaster)
    const locationType = request.locationType
    const locationAllowed =
      (locationType === 'client' && acceptsClient) ||
      (locationType === 'master' && acceptsMaster) ||
      (locationType === 'any' && (acceptsClient || acceptsMaster))

    if (!locationAllowed) {
      res.status(403).json({ error: 'location_type_mismatch' })
      return
    }

    const responseCheck = await pool.query(
      `
        SELECT id, status
        FROM request_responses
        WHERE request_id = $1
          AND master_id = $2
      `,
      [requestId, normalizedUserId]
    )
    const existingResponse = responseCheck.rows[0] ?? null

    const dispatchCheck = await pool.query(
      `
        SELECT status, expires_at AS "expiresAt"
        FROM request_dispatches
        WHERE request_id = $1
          AND master_id = $2
      `,
      [requestId, normalizedUserId]
    )
    const dispatch = dispatchCheck.rows[0] ?? null

    if (!dispatch && !existingResponse) {
      res.status(403).json({ error: 'not_assigned' })
      return
    }

    if (existingResponse && existingResponse.status !== 'sent') {
      res.status(409).json({ error: 'response_locked' })
      return
    }

    if (!existingResponse) {
      if (!dispatch || dispatch.status !== 'sent') {
        res.status(409).json({ error: 'response_window_closed' })
        return
      }

      const expiresAtMs = dispatch.expiresAt
        ? new Date(dispatch.expiresAt).getTime()
        : null
      if (!expiresAtMs || Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
        res.status(409).json({ error: 'response_window_closed' })
        return
      }
    }

    await ensureUser(normalizedUserId)

    const result = await pool.query(
      `
        INSERT INTO request_responses (
          request_id,
          master_id,
          price,
          comment,
          proposed_time,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'sent')
        ON CONFLICT (request_id, master_id) DO UPDATE
        SET price = EXCLUDED.price,
            comment = EXCLUDED.comment,
            proposed_time = EXCLUDED.proposed_time,
            status = 'sent',
            updated_at = NOW()
        RETURNING id, created_at AS "createdAt"
      `,
      [
        requestId,
        normalizedUserId,
        parsedPrice,
        normalizedComment || null,
        normalizedProposedTime || null,
      ]
    )

    await pool.query(
      `
        UPDATE request_dispatches
        SET status = 'responded',
            responded_at = NOW(),
            updated_at = NOW()
        WHERE request_id = $1
          AND master_id = $2
      `,
      [requestId, normalizedUserId]
    )

    res.json({ ok: true, id: result.rows[0]?.id, createdAt: result.rows[0]?.createdAt })
  } catch (error) {
    console.error('POST /api/requests/:id/responses failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.patch('/api/requests/:id/responses/:responseId', async (req, res) => {
  const requestId = Number(req.params.id)
  const responseId = Number(req.params.responseId)

  if (!Number.isInteger(requestId) || !Number.isInteger(responseId)) {
    res.status(400).json({ error: 'requestId_invalid' })
    return
  }

  const { userId, action } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedAction = normalizeText(action)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (!['accept', 'reject'].includes(normalizedAction)) {
    res.status(400).json({ error: 'action_invalid' })
    return
  }

  try {
    const requestResult = await pool.query(
      `
        SELECT
          user_id AS "userId",
          service_name AS "serviceName",
          status
        FROM service_requests
        WHERE id = $1
      `,
      [requestId]
    )

    if (requestResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    const request = requestResult.rows[0]
    if (request.userId !== normalizedUserId) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    if (request.status !== 'open') {
      res.status(409).json({ error: 'request_closed' })
      return
    }

    const responseResult = await pool.query(
      `
        SELECT
          id,
          master_id AS "masterId",
          status
        FROM request_responses
        WHERE id = $1
          AND request_id = $2
      `,
      [responseId, requestId]
    )

    if (responseResult.rows.length === 0) {
      res.status(404).json({ error: 'response_not_found' })
      return
    }

    const response = responseResult.rows[0]

    if (normalizedAction === 'accept') {
      if (response.status === 'rejected') {
        res.status(409).json({ error: 'response_rejected' })
        return
      }

      if (response.status !== 'accepted') {
        await pool.query(
          `
            UPDATE request_responses
            SET status = 'accepted',
                updated_at = NOW()
            WHERE id = $1
          `,
          [responseId]
        )

        await pool.query(
          `
            UPDATE request_responses
            SET status = 'rejected',
                updated_at = NOW()
            WHERE request_id = $1
              AND id <> $2
              AND status = 'sent'
          `,
          [requestId, responseId]
        )

        await pool.query(
          `
            UPDATE service_requests
            SET status = 'closed',
                updated_at = NOW()
            WHERE id = $1
          `,
          [requestId]
        )

        await pool.query(
          `
            UPDATE request_dispatches
            SET status = 'expired',
                updated_at = NOW()
            WHERE request_id = $1
              AND status = 'sent'
          `,
          [requestId]
        )
      }

      let chatId = null
      try {
        const chatPayload = await createChatForRequest({
          requestId,
          responseId,
          clientId: request.userId,
          masterId: response.masterId,
          serviceName: request.serviceName,
          actorId: normalizedUserId,
        })
        chatId = chatPayload?.chatId ?? null
        if (chatId) {
          void notifyChatMembers(chatId, {
            type: 'chat:created',
            chatId,
            requestId,
            responseId,
          })
          if (chatPayload?.systemMessage) {
            void notifyChatMembers(chatId, {
              type: 'message:new',
              chatId,
              message: chatPayload.systemMessage,
            })
          } else if (chatPayload?.systemMessageId) {
            void notifyChatMembers(chatId, {
              type: 'message:new',
              chatId,
              messageId: chatPayload.systemMessageId,
            })
          }
        }
      } catch (chatError) {
        console.error('Failed to create chat for request:', chatError)
      }

      res.json({
        ok: true,
        status: 'accepted',
        requestStatus: 'closed',
        chatId,
      })
      return
    }

    if (response.status === 'accepted') {
      res.status(409).json({ error: 'response_accepted' })
      return
    }

    if (response.status !== 'rejected') {
      await pool.query(
        `
          UPDATE request_responses
          SET status = 'rejected',
              updated_at = NOW()
          WHERE id = $1
        `,
        [responseId]
      )
    }

    res.json({ ok: true, status: 'rejected' })
  } catch (error) {
    console.error('PATCH /api/requests/:id/responses/:responseId failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/support/chat', async (req, res) => {
  const { userId } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (SUPPORT_AGENT_IDS.length === 0) {
    res.status(503).json({ error: 'support_unavailable' })
    return
  }

  try {
    const chatPayload = await createSupportChat({ userId: normalizedUserId })
    if (!chatPayload?.chatId) {
      res.status(500).json({ error: 'support_chat_failed' })
      return
    }

    if (chatPayload.isNew) {
      void notifyChatMembers(chatPayload.chatId, {
        type: 'chat:created',
        chatId: chatPayload.chatId,
        contextType: 'support',
      })
      if (chatPayload.systemMessage) {
        void notifyChatMembers(chatPayload.chatId, {
          type: 'message:new',
          chatId: chatPayload.chatId,
          message: chatPayload.systemMessage,
        })
      } else if (chatPayload.systemMessageId) {
        void notifyChatMembers(chatPayload.chatId, {
          type: 'message:new',
          chatId: chatPayload.chatId,
          messageId: chatPayload.systemMessageId,
        })
      }
    }

    res.json({ chatId: chatPayload.chatId, isNew: chatPayload.isNew })
  } catch (error) {
    console.error('POST /api/support/chat failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/chats', async (req, res) => {
  const normalizedUserId = normalizeText(req.query.userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          c.id,
          c.context_type AS "contextType",
          c.context_id AS "contextId",
          c.request_id AS "requestId",
          c.booking_id AS "bookingId",
          c.client_id AS "clientId",
          c.master_id AS "masterId",
          c.status,
          c.created_at AS "chatCreatedAt",
          c.updated_at AS "chatUpdatedAt",
          cm.role AS "memberRole",
          cm.unread_count AS "unreadCount",
          cm.last_read_message_id AS "lastReadMessageId",
          lm.id AS "lastMessageId",
          lm.sender_id AS "lastMessageSenderId",
          lm.type AS "lastMessageType",
          lm.body AS "lastMessageBody",
          lm.attachment_path AS "lastMessageAttachmentPath",
          lm.created_at AS "lastMessageCreatedAt",
          sr.service_name AS "serviceName",
          sr.category_id AS "categoryId",
          sr.location_type AS "locationType",
          sr.status AS "requestStatus",
          sr.date_option AS "requestDateOption",
          sr.date_time AS "requestDateTime",
          sr.created_at AS "requestCreatedAt",
          sb.service_name AS "bookingServiceName",
          sb.category_id AS "bookingCategoryId",
          sb.status AS "bookingStatus",
          sb.scheduled_at AS "bookingScheduledAt",
          sb.service_duration AS "bookingServiceDuration",
          sb.service_price AS "bookingServicePrice",
          sb.outcome AS "bookingOutcome",
          sb.late_minutes AS "bookingLateMinutes",
          sb.created_at AS "bookingCreatedAt",
          mp.display_name AS "masterName",
          COALESCE(mp.avatar_path, um.avatar_url) AS "masterAvatarPath",
          u.first_name AS "clientFirstName",
          u.last_name AS "clientLastName",
          u.username AS "clientUsername",
          cts.score AS "clientTrustScore",
          cts.confidence AS "clientTrustConfidence",
          cts.updated_at AS "clientTrustUpdatedAt"
        FROM chat_members cm
        JOIN chats c ON c.id = cm.chat_id
        LEFT JOIN LATERAL (
          SELECT
            id,
            sender_id,
            type,
            body,
            attachment_path,
            created_at
          FROM chat_messages
          WHERE chat_id = c.id
            AND (
              cm.role = 'master'
              OR COALESCE(meta->>'visibility', meta->>'audience', '') <> 'master_only'
            )
          ORDER BY id DESC
          LIMIT 1
        ) lm ON true
        LEFT JOIN service_requests sr ON sr.id = c.request_id
        LEFT JOIN service_bookings sb ON sb.id = c.booking_id
        LEFT JOIN master_profiles mp ON mp.user_id = c.master_id
        LEFT JOIN users um ON um.user_id = c.master_id
        LEFT JOIN users u ON u.user_id = c.client_id
        LEFT JOIN client_trust_scores cts ON cts.user_id = c.client_id
        WHERE cm.user_id = $1
        ORDER BY lm.created_at DESC NULLS LAST, c.updated_at DESC
      `,
      [normalizedUserId]
    )

    const payload = result.rows.map((row) => {
      const isClient = row.clientId === normalizedUserId
      const isSupportChat = row.contextType === 'support'
      const counterpartTrust = !isClient
        ? buildTrustPayload(row, {
            scoreKey: 'clientTrustScore',
            confidenceKey: 'clientTrustConfidence',
            updatedAtKey: 'clientTrustUpdatedAt',
          })
        : null
      const counterpartName = isSupportChat
        ? isClient
          ? 'Поддержка'
          : formatUserDisplayName(
              row.clientFirstName,
              row.clientLastName,
              row.clientUsername,
              'Клиент'
            )
        : isClient
          ? row.masterName || 'Мастер'
          : formatUserDisplayName(
              row.clientFirstName,
              row.clientLastName,
              row.clientUsername,
              'Клиент'
            )
      const counterpartAvatarUrl =
        isSupportChat || !isClient
          ? null
          : buildPublicUrl(req, row.masterAvatarPath)
      const lastMessageText =
        row.lastMessageBody ||
        (row.lastMessageType === 'image'
          ? 'Фото'
          : row.lastMessageType === 'system'
            ? 'Системное сообщение'
            : '')
      const serviceName = row.serviceName || row.bookingServiceName || ''
      const categoryId = row.categoryId || row.bookingCategoryId || null
      const activeRequest =
        row.contextType === 'request' && row.requestId
          ? {
              id: row.requestId,
              serviceName,
              categoryId,
              locationType: row.locationType,
              status: row.requestStatus,
              dateOption: row.requestDateOption,
              dateTime: row.requestDateTime,
              createdAt: row.requestCreatedAt,
            }
          : null
      const activeBooking =
        row.contextType === 'booking' && row.bookingId
          ? {
              id: row.bookingId,
              serviceName,
              categoryId,
              status: row.bookingStatus,
              scheduledAt: row.bookingScheduledAt,
              serviceDuration: row.bookingServiceDuration,
              servicePrice: row.bookingServicePrice,
              outcome: row.bookingOutcome,
              lateMinutes: row.bookingLateMinutes,
              createdAt: row.bookingCreatedAt,
            }
          : null

      return {
        id: row.id,
        contextType: row.contextType,
        contextId: row.contextId,
        requestId: row.requestId,
        bookingId: row.bookingId,
        status: row.status,
        unreadCount: Number(row.unreadCount) || 0,
        lastReadMessageId: row.lastReadMessageId ?? null,
        lastMessage: row.lastMessageId
          ? {
              id: row.lastMessageId,
              senderId: row.lastMessageSenderId,
              type: row.lastMessageType,
              body: lastMessageText,
              createdAt: row.lastMessageCreatedAt,
              attachmentUrl: buildPublicUrl(req, row.lastMessageAttachmentPath),
            }
          : null,
        counterpart: {
          id: isClient ? row.masterId : row.clientId,
          role: isClient ? 'master' : 'client',
          name: counterpartName,
          avatarUrl: counterpartAvatarUrl,
          trust: counterpartTrust ?? undefined,
        },
        request: activeRequest,
        booking: activeBooking,
      }
    })

    const chatIds = payload.map((item) => item.id).filter((id) => Number.isInteger(id))
    if (chatIds.length > 0) {
      const contextsResult = await pool.query(
        `
          SELECT
            cc.chat_id AS "chatId",
            cc.context_type AS "contextType",
            cc.context_id AS "contextId",
            cc.created_at AS "contextCreatedAt",
            sr.service_name AS "requestServiceName",
            sr.status AS "requestStatus",
            sr.location_type AS "requestLocationType",
            sr.date_option AS "requestDateOption",
            sr.date_time AS "requestDateTime",
            sr.created_at AS "requestCreatedAt",
            sb.service_name AS "bookingServiceName",
            sb.status AS "bookingStatus",
            sb.scheduled_at AS "bookingScheduledAt",
            sb.service_duration AS "bookingServiceDuration",
            sb.service_price AS "bookingServicePrice",
            sb.outcome AS "bookingOutcome",
            sb.late_minutes AS "bookingLateMinutes",
            sb.created_at AS "bookingCreatedAt"
          FROM chat_contexts cc
          LEFT JOIN service_requests sr ON sr.id = cc.request_id
          LEFT JOIN service_bookings sb ON sb.id = cc.booking_id
          WHERE cc.chat_id = ANY($1::int[])
          ORDER BY cc.created_at DESC
        `,
        [chatIds]
      )
      const contextsByChatId = new Map()
      contextsResult.rows.forEach((row) => {
        const context =
          row.contextType === 'booking'
            ? {
                contextType: 'booking',
                contextId: row.contextId,
                serviceName: row.bookingServiceName ?? null,
                status: row.bookingStatus ?? null,
                scheduledAt: row.bookingScheduledAt ?? null,
                serviceDuration: row.bookingServiceDuration ?? null,
                servicePrice: row.bookingServicePrice ?? null,
                outcome: row.bookingOutcome ?? null,
                lateMinutes: row.bookingLateMinutes ?? null,
                createdAt: row.contextCreatedAt ?? row.bookingCreatedAt ?? null,
              }
            : {
                contextType: 'request',
                contextId: row.contextId,
                serviceName: row.requestServiceName ?? null,
                status: row.requestStatus ?? null,
                locationType: row.requestLocationType ?? null,
                dateOption: row.requestDateOption ?? null,
                dateTime: row.requestDateTime ?? null,
                createdAt: row.contextCreatedAt ?? row.requestCreatedAt ?? null,
              }
        const bucket = contextsByChatId.get(row.chatId) ?? []
        bucket.push(context)
        contextsByChatId.set(row.chatId, bucket)
      })
      payload.forEach((item) => {
        const contexts = contextsByChatId.get(item.id) ?? []
        if (contexts.length === 0) {
          if (item.request) {
            contexts.push({
              contextType: 'request',
              contextId: item.request.id,
              serviceName: item.request.serviceName ?? null,
              status: item.request.status ?? null,
              locationType: item.request.locationType ?? null,
              dateOption: item.request.dateOption ?? null,
              dateTime: item.request.dateTime ?? null,
              createdAt: item.request.createdAt ?? null,
            })
          } else if (item.booking) {
            contexts.push({
              contextType: 'booking',
              contextId: item.booking.id,
              serviceName: item.booking.serviceName ?? null,
              status: item.booking.status ?? null,
              scheduledAt: item.booking.scheduledAt ?? null,
              serviceDuration: item.booking.serviceDuration ?? null,
              servicePrice: item.booking.servicePrice ?? null,
              outcome: item.booking.outcome ?? null,
              lateMinutes: item.booking.lateMinutes ?? null,
              createdAt: item.booking.createdAt ?? null,
            })
          }
        }
        item.contexts = contexts.slice(0, 6)
      })
    } else {
      payload.forEach((item) => {
        if (item.request) {
          item.contexts = [
            {
              contextType: 'request',
              contextId: item.request.id,
              serviceName: item.request.serviceName ?? null,
              status: item.request.status ?? null,
              locationType: item.request.locationType ?? null,
              dateOption: item.request.dateOption ?? null,
              dateTime: item.request.dateTime ?? null,
              createdAt: item.request.createdAt ?? null,
            },
          ]
        } else if (item.booking) {
          item.contexts = [
            {
              contextType: 'booking',
              contextId: item.booking.id,
              serviceName: item.booking.serviceName ?? null,
              status: item.booking.status ?? null,
              scheduledAt: item.booking.scheduledAt ?? null,
              serviceDuration: item.booking.serviceDuration ?? null,
              servicePrice: item.booking.servicePrice ?? null,
              outcome: item.booking.outcome ?? null,
              lateMinutes: item.booking.lateMinutes ?? null,
              createdAt: item.booking.createdAt ?? null,
            },
          ]
        }
      })
    }

    res.json(payload)
  } catch (error) {
    console.error('GET /api/chats failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/chats/:id', async (req, res) => {
  const chatId = Number(req.params.id)
  if (!Number.isInteger(chatId)) {
    res.status(400).json({ error: 'chatId_invalid' })
    return
  }

  const normalizedUserId = normalizeText(req.query.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const access = await loadChatAccess(chatId, normalizedUserId)
    if (!access) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const detailResult = await pool.query(
      `
        SELECT
          c.id,
          c.context_type AS "contextType",
          c.context_id AS "contextId",
          c.request_id AS "requestId",
          c.booking_id AS "bookingId",
          c.client_id AS "clientId",
          c.master_id AS "masterId",
          c.status,
          c.last_message_id AS "lastMessageId",
          c.last_message_at AS "lastMessageAt",
          sr.service_name AS "serviceName",
          sr.category_id AS "categoryId",
          sr.location_type AS "locationType",
          sr.date_option AS "dateOption",
          sr.date_time AS "dateTime",
          sr.budget,
          sr.details,
          sr.photo_urls AS "photoUrls",
          sr.status AS "requestStatus",
          sr.created_at AS "requestCreatedAt",
          sb.service_name AS "bookingServiceName",
          sb.category_id AS "bookingCategoryId",
          sb.location_type AS "bookingLocationType",
          sb.scheduled_at AS "bookingScheduledAt",
          sb.service_duration AS "bookingServiceDuration",
          sb.service_price AS "bookingServicePrice",
          sb.status AS "bookingStatus",
          sb.outcome AS "bookingOutcome",
          sb.late_minutes AS "bookingLateMinutes",
          sb.attendance_at AS "bookingAttendanceAt",
          sb.created_at AS "bookingCreatedAt",
          mp.display_name AS "masterName",
          COALESCE(mp.avatar_path, um.avatar_url) AS "masterAvatarPath",
          u.first_name AS "clientFirstName",
          u.last_name AS "clientLastName",
          u.username AS "clientUsername",
          cts.score AS "clientTrustScore",
          cts.confidence AS "clientTrustConfidence",
          cts.updated_at AS "clientTrustUpdatedAt"
        FROM chats c
        LEFT JOIN service_requests sr ON sr.id = c.request_id
        LEFT JOIN service_bookings sb ON sb.id = c.booking_id
        LEFT JOIN master_profiles mp ON mp.user_id = c.master_id
        LEFT JOIN users um ON um.user_id = c.master_id
        LEFT JOIN users u ON u.user_id = c.client_id
        LEFT JOIN client_trust_scores cts ON cts.user_id = c.client_id
        WHERE c.id = $1
      `,
      [chatId]
    )

    const row = detailResult.rows[0]
    if (!row) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    const counterpartReadResult = await pool.query(
      `
        SELECT last_read_message_id AS "lastReadMessageId"
        FROM chat_members
        WHERE chat_id = $1
          AND user_id <> $2
        ORDER BY id ASC
        LIMIT 1
      `,
      [chatId, normalizedUserId]
    )
    const counterpartLastReadMessageId =
      counterpartReadResult.rows[0]?.lastReadMessageId ?? null

    const isClient = row.clientId === normalizedUserId
    const isSupportChat = row.contextType === 'support'
    const counterpartTrust = !isClient
      ? buildTrustPayload(row, {
          scoreKey: 'clientTrustScore',
          confidenceKey: 'clientTrustConfidence',
          updatedAtKey: 'clientTrustUpdatedAt',
        })
      : null
    const counterpartName = isSupportChat
      ? isClient
        ? 'Поддержка'
        : formatUserDisplayName(
            row.clientFirstName,
            row.clientLastName,
            row.clientUsername,
            'Клиент'
          )
      : isClient
        ? row.masterName || 'Мастер'
        : formatUserDisplayName(
            row.clientFirstName,
            row.clientLastName,
            row.clientUsername,
            'Клиент'
          )

    const contextsResult = await pool.query(
      `
        SELECT
          cc.context_type AS "contextType",
          cc.context_id AS "contextId",
          cc.created_at AS "contextCreatedAt",
          sr.service_name AS "requestServiceName",
          sr.status AS "requestStatus",
          sr.location_type AS "requestLocationType",
          sr.date_option AS "requestDateOption",
          sr.date_time AS "requestDateTime",
          sr.created_at AS "requestCreatedAt",
          sb.service_name AS "bookingServiceName",
          sb.status AS "bookingStatus",
          sb.scheduled_at AS "bookingScheduledAt",
          sb.service_duration AS "bookingServiceDuration",
          sb.service_price AS "bookingServicePrice",
          sb.outcome AS "bookingOutcome",
          sb.late_minutes AS "bookingLateMinutes",
          sb.created_at AS "bookingCreatedAt"
        FROM chat_contexts cc
        LEFT JOIN service_requests sr ON sr.id = cc.request_id
        LEFT JOIN service_bookings sb ON sb.id = cc.booking_id
        WHERE cc.chat_id = $1
        ORDER BY cc.created_at DESC
      `,
      [chatId]
    )
    const contexts = contextsResult.rows.map((contextRow) =>
      contextRow.contextType === 'booking'
        ? {
            contextType: 'booking',
            contextId: contextRow.contextId,
            serviceName: contextRow.bookingServiceName ?? null,
            status: contextRow.bookingStatus ?? null,
            scheduledAt: contextRow.bookingScheduledAt ?? null,
            serviceDuration: contextRow.bookingServiceDuration ?? null,
            servicePrice: contextRow.bookingServicePrice ?? null,
            outcome: contextRow.bookingOutcome ?? null,
            lateMinutes: contextRow.bookingLateMinutes ?? null,
            createdAt:
              contextRow.contextCreatedAt ?? contextRow.bookingCreatedAt ?? null,
          }
        : {
            contextType: 'request',
            contextId: contextRow.contextId,
            serviceName: contextRow.requestServiceName ?? null,
            status: contextRow.requestStatus ?? null,
            locationType: contextRow.requestLocationType ?? null,
            dateOption: contextRow.requestDateOption ?? null,
            dateTime: contextRow.requestDateTime ?? null,
            createdAt:
              contextRow.contextCreatedAt ?? contextRow.requestCreatedAt ?? null,
          }
    )

    if (contexts.length === 0) {
      if (row.requestId) {
        contexts.push({
          contextType: 'request',
          contextId: row.requestId,
          serviceName: row.serviceName ?? null,
          status: row.requestStatus ?? null,
          locationType: row.locationType ?? null,
          dateOption: row.dateOption ?? null,
          dateTime: row.dateTime ?? null,
          createdAt: row.requestCreatedAt ?? null,
        })
      } else if (row.bookingId) {
        contexts.push({
          contextType: 'booking',
          contextId: row.bookingId,
          serviceName: row.bookingServiceName ?? null,
          status: row.bookingStatus ?? null,
          scheduledAt: row.bookingScheduledAt ?? null,
          serviceDuration: row.bookingServiceDuration ?? null,
          servicePrice: row.bookingServicePrice ?? null,
          outcome: row.bookingOutcome ?? null,
          lateMinutes: row.bookingLateMinutes ?? null,
          createdAt: row.bookingCreatedAt ?? null,
        })
      }
    }

    res.json({
      chat: {
        id: row.id,
        contextType: row.contextType,
        contextId: row.contextId,
        requestId: row.requestId,
        bookingId: row.bookingId,
        status: row.status,
        lastMessageId: row.lastMessageId ?? null,
        lastMessageAt: row.lastMessageAt ?? null,
        memberRole: access.memberRole,
        unreadCount: Number(access.unreadCount) || 0,
        lastReadMessageId: access.lastReadMessageId ?? null,
        counterpartLastReadMessageId,
      },
      counterpart: {
        id: isClient ? row.masterId : row.clientId,
        role: isClient ? 'master' : 'client',
        name: counterpartName,
        avatarUrl:
          isSupportChat || !isClient
            ? null
            : buildPublicUrl(req, row.masterAvatarPath),
        trust: counterpartTrust ?? undefined,
      },
      request:
        row.contextType === 'request' && row.requestId
          ? {
              id: row.requestId,
              serviceName: row.serviceName,
              categoryId: row.categoryId,
              locationType: row.locationType,
              dateOption: row.dateOption,
              dateTime: row.dateTime,
              budget: row.budget,
              details: row.details,
              photoUrls: Array.isArray(row.photoUrls) ? row.photoUrls : [],
              status: row.requestStatus,
              createdAt: row.requestCreatedAt,
            }
          : null,
      booking:
        row.contextType === 'booking' && row.bookingId
          ? {
              id: row.bookingId,
              serviceName: row.bookingServiceName,
              categoryId: row.bookingCategoryId,
              locationType: row.bookingLocationType,
              scheduledAt: row.bookingScheduledAt,
              serviceDuration: row.bookingServiceDuration,
              servicePrice: row.bookingServicePrice,
              status: row.bookingStatus,
              outcome: row.bookingOutcome,
              lateMinutes: row.bookingLateMinutes,
              attendanceAt: row.bookingAttendanceAt,
              createdAt: row.bookingCreatedAt,
            }
          : null,
      contexts,
    })
  } catch (error) {
    console.error('GET /api/chats/:id failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/chats/:id/messages', async (req, res) => {
  const chatId = Number(req.params.id)
  if (!Number.isInteger(chatId)) {
    res.status(400).json({ error: 'chatId_invalid' })
    return
  }

  const normalizedUserId = normalizeText(req.query.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const beforeId = parseOptionalInt(req.query.beforeId)
  const rawLimit = parseOptionalInt(req.query.limit)
  const limit =
    rawLimit && rawLimit > 0
      ? Math.min(rawLimit, CHAT_MESSAGE_MAX_LIMIT)
      : CHAT_MESSAGE_DEFAULT_LIMIT

  try {
    const access = await loadChatAccess(chatId, normalizedUserId)
    if (!access) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const isMasterViewer = access.memberRole === 'master'
    const result = await pool.query(
      `
        SELECT
          id,
          chat_id AS "chatId",
          sender_id AS "senderId",
          type,
          body,
          meta,
          attachment_path AS "attachmentPath",
          created_at AS "createdAt"
        FROM chat_messages
        WHERE chat_id = $1
          AND ($2::int IS NULL OR id < $2)
          AND (
            $3::boolean
            OR COALESCE(meta->>'visibility', meta->>'audience', '') <> 'master_only'
          )
        ORDER BY id DESC
        LIMIT $4
      `,
      [chatId, beforeId, isMasterViewer, limit]
    )

    const items = result.rows
      .map((row) => ({
        id: row.id,
        chatId: row.chatId,
        senderId: row.senderId,
        type: row.type,
        body: row.body,
        meta: safeJson(row.meta),
        attachmentUrl: buildPublicUrl(req, row.attachmentPath),
        createdAt: row.createdAt,
      }))
      .reverse()

    res.json({ items })
  } catch (error) {
    console.error('GET /api/chats/:id/messages failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/chats/:id/messages', async (req, res) => {
  const chatId = Number(req.params.id)
  if (!Number.isInteger(chatId)) {
    res.status(400).json({ error: 'chatId_invalid' })
    return
  }

  const { userId, type, body, meta, attachmentPath, attachmentUrl } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const normalizedType = normalizeText(type) || 'text'
  if (!chatMessageTypes.has(normalizedType)) {
    res.status(400).json({ error: 'type_invalid' })
    return
  }
  if (normalizedType === 'system') {
    res.status(403).json({ error: 'type_forbidden' })
    return
  }

  const normalizedBody = normalizeText(body)
  const metaPayload = safeJson(meta) ?? (typeof meta === 'object' ? meta : null)

  const rawAttachmentPath = normalizeText(attachmentPath || attachmentUrl)
  const normalizedAttachmentPath = rawAttachmentPath
    ? normalizeUploadPath(rawAttachmentPath)
    : ''

  if (normalizedType === 'text' && !normalizedBody) {
    res.status(400).json({ error: 'message_required' })
    return
  }
  if (normalizedType === 'image' && !normalizedAttachmentPath) {
    res.status(400).json({ error: 'attachment_required' })
    return
  }
  if (
    ['offer_price', 'offer_time', 'offer_location'].includes(normalizedType) &&
    !normalizedBody &&
    !metaPayload
  ) {
    res.status(400).json({ error: 'message_required' })
    return
  }

  if (normalizedAttachmentPath) {
    const safeUserId = sanitizePathSegment(normalizedUserId)
    if (!isSafeChatUploadPath(safeUserId, normalizedAttachmentPath)) {
      res.status(403).json({ error: 'attachment_forbidden' })
      return
    }
  }

  let transactionStarted = false
  try {
    const access = await loadChatAccess(chatId, normalizedUserId)
    if (!access) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    await ensureUser(normalizedUserId)

    await pool.query('BEGIN')
    transactionStarted = true
    const insertResult = await pool.query(
      `
        INSERT INTO chat_messages (chat_id, sender_id, type, body, meta, attachment_path)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at AS "createdAt"
      `,
      [
        chatId,
        normalizedUserId,
        normalizedType,
        normalizedBody || null,
        metaPayload ?? null,
        normalizedAttachmentPath || null,
      ]
    )
    const messageId = insertResult.rows[0]?.id
    const createdAt = insertResult.rows[0]?.createdAt ?? null

    if (!messageId) {
      throw new Error('message_insert_failed')
    }

    await pool.query(
      `
        UPDATE chats
        SET last_message_id = $2,
            last_message_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [chatId, messageId]
    )

    await pool.query(
      `
        UPDATE chat_members
        SET unread_count = CASE
              WHEN user_id = $2 THEN 0
              ELSE unread_count + 1
            END,
            last_read_message_id = CASE
              WHEN user_id = $2 THEN $3
              ELSE last_read_message_id
            END,
            updated_at = NOW()
        WHERE chat_id = $1
      `,
      [chatId, normalizedUserId, messageId]
    )

    await pool.query('COMMIT')

    const messagePayload = {
      id: messageId,
      chatId,
      senderId: normalizedUserId,
      type: normalizedType,
      body: normalizedBody || null,
      meta: metaPayload ?? null,
      attachmentUrl: buildPublicUrl(req, normalizedAttachmentPath),
      createdAt,
    }

    void notifyChatMembers(chatId, {
      type: 'message:new',
      chatId,
      message: messagePayload,
    })
    const previewText =
      normalizedType === 'image'
        ? 'Фото'
        : normalizedBody || (normalizedType.startsWith('offer_') ? 'Новое предложение' : '')
    if (previewText) {
      void sendChatNotification({
        chatId,
        senderId: normalizedUserId,
        preview: previewText,
      })
    }

    res.json(messagePayload)
  } catch (error) {
    if (transactionStarted) {
      await pool.query('ROLLBACK')
    }
    console.error('POST /api/chats/:id/messages failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/chats/:id/read', async (req, res) => {
  const chatId = Number(req.params.id)
  if (!Number.isInteger(chatId)) {
    res.status(400).json({ error: 'chatId_invalid' })
    return
  }

  const { userId, messageId } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const parsedMessageId = parseOptionalInt(messageId)

  try {
    const access = await loadChatAccess(chatId, normalizedUserId)
    if (!access) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    let targetMessageId = parsedMessageId ?? access.lastMessageId
    if (targetMessageId) {
      const messageCheck = await pool.query(
        `
          SELECT id
          FROM chat_messages
          WHERE id = $1
            AND chat_id = $2
        `,
        [targetMessageId, chatId]
      )
      if (messageCheck.rows.length === 0) {
        res.status(404).json({ error: 'message_not_found' })
        return
      }
    }

    if (!targetMessageId) {
      res.json({ ok: true })
      return
    }

    await pool.query(
      `
        UPDATE chat_members
        SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), $3),
            unread_count = 0,
            updated_at = NOW()
        WHERE chat_id = $1
          AND user_id = $2
      `,
      [chatId, normalizedUserId, targetMessageId]
    )

    void notifyChatMembers(chatId, {
      type: 'chat:read',
      chatId,
      userId: normalizedUserId,
      messageId: targetMessageId,
    })

    res.json({ ok: true })
  } catch (error) {
    console.error('POST /api/chats/:id/read failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/chats/:id/attachments', async (req, res) => {
  const chatId = Number(req.params.id)
  if (!Number.isInteger(chatId)) {
    res.status(400).json({ error: 'chatId_invalid' })
    return
  }

  const { userId, dataUrl } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const access = await loadChatAccess(chatId, normalizedUserId)
    if (!access) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const parsedImage = parseImageDataUrl(dataUrl)
    if (!parsedImage) {
      res.status(400).json({ error: 'image_invalid' })
      return
    }

    if (parsedImage.buffer.length > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: 'image_too_large' })
      return
    }

    const safeUserId = sanitizePathSegment(normalizedUserId)
    const { relativePath, absolutePath } = buildChatUploadPath(
      safeUserId,
      parsedImage.mime
    )
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, parsedImage.buffer)

    res.json({
      ok: true,
      url: buildPublicUrl(req, relativePath),
      path: relativePath,
    })
  } catch (error) {
    console.error('POST /api/chats/:id/attachments failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/requests', async (req, res) => {
  const {
    userId,
    cityId,
    districtId,
    address,
    categoryId,
    serviceName,
    tags,
    locationType,
    dateOption,
    dateTime,
    budget,
    details,
    photoUrls,
  } = req.body ?? {}

  const normalizedUserId = normalizeText(userId)
  const normalizedCategoryId = normalizeText(categoryId)
  const normalizedServiceName = normalizeText(serviceName)
  const normalizedLocationType = normalizeText(locationType)
  const normalizedDateOption = normalizeText(dateOption)
  const normalizedAddress = normalizeText(address)
  const normalizedBudget = normalizeText(budget)
  const normalizedDetails = normalizeText(details)
  const tagList = normalizeStringArray(tags)
  const photoList = normalizeStringArray(photoUrls)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (!normalizedCategoryId || !normalizedServiceName) {
    res.status(400).json({ error: 'service_required' })
    return
  }

  if (!['client', 'master', 'any'].includes(normalizedLocationType)) {
    res.status(400).json({ error: 'locationType_invalid' })
    return
  }

  if (!['today', 'tomorrow', 'choose'].includes(normalizedDateOption)) {
    res.status(400).json({ error: 'dateOption_invalid' })
    return
  }

  const parsedCityId = Number(cityId)
  const parsedDistrictId = Number(districtId)
  if (!Number.isInteger(parsedCityId) || !Number.isInteger(parsedDistrictId)) {
    res.status(400).json({ error: 'location_required' })
    return
  }

  let parsedDateTime = null
  if (normalizedDateOption === 'choose') {
    if (!normalizeText(dateTime)) {
      res.status(400).json({ error: 'dateTime_required' })
      return
    }
    const parsedValue = new Date(dateTime)
    if (Number.isNaN(parsedValue.getTime())) {
      res.status(400).json({ error: 'dateTime_invalid' })
      return
    }
    parsedDateTime = parsedValue.toISOString()
  }

  try {
    await ensureUser(normalizedUserId)

    const cityCheck = await pool.query(`SELECT id FROM cities WHERE id = $1`, [
      parsedCityId,
    ])
    if (cityCheck.rows.length === 0) {
      res.status(400).json({ error: 'city_not_found' })
      return
    }

    const districtCheck = await pool.query(
      `SELECT id FROM districts WHERE id = $1 AND city_id = $2`,
      [parsedDistrictId, parsedCityId]
    )
    if (districtCheck.rows.length === 0) {
      res.status(400).json({ error: 'district_not_found' })
      return
    }

    const result = await pool.query(
      `
        INSERT INTO service_requests (
          user_id,
          city_id,
          district_id,
          address,
          category_id,
          service_name,
          tags,
          location_type,
          date_option,
          date_time,
          budget,
          details,
          photo_urls
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, created_at AS "createdAt"
      `,
      [
        normalizedUserId,
        parsedCityId,
        parsedDistrictId,
        normalizedAddress || null,
        normalizedCategoryId,
        normalizedServiceName,
        tagList,
        normalizedLocationType,
        normalizedDateOption,
        parsedDateTime,
        normalizedBudget || null,
        normalizedDetails || null,
        photoList,
      ]
    )

    const requestId = result.rows[0]?.id
    let dispatchInfo = { dispatched: 0, expiresAt: null }

    if (requestId) {
      try {
        dispatchInfo = await dispatchRequestBatch(
          {
            id: requestId,
            userId: normalizedUserId,
            cityId: parsedCityId,
            districtId: parsedDistrictId,
            categoryId: normalizedCategoryId,
            locationType: normalizedLocationType,
            dateOption: normalizedDateOption,
            dateTime: parsedDateTime,
            status: 'open',
          },
          REQUEST_INITIAL_BATCH_SIZE,
          1
        )
      } catch (dispatchError) {
        console.error('Initial request dispatch failed:', dispatchError)
      }
    }

    res.json({
      ok: true,
      id: requestId,
      createdAt: result.rows[0]?.createdAt,
      dispatchedCount: dispatchInfo.dispatched,
      dispatchExpiresAt: dispatchInfo.expiresAt,
    })
  } catch (error) {
    console.error('POST /api/requests failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

const backfillClientTrustScores = async () => {
  const affectedUsers = new Set()
  let insertedEvents = 0

  const trackEvent = async (payload) => {
    const result = await logClientTrustEvent({
      ...payload,
      skipRefresh: true,
    })
    if (result.inserted) {
      insertedEvents += 1
      affectedUsers.add(payload.userId)
    }
  }

  const completedBookings = await pool.query(
    `
      SELECT
        id,
        client_id AS "clientId",
        scheduled_at AS "scheduledAt"
      FROM service_bookings
      WHERE status = 'confirmed'
        AND scheduled_at < NOW()
        AND (outcome IS NULL OR outcome IN ('completed', 'on_time'))
    `
  )

  for (const row of completedBookings.rows) {
    await trackEvent({
      userId: row.clientId,
      eventType: 'visit_on_time',
      meta: {
        ref: `booking:${row.id}`,
        bookingId: row.id,
        scheduledAt: row.scheduledAt,
      },
      occurredAt: row.scheduledAt,
    })
  }

  const lateBookings = await pool.query(
    `
      SELECT
        id,
        client_id AS "clientId",
        scheduled_at AS "scheduledAt",
        updated_at AS "updatedAt",
        late_minutes AS "lateMinutes"
      FROM service_bookings
      WHERE outcome = 'late'
    `
  )

  for (const row of lateBookings.rows) {
    await trackEvent({
      userId: row.clientId,
      eventType: 'visit_late',
      meta: {
        ref: `booking:${row.id}`,
        bookingId: row.id,
        scheduledAt: row.scheduledAt,
        lateMinutes: row.lateMinutes,
      },
      occurredAt: row.updatedAt,
    })
  }

  const cancelledBookings = await pool.query(
    `
      SELECT
        id,
        client_id AS "clientId",
        scheduled_at AS "scheduledAt",
        cancelled_at AS "cancelledAt"
      FROM service_bookings
      WHERE status = 'cancelled'
        AND cancelled_by = 'client'
        AND cancelled_at IS NOT NULL
    `
  )

  for (const row of cancelledBookings.rows) {
    await trackEvent({
      userId: row.clientId,
      eventType: 'visit_rescheduled',
      meta: {
        ref: `booking:${row.id}`,
        bookingId: row.id,
        scheduledAt: row.scheduledAt,
      },
      occurredAt: row.cancelledAt,
    })
  }

  const lateCancelBookings = await pool.query(
    `
      SELECT
        id,
        client_id AS "clientId",
        scheduled_at AS "scheduledAt",
        COALESCE(cancelled_at, updated_at) AS "eventAt"
      FROM service_bookings
      WHERE outcome = 'late_cancel'
    `
  )

  for (const row of lateCancelBookings.rows) {
    await trackEvent({
      userId: row.clientId,
      eventType: 'visit_rescheduled',
      meta: {
        ref: `booking:${row.id}`,
        bookingId: row.id,
        scheduledAt: row.scheduledAt,
        source: 'outcome',
      },
      occurredAt: row.eventAt,
    })
  }

  const noShowBookings = await pool.query(
    `
      SELECT
        id,
        client_id AS "clientId",
        scheduled_at AS "scheduledAt",
        updated_at AS "updatedAt"
      FROM service_bookings
      WHERE outcome = 'no_show'
    `
  )

  for (const row of noShowBookings.rows) {
    await trackEvent({
      userId: row.clientId,
      eventType: 'visit_no_show',
      meta: {
        ref: `booking:${row.id}`,
        bookingId: row.id,
        scheduledAt: row.scheduledAt,
      },
      occurredAt: row.updatedAt,
    })
  }

  for (const userId of affectedUsers) {
    await refreshClientTrustScore(userId)
  }

  return {
    insertedEvents,
    usersUpdated: affectedUsers.size,
  }
}

const start = async () => {
  const normalizedTrustBackfill = normalizeText(process.env.TRUST_BACKFILL)
  const shouldBackfillTrust =
    normalizedTrustBackfill === '1' || normalizedTrustBackfill.toLowerCase() === 'true'

  await ensureSchema()
  await seedLocations()
  await fs.mkdir(uploadsRoot, { recursive: true })

  if (shouldBackfillTrust) {
    try {
      console.log('Running trust backfill...')
      const summary = await backfillClientTrustScores()
      console.log('Trust backfill complete:', summary)
    } catch (error) {
      console.error('Trust backfill failed:', error)
    }
  }

  const server = app.listen(port, () => {
    console.log(`API listening on :${port}`)
  })
  const wss = new WebSocketServer({ server, path: CHAT_STREAM_PATH })
  wss.on('connection', (ws, req) => {
    try {
      const baseUrl = `http://${req.headers.host ?? 'localhost'}`
      const url = new URL(req.url ?? '', baseUrl)
      const userId = normalizeText(url.searchParams.get('userId'))
      if (!userId) {
        ws.close(1008, 'userId_required')
        return
      }
      ws.userId = userId
      registerChatClient(userId, ws)
      ws.send(JSON.stringify({ type: 'connected', userId }))

      ws.on('message', async (payload) => {
        try {
          const text = payload.toString()
          const parsed = JSON.parse(text)
          if (parsed?.type !== 'typing') return
          const chatId = parseOptionalInt(parsed.chatId)
          const isTyping = Boolean(parsed.isTyping)
          const actorId = normalizeText(ws.userId)
          if (!chatId || !actorId) return
          const access = await loadChatAccess(chatId, actorId)
          if (!access) return
          void notifyChatMembers(
            chatId,
            { type: 'typing', chatId, userId: actorId, isTyping },
            actorId
          )
        } catch (error) {
          console.error('Chat stream message failed:', error)
        }
      })
    } catch (error) {
      ws.close(1011, 'server_error')
    }
  })
  void runRequestDispatchCycle()
  setInterval(() => {
    void runRequestDispatchCycle()
  }, REQUEST_DISPATCH_SCAN_INTERVAL_MS)
  void runBookingOutcomePromptCycle()
  setInterval(() => {
    void runBookingOutcomePromptCycle()
  }, OUTCOME_PROMPT_SCAN_INTERVAL_MS)
}

start().catch((error) => {
  console.error('Failed to start API:', error)
  process.exit(1)
})

const shutdown = async () => {
  await pool.end()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
