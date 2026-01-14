import { ProBottomNav } from '../components/ProBottomNav'
import {
  IconBell,
  IconChat,
  IconDashboard,
  IconUsers,
} from '../components/icons'
import type { ProProfileSection } from '../types/app'
import { useProCabinetData } from '../hooks/useProCabinetData'

type ProCabinetScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onEditProfile: (section?: ProProfileSection) => void
  onViewRequests: () => void
  onViewChats: () => void
  onOpenAnalytics: () => void
  onOpenClients: () => void
  onOpenCampaigns: () => void
  onOpenReminders: () => void
}

const formatShortDate = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(value)

const formatTime = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)

export const ProCabinetScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onEditProfile,
  onViewRequests,
  onViewChats,
  onOpenAnalytics,
  onOpenClients,
  onOpenCampaigns,
  onOpenReminders,
}: ProCabinetScreenProps) => {
  const { requestStats, bookingStats, lastUpdated, isLoading, combinedError } =
    useProCabinetData(apiBase, userId)
  const displayName = displayNameFallback.trim()
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
  const recentClientsLabel =
    bookingStats.recentClients.length > 0
      ? bookingStats.recentClients.join(', ')
      : 'Пока нет клиентов'

  return (
    <div className="screen screen--pro screen--pro-cabinet">
      <div className="pro-cabinet-shell pro-cabinet-shell--dashboard">
        <header className="pro-cabinet-dashboard-head animate">
          <div>
            <p className="pro-cabinet-dashboard-kicker">Кабинет</p>
            <h1 className="pro-cabinet-dashboard-title">
              {displayName ? `Здравствуйте, ${displayName}` : 'Панель мастера'}
            </h1>
            <p className="pro-cabinet-dashboard-subtitle">
              {bookingStats.upcoming > 0
                ? `Ближайших записей: ${bookingStats.upcoming}`
                : 'Пока нет ближайших записей.'}
            </p>
            {lastUpdatedLabel && !combinedError && (
              <p className="pro-cabinet-dashboard-meta">{lastUpdatedLabel}</p>
            )}
          </div>
          <button
            className="pro-cabinet-dashboard-profile"
            type="button"
            onClick={() => onEditProfile()}
          >
            Профиль
          </button>
        </header>

        {isLoading && (
          <p className="pro-cabinet-dashboard-status" role="status">
            Синхронизируем данные...
          </p>
        )}
        {combinedError && (
          <p className="pro-cabinet-dashboard-status is-error" role="alert">
            {combinedError}
          </p>
        )}

        <div className="pro-cabinet-nav-grid">
          <button
            className="pro-cabinet-nav-card is-analytics animate delay-1"
            type="button"
            onClick={onOpenAnalytics}
            aria-label="Открыть аналитику"
          >
            <span className="pro-cabinet-nav-icon" aria-hidden="true">
              <IconDashboard />
            </span>
            <span className="pro-cabinet-nav-kicker">Аналитика</span>
            <span className="pro-cabinet-nav-title">Статистика</span>
            <span className="pro-cabinet-nav-subtitle">
              Сводка по заявкам и записям.
            </span>
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
          </button>

          <button
            className="pro-cabinet-nav-card is-clients animate delay-2"
            type="button"
            onClick={onOpenClients}
            aria-label="Открыть клиентскую базу"
          >
            <span className="pro-cabinet-nav-icon" aria-hidden="true">
              <IconUsers />
            </span>
            <span className="pro-cabinet-nav-kicker">Клиенты</span>
            <span className="pro-cabinet-nav-title">Клиентская база</span>
            <span className="pro-cabinet-nav-subtitle">
              {bookingStats.uniqueClients > 0
                ? `Уникальных клиентов: ${bookingStats.uniqueClients}`
                : 'Клиенты появятся после первых записей.'}
            </span>
            <span className="pro-cabinet-nav-meta">{recentClientsLabel}</span>
            <div className="pro-cabinet-nav-pills">
              <span className="pro-cabinet-nav-pill">
                Повторных: {bookingStats.repeatClients}
              </span>
              <span className="pro-cabinet-nav-pill is-ghost">
                Активных: {bookingStats.upcoming}
              </span>
            </div>
          </button>

          <button
            className="pro-cabinet-nav-card is-campaigns animate delay-3"
            type="button"
            onClick={onOpenCampaigns}
            aria-label="Открыть рассылки"
          >
            <span className="pro-cabinet-nav-icon" aria-hidden="true">
              <IconChat />
            </span>
            <span className="pro-cabinet-nav-kicker">Рассылка</span>
            <span className="pro-cabinet-nav-title">Коммуникации</span>
            <span className="pro-cabinet-nav-subtitle">
              Сообщите о свободных окнах всем клиентам сразу.
            </span>
            <div className="pro-cabinet-nav-pills">
              <span className="pro-cabinet-nav-pill">
                Аудитория: {bookingStats.uniqueClients}
              </span>
              <span className="pro-cabinet-nav-pill is-ghost">
                Откликов: {requestStats.responses}
              </span>
            </div>
          </button>

          <button
            className="pro-cabinet-nav-card is-reminders animate delay-4"
            type="button"
            onClick={onOpenReminders}
            aria-label="Открыть напоминания"
          >
            <span className="pro-cabinet-nav-icon" aria-hidden="true">
              <IconBell />
            </span>
            <span className="pro-cabinet-nav-kicker">Напоминания</span>
            <span className="pro-cabinet-nav-title">Возврат клиентов</span>
            <span className="pro-cabinet-nav-subtitle">
              Автоматизируйте повторные визиты.
            </span>
            <span className="pro-cabinet-nav-meta">Следующая: {nextBookingLabel}</span>
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
