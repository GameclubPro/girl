import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, devices } from 'playwright'
import { applyHostProfileDefaults, normalizeHost } from './miniapp-host-profile.mjs'
import { applyRuntimeLibs, launchChromium } from './playwright-launch.mjs'

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

const args = parseArgs(process.argv.slice(2))
const width = Number.parseInt(args.get('width') ?? '390', 10)
const height = Number.parseInt(args.get('height') ?? '844', 10)
const userId = args.get('userId') ?? '100001'
const host = normalizeHost(args.get('host'), 'telegram')
const urlBase = args.get('url') ?? args.get('urlBase') ?? 'http://127.0.0.1:5173/'
const url = applyHostProfileDefaults({
  url: urlBase,
  host,
  userId,
  width,
  height,
})
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
const outDir = resolve(args.get('outDir') ?? `.logs/design-redesign-${stamp}`)
applyRuntimeLibs(args.get('runtimeLibs'))

mkdirSync(outDir, { recursive: true })

const launch = await launchChromium(chromium, {
  headless: true,
  browserExecutable: args.get('browserExecutable'),
})
const browser = launch.browser
console.log(`[design-redesign-audit] launch=${launch.launchLabel} host=${host}`)

try {
  const context = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    viewport: { width, height },
  })

  await context.route('**/api/cities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, name: 'Краснодар' }]),
    })
  })
  await context.route('**/api/cities/1/districts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 1, cityId: 1, name: 'Центральный' }]),
    })
  })
  await context.route('**/api/address?userId=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        address: 'Красная, 1',
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
  await context.route('**/api/user/role-state?userId=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        role: null,
        selectedOnce: false,
        roleSelectedAt: null,
        roleChangedAt: null,
      }),
    })
  })
  await context.route('**/api/user/role', async (route) => {
    if (route.request().method().toUpperCase() !== 'PATCH') {
      await route.continue()
      return
    }
    let role = 'client'
    try {
      const payload = route.request().postDataJSON()
      if (payload?.role === 'pro' || payload?.role === 'client') {
        role = payload.role
      }
    } catch (error) {
      // ignore malformed payload in screenshot harness
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        role,
        selectedOnce: true,
        roleSelectedAt: '2026-02-09T20:00:00.000Z',
        roleChangedAt: '2026-02-09T20:00:00.000Z',
      }),
    })
  })
  await context.route('**/api/user', async (route) => {
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

  const page = await context.newPage()

  const wait = async (ms = 900) => {
    await page.waitForTimeout(ms)
  }

  const capture = async (name) => {
    await page.evaluate(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      const selectors = [
        '.screen',
        '.chat-shell',
        '.requests-shell',
        '.pro-shell',
      ]
      selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
          if (node instanceof HTMLElement) {
            node.scrollTop = 0
            node.scrollLeft = 0
          }
        })
      })
    })
    await wait(220)
    await wait(500)
    await page.screenshot({ path: `${outDir}/${name}.png` })
    console.log(`saved ${name}.png`)
  }

  const safeClickButton = async (name, exact = true) => {
    const locator = page.getByRole('button', { name, exact }).first()
    if ((await locator.count()) === 0) return false
    if (!(await locator.isVisible().catch(() => false))) return false
    if (!(await locator.isEnabled().catch(() => false))) return false
    await locator.click({ timeout: 10000 })
    return true
  }

  const closeCategoryOverlayIfNeeded = async () => {
    const overlay = page.locator('div[role="dialog"].category-overlay').first()
    if (!(await overlay.isVisible().catch(() => false))) return

    const firstCard = overlay.locator('.category-overlay-card').first()
    if ((await firstCard.count()) > 0) {
      await firstCard.click()
      await overlay.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {})
      await wait(600)
      return
    }

    await page.keyboard.press('Escape').catch(() => {})
    await wait(400)
  }

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await wait(1300)
  await safeClickButton('Мне нужна услуга')
  await wait(700)
  await safeClickButton('Сохранить')
  await wait(900)
  await closeCategoryOverlayIfNeeded()
  await wait(1000)

  await capture('screen-client-home')
  await safeClickButton('Чаты')
  await wait(800)
  await capture('screen-client-chats')
  await safeClickButton('Заявки')
  await wait(800)
  await capture('screen-client-requests')
  await safeClickButton('Профиль')
  await wait(900)
  await capture('screen-client-profile')

  let openedAddress = await safeClickButton('Изменить город и район', false)
  if (!openedAddress) {
    openedAddress = await safeClickButton('Город и район', false)
  }
  if (!openedAddress) {
    const addressButton = page.locator('button:has-text("Адрес")').first()
    if (
      (await addressButton.count()) > 0 &&
      (await addressButton.isVisible().catch(() => false)) &&
      (await addressButton.isEnabled().catch(() => false))
    ) {
      await addressButton.click()
      openedAddress = true
    }
  }
  if (openedAddress) {
    await wait(900)
    await capture('screen-client-address')
  }

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await wait(1300)
  await safeClickButton('Я мастер')
  await wait(1300)
  await capture('screen-master-profile')
  await safeClickButton('Заявки')
  await wait(900)
  await capture('screen-master-requests')
  await safeClickButton('Чаты')
  await wait(900)
  await capture('screen-master-chats')
  await safeClickButton('Кабинет')
  await wait(900)
  await capture('screen-master-cabinet')

  await context.close()
} finally {
  await browser.close()
}

console.log(`OUT_DIR=${outDir}`)
