import { useEffect, useMemo, useState } from 'react'
import {
  IconClose,
  IconHome,
  IconList,
  IconStar,
  IconSwap,
  IconUser,
  IconUsers,
} from '../components/icons'
import { categoryItems } from '../data/clientData'
import type { Booking, RequestResponse, ServiceRequest } from '../types/app'

const locationLabelMap = {
  master: 'У мастера',
  client: 'У меня',
  any: 'Не важно',
} as const

const dateLabelMap = {
  today: 'Сегодня',
  tomorrow: 'Завтра',
  choose: 'По времени',
} as const

const responseStatusLabelMap = {
  sent: 'отправлен',
  accepted: 'принят',
  rejected: 'отклонен',
  expired: 'истек',
} as const

const bookingStatusLabelMap = {
  pending: 'Ожидает подтверждения мастером',
  price_pending: 'Мастер уточняет цену',
  price_proposed: 'Цена предложена',
  confirmed: 'Подтверждена',
  declined: 'Отклонена',
  cancelled: 'Отменена',
} as const

const bookingStatusToneMap = {
  pending: 'is-waiting',
  price_pending: 'is-waiting',
  price_proposed: 'is-offer',
  confirmed: 'is-confirmed',
  declined: 'is-cancelled',
  cancelled: 'is-cancelled',
} as const

const weekDayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const
const twelveHoursMs = 12 * 60 * 60 * 1000

const formatDateTime = (value?: string | null) => {
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

const formatPrice = (value: number) =>
  `${Math.round(value).toLocaleString('ru-RU')} ₽`

const formatRating = (average?: number | null, count?: number | null) => {
  const safeCount = typeof count === 'number' ? count : 0
  const safeAverage = typeof average === 'number' ? average : 0
  if (safeCount <= 0) return 'Новый мастер'
  return `★ ${safeAverage.toFixed(1)} (${safeCount})`
}

const formatExperience = (years?: number | null) => {
  if (typeof years !== 'number' || years <= 0) return ''
  const last = years % 10
  const suffix =
    years % 100 >= 11 && years % 100 <= 14
      ? 'лет'
      : last === 1
        ? 'год'
        : last >= 2 && last <= 4
          ? 'года'
          : 'лет'
  return `Опыт ${years} ${suffix}`
}

const formatPriceRange = (from?: number | null, to?: number | null) => {
  if (typeof from === 'number' && typeof to === 'number') {
    return `Прайс: ${formatPrice(from)} — ${formatPrice(to)}`
  }
  if (typeof from === 'number') {
    return `Прайс от ${formatPrice(from)}`
  }
  if (typeof to === 'number') {
    return `Прайс до ${formatPrice(to)}`
  }
  return ''
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

const getTimeUntilMs = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.getTime() - Date.now()
}

const startOfWeek = (value: Date) => {
  const next = new Date(value)
  const day = next.getDay()
  const diff = (day + 6) % 7
  next.setDate(next.getDate() - diff)
  next.setHours(0, 0, 0, 0)
  return next
}

const addDays = (value: Date, amount: number) => {
  const next = new Date(value)
  next.setDate(next.getDate() + amount)
  return next
}

const toDateKey = (value: Date) => {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseDateOnly = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(0, 0, 0, 0)
  return parsed
}

const formatDayMonth = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(value)

const formatLongDate = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(value)

const formatMonthTitle = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(value)

const getInitials = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return 'М'
  const parts = normalized.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0] ?? '')
  const joined = letters.join('').toUpperCase()
  if (joined) return joined
  return normalized.slice(0, 2).toUpperCase()
}

type ClientRequestsScreenProps = {
  apiBase: string
  userId: string
  initialTab?: 'requests' | 'bookings'
  onCreateRequest: () => void
  onViewHome: () => void
  onViewMasters: () => void
  onViewProfile: (masterId: string) => void
  onRescheduleBooking: (booking: Booking) => void
  onOpenChat: (chatId: number) => void
}

type BookingCalendarItem = {
  booking: Booking
  date: Date
  dateKey: string
  timeMs: number
}

