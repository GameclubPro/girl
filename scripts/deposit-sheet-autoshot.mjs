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
  args.get('url') ??
  `http://127.0.0.1:5173/?tgEmu=1&tgUserId=${encodeURIComponent(userId)}&tgPlatform=ios&tgTheme=light&tgExpanded=1&tgFullscreen=1&tgTopInset=47&tgBottomInset=34&tgContentTopInset=47&tgContentBottomInset=34`
const output = resolve(
  args.get('out') ?? `.logs/deposit-sheet-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
)
const width = toNumber(args.get('width'), 390, 320, 430)
const height = toNumber(args.get('height'), 844, 640, 2000)
const waitMs = toNumber(args.get('wait'), 1100, 0, 30000)
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
const now = Date.now()
const nowIso = new Date(now).toISOString()
const scheduledAt = new Date(now + 48 * 60 * 60 * 1000).toISOString()
const holdExpiresAt = new Date(now + 14 * 60 * 1000).toISOString()

const bookingFixture = {
  id: 920001,
  clientId: userId,
  masterId: 'master_demo',
  masterName: 'Алекс',
  categoryId: 'nails',
  serviceName: 'Маникюр',
  servicePrice: 2500,
  serviceDuration: 90,
  locationType: 'master',
  cityId: 1,
  districtId: 1,
  cityName: 'Москва',
  districtName: 'ЦАО',
  scheduledAt,
  status: 'confirmed',
  depositPercent: 20,
  depositAmount: 500,
  depositStatus: 'pending',
  depositHoldExpiresAt: holdExpiresAt,
  depositDetails: 'СБП: +7 999 111-22-33\\nБанк: Т-Банк',
  chatId: 7001,
  nextAction: {
    id: 'pay_deposit',
    title: 'Оплатить депозит',
    subtitle: 'Сумма: 500 ₽',
    tone: 'alert',
    deadlineAt: holdExpiresAt,
  },
  photoUrls: [],
  createdAt: nowIso,
  updatedAt: nowIso,
}

const cacheEntries = [
  {
    key: `${apiBase}/api/requests?userId=${encodeURIComponent(userId)}`,
    value: [],
  },
  {
    key: `${apiBase}/api/bookings?userId=${encodeURIComponent(userId)}`,
    value: [bookingFixture],
  },
]

const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    viewport: { width, height },
  })

  await context.route('**/api/cities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, name: 'Москва' }]),
    })
  })
  await context.route('**/api/cities/1/districts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, cityId: 1, name: 'ЦАО' }]),
    })
  })
  await context.route('**/api/address?userId=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        address: 'Тверская, 1',
        cityId: 1,
        districtId: 1,
      }),
    })
  })
  await context.route('**/api/address', async (route) => {
    if (route.request().method().toUpperCase() !== 'POST') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })
  await context.route('**/api/requests?userId=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
  await context.route('**/api/bookings?userId=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([bookingFixture]),
    })
  })

  await context.addInitScript(
    ({ entries, timestamp, prefix }) => {
      const normalize = (key) => encodeURIComponent(String(key ?? '').trim().toLowerCase())
      for (const entry of entries) {
        const storageKey = `${prefix}:${normalize(entry.key)}`
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ value: entry.value, updatedAt: timestamp })
        )
      }
    },
    { entries: cacheEntries, timestamp: Date.now(), prefix: STORAGE_PREFIX }
  )

  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(waitMs)

  const closeCategoryOverlayIfNeeded = async () => {
    const overlay = page.locator('div[role="dialog"].category-overlay').first()
    if (!(await overlay.isVisible().catch(() => false))) return

    const firstCard = overlay.locator('.category-overlay-card').first()
    if ((await firstCard.count()) > 0) {
      await firstCard.click()
      await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(550)
      return
    }

    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(350)
  }

  await page.getByRole('button', { name: 'Мне нужна услуга' }).click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await page.waitForTimeout(900)
  await closeCategoryOverlayIfNeeded()
  await page.getByRole('button', { name: 'Заявки', exact: true }).click()
  await page.waitForTimeout(900)
  await page.getByRole('tab', { name: /Записи/ }).first().click()
  await page.waitForTimeout(800)

  const alertPayButton = page.getByRole('button', { name: 'Оплатить' }).first()
  if ((await alertPayButton.count()) > 0) {
    await alertPayButton.click()
  } else {
    await page.getByRole('button', { name: 'Оплатить депозит' }).first().click()
  }

  const sheet = page.locator('.deposit-sheet').first()
  await sheet.waitFor({ state: 'visible', timeout: 15000 })
  await page.waitForTimeout(600)
  await sheet.screenshot({ path: output })

  console.log(`Deposit sheet screenshot saved: ${output}`)
  await context.close()
} finally {
  await browser.close()
}
