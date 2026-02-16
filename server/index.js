import dotenv from 'dotenv'
import cors from 'cors'
import express from 'express'
import compression from 'compression'
import { WebSocketServer } from 'ws'
import { Pool } from 'pg'
import { randomUUID, createHash } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

dotenv.config()

const app = express()
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000)
const corsOrigin = process.env.CORS_ORIGIN ?? '*'
const uploadsRoot = path.join(process.cwd(), 'uploads')
const imageCacheRoot = path.join(process.cwd(), '.cache', 'image-derivatives')
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024
const STORY_DEFAULT_TTL_HOURS = 24
const STORY_MIN_TTL_HOURS = 1
const STORY_MAX_TTL_HOURS = 72
const STORY_MAX_ACTIVE = 30
const STORY_CAPTION_LIMIT = 200
const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const allowedImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const IMAGE_MIN_WIDTH = 24
const IMAGE_MAX_WIDTH = 2048
const IMAGE_MIN_QUALITY = 40
const IMAGE_MAX_QUALITY = 88
const IMAGE_DEFAULT_QUALITY = 72
const REQUEST_INITIAL_BATCH_SIZE = 15
const REQUEST_EXPANDED_BATCH_SIZE = 20
const REQUEST_RESPONSE_WINDOW_MINUTES = 30
const REQUEST_TIME_WINDOW_LIMIT = 6
const RESPONSE_SLOT_HOLD_MINUTES = 20
const DEPOSIT_HOLD_MINUTES = 20
const LEAD_CONVERSION_WINDOW_DAYS = 120
const LEAD_CONVERSION_MIN_SAMPLE = 6
const LEAD_CONVERSION_LOCATION_MIN_SAMPLE = 4
const REQUEST_DISPATCH_SCAN_INTERVAL_MS = 60_000
const REQUEST_DISPATCH_CANDIDATE_LIMIT = 200
const OUTCOME_PROMPT_SCAN_INTERVAL_MS = 90_000
const OUTCOME_PROMPT_BATCH_LIMIT = 20
const DEPOSIT_HOLD_SCAN_INTERVAL_MS = 60_000
const DEPOSIT_HOLD_BATCH_LIMIT = 40
const OUTCOME_PROMPT_ACTION_WINDOW_HOURS = 48
const BOOKING_DURATION_FALLBACK_MINUTES = 60
const BOOKING_FREE_CANCEL_HOURS = 12
const BOOKING_PRICE_OFFER_HOURS = 12
const MARKETING_TEXT_LIMIT = 800
const MARKETING_BROADCAST_CHUNK = 25
const MARKETING_BROADCAST_MAX = 5000
const MARKETING_CAMPAIGN_MAX_DURATION_DAYS = 7
const MARKETING_CAMPAIGN_SEGMENTS = ['all', 'new', 'regular']
const PROMOTION_TITLE_LIMIT = 60
const PROMOTION_DESCRIPTION_LIMIT = 180
const PROMOTION_MAX_DURATION_DAYS = 14
const PROMOTION_MAX_DISCOUNT = 60
const PROMOTION_TYPES = ['discount', 'bonus', 'slots']
const PROMOTION_AUDIENCES = ['all', 'followers', 'clients']
const PROMOTION_STATUSES = ['active', 'paused', 'archived']
const REPEAT_REMINDER_SCAN_INTERVAL_MS = 12 * 60 * 60 * 1000
const REPEAT_REMINDER_BATCH_LIMIT = 200
const REPEAT_DEFAULT_INTERVALS = {
  'beauty-nails': 21,
  'brows-lashes': 21,
  hair: 35,
  'cosmetology-care': 30,
  default: 30,
}
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
const CLIENT_REQUEST_LIMITS = {
  low: { maxOpen: 2, maxPerDay: 3 },
  medium: { maxOpen: 4, maxPerDay: 6 },
  high: { maxOpen: 6, maxPerDay: 10 },
}
const CLIENT_BOOKING_LIMITS = {
  low: { maxOpen: 2, maxPerDay: 2 },
  medium: { maxOpen: 4, maxPerDay: 4 },
  high: { maxOpen: 7, maxPerDay: 8 },
}
const REQUEST_DUPLICATE_WINDOW_MINUTES = 30
const BOOKING_DUPLICATE_WINDOW_MINUTES = 60
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
}
const API_CACHE_HEADER = 'private, max-age=30, stale-while-revalidate=30'
const API_CACHE_PATHS = [
  '/masters',
  '/stories',
  '/requests',
  '/bookings',
  '/pro/requests',
  '/pro/bookings',
  '/pro/analytics',
  '/cities',
]
const MAX_CERTIFICATES = 12
const SUPPORT_AGENT_IDS = Array.from(
  new Set(
    (process.env.SUPPORT_AGENT_IDS ?? '5510721194,7226796630')
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  )
)
const SUPPORT_AGENT_ID_SET = new Set(SUPPORT_AGENT_IDS)
const LINK_TOKEN_TTL_MS = 10 * 60 * 1000
const VK_APP_URL = normalizeText(
  process.env.VITE_VK_APP_URL ?? process.env.VK_APP_URL ?? 'https://vk.com/app54453024'
)
const identityPlatforms = new Set(['telegram', 'vk'])
const linkableHosts = new Set(['telegram', 'vk', 'web'])
const SUPPORT_CONTEXT_ID = 1
const SUPPORT_WELCOME_MESSAGE =
  'Здравствуйте! Это поддержка KIVEN. Опишите ситуацию, добавьте номер заявки/записи (если есть) и приложите фото или скриншот.'
const BLOCKED_CLIENT_NOTICE =
  'Служба поддержки: клиента заблокировали по подозрению на спам или недобросовестную активность. Приносим извинения за неудобства и работаем над улучшением сервиса.'
const chatMessageTypes = new Set([
  'text',
  'image',
  'system',
  'offer_price',
  'offer_time',
  'offer_location',
])

app.use(cors({ origin: corsOrigin }))
app.use(compression())
app.use(express.json({ limit: '12mb' }))
app.get(/^\/uploads\/(.+)/, async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  const width = parseImageParam(req.query.w, IMAGE_MIN_WIDTH, IMAGE_MAX_WIDTH)
  const qualityParam = parseImageParam(req.query.q, IMAGE_MIN_QUALITY, IMAGE_MAX_QUALITY)
  const formatParam = normalizeImageFormat(
    req.query.format ?? req.query.f ?? req.query.fm
  )
  const hasTransform =
    width !== null || Boolean(normalizeText(req.query.q)) || Boolean(formatParam)
  if (!hasTransform) return next()

  const sharp = await loadSharp()
  if (!sharp) return next()

  let relativePath = ''
  if (Array.isArray(req.params) && typeof req.params[0] === 'string') {
    relativePath = req.params[0]
  } else {
    try {
      relativePath = decodeURIComponent(req.path.replace(/^\/uploads\//, ''))
    } catch (error) {
      return next()
    }
  }
  relativePath = relativePath.replace(/^\/+/, '')
  if (!relativePath || relativePath.includes('..')) return next()
  const ext = path.extname(relativePath).toLowerCase()
  if (!allowedImageExtensions.has(ext)) return next()
  const absolutePath = path.join(uploadsRoot, relativePath)
  if (!path.normalize(absolutePath).startsWith(uploadsRoot)) return next()

  try {
    const stat = await fs.stat(absolutePath)
    if (!stat.isFile()) return next()
  } catch (error) {
    return next()
  }

  const format = resolveImageFormat(req, ext, formatParam)
  const quality = qualityParam ?? IMAGE_DEFAULT_QUALITY
  const cacheTarget = buildImageCachePath(relativePath, {
    width,
    quality,
    format,
  })

  try {
    const cached = await fs.stat(cacheTarget.filePath).then(() => true).catch(() => false)
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.setHeader('Vary', 'Accept')
      res.type(`image/${format === 'jpeg' ? 'jpeg' : format}`)
      return res.sendFile(cacheTarget.filePath)
    }
  } catch (error) {
    // fall through to generate
  }

  try {
    let pipeline = sharp(absolutePath, { failOn: 'none' })
    if (width) {
      pipeline = pipeline.resize({ width, withoutEnlargement: true })
    }
    switch (format) {
      case 'png':
        pipeline = pipeline.png({
          quality,
          compressionLevel: 9,
          adaptiveFiltering: true,
        })
        break
      case 'webp':
        pipeline = pipeline.webp({ quality })
        break
      case 'avif':
        pipeline = pipeline.avif({ quality: Math.min(quality, 80) })
        break
      default:
        pipeline = pipeline.jpeg({ quality, mozjpeg: true })
        break
    }
    const buffer = await pipeline.toBuffer()
    try {
      await fs.mkdir(cacheTarget.folder, { recursive: true })
      await fs.writeFile(cacheTarget.filePath, buffer)
    } catch (cacheError) {
      console.warn('Image cache write failed:', cacheError)
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Vary', 'Accept')
    res.type(`image/${format === 'jpeg' ? 'jpeg' : format}`)
    return res.end(buffer)
  } catch (error) {
    console.error('Image resize failed:', error)
    return next()
  }
})
app.use(
  '/uploads',
  express.static(uploadsRoot, {
    setHeaders: (res) => {
      res.setHeader(
        'Cache-Control',
        'public, max-age=604800, stale-while-revalidate=86400'
      )
    },
  })
)
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') return next()
  if (req.path.startsWith('/chats/stream')) return next()
  const isCacheable = API_CACHE_PATHS.some((prefix) => req.path.startsWith(prefix))
  if (isCacheable) {
    res.setHeader('Cache-Control', API_CACHE_HEADER)
  }
  return next()
})

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

function normalizeText(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const normalizeUserRole = (value) => {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'client' || normalized === 'pro') return normalized
  return null
}

const normalizeIdentityPlatform = (value) => {
  const normalized = normalizeText(value).toLowerCase()
  return identityPlatforms.has(normalized) ? normalized : null
}

const resolveIdentityPlatformByHost = (host) => {
  const normalized = normalizeText(host).toLowerCase()
  if (!linkableHosts.has(normalized)) return 'telegram'
  if (normalized === 'vk') return 'vk'
  return 'telegram'
}

const normalizeExternalUserId = (value) => normalizeText(String(value ?? ''))

const buildLegacyUserId = (platform, externalUserId) =>
  platform === 'vk' ? `vk_${externalUserId}` : externalUserId

const parseLegacyIdentity = (userId) => {
  const normalized = normalizeText(userId)
  if (!normalized) return null
  if (normalized.startsWith('vk_')) {
    const externalUserId = normalizeText(normalized.slice(3))
    if (!externalUserId) return null
    return { platform: 'vk', externalUserId }
  }
  if (normalized.startsWith('u_')) {
    return null
  }
  return { platform: 'telegram', externalUserId: normalized }
}

const buildInternalUserId = () => `u_${randomUUID()}`

const buildLinkToken = () => randomUUID().replace(/-/g, '')

const normalizeStoryCaption = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return null
  if (normalized.length > STORY_CAPTION_LIMIT) {
    return normalized.slice(0, STORY_CAPTION_LIMIT)
  }
  return normalized
}

const isLocalDevUserId = (value) => normalizeText(value).toLowerCase() === 'local-dev'

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

const normalizePromotionType = (value) => {
  const normalized = normalizeText(value).toLowerCase()
  if (PROMOTION_TYPES.includes(normalized)) return normalized
  return 'discount'
}

const normalizePromotionStatus = (value) => {
  const normalized = normalizeText(value).toLowerCase()
  if (PROMOTION_STATUSES.includes(normalized)) return normalized
  return 'active'
}

const normalizePromotionAudience = (value) => {
  const normalized = normalizeText(value).toLowerCase()
  if (PROMOTION_AUDIENCES.includes(normalized)) return normalized
  return 'all'
}

const normalizeCampaignSegment = (value) => {
  const normalized = normalizeText(value).toLowerCase()
  if (MARKETING_CAMPAIGN_SEGMENTS.includes(normalized)) return normalized
  return 'all'
}

const normalizePromotionTitle = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  return normalized.slice(0, PROMOTION_TITLE_LIMIT)
}

const normalizePromotionDescription = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return null
  return normalized.slice(0, PROMOTION_DESCRIPTION_LIMIT)
}

const normalizePromotionDiscount = (value) => {
  const parsed = parseOptionalInt(value)
  if (parsed === null) return 0
  return clampValue(parsed, 0, PROMOTION_MAX_DISCOUNT)
}

const parseDateTime = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const ensureDateValue = (value) => {
  if (!value) return null
  if (value instanceof Date) return value
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const loadPromotionEligibility = async (masterId) => {
  const result = await pool.query(
    `
      SELECT
        COALESCE(mp.avatar_path, u.avatar_url) AS "avatarPath",
        mp.portfolio_urls AS "portfolioUrls",
        COALESCE(ms.showcase_urls, '{}'::text[]) AS "showcaseUrls"
      FROM master_profiles mp
      LEFT JOIN users u ON u.user_id = mp.user_id
      LEFT JOIN master_showcases ms ON ms.user_id = mp.user_id
      WHERE mp.user_id = $1
    `,
    [masterId]
  )
  const row = result.rows[0]
  if (!row) {
    return { ok: false, hasAvatar: false, hasPortfolio: false }
  }
  const hasAvatar = Boolean(row.avatarPath)
  const portfolioUrls = Array.isArray(row.portfolioUrls) ? row.portfolioUrls : []
  const showcaseUrls = Array.isArray(row.showcaseUrls) ? row.showcaseUrls : []
  const hasPortfolio = portfolioUrls.length > 0 || showcaseUrls.length > 0
  return { ok: hasAvatar && hasPortfolio, hasAvatar, hasPortfolio }
}

const buildPromotionAudienceClause = ({
  viewerIndex,
  masterAlias = 'mp',
  promotionAlias = 'promo',
}) => `
  AND (
    ${promotionAlias}.audience = 'all'
    OR ${promotionAlias}.master_id = $${viewerIndex}
    OR (
      ${promotionAlias}.audience = 'followers'
      AND EXISTS (
        SELECT 1
        FROM master_followers mf
        WHERE mf.master_id = ${masterAlias}.user_id
          AND mf.follower_id = $${viewerIndex}
      )
    )
    OR (
      ${promotionAlias}.audience = 'clients'
      AND EXISTS (
        SELECT 1
        FROM service_bookings sb
        WHERE sb.master_id = ${masterAlias}.user_id
          AND sb.client_id = $${viewerIndex}
      )
    )
  )
`

const loadActivePromotionForViewer = async ({ masterId, viewerId }) => {
  if (!masterId || !viewerId) return null
  const result = await pool.query(
    `
      SELECT
        id,
        master_id AS "masterId",
        type,
        title,
        description,
        start_at AS "startAt",
        end_at AS "endAt",
        status,
        audience,
        discount_percent AS "discountPercent"
      FROM master_promotions mpromo
      WHERE mpromo.master_id = $1
        AND mpromo.status = 'active'
        AND mpromo.start_at <= NOW()
        AND mpromo.end_at > NOW()
        AND (
          mpromo.audience = 'all'
          OR mpromo.master_id = $2
          OR (
            mpromo.audience = 'followers'
            AND EXISTS (
              SELECT 1
              FROM master_followers mf
              WHERE mf.master_id = mpromo.master_id
                AND mf.follower_id = $2
            )
          )
          OR (
            mpromo.audience = 'clients'
            AND EXISTS (
              SELECT 1
              FROM service_bookings sb
              WHERE sb.master_id = mpromo.master_id
                AND sb.client_id = $2
            )
          )
        )
      ORDER BY mpromo.end_at ASC
      LIMIT 1
    `,
    [masterId, viewerId]
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    id: Number(row.id),
    masterId: row.masterId ?? masterId,
    type: row.type,
    title: row.title,
    description: row.description ?? null,
    startAt: row.startAt ?? null,
    endAt: row.endAt ?? null,
    status: row.status ?? 'active',
    audience: row.audience ?? 'all',
    discountPercent: normalizePromotionDiscount(row.discountPercent),
  }
}

const loadActiveCampaignDiscountForViewer = async ({ masterId, viewerId }) => {
  if (!masterId || !viewerId) return null
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.master_id AS "masterId",
        c.discount_percent AS "discountPercent",
        c.start_at AS "startAt",
        c.end_at AS "endAt",
        c.channel,
        c.segment
      FROM marketing_campaigns c
      JOIN marketing_campaign_recipients r
        ON r.campaign_id = c.id
      WHERE c.master_id = $1
        AND r.client_id = $2
        AND c.status = 'active'
        AND c.start_at <= NOW()
        AND c.end_at > NOW()
      ORDER BY c.discount_percent DESC, c.end_at ASC
      LIMIT 1
    `,
    [masterId, viewerId]
  )
  const row = result.rows[0]
  if (!row) return null
  const percent = normalizePromotionDiscount(row.discountPercent)
  if (percent <= 0) return null
  return {
    id: Number(row.id),
    masterId: row.masterId ?? masterId,
    discountPercent: percent,
    startAt: row.startAt ?? null,
    endAt: row.endAt ?? null,
    channel: row.channel ?? null,
    segment: row.segment ?? null,
  }
}

const resolveBookingDiscount = async ({
  masterId,
  clientId,
  promotionId,
  promotionDiscountPercent,
  campaignId,
  campaignDiscountPercent,
}) => {
  const storedPromotionPercent = normalizePromotionDiscount(promotionDiscountPercent)
  const storedCampaignPercent = normalizePromotionDiscount(campaignDiscountPercent)
  const hasStored =
    storedPromotionPercent > 0 || storedCampaignPercent > 0

  if (hasStored) {
    if (storedCampaignPercent > storedPromotionPercent) {
      return {
        source: 'campaign',
        discountPercent: storedCampaignPercent,
        promotion: null,
        campaign: {
          id: parseOptionalInt(campaignId),
          discountPercent: storedCampaignPercent,
        },
      }
    }
    if (storedPromotionPercent > 0) {
      return {
        source: 'promotion',
        discountPercent: storedPromotionPercent,
        promotion: {
          id: parseOptionalInt(promotionId),
          discountPercent: storedPromotionPercent,
        },
        campaign: null,
      }
    }
  }

  const [activePromotion, activeCampaign] = await Promise.all([
    loadActivePromotionForViewer({ masterId, viewerId: clientId }),
    loadActiveCampaignDiscountForViewer({ masterId, viewerId: clientId }),
  ])
  const promotionPercent =
    activePromotion?.type === 'discount'
      ? normalizePromotionDiscount(activePromotion.discountPercent)
      : 0
  const campaignPercent = normalizePromotionDiscount(
    activeCampaign?.discountPercent
  )

  if (campaignPercent > promotionPercent) {
    return {
      source: 'campaign',
      discountPercent: campaignPercent,
      promotion: null,
      campaign: activeCampaign
        ? { id: activeCampaign.id, discountPercent: campaignPercent }
        : null,
    }
  }
  if (promotionPercent > 0) {
    return {
      source: 'promotion',
      discountPercent: promotionPercent,
      promotion: activePromotion
        ? { id: activePromotion.id, discountPercent: promotionPercent }
        : null,
      campaign: null,
    }
  }
  if (campaignPercent > 0) {
    return {
      source: 'campaign',
      discountPercent: campaignPercent,
      promotion: null,
      campaign: activeCampaign
        ? { id: activeCampaign.id, discountPercent: campaignPercent }
        : null,
    }
  }
  return null
}

const buildPromotionDiscount = (basePrice, discountPercent) => {
  if (typeof basePrice !== 'number' || !Number.isFinite(basePrice)) return null
  const safePercent = normalizePromotionDiscount(discountPercent)
  if (safePercent <= 0) return null
  const amount = Math.max(0, Math.round((basePrice * safePercent) / 100))
  const after = Math.max(0, basePrice - amount)
  if (amount <= 0 || after <= 0) return null
  return {
    percent: safePercent,
    amount,
    before: basePrice,
    after,
  }
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

const SLOW_QUERY_MS = parseOptionalInt(process.env.DB_SLOW_MS) ?? 180
const PROFILE_ALL_QUERIES =
  normalizeText(process.env.DB_PROFILE).toLowerCase() === 'true' ||
  normalizeText(process.env.DB_PROFILE) === '1'

const timedQuery = async (label, text, params) => {
  const started = Date.now()
  const result = await pool.query(text, params)
  const duration = Date.now() - started
  if (PROFILE_ALL_QUERIES || duration >= SLOW_QUERY_MS) {
    console.log(`[db] ${label} ${duration}ms rows=${result.rowCount ?? 0}`)
  }
  return result
}

const resolveDepositType = (profile) => {
  const normalized = normalizeText(profile?.depositType).toLowerCase()
  const depositFixed = parseOptionalInt(profile?.depositFixed) ?? 0
  const depositPercent = parseOptionalInt(profile?.depositPercent) ?? 0
  if (normalized === 'fixed') {
    if (depositFixed > 0) return 'fixed'
    if (depositPercent > 0) return 'percent'
    return 'none'
  }
  if (normalized === 'percent') {
    if (depositPercent > 0) return 'percent'
    if (depositFixed > 0) return 'fixed'
    return 'none'
  }
  if (normalized === 'none') return 'none'
  if (depositFixed > 0) return 'fixed'
  if (depositPercent > 0) return 'percent'
  return 'none'
}

const calculateDepositAmount = (profile, servicePrice) => {
  const depositPercent = clampValue(
    parseOptionalInt(profile?.depositPercent) ?? 0,
    0,
    100
  )
  const depositFixed = clampValue(
    parseOptionalInt(profile?.depositFixed) ?? 0,
    0,
    1_000_000
  )
  const depositType = resolveDepositType(profile)
  if (depositType === 'fixed') return depositFixed
  if (depositType === 'percent') {
    if (typeof servicePrice === 'number' && Number.isFinite(servicePrice)) {
      return Math.max(0, Math.round((servicePrice * depositPercent) / 100))
    }
    return depositFixed > 0 ? depositFixed : 0
  }
  return 0
}

const buildDepositHoldExpiresAt = (baseTimeMs) => {
  const base = typeof baseTimeMs === 'number' ? baseTimeMs : Date.now()
  return new Date(base + DEPOSIT_HOLD_MINUTES * 60 * 1000).toISOString()
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

const normalizeDateTime = (value) => {
  const normalized = normalizeText(value)
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
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

const resolveClientLimitTier = (confidence) => {
  const safeConfidence = Number.isFinite(confidence) ? confidence : 0
  if (safeConfidence < TRUST_LEVEL_THRESHOLDS.new) return 'low'
  if (safeConfidence <= TRUST_LEVEL_THRESHOLDS.medium) return 'medium'
  return 'high'
}

const resolveClientLimits = async (userId) => {
  const trustRow = await loadClientTrustScore(userId)
  const tier = resolveClientLimitTier(trustRow?.confidence)
  return {
    tier,
    request: CLIENT_REQUEST_LIMITS[tier],
    booking: CLIENT_BOOKING_LIMITS[tier],
  }
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

const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const normalizeTimeWindow = (value) => {
  if (!value || typeof value !== 'object') return null
  const date = normalizeText(value.date)
  const start = normalizeText(value.start)
  const end = normalizeText(value.end)
  if (!date || !start || !end) return null
  if (!isDateKey(date)) return null
  const startMinutes = parseTimeToMinutes(start)
  const endMinutes = parseTimeToMinutes(end)
  if (startMinutes === null || endMinutes === null) return null
  if (endMinutes < startMinutes) return null
  const label = normalizeText(value.label)
  const exact = value.exact === true
  return {
    date,
    start,
    end,
    label: label || null,
    exact,
  }
}

const normalizeTimeWindows = (value) => {
  let source = value
  if (typeof value === 'string') {
    try {
      source = JSON.parse(value)
    } catch (error) {
      return []
    }
  }
  if (!Array.isArray(source)) return []
  const normalized = source
    .map((item) => normalizeTimeWindow(item))
    .filter(Boolean)
  if (normalized.length === 0) return []
  return normalized.slice(0, REQUEST_TIME_WINDOW_LIMIT)
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
  const requestTimeWindows = normalizeTimeWindows(request?.timeWindows)
  const hasScheduleDays = scheduleDays.length > 0

  if (requestTimeWindows.length > 0) {
    if (!hasScheduleDays || !hasTimeWindow) return true
    return requestTimeWindows.some((window) => {
      const date = new Date(window.date)
      if (Number.isNaN(date.getTime())) return false
      const dayKey = getDayKeyFromDate(date)
      if (!scheduleDays.includes(dayKey)) return false
      const startMinutes = parseTimeToMinutes(window.start)
      const endMinutes = parseTimeToMinutes(window.end)
      if (startMinutes === null || endMinutes === null) return false
      if (window.exact || startMinutes === endMinutes) {
        return (
          startMinutes >= scheduleStartMinutes && startMinutes <= scheduleEndMinutes
        )
      }
      return (
        startMinutes < scheduleEndMinutes && endMinutes > scheduleStartMinutes
      )
    })
  }

  if (requestDateOption === 'choose' && requestDateTime) {
    const scheduledDate = new Date(requestDateTime)
    if (Number.isNaN(scheduledDate.getTime())) return false
    if (!hasScheduleDays || !hasTimeWindow) return false
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
    if (!hasScheduleDays) return true
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

const resolvePortfolioEntry = (req, value) => {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (normalized.startsWith('pf:')) {
    try {
      const payload = JSON.parse(normalized.slice(3))
      if (!payload || typeof payload !== 'object') return normalized
      const rawUrl = normalizeText(payload.url)
      if (!rawUrl) return normalized
      const resolvedUrl = resolvePublicUrl(req, rawUrl) ?? rawUrl
      return `pf:${JSON.stringify({ ...payload, url: resolvedUrl })}`
    } catch (error) {
      return normalized
    }
  }
  return resolvePublicUrl(req, normalized) ?? normalized
}

const resolvePortfolioUrls = (req, values) =>
  (Array.isArray(values) ? values : [])
    .map((value) => resolvePortfolioEntry(req, value))
    .filter(Boolean)

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

const parseImageParam = (value, min, max) => {
  const parsed = parseOptionalInt(value)
  if (!Number.isFinite(parsed)) return null
  return clampValue(parsed, min, max)
}

const normalizeImageFormat = (value) => {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return null
  if (normalized === 'jpg') return 'jpeg'
  if (['jpeg', 'png', 'webp', 'avif', 'auto'].includes(normalized)) return normalized
  return null
}

const resolveImageFormat = (req, originalExt, forcedFormat) => {
  const normalizedExt =
    originalExt === '.jpg' || originalExt === '.jpeg' ? 'jpeg' : originalExt.slice(1)
  if (forcedFormat && forcedFormat !== 'auto') return forcedFormat
  const accept = String(req.headers.accept ?? '')
  if (accept.includes('image/avif')) return 'avif'
  if (accept.includes('image/webp')) return 'webp'
  return normalizedExt || 'jpeg'
}

const buildImageCachePath = (relativePath, options) => {
  const hash = createHash('sha1')
    .update(
      `${relativePath}|${options.width ?? ''}|${options.quality ?? ''}|${options.format ?? ''}`
    )
    .digest('hex')
  const ext = options.format === 'jpeg' ? 'jpg' : options.format
  const folder = path.join(imageCacheRoot, hash.slice(0, 2))
  const filename = `${hash}.${ext || 'jpg'}`
  return { folder, filePath: path.join(folder, filename) }
}

let sharpLoadPromise = null
let sharpLoadFailed = false

const loadSharp = async () => {
  if (!sharpLoadPromise) {
    sharpLoadPromise = import('sharp')
      .then((mod) => mod.default ?? mod)
      .catch((error) => {
        if (!sharpLoadFailed) {
          sharpLoadFailed = true
          console.warn('Sharp unavailable, image resizing disabled:', error)
        }
        return null
      })
  }
  return sharpLoadPromise
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
const telegramWebAppUrl = normalizeText(
  process.env.WEB_APP_URL ?? process.env.VITE_TG_APP_URL
)
const telegramMiniAppUrl = normalizeText(
  process.env.VITE_TG_APP_URL ?? process.env.TG_APP_URL ?? process.env.WEB_APP_URL
)
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

const buildTelegramButtons = (buttons) => {
  if (!Array.isArray(buttons)) return []
  return buttons
    .map((button) => {
      if (!button || typeof button !== 'object') return null
      const label = normalizeText(button.text)
      if (!label) return null
      const webAppUrl = normalizeText(button.webAppUrl)
      if (webAppUrl) {
        return { text: label, web_app: { url: webAppUrl } }
      }
      const url = normalizeText(button.url)
      if (url) {
        return { text: label, url }
      }
      return null
    })
    .filter(Boolean)
}

const resolveTelegramRecipientId = async (recipientId) => {
  const normalizedRecipientId = normalizeText(recipientId)
  if (!normalizedRecipientId) return ''
  if (/^\d+$/.test(normalizedRecipientId)) {
    return normalizedRecipientId
  }
  const identityResult = await pool.query(
    `
      SELECT external_user_id AS "externalUserId"
      FROM user_identities
      WHERE internal_user_id = $1
        AND platform = 'telegram'
      LIMIT 1
    `,
    [normalizedRecipientId]
  )
  return normalizeText(identityResult.rows[0]?.externalUserId)
}

const sendTelegramMessage = async ({ recipientId, text, url, webAppUrl, buttons }) => {
  if (!telegramBotToken) return false
  if (typeof fetch !== 'function') return false
  const resolvedRecipientId = await resolveTelegramRecipientId(recipientId)
  if (!resolvedRecipientId) return false
  const normalizedButtons = buildTelegramButtons(buttons)
  const fallbackButton = webAppUrl
    ? { text: 'Открыть чат', web_app: { url: webAppUrl } }
    : url
      ? { text: 'Открыть чат', url }
      : null
  const resolvedButtons = normalizedButtons.length
    ? normalizedButtons
    : fallbackButton
      ? [fallbackButton]
      : []
  const payload = {
    chat_id: resolvedRecipientId,
    text,
    disable_web_page_preview: true,
    ...(resolvedButtons.length
      ? {
          reply_markup: {
            inline_keyboard: resolvedButtons.map((button) => [button]),
          },
        }
      : {}),
  }

  try {
    const response = await fetch(`${telegramApiBase}/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      return false
    }
    const data = await response.json().catch(() => null)
    if (data && data.ok === false) return false
    return true
  } catch (error) {
    console.error('Telegram notification failed:', error)
    return false
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

const ensureUser = async (userId, db = pool) => {
  await db.query(
    `
      INSERT INTO users (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  )
}

const normalizeOptionalProfileValue = (value) => {
  const normalized = normalizeText(value)
  return normalized || null
}

const normalizeSessionProfilePayload = (payload = {}) => ({
  firstName: normalizeOptionalProfileValue(payload.firstName),
  lastName: normalizeOptionalProfileValue(payload.lastName),
  username: normalizeOptionalProfileValue(payload.username),
  languageCode: normalizeOptionalProfileValue(payload.languageCode),
  photoUrl: normalizeExternalUrl(payload.photoUrl),
})

const upsertUserProfile = async (
  db,
  { userId, firstName, lastName, username, languageCode, photoUrl }
) => {
  await db.query(
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
      SET first_name = COALESCE(users.first_name, EXCLUDED.first_name),
          last_name = COALESCE(users.last_name, EXCLUDED.last_name),
          username = COALESCE(users.username, EXCLUDED.username),
          language_code = COALESCE(users.language_code, EXCLUDED.language_code),
          avatar_url = COALESCE(users.avatar_url, EXCLUDED.avatar_url),
          updated_at = NOW()
    `,
    [userId, firstName, lastName, username, languageCode, photoUrl]
  )
}

const loadAccountIdentities = async (db, userId) => {
  const result = await db.query(
    `
      SELECT
        platform,
        external_user_id AS "externalUserId"
      FROM user_identities
      WHERE internal_user_id = $1
    `,
    [userId]
  )
  const identities = {
    telegramLinked: false,
    vkLinked: false,
    telegramUserId: null,
    vkUserId: null,
  }
  result.rows.forEach((row) => {
    if (row.platform === 'telegram') {
      identities.telegramLinked = true
      identities.telegramUserId = normalizeText(row.externalUserId) || null
    }
    if (row.platform === 'vk') {
      identities.vkLinked = true
      identities.vkUserId = normalizeText(row.externalUserId) || null
    }
  })
  return identities
}

const isSupportAgentUser = async (db, userId) => {
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId) return false
  if (SUPPORT_AGENT_ID_SET.has(normalizedUserId)) return true
  const result = await db.query(
    `
      SELECT 1
      FROM user_identities
      WHERE internal_user_id = $1
        AND external_user_id = ANY($2::text[])
      LIMIT 1
    `,
    [normalizedUserId, SUPPORT_AGENT_IDS]
  )
  return result.rowCount > 0
}

const ensureIdentityBinding = async (db, { internalUserId, platform, externalUserId, isPrimary = false }) => {
  await db.query(
    `
      INSERT INTO user_identities (
        internal_user_id,
        platform,
        external_user_id,
        is_primary,
        linked_at,
        last_seen_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW(), NOW())
      ON CONFLICT (platform, external_user_id) DO UPDATE
      SET internal_user_id = EXCLUDED.internal_user_id,
          is_primary = user_identities.is_primary OR EXCLUDED.is_primary,
          last_seen_at = NOW(),
          updated_at = NOW()
    `,
    [internalUserId, platform, externalUserId, Boolean(isPrimary)]
  )
}

