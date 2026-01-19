import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconChat,
  IconHome,
  IconList,
  IconSupport,
  IconUser,
} from '../components/icons'
import { TrustBadge } from '../components/TrustBadge'
import { ProBottomNav } from '../components/ProBottomNav'
import type { ChatMessage, ChatSummary } from '../types/app'
import type { ChatStreamStatus } from '../utils/chatStream'
import { getChatStream } from '../utils/chatStream'
import { getCachedChatList, setCachedChatList } from '../utils/chatCache'

type ChatListScreenProps = {
  apiBase: string
  userId: string
  role: 'client' | 'pro'
  onOpenChat: (chatId: number) => void
  onOpenSupport?: () => void
  onViewHome?: () => void
  onViewRequests?: () => void
  onViewProfile?: () => void
  onViewCabinet?: () => void
}

const SUPPORT_AGENT_IDS = new Set(['5510721194', '7226796630'])

const formatChatTimestamp = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  return new Intl.DateTimeFormat('ru-RU', {
    day: isToday ? undefined : '2-digit',
    month: isToday ? undefined : 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const formatContextTimestamp = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86400000)
  const timeLabel = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  if (dayDiff === 0) return `Сегодня, ${timeLabel}`
  if (dayDiff === 1) return `Завтра, ${timeLabel}`
  if (dayDiff === -1) return `Вчера, ${timeLabel}`
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(date)
  return `${dateLabel}, ${timeLabel}`
}

const bookingStatusLabels: Record<string, string> = {
  pending: 'Ожидает подтверждения',
  price_pending: 'Ожидает цену',
  price_proposed: 'Предложена цена',
  confirmed: 'Подтверждено',
  declined: 'Отказ',
  cancelled: 'Отменено',
}

const requestStatusLabels: Record<string, string> = {
  open: 'Ожидает отклика',
  closed: 'Согласовано',
}

const bookingOutcomeLabels: Record<string, string> = {
  on_time: 'Вовремя',
  late: 'Опоздал',
  no_show: 'Не пришёл',
  late_cancel: 'Поздняя отмена',
}

const getInitials = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return 'Ч'
  const parts = normalized.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0] ?? '')
  const joined = letters.join('').toUpperCase()
  if (joined) return joined
  return normalized.slice(0, 2).toUpperCase()
}

const getMessagePreview = (message?: ChatSummary['lastMessage'] | null) => {
  if (!message) return ''
  const body = message.body?.trim()
  if (body) return body
  switch (message.type) {
    case 'image':
      return 'Фото'
    case 'system':
      return 'Системное сообщение'
    case 'offer_price':
    case 'offer_time':
    case 'offer_location':
      return 'Новое предложение'
    default:
      return ''
  }
}

const getLatestContext = (chat: ChatSummary) => {
  if (Array.isArray(chat.contexts) && chat.contexts.length > 0) {
    return chat.contexts[0]
  }
  if (chat.contextType === 'booking' && chat.booking) {
    return {
      contextType: 'booking' as const,
      contextId: chat.booking.id,
      serviceName: chat.booking.serviceName ?? null,
      status: chat.booking.status ?? null,
      scheduledAt: chat.booking.scheduledAt ?? null,
      serviceDuration: chat.booking.serviceDuration ?? null,
      servicePrice: chat.booking.servicePrice ?? null,
      outcome: chat.booking.outcome ?? null,
      lateMinutes: chat.booking.lateMinutes ?? null,
      createdAt: chat.booking.createdAt ?? null,
    }
  }
  if (chat.contextType === 'request' && chat.request) {
    return {
      contextType: 'request' as const,
      contextId: chat.request.id,
      serviceName: chat.request.serviceName ?? null,
      status: chat.request.status ?? null,
      locationType: chat.request.locationType ?? null,
      dateOption: chat.request.dateOption ?? null,
      dateTime: chat.request.dateTime ?? null,
      createdAt: chat.request.createdAt ?? null,
    }
  }
  return null
}

