import bridge, { type Insets, type ParentConfigData, type UserInfo } from '@vkontakte/vk-bridge'
import { detectMiniAppHost, setMiniAppHost } from './miniAppHost'

type EventCallback = (...args: unknown[]) => void

type LaunchParams = {
  vkUserId: number | null
  vkRef: string
  vkLanguage: string
  vkPlatform: string
}

type ResolvedInsets = {
  safeAreaInset: TelegramInsets
  contentSafeAreaInset: TelegramInsets
}

const VK_APP_USER_ID_REGEX = /^\d+$/

type VkLaunchParamsPayload = {
  vk_user_id?: number | string | null
  vk_ref?: string | null
  vk_language?: string | null
  vk_platform?: string | null
}

type MaxLaunchParamsPayload = {
  WebAppData?: string | null
  WebAppVersion?: string | null
  WebAppPlatform?: string | null
  startapp?: string | null
  start?: string | null
}

const toInsets = (value?: Partial<Insets> | null): TelegramInsets => ({
  top: Number.isFinite(Number(value?.top)) ? Number(value?.top) : 0,
  right: Number.isFinite(Number(value?.right)) ? Number(value?.right) : 0,
  bottom: Number.isFinite(Number(value?.bottom)) ? Number(value?.bottom) : 0,
  left: Number.isFinite(Number(value?.left)) ? Number(value?.left) : 0,
})

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const mergeInsets = (base: TelegramInsets, overrides: Partial<Insets>) => ({
  top: Number.isFinite(Number(overrides.top)) ? Number(overrides.top) : base.top,
  right: Number.isFinite(Number(overrides.right)) ? Number(overrides.right) : base.right,
  bottom: Number.isFinite(Number(overrides.bottom))
    ? Number(overrides.bottom)
    : base.bottom,
  left: Number.isFinite(Number(overrides.left)) ? Number(overrides.left) : base.left,
})

const hasInsetsOverride = (insets: Partial<Insets>) =>
  Number.isFinite(Number(insets.top)) ||
  Number.isFinite(Number(insets.right)) ||
  Number.isFinite(Number(insets.bottom)) ||
  Number.isFinite(Number(insets.left))

