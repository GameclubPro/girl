import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { TrustBadge } from '../components/TrustBadge'
import { VirtualStack, type VirtualStackHandle } from '../components/VirtualStack'
import { NextActionPill } from '../components/NextActionPill'
import {
  IconCalendar,
  IconChat,
  IconChevron,
  IconLock,
  IconRadius,
  IconSettings,
  IconTrash,
  IconUnlock,
} from '../components/icons'
import { categoryItems } from '../data/clientData'
import type {
  Booking,
  MasterProfile,
  ProfileStatus,
  ProProfileSection,
  RequestTimeWindow,
  ServiceRequest,
} from '../types/app'
import type { LeadConversionStats } from '../types/analytics'
import { buildBookingStartParam } from '../utils/deeplink'
import { getChatStream } from '../utils/chatStream'
import { fetchJsonCached, readCache } from '../utils/dataCache'
import { hapticSelection } from '../utils/haptics'
import {
  normalizeScheduleDays,
  parseScheduleRange,
  parseScheduleTimeToMinutes,
} from '../utils/schedule'

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
}

const weekDayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const CALENDAR_RANGE_DAYS = 14
const dayKeyOrder = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DEFAULT_SLOT_RANGE_DAYS = 14
const BOOKING_DURATION_MIN = 60
const PRICE_OFFER_HOURS = 12
const FREE_CANCEL_HOURS = 12

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

const formatTimeLeftFromMs = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return formatTimeLeft(new Date(value).toISOString())
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

const formatTimeWindowChip = (window?: RequestTimeWindow | null) => {
  if (!window) return ''
  if (window.label) return window.label
  if (window.start && window.end) {
    return window.start === window.end
      ? window.start
      : `${window.start}–${window.end}`
  }
  return ''
}

const formatTimeWindowChoice = (
  dateOption: ServiceRequest['dateOption'] | undefined,
  window?: RequestTimeWindow | null
) => {
  const windowLabel = formatTimeWindowChip(window)
  let dateLabel = ''
  if (dateOption === 'today') {
    dateLabel = 'Сегодня'
  } else if (dateOption === 'tomorrow') {
    dateLabel = 'Завтра'
  } else if (window?.date) {
    const parsed = new Date(window.date)
    if (!Number.isNaN(parsed.getTime())) {
      dateLabel = formatDayMonth(parsed)
    }
  }
  const fallback = dateLabel || 'По времени'
  return windowLabel ? `${fallback} · ${windowLabel}` : fallback
}

const formatSlotLabel = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

const normalizeSlotInputValue = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const dateKey = toDateKey(parsed)
  const minutes = parsed.getHours() * 60 + parsed.getMinutes()
  return buildLocalDateTimeValue(dateKey, minutes)
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

