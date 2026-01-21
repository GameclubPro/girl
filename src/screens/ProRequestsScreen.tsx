import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { TrustBadge } from '../components/TrustBadge'
import {
  IconChevron,
  IconClose,
  IconLock,
  IconSwap,
  IconTrash,
  IconUnlock,
} from '../components/icons'
import { categoryItems } from '../data/clientData'
import type {
  Booking,
  MasterProfile,
  ProfileStatus,
  ProProfileSection,
  ServiceRequest,
} from '../types/app'
import { buildBookingStartParam } from '../utils/deeplink'
import { getChatStream } from '../utils/chatStream'
import {
  normalizeScheduleDays,
  parseScheduleRange,
  parseScheduleTimeToMinutes,
} from '../utils/schedule'

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
  pending: 'Ждет подтверждения',
  price_pending: 'Нужна цена',
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

const bookingOutcomeLabelMap: Record<string, string> = {
  on_time: 'Вовремя',
  late: 'Опоздал',
  no_show: 'Не пришёл',
  late_cancel: 'Поздняя отмена',
}

const weekDayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const dayKeyOrder = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DEFAULT_SLOT_RANGE_DAYS = 14
const BOOKING_DURATION_MIN = 60

const getDayKey = (date: Date) => dayKeyOrder[date.getDay()] ?? 'mon'

const addDays = (value: Date, days: number) => {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

const startOfWeek = (value: Date) => {
  const next = new Date(value)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  next.setHours(0, 0, 0, 0)
  return next
}

const toDateKey = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseDateKey = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
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
    day: '2-digit',
    month: 'short',
  }).format(value)

const formatLongDate = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(value)

const formatWeekdayLong = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(value)

const formatMonthTitle = (value: Date) => {
  const raw = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
  }).format(value)
  return raw.replace(/\s?г\.?$/i, '').toUpperCase()
}

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

const formatDistance = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  if (value < 1) {
    return `${Math.round(value * 1000)} м`
  }
  return `${value.toFixed(1).replace('.', ',')} км`
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

const formatCountLabel = (
  value: number,
  one: string,
  few: string,
  many: string
) => {
  const abs = Math.abs(value)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const formatWindowCount = (value: number) =>
  `${value} ${formatCountLabel(value, 'окно', 'окна', 'окон')}`

const formatMinutes = (value: number) => {
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const formatOutcomeLabel = (
  outcome?: string | null,
  lateMinutes?: number | null
) => {
  if (!outcome) return ''
  if (outcome === 'late' && typeof lateMinutes === 'number') {
    return `Опоздал на ${lateMinutes} мин.`
  }
  return bookingOutcomeLabelMap[outcome] ?? outcome
}

const isOutcomePending = (booking: Booking) => {
  if (booking.status !== 'confirmed' || booking.outcome) return false
  const scheduledAt = new Date(booking.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime())) return false
  const duration =
    typeof booking.serviceDuration === 'number' && booking.serviceDuration > 0
      ? booking.serviceDuration
      : BOOKING_DURATION_MIN
  return scheduledAt.getTime() + duration * 60 * 1000 <= Date.now()
}

const getMinutesFromDateTime = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.getHours() * 60 + parsed.getMinutes()
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

const getInitials = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return 'К'
  const parts = normalized.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0] ?? '')
  const joined = letters.join('').toUpperCase()
  if (joined) return joined
  return normalized.slice(0, 2).toUpperCase()
}

type ProRequest = ServiceRequest & {
  responseId?: number | null
  responseStatus?: string | null
  responsePrice?: number | null
  responseComment?: string | null
  responseProposedTime?: string | null
  responseCreatedAt?: string | null
}

type ResponseDraft = {
  price: string
  comment: string
  proposedTime: string
}

type BookingCalendarItem = {
  booking: Booking
  date: Date
  dateKey: string
  timeMs: number
}

type SlotStatus = 'free' | 'closed'

type Slot = {
  id: string
  dateKey: string
  startMinutes: number
  durationMinutes: number
  status: SlotStatus
  reason?: string | null
  createdAt: number
}

type SlotViewStatus = 'free' | 'closed' | 'booked'

type SlotView = {
  id: string
  dateKey: string
  startMinutes: number
  durationMinutes: number
  status: SlotViewStatus
  reason?: string | null
  booking?: Booking
}

type SlotFilter = 'all' | 'free' | 'booked' | 'closed'

type ParsedSlotGroup = {
  date: Date
  dateKey: string
  times: number[]
}

type SlotConfirm =
  | { type: 'delete'; slotId: string; timeLabel: string }
  | { type: 'open'; slotId: string; timeLabel: string }
  | { type: 'cancel-booking'; bookingId: number; timeLabel: string }

type PendingReplace = {
  mode: 'add' | 'paste'
  dateKey: string
  times: number[]
}

const SLOT_DURATION_MIN = 30
const SLOT_TIME_START = 8 * 60
const SLOT_TIME_END = 21 * 60
const SLOT_TIME_STEP = 30

const buildSlotStorageKey = (userId: string) => `pro-slots:${userId}`
const buildSlotSeedKey = (userId: string) => `pro-slots-seeded:${userId}`

const loadSlotsFromStorage = (userId: string) => {
  if (typeof window === 'undefined' || !userId) return []
  try {
    const raw = window.localStorage.getItem(buildSlotStorageKey(userId))
    if (!raw) return []
    const data = JSON.parse(raw) as Slot[]
    if (!Array.isArray(data)) return []
    return data
      .filter(
        (item) =>
          typeof item?.id === 'string' &&
          typeof item?.dateKey === 'string' &&
          typeof item?.startMinutes === 'number' &&
          typeof item?.durationMinutes === 'number' &&
          (item?.status === 'free' || item?.status === 'closed')
      )
      .map((item) => ({
        ...item,
        durationMinutes: SLOT_DURATION_MIN,
      }))
  } catch (error) {
    return []
  }
}

const buildSlotId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const rangesOverlap = (
  startA: number,
  durationA: number,
  startB: number,
  durationB: number
) => startA < startB + durationB && startB < startA + durationA

const parseSlotText = (input: string, baseYear: number) => {
  const lines = input
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const groups: ParsedSlotGroup[] = []

  for (const line of lines) {
    const match = line.match(/^(.+?)[—–-](.+)$/)
    if (!match) {
      return {
        groups: [],
        error: `Не удалось распознать время в строке: "${line}". Проверь формат (например 13:00).`,
      }
    }
    const datePart = match[1]?.trim() ?? ''
    const timePart = match[2]?.trim() ?? ''
    const dateMatch = datePart.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/)
    if (!dateMatch) {
      return {
        groups: [],
        error: `Не удалось распознать дату: "${datePart}". Используйте формат 10.01 или 10.01.2026.`,
      }
    }
    const day = Number(dateMatch[1])
    const month = Number(dateMatch[2])
    const rawYear = dateMatch[3]
    let year = baseYear
    if (rawYear) {
      const numericYear = Number(rawYear)
      year = numericYear < 100 ? 2000 + numericYear : numericYear
    }
    const parsedDate = new Date(year, month - 1, day)
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.getFullYear() !== year ||
      parsedDate.getMonth() !== month - 1 ||
      parsedDate.getDate() !== day
    ) {
      return {
        groups: [],
        error: `Не удалось распознать дату: "${datePart}". Используйте формат 10.01 или 10.01.2026.`,
      }
    }
    const timeMatches = timePart.match(/\d{1,2}:\d{2}/g) ?? []
    if (timeMatches.length === 0) {
      return {
        groups: [],
        error: `Не удалось распознать время в строке: "${line}". Проверь формат (например 13:00).`,
      }
    }
    const times = Array.from(
      new Set(
        timeMatches
          .map((time) => parseScheduleTimeToMinutes(time))
          .filter((time): time is number => time !== null)
      )
    ).sort((a, b) => a - b)
    if (times.length === 0) {
      return {
        groups: [],
        error: `Не удалось распознать время в строке: "${line}". Проверь формат (например 13:00).`,
      }
    }
    groups.push({
      date: parsedDate,
      dateKey: toDateKey(parsedDate),
      times,
    })
  }

  return { groups, error: '' }
}

type ProRequestsScreenProps = {
  apiBase: string
  userId: string
  initialTab?: 'requests' | 'bookings'
  onBack: () => void
  onEditProfile: (section?: ProProfileSection) => void
  onViewChats: () => void
  onOpenChat: (chatId: number) => void
}