const applySafeAreaVars = (
  safeAreaInset: TelegramInsets,
  contentSafeAreaInset: TelegramInsets
) => {
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

const getHashParams = () => {
  const rawHash = window.location.hash.replace(/^#\/?/, '')
  const hashQuery = rawHash.startsWith('?') ? rawHash.slice(1) : rawHash
  return new URLSearchParams(hashQuery)
}

const readParam = (key: string) => {
  const search = new URLSearchParams(window.location.search)
  const hash = getHashParams()
  return search.get(key) ?? hash.get(key) ?? ''
}

const readInsetOverride = (key: string, min: number, max: number) => {
  const raw = readParam(key).trim()
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return undefined
  return clamp(parsed, min, max)
}

const readInsetOverrides = (prefix: 'vk' | 'vkContent'): Partial<Insets> => ({
  top: readInsetOverride(`${prefix}TopInset`, 0, 96),
  right: readInsetOverride(`${prefix}RightInset`, 0, 32),
  bottom: readInsetOverride(`${prefix}BottomInset`, 0, 96),
  left: readInsetOverride(`${prefix}LeftInset`, 0, 32),
})

const collectVkLaunchParams = () => {
  const search = new URLSearchParams(window.location.search)
  const hash = getHashParams()
  const params = new Map<string, string>()
  const includeEntry = (key: string, rawValue: string) => {
    const normalizedKey = key.trim()
    const normalizedValue = rawValue.trim()
    if (!normalizedKey || !normalizedValue) return
    if (
      normalizedKey.startsWith('vk_') ||
      normalizedKey === 'sign' ||
      normalizedKey === 'vk_sign'
    ) {
      params.set(normalizedKey, normalizedValue)
    }
  }
  search.forEach((value, key) => includeEntry(key, value))
  hash.forEach((value, key) => includeEntry(key, value))
  return Object.fromEntries(params.entries())
}

const collectMaxLaunchParams = () => {
  const search = new URLSearchParams(window.location.search)
  const hash = getHashParams()
  const params = new Map<string, string>()
  const includeEntry = (key: string, rawValue: string) => {
    const normalizedKey = key.trim()
    const normalizedValue = rawValue.trim()
    if (!normalizedKey || !normalizedValue) return
    const lowerKey = normalizedKey.toLowerCase()
    if (
      lowerKey === 'webappdata' ||
      lowerKey === 'webappversion' ||
      lowerKey === 'webappplatform' ||
      lowerKey === 'startapp' ||
      lowerKey === 'start' ||
      lowerKey.startsWith('max_')
    ) {
      const canonicalKey =
        lowerKey === 'webappdata'
          ? 'WebAppData'
          : lowerKey === 'webappversion'
            ? 'WebAppVersion'
            : lowerKey === 'webappplatform'
              ? 'WebAppPlatform'
              : normalizedKey
      params.set(canonicalKey, normalizedValue)
    }
  }
  search.forEach((value, key) => includeEntry(key, value))
  hash.forEach((value, key) => includeEntry(key, value))
  return Object.fromEntries(params.entries())
}

const decodeInitDataString = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return ''
  if (normalized.includes('=') && normalized.includes('&')) {
    return normalized
  }
  try {
    const decoded = decodeURIComponent(normalized)
    return decoded.trim()
  } catch (_error) {
    return normalized
  }
}

const parseMaxInitDataUser = (initData: string) => {
  const normalized = decodeInitDataString(initData)
  if (!normalized) return undefined
  const params = new URLSearchParams(normalized)
  const userRaw = params.get('user')?.trim()
  if (!userRaw) return undefined
  try {
    const parsed = JSON.parse(userRaw) as {
      id?: number | string
      first_name?: string
      last_name?: string
      username?: string
      language_code?: string
      photo_url?: string
    }
    const id = Number(parsed?.id)
    if (!Number.isFinite(id) || id <= 0) return undefined
    return {
      id,
      first_name: parsed.first_name,
      last_name: parsed.last_name,
      username: parsed.username,
      language_code: parsed.language_code,
      photo_url: parsed.photo_url,
    }
  } catch (_error) {
    return undefined
  }
}

const resolveMaxInitData = () => {
  const webApp = window.WebApp
  const launchParams = collectMaxLaunchParams() as MaxLaunchParamsPayload
  const initData =
    (webApp?.initData ?? webApp?.InitData ?? launchParams.WebAppData ?? '').trim()
  return decodeInitDataString(initData)
}

const parseVkUserId = (value: string) => {
  const normalized = value.trim()
  if (!VK_APP_USER_ID_REGEX.test(normalized)) return null
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

const parseVkUserIdUnsafe = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string') {
    return parseVkUserId(value)
  }
  return null
}

const resolveLaunchParams = async (): Promise<LaunchParams> => {
  try {
    const params = await bridge.send('VKWebAppGetLaunchParams')
    const payload = params as VkLaunchParamsPayload
    return {
      vkUserId: parseVkUserIdUnsafe(payload.vk_user_id),
      vkRef: typeof payload.vk_ref === 'string' ? payload.vk_ref : '',
      vkLanguage: typeof payload.vk_language === 'string' ? payload.vk_language : '',
      vkPlatform: typeof payload.vk_platform === 'string' ? payload.vk_platform : '',
    }
  } catch (_error) {
    return {
      vkUserId: parseVkUserId(readParam('vk_user_id')),
      vkRef: readParam('vk_ref'),
      vkLanguage: readParam('vk_language'),
      vkPlatform: readParam('vk_platform'),
    }
  }
}

const resolveUserInfo = async () => {
  try {
    return await bridge.send('VKWebAppGetUserInfo')
  } catch (_error) {
    return null
  }
}

