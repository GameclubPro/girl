import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { IconClock, IconPhoto, IconPin } from '../components/icons'
import { TrustBadge } from '../components/TrustBadge'
import type { Booking, ChatDetail, ChatMessage, RequestTimeWindow } from '../types/app'
import type { ChatStreamStatus } from '../utils/chatStream'
import { getChatStream } from '../utils/chatStream'
import {
  getCachedChatDetail,
  getCachedChatMessages,
  setCachedChatDetail,
  setCachedChatMessages,
} from '../utils/chatCache'
import {
  enqueueOutbox,
  getOutbox,
  pruneOutbox,
  removeOutboxItem,
  updateOutboxItem,
  type OutboxItem,
} from '../utils/chatOutbox'

type ChatThreadScreenProps = {
  apiBase: string
  userId: string
  chatId: number
  onBack: () => void
  onViewRequests?: (tab?: 'requests' | 'bookings') => void
}

const locationLabelMap = {
  master: 'У мастера',
  client: 'У клиента',
  any: 'Не важно',
} as const

const bookingOutcomeLabelMap: Record<string, string> = {
  on_time: 'Вовремя',
  late: 'Опоздал',
  no_show: 'Не пришёл',
}

const bookingStatusLabelMap: Record<string, string> = {
  pending: 'Ожидает подтверждения',
  price_pending: 'Ожидает цену',
  price_proposed: 'Предложена цена',
  confirmed: 'Подтверждено',
  declined: 'Отказ',
  cancelled: 'Отменено',
}

const requestStatusLabelMap: Record<string, string> = {
  open: 'Ожидает отклика',
  closed: 'Согласовано',
}

const lateMinuteOptions = [5, 10, 15, 20, 30]

const formatDurationLabel = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return ''
  }
  return `${Math.round(value)} мин`
}

const parseOutcomePromptMeta = (meta: ChatMessage['meta']) => {
  if (!meta || typeof meta !== 'object') return null
  const payload = meta as Record<string, unknown>
  if (payload.event !== 'booking_outcome_prompt') return null
  const rawId = payload.bookingId
  const bookingId = typeof rawId === 'number' ? rawId : Number(rawId)
  if (!Number.isInteger(bookingId)) return null
  return {
    bookingId,
    serviceName: typeof payload.serviceName === 'string' ? payload.serviceName : null,
    scheduledAt: typeof payload.scheduledAt === 'string' ? payload.scheduledAt : null,
    serviceDuration:
      typeof payload.serviceDuration === 'number' ? payload.serviceDuration : null,
    actionExpiresAt:
      typeof payload.actionExpiresAt === 'string' ? payload.actionExpiresAt : null,
  }
}

const parseOutcomeMarkedMeta = (meta: ChatMessage['meta']) => {
  if (!meta || typeof meta !== 'object') return null
  const payload = meta as Record<string, unknown>
  if (payload.event !== 'booking_outcome_marked') return null
  const rawId = payload.bookingId
  const bookingId = typeof rawId === 'number' ? rawId : Number(rawId)
  if (!Number.isInteger(bookingId)) return null
  const outcome = typeof payload.outcome === 'string' ? payload.outcome : ''
  const lateMinutes =
    typeof payload.lateMinutes === 'number' ? payload.lateMinutes : null
  return {
    bookingId,
    outcome,
    lateMinutes,
  }
}

const formatOutcomeSummary = (outcome?: string | null, lateMinutes?: number | null) => {
  if (!outcome) return ''
  if (outcome === 'late' && typeof lateMinutes === 'number') {
    return `Опоздал на ${lateMinutes} мин.`
  }
  return bookingOutcomeLabelMap[outcome] ?? 'Отменено'
}

const formatDateTime = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

const formatTimeWindowList = (windows?: RequestTimeWindow[] | null) => {
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

const formatMessageTime = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

const formatDayLabel = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(parsed)
}

const formatPrice = (value: number) =>
  `${Math.round(value).toLocaleString('ru-RU')} ₽`

