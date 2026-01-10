import dotenv from 'dotenv'
import cors from 'cors'
import express from 'express'
import { Pool } from 'pg'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

dotenv.config()

const app = express()
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000)
const corsOrigin = process.env.CORS_ORIGIN ?? '*'
const uploadsRoot = path.join(process.cwd(), 'uploads')
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024
const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

app.use(cors({ origin: corsOrigin }))
app.use(express.json({ limit: '6mb' }))
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

const buildPublicUrl = (req, relativePath) => {
  const normalized = normalizeText(relativePath)
  if (!normalized) return null
  if (/^https?:\/\//i.test(normalized)) return normalized
  const baseUrl =
    process.env.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get('host')}`
  const safePath = normalized.replace(/^\/+/, '')
  return `${baseUrl}/uploads/${safePath}`
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
      share_to_clients BOOLEAN NOT NULL DEFAULT false,
      share_to_masters BOOLEAN NOT NULL DEFAULT false,
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
    ADD COLUMN IF NOT EXISTS share_to_clients BOOLEAN NOT NULL DEFAULT false;
  `)

  await pool.query(`
    ALTER TABLE user_locations
    ADD COLUMN IF NOT EXISTS share_to_masters BOOLEAN NOT NULL DEFAULT false;
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
  const { userId, lat, lng, accuracy, shareToClients, shareToMasters } =
    req.body ?? {}
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
  const nextShareToClients = Boolean(shareToClients)
  const nextShareToMasters = Boolean(shareToMasters)

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
    res.json({
      ...row,
      reviewsAverage,
      reviewsCount,
      avatarUrl: buildPublicUrl(req, row.avatarPath),
      coverUrl: buildPublicUrl(req, row.coverPath),
      ...summary,
    })
  } catch (error) {
    console.error('GET /api/masters/:userId failed:', error)
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

    const { cityId, districtId, categories, worksAtClient, worksAtMaster } = profile

    if (!summary.isFilterReady) {
      res.json({ ...summary, isActive: profile.isActive, requests: [] })
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
          rr.id AS "responseId",
          rr.status AS "responseStatus",
          rr.price AS "responsePrice",
          rr.comment AS "responseComment",
          rr.created_at AS "responseCreatedAt",
          ul.lat AS "clientLat",
          ul.lng AS "clientLng",
          ul.share_to_masters AS "clientShareToMasters"
        FROM service_requests r
        LEFT JOIN cities c ON c.id = r.city_id
        LEFT JOIN districts d ON d.id = r.district_id
        LEFT JOIN user_locations ul ON ul.user_id = r.user_id
        LEFT JOIN request_responses rr
          ON rr.request_id = r.id AND rr.master_id = $1
        WHERE r.status = 'open'
          AND r.user_id <> $1
          AND r.city_id = $2
          AND r.district_id = $3
          AND r.category_id = ANY($4)
          AND (
            (r.location_type = 'client' AND $5)
            OR (r.location_type = 'master' AND $6)
            OR (r.location_type = 'any' AND ($5 OR $6))
          )
        ORDER BY r.created_at DESC
        LIMIT 50
      `,
      [normalizedUserId, cityId, districtId, categories, worksAtClient, worksAtMaster]
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
          b.created_at AS "createdAt"
        FROM service_bookings b
        LEFT JOIN master_profiles mp ON mp.user_id = b.master_id
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

      res.json({ ok: true, status: 'confirmed' })
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

      res.json({
        ok: true,
        status: 'confirmed',
        servicePrice: booking.proposedPrice,
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

    res.status(400).json({ error: 'action_invalid' })
  } catch (error) {
    console.error('PATCH /api/bookings/:id failed:', error)
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
          )::int AS "responsesCount"
        FROM service_requests r
        LEFT JOIN cities c ON c.id = r.city_id
        LEFT JOIN districts d ON d.id = r.district_id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC
      `,
      [normalizedUserId]
    )

    res.json(result.rows)
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
          rr.price,
          rr.comment,
          rr.proposed_time AS "proposedTime",
          rr.status,
          rr.created_at AS "createdAt"
        FROM request_responses rr
        LEFT JOIN master_profiles mp ON mp.user_id = rr.master_id
        WHERE rr.request_id = $1
        ORDER BY rr.created_at DESC
      `,
      [requestId]
    )

    res.json(result.rows)
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

    res.json({ ok: true, id: result.rows[0]?.id, createdAt: result.rows[0]?.createdAt })
  } catch (error) {
    console.error('POST /api/requests/:id/responses failed:', error)
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

    res.json({ ok: true, id: result.rows[0]?.id, createdAt: result.rows[0]?.createdAt })
  } catch (error) {
    console.error('POST /api/requests failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

const start = async () => {
  await ensureSchema()
  await seedLocations()
  await fs.mkdir(uploadsRoot, { recursive: true })
  app.listen(port, () => {
    console.log(`API listening on :${port}`)
  })
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
