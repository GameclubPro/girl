export type NotifyTone = 'info' | 'success' | 'error'

export type NotifyInput =
  | string
  | {
      message: string
      tone?: NotifyTone
      durationMs?: number
    }

export type NotifyEvent = {
  id: string
  message: string
  tone: NotifyTone
  durationMs: number
}

const listeners = new Set<(event: NotifyEvent) => void>()

const DEFAULT_DURATION_MS = 3200

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const buildNotifyEvent = (input: NotifyInput): NotifyEvent | null => {
  const normalizedInput =
    typeof input === 'string'
      ? { message: input, tone: 'info' as const }
      : {
          message: input?.message ?? '',
          tone: input?.tone ?? 'info',
          durationMs: input?.durationMs,
        }
  const message = normalizeText(normalizedInput.message)
  if (!message) return null
  const tone: NotifyTone =
    normalizedInput.tone === 'success' ||
    normalizedInput.tone === 'error' ||
    normalizedInput.tone === 'info'
      ? normalizedInput.tone
      : 'info'
  const durationMs = Math.max(1500, Number(normalizedInput.durationMs) || DEFAULT_DURATION_MS)
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    tone,
    durationMs,
  }
}

export const subscribeNotify = (listener: (event: NotifyEvent) => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const notify = (input: NotifyInput) => {
  const event = buildNotifyEvent(input)
  if (!event) return
  listeners.forEach((listener) => {
    try {
      listener(event)
    } catch (error) {
      console.error('notify listener failed:', error)
    }
  })
}
