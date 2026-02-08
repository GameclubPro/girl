type EventCallback = (...args: unknown[]) => void

type Insets = {
  top: number
  bottom: number
  left: number
  right: number
}

type EmulatorWindow = Window & {
  __tgEmulatorCleanup?: () => void
}

type ThemeMode = 'light' | 'dark'
type PlatformMode = 'ios' | 'android'

type ThemePreset = {
  mode: ThemeMode
  headerText: string
  statusIcon: string
  params: TelegramThemeParams
}

type PartialInsets = Partial<Insets>

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])
const THEME_KEYS = new Set<ThemeMode>(['light', 'dark'])
const PLATFORM_KEYS = new Set<PlatformMode>(['ios', 'android'])
const TELEGRAM_USER_ID_MAX = Number.MAX_SAFE_INTEGER
const TELEGRAM_CSS_VARS = [
  '--tg-theme-bg-color',
  '--tg-theme-text-color',
  '--tg-theme-hint-color',
  '--tg-theme-link-color',
  '--tg-theme-button-color',
  '--tg-theme-button-text-color',
  '--tg-theme-secondary-bg-color',
  '--tg-theme-section-bg-color',
  '--tg-theme-section-header-text-color',
  '--tg-theme-accent-text-color',
  '--tg-theme-destructive-text-color',
  '--tg-emulator-header-bg',
  '--tg-emulator-header-text',
  '--tg-emulator-status-icon',
  '--tg-emulator-main-bg',
  '--tg-emulator-main-text',
  '--tg-emulator-bottom-bar',
  '--tg-emulator-app-bg',
  '--tg-emulator-width',
  '--tg-emulator-height',
  '--tg-emulator-status-height',
  '--tg-emulator-topbar-height',
] as const

const THEME_PRESETS: Record<ThemeMode, ThemePreset> = {
  light: {
    mode: 'light',
    headerText: '#111827',
    statusIcon: '#0f172a',
    params: {
      bg_color: '#ffffff',
      text_color: '#111827',
      hint_color: '#6b7280',
      link_color: '#2481cc',
      button_color: '#2481cc',
      button_text_color: '#ffffff',
      secondary_bg_color: '#f3f4f6',
      section_bg_color: '#ffffff',
      section_header_text_color: '#6b7280',
      accent_text_color: '#2481cc',
      destructive_text_color: '#e53935',
      header_bg_color: '#ffffff',
    },
  },
  dark: {
    mode: 'dark',
    headerText: '#f8fafc',
    statusIcon: '#e2e8f0',
    params: {
      bg_color: '#17212b',
      text_color: '#f8fafc',
      hint_color: '#9ca3af',
      link_color: '#64a8ff',
      button_color: '#2ea6ff',
      button_text_color: '#ffffff',
      secondary_bg_color: '#202b36',
      section_bg_color: '#17212b',
      section_header_text_color: '#9ca3af',
      accent_text_color: '#64a8ff',
      destructive_text_color: '#ff6767',
      header_bg_color: '#202b36',
    },
  },
}

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

const parseThemeMode = (value: string | null): ThemeMode => {
  if (!value) return 'light'
  const normalized = value.trim().toLowerCase() as ThemeMode
  return THEME_KEYS.has(normalized) ? normalized : 'light'
}

const parsePlatformMode = (value: string | null): PlatformMode => {
  if (!value) return 'ios'
  const normalized = value.trim().toLowerCase() as PlatformMode
  return PLATFORM_KEYS.has(normalized) ? normalized : 'ios'
}

const runCallbacks = (callbacks: Set<EventCallback>, ...args: unknown[]) => {
  callbacks.forEach((callback) => {
    try {
      callback(...args)
    } catch (error) {
      console.error('Telegram emulator callback error:', error)
    }
  })
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
  prefix: 'tg' | 'tgContent'
): PartialInsets => ({
  top: readInsetOverride(params, `${prefix}TopInset`, 0, 64),
  bottom: readInsetOverride(params, `${prefix}BottomInset`, 0, 64),
  left: readInsetOverride(params, `${prefix}LeftInset`, 0, 24),
  right: readInsetOverride(params, `${prefix}RightInset`, 0, 24),
})

