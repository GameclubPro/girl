import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import {
  IconCalendar,
  IconChat,
  IconChevronRight,
  IconDashboard,
  IconShowcase,
  IconStories,
  IconUsers,
} from '../components/icons'
import { useProCabinetData, type ClientSummary } from '../hooks/useProCabinetData'
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

const formatVisits = (value: number) =>
  `${value} ${formatCountLabel(value, 'визит', 'визита', 'визитов')}`

const formatRelativeDay = (value: Date) => {
  if (Number.isNaN(value.getTime())) return 'без даты'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(value)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / DAY_MS)
  if (diffDays === 0) return 'сегодня'
  if (diffDays === -1) return 'вчера'
  return formatShortDate(value)
}

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

const formatClientMeta = (client: ClientSummary) => {
  const visits = formatVisits(client.count)
  if (!client.lastSeenTime) return `без даты · ${visits}`
  return `${formatRelativeDay(new Date(client.lastSeenTime))} · ${visits}`
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
  onOpenCalendar: () => void
  onOpenShowcase: () => void
  onOpenStories: () => void
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
  onOpenCalendar,
  onOpenShowcase,
  onOpenStories,
}: ProCabinetScreenProps) => {
  const { requestStats, bookingStats, bookings } = useProCabinetData(
    apiBase,
    userId
  )
  const [showcasePreview, setShowcasePreview] = useState<PortfolioItem[]>([])
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
  const [profileDisplayName, setProfileDisplayName] = useState('')

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
          2
        )
        setShowcasePreview(previewItems)
        setProfileAvatarUrl(data.avatarUrl ?? null)
        setProfileDisplayName(data.displayName ?? '')
      } catch (error) {
        if (!cancelled) {
          setShowcasePreview([])
          setProfileAvatarUrl(null)
          setProfileDisplayName('')
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
  const clientHighlights = useMemo(
    () => bookingStats.clientSummaries.slice(0, 2),
    [bookingStats.clientSummaries]
  )
  const clientRows = clientHighlights.length > 0 ? clientHighlights : [null, null]
  const totalClients = bookingStats.uniqueClients
  const repeatClients = bookingStats.repeatClients
  const newClients = Math.max(0, totalClients - repeatClients)
  const repeatShare = totalClients
    ? Math.max(0, Math.min(100, Math.round((repeatClients / totalClients) * 100)))
    : 0
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
  const showcaseTiles: Array<PortfolioItem | null> =
    showcasePreview.length > 0 ? showcasePreview : [null]
  const profileInitials = useMemo(
    () => getInitials(profileDisplayName || 'Мастер'),
    [profileDisplayName]
  )
  const openAction = (
    <span className="pro-cabinet-nav-action" aria-hidden="true">
      <span className="pro-cabinet-nav-action-label">Открыть</span>
      <IconChevronRight />
    </span>
  )

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
              {openAction}
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
              {openAction}
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
              {openAction}
            </div>
            <div className="pro-cabinet-nav-preview is-clients-preview">
              <div className="pro-cabinet-nav-client-list">
                {clientRows.map((client, index) => {
                  const isGhost = !client
                  const name = client?.name ?? 'Первые клиенты'
                  const meta = client
                    ? formatClientMeta(client)
                    : 'Появятся после записи'
                  const isRepeat = client ? client.count > 1 : false
                  const badge = client ? (isRepeat ? 'повторный' : 'новый') : null
                  return (
                    <div
                      className={`pro-cabinet-nav-client-row${
                        isGhost ? ' is-ghost' : ''
                      }`}
                      key={`client-row-${client?.id ?? index}`}
                    >
                      <span className="pro-cabinet-nav-client-avatar" aria-hidden="true">
                        {client ? getInitials(client.name) : '•'}
                      </span>
                      <div className="pro-cabinet-nav-client-text">
                        <span className="pro-cabinet-nav-client-name">{name}</span>
                        <span className="pro-cabinet-nav-client-meta-text">
                          {meta}
                        </span>
                      </div>
                      {badge ? (
                        <span
                          className={`pro-cabinet-nav-client-badge${
                            isRepeat ? ' is-repeat' : ' is-new'
                          }`}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              <div className="pro-cabinet-nav-client-foot">
                <div
                  className={`pro-cabinet-nav-client-meter${
                    totalClients > 0 ? '' : ' is-empty'
                  }`}
                  style={{ '--repeat-share': repeatShare } as CSSProperties}
                  aria-hidden="true"
                />
                <div className="pro-cabinet-nav-client-meta">
                  <span>Повторные {repeatClients}</span>
                  <span className="is-muted">Новые {newClients}</span>
                </div>
              </div>
            </div>
          </button>
          <button
            className="pro-cabinet-nav-card is-campaigns animate delay-4"
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
              {openAction}
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
            className="pro-cabinet-nav-card is-stories animate delay-5"
            type="button"
            onClick={onOpenStories}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconStories />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">Контент</span>
                <span className="pro-cabinet-nav-title">Истории</span>
                <span className="pro-cabinet-nav-subtitle">
                  24 часа на показ
                </span>
              </div>
              {openAction}
            </div>
            <div className="pro-cabinet-nav-preview">
              <div className="pro-cabinet-nav-stories">
                <span className="pro-cabinet-nav-stories-badge">NEW</span>
                <span className="pro-cabinet-nav-story-ring" aria-hidden="true">
                  <span className="pro-cabinet-nav-story-avatar">
                    {profileAvatarUrl ? (
                      <img src={profileAvatarUrl} alt="" loading="lazy" />
                    ) : (
                      <span>{profileInitials}</span>
                    )}
                  </span>
                </span>
              </div>
            </div>
          </button>
          <button
            className="pro-cabinet-nav-card is-showcase animate delay-6"
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
              {openAction}
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
