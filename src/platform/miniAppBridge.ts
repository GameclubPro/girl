import bridge, { type Insets, type ParentConfigData, type UserInfo } from '@vkontakte/vk-bridge'
import { detectMiniAppHost, setMiniAppHost } from './miniAppHost'

type EventCallback = (...args: unknown[]) => void

type LaunchParams = {
  vkUserId: number | null
  vkRef: string
  vkLanguage: string
  vkPlatform: string
}

const VK_APP_USER_ID_REGEX = /^\d+$/
const BRIDGE_INIT_TIMEOUT_MS = 2200
const BRIDGE_REQUEST_TIMEOUT_MS = 1800

type VkLaunchParamsPayload = {
  vk_user_id?: number | string | null
  vk_ref?: string | null
  vk_language?: string | null
  vk_platform?: string | null
}

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('bridge_timeout'))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })

const bridgeSendSafe = async <T>(
  method: string,
  payload?: Record<string, unknown>,
  timeoutMs = BRIDGE_REQUEST_TIMEOUT_MS
) => {
  try {
    const request = payload
      ? bridge.send(method as never, payload as never)
      : bridge.send(method as never)
    return await withTimeout(request as Promise<T>, timeoutMs)
  } catch (_error) {
    return null
  }
}

const toInsets = (value?: Partial<Insets> | null): TelegramInsets => ({
  top: Number.isFinite(Number(value?.top)) ? Number(value?.top) : 0,
  right: Number.isFinite(Number(value?.right)) ? Number(value?.right) : 0,
  bottom: Number.isFinite(Number(value?.bottom)) ? Number(value?.bottom) : 0,
  left: Number.isFinite(Number(value?.left)) ? Number(value?.left) : 0,
})

const applySafeAreaVars = (insets: TelegramInsets) => {
  const root = document.documentElement
  root.style.setProperty('--tg-safe-top-js', `${insets.top}px`)
  root.style.setProperty('--tg-content-safe-top-js', `${insets.top}px`)
  root.style.setProperty('--tg-safe-bottom-js', `${insets.bottom}px`)
  root.style.setProperty('--tg-content-safe-bottom-js', `${insets.bottom}px`)
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
  const params = await bridgeSendSafe<VkLaunchParamsPayload>(
    'VKWebAppGetLaunchParams',
    undefined,
    BRIDGE_REQUEST_TIMEOUT_MS
  )
  if (params) {
    return {
      vkUserId: parseVkUserIdUnsafe(params.vk_user_id),
      vkRef: typeof params.vk_ref === 'string' ? params.vk_ref : '',
      vkLanguage: typeof params.vk_language === 'string' ? params.vk_language : '',
      vkPlatform: typeof params.vk_platform === 'string' ? params.vk_platform : '',
    }
  }
  return {
    vkUserId: parseVkUserId(readParam('vk_user_id')),
    vkRef: readParam('vk_ref'),
    vkLanguage: readParam('vk_language'),
    vkPlatform: readParam('vk_platform'),
  }
}

const resolveUserInfo = async () => {
  const data = await bridgeSendSafe<UserInfo>('VKWebAppGetUserInfo')
  return data
}

const resolveInsets = async () => {
  const config = await bridgeSendSafe<ParentConfigData>(
    'VKWebAppGetConfig',
    undefined,
    BRIDGE_REQUEST_TIMEOUT_MS
  )
  if (config && 'insets' in config && config.insets) {
    return toInsets(config.insets)
  }
  return toInsets()
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

  await bridgeSendSafe('VKWebAppInit', undefined, BRIDGE_INIT_TIMEOUT_MS)

  const [launchParams, userInfo, initialInsets] = await Promise.all([
    resolveLaunchParams(),
    resolveUserInfo(),
    resolveInsets(),
  ])
  const telegramUser = buildTelegramLikeUser(launchParams, userInfo)
  const startParam =
    readParam('startapp').trim() ||
    readParam('start').trim() ||
    launchParams.vkRef.trim() ||
    undefined
  let safeAreaInset = initialInsets
  applySafeAreaVars(safeAreaInset)

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
    contentSafeAreaInset: safeAreaInset,
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
      webApp.safeAreaInset = safeAreaInset
      webApp.contentSafeAreaInset = safeAreaInset
      applySafeAreaVars(safeAreaInset)
      emit('safeAreaChanged')
      emit('contentSafeAreaChanged')
      emit('viewportChanged')
      return
    }
    if (event.detail.type === 'VKWebAppUpdateConfig') {
      const data = event.detail.data as ParentConfigData
      if ('insets' in data && data.insets) {
        safeAreaInset = toInsets(data.insets)
        webApp.safeAreaInset = safeAreaInset
        webApp.contentSafeAreaInset = safeAreaInset
        applySafeAreaVars(safeAreaInset)
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

export const setupMiniAppBridge = async () => {
  const host = detectMiniAppHost()
  setMiniAppHost(host)

  if (host !== 'vk') return
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) return

  await setupVkShim()
}
