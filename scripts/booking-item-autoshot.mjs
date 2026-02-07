import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chromium, devices } from 'playwright'

const parseArgs = (tokens) => {
  const values = new Map()
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token.startsWith('--')) continue

    const [key, inlineValue] = token.slice(2).split('=', 2)
    if (inlineValue !== undefined) {
      values.set(key, inlineValue)
      continue
    }

    const next = tokens[index + 1]
    if (next && !next.startsWith('--')) {
      values.set(key, next)
      index += 1
      continue
    }

    values.set(key, '1')
  }
  return values
}

const toNumber = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < min) return min
  if (parsed > max) return max
  return parsed
}

const args = parseArgs(process.argv.slice(2))
const userId = args.get('userId') ?? '100001'
const apiBase = args.get('apiBase') ?? 'https://third.play-team.online'
const url =
  args.get('url') ?? `http://127.0.0.1:5173/?tgEmu=1&tgUserId=${encodeURIComponent(userId)}`
const output = resolve(
  args.get('out') ?? `.logs/booking-item-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
)
const width = toNumber(args.get('width'), 390, 320, 430)
const height = toNumber(args.get('height'), 844, 640, 2000)
const waitMs = toNumber(args.get('wait'), 1200, 0, 30000)
const runtimeLibsDir = resolve(
  args.get('runtimeLibs') ?? '.local/runtime-libs/root/usr/lib/x86_64-linux-gnu'
)

mkdirSync(dirname(output), { recursive: true })

if (existsSync(runtimeLibsDir)) {
  process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `${runtimeLibsDir}:${process.env.LD_LIBRARY_PATH}`
    : runtimeLibsDir
}

const STORAGE_PREFIX = 'kiven:data-cache'

const nowIso = new Date().toISOString()
const scheduledAt = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString()

const bookingFixture = {
  id: 900001,
  clientId: userId,
  masterId: 'master_demo',
  clientName: 'Алекс',
  clientTrust: {
    score: 45,
    confidence: 0.22,
    level: 'new',
    updatedAt: nowIso,
    reasons: {
      positive: [],
      negative: [],
    },
  },
  categoryId: 'nails',
  serviceName: 'Маникюр',
  servicePrice: 1500,
  locationType: 'client',
  cityId: 1,
  districtId: 1,
  cityName: 'Москва',
  districtName: 'ЦАО',
  address: 'Тверская, 1',
  scheduledAt,
  status: 'pending',
  depositPercent: 10,
  nextAction: {
    id: 'master_accept_booking',
    title: 'Подтвердить запись',
    tone: 'primary',
  },
  chatId: 5001,
  photoUrls: [],
  comment: 'Покрытие нюд, без дизайна.',
  createdAt: nowIso,
  updatedAt: nowIso,
}

const cacheEntries = [
  {
    key: `${apiBase}/api/pro/requests?userId=${encodeURIComponent(userId)}`,
    value: [],
  },
  {
    key: `${apiBase}/api/pro/bookings?userId=${encodeURIComponent(userId)}`,
    value: [bookingFixture],
  },
]

const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    viewport: { width, height },
  })

  await context.addInitScript(
    ({ entries, now, prefix }) => {
      const normalize = (key) => encodeURIComponent(String(key ?? '').trim().toLowerCase())
      for (const entry of entries) {
        const storageKey = `${prefix}:${normalize(entry.key)}`
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ value: entry.value, updatedAt: now })
        )
      }
    },
    { entries: cacheEntries, now: Date.now(), prefix: STORAGE_PREFIX }
  )

  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(waitMs)

  await page.getByRole('button', { name: 'Я мастер' }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Заявки', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('tab', { name: /Заявки/ }).first().click()
  await page.waitForTimeout(800)

  const firstBooking = page.locator('.booking-item').first()
  await firstBooking.waitFor({ state: 'visible', timeout: 15000 })
  await firstBooking.scrollIntoViewIfNeeded()
  await firstBooking.screenshot({ path: output })

  console.log(`Booking screenshot saved: ${output}`)
  await context.close()
} finally {
  await browser.close()
}
