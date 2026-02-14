export type MiniAppHost = 'telegram' | 'vk' | 'web'

const VK_PARAM_PREFIX = 'vk_'

const isMiniAppHost = (value: unknown): value is MiniAppHost =>
  value === 'telegram' || value === 'vk' || value === 'web'

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

export const detectMiniAppHost = (): MiniAppHost => {
  if (typeof window === 'undefined') return 'web'
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) return 'telegram'
  if (hasVkLaunchParams()) return 'vk'
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

