import { useEffect, useMemo, useRef, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import type { Booking, ProProfileSection, ServiceRequest } from '../types/app'
import { buildBookingStartParam } from '../utils/deeplink'

type ProCabinetScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onEditProfile: (section?: ProProfileSection) => void
  onViewRequests: () => void
  onViewChats: () => void
}

type CalendarFilter = 'all' | 'bookings' | 'requests'

type CalendarItem = {
  id: string
  type: 'booking' | 'request'
  date: Date
  dateKey: string
  title: string
  subtitle: string
  timeLabel: string
  statusLabel: string
  statusTone: 'is-waiting' | 'is-warning' | 'is-confirmed' | 'is-muted'
}

const bookingStatusLabelMap: Record<Booking['status'], string> = {
  pending: 'Новая',
  price_pending: 'Ожидает цены',
  price_proposed: 'Цена предложена',
  confirmed: 'Подтверждена',
  declined: 'Отклонена',
  cancelled: 'Отменена',
}

const bookingStatusToneMap: Record<Booking['status'], CalendarItem['statusTone']> =
  {
    pending: 'is-waiting',
    price_pending: 'is-waiting',
    price_proposed: 'is-warning',
    confirmed: 'is-confirmed',
    declined: 'is-muted',
    cancelled: 'is-muted',
  }

const requestStatusLabelMap: Record<ServiceRequest['status'], string> = {
  open: 'Новая заявка',
  closed: 'Закрыта',
}

const requestStatusToneMap: Record<
  ServiceRequest['status'],
  CalendarItem['statusTone']
> = {
  open: 'is-waiting',
  closed: 'is-muted',
}

const weekDayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const startOfWeek = (date: Date) => {
  const next = new Date(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  next.setHours(0, 0, 0, 0)
  return next
}

const toDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatTime = (date: Date) =>
  date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

const formatRangeLabel = (start: Date, end: Date) => {
  const startLabel = start.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
  const endLabel = end.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
  return `${startLabel} — ${endLabel}`
}

const formatMonthLabel = (date: Date) => {
  const label = date.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const parseDate = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

const resolveRequestDate = (request: ServiceRequest) => {
  const directDate = parseDate(request.dateTime)
  if (directDate) return directDate
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (request.dateOption === 'tomorrow') {
    return addDays(today, 1)
  }
  if (request.dateOption === 'today') {
    return today
  }
  return parseDate(request.createdAt) ?? today
}

const buildShareLink = (base: string, startParam: string) => {
  const trimmedBase = base.trim()
  const trimmedParam = startParam.trim()
  if (!trimmedBase || !trimmedParam) return ''
  const encodedParam = encodeURIComponent(trimmedParam)
  if (/startapp=/i.test(trimmedBase)) {
    return trimmedBase.replace(/startapp=[^&]*/i, `startapp=${encodedParam}`)
  }
  const joiner = trimmedBase.includes('?') ? '&' : '?'
  return `${trimmedBase}${joiner}startapp=${encodedParam}`
}

const buildTelegramShareUrl = (link: string, text: string) => {
  const params = new URLSearchParams()
  params.set('url', link)
  if (text.trim()) {
    params.set('text', text)
  }
  return `https://t.me/share/url?${params.toString()}`
}

export const ProCabinetScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onEditProfile,
  onViewRequests,
  onViewChats,
}: ProCabinetScreenProps) => {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [requestsError, setRequestsError] = useState('')
  const [bookingsError, setBookingsError] = useState('')
  const [isRequestsLoading, setIsRequestsLoading] = useState(false)
  const [isBookingsLoading, setIsBookingsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>('all')
  const [weekStartDate, setWeekStartDate] = useState(() =>
    startOfWeek(new Date())
  )
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  })
  const [shareStatus, setShareStatus] = useState('')
  const shareTimerRef = useRef<number | null>(null)
  const displayName = displayNameFallback.trim()
  const isLoading = isRequestsLoading || isBookingsLoading
  const combinedError = requestsError || bookingsError
  const shareBase = (import.meta.env.VITE_TG_APP_URL ?? '').trim()
  const shareConfigured = Boolean(shareBase)
  const bookingStartParam = useMemo(
    () => buildBookingStartParam(userId),
    [userId]
  )
  const shareLink = useMemo(
    () => (shareBase ? buildShareLink(shareBase, bookingStartParam) : ''),
    [bookingStartParam, shareBase]
  )
  const shareText = displayName
    ? `Запись к мастеру ${displayName}\nОткройте ссылку, чтобы выбрать услугу и время.`
    : 'Запись к мастеру\nОткройте ссылку, чтобы выбрать услугу и время.'
  const shareUrl = shareLink ? buildTelegramShareUrl(shareLink, shareText) : ''

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadRequests = async () => {
      setIsRequestsLoading(true)
      setRequestsError('')
      try {
        const response = await fetch(
          `${apiBase}/api/pro/requests?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load requests failed')
        }
        const data = (await response.json().catch(() => null)) as
          | ServiceRequest[]
          | { requests?: ServiceRequest[] }
          | null
        const items = Array.isArray(data) ? data : data?.requests ?? []
        if (!cancelled) {
          setRequests(items)
          setLastUpdated(new Date())
        }
      } catch (error) {
        if (!cancelled) {
          setRequestsError('Не удалось загрузить заявки.')
        }
      } finally {
        if (!cancelled) {
          setIsRequestsLoading(false)
        }
      }
    }

    const loadBookings = async () => {
      setIsBookingsLoading(true)
      setBookingsError('')
      try {
        const response = await fetch(
          `${apiBase}/api/pro/bookings?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load bookings failed')
        }
        const data = (await response.json().catch(() => null)) as Booking[] | null
        if (!cancelled) {
          setBookings(Array.isArray(data) ? data : [])
          setLastUpdated(new Date())
        }
      } catch (error) {
        if (!cancelled) {
          setBookingsError('Не удалось загрузить записи.')
        }
      } finally {
        if (!cancelled) {
          setIsBookingsLoading(false)
        }
      }
    }

    void loadRequests()
    void loadBookings()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  useEffect(() => {
    return () => {
      if (shareTimerRef.current) {
        window.clearTimeout(shareTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const weekEnd = addDays(weekStartDate, 6)
    if (selectedDate < weekStartDate || selectedDate > weekEnd) {
      setSelectedDate(weekStartDate)
    }
  }, [selectedDate, weekStartDate])

  const calendarItems = useMemo(() => {
    const items: CalendarItem[] = []

    bookings.forEach((booking) => {
      const date = parseDate(booking.scheduledAt)
      if (!date) return
      const dateKey = toDateKey(date)
      items.push({
        id: `booking-${booking.id}`,
        type: 'booking',
        date,
        dateKey,
        title: booking.serviceName,
        subtitle: `${booking.clientName ?? 'Клиент'} · ${
          booking.locationType === 'client' ? 'У клиента' : 'У мастера'
        }`,
        timeLabel: formatTime(date),
        statusLabel: bookingStatusLabelMap[booking.status] ?? 'Запись',
        statusTone: bookingStatusToneMap[booking.status] ?? 'is-waiting',
      })
    })

    requests.forEach((request) => {
      const date = resolveRequestDate(request)
      const dateKey = toDateKey(date)
      const timeLabel = request.dateTime ? formatTime(date) : 'В течение дня'
      items.push({
        id: `request-${request.id}`,
        type: 'request',
        date,
        dateKey,
        title: request.serviceName,
        subtitle: `Заявка · ${
          request.locationType === 'client'
            ? 'У клиента'
            : request.locationType === 'master'
              ? 'У мастера'
              : 'Гибкий формат'
        }`,
        timeLabel,
        statusLabel: requestStatusLabelMap[request.status] ?? 'Заявка',
        statusTone: requestStatusToneMap[request.status] ?? 'is-waiting',
      })
    })

    return items.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [bookings, requests])

  const countsByDate = useMemo(() => {
    const map = new Map<string, { booking: number; request: number }>()
    calendarItems.forEach((item) => {
      const current = map.get(item.dateKey) ?? { booking: 0, request: 0 }
      if (item.type === 'booking') {
        current.booking += 1
      } else {
        current.request += 1
      }
      map.set(item.dateKey, current)
    })
    return map
  }, [calendarItems])

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)),
    [weekStartDate]
  )
  const weekEnd = useMemo(() => addDays(weekStartDate, 6), [weekStartDate])
  const weekRangeLabel = useMemo(
    () => formatRangeLabel(weekStartDate, weekEnd),
    [weekStartDate, weekEnd]
  )
  const monthLabel = useMemo(() => formatMonthLabel(weekStartDate), [weekStartDate])
  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate])
  const todayKey = useMemo(() => toDateKey(new Date()), [])

  const filteredItems = useMemo(() => {
    if (calendarFilter === 'bookings') {
      return calendarItems.filter((item) => item.type === 'booking')
    }
    if (calendarFilter === 'requests') {
      return calendarItems.filter((item) => item.type === 'request')
    }
    return calendarItems
  }, [calendarFilter, calendarItems])

  const selectedItems = useMemo(
    () => filteredItems.filter((item) => item.dateKey === selectedDateKey),
    [filteredItems, selectedDateKey]
  )

  const selectedCounts = countsByDate.get(selectedDateKey) ?? {
    booking: 0,
    request: 0,
  }

  const lastUpdatedLabel = lastUpdated
    ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''

  const setShareMessage = (message: string) => {
    setShareStatus(message)
    if (shareTimerRef.current) {
      window.clearTimeout(shareTimerRef.current)
    }
    shareTimerRef.current = window.setTimeout(() => {
      setShareStatus('')
    }, 2400)
  }

  const handleCopyLink = async () => {
    if (!shareLink) {
      setShareMessage('Ссылка пока недоступна.')
      return
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = shareLink
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const success = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!success) {
          throw new Error('Copy failed')
        }
      }
      setShareMessage('Ссылка скопирована.')
    } catch (error) {
      setShareMessage('Не удалось скопировать ссылку.')
    }
  }

  const handleSendLink = () => {
    if (!shareLink) {
      setShareMessage('Ссылка пока недоступна.')
      return
    }
    if (!shareConfigured) {
      setShareMessage('Добавьте VITE_TG_APP_URL, чтобы открыть Telegram.')
      return
    }
    const webApp = window.Telegram?.WebApp
    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(shareUrl)
    } else if (webApp?.openLink) {
      webApp.openLink(shareUrl)
    } else {
      window.open(shareUrl, '_blank', 'noopener,noreferrer')
    }
    if (webApp?.close) {
      window.setTimeout(() => webApp.close?.(), 250)
    }
    setShareMessage('Открываем личку...')
  }

  return (
    <div className="screen screen--pro screen--pro-cabinet">
      <div className="pro-cabinet-shell">
        <section className="pro-cabinet-share pro-cabinet-card animate delay-1">
          <header className="pro-cabinet-share-head">
            <div>
              <p className="pro-cabinet-share-kicker">Новые клиенты</p>
              <h2 className="pro-cabinet-share-title">Ссылка для записи</h2>
              <p className="pro-cabinet-share-subtitle">
                Отправьте клиенту — он сразу откроет анкету записи к вам.
              </p>
            </div>
            <span className="pro-cabinet-pill is-primary">Быстро</span>
          </header>
          <div className="pro-cabinet-share-body">
            <button
              className="pro-cabinet-share-link"
              type="button"
              onClick={handleCopyLink}
              disabled={!shareLink}
              aria-label="Скопировать ссылку для записи"
            >
              <span className="pro-cabinet-share-link-label">Ваша ссылка</span>
              <span className="pro-cabinet-share-link-value">
                {shareLink || 'Ссылка будет доступна после настройки'}
              </span>
            </button>
            <div className="pro-cabinet-share-actions">
              <button
                className="pro-cabinet-share-action is-primary"
                type="button"
                onClick={handleSendLink}
                disabled={!shareLink || !shareConfigured}
              >
                Отправить в личку
              </button>
              <button
                className="pro-cabinet-share-action is-ghost"
                type="button"
                onClick={handleCopyLink}
                disabled={!shareLink}
              >
                Скопировать
              </button>
            </div>
            {shareStatus && (
              <p className="pro-cabinet-share-status" role="status">
                {shareStatus}
              </p>
            )}
            {!shareConfigured && (
              <p className="pro-cabinet-share-warning">
                Добавьте VITE_TG_APP_URL в env, чтобы ссылка открывалась в Telegram.
              </p>
            )}
          </div>
        </section>

        <section className="pro-cabinet-calendar animate delay-2">
          <header className="pro-cabinet-calendar-head">
            <div>
              <h1 className="pro-cabinet-calendar-title">Календарь</h1>
              <p className="pro-cabinet-calendar-subtitle">
                {displayName ? `Привет, ${displayName}` : 'Записи и заявки в одном месте'}
              </p>
            </div>
            <div className="pro-cabinet-calendar-head-actions">
              <button
                className="pro-cabinet-calendar-action"
                type="button"
                onClick={onViewRequests}
              >
                Все заявки
              </button>
              <button
                className="pro-cabinet-calendar-action is-ghost"
                type="button"
                onClick={() => onEditProfile()}
              >
                Профиль
              </button>
            </div>
          </header>

          {isLoading && <p className="pro-status">Синхронизируем календарь...</p>}
          {combinedError && <p className="pro-error">{combinedError}</p>}

          <div className="pro-cabinet-calendar-card">
            <div className="pro-cabinet-calendar-top">
              <button
                className="pro-cabinet-calendar-nav"
                type="button"
                aria-label="Предыдущая неделя"
                onClick={() => setWeekStartDate((current) => addDays(current, -7))}
              >
                ‹
              </button>
              <div className="pro-cabinet-calendar-month">
                <span className="pro-cabinet-calendar-month-label">{monthLabel}</span>
                <span className="pro-cabinet-calendar-range">{weekRangeLabel}</span>
                {lastUpdatedLabel && (
                  <span className="pro-cabinet-calendar-sync">{lastUpdatedLabel}</span>
                )}
              </div>
              <button
                className="pro-cabinet-calendar-nav"
                type="button"
                aria-label="Следующая неделя"
                onClick={() => setWeekStartDate((current) => addDays(current, 7))}
              >
                ›
              </button>
            </div>

            <div className="pro-cabinet-calendar-week" role="tablist">
              {weekDays.map((day, index) => {
                const dayKey = toDateKey(day)
                const dayCounts = countsByDate.get(dayKey) ?? {
                  booking: 0,
                  request: 0,
                }
                const isSelected = dayKey === selectedDateKey
                const isToday = dayKey === todayKey
                return (
                  <button
                    key={dayKey}
                    className={`pro-cabinet-calendar-day${
                      isSelected ? ' is-selected' : ''
                    }${isToday ? ' is-today' : ''}`}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setSelectedDate(day)}
                  >
                    <span className="pro-cabinet-calendar-day-name">
                      {weekDayLabels[index]}
                    </span>
                    <span className="pro-cabinet-calendar-day-number">
                      {day.getDate()}
                    </span>
                    <span className="pro-cabinet-calendar-day-dots">
                      {dayCounts.booking > 0 && (
                        <span className="pro-cabinet-calendar-day-dot is-booking">
                          {dayCounts.booking}
                        </span>
                      )}
                      {dayCounts.request > 0 && (
                        <span className="pro-cabinet-calendar-day-dot is-request">
                          {dayCounts.request}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="pro-cabinet-calendar-summary">
              <span className="pro-cabinet-calendar-summary-pill is-booking">
                Записей: {selectedCounts.booking}
              </span>
              <span className="pro-cabinet-calendar-summary-pill is-request">
                Заявок: {selectedCounts.request}
              </span>
              <span className="pro-cabinet-calendar-summary-date">
                {selectedDate.toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
            </div>

            <div className="pro-cabinet-calendar-filters" role="tablist">
              {(
                [
                  { id: 'all', label: 'Все' },
                  { id: 'bookings', label: 'Записи' },
                  { id: 'requests', label: 'Заявки' },
                ] as const
              ).map((filter) => (
                <button
                  key={filter.id}
                  className={`pro-cabinet-calendar-filter${
                    calendarFilter === filter.id ? ' is-active' : ''
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={calendarFilter === filter.id}
                  onClick={() => setCalendarFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="pro-cabinet-calendar-list">
              {selectedItems.length === 0 ? (
                <div className="pro-cabinet-calendar-empty">
                  На этот день пока нет записей или заявок.
                </div>
              ) : (
                selectedItems.map((item) => (
                  <div
                    key={item.id}
                    className={`pro-cabinet-calendar-item is-${item.type}`}
                  >
                    <div className="pro-cabinet-calendar-item-time">
                      <span
                        className={`pro-cabinet-calendar-item-dot is-${item.type}`}
                      />
                      <span>{item.timeLabel}</span>
                    </div>
                    <div className="pro-cabinet-calendar-item-body">
                      <span className="pro-cabinet-calendar-item-title">
                        {item.title}
                      </span>
                      <span className="pro-cabinet-calendar-item-meta">
                        {item.subtitle}
                      </span>
                    </div>
                    <span
                      className={`pro-cabinet-calendar-item-badge ${item.statusTone}`}
                    >
                      {item.statusLabel}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <ProBottomNav
        active="cabinet"
        onCabinet={() => {}}
        onRequests={onViewRequests}
        onChats={onViewChats}
        onProfile={() => onEditProfile()}
      />
    </div>
  )
}