const resolveInsets = (
  defaults: Insets,
  primary: PartialInsets,
  fallback?: PartialInsets
): Insets => ({
  top: primary.top ?? fallback?.top ?? defaults.top,
  bottom: primary.bottom ?? fallback?.bottom ?? defaults.bottom,
  left: primary.left ?? fallback?.left ?? defaults.left,
  right: primary.right ?? fallback?.right ?? defaults.right,
})

const canUseColor = (value: string) =>
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports('color', value)
    : false

const resolveCssColor = (value: string | undefined | null, fallback: string) => {
  const candidate = value?.trim()
  if (!candidate) return fallback
  return canUseColor(candidate) ? candidate : fallback
}

const assignThemeCssVariables = (
  themeParams: TelegramThemeParams,
  headerColor: string,
  headerText: string,
  statusIcon: string,
  bottomBar: string
) => {
  const root = document.documentElement
  root.style.setProperty('--tg-theme-bg-color', themeParams.bg_color ?? '#ffffff')
  root.style.setProperty('--tg-theme-text-color', themeParams.text_color ?? '#111827')
  root.style.setProperty('--tg-theme-hint-color', themeParams.hint_color ?? '#6b7280')
  root.style.setProperty('--tg-theme-link-color', themeParams.link_color ?? '#2481cc')
  root.style.setProperty('--tg-theme-button-color', themeParams.button_color ?? '#2481cc')
  root.style.setProperty(
    '--tg-theme-button-text-color',
    themeParams.button_text_color ?? '#ffffff'
  )
  root.style.setProperty(
    '--tg-theme-secondary-bg-color',
    themeParams.secondary_bg_color ?? '#f3f4f6'
  )
  root.style.setProperty(
    '--tg-theme-section-bg-color',
    themeParams.section_bg_color ?? themeParams.bg_color ?? '#ffffff'
  )
  root.style.setProperty(
    '--tg-theme-section-header-text-color',
    themeParams.section_header_text_color ?? themeParams.hint_color ?? '#6b7280'
  )
  root.style.setProperty(
    '--tg-theme-accent-text-color',
    themeParams.accent_text_color ?? themeParams.link_color ?? '#2481cc'
  )
  root.style.setProperty(
    '--tg-theme-destructive-text-color',
    themeParams.destructive_text_color ?? '#e53935'
  )
  root.style.setProperty('--tg-emulator-header-bg', headerColor)
  root.style.setProperty('--tg-emulator-header-text', headerText)
  root.style.setProperty('--tg-emulator-status-icon', statusIcon)
  root.style.setProperty('--tg-emulator-main-bg', themeParams.button_color ?? '#2481cc')
  root.style.setProperty('--tg-emulator-main-text', themeParams.button_text_color ?? '#ffffff')
  root.style.setProperty('--tg-emulator-bottom-bar', bottomBar)
  root.style.setProperty('--tg-emulator-app-bg', themeParams.bg_color ?? '#ffffff')
}

const removeThemeCssVariables = () => {
  const root = document.documentElement
  TELEGRAM_CSS_VARS.forEach((variable) => root.style.removeProperty(variable))
}

