import { ProBottomNav } from '../components/ProBottomNav'
import { useProCabinetData } from '../hooks/useProCabinetData'

type ProAnalyticsScreenProps = {
  apiBase: string
  userId: string
  onBack: () => void
  onViewRequests: () => void
  onViewChats: () => void
  onEditProfile: () => void
}

export const ProAnalyticsScreen = ({
  apiBase,
  userId,
  onBack,
  onViewRequests,
  onViewChats,
  onEditProfile,
}: ProAnalyticsScreenProps) => {
  const { requestStats, bookingStats, lastUpdated, isLoading, combinedError } =
    useProCabinetData(apiBase, userId)
  const lastUpdatedLabel = lastUpdated
    ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''

  return (
    <div className="screen screen--pro screen--pro-detail screen--pro-analytics">
      <div className="pro-detail-shell">
        <header className="pro-detail-header">
          <button className="pro-back" type="button" onClick={onBack}>
            ←
          </button>
          <div className="pro-detail-title">
            <p className="pro-detail-kicker">Аналитика</p>
            <h1 className="pro-detail-heading">Статистика</h1>
            <p className="pro-detail-subtitle">
              Все ключевые метрики по заявкам и записям в одном экране.
            </p>
          </div>
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
        {lastUpdatedLabel && !combinedError && (
          <p className="pro-detail-meta">{lastUpdatedLabel}</p>
        )}

        <section className="pro-detail-card animate delay-1">
          <div className="pro-detail-card-head">
            <h2>Заявки</h2>
            <span className="pro-detail-pill">Ответов: {requestStats.responses}</span>
          </div>
          <div className="pro-detail-metric-grid">
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Открытые</span>
              <span className="pro-detail-metric-value">{requestStats.open}</span>
              <span className="pro-detail-metric-meta">
                Всего: {requestStats.total}
              </span>
            </div>
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Закрытые</span>
              <span className="pro-detail-metric-value">{requestStats.closed}</span>
              <span className="pro-detail-metric-meta">За все время</span>
            </div>
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Ответы</span>
              <span className="pro-detail-metric-value">{requestStats.responses}</span>
              <span className="pro-detail-metric-meta">Всего откликов</span>
            </div>
          </div>
        </section>

        <section className="pro-detail-card animate delay-2">
          <div className="pro-detail-card-head">
            <h2>Записи</h2>
            <span className="pro-detail-pill">Активных: {bookingStats.upcoming}</span>
          </div>
          <div className="pro-detail-metric-grid">
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Подтверждено</span>
              <span className="pro-detail-metric-value">
                {bookingStats.confirmed}
              </span>
              <span className="pro-detail-metric-meta">Успешных записей</span>
            </div>
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">В ожидании</span>
              <span className="pro-detail-metric-value">{bookingStats.pending}</span>
              <span className="pro-detail-metric-meta">Требуют действия</span>
            </div>
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Отменено</span>
              <span className="pro-detail-metric-value">
                {bookingStats.cancelled}
              </span>
              <span className="pro-detail-metric-meta">Архивные</span>
            </div>
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">7 дней</span>
              <span className="pro-detail-metric-value">
                {bookingStats.upcomingWeek}
              </span>
              <span className="pro-detail-metric-meta">Скоро в работе</span>
            </div>
          </div>
        </section>

        <section className="pro-detail-actions animate delay-3">
          <button className="pro-detail-action" type="button" onClick={onViewRequests}>
            Перейти к заявкам
          </button>
          <button className="pro-detail-action is-ghost" type="button" onClick={onViewChats}>
            Открыть чаты
          </button>
        </section>
      </div>

      <ProBottomNav
        active="cabinet"
        onCabinet={onBack}
        onRequests={onViewRequests}
        onChats={onViewChats}
        onProfile={onEditProfile}
        allowActiveClick
      />
    </div>
  )
}
