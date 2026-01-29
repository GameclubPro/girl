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
  variant?: 'compact' | 'label'
  className?: string
  ariaLabel?: string
}

export const TrustBadge = ({
  trust,
  size = 'sm',
  variant = 'compact',
  className,
  ariaLabel,
}: TrustBadgeProps) => {
  const tone = getTrustTone(trust)
  const score = getTrustScoreValue(trust)
  const text =
    variant === 'label'
      ? isTrustNew(trust)
        ? 'Доверие: новый'
        : `Доверие ${score}/100`
      : formatTrustBadgeText(trust)
  const levelLabel = getTrustLevelLabel(trust?.confidence ?? 0)
  const defaultLabel = isTrustNew(trust)
    ? 'Новый клиент'
    : `Добросовестность ${score}/100, ${levelLabel}`
  const label = ariaLabel ?? defaultLabel
  const classes = [
    'trust-badge',
    tone,
    `trust-badge--${size}`,
    variant === 'label' ? 'trust-badge--label' : '',
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