export const ProRequestsScreen = ({
  apiBase,
  userId,
  initialTab,
  onBack,
  onEditProfile,
  onViewChats,
  onOpenChat,
}: ProRequestsScreenProps) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'bookings'>(
    () => initialTab ?? 'requests'
  )
  const [requests, setRequests] = useState<ProRequest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState<Record<number, string>>({})
  const [submitSuccess, setSubmitSuccess] = useState<Record<number, string>>({})
  const [submittingId, setSubmittingId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, ResponseDraft>>({})
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [isActive, setIsActive] = useState(true)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [isBookingsLoading, setIsBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState('')
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [bookingActionId, setBookingActionId] = useState<number | null>(null)
  const [bookingActionError, setBookingActionError] = useState<
    Record<number, string>
  >({})
  const [bookingDrafts, setBookingDrafts] = useState<Record<number, string>>({})
  const [weekStartDate, setWeekStartDate] = useState(() =>
    startOfWeek(new Date())
  )
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  })
  const [calendarInitialized, setCalendarInitialized] = useState(false)
  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate])
  const [shareMode, setShareMode] = useState<'general' | 'day'>('general')
  const [shareStatus, setShareStatus] = useState('')
  const shareTimerRef = useRef<number | null>(null)
  const slotNoticeTimerRef = useRef<number | null>(null)
  const slotsSectionRef = useRef<HTMLDivElement | null>(null)
  const shareBase = (import.meta.env.VITE_TG_APP_URL ?? '').trim()
  const shareConfigured = Boolean(shareBase)
  const [profileScheduleDays, setProfileScheduleDays] = useState<string[]>([])
  const [profileScheduleStart, setProfileScheduleStart] = useState<number | null>(
    null
  )
  const [profileScheduleEnd, setProfileScheduleEnd] = useState<number | null>(null)
  const [scheduleLoaded, setScheduleLoaded] = useState(false)
  const [hasSeededSlots, setHasSeededSlots] = useState(false)
  const [slots, setSlots] = useState<Slot[]>(() => loadSlotsFromStorage(userId))
  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all')
  const [slotNotice, setSlotNotice] = useState('')
  const [slotConfirm, setSlotConfirm] = useState<SlotConfirm | null>(null)
  const [isAddSlotsOpen, setIsAddSlotsOpen] = useState(false)
  const [selectedTimes, setSelectedTimes] = useState<number[]>([])
  const [addSlotsError, setAddSlotsError] = useState('')
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(
    null
  )
  const [rescheduleBookingId, setRescheduleBookingId] = useState<number | null>(
    null
  )
  const [slotDetailId, setSlotDetailId] = useState<number | null>(null)
  const [isPasteSlotsOpen, setIsPasteSlotsOpen] = useState(false)
  const [pasteInput, setPasteInput] = useState('')
  const [pastePreview, setPastePreview] = useState<ParsedSlotGroup[] | null>(
    null
  )
  const [pasteError, setPasteError] = useState('')
  const bookingStartParam = useMemo(
    () => buildBookingStartParam(userId),
    [userId]
  )
  const shareLink = useMemo(
    () => {
      if (!shareBase) return ''
      const baseLink = buildShareLink(shareBase, bookingStartParam)
      if (!baseLink) return ''
      if (shareMode !== 'day') return baseLink
      const joiner = baseLink.includes('?') ? '&' : '?'
      return `${baseLink}${joiner}date=${selectedDateKey}`
    },
    [bookingStartParam, shareBase, shareMode, selectedDateKey]
  )
  const stream = useMemo(() => getChatStream(apiBase, userId), [apiBase, userId])

  useEffect(() => {
    if (!initialTab) return
    setActiveTab(initialTab)
  }, [initialTab])
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return
    const seedKey = buildSlotSeedKey(userId)
    setHasSeededSlots(window.localStorage.getItem(seedKey) === '1')
  }, [userId])
  const shareText =
    'Запись к мастеру\nОткройте ссылку, чтобы выбрать услугу и время.'
  const shareUrl = shareLink ? buildTelegramShareUrl(shareLink, shareText) : ''

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadProfile = async () => {
      try {
        const response = await fetch(
          `${apiBase}/api/masters/${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load master profile failed')
        }
        const data = (await response.json()) as MasterProfile
        if (cancelled) return
        const days = normalizeScheduleDays(
          Array.isArray(data.scheduleDays) ? data.scheduleDays : []
        )
        setProfileScheduleDays(days)
        const rawScheduleStart = data.scheduleStart ?? ''
        const rawScheduleEnd = data.scheduleEnd ?? ''
        let startMinutes = parseScheduleTimeToMinutes(rawScheduleStart)
        let endMinutes = parseScheduleTimeToMinutes(rawScheduleEnd)
        if (endMinutes === null && rawScheduleStart) {
          const range = parseScheduleRange(rawScheduleStart)
          if (range) {
            startMinutes = range.start
            endMinutes = range.end
          }
        }
        setProfileScheduleStart(startMinutes)
        setProfileScheduleEnd(endMinutes)
      } catch (error) {
        if (!cancelled) {
          setProfileScheduleDays([])
          setProfileScheduleStart(null)
          setProfileScheduleEnd(null)
        }
      } finally {
        if (!cancelled) {
          setScheduleLoaded(true)
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadRequests = async () => {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch(
          `${apiBase}/api/pro/requests?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load pro requests failed')
        }
        const data = (await response.json()) as
          | ProRequest[]
          | {
              profileStatus?: ProfileStatus
              missingFields?: string[]
              isActive?: boolean
              requests?: ProRequest[]
            }
        if (cancelled) return

        const requestItems = Array.isArray(data) ? data : data.requests ?? []
        const nextMissing = Array.isArray(data) ? [] : data.missingFields ?? []
        const nextActive = Array.isArray(data) ? true : data.isActive ?? true

        setRequests(requestItems)
        setMissingFields(nextMissing)
        setIsActive(nextActive)
        setDrafts((current) => {
          const nextDrafts = { ...current }
          requestItems.forEach((item) => {
            if (!nextDrafts[item.id]) {
              nextDrafts[item.id] = {
                price:
                  item.responsePrice !== null && item.responsePrice !== undefined
                    ? String(item.responsePrice)
                    : '',
                comment: item.responseComment ?? '',
                proposedTime: item.responseProposedTime ?? '',
              }
            }
          })
          return nextDrafts
        })
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
    if (!userId || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(buildSlotStorageKey(userId), JSON.stringify(slots))
    } catch (error) {
      // ignore storage errors
    }
  }, [slots, userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

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
        const data = (await response.json()) as Booking[]
        if (cancelled) return
        const bookingItems = Array.isArray(data) ? data : []
        setBookings(bookingItems)
        setBookingDrafts((current) => {
          const next = { ...current }
          bookingItems.forEach((booking) => {
            if (next[booking.id] === undefined) {
              next[booking.id] =
                typeof booking.proposedPrice === 'number'
                  ? String(booking.proposedPrice)
                  : ''
            }
          })
          return next
        })
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

  useEffect(() => {
    const unsubscribe = stream.subscribe((payload) => {
      if (payload?.type === 'trust:update') {
        const trustUserId =
          typeof payload.userId === 'string' ? payload.userId : null
        const trust =
          payload.trust && typeof payload.trust === 'object'
            ? (payload.trust as Booking['clientTrust'])
            : null
        if (!trustUserId || !trust) return
        setBookings((current) =>
          current.map((booking) =>
            booking.clientId === trustUserId
              ? { ...booking, clientTrust: trust }
              : booking
          )
        )
        return
      }
      if (payload?.type === 'message:new') {
        const message = payload.message as { meta?: Record<string, unknown> } | undefined
        const meta = message?.meta
        if (!meta || typeof meta !== 'object') return
        if (meta.event !== 'booking_outcome_marked') return
        const rawId = meta.bookingId
        const bookingId = typeof rawId === 'number' ? rawId : Number(rawId)
        if (!Number.isInteger(bookingId)) return
        const outcome = typeof meta.outcome === 'string' ? meta.outcome : ''
        const lateMinutes =
          typeof meta.lateMinutes === 'number' ? meta.lateMinutes : null
        if (!outcome) return
        setBookings((current) =>
          current.map((booking) =>
            booking.id === bookingId
              ? { ...booking, outcome, lateMinutes }
              : booking
          )
        )
      }
    })

    return () => {
      unsubscribe()
    }
  }, [stream])

  useEffect(() => {
    return () => {
      if (shareTimerRef.current) {
        window.clearTimeout(shareTimerRef.current)
      }
      if (slotNoticeTimerRef.current) {
        window.clearTimeout(slotNoticeTimerRef.current)
      }
    }
  }, [])

  const items = useMemo(() => requests, [requests])
  const bookingItems = useMemo(() => bookings, [bookings])
  const pendingBookingItems = useMemo(
    () =>
      bookingItems.filter((booking) =>
        ['pending', 'price_pending', 'price_proposed'].includes(booking.status)
      ),
    [bookingItems]
  )
  const confirmedBookingItems = useMemo(
    () => bookingItems.filter((booking) => booking.status === 'confirmed'),
    [bookingItems]
  )
  const archivedBookingItems = useMemo(
    () =>
      bookingItems.filter((booking) =>
        ['declined', 'cancelled'].includes(booking.status)
      ),
    [bookingItems]
  )
  const bookingCalendarItems = useMemo(() => {
    return confirmedBookingItems
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
  }, [confirmedBookingItems])
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
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>()
    slots.forEach((slot) => {
      const list = map.get(slot.dateKey)
      if (list) {
        list.push(slot)
      } else {
        map.set(slot.dateKey, [slot])
      }
    })
    return map
  }, [slots])
  const bookingRangesByDate = useMemo(() => {
    const map = new Map<
      string,
      { startMinutes: number; durationMinutes: number; booking: Booking }[]
    >()
    bookingCalendarItems.forEach((item) => {
      const startMinutes = getMinutesFromDateTime(item.booking.scheduledAt)
      if (startMinutes === null) return
      const durationMinutes = item.booking.serviceDuration ?? BOOKING_DURATION_MIN
      const list = map.get(item.dateKey)
      const range = { startMinutes, durationMinutes, booking: item.booking }
      if (list) {
        list.push(range)
      } else {
        map.set(item.dateKey, [range])
      }
    })
    return map
  }, [bookingCalendarItems])

  const applySlotTimes = (
    dateKey: string,
    times: number[],
    options?: { replaceClosed?: boolean }
  ) => {
    const replaceClosed = options?.replaceClosed ?? false
    const uniqueTimes = Array.from(new Set(times)).sort((a, b) => a - b)
    if (uniqueTimes.length === 0) return
    setSlots((current) => {
      let next = [...current]
      uniqueTimes.forEach((time) => {
        const overlaps = next.filter(
          (slot) =>
            slot.dateKey === dateKey &&
            rangesOverlap(time, SLOT_DURATION_MIN, slot.startMinutes, slot.durationMinutes)
        )
        const hasFree = overlaps.some((slot) => slot.status === 'free')
        const hasClosed = overlaps.some((slot) => slot.status === 'closed')
        if (hasFree) return
        if (hasClosed && !replaceClosed) return
        if (hasClosed && replaceClosed) {
          next = next.filter(
            (slot) =>
              !(
                slot.dateKey === dateKey &&
                slot.status === 'closed' &&
                rangesOverlap(
                  time,
                  SLOT_DURATION_MIN,
                  slot.startMinutes,
                  slot.durationMinutes
                )
              )
          )
        }
        next.push({
          id: buildSlotId(),
          dateKey,
          startMinutes: time,
          durationMinutes: SLOT_DURATION_MIN,
          status: 'free',
          reason: null,
          createdAt: Date.now(),
        })
      })
      return next
    })
  }
  const seedSlotsFromSchedule = useCallback(
    (options?: { force?: boolean; replaceClosed?: boolean }) => {
      if (!userId || typeof window === 'undefined') return 0
      if (!scheduleLoaded) return 0
      if (!options?.force && hasSeededSlots && slots.length > 0) return 0
      if (profileScheduleDays.length === 0) return 0
      if (profileScheduleStart === null || profileScheduleEnd === null) return 0
      if (profileScheduleEnd <= profileScheduleStart) return 0
      if (isBookingsLoading) return 0

      const daySet = new Set(profileScheduleDays)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const availableCount = Math.floor(
        (profileScheduleEnd - profileScheduleStart) / SLOT_TIME_STEP
      )
      if (availableCount <= 0) return 0

      window.localStorage.setItem(buildSlotSeedKey(userId), '1')
      setHasSeededSlots(true)

      let added = 0
      for (let offset = 0; offset < DEFAULT_SLOT_RANGE_DAYS; offset += 1) {
        const date = addDays(today, offset)
        const dayKey = getDayKey(date)
        if (!daySet.has(dayKey)) continue
        const dateKey = toDateKey(date)
        const bookedRanges = bookingRangesByDate.get(dateKey) ?? []
        const times: number[] = []
        for (
          let time = profileScheduleStart;
          time + SLOT_TIME_STEP <= profileScheduleEnd;
          time += SLOT_TIME_STEP
        ) {
          times.push(time)
        }
        const filtered = times.filter(
          (time) =>
            !bookedRanges.some((range) =>
              rangesOverlap(
                time,
                SLOT_DURATION_MIN,
                range.startMinutes,
                range.durationMinutes
              )
            )
        )
        if (filtered.length > 0) {
          applySlotTimes(dateKey, filtered, {
            replaceClosed: options?.replaceClosed ?? false,
          })
          added += filtered.length
        }
      }
      return added
    },
    [
      applySlotTimes,
      bookingRangesByDate,
      hasSeededSlots,
      isBookingsLoading,
      profileScheduleDays,
      profileScheduleEnd,
      profileScheduleStart,
      scheduleLoaded,
      slots.length,
      userId,
    ]
  )

  useEffect(() => {
    seedSlotsFromSchedule()
  }, [seedSlotsFromSchedule])
  const selectedBookings = useMemo(
    () => bookingsByDate.get(selectedDateKey) ?? [],
    [bookingsByDate, selectedDateKey]
  )
  const selectedSlots = useMemo(
    () => slotsByDate.get(selectedDateKey) ?? [],
    [slotsByDate, selectedDateKey]
  )
  const rescheduleBooking = useMemo(
    () => bookingItems.find((booking) => booking.id === rescheduleBookingId) ?? null,
    [bookingItems, rescheduleBookingId]
  )
  const isRescheduleMode = Boolean(rescheduleBooking)
  const selectedSlotViews = useMemo(() => {
    const manualViews: SlotView[] = selectedSlots.map((slot) => ({
      id: slot.id,
      dateKey: slot.dateKey,
      startMinutes: slot.startMinutes,
      durationMinutes: slot.durationMinutes,
      status: slot.status === 'free' ? 'free' : 'closed',
      reason: slot.reason ?? null,
    }))
    const bookedViews: SlotView[] = (bookingRangesByDate.get(selectedDateKey) ?? [])
      .map((range) => ({
        id: `booking-${range.booking.id}`,
        dateKey: selectedDateKey,
        startMinutes: range.startMinutes,
        durationMinutes: range.durationMinutes,
        status: 'booked' as const,
        booking: range.booking,
      }))
    return [...manualViews, ...bookedViews].sort(
      (a, b) => a.startMinutes - b.startMinutes
    )
  }, [bookingRangesByDate, selectedDateKey, selectedSlots])
  const filteredSlotViews = useMemo(() => {
    if (slotFilter === 'all') return selectedSlotViews
    return selectedSlotViews.filter((slot) => slot.status === slotFilter)
  }, [selectedSlotViews, slotFilter])
  const slotStats = useMemo(() => {
    let free = 0
    let booked = 0
    let closed = 0
    selectedSlotViews.forEach((slot) => {
      if (slot.status === 'free') free += 1
      if (slot.status === 'booked') booked += 1
      if (slot.status === 'closed') closed += 1
    })
    return { free, booked, closed }
  }, [selectedSlotViews])
  const slotConfirmContent = useMemo(() => {
    if (!slotConfirm) return null
    if (slotConfirm.type === 'delete') {
      return {
        title: `Удалить окно ${slotConfirm.timeLabel}?`,
        confirmLabel: 'Удалить',
        cancelLabel: 'Отмена',
        tone: 'is-danger',
      }
    }
    if (slotConfirm.type === 'open') {
      return {
        title: `Открыть окно ${slotConfirm.timeLabel} для записи?`,
        confirmLabel: 'Открыть',
        cancelLabel: 'Отмена',
        tone: 'is-primary',
      }
    }
    return {
      title: 'Отменить запись клиента?',
      confirmLabel: 'Отменить запись',
      cancelLabel: 'Назад',
      tone: 'is-danger',
    }
  }, [slotConfirm])
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
  const selectedDayTitle = useMemo(
    () => `${formatLongDate(selectedDate)}, ${formatWeekdayLong(selectedDate)}`,
    [selectedDate]
  )
  const todayKey = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return toDateKey(today)
  }, [])
  const timeGrid = useMemo(() => {
    const items: number[] = []
    for (let time = SLOT_TIME_START; time < SLOT_TIME_END; time += SLOT_TIME_STEP) {
      items.push(time)
    }
    return items
  }, [])
  const timeSlotStates = useMemo(() => {
    const bookedRanges = bookingRangesByDate.get(selectedDateKey) ?? []
    const dateSlots = selectedSlots
    return timeGrid.map((time) => {
      const overlapsBooking = bookedRanges.some((range) =>
        rangesOverlap(time, SLOT_DURATION_MIN, range.startMinutes, range.durationMinutes)
      )
      const overlappingSlot = dateSlots.find((slot) =>
        rangesOverlap(time, SLOT_DURATION_MIN, slot.startMinutes, slot.durationMinutes)
      )
      const isClosed = overlappingSlot?.status === 'closed'
      const isFreeExisting = overlappingSlot?.status === 'free'
      return {
        time,
        isBooked: overlapsBooking,
        isClosed,
        isFreeExisting,
      }
    })
  }, [bookingRangesByDate, selectedDateKey, selectedSlots, timeGrid])

  useEffect(() => {
    if (calendarInitialized) return
    if (bookingCalendarItems.length > 0) return
    if (slots.length === 0) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let nextDate: Date | null = null
    let earliestDate: Date | null = null

    slotsByDate.forEach((_value, key) => {
      const date = parseDateKey(key)
      if (!date) return
      if (!earliestDate || date < earliestDate) {
        earliestDate = date
      }
      if (date >= today && (!nextDate || date < nextDate)) {
        nextDate = date
      }
    })

    const targetDate = nextDate ?? earliestDate
    if (!targetDate) return
    setSelectedDate(targetDate)
    setWeekStartDate(startOfWeek(targetDate))
    setCalendarInitialized(true)
  }, [bookingCalendarItems.length, calendarInitialized, slots.length, slotsByDate])

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

  const scrollToSlots = () => {
    if (typeof window === 'undefined') return
    const node = slotsSectionRef.current
    if (!node) return
    window.requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const handleSelectDate = (date: Date, options?: { scroll?: boolean }) => {
    setSelectedDate(date)
    setCalendarInitialized(true)
    setSlotConfirm(null)
    setSlotDetailId(null)
    if (options?.scroll === false) return
    scrollToSlots()
  }

  const handleShiftWeek = (direction: number) => {
    setWeekStartDate((current) => addDays(current, direction * 7))
    setSelectedDate((current) => addDays(current, direction * 7))
    setCalendarInitialized(true)
  }

  const setShareMessage = (message: string) => {
    setShareStatus(message)
    if (shareTimerRef.current) {
      window.clearTimeout(shareTimerRef.current)
    }
    shareTimerRef.current = window.setTimeout(() => {
      setShareStatus('')
    }, 2400)
  }

  const setSlotMessage = (message: string) => {
    setSlotNotice(message)
    if (slotNoticeTimerRef.current) {
      window.clearTimeout(slotNoticeTimerRef.current)
    }
    slotNoticeTimerRef.current = window.setTimeout(() => {
      setSlotNotice('')
    }, 2400)
  }

  const handleAutoFillSlots = () => {
    if (!scheduleLoaded) {
      setSlotMessage('Загружаем график...')
      return
    }
    if (profileScheduleDays.length === 0) {
      setSlotMessage('Заполните график в профиле.')
      return
    }
    if (
      profileScheduleStart === null ||
      profileScheduleEnd === null ||
      profileScheduleEnd <= profileScheduleStart
    ) {
      setSlotMessage('Проверьте время графика в профиле.')
      return
    }
    if (isBookingsLoading) {
      setSlotMessage('Загружаем записи...')
      return
    }
    const added = seedSlotsFromSchedule({ force: true, replaceClosed: true })
    if (added > 0) {
      setSlotMessage('Окна заполнены по графику.')
    } else {
      setSlotMessage('Свободных окон по графику нет.')
    }
    scrollToSlots()
  }

  const handleResetLocalSlots = () => {
    if (!userId || typeof window === 'undefined') {
      setSlotMessage('Недоступно на этом устройстве.')
      return
    }
    try {
      window.localStorage.removeItem(buildSlotStorageKey(userId))
      window.localStorage.removeItem(buildSlotSeedKey(userId))
    } catch (error) {
      // ignore storage errors
    }
    setSlots([])
    setSelectedTimes([])
    setSlotConfirm(null)
    setSlotDetailId(null)
    setHasSeededSlots(false)
    handleAutoFillSlots()
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

  const handleOpenAddSlots = (options?: { rescheduleBookingId?: number | null }) => {
    setRescheduleBookingId(options?.rescheduleBookingId ?? null)
    setSelectedTimes([])
    setAddSlotsError('')
    setPendingReplace(null)
    setIsAddSlotsOpen(true)
  }

  const handleCloseAddSlots = () => {
    setIsAddSlotsOpen(false)
    setSelectedTimes([])
    setAddSlotsError('')
    setPendingReplace(null)
    setRescheduleBookingId(null)
  }

  const handleOpenPasteSlots = () => {
    setPasteInput('')
    setPastePreview(null)
    setPasteError('')
    setIsPasteSlotsOpen(true)
  }

  const handleClosePasteSlots = () => {
    setIsPasteSlotsOpen(false)
    setPastePreview(null)
    setPasteError('')
  }

  const toggleTimeSelection = (time: number) => {
    setSelectedTimes((current) => {
      if (isRescheduleMode) {
        return current[0] === time ? [] : [time]
      }
      if (current.includes(time)) {
        return current.filter((item) => item !== time)
      }
      return [...current, time].sort((a, b) => a - b)
    })
  }

  const handlePresetSelect = (range: { start: number; end: number }) => {
    if (isRescheduleMode) return
    const nextTimes = timeSlotStates
      .filter(
        (state) =>
          state.time >= range.start &&
          state.time < range.end &&
          !state.isBooked &&
          !state.isFreeExisting
      )
      .map((state) => state.time)
    setSelectedTimes(nextTimes)
  }

  const handleSelectAllTimes = () => {
    if (isRescheduleMode) return
    const nextTimes = timeSlotStates
      .filter((state) => !state.isBooked && !state.isFreeExisting)
      .map((state) => state.time)
    setSelectedTimes(nextTimes)
  }

  const handleClearTimes = () => {
    setSelectedTimes([])
  }

  const handleRescheduleBooking = (newTime: number) => {
    if (!rescheduleBooking) return
    const oldMinutes = getMinutesFromDateTime(rescheduleBooking.scheduledAt)
    const oldDate = parseDateOnly(rescheduleBooking.scheduledAt)
    const updatedDate = new Date(selectedDate)
    updatedDate.setHours(Math.floor(newTime / 60), newTime % 60, 0, 0)
    const updatedScheduledAt = updatedDate.toISOString()
    setBookings((current) =>
      current.map((booking) =>
        booking.id === rescheduleBooking.id
          ? { ...booking, scheduledAt: updatedScheduledAt }
          : booking
      )
    )
    setSlots((current) => {
      let next = current.filter(
        (slot) =>
          !(
            slot.dateKey === selectedDateKey &&
            slot.status === 'free' &&
            rangesOverlap(
              newTime,
              SLOT_DURATION_MIN,
              slot.startMinutes,
              slot.durationMinutes
            )
          )
      )
      if (oldDate && oldMinutes !== null) {
        const oldKey = toDateKey(oldDate)
        const hasOverlap = next.some(
          (slot) =>
            slot.dateKey === oldKey &&
            rangesOverlap(
              oldMinutes,
              SLOT_DURATION_MIN,
              slot.startMinutes,
              slot.durationMinutes
            )
        )
        if (!hasOverlap) {
          next = [
            ...next,
            {
              id: buildSlotId(),
              dateKey: oldKey,
              startMinutes: oldMinutes,
              durationMinutes: SLOT_DURATION_MIN,
              status: 'free',
              reason: null,
              createdAt: Date.now(),
            },
          ]
        }
      }
      return next
    })
    setSlotMessage('Запись перенесена.')
    handleCloseAddSlots()
  }

  const handleSaveSlots = () => {
    setAddSlotsError('')
    const uniqueTimes = Array.from(new Set(selectedTimes)).sort((a, b) => a - b)
    if (uniqueTimes.length === 0) {
      setAddSlotsError('Выберите хотя бы одно окно.')
      return
    }
    const bookedRanges = bookingRangesByDate.get(selectedDateKey) ?? []
    const availableTimes = uniqueTimes.filter(
      (time) =>
        !bookedRanges.some((range) =>
          rangesOverlap(time, SLOT_DURATION_MIN, range.startMinutes, range.durationMinutes)
        )
    )
    if (availableTimes.length !== uniqueTimes.length) {
      setAddSlotsError('Это время уже занято записью.')
    }
    if (availableTimes.length === 0) return

    const closedSlots = selectedSlots.filter((slot) => slot.status === 'closed')
    const closedOverlaps = availableTimes.filter((time) =>
      closedSlots.some((slot) =>
        rangesOverlap(time, SLOT_DURATION_MIN, slot.startMinutes, slot.durationMinutes)
      )
    )
    if (isRescheduleMode) {
      if (closedOverlaps.length > 0) {
        setAddSlotsError('Время пересекается с закрытым периодом.')
        return
      }
      handleRescheduleBooking(availableTimes[0])
      return
    }

    if (closedOverlaps.length > 0) {
      setPendingReplace({
        mode: 'add',
        dateKey: selectedDateKey,
        times: availableTimes,
      })
      return
    }

    applySlotTimes(selectedDateKey, availableTimes)
    setSlotMessage('Окна добавлены.')
    handleCloseAddSlots()
  }

  const handleReplaceDecision = (replaceClosed: boolean) => {
    if (!pendingReplace) return
    const dateKey = pendingReplace.dateKey
    const closedSlots = (slotsByDate.get(dateKey) ?? []).filter(
      (slot) => slot.status === 'closed'
    )
    const candidateTimes = pendingReplace.times
    const finalTimes = replaceClosed
      ? candidateTimes
      : candidateTimes.filter(
          (time) =>
            !closedSlots.some((slot) =>
              rangesOverlap(
                time,
                SLOT_DURATION_MIN,
                slot.startMinutes,
                slot.durationMinutes
              )
            )
        )
    setPendingReplace(null)
    if (finalTimes.length === 0) {
      setAddSlotsError('Время пересекается с закрытым периодом.')
      return
    }
    applySlotTimes(dateKey, finalTimes, { replaceClosed })
    setSlotMessage('Окна добавлены.')
    handleCloseAddSlots()
  }

  const handleParsePaste = () => {
    setPasteError('')
    const result = parseSlotText(pasteInput, selectedDate.getFullYear())
    if (result.error) {
      setPasteError(result.error)
      setPastePreview(null)
      return
    }
    setPastePreview(result.groups)
  }

  const handleSavePaste = () => {
    if (!pastePreview || pastePreview.length === 0) {
      setPasteError('Выберите хотя бы одно окно.')
      return
    }
    let savedSlots = 0
    let bookingConflict = false
    let closedConflict = false
    pastePreview.forEach((group) => {
      const bookedRanges = bookingRangesByDate.get(group.dateKey) ?? []
      const dateSlots = slotsByDate.get(group.dateKey) ?? []
      const closedSlots = dateSlots.filter((slot) => slot.status === 'closed')
      const freeSlots = dateSlots.filter((slot) => slot.status === 'free')
      const availableTimes = group.times.filter((time) => {
        if (
          bookedRanges.some((range) =>
            rangesOverlap(time, SLOT_DURATION_MIN, range.startMinutes, range.durationMinutes)
          )
        ) {
          bookingConflict = true
          return false
        }
        if (
          closedSlots.some((slot) =>
            rangesOverlap(time, SLOT_DURATION_MIN, slot.startMinutes, slot.durationMinutes)
          )
        ) {
          closedConflict = true
          return false
        }
        if (
          freeSlots.some((slot) =>
            rangesOverlap(time, SLOT_DURATION_MIN, slot.startMinutes, slot.durationMinutes)
          )
        ) {
          return false
        }
        return true
      })
      if (availableTimes.length > 0) {
        applySlotTimes(group.dateKey, availableTimes)
        savedSlots += availableTimes.length
      }
    })
    if (savedSlots === 0) {
      if (bookingConflict) {
        setPasteError('Это время уже занято записью.')
        return
      }
      if (closedConflict) {
        setPasteError('Время пересекается с закрытым периодом.')
        return
      }
      setPasteError('Выберите хотя бы одно окно.')
      return
    }
    setSlotMessage('Окна добавлены.')
    handleClosePasteSlots()
  }

  const handleCloseSlot = (slotId: string) => {
    setSlots((current) =>
      current.map((slot) =>
        slot.id === slotId
          ? { ...slot, status: 'closed', reason: slot.reason ?? 'Закрыто мастером' }
          : slot
      )
    )
  }

  const handleOpenSlot = (slotId: string) => {
    setSlots((current) =>
      current.map((slot) =>
        slot.id === slotId ? { ...slot, status: 'free', reason: null } : slot
      )
    )
    setSlotMessage('Окно открыто.')
  }

  const handleDeleteSlot = (slotId: string) => {
    setSlots((current) => current.filter((slot) => slot.id !== slotId))
  }

  const handleCancelBooking = (bookingId: number) => {
    const booking = bookingItems.find((item) => item.id === bookingId)
    setBookings((current) =>
      current.map((item) =>
        item.id === bookingId ? { ...item, status: 'cancelled' } : item
      )
    )
    if (booking) {
      const date = parseDateOnly(booking.scheduledAt)
      const minutes = getMinutesFromDateTime(booking.scheduledAt)
      if (date && minutes !== null) {
        applySlotTimes(toDateKey(date), [minutes])
      }
    }
    setSlotMessage('Запись отменена.')
  }

  const handleConfirmSlotAction = () => {
    if (!slotConfirm) return
    if (slotConfirm.type === 'delete') {
      handleDeleteSlot(slotConfirm.slotId)
    }
    if (slotConfirm.type === 'open') {
      handleOpenSlot(slotConfirm.slotId)
    }
    if (slotConfirm.type === 'cancel-booking') {
      handleCancelBooking(slotConfirm.bookingId)
    }
    setSlotConfirm(null)
  }

  const missingLabels = useMemo(() => {
    const labels: string[] = []
    if (missingFields.includes('displayName')) {
      labels.push('Имя и специализация')
    }
    if (missingFields.includes('categories')) {
      labels.push('Категории услуг')
    }
    if (
      missingFields.includes('cityId') ||
      missingFields.includes('districtId')
    ) {
      labels.push('Город и район')
    }
    if (missingFields.includes('workFormat')) {
      labels.push('Формат работы')
    }
    return labels
  }, [missingFields])
  const missingSummary =
    missingLabels.length > 0 ? missingLabels.join(', ') : 'минимум профиля'
  const hasActiveRequests = items.length > 0
  const hasPendingBookings = pendingBookingItems.length > 0
  const showRequestsEmpty =
    !isLoading &&
    !isBookingsLoading &&
    !hasActiveRequests &&
    !hasPendingBookings &&
    !loadError &&
    !bookingsError
  const historySectionId = 'pro-requests-history'
  const historyToggleLabel = isHistoryOpen ? 'Свернуть' : 'Показать'
  const renderShareCard = () => (
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
        <div className="pro-cabinet-share-toggle" role="group" aria-label="Тип ссылки">
          <button
            className={`pro-cabinet-share-toggle-btn${
              shareMode === 'general' ? ' is-active' : ''
            }`}
            type="button"
            onClick={() => setShareMode('general')}
          >
            Общая ссылка
          </button>
          <button
            className={`pro-cabinet-share-toggle-btn${
              shareMode === 'day' ? ' is-active' : ''
            }`}
            type="button"
            onClick={() => setShareMode('day')}
          >
            Ссылка на выбранный день
          </button>
        </div>
        <button
          className="pro-cabinet-share-link"
          type="button"
          onClick={handleCopyLink}
          disabled={!shareLink}
          aria-label="Скопировать ссылку для записи"
        >
          <span className="pro-cabinet-share-link-label">
            {shareMode === 'day' ? 'Ваша ссылка на день' : 'Ваша ссылка'}
          </span>
          {shareMode === 'day' && (
            <span className="pro-cabinet-share-link-note">{selectedDateLabel}</span>
          )}
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
  )
  const renderBookingItem = (booking: Booking, options?: { archived?: boolean }) => {
    const statusLabel =
      bookingStatusLabelMap[booking.status] ?? booking.status
    const statusTone =
      bookingStatusToneMap[booking.status] ?? 'is-waiting'
    const categoryLabel =
      categoryItems.find((category) => category.id === booking.categoryId)
        ?.label ?? booking.categoryId
    const locationLabel =
      locationLabelMap[booking.locationType] ?? 'Не важно'
    const distanceLabel = formatDistance(booking.distanceKm)
    const scheduledLabel = formatDateTime(booking.scheduledAt)
    const hasServicePrice = typeof booking.servicePrice === 'number'
    const priceLabel = hasServicePrice
      ? `Стоимость: ${formatPrice(booking.servicePrice ?? 0)}`
      : typeof booking.proposedPrice === 'number'
        ? `Предложенная цена: ${formatPrice(booking.proposedPrice)}`
        : 'Цена не указана'
    const canAccept = booking.status === 'pending' && hasServicePrice
    const canPropose =
      !hasServicePrice &&
      ['pending', 'price_pending', 'price_proposed'].includes(booking.status)
    const canDecline = [
      'pending',
      'price_pending',
      'price_proposed',
    ].includes(booking.status)
    const isActionLoading = bookingActionId !== null
    const draftPrice = bookingDrafts[booking.id] ?? ''
    const clientName = booking.clientName ?? 'Клиент'
    const clientInitials = getInitials(clientName)
    const outcomeLabel = formatOutcomeLabel(booking.outcome, booking.lateMinutes)
    const canMarkOutcome = isOutcomePending(booking)
    const photoItems = Array.isArray(booking.photoUrls)
      ? booking.photoUrls
      : []

    return (
      <div
        className={`booking-item${options?.archived ? ' is-archived' : ''}`}
        key={booking.id}
      >
        <div className="booking-item-head">
          <span className="booking-item-avatar" aria-hidden="true">
            <span>{clientInitials}</span>
          </span>
          <div className="booking-item-main">
            <div className="booking-item-main-row">
              <div className="booking-item-master">{clientName}</div>
              <TrustBadge
                trust={booking.clientTrust ?? null}
                size="sm"
                className="booking-item-trust"
              />
            </div>
            <div className="booking-item-service">
              {booking.serviceName}
            </div>
          </div>
          <span className={`booking-status ${statusTone}`}>
            {statusLabel}
          </span>
        </div>
        <div className="booking-item-meta">
          {categoryLabel}
          {scheduledLabel ? ` • ${scheduledLabel}` : ''}
        </div>
        <div className="booking-item-meta">
          {locationLabel}
          {booking.cityName ? ` • ${booking.cityName}` : ''}
          {booking.districtName ? ` • ${booking.districtName}` : ''}
          {distanceLabel ? ` • ${distanceLabel}` : ''}
        </div>
        {booking.locationType === 'client' && booking.address && (
          <div className="booking-item-meta">
            Адрес: {booking.address}
          </div>
        )}
        <div className="booking-item-price">{priceLabel}</div>
        {outcomeLabel && (
          <div className="booking-item-outcome">Итог: {outcomeLabel}</div>
        )}
        {booking.comment && (
          <div className="booking-item-comment">
            {booking.comment}
          </div>
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
        {canPropose && (
          <div className="booking-price-form">
            <input
              className="booking-price-input"
              type="number"
              placeholder="Ваша цена, ₽"
              value={draftPrice}
              onChange={(event) =>
                handleBookingDraftChange(booking.id, event.target.value)
              }
              min="0"
              disabled={isActionLoading}
            />
            <button
              className="booking-action is-primary"
              type="button"
              onClick={() =>
                handleBookingAction(
                  booking.id,
                  'master-propose-price',
                  draftPrice
                )
              }
              disabled={isActionLoading}
            >
              {booking.status === 'price_proposed'
                ? 'Обновить цену'
                : 'Предложить цену'}
            </button>
          </div>
        )}
        {(canAccept || canDecline) && (
          <div className="booking-actions">
            {canAccept && (
              <button
                className="booking-action is-primary"
                type="button"
                onClick={() =>
                  handleBookingAction(booking.id, 'master-accept')
                }
                disabled={isActionLoading}
              >
                Подтвердить
              </button>
            )}
            {canDecline && (
              <button
                className="booking-action"
                type="button"
                onClick={() =>
                  handleBookingAction(booking.id, 'master-decline')
                }
                disabled={isActionLoading}
              >
                Отказать
              </button>
            )}
          </div>
        )}
        {canMarkOutcome && (
          <div className="booking-outcome-cta">
            <div className="booking-outcome-main">
              <span className="booking-outcome-title">Отметить визит</span>
              <span className="booking-outcome-subtitle">
                Обновим доверие клиента после отметки.
              </span>
            </div>
            <button
              className="booking-action is-primary booking-outcome-button"
              type="button"
              onClick={() => handleOutcomeOpen(booking)}
              disabled={isActionLoading}
            >
              Отметить
            </button>
          </div>
        )}
        {bookingActionError[booking.id] && (
          <p className="booking-action-error">
            {bookingActionError[booking.id]}
          </p>
        )}
      </div>
    )
  }

  const handleDraftChange = (
    requestId: number,
    field: keyof ResponseDraft,
    value: string
  ) => {
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        ...current[requestId],
        [field]: value,
      },
    }))
  }

  const handleBookingDraftChange = (bookingId: number, value: string) => {
    setBookingDrafts((current) => ({
      ...current,
      [bookingId]: value,
    }))
  }

  const handleBookingAction = async (
    bookingId: number,
    action: 'master-accept' | 'master-decline' | 'master-propose-price',
    price?: string
  ) => {
    if (bookingActionId !== null) return

    if (action === 'master-propose-price') {
      const parsedPrice = Number(price)
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        setBookingActionError((current) => ({
          ...current,
          [bookingId]: 'Укажите корректную цену.',
        }))
        return
      }
    }

    setBookingActionId(bookingId)
    setBookingActionError((current) => ({ ...current, [bookingId]: '' }))

    try {
      const payload: { userId: string; action: string; price?: number } = {
        userId,
        action,
      }
      if (action === 'master-propose-price') {
        payload.price = Number(price)
      }

      const response = await fetch(`${apiBase}/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Booking update failed')
      }

      const data = (await response.json().catch(() => null)) as
        | { status?: Booking['status']; proposedPrice?: number | null }
        | null

      setBookings((current) =>
        current.map((booking) => {
          if (booking.id !== bookingId) return booking
          const next = { ...booking }
          if (data?.status) {
            next.status = data.status
          } else if (action === 'master-accept') {
            next.status = 'confirmed'
          } else if (action === 'master-decline') {
            next.status = 'declined'
          } else if (action === 'master-propose-price') {
            next.status = 'price_proposed'
          }
          if (action === 'master-propose-price') {
            const updatedPrice =
              typeof data?.proposedPrice === 'number'
                ? data.proposedPrice
                : Number(price)
            next.proposedPrice = updatedPrice
          }
          return next
        })
      )
    } catch (error) {
      setBookingActionError((current) => ({
        ...current,
        [bookingId]: 'Не удалось обновить запись.',
      }))
    } finally {
      setBookingActionId((current) => (current === bookingId ? null : current))
    }
  }

  const handleOutcomeOpen = (booking: Booking) => {
    if (typeof booking.chatId === 'number') {
      onOpenChat(booking.chatId)
      return
    }
    setBookingActionError((current) => ({
      ...current,
      [booking.id]: 'Чат ещё создаётся. Откройте список чатов.',
    }))
  }

  const handleSubmit = async (requestId: number) => {
    if (submittingId) return
    if (missingFields.length > 0) {
      setSubmitError((current) => ({
        ...current,
        [requestId]: 'Заполните минимум профиля, чтобы откликаться.',
      }))
      return
    }
    if (!isActive) {
      setSubmitError((current) => ({
        ...current,
        [requestId]: 'Вы на паузе. Включите прием заявок в кабинете.',
      }))
      return
    }
    const draft = drafts[requestId]
    if (!draft) return

    setSubmittingId(requestId)
    setSubmitError((current) => ({ ...current, [requestId]: '' }))
    setSubmitSuccess((current) => ({ ...current, [requestId]: '' }))

    const priceValue = draft.price.trim()
    const hasPrice = priceValue.length > 0
    const hasComment = draft.comment.trim().length > 0
    const hasProposedTime = draft.proposedTime.trim().length > 0

    if (!hasPrice && !hasComment && !hasProposedTime) {
      setSubmitError((current) => ({
        ...current,
        [requestId]: 'Добавьте цену или комментарий.',
      }))
      setSubmittingId(null)
      return
    }

    try {
      const response = await fetch(
        `${apiBase}/api/requests/${requestId}/responses`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            price: hasPrice ? Number(priceValue) : null,
            comment: draft.comment.trim() || null,
            proposedTime: draft.proposedTime.trim() || null,
          }),
        }
      )

      if (response.status === 403) {
        setSubmitError((current) => ({
          ...current,
          [requestId]: 'Эта заявка больше недоступна.',
        }))
        return
      }

      if (response.status === 409) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string; missingFields?: string[] }
          | null
        if (data?.error === 'profile_paused') {
          setIsActive(false)
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Вы на паузе. Включите прием заявок в кабинете.',
          }))
          return
        }
        if (data?.error === 'response_window_closed') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Окно отклика истекло.',
          }))
          return
        }

        if (data?.error === 'response_locked') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Отклик уже принят или отклонен.',
          }))
          return
        }

        if (data?.error === 'request_closed') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Заявка уже закрыта клиентом.',
          }))
          return
        }

        setSubmitError((current) => ({
          ...current,
          [requestId]: 'Заполните минимум профиля, чтобы откликаться.',
        }))
        if (data?.missingFields) {
          setMissingFields(data.missingFields)
        }
        return
      }

      if (!response.ok) {
        throw new Error('Submit response failed')
      }

      setSubmitSuccess((current) => ({
        ...current,
        [requestId]: 'Отклик отправлен.',
      }))

      setRequests((current) =>
        current.map((item) =>
          item.id === requestId
            ? {
                ...item,
                responseStatus: 'sent',
                responsePrice: hasPrice ? Number(priceValue) : null,
                responseComment: draft.comment.trim() || null,
                responseProposedTime: draft.proposedTime.trim() || null,
              }
            : item
        )
      )
    } catch (error) {
      setSubmitError((current) => ({
        ...current,
        [requestId]: 'Не удалось отправить отклик.',
      }))
    } finally {
      setSubmittingId(null)
    }
  }

  return (
    <div className="screen screen--pro screen--pro-requests">
      <div className="pro-shell">
        {!isActive && (
          <div className="pro-banner">
            <div>
              <div className="pro-banner-title">Вы на паузе</div>
              <p className="pro-banner-text">
                Включите прием заявок в кабинете или в профиле.
              </p>
            </div>
            <button
              className="pro-banner-button"
              type="button"
              onClick={() => onEditProfile('availability')}
            >
              Изменить
            </button>
          </div>
        )}
        {missingFields.length > 0 && (
          <div className="pro-banner">
            <div>
              <div className="pro-banner-title">Чтобы откликаться</div>
              <p className="pro-banner-text">
                Заполните профиль: {missingSummary}.
              </p>
            </div>
            <button
              className="pro-banner-button"
              type="button"
              onClick={() => onEditProfile('basic')}
            >
              Заполнить
            </button>
          </div>
        )}
        <div
          className="requests-tabs pro-requests-tabs"
          role="tablist"
          aria-label="Разделы"
        >
          <button
            className={`requests-tab${activeTab === 'requests' ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'requests'}
            onClick={() => setActiveTab('requests')}
          >
            Заявки
            <span className="requests-tab-count">
              {items.length + pendingBookingItems.length}
            </span>
          </button>
          <button
            className={`requests-tab${activeTab === 'bookings' ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'bookings'}
            onClick={() => setActiveTab('bookings')}
          >
            Записи
            <span className="requests-tab-count">
              {confirmedBookingItems.length}
            </span>
          </button>
        </div>

        {activeTab === 'requests' && (
          <>
            {isLoading && <p className="requests-status">Загружаем заявки...</p>}
            {loadError && <p className="requests-error">{loadError}</p>}
            {isBookingsLoading && (
              <p className="requests-status">Загружаем записи...</p>
            )}
            {bookingsError && <p className="requests-error">{bookingsError}</p>}

            {showRequestsEmpty && (
              <p className="requests-empty">
                {!isActive
                  ? 'Вы на паузе. Включите прием заявок.'
                  : missingFields.some((field) => field !== 'displayName')
                  ? 'Заполните профиль, чтобы видеть заявки рядом.'
                  : 'Пока нет заявок и записей на подтверждении.'}
              </p>
            )}
            {showRequestsEmpty && renderShareCard()}

            {items.length > 0 && (
              <div className="requests-section">
                <div className="requests-section-head">
                  <span className="requests-section-title">Входящие заявки</span>
                  <span className="requests-section-count">{items.length}</span>
                </div>
                <div className="requests-list">
                  {items.map((item) => {
                    const categoryLabel =
                      categoryItems.find(
                        (category) => category.id === item.categoryId
                      )?.label ?? item.categoryId
                    const locationLabel =
                      locationLabelMap[item.locationType] ?? 'Не важно'
                    const distanceLabel = formatDistance(item.distanceKm)
                    const dateLabel =
                      item.dateOption === 'choose'
                        ? formatDateTime(item.dateTime) || 'По договоренности'
                        : dateLabelMap[item.dateOption]
                    const statusLabel =
                      item.status === 'open' ? 'Открыта' : 'Закрыта'
                    const clientName = item.clientName?.trim() || 'Клиент'
                    const clientInitials = getInitials(clientName)
                    const tagItems = Array.isArray(item.tags) ? item.tags : []
                    const photoItems = Array.isArray(item.photoUrls)
                      ? item.photoUrls
                      : []
                    const responseStatusLabel = item.responseStatus
                      ? responseStatusLabelMap[
                          item.responseStatus as keyof typeof responseStatusLabelMap
                        ] ?? item.responseStatus
                      : ''
                    const dispatchTimeLeft = formatTimeLeft(item.dispatchExpiresAt)
                    const dispatchBatchLabel = item.dispatchBatch
                      ? `Волна ${item.dispatchBatch}`
                      : ''
                    const isFinalResponse = ['accepted', 'rejected', 'expired'].includes(
                      item.responseStatus ?? ''
                    )
                    const draft = drafts[item.id] ?? {
                      price: '',
                      comment: '',
                      proposedTime: '',
                    }
                    const isSubmitting = submittingId === item.id
                    const canRespond =
                      missingFields.length === 0 &&
                      isActive &&
                      item.status === 'open' &&
                      !isFinalResponse &&
                      (item.responseStatus === 'sent' || Boolean(dispatchTimeLeft))

                    return (
                      <div className="pro-request-item" key={item.id}>
                        <div className="booking-item-head">
                          <span className="booking-item-avatar" aria-hidden="true">
                            <span>{clientInitials}</span>
                          </span>
                          <div className="booking-item-main">
                            <div className="booking-item-main-row">
                              <div className="booking-item-master">{clientName}</div>
                              <TrustBadge
                                trust={item.clientTrust ?? null}
                                size="sm"
                                className="booking-item-trust"
                              />
                            </div>
                            <div className="booking-item-service">
                              {item.serviceName}
                            </div>
                          </div>
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
                          {distanceLabel ? ` • ${distanceLabel}` : ''}
                        </div>
                        <div className="request-item-meta">{dateLabel}</div>
                        {item.status === 'open' &&
                          !item.responseStatus &&
                          (dispatchTimeLeft || dispatchBatchLabel) && (
                            <div className="request-item-meta request-item-meta--hint">
                              {dispatchBatchLabel}
                              {dispatchBatchLabel && dispatchTimeLeft ? ' • ' : ''}
                              {dispatchTimeLeft
                                ? `Осталось ${dispatchTimeLeft} на отклик`
                                : 'Окно отклика истекло'}
                            </div>
                          )}
                        {item.locationType === 'client' && item.address && (
                            <div className="request-item-meta">
                              Адрес: {item.address}
                            </div>
                          )}
                          {tagItems.length > 0 && (
                            <div className="request-tags" role="list">
                              {tagItems.map((tag) => (
                                <span
                                  className="request-chip is-active"
                                  key={`${item.id}-${tag}`}
                                  role="listitem"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {responseStatusLabel && (
                            <div className="request-item-meta">
                              Ваш отклик: {responseStatusLabel}
                            </div>
                          )}
                          {item.responseStatus === 'accepted' && item.chatId && (
                            <button
                              className="request-chat-cta"
                              type="button"
                              onClick={() => onOpenChat(item.chatId!)}
                            >
                              Перейти в чат
                            </button>
                          )}
                          {item.details && (
                            <div className="request-item-details">{item.details}</div>
                          )}
                          {photoItems.length > 0 && (
                            <div className="booking-photo-strip" role="list">
                              {photoItems.map((url, index) => (
                                <span
                                  className="booking-photo-thumb"
                                  key={`${item.id}-photo-${index}`}
                                  role="listitem"
                                >
                                  <img src={url} alt="" loading="lazy" />
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="pro-response-form">
                            <input
                              className="pro-response-input"
                              type="number"
                              placeholder="Ваша цена, ₽"
                              value={draft.price}
                              onChange={(event) =>
                                handleDraftChange(
                                  item.id,
                                  'price',
                                  event.target.value
                                )
                              }
                              min="0"
                              disabled={!canRespond}
                            />
                            <input
                              className="pro-response-input"
                              type="text"
                              placeholder="Предложенное время (опционально)"
                              value={draft.proposedTime}
                              onChange={(event) =>
                                handleDraftChange(
                                  item.id,
                                  'proposedTime',
                                  event.target.value
                                )
                              }
                              disabled={!canRespond}
                            />
                            <textarea
                              className="pro-response-textarea"
                              placeholder="Комментарий для клиента"
                              rows={3}
                              value={draft.comment}
                              onChange={(event) =>
                                handleDraftChange(item.id, 'comment', event.target.value)
                              }
                              disabled={!canRespond}
                            />
                            <button
                              className="pro-response-button"
                              type="button"
                              onClick={() => handleSubmit(item.id)}
                              disabled={isSubmitting || !canRespond}
                            >
                              {isSubmitting
                                ? 'Отправляем...'
                                : item.responseStatus
                                  ? 'Обновить отклик'
                                  : 'Откликнуться'}
                            </button>
                            {submitError[item.id] && (
                              <p className="pro-response-error">
                                {submitError[item.id]}
                              </p>
                            )}
                            {submitSuccess[item.id] && (
                              <p className="pro-response-success">
                                {submitSuccess[item.id]}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {pendingBookingItems.length > 0 && (
                <div className="requests-section">
                  <div className="requests-section-head">
                    <span className="requests-section-title">
                      Записи на подтверждении
                    </span>
                    <span className="requests-section-count">
                      {pendingBookingItems.length}
                    </span>
                  </div>
                  <div className="requests-list booking-list">
                    {pendingBookingItems.map((booking) => renderBookingItem(booking))}
                  </div>
                </div>
              )}

              {archivedBookingItems.length > 0 && (
                <div className="requests-section is-muted">
                  <div className="requests-section-head">
                    <div className="requests-section-title-group">
                      <span className="requests-section-title">История записей</span>
                      <span className="requests-section-count">
                        {archivedBookingItems.length}
                      </span>
                    </div>
                    <button
                      className={`requests-section-toggle${
                        isHistoryOpen ? ' is-open' : ''
                      }`}
                      type="button"
                      onClick={() => setIsHistoryOpen((current) => !current)}
                      aria-expanded={isHistoryOpen}
                      aria-controls={historySectionId}
                    >
                      <span>{historyToggleLabel}</span>
                      <span
                        className="requests-section-toggle-icon"
                        aria-hidden="true"
                      >
                        {isHistoryOpen ? '-' : '+'}
                      </span>
                    </button>
                  </div>
                  {isHistoryOpen && (
                    <div
                      className="requests-list booking-list is-archived"
                      id={historySectionId}
                    >
                      {archivedBookingItems.map((booking) =>
                        renderBookingItem(booking, { archived: true })
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'bookings' && (
            <>
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
                    <span className="booking-calendar-month-label">{monthLabel}</span>
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
                    const bookingCount = summary?.count ?? 0
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
                        {bookingCount > 0 && (
                          <span className="booking-calendar-day-count">
                            {bookingCount}
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
                  <button
                    className="booking-calendar-add"
                    type="button"
                    onClick={() => {
                      scrollToSlots()
                      handleOpenAddSlots()
                    }}
                  >
                    Добавить окна
                  </button>
                  <button
                    className="booking-calendar-auto"
                    type="button"
                    aria-label="Заполнить окна по графику"
                    onClick={handleAutoFillSlots}
                  >
                    По графику
                  </button>
                  <button
                    className="booking-calendar-reset"
                    type="button"
                    aria-label="Сбросить локальные окна"
                    onClick={handleResetLocalSlots}
                  >
                    Сбросить
                  </button>
                </div>
              </section>

              <section
                className="pro-slots-inline"
                ref={slotsSectionRef}
                aria-label="Окна дня"
              >
                <div className="pro-slots-sheet">
                  <header className="pro-slots-head">
                    <div>
                      <p className="pro-slots-kicker">Окна дня</p>
                      <h3 className="pro-slots-title">{selectedDayTitle}</h3>
                    </div>
                  </header>
                  <div className="pro-slots-filters" role="tablist">
                    {([
                      ['all', 'Все'],
                      ['free', 'Свободные'],
                      ['booked', 'Занятые'],
                      ['closed', 'Закрытые'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        className={`pro-slots-filter${
                          slotFilter === value ? ' is-active' : ''
                        }`}
                        type="button"
                        role="tab"
                        aria-selected={slotFilter === value}
                        onClick={() => setSlotFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="pro-slots-meta">
                    <span>Свободные {slotStats.free}</span>
                    <span>Занятые {slotStats.booked}</span>
                    <span>Закрытые {slotStats.closed}</span>
                  </div>

                  {filteredSlotViews.length === 0 ? (
                    <div className="pro-slots-empty">
                      <p className="pro-slots-empty-title">
                        На выбранный день окон нет.
                      </p>
                      <p className="pro-slots-empty-hint">
                        Добавьте окна вручную или заполните по графику.
                      </p>
                    </div>
                  ) : (
                    <div className="pro-slots-list">
                      {filteredSlotViews.map((slot) => {
                        const timeLabel = formatMinutes(slot.startMinutes)
                        const statusLabel =
                          slot.status === 'free'
                            ? 'Свободно'
                            : slot.status === 'booked'
                              ? 'Занято'
                              : 'Закрыто'
                        const booking = slot.booking
                        const hasDetails = booking && slotDetailId === booking.id
                        return (
                          <div className="pro-slot-card" key={`${slot.id}-${timeLabel}`}>
                            <div className="pro-slot-row">
                              <div className="pro-slot-time">{timeLabel}</div>
                              <div className="pro-slot-body">
                                <div className="pro-slot-top">
                                  <span className={`pro-slot-status is-${slot.status}`}>
                                    {slot.status === 'closed' && (
                                      <span
                                        className="pro-slot-status-icon"
                                        aria-hidden="true"
                                      >
                                        🔒
                                      </span>
                                    )}
                                    {statusLabel}
                                  </span>
                                  <div className="pro-slot-actions">
                                    {slot.status === 'free' && (
                                      <>
                                      <button
                                          className="pro-slot-action pro-slot-action--icon"
                                          type="button"
                                          aria-label="Закрыть окно"
                                          onClick={() => handleCloseSlot(slot.id)}
                                        >
                                          <IconLock />
                                        </button>
                                        <button
                                          className="pro-slot-action pro-slot-action--icon is-danger"
                                          type="button"
                                          aria-label="Удалить окно"
                                          onClick={() =>
                                            setSlotConfirm({
                                              type: 'delete',
                                              slotId: slot.id,
                                              timeLabel,
                                            })
                                          }
                                        >
                                          <IconTrash />
                                        </button>
                                      </>
                                    )}
                                    {slot.status === 'booked' && booking && (
                                      <>
                                        <button
                                          className={`pro-slot-action pro-slot-action--icon${
                                            hasDetails ? ' is-active' : ''
                                          }`}
                                          type="button"
                                          aria-label={
                                            hasDetails
                                              ? 'Скрыть детали'
                                              : 'Показать детали'
                                          }
                                          aria-pressed={hasDetails}
                                          onClick={() =>
                                            setSlotDetailId((current) =>
                                              current === booking.id
                                                ? null
                                                : booking.id
                                            )
                                          }
                                        >
                                          <IconChevron />
                                        </button>
                                        <button
                                          className="pro-slot-action pro-slot-action--icon"
                                          type="button"
                                          aria-label="Перенести запись"
                                          onClick={() =>
                                            handleOpenAddSlots({
                                              rescheduleBookingId: booking.id,
                                            })
                                          }
                                        >
                                          <IconSwap />
                                        </button>
                                        <button
                                          className="pro-slot-action pro-slot-action--icon is-danger"
                                          type="button"
                                          aria-label="Отменить запись"
                                          onClick={() =>
                                            setSlotConfirm({
                                              type: 'cancel-booking',
                                              bookingId: booking.id,
                                              timeLabel,
                                            })
                                          }
                                        >
                                          <IconClose />
                                        </button>
                                      </>
                                    )}
                                    {slot.status === 'closed' && (
                                      <button
                                        className="pro-slot-action pro-slot-action--icon"
                                        type="button"
                                        aria-label="Открыть окно"
                                        onClick={() => handleOpenSlot(slot.id)}
                                      >
                                        <IconUnlock />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {slot.status === 'closed' && slot.reason && (
                                  <div className="pro-slot-meta">{slot.reason}</div>
                                )}
                              </div>
                            </div>
                            {booking && hasDetails && (
                              <div className="pro-slot-details">
                                {renderBookingItem(booking)}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {slotConfirmContent && (
                    <div className="pro-slots-confirm">
                      <p className="pro-slots-confirm-title">
                        {slotConfirmContent.title}
                      </p>
                      <div className="pro-slots-confirm-actions">
                        <button
                          className={`pro-slots-confirm-primary ${
                            slotConfirmContent.tone === 'is-danger' ? 'is-danger' : ''
                          }`}
                          type="button"
                          onClick={handleConfirmSlotAction}
                        >
                          {slotConfirmContent.confirmLabel}
                        </button>
                        <button
                          className="pro-slots-confirm-secondary"
                          type="button"
                          onClick={() => setSlotConfirm(null)}
                        >
                          {slotConfirmContent.cancelLabel}
                        </button>
                      </div>
                    </div>
                  )}

                  {slotNotice && (
                    <p className="pro-slots-notice" role="status">
                      {slotNotice}
                    </p>
                  )}

                  <div className="pro-slots-footer">
                    <button
                      className="pro-slots-footer-primary"
                      type="button"
                      onClick={() => handleOpenAddSlots()}
                    >
                      Добавить окна
                    </button>
                    <button
                      className="pro-slots-footer-secondary"
                      type="button"
                      onClick={handleOpenPasteSlots}
                    >
                      Вставить списком
                    </button>
                  </div>
                </div>
              </section>

              {isBookingsLoading && (
                <p className="requests-status">Загружаем записи...</p>
              )}
              {bookingsError && <p className="requests-error">{bookingsError}</p>}
              {renderShareCard()}
            </>
          )}
      </div>

      {isAddSlotsOpen && (
        <div
          className="pro-slot-sheet-overlay"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseAddSlots}
        >
          <div className="pro-slot-sheet" onClick={(event) => event.stopPropagation()}>
            <span className="pro-slot-sheet-handle" aria-hidden="true" />
            <header className="pro-slot-sheet-head">
              <p className="pro-slot-sheet-kicker">
                {isRescheduleMode ? 'Перенос' : 'Добавление окон'}
              </p>
              <h3 className="pro-slot-sheet-title">
                {isRescheduleMode ? 'Перенести запись' : 'Добавить окна'}
              </h3>
              <p className="pro-slot-sheet-subtitle">{selectedDateLabel}</p>
            </header>

            <div className="pro-slot-sheet-section">
              <span className="pro-slot-sheet-label">Шаг 1. Дата</span>
              <div className="pro-slot-sheet-date">{selectedDateLabel}</div>
            </div>

            <div className="pro-slot-sheet-section">
              <span className="pro-slot-sheet-label">Шаг 2. Время</span>
              {!isRescheduleMode && (
                <div className="pro-slot-presets">
                  <button
                    className="pro-slot-preset"
                    type="button"
                    onClick={() =>
                      handlePresetSelect({
                        start: 8 * 60,
                        end: 12 * 60,
                      })
                    }
                  >
                    Утро
                  </button>
                  <button
                    className="pro-slot-preset"
                    type="button"
                    onClick={() =>
                      handlePresetSelect({
                        start: 12 * 60,
                        end: 17 * 60,
                      })
                    }
                  >
                    День
                  </button>
                  <button
                    className="pro-slot-preset"
                    type="button"
                    onClick={() =>
                      handlePresetSelect({
                        start: 17 * 60,
                        end: 21 * 60,
                      })
                    }
                  >
                    Вечер
                  </button>
                  <button
                    className="pro-slot-preset is-ghost"
                    type="button"
                    onClick={handleSelectAllTimes}
                  >
                    Выбрать все
                  </button>
                  <button
                    className="pro-slot-preset is-ghost"
                    type="button"
                    onClick={handleClearTimes}
                  >
                    Очистить
                  </button>
                </div>
              )}
              <div className="pro-slot-time-grid" role="list">
                {timeSlotStates.map((state) => {
                  const isSelected = selectedTimes.includes(state.time)
                  const isDisabled =
                    state.isBooked || (!isRescheduleMode && state.isFreeExisting)
                  return (
                    <button
                      className={`pro-slot-time-chip${
                        isSelected ? ' is-selected' : ''
                      }${state.isBooked ? ' is-booked' : ''}${
                        state.isClosed ? ' is-closed' : ''
                      }${state.isFreeExisting ? ' is-open' : ''}`}
                      type="button"
                      key={`time-${state.time}`}
                      role="listitem"
                      disabled={isDisabled}
                      onClick={() => toggleTimeSelection(state.time)}
                    >
                      {formatMinutes(state.time)}
                    </button>
                  )
                })}
              </div>
              <div className="pro-slot-legend">
                <span className="pro-slot-legend-item is-booked">Занято</span>
                <span className="pro-slot-legend-item is-closed">Закрыто</span>
                <span className="pro-slot-legend-item is-open">Открыто</span>
              </div>
              {!isRescheduleMode && (
                <button
                  className="pro-slot-sheet-alt"
                  type="button"
                  onClick={handleOpenPasteSlots}
                >
                  Вставить списком
                </button>
              )}
            </div>

            <div className="pro-slot-sheet-section">
              <span className="pro-slot-sheet-label">Шаг 3. Сохранить</span>
              <div className="pro-slot-sheet-actions">
                <button
                  className="pro-slot-sheet-primary"
                  type="button"
                  onClick={handleSaveSlots}
                >
                  {isRescheduleMode ? 'Перенести запись' : 'Сохранить окна'}
                </button>
                <button
                  className="pro-slot-sheet-secondary"
                  type="button"
                  onClick={handleCloseAddSlots}
                >
                  Отмена
                </button>
              </div>
            </div>

            {addSlotsError && <p className="pro-slot-sheet-error">{addSlotsError}</p>}

            {pendingReplace && (
              <div className="pro-slot-sheet-confirm">
                <p className="pro-slot-sheet-confirm-title">
                  Заменить закрытый на свободный?
                </p>
                <div className="pro-slot-sheet-confirm-actions">
                  <button
                    className="pro-slot-sheet-primary"
                    type="button"
                    onClick={() => handleReplaceDecision(true)}
                  >
                    Да
                  </button>
                  <button
                    className="pro-slot-sheet-secondary"
                    type="button"
                    onClick={() => handleReplaceDecision(false)}
                  >
                    Нет
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isPasteSlotsOpen && (
        <div
          className="pro-slot-sheet-overlay"
          role="dialog"
          aria-modal="true"
          onClick={handleClosePasteSlots}
        >
          <div
            className="pro-slot-sheet pro-slot-sheet--paste"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="pro-slot-sheet-handle" aria-hidden="true" />
            <header className="pro-slot-sheet-head">
              <p className="pro-slot-sheet-kicker">Быстрое добавление</p>
              <h3 className="pro-slot-sheet-title">Вставить списком</h3>
              <p className="pro-slot-sheet-subtitle">
                Вставьте даты и время строками
              </p>
            </header>
            <div className="pro-slot-sheet-section">
              <textarea
                className="pro-slot-textarea"
                placeholder={`10.01 — 13:00 15:00\n11.01 — 09:00 17:00`}
                rows={4}
                value={pasteInput}
                onChange={(event) => setPasteInput(event.target.value)}
              />
              <button
                className="pro-slot-sheet-secondary"
                type="button"
                onClick={handleParsePaste}
              >
                Распознать
              </button>
            </div>
            {pastePreview && (
              <div className="pro-slot-preview">
                {pastePreview.map((group) => (
                  <div className="pro-slot-preview-row" key={group.dateKey}>
                    <span className="pro-slot-preview-date">
                      {formatLongDate(group.date)}
                    </span>
                    <span className="pro-slot-preview-times">
                      {group.times.map(formatMinutes).join(', ')}
                    </span>
                    <span className="pro-slot-preview-count">
                      {formatWindowCount(group.times.length)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="pro-slot-sheet-actions">
              <button
                className="pro-slot-sheet-primary"
                type="button"
                onClick={handleSavePaste}
              >
                Сохранить окна
              </button>
              <button
                className="pro-slot-sheet-secondary"
                type="button"
                onClick={handleClosePasteSlots}
              >
                Назад
              </button>
            </div>
            {pasteError && <p className="pro-slot-sheet-error">{pasteError}</p>}
          </div>
        </div>
      )}

      <ProBottomNav
        active="requests"
        onCabinet={onBack}
        onRequests={() => {}}
        onChats={onViewChats}
        onProfile={() => onEditProfile()}
      />
    </div>
  )
}
