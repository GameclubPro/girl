import type { ClientTrust } from '../types/app'
import {
  formatTrustBadgeText,
  getTrustLevelLabel,
  getTrustScoreValue,
  getTrustTone,
  isTrustNew,
} from '../utils/trustScore'

type TrustBadgeProps = {
  trust?: ClientTrust | null
  size?: 'sm' | 'md'
  className?: string
  ariaLabel?: string
}

export const TrustBadge = ({
  trust,
  size = 'sm',
  className,
  ariaLabel,
}: TrustBadgeProps) => {
  const tone = getTrustTone(trust)
  const text = formatTrustBadgeText(trust)
  const score = getTrustScoreValue(trust)
  const levelLabel = getTrustLevelLabel(trust?.confidence ?? 0)
  const defaultLabel = isTrustNew(trust)
    ? 'Новый клиент'
    : `Добросовестность ${score}/100, ${levelLabel}`
  const label = ariaLabel ?? defaultLabel
  const classes = [
    'trust-badge',
    tone,
    `trust-badge--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} aria-label={label} title={label}>
      <span className="trust-badge-dot" aria-hidden="true" />
      <span className="trust-badge-text">{text}</span>
    </span>
  )
}