const resolveInsets = async (): Promise<ResolvedInsets> => {
  const safeOverrides = readInsetOverrides('vk')
  const contentOverrides = readInsetOverrides('vkContent')
  const baseInsets = toInsets()

  try {
    const config = await bridge.send('VKWebAppGetConfig')
    const payload = config as ParentConfigData
    const bridgeInsets = 'insets' in payload && payload.insets ? toInsets(payload.insets) : baseInsets
    const safeAreaInset = hasInsetsOverride(safeOverrides)
      ? mergeInsets(bridgeInsets, safeOverrides)
      : bridgeInsets
    const contentSafeAreaInset = hasInsetsOverride(contentOverrides)
      ? mergeInsets(safeAreaInset, contentOverrides)
      : safeAreaInset
    return { safeAreaInset, contentSafeAreaInset }
  } catch (_error) {
    const safeAreaInset = hasInsetsOverride(safeOverrides)
      ? mergeInsets(baseInsets, safeOverrides)
      : baseInsets
    const contentSafeAreaInset = hasInsetsOverride(contentOverrides)
      ? mergeInsets(safeAreaInset, contentOverrides)
      : safeAreaInset
    return { safeAreaInset, contentSafeAreaInset }
  }
}

const buildTelegramLikeUser = (
  launchParams: LaunchParams,
  userInfo: UserInfo | null
) => {
  const id = userInfo?.id ?? launchParams.vkUserId
  if (typeof id !== 'number' || id <= 0) return undefined
  return {
    id,
    first_name: userInfo?.first_name,
    last_name: userInfo?.last_name,
    username: '',
    language_code: launchParams.vkLanguage || undefined,
    photo_url: userInfo?.photo_max_orig ?? userInfo?.photo_200 ?? userInfo?.photo_100,
  }
}

const impactStyleMap: Record<'light' | 'medium' | 'heavy' | 'rigid' | 'soft', 'light' | 'medium' | 'heavy'> = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
  rigid: 'heavy',
  soft: 'light',
}

