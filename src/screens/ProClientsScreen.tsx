import { ProBottomNav } from '../components/ProBottomNav'
import { useProCabinetData, type ClientSummary } from '../hooks/useProCabinetData'

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
  const topClients = bookingStats.clientSummaries.slice(0, 4)
  const topClient = topClients[0]
  const repeatRate =
    bookingStats.uniqueClients > 0
      ? bookingStats.repeatClients / bookingStats.uniqueClients
      : 0
  const repeatRatePercent = Math.round(repeatRate * 100)
  const repeatRateFill =
    repeatRatePercent > 0 ? Math.max(8, repeatRatePercent) : 0
  const avgVisits =
    bookingStats.uniqueClients > 0
      ? bookingStats.total / bookingStats.uniqueClients
      : 0
  const avgVisitsLabel = avgVisits > 0
    ? avgVisits.toFixed(avgVisits < 10 ? 1 : 0)
    : '0'
  const lastVisitLabel = topClient?.lastSeenTime
    ? formatDate(topClient.lastSeenTime)
    : '—'
  const newClients = Math.max(
    bookingStats.uniqueClients - bookingStats.repeatClients,
    0
  )
  const previewSubtitle = hasClients
    ? `${newClients} новых · ${bookingStats.repeatClients} лояльных`
    : 'Первые клиенты появятся после подтвержденных записей.'
  const previewClients = (
    topClients.length > 0 ? topClients : new Array(4).fill(null)
  ) as Array<ClientSummary | null>

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

        <section className="pro-detail-card pro-clients-preview animate delay-1">
          <div className="pro-clients-preview-head">
            <div className="pro-clients-preview-title">
              <p className="pro-clients-preview-kicker">Превью</p>
              <h2 className="pro-clients-preview-heading">Активность базы</h2>
              <p className="pro-clients-preview-subtitle">{previewSubtitle}</p>
            </div>
            <span className="pro-clients-preview-pill">
              {repeatRatePercent}% повторных
            </span>
          </div>
          <div className="pro-clients-preview-body">
            <div className="pro-clients-preview-avatars" aria-hidden="true">
              {previewClients.map((client, index) => (
                <span
                  className={`pro-clients-preview-avatar${
                    client ? '' : ' is-ghost'
                  }`}
                  key={`client-preview-${client?.id ?? index}`}
                >
                  {client ? getInitials(client.name) : '•'}
                </span>
              ))}
            </div>
            <div className="pro-clients-preview-stats">
              <div className="pro-clients-preview-stat">
                <span className="pro-clients-preview-stat-label">
                  Средний визит
                </span>
                <span className="pro-clients-preview-stat-value">
                  {avgVisitsLabel}x
                </span>
              </div>
              <div className="pro-clients-preview-stat">
                <span className="pro-clients-preview-stat-label">
                  Последний визит
                </span>
                <span className="pro-clients-preview-stat-value">
                  {lastVisitLabel}
                </span>
              </div>
            </div>
          </div>
          <div className="pro-clients-preview-foot">
            <span className="pro-clients-preview-note">
              {topClient ? `Топ: ${topClient.name}` : 'Пока нет активных клиентов'}
            </span>
            <div className="pro-clients-preview-bar" aria-hidden="true">
              <span style={{ width: `${repeatRateFill}%` }} />
            </div>
          </div>
        </section>

        <section className="pro-detail-card animate delay-2">
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

        <section className="pro-detail-card animate delay-3">
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

        <section className="pro-detail-actions animate delay-4">
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