export const ClientRequestsScreen = ({
  apiBase,
  userId,
  initialTab,
  onCreateRequest,
  onViewHome,
  onViewMasters,
  onViewProfile,
  onRescheduleBooking,
  onOpenChat,
}: ClientRequestsScreenProps) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'bookings'>(
    initialTab ?? 'requests'
  )
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [expandedRequestId, setExpandedRequestId] = useState<number | null>(null)
  const [responsesByRequestId, setResponsesByRequestId] = useState<
    Record<number, RequestResponse[]>
  >({})
  const [responsesLoadingId, setResponsesLoadingId] = useState<number | null>(
    null
  )
  const [responsesError, setResponsesError] = useState('')
  const [responsesErrorId, setResponsesErrorId] = useState<number | null>(null)
  const [responseActionId, setResponseActionId] = useState<number | null>(null)
  const [responseActionError, setResponseActionError] = useState<
    Record<number, string>
  >({})
  const [bookings, setBookings] = useState<Booking[]>([])
  const [isBookingsLoading, setIsBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState('')
  const [bookingActionId, setBookingActionId] = useState<number | null>(null)
  const [bookingActionError, setBookingActionError] = useState<
    Record<number, string>
  >({})
  const [reviewOpenId, setReviewOpenId] = useState<number | null>(null)
  const [reviewSubmittingId, setReviewSubmittingId] = useState<number | null>(null)
  const [reviewErrors, setReviewErrors] = useState<Record<number, string>>({})
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<number, { rating: number; comment: string }>
  >({})
  const [weekStartDate, setWeekStartDate] = useState(() =>
    startOfWeek(new Date())
  )
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  })
  const [calendarInitialized, setCalendarInitialized] = useState(false)

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadRequests = async () => {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch(
          `${apiBase}/api/requests?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load requests failed')
        }
        const data = (await response.json()) as ServiceRequest[]
        if (!cancelled) {
          setRequests(data)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError('Не удалось загрузить заявки.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadRequests()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadBookings = async () => {
      setIsBookingsLoading(true)
      setBookingsError('')
      try {
        const response = await fetch(
          `${apiBase}/api/bookings?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load bookings failed')
        }
        const data = (await response.json()) as Booking[]
        if (!cancelled) {
          setBookings(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        if (!cancelled) {
          setBookings([])
          setBookingsError('Не удалось загрузить записи.')
        }
      } finally {
        if (!cancelled) {
          setIsBookingsLoading(false)
        }
      }
    }

    loadBookings()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  const items = useMemo(() => requests, [requests])
  const bookingItems = useMemo(() => bookings, [bookings])
  const bookingCalendarItems = useMemo(() => {
    return bookingItems
      .map((booking): BookingCalendarItem | null => {
        const date = parseDateOnly(booking.scheduledAt)
        if (!date) return null
        const timeMs = new Date(booking.scheduledAt).getTime()
        return {
          booking,
          date,
          dateKey: toDateKey(date),
          timeMs,
        }
      })
      .filter((item): item is BookingCalendarItem => item !== null)
      .sort((a, b) => a.timeMs - b.timeMs)
  }, [bookingItems])
  const bookingSummaryByDate = useMemo(() => {
    const map = new Map<
      string,
      { count: number; hasConfirmed: boolean; hasCancelled: boolean; hasOther: boolean }
    >()
    bookingCalendarItems.forEach((item) => {
      const current = map.get(item.dateKey) ?? {
        count: 0,
        hasConfirmed: false,
        hasCancelled: false,
        hasOther: false,
      }
      current.count += 1
      if (item.booking.status === 'confirmed') {
        current.hasConfirmed = true
      } else if (
        item.booking.status === 'cancelled' ||
        item.booking.status === 'declined'
      ) {
        current.hasCancelled = true
      } else {
        current.hasOther = true
      }
      map.set(item.dateKey, current)
    })
    return map
  }, [bookingCalendarItems])
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>()
    bookingCalendarItems.forEach((item) => {
      const list = map.get(item.dateKey)
      if (list) {
        list.push(item.booking)
      } else {
        map.set(item.dateKey, [item.booking])
      }
    })
    return map
  }, [bookingCalendarItems])
  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate])
  const selectedBookings = useMemo(
    () => bookingsByDate.get(selectedDateKey) ?? [],
    [bookingsByDate, selectedDateKey]
  )
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)),
    [weekStartDate]
  )
  const weekRangeLabel = useMemo(() => {
    const weekEnd = addDays(weekStartDate, 6)
    return `${formatDayMonth(weekStartDate)} — ${formatDayMonth(weekEnd)}`
  }, [weekStartDate])
  const monthLabel = useMemo(() => formatMonthTitle(weekStartDate), [weekStartDate])
  const selectedDateLabel = useMemo(
    () => formatLongDate(selectedDate),
    [selectedDate]
  )
  const todayKey = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return toDateKey(today)
  }, [])

  useEffect(() => {
    if (calendarInitialized || bookingCalendarItems.length === 0) return
    const upcoming =
      bookingCalendarItems.find((item) => item.timeMs >= Date.now()) ??
      bookingCalendarItems[0]
    if (!upcoming) return
    setSelectedDate(upcoming.date)
    setWeekStartDate(startOfWeek(upcoming.date))
    setCalendarInitialized(true)
  }, [bookingCalendarItems, calendarInitialized])

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date)
    setCalendarInitialized(true)
  }

  const handleShiftWeek = (direction: number) => {
    setWeekStartDate((current) => addDays(current, direction * 7))
    setSelectedDate((current) => addDays(current, direction * 7))
    setCalendarInitialized(true)
  }

  const toggleResponses = async (requestId: number) => {
    if (expandedRequestId === requestId) {
      setExpandedRequestId(null)
      return
    }

    setExpandedRequestId(requestId)

    if (responsesByRequestId[requestId]) {
      return
    }

    setResponsesLoadingId(requestId)
    setResponsesError('')
    setResponsesErrorId(null)

    try {
      const response = await fetch(
        `${apiBase}/api/requests/${requestId}/responses?userId=${encodeURIComponent(
          userId
        )}`
      )
      if (!response.ok) {
        throw new Error('Load responses failed')
      }
      const data = (await response.json()) as RequestResponse[]
      setResponsesByRequestId((current) => ({ ...current, [requestId]: data }))
    } catch (error) {
      setResponsesError('Не удалось загрузить отклики.')
      setResponsesErrorId(requestId)
    } finally {
      setResponsesLoadingId((current) => (current === requestId ? null : current))
    }
  }

  const handleBookingAction = async (
    bookingId: number,
    action:
      | 'client-accept-price'
      | 'client-decline-price'
      | 'client-cancel'
      | 'client-delete'
  ) => {
    if (bookingActionId !== null) return

    setBookingActionId(bookingId)
    setBookingActionError((current) => ({ ...current, [bookingId]: '' }))

    try {
      const response = await fetch(`${apiBase}/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      })

      if (!response.ok) {
        throw new Error('Booking update failed')
      }

      const data = (await response.json().catch(() => null)) as
        | { status?: Booking['status']; servicePrice?: number | null }
        | null

      setBookings((current) => {
        if (action === 'client-delete') {
          return current.filter((booking) => booking.id !== bookingId)
        }
        return current.map((booking) => {
          if (booking.id !== bookingId) return booking
          const next = { ...booking }
          if (data?.status) {
            next.status = data.status
          } else if (action === 'client-cancel' || action === 'client-decline-price') {
            next.status = 'cancelled'
          } else if (action === 'client-accept-price') {
            next.status = 'confirmed'
          }
          if (action === 'client-accept-price') {
            const acceptedPrice =
              typeof data?.servicePrice === 'number'
                ? data.servicePrice
                : booking.proposedPrice ?? booking.servicePrice ?? null
            next.servicePrice = acceptedPrice
            next.proposedPrice = null
          }
          return next
        })
      })
    } catch (error) {
      setBookingActionError((current) => ({
        ...current,
        [bookingId]:
          action === 'client-delete'
            ? 'Не удалось удалить запись.'
            : 'Не удалось обновить запись.',
      }))
    } finally {
      setBookingActionId((current) => (current === bookingId ? null : current))
    }
  }

  const updateReviewDraft = (
    bookingId: number,
    next: Partial<{ rating: number; comment: string }>
  ) => {
    setReviewDrafts((current) => {
      const base = current[bookingId] ?? { rating: 0, comment: '' }
      return {
        ...current,
        [bookingId]: {
          ...base,
          ...next,
        },
      }
    })
    setReviewErrors((current) => ({ ...current, [bookingId]: '' }))
  }

  const handleReviewSubmit = async (booking: Booking) => {
    if (reviewSubmittingId !== null) return
    const draft = reviewDrafts[booking.id] ?? { rating: 0, comment: '' }
    if (!draft.rating) {
      setReviewErrors((current) => ({
        ...current,
        [booking.id]: 'Поставьте оценку.',
      }))
      return
    }

    setReviewSubmittingId(booking.id)
    setReviewErrors((current) => ({ ...current, [booking.id]: '' }))

    try {
      const response = await fetch(
        `${apiBase}/api/bookings/${booking.id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            rating: draft.rating,
            comment: draft.comment.trim() || null,
          }),
        }
      )

      const data = (await response.json().catch(() => null)) as
        | { error?: string; reviewId?: number }
        | null

      if (!response.ok) {
        const errorLabel =
          data?.error === 'review_exists'
            ? 'Отзыв уже оставлен.'
            : data?.error === 'time_not_passed'
              ? 'Отзыв можно оставить после записи.'
              : data?.error === 'status_invalid'
                ? 'Отзыв доступен после подтвержденной записи.'
                : data?.error === 'not_found'
                  ? 'Запись не найдена.'
                  : 'Не удалось оставить отзыв.'
        setReviewErrors((current) => ({ ...current, [booking.id]: errorLabel }))
        return
      }

      setBookings((current) =>
        current.map((item) =>
          item.id === booking.id
            ? { ...item, reviewId: data?.reviewId ?? item.reviewId ?? null }
            : item
        )
      )
      setReviewOpenId(null)
      setReviewDrafts((current) => {
        const next = { ...current }
        delete next[booking.id]
        return next
      })
    } catch (error) {
      setReviewErrors((current) => ({
        ...current,
        [booking.id]: 'Не удалось оставить отзыв.',
      }))
    } finally {
      setReviewSubmittingId((current) => (current === booking.id ? null : current))
    }
  }

  const handleResponseAction = async (
    requestId: number,
    responseId: number,
    action: 'accept' | 'reject'
  ) => {
    if (responseActionId !== null) return

    setResponseActionId(responseId)
    setResponseActionError((current) => ({ ...current, [responseId]: '' }))

    try {
      const response = await fetch(
        `${apiBase}/api/requests/${requestId}/responses/${responseId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, action }),
        }
      )
      const data = (await response.json().catch(() => null)) as
        | { status?: string; requestStatus?: string; chatId?: number | null }
        | null

      if (!response.ok) {
        throw new Error('Response update failed')
      }

      setResponsesByRequestId((current) => {
        const items = current[requestId] ?? []
        const acceptedStatus: RequestResponse['status'] = 'accepted'
        const rejectedStatus: RequestResponse['status'] = 'rejected'
        const nextStatus: RequestResponse['status'] =
          action === 'accept' ? acceptedStatus : rejectedStatus
        const nextChatId =
          action === 'accept' && typeof data?.chatId === 'number'
            ? data.chatId
            : null
        const next = items.map((item): RequestResponse => {
          if (item.id === responseId) {
            return {
              ...item,
              status: nextStatus,
              chatId: nextChatId ?? item.chatId ?? null,
            }
          }
          if (action === 'accept' && item.status === 'sent') {
            return { ...item, status: rejectedStatus }
          }
          return item
        })
        return { ...current, [requestId]: next }
      })

      if (action === 'accept') {
        setRequests((current) =>
          current.map((request) =>
            request.id === requestId ? { ...request, status: 'closed' } : request
          )
        )
      }
    } catch (error) {
      setResponseActionError((current) => ({
        ...current,
        [responseId]: 'Не удалось обновить отклик.',
      }))
    } finally {
      setResponseActionId((current) => (current === responseId ? null : current))
    }
  }

  return (
    <div className="screen screen--requests">
      <div className="requests-shell animate delay-2">
          <div className="requests-tabs" role="tablist" aria-label="Разделы">
            <button
              className={`requests-tab${activeTab === 'requests' ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'requests'}
              onClick={() => setActiveTab('requests')}
            >
              Заявки
            </button>
            <button
              className={`requests-tab${activeTab === 'bookings' ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'bookings'}
              onClick={() => setActiveTab('bookings')}
            >
              Записи
            </button>
          </div>
          {activeTab === 'requests' && (
            <div className="requests-top">
              <h2 className="requests-title">Активные</h2>
              <button
                className="cta cta--secondary"
                type="button"
                onClick={onCreateRequest}
              >
                + Новая заявка
              </button>
            </div>
          )}

          {activeTab === 'bookings' && (
            <section
              className="booking-calendar-card"
              aria-label="Календарь записей"
            >
              <div className="booking-calendar-top">
                <button
                  className="booking-calendar-nav"
                  type="button"
                  aria-label="Предыдущая неделя"
                  onClick={() => handleShiftWeek(-1)}
                >
                  ‹
                </button>
                <div className="booking-calendar-month">
                  <span className="booking-calendar-month-label">
                    {monthLabel}
                  </span>
                  <span className="booking-calendar-range">{weekRangeLabel}</span>
                </div>
                <button
                  className="booking-calendar-nav"
                  type="button"
                  aria-label="Следующая неделя"
                  onClick={() => handleShiftWeek(1)}
                >
                  ›
                </button>
              </div>

                <div className="booking-calendar-week" role="tablist">
                  {weekDays.map((day, index) => {
                    const dayKey = toDateKey(day)
                    const summary = bookingSummaryByDate.get(dayKey)
                    const count = summary?.count ?? 0
                    const countTone = summary
                      ? summary.hasConfirmed && summary.hasCancelled
                        ? 'is-mixed'
                        : summary.hasCancelled
                          ? 'is-cancelled'
                          : summary.hasConfirmed
                            ? 'is-confirmed'
                            : summary.hasOther
                              ? 'is-waiting'
                              : ''
                      : ''
                    const isSelected = dayKey === selectedDateKey
                    const isToday = dayKey === todayKey
                    return (
                      <button
                      key={dayKey}
                      className={`booking-calendar-day${
                        isSelected ? ' is-selected' : ''
                      }${isToday ? ' is-today' : ''}`}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => handleSelectDate(day)}
                    >
                      <span className="booking-calendar-day-name">
                        {weekDayLabels[index]}
                      </span>
                        <span className="booking-calendar-day-number">
                          {day.getDate()}
                        </span>
                        {count > 0 && (
                          <span
                            className={`booking-calendar-day-count${
                              countTone ? ` ${countTone}` : ''
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

              <div className="booking-calendar-summary">
                <span className="booking-calendar-summary-pill">
                  Записей: {selectedBookings.length}
                </span>
                <span className="booking-calendar-summary-date">
                  {selectedDateLabel}
                </span>
              </div>
            </section>
          )}

          {activeTab === 'requests' && (
            <>
              {isLoading && <p className="requests-status">Загружаем заявки...</p>}
              {loadError && <p className="requests-error">{loadError}</p>}

              {!isLoading && !items.length && !loadError && (
                <p className="requests-empty">
                  Пока нет заявок. Создайте первую!
                </p>
              )}

              <div className="requests-list">
                {items.map((item) => {
                  const locationLabel =
                    locationLabelMap[item.locationType] ?? 'Не важно'
                  const dateLabel =
                    item.dateOption === 'choose'
                      ? formatDateTime(item.dateTime) || 'По договоренности'
                      : dateLabelMap[item.dateOption]
                  const statusLabel = item.status === 'open' ? 'Открыта' : 'Закрыта'
                  const categoryLabel =
                    categoryItems.find((category) => category.id === item.categoryId)
                      ?.label ?? item.categoryId
                  const responseCount = item.responsesCount ?? 0
                  const responsePreview = Array.isArray(item.responsePreview)
                    ? item.responsePreview
                    : []
                  const responseOverflow =
                    responseCount > responsePreview.length
                      ? responseCount - responsePreview.length
                      : 0
                  const dispatchedCount = item.dispatchedCount ?? 0
                  const dispatchBatch =
                    item.dispatchBatch ??
                    (dispatchedCount > 0 ? 1 : 0)
                  const dispatchTimeLeft = formatTimeLeft(item.dispatchExpiresAt)
                  const isWaitingForResponses =
                    item.status === 'open' && responseCount === 0
                  const responses = responsesByRequestId[item.id] ?? []
                  const isResponsesOpen = expandedRequestId === item.id

                  return (
                    <div className="request-item" key={item.id}>
                      <div className="request-item-top">
                        <div className="request-item-title">{item.serviceName}</div>
                        <span
                          className={`request-status${
                            item.status === 'open' ? ' is-open' : ' is-closed'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="request-item-meta">
                        {categoryLabel}
                        {item.budget ? ` • ${item.budget}` : ''}
                      </div>
                      <div className="request-item-meta">
                        {locationLabel}
                        {item.cityName ? ` • ${item.cityName}` : ''}
                        {item.districtName ? ` • ${item.districtName}` : ''}
                      </div>
                      <div className="request-item-meta">{dateLabel}</div>
                      {dispatchedCount > 0 && (
                        <div className="request-item-meta request-item-meta--hint">
                          Отправлено: {dispatchedCount}
                          {dispatchBatch ? ` • Волна ${dispatchBatch}` : ''}
                        </div>
                      )}
                      {isWaitingForResponses && (
                        <div className="request-item-meta request-item-meta--hint">
                          {dispatchTimeLeft
                            ? `Осталось ${dispatchTimeLeft} до расширения поиска`
                            : 'Поиск расширяется, подбираем больше мастеров'}
                        </div>
                      )}
                      <div className="request-item-actions">
                        <button
                          className={`response-toggle${
                            responseCount > 0 ? ' has-responses' : ''
                          }${isResponsesOpen ? ' is-open' : ''}`}
                          type="button"
                          onClick={() => toggleResponses(item.id)}
                        >
                          <span className="response-toggle-pill">
                            <span className="response-toggle-text">
                              {isResponsesOpen ? 'Скрыть' : 'Отклики'}
                            </span>
                            <span className="response-toggle-count">
                              ({responseCount})
                            </span>
                          </span>
                          {!isResponsesOpen && responsePreview.length > 0 && (
                            <span className="response-toggle-preview">
                              <span
                                className="response-preview-stack"
                                aria-hidden="true"
                              >
                              {responsePreview.map((preview, index) => {
                                const initials = getInitials(
                                  preview.displayName || 'Мастер'
                                )
                                return (
                                  <span
                                    className="response-preview-avatar"
                                    key={preview.masterId}
                                    style={{ zIndex: 10 + index }}
                                  >
                                    {preview.avatarUrl ? (
                                      <img src={preview.avatarUrl} alt="" />
                                    ) : (
                                      <span>{initials}</span>
                                    )}
                                  </span>
                                )
                              })}
                              {responseOverflow > 0 && (
                                <span
                                  className="response-preview-more"
                                  style={{ zIndex: 10 + responsePreview.length }}
                                >
                                  +{responseOverflow}
                                </span>
                              )}
                              </span>
                              <span className="response-preview-chevron" aria-hidden="true">
                                ›
                              </span>
                            </span>
                          )}
                        </button>
                      </div>
                      {isResponsesOpen && (
                        <div className="request-responses">
                          {responsesLoadingId === item.id && (
                            <p className="response-status">Загружаем отклики...</p>
                          )}
                          {responsesErrorId === item.id && responsesError && (
                            <p className="response-error">{responsesError}</p>
                          )}
                          {responsesLoadingId !== item.id &&
                            responses.length === 0 &&
                            responsesErrorId !== item.id && (
                              <p className="response-status">
                                Откликов пока нет.
                              </p>
                            )}
                          {responses.map((responseItem) => {
                            const responseStatusLabel =
                              responseStatusLabelMap[responseItem.status] ??
                              responseItem.status
                            const masterName = responseItem.displayName || 'Мастер'
                            const masterInitials = getInitials(masterName)
                            const ratingLabel = formatRating(
                              responseItem.reviewsAverage,
                              responseItem.reviewsCount
                            )
                            const experienceLabel = formatExperience(
                              responseItem.experienceYears
                            )
                            const priceLabel =
                              responseItem.price !== null &&
                              responseItem.price !== undefined
                                ? formatPrice(responseItem.price)
                                : ''
                            const priceRangeLabel =
                              responseItem.price === null ||
                              responseItem.price === undefined
                                ? formatPriceRange(
                                    responseItem.priceFrom,
                                    responseItem.priceTo
                                  )
                                : ''
                            const previewUrls = Array.isArray(
                              responseItem.previewUrls
                            )
                              ? responseItem.previewUrls
                              : []
                            const isAccepted = responseItem.status === 'accepted'
                            const isRejected = responseItem.status === 'rejected'
                            const canRespondAction =
                              item.status === 'open' && responseItem.status === 'sent'
                            const isActionLoading = responseActionId === responseItem.id

                            return (
                              <div
                                className={`response-card${
                                  isAccepted
                                    ? ' is-accepted'
                                    : isRejected
                                      ? ' is-rejected'
                                      : ''
                                }`}
                                key={responseItem.id}
                              >
                                <button
                                  className="response-link"
                                  type="button"
                                  aria-label={`Открыть профиль ${masterName}`}
                                  onClick={() => onViewProfile(responseItem.masterId)}
                                >
                                  <div className="response-head">
                                    <div className="response-avatar" aria-hidden="true">
                                      {responseItem.avatarUrl ? (
                                        <img src={responseItem.avatarUrl} alt="" />
                                      ) : (
                                        <span>{masterInitials}</span>
                                      )}
                                    </div>
                                    <div className="response-main">
                                      <div className="response-name">{masterName}</div>
                                      <div className="response-subline">
                                        {experienceLabel && (
                                          <span className="response-pill">
                                            {experienceLabel}
                                          </span>
                                        )}
                                        {ratingLabel && (
                                          <span className="response-rating">
                                            {ratingLabel}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {priceLabel && (
                                      <span className="response-price">
                                        {priceLabel}
                                      </span>
                                    )}
                                  </div>
                                </button>
                                {priceRangeLabel && (
                                  <div className="response-meta">
                                    {priceRangeLabel}
                                  </div>
                                )}
                                {responseItem.comment && (
                                  <div className="response-comment">
                                    {responseItem.comment}
                                  </div>
                                )}
                                {responseItem.proposedTime && (
                                  <div className="response-meta">
                                    Время: {responseItem.proposedTime}
                                  </div>
                                )}
                                {previewUrls.length > 0 && (
                                  <div className="response-preview" role="list">
                                    {previewUrls.map((url, index) => (
                                      <span
                                        className="response-preview-thumb"
                                        key={`${responseItem.id}-preview-${index}`}
                                        role="listitem"
                                      >
                                        <img src={url} alt="" loading="lazy" />
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <div className="response-meta">
                                  Статус: {responseStatusLabel}
                                </div>
                                {canRespondAction && (
                                  <div className="response-actions">
                                    <button
                                      className="response-action is-primary"
                                      type="button"
                                      onClick={() =>
                                        handleResponseAction(
                                          item.id,
                                          responseItem.id,
                                          'accept'
                                        )
                                      }
                                      disabled={isActionLoading}
                                    >
                                      Выбрать мастера
                                    </button>
                                    <button
                                      className="response-action"
                                      type="button"
                                      onClick={() =>
                                        handleResponseAction(
                                          item.id,
                                          responseItem.id,
                                          'reject'
                                        )
                                      }
                                      disabled={isActionLoading}
                                    >
                                      Отклонить
                                    </button>
                                  </div>
                                )}
                                {isAccepted && responseItem.chatId && (
                                  <div className="response-actions">
                                    <button
                                      className="response-action is-primary"
                                      type="button"
                                      onClick={() => onOpenChat(responseItem.chatId!)}
                                    >
                                      Перейти в чат
                                    </button>
                                  </div>
                                )}
                                {isAccepted && !responseItem.chatId && (
                                  <p className="response-status">
                                    Чат создается...
                                  </p>
                                )}
                                {responseActionError[responseItem.id] && (
                                  <p className="response-error">
                                    {responseActionError[responseItem.id]}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {activeTab === 'bookings' && (
            <>
              {isBookingsLoading && (
                <p className="requests-status">Загружаем записи...</p>
              )}
              {bookingsError && <p className="requests-error">{bookingsError}</p>}

              {!isBookingsLoading && bookingItems.length === 0 && !bookingsError && (
                <p className="requests-empty">Пока нет записей.</p>
              )}

              {!isBookingsLoading && bookingItems.length > 0 && !bookingsError && (
                <div className="booking-calendar-label">
                  <span>Записи на</span>
                  <span className="booking-calendar-label-date">
                    {selectedDateLabel}
                  </span>
                  <span className="booking-calendar-label-count">
                    {selectedBookings.length}
                  </span>
                </div>
              )}

              {!isBookingsLoading &&
                bookingItems.length > 0 &&
                selectedBookings.length === 0 &&
                !bookingsError && (
                  <p className="requests-empty">
                    На выбранный день записей нет. Выберите дату с отметкой.
                  </p>
                )}

              {selectedBookings.length > 0 && (
                <div className="requests-list booking-list">
                  {selectedBookings.map((booking) => {
                  const statusLabel =
                    bookingStatusLabelMap[booking.status] ?? booking.status
                  const statusTone =
                    bookingStatusToneMap[booking.status] ?? 'is-waiting'
                  const locationLabel =
                    locationLabelMap[booking.locationType] ?? 'Не важно'
                  const categoryLabel =
                    categoryItems.find(
                      (category) => category.id === booking.categoryId
                    )?.label ?? booking.categoryId
                  const scheduledLabel = formatDateTime(booking.scheduledAt)
                  const priceLabel =
                    typeof booking.servicePrice === 'number'
                      ? `Стоимость: ${formatPrice(booking.servicePrice)}`
                      : typeof booking.proposedPrice === 'number'
                        ? `Предложенная цена: ${formatPrice(booking.proposedPrice)}`
                        : 'Цена согласуется с мастером'
                  const canAcceptPrice = booking.status === 'price_proposed'
                  const canDeclinePrice = booking.status === 'price_proposed'
                  const canCancel = ['pending', 'price_pending', 'price_proposed'].includes(
                    booking.status
                  )
                  const timeUntilMs = getTimeUntilMs(booking.scheduledAt)
                  const isPast = typeof timeUntilMs === 'number' && timeUntilMs <= 0
                  const canReschedule =
                    booking.status === 'confirmed' &&
                    typeof timeUntilMs === 'number' &&
                    timeUntilMs >= twelveHoursMs
                  const canCancelConfirmed =
                    booking.status === 'confirmed' &&
                    typeof timeUntilMs === 'number' &&
                    timeUntilMs > 0 &&
                    timeUntilMs < twelveHoursMs
                  const canLeaveReview =
                    booking.status === 'confirmed' && isPast && !booking.reviewId
                  const hasReview =
                    booking.status === 'confirmed' && isPast && Boolean(booking.reviewId)
                  const canDelete =
                    booking.status === 'cancelled' || booking.status === 'declined'
                  const isConfirmed = booking.status === 'confirmed'
                  const actionVariant = canDelete
                    ? 'delete'
                    : canLeaveReview
                      ? 'review'
                      : hasReview
                        ? 'reviewed'
                        : canReschedule
                          ? 'reschedule'
                          : canCancelConfirmed
                            ? 'cancel'
                            : null
                  const isActionLoading = bookingActionId !== null
                  const isReviewSubmitting = reviewSubmittingId === booking.id
                  const masterName = booking.masterName ?? 'Мастер'
                  const masterInitials = getInitials(masterName)
                  const photoItems = Array.isArray(booking.photoUrls)
                    ? booking.photoUrls
                    : []
                  const reviewDraft = reviewDrafts[booking.id] ?? {
                    rating: 0,
                    comment: '',
                  }

                  return (
                    <div className="booking-item" key={booking.id}>
                      <div className="booking-item-head">
                        <span className="booking-item-avatar" aria-hidden="true">
                          {booking.masterAvatarUrl ? (
                            <img src={booking.masterAvatarUrl} alt="" />
                          ) : (
                            <span>{masterInitials}</span>
                          )}
                        </span>
                        <div className="booking-item-main">
                          <div className="booking-item-main-row">
                            <div className="booking-item-master">{masterName}</div>
                            {isConfirmed && (
                              <span className={`booking-status ${statusTone}`}>
                                {statusLabel}
                              </span>
                            )}
                          </div>
                          <div className="booking-item-service">
                            {booking.serviceName}
                          </div>
                        </div>
                        <div className="booking-item-actions">
                          {!isConfirmed && (
                            <span className={`booking-status ${statusTone}`}>
                              {statusLabel}
                            </span>
                          )}
                          {actionVariant && actionVariant !== 'reviewed' && (
                            <div className="booking-action-row booking-action-row--top">
                              {actionVariant === 'reschedule' && (
                                <button
                                  className="booking-action-icon is-reschedule"
                                  type="button"
                                  onClick={() => onRescheduleBooking(booking)}
                                  disabled={isActionLoading}
                                >
                                  <span
                                    className="booking-action-icon-symbol"
                                    aria-hidden="true"
                                  >
                                    <IconSwap />
                                  </span>
                                  Перенести
                                </button>
                              )}
                              {actionVariant === 'cancel' && (
                                <button
                                  className="booking-action-icon is-cancel"
                                  type="button"
                                  onClick={() =>
                                    handleBookingAction(booking.id, 'client-cancel')
                                  }
                                  disabled={isActionLoading}
                                >
                                  <span
                                    className="booking-action-icon-symbol"
                                    aria-hidden="true"
                                  >
                                    <IconClose />
                                  </span>
                                  Отменить
                                </button>
                              )}
                              {actionVariant === 'review' && (
                                <button
                                  className="booking-action-icon is-review"
                                  type="button"
                                  onClick={() => {
                                    setReviewOpenId((current) =>
                                      current === booking.id ? null : booking.id
                                    )
                                    setReviewErrors((current) => ({
                                      ...current,
                                      [booking.id]: '',
                                    }))
                                  }}
                                >
                                  <span
                                    className="booking-action-icon-symbol"
                                    aria-hidden="true"
                                  >
                                    <IconStar />
                                  </span>
                                  Отзыв
                                </button>
                              )}
                              {actionVariant === 'delete' && (
                                <button
                                  className="booking-action-icon is-delete"
                                  type="button"
                                  onClick={() =>
                                    handleBookingAction(booking.id, 'client-delete')
                                  }
                                  disabled={isActionLoading}
                                >
                                  <span
                                    className="booking-action-icon-symbol"
                                    aria-hidden="true"
                                  >
                                    <IconClose />
                                  </span>
                                  Удалить
                                </button>
                              )}
                            </div>
                          )}
                          {actionVariant === 'reviewed' && (
                            <span className="booking-action-note">Отзыв отправлен</span>
                          )}
                        </div>
                      </div>
                      <div className="booking-item-meta">
                        {categoryLabel}
                        {scheduledLabel ? ` • ${scheduledLabel}` : ''}
                      </div>
                      <div className="booking-item-meta">
                        {locationLabel}
                        {booking.cityName ? ` • ${booking.cityName}` : ''}
                        {booking.districtName ? ` • ${booking.districtName}` : ''}
                      </div>
                      {booking.locationType === 'client' && booking.address && (
                        <div className="booking-item-meta">
                          Адрес: {booking.address}
                        </div>
                      )}
                      <div className="booking-item-price">{priceLabel}</div>
                      {booking.comment && (
                        <div className="booking-item-comment">{booking.comment}</div>
                      )}
                      {photoItems.length > 0 && (
                        <div className="booking-photo-strip" role="list">
                          {photoItems.map((url, index) => (
                            <span
                              className="booking-photo-thumb"
                              key={`${booking.id}-${index}`}
                              role="listitem"
                            >
                              <img src={url} alt="" loading="lazy" />
                            </span>
                          ))}
                        </div>
                      )}
                      {reviewOpenId === booking.id && (
                        <div className="booking-review-form">
                          <div className="booking-review-stars">
                            {[1, 2, 3, 4, 5].map((value) => (
                              <button
                                key={`rating-${booking.id}-${value}`}
                                className={`booking-review-star${
                                  reviewDraft.rating >= value ? ' is-active' : ''
                                }`}
                                type="button"
                                onClick={() => updateReviewDraft(booking.id, { rating: value })}
                              >
                                ★
                              </button>
                            ))}
                          </div>
                          <textarea
                            className="booking-review-textarea"
                            rows={3}
                            placeholder="Напишите пару слов о мастере"
                            value={reviewDraft.comment}
                            onChange={(event) =>
                              updateReviewDraft(booking.id, {
                                comment: event.target.value,
                              })
                            }
                          />
                          <div className="booking-review-actions">
                            <button
                              className="booking-review-submit"
                              type="button"
                              onClick={() => handleReviewSubmit(booking)}
                              disabled={isReviewSubmitting}
                            >
                              Отправить
                            </button>
                            <button
                              className="booking-review-cancel"
                              type="button"
                              onClick={() => setReviewOpenId(null)}
                              disabled={isReviewSubmitting}
                            >
                              Отмена
                            </button>
                          </div>
                          {reviewErrors[booking.id] && (
                            <p className="booking-review-error">
                              {reviewErrors[booking.id]}
                            </p>
                          )}
                        </div>
                      )}
                      {(canAcceptPrice || canDeclinePrice || canCancel) && (
                        <div className="booking-actions">
                          {canAcceptPrice && (
                            <button
                              className="booking-action is-primary"
                              type="button"
                              onClick={() =>
                                handleBookingAction(booking.id, 'client-accept-price')
                              }
                              disabled={isActionLoading}
                            >
                              Принять цену
                            </button>
                          )}
                          {canDeclinePrice && (
                            <button
                              className="booking-action"
                              type="button"
                              onClick={() =>
                                handleBookingAction(booking.id, 'client-decline-price')
                              }
                              disabled={isActionLoading}
                            >
                              Отказаться
                            </button>
                          )}
                          {canCancel && (
                            <button
                              className="booking-action is-ghost"
                              type="button"
                              onClick={() =>
                                handleBookingAction(booking.id, 'client-cancel')
                              }
                              disabled={isActionLoading}
                            >
                              Отменить запись
                            </button>
                          )}
                        </div>
                      )}
                      {bookingActionError[booking.id] && (
                        <p className="booking-action-error">
                          {bookingActionError[booking.id]}
                        </p>
                      )}
                    </div>
                  )
                })}
                </div>
              )}
            </>
          )}
      </div>

      <nav className="bottom-nav" aria-label="Навигация">
        <button className="nav-item" type="button" onClick={onViewHome}>
          <span className="nav-icon" aria-hidden="true">
            <IconHome />
          </span>
          Главная
        </button>
        <button className="nav-item" type="button" onClick={onViewMasters}>
          <span className="nav-icon" aria-hidden="true">
            <IconUsers />
          </span>
          Мастера
        </button>
        <button className="nav-item is-active" type="button">
          <span className="nav-icon" aria-hidden="true">
            <IconList />
          </span>
          Мои заявки
        </button>
        <button className="nav-item" type="button">
          <span className="nav-icon" aria-hidden="true">
            <IconUser />
          </span>
          Профиль
        </button>
      </nav>
    </div>
  )
}
