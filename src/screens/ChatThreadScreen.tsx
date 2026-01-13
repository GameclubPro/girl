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
import { buildChatStreamUrl } from '../utils/chat'

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

export const ChatThreadScreen = ({
  apiBase,
  userId,
  chatId,
  onBack,
}: ChatThreadScreenProps) => {
  const [detail, setDetail] = useState<ChatDetail | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [composerText, setComposerText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sendError, setSendError] = useState('')
  const [quickMode, setQuickMode] = useState<
    null | 'price' | 'time' | 'location'
  >(null)
  const [quickValue, setQuickValue] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const hasMoreRef = useRef(true)
  const isLoadingMoreRef = useRef(false)
  const hasInitialScrollRef = useRef(false)
  const messagesRef = useRef<ChatMessage[]>([])

  const limit = 30

  const counterpart = detail?.counterpart
  const request = detail?.request

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
    },
    []
  )

  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((current) => {
      const map = new Map<number, ChatMessage>()
      current.forEach((item) => map.set(item.id, item))
      incoming.forEach((item) => map.set(item.id, item))
      const next = Array.from(map.values()).sort((a, b) => a.id - b.id)
      return next
    })
  }, [])

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

  const loadMessages = useCallback(
    async (beforeId?: number) => {
      const target = beforeId ? 'more' : 'initial'
      if (target === 'more') {
        if (isLoadingMoreRef.current || !hasMoreRef.current) return
        isLoadingMoreRef.current = true
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
      }
      setLoadError('')
      try {
        const params = new URLSearchParams()
        params.set('userId', userId)
        params.set('limit', String(limit))
        if (beforeId) {
          params.set('beforeId', String(beforeId))
        }
        const response = await fetch(
          `${apiBase}/api/chats/${chatId}/messages?${params.toString()}`
        )
        if (!response.ok) {
          throw new Error('Load messages failed')
        }
        const data = (await response.json()) as { items?: ChatMessage[] }
        const items = Array.isArray(data.items) ? data.items : []
        mergeMessages(items)
        if (items.length < limit) {
          hasMoreRef.current = false
          setHasMore(false)
        }
        if (!beforeId) {
          const last = items[items.length - 1]
          if (last && last.senderId !== userId) {
            void markRead(last.id)
          }
        }
      } catch (error) {
        console.error('Failed to load messages:', error)
        setLoadError('Не удалось загрузить сообщения.')
      } finally {
        setIsLoading(false)
        isLoadingMoreRef.current = false
        setIsLoadingMore(false)
      }
    },
    [apiBase, chatId, limit, markRead, mergeMessages, scrollToBottom, userId]
  )

  const loadDetail = useCallback(async () => {
    if (!userId) return
    setIsDetailLoading(true)
    try {
      const response = await fetch(
        `${apiBase}/api/chats/${chatId}?userId=${encodeURIComponent(userId)}`
      )
      if (!response.ok) {
        throw new Error('Load chat detail failed')
      }
      const data = (await response.json()) as ChatDetail
      setDetail(data ?? null)
    } catch (error) {
      console.error('Failed to load chat detail:', error)
      setLoadError('Не удалось загрузить чат.')
    } finally {
      setIsDetailLoading(false)
    }
  }, [apiBase, chatId, userId])

  useEffect(() => {
    void loadDetail()
    void loadMessages()
  }, [loadDetail, loadMessages])

  useLayoutEffect(() => {
    if (hasInitialScrollRef.current) return
    if (messages.length === 0) return
    scrollToBottom('auto')
    hasInitialScrollRef.current = true
  }, [messages.length, scrollToBottom])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    const streamUrl = buildChatStreamUrl(apiBase, userId)
    if (!streamUrl) return
    const socket = new WebSocket(streamUrl)

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload?.type === 'message:new') {
          const incoming = payload.message as ChatMessage | undefined
          if (incoming?.chatId === chatId) {
            const exists = messagesRef.current.some((item) => item.id === incoming.id)
            if (exists) return
            mergeMessages([incoming])
            scrollToBottom()
            if (incoming.senderId !== userId) {
              void markRead(incoming.id)
            }
          }
        }
      } catch (error) {
        console.error('Chat stream payload failed:', error)
      }
    }

    return () => {
      socket.close()
    }
  }, [apiBase, chatId, markRead, mergeMessages, scrollToBottom, userId])

  const handleSendMessage = async (payload: {
    type: ChatMessage['type']
    body?: string | null
    meta?: Record<string, unknown> | null
    attachmentPath?: string | null
  }) => {
    if (isSending) return
    setIsSending(true)
    setSendError('')

    try {
      const response = await fetch(`${apiBase}/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: payload.type,
          body: payload.body ?? null,
          meta: payload.meta ?? null,
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
      setSendError('Не удалось отправить сообщение.')
    } finally {
      setIsSending(false)
    }
  }

  const handleSendText = async () => {
    const trimmed = composerText.trim()
    if (!trimmed) return
    setComposerText('')
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
      })
    } catch (error) {
      console.error('Chat upload failed:', error)
      setSendError('Не удалось загрузить фото.')
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

  const onLoadMore = () => {
    const oldestId = messages[0]?.id
    if (oldestId) {
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
    <div className="screen screen--chat-thread">
      <div className="chat-thread">
        <header className="chat-thread-header">
          <button className="chat-back" type="button" onClick={onBack}>
            ←
          </button>
          <div className="chat-thread-title">
            <span className="chat-thread-name">
              {counterpart?.name ?? 'Чат'}
            </span>
            <span className="chat-thread-subtitle">
              {request?.serviceName ?? 'Переговоры по заявке'}
            </span>
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

        {loadError && <p className="chat-error">{loadError}</p>}
        {isLoading && messages.length === 0 && (
          <p className="chat-status">Загружаем сообщения...</p>
        )}
        {!isLoading && messages.length === 0 && !loadError && (
          <p className="chat-status">Сообщений пока нет.</p>
        )}

        <div className="chat-messages">
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
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="chat-composer">
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
            onChange={(event) => setComposerText(event.target.value)}
          />
          <button
            className="chat-send"
            type="button"
            onClick={() => void handleSendText()}
            disabled={isSending || uploading || !composerText.trim()}
          >
            Отправить
          </button>
        </div>
        {sendError && <p className="chat-error">{sendError}</p>}
      </div>
    </div>
  )
}