const buildLocalDateTimeValue = (dateKey: string, minutes: number) => {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${match[1]}-${match[2]}-${match[3]}T${String(hours).padStart(
    2,
    '0'
  )}:${String(mins).padStart(2, '0')}`
}

const formatSlotSuggestionLabel = (
  dateKey: string,
  minutes: number,
  todayKey: string,
  tomorrowKey: string
) => {
  const date = parseDateKey(dateKey)
  const dayLabel =
    dateKey === todayKey
      ? 'Сегодня'
      : dateKey === tomorrowKey
        ? 'Завтра'
        : date
          ? formatDayMonth(date)
          : ''
  const timeLabel = formatMinutes(minutes)
  return dayLabel ? `${dayLabel}, ${timeLabel}` : timeLabel
}

const formatOutcomeLabel = (
  outcome?: string | null,
  lateMinutes?: number | null
) => {
  if (!outcome) return ''
  if (outcome === 'late' && typeof lateMinutes === 'number') {
    return `Опоздал на ${lateMinutes} мин.`
  }
  return bookingOutcomeLabelMap[outcome] ?? 'Отменено'
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

const resolveBookingDepositAmount = (booking: Booking) => {
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
  if (typeof booking.depositAmount === 'number') {
    return booking.depositAmount
  }
  if (basePrice && depositPercent > 0) {
    return Math.round((basePrice * depositPercent) / 100)
  }
  return 0
}

const resolveBookingDepositStatus = (booking: Booking, depositAmount: number) =>
  booking.depositStatus ??
  (booking.status === 'confirmed' && depositAmount > 0 ? 'pending' : 'not_required')

const isBookingAwaitingDepositConfirmation = (booking: Booking) => {
  if (booking.status !== 'confirmed') return false
  const depositAmount = resolveBookingDepositAmount(booking)
  if (depositAmount <= 0) return false
  const depositStatus = resolveBookingDepositStatus(booking, depositAmount)
  return (
    depositStatus === 'pending' ||
    depositStatus === 'submitted' ||
    depositStatus === 'rejected'
  )
}

const isBookingInRequestsPipeline = (booking: Booking) =>
  ['pending', 'price_pending', 'price_proposed'].includes(booking.status) ||
  isBookingAwaitingDepositConfirmation(booking)

type ProRequest = ServiceRequest & {
  responseId?: number | null
  responseStatus?: string | null
  responsePrice?: number | null
  responseComment?: string | null
  responseProposedTime?: string | null
  responseProposedSlotAt?: string | null
  responseHoldExpiresAt?: string | null
  responseCreatedAt?: string | null
}

type ResponseDraft = {
  price: string
  comment: string
  proposedTime: string
  proposedSlotAt: string
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

type SlotViewStatus = 'free' | 'closed' | 'booked' | 'pending'

type SlotView = {
  id: string
  dateKey: string
  startMinutes: number
  durationMinutes: number
  status: SlotViewStatus
  reason?: string | null
  booking?: Booking
  isReschedule?: boolean
}

type SlotSuggestion = {
  id: string
  dateKey: string
  startMinutes: number
  value: string
  label: string
  score?: number
  conversionRate?: number | null
  confidenceLabel?: string
}

type SlotFilter = 'all' | 'free' | 'booked' | 'closed' | 'pending'

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
const REQUEST_SLOT_SUGGESTIONS_LIMIT = 6
const REQUEST_SLOT_CONFIDENCE_LIMIT = 2
const LEAD_CONVERSION_MIN_SAMPLE = 6
const LEAD_CONVERSION_LOCATION_MIN_SAMPLE = 4
const LEAD_CONVERSION_HOUR_MIN_SAMPLE = 4
const LEAD_CONVERSION_WEEKDAY_MIN_SAMPLE = 4

const buildSlotStorageKey = (userId: string) => `pro-slots:${userId}`
const buildSlotSeedKey = (userId: string) => `pro-slots-seeded:${userId}`
const buildSlotScheduleKey = (userId: string) => `pro-slots-schedule:${userId}`

const buildScheduleSignature = (
  days: string[],
  start: number | null,
  end: number | null
) => {
  const normalizedDays = [...days].sort().join(',')
  const startValue = start === null ? 'null' : String(start)
  const endValue = end === null ? 'null' : String(end)
  return `${normalizedDays}|${startValue}|${endValue}`
}

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
  focusRequestId?: number | null
  focusBookingId?: number | null
  onFocusHandled?: () => void
  onBack: () => void
  onViewCabinet?: () => void
  onTabChange?: (tab: 'requests' | 'bookings') => void
  onEditProfile: (section?: ProProfileSection) => void
  onViewChats: () => void
  onOpenChat: (chatId: number) => void
}

export const ProRequestsScreen = ({
  apiBase,
  userId,
  initialTab,
  focusRequestId,
  focusBookingId,
  onFocusHandled,
  onBack,
  onViewCabinet,
  onTabChange,
  onEditProfile,
  onViewChats,
  onOpenChat,
}: ProRequestsScreenProps) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'bookings'>(
    () => initialTab ?? 'requests'
  )
  const [requests, setRequests] = useState<ProRequest[]>([])
  const [requestsFetched, setRequestsFetched] = useState(false)
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
  const [depositReviewBookingId, setDepositReviewBookingId] = useState<
    number | null
  >(null)
  const [focusedRequestId, setFocusedRequestId] = useState<number | null>(null)
  const [focusedBookingId, setFocusedBookingId] = useState<number | null>(null)
  const pendingRequestFocusIdRef = useRef<number | null>(null)
  const pendingBookingFocusIdRef = useRef<number | null>(null)
  const pendingDepositReviewBookingIdRef = useRef<number | null>(null)
  const autoSwitchHandledRef = useRef(false)
  const autoSwitchLockedRef = useRef(false)
  const requestsVirtualRef = useRef<VirtualStackHandle | null>(null)
  const pendingBookingsVirtualRef = useRef<VirtualStackHandle | null>(null)
  const archivedBookingsVirtualRef = useRef<VirtualStackHandle | null>(null)
  const [leadConversionStats, setLeadConversionStats] =
    useState<LeadConversionStats | null>(null)
  const [bookingDrafts, setBookingDrafts] = useState<Record<number, string>>({})
  const requestsRequestIdRef = useRef(0)
  const bookingsRequestIdRef = useRef(0)
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
  const [scheduleLoadError, setScheduleLoadError] = useState(false)
  const [scheduleSignatureSeeded, setScheduleSignatureSeeded] = useState<
    string | null
  >(null)
  const scheduleSignature = useMemo(
    () =>
      buildScheduleSignature(
        profileScheduleDays,
        profileScheduleStart,
        profileScheduleEnd
      ),
    [profileScheduleDays, profileScheduleStart, profileScheduleEnd]
  )
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
  const [slotDetailsId, setSlotDetailsId] = useState<string | null>(null)
  const [isPasteSlotsOpen, setIsPasteSlotsOpen] = useState(false)
  const [pasteInput, setPasteInput] = useState('')
  const [pastePreview, setPastePreview] = useState<ParsedSlotGroup[] | null>(
    null
  )
  const [pasteError, setPasteError] = useState('')
  const reloadTimerRef = useRef<number | null>(null)
  const reloadFlagsRef = useRef({ requests: false, bookings: false })
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

  const handleUserTabChange = useCallback((next: 'requests' | 'bookings') => {
    autoSwitchLockedRef.current = true
    setActiveTab(next)
  }, [])

  useEffect(() => {
    if (!initialTab) return
    setActiveTab(initialTab)
  }, [initialTab])
  useEffect(() => {
    if (typeof focusRequestId !== 'number') return
    pendingRequestFocusIdRef.current = focusRequestId
    setActiveTab('requests')
  }, [focusRequestId])
  useEffect(() => {
    if (typeof focusBookingId !== 'number') return
    pendingBookingFocusIdRef.current = focusBookingId
  }, [focusBookingId])
  useEffect(() => {
    if (focusedRequestId === null) return
    const timeout = window.setTimeout(() => {
      setFocusedRequestId(null)
    }, 4000)
    return () => window.clearTimeout(timeout)
  }, [focusedRequestId])
  useEffect(() => {
    if (focusedBookingId === null) return
    const timeout = window.setTimeout(() => {
      setFocusedBookingId(null)
    }, 4000)
    return () => window.clearTimeout(timeout)
  }, [focusedBookingId])
  useEffect(() => {
    if (depositReviewBookingId === null) return
    const exists = bookings.some((booking) => booking.id === depositReviewBookingId)
    if (!exists) {
      setDepositReviewBookingId(null)
    }
  }, [bookings, depositReviewBookingId])
  useEffect(() => {
    onTabChange?.(activeTab)
  }, [activeTab, onTabChange])
  useEffect(() => {
    if (!requestsFetched) return
    if (autoSwitchHandledRef.current) return
    if (autoSwitchLockedRef.current) {
      autoSwitchHandledRef.current = true
      return
    }
    if (activeTab !== 'requests') {
      autoSwitchHandledRef.current = true
      return
    }
    if (typeof focusRequestId === 'number') {
      autoSwitchHandledRef.current = true
      return
    }
    if (pendingRequestFocusIdRef.current !== null) {
      autoSwitchHandledRef.current = true
      return
    }
    if (loadError) return
    if (requests.length > 0) {
      autoSwitchHandledRef.current = true
      return
    }
    const hasPipelineBookings = bookings.some((booking) =>
      isBookingInRequestsPipeline(booking)
    )
    if (hasPipelineBookings) {
      autoSwitchHandledRef.current = true
      return
    }
    autoSwitchHandledRef.current = true
    setActiveTab('bookings')
  }, [
    activeTab,
    bookings,
    focusRequestId,
    loadError,
    requests.length,
    requestsFetched,
  ])
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return
    const scheduleKey = buildSlotScheduleKey(userId)
    try {
      setScheduleSignatureSeeded(window.localStorage.getItem(scheduleKey))
    } catch (error) {
      setScheduleSignatureSeeded(null)
    }
  }, [userId])
  const shareText =
    'Запись к мастеру\nОткройте ссылку, чтобы выбрать услугу и время.'
  const shareUrl = shareLink ? buildTelegramShareUrl(shareLink, shareText) : ''
  const applyRequestsPayload = useCallback(
    (
      data:
        | ProRequest[]
        | {
            profileStatus?: ProfileStatus
            missingFields?: string[]
            isActive?: boolean
            leadScoreVariant?: string | null
            leadConversionStats?: LeadConversionStats | null
            requests?: ProRequest[]
          }
    ) => {
      const requestItems = Array.isArray(data) ? data : data.requests ?? []
      const nextMissing = Array.isArray(data) ? [] : data.missingFields ?? []
      const nextActive = Array.isArray(data) ? true : data.isActive ?? true
      const nextLeadConversionStats = Array.isArray(data)
        ? null
        : data.leadConversionStats ?? null

      setRequests(requestItems)
      setMissingFields(nextMissing)
      setIsActive(nextActive)
      setLeadConversionStats(nextLeadConversionStats)
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
              proposedSlotAt: normalizeSlotInputValue(item.responseProposedSlotAt),
            }
          }
        })
        return nextDrafts
      })
    },
    []
  )
  const loadRequests = useCallback(
    async (options?: { silent?: boolean; force?: boolean }) => {
      if (!userId) return
      const requestId = (requestsRequestIdRef.current += 1)
      setRequestsFetched(false)
      const silent = options?.silent ?? false
      if (!silent) {
        setIsLoading(true)
        setLoadError('')
      }

      try {
        const cacheKey = `${apiBase}/api/pro/requests?userId=${encodeURIComponent(
          userId
        )}`
        const ttlMs = options?.force ? 0 : REQUESTS_CACHE_TTL_MS
        const { data } = await fetchJsonCached<
          | ProRequest[]
          | {
              profileStatus?: ProfileStatus
              missingFields?: string[]
              isActive?: boolean
              leadScoreVariant?: string | null
              leadConversionStats?: LeadConversionStats | null
              requests?: ProRequest[]
            }
        >(cacheKey, {
          ttlMs,
          persist: true,
        })
        if (requestsRequestIdRef.current === requestId) {
          applyRequestsPayload(data)
        }
      } catch (error) {
        if (requestsRequestIdRef.current === requestId && !silent) {
          setLoadError('Не удалось загрузить заявки.')
        }
      } finally {
        if (requestsRequestIdRef.current === requestId) {
          setRequestsFetched(true)
          if (!silent) {
            setIsLoading(false)
          }
        }
      }
    },
    [apiBase, applyRequestsPayload, userId]
  )
  const applyBookingsPayload = useCallback((data: Booking[]) => {
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
  }, [])
  const loadBookings = useCallback(
    async (options?: { silent?: boolean; force?: boolean }) => {
      if (!userId) return
      const requestId = (bookingsRequestIdRef.current += 1)
      const silent = options?.silent ?? false
      if (!silent) {
        setIsBookingsLoading(true)
        setBookingsError('')
      }
      try {
        const cacheKey = `${apiBase}/api/pro/bookings?userId=${encodeURIComponent(
          userId
        )}`
        const ttlMs = options?.force ? 0 : BOOKINGS_CACHE_TTL_MS
        const { data } = await fetchJsonCached<Booking[]>(cacheKey, {
          ttlMs,
          persist: true,
        })
        if (bookingsRequestIdRef.current === requestId) {
          applyBookingsPayload(data)
        }
      } catch (error) {
        if (bookingsRequestIdRef.current === requestId && !silent) {
          setBookings([])
          setBookingsError('Не удалось загрузить записи.')
        }
      } finally {
        if (bookingsRequestIdRef.current === requestId && !silent) {
          setIsBookingsLoading(false)
        }
      }
    },
    [apiBase, applyBookingsPayload, userId]
  )
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
          void loadRequests({ silent: true, force: true })
        }
        if (bookings) {
          void loadBookings({ silent: true, force: true })
        }
      }, 240)
    },
    [loadBookings, loadRequests]
  )

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
        setScheduleLoadError(false)
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
          setScheduleLoadError(true)
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
    const cacheKey = `${apiBase}/api/pro/requests?userId=${encodeURIComponent(
      userId
    )}`
    const cached = readCache<
      | ProRequest[]
      | {
          profileStatus?: ProfileStatus
          missingFields?: string[]
          isActive?: boolean
          leadScoreVariant?: string | null
          leadConversionStats?: LeadConversionStats | null
          requests?: ProRequest[]
        }
    >(cacheKey, {
      ttlMs: REQUESTS_CACHE_TTL_MS,
      persist: true,
    })
    if (cached?.value) {
      applyRequestsPayload(cached.value)
    }
    void loadRequests({ silent: Boolean(cached?.value) })
  }, [apiBase, applyRequestsPayload, loadRequests, userId])

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
    const cacheKey = `${apiBase}/api/pro/bookings?userId=${encodeURIComponent(
      userId
    )}`
    const cached = readCache<Booking[]>(cacheKey, {
      ttlMs: BOOKINGS_CACHE_TTL_MS,
      persist: true,
    })
    if (cached?.value) {
      applyBookingsPayload(cached.value)
    }
    void loadBookings({ silent: Boolean(cached?.value) })
  }, [apiBase, applyBookingsPayload, loadBookings, userId])

  useEffect(() => {
    if (!userId) return
    const unsubscribe = stream.subscribe((payload) => {
      if (payload?.type === 'chat:created') {
        scheduleReload({ requests: true, bookings: true })
        return
      }
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
        const event = typeof meta.event === 'string' ? meta.event : ''
        if (requestEvents.has(event)) {
          scheduleReload({ requests: true })
        }
        if (bookingEvents.has(event)) {
          scheduleReload({ bookings: true })
        }
        if (event !== 'booking_outcome_marked') return
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
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }
      reloadFlagsRef.current = { requests: false, bookings: false }
    }
  }, [bookingEvents, requestEvents, scheduleReload, stream, userId])

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
    () => bookingItems.filter((booking) => isBookingInRequestsPipeline(booking)),
    [bookingItems]
  )
  const depositPipelineBookingsCount = useMemo(
    () =>
      pendingBookingItems.filter((booking) =>
        isBookingAwaitingDepositConfirmation(booking)
      ).length,
    [pendingBookingItems]
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
  const depositReviewBooking = useMemo(
    () =>
      depositReviewBookingId === null
        ? null
        : bookingItems.find((booking) => booking.id === depositReviewBookingId) ?? null,
    [bookingItems, depositReviewBookingId]
  )
  const depositReviewAmount = useMemo(
    () => (depositReviewBooking ? resolveBookingDepositAmount(depositReviewBooking) : 0),
    [depositReviewBooking]
  )
  const depositReviewStatus = useMemo(
    () =>
      depositReviewBooking
        ? resolveBookingDepositStatus(depositReviewBooking, depositReviewAmount)
        : 'not_required',
    [depositReviewAmount, depositReviewBooking]
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
      {
        startMinutes: number
        durationMinutes: number
        booking: Booking
        isReschedule?: boolean
      }[]
    >()
    confirmedBookingItems.forEach((booking) => {
      const durationMinutes = booking.serviceDuration ?? BOOKING_DURATION_MIN
      const scheduledDate = parseDateOnly(booking.scheduledAt)
      const scheduledMinutes = getMinutesFromDateTime(booking.scheduledAt)
      if (scheduledDate && scheduledMinutes !== null) {
        const dateKey = toDateKey(scheduledDate)
        const list = map.get(dateKey)
        const range = { startMinutes: scheduledMinutes, durationMinutes, booking }
        if (list) {
          list.push(range)
        } else {
          map.set(dateKey, [range])
        }
      }
      if (booking.rescheduleProposedTime) {
        const proposedDate = parseDateOnly(booking.rescheduleProposedTime)
        const proposedMinutes = getMinutesFromDateTime(booking.rescheduleProposedTime)
        if (proposedDate && proposedMinutes !== null) {
          const dateKey = toDateKey(proposedDate)
          const list = map.get(dateKey)
          const range = {
            startMinutes: proposedMinutes,
            durationMinutes,
            booking,
            isReschedule: true,
          }
          if (list) {
            list.push(range)
          } else {
            map.set(dateKey, [range])
          }
        }
      }
    })
    return map
  }, [confirmedBookingItems])

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
  const seedSlotsFromSchedule = useCallback(() => {
    if (!userId || typeof window === 'undefined') return 0
    if (!scheduleLoaded || scheduleLoadError || isBookingsLoading) return 0
    if (scheduleSignatureSeeded === scheduleSignature) return 0

    const daySet = new Set(profileScheduleDays)
    const hasValidSchedule =
      daySet.size > 0 &&
      profileScheduleStart !== null &&
      profileScheduleEnd !== null &&
      profileScheduleEnd > profileScheduleStart
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    setSlots((current) => {
      const next = current.filter((slot) => slot.status === 'closed')
      if (!hasValidSchedule) return next
      const scheduleStart = profileScheduleStart ?? 0
      const scheduleEnd = profileScheduleEnd ?? 0

      for (let offset = 0; offset < DEFAULT_SLOT_RANGE_DAYS; offset += 1) {
        const date = addDays(today, offset)
        const dayKey = getDayKey(date)
        if (!daySet.has(dayKey)) continue
        const dateKey = toDateKey(date)
        const bookedRanges = bookingRangesByDate.get(dateKey) ?? []
        for (
          let time = scheduleStart;
          time + SLOT_TIME_STEP <= scheduleEnd;
          time += SLOT_TIME_STEP
        ) {
          const bookedOverlap = bookedRanges.some((range) =>
            rangesOverlap(
              time,
              SLOT_DURATION_MIN,
              range.startMinutes,
              range.durationMinutes
            )
          )
          if (bookedOverlap) continue
          const slotOverlap = next.some(
            (slot) =>
              slot.dateKey === dateKey &&
              rangesOverlap(
                time,
                SLOT_DURATION_MIN,
                slot.startMinutes,
                slot.durationMinutes
              )
          )
          if (slotOverlap) continue
          next.push({
            id: buildSlotId(),
            dateKey,
            startMinutes: time,
            durationMinutes: SLOT_DURATION_MIN,
            status: 'free',
            reason: null,
            createdAt: Date.now(),
          })
        }
      }
      return next
    })

    try {
      window.localStorage.setItem(buildSlotScheduleKey(userId), scheduleSignature)
      window.localStorage.setItem(buildSlotSeedKey(userId), '1')
    } catch (error) {
      // ignore storage errors
    }
    setScheduleSignatureSeeded(scheduleSignature)
    return 1
  }, [
    bookingRangesByDate,
    isBookingsLoading,
    profileScheduleDays,
    profileScheduleEnd,
    profileScheduleStart,
    scheduleLoaded,
    scheduleLoadError,
    scheduleSignature,
    scheduleSignatureSeeded,
    userId,
  ])

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
        id: `booking-${range.booking.id}${range.isReschedule ? '-reschedule' : ''}`,
        dateKey: selectedDateKey,
        startMinutes: range.startMinutes,
        durationMinutes: range.durationMinutes,
        status: range.isReschedule ? 'pending' : ('booked' as const),
        booking: range.booking,
        isReschedule: range.isReschedule,
      }))
    return [...manualViews, ...bookedViews].sort(
      (a, b) => a.startMinutes - b.startMinutes
    )
  }, [bookingRangesByDate, selectedDateKey, selectedSlots])
  const filteredSlotViews = useMemo(() => {
    if (slotFilter === 'all') return selectedSlotViews
    if (slotFilter === 'booked') {
      return selectedSlotViews.filter(
        (slot) => slot.status === 'booked' || slot.status === 'pending'
      )
    }
    return selectedSlotViews.filter((slot) => slot.status === slotFilter)
  }, [selectedSlotViews, slotFilter])
  const slotStats = useMemo(() => {
    const stats = {
      free: 0,
      booked: 0,
      pending: 0,
      closed: 0,
    }
    selectedSlotViews.forEach((slot) => {
      if (slot.status === 'free') stats.free += 1
      else if (slot.status === 'booked') stats.booked += 1
      else if (slot.status === 'pending') stats.pending += 1
      else if (slot.status === 'closed') stats.closed += 1
    })
    return stats
  }, [selectedSlotViews])
  const slotFilterCounts = useMemo(
    () => ({
      all: selectedSlotViews.length,
      free: slotStats.free,
      booked: slotStats.booked + slotStats.pending,
    }),
    [selectedSlotViews.length, slotStats.booked, slotStats.free, slotStats.pending]
  )
  const slotDetails = useMemo(() => {
    if (!slotDetailsId) return null
    return selectedSlotViews.find((slot) => slot.id === slotDetailsId) ?? null
  }, [selectedSlotViews, slotDetailsId])
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
  const slotDetailsBooking = slotDetails?.booking ?? null
  const slotDetailsTimeLabel = slotDetails
    ? formatMinutes(slotDetails.startMinutes)
    : ''
  const slotDetailsDate = slotDetails ? parseDateKey(slotDetails.dateKey) : null
  const slotDetailsDateLabel = slotDetailsDate ? formatLongDate(slotDetailsDate) : ''
  const slotDetailsStatusLabel = slotDetailsBooking
    ? bookingStatusLabelMap[slotDetailsBooking.status] ?? slotDetailsBooking.status
    : ''
  const slotDetailsStatusTone = slotDetailsBooking
    ? bookingStatusToneMap[slotDetailsBooking.status] ?? 'is-waiting'
    : 'is-waiting'
  const slotDetailsClientName = slotDetailsBooking?.clientName ?? 'Клиент'
  const slotDetailsLocationLabel = slotDetailsBooking
    ? locationLabelMap[slotDetailsBooking.locationType] ?? ''
    : ''
  const slotDetailsDistanceLabel =
    slotDetailsBooking && slotDetailsBooking.locationType === 'client'
      ? formatDistance(slotDetailsBooking.distanceKm)
      : ''
  const slotDetailsDepositPercent =
    slotDetailsBooking && typeof slotDetailsBooking.depositPercent === 'number'
      ? Math.max(0, Math.round(slotDetailsBooking.depositPercent))
      : 0
  const slotDetailsMetaItems: string[] = []
  if (slotDetailsBooking?.serviceName) {
    slotDetailsMetaItems.push(slotDetailsBooking.serviceName)
  }
  if (slotDetailsLocationLabel) {
    slotDetailsMetaItems.push(slotDetailsLocationLabel)
  }
  if (slotDetailsDistanceLabel) {
    slotDetailsMetaItems.push(slotDetailsDistanceLabel)
  }
  if (slotDetailsDepositPercent > 0) {
    slotDetailsMetaItems.push(`Депозит ${slotDetailsDepositPercent}%`)
  }
  const slotDetailsReschedulePending =
    Boolean(slotDetailsBooking?.rescheduleProposedTime) &&
    Boolean(slotDetailsBooking?.rescheduleProposedBy)
  const slotDetailsRescheduleByMaster =
    slotDetailsBooking?.rescheduleProposedBy === 'master'
  const slotDetailsCanRespondReschedule =
    slotDetailsReschedulePending && !slotDetailsRescheduleByMaster
  const slotDetailsCanCancelReschedule =
    slotDetailsReschedulePending && slotDetailsRescheduleByMaster
  const canSlotDetailsReschedule =
    !slotDetailsReschedulePending &&
    Boolean(slotDetailsBooking) &&
    (slotDetails?.status === 'booked' || slotDetails?.status === 'pending')
  const canSlotDetailsCancelBooking =
    !slotDetailsReschedulePending && Boolean(slotDetailsBooking) && canSlotDetailsReschedule
  const isSlotDetailsCancelConfirm =
    slotConfirm?.type === 'cancel-booking' &&
    slotConfirm.bookingId === slotDetailsBooking?.id
  const slotDetailsActionsCount =
    Number(slotDetailsCanRespondReschedule) * 2 +
    Number(slotDetailsCanCancelReschedule) +
    Number(canSlotDetailsReschedule) +
    Number(canSlotDetailsCancelBooking)
  const slotDetailsActionClassName =
    slotDetailsActionsCount <= 1
      ? 'pro-slot-details-sheet-actions is-single'
      : 'pro-slot-details-sheet-actions'
  const isSlotDetailsActionLoading =
    Boolean(slotDetailsBooking) && bookingActionId === slotDetailsBooking?.id
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
  const selectedDayTitle = useMemo(
    () => `${formatLongDate(selectedDate)}, ${formatWeekdayLong(selectedDate)}`,
    [selectedDate]
  )
  const todayKey = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return toDateKey(today)
  }, [])
  const tomorrowKey = useMemo(() => {
    const tomorrow = addDays(new Date(), 1)
    tomorrow.setHours(0, 0, 0, 0)
    return toDateKey(tomorrow)
  }, [])
  const timeGrid = useMemo(() => {
    const items: number[] = []
    for (let time = SLOT_TIME_START; time < SLOT_TIME_END; time += SLOT_TIME_STEP) {
      items.push(time)
    }
    return items
  }, [])
  const profileScheduleDaySet = useMemo(
    () => new Set(profileScheduleDays),
    [profileScheduleDays]
  )
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

  const buildRequestSlotSuggestions = useCallback(
    (request: ProRequest): SlotSuggestion[] => {
      const rawWindows = Array.isArray(request.timeWindows)
        ? request.timeWindows
        : []
      const fallbackWindow =
        rawWindows.length === 0 && request.dateTime
          ? (() => {
              const parsed = new Date(request.dateTime)
              if (Number.isNaN(parsed.getTime())) return null
              const dateKey = toDateKey(parsed)
              const timeValue = formatMinutes(
                parsed.getHours() * 60 + parsed.getMinutes()
              )
              return {
                date: dateKey,
                start: timeValue,
                end: timeValue,
                exact: true,
              }
            })()
          : null
      const windows = fallbackWindow ? [fallbackWindow] : rawWindows
      if (windows.length === 0) return []

      const hasManualSlots = slots.length > 0
      const suggestions: SlotSuggestion[] = []
      const used = new Set<string>()
      const now = new Date()
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      const conversionStats = leadConversionStats
      const resolveRate = (
        stats?: { responses: number; rate: number } | null,
        minSample?: number
      ) => {
        if (!stats || typeof stats.rate !== 'number') return null
        if (typeof minSample === 'number' && stats.responses < minSample) return null
        return stats.rate
      }
      const categoryStats =
        conversionStats?.categories?.[request.categoryId ?? ''] ?? null
      const locationStats =
        conversionStats?.locations?.[request.locationType ?? ''] ?? null
      const overallRate =
        typeof conversionStats?.overall?.rate === 'number'
          ? conversionStats?.overall?.rate
          : null
      const categoryRate = resolveRate(categoryStats, LEAD_CONVERSION_MIN_SAMPLE)
      const locationRate = resolveRate(
        locationStats,
        LEAD_CONVERSION_LOCATION_MIN_SAMPLE
      )
      const blendRates = (
        items: Array<{ rate: number | null; weight: number }>
      ): number | null => {
        let totalWeight = 0
        let sum = 0
        items.forEach((item) => {
          if (typeof item.rate !== 'number') return
          totalWeight += item.weight
          sum += item.rate * item.weight
        })
        if (totalWeight <= 0) return null
        return sum / totalWeight
      }

      const addSuggestion = (
        dateKey: string,
        minutes: number,
        source: 'manual' | 'schedule'
      ) => {
        if (suggestions.length >= REQUEST_SLOT_SUGGESTIONS_LIMIT) return
        const value = buildLocalDateTimeValue(dateKey, minutes)
        if (!value) return
        const key = `${dateKey}-${minutes}`
        if (used.has(key)) return
        used.add(key)
        const date = parseDateKey(dateKey)
        const dayKey = date ? getDayKey(date) : null
        const hourKey = String(Math.floor(minutes / 60))
        const hourStats = conversionStats?.hours?.[hourKey] ?? null
        const weekdayStats = dayKey ? conversionStats?.weekdays?.[dayKey] : null
        const hourRate = resolveRate(hourStats, LEAD_CONVERSION_HOUR_MIN_SAMPLE)
        const weekdayRate = resolveRate(
          weekdayStats,
          LEAD_CONVERSION_WEEKDAY_MIN_SAMPLE
        )
        const blendedRate = blendRates([
          { rate: categoryRate, weight: 0.34 },
          { rate: locationRate, weight: 0.12 },
          { rate: weekdayRate, weight: 0.18 },
          { rate: hourRate, weight: 0.22 },
          { rate: overallRate, weight: 0.14 },
        ])
        const baseScore = source === 'manual' ? 2 : 1
        const conversionBoost = blendedRate !== null ? blendedRate * 2 : 0
        const score = baseScore + conversionBoost
        let confidenceLabel = ''
        if (blendedRate !== null) {
          if (blendedRate >= 0.5) {
            confidenceLabel = 'Очень вероятно'
          } else if (blendedRate >= 0.35) {
            confidenceLabel = 'Вероятно'
          } else if (blendedRate <= 0.15) {
            confidenceLabel = 'Низкий шанс'
          }
        }
        suggestions.push({
          id: key,
          dateKey,
          startMinutes: minutes,
          value,
          label: formatSlotSuggestionLabel(dateKey, minutes, todayKey, tomorrowKey),
          score,
          conversionRate: blendedRate,
          confidenceLabel,
        })
      }

      const resolveTimeAvailability = (
        dateKey: string,
        minutes: number
      ): 'manual' | 'schedule' | null => {
        const date = parseDateKey(dateKey)
        if (!date) return null
        if (dateKey === todayKey && minutes < nowMinutes) return null
        const bookedRanges = bookingRangesByDate.get(dateKey) ?? []
        if (
          bookedRanges.some((range) =>
            rangesOverlap(
              minutes,
              SLOT_DURATION_MIN,
              range.startMinutes,
              range.durationMinutes
            )
          )
        ) {
          return null
        }
        if (hasManualSlots) {
          const daySlots = slotsByDate.get(dateKey) ?? []
          const hasFreeSlot = daySlots.some(
            (slot) =>
              slot.status === 'free' &&
              rangesOverlap(
                minutes,
                SLOT_DURATION_MIN,
                slot.startMinutes,
                slot.durationMinutes
              )
          )
          return hasFreeSlot ? 'manual' : null
        }
        if (profileScheduleStart === null || profileScheduleEnd === null) return null
        if (profileScheduleDaySet.size === 0) return null
        const dayKey = getDayKey(date)
        if (!profileScheduleDaySet.has(dayKey)) return null
        if (minutes < profileScheduleStart) return null
        if (minutes + SLOT_DURATION_MIN > profileScheduleEnd) return null
        return 'schedule'
      }

      const normalizedWindows = windows
        .map((window) => {
          if (!window) return null
          const dateKey = typeof window.date === 'string' ? window.date : ''
          const startMinutes = parseScheduleTimeToMinutes(window.start)
          const endMinutes = parseScheduleTimeToMinutes(window.end)
          if (!dateKey || startMinutes === null || endMinutes === null) return null
          return {
            dateKey,
            startMinutes,
            endMinutes,
            exact: Boolean(window.exact) || startMinutes === endMinutes,
          }
        })
        .filter(
          (window): window is {
            dateKey: string
            startMinutes: number
            endMinutes: number
            exact: boolean
          } => Boolean(window)
        )
        .sort((a, b) => {
          if (a.dateKey !== b.dateKey) {
            return a.dateKey < b.dateKey ? -1 : 1
          }
          return a.startMinutes - b.startMinutes
        })

      for (const window of normalizedWindows) {
        if (suggestions.length >= REQUEST_SLOT_SUGGESTIONS_LIMIT) break
        const rangeStart = Math.min(window.startMinutes, window.endMinutes)
        const rangeEnd = Math.max(window.startMinutes, window.endMinutes)
        const times =
          window.exact || rangeStart === rangeEnd
            ? [rangeStart]
            : (() => {
                const result: number[] = []
                for (
                  let time = rangeStart;
                  time <= rangeEnd;
                  time += SLOT_TIME_STEP
                ) {
                  result.push(time)
                }
                return result
              })()
        for (const time of times) {
          if (suggestions.length >= REQUEST_SLOT_SUGGESTIONS_LIMIT) break
          const source = resolveTimeAvailability(window.dateKey, time)
          if (!source) continue
          addSuggestion(window.dateKey, time, source)
        }
      }

      if (suggestions.length === 0) return []
      const ranked = suggestions
        .filter((slot) => typeof slot.conversionRate === 'number')
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, REQUEST_SLOT_CONFIDENCE_LIMIT)
        .map((item) => item.id)
      if (ranked.length === 0) return suggestions
      return suggestions.map((slot) =>
        ranked.includes(slot.id)
          ? { ...slot, confidenceLabel: 'Самый вероятный' }
          : slot
      )
    },
    [
      bookingRangesByDate,
      leadConversionStats,
      profileScheduleDaySet,
      profileScheduleEnd,
      profileScheduleStart,
      slots.length,
      slotsByDate,
      todayKey,
      tomorrowKey,
    ]
  )

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
    setSlotDetailsId(null)
    if (options?.scroll === false) return
    scrollToSlots()
  }

  const handleShiftRange = (direction: number) => {
    setWeekStartDate((current) => addDays(current, direction * CALENDAR_RANGE_DAYS))
    setSelectedDate((current) => addDays(current, direction * CALENDAR_RANGE_DAYS))
    setCalendarInitialized(true)
    setSlotConfirm(null)
    setSlotDetailsId(null)
  }

  const focusRequest = useCallback(
    (requestId: number) => {
      setFocusedRequestId(requestId)
      const index = items.findIndex((item) => item.id === requestId)
      requestAnimationFrame(() => {
        if (index >= 0) {
          requestsVirtualRef.current?.scrollToIndex(index)
        }
      })
    },
    [items]
  )

  const toggleSlotExpand = (slot: SlotView) => {
    if (!slot.booking) return
    setSlotConfirm(null)
    setSlotDetailsId((current) => (current === slot.id ? null : slot.id))
    if (slotDetailsId !== slot.id) {
      hapticSelection()
    }
  }

  const focusPendingBooking = useCallback(
    (bookingId: number) => {
      setFocusedBookingId(bookingId)
      const index = pendingBookingItems.findIndex((item) => item.id === bookingId)
      requestAnimationFrame(() => {
        if (index >= 0) {
          pendingBookingsVirtualRef.current?.scrollToIndex(index)
        }
      })
    },
    [pendingBookingItems]
  )

  const focusBookingInCalendar = useCallback((booking: Booking) => {
    const date = parseDateOnly(booking.scheduledAt)
    if (!date) return
    setSlotFilter('all')
    setSelectedDate(date)
    setWeekStartDate(startOfWeek(date))
    setCalendarInitialized(true)
    setSlotConfirm(null)
    setSlotDetailsId(`booking-${booking.id}`)
    setFocusedBookingId(booking.id)
    requestAnimationFrame(() => {
      document
      .getElementById(`pro-booking-${booking.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const handleRequestActionFocus = useCallback(
    (requestId: number) => {
      if (activeTab !== 'requests') {
        pendingRequestFocusIdRef.current = requestId
        handleUserTabChange('requests')
        return
      }
      focusRequest(requestId)
    },
    [activeTab, focusRequest, handleUserTabChange]
  )

  const handleBookingActionFocus = useCallback(
    (booking: Booking, actionId?: string | null) => {
      const targetTab = booking.status === 'confirmed' ? 'bookings' : 'requests'
      if (actionId === 'check_deposit') {
        pendingDepositReviewBookingIdRef.current = booking.id
      }
      if (activeTab !== targetTab) {
        pendingBookingFocusIdRef.current = booking.id
        handleUserTabChange(targetTab)
        return
      }
      if (targetTab === 'bookings') {
        focusBookingInCalendar(booking)
      } else {
        focusPendingBooking(booking.id)
      }
      if (actionId === 'check_deposit') {
        setDepositReviewBookingId(booking.id)
        pendingDepositReviewBookingIdRef.current = null
      }
    },
    [activeTab, focusBookingInCalendar, focusPendingBooking, handleUserTabChange]
  )

  useEffect(() => {
    const requestId = pendingRequestFocusIdRef.current
    if (!requestId || activeTab !== 'requests') return
    const item = requests.find((request) => request.id === requestId)
    if (!item) return
    pendingRequestFocusIdRef.current = null
    focusRequest(requestId)
    onFocusHandled?.()
  }, [activeTab, focusRequest, onFocusHandled, requests])

  useEffect(() => {
    const bookingId = pendingBookingFocusIdRef.current
    if (!bookingId) return
    const booking = bookings.find((item) => item.id === bookingId)
    if (!booking) return
    const targetTab = booking.status === 'confirmed' ? 'bookings' : 'requests'
    if (activeTab !== targetTab) {
      setActiveTab(targetTab)
      return
    }
    pendingBookingFocusIdRef.current = null
    if (targetTab === 'bookings') {
      focusBookingInCalendar(booking)
    } else {
      focusPendingBooking(bookingId)
    }
    if (pendingDepositReviewBookingIdRef.current === bookingId) {
      setDepositReviewBookingId(bookingId)
      pendingDepositReviewBookingIdRef.current = null
    }
    onFocusHandled?.()
  }, [
    activeTab,
    bookings,
    focusBookingInCalendar,
    focusPendingBooking,
    onFocusHandled,
  ])

  useEffect(() => {
    if (activeTab === 'bookings') return
    if (!slotDetailsId) return
    setSlotDetailsId(null)
    setSlotConfirm(null)
  }, [activeTab, slotDetailsId])

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
    setSlotConfirm(null)
    setSlotDetailsId(null)
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
    setSlotConfirm(null)
    setSlotDetailsId(null)
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

  const handleRescheduleBooking = async (newTime: number) => {
    if (!rescheduleBooking) return
    setAddSlotsError('')
    const updatedDate = new Date(selectedDate)
    updatedDate.setHours(Math.floor(newTime / 60), newTime % 60, 0, 0)
    const proposedAt = updatedDate.toISOString()

    try {
      const response = await fetch(
        `${apiBase}/api/bookings/${rescheduleBooking.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            action: 'reschedule-propose',
            proposedAt,
          }),
        }
      )
      const data = (await response.json().catch(() => null)) as
        | {
            error?: string
            rescheduleProposedAt?: string | null
            rescheduleProposedBy?: Booking['rescheduleProposedBy']
            rescheduleProposedTime?: string | null
          }
        | null

      if (!response.ok) {
        const message =
          data?.error === 'day_unavailable'
            ? 'Этот день недоступен.'
            : data?.error === 'schedule_unavailable'
              ? 'График мастера пока недоступен.'
              : data?.error === 'time_unavailable'
                ? 'Время уже занято.'
                : data?.error === 'same_time'
                  ? 'Выберите другое время.'
                  : 'Не удалось предложить перенос.'
        setAddSlotsError(message)
        return
      }

      setBookings((current) =>
        current.map((booking) =>
          booking.id === rescheduleBooking.id
            ? {
                ...booking,
                rescheduleProposedAt: data?.rescheduleProposedAt ?? new Date().toISOString(),
                rescheduleProposedBy: data?.rescheduleProposedBy ?? 'master',
                rescheduleProposedTime: data?.rescheduleProposedTime ?? proposedAt,
              }
            : booking
        )
      )
      setSlotMessage('Предложение переноса отправлено.')
      handleCloseAddSlots()
    } catch (error) {
      setAddSlotsError('Не удалось предложить перенос.')
    }
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
      void handleRescheduleBooking(availableTimes[0])
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
      setSlotDetailsId(null)
    }
    setSlotConfirm(null)
  }

  const handleCloseSlotDetails = () => {
    setSlotDetailsId(null)
    setSlotConfirm(null)
  }

  const handleSlotDetailsReschedule = () => {
    if (!slotDetailsBooking) return
    setSlotDetailsId(null)
    handleOpenAddSlots({ rescheduleBookingId: slotDetailsBooking.id })
  }

  const handleSlotDetailsCancel = () => {
    if (!slotDetailsBooking || !slotDetailsTimeLabel) return
    setSlotConfirm({
      type: 'cancel-booking',
      bookingId: slotDetailsBooking.id,
      timeLabel: slotDetailsTimeLabel,
    })
  }

  const handleSlotDetailsRescheduleAccept = () => {
    if (!slotDetailsBooking) return
    void handleBookingAction(slotDetailsBooking.id, 'reschedule-accept')
  }

  const handleSlotDetailsRescheduleDecline = () => {
    if (!slotDetailsBooking) return
    void handleBookingAction(slotDetailsBooking.id, 'reschedule-decline')
  }

  const handleSlotDetailsRescheduleCancel = () => {
    if (!slotDetailsBooking) return
    void handleBookingAction(slotDetailsBooking.id, 'reschedule-cancel')
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
  const renderBookingItem = (
    booking: Booking,
    options?: { archived?: boolean; compact?: boolean }
  ) => {
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
    const priceOfferTimeLeft = formatTimeLeftFromMs(priceOfferExpiresAt)
    const cancelWindowHours =
      typeof booking.cancelWindowHours === 'number'
        ? booking.cancelWindowHours
        : FREE_CANCEL_HOURS
    const cancelWindowMs = Math.max(0, cancelWindowHours) * 60 * 60 * 1000
    const freeCancelUntilMs =
      booking.scheduledAt && cancelWindowMs > 0
        ? new Date(booking.scheduledAt).getTime() - cancelWindowMs
        : null
    const freeCancelLabel =
      freeCancelUntilMs && freeCancelUntilMs > Date.now()
        ? formatDateTime(new Date(freeCancelUntilMs).toISOString())
        : ''
    const hasServicePrice = typeof booking.servicePrice === 'number'
    const priceLabel = hasServicePrice
      ? `Стоимость: ${formatPrice(booking.servicePrice ?? 0)}`
      : typeof booking.proposedPrice === 'number'
        ? `Предложенная цена: ${formatPrice(booking.proposedPrice)}`
        : 'Цена не указана'
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
      discountPercent > 0 && typeof discountPriceBefore === 'number'
        ? `Скидка -${discountPercent}% · было ${formatPrice(
            discountPriceBefore
          )}`
        : ''
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
    const isCurrentActionLoading = bookingActionId === booking.id
    const draftPrice = bookingDrafts[booking.id] ?? ''
    const clientName = booking.clientName ?? 'Клиент'
    const clientInitials = getInitials(clientName)
    const outcomeLabel = formatOutcomeLabel(booking.outcome, booking.lateMinutes)
    const canMarkOutcome = isOutcomePending(booking)
    const depositPercent =
      typeof booking.depositPercent === 'number'
        ? Math.max(0, Math.round(booking.depositPercent))
        : 0
    const depositAmount = resolveBookingDepositAmount(booking)
    const depositStatus = resolveBookingDepositStatus(booking, depositAmount)
    const depositStatusLabel =
      depositAmount > 0 &&
      booking.status !== 'confirmed' &&
      depositStatus === 'not_required'
        ? 'Депозит активируется после подтверждения'
        : depositStatus === 'submitted'
          ? 'Чек загружен, ждёт подтверждения'
          : depositStatus === 'confirmed'
            ? 'Депозит подтверждён'
            : depositStatus === 'rejected'
              ? 'Чек отклонён'
              : depositStatus === 'expired'
                ? 'Время оплаты вышло, слот снят'
                : depositStatus === 'pending'
                  ? 'Ожидает оплаты депозита'
                  : ''
    const canConfirmDeposit = depositStatus === 'submitted'
    const photoItems = Array.isArray(booking.photoUrls)
      ? booking.photoUrls
      : []
    const cityDistrictLabel = [booking.cityName, booking.districtName]
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .join(' • ')
    const hasExtraDetails =
      Boolean(cityDistrictLabel || booking.address) ||
      Boolean(booking.comment) ||
      photoItems.length > 0
    const reschedulePending =
      Boolean(booking.rescheduleProposedTime) &&
      Boolean(booking.rescheduleProposedBy)
    const rescheduleByMaster = booking.rescheduleProposedBy === 'master'
    const canRespondReschedule = reschedulePending && !rescheduleByMaster
    const canCancelReschedule = reschedulePending && rescheduleByMaster
    const rescheduleMetaLabel = reschedulePending
      ? rescheduleByMaster
        ? rescheduleLabel
          ? `Ожидает подтверждения · ${rescheduleLabel}`
          : 'Ожидает подтверждения переноса'
        : rescheduleLabel
          ? `Клиент просит перенос · ${rescheduleLabel}`
          : 'Клиент просит перенос'
      : ''
    const rescheduleMetaTone = canRespondReschedule
      ? 'booking-item-meta--warning'
      : 'booking-item-meta--highlight'
    const isCompact = Boolean(options?.compact)
    const showCornerChat = !isCompact && Boolean(booking.chatId)
    const nextAction = booking.nextAction ?? null
    const hasPrimaryBookingActions =
      reschedulePending ||
      canConfirmDeposit ||
      canPropose ||
      canAccept ||
      canDecline ||
      canMarkOutcome
    const showNextActionPill =
      Boolean(nextAction) && !isCompact && !hasPrimaryBookingActions
    const hasChips =
      Boolean(rescheduleMetaLabel) ||
      Boolean(promotionLabel) ||
      (booking.status === 'price_proposed' && Boolean(priceOfferTimeLeft)) ||
      (booking.status === 'confirmed' && Boolean(freeCancelLabel)) ||
      (!isCompact && depositPercent > 0 && depositAmount <= 0) ||
      depositAmount > 0 ||
      (depositAmount > 0 && Boolean(depositStatusLabel))

    return (
      <div
        className={`booking-item${showCornerChat ? ' has-corner-action' : ''}${
          options?.archived ? ' is-archived' : ''
        }${
          focusedBookingId === booking.id ? ' is-focus' : ''
        }${isCompact ? ' is-compact' : ''}`}
        key={booking.id}
        id={`pro-booking-${booking.id}`}
      >
        {!isCompact && (
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
                  variant="label"
                  className="booking-item-trust"
                />
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
        )}
        {showCornerChat && (
          <button
            className="booking-item-chat-corner"
            type="button"
            onClick={() => onOpenChat(booking.chatId!)}
            aria-label="Открыть чат"
          >
            <span className="booking-action-icon-symbol" aria-hidden="true">
              <IconChat />
            </span>
            <span className="booking-item-chat-corner-label">Чат</span>
          </button>
        )}
        {isCompact && (
          <div className="booking-item-summary">
            <div className="booking-item-service">
              {booking.serviceName}
            </div>
            <div className="booking-item-price">{priceLabel}</div>
          </div>
        )}
        {!isCompact && scheduledLabel && (
          <div className="booking-item-meta booking-item-meta--primary">
            <span className="booking-item-meta-icon" aria-hidden="true">
              <IconCalendar />
            </span>
            {scheduledLabel}
          </div>
        )}
        {!isCompact && (locationLabel || distanceLabel) && (
          <div className="booking-item-meta booking-item-meta--row booking-item-meta--secondary">
            {locationLabel && (
              <span className="booking-item-meta-segment">{locationLabel}</span>
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
        )}
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
            {booking.status === 'price_proposed' && priceOfferTimeLeft && (
              <div className="booking-item-meta booking-item-meta--chip booking-item-meta--highlight">
                Ожидание клиента: {priceOfferTimeLeft}
              </div>
            )}
            {booking.status === 'confirmed' && freeCancelLabel && (
              <div className="booking-item-meta booking-item-meta--chip booking-item-meta--highlight">
                Бесплатная отмена до: {freeCancelLabel}
              </div>
            )}
            {!isCompact && depositPercent > 0 && depositAmount <= 0 && (
              <div className="booking-item-meta booking-item-meta--chip">
                Депозит: {depositPercent}%
              </div>
            )}
            {depositAmount > 0 && (
              <div className="booking-item-meta booking-item-meta--chip">
                Депозит: {formatPrice(depositAmount)}
              </div>
            )}
            {depositAmount > 0 && depositStatusLabel && (
              <div className="booking-item-meta booking-item-meta--chip booking-item-meta--highlight">
                {depositStatusLabel}
              </div>
            )}
          </div>
        )}
        {showNextActionPill && nextAction && (
          <NextActionPill
            action={nextAction}
            className="booking-action-pill"
            onClick={() => handleBookingActionFocus(booking, nextAction.id)}
          />
        )}
        {hasExtraDetails && (
          <div className="booking-item-details">
            {cityDistrictLabel && (
              <div className="booking-item-detail-row">
                <span className="booking-item-detail-label">Локация</span>
                <span className="booking-item-detail-value">
                  {cityDistrictLabel}
                </span>
              </div>
            )}
            {booking.locationType === 'client' && booking.address && (
              <div className="booking-item-detail-row">
                <span className="booking-item-detail-label">Адрес</span>
                <span className="booking-item-detail-value">
                  {booking.address}
                </span>
              </div>
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
          </div>
        )}
        {!isCompact && reschedulePending && (
          <div className="booking-actions">
            {canRespondReschedule && (
              <>
                <button
                  className="booking-action is-primary"
                  type="button"
                  onClick={() =>
                    handleBookingAction(booking.id, 'reschedule-accept')
                  }
                  disabled={isActionLoading}
                >
                  Принять перенос
                </button>
                <button
                  className="booking-action"
                  type="button"
                  onClick={() =>
                    handleBookingAction(booking.id, 'reschedule-decline')
                  }
                  disabled={isActionLoading}
                >
                  Отклонить
                </button>
              </>
            )}
            {canCancelReschedule && (
              <button
                className="booking-action is-ghost"
                type="button"
                onClick={() =>
                  handleBookingAction(booking.id, 'reschedule-cancel')
                }
                disabled={isActionLoading}
              >
                Отменить перенос
              </button>
            )}
          </div>
        )}
        {booking.depositProofUrl && (
          <div className="booking-deposit-proof">
            <button
              className="booking-deposit-proof-button"
              type="button"
              onClick={() => setDepositReviewBookingId(booking.id)}
            >
              <img src={booking.depositProofUrl} alt="Чек оплаты" />
            </button>
          </div>
        )}
        {canConfirmDeposit && (
          <div className="booking-actions">
            <button
              className="booking-action is-primary"
              type="button"
              onClick={() => setDepositReviewBookingId(booking.id)}
              disabled={isActionLoading}
            >
              Проверить чек
            </button>
            {booking.chatId && (
              <button
                className="booking-action"
                type="button"
                onClick={() => onOpenChat(booking.chatId!)}
                disabled={isActionLoading}
              >
                Открыть чат
              </button>
            )}
          </div>
        )}
        {outcomeLabel && (
          <div className="booking-item-outcome">Итог: {outcomeLabel}</div>
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
                {isCurrentActionLoading ? 'Подтверждаем...' : 'Принять'}
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
    action:
      | 'master-accept'
      | 'master-decline'
      | 'master-propose-price'
      | 'master-deposit-confirm'
      | 'master-deposit-reject'
      | 'reschedule-accept'
      | 'reschedule-decline'
      | 'reschedule-cancel',
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
      const data = (await response.json().catch(() => null)) as
        | {
            error?: string
            status?: Booking['status']
            proposedPrice?: number | null
            depositStatus?: Booking['depositStatus']
            depositAmount?: number | null
            depositHoldExpiresAt?: string | null
            depositProofUrl?: string | null
            scheduledAt?: string | null
            chatId?: number | null
          }
        | null
      if (!response.ok) {
        throw new Error(data?.error || 'Booking update failed')
      }

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
          if (action === 'reschedule-accept' && data?.scheduledAt) {
            next.scheduledAt = data.scheduledAt
          }
          if (
            action === 'reschedule-accept' ||
            action === 'reschedule-decline' ||
            action === 'reschedule-cancel'
          ) {
            next.rescheduleProposedAt = null
            next.rescheduleProposedBy = null
            next.rescheduleProposedTime = null
            next.rescheduleNote = null
          }
          if (data?.depositStatus) {
            next.depositStatus = data.depositStatus
          }
          if (typeof data?.depositAmount === 'number') {
            next.depositAmount = data.depositAmount
          }
          if ('depositHoldExpiresAt' in (data ?? {})) {
            next.depositHoldExpiresAt = data?.depositHoldExpiresAt ?? null
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
      )
      if (
        action === 'master-deposit-confirm' ||
        action === 'master-deposit-reject'
      ) {
        setDepositReviewBookingId(null)
      }
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : ''
      const shouldResyncBookings =
        action === 'master-accept' &&
        (errorCode === 'status_invalid' || errorCode === 'server_error')
      if (shouldResyncBookings) {
        void loadBookings({ silent: true, force: true })
      }
      const message =
        errorCode === 'deposit_status_invalid'
          ? 'Чек уже обработан. Обновите список.'
          : errorCode === 'status_invalid' && action === 'master-accept'
            ? 'Запись уже обновлена. Синхронизируем список.'
            : errorCode === 'server_error' && action === 'master-accept'
              ? 'Проверяем статус подтверждения...'
          : errorCode === 'status_invalid'
            ? 'Действие недоступно в текущем статусе.'
            : 'Не удалось обновить запись.'
      setBookingActionError((current) => ({
        ...current,
        [bookingId]: message,
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

  const handleCloseDepositReview = useCallback(() => {
    setDepositReviewBookingId(null)
  }, [])

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
    const proposedSlotRaw = draft.proposedSlotAt.trim()
    const hasProposedSlot = proposedSlotRaw.length > 0
    const parsedSlotLabel = hasProposedSlot ? formatSlotLabel(proposedSlotRaw) : ''
    const proposedTimeValue = draft.proposedTime.trim() || parsedSlotLabel
    const hasProposedTime = proposedTimeValue.length > 0

    if (!hasPrice && !hasComment && !hasProposedTime && !hasProposedSlot) {
      setSubmitError((current) => ({
        ...current,
        [requestId]: 'Добавьте цену или комментарий.',
      }))
      setSubmittingId(null)
      return
    }

    if (hasProposedSlot && !parsedSlotLabel) {
      setSubmitError((current) => ({
        ...current,
        [requestId]: 'Некорректная дата или время.',
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
            proposedTime: proposedTimeValue || null,
            proposedSlotAt: hasProposedSlot
              ? new Date(proposedSlotRaw).toISOString()
              : null,
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

        if (data?.error === 'proposedSlot_invalid') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Некорректная дата или время.',
          }))
          return
        }

        if (data?.error === 'time_unavailable') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Выбранное время уже занято.',
          }))
          return
        }

        if (data?.error === 'slot_reserved') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Этот слот уже удержан.',
          }))
          return
        }

        if (data?.error === 'schedule_unavailable') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Настройте график, чтобы предлагать время.',
          }))
          return
        }

        if (data?.error === 'day_unavailable') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'В этот день вы не работаете.',
          }))
          return
        }

        if (data?.error === 'service_unavailable') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Эта услуга не доступна в профиле.',
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

      const data = (await response.json().catch(() => null)) as
        | { proposedSlotAt?: string | null; holdExpiresAt?: string | null }
        | null

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
                responseProposedSlotAt:
                  data?.proposedSlotAt ??
                  (hasProposedSlot ? new Date(proposedSlotRaw).toISOString() : null),
                responseHoldExpiresAt: data?.holdExpiresAt ?? null,
                nextAction: null,
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
            onClick={() => handleUserTabChange('requests')}
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
            onClick={() => handleUserTabChange('bookings')}
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
                  : 'Пока нет заявок и записей в работе.'}
              </p>
            )}
            {showRequestsEmpty && renderShareCard()}

            {items.length > 0 && (
              <div className="requests-section">
                <div className="requests-section-head">
                  <span className="requests-section-title">Входящие заявки</span>
                  <span className="requests-section-count">{items.length}</span>
                </div>
                <VirtualStack
                  ref={requestsVirtualRef}
                  items={items}
                  estimateSize={360}
                  gap={10}
                  overscan={8}
                  className="requests-list"
                  getItemKey={(item: ProRequest) => item.id}
                  renderItem={(item: ProRequest) => {
                    const categoryLabel =
                      categoryItems.find(
                        (category) => category.id === item.categoryId
                      )?.label ?? item.categoryId
                    const locationLabel =
                      locationLabelMap[item.locationType] ?? 'Не важно'
                    const distanceLabel = formatDistance(item.distanceKm)
                    const baseDateLabel =
                      item.dateOption === 'choose'
                        ? formatDateTime(item.dateTime) || 'По договоренности'
                        : dateLabelMap[item.dateOption]
                    const timeWindowLabel = formatTimeWindowList(item.timeWindows)
                    const dateLabel = timeWindowLabel
                      ? `${baseDateLabel} · ${timeWindowLabel}`
                      : baseDateLabel
                    const statusLabel =
                      item.status === 'open' ? 'Открыта' : 'Закрыта'
                    const clientName = item.clientName?.trim() || 'Клиент'
                    const clientInitials = getInitials(clientName)
                    const tagItems = Array.isArray(item.tags) ? item.tags : []
                    const photoItems = Array.isArray(item.photoUrls)
                      ? item.photoUrls
                      : []
                    const timeWindowChoices = Array.isArray(item.timeWindows)
                      ? item.timeWindows
                      : []
                    const slotSuggestions = buildRequestSlotSuggestions(item)
                    const responseStatusLabel = item.responseStatus
                      ? responseStatusLabelMap[
                          item.responseStatus as keyof typeof responseStatusLabelMap
                        ] ?? item.responseStatus
                      : ''
                    const dispatchTimeLeft = formatTimeLeft(item.dispatchExpiresAt)
                    const dispatchBatchLabel = item.dispatchBatch
                      ? `Волна ${item.dispatchBatch}`
                      : ''
                    const leadScore =
                      typeof item.leadScore === 'number' ? item.leadScore : null
                    const leadReasons = Array.isArray(item.leadReasons)
                      ? item.leadReasons
                      : []
                    const isFinalResponse = ['accepted', 'rejected', 'expired'].includes(
                      item.responseStatus ?? ''
                    )
                    const nextAction = item.nextAction ?? null
                    const draft = drafts[item.id] ?? {
                      price: '',
                      comment: '',
                      proposedTime: '',
                      proposedSlotAt: normalizeSlotInputValue(
                        item.responseProposedSlotAt
                      ),
                    }
                    const isSubmitting = submittingId === item.id
                    const canRespond =
                      missingFields.length === 0 &&
                      isActive &&
                      item.status === 'open' &&
                      !isFinalResponse &&
                      (item.responseStatus === 'sent' || Boolean(dispatchTimeLeft))
                    const showSlotEmpty = slotSuggestions.length === 0 && canRespond

                    return (
                      <div
                        className={`pro-request-item${
                          focusedRequestId === item.id ? ' is-focus' : ''
                        }`}
                        key={item.id}
                        id={`pro-request-${item.id}`}
                      >
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
                              {leadScore !== null && (
                                <span className="request-lead-score">
                                  {leadScore}
                                </span>
                              )}
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
                          {dateLabel} · {locationLabel}
                          {distanceLabel ? ` • ${distanceLabel}` : ''}
                        </div>
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
                        {responseStatusLabel && (
                          <div className="request-item-meta">
                            Ваш отклик: {responseStatusLabel}
                          </div>
                        )}
                        {nextAction && (
                          <NextActionPill
                            action={nextAction}
                            className="request-action-pill"
                            onClick={() => handleRequestActionFocus(item.id)}
                          />
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
                          {item.responseStatus === 'accepted' && !item.chatId && (
                            <span className="request-chat-pending">
                              Чат создаётся...
                            </span>
                          )}
                        {(item.cityName || item.districtName) && (
                          <div className="request-item-meta">
                            {item.cityName ? item.cityName : ''}
                            {item.districtName
                              ? `${item.cityName ? ' • ' : ''}${item.districtName}`
                              : ''}
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
                        {leadReasons.length > 0 && (
                          <div className="request-tags request-tags--lead" role="list">
                            {leadReasons.map((reason, index) => (
                              <span
                                className="request-chip"
                                key={`${item.id}-lead-${index}`}
                                role="listitem"
                              >
                                {reason}
                              </span>
                            ))}
                          </div>
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

                          {timeWindowChoices.length > 0 && (
                            <div className="request-chips pro-response-chips">
                              {timeWindowChoices.map((window, index) => {
                                const chipLabel = formatTimeWindowChip(window)
                                if (!chipLabel) return null
                                const choiceLabel = formatTimeWindowChoice(
                                  item.dateOption,
                                  window
                                )
                                return (
                                  <button
                                    className="request-chip"
                                    key={`${item.id}-window-${index}`}
                                    type="button"
                                    onClick={() => {
                                      handleDraftChange(item.id, 'proposedTime', choiceLabel)
                                      hapticSelection()
                                    }}
                                    disabled={!canRespond}
                                  >
                                    {chipLabel}
                                  </button>
                                )
                            })}
                          </div>
                          )}

                          {slotSuggestions.length > 0 && (
                            <div className="pro-response-slots">
                              <div className="pro-response-slots-head">
                                <span className="pro-response-slots-title">
                                  Свободные окна под заявку
                                </span>
                                <button
                                  className="pro-response-slots-action"
                                  type="button"
                                  onClick={() => {
                                    scrollToSlots()
                                    handleOpenAddSlots()
                                  }}
                                  disabled={!canRespond}
                                >
                                  Управлять
                                </button>
                              </div>
                              <div className="request-chips pro-response-chips pro-response-chips--slots">
                                {slotSuggestions.map((slot) => (
                                  <button
                                    className={`request-chip${
                                      draft.proposedSlotAt === slot.value
                                        ? ' is-active'
                                        : ''
                                    }${slot.confidenceLabel ? ' is-boosted' : ''}`}
                                    key={`${item.id}-slot-${slot.id}`}
                                    type="button"
                                    onClick={() => {
                                      handleDraftChange(
                                        item.id,
                                        'proposedSlotAt',
                                        slot.value
                                      )
                                      handleDraftChange(
                                        item.id,
                                        'proposedTime',
                                        slot.label
                                      )
                                      hapticSelection()
                                    }}
                                    disabled={!canRespond}
                                  >
                                    <span className="request-chip-label">{slot.label}</span>
                                    {slot.confidenceLabel && (
                                      <span className="request-chip-badge">
                                        {slot.confidenceLabel}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                              {draft.proposedSlotAt && (
                                <button
                                  className="pro-response-slots-clear"
                                  type="button"
                                  onClick={() => {
                                    handleDraftChange(item.id, 'proposedSlotAt', '')
                                    handleDraftChange(item.id, 'proposedTime', '')
                                  }}
                                  disabled={!canRespond}
                                >
                                  Сбросить слот
                                </button>
                              )}
                              <p className="pro-response-slots-note">
                                Слот удержится за клиентом на 20 минут после
                                отклика.
                              </p>
                            </div>
                          )}

                          {showSlotEmpty && (
                            <div className="pro-response-slots-empty">
                              <p className="pro-response-slots-empty-title">
                                Нет свободных окон под заявку
                              </p>
                              <p className="pro-response-slots-empty-text">
                                Откройте окна или предложите время вручную.
                              </p>
                              <button
                                className="pro-response-slots-empty-action"
                                type="button"
                                onClick={() => {
                                  scrollToSlots()
                                  handleOpenAddSlots()
                                }}
                              >
                                Открыть окна
                              </button>
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
                  }}
                />
                </div>
              )}

              {pendingBookingItems.length > 0 && (
                <div className="requests-section">
                  <div className="requests-section-head">
                    <div className="requests-section-title-group">
                      <span className="requests-section-title">Записи в работе</span>
                      <span className="requests-section-count">
                        {pendingBookingItems.length}
                      </span>
                      {depositPipelineBookingsCount > 0 && (
                        <span className="requests-section-count">
                          Депозит: {depositPipelineBookingsCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <VirtualStack
                    ref={pendingBookingsVirtualRef}
                    items={pendingBookingItems}
                    estimateSize={320}
                    gap={12}
                    overscan={6}
                    className="requests-list booking-list"
                    getItemKey={(item: Booking) => item.id}
                    renderItem={(booking: Booking) => renderBookingItem(booking)}
                  />
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
                    <VirtualStack
                      ref={archivedBookingsVirtualRef}
                      items={archivedBookingItems}
                      estimateSize={300}
                      gap={12}
                      overscan={4}
                      className="requests-list booking-list is-archived"
                      getItemKey={(item: Booking) => item.id}
                      renderItem={(booking: Booking) =>
                        renderBookingItem(booking, { archived: true })
                      }
                    />
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
                    aria-label="Предыдущие две недели"
                    onClick={() => handleShiftRange(-1)}
                  >
                    ‹
                  </button>
                  <div className="booking-calendar-month">
                    <span className="booking-calendar-month-label">{monthLabel}</span>
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
                          {weekDayLabels[index % weekDayLabels.length]}
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
                    <button
                      className="pro-slots-head-action"
                      type="button"
                      aria-label="Открыть график"
                      onClick={() => onEditProfile('availability')}
                    >
                      <span className="pro-slots-head-icon" aria-hidden="true">
                        <IconSettings />
                      </span>
                    </button>
                  </header>
                  <div className="pro-slots-filters" role="tablist">
                    {([
                      ['all', 'Все'],
                      ['free', 'Свободно'],
                      ['booked', 'Записи'],
                    ] as const).map(([value, label]) => {
                      const count =
                        value === 'all'
                          ? slotFilterCounts.all
                          : value === 'free'
                            ? slotFilterCounts.free
                            : slotFilterCounts.booked
                      return (
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
                          <span className="pro-slots-filter-label">{label}</span>
                          <span className="pro-slots-filter-count">{count}</span>
                        </button>
                      )
                    })}
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
                            : slot.status === 'pending'
                              ? 'Ожидает'
                              : slot.status === 'booked'
                                ? 'Занято'
                                : 'Закрыто'
                        const statusLabelFull =
                          slot.status === 'pending'
                            ? 'Ожидает подтверждения'
                            : statusLabel
                        const booking = slot.booking
                        const isSlotConfirmTarget =
                          slotConfirm?.type !== 'cancel-booking' &&
                          slotConfirm?.slotId === slot.id
                        const isBookingSlot = Boolean(booking)
                        const bookingClientName =
                          booking?.clientName?.trim() || 'Клиент'
                        const bookingClientInitials = getInitials(bookingClientName)
                        const bookingServiceName = booking?.serviceName ?? ''
                        const bookingLocationLabel = booking
                          ? locationLabelMap[booking.locationType] ?? ''
                          : ''
                        const bookingPreviewLabel = [
                          bookingServiceName,
                          bookingLocationLabel,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                        const bookingDepositAmount = booking
                          ? resolveBookingDepositAmount(booking)
                          : 0
                        const bookingDepositStatus =
                          booking
                            ? resolveBookingDepositStatus(
                                booking,
                                bookingDepositAmount
                              )
                            : 'not_required'
                        const bookingDepositLabel =
                          bookingDepositStatus === 'submitted'
                            ? 'Чек на проверке'
                            : bookingDepositStatus === 'pending'
                              ? 'Ожидает депозит'
                              : bookingDepositStatus === 'rejected'
                                ? 'Чек отклонён'
                                : bookingDepositStatus === 'expired'
                                  ? 'Слот снят'
                                  : ''
                        const bookingDepositTone =
                          bookingDepositStatus === 'rejected' ||
                          bookingDepositStatus === 'expired'
                            ? 'is-danger'
                            : bookingDepositStatus === 'submitted' ||
                                bookingDepositStatus === 'pending'
                              ? 'is-warning'
                              : ''
                        const isDetailsOpen = isBookingSlot && slotDetails?.id === slot.id
                        const isExpanded = isDetailsOpen
                        const isWide = isSlotConfirmTarget
                        const detailsId = isBookingSlot ? 'pro-slot-details-sheet' : undefined
                        const toggleLabel = isDetailsOpen
                          ? 'Скрыть карточку записи'
                          : 'Открыть карточку записи'
                        return (
                          <div
                            className={`pro-slot-card is-${slot.status}${
                              isWide ? ' is-expanded' : ''
                            }${isExpanded ? ' is-open' : ''}`}
                            key={`${slot.id}-${timeLabel}`}
                          >
                            <div className="pro-slot-row">
                              <div className="pro-slot-body">
                                <div
                                  className={`pro-slot-top${
                                    isBookingSlot ? ' is-booking' : ''
                                  }`}
                                >
                                  {isBookingSlot && (
                                    <button
                                      className="pro-slot-toggle"
                                      type="button"
                                      aria-expanded={isExpanded}
                                      aria-controls={detailsId}
                                      aria-label={toggleLabel}
                                      onClick={() => toggleSlotExpand(slot)}
                                    />
                                  )}
                                  {isBookingSlot ? (
                                    <>
                                      <div className="pro-slot-time-stack">
                                        <span className="pro-slot-time">
                                          {timeLabel}
                                        </span>
                                        <span
                                          className={`pro-slot-status pro-slot-time-badge is-${slot.status}`}
                                          aria-label={statusLabelFull}
                                          title={statusLabelFull}
                                        >
                                          {statusLabel}
                                        </span>
                                      </div>
                                      <span
                                        className="pro-slot-preview-avatar"
                                        aria-hidden="true"
                                      >
                                        {bookingClientInitials}
                                      </span>
                                      <span className="pro-slot-preview-text">
                                        <span className="pro-slot-preview-name">
                                          {bookingClientName}
                                        </span>
                                        {bookingPreviewLabel && (
                                          <span className="pro-slot-preview-meta">
                                            {bookingPreviewLabel}
                                          </span>
                                        )}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="pro-slot-time">
                                        {timeLabel}
                                      </span>
                                      <span
                                        className={`pro-slot-status is-${slot.status}`}
                                        aria-label={statusLabelFull}
                                        title={statusLabelFull}
                                      >
                                        {statusLabel}
                                      </span>
                                    </>
                                  )}
                                  {isBookingSlot ? (
                                    <div className="pro-slot-trailing">
                                      {bookingDepositLabel && (
                                        <span
                                          className={`pro-slot-preview-pill ${bookingDepositTone}`}
                                        >
                                          {bookingDepositLabel}
                                        </span>
                                      )}
                                      <span
                                        className="pro-slot-toggle-icon"
                                        aria-hidden="true"
                                      >
                                        <IconChevron />
                                      </span>
                                    </div>
                                  ) : (
                                    <div
                                      className={`pro-slot-actions${
                                        isSlotConfirmTarget ? ' is-hidden' : ''
                                      }`}
                                    >
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
                                  )}
                                </div>
                                {slot.status === 'closed' && slot.reason && (
                                  <div className="pro-slot-meta">{slot.reason}</div>
                                )}
                              </div>
                            </div>
                            {isSlotConfirmTarget && slotConfirmContent && (
                              <div className="pro-slots-confirm">
                                <p className="pro-slots-confirm-title">
                                  {slotConfirmContent.title}
                                </p>
                                <div className="pro-slots-confirm-actions">
                                  <button
                                    className={`pro-slots-confirm-primary ${
                                      slotConfirmContent.tone === 'is-danger'
                                        ? 'is-danger'
                                        : ''
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
                          </div>
                        )
                      })}
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

      {depositReviewBooking && (
        <div
          className="deposit-sheet-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pro-deposit-sheet-title"
          onClick={handleCloseDepositReview}
        >
          <div
            className="deposit-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="deposit-sheet-handle" aria-hidden="true" />
            <header className="deposit-sheet-head">
              <div>
                <p className="deposit-sheet-kicker">Проверка депозита</p>
                <h3 className="deposit-sheet-title" id="pro-deposit-sheet-title">
                  {depositReviewBooking.clientName ?? 'Клиент'}
                </h3>
                <p className="deposit-sheet-subtitle">
                  {depositReviewBooking.serviceName} ·{' '}
                  {formatDateTime(depositReviewBooking.scheduledAt)}
                </p>
              </div>
              <button
                className="deposit-sheet-close"
                type="button"
                onClick={handleCloseDepositReview}
                aria-label="Закрыть"
              >
                ×
              </button>
            </header>

            <div className="deposit-sheet-amount-card">
              <p className="deposit-sheet-amount-label">Сумма депозита</p>
              <p className="deposit-sheet-amount-value">
                {depositReviewAmount > 0
                  ? formatPrice(depositReviewAmount)
                  : 'Не указана'}
              </p>
              <p className="deposit-sheet-status">
                {depositReviewStatus === 'submitted'
                  ? 'Клиент отправил чек, требуется ваша проверка'
                  : depositReviewStatus === 'confirmed'
                    ? 'Депозит подтверждён'
                    : depositReviewStatus === 'rejected'
                      ? 'Чек отклонён, ожидание повторной отправки'
                      : 'Статус депозита обновляется'}
              </p>
            </div>

            <div className="deposit-sheet-body">
              {depositReviewBooking.depositProofUrl ? (
                <div className="deposit-sheet-proof">
                  <img src={depositReviewBooking.depositProofUrl} alt="Чек оплаты" />
                </div>
              ) : (
                <p className="deposit-sheet-note">
                  Клиент ещё не приложил чек.
                </p>
              )}
              {bookingActionError[depositReviewBooking.id] && (
                <p className="deposit-sheet-note is-error">
                  {bookingActionError[depositReviewBooking.id]}
                </p>
              )}
            </div>

            <div className="deposit-sheet-actions">
              <button
                className="deposit-sheet-primary"
                type="button"
                onClick={() =>
                  handleBookingAction(depositReviewBooking.id, 'master-deposit-confirm')
                }
                disabled={
                  bookingActionId === depositReviewBooking.id ||
                  depositReviewStatus !== 'submitted'
                }
              >
                Подтвердить депозит
              </button>
              <button
                className="deposit-sheet-secondary"
                type="button"
                onClick={() =>
                  handleBookingAction(depositReviewBooking.id, 'master-deposit-reject')
                }
                disabled={
                  bookingActionId === depositReviewBooking.id ||
                  depositReviewStatus !== 'submitted'
                }
              >
                Отклонить чек
              </button>
              {depositReviewBooking.chatId && (
                <button
                  className="deposit-sheet-secondary"
                  type="button"
                  onClick={() => onOpenChat(depositReviewBooking.chatId!)}
                >
                  Открыть чат
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {slotDetailsBooking && (
        <div
          className="pro-slot-details-sheet-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pro-slot-details-sheet-title"
          onClick={handleCloseSlotDetails}
        >
          <div
            className="pro-slot-details-sheet"
            id="pro-slot-details-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="pro-slot-details-sheet-handle" aria-hidden="true" />
            <header className="pro-slot-details-sheet-head">
              <div>
                <p className="pro-slot-details-sheet-kicker">Запись</p>
                <h3
                  className="pro-slot-details-sheet-title"
                  id="pro-slot-details-sheet-title"
                >
                  {slotDetailsTimeLabel}
                </h3>
                {slotDetailsDateLabel && (
                  <p className="pro-slot-details-sheet-subtitle">
                    {slotDetailsDateLabel}
                  </p>
                )}
              </div>
              <button
                className="pro-slot-details-sheet-close"
                type="button"
                onClick={handleCloseSlotDetails}
                aria-label="Закрыть"
              >
                ×
              </button>
            </header>
            <div className="pro-slot-details-sheet-body">
              <div className="pro-slot-details">
                <div className="pro-slot-details-head">
                  <div className="pro-slot-details-title">
                    <span className="pro-slot-details-kicker">Клиент</span>
                    <span className="pro-slot-details-name">
                      {slotDetailsClientName}
                    </span>
                  </div>
                  <div className="pro-slot-details-badges">
                    <span
                      className={`pro-slot-details-status ${slotDetailsStatusTone}`}
                    >
                      {slotDetailsStatusLabel}
                    </span>
                    <TrustBadge
                      trust={slotDetailsBooking.clientTrust ?? null}
                      size="sm"
                      variant="label"
                      className="pro-slot-details-trust"
                    />
                  </div>
                </div>
                {slotDetailsMetaItems.length > 0 && (
                  <div className="pro-slot-details-info">
                    {slotDetailsMetaItems.length > 0 && (
                      <div className="pro-slot-details-meta">
                        {slotDetailsMetaItems.map((item, index) => (
                          <span
                            className="pro-slot-details-meta-item"
                            key={`slot-details-meta-${index}`}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="pro-slot-details-body">
                  {renderBookingItem(slotDetailsBooking, { compact: true })}
                </div>
              </div>
            </div>
            {!isSlotDetailsCancelConfirm && slotDetailsActionsCount > 0 && (
              <div className={slotDetailsActionClassName}>
                {slotDetailsCanRespondReschedule && (
                  <>
                    <button
                      className="pro-slot-details-sheet-action is-primary"
                      type="button"
                      onClick={handleSlotDetailsRescheduleAccept}
                      disabled={isSlotDetailsActionLoading}
                    >
                      Принять перенос
                    </button>
                    <button
                      className="pro-slot-details-sheet-action"
                      type="button"
                      onClick={handleSlotDetailsRescheduleDecline}
                      disabled={isSlotDetailsActionLoading}
                    >
                      Отклонить перенос
                    </button>
                  </>
                )}
                {slotDetailsCanCancelReschedule && (
                  <button
                    className="pro-slot-details-sheet-action is-danger"
                    type="button"
                    onClick={handleSlotDetailsRescheduleCancel}
                    disabled={isSlotDetailsActionLoading}
                  >
                    Отменить перенос
                  </button>
                )}
                {canSlotDetailsReschedule && (
                  <button
                    className="pro-slot-details-sheet-action is-primary"
                    type="button"
                    onClick={handleSlotDetailsReschedule}
                    disabled={isSlotDetailsActionLoading}
                  >
                    Перенести запись
                  </button>
                )}
                {canSlotDetailsCancelBooking && (
                  <button
                    className="pro-slot-details-sheet-action is-danger"
                    type="button"
                    onClick={handleSlotDetailsCancel}
                    disabled={isSlotDetailsActionLoading}
                  >
                    Отменить запись
                  </button>
                )}
              </div>
            )}
            {isSlotDetailsCancelConfirm && slotConfirmContent && (
              <div className="pro-slots-confirm pro-slots-confirm--sheet">
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
          </div>
        </div>
      )}

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
        onCabinet={onViewCabinet ?? onBack}
        onRequests={() => handleUserTabChange('requests')}
        onChats={onViewChats}
        onProfile={() => onEditProfile()}
        allowActiveClick
      />
    </div>
  )
}
