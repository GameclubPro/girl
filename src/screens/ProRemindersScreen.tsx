import { useMemo } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { useProCabinetData } from '../hooks/useProCabinetData'
import { useShareActions } from '../hooks/useShareActions'
import { buildBookingStartParam } from '../utils/deeplink'
import { buildShareLink } from '../utils/telegramShare'

type ProRemindersScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onBack: () => void
  onViewRequests: () => void
  onViewChats: () => void
  onEditProfile: () => void
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

export const ProRemindersScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onBack,
  onViewRequests,
  onViewChats,
  onEditProfile,
}: ProRemindersScreenProps) => {
  const { bookingStats, lastUpdated, isLoading, combinedError } =
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
  const reminderText = `Напоминаю о записи ${masterLabel}. Выберите удобное время:`
  const nextBookingLabel = bookingStats.nextBookingTime
    ? `${formatShortDate(new Date(bookingStats.nextBookingTime))} · ${formatTime(
        new Date(bookingStats.nextBookingTime)
      )}`
    : 'Пока нет записей'
  const lastBookingLabel = bookingStats.lastCreatedTime
    ? formatLongDate(new Date(bookingStats.lastCreatedTime))
    : 'Пока нет записей'
  const lastUpdatedLabel = lastUpdated
    ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''

  return (
    <div className="screen screen--pro screen--pro-detail screen--pro-reminders">
      <div className="pro-detail-shell">
        <header className="pro-detail-header">
          <button className="pro-back" type="button" onClick={onBack}>
            ←
          </button>
          <div className="pro-detail-title">
            <p className="pro-detail-kicker">Напоминания</p>
            <h1 className="pro-detail-heading">Возврат клиентов</h1>
            <p className="pro-detail-subtitle">
              Автоматизируйте повторные визиты и удерживайте клиентов.
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
            Добавьте VITE_TG_APP_URL, чтобы отправлять напоминания клиентам.
          </p>
        )}

        <section className="pro-detail-card animate delay-1">
          <div className="pro-detail-card-head">
            <h2>Повторный визит</h2>
            <span className="pro-detail-pill">Следующая: {nextBookingLabel}</span>
          </div>
          <p className="pro-detail-text">{reminderText}</p>
          <div className="pro-detail-chip-row">
            <span className="pro-detail-chip">Последняя запись: {lastBookingLabel}</span>
            <span className="pro-detail-chip is-ghost">
              Активных: {bookingStats.upcoming}
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
              onClick={() => openShare(reminderText)}
              disabled={!shareLink || !shareConfigured}
            >
              Напомнить в Telegram
            </button>
            <button
              className="pro-detail-action is-ghost"
              type="button"
              onClick={() => void copyShare(reminderText)}
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
