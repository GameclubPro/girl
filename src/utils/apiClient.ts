import { withSessionAuthHeaders } from './sessionAuth'

type ApiFetchOptions = {
  apiBase?: string
  timeoutMs?: number
  retry?: number
  noAuth?: boolean
  fetchImpl?: typeof fetch
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const DEFAULT_TIMEOUT_MS = 12_000

let nativeFetchRef: typeof fetch | null = null
let interceptorInstalled = false
let interceptorApiBase = ''

const normalizeBase = (value: string) => value.trim().replace(/\/$/, '')

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError'

const mergeAbortSignals = (signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  const cleanup = () => {
    window.clearTimeout(timeoutId)
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
  }
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) {
      controller.abort()
    } else {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  }
  return { signal: controller.signal, cleanup }
}

const resolveRequestUrl = (input: RequestInfo | URL) => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

const shouldAttachAuth = (requestUrl: string, apiBase: string) => {
  const normalizedApiBase = normalizeBase(apiBase)
  if (!normalizedApiBase) return false
  if (requestUrl.startsWith('/api/')) return true
  if (requestUrl.startsWith(`${normalizedApiBase}/api/`)) return true
  return false
}

export const apiFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: ApiFetchOptions = {}
) => {
  const requestUrl = resolveRequestUrl(input)
  const method = (init.method ?? 'GET').toUpperCase()
  const retryCount = method === 'GET' ? Math.max(0, options.retry ?? 1) : 0
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const fetchImpl =
    options.fetchImpl ??
    nativeFetchRef ??
    (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch)

  let attempt = 0
  while (true) {
    const shouldAddAuth =
      !options.noAuth && shouldAttachAuth(requestUrl, options.apiBase ?? interceptorApiBase)
    const headers = shouldAddAuth ? withSessionAuthHeaders(init.headers) : init.headers
    const timeout = mergeAbortSignals(init.signal ?? undefined, timeoutMs)
    try {
      const response = await fetchImpl(input, {
        ...init,
        headers,
        signal: timeout.signal,
      })
      timeout.cleanup()
      if (attempt < retryCount && RETRYABLE_STATUS.has(response.status)) {
        attempt += 1
        continue
      }
      return response
    } catch (error) {
      timeout.cleanup()
      if (attempt < retryCount && !isAbortError(error)) {
        attempt += 1
        continue
      }
      throw error
    }
  }
}

export const installApiFetchInterceptor = (apiBase: string) => {
  if (typeof window === 'undefined') return
  interceptorApiBase = normalizeBase(apiBase)
  if (interceptorInstalled) return
  nativeFetchRef = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    apiFetch(input, init, {
      apiBase: interceptorApiBase,
      fetchImpl: nativeFetchRef ?? undefined,
    })) as typeof window.fetch
  interceptorInstalled = true
}

export const uninstallApiFetchInterceptor = () => {
  if (typeof window === 'undefined') return
  if (!interceptorInstalled || !nativeFetchRef) return
  window.fetch = nativeFetchRef
  interceptorInstalled = false
}