const formatTimeLeftFromMs = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const totalMinutes = Math.floor(ms / 60000)
  if (totalMinutes <= 0) return ''
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes} мин`
  if (minutes <= 0) return `${hours} ч`
  return `${hours} ч ${minutes} мин`
}

const formatTimeLeft = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatTimeLeftFromMs(parsed.getTime() - Date.now())
}

const extractContextIds = (meta: ChatMessage['meta']) => {
  if (!meta || typeof meta !== 'object') {
    return { bookingId: null, requestId: null }
  }
  const payload = meta as Record<string, unknown>
  const rawBookingId = payload.bookingId
  const rawRequestId = payload.requestId
  const bookingId =
    typeof rawBookingId === 'number'
      ? rawBookingId
      : typeof rawBookingId === 'string'
        ? Number(rawBookingId)
        : null
  const requestId =
    typeof rawRequestId === 'number'
      ? rawRequestId
      : typeof rawRequestId === 'string'
        ? Number(rawRequestId)
        : null
  return {
    bookingId: Number.isInteger(bookingId) ? bookingId : null,
    requestId: Number.isInteger(requestId) ? requestId : null,
  }
}

type MessageStatus = 'sending' | 'sent' | 'failed'

type LocalChatMessage = ChatMessage & {
  status?: MessageStatus
  clientMessageId?: string
  localAttachmentUrl?: string | null
}

const createClientMessageId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `msg_${Math.random().toString(36).slice(2, 10)}`
}

const extractClientMessageId = (
  meta: ChatMessage['meta']
): string | null => {
  if (!meta || typeof meta !== 'object') return null
  const candidate = (meta as Record<string, unknown>).clientMessageId
  return typeof candidate === 'string' ? candidate : null
}

const shouldPersistOutbox = (payload: {
  type: ChatMessage['type']
  attachmentPath?: string | null
}) => payload.type !== 'image' && !payload.attachmentPath

const sortMessages = (items: LocalChatMessage[]) => {
  return [...items].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime()
    const timeB = new Date(b.createdAt).getTime()
    if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
      return timeA - timeB
    }
    return a.id - b.id
  })
}

const supportTopics = [
  {
    id: 'booking',
    label: 'Запись и расписание',
    template: 'Нужна помощь с записью: ',
  },
  {
    id: 'payment',
    label: 'Оплата',
    template: 'Вопрос по оплате: ',
  },
  {
    id: 'profile',
    label: 'Профиль и услуги',
    template: 'Не получается обновить профиль: ',
  },
  {
    id: 'other',
    label: 'Другое',
    template: 'Опишите ситуацию: ',
  },
]

const clientQuickTemplates = [
  {
    id: 'confirm',
    label: 'Подтверждаю',
    template: 'Подтверждаю, мне подходит.',
  },
  {
    id: 'reschedule',
    label: 'Другое время',
    template: 'Можно другое время? Мне удобнее ',
  },
  {
    id: 'question',
    label: 'Уточнить',
    template: 'Есть вопрос по записи: ',
  },
]

export const ChatThreadScreen = ({
  apiBase,
  userId,
  chatId,
  onBack,
  onViewRequests,
}: ChatThreadScreenProps) => {
  const [detail, setDetail] = useState<ChatDetail | null>(null)
  const [messages, setMessages] = useState<LocalChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [composerText, setComposerText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [sendError, setSendError] = useState('')
  const [streamStatus, setStreamStatus] = useState<ChatStreamStatus>('idle')
  const [counterpartLastReadId, setCounterpartLastReadId] = useState<number | null>(
    null
  )
  const [isCounterpartTyping, setIsCounterpartTyping] = useState(false)
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const [quickMode, setQuickMode] = useState<
    null | 'price' | 'time' | 'location'
  >(null)
  const [quickValue, setQuickValue] = useState('')
  const [isContextSheetOpen, setIsContextSheetOpen] = useState(false)
  const [isTrustSheetOpen, setIsTrustSheetOpen] = useState(false)
  const [outcomeSheetBookingId, setOutcomeSheetBookingId] = useState<number | null>(
    null
  )
  const [outcomeSheetMinutes, setOutcomeSheetMinutes] = useState(
    lateMinuteOptions[1] ?? 10
  )
  const [outcomeSubmittingId, setOutcomeSubmittingId] = useState<number | null>(
    null
  )
  const [outcomeError, setOutcomeError] = useState('')
  const [outcomeErrorBookingId, setOutcomeErrorBookingId] = useState<number | null>(
    null
  )
  const [bookingSnapshot, setBookingSnapshot] = useState<Booking | null>(null)
  const [bookingActionId, setBookingActionId] = useState<number | null>(null)
  const [bookingActionError, setBookingActionError] = useState('')
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const screenRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const hasMoreRef = useRef(true)
  const isLoadingMoreRef = useRef(false)
  const hasInitialScrollRef = useRef(false)
  const messagesRef = useRef<LocalChatMessage[]>([])
  const pendingByClientIdRef = useRef(new Map<string, number>())
  const isNearBottomRef = useRef(true)
  const typingTimeoutRef = useRef<number | null>(null)
  const selfTypingTimeoutRef = useRef<number | null>(null)
  const isSelfTypingRef = useRef(false)
  const outboxFlushRef = useRef(false)
  const lastReadSentRef = useRef<number | null>(null)
  const detailAbortRef = useRef<AbortController | null>(null)
  const messagesAbortRef = useRef<{
    initial: AbortController | null
    more: AbortController | null
  }>({ initial: null, more: null })
  const detailRequestIdRef = useRef(0)
  const messagesRequestIdRef = useRef({ initial: 0, more: 0 })
  const bookingSnapshotAbortRef = useRef<AbortController | null>(null)
  const bookingSnapshotRequestIdRef = useRef(0)
  const statusSnapshotRef = useRef<{
    bookingStatus?: Booking['status'] | null
    requestStatus?: string | null
    depositStatus?: Booking['depositStatus'] | null
  } | null>(null)

  const limit = 30
  const stream = useMemo(() => getChatStream(apiBase, userId), [apiBase, userId])

  const counterpart = detail?.counterpart
  const request = detail?.request
  const booking = detail?.booking
  const bookingStatus = bookingSnapshot?.status ?? booking?.status ?? null
  const depositStatus = bookingSnapshot?.depositStatus ?? null
  const depositAmount = bookingSnapshot?.depositAmount ?? null
  const depositHoldExpiresAt = bookingSnapshot?.depositHoldExpiresAt ?? null
  const proposedPrice = bookingSnapshot?.proposedPrice ?? null
  const bookingPrice =
    typeof bookingSnapshot?.servicePrice === 'number'
      ? bookingSnapshot.servicePrice
      : typeof booking?.servicePrice === 'number'
        ? booking.servicePrice
        : null
  const isBookingActionLoading = bookingActionId === booking?.id
  const isProViewer = detail?.chat?.memberRole === 'master'
  const showTrustBadge = Boolean(isProViewer && counterpart?.role === 'client')
  const contextType = detail?.chat?.contextType ?? null
  const isSupportChat = contextType === 'support'
  const isBookingChat = contextType === 'booking'
  const headerSubtitle = isSupportChat
    ? 'Команда поддержки KIVEN'
    : isBookingChat
      ? booking?.serviceName ?? 'Запись подтверждена'
      : request?.serviceName ?? 'Переговоры по заявке'
  const bookingStatusLabel =
    bookingStatus === 'confirmed' ? 'Подтверждено' : 'Запись'
  const bookingTimeLabel = booking?.scheduledAt
    ? formatDateTime(booking.scheduledAt)
    : 'Время уточняется'
  const bookingPriceLabel =
    typeof bookingSnapshot?.servicePrice === 'number'
      ? `Стоимость: ${formatPrice(bookingSnapshot.servicePrice)}`
      : typeof booking?.servicePrice === 'number'
        ? `Стоимость: ${formatPrice(booking.servicePrice)}`
        : typeof proposedPrice === 'number'
          ? `Предложена цена: ${formatPrice(proposedPrice)}`
          : null
  const bookingDurationLabel = formatDurationLabel(booking?.serviceDuration)
  const baseRequestDateLabel =
    request?.dateOption === 'choose'
      ? formatDateTime(request.dateTime) || 'По договоренности'
      : request?.dateOption === 'tomorrow'
        ? 'Завтра'
        : request?.dateOption === 'today'
          ? 'Сегодня'
          : request?.dateTime
            ? formatDateTime(request.dateTime)
            : 'По договоренности'
  const requestWindowLabel = formatTimeWindowList(request?.timeWindows)
  const requestTimeLabel = requestWindowLabel
    ? `${baseRequestDateLabel} · ${requestWindowLabel}`
    : baseRequestDateLabel
  const requestBudgetLabel = request?.budget ? `Бюджет: ${request.budget}` : null
  const requestStatusLabel =
    request?.status ? requestStatusLabelMap[request.status] ?? 'Заявка' : 'Заявка'
  const activeTitle = booking?.serviceName ?? request?.serviceName ?? 'Диалог'
  const activeStatusLabel = isBookingChat
    ? booking?.outcome
      ? `Итог: ${bookingOutcomeLabelMap[booking.outcome] ?? booking.outcome}`
      : bookingStatus
        ? bookingStatusLabelMap[bookingStatus] ?? bookingStatusLabel
        : bookingStatusLabel
    : request?.status
      ? requestStatusLabelMap[request.status] ?? 'Заявка'
      : 'Заявка'
  const summaryMeta = [
    activeStatusLabel,
    isBookingChat ? bookingTimeLabel : requestTimeLabel,
  ]
    .filter(Boolean)
    .join(' · ')

  const visibleMessages = useMemo(() => {
    if (isProViewer) return messages
    return messages.filter((message) => {
      const meta = message.meta as Record<string, unknown> | null | undefined
      const visibility =
        typeof meta?.visibility === 'string'
          ? meta.visibility
          : typeof meta?.audience === 'string'
            ? meta.audience
            : null
      return visibility !== 'master_only'
    })
  }, [isProViewer, messages])

  const contextHistory = useMemo(() => {
    const contexts = detail?.contexts ?? []
    if (contexts.length === 0) return []
    const activeType = detail?.chat?.contextType ?? null
    const activeId = detail?.chat?.contextId ?? null
    return contexts.filter(
      (context) =>
        !(
          context.contextType === activeType &&
          context.contextId === activeId
        )
    )
  }, [detail?.chat?.contextId, detail?.chat?.contextType, detail?.contexts])

  const getHistoryStatusLabel = (
    context: NonNullable<ChatDetail['contexts']>[number]
  ) => {
    if (context.contextType === 'booking') {
      if (context.outcome) {
        return bookingOutcomeLabelMap[context.outcome] ?? context.outcome
      }
      if (context.status) {
        return bookingStatusLabelMap[context.status] ?? context.status
      }
      return 'Запись'
    }
    if (context.status) {
      return requestStatusLabelMap[context.status] ?? context.status
    }
    return 'Заявка'
  }

  const getHistoryTimeLabel = (
    context: NonNullable<ChatDetail['contexts']>[number]
  ) => {
    if (context.contextType === 'booking') {
      return formatDateTime(context.scheduledAt ?? context.createdAt ?? null)
    }
    if (context.dateOption === 'today') return 'Сегодня'
    if (context.dateOption === 'tomorrow') return 'Завтра'
    if (context.dateOption === 'choose' && context.dateTime) {
      return formatDateTime(context.dateTime)
    }
    if (context.dateTime) {
      return formatDateTime(context.dateTime)
    }
    return context.createdAt ? formatDateTime(context.createdAt) : ''
  }

  const connectionLabel =
    streamStatus === 'connecting' || streamStatus === 'reconnecting'
      ? 'Соединяем...'
      : 'Нет связи'
  const connectionTone =
    streamStatus === 'connecting' || streamStatus === 'reconnecting'
      ? 'is-syncing'
      : streamStatus === 'connected'
        ? 'is-online'
        : 'is-offline'
  const showConnection = streamStatus !== 'connected'
  const showSupportIntro = isSupportChat && visibleMessages.length === 0

  const outcomeByBookingId = useMemo(() => {
    const map = new Map<
      number,
      { outcome: string; lateMinutes: number | null }
    >()
    messages.forEach((message) => {
      if (message.type !== 'system') return
      const meta = parseOutcomeMarkedMeta(message.meta)
      if (!meta?.bookingId) return
      map.set(meta.bookingId, {
        outcome: meta.outcome,
        lateMinutes: meta.lateMinutes ?? null,
      })
    })
    if (detail?.booking?.id && detail.booking.outcome) {
      map.set(detail.booking.id, {
        outcome: detail.booking.outcome,
        lateMinutes: detail.booking.lateMinutes ?? null,
      })
    }
    return map
  }, [
    messages,
    detail?.booking?.id,
    detail?.booking?.lateMinutes,
    detail?.booking?.outcome,
  ])

  const updateCounterpartTrust = useCallback(
    (nextTrust: ChatDetail['counterpart']['trust']) => {
      if (!nextTrust) return
      setDetail((current) => {
        if (!current) return current
        const next = {
          ...current,
          counterpart: {
            ...current.counterpart,
            trust: nextTrust,
          },
        }
        setCachedChatDetail(apiBase, userId, chatId, next)
        return next
      })
    },
    [apiBase, chatId, userId]
  )

  const updateBookingOutcome = useCallback(
    (bookingId: number, outcome: string, lateMinutes: number | null) => {
      setDetail((current) => {
        if (!current?.booking || current.booking.id !== bookingId) return current
        const next = {
          ...current,
          booking: {
            ...current.booking,
            outcome,
            lateMinutes,
          },
        }
        setCachedChatDetail(apiBase, userId, chatId, next)
        return next
      })
    },
    [apiBase, chatId, userId]
  )

  const closeOutcomeSheet = useCallback(() => {
    setOutcomeSheetBookingId(null)
  }, [])

  const openLateOutcomeSheet = useCallback((bookingId: number) => {
    setOutcomeError('')
    setOutcomeErrorBookingId(null)
    setOutcomeSheetMinutes(lateMinuteOptions[1] ?? 10)
    setOutcomeSheetBookingId(bookingId)
  }, [])

  const getScrollElement = useCallback(() => {
    const container = messagesContainerRef.current
    if (container) {
      const isScrollable = container.scrollHeight - container.clientHeight > 4
      if (isScrollable) {
        return container
      }
    }
    return (document.scrollingElement ?? document.documentElement) as HTMLElement
  }, [])

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const container = getScrollElement()
      const top = Math.max(0, container.scrollHeight - container.clientHeight)
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top, behavior })
      } else {
        container.scrollTop = top
      }
      setHasNewMessage(false)
    },
    [getScrollElement]
  )

  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((current) => {
      const map = new Map<number, LocalChatMessage>()
      current.forEach((item) => map.set(item.id, item))
      incoming.forEach((item) => {
        const clientMessageId = extractClientMessageId(item.meta)
        if (clientMessageId) {
          const tempId = pendingByClientIdRef.current.get(clientMessageId)
          if (tempId) {
            map.delete(tempId)
            pendingByClientIdRef.current.delete(clientMessageId)
          } else {
            const matching = Array.from(map.values()).find(
              (entry) =>
                entry.clientMessageId === clientMessageId ||
                extractClientMessageId(entry.meta) === clientMessageId
            )
            if (matching) {
              map.delete(matching.id)
            }
          }
        }
        map.set(item.id, { ...item, status: 'sent' })
      })
      return sortMessages(Array.from(map.values()))
    })
  }, [])

  const updateMessageStatus = useCallback((tempId: number, status: MessageStatus) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === tempId ? { ...item, status } : item
      )
    )
  }, [])

  const appendLocalSystemMessage = useCallback(
    (body: string, meta?: Record<string, unknown>) => {
      const message: ChatMessage = {
        id: -Date.now(),
        chatId,
        senderId: null,
        type: 'system',
        body,
        meta: meta ?? null,
        attachmentUrl: null,
        createdAt: new Date().toISOString(),
      }
      mergeMessages([message])
    },
    [chatId, mergeMessages]
  )

  const scrollToMessage = useCallback((messageId: number) => {
    const element = document.getElementById(`chat-message-${messageId}`)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const sendMessageRequest = useCallback(
    async (
      payload: {
        type: ChatMessage['type']
        body?: string | null
        meta?: Record<string, unknown> | null
        attachmentPath?: string | null
      },
      clientMessageId: string
    ) => {
      const requestMeta =
        payload.meta && typeof payload.meta === 'object'
          ? { ...payload.meta, clientMessageId }
          : { clientMessageId }
      const response = await fetch(`${apiBase}/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: payload.type,
          body: payload.body ?? null,
          meta: requestMeta,
          attachmentPath: payload.attachmentPath ?? null,
        }),
      })
      if (!response.ok) {
        throw new Error('Send failed')
      }
      return (await response.json()) as ChatMessage
    },
    [apiBase, chatId, userId]
  )

  const hydrateOutboxMessages = useCallback(() => {
    const outbox = getOutbox(apiBase, userId).filter(
      (item) => item.chatId === chatId
    )
    if (outbox.length === 0) return
    setMessages((current) => {
      const existingClientIds = new Set(
        current
          .map((item) => extractClientMessageId(item.meta))
          .filter((value): value is string => Boolean(value))
      )
      const existingIds = new Set(current.map((item) => item.id))
      const extras: LocalChatMessage[] = outbox
        .filter((item) => !existingClientIds.has(item.clientMessageId))
        .filter((item) => !existingIds.has(item.tempId))
        .map((item) => ({
          id: item.tempId,
          chatId: item.chatId,
          senderId: userId,
          type: item.payload.type,
          body: item.payload.body ?? null,
          meta: item.payload.meta ?? null,
          attachmentUrl: item.payload.attachmentUrl ?? null,
          createdAt: item.createdAt,
          status: item.retryCount > 0 ? 'failed' : 'sending',
          clientMessageId: item.clientMessageId,
          localAttachmentUrl: item.payload.localAttachmentUrl ?? null,
        }))
      if (extras.length === 0) return current
      extras.forEach((item) => {
        pendingByClientIdRef.current.set(item.clientMessageId!, item.id)
      })
      return sortMessages([...current, ...extras])
    })
  }, [apiBase, chatId, userId])

  const flushOutbox = useCallback(async () => {
    if (outboxFlushRef.current) return
    const outbox = getOutbox(apiBase, userId).filter(
      (item) => item.chatId === chatId
    )
    if (outbox.length === 0) return
    outboxFlushRef.current = true
    const deliveredClientIds = new Set(
      messagesRef.current
        .map((item) => extractClientMessageId(item.meta))
        .filter((value): value is string => Boolean(value))
    )
    try {
      for (const item of outbox) {
        if (deliveredClientIds.has(item.clientMessageId)) {
          removeOutboxItem(apiBase, userId, item.clientMessageId)
          continue
        }
        updateMessageStatus(item.tempId, 'sending')
        updateOutboxItem(apiBase, userId, item.clientMessageId, {
          retryCount: item.retryCount + 1,
          lastAttemptAt: Date.now(),
        })
        try {
          const message = await sendMessageRequest(
            {
              type: item.payload.type,
              body: item.payload.body ?? null,
              meta: item.payload.meta ?? null,
              attachmentPath: item.payload.attachmentPath ?? null,
            },
            item.clientMessageId
          )
          if (message?.id) {
            mergeMessages([message])
          }
          removeOutboxItem(apiBase, userId, item.clientMessageId)
        } catch {
          updateMessageStatus(item.tempId, 'failed')
        }
      }
    } finally {
      outboxFlushRef.current = false
    }
  }, [apiBase, chatId, mergeMessages, sendMessageRequest, updateMessageStatus, userId])

  const enqueueOptimisticMessage = useCallback(
    (payload: {
      type: ChatMessage['type']
      body?: string | null
      meta?: Record<string, unknown> | null
      attachmentUrl?: string | null
      localAttachmentUrl?: string | null
      clientMessageId?: string
      tempId?: number
    }) => {
      const clientMessageId = payload.clientMessageId ?? createClientMessageId()
      const tempId = payload.tempId ?? -Date.now()
      const createdAt = new Date().toISOString()
      const meta = payload.meta ? { ...payload.meta, clientMessageId } : { clientMessageId }

      const optimistic: LocalChatMessage = {
        id: tempId,
        chatId,
        senderId: userId,
        type: payload.type,
        body: payload.body ?? null,
        meta,
        attachmentUrl: payload.attachmentUrl ?? null,
        createdAt,
        status: 'sending',
        clientMessageId,
        localAttachmentUrl: payload.localAttachmentUrl ?? null,
      }

      pendingByClientIdRef.current.set(clientMessageId, tempId)
      setMessages((current) => {
        const exists = current.some((item) => item.id === tempId)
        if (exists) {
          return current.map((item) =>
            item.id === tempId ? { ...item, ...optimistic } : item
          )
        }
        return sortMessages([...current, optimistic])
      })
      return { clientMessageId, tempId, createdAt }
    },
    [chatId, userId]
  )

  const markRead = useCallback(
    async (messageId?: number) => {
      if (!messageId) return
      try {
        await fetch(`${apiBase}/api/chats/${chatId}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, messageId }),
        })
      } catch (error) {
        console.error('Failed to mark chat read:', error)
      }
    },
    [apiBase, chatId, userId]
  )

  const handleScroll = useCallback(() => {
    const container = getScrollElement()
    const distance =
      container.scrollHeight - container.scrollTop - container.clientHeight
    isNearBottomRef.current = distance < 120
    if (isNearBottomRef.current) {
      setHasNewMessage(false)
      const last = messagesRef.current[messagesRef.current.length - 1]
      if (
        last &&
        last.senderId !== userId &&
        last.id > 0 &&
        last.id !== lastReadSentRef.current
      ) {
        lastReadSentRef.current = last.id
        void markRead(last.id)
      }
    }
  }, [getScrollElement, markRead, userId])

  const loadMessages = useCallback(
    async (beforeId?: number, options?: { silent?: boolean }) => {
      const target = beforeId ? 'more' : 'initial'
      const silent = options?.silent ?? false
      const requestId = (messagesRequestIdRef.current[target] += 1)
      if (target === 'more') {
        if (isLoadingMoreRef.current || !hasMoreRef.current) return
        isLoadingMoreRef.current = true
        setIsLoadingMore(true)
      } else {
        if (!silent) {
          setIsLoading(true)
        }
        hasMoreRef.current = true
        setHasMore(true)
      }
      if (!silent) {
        setLoadError('')
      }
      const container = getScrollElement()
      const prevScrollHeight = container?.scrollHeight ?? 0
      const prevScrollTop = container?.scrollTop ?? 0
      if (messagesAbortRef.current[target]) {
        messagesAbortRef.current[target]?.abort()
      }
      const controller = new AbortController()
      messagesAbortRef.current[target] = controller
      try {
        const params = new URLSearchParams()
        params.set('userId', userId)
        params.set('limit', String(limit))
        if (beforeId) {
          params.set('beforeId', String(beforeId))
        }
        const response = await fetch(
          `${apiBase}/api/chats/${chatId}/messages?${params.toString()}`,
          { signal: controller.signal }
        )
        if (!response.ok) {
          throw new Error('Load messages failed')
        }
        const data = (await response.json()) as { items?: ChatMessage[] }
        const items = Array.isArray(data.items) ? data.items : []
        if (
          controller.signal.aborted ||
          messagesRequestIdRef.current[target] !== requestId
        ) {
          return
        }
        mergeMessages(items)
        if (items.length < limit) {
          hasMoreRef.current = false
          setHasMore(false)
        }
        if (!beforeId) {
          const last = items[items.length - 1]
          if (last && last.senderId !== userId && isNearBottomRef.current) {
            lastReadSentRef.current = last.id
            void markRead(last.id)
          }
          if (last && last.senderId !== userId && !isNearBottomRef.current) {
            setHasNewMessage(true)
          }
        } else if (container) {
          requestAnimationFrame(() => {
            const nextHeight = container.scrollHeight
            const delta = nextHeight - prevScrollHeight
            container.scrollTop = prevScrollTop + delta
          })
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        console.error('Failed to load messages:', error)
        if (!silent) {
          setLoadError('Не удалось загрузить сообщения.')
        }
      } finally {
        if (messagesRequestIdRef.current[target] === requestId) {
          if (target === 'more') {
            isLoadingMoreRef.current = false
            setIsLoadingMore(false)
          } else if (!silent) {
            setIsLoading(false)
          }
          if (messagesAbortRef.current[target] === controller) {
            messagesAbortRef.current[target] = null
          }
        }
      }
    },
    [apiBase, chatId, getScrollElement, limit, markRead, mergeMessages, userId]
  )

  const loadDetail = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) return
      const silent = options?.silent ?? false
      const requestId = (detailRequestIdRef.current += 1)
      if (!silent) {
        setIsDetailLoading(true)
      }
      if (detailAbortRef.current) {
        detailAbortRef.current.abort()
      }
      const controller = new AbortController()
      detailAbortRef.current = controller
      try {
        const response = await fetch(
          `${apiBase}/api/chats/${chatId}?userId=${encodeURIComponent(userId)}`,
          { signal: controller.signal }
        )
        if (!response.ok) {
          throw new Error('Load chat detail failed')
        }
        const data = (await response.json()) as ChatDetail
        if (
          controller.signal.aborted ||
          detailRequestIdRef.current !== requestId
        ) {
          return
        }
        if (data) {
          setDetail(data)
          setCachedChatDetail(apiBase, userId, chatId, data)
          setCounterpartLastReadId(
            data.chat.counterpartLastReadMessageId ?? null
          )
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        console.error('Failed to load chat detail:', error)
        if (!silent) {
          setLoadError('Не удалось загрузить чат.')
        }
      } finally {
        if (detailRequestIdRef.current === requestId) {
          if (!silent) {
            setIsDetailLoading(false)
          }
          if (detailAbortRef.current === controller) {
            detailAbortRef.current = null
          }
        }
      }
    },
    [apiBase, chatId, userId]
  )

  const loadBookingSnapshot = useCallback(async () => {
    if (!userId || !booking?.id) return
    const requestId = (bookingSnapshotRequestIdRef.current += 1)
    if (bookingSnapshotAbortRef.current) {
      bookingSnapshotAbortRef.current.abort()
    }
    const controller = new AbortController()
    bookingSnapshotAbortRef.current = controller
    try {
      const endpoint = isProViewer ? '/api/pro/bookings' : '/api/bookings'
      const response = await fetch(
        `${apiBase}${endpoint}?userId=${encodeURIComponent(userId)}`,
        { signal: controller.signal }
      )
      if (!response.ok) {
        throw new Error('Load bookings failed')
      }
      const data = (await response.json()) as Booking[]
      if (controller.signal.aborted || bookingSnapshotRequestIdRef.current !== requestId) {
        return
      }
      const match = Array.isArray(data)
        ? data.find((item) => item.id === booking.id) ?? null
        : null
      setBookingSnapshot(match)
    } catch (error) {
      if (controller.signal.aborted) return
      console.error('Failed to load booking snapshot:', error)
    } finally {
      if (bookingSnapshotRequestIdRef.current === requestId) {
        if (bookingSnapshotAbortRef.current === controller) {
          bookingSnapshotAbortRef.current = null
        }
      }
    }
  }, [apiBase, booking?.id, isProViewer, userId])

  useEffect(() => {
    const cachedDetail = getCachedChatDetail(apiBase, userId, chatId)
    if (cachedDetail) {
      setDetail(cachedDetail)
      setIsDetailLoading(false)
      setCounterpartLastReadId(
        cachedDetail.chat.counterpartLastReadMessageId ?? null
      )
    }

    const cachedMessages = getCachedChatMessages(apiBase, userId, chatId)
    if (cachedMessages && cachedMessages.length > 0) {
      const seeded: LocalChatMessage[] = cachedMessages.map((item) => ({
        ...item,
        status: 'sent',
      }))
      setMessages(seeded)
      setIsLoading(false)
      hasInitialScrollRef.current = false
    }

    hydrateOutboxMessages()
    void loadDetail({ silent: Boolean(cachedDetail) })
    void loadMessages(undefined, { silent: Boolean(cachedMessages?.length) })
  }, [apiBase, chatId, hydrateOutboxMessages, loadDetail, loadMessages, userId])

  useEffect(() => {
    statusSnapshotRef.current = null
  }, [chatId, booking?.id, request?.id])

  useEffect(() => {
    if (!booking?.id) {
      setBookingSnapshot(null)
      return
    }
    void loadBookingSnapshot()
    return () => {
      if (bookingSnapshotAbortRef.current) {
        bookingSnapshotAbortRef.current.abort()
        bookingSnapshotAbortRef.current = null
      }
    }
  }, [booking?.id, loadBookingSnapshot])

  useEffect(() => {
    if (!booking?.id) return
    setBookingSnapshot((current) => {
      if (!current || current.id !== booking.id) return current
      const next = { ...current }
      if (booking.status) {
        next.status = booking.status
      }
      if (typeof booking.servicePrice === 'number') {
        next.servicePrice = booking.servicePrice
      }
      return next
    })
  }, [booking?.id, booking?.servicePrice, booking?.status])

  useEffect(() => {
    setIsHistoryOpen(false)
    setQuickMode(null)
    setQuickValue('')
    setIsContextSheetOpen(false)
    setBookingActionError('')
    setBookingActionId(null)
  }, [chatId])

  useEffect(() => {
    if (!detail) return
    const hasDepositSnapshot =
      Boolean(bookingSnapshot && bookingSnapshot.id === booking?.id)
    const nextDepositStatus = hasDepositSnapshot ? depositStatus : undefined
    const nextSnapshot = {
      bookingStatus: bookingStatus ?? null,
      requestStatus: request?.status ?? null,
      depositStatus: nextDepositStatus,
    }
    const previous = statusSnapshotRef.current
    if (!previous) {
      statusSnapshotRef.current = nextSnapshot
      return
    }

    if (
      previous.bookingStatus !== nextSnapshot.bookingStatus &&
      nextSnapshot.bookingStatus
    ) {
      const hasRecentSystemForBooking = visibleMessages.some((message) => {
        if (message.type !== 'system') return false
        const { bookingId } = extractContextIds(message.meta)
        if (!bookingId || bookingId !== booking?.id) return false
        if (!message.createdAt) return false
        const delta = Date.now() - new Date(message.createdAt).getTime()
        return delta >= 0 && delta < 5 * 60 * 1000
      })
      if (!hasRecentSystemForBooking) {
        if (nextSnapshot.bookingStatus === 'price_proposed') {
          appendLocalSystemMessage('Мастер предложил цену. Подтвердите запись.', {
            event: 'booking_price_proposed',
            bookingId: booking?.id ?? null,
            status: nextSnapshot.bookingStatus,
            local: true,
          })
        }
        if (nextSnapshot.bookingStatus === 'cancelled') {
          appendLocalSystemMessage('Запись отменена.', {
            event: 'booking_cancelled',
            bookingId: booking?.id ?? null,
            status: nextSnapshot.bookingStatus,
            local: true,
          })
        }
        if (nextSnapshot.bookingStatus === 'declined') {
          appendLocalSystemMessage('Запись отклонена мастером.', {
            event: 'booking_declined',
            bookingId: booking?.id ?? null,
            status: nextSnapshot.bookingStatus,
            local: true,
          })
        }
      }
    }

    if (
      previous.requestStatus !== nextSnapshot.requestStatus &&
      nextSnapshot.requestStatus === 'closed' &&
      request?.id
    ) {
      const hasSystemForRequest = visibleMessages.some((message) => {
        if (message.type !== 'system') return false
        const { requestId } = extractContextIds(message.meta)
        return requestId === request.id
      })
      if (!hasSystemForRequest) {
        appendLocalSystemMessage('Заявка согласована. Можно обсудить детали.', {
          event: 'request_closed',
          requestId: request.id,
          status: nextSnapshot.requestStatus,
          local: true,
        })
      }
    }

    if (
      previous.depositStatus !== undefined &&
      previous.depositStatus !== nextSnapshot.depositStatus &&
      nextSnapshot.depositStatus
    ) {
      if (nextSnapshot.depositStatus === 'pending') {
        const holdLabel = formatTimeLeft(depositHoldExpiresAt)
        const amountLabel =
          typeof depositAmount === 'number' && depositAmount > 0
            ? `Сумма: ${formatPrice(depositAmount)}`
            : ''
        const holdText = holdLabel ? `Слот удерживается ${holdLabel}.` : ''
        appendLocalSystemMessage(
          `Нужен депозит. ${[amountLabel, holdText].filter(Boolean).join(' ')}`.trim(),
          {
            event: 'deposit_pending',
            bookingId: booking?.id ?? null,
            depositAmount: depositAmount ?? null,
            local: true,
          }
        )
      }
      if (nextSnapshot.depositStatus === 'submitted') {
        appendLocalSystemMessage('Депозит отправлен. Ждём подтверждения мастера.', {
          event: 'deposit_submitted',
          bookingId: booking?.id ?? null,
          local: true,
        })
      }
    }

    statusSnapshotRef.current = nextSnapshot
  }, [
    appendLocalSystemMessage,
    booking?.id,
    bookingSnapshot,
    bookingStatus,
    depositAmount,
    depositHoldExpiresAt,
    depositStatus,
    detail,
    request?.id,
    request?.status,
    visibleMessages,
  ])

  useLayoutEffect(() => {
    if (hasInitialScrollRef.current) return
    if (messages.length === 0) return
    scrollToBottom('auto')
    hasInitialScrollRef.current = true
    isNearBottomRef.current = true
  }, [messages.length, scrollToBottom])

  useLayoutEffect(() => {
    const screen = screenRef.current
    const composer = composerRef.current
    if (!screen || !composer) return
    const update = () => {
      const height = composer.getBoundingClientRect().height
      if (!Number.isFinite(height) || height <= 0) return
      screen.style.setProperty('--chat-composer-height', `${Math.ceil(height)}px`)
      if (isNearBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom('auto'))
      }
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => update())
    observer.observe(composer)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const screen = screenRef.current
    if (!screen) return
    const update = () => {
      const viewport = window.visualViewport
      const offset = viewport
        ? Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop))
        : 0
      screen.style.setProperty('--chat-keyboard-offset', `${Math.round(offset)}px`)
      if (isNearBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom('auto'))
      }
    }
    update()
    window.addEventListener('resize', update)
    const viewport = window.visualViewport
    if (viewport) {
      viewport.addEventListener('resize', update)
      viewport.addEventListener('scroll', update)
    }
    return () => {
      window.removeEventListener('resize', update)
      if (viewport) {
        viewport.removeEventListener('resize', update)
        viewport.removeEventListener('scroll', update)
      }
    }
  }, [scrollToBottom])

  useEffect(() => {
    const screen = screenRef.current
    if (!screen || typeof ResizeObserver === 'undefined') return
    let rafId: number | null = null
    const observer = new ResizeObserver(() => {
      if (!isNearBottomRef.current) return
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
      rafId = requestAnimationFrame(() => scrollToBottom('auto'))
    })
    observer.observe(screen)
    return () => {
      observer.disconnect()
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [scrollToBottom])

  useEffect(() => {
    messagesRef.current = messages
    const cached = messages.filter((item) => item.id > 0)
    if (cached.length > 0) {
      setCachedChatMessages(apiBase, userId, chatId, cached)
    }
  }, [apiBase, chatId, messages, userId])

  useEffect(() => {
    const deliveredIds = new Set(
      messages
        .map((item) => extractClientMessageId(item.meta))
        .filter((value): value is string => Boolean(value))
    )
    if (deliveredIds.size === 0) return
    pruneOutbox(apiBase, userId, (item) => deliveredIds.has(item.clientMessageId))
  }, [apiBase, messages, userId])

  useEffect(() => {
    return () => {
      if (detailAbortRef.current) {
        detailAbortRef.current.abort()
        detailAbortRef.current = null
      }
      if (messagesAbortRef.current.initial) {
        messagesAbortRef.current.initial.abort()
        messagesAbortRef.current.initial = null
      }
      if (messagesAbortRef.current.more) {
        messagesAbortRef.current.more.abort()
        messagesAbortRef.current.more = null
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (selfTypingTimeoutRef.current) {
        window.clearTimeout(selfTypingTimeoutRef.current)
        selfTypingTimeoutRef.current = null
      }
      if (isSelfTypingRef.current) {
        isSelfTypingRef.current = false
        void stream.send({ type: 'typing', chatId, isTyping: false })
      }
    }
  }, [chatId, stream])

  useEffect(() => {
    handleScroll()
    const onScroll = () => handleScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [handleScroll])

  useEffect(() => {
    if (streamStatus === 'connected') return
    const timer = window.setInterval(() => {
      void loadDetail({ silent: true })
      void loadMessages(undefined, { silent: true })
    }, 15000)
    return () => window.clearInterval(timer)
  }, [loadDetail, loadMessages, streamStatus])

  useEffect(() => {
    if (streamStatus === 'connected') {
      void flushOutbox()
    }
  }, [flushOutbox, streamStatus])

  useEffect(() => {
    const handleOnline = () => {
      void flushOutbox()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [flushOutbox])

  useEffect(() => {
    const unsubscribeStatus = stream.subscribeStatus(setStreamStatus)
    const unsubscribe = stream.subscribe((payload) => {
      if (payload?.type === 'message:new') {
        const incoming = payload.message as ChatMessage | undefined
        if (incoming?.chatId !== chatId) return
        const exists = messagesRef.current.some((item) => item.id === incoming.id)
        if (exists) return
        mergeMessages([incoming])
        if (incoming.type === 'system') {
          const meta =
            incoming.meta && typeof incoming.meta === 'object'
              ? (incoming.meta as Record<string, unknown>)
              : null
          const event = typeof meta?.event === 'string' ? meta.event : ''
          if (
            [
              'request_accepted',
              'request_updated',
              'booking_confirmed',
              'booking_updated',
              'deposit_confirmed',
              'deposit_rejected',
              'deposit_expired',
            ].includes(event)
          ) {
            void loadDetail({ silent: true })
            void loadBookingSnapshot()
          }
        }
        const outcomeMeta = parseOutcomeMarkedMeta(incoming.meta)
        if (outcomeMeta?.bookingId) {
          updateBookingOutcome(
            outcomeMeta.bookingId,
            outcomeMeta.outcome,
            outcomeMeta.lateMinutes ?? null
          )
        }
        const isOwn = incoming.senderId === userId
        if (isOwn || isNearBottomRef.current) {
          scrollToBottom()
          setHasNewMessage(false)
        } else {
          setHasNewMessage(true)
        }
        if (!isOwn && isNearBottomRef.current) {
          void markRead(incoming.id)
        }
        return
      }

      if (payload?.type === 'trust:update') {
        const chatIdFromEvent =
          typeof payload.chatId === 'number' ? payload.chatId : null
        const trustUserId =
          typeof payload.userId === 'string' ? payload.userId : null
        const trust =
          payload.trust && typeof payload.trust === 'object'
            ? (payload.trust as ChatDetail['counterpart']['trust'])
            : null
        if (!chatIdFromEvent || chatIdFromEvent !== chatId) return
        if (!trustUserId || trustUserId !== counterpart?.id || !trust) return
        updateCounterpartTrust(trust)
        return
      }

      if (payload?.type === 'chat:read') {
        const chatIdFromEvent =
          typeof payload.chatId === 'number' ? payload.chatId : null
        const readerId =
          typeof payload.userId === 'string' ? payload.userId : null
        const messageId =
          typeof payload.messageId === 'number' ? payload.messageId : null
        if (chatIdFromEvent === chatId && readerId && readerId !== userId) {
          setCounterpartLastReadId((current) =>
            messageId && (!current || messageId > current) ? messageId : current
          )
        }
        return
      }

      if (payload?.type === 'typing') {
        const chatIdFromEvent =
          typeof payload.chatId === 'number' ? payload.chatId : null
        const authorId =
          typeof payload.userId === 'string' ? payload.userId : null
        const isTyping = Boolean(payload.isTyping)
        if (chatIdFromEvent !== chatId || !authorId || authorId === userId) {
          return
        }
        if (typingTimeoutRef.current) {
          window.clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = null
        }
        setIsCounterpartTyping(isTyping)
        if (isTyping) {
          typingTimeoutRef.current = window.setTimeout(() => {
            setIsCounterpartTyping(false)
            typingTimeoutRef.current = null
          }, 3200)
        }
      }
    })

    return () => {
      unsubscribe()
      unsubscribeStatus()
    }
  }, [
    chatId,
    counterpart?.id,
    loadBookingSnapshot,
    loadDetail,
    markRead,
    mergeMessages,
    scrollToBottom,
    stream,
    updateBookingOutcome,
    updateCounterpartTrust,
    userId,
  ])

  const handleSendMessage = async (payload: {
    type: ChatMessage['type']
    body?: string | null
    meta?: Record<string, unknown> | null
    attachmentPath?: string | null
    attachmentUrl?: string | null
    localAttachmentUrl?: string | null
    clientMessageId?: string
    tempId?: number
  }) => {
    setSendError('')
    const meta =
      payload.meta && typeof payload.meta === 'object'
        ? { ...payload.meta }
        : payload.meta
    const { clientMessageId, tempId, createdAt } = enqueueOptimisticMessage({
      type: payload.type,
      body: payload.body ?? null,
      meta,
      attachmentUrl: payload.attachmentUrl ?? null,
      localAttachmentUrl: payload.localAttachmentUrl ?? null,
      clientMessageId: payload.clientMessageId,
      tempId: payload.tempId,
    })

    try {
      const message = await sendMessageRequest(
        {
          type: payload.type,
          body: payload.body ?? null,
          meta,
          attachmentPath: payload.attachmentPath ?? null,
        },
        clientMessageId
      )
      if (message?.id) {
        mergeMessages([message])
        setTimeout(() => scrollToBottom(), 0)
      }
      removeOutboxItem(apiBase, userId, clientMessageId)
    } catch (error) {
      console.error('Chat send failed:', error)
      updateMessageStatus(tempId, 'failed')
      setSendError('Не удалось отправить сообщение.')
      const isNetworkError =
        error instanceof TypeError ||
        (typeof navigator !== 'undefined' && navigator.onLine === false)
      if (shouldPersistOutbox(payload) && isNetworkError) {
        const outboxItem: OutboxItem = {
          clientMessageId,
          tempId,
          chatId,
          createdAt,
          retryCount: 0,
          lastAttemptAt: null,
          payload: {
            type: payload.type,
            body: payload.body ?? null,
            meta,
            attachmentPath: payload.attachmentPath ?? null,
            attachmentUrl: payload.attachmentUrl ?? null,
            localAttachmentUrl: null,
          },
        }
        enqueueOutbox(apiBase, userId, outboxItem)
      }
    } finally {
      pendingByClientIdRef.current.delete(clientMessageId)
    }
  }

  const handleSendText = async () => {
    const trimmed = composerText.trim()
    if (!trimmed) return
    setComposerText('')
    if (selfTypingTimeoutRef.current) {
      window.clearTimeout(selfTypingTimeoutRef.current)
      selfTypingTimeoutRef.current = null
    }
    if (isSelfTypingRef.current) {
      isSelfTypingRef.current = false
      void stream.send({ type: 'typing', chatId, isTyping: false })
    }
    await handleSendMessage({ type: 'text', body: trimmed })
  }

  const handleAddPhoto = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setSendError('Поддерживаются только изображения.')
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      setSendError('Фото слишком большое. Максимум 6 МБ.')
      return
    }

    setUploading(true)
    setSendError('')
    let optimistic: { clientMessageId: string; tempId: number } | null = null
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
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

      optimistic = enqueueOptimisticMessage({
        type: 'image',
        attachmentUrl: dataUrl,
        localAttachmentUrl: dataUrl,
      })

      const uploadResponse = await fetch(
        `${apiBase}/api/chats/${chatId}/attachments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, dataUrl }),
        }
      )
      if (!uploadResponse.ok) {
        throw new Error('upload_failed')
      }
      const upload = (await uploadResponse.json()) as {
        url?: string | null
        path?: string | null
      }
      if (!upload?.path) {
        throw new Error('upload_failed')
      }
      await handleSendMessage({
        type: 'image',
        attachmentPath: upload.path,
        attachmentUrl: dataUrl,
        localAttachmentUrl: dataUrl,
        clientMessageId: optimistic.clientMessageId,
        tempId: optimistic.tempId,
      })
    } catch (error) {
      console.error('Chat upload failed:', error)
      setSendError('Не удалось загрузить фото.')
      if (optimistic) {
        updateMessageStatus(optimistic.tempId, 'failed')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleQuickSend = async () => {
    if (!quickMode) return
    if (quickMode === 'price') {
      const parsed = Number(quickValue.replace(/\s/g, ''))
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setSendError('Введите корректную цену.')
        return
      }
      closeQuickMode()
      await handleSendMessage({
        type: 'offer_price',
        body: `Цена: ${formatPrice(parsed)}`,
        meta: { price: parsed },
      })
    }
    if (quickMode === 'time') {
      const trimmed = quickValue.trim()
      if (!trimmed) {
        setSendError('Введите время.')
        return
      }
      closeQuickMode()
      await handleSendMessage({
        type: 'offer_time',
        body: `Время: ${trimmed}`,
        meta: { time: trimmed },
      })
    }
  }

  const runBookingAction = useCallback(
    async (
      action:
        | 'client-accept-price'
        | 'client-decline-price'
        | 'master-accept'
        | 'master-decline'
        | 'master-deposit-confirm'
        | 'master-deposit-reject',
      payload?: Record<string, unknown>
    ) => {
      if (!booking?.id || bookingActionId !== null) return
      setBookingActionId(booking.id)
      setBookingActionError('')
      try {
        const response = await fetch(`${apiBase}/api/bookings/${booking.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, action, ...(payload ?? {}) }),
        })
        const data = (await response.json().catch(() => null)) as
          | {
              status?: Booking['status']
              servicePrice?: number | null
              depositStatus?: Booking['depositStatus']
              depositAmount?: number | null
            }
          | null
        if (!response.ok) {
          throw new Error('booking_update_failed')
        }

        const nextStatus =
          data?.status ??
          (action === 'client-accept-price' || action === 'master-accept'
            ? 'confirmed'
            : action === 'client-decline-price'
              ? 'cancelled'
              : action === 'master-decline'
                ? 'declined'
                : bookingStatus ?? null)

        setDetail((current) => {
          if (!current?.booking || current.booking.id !== booking.id) return current
          const nextBooking = { ...current.booking }
          if (nextStatus) {
            nextBooking.status = nextStatus
          }
          if (action === 'client-accept-price') {
            const acceptedPrice =
              typeof data?.servicePrice === 'number'
                ? data.servicePrice
                : bookingSnapshot?.proposedPrice ?? nextBooking.servicePrice ?? null
            nextBooking.servicePrice = acceptedPrice
          }
          return { ...current, booking: nextBooking }
        })

        setBookingSnapshot((current) => {
          if (!current || current.id !== booking.id) return current
          const next = { ...current }
          if (nextStatus) {
            next.status = nextStatus
          }
          if (action === 'client-accept-price') {
            const acceptedPrice =
              typeof data?.servicePrice === 'number'
                ? data.servicePrice
                : bookingSnapshot?.proposedPrice ?? next.servicePrice ?? null
            next.servicePrice = acceptedPrice
            next.proposedPrice = null
          }
          if (data?.depositStatus) {
            next.depositStatus = data.depositStatus
          } else if (action === 'master-deposit-confirm') {
            next.depositStatus = 'confirmed'
          } else if (action === 'master-deposit-reject') {
            next.depositStatus = 'rejected'
          }
          if (typeof data?.depositAmount === 'number') {
            next.depositAmount = data.depositAmount
          }
          return next
        })
      } catch (error) {
        setBookingActionError(
          action === 'master-deposit-confirm' || action === 'master-deposit-reject'
            ? 'Не удалось обновить депозит.'
            : 'Не удалось обновить запись.'
        )
      } finally {
        setBookingActionId((current) => (current === booking?.id ? null : current))
      }
    },
    [apiBase, booking?.id, bookingActionId, bookingSnapshot?.proposedPrice, bookingStatus, userId]
  )

  const submitBookingOutcome = useCallback(
    async (bookingId: number, outcome: string, lateMinutes?: number | null) => {
      setOutcomeError('')
      setOutcomeErrorBookingId(null)
      setOutcomeSubmittingId(bookingId)
      try {
        const response = await fetch(`${apiBase}/api/bookings/${bookingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            action: 'set-outcome',
            outcome,
            lateMinutes: lateMinutes ?? null,
          }),
        })
        const data = (await response.json()) as {
          ok?: boolean
          error?: string
          outcome?: string
          lateMinutes?: number | null
          trust?: ChatDetail['counterpart']['trust']
          systemMessage?: ChatMessage
        }
        if (!response.ok) {
          const message =
            data?.error === 'outcome_locked'
              ? 'Визит уже отмечен.'
              : data?.error === 'late_minutes_required'
                ? 'Укажите минуты опоздания.'
                : 'Не удалось отметить визит.'
          throw new Error(message)
        }
        if (data?.systemMessage) {
          mergeMessages([data.systemMessage as ChatMessage])
        }
        if (data?.trust) {
          updateCounterpartTrust(data.trust)
        }
        if (data?.outcome) {
          updateBookingOutcome(
            bookingId,
            data.outcome,
            data.lateMinutes ?? null
          )
        }
        closeOutcomeSheet()
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Не удалось отметить визит.'
        setOutcomeError(message)
        setOutcomeErrorBookingId(bookingId)
      } finally {
        setOutcomeSubmittingId(null)
      }
    },
    [
      apiBase,
      closeOutcomeSheet,
      mergeMessages,
      updateBookingOutcome,
      updateCounterpartTrust,
      userId,
    ]
  )

  const handleLocationSend = async (value: 'master' | 'client' | 'any') => {
    closeQuickMode()
    await handleSendMessage({
      type: 'offer_location',
      body: `Место: ${locationLabelMap[value]}`,
      meta: { locationType: value },
    })
  }

  const handleRetryMessage = async (message: LocalChatMessage) => {
    if (message.status !== 'failed') return
    updateMessageStatus(message.id, 'sending')
    const clientMessageId =
      message.clientMessageId ?? extractClientMessageId(message.meta) ?? undefined

    if (message.type === 'image') {
      const dataUrl =
        message.localAttachmentUrl ??
        (message.attachmentUrl?.startsWith('data:') ? message.attachmentUrl : null)
      if (!dataUrl) {
        updateMessageStatus(message.id, 'failed')
        setSendError('Не удалось повторить отправку фото.')
        return
      }
      setUploading(true)
      try {
        const uploadResponse = await fetch(
          `${apiBase}/api/chats/${chatId}/attachments`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, dataUrl }),
          }
        )
        if (!uploadResponse.ok) {
          throw new Error('upload_failed')
        }
        const upload = (await uploadResponse.json()) as {
          url?: string | null
          path?: string | null
        }
        if (!upload?.path) {
          throw new Error('upload_failed')
        }
        await handleSendMessage({
          type: 'image',
          attachmentPath: upload.path,
          attachmentUrl: dataUrl,
          localAttachmentUrl: dataUrl,
          clientMessageId,
          tempId: message.id,
        })
      } catch (error) {
        console.error('Chat retry upload failed:', error)
        updateMessageStatus(message.id, 'failed')
        setSendError('Не удалось повторить отправку фото.')
      } finally {
        setUploading(false)
      }
      return
    }

    await handleSendMessage({
      type: message.type,
      body: message.body ?? null,
      meta: message.meta ?? null,
      clientMessageId,
      tempId: message.id,
    })
  }

  const handleComposerChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value
    setComposerText(nextValue)
    if (sendError) {
      setSendError('')
    }

    const hasText = Boolean(nextValue.trim())
    if (!hasText) {
      if (selfTypingTimeoutRef.current) {
        window.clearTimeout(selfTypingTimeoutRef.current)
        selfTypingTimeoutRef.current = null
      }
      if (isSelfTypingRef.current) {
        isSelfTypingRef.current = false
        void stream.send({ type: 'typing', chatId, isTyping: false })
      }
      return
    }

    if (!isSelfTypingRef.current) {
      isSelfTypingRef.current = true
      void stream.send({ type: 'typing', chatId, isTyping: true })
    }

    if (selfTypingTimeoutRef.current) {
      window.clearTimeout(selfTypingTimeoutRef.current)
    }
    selfTypingTimeoutRef.current = window.setTimeout(() => {
      isSelfTypingRef.current = false
      void stream.send({ type: 'typing', chatId, isTyping: false })
      selfTypingTimeoutRef.current = null
    }, 1800)
  }

  const handleComposerFocus = () => {
    isNearBottomRef.current = true
    requestAnimationFrame(() => scrollToBottom('auto'))
    window.setTimeout(() => scrollToBottom('auto'), 120)
  }

  const applyComposerTemplate = useCallback(
    (template: string) => {
      if (sendError) {
        setSendError('')
      }
      setComposerText((current) =>
        current.trim() ? `${current.trim()}\n${template}` : template
      )
      requestAnimationFrame(() => {
        const input = composerInputRef.current
        if (!input) return
        input.focus()
        const length = input.value.length
        input.setSelectionRange(length, length)
      })
    },
    [sendError]
  )

  const handleSupportTopic = (template: string) => {
    applyComposerTemplate(template)
  }

  const buildQuickTemplate = (
    action: 'reschedule' | 'clarify' | 'update'
  ) => {
    const serviceLabel = booking?.serviceName ?? request?.serviceName ?? null
    const subject = booking ? 'запись' : 'заявку'
    if (action === 'reschedule') {
      return serviceLabel
        ? `Можем перенести ${subject} «${serviceLabel}»? Предлагаю другое время.`
        : `Можем перенести ${subject}? Предлагаю другое время.`
    }
    if (action === 'clarify') {
      return serviceLabel
        ? `Хочу уточнить детали по ${subject} «${serviceLabel}».`
        : 'Хочу уточнить детали.'
    }
    return serviceLabel
      ? `Обновляю детали по ${subject} «${serviceLabel}»: `
      : 'Обновляю детали: '
  }

  const openTrustSheet = useCallback(() => {
    setIsTrustSheetOpen(true)
  }, [])

  const closeTrustSheet = useCallback(() => {
    setIsTrustSheetOpen(false)
  }, [])

  const openContextSheet = useCallback(() => {
    setIsContextSheetOpen(true)
  }, [])

  const closeContextSheet = useCallback(() => {
    setIsContextSheetOpen(false)
  }, [])

  const openQuickMode = useCallback(
    (mode: 'price' | 'time' | 'location') => {
      setQuickMode(mode)
      setQuickValue('')
      setIsContextSheetOpen(false)
      requestAnimationFrame(() => composerInputRef.current?.focus())
    },
    []
  )

  const closeQuickMode = useCallback(() => {
    setQuickMode(null)
    setQuickValue('')
  }, [])

  const contextAnchorMap = useMemo(() => {
    const map = new Map<string, number>()
    visibleMessages.forEach((message) => {
      if (message.type !== 'system') return
      const { bookingId, requestId } = extractContextIds(message.meta)
      if (bookingId && !map.has(`booking-${bookingId}`)) {
        map.set(`booking-${bookingId}`, message.id)
      }
      if (requestId && !map.has(`request-${requestId}`)) {
        map.set(`request-${requestId}`, message.id)
      }
    })
    return map
  }, [visibleMessages])

  const handleContextJump = useCallback(
    (context: NonNullable<ChatDetail['contexts']>[number]) => {
      const key = `${context.contextType}-${context.contextId}`
      const messageId = contextAnchorMap.get(key)
      closeContextSheet()
      if (messageId) {
        requestAnimationFrame(() => scrollToMessage(messageId))
        return
      }
      requestAnimationFrame(() => scrollToBottom('smooth'))
    },
    [closeContextSheet, contextAnchorMap, scrollToBottom, scrollToMessage]
  )

  const stickyAction = useMemo(() => {
    if (!isBookingChat || !booking?.id) return null
    const holdLabel = formatTimeLeft(depositHoldExpiresAt)
    const amountLabel =
      typeof depositAmount === 'number' && depositAmount > 0
        ? `Сумма: ${formatPrice(depositAmount)}`
        : ''
    const holdText = holdLabel ? `Слот удерживается ${holdLabel}.` : ''

    if (!isProViewer) {
      if (depositStatus === 'pending' || depositStatus === 'rejected') {
        if (!onViewRequests) return null
        const depositIntro =
          depositStatus === 'rejected'
            ? 'Депозит отклонён. Отправьте снова.'
            : 'Нужен депозит.'
        return {
          tone: 'alert' as const,
          title: 'Нужен депозит',
          subtitle: [depositIntro, amountLabel, holdText].filter(Boolean).join(' '),
          primary: {
            label: 'Оплатить депозит',
            onClick: () => onViewRequests('bookings'),
          },
        }
      }
      if (bookingStatus === 'price_proposed') {
        const priceLabel =
          typeof proposedPrice === 'number'
            ? `Предложение: ${formatPrice(proposedPrice)}`
            : 'Мастер предложил цену.'
        return {
          tone: 'alert' as const,
          title: 'Подтвердите цену',
          subtitle: priceLabel,
          primary: {
            label: 'Подтвердить',
            onClick: () => void runBookingAction('client-accept-price'),
          },
          secondary: {
            label: 'Отклонить',
            onClick: () => void runBookingAction('client-decline-price'),
          },
        }
      }
      return null
    }

    if (depositStatus === 'submitted') {
      return {
        tone: 'alert' as const,
        title: 'Проверить депозит',
        subtitle: amountLabel || 'Клиент отправил чек.',
        primary: {
          label: 'Подтвердить',
          onClick: () => void runBookingAction('master-deposit-confirm'),
        },
        secondary: {
          label: 'Отклонить',
          onClick: () => void runBookingAction('master-deposit-reject'),
        },
      }
    }

    if (bookingStatus === 'pending') {
      if (bookingPrice === null) {
        return {
          tone: 'alert' as const,
          title: 'Нужно уточнить цену',
          subtitle: 'Клиент ждёт стоимость.',
          primary: {
            label: 'Предложить цену',
            onClick: () => openQuickMode('price'),
          },
        }
      }
      return {
        tone: 'alert' as const,
        title: 'Нужно подтвердить запись',
        subtitle: 'Клиент ждёт подтверждение.',
        primary: {
          label: 'Подтвердить',
          onClick: () => void runBookingAction('master-accept'),
        },
        secondary: {
          label: 'Отказать',
          onClick: () => void runBookingAction('master-decline'),
        },
      }
    }

    if (bookingStatus === 'price_pending') {
      return {
        tone: 'alert' as const,
        title: 'Нужно предложить цену',
        subtitle: 'Запись ожидает стоимость.',
        primary: {
          label: 'Предложить цену',
          onClick: () => openQuickMode('price'),
        },
      }
    }

    return null
  }, [
    booking?.id,
    bookingPrice,
    bookingStatus,
    depositAmount,
    depositHoldExpiresAt,
    depositStatus,
    isBookingChat,
    isProViewer,
    onViewRequests,
    openQuickMode,
    proposedPrice,
    runBookingAction,
  ])

  const onLoadMore = () => {
    const oldestId = messages[0]?.id
    if (oldestId && oldestId > 0) {
      void loadMessages(oldestId)
    }
  }

  const groupedMessages = useMemo(() => {
    return visibleMessages.map((message, index) => {
      const previous = visibleMessages[index - 1]
      const showDate =
        !previous ||
        new Date(previous.createdAt).toDateString() !==
          new Date(message.createdAt).toDateString()
      return { message, showDate }
    })
  }, [visibleMessages])

  const lastOwnMessageId = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
      const message = visibleMessages[i]
      if (message.senderId === userId && message.type !== 'system') {
        return message.id
      }
    }
    return null
  }, [userId, visibleMessages])

  return (
    <div className="screen screen--chat-thread" ref={screenRef}>
      <div className="chat-thread">
        <header className="chat-thread-header">
          <button className="chat-back" type="button" onClick={onBack}>
            ←
          </button>
          <div className="chat-thread-title">
            <div className="chat-thread-name-row">
              <span className="chat-thread-name">
                {counterpart?.name ?? 'Чат'}
              </span>
              {showTrustBadge && (
                <button
                  className="trust-badge-button"
                  type="button"
                  onClick={openTrustSheet}
                  aria-label="Открыть шкалу добросовестности"
                >
                  <TrustBadge
                    trust={counterpart?.trust ?? null}
                    size="sm"
                    className="chat-thread-trust"
                  />
                </button>
              )}
            </div>
            <div className="chat-thread-subline">
              <span className="chat-thread-subtitle">{headerSubtitle}</span>
              {showConnection && (
                <span
                  className={`chat-connection is-compact ${connectionTone}`}
                  role="status"
                  aria-live="polite"
                >
                  {connectionLabel}
                </span>
              )}
            </div>
          </div>
        </header>

        {showSupportIntro ? (
          <section className="chat-support-intro">
            <div className="chat-support-intro-top">
              <span className="chat-support-intro-title">Мы рядом</span>
              {showConnection && (
                <span className={`chat-support-intro-pill ${connectionTone}`}>
                  {connectionLabel}
                </span>
              )}
            </div>
            <p className="chat-support-intro-text">
              Опишите вопрос и приложите фото или скриншот — команда поддержки
              подключится сразу.
            </p>
            <div className="chat-support-topics" role="list">
              {supportTopics.map((topic) => (
                <button
                  className="chat-support-topic"
                  type="button"
                  key={topic.id}
                  role="listitem"
                  onClick={() => handleSupportTopic(topic.template)}
                >
                  {topic.label}
                </button>
              ))}
            </div>
          </section>
        ) : !isSupportChat && (request || booking) ? (
          <>
            <section className="chat-context-summary">
              <div className="chat-context-summary-main">
                <span className="chat-context-summary-kicker">
                  {isBookingChat ? 'Запись' : 'Заявка'}
                </span>
                <span className="chat-context-summary-title">{activeTitle}</span>
                <span className="chat-context-summary-meta">{summaryMeta}</span>
              </div>
              <button
                className="chat-context-summary-action"
                type="button"
                onClick={openContextSheet}
              >
                Подробнее
              </button>
            </section>
            {stickyAction && (
              <section
                className={`chat-sticky-action${
                  stickyAction.tone ? ` is-${stickyAction.tone}` : ''
                }`}
              >
                <div className="chat-sticky-main">
                  <span className="chat-sticky-title">{stickyAction.title}</span>
                  {stickyAction.subtitle && (
                    <span className="chat-sticky-subtitle">
                      {stickyAction.subtitle}
                    </span>
                  )}
                </div>
                <div className="chat-sticky-actions">
                  {stickyAction.secondary && (
                    <button
                      className="chat-sticky-button is-secondary"
                      type="button"
                      onClick={stickyAction.secondary.onClick}
                      disabled={isBookingActionLoading}
                    >
                      {stickyAction.secondary.label}
                    </button>
                  )}
                  {stickyAction.primary && (
                    <button
                      className="chat-sticky-button is-primary"
                      type="button"
                      onClick={stickyAction.primary.onClick}
                      disabled={isBookingActionLoading}
                    >
                      {stickyAction.primary.label}
                    </button>
                  )}
                </div>
                {bookingActionError && (
                  <p className="chat-sticky-error" role="alert">
                    {bookingActionError}
                  </p>
                )}
              </section>
            )}
            {!isBookingChat && request && (
              <section className="chat-request-card">
                <div className="chat-request-top">
                  <span className="chat-request-title">
                    {request.serviceName ?? 'Заявка'}
                  </span>
                  <span className="chat-request-pill">{requestStatusLabel}</span>
                </div>
                <div className="chat-request-meta">
                  <span>
                    <IconPin /> {locationLabelMap[request.locationType ?? 'any']}
                  </span>
                  <span>
                    <IconClock /> {requestTimeLabel}
                  </span>
                  {requestBudgetLabel && <span>{requestBudgetLabel}</span>}
                </div>
                {request.details && (
                  <p className="chat-request-details">{request.details}</p>
                )}
                {Array.isArray(request.photoUrls) &&
                  request.photoUrls.length > 0 && (
                    <div className="booking-photo-strip chat-request-media" role="list">
                      {request.photoUrls.map((url, index) => (
                        <span
                          className="booking-photo-thumb"
                          key={`request-${request.id}-photo-${index}`}
                          role="listitem"
                        >
                          <img src={url} alt="" loading="lazy" />
                        </span>
                      ))}
                    </div>
                  )}
              </section>
            )}
          </>
        ) : (
          isDetailLoading && (
            <section className="chat-active-card is-skeleton" aria-hidden="true">
              <span className="chat-active-skeleton-line is-title" />
              <div className="chat-active-skeleton-row">
                <span className="chat-active-skeleton-line is-chip" />
                <span className="chat-active-skeleton-line is-chip" />
                <span className="chat-active-skeleton-line is-chip" />
              </div>
              <span className="chat-active-skeleton-line is-body" />
            </section>
          )
        )}

        {loadError && (
          <p className="chat-error" role="alert">
            {loadError}
          </p>
        )}
        {isLoading && visibleMessages.length === 0 && (
          <p className="chat-status" role="status" aria-live="polite">
            Загружаем сообщения...
          </p>
        )}
        {!isLoading && visibleMessages.length === 0 && !loadError && (
          <p className="chat-status" role="status" aria-live="polite">
            Сообщений пока нет.
          </p>
        )}

        <div
          className="chat-messages"
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          {hasMore && (
            <button
              className="chat-load-more"
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? 'Загрузка...' : 'Показать ранее'}
            </button>
          )}

          {groupedMessages.map(({ message, showDate }) => {
            const isMine = message.senderId === userId
            const isSystem = message.type === 'system'
            const isOffer = message.type.startsWith('offer_')
            const isFailed = message.status === 'failed'
            const showStatus =
              isMine &&
              !isSystem &&
              (message.id === lastOwnMessageId || isFailed || message.status === 'sending')
            const outcomePrompt = isSystem ? parseOutcomePromptMeta(message.meta) : null
            const outcomeStatus = outcomePrompt
              ? outcomeByBookingId.get(outcomePrompt.bookingId) ?? null
              : null
            const offerMeta = (message.meta ?? {}) as Record<string, unknown>
            const offerTitle =
              message.type === 'offer_price'
                ? 'Предложение цены'
                : message.type === 'offer_time'
                  ? 'Предложение времени'
                  : message.type === 'offer_location'
                    ? 'Место'
                    : ''
            const offerValue =
              message.type === 'offer_price' && typeof offerMeta.price === 'number'
                ? formatPrice(offerMeta.price)
                : message.type === 'offer_time' && typeof offerMeta.time === 'string'
                  ? offerMeta.time
                  : message.type === 'offer_location' &&
                      typeof offerMeta.locationType === 'string'
                    ? locationLabelMap[
                        offerMeta.locationType as keyof typeof locationLabelMap
                      ]
                    : null

            if (outcomePrompt) {
              const scheduledLabel = formatDateTime(
                outcomePrompt.scheduledAt ?? booking?.scheduledAt ?? null
              )
              const durationLabel = formatDurationLabel(
                outcomePrompt.serviceDuration ?? booking?.serviceDuration ?? null
              )
              const actionExpiresAt = outcomePrompt.actionExpiresAt
              const expiresLabel = actionExpiresAt
                ? formatDateTime(actionExpiresAt)
                : ''
              const isExpired =
                actionExpiresAt &&
                new Date(actionExpiresAt).getTime() < Date.now()
              const canAct = isProViewer && !outcomeStatus && !isExpired
              const showActions = isProViewer && !outcomeStatus
              const isSubmitting = outcomeSubmittingId === outcomePrompt.bookingId
              const statusLabel = outcomeStatus
                ? formatOutcomeSummary(
                    outcomeStatus.outcome,
                    outcomeStatus.lateMinutes
                  )
                : ''
              const outcomeSubtitle =
                message.body ||
                'Отметьте явку, чтобы обновить доверие клиента.'
              const serviceName = outcomePrompt.serviceName ?? booking?.serviceName ?? null
              const showError =
                outcomeError &&
                outcomeErrorBookingId === outcomePrompt.bookingId

              return (
                <div
                  key={message.id}
                  id={`chat-message-${message.id}`}
                  className="chat-message-group"
                >
                  {showDate && (
                    <div className="chat-date">
                      {formatDayLabel(message.createdAt)}
                    </div>
                  )}
                  <div className="chat-message is-system">
                    <div className="chat-outcome-card">
                      <div className="chat-outcome-top">
                        <div>
                          <p className="chat-outcome-kicker">Итог визита</p>
                          <h3 className="chat-outcome-title">
                            Как прошла запись?
                          </h3>
                        </div>
                        <span className="chat-outcome-pill">post-visit</span>
                      </div>
                      <p className="chat-outcome-subtitle">{outcomeSubtitle}</p>
                      <div className="chat-outcome-meta">
                        {serviceName && (
                          <span>Услуга: {serviceName}</span>
                        )}
                        {scheduledLabel && (
                          <span>Время: {scheduledLabel}</span>
                        )}
                        {durationLabel && (
                          <span>Длительность: {durationLabel}</span>
                        )}
                      </div>
                      {expiresLabel && !isExpired && !outcomeStatus && (
                        <div className="chat-outcome-expiry">
                          Отметьте до {expiresLabel}
                        </div>
                      )}
                      {isExpired && !outcomeStatus && (
                        <div className="chat-outcome-expired">
                          Срок отметки истёк
                        </div>
                      )}
                      {outcomeStatus && (
                        <div className="chat-outcome-status">
                          <span className="chat-outcome-status-label">
                            Отмечено
                          </span>
                          <span className="chat-outcome-status-value">
                            {statusLabel}
                          </span>
                        </div>
                      )}
                      {showActions ? (
                        <div className="chat-outcome-actions">
                          <button
                            className="chat-outcome-action is-positive"
                            type="button"
                            disabled={!canAct || isSubmitting}
                            onClick={() =>
                              void submitBookingOutcome(
                                outcomePrompt.bookingId,
                                'on_time'
                              )
                            }
                          >
                            Вовремя
                          </button>
                          <button
                            className="chat-outcome-action is-warning"
                            type="button"
                            disabled={!canAct || isSubmitting}
                            onClick={() =>
                              openLateOutcomeSheet(outcomePrompt.bookingId)
                            }
                          >
                            Опоздал
                          </button>
                          <button
                            className="chat-outcome-action is-danger"
                            type="button"
                            disabled={!canAct || isSubmitting}
                            onClick={() =>
                              void submitBookingOutcome(
                                outcomePrompt.bookingId,
                                'no_show'
                              )
                            }
                          >
                            Не пришёл
                          </button>
                        </div>
                      ) : !isProViewer ? (
                        <div className="chat-outcome-note">
                          Доступно мастеру
                        </div>
                      ) : null}
                      {isSubmitting && (
                        <div className="chat-outcome-loading">
                          Фиксируем отметку...
                        </div>
                      )}
                      {showError && (
                        <p className="chat-outcome-error" role="alert">
                          {outcomeError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={message.id}
                id={`chat-message-${message.id}`}
                className="chat-message-group"
              >
                {showDate && (
                  <div className="chat-date">{formatDayLabel(message.createdAt)}</div>
                )}
                <div
                  className={`chat-message${isMine ? ' is-mine' : ''}${
                    isSystem ? ' is-system' : ''
                  }`}
                >
                  {isSystem ? (
                    <div className="chat-bubble chat-bubble--system">
                      {message.body}
                    </div>
                  ) : isOffer ? (
                    <div className="chat-bubble chat-bubble--offer">
                      <span className="chat-offer-title">{offerTitle}</span>
                      <span className="chat-offer-value">
                        {offerValue ?? message.body}
                      </span>
                    </div>
                  ) : message.type === 'image' && message.attachmentUrl ? (
                    <div className="chat-bubble chat-bubble--image">
                      <img src={message.attachmentUrl} alt="" loading="lazy" />
                    </div>
                  ) : (
                    <div className="chat-bubble">{message.body}</div>
                  )}
                  {!isSystem && (
                    <span className="chat-time">
                      {formatMessageTime(message.createdAt)}
                    </span>
                  )}
                  {showStatus && (
                    <span className="chat-message-status">
                      {message.status === 'sending'
                        ? 'Отправляется...'
                        : message.status === 'failed'
                          ? 'Не отправлено'
                          : message.id > 0 &&
                              counterpartLastReadId &&
                              message.id <= counterpartLastReadId
                            ? 'Прочитано'
                            : 'Отправлено'}
                    </span>
                  )}
                  {message.status === 'failed' && (
                    <button
                      className="chat-message-retry"
                      type="button"
                      onClick={() => void handleRetryMessage(message)}
                    >
                      Повторить
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {isCounterpartTyping && (
            <div className="chat-typing" role="status" aria-live="polite">
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
              <span className="chat-typing-text">Печатает...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {hasNewMessage && (
          <button
            className="chat-new-message"
            type="button"
            onClick={() => scrollToBottom('smooth')}
          >
            Новые сообщения
          </button>
        )}
      </div>

      <div className="chat-composer" ref={composerRef}>
        {!isSupportChat && quickMode && (
          <div className="chat-quick-panel">
            <div className="chat-quick-head">
              <span className="chat-quick-title">
                {quickMode === 'price'
                  ? 'Предложите цену'
                  : quickMode === 'time'
                    ? 'Предложите время'
                    : 'Где удобно'}
              </span>
              <button
                className="chat-quick-close"
                type="button"
                onClick={closeQuickMode}
              >
                Скрыть
              </button>
            </div>
            {quickMode === 'price' && (
              <>
                <div className="chat-quick-input-row">
                  <input
                    className="chat-quick-input"
                    type="number"
                    placeholder="Например, 2500"
                    value={quickValue}
                    onChange={(event) => setQuickValue(event.target.value)}
                  />
                  <button
                    className="chat-quick-send"
                    type="button"
                    onClick={() => void handleQuickSend()}
                  >
                    Отправить
                  </button>
                </div>
              </>
            )}
            {quickMode === 'time' && (
              <>
                <div className="chat-quick-input-row">
                  <input
                    className="chat-quick-input"
                    type="text"
                    placeholder="Например, завтра в 15:30"
                    value={quickValue}
                    onChange={(event) => setQuickValue(event.target.value)}
                  />
                  <button
                    className="chat-quick-send"
                    type="button"
                    onClick={() => void handleQuickSend()}
                  >
                    Отправить
                  </button>
                </div>
              </>
            )}
            {quickMode === 'location' && (
              <>
                <div className="chat-quick-location">
                  {(['master', 'client', 'any'] as const).map((value) => (
                    <button
                      key={value}
                      className="chat-quick-location-button"
                      type="button"
                      onClick={() => void handleLocationSend(value)}
                    >
                      {locationLabelMap[value]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="chat-input-row">
          <button
            className="chat-attach"
            type="button"
            onClick={handleAddPhoto}
            disabled={uploading}
          >
            <IconPhoto />
          </button>
          <input
            ref={fileInputRef}
            className="chat-file-input"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />
          <textarea
            ref={composerInputRef}
            className="chat-input"
            rows={1}
            placeholder={
              isSupportChat ? 'Опишите вопрос для поддержки' : 'Напишите сообщение'
            }
            value={composerText}
            onChange={handleComposerChange}
            onFocus={handleComposerFocus}
            enterKeyHint="send"
            autoCapitalize="sentences"
            autoCorrect="on"
          />
          <button
            className="chat-send"
            type="button"
            onClick={() => void handleSendText()}
            disabled={uploading || !composerText.trim()}
          >
            Отправить
          </button>
        </div>
        {sendError && (
          <p className="chat-error" role="alert">
            {sendError}
          </p>
        )}
      </div>

      {isContextSheetOpen && !isSupportChat && (request || booking) && (
        <div
          className="chat-context-sheet-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-context-sheet-title"
          onClick={closeContextSheet}
        >
          <div
            className="chat-context-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="chat-context-sheet-handle" aria-hidden="true" />
            <div className="chat-context-sheet-head">
              <div>
                <p className="chat-context-sheet-kicker">Контекст</p>
                <h3 className="chat-context-sheet-title" id="chat-context-sheet-title">
                  {isBookingChat ? 'Детали записи' : 'Детали заявки'}
                </h3>
                <p className="chat-context-sheet-subtitle">
                  Быстрые действия и история в одном месте.
                </p>
              </div>
              <button
                className="chat-context-sheet-close"
                type="button"
                onClick={closeContextSheet}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <section className="chat-active-card chat-active-card--sheet">
              <div className="chat-active-top">
                <div>
                  <p className="chat-active-kicker">
                    {isBookingChat ? 'Запись' : 'Заявка'}
                  </p>
                  <h2 className="chat-active-title">{activeTitle}</h2>
                </div>
                <span
                  className={`chat-active-pill is-${
                    isBookingChat ? 'booking' : 'request'
                  }`}
                >
                  {activeStatusLabel}
                </span>
              </div>
              <div className="chat-active-meta">
                {isBookingChat && booking ? (
                  <>
                    <span>
                      <IconPin /> {locationLabelMap[booking.locationType ?? 'client']}
                    </span>
                    <span>
                      <IconClock /> {bookingTimeLabel}
                    </span>
                    {bookingDurationLabel && (
                      <span>Длительность: {bookingDurationLabel}</span>
                    )}
                    {bookingPriceLabel && <span>{bookingPriceLabel}</span>}
                  </>
                ) : request ? (
                  <>
                    <span>
                      <IconPin /> {locationLabelMap[request.locationType ?? 'any']}
                    </span>
                    <span>
                      <IconClock /> {requestTimeLabel}
                    </span>
                    {requestBudgetLabel && <span>{requestBudgetLabel}</span>}
                  </>
                ) : null}
              </div>
              {request?.details && (
                <p className="chat-active-details">{request.details}</p>
              )}
              <div className="chat-active-actions">
                <button
                  className="chat-active-action"
                  type="button"
                  onClick={() => {
                    applyComposerTemplate(buildQuickTemplate('reschedule'))
                    closeContextSheet()
                  }}
                >
                  Перенести
                </button>
                <button
                  className="chat-active-action"
                  type="button"
                  onClick={() => {
                    applyComposerTemplate(buildQuickTemplate('clarify'))
                    closeContextSheet()
                  }}
                >
                  Уточнить
                </button>
                <button
                  className="chat-active-action is-strong"
                  type="button"
                  onClick={() => {
                    applyComposerTemplate(buildQuickTemplate('update'))
                    closeContextSheet()
                  }}
                >
                  Обновить
                </button>
              </div>
            </section>

            <section className="chat-context-quick">
              <span className="chat-context-quick-title">
                {isProViewer ? 'Быстрые предложения' : 'Быстрые ответы'}
              </span>
              <div className="chat-context-quick-actions">
                {isProViewer ? (
                  <>
                    <button
                      className="chat-context-quick-action"
                      type="button"
                      onClick={() => openQuickMode('price')}
                    >
                      Цена
                    </button>
                    <button
                      className="chat-context-quick-action"
                      type="button"
                      onClick={() => openQuickMode('time')}
                    >
                      Время
                    </button>
                    <button
                      className="chat-context-quick-action"
                      type="button"
                      onClick={() => openQuickMode('location')}
                    >
                      Место
                    </button>
                  </>
                ) : (
                  clientQuickTemplates.map((template) => (
                    <button
                      key={template.id}
                      className="chat-context-quick-action"
                      type="button"
                      onClick={() => {
                        applyComposerTemplate(template.template)
                        closeContextSheet()
                      }}
                    >
                      {template.label}
                    </button>
                  ))
                )}
              </div>
            </section>

            {contextHistory.length > 0 && (
              <section
                className={`chat-history${isHistoryOpen ? ' is-open' : ''}`}
              >
                <button
                  className="chat-history-toggle"
                  type="button"
                  onClick={() => setIsHistoryOpen((prev) => !prev)}
                  aria-expanded={isHistoryOpen}
                >
                  <span className="chat-history-title">История контекстов</span>
                  <span className="chat-history-count">{contextHistory.length}</span>
                  <span
                    className={`chat-history-chevron${
                      isHistoryOpen ? ' is-open' : ''
                    }`}
                    aria-hidden="true"
                  >
                    ⌄
                  </span>
                </button>
                <div className="chat-history-panel">
                  <div className="chat-history-timeline" role="list">
                    {contextHistory.map((context) => {
                      const timeLabel = getHistoryTimeLabel(context)
                      const statusLabel = getHistoryStatusLabel(context)
                      const label =
                        context.contextType === 'booking' ? 'Запись' : 'Заявка'
                      return (
                        <button
                          key={`${context.contextType}-${context.contextId}`}
                          className="chat-history-node"
                          type="button"
                          role="listitem"
                          onClick={() => handleContextJump(context)}
                        >
                          <span
                            className={`chat-history-badge is-${context.contextType}`}
                          >
                            {label}
                          </span>
                          <span className="chat-history-service">
                            {context.serviceName ?? label}
                          </span>
                          <span className="chat-history-meta">
                            {statusLabel && <span>{statusLabel}</span>}
                            {timeLabel && <span>{timeLabel}</span>}
                          </span>
                          <span className="chat-history-jump">Перейти →</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="chat-history-hint">
                    Нажмите на этап, чтобы перейти в переписке.
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {showTrustBadge && isTrustSheetOpen && (
        <div
          className="trust-sheet-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trust-sheet-title"
          onClick={closeTrustSheet}
        >
          <div
            className="trust-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="trust-sheet-handle" aria-hidden="true" />
            <div className="trust-sheet-head">
              <div>
                <p className="trust-sheet-kicker">Шкала доверия</p>
                <h3 className="trust-sheet-title" id="trust-sheet-title">
                  Как читать добросовестность
                </h3>
                <p className="trust-sheet-subtitle">
                  Считаем по посещениям: вовремя, переносы, неявки. Личные данные
                  не используются.
                </p>
              </div>
              <button
                className="trust-sheet-close"
                type="button"
                onClick={closeTrustSheet}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="trust-sheet-scale" aria-hidden="true" />
            <div className="trust-sheet-legend">
              <div className="trust-sheet-legend-item is-new">Новый</div>
              <div className="trust-sheet-legend-item is-low">0–44</div>
              <div className="trust-sheet-legend-item is-mid">45–69</div>
              <div className="trust-sheet-legend-item is-high">70–100</div>
            </div>
            <button
              className="trust-sheet-action"
              type="button"
              onClick={closeTrustSheet}
            >
              Понятно
            </button>
          </div>
        </div>
      )}

      {outcomeSheetBookingId !== null && (
        <div
          className="outcome-sheet-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="outcome-sheet-title"
          onClick={closeOutcomeSheet}
        >
          <div
            className="outcome-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="outcome-sheet-handle" aria-hidden="true" />
            <div className="outcome-sheet-head">
              <div>
                <p className="outcome-sheet-kicker">Опоздание</p>
                <h3 className="outcome-sheet-title" id="outcome-sheet-title">
                  На сколько минут?
                </h3>
                <p className="outcome-sheet-subtitle">
                  Выберите интервал — это влияет на доверие клиента.
                </p>
              </div>
              <button
                className="outcome-sheet-close"
                type="button"
                onClick={closeOutcomeSheet}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="outcome-minute-grid">
              {lateMinuteOptions.map((minutes) => (
                <button
                  key={minutes}
                  className={`outcome-minute-chip${
                    outcomeSheetMinutes === minutes ? ' is-active' : ''
                  }`}
                  type="button"
                  onClick={() => setOutcomeSheetMinutes(minutes)}
                >
                  {minutes} мин
                </button>
              ))}
            </div>
            <button
              className="outcome-sheet-confirm"
              type="button"
              disabled={outcomeSubmittingId === outcomeSheetBookingId}
              onClick={() =>
                outcomeSheetBookingId !== null
                  ? submitBookingOutcome(
                      outcomeSheetBookingId,
                      'late',
                      outcomeSheetMinutes
                    )
                  : undefined
              }
            >
              {outcomeSubmittingId === outcomeSheetBookingId
                ? 'Фиксируем...'
                : 'Подтвердить'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
