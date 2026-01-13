import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconChat,
  IconHome,
  IconList,
  IconUser,
  IconUsers,
} from '../components/icons'
import { ProBottomNav } from '../components/ProBottomNav'
import type { ChatSummary } from '../types/app'
import { buildChatStreamUrl } from '../utils/chat'

type ChatListScreenProps = {
  apiBase: string
  userId: string
  role: 'client' | 'pro'
  onOpenChat: (chatId: number) => void
  onViewHome?: () => void
  onViewMasters?: () => void
  onViewRequests?: () => void
  onViewProfile?: () => void
  onViewCabinet?: () => void
}

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

const getInitials = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return 'Ч'
  const parts = normalized.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0] ?? '')
  const joined = letters.join('').toUpperCase()
  if (joined) return joined
  return normalized.slice(0, 2).toUpperCase()
}

export const ChatListScreen = ({
  apiBase,
  userId,
  role,
  onOpenChat,
  onViewHome,
  onViewMasters,
  onViewRequests,
  onViewProfile,
  onViewCabinet,
}: ChatListScreenProps) => {
  const [items, setItems] = useState<ChatSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const reloadTimerRef = useRef<number | null>(null)
  const isReadyRef = useRef(false)
  const isLoadingRef = useRef(false)

  const totalUnread = useMemo(
    () => items.reduce((sum, item) => sum + (item.unreadCount ?? 0), 0),
    [items]
  )

  const filteredItems = useMemo(() => {
    if (filter === 'unread') {
      return items.filter((item) => (item.unreadCount ?? 0) > 0)
    }
    return items
  }, [filter, items])

  const loadChats = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) return
      if (isLoadingRef.current) return
      const silent = options?.silent ?? false

      isLoadingRef.current = true
      if (!silent) {
        setIsLoading(true)
        setLoadError('')
      }

      try {
        const response = await fetch(
          `${apiBase}/api/chats?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load chats failed')
        }
        const data = (await response.json()) as ChatSummary[]
        setItems(Array.isArray(data) ? data : [])
        setLoadError('')
        isReadyRef.current = true
      } catch (error) {
        console.error('Failed to load chats:', error)
        if (!silent) {
          setLoadError('Не удалось загрузить чаты.')
        }
      } finally {
        if (!silent) {
          setIsLoading(false)
        }
        isLoadingRef.current = false
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
    void loadChats()
    return () => {
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current)
      }
    }
  }, [loadChats])

  useEffect(() => {
    const streamUrl = buildChatStreamUrl(apiBase, userId)
    if (!streamUrl) return
    const socket = new WebSocket(streamUrl)

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (!isReadyRef.current) return
        if (
          payload?.type === 'message:new' ||
          payload?.type === 'chat:created' ||
          payload?.type === 'chat:read'
        ) {
          scheduleReload()
        }
      } catch (error) {
        console.error('Chat stream payload failed:', error)
      }
    }

    socket.onerror = () => {
      scheduleReload()
    }

    return () => {
      socket.close()
    }
  }, [apiBase, scheduleReload, userId])

  return (
    <div className="screen screen--chat-list">
      <div className="chat-shell">
        <header className="chat-header">
          <div>
            <p className="chat-eyebrow">Сообщения</p>
            <h1 className="chat-title">Чаты</h1>
          </div>
          <div className="chat-summary">
            <span className="chat-summary-count">{totalUnread}</span>
            <span className="chat-summary-label">непрочит.</span>
          </div>
        </header>

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

        {loadError && <p className="chat-error">{loadError}</p>}
        {!isLoading && !loadError && filteredItems.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <IconChat />
            </div>
            <h2>Пока нет чатов</h2>
            <p>Чат появится после согласования заявки.</p>
          </div>
        )}

        <div className="chat-list" role="list">
          {filteredItems.map((chat) => {
            const counterpart = chat.counterpart
            const serviceName =
              chat.request?.serviceName || chat.booking?.serviceName || 'Диалог'
            const statusLabel =
              chat.request?.status === 'closed'
                ? 'Согласовано'
                : chat.booking?.status
                  ? 'Запись'
                  : 'Активно'
            const lastMessage = chat.lastMessage
            const lastLabel = lastMessage?.body ?? 'Откройте чат'
            const lastTime = formatChatTimestamp(lastMessage?.createdAt ?? null)
            const unreadCount = chat.unreadCount ?? 0

            return (
              <button
                className={`chat-card${unreadCount > 0 ? ' is-unread' : ''}`}
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
                    <span className="chat-card-name">{counterpart.name}</span>
                    <span className="chat-card-time">{lastTime}</span>
                  </span>
                  <span className="chat-card-service">{serviceName}</span>
                  <span className="chat-card-preview">{lastLabel}</span>
                </span>
                <span className="chat-card-meta">
                  <span className="chat-card-status">{statusLabel}</span>
                  {unreadCount > 0 && (
                    <span className="chat-unread">{unreadCount}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {role === 'client' && (
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