const getContextStatusLabel = (
  context: ReturnType<typeof getLatestContext>
) => {
  if (!context) return ''
  if (context.contextType === 'booking') {
    if (context.outcome) {
      return bookingOutcomeLabels[context.outcome] ?? context.outcome
    }
    if (context.status) {
      return bookingStatusLabels[context.status] ?? context.status
    }
    return 'Запись'
  }
  if (context.status) {
    return requestStatusLabels[context.status] ?? context.status
  }
  return 'Заявка'
}

const getContextTimeLabel = (context: ReturnType<typeof getLatestContext>) => {
  if (!context) return ''
  if (context.contextType === 'booking') {
    return formatContextTimestamp(context.scheduledAt ?? context.createdAt ?? null)
  }
  if (context.dateOption === 'today') return 'Сегодня'
  if (context.dateOption === 'tomorrow') return 'Завтра'
  if (context.dateOption === 'choose' && context.dateTime) {
    return formatContextTimestamp(context.dateTime)
  }
  if (context.dateTime) {
    return formatContextTimestamp(context.dateTime)
  }
  return context.createdAt ? formatContextTimestamp(context.createdAt) : 'По договоренности'
}

const getContextTypeLabel = (context: ReturnType<typeof getLatestContext>) => {
  if (!context) return 'Диалог'
  return context.contextType === 'booking' ? 'Запись' : 'Заявка'
}

const getChatBucket = (chat: ChatSummary) => {
  if (chat.contextType === 'support') return 'active'
  const context = getLatestContext(chat)
  if (!context) return 'waiting'
  if (context.contextType === 'booking') {
    const status = context.status ?? ''
    if (context.outcome || status === 'cancelled' || status === 'declined') {
      return 'archived'
    }
    if (['pending', 'price_pending', 'price_proposed'].includes(status)) {
      return 'waiting'
    }
    if (context.scheduledAt) {
      const scheduledMs = new Date(context.scheduledAt).getTime()
      if (Number.isFinite(scheduledMs) && scheduledMs < Date.now() - 2 * 60 * 60 * 1000) {
        return 'waiting'
      }
    }
    return 'active'
  }
  const requestStatus = context.status ?? ''
  if (requestStatus === 'open') return 'waiting'
  if (requestStatus === 'closed') return 'active'
  return 'archived'
}

