const getTelegramInitData = () => {
  if (typeof window === 'undefined') return ''
  return window.Telegram?.WebApp?.initData ?? ''
}

const buildAuthHeaders = () => {
  const initData = getTelegramInitData()
  if (!initData) return {}
  return {
    Authorization: `tma ${initData}`,
    'X-Telegram-Init-Data': initData,
  }
}

const shouldAttachAuth = (input: RequestInfo | URL, apiBase?: string) => {
  if (typeof input === 'string') {
    if (input.startsWith('/')) return true
    if (apiBase && input.startsWith(apiBase)) return true
    return false
  }
  if ('url' in input) {
    return shouldAttachAuth(input.url, apiBase)
  }
  return false
}

export const installAuthFetch = (apiBase?: string) => {
  if (typeof window === 'undefined') return
  if ((window as unknown as { __authFetchInstalled?: boolean }).__authFetchInstalled) {
    return
  }
  const normalizedBase = apiBase?.trim().replace(/\/$/, '') ?? ''
  const originalFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!shouldAttachAuth(input, normalizedBase)) {
      return originalFetch(input, init)
    }
    const headers = new Headers(init?.headers ?? {})
    const authHeaders = buildAuthHeaders()
    Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value))
    return originalFetch(input, { ...init, headers })
  }
  ;(window as unknown as { __authFetchInstalled?: boolean }).__authFetchInstalled = true
}

export const buildAuthQuery = () => {
  const initData = getTelegramInitData()
  if (!initData) return ''
  const params = new URLSearchParams()
  params.set('auth', initData)
  return params.toString()
}

export const getAuthInitData = () => getTelegramInitData()