const resolveOrCreateCanonicalUserId = async (db, { platform, externalUserId }) => {
  const normalizedPlatform = normalizeIdentityPlatform(platform)
  const normalizedExternalUserId = normalizeExternalUserId(externalUserId)
  if (!normalizedPlatform || !normalizedExternalUserId) {
    return null
  }

  const identityResult = await db.query(
    `
      SELECT internal_user_id AS "internalUserId"
      FROM user_identities
      WHERE platform = $1
        AND external_user_id = $2
      LIMIT 1
    `,
    [normalizedPlatform, normalizedExternalUserId]
  )
  const identityRow = identityResult.rows[0]
  if (identityRow?.internalUserId) {
    await ensureUser(identityRow.internalUserId, db)
    return identityRow.internalUserId
  }

  const legacyUserId = buildLegacyUserId(normalizedPlatform, normalizedExternalUserId)
  const legacyResult = await db.query(
    `
      SELECT user_id AS "userId"
      FROM users
      WHERE user_id = $1
      LIMIT 1
    `,
    [legacyUserId]
  )
  const existingLegacyUserId = normalizeText(legacyResult.rows[0]?.userId)
  if (existingLegacyUserId) {
    await ensureIdentityBinding(db, {
      internalUserId: existingLegacyUserId,
      platform: normalizedPlatform,
      externalUserId: normalizedExternalUserId,
      isPrimary: true,
    })
    return existingLegacyUserId
  }

  const internalUserId = buildInternalUserId()
  await db.query(
    `
      INSERT INTO users (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [internalUserId]
  )
  await ensureIdentityBinding(db, {
    internalUserId,
    platform: normalizedPlatform,
    externalUserId: normalizedExternalUserId,
    isPrimary: true,
  })
  return internalUserId
}

const bootstrapSession = async ({
  host,
  platformUserId,
  firstName,
  lastName,
  username,
  languageCode,
  photoUrl,
}) => {
  const platform = resolveIdentityPlatformByHost(host)
  const normalizedExternalUserId = normalizeExternalUserId(platformUserId)
  const fallbackUserId = 'local-dev'
  const profile = normalizeSessionProfilePayload({
    firstName,
    lastName,
    username,
    languageCode,
    photoUrl,
  })

  if (!normalizedExternalUserId) {
    await ensureUser(fallbackUserId)
    await upsertUserProfile(pool, {
      userId: fallbackUserId,
      platform,
      ...profile,
    })
    const roleResult = await pool.query(
      `
        SELECT
          app_role AS role,
          role_selected_at AS "roleSelectedAt",
          role_changed_at AS "roleChangedAt"
        FROM users
        WHERE user_id = $1
      `,
      [fallbackUserId]
    )
    const roleRow = roleResult.rows[0] ?? null
    const role = normalizeUserRole(roleRow?.role)
    return {
      userId: fallbackUserId,
      roleState: {
        role,
        selectedOnce: Boolean(role && roleRow?.roleSelectedAt),
        roleSelectedAt: roleRow?.roleSelectedAt ?? null,
        roleChangedAt: roleRow?.roleChangedAt ?? null,
      },
      identities: {
        telegramLinked: false,
        vkLinked: false,
        telegramUserId: null,
        vkUserId: null,
      },
      isSupportAgent: false,
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const internalUserId = await resolveOrCreateCanonicalUserId(client, {
      platform,
      externalUserId: normalizedExternalUserId,
    })
    if (!internalUserId) {
      throw new Error('session_user_resolve_failed')
    }
    await ensureIdentityBinding(client, {
      internalUserId,
      platform,
      externalUserId: normalizedExternalUserId,
      isPrimary: true,
    })
    await upsertUserProfile(client, {
      userId: internalUserId,
      platform,
      ...profile,
    })
    const roleResult = await client.query(
      `
        SELECT
          app_role AS role,
          role_selected_at AS "roleSelectedAt",
          role_changed_at AS "roleChangedAt"
        FROM users
        WHERE user_id = $1
      `,
      [internalUserId]
    )
    const roleRow = roleResult.rows[0] ?? null
    const role = normalizeUserRole(roleRow?.role)
    const identities = await loadAccountIdentities(client, internalUserId)
    const isSupportAgent = await isSupportAgentUser(client, internalUserId)
    await client.query('COMMIT')
    return {
      userId: internalUserId,
      roleState: {
        role,
        selectedOnce: Boolean(role && roleRow?.roleSelectedAt),
        roleSelectedAt: roleRow?.roleSelectedAt ?? null,
        roleChangedAt: roleRow?.roleChangedAt ?? null,
      },
      identities,
      isSupportAgent,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const toEpochMs = (value) => {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const mergeTextArray = (...values) => {
  const merged = []
  values.forEach((value) => {
    if (!Array.isArray(value)) return
    value.forEach((item) => {
      const normalized = normalizeText(item)
      if (!normalized) return
      if (!merged.includes(normalized)) {
        merged.push(normalized)
      }
    })
  })
  return merged
}

const choosePreferredRow = (primaryRow, secondaryRow) => {
  return { preferred: primaryRow, fallback: secondaryRow }
}

const loadUserMergeSnapshot = async (db, userId) => {
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId) return null

  const result = await db.query(
    `
      SELECT
        u.user_id AS "userId",
        u.created_at AS "createdAt",
        u.app_role AS "role",
        u.role_selected_at AS "roleSelectedAt",
        (
          EXISTS (
            SELECT 1
            FROM service_requests sr
            WHERE sr.user_id = u.user_id
          )
          OR EXISTS (
            SELECT 1
            FROM service_bookings sb
            WHERE sb.client_id = u.user_id
               OR sb.master_id = u.user_id
          )
          OR EXISTS (
            SELECT 1
            FROM request_responses rr
            WHERE rr.master_id = u.user_id
          )
          OR EXISTS (
            SELECT 1
            FROM chats c
            WHERE c.client_id = u.user_id
               OR c.master_id = u.user_id
          )
          OR EXISTS (
            SELECT 1
            FROM master_profiles mp
            WHERE mp.user_id = u.user_id
          )
          OR EXISTS (
            SELECT 1
            FROM client_trust_events cte
            WHERE cte.user_id = u.user_id
          )
        ) AS "hasDomainActivity"
      FROM users u
      WHERE u.user_id = $1
      LIMIT 1
    `,
    [normalizedUserId]
  )

  const row = result.rows[0] ?? null
  if (!row) return null
  return {
    userId: normalizeText(row.userId) || null,
    createdAt: row.createdAt ?? null,
    role: normalizeUserRole(row.role),
    roleSelectedAt: row.roleSelectedAt ?? null,
    hasDomainActivity: Boolean(row.hasDomainActivity),
  }
}

const resolvePrimaryForAccountMerge = async ({ db, sourceUserId, targetUserId }) => {
  const source = normalizeText(sourceUserId)
  const target = normalizeText(targetUserId)
  if (!source || !target || source === target) {
    return {
      primaryUserId: source || target,
      secondaryUserId: source || target,
      selectionReason: 'source_fallback',
    }
  }

  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    loadUserMergeSnapshot(db, source),
    loadUserMergeSnapshot(db, target),
  ])

  if (!sourceSnapshot || !targetSnapshot) {
    return {
      primaryUserId: source,
      secondaryUserId: target,
      selectionReason: 'source_fallback',
    }
  }

  const sourceRoleSelectedAt = toEpochMs(sourceSnapshot.roleSelectedAt)
  const targetRoleSelectedAt = toEpochMs(targetSnapshot.roleSelectedAt)
  const sourceHasRoleSelectedAt = sourceRoleSelectedAt > 0
  const targetHasRoleSelectedAt = targetRoleSelectedAt > 0

  if (sourceHasRoleSelectedAt !== targetHasRoleSelectedAt) {
    return sourceHasRoleSelectedAt
      ? {
          primaryUserId: source,
          secondaryUserId: target,
          selectionReason: 'role_selected_at',
        }
      : {
          primaryUserId: target,
          secondaryUserId: source,
          selectionReason: 'role_selected_at',
        }
  }

  if (
    sourceHasRoleSelectedAt &&
    targetHasRoleSelectedAt &&
    sourceRoleSelectedAt !== targetRoleSelectedAt
  ) {
    return sourceRoleSelectedAt < targetRoleSelectedAt
      ? {
          primaryUserId: source,
          secondaryUserId: target,
          selectionReason: 'role_selected_at',
        }
      : {
          primaryUserId: target,
          secondaryUserId: source,
          selectionReason: 'role_selected_at',
        }
  }

  if (sourceSnapshot.hasDomainActivity !== targetSnapshot.hasDomainActivity) {
    return sourceSnapshot.hasDomainActivity
      ? {
          primaryUserId: source,
          secondaryUserId: target,
          selectionReason: 'domain_activity',
        }
      : {
          primaryUserId: target,
          secondaryUserId: source,
          selectionReason: 'domain_activity',
        }
  }

  const sourceCreatedAt = toEpochMs(sourceSnapshot.createdAt)
  const targetCreatedAt = toEpochMs(targetSnapshot.createdAt)
  if (sourceCreatedAt !== targetCreatedAt) {
    return sourceCreatedAt < targetCreatedAt
      ? {
          primaryUserId: source,
          secondaryUserId: target,
          selectionReason: 'created_at',
        }
      : {
          primaryUserId: target,
          secondaryUserId: source,
          selectionReason: 'created_at',
        }
  }

  return {
    primaryUserId: source,
    secondaryUserId: target,
    selectionReason: 'source_fallback',
  }
}

const mergeUserAddressRow = async (db, primaryUserId, secondaryUserId) => {
  const result = await db.query(
    `
      SELECT *
      FROM user_addresses
      WHERE user_id = ANY($1::text[])
    `,
    [[primaryUserId, secondaryUserId]]
  )
  const primaryRow = result.rows.find((row) => row.user_id === primaryUserId) ?? null
  const secondaryRow = result.rows.find((row) => row.user_id === secondaryUserId) ?? null
  if (!secondaryRow) return
  if (!primaryRow) {
    await db.query(
      `
        UPDATE user_addresses
        SET user_id = $1,
            updated_at = NOW()
        WHERE user_id = $2
      `,
      [primaryUserId, secondaryUserId]
    )
    return
  }
  const { preferred, fallback } = choosePreferredRow(primaryRow, secondaryRow)
  await db.query(
    `
      UPDATE user_addresses
      SET city_id = COALESCE($2, $3),
          district_id = COALESCE($4, $5),
          address = COALESCE(NULLIF($6, ''), NULLIF($7, ''), address),
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      primaryUserId,
      preferred?.city_id ?? null,
      fallback?.city_id ?? null,
      preferred?.district_id ?? null,
      fallback?.district_id ?? null,
      normalizeText(preferred?.address),
      normalizeText(fallback?.address),
    ]
  )
  await db.query(`DELETE FROM user_addresses WHERE user_id = $1`, [secondaryUserId])
}

const mergeUserLocationRow = async (db, primaryUserId, secondaryUserId) => {
  const result = await db.query(
    `
      SELECT *
      FROM user_locations
      WHERE user_id = ANY($1::text[])
    `,
    [[primaryUserId, secondaryUserId]]
  )
  const primaryRow = result.rows.find((row) => row.user_id === primaryUserId) ?? null
  const secondaryRow = result.rows.find((row) => row.user_id === secondaryUserId) ?? null
  if (!secondaryRow) return
  if (!primaryRow) {
    await db.query(
      `
        UPDATE user_locations
        SET user_id = $1,
            updated_at = NOW()
        WHERE user_id = $2
      `,
      [primaryUserId, secondaryUserId]
    )
    return
  }
  const { preferred, fallback } = choosePreferredRow(primaryRow, secondaryRow)
  await db.query(
    `
      UPDATE user_locations
      SET lat = COALESCE($2, $3),
          lng = COALESCE($4, $5),
          accuracy = COALESCE($6, $7),
          share_to_clients = COALESCE($8, share_to_clients),
          share_to_masters = COALESCE($9, share_to_masters),
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      primaryUserId,
      preferred?.lat ?? null,
      fallback?.lat ?? null,
      preferred?.lng ?? null,
      fallback?.lng ?? null,
      preferred?.accuracy ?? null,
      fallback?.accuracy ?? null,
      preferred?.share_to_clients ?? fallback?.share_to_clients ?? true,
      preferred?.share_to_masters ?? fallback?.share_to_masters ?? true,
    ]
  )
  await db.query(`DELETE FROM user_locations WHERE user_id = $1`, [secondaryUserId])
}

const mergeMasterProfileRow = async (db, primaryUserId, secondaryUserId) => {
  const result = await db.query(
    `
      SELECT *
      FROM master_profiles
      WHERE user_id = ANY($1::text[])
    `,
    [[primaryUserId, secondaryUserId]]
  )
  const primaryRow = result.rows.find((row) => row.user_id === primaryUserId) ?? null
  const secondaryRow = result.rows.find((row) => row.user_id === secondaryUserId) ?? null
  if (!secondaryRow) return
  if (!primaryRow) {
    await db.query(
      `
        UPDATE master_profiles
        SET user_id = $1,
            updated_at = NOW()
        WHERE user_id = $2
      `,
      [primaryUserId, secondaryUserId]
    )
    return
  }
  const { preferred, fallback } = choosePreferredRow(primaryRow, secondaryRow)
  await db.query(
    `
      UPDATE master_profiles
      SET display_name = COALESCE(NULLIF($2, ''), NULLIF($3, ''), display_name),
          about = COALESCE(NULLIF($4, ''), NULLIF($5, ''), about),
          city_id = COALESCE($6, $7, city_id),
          district_id = COALESCE($8, $9, district_id),
          experience_years = COALESCE($10, $11, experience_years),
          price_from = COALESCE($12, $13, price_from),
          price_to = COALESCE($14, $15, price_to),
          avatar_path = COALESCE(NULLIF($16, ''), NULLIF($17, ''), avatar_path),
          cover_path = COALESCE(NULLIF($18, ''), NULLIF($19, ''), cover_path),
          works_at_client = COALESCE($20, works_at_client),
          works_at_master = COALESCE($21, works_at_master),
          categories = $22,
          services = $23,
          portfolio_urls = $24,
          is_active = COALESCE($25, is_active),
          schedule_days = $26,
          schedule_start = COALESCE(NULLIF($27, ''), NULLIF($28, ''), schedule_start),
          schedule_end = COALESCE(NULLIF($29, ''), NULLIF($30, ''), schedule_end),
          cancel_window_hours = COALESCE($31, $32, cancel_window_hours),
          deposit_percent = COALESCE($33, $34, deposit_percent),
          deposit_type = COALESCE(NULLIF($35, ''), NULLIF($36, ''), deposit_type),
          deposit_fixed = COALESCE($37, $38, deposit_fixed),
          deposit_details = COALESCE(NULLIF($39, ''), NULLIF($40, ''), deposit_details),
          deposit_qr_path = COALESCE(NULLIF($41, ''), NULLIF($42, ''), deposit_qr_path),
          certificates = COALESCE($43, $44, certificates),
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      primaryUserId,
      normalizeText(preferred?.display_name),
      normalizeText(fallback?.display_name),
      normalizeText(preferred?.about),
      normalizeText(fallback?.about),
      preferred?.city_id ?? null,
      fallback?.city_id ?? null,
      preferred?.district_id ?? null,
      fallback?.district_id ?? null,
      preferred?.experience_years ?? null,
      fallback?.experience_years ?? null,
      preferred?.price_from ?? null,
      fallback?.price_from ?? null,
      preferred?.price_to ?? null,
      fallback?.price_to ?? null,
      normalizeText(preferred?.avatar_path),
      normalizeText(fallback?.avatar_path),
      normalizeText(preferred?.cover_path),
      normalizeText(fallback?.cover_path),
      preferred?.works_at_client ?? fallback?.works_at_client ?? false,
      preferred?.works_at_master ?? fallback?.works_at_master ?? false,
      mergeTextArray(preferred?.categories, fallback?.categories),
      mergeTextArray(preferred?.services, fallback?.services),
      mergeTextArray(preferred?.portfolio_urls, fallback?.portfolio_urls),
      preferred?.is_active ?? fallback?.is_active ?? true,
      mergeTextArray(preferred?.schedule_days, fallback?.schedule_days),
      normalizeText(preferred?.schedule_start),
      normalizeText(fallback?.schedule_start),
      normalizeText(preferred?.schedule_end),
      normalizeText(fallback?.schedule_end),
      preferred?.cancel_window_hours ?? null,
      fallback?.cancel_window_hours ?? null,
      preferred?.deposit_percent ?? null,
      fallback?.deposit_percent ?? null,
      normalizeText(preferred?.deposit_type),
      normalizeText(fallback?.deposit_type),
      preferred?.deposit_fixed ?? null,
      fallback?.deposit_fixed ?? null,
      normalizeText(preferred?.deposit_details),
      normalizeText(fallback?.deposit_details),
      normalizeText(preferred?.deposit_qr_path),
      normalizeText(fallback?.deposit_qr_path),
      preferred?.certificates ?? null,
      fallback?.certificates ?? null,
    ]
  )
  await db.query(`DELETE FROM master_profiles WHERE user_id = $1`, [secondaryUserId])
}

const mergeMasterShowcaseRow = async (db, primaryUserId, secondaryUserId) => {
  const result = await db.query(
    `
      SELECT *
      FROM master_showcases
      WHERE user_id = ANY($1::text[])
    `,
    [[primaryUserId, secondaryUserId]]
  )
  const primaryRow = result.rows.find((row) => row.user_id === primaryUserId) ?? null
  const secondaryRow = result.rows.find((row) => row.user_id === secondaryUserId) ?? null
  if (!secondaryRow) return
  if (!primaryRow) {
    await db.query(
      `
        UPDATE master_showcases
        SET user_id = $1,
            updated_at = NOW()
        WHERE user_id = $2
      `,
      [primaryUserId, secondaryUserId]
    )
    return
  }
  const mergedUrls = mergeTextArray(primaryRow.showcase_urls, secondaryRow.showcase_urls)
  await db.query(
    `
      UPDATE master_showcases
      SET showcase_urls = $2,
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [primaryUserId, mergedUrls]
  )
  await db.query(`DELETE FROM master_showcases WHERE user_id = $1`, [secondaryUserId])
}

const mergeClientTrustScoreRow = async (db, primaryUserId, secondaryUserId) => {
  const result = await db.query(
    `
      SELECT *
      FROM client_trust_scores
      WHERE user_id = ANY($1::text[])
    `,
    [[primaryUserId, secondaryUserId]]
  )
  const primaryRow = result.rows.find((row) => row.user_id === primaryUserId) ?? null
  const secondaryRow = result.rows.find((row) => row.user_id === secondaryUserId) ?? null
  if (!secondaryRow) return
  if (!primaryRow) {
    await db.query(
      `
        UPDATE client_trust_scores
        SET user_id = $1,
            updated_at = NOW()
        WHERE user_id = $2
      `,
      [primaryUserId, secondaryUserId]
    )
    return
  }
  const { preferred, fallback } = choosePreferredRow(primaryRow, secondaryRow)
  await db.query(
    `
      UPDATE client_trust_scores
      SET score = COALESCE($2, $3, score),
          confidence = COALESCE($4, $5, confidence),
          reasons = COALESCE($6, $7, reasons),
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      primaryUserId,
      preferred?.score ?? null,
      fallback?.score ?? null,
      preferred?.confidence ?? null,
      fallback?.confidence ?? null,
      preferred?.reasons ?? null,
      fallback?.reasons ?? null,
    ]
  )
  await db.query(`DELETE FROM client_trust_scores WHERE user_id = $1`, [secondaryUserId])
}

const mergeRepeatSettingsRow = async (db, primaryUserId, secondaryUserId) => {
  const result = await db.query(
    `
      SELECT *
      FROM marketing_repeat_settings
      WHERE master_id = ANY($1::text[])
    `,
    [[primaryUserId, secondaryUserId]]
  )
  const primaryRow = result.rows.find((row) => row.master_id === primaryUserId) ?? null
  const secondaryRow = result.rows.find((row) => row.master_id === secondaryUserId) ?? null
  if (!secondaryRow) return
  if (!primaryRow) {
    await db.query(
      `
        UPDATE marketing_repeat_settings
        SET master_id = $1,
            updated_at = NOW()
        WHERE master_id = $2
      `,
      [primaryUserId, secondaryUserId]
    )
    return
  }
  const { preferred, fallback } = choosePreferredRow(primaryRow, secondaryRow)
  await db.query(
    `
      UPDATE marketing_repeat_settings
      SET enabled = COALESCE($2, enabled),
          channel = COALESCE(NULLIF($3, ''), NULLIF($4, ''), channel),
          include_link = COALESCE($5, include_link),
          include_unsubscribe = COALESCE($6, include_unsubscribe),
          intervals = COALESCE($7, $8, intervals),
          template = COALESCE(NULLIF($9, ''), NULLIF($10, ''), template),
          updated_at = NOW()
      WHERE master_id = $1
    `,
    [
      primaryUserId,
      preferred?.enabled ?? fallback?.enabled ?? false,
      normalizeText(preferred?.channel),
      normalizeText(fallback?.channel),
      preferred?.include_link ?? fallback?.include_link ?? true,
      preferred?.include_unsubscribe ?? fallback?.include_unsubscribe ?? true,
      preferred?.intervals ?? null,
      fallback?.intervals ?? null,
      normalizeText(preferred?.template),
      normalizeText(fallback?.template),
    ]
  )
  await db.query(`DELETE FROM marketing_repeat_settings WHERE master_id = $1`, [secondaryUserId])
}

const moveRowsWithConflictHandling = async ({
  db,
  table,
  columns,
  userColumns,
  conflictColumns,
  primaryUserId,
  secondaryUserId,
}) => {
  if (!Array.isArray(columns) || columns.length === 0) return
  const insertWhereClause = userColumns
    .map((column) => `${column} = $2::text`)
    .join(' OR ')
  const deleteWhereClause = userColumns
    .map((column) => `${column} = $1::text`)
    .join(' OR ')
  const transformedSelect = columns
    .map((column) =>
      userColumns.includes(column)
        ? `CASE WHEN ${column} = $2::text THEN $1::text ELSE ${column} END AS ${column}`
        : column
    )
    .join(', ')
  await db.query(
    `
      INSERT INTO ${table} (${columns.join(', ')})
      SELECT ${transformedSelect}
      FROM ${table}
      WHERE ${insertWhereClause}
      ON CONFLICT (${conflictColumns.join(', ')}) DO NOTHING
    `,
    [primaryUserId, secondaryUserId]
  )
  await db.query(
    `
      DELETE FROM ${table}
      WHERE ${deleteWhereClause}
    `,
    [secondaryUserId]
  )
}

const mergeRequestResponses = async (db, primaryUserId, secondaryUserId) => {
  const duplicates = await db.query(
    `
      SELECT
        s.id AS "secondaryId",
        p.id AS "primaryId"
      FROM request_responses s
      JOIN request_responses p
        ON p.request_id = s.request_id
       AND p.master_id = $1
      WHERE s.master_id = $2
    `,
    [primaryUserId, secondaryUserId]
  )

  for (const row of duplicates.rows) {
    const secondaryId = Number(row.secondaryId)
    const primaryId = Number(row.primaryId)
    if (!secondaryId || !primaryId) continue
    await db.query(
      `
        UPDATE service_bookings
        SET response_id = $1,
            updated_at = NOW()
        WHERE response_id = $2
      `,
      [primaryId, secondaryId]
    )
    await db.query(
      `
        UPDATE chats
        SET response_id = $1,
            updated_at = NOW()
        WHERE response_id = $2
      `,
      [primaryId, secondaryId]
    )
    await db.query(
      `
        UPDATE chat_contexts
        SET response_id = $1,
            updated_at = NOW()
        WHERE response_id = $2
      `,
      [primaryId, secondaryId]
    )
    await db.query(`DELETE FROM request_responses WHERE id = $1`, [secondaryId])
  }

  await db.query(
    `
      UPDATE request_responses
      SET master_id = $1,
          updated_at = NOW()
      WHERE master_id = $2
    `,
    [primaryUserId, secondaryUserId]
  )
}

const mergeChatMembersInto = async (db, { sourceChatId, targetChatId, primaryUserId, secondaryUserId }) => {
  await db.query(
    `
      WITH source_members AS (
        SELECT
          CASE WHEN user_id = $3 THEN $2 ELSE user_id END AS merged_user_id,
          BOOL_OR(role = 'master') AS has_master_role,
          MAX(COALESCE(last_read_message_id, 0)) AS max_last_read_message_id,
          MAX(COALESCE(unread_count, 0)) AS max_unread_count,
          MAX(COALESCE(muted_until, 'epoch'::timestamptz)) AS max_muted_until,
          MIN(created_at) AS min_created_at
        FROM chat_members
        WHERE chat_id = $4
        GROUP BY 1
      )
      INSERT INTO chat_members (
        chat_id,
        user_id,
        role,
        last_read_message_id,
        unread_count,
        muted_until,
        created_at,
        updated_at
      )
      SELECT
        $1,
        merged_user_id,
        CASE WHEN has_master_role THEN 'master' ELSE 'client' END,
        NULLIF(max_last_read_message_id, 0),
        max_unread_count,
        NULLIF(max_muted_until, 'epoch'::timestamptz),
        min_created_at,
        NOW()
      FROM source_members
      ON CONFLICT (chat_id, user_id) DO UPDATE
      SET role = CASE
            WHEN chat_members.role = 'master' OR EXCLUDED.role = 'master'
              THEN 'master'
            ELSE chat_members.role
          END,
          unread_count = GREATEST(chat_members.unread_count, EXCLUDED.unread_count),
          last_read_message_id = NULLIF(
            GREATEST(
              COALESCE(chat_members.last_read_message_id, 0),
              COALESCE(EXCLUDED.last_read_message_id, 0)
            ),
            0
          ),
          muted_until = GREATEST(
            COALESCE(chat_members.muted_until, 'epoch'::timestamptz),
            COALESCE(EXCLUDED.muted_until, 'epoch'::timestamptz)
          ),
          updated_at = NOW()
    `,
    [targetChatId, primaryUserId, secondaryUserId, sourceChatId]
  )
}

const refreshChatLastMessage = async (db, chatId) => {
  await db.query(
    `
      UPDATE chats
      SET last_message_id = lm.id,
          last_message_at = lm.created_at,
          updated_at = NOW()
      FROM LATERAL (
        SELECT id, created_at
        FROM chat_messages
        WHERE chat_id = $1
        ORDER BY id DESC
        LIMIT 1
      ) lm
      WHERE chats.id = $1
    `,
    [chatId]
  )
}

const mergeChats = async (db, primaryUserId, secondaryUserId) => {
  const chatsResult = await db.query(
    `
      SELECT
        id,
        context_type AS "contextType",
        context_id AS "contextId",
        client_id AS "clientId",
        master_id AS "masterId"
      FROM chats
      WHERE client_id = $1
         OR master_id = $1
      ORDER BY id ASC
    `,
    [secondaryUserId]
  )

  for (const chat of chatsResult.rows) {
    const sourceChatId = Number(chat.id)
    if (!sourceChatId) continue
    const nextClientId =
      normalizeText(chat.clientId) === secondaryUserId ? primaryUserId : normalizeText(chat.clientId)
    const nextMasterId =
      normalizeText(chat.masterId) === secondaryUserId ? primaryUserId : normalizeText(chat.masterId)

    const targetResult = await db.query(
      `
        SELECT id
        FROM chats
        WHERE context_type = $1
          AND context_id = $2
          AND client_id = $3
          AND master_id = $4
        LIMIT 1
      `,
      [chat.contextType, chat.contextId, nextClientId, nextMasterId]
    )
    const existingChatId = Number(targetResult.rows[0]?.id ?? 0) || null

    if (existingChatId && existingChatId !== sourceChatId) {
      await mergeChatMembersInto(db, {
        sourceChatId,
        targetChatId: existingChatId,
        primaryUserId,
        secondaryUserId,
      })
      await db.query(
        `
          UPDATE chat_messages
          SET chat_id = $1,
              sender_id = CASE WHEN sender_id = $3 THEN $2 ELSE sender_id END
          WHERE chat_id = $4
        `,
        [existingChatId, primaryUserId, secondaryUserId, sourceChatId]
      )
      await db.query(
        `
          INSERT INTO chat_contexts (
            chat_id,
            context_type,
            context_id,
            request_id,
            response_id,
            booking_id,
            created_at,
            updated_at
          )
          SELECT
            $1,
            context_type,
            context_id,
            request_id,
            response_id,
            booking_id,
            created_at,
            NOW()
          FROM chat_contexts
          WHERE chat_id = $2
          ON CONFLICT (chat_id, context_type, context_id) DO UPDATE
          SET request_id = COALESCE(chat_contexts.request_id, EXCLUDED.request_id),
              response_id = COALESCE(chat_contexts.response_id, EXCLUDED.response_id),
              booking_id = COALESCE(chat_contexts.booking_id, EXCLUDED.booking_id),
              updated_at = NOW()
        `,
        [existingChatId, sourceChatId]
      )
      await db.query(`DELETE FROM chats WHERE id = $1`, [sourceChatId])
      await refreshChatLastMessage(db, existingChatId)
      continue
    }

    await mergeChatMembersInto(db, {
      sourceChatId,
      targetChatId: sourceChatId,
      primaryUserId,
      secondaryUserId,
    })
    await db.query(
      `
        DELETE FROM chat_members
        WHERE chat_id = $1
          AND user_id = $2
      `,
      [sourceChatId, secondaryUserId]
    )
    await db.query(
      `
        UPDATE chat_messages
        SET sender_id = $1
        WHERE chat_id = $2
          AND sender_id = $3
      `,
      [primaryUserId, sourceChatId, secondaryUserId]
    )
    await db.query(
      `
        UPDATE chats
        SET client_id = $2,
            master_id = $3,
            updated_at = NOW()
        WHERE id = $1
      `,
      [sourceChatId, nextClientId, nextMasterId]
    )
    await refreshChatLastMessage(db, sourceChatId)
  }
}