export const ChatListScreen = ({
  apiBase,
  userId,
  role,
  onOpenChat,
  onOpenSupport,
  onViewHome,
  onViewRequests,
  onViewProfile,
  onViewCabinet,
}: ChatListScreenProps) => {
  const [items, setItems] = useState<ChatSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [streamStatus, setStreamStatus] = useState<ChatStreamStatus>('idle')
  const reloadTimerRef = useRef<number | null>(null)
  const isReadyRef = useRef(false)
  const isLoadingRef = useRef(false)
  const loadAbortRef = useRef<AbortController | null>(null)
  const loadRequestIdRef = useRef(0)
  const listUpdateTokenRef = useRef(0)
  const isSupportAgent = SUPPORT_AGENT_IDS.has(userId)

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

  const supportChat = useMemo(
    () => items.find((item) => item.contextType === 'support') ?? null,
    [items]
  )

  const regularItems = useMemo(
    () =>
      isSupportAgent ? items : items.filter((item) => item.contextType !== 'support'),
    [items, isSupportAgent]
  )

  const totalUnread = useMemo(
    () => items.reduce((sum, item) => sum + (item.unreadCount ?? 0), 0),
    [items]
  )

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const byQuery = query
      ? regularItems.filter((item) => {
          const latestContext = getLatestContext(item)
          const serviceName =
            latestContext?.serviceName ||
            item.request?.serviceName ||
            item.booking?.serviceName ||
            ''
          const contextNames = Array.isArray(item.contexts)
            ? item.contexts
                .map((context) => context.serviceName)
                .filter(Boolean)
                .join(' ')
            : ''
          const haystack = `${item.counterpart.name} ${serviceName} ${contextNames}`.toLowerCase()
          return haystack.includes(query)
        })
      : regularItems

    if (filter === 'unread') {
      return byQuery.filter((item) => (item.unreadCount ?? 0) > 0)
    }
    return byQuery
  }, [filter, regularItems, searchQuery])

  const chatSections = useMemo(() => {
    const active: ChatSummary[] = []
    const waiting: ChatSummary[] = []
    const archived: ChatSummary[] = []
    filteredItems.forEach((chat) => {
      const bucket = getChatBucket(chat)
      if (bucket === 'archived') {
        archived.push(chat)
      } else if (bucket === 'waiting') {
        waiting.push(chat)
      } else {
        active.push(chat)
      }
    })
    return { active, waiting, archived }
  }, [filteredItems])

  const supportPreview = supportChat
    ? getMessagePreview(supportChat.lastMessage) || 'Откройте чат поддержки'
    : 'Ответим по записи, оплате и сервису'
  const supportTime = formatChatTimestamp(supportChat?.lastMessage?.createdAt ?? null)
  const supportUnread = supportChat?.unreadCount ?? 0
  const hasRegularChats = regularItems.length > 0
  const filteredCount =
    chatSections.active.length +
    chatSections.waiting.length +
    chatSections.archived.length

  const loadChats = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) return
      if (isLoadingRef.current) return
      const silent = options?.silent ?? false
      const requestId = (loadRequestIdRef.current += 1)
      const updateToken = listUpdateTokenRef.current

      isLoadingRef.current = true
      if (!silent) {
        setIsLoading(true)
        setLoadError('')
      }

      if (loadAbortRef.current) {
        loadAbortRef.current.abort()
      }
      const controller = new AbortController()
      loadAbortRef.current = controller

      try {
        const response = await fetch(
          `${apiBase}/api/chats?userId=${encodeURIComponent(userId)}`,
          { signal: controller.signal }
        )
        if (!response.ok) {
          throw new Error('Load chats failed')
        }
        const data = (await response.json()) as ChatSummary[]
        const next = Array.isArray(data) ? data : []
        if (
          loadRequestIdRef.current !== requestId ||
          listUpdateTokenRef.current !== updateToken
        ) {
          return
        }
        setItems(next)
        setCachedChatList(apiBase, userId, next)
        setLoadError('')
        isReadyRef.current = true
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        console.error('Failed to load chats:', error)
        if (!silent) {
          setLoadError('Не удалось загрузить чаты.')
        }
      } finally {
        if (loadRequestIdRef.current === requestId) {
          if (!silent) {
            setIsLoading(false)
          }
          isLoadingRef.current = false
          if (loadAbortRef.current === controller) {
            loadAbortRef.current = null
          }
        }
      }
    },
    [apiBase, userId]
  )

  const scheduleReload = useCallback(() => {
    if (!isReadyRef.current || isLoadingRef.current) return
    if (reloadTimerRef.current !== null) return
    reloadTimerRef.current = window.setTimeout(() => {
      reloadTimerRef.current = null
      void loadChats({ silent: true })
    }, 240)
  }, [loadChats])

  useEffect(() => {
    const cached = getCachedChatList(apiBase, userId)
    if (cached) {
      setItems(cached)
      isReadyRef.current = true
    } else {
      setIsLoading(true)
    }
    void loadChats({ silent: Boolean(cached) })
    return () => {
      if (loadAbortRef.current) {
        loadAbortRef.current.abort()
        loadAbortRef.current = null
      }
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current)
      }
    }
  }, [apiBase, loadChats, userId])

  useEffect(() => {
    const stream = getChatStream(apiBase, userId)
    const unsubscribeStatus = stream.subscribeStatus(setStreamStatus)
    const unsubscribe = stream.subscribe((payload) => {
      if (!isReadyRef.current) return
      if (payload?.type === 'message:new') {
        const incoming = payload.message as ChatMessage | undefined
        if (!incoming?.chatId) {
          scheduleReload()
          return
        }
        let handled = false
        listUpdateTokenRef.current += 1
        setItems((current) => {
          const index = current.findIndex((item) => item.id === incoming.chatId)
          if (index === -1) return current
          handled = true
          const target = current[index]
          const nextUnread =
            incoming.senderId === userId
              ? target.unreadCount ?? 0
              : (target.unreadCount ?? 0) + 1
          const nextItem: ChatSummary = {
            ...target,
            lastMessage: {
              id: incoming.id,
              senderId: incoming.senderId ?? null,
              type: incoming.type,
              body: incoming.body ?? null,
              createdAt: incoming.createdAt,
              attachmentUrl: incoming.attachmentUrl ?? null,
            },
            unreadCount: nextUnread,
          }
          const next = [nextItem, ...current.filter((_, i) => i !== index)]
          setCachedChatList(apiBase, userId, next)
          return next
        })
        if (!handled) {
          scheduleReload()
        }
        if (incoming.type === 'system') {
          const meta =
            incoming.meta && typeof incoming.meta === 'object'
              ? (incoming.meta as Record<string, unknown>)
              : null
          const event = typeof meta?.event === 'string' ? meta.event : ''
          if (
            ['request_accepted', 'request_updated', 'booking_confirmed', 'booking_updated'].includes(
              event
            )
          ) {
            scheduleReload()
          }
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
            ? (payload.trust as ChatSummary['counterpart']['trust'])
            : null
        if (!trust || (!chatIdFromEvent && !trustUserId)) return
        listUpdateTokenRef.current += 1
        setItems((current) => {
          const next = current.map((item) => {
            if (
              (chatIdFromEvent && item.id === chatIdFromEvent) ||
              (trustUserId && item.counterpart.id === trustUserId)
            ) {
              return {
                ...item,
                counterpart: {
                  ...item.counterpart,
                  trust,
                },
              }
            }
            return item
          })
          setCachedChatList(apiBase, userId, next)
          return next
        })
        return
      }
      if (payload?.type === 'chat:read') {
        const chatId = typeof payload.chatId === 'number' ? payload.chatId : null
        const readerId =
          typeof payload.userId === 'string' ? payload.userId : null
        if (!chatId || readerId !== userId) return
        listUpdateTokenRef.current += 1
        setItems((current) => {
          const next = current.map((item) =>
            item.id === chatId ? { ...item, unreadCount: 0 } : item
          )
          setCachedChatList(apiBase, userId, next)
          return next
        })
        return
      }
      if (payload?.type === 'chat:created') {
        scheduleReload()
      }
    })

    return () => {
      unsubscribe()
      unsubscribeStatus()
    }
  }, [apiBase, scheduleReload, userId])

  useEffect(() => {
    if (streamStatus === 'connected') return
    const timer = window.setInterval(() => {
      void loadChats({ silent: true })
    }, 15000)
    return () => window.clearInterval(timer)
  }, [loadChats, streamStatus])

  const renderChatCard = (chat: ChatSummary) => {
    const counterpart = chat.counterpart
    const latestContext = getLatestContext(chat)
    const isSupportChat = chat.contextType === 'support'
    const contextLabel = isSupportChat
      ? 'Поддержка'
      : getContextTypeLabel(latestContext)
    const contextStatus = isSupportChat ? '' : getContextStatusLabel(latestContext)
    const contextTime = isSupportChat ? '' : getContextTimeLabel(latestContext)
    const contextType = isSupportChat
      ? 'support'
      : latestContext?.contextType ?? chat.contextType
    const serviceName = isSupportChat
      ? 'Поддержка'
      : latestContext?.serviceName || 'Диалог'
    const lastMessage = chat.lastMessage
    const lastLabel = getMessagePreview(lastMessage) || 'Откройте чат'
    const lastTime = formatChatTimestamp(lastMessage?.createdAt ?? null)
    const unreadCount = chat.unreadCount ?? 0
    const showTrust =
      role === 'pro' && counterpart.role === 'client' && !isSupportChat
    const statusPrefix =
      latestContext?.contextType === 'booking' && latestContext.outcome
        ? 'Итог: '
        : ''

    return (
      <button
        className={`chat-card${
          unreadCount > 0 ? ' is-unread' : ''
        }${chat.contextType === 'support' ? ' is-support' : ''}`}
        key={chat.id}
        type="button"
        role="listitem"
        onClick={() => onOpenChat(chat.id)}
      >
        <span className="chat-avatar" aria-hidden="true">
          {counterpart.avatarUrl ? (
            <img src={counterpart.avatarUrl} alt="" loading="lazy" />
          ) : (
            <span>{getInitials(counterpart.name)}</span>
          )}
        </span>
        <span className="chat-card-main">
          <span className="chat-card-top">
            <span className="chat-card-name-row">
              <span className="chat-card-name">{counterpart.name}</span>
              {showTrust && (
                <TrustBadge
                  trust={counterpart.trust ?? null}
                  size="sm"
                  className="chat-card-trust"
                />
              )}
            </span>
            <span className="chat-card-time">{lastTime}</span>
          </span>
          <span className="chat-card-context-row">
            <span className={`chat-card-context is-${contextType}`}>
              {contextLabel}
            </span>
            <span className="chat-card-context-title">{serviceName}</span>
          </span>
          <span className="chat-card-context-meta">
            {contextStatus && (
              <span className="chat-card-context-status">
                {statusPrefix}
                {contextStatus}
              </span>
            )}
            {contextTime && (
              <span className="chat-card-context-time">{contextTime}</span>
            )}
          </span>
          <span className="chat-card-preview">{lastLabel}</span>
        </span>
        <span className="chat-card-meta">
          {unreadCount > 0 && (
            <span className="chat-unread">{unreadCount}</span>
          )}
        </span>
      </button>
    )
  }

  const renderSection = (
    title: string,
    items: ChatSummary[],
    tone: 'active' | 'waiting' | 'archived'
  ) => {
    if (items.length === 0) return null
    return (
      <section className={`chat-section is-${tone}`}>
        <div className="chat-section-header">
          <span className="chat-section-title">{title}</span>
          <span className="chat-section-count">{items.length}</span>
        </div>
        <div className="chat-list" role="list">
          {items.map(renderChatCard)}
        </div>
      </section>
    )
  }

  return (
    <div className="screen screen--chat-list">
      <div className="chat-shell">
        <header className="chat-header">
          <div>
            <p className="chat-eyebrow">Сообщения</p>
            <h1 className="chat-title">Чаты</h1>
            <span
              className={`chat-connection ${connectionTone}`}
              role="status"
              aria-live="polite"
            >
              {connectionLabel}
            </span>
          </div>
          <div className="chat-summary">
            <span className="chat-summary-count">{totalUnread}</span>
            <span className="chat-summary-label">непрочит.</span>
          </div>
        </header>

        {!isSupportAgent && onOpenSupport && (
          <button
            className={`chat-support-card${supportUnread > 0 ? ' is-unread' : ''}`}
            type="button"
            onClick={onOpenSupport}
          >
            <span className="chat-support-avatar" aria-hidden="true">
              <IconSupport />
            </span>
            <span className="chat-support-main">
              <span className="chat-support-top">
                <span className="chat-support-title">Поддержка KIVEN</span>
                {supportTime && (
                  <span className="chat-support-time">{supportTime}</span>
                )}
              </span>
              <span className="chat-support-subtitle">
                Ответим в чате клиентам и мастерам
              </span>
              <span className="chat-support-preview">{supportPreview}</span>
            </span>
            <span className="chat-support-meta">
              <span className="chat-support-pill">24/7</span>
              {supportUnread > 0 && (
                <span className="chat-unread">{supportUnread}</span>
              )}
            </span>
          </button>
        )}

        <div className="chat-filters" role="tablist" aria-label="Фильтры">
          <button
            className={`chat-filter${filter === 'all' ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            Все
          </button>
          <button
            className={`chat-filter${filter === 'unread' ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            onClick={() => setFilter('unread')}
          >
            Непрочитанные
          </button>
          <button
            className={`chat-refresh${isLoading ? ' is-loading' : ''}`}
            type="button"
            onClick={() => void loadChats()}
            disabled={isLoading}
          >
            <span className="chat-refresh-label">Обновить</span>
            <span className="chat-refresh-spinner" aria-hidden="true" />
          </button>
        </div>

        <div className="chat-search">
          <input
            className="chat-search-input"
            type="search"
            placeholder="Поиск по чатам"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery.trim() && (
            <button
              className="chat-search-clear"
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Очистить поиск"
            >
              ×
            </button>
          )}
        </div>

        {loadError && (
          <p className="chat-error" role="alert">
            {loadError}
          </p>
        )}
        {isLoading && items.length === 0 && (
          <div className="chat-list is-skeleton" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="chat-card is-skeleton" key={`chat-skeleton-${index}`}>
                <span className="chat-avatar" />
                <span className="chat-card-main">
                  <span className="chat-card-top">
                    <span className="chat-card-name" />
                    <span className="chat-card-time" />
                  </span>
                  <span className="chat-card-service" />
                  <span className="chat-card-preview" />
                </span>
                <span className="chat-card-meta">
                  <span className="chat-card-status" />
                </span>
              </div>
            ))}
          </div>
        )}
        {!isLoading && !loadError && !hasRegularChats && (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <IconChat />
            </div>
            <h2>Чаты появятся после подтверждения</h2>
            <p>
              Поддержка доступна всегда, а остальные чаты появятся после
              подтверждения заявки или записи.
            </p>
            {onViewRequests && (
              <div className="chat-empty-actions">
                <button
                  className="cta cta--secondary chat-empty-cta"
                  type="button"
                  onClick={onViewRequests}
                >
                  К заявкам и записям
                </button>
              </div>
            )}
          </div>
        )}
        {!isLoading &&
          !loadError &&
          hasRegularChats &&
          filteredCount === 0 && (
            <div className="chat-empty is-compact">
              <h2>Ничего не найдено</h2>
              <p>Попробуйте изменить фильтр или запрос.</p>
            </div>
          )}

        {!isLoading && !loadError && filteredCount > 0 && (
          <div className="chat-sections">
            {renderSection('Активные', chatSections.active, 'active')}
            {renderSection('Ожидают', chatSections.waiting, 'waiting')}
            {renderSection('Архив', chatSections.archived, 'archived')}
          </div>
        )}
      </div>

      {role === 'client' && (
        <nav className="bottom-nav" aria-label="Навигация">
          <button className="nav-item" type="button" onClick={onViewHome}>
            <span className="nav-icon" aria-hidden="true">
              <IconHome />
            </span>
            Главная
          </button>
          <button className="nav-item is-active" type="button">
            <span className="nav-icon" aria-hidden="true">
              <IconChat />
            </span>
            Чаты
          </button>
          <button className="nav-item" type="button" onClick={onViewRequests}>
            <span className="nav-icon" aria-hidden="true">
              <IconList />
            </span>
            Мои заявки
          </button>
          <button className="nav-item" type="button" onClick={onViewProfile}>
            <span className="nav-icon" aria-hidden="true">
              <IconUser />
            </span>
            Профиль
          </button>
        </nav>
      )}

      {role === 'pro' && (
        <ProBottomNav
          active="chats"
          onCabinet={onViewCabinet ?? (() => {})}
          onRequests={onViewRequests ?? (() => {})}
          onChats={() => {}}
          onProfile={onViewProfile ?? (() => {})}
        />
      )}
    </div>
  )
}
