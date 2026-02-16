import { withSessionAuthHeaders } from './sessionAuth'

type ApiFetchOptions = {
  apiBase?: string
  timeoutMs?: number
  retry?: number
  noAuth?: boolean
  fetchImpl?: typeof fetch
}

export type ApiClientErrorPayload = {
  status: number
  code: string
  error: string
  message: string
  requestId: string
  contentType: string
  payload: Record<string, unknown> | null
  rawText: string
}

export class ApiClientError extends Error {
  status: number

  code: string

  error: string

  requestId: string

  contentType: string

  payload: Record<string, unknown> | null

  rawText: string

  response: Response | null

  constructor(payload: ApiClientErrorPayload, response: Response | null) {
    super(payload.message)
    this.name = 'ApiClientError'
    this.status = payload.status
    this.code = payload.code
    this.error = payload.error
    this.requestId = payload.requestId
    this.contentType = payload.contentType
    this.payload = payload.payload
    this.rawText = payload.rawText
    this.response = response
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const DEFAULT_TIMEOUT_MS = 12_000

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
let configuredApiBase = ''

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
  if (requestUrl.startsWith('/api/')) return true
  if (requestUrl.startsWith(`${normalizedApiBase}/api/`)) return true
  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(requestUrl, window.location.origin)
      if (!parsed.pathname.startsWith('/api/')) return false
      if (!normalizedApiBase) return true
      const apiOrigin = new URL(`${normalizedApiBase}/`, window.location.origin).origin
      return parsed.origin === apiOrigin
    } catch (_error) {
      return false
    }
  }
  return false
}

const parseJsonPayload = (raw: string) => {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch (_error) {
    return null
  }
}

const messageByStatus = (status: number) => {
  if (status === 502 || status === 503) return 'Сервер временно недоступен.'
  if (status === 404 || status === 405) return 'Маршрут API недоступен.'
  if (status > 0) return `Ошибка сервера (HTTP ${status}).`
  return 'Не удалось выполнить запрос.'
}

const readRequestId = (response: Response) =>
  normalizeText(
    response.headers.get('x-request-id') ??
      response.headers.get('x-correlation-id') ??
      response.headers.get('request-id')
  )

export const parseApiErrorResponse = async (
  response: Response,
  fallbackCode = 'request_failed'
): Promise<ApiClientErrorPayload> => {
  const status = Number(response.status) || 0
  const contentType = normalizeText(response.headers.get('content-type')).toLowerCase()
  const rawText = await response.text().catch(() => '')
  const payload =
    contentType.includes('application/json') || rawText.trim().startsWith('{')
      ? parseJsonPayload(rawText)
      : null
  const payloadError = normalizeText(payload?.error)
  const payloadCode =
    normalizeText(payload?.code) || normalizeText(payload?.type) || normalizeText(payload?.reason)
  const payloadMessage =
    normalizeText(payload?.message) ||
    normalizeText(payload?.errorMessage) ||
    normalizeText(payload?.detail)
  const code = payloadCode || payloadError || (status > 0 ? `http_${status}` : fallbackCode)
  const error = payloadError || code
  const message = payloadMessage || messageByStatus(status)
  const requestId = readRequestId(response)
  return {
    status,
    code,
    error,
    message,
    requestId,
    contentType,
    payload,
    rawText,
  }
}

export const toApiClientError = async (
  response: Response,
  fallbackCode = 'request_failed'
) => {
  const parsed = await parseApiErrorResponse(response, fallbackCode)
  return new ApiClientError(parsed, response)
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
    (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch)

  let attempt = 0
  while (true) {
    const shouldAddAuth =
      !options.noAuth &&
      shouldAttachAuth(requestUrl, options.apiBase ?? configuredApiBase)
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

export const configureApiClient = (options: { apiBase: string }) => {
  configuredApiBase = normalizeBase(options.apiBase)
}

export const apiFetchJson = async <T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: ApiFetchOptions & { fallbackCode?: string } = {}
) => {
  const response = await apiFetch(input, init, options)
  if (!response.ok) {
    throw await toApiClientError(response, options.fallbackCode ?? 'request_failed')
  }
  return (await response.json().catch(() => null)) as T
}
