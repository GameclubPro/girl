import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  IconCalendar,
  IconChat,
  IconCheck,
  IconClose,
  IconRadius,
  IconStar,
  IconSwap,
  IconTrash,
} from '../components/icons'
import { ClientBottomNav } from '../components/ClientBottomNav'
import { NextActionPill } from '../components/NextActionPill'
import { RescheduleSheet } from '../components/RescheduleSheet'
import { VirtualStack, type VirtualStackHandle } from '../components/VirtualStack'
import { categoryItems } from '../data/clientData'
import type { Booking, ChatMessage, RequestResponse, ServiceRequest } from '../types/app'
import { getChatStream } from '../utils/chatStream'
import { fetchJsonCached, readCache } from '../utils/dataCache'

const REQUESTS_CACHE_TTL_MS = 60 * 1000
const BOOKINGS_CACHE_TTL_MS = 60 * 1000

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
const CALENDAR_RANGE_DAYS = 14
const PRICE_OFFER_HOURS = 12
const FREE_CANCEL_HOURS = 12
const MAX_DEPOSIT_PROOF_BYTES = 6 * 1024 * 1024
const DEPOSIT_HOLD_MINUTES = 20
const CRITICAL_HOLD_MINUTES = 10
const HOLD_TICK_INTERVAL_MS = 30_000

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

const formatTimeWindowList = (windows?: ServiceRequest['timeWindows']) => {
  if (!Array.isArray(windows) || windows.length === 0) return ''
  return windows
    .map((window) => {
      if (!window) return ''
      if (window.label) return window.label
      if (window.start && window.end) {
        return window.start === window.end
          ? window.start
          : `${window.start}–${window.end}`
      }
      return ''
    })
    .filter(Boolean)
    .join(', ')
}

const formatPrice = (value: number) =>
  `${Math.round(value).toLocaleString('ru-RU')} ₽`

const formatDistance = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  if (value < 1) {
    return `${Math.round(value * 1000)} м`
  }
  return `${value.toFixed(1).replace('.', ',')} км`
}

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

const formatTimeLeftFromMs = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return formatTimeLeft(new Date(value).toISOString())
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

const formatMonthTitle = (value: Date) => {
  const raw = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(value)
  return raw.replace(/\s?г\.?$/i, '').toUpperCase()
}

const formatMonthTag = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', { month: 'short' })
    .format(value)
    .replace('.', '')
    .toUpperCase()

