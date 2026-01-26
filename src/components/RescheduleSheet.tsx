import { useEffect, useMemo, useState } from 'react'
import type { Booking } from '../types/app'

const formatDateInputValue = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  const local = new Date(date.getTime() - offsetMs)
  return local.toISOString().slice(0, 10)
}

const formatTimeInputValue = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  const local = new Date(date.getTime() - offsetMs)
  return local.toISOString().slice(11, 16)
}

const buildDateTimeValue = (dateValue: string, timeValue: string) => {
  if (!dateValue || !timeValue) return null
  const composed = new Date(`${dateValue}T${timeValue}:00`)
  if (Number.isNaN(composed.getTime())) return null
  return composed.toISOString()
}

const formatDateTimeLabel = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

type RescheduleSheetProps = {
  isOpen: boolean
  booking: Booking | null
  isProViewer?: boolean
  onClose: () => void
  onSubmit: (payload: { proposedAt: string; note?: string | null }) => void
  isSubmitting?: boolean
  error?: string
}

export const RescheduleSheet = ({
  isOpen,
  booking,
  isProViewer,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: RescheduleSheetProps) => {
  const [dateValue, setDateValue] = useState('')
  const [timeValue, setTimeValue] = useState('')
  const [noteValue, setNoteValue] = useState('')
  const [localError, setLocalError] = useState('')

  const baseTime = useMemo(() => {
    return booking?.rescheduleProposedTime ?? booking?.scheduledAt ?? null
  }, [booking?.rescheduleProposedTime, booking?.scheduledAt])

  useEffect(() => {
    if (!isOpen) return
    const initialDate = baseTime
      ? formatDateInputValue(baseTime)
      : formatDateInputValue(new Date().toISOString())
    const initialTime = baseTime
      ? formatTimeInputValue(baseTime)
      : formatTimeInputValue(new Date().toISOString())
    setDateValue(initialDate)
    setTimeValue(initialTime)
    setNoteValue(booking?.rescheduleNote ?? '')
    setLocalError('')
  }, [baseTime, booking?.rescheduleNote, isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (error) {
      setLocalError(error)
    }
  }, [error, isOpen])

  if (!isOpen || !booking) return null

  const currentLabel = formatDateTimeLabel(booking.scheduledAt)
  const proposedLabel = formatDateTimeLabel(booking.rescheduleProposedTime)
  const submitLabel = isProViewer ? 'Предложить перенос' : 'Предложить перенос'

  const handleQuickShift = (days: number) => {
    if (!dateValue) return
    const base = new Date(`${dateValue}T${timeValue || '12:00'}:00`)
    if (Number.isNaN(base.getTime())) return
    const next = new Date(base)
    next.setDate(base.getDate() + days)
    setDateValue(formatDateInputValue(next.toISOString()))
  }

  const handleSubmit = () => {
    setLocalError('')
    const proposedAt = buildDateTimeValue(dateValue, timeValue)
    if (!proposedAt) {
      setLocalError('Выберите дату и время.')
      return
    }
    onSubmit({ proposedAt, note: noteValue.trim() || null })
  }

  return (
    <div
      className="reschedule-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-sheet-title"
      onClick={onClose}
    >
      <div
        className="reschedule-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="reschedule-sheet-handle" aria-hidden="true" />
        <div className="reschedule-sheet-head">
          <div>
            <p className="reschedule-sheet-kicker">
              {isProViewer ? 'Предложение клиенту' : 'Перенос записи'}
            </p>
            <h3 className="reschedule-sheet-title" id="reschedule-sheet-title">
              Новая дата и время
            </h3>
            {currentLabel && (
              <p className="reschedule-sheet-subtitle">
                Текущее время: {currentLabel}
              </p>
            )}
            {proposedLabel && (
              <p className="reschedule-sheet-subtitle is-accent">
                Уже предложено: {proposedLabel}
              </p>
            )}
          </div>
          <button
            className="reschedule-sheet-close"
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="reschedule-sheet-body">
          <div className="reschedule-input-row">
            <label className="reschedule-input-label" htmlFor="reschedule-date">
              Дата
            </label>
            <input
              id="reschedule-date"
              className="reschedule-input"
              type="date"
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
            />
          </div>
          <div className="reschedule-input-row">
            <label className="reschedule-input-label" htmlFor="reschedule-time">
              Время
            </label>
            <input
              id="reschedule-time"
              className="reschedule-input"
              type="time"
              value={timeValue}
              onChange={(event) => setTimeValue(event.target.value)}
            />
          </div>
          <div className="reschedule-quick">
            <button
              className="reschedule-quick-action"
              type="button"
              onClick={() => handleQuickShift(1)}
            >
              Завтра
            </button>
            <button
              className="reschedule-quick-action"
              type="button"
              onClick={() => handleQuickShift(7)}
            >
              Через неделю
            </button>
          </div>
          <label className="reschedule-input-label" htmlFor="reschedule-note">
            Комментарий
          </label>
          <textarea
            id="reschedule-note"
            className="reschedule-note"
            placeholder="Например, могу только во второй половине дня"
            value={noteValue}
            onChange={(event) => setNoteValue(event.target.value)}
            rows={3}
          />
          {localError && (
            <p className="reschedule-error" role="alert">
              {localError}
            </p>
          )}
        </div>
        <div className="reschedule-sheet-actions">
          <button
            className="reschedule-secondary"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Отмена
          </button>
          <button
            className="reschedule-primary"
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Отправляем...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
