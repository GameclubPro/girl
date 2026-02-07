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

const toBoolean = (value) => {
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

const args = parseArgs(process.argv.slice(2))
const url = args.get('url') ?? 'http://127.0.0.1:5173/?tgEmu=1'
const output = resolve(
  args.get('out') ?? `.logs/miniapp-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
)
const width = toNumber(args.get('width'), 390, 320, 430)
const height = toNumber(args.get('height'), 844, 640, 2000)
const waitMs = toNumber(args.get('wait'), 1200, 0, 30000)
const selector = args.get('selector') ?? ''
const fullPage = toBoolean(args.get('fullPage'))
const runtimeLibsDir = resolve(
  args.get('runtimeLibs') ?? '.local/runtime-libs/root/usr/lib/x86_64-linux-gnu'
)

if (existsSync(runtimeLibsDir)) {
  process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `${runtimeLibsDir}:${process.env.LD_LIBRARY_PATH}`
    : runtimeLibsDir
}

mkdirSync(dirname(output), { recursive: true })

let browser
try {
  browser = await chromium.launch({ headless: true })
} catch {
  console.error('Failed to launch Playwright Chromium.')
  console.error(
    'Run: npx playwright install --with-deps chromium (or install missing system libs).'
  )
  process.exit(1)
}

let context
try {
  context = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    viewport: { width, height },
  })
  const page = await context.newPage()

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  if (waitMs > 0) {
    await page.waitForTimeout(waitMs)
  }

  if (selector) {
    const locator = page.locator(selector)
    await locator.waitFor({ state: 'visible', timeout: 10000 })
    await locator.screenshot({ path: output })
  } else {
    await page.screenshot({ path: output, fullPage })
  }

  console.log(`Screenshot saved: ${output}`)
} finally {
  if (context) {
    await context.close()
  }
  await browser.close()
}