const formatMonthRangeTitle = (start: Date, end: Date) => {
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  if (sameMonth) return formatMonthTitle(start)
  const startLabel = formatMonthTag(start)
  const endLabel = formatMonthTag(end)
  if (start.getFullYear() === end.getFullYear()) {
    return `${startLabel} — ${endLabel} ${start.getFullYear()}`
  }
  return `${startLabel} ${start.getFullYear()} — ${endLabel} ${end.getFullYear()}`
}

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
  focusRequestId?: number | null
  focusBookingId?: number | null
  onFocusHandled?: () => void
  onCreateRequest: () => void
  onViewHome: () => void
  onViewChats: () => void
  onViewClientProfile: () => void
  onViewProfile: (masterId: string) => void
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
  focusRequestId,
  focusBookingId,
  onFocusHandled,
  onCreateRequest,
  onViewHome,
  onViewChats,
  onViewClientProfile,
  onViewProfile,
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
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null)
  const [rescheduleError, setRescheduleError] = useState('')
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false)
  const [depositUploadingId, setDepositUploadingId] = useState<number | null>(
    null
  )
  const [depositUploadError, setDepositUploadError] = useState<
    Record<number, string>
  >({})
  const [depositCopyStatus, setDepositCopyStatus] = useState<
    Record<number, string>
  >({})
  const depositInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [expandedBookingDetails, setExpandedBookingDetails] = useState<
    Record<number, boolean>
  >({})
  const requestsRequestIdRef = useRef(0)
  const bookingsRequestIdRef = useRef(0)
  const bookingListRef = useRef<HTMLDivElement | null>(null)
  const requestsVirtualRef = useRef<VirtualStackHandle | null>(null)
  const bookingsVirtualRef = useRef<VirtualStackHandle | null>(null)
  const reloadTimerRef = useRef<number | null>(null)
  const reloadFlagsRef = useRef({ requests: false, bookings: false })
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [bookingFilter, setBookingFilter] = useState<'all' | 'action'>('all')
  const [reviewOpenId, setReviewOpenId] = useState<number | null>(null)
  const [reviewSubmittingId, setReviewSubmittingId] = useState<number | null>(null)
  const [reviewErrors, setReviewErrors] = useState<Record<number, string>>({})
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<number, { rating: number; comment: string }>
  >({})
  const [focusedBookingId, setFocusedBookingId] = useState<number | null>(null)
  const [focusedRequestId, setFocusedRequestId] = useState<number | null>(null)
  const pendingRequestFocusIdRef = useRef<number | null>(null)
  const pendingBookingFocusIdRef = useRef<number | null>(null)
  const pendingBookingFocusFilterRef = useRef<'all' | 'action' | 'keep'>('all')
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
    const intervalId = setInterval(() => {
      setNowTick(Date.now())
    }, HOLD_TICK_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [])

  const loadRequests = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) return
      const requestId = (requestsRequestIdRef.current += 1)
      const silent = options?.silent ?? false
      if (!silent) {
        setIsLoading(true)
        setLoadError('')
      }

      try {
        const cacheKey = `${apiBase}/api/requests?userId=${encodeURIComponent(
          userId
        )}`
        const { data } = await fetchJsonCached<ServiceRequest[]>(cacheKey, {
          ttlMs: REQUESTS_CACHE_TTL_MS,
          persist: true,
        })
        if (requestsRequestIdRef.current === requestId) {
          setRequests(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        if (requestsRequestIdRef.current === requestId && !silent) {
          setLoadError('Не удалось загрузить заявки.')
        }
      } finally {
        if (requestsRequestIdRef.current === requestId && !silent) {
          setIsLoading(false)
        }
      }
    },
    [apiBase, userId]
  )

  useEffect(() => {
    if (!userId) return
    const cacheKey = `${apiBase}/api/requests?userId=${encodeURIComponent(
      userId
    )}`
    const cached = readCache<ServiceRequest[]>(cacheKey, {
      ttlMs: REQUESTS_CACHE_TTL_MS,
      persist: true,
    })
    if (cached?.value) {
      setRequests(Array.isArray(cached.value) ? cached.value : [])
    }
    void loadRequests({ silent: Boolean(cached?.value) })
  }, [apiBase, loadRequests, userId])

  const loadBookings = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) return
      const requestId = (bookingsRequestIdRef.current += 1)
      const silent = options?.silent ?? false
      if (!silent) {
        setIsBookingsLoading(true)
        setBookingsError('')
      }
      try {
        const cacheKey = `${apiBase}/api/bookings?userId=${encodeURIComponent(
          userId
        )}`
        const { data } = await fetchJsonCached<Booking[]>(cacheKey, {
          ttlMs: BOOKINGS_CACHE_TTL_MS,
          persist: true,
        })
        if (bookingsRequestIdRef.current === requestId) {
          setBookings(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        if (bookingsRequestIdRef.current === requestId) {
          setBookings([])
          setBookingsError('Не удалось загрузить записи.')
        }
      } finally {
        if (!silent && bookingsRequestIdRef.current === requestId) {
          setIsBookingsLoading(false)
        }
      }
    },
    [apiBase, userId]
  )

  useEffect(() => {
    if (!userId) return
    const cacheKey = `${apiBase}/api/bookings?userId=${encodeURIComponent(
      userId
    )}`
    const cached = readCache<Booking[]>(cacheKey, {
      ttlMs: BOOKINGS_CACHE_TTL_MS,
      persist: true,
    })
    if (cached?.value) {
      setBookings(Array.isArray(cached.value) ? cached.value : [])
    }
    void loadBookings({ silent: Boolean(cached?.value) })
  }, [apiBase, loadBookings, userId])

  const stream = useMemo(() => getChatStream(apiBase, userId), [apiBase, userId])
  const requestEvents = useMemo(
    () =>
      new Set([
        'request_accepted',
        'request_updated',
        'request_closed',
      ]),
    []
  )
  const bookingEvents = useMemo(
    () =>
      new Set([
        'booking_confirmed',
        'booking_updated',
        'booking_price_proposed',
        'booking_cancelled',
        'booking_declined',
        'booking_reschedule_proposed',
        'booking_reschedule_accepted',
        'booking_reschedule_declined',
        'booking_reschedule_cancelled',
        'booking_outcome_marked',
        'deposit_pending',
        'deposit_submitted',
        'deposit_confirmed',
        'deposit_rejected',
        'deposit_expired',
      ]),
    []
  )

  const scheduleReload = useCallback(
    (targets: { requests?: boolean; bookings?: boolean }) => {
      if (targets.requests) {
        reloadFlagsRef.current.requests = true
      }
      if (targets.bookings) {
        reloadFlagsRef.current.bookings = true
      }
      if (reloadTimerRef.current !== null) return
      reloadTimerRef.current = window.setTimeout(() => {
        const { requests, bookings } = reloadFlagsRef.current
        reloadFlagsRef.current = { requests: false, bookings: false }
        reloadTimerRef.current = null
        if (requests) {
          void loadRequests({ silent: true })
        }
        if (bookings) {
          void loadBookings({ silent: true })
        }
      }, 240)
    },
    [loadBookings, loadRequests]
  )

  useEffect(() => {
    if (!userId) return
    const unsubscribe = stream.subscribe((payload) => {
      if (payload?.type === 'chat:created') {
        scheduleReload({ requests: true, bookings: true })
        return
      }
      if (payload?.type === 'message:new') {
        const incoming = payload.message as ChatMessage | undefined
        const meta =
          incoming?.meta && typeof incoming.meta === 'object'
            ? (incoming.meta as Record<string, unknown>)
            : null
        const event = typeof meta?.event === 'string' ? meta.event : ''
        if (requestEvents.has(event)) {
          scheduleReload({ requests: true })
        }
        if (bookingEvents.has(event)) {
          scheduleReload({ bookings: true })
        }
      }
    })

    return () => {
      unsubscribe()
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }
      reloadFlagsRef.current = { requests: false, bookings: false }
    }
  }, [bookingEvents, requestEvents, scheduleReload, stream, userId])

  useEffect(() => {
    if (focusedBookingId === null) return
    const timeout = setTimeout(() => {
      setFocusedBookingId(null)
    }, 4000)
    return () => clearTimeout(timeout)
  }, [focusedBookingId])

  useEffect(() => {
    if (focusedRequestId === null) return
    const timeout = setTimeout(() => {
      setFocusedRequestId(null)
    }, 4000)
    return () => clearTimeout(timeout)
  }, [focusedRequestId])

  const items = useMemo(() => requests, [requests])
  const bookingItems = useMemo(() => bookings, [bookings])
  const openRequestsCount = useMemo(
    () => items.filter((request) => request.status === 'open').length,
    [items]
  )
  const activeBookingsCount = useMemo(
    () =>
      bookingItems.filter(
        (booking) => booking.status !== 'cancelled' && booking.status !== 'declined'
      ).length,
    [bookingItems]
  )
  const depositAttentionBookings = useMemo(() => {
    const list = bookingItems.filter((booking) => {
      const depositPercent =
        typeof booking.depositPercent === 'number'
          ? Math.max(0, Math.round(booking.depositPercent))
          : 0
      const basePrice =
        typeof booking.servicePrice === 'number'
          ? booking.servicePrice
          : typeof booking.proposedPrice === 'number'
            ? booking.proposedPrice
            : null
      const depositAmount =
        typeof booking.depositAmount === 'number'
          ? booking.depositAmount
          : basePrice && depositPercent > 0
            ? Math.round((basePrice * depositPercent) / 100)
            : 0
      const depositStatus =
        booking.depositStatus ??
        (depositAmount > 0 ? 'pending' : 'not_required')
      const isActive =
        booking.status !== 'cancelled' && booking.status !== 'declined'
      return (
        isActive &&
        depositAmount > 0 &&
        (depositStatus === 'pending' || depositStatus === 'rejected')
      )
    })
    const resolveHoldMsLeft = (booking: Booking) => {
      if (!booking.depositHoldExpiresAt) return Number.POSITIVE_INFINITY
      const expiresMs = new Date(booking.depositHoldExpiresAt).getTime()
      if (Number.isNaN(expiresMs)) return Number.POSITIVE_INFINITY
      return Math.max(0, expiresMs - nowTick)
    }
    return list.sort((a, b) => {
      const aHold = resolveHoldMsLeft(a)
      const bHold = resolveHoldMsLeft(b)
      if (aHold !== bHold) return aHold - bHold
      const aTime = new Date(a.scheduledAt).getTime()
      const bTime = new Date(b.scheduledAt).getTime()
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
      if (Number.isNaN(aTime)) return 1
      if (Number.isNaN(bTime)) return -1
      return aTime - bTime
    })
  }, [bookingItems, nowTick])
  const depositAttentionCount = depositAttentionBookings.length
  const nextDepositBooking = depositAttentionBookings[0] ?? null
  const nextDepositHoldExpiresMs = useMemo(() => {
    if (!nextDepositBooking?.depositHoldExpiresAt) return null
    const expiresMs = new Date(nextDepositBooking.depositHoldExpiresAt).getTime()
    return Number.isNaN(expiresMs) ? null : expiresMs
  }, [nextDepositBooking])
  const nextDepositHoldMsLeft =
    nextDepositHoldExpiresMs !== null
      ? Math.max(0, nextDepositHoldExpiresMs - nowTick)
      : null
  const nextDepositHoldTimeLeft =
    nextDepositHoldExpiresMs !== null
      ? formatTimeLeftFromMs(nextDepositHoldExpiresMs)
      : ''
  const isNextHoldCritical =
    typeof nextDepositHoldMsLeft === 'number' &&
    nextDepositHoldMsLeft > 0 &&
    nextDepositHoldMsLeft <= CRITICAL_HOLD_MINUTES * 60 * 1000
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
    const map = new Map<string, { count: number }>()
    bookingCalendarItems.forEach((item) => {
      const current = map.get(item.dateKey) ?? { count: 0 }
      current.count += 1
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
  const selectedBookingsAction = useMemo(() => {
    const list = selectedBookings.filter((booking) => {
      const depositPercent =
        typeof booking.depositPercent === 'number'
          ? Math.max(0, Math.round(booking.depositPercent))
          : 0
      const basePrice =
        typeof booking.servicePrice === 'number'
          ? booking.servicePrice
          : typeof booking.proposedPrice === 'number'
            ? booking.proposedPrice
            : null
      const depositAmount =
        typeof booking.depositAmount === 'number'
          ? booking.depositAmount
          : basePrice && depositPercent > 0
            ? Math.round((basePrice * depositPercent) / 100)
            : 0
      const depositStatus =
        booking.depositStatus ??
        (depositAmount > 0 ? 'pending' : 'not_required')
      const needsDeposit =
        depositAmount > 0 &&
        (depositStatus === 'pending' || depositStatus === 'rejected')
      const needsPriceDecision = booking.status === 'price_proposed'
      const needsConfirmation =
        booking.status === 'pending' || booking.status === 'price_pending'
      const needsRescheduleDecision =
        Boolean(booking.rescheduleProposedTime) &&
        booking.rescheduleProposedBy === 'master'
      const timeUntilMs = getTimeUntilMs(booking.scheduledAt)
      const isPast = typeof timeUntilMs === 'number' && timeUntilMs <= 0
      const needsReview =
        booking.status === 'confirmed' && isPast && !booking.reviewId
      return (
        needsDeposit ||
        needsPriceDecision ||
        needsConfirmation ||
        needsRescheduleDecision ||
        needsReview
      )
    })
    const resolveHoldMsLeft = (booking: Booking) => {
      if (!booking.depositHoldExpiresAt) return Number.POSITIVE_INFINITY
      const expiresMs = new Date(booking.depositHoldExpiresAt).getTime()
      if (Number.isNaN(expiresMs)) return Number.POSITIVE_INFINITY
      return Math.max(0, expiresMs - nowTick)
    }
    return list.sort((a, b) => {
      const aHold = resolveHoldMsLeft(a)
      const bHold = resolveHoldMsLeft(b)
      if (aHold !== bHold) return aHold - bHold
      const aTime = new Date(a.scheduledAt).getTime()
      const bTime = new Date(b.scheduledAt).getTime()
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
      if (Number.isNaN(aTime)) return 1
      if (Number.isNaN(bTime)) return -1
      return aTime - bTime
    })
  }, [selectedBookings, nowTick])
  const visibleBookings =
    bookingFilter === 'action' ? selectedBookingsAction : selectedBookings
  const visibleBookingsCount = visibleBookings.length
  const calendarDays = useMemo(
    () =>
      Array.from({ length: CALENDAR_RANGE_DAYS }, (_, index) =>
        addDays(weekStartDate, index)
      ),
    [weekStartDate]
  )
  const calendarRangeEnd = useMemo(
    () => addDays(weekStartDate, CALENDAR_RANGE_DAYS - 1),
    [weekStartDate]
  )
  const calendarRangeLabel = useMemo(
    () =>
      `${formatDayMonth(weekStartDate)} — ${formatDayMonth(calendarRangeEnd)}`,
    [calendarRangeEnd, weekStartDate]
  )
  const monthLabel = useMemo(
    () => formatMonthRangeTitle(weekStartDate, calendarRangeEnd),
    [calendarRangeEnd, weekStartDate]
  )
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

  const handleShiftRange = (direction: number) => {
    setWeekStartDate((current) => addDays(current, direction * CALENDAR_RANGE_DAYS))
    setSelectedDate((current) => addDays(current, direction * CALENDAR_RANGE_DAYS))
    setCalendarInitialized(true)
  }

  const focusBooking = useCallback(
    (booking: Booking, options?: { filter?: 'all' | 'action' | 'keep' }) => {
      const date = parseDateOnly(booking.scheduledAt)
      if (!date) return
      const filter = options?.filter ?? 'all'
      if (filter === 'all') {
        setBookingFilter('all')
      } else if (filter === 'action') {
        setBookingFilter('action')
      }
      setSelectedDate(date)
      setWeekStartDate(startOfWeek(date))
      setCalendarInitialized(true)
      setFocusedBookingId(booking.id)
      requestAnimationFrame(() => {
        bookingListRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    },
    []
  )

  const loadResponses = useCallback(
    async (requestId: number) => {
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
    },
    [apiBase, userId]
  )

  const openResponses = useCallback(
    (requestId: number) => {
      setExpandedRequestId(requestId)
      if (responsesByRequestId[requestId]) {
        return
      }
      setResponsesLoadingId(requestId)
      setResponsesError('')
      setResponsesErrorId(null)
      void loadResponses(requestId)
    },
    [loadResponses, responsesByRequestId]
  )

  const toggleResponses = useCallback(
    (requestId: number) => {
      if (expandedRequestId === requestId) {
        setExpandedRequestId(null)
        return
      }
      openResponses(requestId)
    },
    [expandedRequestId, openResponses]
  )

  const resolveRequestFocus = useCallback(
    (requestId: number) => {
      const requestIndex = requests.findIndex((request) => request.id === requestId)
      if (requestIndex < 0) return
      setFocusedRequestId(requestId)
      if (expandedRequestId !== requestId) {
        openResponses(requestId)
      }
      requestAnimationFrame(() => {
        requestsVirtualRef.current?.scrollToIndex(requestIndex)
      })
      onFocusHandled?.()
    },
    [expandedRequestId, onFocusHandled, openResponses, requests]
  )

  const resolveBookingFocus = useCallback(
    (bookingId: number, options?: { filter?: 'all' | 'action' | 'keep' }) => {
      const booking = bookingItems.find((item) => item.id === bookingId)
      if (!booking) return
      focusBooking(booking, options)
      onFocusHandled?.()
    },
    [bookingItems, focusBooking, onFocusHandled]
  )

  const handleRequestActionFocus = useCallback(
    (requestId: number) => {
      if (activeTab !== 'requests') {
        pendingRequestFocusIdRef.current = requestId
        setActiveTab('requests')
        return
      }
      resolveRequestFocus(requestId)
    },
    [activeTab, resolveRequestFocus]
  )

  const handleBookingActionFocus = useCallback(
    (booking: Booking, actionId?: string | null) => {
      const nextFilter = activeTab === 'bookings' ? 'keep' : 'action'
      if (actionId === 'leave_review') {
        setReviewOpenId(booking.id)
        setReviewErrors((current) => ({ ...current, [booking.id]: '' }))
      }
      if (activeTab !== 'bookings') {
        pendingBookingFocusIdRef.current = booking.id
        pendingBookingFocusFilterRef.current = nextFilter
        setActiveTab('bookings')
        return
      }
      resolveBookingFocus(booking.id, { filter: nextFilter })
    },
    [activeTab, resolveBookingFocus]
  )

  useEffect(() => {
    if (typeof focusRequestId !== 'number') return
    if (activeTab === 'requests') {
      resolveRequestFocus(focusRequestId)
      return
    }
    pendingRequestFocusIdRef.current = focusRequestId
    setActiveTab('requests')
  }, [activeTab, focusRequestId, resolveRequestFocus])

  useEffect(() => {
    if (typeof focusBookingId !== 'number') return
    if (activeTab === 'bookings') {
      resolveBookingFocus(focusBookingId, { filter: 'all' })
      return
    }
    pendingBookingFocusIdRef.current = focusBookingId
    pendingBookingFocusFilterRef.current = 'all'
    setActiveTab('bookings')
  }, [activeTab, focusBookingId, resolveBookingFocus])

  useEffect(() => {
    const requestId = pendingRequestFocusIdRef.current
    if (!requestId || activeTab !== 'requests') return
    pendingRequestFocusIdRef.current = null
    resolveRequestFocus(requestId)
  }, [activeTab, resolveRequestFocus])

  useEffect(() => {
    const bookingId = pendingBookingFocusIdRef.current
    if (!bookingId || activeTab !== 'bookings') return
    const filter = pendingBookingFocusFilterRef.current
    pendingBookingFocusIdRef.current = null
    resolveBookingFocus(bookingId, { filter })
  }, [activeTab, resolveBookingFocus])

  useEffect(() => {
    if (focusedBookingId === null) return
    const index = visibleBookings.findIndex((booking) => booking.id === focusedBookingId)
    if (index < 0) return
    requestAnimationFrame(() => {
      bookingsVirtualRef.current?.scrollToIndex(index)
    })
  }, [focusedBookingId, visibleBookings])

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === 'string') {
          resolve(result)
        } else {
          reject(new Error('invalid_data'))
        }
      }
      reader.onerror = () => reject(new Error('read_failed'))
      reader.readAsDataURL(file)
    })

  const handleDepositCopy = async (
    bookingId: number,
    value: string,
    successMessage: string
  ) => {
    if (!value) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!ok) throw new Error('copy_failed')
      }
      setDepositCopyStatus((current) => ({ ...current, [bookingId]: successMessage }))
    } catch (error) {
      setDepositCopyStatus((current) => ({
        ...current,
        [bookingId]: 'Не удалось скопировать.',
      }))
    } finally {
      window.setTimeout(() => {
        setDepositCopyStatus((current) => ({ ...current, [bookingId]: '' }))
      }, 2400)
    }
  }

  const handleDepositProofUpload = async (bookingId: number, file: File) => {
    if (depositUploadingId !== null) return
    setDepositUploadingId(bookingId)
    setDepositUploadError((current) => ({ ...current, [bookingId]: '' }))

    if (!file.type.startsWith('image/')) {
      setDepositUploadError((current) => ({
        ...current,
        [bookingId]: 'Поддерживаются только изображения.',
      }))
      setDepositUploadingId(null)
      return
    }
    if (file.size > MAX_DEPOSIT_PROOF_BYTES) {
      setDepositUploadError((current) => ({
        ...current,
        [bookingId]: 'Файл слишком большой. Максимум 6 МБ.',
      }))
      setDepositUploadingId(null)
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const response = await fetch(`${apiBase}/api/requests/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, dataUrl }),
      })
      if (response.status === 413) {
        throw new Error('too_large')
      }
      if (!response.ok) {
        throw new Error('upload_failed')
      }
      const payload = (await response.json()) as {
        url?: string | null
      }
      if (!payload?.url) {
        throw new Error('upload_failed')
      }
      await handleBookingAction(bookingId, 'client-deposit-submit', {
        depositProofUrl: payload.url,
      })
    } catch (error) {
      setDepositUploadError((current) => ({
        ...current,
        [bookingId]:
          error instanceof Error && error.message === 'too_large'
            ? 'Файл слишком большой. Максимум 6 МБ.'
            : 'Не удалось загрузить чек.',
      }))
    } finally {
      setDepositUploadingId((current) => (current === bookingId ? null : current))
    }
  }

  const handleDepositProofChange = (
    bookingId: number,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void handleDepositProofUpload(bookingId, file)
  }

  const handleBookingAction = async (
    bookingId: number,
    action:
      | 'client-accept-price'
      | 'client-decline-price'
      | 'client-cancel'
      | 'client-delete'
      | 'client-deposit-submit',
    payload?: { depositProofUrl?: string | null }
  ) => {
    if (bookingActionId !== null) return

    setBookingActionId(bookingId)
    setBookingActionError((current) => ({ ...current, [bookingId]: '' }))

    try {
      const response = await fetch(`${apiBase}/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, ...payload }),
      })

      if (!response.ok) {
        throw new Error('Booking update failed')
      }

      const data = (await response.json().catch(() => null)) as
        | {
            status?: Booking['status']
            servicePrice?: number | null
            depositStatus?: Booking['depositStatus']
            depositAmount?: number | null
            depositProofUrl?: string | null
            chatId?: number | null
          }
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
          if (data?.depositStatus) {
            next.depositStatus = data.depositStatus
          }
          if (typeof data?.depositAmount === 'number') {
            next.depositAmount = data.depositAmount
          }
          if (typeof data?.depositProofUrl === 'string') {
            next.depositProofUrl = data.depositProofUrl
          }
          if (typeof data?.chatId === 'number') {
            next.chatId = data.chatId
          }
          next.nextAction = null
          return next
        })
      })
    } catch (error) {
      setBookingActionError((current) => ({
        ...current,
        [bookingId]:
          action === 'client-delete'
            ? 'Не удалось удалить запись.'
            : action === 'client-deposit-submit'
              ? 'Не удалось отметить депозит.'
            : 'Не удалось обновить запись.',
      }))
    } finally {
      setBookingActionId((current) => (current === bookingId ? null : current))
    }
  }

  const resolveRescheduleError = (code?: string) => {
    if (code === 'reschedule_window_closed') {
      return 'Перенос доступен только заранее. Проверьте окно отмены.'
    }
    if (code === 'schedule_unavailable') return 'График мастера пока недоступен.'
    if (code === 'day_unavailable') return 'В этот день мастер не работает.'
    if (code === 'time_unavailable') return 'Это время уже занято.'
    if (code === 'same_time') return 'Выберите другое время.'
    if (code === 'status_invalid') return 'Перенос доступен только для подтвержденных записей.'
    if (code === 'outcome_locked') return 'Запись уже завершена.'
    return 'Не удалось предложить перенос.'
  }

  const handleRescheduleSubmit = async (payload: {
    booking: Booking
    proposedAt: string
    note?: string | null
  }) => {
    if (rescheduleSubmitting) return
    setRescheduleSubmitting(true)
    setRescheduleError('')
    try {
      const response = await fetch(
        `${apiBase}/api/bookings/${payload.booking.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            action: 'reschedule-propose',
            proposedAt: payload.proposedAt,
            rescheduleNote: payload.note ?? null,
          }),
        }
      )
      const data = (await response.json().catch(() => null)) as
        | {
            error?: string
            rescheduleProposedAt?: string | null
            rescheduleProposedBy?: Booking['rescheduleProposedBy']
            rescheduleProposedTime?: string | null
            rescheduleNote?: string | null
          }
        | null

      if (!response.ok) {
        setRescheduleError(resolveRescheduleError(data?.error))
        return
      }

      setBookings((current) =>
        current.map((booking) =>
          booking.id === payload.booking.id
            ? {
                ...booking,
                rescheduleProposedAt: data?.rescheduleProposedAt ?? new Date().toISOString(),
                rescheduleProposedBy: data?.rescheduleProposedBy ?? 'client',
                rescheduleProposedTime: data?.rescheduleProposedTime ?? payload.proposedAt,
                rescheduleNote: data?.rescheduleNote ?? payload.note ?? null,
                nextAction: null,
              }
            : booking
        )
      )
      setRescheduleBooking(null)
    } catch (error) {
      setRescheduleError('Не удалось предложить перенос.')
    } finally {
      setRescheduleSubmitting(false)
    }
  }

  const handleRescheduleDecision = async (
    bookingId: number,
    action: 'reschedule-accept' | 'reschedule-decline' | 'reschedule-cancel'
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
      const data = (await response.json().catch(() => null)) as
        | {
            error?: string
            scheduledAt?: string | null
          }
        | null

      if (!response.ok) {
        const message =
          data?.error === 'reschedule_not_found'
            ? 'Перенос уже не актуален.'
            : 'Не удалось обновить перенос.'
        setBookingActionError((current) => ({
          ...current,
          [bookingId]: message,
        }))
        return
      }

      setBookings((current) =>
        current.map((booking) => {
          if (booking.id !== bookingId) return booking
          const next = {
            ...booking,
            rescheduleProposedAt: null,
            rescheduleProposedBy: null,
            rescheduleProposedTime: null,
            rescheduleNote: null,
          }
          if (action === 'reschedule-accept' && data?.scheduledAt) {
            next.scheduledAt = data.scheduledAt
          }
          next.nextAction = null
          return next
        })
      )
    } catch (error) {
      setBookingActionError((current) => ({
        ...current,
        [bookingId]: 'Не удалось обновить перенос.',
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
            ? {
                ...item,
                reviewId: data?.reviewId ?? item.reviewId ?? null,
                nextAction: null,
              }
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
    action: 'accept' | 'reject',
    options?: { bookNow?: boolean }
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
          body: JSON.stringify({
            userId,
            action,
            bookNow: options?.bookNow === true,
          }),
        }
      )
      const data = (await response.json().catch(() => null)) as
        | {
            status?: string
            requestStatus?: string
            chatId?: number | null
            bookingId?: number | null
            error?: string
          }
        | null

      if (!response.ok) {
        const errorLabel =
          data?.error === 'hold_expired'
            ? 'Время удержания слота истекло.'
            : data?.error === 'slot_missing'
              ? 'Слот не выбран мастером.'
              : data?.error === 'time_unavailable'
                ? 'Время уже занято.'
                : data?.error === 'price_required'
                  ? 'Нужна подтвержденная цена.'
                  : 'Не удалось обновить отклик.'
        setResponseActionError((current) => ({
          ...current,
          [responseId]: errorLabel,
        }))
        return
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
        const nextChatId =
          typeof data?.chatId === 'number' ? data.chatId : null
        setRequests((current) =>
          current.map((request) =>
            request.id === requestId
              ? {
                  ...request,
                  status: 'closed',
                  chatId: nextChatId ?? request.chatId ?? null,
                  nextAction: null,
                }
              : request
          )
        )
        if (options?.bookNow) {
          void loadBookings({ silent: true })
        }
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
              <span className="requests-tab-count">{openRequestsCount}</span>
            </button>
            <button
              className={`requests-tab${activeTab === 'bookings' ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'bookings'}
              onClick={() => setActiveTab('bookings')}
            >
              Записи
              <span className="requests-tab-count">{activeBookingsCount}</span>
              {depositAttentionCount > 0 && (
                <span className="requests-tab-count is-alert">
                  {depositAttentionCount}
                </span>
              )}
            </button>
          </div>
          <div className="requests-explainer">
            {activeTab === 'requests' ? (
              <>
                <strong>Заявки</strong> — вы ищете мастера и ждёте отклики.
              </>
            ) : (
              <>
                <strong>Записи</strong> — подтверждённые слоты и депозиты.
              </>
            )}
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
            <>
              {depositAttentionCount > 0 && (
                <div className="requests-alert">
                  <div className="requests-alert-main">
                    <div className="requests-alert-title">Нужен депозит</div>
                    <p className="requests-alert-text">
                      {depositAttentionCount === 1
                        ? 'У вас есть запись, где нужно оплатить депозит.'
                        : `У вас ${depositAttentionCount} записи, где нужно оплатить депозит.`}{' '}
                      {nextDepositHoldTimeLeft
                        ? `Осталось ${nextDepositHoldTimeLeft}.`
                        : `Слот удерживается ${DEPOSIT_HOLD_MINUTES} минут.`}
                    </p>
                    {nextDepositBooking && (
                      <p className="requests-alert-meta">
                        Ближайшая: {nextDepositBooking.serviceName} ·{' '}
                        {formatDateTime(nextDepositBooking.scheduledAt)}
                      </p>
                    )}
                    {nextDepositHoldTimeLeft && (
                      <p
                        className={`requests-alert-meta${
                          isNextHoldCritical ? ' is-critical' : ''
                        }`}
                      >
                        {isNextHoldCritical
                          ? `Критично: осталось ${nextDepositHoldTimeLeft}`
                          : `Осталось ${nextDepositHoldTimeLeft}`}
                      </p>
                    )}
                  </div>
                  <div className="requests-alert-actions">
                    {nextDepositBooking && (
                      <button
                        className="booking-action-icon is-alert"
                        type="button"
                        onClick={() => focusBooking(nextDepositBooking)}
                      >
                        Перейти
                      </button>
                    )}
                    {nextDepositBooking?.chatId && (
                      <button
                        className="booking-action-icon"
                        type="button"
                        onClick={() => onOpenChat(nextDepositBooking.chatId!)}
                      >
                        <span
                          className="booking-action-icon-symbol"
                          aria-hidden="true"
                        >
                          <IconChat />
                        </span>
                        Чат
                      </button>
                    )}
                  </div>
                </div>
              )}
              <section
                className="booking-calendar-card"
                aria-label="Календарь записей"
              >
                <div className="booking-calendar-top">
                  <button
                    className="booking-calendar-nav"
                    type="button"
                    aria-label="Предыдущие две недели"
                    onClick={() => handleShiftRange(-1)}
                  >
                    ‹
                  </button>
                  <div className="booking-calendar-month">
                    <span className="booking-calendar-month-label">
                      {monthLabel}
                    </span>
                    <span className="booking-calendar-range">
                      {calendarRangeLabel}
                    </span>
                  </div>
                  <button
                    className="booking-calendar-nav"
                    type="button"
                    aria-label="Следующие две недели"
                    onClick={() => handleShiftRange(1)}
                  >
                    ›
                  </button>
                </div>

                <div className="booking-calendar-week" role="tablist">
                  {calendarDays.map((day, index) => {
                    const dayKey = toDateKey(day)
                    const summary = bookingSummaryByDate.get(dayKey)
                    const count = summary?.count ?? 0
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
                          {weekDayLabels[index % weekDayLabels.length]}
                        </span>
                        <span className="booking-calendar-day-number">
                          {day.getDate()}
                        </span>
                        {count > 0 && (
                          <span className="booking-calendar-day-count">{count}</span>
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
            </>
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

              {items.length > 0 && (
                <VirtualStack
                  ref={requestsVirtualRef}
                  items={items}
                  estimateSize={240}
                  gap={10}
                  overscan={8}
                  className="requests-list"
                  getItemKey={(item: ServiceRequest) => item.id}
                  renderItem={(item: ServiceRequest) => {
                    const locationLabel =
                      locationLabelMap[item.locationType] ?? 'Не важно'
                    const baseDateLabel =
                      item.dateOption === 'choose'
                        ? formatDateTime(item.dateTime) || 'По договоренности'
                        : dateLabelMap[item.dateOption]
                    const timeWindowLabel = formatTimeWindowList(item.timeWindows)
                    const dateLabel = timeWindowLabel
                      ? `${baseDateLabel} · ${timeWindowLabel}`
                      : baseDateLabel
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
                    const nextAction = item.nextAction ?? null

                    return (
                      <div
                        className={`request-item${
                          focusedRequestId === item.id ? ' is-focus' : ''
                        }`}
                        id={`request-${item.id}`}
                      >
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
                          {dateLabel} · {locationLabel}
                        </div>
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
                        {nextAction && (
                          <NextActionPill
                            action={nextAction}
                            className="request-action-pill"
                            onClick={() => handleRequestActionFocus(item.id)}
                          />
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
                          {item.chatId ? (
                            <button
                              className="request-chat-link"
                              type="button"
                              onClick={() => onOpenChat(item.chatId!)}
                            >
                              <IconChat />
                              Чат по заявке
                            </button>
                          ) : (
                            item.status === 'closed' && (
                              <span className="request-chat-pending">
                                Чат создаётся...
                              </span>
                            )
                          )}
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
                              const proposedSlotLabel = responseItem.proposedSlotAt
                                ? formatDateTime(responseItem.proposedSlotAt)
                                : ''
                              const holdTimeLeft = responseItem.holdExpiresAt
                                ? formatTimeLeft(responseItem.holdExpiresAt)
                                : ''
                              const isAccepted = responseItem.status === 'accepted'
                              const isRejected = responseItem.status === 'rejected'
                              const canRespondAction =
                                item.status === 'open' && responseItem.status === 'sent'
                              const canInstantBook =
                                canRespondAction &&
                                Boolean(proposedSlotLabel) &&
                                Boolean(holdTimeLeft)
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
                                  {proposedSlotLabel && (
                                    <div className="response-meta">
                                      Слот: {proposedSlotLabel}
                                    </div>
                                  )}
                                  {!holdTimeLeft && responseItem.proposedSlotAt && (
                                    <div className="response-meta response-meta--warning">
                                      Удержание слота истекло
                                    </div>
                                  )}
                                  {holdTimeLeft && (
                                    <div className="response-meta response-meta--highlight">
                                      Удержание слота: {holdTimeLeft}
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
                                        className={`response-action${
                                          canInstantBook ? '' : ' is-primary'
                                        }`}
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
                                      {canInstantBook && (
                                        <button
                                          className="response-action is-primary"
                                          type="button"
                                          onClick={() =>
                                            handleResponseAction(
                                              item.id,
                                              responseItem.id,
                                              'accept',
                                              { bookNow: true }
                                            )
                                          }
                                          disabled={isActionLoading}
                                        >
                                          Записаться
                                        </button>
                                      )}
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
                  }}
                />
              )}
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
                <>
                  <div className="booking-calendar-label">
                    <span>Записи на</span>
                    <span className="booking-calendar-label-date">
                      {selectedDateLabel}
                    </span>
                    <span className="booking-calendar-label-count">
                      {visibleBookingsCount}
                    </span>
                    {bookingFilter === 'action' &&
                      visibleBookingsCount !== selectedBookings.length && (
                        <span className="booking-calendar-label-hint">
                          из {selectedBookings.length}
                        </span>
                      )}
                  </div>
                  <div className="booking-filter" role="group" aria-label="Фильтр">
                    <button
                      className={`booking-filter-chip${
                        bookingFilter === 'all' ? ' is-active' : ''
                      }`}
                      type="button"
                      onClick={() => setBookingFilter('all')}
                    >
                      Все
                    </button>
                    <button
                      className={`booking-filter-chip${
                        bookingFilter === 'action' ? ' is-active' : ''
                      }`}
                      type="button"
                      onClick={() => setBookingFilter('action')}
                    >
                      Нужны действия
                      {selectedBookingsAction.length > 0 && (
                        <span className="booking-filter-count">
                          {selectedBookingsAction.length}
                        </span>
                      )}
                    </button>
                  </div>
                </>
              )}

              {!isBookingsLoading &&
                bookingItems.length > 0 &&
                selectedBookings.length === 0 &&
                !bookingsError && (
                  <p className="requests-empty">
                    На выбранный день записей нет. Выберите дату с отметкой.
                  </p>
                )}

              {selectedBookings.length > 0 && visibleBookingsCount === 0 && (
                <p className="requests-empty">
                  Нет записей, требующих действий. Переключитесь на «Все».
                </p>
              )}

              {visibleBookingsCount > 0 && (
                <div ref={bookingListRef}>
                  <VirtualStack
                    ref={bookingsVirtualRef}
                    items={visibleBookings}
                    estimateSize={340}
                    gap={12}
                    overscan={6}
                    className="requests-list booking-list"
                    getItemKey={(item: Booking) => item.id}
                    renderItem={(booking: Booking) => {
                  const statusLabel =
                    bookingStatusLabelMap[booking.status] ?? booking.status
                  const statusTone =
                    bookingStatusToneMap[booking.status] ?? 'is-waiting'
                  const locationLabel =
                    locationLabelMap[booking.locationType] ?? 'Не важно'
                  const distanceLabel = formatDistance(booking.distanceKm)
                  const scheduledLabel = formatDateTime(booking.scheduledAt)
                  const rescheduleLabel = booking.rescheduleProposedTime
                    ? formatDateTime(booking.rescheduleProposedTime)
                    : ''
                  const updatedAtMs = booking.updatedAt
                    ? new Date(booking.updatedAt).getTime()
                    : null
                  const priceOfferExpiresAt = updatedAtMs
                    ? updatedAtMs + PRICE_OFFER_HOURS * 60 * 60 * 1000
                    : null
                  const priceOfferTimeLeft = formatTimeLeftFromMs(
                    priceOfferExpiresAt
                  )
                  const cancelWindowHours =
                    typeof booking.cancelWindowHours === 'number'
                      ? booking.cancelWindowHours
                      : FREE_CANCEL_HOURS
                  const cancelWindowMs = Math.max(0, cancelWindowHours) * 60 * 60 * 1000
                  const priceLabel =
                    typeof booking.servicePrice === 'number'
                      ? `Стоимость: ${formatPrice(booking.servicePrice)}`
                      : typeof booking.proposedPrice === 'number'
                        ? `Предложенная цена: ${formatPrice(booking.proposedPrice)}`
                        : 'Цена согласуется с мастером'
                  const promotionDiscountPercent =
                    typeof booking.promotionDiscountPercent === 'number'
                      ? Math.max(0, Math.round(booking.promotionDiscountPercent))
                      : 0
                  const campaignDiscountPercent =
                    typeof booking.campaignDiscountPercent === 'number'
                      ? Math.max(0, Math.round(booking.campaignDiscountPercent))
                      : 0
                  const promotionPriceBefore =
                    typeof booking.promotionPriceBefore === 'number'
                      ? booking.promotionPriceBefore
                      : null
                  const campaignPriceBefore =
                    typeof booking.campaignPriceBefore === 'number'
                      ? booking.campaignPriceBefore
                      : null
                  const discountSource = booking.discountSource ?? null
                  const discountPercent =
                    discountSource === 'campaign'
                      ? campaignDiscountPercent
                      : discountSource === 'promotion'
                        ? promotionDiscountPercent
                        : campaignDiscountPercent > promotionDiscountPercent
                          ? campaignDiscountPercent
                          : promotionDiscountPercent
                  const discountPriceBefore =
                    discountSource === 'campaign'
                      ? campaignPriceBefore
                      : discountSource === 'promotion'
                        ? promotionPriceBefore
                        : campaignDiscountPercent > promotionDiscountPercent
                          ? campaignPriceBefore
                          : promotionPriceBefore
                  const promotionLabel =
                    discountPercent > 0 &&
                    typeof discountPriceBefore === 'number'
                      ? `Скидка -${discountPercent}% · было ${formatPrice(
                          discountPriceBefore
                        )}`
                      : ''
                  const canAcceptPrice = booking.status === 'price_proposed'
                  const canDeclinePrice = booking.status === 'price_proposed'
                  const canCancel = ['pending', 'price_pending', 'price_proposed'].includes(
                    booking.status
                  )
                  const timeUntilMs = getTimeUntilMs(booking.scheduledAt)
                  const isPast = typeof timeUntilMs === 'number' && timeUntilMs <= 0
                  const freeCancelUntilMs =
                    typeof timeUntilMs === 'number' && cancelWindowMs > 0
                      ? new Date(booking.scheduledAt).getTime() -
                        cancelWindowMs
                      : null
                  const freeCancelLabel =
                    freeCancelUntilMs && freeCancelUntilMs > Date.now()
                      ? formatDateTime(new Date(freeCancelUntilMs).toISOString())
                      : ''
                  const canReschedule =
                    booking.status === 'confirmed' &&
                    typeof timeUntilMs === 'number' &&
                    timeUntilMs >= cancelWindowMs
                  const reschedulePending =
                    Boolean(booking.rescheduleProposedTime) &&
                    Boolean(booking.rescheduleProposedBy)
                  const rescheduleByClient = booking.rescheduleProposedBy === 'client'
                  const canRespondReschedule = reschedulePending && !rescheduleByClient
                  const canCancelReschedule = reschedulePending && rescheduleByClient
                  const canCancelConfirmed =
                    booking.status === 'confirmed' &&
                    typeof timeUntilMs === 'number' &&
                    timeUntilMs > 0 &&
                    (cancelWindowMs === 0 || timeUntilMs < cancelWindowMs)
                  const canLeaveReview =
                    booking.status === 'confirmed' && isPast && !booking.reviewId
                  const hasReview =
                    booking.status === 'confirmed' && isPast && Boolean(booking.reviewId)
                  const depositPercent =
                    typeof booking.depositPercent === 'number'
                      ? Math.max(0, Math.round(booking.depositPercent))
                      : 0
                  const basePrice =
                    typeof booking.servicePrice === 'number'
                      ? booking.servicePrice
                      : typeof booking.proposedPrice === 'number'
                        ? booking.proposedPrice
                        : null
                  const resolvedDepositAmount =
                    typeof booking.depositAmount === 'number'
                      ? booking.depositAmount
                      : basePrice && depositPercent > 0
                        ? Math.round((basePrice * depositPercent) / 100)
                        : 0
                  const depositAmount =
                    typeof resolvedDepositAmount === 'number'
                      ? resolvedDepositAmount
                      : 0
                  const depositStatus =
                    booking.depositStatus ??
                    (depositAmount > 0 ? 'pending' : 'not_required')
                  const depositStatusLabel =
                    depositStatus === 'submitted'
                      ? 'Чек отправлен, ждём подтверждения'
                      : depositStatus === 'confirmed'
                        ? 'Депозит подтверждён'
                        : depositStatus === 'rejected'
                          ? 'Депозит отклонён — отправьте чек снова'
                          : depositStatus === 'expired'
                            ? 'Время оплаты вышло, слот снят'
                            : depositStatus === 'pending'
                              ? 'Ожидаем оплату депозита'
                              : ''
                  const depositStatusTone =
                    depositStatus === 'pending' ||
                    depositStatus === 'rejected' ||
                    depositStatus === 'expired'
                      ? 'booking-item-meta--danger'
                      : 'booking-item-meta--highlight'
                  const depositDetails = booking.depositDetails?.trim() ?? ''
                  const depositQrUrl = booking.depositQrUrl ?? ''
                  const canSubmitDeposit =
                    depositStatus === 'pending' || depositStatus === 'rejected'
                  const showDepositPay = depositAmount > 0 && canSubmitDeposit
                  const depositHoldTimeLeft = booking.depositHoldExpiresAt
                    ? formatTimeLeft(booking.depositHoldExpiresAt)
                    : ''
                  const depositHoldExpiresMs = booking.depositHoldExpiresAt
                    ? new Date(booking.depositHoldExpiresAt).getTime()
                    : null
                  const depositHoldMsLeft =
                    typeof depositHoldExpiresMs === 'number' &&
                    !Number.isNaN(depositHoldExpiresMs)
                      ? Math.max(0, depositHoldExpiresMs - nowTick)
                      : null
                  const isHoldCritical =
                    typeof depositHoldMsLeft === 'number' &&
                    depositHoldMsLeft > 0 &&
                    depositHoldMsLeft <= CRITICAL_HOLD_MINUTES * 60 * 1000
                  const depositHoldLabel = depositHoldTimeLeft
                    ? `Слот удерживается: ${depositHoldTimeLeft}`
                    : `Слот удерживается ${DEPOSIT_HOLD_MINUTES} минут`
                  const criticalHoldLabel =
                    isHoldCritical && depositHoldTimeLeft
                      ? `Критично: осталось ${depositHoldTimeLeft}`
                      : ''
                  const canDelete =
                    booking.status === 'cancelled' || booking.status === 'declined'
                  const canRescheduleAction = canReschedule && !reschedulePending
                  const actionVariant = canDelete
                    ? 'delete'
                    : canLeaveReview
                      ? 'review'
                      : hasReview
                        ? 'reviewed'
                        : canRescheduleAction
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
                  const hasExtraDetails =
                    Boolean(booking.cityName || booking.districtName || booking.address) ||
                    Boolean(booking.comment) ||
                    photoItems.length > 0
                  const isDetailsOpen = Boolean(expandedBookingDetails[booking.id])
                  const reviewDraft = reviewDrafts[booking.id] ?? {
                    rating: 0,
                    comment: '',
                  }
                  const rescheduleMetaLabel = reschedulePending
                    ? rescheduleByClient
                      ? rescheduleLabel
                        ? `Ожидает подтверждения · ${rescheduleLabel}`
                        : 'Ожидает подтверждения переноса'
                      : rescheduleLabel
                        ? `Предложен перенос · ${rescheduleLabel}`
                        : 'Предложен перенос'
                    : ''
                  const rescheduleMetaTone = canRespondReschedule
                    ? 'booking-item-meta--warning'
                    : 'booking-item-meta--highlight'
                  const showActions =
                    Boolean(booking.chatId) ||
                    hasExtraDetails ||
                    reschedulePending ||
                    actionVariant !== null
                  const hasChips =
                    Boolean(rescheduleMetaLabel) ||
                    Boolean(promotionLabel) ||
                    (booking.status === 'price_proposed' && Boolean(priceOfferTimeLeft)) ||
                    (booking.status === 'confirmed' && Boolean(freeCancelLabel)) ||
                    (booking.status === 'confirmed' && !freeCancelLabel && !isPast) ||
                    depositPercent > 0 ||
                    depositAmount > 0 ||
                    (depositAmount > 0 && Boolean(depositStatusLabel)) ||
                    Boolean(criticalHoldLabel)
                  const nextAction = booking.nextAction ?? null

                  return (
                    <div
                      className={`booking-item${
                        focusedBookingId === booking.id ? ' is-focus' : ''
                      }`}
                      key={booking.id}
                    >
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
                          </div>
                          <div className="booking-item-service">
                            {booking.serviceName}
                          </div>
                        </div>
                        <div className="booking-item-aside">
                          <div className="booking-item-price">{priceLabel}</div>
                          <span className={`booking-status ${statusTone}`}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                      <div className="booking-item-meta booking-item-meta--row">
                        {scheduledLabel && (
                          <span className="booking-item-meta-segment">
                            <span className="booking-item-meta-icon" aria-hidden="true">
                              <IconCalendar />
                            </span>
                            {scheduledLabel}
                          </span>
                        )}
                        {locationLabel && (
                          <span className="booking-item-meta-segment">
                            {locationLabel}
                          </span>
                        )}
                        {distanceLabel && (
                          <span className="booking-item-meta-segment">
                            <span className="booking-item-meta-icon" aria-hidden="true">
                              <IconRadius />
                            </span>
                            {distanceLabel}
                          </span>
                        )}
                      </div>
                      {hasChips && (
                        <div className="booking-item-chips">
                          {rescheduleMetaLabel && (
                            <div
                              className={`booking-item-meta booking-item-meta--chip ${rescheduleMetaTone}`}
                            >
                              {rescheduleMetaLabel}
                            </div>
                          )}
                          {promotionLabel && (
                            <div className="booking-item-meta booking-item-meta--chip booking-item-meta--highlight">
                              {promotionLabel}
                            </div>
                          )}
                          {booking.status === 'price_proposed' &&
                            priceOfferTimeLeft && (
                              <div className="booking-item-meta booking-item-meta--chip booking-item-meta--highlight">
                                Цена действует: {priceOfferTimeLeft}
                              </div>
                            )}
                          {booking.status === 'confirmed' && freeCancelLabel && (
                            <div className="booking-item-meta booking-item-meta--chip booking-item-meta--highlight">
                              Бесплатная отмена до: {freeCancelLabel}
                            </div>
                          )}
                          {booking.status === 'confirmed' &&
                            !freeCancelLabel &&
                            !isPast && (
                              <div className="booking-item-meta booking-item-meta--chip booking-item-meta--warning">
                                Отмена без бесплатного окна
                              </div>
                            )}
                          {depositPercent > 0 && (
                            <div className="booking-item-meta booking-item-meta--chip">
                              Депозит: {depositPercent}%
                            </div>
                          )}
                          {depositAmount > 0 && (
                            <div className="booking-item-meta booking-item-meta--chip">
                              Депозит к оплате: {formatPrice(depositAmount)}
                            </div>
                          )}
                          {depositAmount > 0 && depositStatusLabel && (
                            <div
                              className={`booking-item-meta booking-item-meta--chip ${depositStatusTone}`}
                            >
                              {depositStatusLabel}
                            </div>
                          )}
                          {criticalHoldLabel && (
                            <div className="booking-item-meta booking-item-meta--chip booking-item-meta--danger">
                              {criticalHoldLabel}
                            </div>
                          )}
                        </div>
                      )}
                      {nextAction && (
                        <NextActionPill
                          action={nextAction}
                          className="booking-action-pill"
                          onClick={() =>
                            handleBookingActionFocus(booking, nextAction.id)
                          }
                        />
                      )}
                      {showActions && (
                        <div className="booking-item-actions">
                          {(booking.chatId || hasExtraDetails) && (
                            <div className="booking-action-row">
                              {booking.chatId && (
                                <button
                                  className="booking-action-icon is-chat"
                                  type="button"
                                  onClick={() => onOpenChat(booking.chatId!)}
                                >
                                  <span
                                    className="booking-action-icon-symbol"
                                    aria-hidden="true"
                                  >
                                    <IconChat />
                                  </span>
                                  Чат
                                </button>
                              )}
                              {hasExtraDetails && (
                                <button
                                  className="booking-action-icon is-ghost"
                                  type="button"
                                  onClick={() =>
                                    setExpandedBookingDetails((current) => ({
                                      ...current,
                                      [booking.id]: !isDetailsOpen,
                                    }))
                                  }
                                >
                                  {isDetailsOpen ? 'Скрыть' : 'Подробнее'}
                                </button>
                              )}
                            </div>
                          )}
                          {reschedulePending && (
                            <div className="booking-action-row booking-action-row--top">
                              {canRespondReschedule && (
                                <>
                                  <button
                                    className="booking-action-icon is-accept"
                                    type="button"
                                    onClick={() =>
                                      handleRescheduleDecision(
                                        booking.id,
                                        'reschedule-accept'
                                      )
                                    }
                                    disabled={isActionLoading}
                                  >
                                    <span
                                      className="booking-action-icon-symbol"
                                      aria-hidden="true"
                                    >
                                      <IconCheck />
                                    </span>
                                    Принять
                                  </button>
                                  <button
                                    className="booking-action-icon is-cancel"
                                    type="button"
                                    onClick={() =>
                                      handleRescheduleDecision(
                                        booking.id,
                                        'reschedule-decline'
                                      )
                                    }
                                    disabled={isActionLoading}
                                  >
                                    <span
                                      className="booking-action-icon-symbol"
                                      aria-hidden="true"
                                    >
                                      <IconClose />
                                    </span>
                                    Отклонить
                                  </button>
                                </>
                              )}
                              {canCancelReschedule && (
                                <button
                                  className="booking-action-icon is-cancel"
                                  type="button"
                                  onClick={() =>
                                    handleRescheduleDecision(
                                      booking.id,
                                      'reschedule-cancel'
                                    )
                                  }
                                  disabled={isActionLoading}
                                >
                                  <span
                                    className="booking-action-icon-symbol"
                                    aria-hidden="true"
                                  >
                                    <IconClose />
                                  </span>
                                  Отменить перенос
                                </button>
                              )}
                            </div>
                          )}
                          {actionVariant && actionVariant !== 'reviewed' && (
                            <div className="booking-action-row booking-action-row--top">
                              {actionVariant === 'reschedule' && (
                                <button
                                  className="booking-action-icon is-reschedule"
                                  type="button"
                                  onClick={() => setRescheduleBooking(booking)}
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
                                    <IconTrash />
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
                      )}
                      {isDetailsOpen && (booking.cityName || booking.districtName) && (
                        <div className="booking-item-meta">
                          {booking.cityName ? booking.cityName : ''}
                          {booking.districtName
                            ? `${booking.cityName ? ' • ' : ''}${booking.districtName}`
                            : ''}
                        </div>
                      )}
                      {isDetailsOpen &&
                        booking.locationType === 'client' &&
                        booking.address && (
                          <div className="booking-item-meta">
                            Адрес: {booking.address}
                          </div>
                        )}
                      {showDepositPay && (
                        <div className="booking-deposit-pay">
                          <div className="booking-deposit-row">
                            <span className="booking-deposit-title">
                              Депозит: {formatPrice(depositAmount)}
                            </span>
                            <button
                              className="booking-deposit-copy"
                              type="button"
                              onClick={() =>
                                handleDepositCopy(
                                  booking.id,
                                  String(depositAmount),
                                  'Сумма депозита скопирована.'
                                )
                              }
                            >
                              Скопировать сумму
                            </button>
                          </div>
                          {depositDetails ? (
                            <div className="booking-deposit-details">
                              <span className="booking-deposit-label">
                                Реквизиты мастера
                              </span>
                              <p className="booking-deposit-text">
                                {depositDetails}
                              </p>
                              <button
                                className="booking-deposit-copy"
                                type="button"
                                onClick={() =>
                                  handleDepositCopy(
                                    booking.id,
                                    depositDetails,
                                    'Реквизиты скопированы.'
                                  )
                                }
                              >
                                Скопировать реквизиты
                              </button>
                            </div>
                          ) : (
                            <p className="booking-deposit-note">
                              Реквизиты мастер пришлёт в чате.
                            </p>
                          )}
                          <p
                            className={`booking-deposit-note${
                              isHoldCritical ? ' is-error' : ''
                            }`}
                          >
                            {isHoldCritical ? criticalHoldLabel : depositHoldLabel}
                          </p>
                          {depositQrUrl && (
                            <div className="booking-deposit-qr">
                              <img src={depositQrUrl} alt="QR для оплаты" />
                            </div>
                          )}
                          {canSubmitDeposit && (
                            <div className="booking-deposit-actions">
                              <input
                                ref={(node) => {
                                  depositInputRefs.current[booking.id] = node
                                }}
                                className="booking-deposit-input"
                                type="file"
                                accept="image/*"
                                onChange={(event) =>
                                  handleDepositProofChange(booking.id, event)
                                }
                                disabled={depositUploadingId === booking.id}
                              />
                              <button
                                className="booking-action is-primary"
                                type="button"
                                onClick={() =>
                                  handleBookingAction(
                                    booking.id,
                                    'client-deposit-submit'
                                  )
                                }
                                disabled={depositUploadingId === booking.id}
                              >
                                Я оплатил
                              </button>
                              <button
                                className="booking-action"
                                type="button"
                                onClick={() =>
                                  depositInputRefs.current[booking.id]?.click()
                                }
                                disabled={depositUploadingId === booking.id}
                              >
                                Приложить чек
                              </button>
                            </div>
                          )}
                          {booking.depositProofUrl && (
                            <div className="booking-deposit-proof">
                              <img
                                src={booking.depositProofUrl}
                                alt="Чек оплаты"
                              />
                            </div>
                          )}
                          {depositUploadingId === booking.id && (
                            <p className="booking-deposit-note">
                              Загружаем чек...
                            </p>
                          )}
                          {depositUploadError[booking.id] && (
                            <p className="booking-deposit-note is-error">
                              {depositUploadError[booking.id]}
                            </p>
                          )}
                          {depositCopyStatus[booking.id] && (
                            <p className="booking-deposit-status" role="status">
                              {depositCopyStatus[booking.id]}
                            </p>
                          )}
                        </div>
                      )}
                      {isDetailsOpen && booking.comment && (
                        <div className="booking-item-comment">{booking.comment}</div>
                      )}
                      {isDetailsOpen && photoItems.length > 0 && (
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
                    }}
                  />
                </div>
              )}
            </>
          )}
      </div>

      <RescheduleSheet
        isOpen={Boolean(rescheduleBooking)}
        booking={rescheduleBooking}
        onClose={() => {
          setRescheduleBooking(null)
          setRescheduleError('')
        }}
        onSubmit={({ proposedAt, note }) => {
          if (!rescheduleBooking) return
          void handleRescheduleSubmit({
            booking: rescheduleBooking,
            proposedAt,
            note,
          })
        }}
        isSubmitting={rescheduleSubmitting}
        error={rescheduleError}
      />

      <ClientBottomNav
        active="requests"
        onHome={onViewHome}
        onChats={onViewChats}
        onRequests={() => {}}
        onProfile={onViewClientProfile}
      />
    </div>
  )
}