export const setupTelegramEmulator = () => {
  if (!import.meta.env.DEV) return

  const win = window as EmulatorWindow
  win.__tgEmulatorCleanup?.()

  const params = new URLSearchParams(window.location.search)
  const toggle = parseBoolean(params.get('tgEmu'))
  const hasRealTelegramUser = Boolean(window.Telegram?.WebApp?.initDataUnsafe?.user?.id)
  const isEnabled = toggle ?? !hasRealTelegramUser
  if (!isEnabled) return

  const originalTelegram = window.Telegram
  const themePreset = THEME_PRESETS[parseThemeMode(params.get('tgTheme'))]
  const platformMode = parsePlatformMode(params.get('tgPlatform'))
  const activeThemeParams: TelegramThemeParams = { ...themePreset.params }

  const body = document.body
  body.classList.add(
    'tg-emulator-mode',
    `tg-emulator-theme-${themePreset.mode}`,
    `tg-emulator-platform-${platformMode}`
  )

  const targetWidth = clamp(parseNumber(params.get('tgWidth'), 393), 320, 430)
  const targetHeight = clamp(parseNumber(params.get('tgHeight'), 852), 640, 1080)
  const expandedToggle = parseBoolean(params.get('tgExpanded'))
  const fullscreenToggle = parseBoolean(params.get('tgFullscreen'))
  const shouldStartFullscreen = fullscreenToggle ?? true
  const shouldStartExpanded = expandedToggle ?? true
  const shouldStartExpandedState = shouldStartExpanded || shouldStartFullscreen
  const statusHeight = platformMode === 'ios' ? 20 : 24
  const topBarHeight = platformMode === 'ios' ? 44 : 48
  const collapsedSafeDefaults: Insets =
    platformMode === 'ios'
      ? { top: 0, bottom: 34, left: 0, right: 0 }
      : { top: 0, bottom: 16, left: 0, right: 0 }
  const fullscreenSafeDefaults: Insets =
    platformMode === 'ios'
      ? { top: 47, bottom: 34, left: 0, right: 0 }
      : { top: 24, bottom: 16, left: 0, right: 0 }
  const collapsedContentSafeDefaults: Insets = {
    top: 0,
    bottom: collapsedSafeDefaults.bottom,
    left: collapsedSafeDefaults.left,
    right: collapsedSafeDefaults.right,
  }
  const fullscreenContentSafeDefaults: Insets = { ...fullscreenSafeDefaults }

  document.documentElement.style.setProperty('--tg-emulator-width', `${targetWidth}px`)
  document.documentElement.style.setProperty('--tg-emulator-height', `${targetHeight}px`)
  document.documentElement.style.setProperty(
    '--tg-emulator-status-height',
    `${statusHeight}px`
  )
  document.documentElement.style.setProperty(
    '--tg-emulator-topbar-height',
    `${topBarHeight}px`
  )

  const safeInsetOverrides = readInsetOverrides(params, 'tg')
  const contentInsetOverrides = readInsetOverrides(params, 'tgContent')

  const resolveSafeAreaByState = (isFullscreen: boolean) =>
    resolveInsets(
      isFullscreen ? fullscreenSafeDefaults : collapsedSafeDefaults,
      safeInsetOverrides
    )

  const resolveContentSafeAreaByState = (isFullscreen: boolean) =>
    resolveInsets(
      isFullscreen ? fullscreenContentSafeDefaults : collapsedContentSafeDefaults,
      contentInsetOverrides,
      safeInsetOverrides
    )

  let safeAreaInset = resolveSafeAreaByState(shouldStartFullscreen)
  let contentSafeAreaInset = resolveContentSafeAreaByState(shouldStartFullscreen)
  const eventListeners = new Map<string, Set<EventCallback>>()

  const emitEvent = (eventType: string, ...args: unknown[]) => {
    const listeners = eventListeners.get(eventType)
    if (!listeners || listeners.size === 0) return
    runCallbacks(listeners, ...args)
  }

  const existingOverlay = document.getElementById('tg-emulator-overlay')
  if (existingOverlay) {
    existingOverlay.remove()
  }

  const overlay = document.createElement('div')
  overlay.id = 'tg-emulator-overlay'
  overlay.className = 'tg-emulator-overlay'
  overlay.innerHTML = `
    <div class="tg-emulator-status" aria-hidden="true">
      <span class="tg-emulator-status-time">09:41</span>
      <div class="tg-emulator-status-icons">
        <span class="tg-emulator-status-cell"></span>
        <span class="tg-emulator-status-wifi"></span>
        <span class="tg-emulator-status-battery"><span></span></span>
      </div>
    </div>
    <div class="tg-emulator-topbar">
      <button type="button" class="tg-emulator-header-back" aria-label="Back">
        <span aria-hidden="true">&lt;</span>
      </button>
      <div class="tg-emulator-header-meta">
        <p class="tg-emulator-header-title"></p>
        <p class="tg-emulator-header-subtitle"></p>
      </div>
      <span class="tg-emulator-header-spacer" aria-hidden="true"></span>
    </div>
    <div class="tg-emulator-main-wrap">
      <button type="button" class="tg-emulator-main">Continue</button>
    </div>
  `
  body.appendChild(overlay)

  const statusTimeElement = overlay.querySelector('.tg-emulator-status-time')
  const topBarElement = overlay.querySelector('.tg-emulator-topbar')
  const backButtonElement = overlay.querySelector('.tg-emulator-header-back')
  const titleElement = overlay.querySelector('.tg-emulator-header-title')
  const subtitleElement = overlay.querySelector('.tg-emulator-header-subtitle')
  const mainWrapElement = overlay.querySelector('.tg-emulator-main-wrap')
  const mainButtonElement = overlay.querySelector('.tg-emulator-main')

  if (!(statusTimeElement instanceof HTMLSpanElement)) {
    overlay.remove()
    return
  }
  if (!(topBarElement instanceof HTMLDivElement)) {
    overlay.remove()
    return
  }
  if (!(backButtonElement instanceof HTMLButtonElement)) {
    overlay.remove()
    return
  }
  if (!(titleElement instanceof HTMLParagraphElement)) {
    overlay.remove()
    return
  }
  if (!(subtitleElement instanceof HTMLParagraphElement)) {
    overlay.remove()
    return
  }
  if (!(mainWrapElement instanceof HTMLDivElement)) {
    overlay.remove()
    return
  }
  if (!(mainButtonElement instanceof HTMLButtonElement)) {
    overlay.remove()
    return
  }

  const userId = clamp(
    parseNumber(params.get('tgUserId'), 100001),
    1,
    TELEGRAM_USER_ID_MAX
  )
  const firstName = params.get('tgFirstName')?.trim() || 'Kiven'
  const lastName = params.get('tgLastName')?.trim() || 'Tester'
  const username = params.get('tgUsername')?.trim() || 'kiven_designer'
  const photoUrl = params.get('tgPhotoUrl')?.trim() || undefined
  const startParam =
    params.get('tgStart')?.trim() || params.get('startapp')?.trim() || undefined
  const title = params.get('tgTitle')?.trim() || document.title.trim() || 'Mini App'
  const subtitle = params.get('tgSubtitle')?.trim() || `@${username}`

  titleElement.textContent = title
  subtitleElement.textContent = subtitle

  const mainButtonState = {
    visible: false,
    enabled: true,
    loading: false,
    text: params.get('tgMainText')?.trim() || 'Continue',
    color: resolveCssColor(activeThemeParams.button_color, '#2481cc'),
    textColor: resolveCssColor(activeThemeParams.button_text_color, '#ffffff'),
    listeners: new Set<EventCallback>(),
  }

  const backButtonState = {
    visible: false,
    listeners: new Set<EventCallback>(),
  }

  const uiState = {
    headerColor: resolveCssColor(
      activeThemeParams.header_bg_color ?? activeThemeParams.bg_color,
      '#ffffff'
    ),
    headerTextColor: themePreset.headerText,
    statusIconColor: themePreset.statusIcon,
    appBackground: resolveCssColor(activeThemeParams.bg_color, '#ffffff'),
    bottomBarColor: resolveCssColor(
      activeThemeParams.secondary_bg_color ?? activeThemeParams.bg_color,
      '#f3f4f6'
    ),
  }

  const resolveColorToken = (rawValue: string, fallback: string) => {
    const value = rawValue.trim()
    if (!value) return fallback
    const mapped = activeThemeParams[value]
    if (mapped) return resolveCssColor(mapped, fallback)
    return resolveCssColor(value, fallback)
  }

  const updateStatusTime = () => {
    const now = new Date()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    statusTimeElement.textContent = `${hours}:${minutes}`
  }

  updateStatusTime()
  const statusTimer = window.setInterval(updateStatusTime, 30_000)

  const mainButton: TelegramMainButton = {
    show: () => {
      mainButtonState.visible = true
      renderMainButton()
      updateViewportMetrics()
    },
    hide: () => {
      mainButtonState.visible = false
      renderMainButton()
      updateViewportMetrics()
    },
    enable: () => {
      mainButtonState.enabled = true
      renderMainButton()
    },
    disable: () => {
      mainButtonState.enabled = false
      renderMainButton()
    },
    showProgress: () => {
      mainButtonState.loading = true
      renderMainButton()
    },
    hideProgress: () => {
      mainButtonState.loading = false
      renderMainButton()
    },
    onClick: (callback) => {
      mainButtonState.listeners.add(callback)
    },
    offClick: (callback) => {
      mainButtonState.listeners.delete(callback)
    },
    setText: (text) => {
      mainButtonState.text = text?.trim() || 'Continue'
      renderMainButton()
    },
    isVisible: false,
    isActive: true,
  }

  Object.defineProperty(mainButton, 'color', {
    configurable: true,
    enumerable: true,
    get: () => mainButtonState.color,
    set: (value: string | undefined) => {
      if (!value) return
      mainButtonState.color = resolveColorToken(value, mainButtonState.color)
      renderMainButton()
    },
  })

  Object.defineProperty(mainButton, 'textColor', {
    configurable: true,
    enumerable: true,
    get: () => mainButtonState.textColor,
    set: (value: string | undefined) => {
      if (!value) return
      mainButtonState.textColor = resolveColorToken(value, mainButtonState.textColor)
      renderMainButton()
    },
  })

  const backButton: TelegramBackButton = {
    show: () => {
      backButtonState.visible = true
      renderBackButton()
    },
    hide: () => {
      backButtonState.visible = false
      renderBackButton()
    },
    onClick: (callback) => {
      backButtonState.listeners.add(callback)
    },
    offClick: (callback) => {
      backButtonState.listeners.delete(callback)
    },
    isVisible: false,
  }

  const webApp: TelegramWebApp = {
    ready: () => {},
    expand: () => {
      webApp.isExpanded = true
      body.classList.add('tg-emulator-expanded')
      updateViewportMetrics()
    },
    close: () => {
      if (webApp.isClosingConfirmationEnabled) return
    },
    requestFullscreen: () => {
      if (webApp.isFullscreen) return
      webApp.isExpanded = true
      webApp.isFullscreen = true
      body.classList.add('tg-emulator-expanded')
      body.classList.add('tg-emulator-fullscreen')
      syncInsets()
      updateViewportMetrics()
      emitEvent('fullscreenChanged', { is_fullscreen: true })
    },
    exitFullscreen: () => {
      if (!webApp.isFullscreen) return
      webApp.isFullscreen = false
      body.classList.remove('tg-emulator-fullscreen')
      syncInsets()
      updateViewportMetrics()
      emitEvent('fullscreenChanged', { is_fullscreen: false })
    },
    openLink: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    openTelegramLink: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    disableVerticalSwipes: () => {
      body.classList.add('tg-emulator-no-swipe')
    },
    enableClosingConfirmation: () => {
      webApp.isClosingConfirmationEnabled = true
    },
    disableClosingConfirmation: () => {
      webApp.isClosingConfirmationEnabled = false
    },
    setHeaderColor: (colorKey) => {
      uiState.headerColor = resolveColorToken(colorKey, uiState.headerColor)
      activeThemeParams.header_bg_color = uiState.headerColor
      assignThemeCssVariables(
        activeThemeParams,
        uiState.headerColor,
        uiState.headerTextColor,
        uiState.statusIconColor,
        uiState.bottomBarColor
      )
      renderHeader()
    },
    setBackgroundColor: (color) => {
      uiState.appBackground = resolveColorToken(color, uiState.appBackground)
      activeThemeParams.bg_color = uiState.appBackground
      assignThemeCssVariables(
        activeThemeParams,
        uiState.headerColor,
        uiState.headerTextColor,
        uiState.statusIconColor,
        uiState.bottomBarColor
      )
      emitEvent('themeChanged')
    },
    setBottomBarColor: (color) => {
      uiState.bottomBarColor = resolveColorToken(color, uiState.bottomBarColor)
      assignThemeCssVariables(
        activeThemeParams,
        uiState.headerColor,
        uiState.headerTextColor,
        uiState.statusIconColor,
        uiState.bottomBarColor
      )
      renderMainButton()
    },
    platform: platformMode,
    version: '9.9',
    colorScheme: themePreset.mode,
    isExpanded: shouldStartExpandedState,
    isFullscreen: shouldStartFullscreen,
    isClosingConfirmationEnabled: false,
    viewportHeight: window.innerHeight,
    viewportStableHeight: window.innerHeight,
    themeParams: activeThemeParams,
    MainButton: mainButton,
    BackButton: backButton,
    HapticFeedback: {
      impactOccurred: () => {},
      notificationOccurred: () => {},
      selectionChanged: () => {},
    },
    initDataUnsafe: {
      user: {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        username,
        language_code: 'ru',
        photo_url: photoUrl,
      },
      start_param: startParam,
    },
    safeAreaInset,
    contentSafeAreaInset,
    onEvent: (eventType, callback) => {
      if (!eventListeners.has(eventType)) {
        eventListeners.set(eventType, new Set())
      }
      eventListeners.get(eventType)?.add(callback)
    },
    offEvent: (eventType, callback) => {
      eventListeners.get(eventType)?.delete(callback)
    },
  }

  if (shouldStartExpandedState) {
    body.classList.add('tg-emulator-expanded')
  }
  if (shouldStartFullscreen) {
    body.classList.add('tg-emulator-fullscreen')
  }

  const syncInsets = (emitChanges = true) => {
    safeAreaInset = resolveSafeAreaByState(Boolean(webApp.isFullscreen))
    contentSafeAreaInset = resolveContentSafeAreaByState(Boolean(webApp.isFullscreen))
    webApp.safeAreaInset = { ...safeAreaInset }
    webApp.contentSafeAreaInset = { ...contentSafeAreaInset }
    if (emitChanges) {
      emitEvent('safeAreaChanged')
      emitEvent('contentSafeAreaChanged')
    }
  }

  const updateViewportMetrics = () => {
    const topOffset = webApp.isFullscreen ? 0 : statusHeight + topBarHeight
    const safeBottomInset =
      webApp.contentSafeAreaInset?.bottom ?? webApp.safeAreaInset?.bottom ?? 0
    const bottomOffset = mainButtonState.visible ? 74 + safeBottomInset : 0
    const height = Math.max(0, window.innerHeight - topOffset - bottomOffset)
    webApp.viewportHeight = height
    webApp.viewportStableHeight = height
    emitEvent('viewportChanged')
  }

  const renderHeader = () => {
    topBarElement.style.backgroundColor = uiState.headerColor
    topBarElement.style.color = uiState.headerTextColor
  }

  const renderBackButton = () => {
    backButtonElement.classList.toggle('is-visible', backButtonState.visible)
    backButton.isVisible = backButtonState.visible
  }

  const renderMainButton = () => {
    mainWrapElement.hidden = !mainButtonState.visible
    mainButtonElement.textContent = mainButtonState.text
    mainButtonElement.disabled = !mainButtonState.enabled || mainButtonState.loading
    mainButtonElement.classList.toggle('is-loading', mainButtonState.loading)
    mainButtonElement.style.backgroundColor = mainButtonState.color
    mainButtonElement.style.color = mainButtonState.textColor
    mainWrapElement.style.backgroundColor = uiState.bottomBarColor
    mainButton.isVisible = mainButtonState.visible
    mainButton.isActive = mainButtonState.enabled && !mainButtonState.loading
    body.classList.toggle('tg-emulator-main-visible', mainButtonState.visible)
  }

  const handleBackClick = () => {
    runCallbacks(backButtonState.listeners)
  }

  const handleMainClick = () => {
    if (!mainButtonState.enabled || mainButtonState.loading) return
    runCallbacks(mainButtonState.listeners)
  }

  backButtonElement.addEventListener('click', handleBackClick)
  mainButtonElement.addEventListener('click', handleMainClick)

  assignThemeCssVariables(
    activeThemeParams,
    uiState.headerColor,
    uiState.headerTextColor,
    uiState.statusIconColor,
    uiState.bottomBarColor
  )
  renderHeader()
  renderBackButton()
  renderMainButton()

  const handleResize = () => {
    syncInsets()
    updateViewportMetrics()
  }

  window.addEventListener('resize', handleResize)
  emitEvent('themeChanged')
  syncInsets()
  updateViewportMetrics()

  window.Telegram = {
    ...(originalTelegram ?? {}),
    WebApp: webApp,
  }

  win.__tgEmulatorCleanup = () => {
    window.removeEventListener('resize', handleResize)
    window.clearInterval(statusTimer)
    backButtonElement.removeEventListener('click', handleBackClick)
    mainButtonElement.removeEventListener('click', handleMainClick)
    overlay.remove()
    body.classList.remove(
      'tg-emulator-mode',
      'tg-emulator-expanded',
      'tg-emulator-fullscreen',
      'tg-emulator-no-swipe',
      'tg-emulator-main-visible',
      'tg-emulator-theme-light',
      'tg-emulator-theme-dark',
      'tg-emulator-platform-ios',
      'tg-emulator-platform-android'
    )
    removeThemeCssVariables()
    if (originalTelegram) {
      window.Telegram = originalTelegram
    } else {
      delete window.Telegram
    }
    delete win.__tgEmulatorCleanup
  }
}
