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
import type { ChatDetail, ChatMessage } from '../types/app'
import type { ChatStreamStatus } from '../utils/chatStream'
import { getChatStream } from '../utils/chatStream'
import {
  getCachedChatDetail,
  getCachedChatMessages,
  setCachedChatDetail,
  setCachedChatMessages,
} from '../utils/chatCache'

type ChatThreadScreenProps = {
  apiBase: string
  userId: string
  chatId: number
  onBack: () => void
}

const locationLabelMap = {
  master: 'У мастера',
  client: 'У клиента',
  any: 'Не важно',
} as const

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

export const ChatThreadScreen = ({
  apiBase,
  userId,
  chatId,
  onBack,
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
  const screenRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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
  const lastReadSentRef = useRef<number | null>(null)
  const detailAbortRef = useRef<AbortController | null>(null)
  const messagesAbortRef = useRef<{
    initial: AbortController | null
    more: AbortController | null
  }>({ initial: null, more: null })
  const detailRequestIdRef = useRef(0)
  const messagesRequestIdRef = useRef({ initial: 0, more: 0 })

  const limit = 30
  const stream = useMemo(() => getChatStream(apiBase, userId), [apiBase, userId])

  const counterpart = detail?.counterpart
  const request = detail?.request
  const booking = detail?.booking
  const isBookingChat = detail?.chat?.contextType === 'booking'
  const headerSubtitle = isBookingChat
    ? booking?.serviceName ?? 'Запись подтверждена'
    : request?.serviceName ?? 'Переговоры по заявке'
  const bookingStatusLabel =
    booking?.status === 'confirmed' ? 'Подтверждено' : 'Запись'
  const bookingTimeLabel = booking?.scheduledAt
    ? formatDateTime(booking.scheduledAt)
    : 'Время уточняется'
  const bookingPriceLabel =
    typeof booking?.servicePrice === 'number'
      ? `Стоимость: ${formatPrice(booking.servicePrice)}`
      : null

  const connectionLabel =
    streamStatus === 'connected'
      ? 'Онлайн'
      : streamStatus === 'connecting' || streamStatus === 'reconnecting'
        ? 'Соединяем...'
        : 'Нет связи'
  const connectionTone =
    streamStatus === 'connected'
      ? 'is-online'
      : streamStatus === 'connecting' || streamStatus === 'reconnecting'
        ? 'is-syncing'
        : 'is-offline'

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
      setHasNewMessage(false)
    },
    []
  )

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
      const meta = payload.meta ? { ...payload.meta, clientMessageId } : { clientMessageId }

      const optimistic: LocalChatMessage = {
        id: tempId,
        chatId,
        senderId: userId,
        type: payload.type,
        body: payload.body ?? null,
        meta,
        attachmentUrl: payload.attachmentUrl ?? null,
        createdAt: new Date().toISOString(),
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
      return { clientMessageId, tempId }
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

    void loadDetail({ silent: Boolean(cachedDetail) })
    void loadMessages(undefined, { silent: Boolean(cachedMessages?.length) })
  }, [apiBase, chatId, loadDetail, loadMessages, userId])

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
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => update())
    observer.observe(composer)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    messagesRef.current = messages
    const cached = messages.filter((item) => item.id > 0)
    if (cached.length > 0) {
      setCachedChatMessages(apiBase, userId, chatId, cached)
    }
  }, [apiBase, chatId, messages, userId])

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
    const unsubscribeStatus = stream.subscribeStatus(setStreamStatus)
    const unsubscribe = stream.subscribe((payload) => {
      if (payload?.type === 'message:new') {
        const incoming = payload.message as ChatMessage | undefined
        if (incoming?.chatId !== chatId) return
        const exists = messagesRef.current.some((item) => item.id === incoming.id)
        if (exists) return
        mergeMessages([incoming])
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
  }, [chatId, markRead, mergeMessages, scrollToBottom, stream, userId])

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
    const { clientMessageId, tempId } = enqueueOptimisticMessage({
      type: payload.type,
      body: payload.body ?? null,
      meta,
      attachmentUrl: payload.attachmentUrl ?? null,
      localAttachmentUrl: payload.localAttachmentUrl ?? null,
      clientMessageId: payload.clientMessageId,
      tempId: payload.tempId,
    })

    try {
      const requestMeta =
        meta && typeof meta === 'object'
          ? { ...meta, clientMessageId }
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
      const message = (await response.json()) as ChatMessage
      if (message?.id) {
        mergeMessages([message])
        setTimeout(() => scrollToBottom(), 0)
      }
    } catch (error) {
      console.error('Chat send failed:', error)
      updateMessageStatus(tempId, 'failed')
      setSendError('Не удалось отправить сообщение.')
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
      setQuickValue('')
      setQuickMode(null)
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
      setQuickValue('')
      setQuickMode(null)
      await handleSendMessage({
        type: 'offer_time',
        body: `Время: ${trimmed}`,
        meta: { time: trimmed },
      })
    }
  }

  const handleLocationSend = async (value: 'master' | 'client' | 'any') => {
    setQuickMode(null)
    setQuickValue('')
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

  const onLoadMore = () => {
    const oldestId = messages[0]?.id
    if (oldestId && oldestId > 0) {
      void loadMessages(oldestId)
    }
  }

  const groupedMessages = useMemo(() => {
    return messages.map((message, index) => {
      const previous = messages[index - 1]
      const showDate =
        !previous ||
        new Date(previous.createdAt).toDateString() !==
          new Date(message.createdAt).toDateString()
      return { message, showDate }
    })
  }, [messages])

  return (
    <div className="screen screen--chat-thread" ref={screenRef}>
      <div className="chat-thread">
        <header className="chat-thread-header">
          <button className="chat-back" type="button" onClick={onBack}>
            ←
          </button>
          <div className="chat-thread-title">
            <span className="chat-thread-name">
              {counterpart?.name ?? 'Чат'}
            </span>
            <div className="chat-thread-subline">
              <span className="chat-thread-subtitle">{headerSubtitle}</span>
              <span
                className={`chat-connection is-compact ${connectionTone}`}
                role="status"
                aria-live="polite"
              >
                {connectionLabel}
              </span>
            </div>
          </div>
        </header>

        {request ? (
          <section className="chat-request-card">
            <div className="chat-request-top">
              <span className="chat-request-title">{request.serviceName}</span>
              <span className="chat-request-pill">Согласовано</span>
            </div>
            <div className="chat-request-meta">
              <span>
                <IconPin /> {locationLabelMap[request.locationType ?? 'any']}
              </span>
              <span>
                <IconClock />{' '}
                {request.dateOption === 'choose'
                  ? formatDateTime(request.dateTime) || 'По договоренности'
                  : request.dateOption === 'tomorrow'
                    ? 'Завтра'
                    : 'Сегодня'}
              </span>
              {request.budget && <span>Бюджет: {request.budget}</span>}
            </div>
            {request.details && (
              <p className="chat-request-details">{request.details}</p>
            )}
          </section>
        ) : booking ? (
          <section className="chat-request-card">
            <div className="chat-request-top">
              <span className="chat-request-title">
                {booking.serviceName ?? 'Запись'}
              </span>
              <span className="chat-request-pill">{bookingStatusLabel}</span>
            </div>
            <div className="chat-request-meta">
              <span>
                <IconPin /> {locationLabelMap[booking.locationType ?? 'client']}
              </span>
              <span>
                <IconClock /> {bookingTimeLabel}
              </span>
              {bookingPriceLabel && <span>{bookingPriceLabel}</span>}
            </div>
          </section>
        ) : (
          isDetailLoading && (
            <section
              className="chat-request-card is-skeleton"
              aria-hidden="true"
            >
              <span className="chat-request-skeleton-line is-title" />
              <div className="chat-request-skeleton-row">
                <span className="chat-request-skeleton-line is-chip" />
                <span className="chat-request-skeleton-line is-chip" />
                <span className="chat-request-skeleton-line is-chip" />
              </div>
              <span className="chat-request-skeleton-line is-body" />
            </section>
          )
        )}

        {loadError && (
          <p className="chat-error" role="alert">
            {loadError}
          </p>
        )}
        {isLoading && messages.length === 0 && (
          <p className="chat-status" role="status" aria-live="polite">
            Загружаем сообщения...
          </p>
        )}
        {!isLoading && messages.length === 0 && !loadError && (
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
            const showStatus = isMine && !isSystem
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

            return (
              <div key={message.id} className="chat-message-group">
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
        {quickMode && (
          <div className="chat-quick-panel">
            {quickMode === 'price' && (
              <>
                <span className="chat-quick-title">Предложите цену</span>
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
                <span className="chat-quick-title">Предложите время</span>
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
                <span className="chat-quick-title">Где удобно</span>
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

        <div className="chat-actions">
          <button
            className={`chat-action${quickMode === 'price' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setQuickMode(quickMode === 'price' ? null : 'price')}
          >
            Цена
          </button>
          <button
            className={`chat-action${quickMode === 'time' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setQuickMode(quickMode === 'time' ? null : 'time')}
          >
            Время
          </button>
          <button
            className={`chat-action${quickMode === 'location' ? ' is-active' : ''}`}
            type="button"
            onClick={() =>
              setQuickMode(quickMode === 'location' ? null : 'location')
            }
          >
            Место
          </button>
        </div>

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
            className="chat-input"
            rows={1}
            placeholder="Напишите сообщение"
            value={composerText}
            onChange={handleComposerChange}
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
    </div>
  )
}
