import type { NextAction } from '../types/app'

type NextActionPillProps = {
  action?: NextAction | null
  compact?: boolean
  className?: string
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
}: NextActionPillProps) => {
  if (!action) return null
  const tone = action.tone ?? 'alert'
  const timeLeft = !compact ? formatTimeLeft(action.deadlineAt ?? null) : ''
  const subtitle = !compact
    ? [action.subtitle, timeLeft ? `Осталось ${timeLeft}` : '']
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <div
      className={`next-action-pill${compact ? ' is-compact' : ''} is-${tone} ${className}`}
    >
      <span className="next-action-title">{action.title}</span>
      {subtitle && <span className="next-action-subtitle">{subtitle}</span>}
    </div>
  )
}
