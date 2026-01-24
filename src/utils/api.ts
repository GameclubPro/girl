const extractInitDataFromUrl = () => {
  if (typeof window === 'undefined') return ''
  let url: URL
  try {
    url = new URL(window.location.href)
  } catch (error) {
    return ''
  }
  let value = url.searchParams.get('tgWebAppData') ?? ''
  if (!value) {
    const rawHash = url.hash ? url.hash.slice(1) : ''
    if (rawHash) {
      const queryIndex = rawHash.indexOf('?')
      const queryPart = queryIndex >= 0 ? rawHash.slice(queryIndex + 1) : rawHash
      const hashParams = new URLSearchParams(queryPart)
      value = hashParams.get('tgWebAppData') ?? ''
    }
  }
  return value || ''
}

const getTelegramInitData = () => {
  if (typeof window === 'undefined') return ''
  const fromSdk = window.Telegram?.WebApp?.initData ?? ''
  if (fromSdk) return fromSdk
  return extractInitDataFromUrl()
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

const withAuthQuery = (input: string, initData: string) => {
  try {
    const url = new URL(input, window.location.origin)
    if (!url.searchParams.has('auth')) {
      url.searchParams.set('auth', initData)
    }
    return url.toString()
  } catch (error) {
    const joiner = input.includes('?') ? '&' : '?'
    return `${input}${joiner}auth=${encodeURIComponent(initData)}`
  }
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
    const initData = getTelegramInitData()
    const method = (init?.method ??
      (input instanceof Request ? input.method : 'GET')
    ).toUpperCase()
    let nextInput: RequestInfo | URL = input
    if (initData && (method === 'GET' || method === 'HEAD')) {
      if (typeof input === 'string') {
        nextInput = withAuthQuery(input, initData)
      } else if (input instanceof URL) {
        nextInput = withAuthQuery(input.toString(), initData)
      } else if ('url' in input) {
        nextInput = new Request(withAuthQuery(input.url, initData), input)
      }
    }
    const headers = new Headers(init?.headers ?? {})
    const authHeaders = buildAuthHeaders()
    Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value))
    return originalFetch(nextInput, { ...init, headers })
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
