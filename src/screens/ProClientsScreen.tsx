import { ProBottomNav } from '../components/ProBottomNav'
import { useProCabinetData } from '../hooks/useProCabinetData'

type ProClientsScreenProps = {
  apiBase: string
  userId: string
  onBack: () => void
  onViewRequests: () => void
  onViewChats: () => void
  onEditProfile: () => void
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

const formatDate = (value?: number | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
  }).format(date)
}

export const ProClientsScreen = ({
  apiBase,
  userId,
  onBack,
  onViewRequests,
  onViewChats,
  onEditProfile,
}: ProClientsScreenProps) => {
  const { bookingStats, lastUpdated, isLoading, combinedError } =
    useProCabinetData(apiBase, userId)
  const lastUpdatedLabel = lastUpdated
    ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''
  const hasClients = bookingStats.clientSummaries.length > 0

  return (
    <div className="screen screen--pro screen--pro-detail screen--pro-clients">
      <div className="pro-detail-shell">
        <header className="pro-detail-header">
          <button className="pro-back" type="button" onClick={onBack}>
            ←
          </button>
          <div className="pro-detail-title">
            <p className="pro-detail-kicker">Клиенты</p>
            <h1 className="pro-detail-heading">Клиентская база</h1>
            <p className="pro-detail-subtitle">
              Отслеживайте повторные визиты и активных клиентов.
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
            <h2>Сводка</h2>
            <span className="pro-detail-pill">
              Активных: {bookingStats.upcoming}
            </span>
          </div>
          <div className="pro-detail-metric-grid">
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Уникальных</span>
              <span className="pro-detail-metric-value">
                {bookingStats.uniqueClients}
              </span>
              <span className="pro-detail-metric-meta">Всего клиентов</span>
            </div>
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Повторных</span>
              <span className="pro-detail-metric-value">
                {bookingStats.repeatClients}
              </span>
              <span className="pro-detail-metric-meta">Лояльные клиенты</span>
            </div>
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Записей</span>
              <span className="pro-detail-metric-value">{bookingStats.total}</span>
              <span className="pro-detail-metric-meta">История визитов</span>
            </div>
          </div>
        </section>

        <section className="pro-detail-card animate delay-2">
          <div className="pro-detail-card-head">
            <h2>Последние клиенты</h2>
            <span className="pro-detail-pill is-ghost">
              {hasClients ? 'Топ контактов' : 'Пока пусто'}
            </span>
          </div>
          {!hasClients ? (
            <p className="pro-detail-empty">
              Клиенты появятся после первых подтвержденных записей.
            </p>
          ) : (
            <div className="pro-detail-list">
              {bookingStats.clientSummaries.slice(0, 6).map((client) => (
                <div className="pro-detail-list-item" key={client.id}>
                  <div className="pro-detail-avatar" aria-hidden="true">
                    {getInitials(client.name)}
                  </div>
                  <div className="pro-detail-list-body">
                    <span className="pro-detail-list-title">{client.name}</span>
                    <span className="pro-detail-list-subtitle">
                      Визитов: {client.count}
                    </span>
                  </div>
                  <span className="pro-detail-list-meta">
                    {formatDate(client.lastSeenTime)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="pro-detail-actions animate delay-3">
          <button className="pro-detail-action" type="button" onClick={onViewChats}>
            Перейти к чатам
          </button>
          <button className="pro-detail-action is-ghost" type="button" onClick={onViewRequests}>
            Управлять заявками
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