const setupVkShim = async () => {
  window.__vkBridgeCleanup?.()
  window.__vkLaunchParams = collectVkLaunchParams()

  try {
    await bridge.send('VKWebAppInit')
  } catch (_error) {
    // ignore bridge init errors, fallback behavior is still usable
  }

  const [launchParams, userInfo, initialInsets] = await Promise.all([
    resolveLaunchParams(),
    resolveUserInfo(),
    resolveInsets(),
  ])
  const telegramUser = buildTelegramLikeUser(launchParams, userInfo)
  const startParam =
    readParam('startapp').trim() ||
    readParam('start').trim() ||
    undefined
  let safeAreaInset = initialInsets.safeAreaInset
  let contentSafeAreaInset = initialInsets.contentSafeAreaInset
  applySafeAreaVars(safeAreaInset, contentSafeAreaInset)

  const listeners = new Map<string, Set<EventCallback>>()
  const emit = (eventType: string) => {
    const callbacks = listeners.get(eventType)
    if (!callbacks) return
    callbacks.forEach((callback) => {
      try {
        callback()
      } catch (error) {
        console.error('MiniApp VK shim callback failed:', error)
      }
    })
  }

  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const webApp: TelegramWebApp = {
    ready: () => {},
    expand: () => {},
    close: () => {
      void bridge.send('VKWebAppClose', { status: 'success' }).catch(() => {})
    },
    requestFullscreen: () => {},
    disableVerticalSwipes: () => {
      void bridge.send('VKWebAppDisableSwipeBack').catch(() => {})
    },
    openLink: (url) => {
      openExternal(url)
    },
    openTelegramLink: (url) => {
      openExternal(url)
    },
    platform: launchParams.vkPlatform || 'vk',
    colorScheme: 'light',
    isExpanded: true,
    isFullscreen: true,
    initDataUnsafe: {
      ...(telegramUser ? { user: telegramUser } : {}),
      ...(startParam ? { start_param: startParam } : {}),
    },
    safeAreaInset,
    contentSafeAreaInset,
    HapticFeedback: {
      impactOccurred: (style) => {
        void bridge
          .send('VKWebAppTapticImpactOccurred', {
            style: impactStyleMap[style] ?? 'light',
          })
          .catch(() => {})
      },
      notificationOccurred: (style) => {
        void bridge
          .send('VKWebAppTapticNotificationOccurred', { type: style })
          .catch(() => {})
      },
      selectionChanged: () => {
        void bridge.send('VKWebAppTapticSelectionChanged').catch(() => {})
      },
    },
    onEvent: (eventType, callback) => {
      const bucket = listeners.get(eventType)
      if (bucket) {
        bucket.add(callback)
      } else {
        listeners.set(eventType, new Set([callback]))
      }
    },
    offEvent: (eventType, callback) => {
      const bucket = listeners.get(eventType)
      if (!bucket) return
      bucket.delete(callback)
      if (bucket.size === 0) {
        listeners.delete(eventType)
      }
    },
  }

  const handleResize = () => {
    emit('viewportChanged')
  }

  const bridgeHandler = (
    event: { detail: { type: string; data: ParentConfigData | { insets: Insets } } }
  ) => {
    if (event.detail.type === 'VKWebAppUpdateInsets') {
      safeAreaInset = toInsets((event.detail.data as { insets?: Insets }).insets)
      contentSafeAreaInset = safeAreaInset
      webApp.safeAreaInset = safeAreaInset
      webApp.contentSafeAreaInset = contentSafeAreaInset
      applySafeAreaVars(safeAreaInset, contentSafeAreaInset)
      emit('safeAreaChanged')
      emit('contentSafeAreaChanged')
      emit('viewportChanged')
      return
    }
    if (event.detail.type === 'VKWebAppUpdateConfig') {
      const data = event.detail.data as ParentConfigData
      if ('insets' in data && data.insets) {
        safeAreaInset = toInsets(data.insets)
        contentSafeAreaInset = safeAreaInset
        webApp.safeAreaInset = safeAreaInset
        webApp.contentSafeAreaInset = contentSafeAreaInset
        applySafeAreaVars(safeAreaInset, contentSafeAreaInset)
        emit('safeAreaChanged')
        emit('contentSafeAreaChanged')
        emit('viewportChanged')
      }
    }
  }

  bridge.subscribe(bridgeHandler as never)
  window.addEventListener('resize', handleResize)

  window.__vkBridgeCleanup = () => {
    bridge.unsubscribe(bridgeHandler as never)
    window.removeEventListener('resize', handleResize)
  }

  window.Telegram = {
    ...(window.Telegram ?? {}),
    WebApp: webApp,
  }
}

