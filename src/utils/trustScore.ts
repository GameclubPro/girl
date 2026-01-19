import type { ClientTrust } from '../types/app'

export type TrustLevel = 'new' | 'medium' | 'high'

const TRUST_BASE_SCORE = 60
const TRUST_CONFIDENCE_THRESHOLDS = { new: 0.35, medium: 0.7 }
const TRUST_SCORE_THRESHOLDS = { low: 45, high: 70 }

const trustEventLabelMap: Record<string, string> = {
  booking_confirmed: 'Подтвержденные записи',
  booking_completed: 'Завершенные визиты',
  'client_cancel_>24h': 'Отмена заранее',
  'client_cancel_<24h': 'Отмена в последний момент',
  client_no_show: 'Неявка без предупреждения',
  request_response_accept: 'Принятые предложения',
  client_decline_price: 'Отказ от цены',
  profile_complete: 'Заполненный профиль',
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const resolveTrustLevel = (confidence?: number | null): TrustLevel => {
  const safe = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0
  if (safe < TRUST_CONFIDENCE_THRESHOLDS.new) return 'new'
  if (safe <= TRUST_CONFIDENCE_THRESHOLDS.medium) return 'medium'
  return 'high'
}

export const getTrustLevelLabel = (confidence?: number | null) => {
  const level = resolveTrustLevel(confidence)
  if (level === 'new') return 'Новый'
  if (level === 'medium') return 'Средняя уверенность'
  return 'Высокая уверенность'
}

export const getTrustLevelShortLabel = (confidence?: number | null) => {
  const level = resolveTrustLevel(confidence)
  if (level === 'new') return 'Новый'
  if (level === 'medium') return 'Средняя'
  return 'Высокая'
}

export const getTrustScoreValue = (trust?: ClientTrust | null) => {
  const score =
    typeof trust?.score === 'number' && Number.isFinite(trust.score)
      ? trust.score
      : TRUST_BASE_SCORE
  return clamp(score, 0, 100)
}

export const isTrustNew = (trust?: ClientTrust | null) =>
  resolveTrustLevel(trust?.confidence ?? 0) === 'new'

export const getTrustTone = (trust?: ClientTrust | null) => {
  if (isTrustNew(trust)) return 'is-new'
  const score = getTrustScoreValue(trust)
  if (score < TRUST_SCORE_THRESHOLDS.low) return 'is-low'
  if (score < TRUST_SCORE_THRESHOLDS.high) return 'is-mid'
  return 'is-high'
}

export const formatTrustScoreLabel = (trust?: ClientTrust | null) => {
  const score = getTrustScoreValue(trust)
  return `${score}/100`
}

export const formatTrustBadgeText = (trust?: ClientTrust | null) => {
  if (isTrustNew(trust)) return 'Новый'
  const score = getTrustScoreValue(trust)
  const label = getTrustLevelShortLabel(trust?.confidence ?? 0)
  return `${score} · ${label}`
}

export const formatTrustConfidence = (trust?: ClientTrust | null) => {
  const confidence =
    typeof trust?.confidence === 'number' && Number.isFinite(trust.confidence)
      ? trust.confidence
      : 0
  return `${Math.round(confidence * 100)}%`
}

export const getTrustReasonLabel = (eventType: string) =>
  trustEventLabelMap[eventType] ?? eventType

export const formatTrustReasonValue = (value: number) => {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded}`
}

export const buildTrustTips = (trust?: ClientTrust | null) => {
  const tips: string[] = []
  const negativeTypes = new Set(
    trust?.reasons?.negative?.map((item) => item.eventType) ?? []
  )
  const positiveTypes = new Set(
    trust?.reasons?.positive?.map((item) => item.eventType) ?? []
  )

  if (negativeTypes.has('client_no_show')) {
    tips.push('Не пропускайте запись без предупреждения.')
  }
  if (negativeTypes.has('client_cancel_<24h')) {
    tips.push('Отменяйте минимум за 24 часа.')
  }
  if (negativeTypes.has('client_cancel_>24h')) {
    tips.push('Планируйте визиты заранее, чтобы не отменять.')
  }
  if (negativeTypes.has('client_decline_price')) {
    tips.push('Согласуйте бюджет до подтверждения.')
  }
  if (!positiveTypes.has('profile_complete')) {
    tips.push('Добавьте адрес и включите геолокацию.')
  }
  if (
    !positiveTypes.has('booking_completed') &&
    !positiveTypes.has('booking_confirmed')
  ) {
    tips.push('Подтверждайте записи и приходите вовремя.')
  }
  if (resolveTrustLevel(trust?.confidence ?? 0) === 'new') {
    tips.push('Сделайте несколько визитов, чтобы повысить уверенность.')
  }

  const uniqueTips = Array.from(new Set(tips))
  return uniqueTips.slice(0, 3)
}

export const getTrustMarkerPosition = (trust?: ClientTrust | null) =>
  `${getTrustScoreValue(trust)}%`
