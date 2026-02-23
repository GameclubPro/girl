export type MiniAppHost = 'telegram' | 'vk' | 'max' | 'web'

const VK_PARAM_PREFIX = 'vk_'
const MAX_PARAM_KEYS = new Set([
  'webappdata',
  'webappversion',
  'webappplatform',
  'maxemu',
])

const isMiniAppHost = (value: unknown): value is MiniAppHost =>
  value === 'telegram' || value === 'vk' || value === 'max' || value === 'web'

const getHashParams = () => {
  const rawHash = window.location.hash.replace(/^#\/?/, '')
  const hashQuery = rawHash.startsWith('?') ? rawHash.slice(1) : rawHash
  return new URLSearchParams(hashQuery)
}

const hasVkLaunchParams = () => {
  const searchParams = new URLSearchParams(window.location.search)
  const hashParams = getHashParams()
  const hasVkSearch = [...searchParams.keys()].some((key) =>
    key.startsWith(VK_PARAM_PREFIX)
  )
  const hasVkHash = [...hashParams.keys()].some((key) =>
    key.startsWith(VK_PARAM_PREFIX)
  )
  return hasVkSearch || hasVkHash
}

const hasMaxLaunchParams = () => {
  const searchParams = new URLSearchParams(window.location.search)
  const hashParams = getHashParams()
  const hasMaxSearch = [...searchParams.keys()].some((key) =>
    MAX_PARAM_KEYS.has(key.toLowerCase())
  )
  const hasMaxHash = [...hashParams.keys()].some((key) =>
    MAX_PARAM_KEYS.has(key.toLowerCase())
  )
  return hasMaxSearch || hasMaxHash
}

export const detectMiniAppHost = (): MiniAppHost => {
  if (typeof window === 'undefined') return 'web'
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) return 'telegram'
  if (hasVkLaunchParams()) return 'vk'
  if (window.WebApp?.InitData || window.WebApp?.initData || hasMaxLaunchParams()) {
    return 'max'
  }
  return 'web'
}

let activeMiniAppHost: MiniAppHost = 'web'

export const setMiniAppHost = (host: MiniAppHost) => {
  activeMiniAppHost = host
  if (typeof window !== 'undefined') {
    window.__miniAppHost = host
  }
}

export const getMiniAppHost = (): MiniAppHost => {
  if (typeof window === 'undefined') return 'web'
  if (isMiniAppHost(window.__miniAppHost)) {
    return window.__miniAppHost
  }
  if (activeMiniAppHost !== 'web') {
    return activeMiniAppHost
  }
  const detected = detectMiniAppHost()
  setMiniAppHost(detected)
  return detected
}
