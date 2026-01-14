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
const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const REQUEST_INITIAL_BATCH_SIZE = 15
const REQUEST_EXPANDED_BATCH_SIZE = 20
const REQUEST_RESPONSE_WINDOW_MINUTES = 30
const REQUEST_DISPATCH_SCAN_INTERVAL_MS = 60_000
const REQUEST_DISPATCH_CANDIDATE_LIMIT = 200
const CHAT_MESSAGE_DEFAULT_LIMIT = 30
const CHAT_MESSAGE_MAX_LIMIT = 80
const CHAT_STREAM_PATH = '/api/chats/stream'
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

const DAY_MS = 24 * 60 * 60 * 1000

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

const sendChatNotification = async ({ chatId, senderId, preview }) => {
  if (!telegramBotToken || !telegramWebAppUrl) return
  const result = await pool.query(
    `
      SELECT user_id AS "userId"
      FROM chat_members
      WHERE chat_id = $1
    `,
    [chatId]
  )
  const recipients = result.rows
    .map((row) => row.userId)
    .filter((id) => id && id !== senderId)
  if (recipients.length === 0) return

  const senderName = senderId ? await resolveUserDisplayName(senderId) : ''
  const title = senderName ? `Новое сообщение от ${senderName}` : 'Новое сообщение'
  const text = preview ? `${title}\n${preview}` : title
  const link = buildStartAppUrl(telegramWebAppUrl, `chat_${chatId}`)

  await Promise.all(
    recipients.map((recipientId) =>
      sendTelegramMessage({ recipientId, text, webAppUrl: link, url: link })
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

const notifyChatMembers = async (chatId, payload, excludeUserId) => {
  const result = await pool.query(
    `
      SELECT user_id AS "userId"
      FROM chat_members
      WHERE chat_id = $1
    `,
    [chatId]
  )
  result.rows.forEach((row) => {
    if (excludeUserId && row.userId === excludeUserId) return
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

const createChatForRequest = async ({
  requestId,
  responseId,
  clientId,
  masterId,
  serviceName,
  actorId,
}) => {
  await pool.query('BEGIN')
  try {
    const insertResult = await pool.query(
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
        ON CONFLICT (context_type, context_id, client_id, master_id)
        DO UPDATE SET response_id = EXCLUDED.response_id,
                      updated_at = NOW()
        RETURNING id, (xmax = 0) AS "isNew"
      `,
      [requestId, responseId, clientId, masterId]
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
      [chatId, clientId]
    )
    await pool.query(
      `
        INSERT INTO chat_members (chat_id, user_id, role)
        VALUES ($1, $2, 'master')
        ON CONFLICT (chat_id, user_id) DO NOTHING
      `,
      [chatId, masterId]
    )

    let systemMessageId = null
    let systemMessageCreatedAt = null
    let systemMessage = null

    if (isNew) {
      const body = serviceName
        ? `Заявка согласована по услуге «${serviceName}». Обсудите детали.`
        : 'Заявка согласована. Обсудите детали.'
      const meta = { event: 'request_accepted', serviceName: serviceName ?? null }
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
          [chatId, actorId ?? clientId, messageId]
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

const createChatForBooking = async ({
  bookingId,
  clientId,
  masterId,
  serviceName,
  actorId,
}) => {
  await pool.query('BEGIN')
  try {
    const insertResult = await pool.query(
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
        ON CONFLICT (context_type, context_id, client_id, master_id)
        DO UPDATE SET booking_id = EXCLUDED.booking_id,
                      updated_at = NOW()
        RETURNING id, (xmax = 0) AS "isNew"
      `,
      [bookingId, clientId, masterId]
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
      [chatId, clientId]
    )
    await pool.query(
      `
        INSERT INTO chat_members (chat_id, user_id, role)
        VALUES ($1, $2, 'master')
        ON CONFLICT (chat_id, user_id) DO NOTHING
      `,
      [chatId, masterId]
    )

    let systemMessageId = null
    let systemMessageCreatedAt = null
    let systemMessage = null

    if (isNew) {
      const body = serviceName
        ? `Запись подтверждена по услуге «${serviceName}». Можно обсудить детали.`
        : 'Запись подтверждена. Можно обсудить детали.'
      const meta = { event: 'booking_confirmed', serviceName: serviceName ?? null }
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
          [chatId, actorId ?? clientId, messageId]
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

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      username TEXT,
      language_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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
  const { userId, firstName, lastName, username, languageCode } = req.body ?? {}
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : ''

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const normalizeOptional = (value) => {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    return trimmed.length ? trimmed : null
  }

  try {
    await pool.query(
      `
        INSERT INTO users (user_id, first_name, last_name, username, language_code)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) DO UPDATE
        SET first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            username = EXCLUDED.username,
            language_code = EXCLUDED.language_code,
            updated_at = NOW()
      `,
      [
        normalizedUserId,
        normalizeOptional(firstName),
        normalizeOptional(lastName),
        normalizeOptional(username),
        normalizeOptional(languageCode),
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
          mp.avatar_path AS "avatarPath",
          mp.cover_path AS "coverPath",
          mp.is_active AS "isActive",
          mp.schedule_days AS "scheduleDays",
          mp.works_at_client AS "worksAtClient",
          mp.works_at_master AS "worksAtMaster",
          mp.categories,
          mp.services,
          mp.portfolio_urls AS "portfolioUrls",
          COALESCE(ms.showcase_urls, '{}'::text[]) AS "showcaseUrls",
          COALESCE(mr.reviews_count, 0) AS "reviewsCount",
          COALESCE(mr.reviews_average, 0) AS "reviewsAverage",
          COALESCE(mf.followers_count, 0) AS "followersCount",
          mp.updated_at AS "updatedAt",
          ul.lat AS "locationLat",
          ul.lng AS "locationLng",
          ul.share_to_clients AS "shareToClients"
        FROM master_profiles mp
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
    const payload = result.rows.map((row) => {
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
          mp.avatar_path AS "avatarPath",
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
          COALESCE(ms.showcase_urls, '{}'::text[]) AS "showcaseUrls",
          COALESCE(mr.reviews_count, 0) AS "reviewsCount",
          COALESCE(mr.reviews_average, 0) AS "reviewsAverage",
          COALESCE(mf.followers_count, 0) AS "followersCount",
          mp.updated_at AS "updatedAt"
        FROM master_profiles mp
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
    res.json({
      ...row,
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
          mp.avatar_path AS "avatarPath"
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
    const profileResult = await pool.query(
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
    const profileResult = await pool.query(
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
          portfolio_urls
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, COALESCE($17, '{}'::text[]))
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
          ch.id AS "chatId",
          ul.lat AS "clientLat",
          ul.lng AS "clientLng",
          ul.share_to_masters AS "clientShareToMasters"
        FROM request_dispatches rd
        JOIN service_requests r ON r.id = rd.request_id
        LEFT JOIN cities c ON c.id = r.city_id
        LEFT JOIN districts d ON d.id = r.district_id
        LEFT JOIN user_locations ul ON ul.user_id = r.user_id
        LEFT JOIN request_responses rr
          ON rr.request_id = r.id AND rr.master_id = rd.master_id
        LEFT JOIN chats ch
          ON ch.request_id = r.id
          AND ch.master_id = rd.master_id
          AND ch.context_type = 'request'
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

    const payload = result.rows.map((row) => {
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
        distanceKm,
        clientLat: undefined,
        clientLng: undefined,
        clientShareToMasters: undefined,
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
          mp.avatar_path AS "masterAvatarPath",
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
          b.created_at AS "createdAt",
          mr.id AS "reviewId"
        FROM service_bookings b
        LEFT JOIN master_profiles mp ON mp.user_id = b.master_id
        LEFT JOIN master_reviews mr ON mr.booking_id = b.id
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
          b.created_at AS "createdAt",
          ul.lat AS "clientLat",
          ul.lng AS "clientLng",
          ul.share_to_masters AS "clientShareToMasters"
        FROM service_bookings b
        LEFT JOIN users u ON u.user_id = b.client_id
        LEFT JOIN cities c ON c.id = b.city_id
        LEFT JOIN districts d ON d.id = b.district_id
        LEFT JOIN user_locations ul ON ul.user_id = b.client_id
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
        clientLat: undefined,
        clientLng: undefined,
        clientShareToMasters: undefined,
      }
    })

    res.json(payload)
  } catch (error) {
    console.error('GET /api/pro/bookings failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

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
  }))
  const seriesIndex = new Map(dateKeys.map((date, index) => [date, index]))

  try {
    const [
      bookingsResult,
      dispatchResult,
      responsesResult,
      chatsResult,
      reviewsResult,
      followersResult,
      followersTotalResult,
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
        [normalizedUserId, start, end]
      ),
      pool.query(
        `
          SELECT request_id AS "requestId", sent_at AS "sentAt"
          FROM request_dispatches
          WHERE master_id = $1
            AND sent_at >= $2
            AND sent_at <= $3
        `,
        [normalizedUserId, start, end]
      ),
      pool.query(
        `
          SELECT request_id AS "requestId", status, created_at AS "createdAt"
          FROM request_responses
          WHERE master_id = $1
            AND created_at >= $2
            AND created_at <= $3
        `,
        [normalizedUserId, start, end]
      ),
      pool.query(
        `
          SELECT id, created_at AS "createdAt"
          FROM chats
          WHERE master_id = $1
            AND created_at >= $2
            AND created_at <= $3
        `,
        [normalizedUserId, start, end]
      ),
      pool.query(
        `
          SELECT rating, created_at AS "createdAt"
          FROM master_reviews
          WHERE master_id = $1
            AND created_at >= $2
            AND created_at <= $3
        `,
        [normalizedUserId, start, end]
      ),
      pool.query(
        `
          SELECT created_at AS "createdAt"
          FROM master_followers
          WHERE master_id = $1
            AND created_at >= $2
            AND created_at <= $3
        `,
        [normalizedUserId, start, end]
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS total
          FROM master_followers
          WHERE master_id = $1
        `,
        [normalizedUserId]
      ),
    ])

    const bookings = bookingsResult.rows ?? []
    const dispatches = dispatchResult.rows ?? []
    const responses = responsesResult.rows ?? []
    const chats = chatsResult.rows ?? []
    const reviews = reviewsResult.rows ?? []
    const followers = followersResult.rows ?? []

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
    let totalBookingRevenue = 0

    bookings.forEach((booking) => {
      const amount = Number(booking.servicePrice ?? booking.proposedPrice ?? 0) || 0
      const status = booking.status
      totalBookingRevenue += amount

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

    res.json({
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
    })
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

  const { userId, action, price } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedAction = normalizeText(action)
  const parsedPrice = parseOptionalInt(price)

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
          proposed_price AS "proposedPrice"
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

      await pool.query(
        `
          UPDATE service_bookings
          SET status = 'cancelled',
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId]
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

      await pool.query(
        `
          UPDATE service_bookings
          SET status = 'cancelled',
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId]
      )

      res.json({ ok: true, status: 'cancelled' })
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
              mp.avatar_path
            FROM request_responses rr
            LEFT JOIN master_profiles mp ON mp.user_id = rr.master_id
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
          mp.avatar_path AS "avatarPath",
          mp.portfolio_urls AS "portfolioUrls",
          COALESCE(ms.showcase_urls, '{}'::text[]) AS "showcaseUrls",
          rr.price,
          rr.comment,
          rr.proposed_time AS "proposedTime",
          rr.status,
          rr.created_at AS "createdAt",
          ch.id AS "chatId",
          COALESCE(mr.reviews_count, 0) AS "reviewsCount",
          COALESCE(mr.reviews_average, 0) AS "reviewsAverage"
        FROM request_responses rr
        LEFT JOIN master_profiles mp ON mp.user_id = rr.master_id
        LEFT JOIN master_showcases ms ON ms.user_id = rr.master_id
        LEFT JOIN chats ch
          ON ch.request_id = rr.request_id
          AND ch.master_id = rr.master_id
          AND ch.context_type = 'request'
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
          c.last_message_at AS "lastMessageAt",
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
          sb.service_name AS "bookingServiceName",
          sb.category_id AS "bookingCategoryId",
          sb.status AS "bookingStatus",
          mp.display_name AS "masterName",
          mp.avatar_path AS "masterAvatarPath",
          u.first_name AS "clientFirstName",
          u.last_name AS "clientLastName",
          u.username AS "clientUsername"
        FROM chat_members cm
        JOIN chats c ON c.id = cm.chat_id
        LEFT JOIN chat_messages lm ON lm.id = c.last_message_id
        LEFT JOIN service_requests sr ON sr.id = c.request_id
        LEFT JOIN service_bookings sb ON sb.id = c.booking_id
        LEFT JOIN master_profiles mp ON mp.user_id = c.master_id
        LEFT JOIN users u ON u.user_id = c.client_id
        WHERE cm.user_id = $1
          AND (
            (c.context_type = 'request' AND sr.status = 'closed')
            OR (c.context_type = 'booking' AND sb.status = 'confirmed')
            OR (c.context_type NOT IN ('request', 'booking'))
          )
        ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      `,
      [normalizedUserId]
    )

    const payload = result.rows.map((row) => {
      const isClient = row.clientId === normalizedUserId
      const counterpartName = isClient
        ? row.masterName || 'Мастер'
        : formatUserDisplayName(
            row.clientFirstName,
            row.clientLastName,
            row.clientUsername,
            'Клиент'
          )
      const counterpartAvatarUrl = isClient
        ? buildPublicUrl(req, row.masterAvatarPath)
        : null
      const lastMessageText =
        row.lastMessageBody ||
        (row.lastMessageType === 'image'
          ? 'Фото'
          : row.lastMessageType === 'system'
            ? 'Системное сообщение'
            : '')
      const serviceName = row.serviceName || row.bookingServiceName || ''
      const categoryId = row.categoryId || row.bookingCategoryId || null

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
        },
        request: row.requestId
          ? {
              id: row.requestId,
              serviceName,
              categoryId,
              locationType: row.locationType,
              status: row.requestStatus,
            }
          : null,
        booking: row.bookingId
          ? {
              id: row.bookingId,
              serviceName,
              categoryId,
              status: row.bookingStatus,
            }
          : null,
      }
    })

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
          sb.service_name AS "bookingServiceName",
          sb.category_id AS "bookingCategoryId",
          sb.location_type AS "bookingLocationType",
          sb.scheduled_at AS "bookingScheduledAt",
          sb.service_price AS "bookingServicePrice",
          sb.status AS "bookingStatus",
          mp.display_name AS "masterName",
          mp.avatar_path AS "masterAvatarPath",
          u.first_name AS "clientFirstName",
          u.last_name AS "clientLastName",
          u.username AS "clientUsername"
        FROM chats c
        LEFT JOIN service_requests sr ON sr.id = c.request_id
        LEFT JOIN service_bookings sb ON sb.id = c.booking_id
        LEFT JOIN master_profiles mp ON mp.user_id = c.master_id
        LEFT JOIN users u ON u.user_id = c.client_id
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
    const counterpartName = isClient
      ? row.masterName || 'Мастер'
      : formatUserDisplayName(
          row.clientFirstName,
          row.clientLastName,
          row.clientUsername,
          'Клиент'
        )

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
        avatarUrl: isClient ? buildPublicUrl(req, row.masterAvatarPath) : null,
      },
      request: row.requestId
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
          }
        : null,
      booking: row.bookingId
        ? {
            id: row.bookingId,
            serviceName: row.bookingServiceName,
            categoryId: row.bookingCategoryId,
            locationType: row.bookingLocationType,
            scheduledAt: row.bookingScheduledAt,
            servicePrice: row.bookingServicePrice,
            status: row.bookingStatus,
          }
        : null,
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
        ORDER BY id DESC
        LIMIT $3
      `,
      [chatId, beforeId, limit]
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

const start = async () => {
  await ensureSchema()
  await seedLocations()
  await fs.mkdir(uploadsRoot, { recursive: true })
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
