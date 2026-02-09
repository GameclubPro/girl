import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const DEFAULT_RUNTIME_LIBS = '.local/runtime-libs/root/usr/lib/x86_64-linux-gnu'

const DEFAULT_CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-background-networking',
  '--disable-breakpad',
  '--disable-crash-reporter',
  '--disable-features=Crashpad',
]

const parseVersionSuffix = (value) => {
  const match = String(value).match(/-(\d+)$/)
  return match ? Number.parseInt(match[1], 10) : 0
}

const compactLines = (value, maxLines = 14) =>
  String(value ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n')

const findChromiumDirs = (root) => {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
    .map((entry) => entry.name)
    .sort((left, right) => parseVersionSuffix(right) - parseVersionSuffix(left))
}

export const resolveBundledChromiumExecutable = () => {
  const roots = [
    resolve('.playwright-browsers'),
    join(homedir(), '.cache', 'ms-playwright'),
  ]

  for (const root of roots) {
    const candidates = findChromiumDirs(root)
    for (const folder of candidates) {
      const linux64 = join(root, folder, 'chrome-linux64', 'chrome')
      if (existsSync(linux64)) return linux64
      const legacy = join(root, folder, 'chrome-linux', 'chrome')
      if (existsSync(legacy)) return legacy
    }
  }
  return null
}

export const resolveSystemChromiumExecutable = () => {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  return candidates.find((item) => existsSync(item)) ?? null
}

export const applyRuntimeLibs = (runtimeLibsRaw) => {
  const runtimeLibs = resolve(runtimeLibsRaw ?? DEFAULT_RUNTIME_LIBS)
  if (!existsSync(runtimeLibs)) {
    return null
  }

  const current = (process.env.LD_LIBRARY_PATH ?? '')
    .split(':')
    .filter(Boolean)
  if (!current.includes(runtimeLibs)) {
    process.env.LD_LIBRARY_PATH = [runtimeLibs, ...current].join(':')
  }
  return runtimeLibs
}

export const launchChromium = async (
  chromium,
  {
    headless = true,
    browserExecutable,
    extraArgs = [],
    timeoutMs = 45000,
  } = {}
) => {
  const launchArgs = Array.from(
    new Set([...DEFAULT_CHROMIUM_ARGS, ...extraArgs].filter(Boolean))
  )
  const explicitExecutable =
    browserExecutable?.trim() || process.env.PW_BROWSER_EXECUTABLE?.trim() || ''
  const systemExecutable = resolveSystemChromiumExecutable() || ''
  const bundledExecutable = resolveBundledChromiumExecutable() || ''

  const attempts = []
  if (explicitExecutable) {
    attempts.push({
      label: `explicit:${explicitExecutable}`,
      options: { executablePath: explicitExecutable },
    })
  }
  if (systemExecutable && systemExecutable !== explicitExecutable) {
    attempts.push({
      label: `system:${systemExecutable}`,
      options: { executablePath: systemExecutable },
    })
  }
  if (
    bundledExecutable &&
    bundledExecutable !== explicitExecutable &&
    bundledExecutable !== systemExecutable
  ) {
    attempts.push({
      label: `bundled:${bundledExecutable}`,
      options: { executablePath: bundledExecutable },
    })
  }
  attempts.push({
    label: 'playwright:default',
    options: {},
  })

  const errors = []
  for (const attempt of attempts) {
    try {
      const browser = await chromium.launch({
        headless,
        chromiumSandbox: false,
        args: launchArgs,
        timeout: timeoutMs,
        ...attempt.options,
      })
      return {
        browser,
        launchLabel: attempt.label,
      }
    } catch (error) {
      errors.push({
        label: attempt.label,
        message: compactLines(error?.message ?? error),
      })
    }
  }

  const hasSandboxHostError = errors.some((item) =>
    /sandbox_host_linux\.cc:41/.test(item.message)
  )
  const hasCrashpadError = errors.some((item) =>
    /crashpad.+setsockopt.+operation not permitted/i.test(item.message)
  )

  const hints = [
    'Запустите диагностику: `npm run visual:doctor`.',
    'Если браузер установлен в системе, укажите путь: `PW_BROWSER_EXECUTABLE=/path/to/chrome`.',
  ]
  if (hasSandboxHostError || hasCrashpadError) {
    hints.push(
      'Проблема на уровне sandbox окружения. Запускайте visual-аудит в хостовой ОС (вне ограниченного контейнера).'
    )
  }

  const attemptsReport = errors
    .map((item) => `- ${item.label}\n${item.message}`)
    .join('\n\n')
  throw new Error(
    `Не удалось запустить Chromium.\n\nПопытки:\n${attemptsReport}\n\nПодсказки:\n${hints
      .map((item) => `- ${item}`)
      .join('\n')}`
  )
}