const setupMaxShim = async () => {
  window.__maxBridgeCleanup?.()
  window.__maxLaunchParams = collectMaxLaunchParams()

  const launchParams = window.__maxLaunchParams as MaxLaunchParamsPayload
  const initData = resolveMaxInitData()
  const decodedParams = new URLSearchParams(initData)
  const telegramUser = parseMaxInitDataUser(initData)
  const startParam =
    decodedParams.get('start_param')?.trim() ||
    launchParams.startapp?.trim() ||
    launchParams.start?.trim() ||
    readParam('startapp').trim() ||
    readParam('start').trim() ||
    undefined
  const safeAreaInset = {
    top: readInsetOverride('maxTopInset', 0, 96) ?? 0,
    right: readInsetOverride('maxRightInset', 0, 32) ?? 0,
    bottom: readInsetOverride('maxBottomInset', 0, 96) ?? 0,
    left: readInsetOverride('maxLeftInset', 0, 32) ?? 0,
  }
  const contentSafeAreaInset = {
    top: readInsetOverride('maxContentTopInset', 0, 96) ?? safeAreaInset.top,
    right:
      readInsetOverride('maxContentRightInset', 0, 32) ?? safeAreaInset.right,
    bottom:
      readInsetOverride('maxContentBottomInset', 0, 96) ?? safeAreaInset.bottom,
    left: readInsetOverride('maxContentLeftInset', 0, 32) ?? safeAreaInset.left,
  }
  applySafeAreaVars(safeAreaInset, contentSafeAreaInset)

  const listeners = new Map<string, Set<EventCallback>>()
  const emit = (eventType: string) => {
    const callbacks = listeners.get(eventType)
    if (!callbacks) return
    callbacks.forEach((callback) => {
      try {
        callback()
      } catch (error) {
        console.error('MiniApp MAX shim callback failed:', error)
      }
    })
  }

  const openExternal = (url: string) => {
    if (window.WebApp?.openLink) {
      window.WebApp.openLink(url)
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const requestMaxViewportExpansion = () => {
    // Best-effort: different MAX builds can expose either requestFullscreen or expand.
    window.WebApp?.requestFullscreen?.()
    window.WebApp?.expand?.()
  }

  const webApp: TelegramWebApp = {
    ready: () => {
      window.WebApp?.ready?.()
    },
    expand: () => {
      requestMaxViewportExpansion()
    },
    close: () => {
      window.WebApp?.close?.()
    },
    requestFullscreen: () => {
      requestMaxViewportExpansion()
    },
    disableVerticalSwipes: () => {
      window.WebApp?.disableVerticalSwipes?.()
    },
    openLink: (url) => {
      openExternal(url)
    },
    openTelegramLink: (url) => {
      openExternal(url)
    },
    platform:
      launchParams.WebAppPlatform?.trim() ||
      window.WebApp?.platform ||
      'max',
    colorScheme: 'light',
    isExpanded: true,
    isFullscreen: true,
    initData,
    initDataUnsafe: {
      ...(telegramUser ? { user: telegramUser } : {}),
      ...(startParam ? { start_param: startParam } : {}),
    },
    safeAreaInset,
    contentSafeAreaInset,
    HapticFeedback: {
      impactOccurred: (style) => {
        window.WebApp?.haptics?.impactOccurred?.(style)
      },
      notificationOccurred: (style) => {
        window.WebApp?.haptics?.notificationOccurred?.(style)
      },
      selectionChanged: () => {
        window.WebApp?.haptics?.selectionChanged?.()
      },
    },
    onEvent: (eventType, callback) => {
      const bucket = listeners.get(eventType)
      if (bucket) {
        bucket.add(callback)
      } else {
        listeners.set(eventType, new Set([callback]))
      }
    },
    offEvent: (eventType, callback) => {
      const bucket = listeners.get(eventType)
      if (!bucket) return
      bucket.delete(callback)
      if (bucket.size === 0) {
        listeners.delete(eventType)
      }
    },
  }

  const handleResize = () => {
    emit('viewportChanged')
  }
  window.addEventListener('resize', handleResize)

  window.__maxBridgeCleanup = () => {
    window.removeEventListener('resize', handleResize)
  }

  window.Telegram = {
    ...(window.Telegram ?? {}),
    WebApp: webApp,
  }

  try {
    webApp.ready()
    webApp.expand()
    webApp.requestFullscreen?.()
    webApp.disableVerticalSwipes?.()
  } catch (_error) {
    // ignore: MAX runtime capabilities differ between client versions
  }
}

export const setupMiniAppBridge = async () => {
  const host = detectMiniAppHost()
  setMiniAppHost(host)

  if (host === 'vk') {
    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) return
    await setupVkShim()
    return
  }
  if (host === 'max') {
    await setupMaxShim()
  }
}

export const getVkLaunchParamsForAuth = () => {
  if (typeof window === 'undefined') return {}
  if (window.__vkLaunchParams && typeof window.__vkLaunchParams === 'object') {
    return { ...window.__vkLaunchParams }
  }
  const collected = collectVkLaunchParams()
  window.__vkLaunchParams = collected
  return { ...collected }
}

export const getMaxInitDataForAuth = () => {
  if (typeof window === 'undefined') return ''
  return resolveMaxInitData()
}