const mergeUserAccounts = async ({
  db,
  primaryUserId,
  secondaryUserId,
  sourcePlatform = null,
  targetPlatform = null,
  selectionReason = null,
}) => {
  const primary = normalizeText(primaryUserId)
  const secondary = normalizeText(secondaryUserId)
  const normalizedSelectionReason = normalizeText(selectionReason)
  if (!primary || !secondary || primary === secondary) {
    return { merged: false }
  }

  const existsResult = await db.query(
    `
      SELECT user_id AS "userId"
      FROM users
      WHERE user_id = ANY($1::text[])
    `,
    [[primary, secondary]]
  )
  const userIds = new Set(existsResult.rows.map((row) => normalizeText(row.userId)).filter(Boolean))
  if (!userIds.has(primary) || !userIds.has(secondary)) {
    return { merged: false }
  }

  await mergeUserAddressRow(db, primary, secondary)
  await mergeUserLocationRow(db, primary, secondary)
  await mergeMasterProfileRow(db, primary, secondary)
  await mergeMasterShowcaseRow(db, primary, secondary)
  await mergeClientTrustScoreRow(db, primary, secondary)
  await mergeRepeatSettingsRow(db, primary, secondary)

  await db.query(`UPDATE master_reviews SET master_id = $1 WHERE master_id = $2`, [primary, secondary])
  await db.query(`UPDATE master_reviews SET reviewer_id = $1 WHERE reviewer_id = $2`, [primary, secondary])
  await db.query(`UPDATE marketing_repeat_log SET master_id = $1 WHERE master_id = $2`, [primary, secondary])
  await db.query(`UPDATE marketing_repeat_log SET client_id = $1 WHERE client_id = $2`, [primary, secondary])
  await db.query(`UPDATE master_promotions SET master_id = $1 WHERE master_id = $2`, [primary, secondary])
  await db.query(`UPDATE marketing_campaigns SET master_id = $1 WHERE master_id = $2`, [primary, secondary])
  await db.query(`UPDATE master_stories SET master_id = $1 WHERE master_id = $2`, [primary, secondary])
  await db.query(`UPDATE service_requests SET user_id = $1 WHERE user_id = $2`, [primary, secondary])
  await db.query(`UPDATE service_bookings SET client_id = $1 WHERE client_id = $2`, [primary, secondary])
  await db.query(`UPDATE service_bookings SET master_id = $1 WHERE master_id = $2`, [primary, secondary])
  await db.query(`UPDATE client_trust_events SET user_id = $1 WHERE user_id = $2`, [primary, secondary])
  await db.query(`UPDATE chat_messages SET sender_id = $1 WHERE sender_id = $2`, [primary, secondary])

  await moveRowsWithConflictHandling({
    db,
    table: 'master_followers',
    columns: [
      'master_id',
      'follower_id',
      'created_at',
      'marketing_opt_in',
      'marketing_opt_in_at',
      'marketing_opt_out_at',
    ],
    userColumns: ['master_id', 'follower_id'],
    conflictColumns: ['master_id', 'follower_id'],
    primaryUserId: primary,
    secondaryUserId: secondary,
  })
  await moveRowsWithConflictHandling({
    db,
    table: 'master_marketing_subscriptions',
    columns: [
      'master_id',
      'subscriber_id',
      'opt_in',
      'opt_in_at',
      'opt_out_at',
      'created_at',
    ],
    userColumns: ['master_id', 'subscriber_id'],
    conflictColumns: ['master_id', 'subscriber_id'],
    primaryUserId: primary,
    secondaryUserId: secondary,
  })
  await moveRowsWithConflictHandling({
    db,
    table: 'marketing_campaign_recipients',
    columns: ['campaign_id', 'client_id', 'channel', 'sent_at'],
    userColumns: ['client_id'],
    conflictColumns: ['campaign_id', 'client_id'],
    primaryUserId: primary,
    secondaryUserId: secondary,
  })
  await moveRowsWithConflictHandling({
    db,
    table: 'master_profile_views',
    columns: ['master_id', 'viewer_id', 'view_date', 'created_at'],
    userColumns: ['master_id', 'viewer_id'],
    conflictColumns: ['master_id', 'viewer_id', 'view_date'],
    primaryUserId: primary,
    secondaryUserId: secondary,
  })
  await moveRowsWithConflictHandling({
    db,
    table: 'master_story_views',
    columns: ['story_id', 'viewer_id', 'created_at'],
    userColumns: ['viewer_id'],
    conflictColumns: ['story_id', 'viewer_id'],
    primaryUserId: primary,
    secondaryUserId: secondary,
  })
  await moveRowsWithConflictHandling({
    db,
    table: 'request_dispatches',
    columns: [
      'request_id',
      'master_id',
      'batch',
      'status',
      'sent_at',
      'expires_at',
      'responded_at',
      'created_at',
      'updated_at',
    ],
    userColumns: ['master_id'],
    conflictColumns: ['request_id', 'master_id'],
    primaryUserId: primary,
    secondaryUserId: secondary,
  })

  await mergeRequestResponses(db, primary, secondary)
  await mergeChats(db, primary, secondary)

  await db.query(
    `
      INSERT INTO chat_members (
        chat_id,
        user_id,
        role,
        last_read_message_id,
        unread_count,
        muted_until,
        created_at,
        updated_at
      )
      SELECT
        chat_id,
        $1,
        role,
        last_read_message_id,
        unread_count,
        muted_until,
        created_at,
        NOW()
      FROM chat_members
      WHERE user_id = $2
      ON CONFLICT (chat_id, user_id) DO NOTHING
    `,
    [primary, secondary]
  )
  await db.query(`DELETE FROM chat_members WHERE user_id = $1`, [secondary])

  await db.query(
    `
      DELETE FROM user_identities source
      USING user_identities primary_identity
      WHERE source.internal_user_id = $2
        AND primary_identity.internal_user_id = $1
        AND source.platform = primary_identity.platform
    `,
    [primary, secondary]
  )
  await db.query(
    `
      UPDATE user_identities
      SET internal_user_id = $1,
          linked_at = COALESCE(linked_at, NOW()),
          updated_at = NOW()
      WHERE internal_user_id = $2
    `,
    [primary, secondary]
  )

  await db.query(
    `
      UPDATE users primary_user
      SET first_name = COALESCE(primary_user.first_name, secondary_user.first_name),
          last_name = COALESCE(primary_user.last_name, secondary_user.last_name),
          username = COALESCE(primary_user.username, secondary_user.username),
          language_code = COALESCE(primary_user.language_code, secondary_user.language_code),
          avatar_url = COALESCE(primary_user.avatar_url, secondary_user.avatar_url),
          app_role = COALESCE(primary_user.app_role, secondary_user.app_role),
          role_selected_at = COALESCE(primary_user.role_selected_at, secondary_user.role_selected_at),
          role_changed_at = COALESCE(primary_user.role_changed_at, secondary_user.role_changed_at),
          is_blocked = primary_user.is_blocked OR secondary_user.is_blocked,
          blocked_reason = COALESCE(primary_user.blocked_reason, secondary_user.blocked_reason),
          blocked_at = COALESCE(primary_user.blocked_at, secondary_user.blocked_at),
          updated_at = NOW()
      FROM users secondary_user
      WHERE primary_user.user_id = $1
        AND secondary_user.user_id = $2
    `,
    [primary, secondary]
  )

  await db.query(`DELETE FROM users WHERE user_id = $1`, [secondary])

  await db.query(
    `
      INSERT INTO account_merge_audit (
        primary_user_id,
        secondary_user_id,
        source_platform,
        target_platform,
        selection_reason,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
    `,
    [primary, secondary, sourcePlatform, targetPlatform, normalizedSelectionReason]
  )

  return { merged: true }
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

const loadUserBlockStatus = async (userId) => {
  const result = await pool.query(
    `
      SELECT is_blocked AS "isBlocked", blocked_reason AS "blockedReason"
      FROM users
      WHERE user_id = $1
    `,
    [userId]
  )
  return result.rows[0] ?? { isBlocked: false, blockedReason: null }
}

const ensureUserNotBlocked = async (userId, res) => {
  const block = await loadUserBlockStatus(userId)
  if (block?.isBlocked) {
    res.status(403).json({ error: 'user_blocked' })
    return false
  }
  return true
}

const notifyMasterAboutBlockedClient = async ({ clientId, masterId }) => {
  try {
    const chatResult = await pool.query(
      `
        SELECT id
        FROM chats
        WHERE client_id = $1
          AND master_id = $2
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      `,
      [clientId, masterId]
    )
    const chatId = chatResult.rows[0]?.id ?? null
    if (chatId) {
      const meta = { event: 'client_blocked', clientId }
      const messageResult = await insertSystemMessage({
        chatId,
        body: BLOCKED_CLIENT_NOTICE,
        meta,
        actorId: null,
        audience: 'master',
      })
      const messagePayload = {
        id: messageResult.id,
        chatId,
        senderId: null,
        type: 'system',
        body: BLOCKED_CLIENT_NOTICE,
        meta,
        attachmentUrl: null,
        createdAt: messageResult.createdAt,
      }
      void notifyChatMembers(
        chatId,
        { type: 'message:new', chatId, message: messagePayload },
        { audience: 'master' }
      )
      void sendChatNotification({
        chatId,
        audience: 'master',
        title: 'Клиент заблокирован',
        text: BLOCKED_CLIENT_NOTICE,
      })
      return
    }
    await sendTelegramMessage({
      recipientId: masterId,
      text: BLOCKED_CLIENT_NOTICE,
    })
  } catch (error) {
    console.error('Failed to notify master about blocked client:', error)
  }
}

const blockUserForever = async ({ userId, reason }) => {
  await pool.query(
    `
      UPDATE users
      SET is_blocked = TRUE,
          blocked_reason = $2,
          blocked_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId, reason]
  )
}

const evaluateClientSpamBlock = async (clientId) => {
  if (!clientId) return
  const blockStatus = await loadUserBlockStatus(clientId)
  if (blockStatus?.isBlocked) return

  const trustRow = await loadClientTrustScore(clientId)
  const trustScore =
    typeof trustRow?.score === 'number' ? trustRow.score : TRUST_BASE_SCORE
  if (trustScore > 50) return

  const result = await pool.query(
    `
      SELECT
        COUNT(*)::int AS count,
        ARRAY_AGG(DISTINCT master_id) AS "masterIds"
      FROM service_bookings
      WHERE client_id = $1
        AND status = 'confirmed'
        AND created_at >= DATE_TRUNC('day', NOW())
        AND (COALESCE(deposit_amount, 0) <= 0 OR deposit_status = 'not_required')
    `,
    [clientId]
  )
  const count = result.rows[0]?.count ?? 0
  if (count <= 4) return

  await blockUserForever({
    userId: clientId,
    reason: 'spam_confirmed_no_deposit_bookings',
  })

  const masterIds = Array.isArray(result.rows[0]?.masterIds)
    ? result.rows[0].masterIds.filter(Boolean)
    : []
  const uniqueMasterIds = Array.from(new Set(masterIds))
  await Promise.all(
    uniqueMasterIds.map((masterId) =>
      notifyMasterAboutBlockedClient({ clientId, masterId })
    )
  )
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

const loadBookingChatId = async (bookingId, options = {}) => {
  const db = options.client ?? pool
  const result = await db.query(
    `
      SELECT id
      FROM chats
      WHERE booking_id = $1
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `,
    [bookingId]
  )
  return result.rows[0]?.id ?? null
}

const loadBookingWorkflowMetaForViewer = async (bookingId, viewerRole) => {
  const result = await pool.query(
    `
      SELECT
        b.id,
        b.status,
        b.service_price AS "servicePrice",
        b.proposed_price AS "proposedPrice",
        b.service_duration AS "serviceDuration",
        b.scheduled_at AS "scheduledAt",
        b.cancel_window_hours AS "cancelWindowHours",
        b.deposit_percent AS "depositPercent",
        b.deposit_amount AS "depositAmount",
        b.deposit_status AS "depositStatus",
        b.deposit_hold_expires_at AS "depositHoldExpiresAt",
        b.reschedule_proposed_by AS "rescheduleProposedBy",
        b.reschedule_proposed_time AS "rescheduleProposedTime",
        b.outcome,
        mr.id AS "reviewId"
      FROM service_bookings b
      LEFT JOIN master_reviews mr ON mr.booking_id = b.id
      WHERE b.id = $1
    `,
    [bookingId]
  )
  const booking = result.rows[0]
  if (!booking) return null
  return buildBookingWorkflowMeta(booking, viewerRole)
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
      WITH resolved AS (
        SELECT
          $1::int AS chat_id,
          $2::text AS context_type,
          $3::int AS context_id,
          $4::int AS request_id,
          (SELECT id FROM service_bookings WHERE id = $5) AS booking_id,
          $6::int AS response_id
      )
      INSERT INTO chat_contexts (
        chat_id,
        context_type,
        context_id,
        request_id,
        booking_id,
        response_id
      )
      SELECT
        chat_id,
        context_type,
        context_id,
        request_id,
        booking_id,
        response_id
      FROM resolved
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
  { bookingId, clientId, masterId, serviceName, actorId, requestId, responseId },
  options = {}
) => {
  const { client: externalClient, suppressSystemMessage } = options ?? {}
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

    let resolvedRequestId = requestId ?? null
    let resolvedResponseId = responseId ?? null
    if (!resolvedRequestId && !resolvedResponseId) {
      const contextResult = await client.query(
        `
          SELECT
            request_id AS "requestId",
            response_id AS "responseId"
          FROM service_bookings
          WHERE id = $1
        `,
        [bookingId]
      )
      const contextRow = contextResult.rows[0] ?? {}
      const loadedRequestId = parseOptionalInt(contextRow.requestId)
      const loadedResponseId = parseOptionalInt(contextRow.responseId)
      if (loadedRequestId) {
        resolvedRequestId = loadedRequestId
      }
      if (loadedResponseId) {
        resolvedResponseId = loadedResponseId
      }
    }

    let chatId = existingChat?.id ?? null
    let isNew = false
    if (chatId) {
      await client.query(
        `
          UPDATE chats
          SET context_type = 'booking',
              context_id = $1,
              booking_id = $1,
              request_id = $3,
              response_id = $4,
              updated_at = NOW()
          WHERE id = $2
        `,
        [bookingId, chatId, resolvedRequestId, resolvedResponseId]
      )
    } else {
      const insertResult = await client.query(
        `
          INSERT INTO chats (
            context_type,
            context_id,
            booking_id,
            request_id,
            response_id,
            client_id,
            master_id,
            status
          )
          VALUES ('booking', $1, $1, $2, $3, $4, $5, 'active')
          RETURNING id
        `,
        [bookingId, resolvedRequestId, resolvedResponseId, clientId, masterId]
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

    if (resolvedRequestId) {
      await upsertChatContext(
        {
          chatId,
          contextType: 'request',
          contextId: resolvedRequestId,
          requestId: resolvedRequestId,
          responseId: resolvedResponseId ?? null,
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
        requestId: resolvedRequestId ?? null,
        responseId: resolvedResponseId ?? null,
      },
      { client }
    )

    let systemMessageId = null
    let systemMessageCreatedAt = null
    let systemMessage = null

    if ((isNew || contextChanged) && !suppressSystemMessage) {
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
    const visibilityKey =
      normalizedAudience === 'master_only' || normalizedAudience === 'master'
        ? 'master_only'
        : normalizedAudience === 'client_only' || normalizedAudience === 'client'
          ? 'client_only'
          : ''
    let metaPayload =
      meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...meta } : null
    if (visibilityKey) {
      const currentVisibility =
        metaPayload?.visibility || metaPayload?.audience || ''
      if (!currentVisibility) {
        metaPayload = { ...(metaPayload ?? {}), visibility: visibilityKey }
      }
    }
    const messageResult = await db.query(
      `
        INSERT INTO chat_messages (chat_id, sender_id, type, body, meta)
        VALUES ($1, NULL, 'system', $2, $3)
        RETURNING id, created_at AS "createdAt"
      `,
      [chatId, body ?? null, metaPayload]
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

const insertChatTextMessage = async (
  { chatId, body, meta, senderId },
  options = {}
) => {
  const db = options.client ?? pool
  const shouldManageTransaction = !options.client
  if (shouldManageTransaction) {
    await db.query('BEGIN')
  }
  try {
    const metaPayload =
      meta && typeof meta === 'object' && !Array.isArray(meta) ? { ...meta } : null
    const messageResult = await db.query(
      `
        INSERT INTO chat_messages (chat_id, sender_id, type, body, meta)
        VALUES ($1, $2, 'text', $3, $4)
        RETURNING id, created_at AS "createdAt"
      `,
      [chatId, senderId ?? null, body ?? null, metaPayload]
    )
    const messageId = messageResult.rows[0]?.id ?? null
    const createdAt = messageResult.rows[0]?.createdAt ?? null
    if (!messageId) {
      throw new Error('message_insert_failed')
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
              ELSE unread_count + 1
            END,
            last_read_message_id = CASE
              WHEN user_id = $2 THEN $3
              ELSE last_read_message_id
            END,
            updated_at = NOW()
        WHERE chat_id = $1
      `,
      [chatId, senderId ?? null, messageId]
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
  const supportIdentityResult = await pool.query(
    `
      SELECT DISTINCT internal_user_id AS "userId"
      FROM user_identities
      WHERE external_user_id = ANY($1::text[])
    `,
    [SUPPORT_AGENT_IDS]
  )
  const resolvedSupportIds = Array.from(
    new Set([
      ...SUPPORT_AGENT_IDS,
      ...supportIdentityResult.rows
        .map((row) => normalizeText(row.userId))
        .filter(Boolean),
    ])
  )
  if (resolvedSupportIds.length === 0) {
    throw new Error('support_agents_missing')
  }
  const supportMembers = resolvedSupportIds.filter((id) => id !== userId)
  const primarySupportId = supportMembers[0] ?? resolvedSupportIds[0]
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
        cancel_window_hours AS "cancelWindowHours",
        deposit_percent AS "depositPercent",
        deposit_type AS "depositType",
        deposit_fixed AS "depositFixed",
        deposit_details AS "depositDetails",
        deposit_qr_path AS "depositQrPath",
        works_at_client AS "worksAtClient",
        works_at_master AS "worksAtMaster"
      FROM master_profiles
      WHERE user_id = $1
    `,
    [userId]
  )

  return result.rows[0] ?? null
}

const validateBookingSlotAvailability = async ({
  masterId,
  scheduledDate,
  serviceDuration,
  excludeBookingId,
}) => {
  const profile = await loadMasterProfile(masterId)
  if (!profile) return { ok: false, error: 'master_not_found' }

  const scheduleDays = normalizeDayKeys(profile.scheduleDays)
  const scheduleStartMinutes = parseTimeToMinutes(profile.scheduleStart)
  const scheduleEndMinutes = parseTimeToMinutes(profile.scheduleEnd)

  if (
    scheduleDays.length === 0 ||
    scheduleStartMinutes === null ||
    scheduleEndMinutes === null ||
    scheduleStartMinutes >= scheduleEndMinutes
  ) {
    return { ok: false, error: 'schedule_unavailable' }
  }

  const dayKey = getDayKeyFromDate(scheduledDate)
  if (!scheduleDays.includes(dayKey)) {
    return { ok: false, error: 'day_unavailable' }
  }

  const durationMinutes = resolveBookingDurationMinutes(serviceDuration)
  const scheduledMinutes =
    scheduledDate.getHours() * 60 + scheduledDate.getMinutes()
  if (
    scheduledMinutes < scheduleStartMinutes ||
    scheduledMinutes + durationMinutes > scheduleEndMinutes
  ) {
    return { ok: false, error: 'time_unavailable' }
  }

  if (scheduledDate.getTime() <= Date.now()) {
    return { ok: false, error: 'time_unavailable' }
  }

  const { start: dayStart, end: dayEnd } = buildDayBounds(scheduledDate)
  const existing = await pool.query(
    `
      SELECT
        id,
        scheduled_at AS "scheduledAt",
        service_duration AS "serviceDuration",
        reschedule_proposed_time AS "rescheduleProposedTime"
      FROM service_bookings
      WHERE master_id = $1
        AND status NOT IN ('declined', 'cancelled')
        AND (
          (scheduled_at >= $2 AND scheduled_at < $3)
          OR (reschedule_proposed_time >= $2 AND reschedule_proposed_time < $3)
        )
        AND ($4::int IS NULL OR id <> $4)
    `,
    [
      masterId,
      dayStart.toISOString(),
      dayEnd.toISOString(),
      excludeBookingId ?? null,
    ]
  )

  const targetStart = scheduledDate.getTime()
  const targetEnd = targetStart + durationMinutes * 60 * 1000
  const hasConflict = existing.rows.some((row) => {
    const rowDuration = resolveBookingDurationMinutes(row.serviceDuration)
    const starts = []
    if (row.scheduledAt) {
      const startMs = new Date(row.scheduledAt).getTime()
      if (!Number.isNaN(startMs)) starts.push(startMs)
    }
    if (row.rescheduleProposedTime) {
      const proposedMs = new Date(row.rescheduleProposedTime).getTime()
      if (!Number.isNaN(proposedMs)) starts.push(proposedMs)
    }
    return starts.some((startMs) => {
      const endMs = startMs + rowDuration * 60 * 1000
      return targetStart < endMs && targetEnd > startMs
    })
  })

  if (hasConflict) {
    return { ok: false, error: 'time_unavailable' }
  }

  return { ok: true, profile }
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
        time_windows AS "timeWindows",
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

const formatTimeLeftLabel = (expiresAt) => {
  if (!expiresAt) return ''
  const parsed = new Date(expiresAt)
  if (Number.isNaN(parsed.getTime())) return ''
  const diffMs = parsed.getTime() - Date.now()
  if (diffMs <= 0) return ''
  const minutesTotal = Math.ceil(diffMs / 60000)
  const hours = Math.floor(minutesTotal / 60)
  const minutes = minutesTotal % 60
  if (hours <= 0) return `${minutesTotal} мин`
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`
}

const formatPriceLabel = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`
}

const buildNextAction = ({ id, title, subtitle, tone, deadlineAt }) => {
  if (!id || !title) return null
  return {
    id,
    title,
    subtitle: subtitle || null,
    tone: tone || null,
    deadlineAt: deadlineAt || null,
  }
}

const resolveBookingBasePrice = (booking) =>
  typeof booking?.servicePrice === 'number'
    ? booking.servicePrice
    : typeof booking?.proposedPrice === 'number'
      ? booking.proposedPrice
      : null

const resolveBookingDepositAmount = (booking) => {
  const basePrice = resolveBookingBasePrice(booking)
  const depositPercent =
    typeof booking?.depositPercent === 'number'
      ? Math.max(0, Math.round(booking.depositPercent))
      : 0
  if (typeof booking?.depositAmount === 'number' && booking.depositAmount > 0) {
    return booking.depositAmount
  }
  if (basePrice && depositPercent > 0) {
    return Math.round((basePrice * depositPercent) / 100)
  }
  if (typeof booking?.depositAmount === 'number') {
    return booking.depositAmount
  }
  return 0
}

const resolveBookingDepositStatus = (booking, depositAmount) => {
  const normalizedStatus = normalizeText(booking?.depositStatus)
  if (
    normalizedStatus &&
    normalizedStatus !== 'not_required'
  ) {
    return normalizedStatus
  }
  if (normalizeText(booking?.status) === 'confirmed' && depositAmount > 0) {
    return 'pending'
  }
  return normalizedStatus || 'not_required'
}

const isBookingOutcomePending = (booking) => {
  if (!booking || normalizeText(booking.status) !== 'confirmed' || booking.outcome) {
    return false
  }
  const scheduledAt = booking.scheduledAt ? new Date(booking.scheduledAt) : null
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return false
  const durationMinutes =
    typeof booking.serviceDuration === 'number' && booking.serviceDuration > 0
      ? booking.serviceDuration
      : BOOKING_DURATION_FALLBACK_MINUTES
  return scheduledAt.getTime() + durationMinutes * 60 * 1000 <= Date.now()
}

const buildBookingAvailableActions = (booking, viewerRole) => {
  if (!booking || !booking.status) return []
  const status = normalizeText(booking.status)
  const role = viewerRole === 'master' ? 'master' : 'client'
  if (!status) return []

  const actions = []
  if (status === 'cancelled' || status === 'declined') {
    if (role === 'client') {
      actions.push('client-delete')
    }
    return actions
  }
  const hasServicePrice =
    typeof booking.servicePrice === 'number' ||
    typeof booking.proposedPrice === 'number'
  const depositAmount = resolveBookingDepositAmount(booking)
  const depositStatus = resolveBookingDepositStatus(booking, depositAmount)
  const rescheduleTime = booking.rescheduleProposedTime
  const rescheduleBy = normalizeText(booking.rescheduleProposedBy)
  const nowMs = Date.now()
  const scheduledMs = booking.scheduledAt ? new Date(booking.scheduledAt).getTime() : NaN
  const hasScheduledAt = Number.isFinite(scheduledMs)
  const timeUntilMs = hasScheduledAt ? scheduledMs - nowMs : null
  const cancelWindowHours = clampValue(
    parseOptionalInt(booking.cancelWindowHours) ?? BOOKING_FREE_CANCEL_HOURS,
    0,
    72
  )
  const cancelWindowMs = cancelWindowHours * 60 * 60 * 1000

  if (rescheduleTime && rescheduleBy && rescheduleBy !== role) {
    actions.push('reschedule-accept', 'reschedule-decline')
  } else if (rescheduleTime && rescheduleBy && rescheduleBy === role) {
    actions.push('reschedule-cancel')
  }

  if (role === 'master') {
    if (status === 'pending' && hasServicePrice) {
      actions.push('master-accept')
    }
    if (!hasServicePrice && ['pending', 'price_pending', 'price_proposed'].includes(status)) {
      actions.push('master-propose-price')
    }
    if (['pending', 'price_pending', 'price_proposed'].includes(status)) {
      actions.push('master-decline')
    }
    if (status === 'confirmed' && depositStatus === 'submitted') {
      actions.push('master-deposit-confirm', 'master-deposit-reject')
    }
    if (isBookingOutcomePending(booking)) {
      actions.push('set-outcome')
    }
  } else {
    if (status === 'price_proposed' && typeof booking.proposedPrice === 'number') {
      actions.push('client-accept-price', 'client-decline-price')
    }
    if (
      status === 'confirmed' &&
      depositAmount > 0 &&
      ['pending', 'rejected'].includes(depositStatus)
    ) {
      actions.push('client-deposit-submit')
    }
    if (['pending', 'price_pending', 'price_proposed'].includes(status)) {
      actions.push('client-cancel')
    }
    if (
      status === 'confirmed' &&
      !rescheduleTime &&
      typeof timeUntilMs === 'number' &&
      timeUntilMs > 0
    ) {
      if (timeUntilMs >= cancelWindowMs) {
        actions.push('reschedule-propose')
      }
      if (cancelWindowMs === 0 || timeUntilMs < cancelWindowMs) {
        actions.push('client-cancel')
      }
    }
    const hasReviewField =
      Object.prototype.hasOwnProperty.call(booking, 'reviewId')
    if (hasReviewField && normalizeText(status) === 'confirmed' && !booking.reviewId) {
      const scheduledAt = booking.scheduledAt
        ? new Date(booking.scheduledAt).getTime()
        : NaN
      if (Number.isFinite(scheduledAt) && scheduledAt <= Date.now()) {
        actions.push('leave_review')
      }
    }
  }

  return Array.from(new Set(actions))
}

const resolveBookingWorkflowStage = (booking) => {
  if (!booking || !booking.status) return null
  const status = normalizeText(booking.status)
  if (!status) return null
  const hasServicePrice =
    typeof booking.servicePrice === 'number' ||
    typeof booking.proposedPrice === 'number'
  const depositAmount = resolveBookingDepositAmount(booking)
  const depositStatus = resolveBookingDepositStatus(booking, depositAmount)

  if (status === 'pending') {
    return hasServicePrice
      ? 'pending_waiting_master_confirmation'
      : 'pending_waiting_master_price'
  }
  if (status === 'price_pending') return 'pending_waiting_master_price'
  if (status === 'price_proposed') return 'price_offered_to_client'
  if (status === 'confirmed') {
    if (depositAmount > 0) {
      if (depositStatus === 'submitted') return 'confirmed_deposit_submitted'
      if (depositStatus === 'pending') return 'confirmed_deposit_pending'
      if (depositStatus === 'rejected') return 'confirmed_deposit_rejected'
    }
    if (isBookingOutcomePending(booking)) return 'confirmed_awaiting_outcome'
    return 'confirmed_active'
  }
  if (status === 'cancelled' && depositStatus === 'expired') {
    return 'cancelled_deposit_expired'
  }
  if (status === 'cancelled') return 'cancelled'
  if (status === 'declined') return 'declined'
  return status
}

const buildBookingNextAction = (
  booking,
  viewerRole,
  options = {}
) => {
  if (!booking || !booking.status) return null
  const status = normalizeText(booking.status)
  if (!status || ['cancelled', 'declined'].includes(status)) return null
  const role = viewerRole === 'master' ? 'master' : 'client'
  const workflowStage =
    options.workflowStage ?? resolveBookingWorkflowStage(booking)
  const availableActions = Array.isArray(options.availableActions)
    ? options.availableActions
    : buildBookingAvailableActions(booking, role)
  const hasAction = (actionId) => availableActions.includes(actionId)
  const depositAmount = resolveBookingDepositAmount(booking)

  if (hasAction('reschedule-accept')) {
    return buildNextAction({
      id: 'reschedule_confirm',
      title: 'Подтвердить перенос',
      tone: 'alert',
    })
  }
  if (role === 'client') {
    if (hasAction('client-accept-price')) {
      const priceLabel = formatPriceLabel(
        typeof booking.proposedPrice === 'number'
          ? booking.proposedPrice
          : typeof booking.servicePrice === 'number'
            ? booking.servicePrice
            : null
      )
      return buildNextAction({
        id: 'confirm_price',
        title: 'Подтвердить цену',
        subtitle: priceLabel ? `Предложение: ${priceLabel}` : null,
        tone: 'alert',
      })
    }
    if (hasAction('client-deposit-submit')) {
      const amountLabel = formatPriceLabel(depositAmount)
      return buildNextAction({
        id: 'pay_deposit',
        title: 'Оплатить депозит',
        subtitle: amountLabel ? `Сумма: ${amountLabel}` : null,
        tone: 'alert',
        deadlineAt: booking.depositHoldExpiresAt ?? null,
      })
    }
    const hasReviewField =
      Object.prototype.hasOwnProperty.call(booking, 'reviewId')
    if (
      hasReviewField &&
      !booking.reviewId &&
      (hasAction('leave_review') || workflowStage === 'confirmed_awaiting_outcome')
    ) {
      const scheduledAt = booking.scheduledAt
        ? new Date(booking.scheduledAt).getTime()
        : NaN
      if (Number.isFinite(scheduledAt) && scheduledAt <= Date.now()) {
        return buildNextAction({
          id: 'leave_review',
          title: 'Оставить отзыв',
          tone: 'neutral',
        })
      }
    }
    return null
  }

  if (hasAction('master-accept') || hasAction('master-propose-price')) {
    const hasPrice = hasAction('master-accept')
    return buildNextAction({
      id: hasPrice ? 'confirm_booking' : 'send_price',
      title: hasPrice ? 'Подтвердить запись' : 'Предложить цену',
      tone: 'alert',
    })
  }
  if (hasAction('master-deposit-confirm')) {
    const amountLabel = formatPriceLabel(depositAmount)
    return buildNextAction({
      id: 'check_deposit',
      title: 'Проверить депозит',
      subtitle: amountLabel ? `Сумма: ${amountLabel}` : null,
      tone: 'alert',
    })
  }
  if (hasAction('set-outcome')) {
    const scheduledAt = booking.scheduledAt
      ? new Date(booking.scheduledAt)
      : null
    if (scheduledAt && !Number.isNaN(scheduledAt.getTime())) {
      const durationMinutes =
        typeof booking.serviceDuration === 'number' && booking.serviceDuration > 0
          ? booking.serviceDuration
          : BOOKING_DURATION_FALLBACK_MINUTES
      if (scheduledAt.getTime() + durationMinutes * 60 * 1000 <= Date.now()) {
        return buildNextAction({
          id: 'mark_outcome',
          title: 'Отметить визит',
          tone: 'neutral',
        })
      }
    }
  }
  return null
}

const buildBookingWorkflowMeta = (booking, viewerRole) => {
  const role = viewerRole === 'master' ? 'master' : 'client'
  const depositAmount = resolveBookingDepositAmount(booking)
  const depositStatus = resolveBookingDepositStatus(booking, depositAmount)
  const workflowStage = resolveBookingWorkflowStage(booking)
  const availableActions = buildBookingAvailableActions(booking, role)
  const nextAction = buildBookingNextAction(booking, role, {
    workflowStage,
    availableActions,
  })
  return {
    depositAmount,
    depositStatus,
    workflowStage,
    availableActions,
    nextAction,
  }
}

const buildClientRequestNextAction = (request) => {
  if (!request || request.status !== 'open') return null
  const responsesCount = Number(request.responsesCount) || 0
  if (responsesCount <= 0) return null
  return buildNextAction({
    id: 'select_master',
    title: 'Выберите мастера',
    subtitle: `Отклики: ${responsesCount}`,
    tone: 'alert',
  })
}

const buildProRequestNextAction = (request, options = {}) => {
  if (!request || request.status !== 'open') return null
  const isActive = options.isActive === true
  const missingFields = Array.isArray(options.missingFields)
    ? options.missingFields.filter(Boolean)
    : []
  if (!isActive || missingFields.length > 0) return null
  const responseStatus = normalizeText(request.responseStatus)
  const isFinal = ['accepted', 'rejected', 'expired'].includes(responseStatus)
  if (isFinal) return null
  const expiresAt = request.dispatchExpiresAt
  const hasWindow =
    expiresAt && new Date(expiresAt).getTime() > Date.now()
  const canRespond = responseStatus === 'sent' || hasWindow
  if (!canRespond) return null
  const isUpdate = responseStatus === 'sent'
  return buildNextAction({
    id: isUpdate ? 'update_response' : 'send_response',
    title: isUpdate ? 'Обновить отклик' : 'Откликнуться',
    tone: 'alert',
    deadlineAt: hasWindow ? expiresAt : null,
  })
}

const isDuplicateSystemEvent = async ({ chatId, event, bookingId }, options = {}) => {
  if (!chatId || !event || !bookingId) return false
  const db = options.client ?? pool
  const result = await db.query(
    `
      SELECT meta
      FROM chat_messages
      WHERE chat_id = $1
      ORDER BY id DESC
      LIMIT 1
    `,
    [chatId]
  )
  const meta = result.rows[0]?.meta
  if (!meta || typeof meta !== 'object') return false
  const lastEvent = typeof meta.event === 'string' ? meta.event : ''
  const rawBookingId = meta.bookingId
  const lastBookingId =
    typeof rawBookingId === 'number'
      ? rawBookingId
      : typeof rawBookingId === 'string'
        ? Number(rawBookingId)
        : null
  return (
    lastEvent === event &&
    Number.isInteger(lastBookingId) &&
    lastBookingId === bookingId
  )
}

const leadScoreLocationLabels = {
  client: 'Выезд',
  master: 'У мастера',
  any: 'Не важно',
}

const resolveLeadScoreVariant = (userId) => {
  const normalized = normalizeText(userId)
  if (!normalized) return 'A'
  let hash = 0
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % 2 === 0 ? 'A' : 'B'
}

const formatRatePercent = (value) => `${Math.round(value * 100)}%`

const loadLeadConversionStats = async (masterId) => {
  if (!masterId) {
    return {
      overall: { responses: 0, accepted: 0, rate: null },
      categories: {},
      locations: {},
      hours: {},
      weekdays: {},
    }
  }
  const since = new Date(Date.now() - LEAD_CONVERSION_WINDOW_DAYS * DAY_MS)
  const [overallResult, categoryResult, locationResult, hourResult, weekdayResult] =
    await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(*)::int AS responses,
          COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted
        FROM request_responses
        WHERE master_id = $1
          AND created_at >= $2
      `,
      [masterId, since]
    ),
    pool.query(
      `
        SELECT
          r.category_id AS "categoryId",
          COUNT(*)::int AS responses,
          COUNT(*) FILTER (WHERE rr.status = 'accepted')::int AS accepted
        FROM request_responses rr
        JOIN service_requests r ON r.id = rr.request_id
        WHERE rr.master_id = $1
          AND rr.created_at >= $2
        GROUP BY r.category_id
      `,
      [masterId, since]
    ),
    pool.query(
      `
        SELECT
          r.location_type AS "locationType",
          COUNT(*)::int AS responses,
          COUNT(*) FILTER (WHERE rr.status = 'accepted')::int AS accepted
        FROM request_responses rr
        JOIN service_requests r ON r.id = rr.request_id
        WHERE rr.master_id = $1
          AND rr.created_at >= $2
        GROUP BY r.location_type
      `,
      [masterId, since]
    ),
      pool.query(
        `
        SELECT
          EXTRACT(HOUR FROM rr.proposed_slot_at)::int AS hour,
          COUNT(*)::int AS responses,
          COUNT(*) FILTER (WHERE rr.status = 'accepted')::int AS accepted
        FROM request_responses rr
        WHERE rr.master_id = $1
          AND rr.created_at >= $2
          AND rr.proposed_slot_at IS NOT NULL
        GROUP BY hour
      `,
        [masterId, since]
      ),
      pool.query(
        `
        SELECT
          EXTRACT(DOW FROM rr.proposed_slot_at)::int AS dow,
          COUNT(*)::int AS responses,
          COUNT(*) FILTER (WHERE rr.status = 'accepted')::int AS accepted
        FROM request_responses rr
        WHERE rr.master_id = $1
          AND rr.created_at >= $2
          AND rr.proposed_slot_at IS NOT NULL
        GROUP BY dow
      `,
        [masterId, since]
      ),
    ])

  const overallRow = overallResult.rows[0] ?? {}
  const overallResponses = Number(overallRow.responses) || 0
  const overallAccepted = Number(overallRow.accepted) || 0
  const overallRate =
    overallResponses > 0 ? overallAccepted / overallResponses : null

  const categories = {}
  categoryResult.rows.forEach((row) => {
    const categoryId = normalizeText(row.categoryId)
    if (!categoryId) return
    const responses = Number(row.responses) || 0
    const accepted = Number(row.accepted) || 0
    if (responses <= 0) return
    categories[categoryId] = {
      responses,
      accepted,
      rate: accepted / responses,
    }
  })

  const locations = {}
  locationResult.rows.forEach((row) => {
    const locationType = normalizeText(row.locationType)
    if (!locationType) return
    const responses = Number(row.responses) || 0
    const accepted = Number(row.accepted) || 0
    if (responses <= 0) return
    locations[locationType] = {
      responses,
      accepted,
      rate: accepted / responses,
    }
  })

  const hours = {}
  hourResult.rows.forEach((row) => {
    const hour = Number(row.hour)
    if (!Number.isFinite(hour)) return
    const responses = Number(row.responses) || 0
    const accepted = Number(row.accepted) || 0
    if (responses <= 0) return
    hours[String(hour)] = {
      responses,
      accepted,
      rate: accepted / responses,
    }
  })

  const weekdays = {}
  const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  weekdayResult.rows.forEach((row) => {
    const dow = Number(row.dow)
    const key = weekdayKeys[dow]
    if (!key) return
    const responses = Number(row.responses) || 0
    const accepted = Number(row.accepted) || 0
    if (responses <= 0) return
    weekdays[key] = {
      responses,
      accepted,
      rate: accepted / responses,
    }
  })

  return {
    overall: { responses: overallResponses, accepted: overallAccepted, rate: overallRate },
    categories,
    locations,
    hours,
    weekdays,
  }
}

