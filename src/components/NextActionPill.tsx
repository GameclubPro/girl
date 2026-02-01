import type { NextAction } from '../types/app'

type NextActionPillProps = {
  action?: NextAction | null
  compact?: boolean
  className?: string
  onClick?: () => void
  ariaLabel?: string
}

const formatTimeLeft = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const diffMs = parsed.getTime() - Date.now()
  if (diffMs <= 0) return ''
  const minutesTotal = Math.ceil(diffMs / 60000)
  const hours = Math.floor(minutesTotal / 60)
  const minutes = minutesTotal % 60
  if (hours <= 0) return `${minutesTotal} мин`
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`
}

export const NextActionPill = ({
  action,
  compact,
  className = '',
  onClick,
  ariaLabel,
}: NextActionPillProps) => {
  if (!action) return null
  const tone = action.tone ?? 'alert'
  const timeLeft = formatTimeLeft(action.deadlineAt ?? null)
  const timeLeftLabel = timeLeft ? `Осталось ${timeLeft}` : ''
  const subtitleParts = [action.subtitle, timeLeftLabel].filter(Boolean)
  const subtitle = !compact ? subtitleParts.join(' · ') : ''
  const titleText = [action.title, ...subtitleParts].filter(Boolean).join(' · ')
  const isInteractive = typeof onClick === 'function'

  if (isInteractive) {
    return (
      <button
        type="button"
        className={`next-action-pill${compact ? ' is-compact' : ''} is-${tone} is-clickable ${className}`}
        onClick={onClick}
        aria-label={ariaLabel || titleText || action.title}
        title={titleText || undefined}
      >
        <span className="next-action-title">{action.title}</span>
        {subtitle && <span className="next-action-subtitle">{subtitle}</span>}
      </button>
    )
  }

  return (
    <div
      className={`next-action-pill${compact ? ' is-compact' : ''} is-${tone} ${className}`}
      title={titleText || undefined}
    >
      <span className="next-action-title">{action.title}</span>
      {subtitle && <span className="next-action-subtitle">{subtitle}</span>}
    </div>
  )
}
