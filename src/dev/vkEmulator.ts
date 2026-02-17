type Insets = {
  top: number
  right: number
  bottom: number
  left: number
}

type PartialInsets = Partial<Insets>
type PlatformMode = 'ios' | 'android'

type EmulatorWindow = Window & {
  __vkEmulatorCleanup?: () => void
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])
const PLATFORM_KEYS = new Set<PlatformMode>(['ios', 'android'])

const VK_EMULATOR_CSS_VARS = [
  '--vk-emulator-width',
  '--vk-emulator-height',
  '--vk-emulator-status-height',
  '--vk-emulator-topbar-height',
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
  prefix: 'vk' | 'vkContent'
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
  VK_EMULATOR_CSS_VARS.forEach((variable) => root.style.removeProperty(variable))
}

export const setupVkEmulator = () => {
  if (!import.meta.env.DEV) return

  const win = window as EmulatorWindow
  win.__vkEmulatorCleanup?.()

  const params = new URLSearchParams(window.location.search)
  const isEnabled = parseBoolean(params.get('vkEmu')) === true
  if (!isEnabled) return

  const platformMode = parsePlatformMode(params.get('vkPlatform'))
  const targetWidth = clamp(parseNumber(params.get('vkWidth'), 393), 320, 430)
  const targetHeight = clamp(parseNumber(params.get('vkHeight'), 852), 640, 1080)
  const statusHeight = platformMode === 'ios' ? 20 : 24
  const topBarHeight = platformMode === 'ios' ? 44 : 48
  const safeDefaults: Insets =
    platformMode === 'ios'
      ? { top: 47, right: 0, bottom: 34, left: 0 }
      : { top: 24, right: 0, bottom: 16, left: 0 }
  const contentDefaults: Insets = { ...safeDefaults }

  const safeInsetOverrides = readInsetOverrides(params, 'vk')
  const contentInsetOverrides = readInsetOverrides(params, 'vkContent')
  const safeAreaInset = resolveInsets(safeDefaults, safeInsetOverrides)
  const contentSafeAreaInset = resolveInsets(
    contentDefaults,
    contentInsetOverrides,
    safeInsetOverrides
  )

  const root = document.documentElement
  root.style.setProperty('--vk-emulator-width', `${targetWidth}px`)
  root.style.setProperty('--vk-emulator-height', `${targetHeight}px`)
  root.style.setProperty('--vk-emulator-status-height', `${statusHeight}px`)
  root.style.setProperty('--vk-emulator-topbar-height', `${topBarHeight}px`)
  applySafeAreaVars(safeAreaInset, contentSafeAreaInset)

  const body = document.body
  body.classList.add('vk-emulator-mode', `vk-emulator-platform-${platformMode}`)

  const existingOverlay = document.getElementById('vk-emulator-overlay')
  if (existingOverlay) {
    existingOverlay.remove()
  }

  const overlay = document.createElement('div')
  overlay.id = 'vk-emulator-overlay'
  overlay.className = 'vk-emulator-overlay'
  overlay.innerHTML = `
    <div class="vk-emulator-status" aria-hidden="true">
      <span class="vk-emulator-status-time">09:41</span>
      <div class="vk-emulator-status-icons">
        <span class="vk-emulator-status-cell"></span>
        <span class="vk-emulator-status-wifi"></span>
        <span class="vk-emulator-status-battery"><span></span></span>
      </div>
    </div>
    <div class="vk-emulator-topbar" aria-hidden="true">
      <p class="vk-emulator-title"></p>
      <p class="vk-emulator-subtitle"></p>
    </div>
  `
  body.appendChild(overlay)

  const statusTimeElement = overlay.querySelector('.vk-emulator-status-time')
  const titleElement = overlay.querySelector('.vk-emulator-title')
  const subtitleElement = overlay.querySelector('.vk-emulator-subtitle')

  if (
    !(statusTimeElement instanceof HTMLSpanElement) ||
    !(titleElement instanceof HTMLParagraphElement) ||
    !(subtitleElement instanceof HTMLParagraphElement)
  ) {
    overlay.remove()
    body.classList.remove('vk-emulator-mode', `vk-emulator-platform-${platformMode}`)
    removeEmulatorCssVars()
    return
  }

  const title = params.get('vkTitle')?.trim() || 'VK Mini App'
  const subtitle = params.get('vkSubtitle')?.trim() || 'ВКонтакте'
  const fixedStatusTime = params.get('vkFixedTime')?.trim() || ''
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

  win.__vkEmulatorCleanup = () => {
    if (statusTimer !== null) {
      window.clearInterval(statusTimer)
    }
    overlay.remove()
    body.classList.remove('vk-emulator-mode', 'vk-emulator-platform-ios', 'vk-emulator-platform-android')
    removeEmulatorCssVars()
    delete win.__vkEmulatorCleanup
  }
}