const buildLeadScore = (payload, options = {}) => {
  let score = 50
  const reasons = []
  const pushReason = (value) => {
    if (!value) return
    reasons.push(value)
  }

  if (typeof payload.distanceKm === 'number') {
    const distance = payload.distanceKm
    if (distance <= 1) {
      score += 14
      pushReason(`Очень близко (${distance} км)`)
    } else if (distance <= 3) {
      score += 10
      pushReason(`Рядом (${distance} км)`)
    } else if (distance <= 6) {
      score += 6
      pushReason(`Недалеко (${distance} км)`)
    } else if (distance >= 10) {
      score -= 4
    }
  }

  if (payload.clientTrust?.confidence) {
    const confidence = Number(payload.clientTrust.confidence) || 0
    if (confidence >= 0.7) {
      score += 8
      pushReason('Надежный клиент')
    } else if (confidence <= 0.35) {
      score -= 3
      pushReason('Новый клиент')
    }
  }

  if (payload.dateOption === 'today') {
    score += 6
    pushReason('Сегодня')
  } else if (payload.dateOption === 'tomorrow') {
    score += 3
    pushReason('Завтра')
  }

  if (payload.budget) {
    score += 2
    pushReason('Бюджет указан')
  }

  if (Array.isArray(payload.photoUrls) && payload.photoUrls.length > 0) {
    score += 2
    pushReason('Есть фото')
  }

  if (payload.details) {
    score += 1
    pushReason('Есть комментарий')
  }

  const urgency = formatTimeLeftLabel(payload.dispatchExpiresAt)
  if (urgency) {
    score += 4
    pushReason(`Срочно: ${urgency}`)
  }

  if (options.variant === 'B' && options.conversionStats) {
    const conversionStats = options.conversionStats
    const categoryStats =
      payload.categoryId && conversionStats.categories
        ? conversionStats.categories[payload.categoryId]
        : null
    if (categoryStats && categoryStats.responses >= LEAD_CONVERSION_MIN_SAMPLE) {
      const rate = categoryStats.rate
      const rateLabel = formatRatePercent(rate)
      if (rate >= 0.5) {
        score += 8
        pushReason(`Конверсия по услуге ${rateLabel}`)
      } else if (rate >= 0.32) {
        score += 4
        pushReason(`Хорошая конверсия по услуге (${rateLabel})`)
      } else if (rate <= 0.15) {
        score -= 4
        pushReason(`Низкая конверсия по услуге (${rateLabel})`)
      }
    }

    const locationKey = normalizeText(payload.locationType)
    const locationStats =
      locationKey && conversionStats.locations
        ? conversionStats.locations[locationKey]
        : null
    if (
      locationStats &&
      locationStats.responses >= LEAD_CONVERSION_LOCATION_MIN_SAMPLE
    ) {
      const rate = locationStats.rate
      const locationLabel = leadScoreLocationLabels[locationKey] ?? 'Формат'
      if (rate >= 0.5) {
        score += 3
        pushReason(`Формат «${locationLabel}» подтверждается часто`)
      } else if (rate <= 0.2) {
        score -= 2
        pushReason(`Формат «${locationLabel}» редко подтверждается`)
      }
    }
  }

  const normalizedScore = Math.min(100, Math.max(0, Math.round(score)))
  return { score: normalizedScore, reasons }
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

  const insertResult = await pool.query(
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
      RETURNING
        request_id AS "requestId",
        master_id AS "masterId",
        batch,
        sent_at AS "sentAt",
        expires_at AS "expiresAt"
    `,
    values
  )

  const inserted = Array.isArray(insertResult.rows) ? insertResult.rows : []
  inserted.forEach((row) => {
    try {
      broadcastToUser(row.masterId, {
        type: 'request:dispatch',
        requestId: row.requestId,
        batch: row.batch,
        sentAt: row.sentAt,
        dispatchExpiresAt: row.expiresAt,
      })
    } catch (error) {
      console.error('Failed to broadcast request dispatch event:', error)
    }
  })

  return { dispatched: inserted.length, expiresAt }
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

    const result = await timedQuery(
      'requests:list',
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
          r.time_windows AS "timeWindows",
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

let depositHoldCycleRunning = false

const runDepositHoldCycle = async () => {
  if (depositHoldCycleRunning) return
  depositHoldCycleRunning = true

  try {
    const candidatesResult = await pool.query(
      `
        SELECT id
        FROM service_bookings
        WHERE deposit_hold_expires_at IS NOT NULL
          AND deposit_hold_expires_at <= NOW()
          AND deposit_status IN ('pending', 'rejected')
          AND status = 'confirmed'
          AND status NOT IN ('cancelled', 'declined')
        ORDER BY deposit_hold_expires_at ASC
        LIMIT $1
      `,
      [DEPOSIT_HOLD_BATCH_LIMIT]
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
              service_name AS "serviceName"
            FROM service_bookings
            WHERE id = $1
              AND deposit_hold_expires_at IS NOT NULL
              AND deposit_hold_expires_at <= NOW()
              AND deposit_status IN ('pending', 'rejected')
              AND status = 'confirmed'
              AND status NOT IN ('cancelled', 'declined')
            FOR UPDATE
          `,
          [row.id]
        )
        const booking = bookingResult.rows[0]
        if (!booking) {
          await client.query('ROLLBACK')
          continue
        }

        await client.query(
          `
            UPDATE service_bookings
            SET status = 'cancelled',
                cancelled_by = 'system',
                cancelled_at = NOW(),
                deposit_status = 'expired',
                deposit_hold_expires_at = NULL,
                reschedule_proposed_at = NULL,
                reschedule_proposed_by = NULL,
                reschedule_proposed_time = NULL,
                reschedule_note = NULL,
                updated_at = NOW()
            WHERE id = $1
          `,
          [booking.id]
        )

        await client.query('COMMIT')

        let chatId = null
        try {
          const chatPayload = await createChatForBooking(
            {
              bookingId: booking.id,
              clientId: booking.clientId,
              masterId: booking.masterId,
              serviceName: booking.serviceName,
              actorId: null,
            },
            { suppressSystemMessage: true }
          )
          if (chatPayload?.chatId && chatPayload.isNew) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'chat:created',
              chatId: chatPayload.chatId,
              bookingId: booking.id,
            })
          }
          chatId = chatPayload?.chatId ?? null
        } catch (chatError) {
          console.error('Failed to prepare chat for deposit expiry:', chatError)
        }
        if (!chatId) continue

        const isDuplicate = await isDuplicateSystemEvent({
          chatId,
          event: 'deposit_expired',
          bookingId: booking.id,
        })
        if (!isDuplicate) {
          const body = `Слот снят: депозит не поступил за ${DEPOSIT_HOLD_MINUTES} минут.`
          const meta = {
            event: 'deposit_expired',
            bookingId: booking.id,
            serviceName: booking.serviceName ?? null,
          }
          const messageResult = await insertSystemMessage({
            chatId,
            body,
            meta,
            actorId: null,
          })
          const messagePayload = {
            id: messageResult.id,
            chatId,
            senderId: null,
            type: 'system',
            body,
            meta,
            attachmentUrl: null,
            createdAt: messageResult.createdAt,
          }
          void notifyChatMembers(chatId, {
            type: 'message:new',
            chatId,
            message: messagePayload,
          })
          void sendChatNotification({
            chatId,
            audience: 'client',
            title: 'Депозит не поступил',
            text: body,
          })
        }
      } catch (error) {
        await client.query('ROLLBACK')
        console.error('Deposit hold cycle failed:', error)
      } finally {
        client.release()
      }
    }
  } catch (error) {
    console.error('Deposit hold cycle failed:', error)
  } finally {
    depositHoldCycleRunning = false
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
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS app_role TEXT;
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role_selected_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role_changed_at TIMESTAMPTZ;
  `)

  await pool.query(`
    DO $$
    DECLARE
      constraint_name TEXT;
    BEGIN
      FOR constraint_name IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'users'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%app_role%'
      LOOP
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
      END LOOP;
    END$$;
  `)

  await pool.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_app_role_check
    CHECK (app_role IN ('client', 'pro') OR app_role IS NULL);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_identities (
      id BIGSERIAL PRIMARY KEY,
      internal_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      platform TEXT NOT NULL CHECK (platform IN ('telegram', 'vk')),
      external_user_id TEXT NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS user_identities_platform_external_idx
    ON user_identities (platform, external_user_id);
  `)

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS user_identities_internal_platform_idx
    ON user_identities (internal_user_id, platform);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS user_identities_internal_idx
    ON user_identities (internal_user_id);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_link_challenges (
      token TEXT PRIMARY KEY,
      source_internal_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      source_platform TEXT NOT NULL CHECK (source_platform IN ('telegram', 'vk')),
      target_platform TEXT NOT NULL CHECK (target_platform IN ('telegram', 'vk')),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS account_link_challenges_source_idx
    ON account_link_challenges (source_internal_user_id, created_at DESC);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS account_link_challenges_exp_idx
    ON account_link_challenges (expires_at DESC);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_merge_audit (
      id BIGSERIAL PRIMARY KEY,
      primary_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      secondary_user_id TEXT NOT NULL,
      source_platform TEXT,
      target_platform TEXT,
      selection_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE account_merge_audit
    ADD COLUMN IF NOT EXISTS selection_reason TEXT;
  `)

  await pool.query(`
    INSERT INTO user_identities (
      internal_user_id,
      platform,
      external_user_id,
      is_primary,
      linked_at,
      last_seen_at,
      created_at,
      updated_at
    )
    SELECT
      u.user_id,
      CASE WHEN u.user_id LIKE 'vk_%' THEN 'vk' ELSE 'telegram' END,
      CASE WHEN u.user_id LIKE 'vk_%' THEN SUBSTRING(u.user_id FROM 4) ELSE u.user_id END,
      TRUE,
      COALESCE(u.created_at, NOW()),
      COALESCE(u.updated_at, NOW()),
      COALESCE(u.created_at, NOW()),
      COALESCE(u.updated_at, NOW())
    FROM users u
    WHERE u.user_id IS NOT NULL
      AND u.user_id <> ''
      AND u.user_id NOT LIKE 'u_%'
    ON CONFLICT (platform, external_user_id) DO NOTHING
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
      cancel_window_hours INTEGER NOT NULL DEFAULT 12,
      deposit_percent INTEGER NOT NULL DEFAULT 0,
      deposit_type TEXT,
      deposit_fixed INTEGER,
      deposit_details TEXT,
      deposit_qr_path TEXT,
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
    ALTER TABLE master_followers
    ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT TRUE;
  `)

  await pool.query(`
    ALTER TABLE master_followers
    ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE master_followers
    ADD COLUMN IF NOT EXISTS marketing_opt_out_at TIMESTAMPTZ;
  `)

  await pool.query(`
    UPDATE master_followers
    SET marketing_opt_in_at = COALESCE(marketing_opt_in_at, created_at)
    WHERE marketing_opt_in = TRUE
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_marketing_subscriptions (
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      subscriber_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      opt_in BOOLEAN NOT NULL DEFAULT TRUE,
      opt_in_at TIMESTAMPTZ,
      opt_out_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (master_id, subscriber_id)
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_marketing_master_idx
    ON master_marketing_subscriptions (master_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_marketing_subscriber_idx
    ON master_marketing_subscriptions (subscriber_id);
  `)

  await pool.query(`
    INSERT INTO master_marketing_subscriptions (
      master_id,
      subscriber_id,
      opt_in,
      opt_in_at,
      opt_out_at
    )
    SELECT
      master_id,
      follower_id,
      marketing_opt_in,
      marketing_opt_in_at,
      marketing_opt_out_at
    FROM master_followers
    ON CONFLICT (master_id, subscriber_id) DO NOTHING
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_repeat_settings (
      master_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      channel TEXT NOT NULL DEFAULT 'bot' CHECK (channel IN ('bot', 'chat')),
      include_link BOOLEAN NOT NULL DEFAULT TRUE,
      include_unsubscribe BOOLEAN NOT NULL DEFAULT TRUE,
      intervals JSONB NOT NULL DEFAULT '{}'::jsonb,
      template TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_repeat_log (
      id SERIAL PRIMARY KEY,
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      category_id TEXT NOT NULL,
      last_booking_id INTEGER,
      last_booking_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS marketing_repeat_log_master_idx
    ON marketing_repeat_log (master_id, sent_at DESC);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS marketing_repeat_log_target_idx
    ON marketing_repeat_log (master_id, client_id, category_id);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_promotions (
      id SERIAL PRIMARY KEY,
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('discount', 'bonus', 'slots')),
      title TEXT NOT NULL,
      description TEXT,
      start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
      audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'followers', 'clients')),
      discount_percent INTEGER NOT NULL DEFAULT 0,
      max_uses INTEGER,
      uses_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE master_promotions
    DROP COLUMN IF EXISTS categories;
  `)

  await pool.query(`
    ALTER TABLE master_promotions
    ADD COLUMN IF NOT EXISTS discount_percent INTEGER NOT NULL DEFAULT 0;
  `)

  await pool.query(`
    UPDATE master_promotions
    SET status = 'archived',
        audience = 'all',
        updated_at = NOW()
    WHERE audience = 'subscribers';
  `)

  await pool.query(`
    DO $$
    DECLARE
      constraint_name TEXT;
    BEGIN
      FOR constraint_name IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'master_promotions'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%audience%'
      LOOP
        EXECUTE format('ALTER TABLE master_promotions DROP CONSTRAINT %I', constraint_name);
      END LOOP;
    END$$;
  `)

  await pool.query(`
    ALTER TABLE master_promotions
    ADD CONSTRAINT master_promotions_audience_check
    CHECK (audience IN ('all', 'followers', 'clients'));
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_promotions_master_idx
    ON master_promotions (master_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS master_promotions_status_idx
    ON master_promotions (status, end_at);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id SERIAL PRIMARY KEY,
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('bot', 'chat')),
      segment TEXT NOT NULL CHECK (segment IN ('all', 'new', 'regular')),
      discount_percent INTEGER NOT NULL DEFAULT 0,
      text_preview TEXT,
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_campaign_recipients (
      campaign_id INTEGER NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('bot', 'chat')),
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (campaign_id, client_id)
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS marketing_campaigns_master_idx
    ON marketing_campaigns (master_id, sent_at DESC);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS marketing_campaigns_active_idx
    ON marketing_campaigns (master_id, end_at DESC);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS marketing_campaign_recipients_client_idx
    ON marketing_campaign_recipients (client_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS marketing_campaign_recipients_campaign_idx
    ON marketing_campaign_recipients (campaign_id);
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
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS cancel_window_hours INTEGER NOT NULL DEFAULT 12;
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS deposit_percent INTEGER NOT NULL DEFAULT 0;
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS deposit_type TEXT;
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS deposit_fixed INTEGER;
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS deposit_details TEXT;
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    ADD COLUMN IF NOT EXISTS deposit_qr_path TEXT;
  `)

  await pool.query(`
    ALTER TABLE master_profiles
    DROP COLUMN IF EXISTS late_cancel_fee_percent;
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
      time_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
      budget TEXT,
      details TEXT,
      photo_urls TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE service_requests
    ADD COLUMN IF NOT EXISTS time_windows JSONB NOT NULL DEFAULT '[]'::jsonb;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_bookings (
      id SERIAL PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      master_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      request_id INTEGER REFERENCES service_requests(id) ON DELETE SET NULL,
      city_id INTEGER REFERENCES cities(id),
      district_id INTEGER REFERENCES districts(id),
      address TEXT,
      category_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      service_price INTEGER,
      service_duration INTEGER,
      location_type TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      reschedule_proposed_at TIMESTAMPTZ,
      reschedule_proposed_by TEXT,
      reschedule_proposed_time TIMESTAMPTZ,
      reschedule_note TEXT,
      photo_urls TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      cancel_window_hours INTEGER NOT NULL DEFAULT 12,
      deposit_percent INTEGER NOT NULL DEFAULT 0,
      deposit_amount INTEGER,
      deposit_status TEXT,
      deposit_hold_expires_at TIMESTAMPTZ,
      deposit_paid_at TIMESTAMPTZ,
      deposit_proof_path TEXT,
      proposed_price INTEGER,
      promotion_id INTEGER REFERENCES master_promotions(id),
      promotion_discount_percent INTEGER,
      promotion_discount_amount INTEGER,
      promotion_price_before INTEGER,
      promotion_price_after INTEGER,
      campaign_id INTEGER REFERENCES marketing_campaigns(id),
      campaign_discount_percent INTEGER,
      campaign_discount_amount INTEGER,
      campaign_price_before INTEGER,
      campaign_price_after INTEGER,
      discount_source TEXT,
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
    ADD COLUMN IF NOT EXISTS request_id INTEGER REFERENCES service_requests(id) ON DELETE SET NULL;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS cancel_window_hours INTEGER NOT NULL DEFAULT 12;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS reschedule_proposed_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS reschedule_proposed_by TEXT;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS reschedule_proposed_time TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS reschedule_note TEXT;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS deposit_percent INTEGER NOT NULL DEFAULT 0;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS deposit_amount INTEGER;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS deposit_status TEXT;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS deposit_hold_expires_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS deposit_proof_path TEXT;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS promotion_id INTEGER REFERENCES master_promotions(id);
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS promotion_discount_percent INTEGER;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS promotion_discount_amount INTEGER;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS promotion_price_before INTEGER;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS promotion_price_after INTEGER;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS campaign_id INTEGER REFERENCES marketing_campaigns(id);
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS campaign_discount_percent INTEGER;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS campaign_discount_amount INTEGER;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS campaign_price_before INTEGER;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS campaign_price_after INTEGER;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS discount_source TEXT;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    DROP COLUMN IF EXISTS late_cancel_fee_percent;
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
      proposed_slot_at TIMESTAMPTZ,
      hold_expires_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'sent',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE request_responses
    ADD COLUMN IF NOT EXISTS proposed_slot_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE request_responses
    ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;
  `)

  await pool.query(`
    ALTER TABLE service_bookings
    ADD COLUMN IF NOT EXISTS response_id INTEGER REFERENCES request_responses(id) ON DELETE SET NULL;
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
    CREATE INDEX IF NOT EXISTS service_bookings_master_client_idx
    ON service_bookings (master_id, client_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS service_bookings_client_created_idx
    ON service_bookings (client_id, created_at DESC);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS service_bookings_master_created_idx
    ON service_bookings (master_id, created_at DESC);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS service_requests_user_idx
    ON service_requests (user_id);
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS service_requests_user_created_idx
    ON service_requests (user_id, created_at DESC);
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

app.post('/api/session/bootstrap', async (req, res) => {
  const {
    host,
    platformUserId,
    firstName,
    lastName,
    username,
    languageCode,
    photoUrl,
  } = req.body ?? {}

  try {
    const payload = await bootstrapSession({
      host,
      platformUserId,
      firstName,
      lastName,
      username,
      languageCode,
      photoUrl,
    })
    res.json(payload)
  } catch (error) {
    console.error('POST /api/session/bootstrap failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/account/identities', async (req, res) => {
  const normalizedUserId = normalizeText(req.query.userId)
  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  try {
    await ensureUser(normalizedUserId)
    const identities = await loadAccountIdentities(pool, normalizedUserId)
    res.json({ userId: normalizedUserId, ...identities })
  } catch (error) {
    console.error('GET /api/account/identities failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/account/link/start', async (req, res) => {
  const { userId, sourcePlatform, targetPlatform } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedSourcePlatform = normalizeIdentityPlatform(sourcePlatform)
  const normalizedTargetPlatform = normalizeIdentityPlatform(targetPlatform)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  if (isLocalDevUserId(normalizedUserId)) {
    res.status(400).json({ error: 'session_user_invalid' })
    return
  }
  if (!normalizedTargetPlatform) {
    res.status(400).json({ error: 'target_platform_invalid' })
    return
  }
  if (
    normalizedSourcePlatform &&
    normalizedSourcePlatform === normalizedTargetPlatform
  ) {
    res.status(400).json({ error: 'platform_same' })
    return
  }

  try {
    await ensureUser(normalizedUserId)
    const identities = await loadAccountIdentities(pool, normalizedUserId)
    const alreadyLinked =
      normalizedTargetPlatform === 'telegram'
        ? identities.telegramLinked
        : identities.vkLinked
    if (alreadyLinked) {
      res.json({
        ok: true,
        alreadyLinked: true,
        userId: normalizedUserId,
        targetPlatform: normalizedTargetPlatform,
        targetUrl: '',
        identities,
      })
      return
    }

    const source =
      normalizedSourcePlatform ??
      (normalizedTargetPlatform === 'vk'
        ? identities.telegramLinked
          ? 'telegram'
          : 'vk'
        : identities.vkLinked
          ? 'vk'
          : 'telegram')
    const sourceLinked =
      source === 'telegram' ? identities.telegramLinked : identities.vkLinked
    if (!sourceLinked || source === normalizedTargetPlatform) {
      res.status(409).json({
        error: 'source_platform_not_linked',
        userId: normalizedUserId,
        targetPlatform: normalizedTargetPlatform,
        identities,
      })
      return
    }

    const startParam = `link_${buildLinkToken()}`
    const targetUrl =
      normalizedTargetPlatform === 'telegram'
        ? buildStartAppUrl(telegramMiniAppUrl, startParam)
        : (() => {
            if (!VK_APP_URL) return ''
            const encoded = encodeURIComponent(startParam)
            if (/start=/i.test(VK_APP_URL)) {
              return VK_APP_URL.replace(/start=[^&]*/i, `start=${encoded}`)
            }
            const joiner = VK_APP_URL.includes('?') ? '&' : '?'
            return `${VK_APP_URL}${joiner}start=${encoded}`
          })()

    if (!targetUrl) {
      res.status(400).json({
        error: normalizedTargetPlatform === 'telegram' ? 'tg_url_missing' : 'vk_url_missing',
      })
      return
    }

    const token = startParam.replace(/^link_/, '')
    const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS)
    await pool.query(
      `
        INSERT INTO account_link_challenges (
          token,
          source_internal_user_id,
          source_platform,
          target_platform,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [token, normalizedUserId, source, normalizedTargetPlatform, expiresAt.toISOString()]
    )

    res.json({
      ok: true,
      alreadyLinked: false,
      token,
      targetPlatform: normalizedTargetPlatform,
      targetUrl,
      expiresAt: expiresAt.toISOString(),
      identities,
    })
  } catch (error) {
    console.error('POST /api/account/link/start failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/account/link/complete', async (req, res) => {
  const {
    userId,
    token,
    host,
    platformUserId,
    firstName,
    lastName,
    username,
    languageCode,
    photoUrl,
  } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedToken = normalizeText(token)
  const targetPlatform = resolveIdentityPlatformByHost(host)
  const externalUserId = normalizeExternalUserId(platformUserId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  if (isLocalDevUserId(normalizedUserId)) {
    res.status(400).json({ error: 'session_user_invalid' })
    return
  }
  if (!normalizedToken) {
    res.status(400).json({ error: 'token_required' })
    return
  }
  if (!externalUserId) {
    res.status(400).json({ error: 'platform_user_id_required' })
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const challengeResult = await client.query(
      `
        SELECT
          token,
          source_internal_user_id AS "sourceUserId",
          source_platform AS "sourcePlatform",
          target_platform AS "targetPlatform",
          expires_at AS "expiresAt",
          used_at AS "usedAt"
        FROM account_link_challenges
        WHERE token = $1
        LIMIT 1
      `,
      [normalizedToken]
    )
    const challenge = challengeResult.rows[0] ?? null
    if (!challenge || challenge.usedAt || toEpochMs(challenge.expiresAt) <= Date.now()) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'token_invalid_or_used' })
      return
    }
    if (challenge.targetPlatform !== targetPlatform) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'target_platform_mismatch' })
      return
    }

    await ensureUser(normalizedUserId, client)
    const sourceUserId = normalizeText(challenge.sourceUserId)
    if (!sourceUserId) {
      await client.query('ROLLBACK')
      res.status(500).json({ error: 'link_source_missing' })
      return
    }

    const sessionProfile = normalizeSessionProfilePayload({
      firstName,
      lastName,
      username,
      languageCode,
      photoUrl,
    })
    await upsertUserProfile(client, {
      userId: normalizedUserId,
      platform: targetPlatform,
      ...sessionProfile,
    })

    let activeUserId = sourceUserId
    let merged = false
    if (normalizedUserId !== sourceUserId) {
      const mergeDirection = await resolvePrimaryForAccountMerge({
        db: client,
        sourceUserId,
        targetUserId: normalizedUserId,
      })
      const mergeResult = await mergeUserAccounts({
        db: client,
        primaryUserId: mergeDirection.primaryUserId,
        secondaryUserId: mergeDirection.secondaryUserId,
        sourcePlatform: challenge.sourcePlatform,
        targetPlatform: challenge.targetPlatform,
        selectionReason: mergeDirection.selectionReason,
      })
      merged = Boolean(mergeResult?.merged)
      activeUserId = mergeDirection.primaryUserId
    }

    await ensureIdentityBinding(client, {
      internalUserId: activeUserId,
      platform: targetPlatform,
      externalUserId,
      isPrimary: true,
    })

    await client.query(
      `
        UPDATE account_link_challenges
        SET used_at = NOW()
        WHERE token = $1
      `,
      [normalizedToken]
    )

    const roleResult = await client.query(
      `
        SELECT
          app_role AS role,
          role_selected_at AS "roleSelectedAt",
          role_changed_at AS "roleChangedAt"
        FROM users
        WHERE user_id = $1
      `,
      [activeUserId]
    )
    const roleRow = roleResult.rows[0] ?? null
    const role = normalizeUserRole(roleRow?.role)
    const identities = await loadAccountIdentities(client, activeUserId)
    const isSupportAgent = await isSupportAgentUser(client, activeUserId)

    await client.query('COMMIT')
    res.json({
      ok: true,
      merged,
      userId: activeUserId,
      roleState: {
        role,
        selectedOnce: Boolean(role && roleRow?.roleSelectedAt),
        roleSelectedAt: roleRow?.roleSelectedAt ?? null,
        roleChangedAt: roleRow?.roleChangedAt ?? null,
      },
      identities,
      isSupportAgent,
    })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('POST /api/account/link/complete failed:', error)
    res.status(500).json({ error: 'server_error' })
  } finally {
    client.release()
  }
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
            avatar_url = COALESCE(users.avatar_url, EXCLUDED.avatar_url),
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

app.get('/api/user/role-state', async (req, res) => {
  const normalizedUserId = normalizeText(req.query.userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    await ensureUser(normalizedUserId)
    const result = await pool.query(
      `
        SELECT
          app_role AS role,
          role_selected_at AS "roleSelectedAt",
          role_changed_at AS "roleChangedAt"
        FROM users
        WHERE user_id = $1
      `,
      [normalizedUserId]
    )

    const row = result.rows[0] ?? null
    const role = normalizeUserRole(row?.role)
    const selectedOnce = Boolean(role && row?.roleSelectedAt)

    res.json({
      role,
      selectedOnce,
      roleSelectedAt: row?.roleSelectedAt ?? null,
      roleChangedAt: row?.roleChangedAt ?? null,
    })
  } catch (error) {
    console.error('GET /api/user/role-state failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.patch('/api/user/role', async (req, res) => {
  const { userId, role, source } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedRole = normalizeUserRole(role)
  const normalizedSource = normalizeText(source).toLowerCase()

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (!normalizedRole) {
    res.status(400).json({ error: 'role_invalid' })
    return
  }

  if (normalizedSource !== 'onboarding' && normalizedSource !== 'settings') {
    res.status(400).json({ error: 'source_invalid' })
    return
  }

  try {
    await ensureUser(normalizedUserId)
    const currentResult = await pool.query(
      `
        SELECT
          app_role AS role,
          role_selected_at AS "roleSelectedAt"
        FROM users
        WHERE user_id = $1
      `,
      [normalizedUserId]
    )
    const currentRow = currentResult.rows[0] ?? null
    const currentRole = normalizeUserRole(currentRow?.role)
    const hasSelectedOnce = Boolean(currentRole && currentRow?.roleSelectedAt)

    if (normalizedSource === 'onboarding' && hasSelectedOnce) {
      res.status(409).json({
        error: 'role_already_selected',
        role: currentRole,
        selectedOnce: true,
        roleSelectedAt: currentRow.roleSelectedAt ?? null,
      })
      return
    }

    await pool.query(
      `
        UPDATE users
        SET app_role = $2,
            role_selected_at = COALESCE(role_selected_at, NOW()),
            role_changed_at = NOW(),
            updated_at = NOW()
        WHERE user_id = $1
      `,
      [normalizedUserId, normalizedRole]
    )

    const nextResult = await pool.query(
      `
        SELECT
          app_role AS role,
          role_selected_at AS "roleSelectedAt",
          role_changed_at AS "roleChangedAt"
        FROM users
        WHERE user_id = $1
      `,
      [normalizedUserId]
    )
    const nextRow = nextResult.rows[0] ?? null
    const nextRole = normalizeUserRole(nextRow?.role)

    res.json({
      ok: true,
      role: nextRole,
      selectedOnce: Boolean(nextRole && nextRow?.roleSelectedAt),
      roleSelectedAt: nextRow?.roleSelectedAt ?? null,
      roleChangedAt: nextRow?.roleChangedAt ?? null,
    })
  } catch (error) {
    console.error('PATCH /api/user/role failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/user/logout', async (req, res) => {
  const { userId } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    await ensureUser(normalizedUserId)
    await pool.query(
      `
        UPDATE users
        SET app_role = NULL,
            role_selected_at = NULL,
            role_changed_at = NOW(),
            updated_at = NOW()
        WHERE user_id = $1
      `,
      [normalizedUserId]
    )

    res.json({
      ok: true,
      role: null,
      selectedOnce: false,
      roleSelectedAt: null,
      roleChangedAt: null,
    })
  } catch (error) {
    console.error('POST /api/user/logout failed:', error)
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

    const row = result.rows[0]
    res.json({
      ...row,
      timeWindows: normalizeTimeWindows(row.timeWindows),
    })
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
  const viewerId = normalizeText(req.query.viewerId ?? req.query.userId)
  const promotionsOnly = ['1', 'true', 'yes', 'on'].includes(
    normalizeText(req.query.promotionsOnly ?? req.query.promoOnly)
  )
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

  values.push(viewerId || null)
  const viewerIndex = values.length
  const whereParts = []
  if (conditions.length) {
    whereParts.push(conditions.join(' AND '))
  }
  if (promotionsOnly) {
    whereParts.push('promo.id IS NOT NULL')
  }
  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''
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
          ul.share_to_clients AS "shareToClients",
          promo.id AS "promotionId",
          promo.type AS "promotionType",
          promo.title AS "promotionTitle",
          promo.description AS "promotionDescription",
          promo.start_at AS "promotionStartAt",
          promo.end_at AS "promotionEndAt",
          promo.audience AS "promotionAudience",
          promo.discount_percent AS "promotionDiscountPercent"
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
        LEFT JOIN LATERAL (
          SELECT
            id,
            type,
            title,
            description,
            start_at,
            end_at,
            audience,
            discount_percent
          FROM master_promotions mpromo
          WHERE mpromo.master_id = mp.user_id
            AND mpromo.status = 'active'
            AND mpromo.start_at <= NOW()
            AND mpromo.end_at > NOW()
            ${buildPromotionAudienceClause({
              viewerIndex,
              masterAlias: 'mp',
              promotionAlias: 'mpromo',
            })}
          ORDER BY mpromo.end_at ASC
          LIMIT 1
        ) promo ON TRUE
        ${whereClause}
        ORDER BY mp.updated_at DESC
        ${limitClause}
      `,
      values
    )
    const rows = result.rows ?? []

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
      const portfolioUrls = resolvePortfolioUrls(req, row.portfolioUrls)
      const showcaseUrls = resolvePortfolioUrls(req, row.showcaseUrls)
      const activePromotion = row.promotionId
        ? {
            id: Number(row.promotionId),
            type: row.promotionType,
            title: row.promotionTitle,
            description: row.promotionDescription ?? null,
            startAt: row.promotionStartAt ?? null,
            endAt: row.promotionEndAt ?? null,
            audience: row.promotionAudience ?? 'all',
            discountPercent: normalizePromotionDiscount(row.promotionDiscountPercent),
          }
        : null
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
        portfolioUrls,
        certificates,
        showcaseUrls,
        updatedAt: row.updatedAt,
        distanceKm,
        lateCancelFeePercent: 0,
        reviewsAverage: Number.isFinite(average) ? average : 0,
        reviewsCount: Number.isFinite(Number(row.reviewsCount))
          ? Number(row.reviewsCount)
          : 0,
        followersCount: Number.isFinite(Number(row.followersCount))
          ? Number(row.followersCount)
          : 0,
        avatarUrl: buildPublicUrl(req, row.avatarPath),
        coverUrl: buildPublicUrl(req, row.coverPath),
        activePromotion,
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
  const viewerId = normalizeText(req.query.viewerId ?? req.query.userId)
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
          mp.cancel_window_hours AS "cancelWindowHours",
          mp.deposit_percent AS "depositPercent",
          mp.deposit_type AS "depositType",
          mp.deposit_fixed AS "depositFixed",
          mp.deposit_details AS "depositDetails",
          mp.deposit_qr_path AS "depositQrPath",
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
          CASE WHEN $2::text IS NULL THEN NULL ELSE (mvu.follower_id IS NOT NULL) END AS "viewerIsFollower",
          CASE WHEN $2::text IS NULL THEN NULL ELSE mms.opt_in END AS "viewerMarketingOptIn",
          mp.updated_at AS "updatedAt",
          promo.id AS "promotionId",
          promo.type AS "promotionType",
          promo.title AS "promotionTitle",
          promo.description AS "promotionDescription",
          promo.start_at AS "promotionStartAt",
          promo.end_at AS "promotionEndAt",
          promo.audience AS "promotionAudience",
          promo.discount_percent AS "promotionDiscountPercent"
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
        LEFT JOIN master_followers mvu
          ON mvu.master_id = mp.user_id
          AND mvu.follower_id = $2
        LEFT JOIN master_marketing_subscriptions mms
          ON mms.master_id = mp.user_id
          AND mms.subscriber_id = $2
        LEFT JOIN LATERAL (
          SELECT
            id,
            type,
            title,
            description,
            start_at,
            end_at,
            audience,
            discount_percent
          FROM master_promotions mpromo
          WHERE mpromo.master_id = mp.user_id
            AND mpromo.status = 'active'
            AND mpromo.start_at <= NOW()
            AND mpromo.end_at > NOW()
            ${buildPromotionAudienceClause({
              viewerIndex: 2,
              masterAlias: 'mp',
              promotionAlias: 'mpromo',
            })}
          ORDER BY mpromo.end_at ASC
          LIMIT 1
        ) promo ON TRUE
        WHERE mp.user_id = $1
      `,
      [normalizedUserId, viewerId || null]
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
    const portfolioUrls = resolvePortfolioUrls(req, row.portfolioUrls)
    const showcaseUrls = resolvePortfolioUrls(req, row.showcaseUrls)
    const activePromotion = row.promotionId
      ? {
          id: Number(row.promotionId),
          type: row.promotionType,
          title: row.promotionTitle,
          description: row.promotionDescription ?? null,
          startAt: row.promotionStartAt ?? null,
          endAt: row.promotionEndAt ?? null,
          audience: row.promotionAudience ?? 'all',
          discountPercent: normalizePromotionDiscount(row.promotionDiscountPercent),
        }
      : null
    const campaignDiscount =
      viewerId && normalizedUserId
        ? await loadActiveCampaignDiscountForViewer({
            masterId: normalizedUserId,
            viewerId,
          })
        : null
    res.json({
      ...row,
      depositQrPath: undefined,
      certificates,
      reviewsAverage,
      reviewsCount,
      followersCount,
      viewerIsFollower:
        typeof row.viewerIsFollower === 'boolean' ? row.viewerIsFollower : null,
      viewerMarketingOptIn:
        typeof row.viewerMarketingOptIn === 'boolean'
          ? row.viewerMarketingOptIn
          : null,
      portfolioUrls,
      showcaseUrls,
      depositQrUrl: buildPublicUrl(req, row.depositQrPath),
      lateCancelFeePercent: 0,
      avatarUrl: buildPublicUrl(req, row.avatarPath),
      coverUrl: buildPublicUrl(req, row.coverPath),
      activePromotion,
      campaignDiscount,
      ...summary,
    })
  } catch (error) {
    console.error('GET /api/masters/:userId failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/masters/:userId/promotions', async (req, res) => {
  const masterId = normalizeText(req.params.userId)
  const viewerId = normalizeText(req.query.viewerId ?? req.query.userId)
  if (!masterId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          master_id AS "masterId",
          type,
          title,
          description,
          start_at AS "startAt",
          end_at AS "endAt",
          status,
          audience,
          discount_percent AS "discountPercent",
          max_uses AS "maxUses",
          uses_count AS "usesCount",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM master_promotions
        WHERE master_id = $1
          AND status = 'active'
          AND start_at <= NOW()
          AND end_at > NOW()
          AND (
            audience = 'all'
            OR $2::text = $1
            OR (
              audience = 'followers'
              AND EXISTS (
                SELECT 1
                FROM master_followers mf
                WHERE mf.master_id = $1 AND mf.follower_id = $2
              )
            )
            OR (
              audience = 'clients'
              AND EXISTS (
                SELECT 1
                FROM service_bookings sb
                WHERE sb.master_id = $1 AND sb.client_id = $2
              )
            )
          )
        ORDER BY end_at ASC
      `,
      [masterId, viewerId || null]
    )
    res.json(result.rows.map(mapPromotionRow))
  } catch (error) {
    console.error('GET /api/masters/:userId/promotions failed:', error)
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
        INSERT INTO master_followers (
          master_id,
          follower_id,
          marketing_opt_in,
          marketing_opt_in_at,
          marketing_opt_out_at
        )
        VALUES ($1, $2, TRUE, NOW(), NULL)
        ON CONFLICT (master_id, follower_id)
        DO UPDATE SET
          marketing_opt_in = TRUE,
          marketing_opt_in_at = NOW(),
          marketing_opt_out_at = NULL
      `,
      [masterId, followerId]
    )
    await pool.query(
      `
        INSERT INTO master_marketing_subscriptions (
          master_id,
          subscriber_id,
          opt_in,
          opt_in_at,
          opt_out_at
        )
        VALUES ($1, $2, TRUE, NOW(), NULL)
        ON CONFLICT (master_id, subscriber_id) DO NOTHING
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

app.post('/api/masters/:userId/marketing/opt-out', async (req, res) => {
  const masterId = normalizeText(req.params.userId)
  const followerId = normalizeText(req.body?.userId ?? req.body?.followerId)
  if (!masterId || !followerId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  if (masterId === followerId) {
    res.status(400).json({ error: 'self_opt_out_forbidden' })
    return
  }

  try {
    await pool.query(
      `
        INSERT INTO master_marketing_subscriptions (
          master_id,
          subscriber_id,
          opt_in,
          opt_out_at
        )
        VALUES ($1, $2, FALSE, NOW())
        ON CONFLICT (master_id, subscriber_id)
        DO UPDATE SET
          opt_in = FALSE,
          opt_out_at = NOW()
      `,
      [masterId, followerId]
    )
    res.json({ ok: true })
  } catch (error) {
    console.error('POST /api/masters/:userId/marketing/opt-out failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/masters/:userId/marketing/opt-in', async (req, res) => {
  const masterId = normalizeText(req.params.userId)
  const followerId = normalizeText(req.body?.userId ?? req.body?.followerId)
  if (!masterId || !followerId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  if (masterId === followerId) {
    res.status(400).json({ error: 'self_opt_in_forbidden' })
    return
  }

  try {
    await pool.query(
      `
        INSERT INTO master_marketing_subscriptions (
          master_id,
          subscriber_id,
          opt_in,
          opt_in_at,
          opt_out_at
        )
        VALUES ($1, $2, TRUE, NOW(), NULL)
        ON CONFLICT (master_id, subscriber_id)
        DO UPDATE SET
          opt_in = TRUE,
          opt_in_at = NOW(),
          opt_out_at = NULL
      `,
      [masterId, followerId]
    )
    res.json({ ok: true })
  } catch (error) {
    console.error('POST /api/masters/:userId/marketing/opt-in failed:', error)
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
          reschedule_proposed_time AS "rescheduleProposedTime",
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
    cancelWindowHours,
    depositPercent,
    depositType,
    depositFixed,
    depositDetails,
    depositQrPath,
    depositQrUrl,
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
  const parsedCancelWindowHours = parseOptionalInt(cancelWindowHours)
  const parsedDepositPercent = parseOptionalInt(depositPercent)
  const parsedDepositFixed = parseOptionalInt(depositFixed)
  const normalizedDepositType = normalizeText(depositType)
  const normalizedDepositDetails = normalizeText(depositDetails)
  const normalizedDepositQrPath = normalizeText(depositQrPath ?? depositQrUrl)
  const safeDepositType = ['none', 'percent', 'fixed'].includes(normalizedDepositType)
    ? normalizedDepositType
    : null
  const normalizedCancelWindowHours = clampValue(
    parsedCancelWindowHours ?? BOOKING_FREE_CANCEL_HOURS,
    0,
    72
  )
  const normalizedDepositPercent = clampValue(parsedDepositPercent ?? 0, 0, 100)
  const normalizedDepositFixed = clampValue(parsedDepositFixed ?? 0, 0, 1000000)

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
          cancel_window_hours,
          deposit_percent,
          deposit_type,
          deposit_fixed,
          deposit_details,
          deposit_qr_path,
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
          $17,
          $18,
          $19,
          $20,
          $21,
          $22,
          COALESCE($23, '{}'::text[]),
          $24::jsonb
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
            cancel_window_hours = EXCLUDED.cancel_window_hours,
            deposit_percent = EXCLUDED.deposit_percent,
            deposit_type = EXCLUDED.deposit_type,
            deposit_fixed = EXCLUDED.deposit_fixed,
            deposit_details = EXCLUDED.deposit_details,
            deposit_qr_path = EXCLUDED.deposit_qr_path,
            works_at_client = EXCLUDED.works_at_client,
            works_at_master = EXCLUDED.works_at_master,
            categories = EXCLUDED.categories,
            services = EXCLUDED.services,
            portfolio_urls =
              CASE
                WHEN $23 IS NULL THEN master_profiles.portfolio_urls
                ELSE $23
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
        normalizedCancelWindowHours,
        normalizedDepositPercent,
        safeDepositType,
        normalizedDepositFixed,
        normalizedDepositDetails || null,
        normalizedDepositQrPath || null,
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
    const result = await timedQuery(
      'pro:requests:list',
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
          r.time_windows AS "timeWindows",
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
          rr.proposed_slot_at AS "responseProposedSlotAt",
          rr.hold_expires_at AS "responseHoldExpiresAt",
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
    const seenRequestIds = new Set()
    result.rows.forEach((row) => {
      const requestId = Number(row.id)
      if (Number.isInteger(requestId) && seenRequestIds.has(requestId)) return
      if (Number.isInteger(requestId)) {
        seenRequestIds.add(requestId)
      }
      dedupedRows.push(row)
    })

    const leadScoreVariant = resolveLeadScoreVariant(normalizedUserId)
    let conversionStats = null
    try {
      conversionStats = await loadLeadConversionStats(normalizedUserId)
    } catch (error) {
      conversionStats = null
    }

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
      const request = {
        ...row,
        clientName,
        distanceKm,
        clientTrust,
        timeWindows: normalizeTimeWindows(row.timeWindows),
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
      return {
        ...request,
        nextAction: buildProRequestNextAction(request, {
          isActive: profile.isActive,
          missingFields: summary.missingFields,
        }),
      }
    })
    const scored = payload
      .map((item) => {
        const { score, reasons } = buildLeadScore(item, {
          variant: leadScoreVariant,
          conversionStats,
        })
        return {
          ...item,
          leadScore: score,
          leadReasons: reasons,
          leadScoreVariant,
        }
      })
      .sort((a, b) => {
        const scoreDiff = (b.leadScore ?? 0) - (a.leadScore ?? 0)
        if (scoreDiff !== 0) return scoreDiff
        return (
          Number(new Date(b.createdAt ?? 0)) - Number(new Date(a.createdAt ?? 0))
        )
      })

    res.json({
      ...summary,
      isActive: profile.isActive,
      leadScoreVariant,
      leadConversionStats: conversionStats,
      requests: scored,
    })
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
    const result = await timedQuery(
      'bookings:list',
      `
        SELECT
          b.id,
          b.client_id AS "clientId",
          b.master_id AS "masterId",
          b.request_id AS "requestId",
          b.response_id AS "responseId",
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
          b.reschedule_proposed_at AS "rescheduleProposedAt",
          b.reschedule_proposed_by AS "rescheduleProposedBy",
          b.reschedule_proposed_time AS "rescheduleProposedTime",
          b.reschedule_note AS "rescheduleNote",
          b.photo_urls AS "photoUrls",
          b.status,
          b.cancel_window_hours AS "cancelWindowHours",
          b.deposit_percent AS "depositPercent",
          b.deposit_amount AS "depositAmount",
          b.deposit_status AS "depositStatus",
          b.deposit_hold_expires_at AS "depositHoldExpiresAt",
          b.deposit_paid_at AS "depositPaidAt",
          b.deposit_proof_path AS "depositProofPath",
          b.proposed_price AS "proposedPrice",
          b.promotion_id AS "promotionId",
          b.promotion_discount_percent AS "promotionDiscountPercent",
          b.promotion_discount_amount AS "promotionDiscountAmount",
          b.promotion_price_before AS "promotionPriceBefore",
          b.promotion_price_after AS "promotionPriceAfter",
          b.campaign_id AS "campaignId",
          b.campaign_discount_percent AS "campaignDiscountPercent",
          b.campaign_discount_amount AS "campaignDiscountAmount",
          b.campaign_price_before AS "campaignPriceBefore",
          b.campaign_price_after AS "campaignPriceAfter",
          b.discount_source AS "discountSource",
          b.client_comment AS "comment",
          b.outcome,
          b.attendance_at AS "attendanceAt",
          b.late_minutes AS "lateMinutes",
          b.outcome_prompted_at AS "outcomePromptedAt",
          b.created_at AS "createdAt",
          b.updated_at AS "updatedAt",
          mr.id AS "reviewId",
          COALESCE(bc.id, legacy_bc.id) AS "chatId",
          mp.deposit_details AS "depositDetails",
          mp.deposit_qr_path AS "depositQrPath"
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

    const payload = result.rows.map((row) => {
      const booking = {
        ...row,
        masterName: row.masterName || 'Мастер',
        masterAvatarUrl: buildPublicUrl(req, row.masterAvatarPath),
        depositProofPath: undefined,
        depositQrPath: undefined,
        depositProofUrl: buildPublicUrl(req, row.depositProofPath),
        depositQrUrl: buildPublicUrl(req, row.depositQrPath),
        lateCancelFeePercent: 0,
      }
      const workflow = buildBookingWorkflowMeta(booking, 'client')
      return {
        ...booking,
        ...workflow,
      }
    })

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
    const result = await timedQuery(
      'pro:bookings:list',
      `
        SELECT
          b.id,
          b.client_id AS "clientId",
          b.master_id AS "masterId",
          b.request_id AS "requestId",
          b.response_id AS "responseId",
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
          b.reschedule_proposed_at AS "rescheduleProposedAt",
          b.reschedule_proposed_by AS "rescheduleProposedBy",
          b.reschedule_proposed_time AS "rescheduleProposedTime",
          b.reschedule_note AS "rescheduleNote",
          b.photo_urls AS "photoUrls",
          b.status,
          b.cancel_window_hours AS "cancelWindowHours",
          b.deposit_percent AS "depositPercent",
          b.deposit_amount AS "depositAmount",
          b.deposit_status AS "depositStatus",
          b.deposit_hold_expires_at AS "depositHoldExpiresAt",
          b.deposit_paid_at AS "depositPaidAt",
          b.deposit_proof_path AS "depositProofPath",
          b.proposed_price AS "proposedPrice",
          b.promotion_id AS "promotionId",
          b.promotion_discount_percent AS "promotionDiscountPercent",
          b.promotion_discount_amount AS "promotionDiscountAmount",
          b.promotion_price_before AS "promotionPriceBefore",
          b.promotion_price_after AS "promotionPriceAfter",
          b.campaign_id AS "campaignId",
          b.campaign_discount_percent AS "campaignDiscountPercent",
          b.campaign_discount_amount AS "campaignDiscountAmount",
          b.campaign_price_before AS "campaignPriceBefore",
          b.campaign_price_after AS "campaignPriceAfter",
          b.discount_source AS "discountSource",
          b.client_comment AS "comment",
          b.outcome,
          b.attendance_at AS "attendanceAt",
          b.late_minutes AS "lateMinutes",
          b.outcome_prompted_at AS "outcomePromptedAt",
          b.created_at AS "createdAt",
          b.updated_at AS "updatedAt",
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
      const clientName =
        nameParts || (row.clientUsername ? `@${row.clientUsername}` : 'Клиент')
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
      const booking = {
        ...row,
        clientName,
        distanceKm,
        clientTrust,
        depositProofPath: undefined,
        depositProofUrl: buildPublicUrl(req, row.depositProofPath),
        clientLat: undefined,
        clientLng: undefined,
        clientShareToMasters: undefined,
        clientTrustScore: undefined,
        clientTrustConfidence: undefined,
        clientTrustUpdatedAt: undefined,
        lateCancelFeePercent: 0,
      }
      const workflow = buildBookingWorkflowMeta(booking, 'master')
      return {
        ...booking,
        ...workflow,
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

    const leadScoreVariant = resolveLeadScoreVariant(normalizedUserId)
    let leadConversionStats = null
    try {
      leadConversionStats = await loadLeadConversionStats(normalizedUserId)
    } catch (error) {
      leadConversionStats = null
    }
    payload.leadScoreVariant = leadScoreVariant
    payload.leadConversionStats = leadConversionStats

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

const buildCampaignSegmentClause = (segment, statsAlias = 'stats') => {
  if (segment === 'new') {
    return `AND COALESCE(${statsAlias}.confirmed_count, 0) = 0`
  }
  if (segment === 'regular') {
    return `AND (COALESCE(${statsAlias}.confirmed_count, 0) >= 2 OR (${statsAlias}.last_confirmed_at IS NOT NULL AND ${statsAlias}.last_confirmed_at >= NOW() - INTERVAL '${LEAD_CONVERSION_WINDOW_DAYS} days'))`
  }
  return ''
}

const fetchMarketingRecipients = async ({ masterId, limit, segment = 'all' }) => {
  const normalizedSegment = normalizeCampaignSegment(segment)
  const values = limit ? [masterId, limit] : [masterId]
  const limitClause = limit ? 'LIMIT $2' : ''
  const segmentClause = buildCampaignSegmentClause(normalizedSegment)
  const result = await pool.query(
    `
      SELECT mms.subscriber_id AS "userId"
      FROM master_marketing_subscriptions mms
      JOIN users u ON u.user_id = mms.subscriber_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS confirmed_count,
          MAX(scheduled_at) AS last_confirmed_at
        FROM service_bookings sb
        WHERE sb.master_id = $1
          AND sb.client_id = mms.subscriber_id
          AND sb.status = 'confirmed'
      ) stats ON TRUE
      WHERE mms.master_id = $1
        AND mms.opt_in = TRUE
        AND COALESCE(u.is_blocked, FALSE) = FALSE
        ${segmentClause}
      ORDER BY mms.created_at DESC
      ${limitClause}
    `,
    values
  )

  return result.rows.map((row) => normalizeText(row.userId)).filter(Boolean)
}

const normalizeRepeatIntervals = (value) => {
  if (!value || typeof value !== 'object') return {}
  const result = {}
  Object.entries(value).forEach(([key, raw]) => {
    const parsed = parseOptionalInt(raw)
    if (parsed && parsed > 0) {
      result[normalizeText(key)] = parsed
    }
  })
  return result
}

const resolveRepeatIntervalDays = (categoryId, overrides) => {
  const normalized = normalizeText(categoryId)
  const defaultOverride = overrides?.default
  const fallbackDefault =
    (normalized && REPEAT_DEFAULT_INTERVALS[normalized]) ?? REPEAT_DEFAULT_INTERVALS.default
  const baseDefault = defaultOverride && defaultOverride > 0 ? defaultOverride : fallbackDefault
  if (!normalized) return baseDefault
  const custom = overrides?.[normalized]
  if (custom && custom > 0) return custom
  return baseDefault
}

const getRepeatCategoryLabel = (categoryId) => {
  const normalized = normalizeText(categoryId)
  if (!normalized) return 'услуга'
  const map = {
    'beauty-nails': 'ногти',
    'brows-lashes': 'брови и ресницы',
    hair: 'волосы',
    'cosmetology-care': 'уход за лицом',
  }
  return map[normalized] ?? normalized
}

const buildRepeatMessage = ({ template, categoryLabel, masterName }) => {
  const base =
    normalizeText(template) ||
    `Пора записаться на повторную услугу: ${categoryLabel}. Выберите удобное время по кнопке ниже.`
  const resolvedMaster = normalizeText(masterName) || 'мастер'
  return base
    .replace(/\{\{\s*category\s*\}\}/gi, categoryLabel)
    .replace(/\{\{\s*master\s*\}\}/gi, resolvedMaster)
}

const mapPromotionRow = (row) => ({
  id: Number(row.id),
  masterId: row.masterId ?? row.master_id,
  type: row.type,
  title: row.title,
  description: row.description ?? null,
  startAt: row.startAt ?? row.start_at,
  endAt: row.endAt ?? row.end_at,
  status: row.status ?? 'active',
  audience: row.audience ?? 'all',
  discountPercent: normalizePromotionDiscount(
    row.discountPercent ?? row.discount_percent
  ),
  maxUses: row.maxUses ?? row.max_uses ?? null,
  usesCount: Number.isFinite(Number(row.usesCount ?? row.uses_count))
    ? Number(row.usesCount ?? row.uses_count)
    : 0,
  createdAt: row.createdAt ?? row.created_at ?? null,
  updatedAt: row.updatedAt ?? row.updated_at ?? null,
})

const fetchRepeatBaseCandidates = async (masterId) => {
  const result = await pool.query(
    `
      WITH last_visits AS (
        SELECT DISTINCT ON (client_id, category_id)
          id AS "bookingId",
          client_id AS "clientId",
          category_id AS "categoryId",
          scheduled_at AS "scheduledAt"
        FROM service_bookings
        WHERE master_id = $1
          AND status = 'confirmed'
          AND scheduled_at < NOW()
          AND (outcome IS NULL OR outcome IN ('on_time', 'late', 'completed'))
        ORDER BY client_id, category_id, scheduled_at DESC
      ),
      upcoming AS (
        SELECT DISTINCT client_id, category_id
        FROM service_bookings
        WHERE master_id = $1
          AND status IN ('pending', 'price_pending', 'price_proposed', 'confirmed')
          AND scheduled_at >= NOW()
      ),
      eligible AS (
        SELECT lv.*
        FROM last_visits lv
        LEFT JOIN upcoming up
          ON up.client_id = lv."clientId"
          AND up.category_id = lv."categoryId"
        WHERE up.client_id IS NULL
      )
      SELECT
        e."bookingId",
        e."clientId",
        e."categoryId",
        e."scheduledAt"
      FROM eligible e
      JOIN users u ON u.user_id = e."clientId"
      WHERE COALESCE(u.is_blocked, FALSE) = FALSE
    `,
    [masterId]
  )
  return result.rows
}

const fetchRepeatLogMap = async (masterId) => {
  const result = await pool.query(
    `
      SELECT
        client_id AS "clientId",
        category_id AS "categoryId",
        last_booking_id AS "lastBookingId",
        last_booking_at AS "lastBookingAt",
        sent_at AS "sentAt"
      FROM marketing_repeat_log
      WHERE master_id = $1
    `,
    [masterId]
  )
  const map = new Map()
  result.rows.forEach((row) => {
    const clientId = normalizeText(row.clientId)
    const categoryId = normalizeText(row.categoryId)
    if (!clientId || !categoryId) return
    map.set(`${clientId}:${categoryId}`, row)
  })
  return map
}

const buildRepeatTargets = async ({ masterId, intervals }) => {
  const candidates = await fetchRepeatBaseCandidates(masterId)
  if (candidates.length === 0) return []
  const logMap = await fetchRepeatLogMap(masterId)
  const now = Date.now()
  const bestByClient = new Map()

  candidates.forEach((row) => {
    const clientId = normalizeText(row.clientId)
    const categoryId = normalizeText(row.categoryId)
    if (!clientId || !categoryId) return
    const scheduledMs = new Date(row.scheduledAt).getTime()
    if (Number.isNaN(scheduledMs)) return
    const intervalDays = resolveRepeatIntervalDays(categoryId, intervals)
    const dueAt = scheduledMs + intervalDays * DAY_MS
    if (now < dueAt) return
    const logKey = `${clientId}:${categoryId}`
    const lastLog = logMap.get(logKey)
    if (lastLog?.lastBookingId && lastLog.lastBookingId === row.bookingId) {
      return
    }
    if (lastLog?.lastBookingAt) {
      const loggedAt = new Date(lastLog.lastBookingAt).getTime()
      if (!Number.isNaN(loggedAt) && loggedAt >= scheduledMs) {
        return
      }
    }
    const current = bestByClient.get(clientId)
    if (!current || current.dueAt > dueAt) {
      bestByClient.set(clientId, {
        clientId,
        categoryId,
        bookingId: row.bookingId,
        scheduledAt: row.scheduledAt,
        dueAt,
      })
    }
  })

  let targets = Array.from(bestByClient.values())
  if (targets.length > REPEAT_REMINDER_BATCH_LIMIT) {
    targets = targets.slice(0, REPEAT_REMINDER_BATCH_LIMIT)
  }
  return targets
}

const loadRepeatSummary = async (masterId) => {
  const settingsResult = await pool.query(
    `
      SELECT intervals
      FROM marketing_repeat_settings
      WHERE master_id = $1
    `,
    [masterId]
  )
  const intervals = normalizeRepeatIntervals(settingsResult.rows[0]?.intervals)
  const targets = await buildRepeatTargets({ masterId, intervals })

  const lastSentResult = await pool.query(
    `
      SELECT sent_at AS "sentAt"
      FROM marketing_repeat_log
      WHERE master_id = $1
      ORDER BY sent_at DESC
      LIMIT 1
    `,
    [masterId]
  )
  const lastSentAt = lastSentResult.rows[0]?.sentAt ?? null

  if (targets.length === 0) {
    return {
      repeatEligibleTotal: 0,
      repeatEligibleBotCount: 0,
      repeatEligibleChatCount: 0,
      repeatLastSentAt: lastSentAt,
      repeatCheckedAt: new Date().toISOString(),
    }
  }

  const [botRecipients, chatTargets] = await Promise.all([
    fetchMarketingRecipients({ masterId }),
    fetchChatBroadcastTargets({ masterId }),
  ])
  const botSet = new Set(botRecipients)
  const chatSet = new Set(
    chatTargets.map((target) => normalizeText(target.clientId)).filter(Boolean)
  )
  const repeatEligibleBotCount = targets.filter((target) =>
    botSet.has(target.clientId)
  ).length
  const repeatEligibleChatCount = targets.filter((target) =>
    chatSet.has(target.clientId)
  ).length

  return {
    repeatEligibleTotal: targets.length,
    repeatEligibleBotCount,
    repeatEligibleChatCount,
    repeatLastSentAt: lastSentAt,
    repeatCheckedAt: new Date().toISOString(),
  }
}

const buildMarketingBotPayload = async ({
  masterId,
  text,
  includeLink,
  includeUnsubscribe,
  masterName,
}) => {
  if (!telegramBotToken) {
    const error = new Error('bot_not_configured')
    error.code = 'bot_not_configured'
    throw error
  }
  const resolvedName = masterName ?? (await resolveUserDisplayName(masterId))
  const senderPrefix = resolvedName
    ? `Сообщение от мастера ${resolvedName}.`
    : 'Сообщение от мастера.'
  const maxBodyLength = MARKETING_TEXT_LIMIT - senderPrefix.length - 1
  let bodyText = text
  if (maxBodyLength > 0 && bodyText.length > maxBodyLength) {
    const trimmedLength = Math.max(0, maxBodyLength - 1)
    bodyText = `${bodyText.slice(0, trimmedLength).trimEnd()}…`
  }
  const payloadText =
    maxBodyLength > 0 ? `${senderPrefix}\n${bodyText}` : senderPrefix

  const bookingLink =
    includeLink && telegramWebAppUrl
      ? buildStartAppUrl(telegramWebAppUrl, `book_${masterId}`)
      : ''
  const unsubscribeLink =
    includeUnsubscribe && telegramWebAppUrl
      ? buildStartAppUrl(telegramWebAppUrl, `unsub_${masterId}`)
      : ''
  const buttons = []
  if (bookingLink) {
    buttons.push({ text: 'Записаться', webAppUrl: bookingLink })
  }
  if (unsubscribeLink) {
    buttons.push({ text: 'Отписаться', webAppUrl: unsubscribeLink })
  }

  return { payloadText, buttons, masterName: resolvedName }
}

const runRepeatReminderForMaster = async (settings) => {
  const masterId = normalizeText(settings?.masterId)
  if (!masterId) return { total: 0, sent: 0, failed: 0 }
  const enabled = Boolean(settings?.enabled)
  if (!enabled) return { total: 0, sent: 0, failed: 0 }
  const channel = normalizeText(settings?.channel) === 'chat' ? 'chat' : 'bot'
  const includeLink = settings?.includeLink !== false
  const includeUnsubscribe = settings?.includeUnsubscribe !== false
  const intervals = normalizeRepeatIntervals(settings?.intervals)
  const template = normalizeText(settings?.template)
  const targets = await buildRepeatTargets({ masterId, intervals })
  if (targets.length === 0) return { total: 0, sent: 0, failed: 0 }
  const masterName = await resolveUserDisplayName(masterId)

  let sent = 0
  let failed = 0

  if (channel === 'bot') {
    const recipientIds = await fetchMarketingRecipients({ masterId })
    const recipientSet = new Set(recipientIds)
    const filteredTargets = targets.filter((target) => recipientSet.has(target.clientId))
    if (filteredTargets.length === 0) return { total: 0, sent: 0, failed: 0 }

    for (const target of filteredTargets) {
      const categoryLabel = getRepeatCategoryLabel(target.categoryId)
      const messageText = buildRepeatMessage({
        template,
        categoryLabel,
        masterName,
      })
      try {
        const { payloadText, buttons } = await buildMarketingBotPayload({
          masterId,
          text: messageText,
          includeLink,
          includeUnsubscribe,
          masterName,
        })
        const ok = await sendTelegramMessage({
          recipientId: target.clientId,
          text: payloadText,
          buttons,
        })
        if (ok) {
          sent += 1
          await pool.query(
            `
              INSERT INTO marketing_repeat_log (
                master_id,
                client_id,
                category_id,
                last_booking_id,
                last_booking_at,
                sent_at
              )
              VALUES ($1, $2, $3, $4, $5, NOW())
            `,
            [masterId, target.clientId, target.categoryId, target.bookingId, target.scheduledAt]
          )
        } else {
          failed += 1
        }
      } catch (error) {
        if (error?.code === 'bot_not_configured') {
          throw error
        }
        failed += 1
      }
    }
  } else {
    const chatTargets = await fetchChatBroadcastTargets({ masterId })
    const chatMap = new Map(
      chatTargets.map((item) => [normalizeText(item.clientId), item.chatId])
    )
    const filteredTargets = targets.filter((target) => chatMap.has(target.clientId))
    if (filteredTargets.length === 0) return { total: 0, sent: 0, failed: 0 }
    await ensureUser(masterId)

    for (const target of filteredTargets) {
      const chatId = chatMap.get(target.clientId)
      if (!chatId) continue
      const categoryLabel = getRepeatCategoryLabel(target.categoryId)
      const messageText = buildRepeatMessage({
        template,
        categoryLabel,
        masterName,
      })
      try {
        const messageResult = await insertChatTextMessage({
          chatId,
          senderId: masterId,
          body: messageText,
          meta: { kind: 'marketing', channel: 'chat', tag: 'repeat' },
        })
        const messagePayload = {
          id: messageResult.id,
          chatId,
          senderId: masterId,
          type: 'text',
          body: messageText,
          meta: { kind: 'marketing', channel: 'chat', tag: 'repeat' },
          attachmentUrl: null,
          createdAt: messageResult.createdAt,
        }
        void notifyChatMembers(chatId, {
          type: 'message:new',
          chatId,
          message: messagePayload,
        })
        const preview =
          messageText.length > 120 ? `${messageText.slice(0, 117)}...` : messageText
        void sendChatNotification({
          chatId,
          senderId: masterId,
          preview,
          audience: 'client',
        })
        sent += 1
        await pool.query(
          `
            INSERT INTO marketing_repeat_log (
              master_id,
              client_id,
              category_id,
              last_booking_id,
              last_booking_at,
              sent_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
          `,
          [masterId, target.clientId, target.categoryId, target.bookingId, target.scheduledAt]
        )
      } catch (error) {
        failed += 1
      }
    }
  }

  return { total: targets.length, sent, failed }
}

const sendMarketingBotBroadcast = async ({
  masterId,
  text,
  includeLink,
  includeUnsubscribe,
  limit,
  segment = 'all',
  collectRecipients = false,
}) => {
  const { payloadText, buttons } = await buildMarketingBotPayload({
    masterId,
    text,
    includeLink,
    includeUnsubscribe,
  })
  const recipients = await fetchMarketingRecipients({ masterId, limit, segment })
  if (recipients.length === 0) {
    return { total: 0, sent: 0, failed: 0, deliveredIds: collectRecipients ? [] : null }
  }

  let sent = 0
  let failed = 0
  const deliveredIds = collectRecipients ? [] : null
  for (let index = 0; index < recipients.length; index += MARKETING_BROADCAST_CHUNK) {
    const chunk = recipients.slice(index, index + MARKETING_BROADCAST_CHUNK)
    const results = await Promise.all(
      chunk.map((recipientId) =>
        sendTelegramMessage({
          recipientId,
          text: payloadText,
          buttons,
        })
      )
    )
    results.forEach((ok, idx) => {
      if (ok) {
        sent += 1
        if (deliveredIds) {
          deliveredIds.push(chunk[idx])
        }
      } else {
        failed += 1
      }
    })
  }

  return { total: recipients.length, sent, failed, deliveredIds }
}

const fetchChatBroadcastTargets = async ({ masterId, limit, segment = 'all' }) => {
  const normalizedSegment = normalizeCampaignSegment(segment)
  const values = limit ? [masterId, limit] : [masterId]
  const limitClause = limit ? 'LIMIT $2' : ''
  const segmentClause = buildCampaignSegmentClause(normalizedSegment)
  const result = await pool.query(
    `
      SELECT DISTINCT ON (c.client_id)
        c.id AS "chatId",
        c.client_id AS "clientId"
      FROM chats c
      JOIN users u ON u.user_id = c.client_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS confirmed_count,
          MAX(scheduled_at) AS last_confirmed_at
        FROM service_bookings sb
        WHERE sb.master_id = $1
          AND sb.client_id = c.client_id
          AND sb.status = 'confirmed'
      ) stats ON TRUE
      WHERE c.master_id = $1
        AND c.status = 'active'
        AND c.context_type <> 'support'
        AND COALESCE(u.is_blocked, FALSE) = FALSE
        ${segmentClause}
      ORDER BY c.client_id, c.updated_at DESC
      ${limitClause}
    `,
    values
  )
  return result.rows
    .map((row) => ({
      chatId: parseOptionalInt(row.chatId),
      clientId: normalizeText(row.clientId),
    }))
    .filter((row) => Number.isInteger(row.chatId) && row.clientId)
}

const sendMarketingChatBroadcast = async ({
  masterId,
  text,
  limit,
  segment = 'all',
  collectRecipients = false,
}) => {
  const targets = await fetchChatBroadcastTargets({ masterId, limit, segment })
  if (targets.length === 0) {
    return { total: 0, sent: 0, failed: 0, deliveredIds: collectRecipients ? [] : null }
  }
  await ensureUser(masterId)

  let sent = 0
  let failed = 0
  const deliveredIds = collectRecipients ? [] : null
  for (const target of targets) {
    try {
      const messageResult = await insertChatTextMessage({
        chatId: target.chatId,
        senderId: masterId,
        body: text,
        meta: { kind: 'marketing', channel: 'chat' },
      })
      const messagePayload = {
        id: messageResult.id,
        chatId: target.chatId,
        senderId: masterId,
        type: 'text',
        body: text,
        meta: { kind: 'marketing', channel: 'chat' },
        attachmentUrl: null,
        createdAt: messageResult.createdAt,
      }
      void notifyChatMembers(target.chatId, {
        type: 'message:new',
        chatId: target.chatId,
        message: messagePayload,
      })
      const preview = text.length > 120 ? `${text.slice(0, 117)}...` : text
      void sendChatNotification({
        chatId: target.chatId,
        senderId: masterId,
        preview,
        audience: 'client',
      })
      sent += 1
      if (deliveredIds) {
        deliveredIds.push(target.clientId)
      }
    } catch (error) {
      failed += 1
    }
  }

  return { total: targets.length, sent, failed, deliveredIds }
}

const buildCampaignTextPreview = (text) => {
  const normalized = normalizeText(text)
  if (!normalized) return null
  if (normalized.length <= 160) return normalized
  return `${normalized.slice(0, 157).trimEnd()}...`
}

const createMarketingCampaign = async ({
  masterId,
  channel,
  segment,
  discountPercent,
  durationDays,
  deliveredIds,
  text,
}) => {
  const startAt = new Date()
  const endAt = new Date(startAt.getTime() + durationDays * DAY_MS)
  const textPreview = buildCampaignTextPreview(text)
  const insertResult = await pool.query(
    `
      INSERT INTO marketing_campaigns (
        master_id,
        channel,
        segment,
        discount_percent,
        text_preview,
        start_at,
        end_at,
        sent_at,
        status,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'active', NOW())
      RETURNING
        id,
        master_id AS "masterId",
        channel,
        segment,
        discount_percent AS "discountPercent",
        text_preview AS "textPreview",
        start_at AS "startAt",
        end_at AS "endAt",
        sent_at AS "sentAt",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [
      masterId,
      channel,
      segment,
      discountPercent,
      textPreview,
      startAt,
      endAt,
    ]
  )
  const campaign = insertResult.rows[0] ?? null
  const ids = Array.from(new Set(deliveredIds)).filter(Boolean)
  if (campaign?.id && ids.length > 0) {
    await pool.query(
      `
        INSERT INTO marketing_campaign_recipients (
          campaign_id,
          client_id,
          channel,
          sent_at
        )
        SELECT $1, unnest($2::text[]), $3, NOW()
        ON CONFLICT DO NOTHING
      `,
      [campaign.id, ids, channel]
    )
  }
  return campaign
}

app.post('/api/pro/marketing/broadcast', async (req, res) => {
  const masterId = normalizeText(req.body?.userId ?? req.body?.masterId)
  if (!masterId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  const text = normalizeText(req.body?.text)
  if (!text) {
    res.status(400).json({ error: 'text_required' })
    return
  }
  if (text.length > MARKETING_TEXT_LIMIT) {
    res.status(400).json({ error: 'text_too_long' })
    return
  }

  const includeUnsubscribe = Boolean(req.body?.includeUnsubscribe)
  const includeLink = Boolean(req.body?.includeLink)
  const rawLimit = parseOptionalInt(req.body?.limit)
  const limit =
    rawLimit && rawLimit > 0 ? Math.min(rawLimit, MARKETING_BROADCAST_MAX) : null

  try {
    const result = await sendMarketingBotBroadcast({
      masterId,
      text,
      includeLink,
      includeUnsubscribe,
      limit,
    })
    res.json({ ok: true, ...result })
  } catch (error) {
    if (error?.code === 'bot_not_configured') {
      res.status(400).json({ error: 'bot_not_configured' })
      return
    }
    console.error('POST /api/pro/marketing/broadcast failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/pro/marketing/summary', async (req, res) => {
  const masterId = normalizeText(req.query.userId)
  if (!masterId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM master_marketing_subscriptions mms
            JOIN users u ON u.user_id = mms.subscriber_id
            WHERE mms.master_id = $1
              AND mms.opt_in = TRUE
              AND COALESCE(u.is_blocked, FALSE) = FALSE
          ) AS "botOptInCount",
          (
            SELECT COUNT(*)::int
            FROM chats c
            JOIN users u ON u.user_id = c.client_id
            WHERE c.master_id = $1
              AND c.status = 'active'
              AND c.context_type <> 'support'
              AND COALESCE(u.is_blocked, FALSE) = FALSE
          ) AS "chatCount"
      `,
      [masterId]
    )
    const row = result.rows[0] ?? {}
    const repeatSummary = await loadRepeatSummary(masterId)
    res.json({
      botOptInCount: Number(row.botOptInCount) || 0,
      chatCount: Number(row.chatCount) || 0,
      ...repeatSummary,
    })
  } catch (error) {
    console.error('GET /api/pro/marketing/summary failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/pro/marketing/repeat-settings', async (req, res) => {
  const masterId = normalizeText(req.query.userId)
  if (!masterId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          enabled,
          channel,
          include_link AS "includeLink",
          include_unsubscribe AS "includeUnsubscribe",
          intervals,
          template
        FROM marketing_repeat_settings
        WHERE master_id = $1
      `,
      [masterId]
    )
    const row = result.rows[0]
    if (!row) {
      res.json({
        enabled: false,
        channel: 'bot',
        includeLink: true,
        includeUnsubscribe: true,
        intervals: {},
        template: null,
      })
      return
    }
    res.json({
      enabled: Boolean(row.enabled),
      channel: row.channel === 'chat' ? 'chat' : 'bot',
      includeLink: row.includeLink !== false,
      includeUnsubscribe: row.includeUnsubscribe !== false,
      intervals: row.intervals ?? {},
      template: row.template ?? null,
    })
  } catch (error) {
    console.error('GET /api/pro/marketing/repeat-settings failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/pro/marketing/repeat-settings', async (req, res) => {
  const masterId = normalizeText(req.body?.userId ?? req.body?.masterId)
  if (!masterId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  const enabled = Boolean(req.body?.enabled)
  const channel = normalizeText(req.body?.channel) === 'chat' ? 'chat' : 'bot'
  const includeLink = req.body?.includeLink !== false
  const includeUnsubscribe = req.body?.includeUnsubscribe !== false
  const intervals = normalizeRepeatIntervals(req.body?.intervals)
  const template = normalizeText(req.body?.template) || null

  try {
    await ensureUser(masterId)
    const result = await pool.query(
      `
        INSERT INTO marketing_repeat_settings (
          master_id,
          enabled,
          channel,
          include_link,
          include_unsubscribe,
          intervals,
          template,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
        ON CONFLICT (master_id) DO UPDATE
        SET
          enabled = EXCLUDED.enabled,
          channel = EXCLUDED.channel,
          include_link = EXCLUDED.include_link,
          include_unsubscribe = EXCLUDED.include_unsubscribe,
          intervals = EXCLUDED.intervals,
          template = EXCLUDED.template,
          updated_at = NOW()
        RETURNING
          enabled,
          channel,
          include_link AS "includeLink",
          include_unsubscribe AS "includeUnsubscribe",
          intervals,
          template
      `,
      [masterId, enabled, channel, includeLink, includeUnsubscribe, intervals, template]
    )
    const row = result.rows[0] ?? {}
    res.json({
      enabled: Boolean(row.enabled),
      channel: row.channel === 'chat' ? 'chat' : 'bot',
      includeLink: row.includeLink !== false,
      includeUnsubscribe: row.includeUnsubscribe !== false,
      intervals: row.intervals ?? {},
      template: row.template ?? null,
    })
  } catch (error) {
    console.error('POST /api/pro/marketing/repeat-settings failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.get('/api/pro/marketing/promotions', async (req, res) => {
  const masterId = normalizeText(req.query.userId)
  if (!masterId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          master_id AS "masterId",
          type,
          title,
          description,
          start_at AS "startAt",
          end_at AS "endAt",
          status,
          audience,
          discount_percent AS "discountPercent",
          max_uses AS "maxUses",
          uses_count AS "usesCount",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM master_promotions
        WHERE master_id = $1
        ORDER BY updated_at DESC, created_at DESC
      `,
      [masterId]
    )
    res.json(result.rows.map(mapPromotionRow))
  } catch (error) {
    console.error('GET /api/pro/marketing/promotions failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/pro/marketing/promotions', async (req, res) => {
  const masterId = normalizeText(req.body?.userId ?? req.body?.masterId)
  if (!masterId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  const promotionId = parseOptionalInt(req.body?.promotionId ?? req.body?.id)
  const type = normalizePromotionType(req.body?.type)
  const title = normalizePromotionTitle(req.body?.title)
  const description = normalizePromotionDescription(req.body?.description)
  const audience = normalizePromotionAudience(req.body?.audience)
  const status = normalizePromotionStatus(req.body?.status)
  const maxUses = parseOptionalInt(req.body?.maxUses)
  const rawDiscountPercent = req.body?.discountPercent ?? req.body?.discount_percent
  const discountPercent = normalizePromotionDiscount(rawDiscountPercent)
  const startAt = parseDateTime(req.body?.startAt) ?? new Date()
  const endAt =
    parseDateTime(req.body?.endAt) ??
    new Date(startAt.getTime() + 7 * DAY_MS)

  if (!title) {
    res.status(400).json({ error: 'title_required' })
    return
  }
  if (endAt.getTime() <= startAt.getTime()) {
    res.status(400).json({ error: 'date_range_invalid' })
    return
  }
  const durationDays = Math.ceil(
    (endAt.getTime() - startAt.getTime()) / DAY_MS
  )
  if (durationDays > PROMOTION_MAX_DURATION_DAYS) {
    res.status(400).json({ error: 'duration_too_long' })
    return
  }
  if (!promotionId && type === 'discount' && discountPercent <= 0) {
    res.status(400).json({ error: 'discount_required' })
    return
  }

  try {
    await ensureUser(masterId)
    let row
    if (promotionId) {
      const existing = await pool.query(
        `
          SELECT *
          FROM master_promotions
          WHERE id = $1 AND master_id = $2
        `,
        [promotionId, masterId]
      )
      if (existing.rows.length === 0) {
        res.status(404).json({ error: 'not_found' })
        return
      }
      const base = existing.rows[0]
      const nextType = req.body?.type ? type : base.type
      const nextTitle = req.body?.title ? title : base.title
      const nextDescription =
        req.body?.description !== undefined ? description : base.description
      const nextAudience = req.body?.audience ? audience : base.audience
      const nextStatus = req.body?.status ? status : base.status
      const nextMaxUses =
        req.body?.maxUses !== undefined ? maxUses : base.max_uses
      const hasDiscountOverride = rawDiscountPercent !== undefined
      const nextDiscountPercent =
        nextType === 'discount'
          ? hasDiscountOverride
            ? discountPercent
            : normalizePromotionDiscount(base.discount_percent)
          : 0
      const nextStartAt = req.body?.startAt
        ? startAt
        : ensureDateValue(base.start_at)
      const nextEndAt = req.body?.endAt ? endAt : ensureDateValue(base.end_at)

      if (!nextTitle) {
        res.status(400).json({ error: 'title_required' })
        return
      }
      if (!nextStartAt || !nextEndAt) {
        res.status(400).json({ error: 'date_range_invalid' })
        return
      }
      if (nextEndAt.getTime() <= nextStartAt.getTime()) {
        res.status(400).json({ error: 'date_range_invalid' })
        return
      }
      const nextDurationDays = Math.ceil(
        (nextEndAt.getTime() - nextStartAt.getTime()) / DAY_MS
      )
      if (nextDurationDays > PROMOTION_MAX_DURATION_DAYS) {
        res.status(400).json({ error: 'duration_too_long' })
        return
      }
      if (nextType === 'discount' && nextDiscountPercent <= 0) {
        res.status(400).json({ error: 'discount_required' })
        return
      }
      if (nextStatus === 'active') {
        const eligibility = await loadPromotionEligibility(masterId)
        if (!eligibility.ok) {
          res.status(400).json({
            error: 'promotion_requirements',
            missing: {
              avatar: !eligibility.hasAvatar,
              portfolio: !eligibility.hasPortfolio,
            },
          })
          return
        }
      }

      const updateResult = await pool.query(
        `
          UPDATE master_promotions
          SET
            type = $1,
            title = $2,
            description = $3,
            start_at = $4,
            end_at = $5,
            status = $6,
            audience = $7,
            discount_percent = $8,
            max_uses = $9,
            updated_at = NOW()
          WHERE id = $10 AND master_id = $11
          RETURNING
            id,
            master_id AS "masterId",
            type,
            title,
            description,
            start_at AS "startAt",
            end_at AS "endAt",
            status,
            audience,
            discount_percent AS "discountPercent",
            max_uses AS "maxUses",
            uses_count AS "usesCount",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [
          nextType,
          nextTitle,
          nextDescription,
          nextStartAt,
          nextEndAt,
          nextStatus,
          nextAudience,
          nextDiscountPercent,
          nextMaxUses,
          promotionId,
          masterId,
        ]
      )
      row = updateResult.rows[0]
    } else {
      if (status === 'active') {
        const eligibility = await loadPromotionEligibility(masterId)
        if (!eligibility.ok) {
          res.status(400).json({
            error: 'promotion_requirements',
            missing: {
              avatar: !eligibility.hasAvatar,
              portfolio: !eligibility.hasPortfolio,
            },
          })
          return
        }
      }
      const nextDiscountPercent = type === 'discount' ? discountPercent : 0
      const insertResult = await pool.query(
        `
          INSERT INTO master_promotions (
            master_id,
            type,
            title,
            description,
            start_at,
            end_at,
            status,
            audience,
            discount_percent,
            max_uses,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          RETURNING
            id,
            master_id AS "masterId",
            type,
            title,
            description,
            start_at AS "startAt",
            end_at AS "endAt",
            status,
            audience,
            discount_percent AS "discountPercent",
            max_uses AS "maxUses",
            uses_count AS "usesCount",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [
          masterId,
          type,
          title,
          description,
          startAt,
          endAt,
          status,
          audience,
          nextDiscountPercent,
          maxUses,
        ]
      )
      row = insertResult.rows[0]
    }

    if (row?.status === 'active') {
      await pool.query(
        `
          UPDATE master_promotions
          SET status = 'paused', updated_at = NOW()
          WHERE master_id = $1 AND id <> $2 AND status = 'active'
        `,
        [masterId, row.id]
      )
    }

    res.json(mapPromotionRow(row))
  } catch (error) {
    console.error('POST /api/pro/marketing/promotions failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/pro/marketing/promotions/:promotionId/action', async (req, res) => {
  const masterId = normalizeText(req.body?.userId ?? req.body?.masterId)
  const promotionId = parseOptionalInt(req.params.promotionId)
  const action = normalizeText(req.body?.action).toLowerCase()
  if (!masterId || !promotionId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  if (!['pause', 'resume', 'archive'].includes(action)) {
    res.status(400).json({ error: 'action_invalid' })
    return
  }

  try {
    const existing = await pool.query(
      `
        SELECT *
        FROM master_promotions
        WHERE id = $1 AND master_id = $2
      `,
      [promotionId, masterId]
    )
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    const row = existing.rows[0]
    const endAt = ensureDateValue(row.end_at)
    if (action === 'resume' && endAt && endAt < new Date()) {
      res.status(400).json({ error: 'promotion_expired' })
      return
    }
    if (action === 'resume') {
      const eligibility = await loadPromotionEligibility(masterId)
      if (!eligibility.ok) {
        res.status(400).json({
          error: 'promotion_requirements',
          missing: {
            avatar: !eligibility.hasAvatar,
            portfolio: !eligibility.hasPortfolio,
          },
        })
        return
      }
    }
    const nextStatus =
      action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'archived'

    const updateResult = await pool.query(
      `
        UPDATE master_promotions
        SET status = $1, updated_at = NOW()
        WHERE id = $2 AND master_id = $3
        RETURNING
          id,
          master_id AS "masterId",
          type,
          title,
          description,
          start_at AS "startAt",
          end_at AS "endAt",
          status,
          audience,
          discount_percent AS "discountPercent",
          max_uses AS "maxUses",
          uses_count AS "usesCount",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [nextStatus, promotionId, masterId]
    )
    const updated = updateResult.rows[0]

    if (nextStatus === 'active') {
      await pool.query(
        `
          UPDATE master_promotions
          SET status = 'paused', updated_at = NOW()
          WHERE master_id = $1 AND id <> $2 AND status = 'active'
        `,
        [masterId, promotionId]
      )
    }

    res.json(mapPromotionRow(updated))
  } catch (error) {
    console.error('POST /api/pro/marketing/promotions/:promotionId/action failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

app.post('/api/pro/marketing/campaigns/send', async (req, res) => {
  const masterId = normalizeText(req.body?.userId ?? req.body?.masterId)
  if (!masterId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }
  const channel = normalizeText(req.body?.channel)
  if (channel !== 'bot' && channel !== 'chat') {
    res.status(400).json({ error: 'channel_invalid' })
    return
  }
  const text = normalizeText(req.body?.text)
  if (!text) {
    res.status(400).json({ error: 'text_required' })
    return
  }
  if (text.length > MARKETING_TEXT_LIMIT) {
    res.status(400).json({ error: 'text_too_long' })
    return
  }

  const includeUnsubscribe = Boolean(req.body?.includeUnsubscribe)
  const includeLink = Boolean(req.body?.includeLink)
  const rawLimit = parseOptionalInt(req.body?.limit)
  const limit =
    rawLimit && rawLimit > 0 ? Math.min(rawLimit, MARKETING_BROADCAST_MAX) : null
  const segment = normalizeCampaignSegment(req.body?.segment)
  const discountPayload = req.body?.discount ?? req.body?.promotion ?? null
  const discountEnabled = Boolean(
    discountPayload &&
      (discountPayload.enabled === undefined || discountPayload.enabled === true)
  )

  let discountPercent = 0
  let durationDays = 0
  if (discountEnabled) {
    const rawDiscount =
      discountPayload?.discountPercent ??
      discountPayload?.discount ??
      discountPayload?.percent
    discountPercent = normalizePromotionDiscount(rawDiscount)
    if (rawDiscount === undefined || rawDiscount === null || discountPercent <= 0) {
      res.status(400).json({ error: 'campaign_discount_invalid' })
      return
    }
    const rawDuration = parseOptionalInt(
      discountPayload?.durationDays ?? discountPayload?.duration
    )
    if (rawDuration !== null && rawDuration <= 0) {
      res.status(400).json({ error: 'campaign_duration_invalid' })
      return
    }
    durationDays = rawDuration ?? 7
    if (durationDays > MARKETING_CAMPAIGN_MAX_DURATION_DAYS) {
      res.status(400).json({ error: 'campaign_duration_invalid' })
      return
    }

    const eligibility = await loadPromotionEligibility(masterId)
    if (!eligibility.ok) {
      res.status(400).json({
        error: 'promotion_requirements',
        missing: {
          avatar: !eligibility.hasAvatar,
          portfolio: !eligibility.hasPortfolio,
        },
      })
      return
    }
  }

  try {
    const result =
      channel === 'bot'
        ? await sendMarketingBotBroadcast({
            masterId,
            text,
            includeLink,
            includeUnsubscribe,
            limit,
            segment,
            collectRecipients: discountEnabled,
          })
        : await sendMarketingChatBroadcast({
            masterId,
            text,
            limit,
            segment,
            collectRecipients: discountEnabled,
          })

    if (result.total === 0) {
      res.status(400).json({ error: 'audience_empty' })
      return
    }

    let campaign = null
    if (discountEnabled) {
      const deliveredIds = Array.isArray(result.deliveredIds)
        ? result.deliveredIds.filter(Boolean)
        : []
      if (deliveredIds.length === 0) {
        res.status(400).json({ error: 'audience_empty' })
        return
      }
      campaign = await createMarketingCampaign({
        masterId,
        channel,
        segment,
        discountPercent,
        durationDays,
        deliveredIds,
        text,
      })
    }

    res.json({
      ok: true,
      stats: result,
      campaign,
    })
  } catch (error) {
    if (error?.code === 'bot_not_configured') {
      res.status(400).json({ error: 'bot_not_configured' })
      return
    }
    console.error('POST /api/pro/marketing/campaigns/send failed:', error)
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
    if (!(await ensureUserNotBlocked(normalizedUserId, res))) return
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

    const normalizedCancelWindowHours = clampValue(
      parseOptionalInt(profile.cancelWindowHours) ?? BOOKING_FREE_CANCEL_HOURS,
      0,
      72
    )
    const normalizedDepositPercent = clampValue(
      parseOptionalInt(profile.depositPercent) ?? 0,
      0,
      100
    )
    const baseServicePrice =
      typeof matchedService.price === 'number' ? matchedService.price : null
    const discountChoice = await resolveBookingDiscount({
      masterId: normalizedMasterId,
      clientId: normalizedUserId,
      promotionId: null,
      promotionDiscountPercent: null,
      campaignId: null,
      campaignDiscountPercent: null,
    })
    const discountData =
      discountChoice && baseServicePrice !== null
        ? buildPromotionDiscount(baseServicePrice, discountChoice.discountPercent)
        : null
    const effectiveServicePrice = discountData
      ? discountData.after
      : baseServicePrice
    const appliedPromotion =
      discountChoice?.source === 'promotion' ? discountChoice.promotion : null
    const appliedCampaign =
      discountChoice?.source === 'campaign' ? discountChoice.campaign : null
    const discountSource = discountChoice?.source ?? null
    const depositAmount = calculateDepositAmount(profile, effectiveServicePrice)
    // Deposit flow starts only after booking gets confirmed.
    const depositStatus = 'not_required'
    const depositHoldExpiresAt = null

    const limits = await resolveClientLimits(normalizedUserId)
    const dayWindowStart = new Date(Date.now() - DAY_MS).toISOString()
    const duplicateWindowStart = new Date(
      scheduledDate.getTime() - BOOKING_DUPLICATE_WINDOW_MINUTES * 60 * 1000
    ).toISOString()
    const duplicateWindowEnd = new Date(
      scheduledDate.getTime() + BOOKING_DUPLICATE_WINDOW_MINUTES * 60 * 1000
    ).toISOString()

    const [openBookingsResult, dailyBookingsResult, duplicateBookingResult] =
      await Promise.all([
        pool.query(
          `
            SELECT COUNT(*)::int AS count
            FROM service_bookings
            WHERE client_id = $1
              AND status IN ('pending', 'price_pending', 'price_proposed', 'confirmed')
              AND (
                status <> 'confirmed'
                OR scheduled_at >= NOW() - INTERVAL '2 hours'
              )
          `,
          [normalizedUserId]
        ),
        pool.query(
          `
            SELECT COUNT(*)::int AS count
            FROM service_bookings
            WHERE client_id = $1
              AND created_at >= $2
          `,
          [normalizedUserId, dayWindowStart]
        ),
        pool.query(
          `
            SELECT id
            FROM service_bookings
            WHERE client_id = $1
              AND master_id = $2
              AND status NOT IN ('cancelled', 'declined')
              AND scheduled_at >= $3
              AND scheduled_at <= $4
            LIMIT 1
          `,
          [
            normalizedUserId,
            normalizedMasterId,
            duplicateWindowStart,
            duplicateWindowEnd,
          ]
        ),
      ])

    const openBookingsCount = openBookingsResult.rows[0]?.count ?? 0
    if (openBookingsCount >= limits.booking.maxOpen) {
      res.status(429).json({ error: 'open_booking_limit' })
      return
    }
    const dailyBookingsCount = dailyBookingsResult.rows[0]?.count ?? 0
    if (dailyBookingsCount >= limits.booking.maxPerDay) {
      res.status(429).json({ error: 'daily_booking_limit' })
      return
    }
    if (duplicateBookingResult.rows.length > 0) {
      res.status(409).json({ error: 'duplicate_booking' })
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
          service_duration AS "serviceDuration",
          reschedule_proposed_time AS "rescheduleProposedTime"
        FROM service_bookings
        WHERE master_id = $1
          AND status NOT IN ('declined', 'cancelled')
          AND (
            (scheduled_at >= $2 AND scheduled_at < $3)
            OR (reschedule_proposed_time >= $2 AND reschedule_proposed_time < $3)
          )
      `,
      [normalizedMasterId, dayStart.toISOString(), dayEnd.toISOString()]
    )

    const startMs = scheduledDate.getTime()
    const endMs = startMs + serviceDuration * 60 * 1000
    const hasConflict = existing.rows.some((row) => {
      const existingDuration = Number(row.serviceDuration) || 60
      const times = []
      if (row.scheduledAt) {
        const existingStart = new Date(row.scheduledAt).getTime()
        if (!Number.isNaN(existingStart)) {
          times.push(existingStart)
        }
      }
      if (row.rescheduleProposedTime) {
        const proposedStart = new Date(row.rescheduleProposedTime).getTime()
        if (!Number.isNaN(proposedStart)) {
          times.push(proposedStart)
        }
      }
      return times.some((existingStart) => {
        const existingEnd = existingStart + existingDuration * 60 * 1000
        return startMs < existingEnd && endMs > existingStart
      })
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
          cancel_window_hours,
          deposit_percent,
          deposit_amount,
          deposit_status,
          deposit_hold_expires_at,
          proposed_price,
          promotion_id,
          promotion_discount_percent,
          promotion_discount_amount,
          promotion_price_before,
          promotion_price_after,
          campaign_id,
          campaign_discount_percent,
          campaign_discount_amount,
          campaign_price_before,
          campaign_price_after,
          discount_source,
          client_comment
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NULL, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
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
        effectiveServicePrice,
        serviceDuration,
        normalizedLocationType,
        scheduledDate.toISOString(),
        photoList,
        status,
        normalizedCancelWindowHours,
        normalizedDepositPercent,
        depositAmount,
        depositStatus,
        depositHoldExpiresAt,
        appliedPromotion?.id ?? null,
        discountSource === 'promotion'
          ? discountData?.percent ?? appliedPromotion?.discountPercent ?? null
          : null,
        discountSource === 'promotion' ? discountData?.amount ?? null : null,
        discountSource === 'promotion' ? discountData?.before ?? null : null,
        discountSource === 'promotion' ? discountData?.after ?? null : null,
        appliedCampaign?.id ?? null,
        discountSource === 'campaign'
          ? discountData?.percent ?? appliedCampaign?.discountPercent ?? null
          : null,
        discountSource === 'campaign' ? discountData?.amount ?? null : null,
        discountSource === 'campaign' ? discountData?.before ?? null : null,
        discountSource === 'campaign' ? discountData?.after ?? null : null,
        discountSource,
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

  const {
    userId,
    action,
    price,
    outcome,
    lateMinutes,
    depositProofPath,
    depositProofUrl,
    proposedAt,
    rescheduleNote,
  } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedAction = normalizeText(action)
  const parsedPrice = parseOptionalInt(price)
  const normalizedOutcome = normalizeText(outcome)
  const parsedLateMinutes = parseOptionalInt(lateMinutes)
  const proposedAtRaw = proposedAt ?? req.body?.scheduledAt ?? req.body?.rescheduleAt
  const normalizedProposedAt = normalizeDateTime(proposedAtRaw)
  const normalizedRescheduleNote = normalizeText(rescheduleNote)
  const normalizedDepositProofPath = normalizeUploadPath(
    depositProofPath ?? depositProofUrl
  )

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
          request_id AS "requestId",
          response_id AS "responseId",
          client_id AS "clientId",
          master_id AS "masterId",
          status,
          service_name AS "serviceName",
          service_price AS "servicePrice",
          proposed_price AS "proposedPrice",
          service_duration AS "serviceDuration",
          scheduled_at AS "scheduledAt",
          cancelled_at AS "cancelledAt",
          cancel_window_hours AS "cancelWindowHours",
          deposit_percent AS "depositPercent",
          deposit_amount AS "depositAmount",
          deposit_status AS "depositStatus",
          deposit_hold_expires_at AS "depositHoldExpiresAt",
          deposit_paid_at AS "depositPaidAt",
          deposit_proof_path AS "depositProofPath",
          reschedule_proposed_at AS "rescheduleProposedAt",
          reschedule_proposed_by AS "rescheduleProposedBy",
          reschedule_proposed_time AS "rescheduleProposedTime",
          reschedule_note AS "rescheduleNote",
          promotion_id AS "promotionId",
          promotion_discount_percent AS "promotionDiscountPercent",
          promotion_discount_amount AS "promotionDiscountAmount",
          promotion_price_before AS "promotionPriceBefore",
          promotion_price_after AS "promotionPriceAfter",
          campaign_id AS "campaignId",
          campaign_discount_percent AS "campaignDiscountPercent",
          campaign_discount_amount AS "campaignDiscountAmount",
          campaign_price_before AS "campaignPriceBefore",
          campaign_price_after AS "campaignPriceAfter",
          discount_source AS "discountSource",
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

    if (isClient) {
      const blockStatus = await loadUserBlockStatus(normalizedUserId)
      if (blockStatus?.isBlocked) {
        res.status(403).json({ error: 'user_blocked' })
        return
      }
    }

    const withActorWorkflow = async (payload) => {
      const workflow = await loadBookingWorkflowMetaForViewer(
        bookingId,
        isMaster ? 'master' : 'client'
      )
      return workflow ? { ...payload, ...workflow } : payload
    }

    if (normalizedAction === 'master-accept') {
      if (!isMaster) {
        res.status(403).json({ error: 'forbidden' })
        return
      }

      const depositPercentValue = clampValue(
        parseOptionalInt(booking.depositPercent) ?? 0,
        0,
        100
      )
      const basePrice = resolveBookingBasePrice(booking)
      const resolvedDepositAmount = resolveBookingDepositAmount(booking)
      const depositAmountValue =
        resolvedDepositAmount > 0 ||
        typeof booking.depositAmount === 'number'
          ? resolvedDepositAmount
          : basePrice && depositPercentValue > 0
            ? Math.round((basePrice * depositPercentValue) / 100)
            : 0
      const existingDepositStatus = resolveBookingDepositStatus(
        booking,
        depositAmountValue
      )
      const existingDepositHoldExpiresAt =
        booking.depositHoldExpiresAt ?? null

      if (booking.status === 'confirmed') {
        const chatId = await loadBookingChatId(bookingId)
        res.json(
          await withActorWorkflow({
            ok: true,
            status: 'confirmed',
            depositStatus: existingDepositStatus,
            depositAmount: depositAmountValue,
            depositHoldExpiresAt:
              depositAmountValue > 0 ? existingDepositHoldExpiresAt : null,
            chatId,
          })
        )
        return
      }

      if (booking.status !== 'pending' || booking.servicePrice === null) {
        res.status(409).json({ error: 'status_invalid' })
        return
      }

      const depositStatusValue = depositAmountValue > 0 ? 'pending' : 'not_required'
      const depositHoldExpiresAtValue =
        depositStatusValue === 'pending' ? buildDepositHoldExpiresAt() : null

      await pool.query(
        `
          UPDATE service_bookings
          SET status = 'confirmed',
              deposit_amount = $2,
              deposit_status = $3,
              deposit_hold_expires_at = $4,
              deposit_paid_at = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          bookingId,
          depositAmountValue,
          depositStatusValue,
          depositHoldExpiresAtValue,
        ]
      )
      void evaluateClientSpamBlock(booking.clientId)

      let chatPayload = null
      try {
        chatPayload = await createChatForBooking({
          bookingId,
          clientId: booking.clientId,
          masterId: booking.masterId,
          serviceName: booking.serviceName,
          actorId: normalizedUserId,
          requestId: booking.requestId ?? null,
          responseId: booking.responseId ?? null,
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

      if (
        chatPayload?.chatId &&
        depositAmountValue > 0 &&
        depositStatusValue === 'pending'
      ) {
        try {
          const isDuplicate = await isDuplicateSystemEvent({
            chatId: chatPayload.chatId,
            event: 'deposit_pending',
            bookingId,
          })
          if (!isDuplicate) {
            const amountLabel = formatPriceLabel(depositAmountValue)
            const holdLabel = formatTimeLeftLabel(depositHoldExpiresAtValue)
            const holdText = holdLabel ? `Слот удерживается ${holdLabel}.` : ''
            const body = ['Нужен депозит.', amountLabel && `Сумма: ${amountLabel}`, holdText]
              .filter(Boolean)
              .join(' ')
            const meta = {
              event: 'deposit_pending',
              bookingId,
              serviceName: booking.serviceName ?? null,
              depositAmount: depositAmountValue,
              holdExpiresAt: depositHoldExpiresAtValue,
            }
            const messageResult = await insertSystemMessage({
              chatId: chatPayload.chatId,
              body,
              meta,
              actorId: normalizedUserId,
              audience: 'client',
            })
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
            })
            void sendChatNotification({
              chatId: chatPayload.chatId,
              senderId: normalizedUserId,
              audience: 'client',
              title: 'Нужен депозит',
              text: body,
            })
          }
        } catch (depositMessageError) {
          console.error(
            'Failed to publish deposit pending system message:',
            depositMessageError
          )
        }
      }

      const responseChatId =
        chatPayload?.chatId ?? (await loadBookingChatId(bookingId))
      res.json(
        await withActorWorkflow({
          ok: true,
          status: 'confirmed',
          depositStatus: depositStatusValue,
          depositAmount: depositAmountValue,
          depositHoldExpiresAt: depositHoldExpiresAtValue,
          chatId: responseChatId ?? null,
        })
      )
      return
    }

    if (normalizedAction === 'master-decline') {
      if (!isMaster) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (booking.status === 'declined') {
        res.json(await withActorWorkflow({ ok: true, status: 'declined' }))
        return
      }
      if (!['pending', 'price_pending', 'price_proposed'].includes(booking.status)) {
        res.status(409).json({ error: 'status_invalid' })
        return
      }

      await pool.query(
        `
          UPDATE service_bookings
          SET status = 'declined',
              cancelled_by = 'master',
              cancelled_at = NOW(),
              outcome = NULL,
              reschedule_proposed_at = NULL,
              reschedule_proposed_by = NULL,
              reschedule_proposed_time = NULL,
              reschedule_note = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId]
      )

      let declinedChatId = await loadBookingChatId(bookingId)
      try {
        const chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
          },
          { suppressSystemMessage: true }
        )
        if (chatPayload?.chatId && chatPayload.isNew) {
          void notifyChatMembers(chatPayload.chatId, {
            type: 'chat:created',
            chatId: chatPayload.chatId,
            bookingId,
          })
        }
        declinedChatId = chatPayload?.chatId ?? declinedChatId
      } catch (chatError) {
        console.error('Failed to prepare chat for booking decline:', chatError)
      }
      if (declinedChatId) {
        const isDuplicate = await isDuplicateSystemEvent({
          chatId: declinedChatId,
          event: 'booking_declined',
          bookingId,
        })
        if (!isDuplicate) {
          const body = 'Запись отклонена мастером.'
          const meta = {
            event: 'booking_declined',
            bookingId,
            serviceName: booking.serviceName ?? null,
            cancelledBy: 'master',
          }
          const messageResult = await insertSystemMessage({
            chatId: declinedChatId,
            body,
            meta,
            actorId: normalizedUserId,
            audience: 'client',
          })
          const messagePayload = {
            id: messageResult.id,
            chatId: declinedChatId,
            senderId: null,
            type: 'system',
            body,
            meta,
            attachmentUrl: null,
            createdAt: messageResult.createdAt,
          }
          void notifyChatMembers(declinedChatId, {
            type: 'message:new',
            chatId: declinedChatId,
            message: messagePayload,
          })
          void sendChatNotification({
            chatId: declinedChatId,
            senderId: normalizedUserId,
            audience: 'client',
            title: 'Запись отклонена',
            text: body,
          })
        }
      }

      res.json(await withActorWorkflow({ ok: true, status: 'declined' }))
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

      const depositPercentValue = clampValue(
        parseOptionalInt(booking.depositPercent) ?? 0,
        0,
        100
      )
      const discountChoice = await resolveBookingDiscount({
        masterId: booking.masterId,
        clientId: booking.clientId,
        promotionId: booking.promotionId,
        promotionDiscountPercent: booking.promotionDiscountPercent,
        campaignId: booking.campaignId,
        campaignDiscountPercent: booking.campaignDiscountPercent,
      })
      const discountData = discountChoice
        ? buildPromotionDiscount(parsedPrice, discountChoice.discountPercent)
        : null
      const effectivePrice = discountData ? discountData.after : parsedPrice
      const appliedPromotion =
        discountChoice?.source === 'promotion'
          ? discountChoice.promotion
          : null
      const appliedCampaign =
        discountChoice?.source === 'campaign'
          ? discountChoice.campaign
          : null
      const discountSource = discountChoice?.source ?? null
      const nextDepositAmount =
        depositPercentValue > 0
          ? Math.round((effectivePrice * depositPercentValue) / 100)
          : 0
      const nextDepositStatus = 'not_required'
      const nextDepositHoldExpiresAt = null

      await pool.query(
        `
          UPDATE service_bookings
          SET proposed_price = $2,
              status = 'price_proposed',
              deposit_amount = $3,
              deposit_status = $4,
              deposit_hold_expires_at = $5,
              promotion_id = $6,
              promotion_discount_percent = $7,
              promotion_discount_amount = $8,
              promotion_price_before = $9,
              promotion_price_after = $10,
              campaign_id = $11,
              campaign_discount_percent = $12,
              campaign_discount_amount = $13,
              campaign_price_before = $14,
              campaign_price_after = $15,
              discount_source = $16,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          bookingId,
          effectivePrice,
          nextDepositAmount,
          nextDepositStatus,
          nextDepositHoldExpiresAt,
          appliedPromotion?.id ?? null,
          discountSource === 'promotion'
            ? discountData?.percent ?? appliedPromotion?.discountPercent ?? null
            : null,
          discountSource === 'promotion' ? discountData?.amount ?? null : null,
          discountSource === 'promotion' ? discountData?.before ?? null : null,
          discountSource === 'promotion' ? discountData?.after ?? null : null,
          appliedCampaign?.id ?? null,
          discountSource === 'campaign'
            ? discountData?.percent ?? appliedCampaign?.discountPercent ?? null
            : null,
          discountSource === 'campaign' ? discountData?.amount ?? null : null,
          discountSource === 'campaign' ? discountData?.before ?? null : null,
          discountSource === 'campaign' ? discountData?.after ?? null : null,
          discountSource,
        ]
      )

      let chatPayload = null
      try {
        chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
          },
          { suppressSystemMessage: true }
        )
        if (chatPayload?.chatId && chatPayload.isNew) {
          void notifyChatMembers(chatPayload.chatId, {
            type: 'chat:created',
            chatId: chatPayload.chatId,
            bookingId,
          })
        }
      } catch (chatError) {
        console.error('Failed to prepare chat for price proposal:', chatError)
      }

      const priceChatId =
        chatPayload?.chatId ?? (await loadBookingChatId(bookingId))
      if (priceChatId) {
        const isDuplicate = await isDuplicateSystemEvent({
          chatId: priceChatId,
          event: 'booking_price_proposed',
          bookingId,
        })
        if (!isDuplicate) {
          const baseLabel = formatPriceLabel(parsedPrice)
          const finalLabel = formatPriceLabel(effectivePrice)
          const discountLabel =
            discountData && baseLabel && finalLabel
              ? `Скидка -${discountData.percent}%: ${finalLabel} вместо ${baseLabel}.`
              : ''
          const body = finalLabel
            ? [
                `Мастер предложил цену: ${finalLabel}.`,
                discountLabel,
                'Подтвердите запись.',
              ]
                .filter(Boolean)
                .join(' ')
            : 'Мастер предложил цену. Подтвердите запись.'
          const meta = {
            event: 'booking_price_proposed',
            bookingId,
            serviceName: booking.serviceName ?? null,
            proposedPrice: effectivePrice,
            promotionId: appliedPromotion?.id ?? null,
            promotionDiscountPercent:
              discountSource === 'promotion'
                ? discountData?.percent ?? appliedPromotion?.discountPercent ?? null
                : null,
            promotionDiscountAmount:
              discountSource === 'promotion' ? discountData?.amount ?? null : null,
            promotionPriceBefore:
              discountSource === 'promotion' ? discountData?.before ?? null : null,
            promotionPriceAfter:
              discountSource === 'promotion' ? discountData?.after ?? null : null,
            campaignId: appliedCampaign?.id ?? null,
            campaignDiscountPercent:
              discountSource === 'campaign'
                ? discountData?.percent ?? appliedCampaign?.discountPercent ?? null
                : null,
            campaignDiscountAmount:
              discountSource === 'campaign' ? discountData?.amount ?? null : null,
            campaignPriceBefore:
              discountSource === 'campaign' ? discountData?.before ?? null : null,
            campaignPriceAfter:
              discountSource === 'campaign' ? discountData?.after ?? null : null,
            discountSource,
            depositAmount: nextDepositAmount ?? null,
            depositStatus: nextDepositStatus ?? null,
            depositHoldExpiresAt: nextDepositHoldExpiresAt ?? null,
          }
          const messageResult = await insertSystemMessage({
            chatId: priceChatId,
            body,
            meta,
            actorId: normalizedUserId,
            audience: 'client',
          })
          const messagePayload = {
            id: messageResult.id,
            chatId: priceChatId,
            senderId: null,
            type: 'system',
            body,
            meta,
            attachmentUrl: null,
            createdAt: messageResult.createdAt,
          }
          void notifyChatMembers(priceChatId, {
            type: 'message:new',
            chatId: priceChatId,
            message: messagePayload,
          })
          void sendChatNotification({
            chatId: priceChatId,
            senderId: normalizedUserId,
            audience: 'client',
            title: 'Предложена цена',
            text: body,
          })
        }
      }

      res.json(
        await withActorWorkflow({
          ok: true,
          status: 'price_proposed',
          proposedPrice: parsedPrice,
          depositAmount: nextDepositAmount,
          depositStatus: nextDepositStatus,
        })
      )
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

      const depositPercentValue = clampValue(
        parseOptionalInt(booking.depositPercent) ?? 0,
        0,
        100
      )
      const nextDepositAmount =
        depositPercentValue > 0
          ? Math.round((booking.proposedPrice * depositPercentValue) / 100)
          : 0
      const nextDepositStatus = nextDepositAmount > 0 ? 'pending' : 'not_required'
      const nextDepositHoldExpiresAt =
        nextDepositStatus === 'pending' ? buildDepositHoldExpiresAt() : null

      await pool.query(
        `
          UPDATE service_bookings
          SET service_price = $2,
              proposed_price = NULL,
              status = 'confirmed',
              deposit_amount = $3,
              deposit_status = $4,
              deposit_hold_expires_at = $5,
              deposit_paid_at = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId, booking.proposedPrice, nextDepositAmount, nextDepositStatus, nextDepositHoldExpiresAt]
      )
      void evaluateClientSpamBlock(booking.clientId)

      let chatPayload = null
      try {
        chatPayload = await createChatForBooking({
          bookingId,
          clientId: booking.clientId,
          masterId: booking.masterId,
          serviceName: booking.serviceName,
          actorId: normalizedUserId,
          requestId: booking.requestId ?? null,
          responseId: booking.responseId ?? null,
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

      if (
        chatPayload?.chatId &&
        nextDepositAmount &&
        nextDepositAmount > 0 &&
        nextDepositStatus === 'pending'
      ) {
        const isDuplicate = await isDuplicateSystemEvent({
          chatId: chatPayload.chatId,
          event: 'deposit_pending',
          bookingId,
        })
        if (!isDuplicate) {
          const amountLabel = formatPriceLabel(nextDepositAmount)
          const holdLabel = formatTimeLeftLabel(nextDepositHoldExpiresAt)
          const holdText = holdLabel ? `Слот удерживается ${holdLabel}.` : ''
          const body = ['Нужен депозит.', amountLabel && `Сумма: ${amountLabel}`, holdText]
            .filter(Boolean)
            .join(' ')
          const meta = {
            event: 'deposit_pending',
            bookingId,
            serviceName: booking.serviceName ?? null,
            depositAmount: nextDepositAmount,
            holdExpiresAt: nextDepositHoldExpiresAt ?? null,
          }
          const messageResult = await insertSystemMessage({
            chatId: chatPayload.chatId,
            body,
            meta,
            actorId: normalizedUserId,
            audience: 'client',
          })
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
          })
          void sendChatNotification({
            chatId: chatPayload.chatId,
            senderId: normalizedUserId,
            audience: 'client',
            title: 'Нужен депозит',
            text: body,
          })
        }
      }

      res.json(
        await withActorWorkflow({
          ok: true,
          status: 'confirmed',
          servicePrice: booking.proposedPrice,
          depositAmount: nextDepositAmount,
          depositStatus: nextDepositStatus,
          depositHoldExpiresAt: nextDepositHoldExpiresAt,
          chatId: chatPayload?.chatId ?? null,
        })
      )
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
              outcome = NULL,
              reschedule_proposed_at = NULL,
              reschedule_proposed_by = NULL,
              reschedule_proposed_time = NULL,
              reschedule_note = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId, cancelledAt]
      )

      let cancelledChatId = await loadBookingChatId(bookingId)
      try {
        const chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
          },
          { suppressSystemMessage: true }
        )
        if (chatPayload?.chatId && chatPayload.isNew) {
          void notifyChatMembers(chatPayload.chatId, {
            type: 'chat:created',
            chatId: chatPayload.chatId,
            bookingId,
          })
        }
        cancelledChatId = chatPayload?.chatId ?? cancelledChatId
      } catch (chatError) {
        console.error('Failed to prepare chat for price decline:', chatError)
      }
      if (cancelledChatId) {
        const isDuplicate = await isDuplicateSystemEvent({
          chatId: cancelledChatId,
          event: 'booking_cancelled',
          bookingId,
        })
        if (!isDuplicate) {
          const body = 'Запись отменена клиентом.'
          const meta = {
            event: 'booking_cancelled',
            bookingId,
            serviceName: booking.serviceName ?? null,
            cancelledBy: 'client',
            cancelReason: 'price_declined',
          }
          const messageResult = await insertSystemMessage({
            chatId: cancelledChatId,
            body,
            meta,
            actorId: normalizedUserId,
            audience: 'master',
          })
          const messagePayload = {
            id: messageResult.id,
            chatId: cancelledChatId,
            senderId: null,
            type: 'system',
            body,
            meta,
            attachmentUrl: null,
            createdAt: messageResult.createdAt,
          }
          void notifyChatMembers(cancelledChatId, {
            type: 'message:new',
            chatId: cancelledChatId,
            message: messagePayload,
          })
          void sendChatNotification({
            chatId: cancelledChatId,
            senderId: normalizedUserId,
            audience: 'master',
            title: 'Запись отменена',
            text: body,
          })
        }
      }

      res.json(await withActorWorkflow({ ok: true, status: 'cancelled' }))
      return
    }

    if (normalizedAction === 'client-deposit-submit') {
      if (!isClient) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (booking.status !== 'confirmed') {
        res.status(409).json({ error: 'status_invalid' })
        return
      }
      const depositAmount = resolveBookingDepositAmount(booking)
      if (!depositAmount || depositAmount <= 0) {
        res.status(409).json({ error: 'deposit_not_required' })
        return
      }
      const depositStatus =
        resolveBookingDepositStatus(booking, depositAmount)
      if (depositStatus === 'confirmed') {
        res.status(409).json({ error: 'deposit_already_confirmed' })
        return
      }
      if (!['pending', 'rejected', 'not_required'].includes(depositStatus)) {
        res.status(409).json({ error: 'deposit_status_invalid' })
        return
      }
      if (booking.depositHoldExpiresAt) {
        const holdExpiresAtMs = new Date(booking.depositHoldExpiresAt).getTime()
        if (Number.isFinite(holdExpiresAtMs) && holdExpiresAtMs <= Date.now()) {
          res.status(409).json({ error: 'hold_expired' })
          return
        }
      }
      if (!normalizedDepositProofPath) {
        res.status(400).json({ error: 'deposit_proof_required' })
        return
      }
      const safeUserId = sanitizePathSegment(normalizedUserId)
      if (!isSafeRequestUploadPath(safeUserId, normalizedDepositProofPath)) {
        res.status(403).json({ error: 'deposit_proof_forbidden' })
        return
      }

      const updateResult = await pool.query(
        `
          UPDATE service_bookings
          SET deposit_amount = $2,
              deposit_status = 'submitted',
              deposit_hold_expires_at = NULL,
              deposit_paid_at = NOW(),
              deposit_proof_path = $3,
              updated_at = NOW()
          WHERE id = $1
            AND status = 'confirmed'
            AND (
              deposit_status IN ('pending', 'rejected', 'not_required')
              OR deposit_status IS NULL
            )
            AND (deposit_hold_expires_at IS NULL OR deposit_hold_expires_at > NOW())
        `,
        [bookingId, depositAmount, normalizedDepositProofPath]
      )
      if (updateResult.rowCount === 0) {
        res.status(409).json({ error: 'hold_expired' })
        return
      }

      let chatPayload = null
      try {
        chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
          },
          { suppressSystemMessage: true }
        )
        if (chatPayload?.chatId && chatPayload.isNew) {
          void notifyChatMembers(chatPayload.chatId, {
            type: 'chat:created',
            chatId: chatPayload.chatId,
            bookingId,
          })
        }
        if (chatPayload?.chatId) {
          const isDuplicate = await isDuplicateSystemEvent({
            chatId: chatPayload.chatId,
            event: 'deposit_submitted',
            bookingId,
          })
          if (!isDuplicate) {
            const body = 'Депозит отправлен. Ждём подтверждения мастера.'
            const meta = {
              event: 'deposit_submitted',
              bookingId,
              serviceName: booking.serviceName ?? null,
              depositAmount,
              depositProofPath: normalizedDepositProofPath || null,
            }
            const messageResult = await insertSystemMessage({
              chatId: chatPayload.chatId,
              body,
              meta,
              actorId: normalizedUserId,
              audience: 'master',
            })
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
            })
            void sendChatNotification({
              chatId: chatPayload.chatId,
              senderId: normalizedUserId,
              audience: 'master',
              title: 'Депозит отправлен',
              text: body,
            })
          }
        }
      } catch (chatError) {
        console.error('Failed to notify deposit submission:', chatError)
      }

      res.json(
        await withActorWorkflow({
          ok: true,
          depositStatus: 'submitted',
          depositAmount,
          depositHoldExpiresAt: null,
          depositProofUrl: normalizedDepositProofPath
            ? buildPublicUrl(req, normalizedDepositProofPath)
            : null,
          chatId: chatPayload?.chatId ?? null,
        })
      )
      return
    }

    if (normalizedAction === 'master-deposit-confirm') {
      if (!isMaster) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (booking.status !== 'confirmed') {
        res.status(409).json({ error: 'status_invalid' })
        return
      }
      if (booking.depositStatus === 'confirmed') {
        res.json(
          await withActorWorkflow({
            ok: true,
            depositStatus: 'confirmed',
            depositHoldExpiresAt: null,
          })
        )
        return
      }
      if (booking.depositStatus !== 'submitted') {
        res.status(409).json({ error: 'deposit_status_invalid' })
        return
      }
      const confirmResult = await pool.query(
        `
          UPDATE service_bookings
          SET deposit_status = 'confirmed',
              deposit_hold_expires_at = NULL,
              updated_at = NOW()
          WHERE id = $1
            AND status = 'confirmed'
            AND deposit_status = 'submitted'
        `,
        [bookingId]
      )
      if (confirmResult.rowCount === 0) {
        res.status(409).json({ error: 'deposit_status_invalid' })
        return
      }
      try {
        const chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
          },
          { suppressSystemMessage: true }
        )
        if (chatPayload?.chatId) {
          if (chatPayload.isNew) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'chat:created',
              chatId: chatPayload.chatId,
              bookingId,
            })
          }
          const isDuplicate = await isDuplicateSystemEvent({
            chatId: chatPayload.chatId,
            event: 'deposit_confirmed',
            bookingId,
          })
          if (!isDuplicate) {
            const body = 'Депозит подтверждён. Запись удержана.'
            const meta = {
              event: 'deposit_confirmed',
              bookingId,
              serviceName: booking.serviceName ?? null,
              depositAmount: booking.depositAmount ?? null,
            }
            const messageResult = await insertSystemMessage({
              chatId: chatPayload.chatId,
              body,
              meta,
              actorId: normalizedUserId,
            })
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
            })
            void sendChatNotification({
              chatId: chatPayload.chatId,
              senderId: normalizedUserId,
              audience: 'client',
              title: 'Депозит подтверждён',
              text: body,
            })
          }
        }
      } catch (chatError) {
        console.error('Failed to notify deposit confirmation:', chatError)
      }
      res.json(
        await withActorWorkflow({
          ok: true,
          depositStatus: 'confirmed',
          depositHoldExpiresAt: null,
        })
      )
      return
    }

    if (normalizedAction === 'master-deposit-reject') {
      if (!isMaster) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      if (booking.status !== 'confirmed') {
        res.status(409).json({ error: 'status_invalid' })
        return
      }
      if (booking.depositStatus === 'rejected') {
        res.json(
          await withActorWorkflow({
            ok: true,
            depositStatus: 'rejected',
            depositHoldExpiresAt: booking.depositHoldExpiresAt ?? null,
          })
        )
        return
      }
      if (booking.depositStatus !== 'submitted') {
        res.status(409).json({ error: 'deposit_status_invalid' })
        return
      }
      const nextHoldExpiresAt = buildDepositHoldExpiresAt()
      const rejectResult = await pool.query(
        `
          UPDATE service_bookings
          SET deposit_status = 'rejected',
              deposit_hold_expires_at = $2,
              updated_at = NOW()
          WHERE id = $1
            AND status = 'confirmed'
            AND deposit_status = 'submitted'
        `,
        [bookingId, nextHoldExpiresAt]
      )
      if (rejectResult.rowCount === 0) {
        res.status(409).json({ error: 'deposit_status_invalid' })
        return
      }
      try {
        const chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
          },
          { suppressSystemMessage: true }
        )
        if (chatPayload?.chatId) {
          if (chatPayload.isNew) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'chat:created',
              chatId: chatPayload.chatId,
              bookingId,
            })
          }
          const isDuplicate = await isDuplicateSystemEvent({
            chatId: chatPayload.chatId,
            event: 'deposit_rejected',
            bookingId,
          })
          if (!isDuplicate) {
            const body = `Депозит отклонён. Отправьте чек повторно — слот удерживается ${DEPOSIT_HOLD_MINUTES} мин.`
            const meta = {
              event: 'deposit_rejected',
              bookingId,
              serviceName: booking.serviceName ?? null,
              depositAmount: booking.depositAmount ?? null,
              holdExpiresAt: nextHoldExpiresAt,
            }
            const messageResult = await insertSystemMessage({
              chatId: chatPayload.chatId,
              body,
              meta,
              actorId: normalizedUserId,
            })
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
            })
            void sendChatNotification({
              chatId: chatPayload.chatId,
              senderId: normalizedUserId,
              audience: 'client',
              title: 'Депозит отклонён',
              text: body,
            })
          }
        }
      } catch (chatError) {
        console.error('Failed to notify deposit rejection:', chatError)
      }
      res.json(
        await withActorWorkflow({
          ok: true,
          depositStatus: 'rejected',
          depositHoldExpiresAt: nextHoldExpiresAt,
        })
      )
      return
    }

    if (normalizedAction === 'reschedule-propose') {
      const proposerRole = isClient ? 'client' : isMaster ? 'master' : ''
      if (!proposerRole) {
        res.status(403).json({ error: 'forbidden' })
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
      if (!normalizedProposedAt) {
        res.status(400).json({ error: 'proposedAt_required' })
        return
      }

      const proposedDate = new Date(normalizedProposedAt)
      if (Number.isNaN(proposedDate.getTime())) {
        res.status(400).json({ error: 'proposedAt_invalid' })
        return
      }

      const currentScheduledMs = booking.scheduledAt
        ? new Date(booking.scheduledAt).getTime()
        : null
      if (
        currentScheduledMs &&
        Math.abs(proposedDate.getTime() - currentScheduledMs) < 60 * 1000
      ) {
        res.status(409).json({ error: 'same_time' })
        return
      }

      if (isClient) {
        const cancelWindowHours = clampValue(
          parseOptionalInt(booking.cancelWindowHours) ?? BOOKING_FREE_CANCEL_HOURS,
          0,
          72
        )
        const timeUntilMs =
          typeof currentScheduledMs === 'number'
            ? currentScheduledMs - Date.now()
            : null
        if (
          typeof timeUntilMs !== 'number' ||
          timeUntilMs < cancelWindowHours * 60 * 60 * 1000
        ) {
          res.status(409).json({
            error: 'reschedule_window_closed',
            cancelWindowHours,
          })
          return
        }
      }

      const availability = await validateBookingSlotAvailability({
        masterId: booking.masterId,
        scheduledDate: proposedDate,
        serviceDuration: booking.serviceDuration,
        excludeBookingId: bookingId,
      })
      if (!availability.ok) {
        res.status(409).json({ error: availability.error })
        return
      }

      const rescheduleProposedAt = new Date().toISOString()
      await pool.query(
        `
          UPDATE service_bookings
          SET reschedule_proposed_at = $2,
              reschedule_proposed_by = $3,
              reschedule_proposed_time = $4,
              reschedule_note = $5,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          bookingId,
          rescheduleProposedAt,
          proposerRole,
          normalizedProposedAt,
          normalizedRescheduleNote || null,
        ]
      )

      try {
        const chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
          },
          { suppressSystemMessage: true }
        )
        if (chatPayload?.chatId) {
          if (chatPayload.isNew) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'chat:created',
              chatId: chatPayload.chatId,
              bookingId,
            })
          }
          const body = 'Предложение переноса записи.'
          const meta = {
            event: 'booking_reschedule_proposed',
            bookingId,
            serviceName: booking.serviceName ?? null,
            scheduledAt: booking.scheduledAt ?? null,
            proposedAt: normalizedProposedAt,
            proposedBy: proposerRole,
            note: normalizedRescheduleNote || null,
          }
          const messageResult = await insertSystemMessage({
            chatId: chatPayload.chatId,
            body,
            meta,
            actorId: normalizedUserId,
          })
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
          })
          void sendChatNotification({
            chatId: chatPayload.chatId,
            senderId: normalizedUserId,
            preview: 'Предложение переноса',
          })
        }
      } catch (chatError) {
        console.error('Failed to notify reschedule proposal:', chatError)
      }

      res.json(
        await withActorWorkflow({
          ok: true,
          rescheduleProposedAt,
          rescheduleProposedBy: proposerRole,
          rescheduleProposedTime: normalizedProposedAt,
          rescheduleNote: normalizedRescheduleNote || null,
        })
      )
      return
    }

    if (normalizedAction === 'reschedule-accept') {
      if (booking.status !== 'confirmed') {
        res.status(409).json({ error: 'status_invalid' })
        return
      }
      if (!booking.rescheduleProposedTime) {
        res.status(409).json({ error: 'reschedule_not_found' })
        return
      }
      const proposerRole = normalizeText(booking.rescheduleProposedBy)
      if (
        (isClient && proposerRole === 'client') ||
        (isMaster && proposerRole === 'master')
      ) {
        res.status(403).json({ error: 'reschedule_not_allowed' })
        return
      }
      const proposedDate = new Date(booking.rescheduleProposedTime)
      if (Number.isNaN(proposedDate.getTime())) {
        res.status(409).json({ error: 'time_unavailable' })
        return
      }

      const availability = await validateBookingSlotAvailability({
        masterId: booking.masterId,
        scheduledDate: proposedDate,
        serviceDuration: booking.serviceDuration,
        excludeBookingId: bookingId,
      })
      if (!availability.ok) {
        res.status(409).json({ error: availability.error })
        return
      }

      const previousScheduledAt = booking.scheduledAt ?? null
      await pool.query(
        `
          UPDATE service_bookings
          SET scheduled_at = $2,
              reschedule_proposed_at = NULL,
              reschedule_proposed_by = NULL,
              reschedule_proposed_time = NULL,
              reschedule_note = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId, proposedDate.toISOString()]
      )

      if (proposerRole === 'client') {
        await logClientTrustEvent({
          userId: booking.clientId,
          eventType: 'visit_rescheduled',
          meta: {
            ref: `booking:${bookingId}`,
            bookingId,
            scheduledAt: previousScheduledAt,
            proposedAt: proposedDate.toISOString(),
            proposedBy: proposerRole,
          },
        })
      }

      try {
        const chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
          },
          { suppressSystemMessage: true }
        )
        if (chatPayload?.chatId) {
          if (chatPayload.isNew) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'chat:created',
              chatId: chatPayload.chatId,
              bookingId,
            })
          }
          const body = 'Перенос подтверждён.'
          const meta = {
            event: 'booking_reschedule_accepted',
            bookingId,
            serviceName: booking.serviceName ?? null,
            scheduledAt: previousScheduledAt,
            proposedAt: proposedDate.toISOString(),
            proposedBy: proposerRole || null,
            acceptedBy: isClient ? 'client' : 'master',
          }
          const messageResult = await insertSystemMessage({
            chatId: chatPayload.chatId,
            body,
            meta,
            actorId: normalizedUserId,
          })
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
          })
          void sendChatNotification({
            chatId: chatPayload.chatId,
            senderId: normalizedUserId,
            preview: 'Перенос подтверждён',
          })
        }
      } catch (chatError) {
        console.error('Failed to notify reschedule acceptance:', chatError)
      }

      res.json(
        await withActorWorkflow({
          ok: true,
          scheduledAt: proposedDate.toISOString(),
          rescheduleProposedAt: null,
          rescheduleProposedBy: null,
          rescheduleProposedTime: null,
          rescheduleNote: null,
        })
      )
      return
    }

    if (normalizedAction === 'reschedule-decline') {
      if (!booking.rescheduleProposedTime) {
        res.status(409).json({ error: 'reschedule_not_found' })
        return
      }
      const proposerRole = normalizeText(booking.rescheduleProposedBy)
      if (
        (isClient && proposerRole === 'client') ||
        (isMaster && proposerRole === 'master')
      ) {
        res.status(403).json({ error: 'reschedule_not_allowed' })
        return
      }

      await pool.query(
        `
          UPDATE service_bookings
          SET reschedule_proposed_at = NULL,
              reschedule_proposed_by = NULL,
              reschedule_proposed_time = NULL,
              reschedule_note = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId]
      )

      try {
        const chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
          },
          { suppressSystemMessage: true }
        )
        if (chatPayload?.chatId) {
          if (chatPayload.isNew) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'chat:created',
              chatId: chatPayload.chatId,
              bookingId,
            })
          }
          const body = 'Перенос отклонён.'
          const meta = {
            event: 'booking_reschedule_declined',
            bookingId,
            serviceName: booking.serviceName ?? null,
            proposedAt: booking.rescheduleProposedTime ?? null,
            proposedBy: proposerRole || null,
            declinedBy: isClient ? 'client' : 'master',
          }
          const messageResult = await insertSystemMessage({
            chatId: chatPayload.chatId,
            body,
            meta,
            actorId: normalizedUserId,
          })
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
          })
          void sendChatNotification({
            chatId: chatPayload.chatId,
            senderId: normalizedUserId,
            preview: 'Перенос отклонён',
          })
        }
      } catch (chatError) {
        console.error('Failed to notify reschedule decline:', chatError)
      }

      res.json(
        await withActorWorkflow({
          ok: true,
          rescheduleProposedAt: null,
          rescheduleProposedBy: null,
          rescheduleProposedTime: null,
          rescheduleNote: null,
        })
      )
      return
    }

    if (normalizedAction === 'reschedule-cancel') {
      if (!booking.rescheduleProposedTime) {
        res.status(409).json({ error: 'reschedule_not_found' })
        return
      }
      const proposerRole = normalizeText(booking.rescheduleProposedBy)
      if (
        (isClient && proposerRole !== 'client') ||
        (isMaster && proposerRole !== 'master')
      ) {
        res.status(403).json({ error: 'reschedule_not_allowed' })
        return
      }

      await pool.query(
        `
          UPDATE service_bookings
          SET reschedule_proposed_at = NULL,
              reschedule_proposed_by = NULL,
              reschedule_proposed_time = NULL,
              reschedule_note = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId]
      )

      try {
        const chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
          },
          { suppressSystemMessage: true }
        )
        if (chatPayload?.chatId) {
          if (chatPayload.isNew) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'chat:created',
              chatId: chatPayload.chatId,
              bookingId,
            })
          }
          const body = 'Предложение переноса отменено.'
          const meta = {
            event: 'booking_reschedule_cancelled',
            bookingId,
            serviceName: booking.serviceName ?? null,
            proposedAt: booking.rescheduleProposedTime ?? null,
            proposedBy: proposerRole || null,
            cancelledBy: isClient ? 'client' : 'master',
          }
          const messageResult = await insertSystemMessage({
            chatId: chatPayload.chatId,
            body,
            meta,
            actorId: normalizedUserId,
          })
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
          })
          void sendChatNotification({
            chatId: chatPayload.chatId,
            senderId: normalizedUserId,
            preview: 'Предложение переноса отменено',
          })
        }
      } catch (chatError) {
        console.error('Failed to notify reschedule cancel:', chatError)
      }

      res.json(
        await withActorWorkflow({
          ok: true,
          rescheduleProposedAt: null,
          rescheduleProposedBy: null,
          rescheduleProposedTime: null,
          rescheduleNote: null,
        })
      )
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

      const cancelWindowHours = clampValue(
        parseOptionalInt(booking.cancelWindowHours) ?? BOOKING_FREE_CANCEL_HOURS,
        0,
        72
      )
      if (booking.status === 'confirmed') {
        const scheduledMs = booking.scheduledAt
          ? new Date(booking.scheduledAt).getTime()
          : NaN
        const timeUntilMs = Number.isFinite(scheduledMs) ? scheduledMs - Date.now() : NaN
        const cancelWindowMs = cancelWindowHours * 60 * 60 * 1000
        const canCancelConfirmed =
          Number.isFinite(timeUntilMs) &&
          timeUntilMs > 0 &&
          (cancelWindowMs === 0 || timeUntilMs < cancelWindowMs)
        if (!canCancelConfirmed) {
          res.status(409).json({ error: 'cancel_window_open', cancelWindowHours })
          return
        }
      }
      const depositPercent = clampValue(parseOptionalInt(booking.depositPercent) ?? 0, 0, 100)
      const cancelledDate = new Date()
      const cancelledAt = cancelledDate.toISOString()

      await pool.query(
        `
          UPDATE service_bookings
          SET status = 'cancelled',
              cancelled_by = 'client',
              cancelled_at = $2,
              outcome = NULL,
              reschedule_proposed_at = NULL,
              reschedule_proposed_by = NULL,
              reschedule_proposed_time = NULL,
              reschedule_note = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [bookingId, cancelledAt]
      )

      await logClientTrustEvent({
        userId: booking.clientId,
        eventType: 'visit_rescheduled',
        meta: {
          ref: `booking:${bookingId}`,
          bookingId,
          scheduledAt: booking.scheduledAt,
          cancelWindowHours,
          depositPercent,
        },
      })

      let cancelledChatId = await loadBookingChatId(bookingId)
      try {
        const chatPayload = await createChatForBooking(
          {
            bookingId,
            clientId: booking.clientId,
            masterId: booking.masterId,
            serviceName: booking.serviceName,
            actorId: normalizedUserId,
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
          },
          { suppressSystemMessage: true }
        )
        if (chatPayload?.chatId && chatPayload.isNew) {
          void notifyChatMembers(chatPayload.chatId, {
            type: 'chat:created',
            chatId: chatPayload.chatId,
            bookingId,
          })
        }
        cancelledChatId = chatPayload?.chatId ?? cancelledChatId
      } catch (chatError) {
        console.error('Failed to prepare chat for booking cancel:', chatError)
      }
      if (cancelledChatId) {
        const isDuplicate = await isDuplicateSystemEvent({
          chatId: cancelledChatId,
          event: 'booking_cancelled',
          bookingId,
        })
        if (!isDuplicate) {
          const body = 'Запись отменена клиентом.'
          const meta = {
            event: 'booking_cancelled',
            bookingId,
            serviceName: booking.serviceName ?? null,
            cancelledBy: 'client',
            cancelReason: 'client_cancel',
            cancelWindowHours,
            depositPercent,
          }
          const messageResult = await insertSystemMessage({
            chatId: cancelledChatId,
            body,
            meta,
            actorId: normalizedUserId,
            audience: 'master',
          })
          const messagePayload = {
            id: messageResult.id,
            chatId: cancelledChatId,
            senderId: null,
            type: 'system',
            body,
            meta,
            attachmentUrl: null,
            createdAt: messageResult.createdAt,
          }
          void notifyChatMembers(cancelledChatId, {
            type: 'message:new',
            chatId: cancelledChatId,
            message: messagePayload,
          })
          void sendChatNotification({
            chatId: cancelledChatId,
            senderId: normalizedUserId,
            audience: 'master',
            title: 'Запись отменена',
            text: body,
          })
        }
      }

      res.json(
        await withActorWorkflow({
          ok: true,
          status: 'cancelled',
          cancelWindowHours,
          depositPercent,
        })
      )
      return
    }

    if (normalizedAction === 'set-outcome') {
      if (!isMaster) {
        res.status(403).json({ error: 'forbidden' })
        return
      }

      if (normalizedOutcome === 'late_cancel') {
        if (booking.status !== 'confirmed') {
          res.status(409).json({ error: 'status_invalid' })
          return
        }
        if (booking.outcome) {
          res.status(409).json({ error: 'outcome_locked' })
          return
        }

        const cancelledAt = new Date().toISOString()
        await pool.query(
          `
            UPDATE service_bookings
            SET status = 'cancelled',
                cancelled_by = COALESCE(cancelled_by, 'client'),
                cancelled_at = COALESCE(cancelled_at, $2),
                outcome = NULL,
                reschedule_proposed_at = NULL,
                reschedule_proposed_by = NULL,
                reschedule_proposed_time = NULL,
                reschedule_note = NULL,
                updated_at = NOW()
            WHERE id = $1
          `,
          [bookingId, cancelledAt]
        )

        await logClientTrustEvent({
          userId: booking.clientId,
          eventType: 'visit_rescheduled',
          meta: {
            ref: `booking:${bookingId}`,
            bookingId,
            scheduledAt: booking.scheduledAt,
            cancelWindowHours: booking.cancelWindowHours,
            depositPercent: booking.depositPercent,
            legacyOutcome: 'late_cancel',
          },
          skipRefresh: true,
        })
        const trust = await refreshClientTrustScore(booking.clientId)

        res.json(
          await withActorWorkflow({
            ok: true,
            status: 'cancelled',
            outcome: null,
            legacyOutcome: 'late_cancel',
            trust,
          })
        )
        return
      }

      if (!['on_time', 'late', 'no_show'].includes(normalizedOutcome)) {
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
            requestId: booking.requestId ?? null,
            responseId: booking.responseId ?? null,
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
      }
      const trustEventType =
        normalizedOutcome === 'on_time'
          ? 'visit_on_time'
          : normalizedOutcome === 'late'
            ? 'visit_late'
            : 'visit_no_show'

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

      res.json(
        await withActorWorkflow({
          ok: true,
          outcome: normalizedOutcome,
          lateMinutes: normalizedOutcome === 'late' ? parsedLateMinutes : null,
          trust,
          systemMessage: systemMessagePayload,
          chatId: chatPayload?.chatId ?? null,
        })
      )
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
    const blockStatus = await loadUserBlockStatus(normalizedUserId)
    if (blockStatus?.isBlocked) {
      res.status(403).json({ error: 'user_blocked' })
      return
    }
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
          r.time_windows AS "timeWindows",
          r.budget,
          r.details,
          r.photo_urls AS "photoUrls",
          r.status,
          r.created_at AS "createdAt",
          COALESCE(ch.id, legacy_ch.id) AS "chatId",
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
          SELECT ch.id
          FROM chat_contexts cc
          JOIN chats ch ON ch.id = cc.chat_id
          WHERE cc.context_type = 'request'
            AND cc.context_id = r.id
            AND ch.client_id = r.user_id
          ORDER BY ch.updated_at DESC NULLS LAST
          LIMIT 1
        ) ch ON true
        LEFT JOIN LATERAL (
          SELECT id
          FROM chats
          WHERE request_id = r.id
            AND client_id = r.user_id
            AND context_type = 'request'
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1
        ) legacy_ch ON true
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
      const request = {
        ...row,
        chatId: row.chatId ?? null,
        responsePreview,
        timeWindows: normalizeTimeWindows(row.timeWindows),
      }
      return {
        ...request,
        nextAction: buildClientRequestNextAction(request),
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
          r.time_windows AS "timeWindows",
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
          rr.proposed_slot_at AS "proposedSlotAt",
          rr.hold_expires_at AS "holdExpiresAt",
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
        proposedSlotAt: row.proposedSlotAt,
        holdExpiresAt: row.holdExpiresAt,
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

  const { userId, price, comment, proposedTime, proposedSlotAt } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedComment = normalizeText(comment)
  const normalizedProposedTime = normalizeText(proposedTime)
  const normalizedProposedSlotAt = normalizeDateTime(proposedSlotAt)
  const parsedPrice = parseOptionalInt(price)

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

    if (
      !normalizedComment &&
      parsedPrice === null &&
      !normalizedProposedTime &&
      !normalizedProposedSlotAt
    ) {
      res.status(400).json({ error: 'response_required' })
      return
    }

  try {
    if (proposedSlotAt && !normalizedProposedSlotAt) {
      res.status(400).json({ error: 'proposedSlot_invalid' })
      return
    }

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
          service_name AS "serviceName",
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

    let proposedSlotAtValue = normalizedProposedSlotAt ?? null
    let holdExpiresAtValue = null

    if (proposedSlotAtValue) {
      const proposedDate = new Date(proposedSlotAtValue)
      if (Number.isNaN(proposedDate.getTime())) {
        res.status(400).json({ error: 'proposedSlot_invalid' })
        return
      }
      if (proposedDate.getTime() <= Date.now()) {
        res.status(409).json({ error: 'proposedSlot_unavailable' })
        return
      }

      const serviceItems = parseServiceItems(profile.services ?? [])
      const normalizedRequestedService = normalizeServiceName(request.serviceName)
      const matchedService = serviceItems.find(
        (item) => normalizeServiceName(item.name) === normalizedRequestedService
      )
      if (!matchedService) {
        res.status(409).json({ error: 'service_unavailable' })
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

      const dayKey = getDayKeyFromDate(proposedDate)
      if (!scheduleDays.includes(dayKey)) {
        res.status(409).json({ error: 'day_unavailable' })
        return
      }

      const serviceDuration = matchedService.duration ?? 60
      const proposedMinutes =
        proposedDate.getHours() * 60 + proposedDate.getMinutes()
      if (
        proposedMinutes < scheduleStartMinutes ||
        proposedMinutes + serviceDuration > scheduleEndMinutes
      ) {
        res.status(409).json({ error: 'time_unavailable' })
        return
      }

      const { start: dayStart, end: dayEnd } = buildDayBounds(proposedDate)
      const existingBookings = await pool.query(
        `
          SELECT
            scheduled_at AS "scheduledAt",
            service_duration AS "serviceDuration",
            reschedule_proposed_time AS "rescheduleProposedTime"
          FROM service_bookings
          WHERE master_id = $1
            AND status NOT IN ('declined', 'cancelled')
            AND (
              (scheduled_at >= $2 AND scheduled_at < $3)
              OR (reschedule_proposed_time >= $2 AND reschedule_proposed_time < $3)
            )
        `,
        [normalizedUserId, dayStart.toISOString(), dayEnd.toISOString()]
      )

      const existingHolds = await pool.query(
        `
          SELECT
            id,
            proposed_slot_at AS "proposedSlotAt",
            hold_expires_at AS "holdExpiresAt"
          FROM request_responses
          WHERE master_id = $1
            AND proposed_slot_at IS NOT NULL
            AND hold_expires_at IS NOT NULL
            AND hold_expires_at > NOW()
            AND ($2::int IS NULL OR id <> $2)
            AND proposed_slot_at >= $3
            AND proposed_slot_at < $4
        `,
        [
          normalizedUserId,
          existingResponse?.id ?? null,
          dayStart.toISOString(),
          dayEnd.toISOString(),
        ]
      )

      const startMs = proposedDate.getTime()
      const endMs = startMs + serviceDuration * 60 * 1000
      const hasBookingConflict = existingBookings.rows.some((row) => {
        const existingDuration = Number(row.serviceDuration) || 60
        const times = []
        if (row.scheduledAt) {
          const existingStart = new Date(row.scheduledAt).getTime()
          if (!Number.isNaN(existingStart)) times.push(existingStart)
        }
        if (row.rescheduleProposedTime) {
          const proposedStart = new Date(row.rescheduleProposedTime).getTime()
          if (!Number.isNaN(proposedStart)) times.push(proposedStart)
        }
        return times.some((existingStart) => {
          const existingEnd = existingStart + existingDuration * 60 * 1000
          return startMs < existingEnd && endMs > existingStart
        })
      })
      if (hasBookingConflict) {
        res.status(409).json({ error: 'time_unavailable' })
        return
      }

      const hasHoldConflict = existingHolds.rows.some((row) => {
        const existingStart = new Date(row.proposedSlotAt).getTime()
        if (Number.isNaN(existingStart)) return false
        const existingEnd = existingStart + serviceDuration * 60 * 1000
        return startMs < existingEnd && endMs > existingStart
      })
      if (hasHoldConflict) {
        res.status(409).json({ error: 'slot_reserved' })
        return
      }

      holdExpiresAtValue = addMinutes(new Date(), RESPONSE_SLOT_HOLD_MINUTES).toISOString()
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
          proposed_slot_at,
          hold_expires_at,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent')
        ON CONFLICT (request_id, master_id) DO UPDATE
        SET price = EXCLUDED.price,
            comment = EXCLUDED.comment,
            proposed_time = EXCLUDED.proposed_time,
            proposed_slot_at = EXCLUDED.proposed_slot_at,
            hold_expires_at = EXCLUDED.hold_expires_at,
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
        proposedSlotAtValue,
        holdExpiresAtValue,
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

    res.json({
      ok: true,
      id: result.rows[0]?.id,
      createdAt: result.rows[0]?.createdAt,
      proposedSlotAt: proposedSlotAtValue,
      holdExpiresAt: holdExpiresAtValue,
    })
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

  const { userId, action, bookNow } = req.body ?? {}
  const normalizedUserId = normalizeText(userId)
  const normalizedAction = normalizeText(action)
  const shouldBookNow = bookNow === true

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  if (!['accept', 'reject'].includes(normalizedAction)) {
    res.status(400).json({ error: 'action_invalid' })
    return
  }

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const requestResult = await client.query(
        `
          SELECT
            id,
            user_id AS "userId",
            city_id AS "cityId",
          district_id AS "districtId",
          address,
          category_id AS "categoryId",
          service_name AS "serviceName",
          details,
          photo_urls AS "photoUrls",
          location_type AS "locationType",
          status
        FROM service_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [requestId]
      )

      if (requestResult.rows.length === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'not_found' })
        return
      }

      const request = requestResult.rows[0]
      if (request.userId !== normalizedUserId) {
        await client.query('ROLLBACK')
        res.status(403).json({ error: 'forbidden' })
        return
      }

      const blockStatus = await loadUserBlockStatus(normalizedUserId)
      if (blockStatus?.isBlocked) {
        await client.query('ROLLBACK')
        res.status(403).json({ error: 'user_blocked' })
        return
      }

      if (request.status !== 'open') {
        await client.query('ROLLBACK')
        res.status(409).json({ error: 'request_closed' })
        return
      }

      const responseResult = await client.query(
        `
          SELECT
            id,
            master_id AS "masterId",
            price,
            proposed_slot_at AS "proposedSlotAt",
            hold_expires_at AS "holdExpiresAt",
            status
          FROM request_responses
          WHERE id = $1
            AND request_id = $2
          FOR UPDATE
        `,
        [responseId, requestId]
      )

      if (responseResult.rows.length === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'response_not_found' })
        return
      }

      const response = responseResult.rows[0]

      if (normalizedAction === 'accept') {
        if (response.status === 'rejected') {
          await client.query('ROLLBACK')
          res.status(409).json({ error: 'response_rejected' })
          return
        }

        let bookingPayload = null
        let depositPayload = null
        if (shouldBookNow) {
          if (!response.proposedSlotAt) {
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'slot_missing' })
            return
          }
          if (!response.holdExpiresAt) {
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'hold_expired' })
            return
          }
          const holdExpiresMs = new Date(response.holdExpiresAt).getTime()
          if (Number.isNaN(holdExpiresMs) || holdExpiresMs <= Date.now()) {
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'hold_expired' })
            return
          }

          const profile = await loadMasterProfile(response.masterId)
          if (!profile) {
            await client.query('ROLLBACK')
            res.status(404).json({ error: 'master_not_found' })
            return
          }
          const normalizedCancelWindowHours = clampValue(
            parseOptionalInt(profile.cancelWindowHours) ?? BOOKING_FREE_CANCEL_HOURS,
            0,
            72
          )
          const normalizedDepositPercent = clampValue(
            parseOptionalInt(profile.depositPercent) ?? 0,
            0,
            100
          )

          const serviceItems = parseServiceItems(profile.services ?? [])
          const normalizedRequestedService = normalizeServiceName(request.serviceName)
          const matchedService = serviceItems.find(
            (item) => normalizeServiceName(item.name) === normalizedRequestedService
          )
          if (!matchedService) {
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'service_unavailable' })
            return
          }

          const resolvedLocationType =
            request.locationType === 'any'
              ? profile.worksAtMaster
                ? 'master'
                : 'client'
              : request.locationType

          if (resolvedLocationType === 'client' && !profile.worksAtClient) {
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'location_type_mismatch' })
            return
          }
          if (resolvedLocationType === 'master' && !profile.worksAtMaster) {
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'location_type_mismatch' })
            return
          }

          const scheduledDate = new Date(response.proposedSlotAt)
          if (Number.isNaN(scheduledDate.getTime())) {
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'slot_invalid' })
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
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'schedule_unavailable' })
            return
          }

          const dayKey = getDayKeyFromDate(scheduledDate)
          if (!scheduleDays.includes(dayKey)) {
            await client.query('ROLLBACK')
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
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'time_unavailable' })
            return
          }

          if (scheduledDate.getTime() < Date.now()) {
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'time_unavailable' })
            return
          }

          const { start: dayStart, end: dayEnd } = buildDayBounds(scheduledDate)
          const existing = await client.query(
            `
              SELECT
                scheduled_at AS "scheduledAt",
                service_duration AS "serviceDuration",
                reschedule_proposed_time AS "rescheduleProposedTime"
              FROM service_bookings
              WHERE master_id = $1
                AND status NOT IN ('declined', 'cancelled')
                AND (
                  (scheduled_at >= $2 AND scheduled_at < $3)
                  OR (reschedule_proposed_time >= $2 AND reschedule_proposed_time < $3)
                )
            `,
            [response.masterId, dayStart.toISOString(), dayEnd.toISOString()]
          )

          const startMs = scheduledDate.getTime()
          const endMs = startMs + serviceDuration * 60 * 1000
          const hasConflict = existing.rows.some((row) => {
            const existingDuration = Number(row.serviceDuration) || 60
            const times = []
            if (row.scheduledAt) {
              const existingStart = new Date(row.scheduledAt).getTime()
              if (!Number.isNaN(existingStart)) times.push(existingStart)
            }
            if (row.rescheduleProposedTime) {
              const proposedStart = new Date(row.rescheduleProposedTime).getTime()
              if (!Number.isNaN(proposedStart)) times.push(proposedStart)
            }
            return times.some((existingStart) => {
              const existingEnd = existingStart + existingDuration * 60 * 1000
              return startMs < existingEnd && endMs > existingStart
            })
          })
          if (hasConflict) {
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'time_unavailable' })
            return
          }

          const servicePrice =
            response.price !== null && response.price !== undefined
              ? Number(response.price)
              : matchedService.price
          if (servicePrice === null || servicePrice === undefined) {
            await client.query('ROLLBACK')
            res.status(409).json({ error: 'price_required' })
            return
          }
          const discountChoice = await resolveBookingDiscount({
            masterId: response.masterId,
            clientId: request.userId,
            promotionId: null,
            promotionDiscountPercent: null,
            campaignId: null,
            campaignDiscountPercent: null,
          })
          const discountData = discountChoice
            ? buildPromotionDiscount(servicePrice, discountChoice.discountPercent)
            : null
          const effectiveServicePrice = discountData
            ? discountData.after
            : servicePrice
          const appliedPromotion =
            discountChoice?.source === 'promotion'
              ? discountChoice.promotion
              : null
          const appliedCampaign =
            discountChoice?.source === 'campaign'
              ? discountChoice.campaign
              : null
          const discountSource = discountChoice?.source ?? null
          const depositAmount = calculateDepositAmount(
            profile,
            effectiveServicePrice
          )
          const depositStatus = depositAmount > 0 ? 'pending' : 'not_required'
          const depositHoldExpiresAt =
            depositStatus === 'pending' ? buildDepositHoldExpiresAt() : null
          depositPayload = {
            amount: depositAmount,
            status: depositStatus,
            holdExpiresAt: depositHoldExpiresAt,
          }

          const requestPhotoList = Array.isArray(request.photoUrls)
            ? request.photoUrls
            : []
          const requestComment =
            typeof request.details === 'string' && request.details.trim()
              ? request.details.trim()
              : null

          const bookingInsert = await client.query(
            `
              INSERT INTO service_bookings (
                client_id,
                master_id,
                request_id,
                response_id,
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
                cancel_window_hours,
                deposit_percent,
                deposit_amount,
                deposit_status,
                deposit_hold_expires_at,
                proposed_price,
                promotion_id,
                promotion_discount_percent,
                promotion_discount_amount,
                promotion_price_before,
                promotion_price_after,
                campaign_id,
                campaign_discount_percent,
                campaign_discount_amount,
                campaign_price_before,
                campaign_price_after,
                discount_source,
                client_comment
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'confirmed', $15, $16, $17, $18, $19, NULL, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
              RETURNING id, created_at AS "createdAt"
            `,
            [
              request.userId,
              response.masterId,
              requestId,
              responseId,
              request.cityId,
              request.districtId,
              request.address ?? null,
              request.categoryId,
              request.serviceName,
              effectiveServicePrice,
              serviceDuration,
              resolvedLocationType,
              scheduledDate.toISOString(),
              requestPhotoList,
              normalizedCancelWindowHours,
              normalizedDepositPercent,
              depositAmount,
              depositStatus,
              depositHoldExpiresAt,
              appliedPromotion?.id ?? null,
              discountSource === 'promotion'
                ? discountData?.percent ?? appliedPromotion?.discountPercent ?? null
                : null,
              discountSource === 'promotion' ? discountData?.amount ?? null : null,
              discountSource === 'promotion' ? discountData?.before ?? null : null,
              discountSource === 'promotion' ? discountData?.after ?? null : null,
              appliedCampaign?.id ?? null,
              discountSource === 'campaign'
                ? discountData?.percent ?? appliedCampaign?.discountPercent ?? null
                : null,
              discountSource === 'campaign' ? discountData?.amount ?? null : null,
              discountSource === 'campaign' ? discountData?.before ?? null : null,
              discountSource === 'campaign' ? discountData?.after ?? null : null,
              discountSource,
              requestComment,
            ]
          )

          bookingPayload = {
            id: bookingInsert.rows[0]?.id ?? null,
            createdAt: bookingInsert.rows[0]?.createdAt ?? null,
          }
          void evaluateClientSpamBlock(request.userId)
        }

        if (response.status !== 'accepted') {
          await client.query(
            `
              UPDATE request_responses
              SET status = 'accepted',
                  updated_at = NOW()
              WHERE id = $1
            `,
            [responseId]
          )

          await client.query(
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

          await client.query(
            `
              UPDATE service_requests
              SET status = 'closed',
                  updated_at = NOW()
              WHERE id = $1
            `,
            [requestId]
          )

          await client.query(
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
        let chatPayload = null
        if (bookingPayload?.id) {
          try {
            chatPayload = await createChatForBooking(
              {
                bookingId: bookingPayload.id,
                clientId: request.userId,
                masterId: response.masterId,
                serviceName: request.serviceName,
                actorId: normalizedUserId,
                requestId,
                responseId,
              },
              { client }
            )
          } catch (chatError) {
            console.error('Failed to create chat for booking:', chatError)
          }
        }

        await client.query('COMMIT')

        if (chatPayload?.chatId) {
          void notifyChatMembers(chatPayload.chatId, {
            type: 'chat:created',
            chatId: chatPayload.chatId,
            bookingId: bookingPayload?.id ?? null,
          })
          if (chatPayload?.systemMessage) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'message:new',
              chatId: chatPayload.chatId,
              message: chatPayload.systemMessage,
            })
          } else if (chatPayload?.systemMessageId) {
            void notifyChatMembers(chatPayload.chatId, {
              type: 'message:new',
              chatId: chatPayload.chatId,
              messageId: chatPayload.systemMessageId,
            })
          }
        } else if (!bookingPayload?.id) {
          try {
            const requestChat = await createChatForRequest({
              requestId,
              responseId,
              clientId: request.userId,
              masterId: response.masterId,
              serviceName: request.serviceName,
              actorId: normalizedUserId,
            })
            if (requestChat?.chatId) {
              void notifyChatMembers(requestChat.chatId, {
                type: 'chat:created',
                chatId: requestChat.chatId,
                requestId,
                responseId,
              })
              if (requestChat?.systemMessage) {
                void notifyChatMembers(requestChat.chatId, {
                  type: 'message:new',
                  chatId: requestChat.chatId,
                  message: requestChat.systemMessage,
                })
              } else if (requestChat?.systemMessageId) {
                void notifyChatMembers(requestChat.chatId, {
                  type: 'message:new',
                  chatId: requestChat.chatId,
                  messageId: requestChat.systemMessageId,
                })
              }
            }
            chatPayload = requestChat
          } catch (chatError) {
            console.error('Failed to create chat for request:', chatError)
          }
        }

        if (
          chatPayload?.chatId &&
          bookingPayload?.id &&
          depositPayload?.status === 'pending' &&
          depositPayload.amount &&
          depositPayload.amount > 0
        ) {
          const isDuplicate = await isDuplicateSystemEvent({
            chatId: chatPayload.chatId,
            event: 'deposit_pending',
            bookingId: bookingPayload.id,
          })
          if (!isDuplicate) {
            const amountLabel = formatPriceLabel(depositPayload.amount)
            const holdLabel = formatTimeLeftLabel(depositPayload.holdExpiresAt)
            const holdText = holdLabel ? `Слот удерживается ${holdLabel}.` : ''
            const body = [
              'Нужен депозит.',
              amountLabel && `Сумма: ${amountLabel}`,
              holdText,
            ]
              .filter(Boolean)
              .join(' ')
            const meta = {
              event: 'deposit_pending',
              bookingId: bookingPayload.id,
              serviceName: request.serviceName ?? null,
              depositAmount: depositPayload.amount,
              holdExpiresAt: depositPayload.holdExpiresAt ?? null,
            }
            const messageResult = await insertSystemMessage({
              chatId: chatPayload.chatId,
              body,
              meta,
              actorId: normalizedUserId,
              audience: 'client',
            })
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
            })
            void sendChatNotification({
              chatId: chatPayload.chatId,
              senderId: normalizedUserId,
              audience: 'client',
              title: 'Нужен депозит',
              text: body,
            })
          }
        }

        res.json({
          ok: true,
          status: 'accepted',
          requestStatus: 'closed',
          chatId: chatPayload?.chatId ?? null,
          bookingId: bookingPayload?.id ?? null,
        })
        return
      }

      if (response.status === 'accepted') {
        await client.query('ROLLBACK')
        res.status(409).json({ error: 'response_accepted' })
        return
      }

      if (response.status !== 'rejected') {
        await client.query(
          `
            UPDATE request_responses
            SET status = 'rejected',
                updated_at = NOW()
            WHERE id = $1
          `,
          [responseId]
        )
      }

      await client.query('COMMIT')

      res.json({ ok: true, status: 'rejected' })
      return
    } catch (innerError) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError)
      }
      throw innerError
    } finally {
      client.release()
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
  const includeContexts = ['1', 'true', 'yes'].includes(
    normalizeText(req.query.contexts).toLowerCase()
  )

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  try {
    const result = await timedQuery(
      'chats:list',
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
          sr.time_windows AS "requestTimeWindows",
          sr.created_at AS "requestCreatedAt",
          sb.service_name AS "bookingServiceName",
          sb.category_id AS "bookingCategoryId",
          sb.status AS "bookingStatus",
          sb.scheduled_at AS "bookingScheduledAt",
          sb.service_duration AS "bookingServiceDuration",
          sb.service_price AS "bookingServicePrice",
          sb.proposed_price AS "bookingProposedPrice",
          sb.deposit_percent AS "bookingDepositPercent",
          sb.deposit_amount AS "bookingDepositAmount",
          sb.deposit_status AS "bookingDepositStatus",
          sb.deposit_hold_expires_at AS "bookingDepositHoldExpiresAt",
          sb.reschedule_proposed_at AS "bookingRescheduleProposedAt",
          sb.reschedule_proposed_by AS "bookingRescheduleProposedBy",
          sb.reschedule_proposed_time AS "bookingRescheduleProposedTime",
          sb.reschedule_note AS "bookingRescheduleNote",
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
              CASE
                WHEN cm.role = 'master'
                  THEN COALESCE(meta->>'visibility', meta->>'audience', '') NOT IN ('client_only', 'client')
                WHEN cm.role = 'client'
                  THEN COALESCE(meta->>'visibility', meta->>'audience', '') NOT IN ('master_only', 'master')
                ELSE true
              END
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
              timeWindows: normalizeTimeWindows(row.requestTimeWindows),
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
              proposedPrice: row.bookingProposedPrice,
              depositPercent: row.bookingDepositPercent,
              depositAmount: row.bookingDepositAmount,
              depositStatus: row.bookingDepositStatus,
              depositHoldExpiresAt: row.bookingDepositHoldExpiresAt,
              rescheduleProposedAt: row.bookingRescheduleProposedAt,
              rescheduleProposedBy: row.bookingRescheduleProposedBy,
              rescheduleProposedTime: row.bookingRescheduleProposedTime,
              rescheduleNote: row.bookingRescheduleNote,
              outcome: row.bookingOutcome,
              lateMinutes: row.bookingLateMinutes,
              createdAt: row.bookingCreatedAt,
            }
          : null
      const bookingWorkflow = activeBooking
        ? buildBookingWorkflowMeta(activeBooking, isClient ? 'client' : 'master')
        : null
      const nextAction = bookingWorkflow?.nextAction ?? null

      return {
        id: row.id,
        contextType: row.contextType,
        contextId: row.contextId,
        requestId: row.requestId,
        bookingId: row.bookingId,
        status: row.status,
        unreadCount: Number(row.unreadCount) || 0,
        lastReadMessageId: row.lastReadMessageId ?? null,
        nextAction,
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
        booking: activeBooking
          ? {
              ...activeBooking,
              workflowStage: bookingWorkflow?.workflowStage ?? null,
              availableActions: bookingWorkflow?.availableActions ?? [],
            }
          : null,
      }
    })

    if (includeContexts) {
      const chatIds = payload
        .map((item) => item.id)
        .filter((id) => Number.isInteger(id))
      if (chatIds.length > 0) {
        const contextsResult = await timedQuery(
          'chats:contexts',
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
                  timeWindows: normalizeTimeWindows(row.requestTimeWindows),
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
                timeWindows: normalizeTimeWindows(item.request.timeWindows),
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
                timeWindows: normalizeTimeWindows(item.request.timeWindows),
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
          sr.time_windows AS "timeWindows",
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
          sb.proposed_price AS "bookingProposedPrice",
          sb.deposit_percent AS "bookingDepositPercent",
          sb.deposit_amount AS "bookingDepositAmount",
          sb.deposit_status AS "bookingDepositStatus",
          sb.deposit_hold_expires_at AS "bookingDepositHoldExpiresAt",
          sb.status AS "bookingStatus",
          sb.reschedule_proposed_at AS "bookingRescheduleProposedAt",
          sb.reschedule_proposed_by AS "bookingRescheduleProposedBy",
          sb.reschedule_proposed_time AS "bookingRescheduleProposedTime",
          sb.reschedule_note AS "bookingRescheduleNote",
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
          sr.time_windows AS "requestTimeWindows",
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
            timeWindows: normalizeTimeWindows(contextRow.requestTimeWindows),
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
          timeWindows: normalizeTimeWindows(row.timeWindows),
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

    const requestPayload =
      row.contextType === 'request' && row.requestId
        ? {
            id: row.requestId,
            serviceName: row.serviceName,
            categoryId: row.categoryId,
            locationType: row.locationType,
            dateOption: row.dateOption,
            dateTime: row.dateTime,
            timeWindows: normalizeTimeWindows(row.timeWindows),
            budget: row.budget,
            details: row.details,
            photoUrls: Array.isArray(row.photoUrls) ? row.photoUrls : [],
            status: row.requestStatus,
            createdAt: row.requestCreatedAt,
          }
        : null
    const bookingPayload =
      row.contextType === 'booking' && row.bookingId
        ? {
            id: row.bookingId,
            serviceName: row.bookingServiceName,
            categoryId: row.bookingCategoryId,
            locationType: row.bookingLocationType,
            scheduledAt: row.bookingScheduledAt,
            serviceDuration: row.bookingServiceDuration,
            servicePrice: row.bookingServicePrice,
            proposedPrice: row.bookingProposedPrice,
            depositPercent: row.bookingDepositPercent,
            depositAmount: row.bookingDepositAmount,
            depositStatus: row.bookingDepositStatus,
            depositHoldExpiresAt: row.bookingDepositHoldExpiresAt,
            status: row.bookingStatus,
            rescheduleProposedAt: row.bookingRescheduleProposedAt,
            rescheduleProposedBy: row.bookingRescheduleProposedBy,
            rescheduleProposedTime: row.bookingRescheduleProposedTime,
            rescheduleNote: row.bookingRescheduleNote,
            outcome: row.bookingOutcome,
            lateMinutes: row.bookingLateMinutes,
            attendanceAt: row.bookingAttendanceAt,
            createdAt: row.bookingCreatedAt,
          }
        : null
    const bookingWorkflow = bookingPayload
      ? buildBookingWorkflowMeta(bookingPayload, isClient ? 'client' : 'master')
      : null
    const nextAction = bookingWorkflow?.nextAction ?? null

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
      request: requestPayload,
      booking: bookingPayload
        ? {
            ...bookingPayload,
            workflowStage: bookingWorkflow?.workflowStage ?? null,
            availableActions: bookingWorkflow?.availableActions ?? [],
          }
        : null,
      contexts,
      nextAction,
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
            CASE
              WHEN $3::boolean
                THEN COALESCE(meta->>'visibility', meta->>'audience', '') NOT IN ('client_only', 'client')
              ELSE COALESCE(meta->>'visibility', meta->>'audience', '') NOT IN ('master_only', 'master')
            END
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
    timeWindows,
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
  const timeWindowList = normalizeTimeWindows(timeWindows)

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
    if (!(await ensureUserNotBlocked(normalizedUserId, res))) return

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

    const limits = await resolveClientLimits(normalizedUserId)
    const dayWindowStart = new Date(Date.now() - DAY_MS).toISOString()
    const duplicateWindowStart = new Date(
      Date.now() - REQUEST_DUPLICATE_WINDOW_MINUTES * 60 * 1000
    ).toISOString()

    const [openRequestsResult, dailyRequestsResult, duplicateResult] =
      await Promise.all([
        pool.query(
          `
            SELECT COUNT(*)::int AS count
            FROM service_requests
            WHERE user_id = $1
              AND status = 'open'
          `,
          [normalizedUserId]
        ),
        pool.query(
          `
            SELECT COUNT(*)::int AS count
            FROM service_requests
            WHERE user_id = $1
              AND created_at >= $2
          `,
          [normalizedUserId, dayWindowStart]
        ),
        pool.query(
          `
            SELECT id
            FROM service_requests
            WHERE user_id = $1
              AND status = 'open'
              AND category_id = $2
              AND service_name = $3
              AND location_type = $4
              AND created_at >= $5
            LIMIT 1
          `,
          [
            normalizedUserId,
            normalizedCategoryId,
            normalizedServiceName,
            normalizedLocationType,
            duplicateWindowStart,
          ]
        ),
      ])

    const openRequestsCount = openRequestsResult.rows[0]?.count ?? 0
    if (openRequestsCount >= limits.request.maxOpen) {
      res.status(429).json({ error: 'open_request_limit' })
      return
    }
    const dailyRequestsCount = dailyRequestsResult.rows[0]?.count ?? 0
    if (dailyRequestsCount >= limits.request.maxPerDay) {
      res.status(429).json({ error: 'daily_request_limit' })
      return
    }
    if (duplicateResult.rows.length > 0) {
      res.status(409).json({ error: 'duplicate_request' })
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
          time_windows,
          budget,
          details,
          photo_urls
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        JSON.stringify(timeWindowList),
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
            timeWindows: timeWindowList,
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

let repeatReminderCycleRunning = false

const runRepeatReminderCycle = async () => {
  if (repeatReminderCycleRunning) return
  repeatReminderCycleRunning = true

  try {
    const settingsResult = await pool.query(
      `
        SELECT
          master_id AS "masterId",
          enabled,
          channel,
          include_link AS "includeLink",
          include_unsubscribe AS "includeUnsubscribe",
          intervals,
          template
        FROM marketing_repeat_settings
        WHERE enabled = TRUE
      `
    )
    for (const settings of settingsResult.rows) {
      try {
        await runRepeatReminderForMaster(settings)
      } catch (error) {
        if (error?.code === 'bot_not_configured') {
          continue
        }
        console.error('Repeat reminder master cycle failed:', error)
      }
    }
  } catch (error) {
    console.error('Repeat reminder cycle failed:', error)
  } finally {
    repeatReminderCycleRunning = false
  }
}

const start = async () => {
  const normalizedTrustBackfill = normalizeText(process.env.TRUST_BACKFILL)
  const shouldBackfillTrust =
    normalizedTrustBackfill === '1' || normalizedTrustBackfill.toLowerCase() === 'true'

  await ensureSchema()
  await seedLocations()
  await fs.mkdir(uploadsRoot, { recursive: true })
  try {
    await fs.mkdir(imageCacheRoot, { recursive: true })
  } catch (error) {
    console.warn('Image cache disabled:', error)
  }

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
  void runDepositHoldCycle()
  setInterval(() => {
    void runDepositHoldCycle()
  }, DEPOSIT_HOLD_SCAN_INTERVAL_MS)
  void runRepeatReminderCycle()
  setInterval(() => {
    void runRepeatReminderCycle()
  }, REPEAT_REMINDER_SCAN_INTERVAL_MS)
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
