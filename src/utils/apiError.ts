import { parseApiErrorResponse } from './apiClient'

export type ParsedApiError = {
  status: number
  code: string
  message: string
  requestId: string
  contentType: string
  payload: Record<string, unknown> | null
  rawText: string
}

export const parseApiError = async (
  response: Response,
  fallbackCode = 'request_failed'
): Promise<ParsedApiError> => {
  const parsed = await parseApiErrorResponse(response, fallbackCode)
  return {
    status: parsed.status,
    code: parsed.code,
    message: parsed.message,
    requestId: parsed.requestId,
    contentType: parsed.contentType,
    payload: parsed.payload,
    rawText: parsed.rawText,
  }
}
