type Insets = {
  top: number
  right: number
  bottom: number
  left: number
}

type PartialInsets = Partial<Insets>
type PlatformMode = 'ios' | 'android'

type EmulatorWindow = Window & {
  __maxEmulatorCleanup?: () => void
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])
const PLATFORM_KEYS = new Set<PlatformMode>(['ios', 'android'])

const MAX_EMULATOR_CSS_VARS = [
  '--max-emulator-width',
  '--max-emulator-height',
  '--max-emulator-status-height',
  '--max-emulator-topbar-height',
  '--host-safe-top-js',
  '--host-safe-bottom-js',
  '--host-content-safe-top-js',
  '--host-content-safe-bottom-js',
  '--tg-safe-top-js',
  '--tg-safe-bottom-js',
  '--tg-content-safe-top-js',
  '--tg-content-safe-bottom-js',
] as const

const parseBoolean = (value: string | null): boolean | null => {
  if (value == null) return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return null
}

const parseNumber = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const parsePlatformMode = (value: string | null): PlatformMode => {
  if (!value) return 'ios'
  const normalized = value.trim().toLowerCase() as PlatformMode
  return PLATFORM_KEYS.has(normalized) ? normalized : 'ios'
}

const readInsetOverride = (
  params: URLSearchParams,
  key: string,
  min: number,
  max: number
): number | undefined => {
  const raw = params.get(key)
  if (raw == null || raw.trim() === '') return undefined
  return clamp(parseNumber(raw, min), min, max)
}

const readInsetOverrides = (
  params: URLSearchParams,
  prefix: 'max' | 'maxContent'
): PartialInsets => ({
  top: readInsetOverride(params, `${prefix}TopInset`, 0, 96),
  bottom: readInsetOverride(params, `${prefix}BottomInset`, 0, 96),
  left: readInsetOverride(params, `${prefix}LeftInset`, 0, 32),
  right: readInsetOverride(params, `${prefix}RightInset`, 0, 32),
})

const resolveInsets = (
  defaults: Insets,
  primary: PartialInsets,
  fallback?: PartialInsets
): Insets => ({
  top: primary.top ?? fallback?.top ?? defaults.top,
  right: primary.right ?? fallback?.right ?? defaults.right,
  bottom: primary.bottom ?? fallback?.bottom ?? defaults.bottom,
  left: primary.left ?? fallback?.left ?? defaults.left,
})

const applySafeAreaVars = (safeAreaInset: Insets, contentSafeAreaInset: Insets) => {
  const root = document.documentElement

  root.style.setProperty('--host-safe-top-js', `${safeAreaInset.top}px`)
  root.style.setProperty('--host-safe-bottom-js', `${safeAreaInset.bottom}px`)
  root.style.setProperty('--host-content-safe-top-js', `${contentSafeAreaInset.top}px`)
  root.style.setProperty(
    '--host-content-safe-bottom-js',
    `${contentSafeAreaInset.bottom}px`
  )

  root.style.setProperty('--tg-safe-top-js', `${safeAreaInset.top}px`)
  root.style.setProperty('--tg-safe-bottom-js', `${safeAreaInset.bottom}px`)
  root.style.setProperty('--tg-content-safe-top-js', `${contentSafeAreaInset.top}px`)
  root.style.setProperty(
    '--tg-content-safe-bottom-js',
    `${contentSafeAreaInset.bottom}px`
  )
}

const removeEmulatorCssVars = () => {
  const root = document.documentElement
  MAX_EMULATOR_CSS_VARS.forEach((variable) => root.style.removeProperty(variable))
}

const buildInitData = ({
  userId,
  firstName,
  lastName,
  username,
  languageCode,
  photoUrl,
  startParam,
}: {
  userId: number
  firstName: string
  lastName: string
  username: string
  languageCode: string
  photoUrl?: string
  startParam?: string
}) => {
  const params = new URLSearchParams()
  params.set('auth_date', String(Date.now()))
  params.set('query_id', `max_${userId}_${Date.now()}`)
  params.set(
    'user',
    JSON.stringify({
      id: userId,
      first_name: firstName,
      last_name: lastName,
      username,
      language_code: languageCode,
      photo_url: photoUrl ?? null,
    })
  )
  if (startParam) {
    params.set('start_param', startParam)
  }
  params.set('hash', params.get('hash') ?? 'dev-max-hash')
  return params.toString()
}

