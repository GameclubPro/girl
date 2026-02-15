export type ParsedApiError = {
  status: number
  code: string
  message: string
  contentType: string
  payload: Record<string, unknown> | null
  rawText: string
}

const normalizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

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

export const parseApiError = async (
  response: Response,
  fallbackCode = 'request_failed'
): Promise<ParsedApiError> => {
  const status = Number(response.status) || 0
  const contentType = normalizeText(response.headers.get('content-type')).toLowerCase()
  const rawText = await response.text().catch(() => '')
  const payload =
    contentType.includes('application/json') || rawText.trim().startsWith('{')
      ? parseJsonPayload(rawText)
      : null

  const payloadCode =
    normalizeText(payload?.error) || normalizeText(payload?.code) || normalizeText(payload?.type)
  const payloadMessage =
    normalizeText(payload?.message) ||
    normalizeText(payload?.errorMessage) ||
    normalizeText(payload?.detail)
  const code = payloadCode || (status > 0 ? `http_${status}` : fallbackCode)
  const message = payloadMessage || messageByStatus(status)

  return {
    status,
    code,
    message,
    contentType,
    payload,
    rawText,
  }
}
