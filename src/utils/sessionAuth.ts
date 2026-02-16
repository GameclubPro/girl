type SessionAuthPayload = {
  token: string
  expiresAt: string | null
}

const STORAGE_KEY = 'kiven:session-auth:v1'

const normalizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const nowMs = () => Date.now()

const parseExpiresAtMs = (value: string | null) => {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const readStoredSession = (): SessionAuthPayload | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown }
    const token = normalizeText(parsed?.token)
    const expiresAt = normalizeText(parsed?.expiresAt) || null
    if (!token) return null
    if (expiresAt && parseExpiresAtMs(expiresAt) > 0 && parseExpiresAtMs(expiresAt) <= nowMs()) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return { token, expiresAt }
  } catch (_error) {
    return null
  }
}

export const setSessionAuth = (token: string, expiresAt: string | null = null) => {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken || typeof window === 'undefined') return
  try {
    const payload: SessionAuthPayload = {
      token: normalizedToken,
      expiresAt: normalizeText(expiresAt) || null,
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (_error) {
    // ignore storage failures in constrained webviews
  }
}

export const clearSessionAuth = () => {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch (_error) {
    // ignore storage failures in constrained webviews
  }
}

export const getSessionAuth = () => readStoredSession()

export const getSessionToken = () => readStoredSession()?.token ?? ''

export const getSessionAuthHeader = () => {
  const token = getSessionToken()
  return token ? `Bearer ${token}` : ''
}

export const withSessionAuthHeaders = (headers?: HeadersInit) => {
  const nextHeaders = new Headers(headers ?? {})
  const hasAuthorization = normalizeText(nextHeaders.get('Authorization'))
  if (hasAuthorization) return nextHeaders
  const authHeader = getSessionAuthHeader()
  if (authHeader) {
    nextHeaders.set('Authorization', authHeader)
  }
  return nextHeaders
}
