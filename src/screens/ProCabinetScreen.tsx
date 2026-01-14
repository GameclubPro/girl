import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import {
  IconBell,
  IconCalendar,
  IconChat,
  IconDashboard,
  IconShowcase,
  IconUsers,
} from '../components/icons'
import { useProCabinetData } from '../hooks/useProCabinetData'
import type { MasterProfile, ProProfileSection } from '../types/app'
import {
  isImageUrl,
  parsePortfolioItems,
  type PortfolioItem,
} from '../utils/profileContent'

const DAY_MS = 24 * 60 * 60 * 1000

const toDateKey = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatShortDate = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(
    value
  )

const formatShortTime = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(
    value
  )

const formatWeekday = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
    .format(value)
    .replace('.', '')

const clampUnit = (value: number) => Math.min(1, Math.max(0, value))

const resolvePortfolioFocus = (item?: PortfolioItem | null) => {
  const rawX = typeof item?.focusX === 'number' ? item.focusX : 0.5
  const rawY = typeof item?.focusY === 'number' ? item.focusY : 0.5
  const x = clampUnit(rawX)
  const y = clampUnit(rawY)
  return {
    x,
    y,
    position: `${x * 100}% ${y * 100}%`,
  }
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

const showcaseSlotClasses = ['is-a', 'is-b', 'is-c', 'is-d'] as const

type ProCabinetScreenProps = {
  apiBase: string
  userId: string
  onEditProfile: (section?: ProProfileSection) => void
  onViewRequests: () => void
  onViewChats: () => void
  onOpenAnalytics: () => void
  onOpenClients: () => void
  onOpenCampaigns: () => void
  onOpenReminders: () => void
  onOpenCalendar: () => void
  onOpenShowcase: () => void
}

export const ProCabinetScreen = ({
  apiBase,
  userId,
  onEditProfile,
  onViewRequests,
  onViewChats,
  onOpenAnalytics,
  onOpenClients,
  onOpenCampaigns,
  onOpenReminders,
  onOpenCalendar,
  onOpenShowcase,
}: ProCabinetScreenProps) => {
  const { requestStats, bookingStats, bookings } = useProCabinetData(
    apiBase,
    userId
  )
  const [showcasePreview, setShowcasePreview] = useState<PortfolioItem[]>([])
  const [showcaseTotal, setShowcaseTotal] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadShowcase = async () => {
      try {
        const response = await fetch(
          `${apiBase}/api/masters/${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load showcase failed')
        }
        const data = (await response.json()) as MasterProfile
        if (cancelled) return
        const showcaseItems = parsePortfolioItems(data.showcaseUrls ?? [])
        const portfolioItems = parsePortfolioItems(data.portfolioUrls ?? [])
        const previewSource =
          showcaseItems.length > 0 ? showcaseItems : portfolioItems
        const imageItems = previewSource.filter((item) => isImageUrl(item.url))
        const previewItems = (imageItems.length > 0 ? imageItems : previewSource).slice(
          0,
          4
        )
        setShowcasePreview(previewItems)
        setShowcaseTotal(previewSource.length)
      } catch (error) {
        if (!cancelled) {
          setShowcasePreview([])
          setShowcaseTotal(0)
        }
      }
    }

    void loadShowcase()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])
  const analyticsSpark = useMemo(() => {
    const values = [
      requestStats.open,
      requestStats.responses,
      bookingStats.confirmed,
      bookingStats.pending,
      bookingStats.upcomingWeek,
      requestStats.total,
    ]
    const max = Math.max(...values)
    if (!max) return [10, 18, 14, 22, 16, 12]
    return values.map((value) => Math.max(6, Math.round((value / max) * 24) + 6))
  }, [bookingStats, requestStats])
  const calendarPreview = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() + index)
      return {
        key: toDateKey(date),
        label: formatWeekday(date),
        isToday: index === 0,
      }
    })
    const counts = new Map<string, number>()
    bookings.forEach((booking) => {
      if (['declined', 'cancelled'].includes(booking.status)) return
      const date = new Date(booking.scheduledAt)
      if (Number.isNaN(date.getTime())) return
      date.setHours(0, 0, 0, 0)
      const diffDays = Math.floor((date.getTime() - today.getTime()) / DAY_MS)
      if (diffDays < 0 || diffDays > 6) return
      const key = toDateKey(date)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return days.map((day) => ({
      ...day,
      count: counts.get(day.key) ?? 0,
    }))
  }, [bookings])
  const clientPreview = useMemo(
    () => bookingStats.clientSummaries.slice(0, 3),
    [bookingStats.clientSummaries]
  )
  const nextBookingDate = bookingStats.nextBookingTime
    ? new Date(bookingStats.nextBookingTime)
    : null
  const nextBookingLabel = nextBookingDate
    ? `${formatShortDate(nextBookingDate)} · ${formatShortTime(nextBookingDate)}`
    : 'Пока нет записей'
  const campaignAudience = bookingStats.uniqueClients
  const campaignRepeatRate = campaignAudience
    ? bookingStats.repeatClients / campaignAudience
    : 0
  const campaignMeter = campaignAudience
    ? Math.min(100, Math.max(12, Math.round(campaignRepeatRate * 100)))
    : 0
  const todayBookings = calendarPreview[0]?.count ?? 0
  const showcasePreviewFallback = useMemo<Array<PortfolioItem | null>>(
    () => new Array(4).fill(null),
    []
  )
  const showcaseTiles: Array<PortfolioItem | null> =
    showcasePreview.length > 0 ? showcasePreview : showcasePreviewFallback
  const showcaseMetaLabel =
    showcaseTotal > 0 ? `${showcaseTotal} фото` : 'Добавьте фото'

  return (
    <div className="screen screen--pro screen--pro-cabinet">
      <div className="pro-cabinet-shell pro-cabinet-shell--icons">
        <div className="pro-cabinet-nav-grid">
          <button
            className="pro-cabinet-nav-card is-analytics animate delay-1"
            type="button"
            onClick={onOpenAnalytics}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconDashboard />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">Статистика</span>
                <span className="pro-cabinet-nav-title">Аналитика</span>
                <span className="pro-cabinet-nav-subtitle">
                  {requestStats.total > 0
                    ? `Всего заявок: ${requestStats.total}`
                    : 'Пока нет заявок'}
                </span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview">
              <div className="pro-cabinet-nav-spark" aria-hidden="true">
                {analyticsSpark.map((value, index) => (
                  <span
                    className="pro-cabinet-nav-spark-bar"
                    key={`analytics-spark-${index}`}
                    style={{ '--spark': value } as CSSProperties}
                  />
                ))}
              </div>
              <div className="pro-cabinet-nav-stats">
                <div className="pro-cabinet-nav-stat">
                  <span className="pro-cabinet-nav-stat-value">
                    {requestStats.open}
                  </span>
                  <span className="pro-cabinet-nav-stat-label">Открытые</span>
                </div>
                <div className="pro-cabinet-nav-stat">
                  <span className="pro-cabinet-nav-stat-value">
                    {requestStats.responses}
                  </span>
                  <span className="pro-cabinet-nav-stat-label">Ответы</span>
                </div>
                <div className="pro-cabinet-nav-stat">
                  <span className="pro-cabinet-nav-stat-value">
                    {bookingStats.confirmed}
                  </span>
                  <span className="pro-cabinet-nav-stat-label">Записи</span>
                </div>
              </div>
            </div>
          </button>
          <button
            className="pro-cabinet-nav-card is-calendar animate delay-2"
            type="button"
            onClick={onOpenCalendar}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconCalendar />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">График</span>
                <span className="pro-cabinet-nav-title">Календарь</span>
                <span className="pro-cabinet-nav-subtitle">
                  Ближайшая: {nextBookingLabel}
                </span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview">
              <div className="pro-cabinet-nav-week" aria-hidden="true">
                {calendarPreview.map((day) => (
                  <div
                    className={`pro-cabinet-nav-day${day.isToday ? ' is-today' : ''}`}
                    key={day.key}
                  >
                    <span className="pro-cabinet-nav-day-label">{day.label}</span>
                    <span
                      className={`pro-cabinet-nav-day-dot${
                        day.count > 0 ? ' is-active' : ''
                      }`}
                    />
                  </div>
                ))}
              </div>
              <div className="pro-cabinet-nav-pills">
                <span className="pro-cabinet-nav-pill">
                  На неделе {bookingStats.upcomingWeek}
                </span>
                <span className="pro-cabinet-nav-pill is-ghost">
                  Активных {bookingStats.upcoming}
                </span>
              </div>
            </div>
          </button>
          <button
            className="pro-cabinet-nav-card is-clients animate delay-3"
            type="button"
            onClick={onOpenClients}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconUsers />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">База</span>
                <span className="pro-cabinet-nav-title">Клиенты</span>
                <span className="pro-cabinet-nav-subtitle">
                  {bookingStats.uniqueClients > 0
                    ? `Всего: ${bookingStats.uniqueClients}`
                    : 'Пока нет клиентов'}
                </span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview">
              <div className="pro-cabinet-nav-avatars" aria-hidden="true">
                {(clientPreview.length > 0
                  ? clientPreview
                  : [null, null, null]
                ).map((client, index) => (
                  <span
                    className={`pro-cabinet-nav-avatar${
                      client ? '' : ' is-ghost'
                    }`}
                    key={`client-preview-${client?.id ?? index}`}
                  >
                    {client ? getInitials(client.name) : '•'}
                  </span>
                ))}
              </div>
              <div className="pro-cabinet-nav-pills">
                <span className="pro-cabinet-nav-pill">
                  Повторных {bookingStats.repeatClients}
                </span>
                <span className="pro-cabinet-nav-pill is-ghost">
                  Визитов {bookingStats.total}
                </span>
              </div>
            </div>
          </button>
          <button
            className="pro-cabinet-nav-card is-showcase animate delay-4"
            type="button"
            onClick={onOpenShowcase}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconShowcase />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">Портфолио</span>
                <span className="pro-cabinet-nav-title">Витрина</span>
                <span className="pro-cabinet-nav-subtitle">
                  Добавьте новые работы
                </span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview">
              <div className="pro-cabinet-nav-mosaic" aria-hidden="true">
                {showcaseTiles.map((item, index) => {
                  const slotClass =
                    showcaseSlotClasses[index % showcaseSlotClasses.length]
                  const isImage = item ? isImageUrl(item.url) : false
                  const focus = item ? resolvePortfolioFocus(item) : null
                  return (
                    <span
                      className={`pro-cabinet-nav-mosaic-tile ${slotClass}${
                        item ? ' is-media' : ''
                      }`}
                      key={`showcase-preview-${item?.url ?? index}`}
                    >
                      {item ? (
                        isImage ? (
                          <img
                            src={item.url}
                            alt=""
                            loading="lazy"
                            style={{ objectPosition: focus?.position }}
                          />
                        ) : (
                          <span className="pro-cabinet-nav-mosaic-fallback">
                            LINK
                          </span>
                        )
                      ) : (
                        <span className="pro-cabinet-nav-mosaic-fallback">+</span>
                      )}
                    </span>
                  )
                })}
              </div>
              <p className="pro-cabinet-nav-meta">
                {showcaseMetaLabel} · обновляйте витрину
              </p>
            </div>
          </button>
          <button
            className="pro-cabinet-nav-card is-campaigns animate delay-5"
            type="button"
            onClick={onOpenCampaigns}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconChat />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">Продажи</span>
                <span className="pro-cabinet-nav-title">Рассылка</span>
                <span className="pro-cabinet-nav-subtitle">
                  {campaignAudience > 0
                    ? `Аудитория: ${campaignAudience}`
                    : 'Пока нет аудитории'}
                </span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview">
              <div className="pro-cabinet-nav-meter" aria-hidden="true">
                <span
                  className="pro-cabinet-nav-meter-fill"
                  style={{ '--meter': campaignMeter } as CSSProperties}
                />
              </div>
              <div className="pro-cabinet-nav-stats">
                <div className="pro-cabinet-nav-stat">
                  <span className="pro-cabinet-nav-stat-value">
                    {bookingStats.uniqueClients}
                  </span>
                  <span className="pro-cabinet-nav-stat-label">Контакты</span>
                </div>
                <div className="pro-cabinet-nav-stat">
                  <span className="pro-cabinet-nav-stat-value">
                    {bookingStats.repeatClients}
                  </span>
                  <span className="pro-cabinet-nav-stat-label">Лояльные</span>
                </div>
              </div>
            </div>
          </button>
          <button
            className="pro-cabinet-nav-card is-reminders animate delay-6"
            type="button"
            onClick={onOpenReminders}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconBell />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">Сервис</span>
                <span className="pro-cabinet-nav-title">Напоминания</span>
                <span className="pro-cabinet-nav-subtitle">
                  Следующее: {nextBookingLabel}
                </span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview">
              <div className="pro-cabinet-nav-pills">
                <span className="pro-cabinet-nav-pill">
                  Сегодня {todayBookings}
                </span>
                <span className="pro-cabinet-nav-pill is-ghost">
                  На неделе {bookingStats.upcomingWeek}
                </span>
              </div>
              <p className="pro-cabinet-nav-meta">
                Открытых заявок: {requestStats.open}
              </p>
            </div>
          </button>
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
