import dotenv from 'dotenv'
import cors from 'cors'
import express from 'express'
import { Pool } from 'pg'

dotenv.config()

const app = express()
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000)
const corsOrigin = process.env.CORS_ORIGIN ?? '*'

app.use(cors({ origin: corsOrigin }))
app.use(express.json({ limit: '1mb' }))

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

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_addresses (
      user_id TEXT PRIMARY KEY,
      city TEXT,
      address TEXT,
      radius_km INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
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
          city,
          address,
          radius_km AS "radiusKm",
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
  const { userId, city, address, radiusKm } = req.body ?? {}
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : ''

  if (!normalizedUserId) {
    res.status(400).json({ error: 'userId_required' })
    return
  }

  const normalizedCity = typeof city === 'string' ? city.trim() : ''
  const normalizedAddress = typeof address === 'string' ? address.trim() : ''
  const parsedRadius = Number(radiusKm)
  const normalizedRadius = Number.isFinite(parsedRadius)
    ? Math.round(parsedRadius)
    : null

  try {
    await pool.query(
      `
        INSERT INTO user_addresses (user_id, city, address, radius_km)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE
        SET city = EXCLUDED.city,
            address = EXCLUDED.address,
            radius_km = EXCLUDED.radius_km,
            updated_at = NOW()
      `,
      [
        normalizedUserId,
        normalizedCity || null,
        normalizedAddress || null,
        normalizedRadius,
      ]
    )

    res.json({ ok: true })
  } catch (error) {
    console.error('POST /api/address failed:', error)
    res.status(500).json({ error: 'server_error' })
  }
})

const start = async () => {
  await ensureSchema()
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
