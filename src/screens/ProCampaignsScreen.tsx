import { useMemo } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { useProCabinetData } from '../hooks/useProCabinetData'
import { useShareActions } from '../hooks/useShareActions'
import { buildBookingStartParam } from '../utils/deeplink'
import { buildShareLink } from '../utils/telegramShare'

type ProCampaignsScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onBack: () => void
  onViewRequests: () => void
  onViewChats: () => void
  onEditProfile: () => void
}

export const ProCampaignsScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onBack,
  onViewRequests,
  onViewChats,
  onEditProfile,
}: ProCampaignsScreenProps) => {
  const { bookingStats, requestStats, lastUpdated, isLoading, combinedError } =
    useProCabinetData(apiBase, userId)
  const shareBase = (import.meta.env.VITE_TG_APP_URL ?? '').trim()
  const shareConfigured = Boolean(shareBase)
  const bookingStartParam = useMemo(() => buildBookingStartParam(userId), [userId])
  const shareLink = useMemo(
    () => (shareBase ? buildShareLink(shareBase, bookingStartParam) : ''),
    [bookingStartParam, shareBase]
  )
  const { status, openShare, copyShare } = useShareActions({
    shareLink,
    shareConfigured,
  })
  const displayName = displayNameFallback.trim()
  const masterLabel = displayName ? `у мастера ${displayName}` : 'у мастера'
  const broadcastText = `Открылись новые окна для записи ${masterLabel}. Выберите удобное время:`
  const lastUpdatedLabel = lastUpdated
    ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''

  return (
    <div className="screen screen--pro screen--pro-detail screen--pro-campaigns">
      <div className="pro-detail-shell">
        <header className="pro-detail-header">
          <button className="pro-back" type="button" onClick={onBack}>
            ←
          </button>
          <div className="pro-detail-title">
            <p className="pro-detail-kicker">Рассылка</p>
            <h1 className="pro-detail-heading">Коммуникации</h1>
            <p className="pro-detail-subtitle">
              Готовые шаблоны для оповещения клиентов в одно касание.
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

        {!shareConfigured && (
          <p className="pro-detail-warning">
            Добавьте VITE_TG_APP_URL, чтобы отправлять рассылки прямо из кабинета.
          </p>
        )}

        <section className="pro-detail-card animate delay-1">
          <div className="pro-detail-card-head">
            <h2>Кампания</h2>
            <span className="pro-detail-pill">
              Аудитория: {bookingStats.uniqueClients}
            </span>
          </div>
          <p className="pro-detail-text">{broadcastText}</p>
          <div className="pro-detail-chip-row">
            <span className="pro-detail-chip">
              Откликов: {requestStats.responses}
            </span>
            <span className="pro-detail-chip is-ghost">
              Повторных: {bookingStats.repeatClients}
            </span>
          </div>
          {shareLink && (
            <div className="pro-detail-link">
              <span className="pro-detail-link-label">Ссылка для записи</span>
              <span className="pro-detail-link-value">{shareLink}</span>
            </div>
          )}
          <div className="pro-detail-actions">
            <button
              className="pro-detail-action"
              type="button"
              onClick={() => openShare(broadcastText)}
              disabled={!shareLink || !shareConfigured}
            >
              Отправить в Telegram
            </button>
            <button
              className="pro-detail-action is-ghost"
              type="button"
              onClick={() => void copyShare(broadcastText)}
              disabled={!shareLink}
            >
              Скопировать текст
            </button>
          </div>
          {status && (
            <p className="pro-detail-status" role="status">
              {status}
            </p>
          )}
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
