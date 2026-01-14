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

type TileStatus = {
  id: 'broadcast' | 'reminder'
  message: string
}

const formatShortDate = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(value)

const formatLongDate = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(value)

const formatTime = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)

const toTimeMs = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.getTime()
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

const copyToClipboard = async (value: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch (error) {
    return false
  }
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
  const [tileStatus, setTileStatus] = useState<TileStatus | null>(null)
  const statusTimerRef = useRef<number | null>(null)
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
  const masterLabel = displayName ? `у мастера ${displayName}` : 'у мастера'
  const broadcastText = `Открылись новые окна для записи ${masterLabel}. Выберите удобное время:`
  const reminderText = `Напоминаю о записи ${masterLabel}. Выберите удобное время:`

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
      if (statusTimerRef.current) {
        window.clearTimeout(statusTimerRef.current)
      }
    }
  }, [])

  const requestStats = useMemo(() => {
    const total = requests.length
    const open = requests.filter((request) => request.status === 'open').length
    const responses = requests.reduce(
      (sum, request) => sum + (request.responsesCount ?? 0),
      0
    )
    return {
      total,
      open,
      closed: total - open,
      responses,
    }
  }, [requests])

  const bookingStats = useMemo(() => {
    const now = Date.now()
    const weekEnd = now + 7 * 24 * 60 * 60 * 1000
    const clients = new Map<string, { name: string; count: number }>()
    const recentClients: string[] = []
    const seenRecent = new Set<string>()
    let confirmed = 0
    let pending = 0
    let cancelled = 0
    let upcoming = 0
    let upcomingWeek = 0
    let nextBookingTime: number | null = null
    let lastCreatedTime: number | null = null

    bookings.forEach((booking) => {
      if (booking.status === 'confirmed') {
        confirmed += 1
      }
      if (['pending', 'price_pending', 'price_proposed'].includes(booking.status)) {
        pending += 1
      }
      if (['declined', 'cancelled'].includes(booking.status)) {
        cancelled += 1
      }

      const scheduledMs = toTimeMs(booking.scheduledAt)
      if (scheduledMs !== null) {
        if (
          scheduledMs >= now &&
          !['declined', 'cancelled'].includes(booking.status)
        ) {
          upcoming += 1
          if (scheduledMs < weekEnd) {
            upcomingWeek += 1
          }
          if (nextBookingTime === null || scheduledMs < nextBookingTime) {
            nextBookingTime = scheduledMs
          }
        }
      }

      const createdMs = toTimeMs(booking.createdAt)
      if (createdMs !== null) {
        if (lastCreatedTime === null || createdMs > lastCreatedTime) {
          lastCreatedTime = createdMs
        }
      }

      const clientId = booking.clientId
      const clientName = booking.clientName?.trim() || 'Клиент'
      const existing = clients.get(clientId)
      clients.set(clientId, {
        name: clientName,
        count: (existing?.count ?? 0) + 1,
      })
      if (!seenRecent.has(clientId) && recentClients.length < 3) {
        seenRecent.add(clientId)
        recentClients.push(clientName)
      }
    })

    const repeatClients = Array.from(clients.values()).filter(
      (client) => client.count > 1
    ).length

    return {
      total: bookings.length,
      confirmed,
      pending,
      cancelled,
      upcoming,
      upcomingWeek,
      nextBookingTime,
      lastCreatedTime,
      uniqueClients: clients.size,
      repeatClients,
      recentClients,
    }
  }, [bookings])

  const lastUpdatedLabel = lastUpdated
    ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''
  const nextBookingLabel = bookingStats.nextBookingTime
    ? `${formatShortDate(new Date(bookingStats.nextBookingTime))} · ${formatTime(
        new Date(bookingStats.nextBookingTime)
      )}`
    : 'Пока нет записей'
  const lastBookingLabel = bookingStats.lastCreatedTime
    ? formatLongDate(new Date(bookingStats.lastCreatedTime))
    : 'Пока нет записей'
  const recentClientsLabel =
    bookingStats.recentClients.length > 0
      ? bookingStats.recentClients.join(', ')
      : 'Пока нет клиентов'
  const broadcastStatusMessage =
    tileStatus?.id === 'broadcast'
      ? tileStatus.message
      : !shareConfigured
        ? 'Добавьте VITE_TG_APP_URL, чтобы отправлять рассылку.'
        : ''
  const reminderStatusMessage =
    tileStatus?.id === 'reminder'
      ? tileStatus.message
      : !shareConfigured
        ? 'Добавьте VITE_TG_APP_URL, чтобы отправлять напоминания.'
        : ''

  const setTileMessage = (id: TileStatus['id'], message: string) => {
    setTileStatus({ id, message })
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current)
    }
    statusTimerRef.current = window.setTimeout(() => {
      setTileStatus(null)
    }, 2400)
  }

  const handleCopyShare = async (id: TileStatus['id'], text: string) => {
    if (!shareLink) {
      setTileMessage(id, 'Ссылка пока недоступна.')
      return
    }
    const payload = `${text}\n${shareLink}`.trim()
    const success = await copyToClipboard(payload)
    setTileMessage(
      id,
      success ? 'Текст скопирован.' : 'Не удалось скопировать.'
    )
  }

  const handleOpenShare = (id: TileStatus['id'], text: string) => {
    if (!shareLink) {
      setTileMessage(id, 'Ссылка пока недоступна.')
      return
    }
    if (!shareConfigured) {
      setTileMessage(id, 'Добавьте VITE_TG_APP_URL, чтобы открыть Telegram.')
      return
    }
    const shareUrl = buildTelegramShareUrl(shareLink, text)
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
    setTileMessage(id, 'Открываем личку...')
  }

  return (
    <div className="screen screen--pro screen--pro-cabinet">
      <div className="pro-cabinet-shell pro-cabinet-shell--dashboard">
        {isLoading && (
          <p className="pro-cabinet-dashboard-status">Синхронизируем данные...</p>
        )}
        {combinedError && (
          <p className="pro-cabinet-dashboard-status is-error">{combinedError}</p>
        )}
        {lastUpdatedLabel && !combinedError && (
          <p className="pro-cabinet-dashboard-meta">{lastUpdatedLabel}</p>
        )}

        <div className="pro-cabinet-nav-grid animate delay-1">
          <article className="pro-cabinet-nav-card is-analytics">
            <p className="pro-cabinet-nav-kicker">Статистика</p>
            <h2 className="pro-cabinet-nav-title">Статистика и аналитика</h2>
            <p className="pro-cabinet-nav-subtitle">
              Сводка по заявкам и записям без лишних экранов.
            </p>
            <div className="pro-cabinet-nav-stats">
              <div className="pro-cabinet-nav-stat">
                <span className="pro-cabinet-nav-stat-value">
                  {requestStats.open}
                </span>
                <span className="pro-cabinet-nav-stat-label">заявок</span>
              </div>
              <div className="pro-cabinet-nav-stat">
                <span className="pro-cabinet-nav-stat-value">
                  {bookingStats.confirmed}
                </span>
                <span className="pro-cabinet-nav-stat-label">подтв.</span>
              </div>
              <div className="pro-cabinet-nav-stat">
                <span className="pro-cabinet-nav-stat-value">
                  {bookingStats.upcomingWeek}
                </span>
                <span className="pro-cabinet-nav-stat-label">7 дней</span>
              </div>
            </div>
            <div className="pro-cabinet-nav-footer">
              <button
                className="pro-cabinet-nav-action is-primary"
                type="button"
                onClick={onViewRequests}
              >
                Открыть заявки
              </button>
            </div>
          </article>

          <article className="pro-cabinet-nav-card is-clients">
            <p className="pro-cabinet-nav-kicker">Клиенты</p>
            <h2 className="pro-cabinet-nav-title">Клиентская база</h2>
            <p className="pro-cabinet-nav-subtitle">
              {bookingStats.uniqueClients > 0
                ? `Уникальных клиентов: ${bookingStats.uniqueClients}`
                : 'Клиенты появятся после первых записей.'}
            </p>
            <p className="pro-cabinet-nav-meta">{recentClientsLabel}</p>
            <div className="pro-cabinet-nav-footer">
              <div className="pro-cabinet-nav-pills">
                <span className="pro-cabinet-nav-pill">
                  Повторных: {bookingStats.repeatClients}
                </span>
                <span className="pro-cabinet-nav-pill is-ghost">
                  Активных: {bookingStats.upcoming}
                </span>
              </div>
              <button
                className="pro-cabinet-nav-action is-primary"
                type="button"
                onClick={onViewChats}
              >
                Открыть чаты
              </button>
            </div>
          </article>

          <article className="pro-cabinet-nav-card is-campaigns">
            <p className="pro-cabinet-nav-kicker">Рассылка</p>
            <h2 className="pro-cabinet-nav-title">Рассылка</h2>
            <p className="pro-cabinet-nav-subtitle">
              Сообщите о свободных окнах всем клиентам сразу.
            </p>
            <div className="pro-cabinet-nav-pills">
              <span className="pro-cabinet-nav-pill">
                Аудитория: {bookingStats.uniqueClients}
              </span>
              <span className="pro-cabinet-nav-pill is-ghost">
                Откликов: {requestStats.responses}
              </span>
            </div>
            <div className="pro-cabinet-nav-footer">
              <div className="pro-cabinet-nav-actions">
                <button
                  className="pro-cabinet-nav-action is-primary"
                  type="button"
                  onClick={() => handleOpenShare('broadcast', broadcastText)}
                  disabled={!shareLink || !shareConfigured}
                >
                  Отправить
                </button>
                <button
                  className="pro-cabinet-nav-action is-ghost"
                  type="button"
                  onClick={() => handleCopyShare('broadcast', broadcastText)}
                  disabled={!shareLink}
                >
                  Скопировать
                </button>
              </div>
              {broadcastStatusMessage && (
                <p className="pro-cabinet-nav-status" role="status">
                  {broadcastStatusMessage}
                </p>
              )}
            </div>
          </article>

          <article className="pro-cabinet-nav-card is-reminders">
            <p className="pro-cabinet-nav-kicker">Напоминание</p>
            <h2 className="pro-cabinet-nav-title">Напомнить записаться</h2>
            <p className="pro-cabinet-nav-subtitle">
              {bookingStats.lastCreatedTime
                ? `Последняя запись: ${lastBookingLabel}`
                : 'Добавьте первое касание, чтобы напомнить.'}
            </p>
            <p className="pro-cabinet-nav-meta">Следующая: {nextBookingLabel}</p>
            <div className="pro-cabinet-nav-footer">
              <div className="pro-cabinet-nav-actions">
                <button
                  className="pro-cabinet-nav-action is-primary"
                  type="button"
                  onClick={() => handleOpenShare('reminder', reminderText)}
                  disabled={!shareLink || !shareConfigured}
                >
                  Напомнить
                </button>
                <button
                  className="pro-cabinet-nav-action is-ghost"
                  type="button"
                  onClick={() => handleCopyShare('reminder', reminderText)}
                  disabled={!shareLink}
                >
                  Скопировать
                </button>
              </div>
              {reminderStatusMessage && (
                <p className="pro-cabinet-nav-status" role="status">
                  {reminderStatusMessage}
                </p>
              )}
            </div>
          </article>
        </div>
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