export const setupMaxEmulator = () => {
  if (!import.meta.env.DEV) return

  const win = window as EmulatorWindow
  win.__maxEmulatorCleanup?.()

  const params = new URLSearchParams(window.location.search)
  const isEnabled = parseBoolean(params.get('maxEmu')) === true
  if (!isEnabled) return

  const platformMode = parsePlatformMode(params.get('maxPlatform'))
  const targetWidth = clamp(parseNumber(params.get('maxWidth'), 393), 320, 430)
  const targetHeight = clamp(parseNumber(params.get('maxHeight'), 852), 640, 1080)
  const statusHeight = platformMode === 'ios' ? 20 : 24
  const topBarHeight = platformMode === 'ios' ? 44 : 48
  const safeDefaults: Insets =
    platformMode === 'ios'
      ? { top: 47, right: 0, bottom: 34, left: 0 }
      : { top: 24, right: 0, bottom: 16, left: 0 }
  const contentDefaults: Insets = { ...safeDefaults }

  const safeInsetOverrides = readInsetOverrides(params, 'max')
  const contentInsetOverrides = readInsetOverrides(params, 'maxContent')
  const safeAreaInset = resolveInsets(safeDefaults, safeInsetOverrides)
  const contentSafeAreaInset = resolveInsets(
    contentDefaults,
    contentInsetOverrides,
    safeInsetOverrides
  )

  const root = document.documentElement
  root.style.setProperty('--max-emulator-width', `${targetWidth}px`)
  root.style.setProperty('--max-emulator-height', `${targetHeight}px`)
  root.style.setProperty('--max-emulator-status-height', `${statusHeight}px`)
  root.style.setProperty('--max-emulator-topbar-height', `${topBarHeight}px`)
  applySafeAreaVars(safeAreaInset, contentSafeAreaInset)

  const body = document.body
  body.classList.add('max-emulator-mode', `max-emulator-platform-${platformMode}`)

  const existingOverlay = document.getElementById('max-emulator-overlay')
  if (existingOverlay) {
    existingOverlay.remove()
  }

  const overlay = document.createElement('div')
  overlay.id = 'max-emulator-overlay'
  overlay.className = 'max-emulator-overlay'
  overlay.innerHTML = `
    <div class="max-emulator-status" aria-hidden="true">
      <span class="max-emulator-status-time">09:41</span>
      <div class="max-emulator-status-icons">
        <span class="max-emulator-status-cell"></span>
        <span class="max-emulator-status-wifi"></span>
        <span class="max-emulator-status-battery"><span></span></span>
      </div>
    </div>
    <div class="max-emulator-topbar" aria-hidden="true">
      <p class="max-emulator-title"></p>
      <p class="max-emulator-subtitle"></p>
    </div>
  `
  body.appendChild(overlay)

  const statusTimeElement = overlay.querySelector('.max-emulator-status-time')
  const titleElement = overlay.querySelector('.max-emulator-title')
  const subtitleElement = overlay.querySelector('.max-emulator-subtitle')

  if (
    !(statusTimeElement instanceof HTMLSpanElement) ||
    !(titleElement instanceof HTMLParagraphElement) ||
    !(subtitleElement instanceof HTMLParagraphElement)
  ) {
    overlay.remove()
    body.classList.remove(
      'max-emulator-mode',
      `max-emulator-platform-${platformMode}`
    )
    removeEmulatorCssVars()
    return
  }

  const title = params.get('maxTitle')?.trim() || 'MAX Mini App'
  const subtitle = params.get('maxSubtitle')?.trim() || 'MAX'
  const fixedStatusTime = params.get('maxFixedTime')?.trim() || ''
  titleElement.textContent = title
  subtitleElement.textContent = subtitle

  const updateStatusTime = () => {
    const now = new Date()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    statusTimeElement.textContent = `${hours}:${minutes}`
  }

  if (fixedStatusTime) {
    statusTimeElement.textContent = fixedStatusTime
  } else {
    updateStatusTime()
  }
  const statusTimer = fixedStatusTime ? null : window.setInterval(updateStatusTime, 30_000)

  const userId = clamp(parseNumber(params.get('maxUserId'), 5510721194), 1, Number.MAX_SAFE_INTEGER)
  const firstName = params.get('maxFirstName')?.trim() || 'MAX'
  const lastName = params.get('maxLastName')?.trim() || 'User'
  const username = params.get('maxUsername')?.trim() || `max_${userId}`
  const languageCode = params.get('maxLanguage')?.trim() || 'ru'
  const photoUrl = params.get('maxPhotoUrl')?.trim() || undefined
  const startParam =
    params.get('maxStart')?.trim() ||
    params.get('startapp')?.trim() ||
    params.get('start')?.trim() ||
    undefined

  const initData = buildInitData({
    userId,
    firstName,
    lastName,
    username,
    languageCode,
    photoUrl,
    startParam,
  })

  window.WebApp = {
    ...(window.WebApp ?? {}),
    InitData: initData,
    initData,
    platform: params.get('WebAppPlatform')?.trim() || 'mobile_ios',
    version: params.get('WebAppVersion')?.trim() || '1.0',
    openLink: (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    close: () => {},
    haptics: {
      impactOccurred: () => {},
      notificationOccurred: () => {},
      selectionChanged: () => {},
    },
  }

  win.__maxEmulatorCleanup = () => {
    if (statusTimer !== null) {
      window.clearInterval(statusTimer)
    }
    overlay.remove()
    body.classList.remove(
      'max-emulator-mode',
      'max-emulator-platform-ios',
      'max-emulator-platform-android'
    )
    removeEmulatorCssVars()
    delete win.__maxEmulatorCleanup
  }
}
