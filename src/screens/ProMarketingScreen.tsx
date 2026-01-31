import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { useProCabinetData } from '../hooks/useProCabinetData'
import { useShareActions } from '../hooks/useShareActions'
import { buildBookingStartParam } from '../utils/deeplink'
import { buildShareLink } from '../utils/telegramShare'

const DAY_MS = 24 * 60 * 60 * 1000
const HISTORY_LIMIT = 12
const DISCOUNT_OPTIONS = [5, 10, 15]
const PACKAGE_OPTIONS = [3, 5]

const formatShortDateTime = (value: number) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const buildHistoryKey = (userId: string) => `pro-marketing-history:${userId}`

type MarketingHistoryItem = {
  id: string
  title: string
  channel: 'telegram' | 'copy'
  createdAt: number
}

type Scenario = {
  id: string
  title: string
  description: string
  pill: string
  text: string
  copyText?: string
  showLink?: boolean
  isPromo?: boolean
  isPackage?: boolean
  isShare?: boolean
}

const readHistory = (key: string) => {
  if (typeof window === 'undefined') return [] as MarketingHistoryItem[]
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.channel === 'string' &&
        typeof item.createdAt === 'number'
      )
      .slice(0, HISTORY_LIMIT)
  } catch (error) {
    return []
  }
}

const writeHistory = (key: string, items: MarketingHistoryItem[]) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(items))
  } catch (error) {
    // ignore storage errors
  }
}

type ProMarketingScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onBack: () => void
  onViewRequests: () => void
  onViewChats: () => void
  onEditProfile: () => void
  onOpenCampaigns: () => void
  onOpenReminders: () => void
}

export const ProMarketingScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onBack,
  onViewRequests,
  onViewChats,
  onEditProfile,
  onOpenCampaigns,
  onOpenReminders,
}: ProMarketingScreenProps) => {
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
  const [discountPercent, setDiscountPercent] = useState(10)
  const [packageVisits, setPackageVisits] = useState(3)
  const historyKey = useMemo(() => buildHistoryKey(userId), [userId])
  const [history, setHistory] = useState<MarketingHistoryItem[]>(() =>
    readHistory(historyKey)
  )
  useEffect(() => {
    setHistory(readHistory(historyKey))
  }, [historyKey])
  const displayName = displayNameFallback.trim()
  const masterLabel = displayName ? `у мастера ${displayName}` : 'у мастера'
  const inactiveClients = useMemo(() => {
    const now = Date.now()
    return bookingStats.clientSummaries.filter((client) => {
      if (!client.lastSeenTime) return false
      return now - client.lastSeenTime >= 30 * DAY_MS
    }).length
  }, [bookingStats.clientSummaries])
  const repeatRate = bookingStats.uniqueClients
    ? bookingStats.repeatClients / bookingStats.uniqueClients
    : 0
  const recommendation = useMemo(() => {
    if (!bookingStats.uniqueClients) {
      return { id: 'share', note: 'Сначала соберите базу клиентов.' }
    }
    if (bookingStats.upcomingWeek < 3) {
      return { id: 'fill-week', note: 'На неделю меньше 3 записей.' }
    }
    if (inactiveClients >= Math.max(2, Math.ceil(bookingStats.uniqueClients * 0.3))) {
      return { id: 'win-back', note: 'Много клиентов давно не были у вас.' }
    }
    if (repeatRate < 0.4) {
      return { id: 'package', note: 'Нужно стимулировать повторные визиты.' }
    }
    return { id: 'promo-week', note: 'Поддержите спрос мягкой акцией.' }
  }, [bookingStats.uniqueClients, bookingStats.upcomingWeek, inactiveClients, repeatRate])

  const scenarios: Scenario[] = useMemo(() => {
    const fillWeekText = `Открылись новые окна для записи ${masterLabel}. Если удобно, выберите время по ссылке.`
    const winBackText = `Давно не виделись ${masterLabel}. Есть новые окна, если удобно, выберите время по ссылке.`
    const promoText = `На этой неделе действует спец-условие: -${discountPercent}% на ближайшие окна ${masterLabel}. Если интересно, выберите время по ссылке.`
    const packageText = `Пакет ${packageVisits} визитов выгоднее разовых ${masterLabel}. Если интересно, выберите время по ссылке.`
    const shareText = `Запись ${masterLabel}. Свободные окна и условия доступны по ссылке.`

    return [
      {
        id: 'fill-week',
        title: 'Заполнить окна недели',
        description: 'Мягкое сообщение о свободных слотах на ближайшие 7 дней.',
        pill: `На неделе: ${bookingStats.upcomingWeek}`,
        text: fillWeekText,
      },
      {
        id: 'win-back',
        title: 'Вернуть клиентов 30+ дней',
        description: 'Напоминание для тех, кто давно не был на приеме.',
        pill: `Спящих: ${inactiveClients}`,
        text: winBackText,
      },
      {
        id: 'promo-week',
        title: 'Акция недели',
        description: 'Аккуратное промо для ближайших окон без агрессивных скидок.',
        pill: `Скидка ${discountPercent}%`,
        text: promoText,
        isPromo: true,
      },
      {
        id: 'package',
        title: `Пакет ${packageVisits} визитов`,
        description: 'Предложение для лояльных клиентов и повторных визитов.',
        pill: `Повторных: ${bookingStats.repeatClients}`,
        text: packageText,
        isPackage: true,
      },
      {
        id: 'share',
        title: 'Поделиться визиткой',
        description: 'Быстрая публикация вашей ссылки для новых клиентов.',
        pill: shareLink ? 'Ссылка готова' : 'Ссылка недоступна',
        text: shareText,
        copyText: '',
        showLink: true,
        isShare: true,
      },
    ]
  }, [
    bookingStats.repeatClients,
    bookingStats.upcomingWeek,
    discountPercent,
    inactiveClients,
    masterLabel,
    packageVisits,
    shareLink,
  ])

  const recommendedScenario =
    scenarios.find((scenario) => scenario.id === recommendation.id) ?? scenarios[0]
  const lastUpdatedLabel = lastUpdated
    ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''

  const recordHistory = useCallback(
    (title: string, channel: MarketingHistoryItem['channel']) => {
      const item: MarketingHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        channel,
        createdAt: Date.now(),
      }
      setHistory((current) => {
        const next = [item, ...current].slice(0, HISTORY_LIMIT)
        writeHistory(historyKey, next)
        return next
      })
    },
    [historyKey]
  )

  const handleShare = useCallback(
    (scenario: Scenario) => {
      openShare(scenario.text)
      if (shareLink && shareConfigured) {
        recordHistory(scenario.title, 'telegram')
      }
    },
    [openShare, recordHistory, shareConfigured, shareLink]
  )

  const handleCopy = useCallback(
    async (scenario: Scenario) => {
      const payload = typeof scenario.copyText === 'string' ? scenario.copyText : scenario.text
      await copyShare(payload)
      if (shareLink) {
        recordHistory(scenario.title, 'copy')
      }
    },
    [copyShare, recordHistory, shareLink]
  )

  const canShare = Boolean(shareLink && shareConfigured)
  const canCopy = Boolean(shareLink)

  return (
    <div className="screen screen--pro screen--pro-detail screen--pro-marketing">
      <div className="pro-detail-shell">
        <header className="pro-detail-header">
          <button className="pro-back" type="button" onClick={onBack}>
            ←
          </button>
          <div className="pro-detail-title">
            <p className="pro-detail-kicker">Маркетинг</p>
            <h1 className="pro-detail-heading">Рост и возвращение</h1>
            <p className="pro-detail-subtitle">
              Сценарии, акции и готовые тексты для возвращения клиентов.
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
            Добавьте VITE_TG_APP_URL, чтобы отправлять сценарии прямо из кабинета.
          </p>
        )}

        <section className="pro-detail-card animate delay-1">
          <div className="pro-detail-card-head">
            <h2>Состояние роста</h2>
            <span className="pro-detail-pill is-ghost">
              Аудитория: {bookingStats.uniqueClients}
            </span>
          </div>
          <div className="pro-detail-metric-grid">
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Повторные</span>
              <span className="pro-detail-metric-value">{bookingStats.repeatClients}</span>
              <span className="pro-detail-metric-meta">
                Доля: {Math.round(repeatRate * 100) || 0}%
              </span>
            </div>
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Окна недели</span>
              <span className="pro-detail-metric-value">
                {Math.max(0, bookingStats.upcomingWeek)}
              </span>
              <span className="pro-detail-metric-meta">
                Ответов: {requestStats.responses}
              </span>
            </div>
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Спящие</span>
              <span className="pro-detail-metric-value">{inactiveClients}</span>
              <span className="pro-detail-metric-meta">30+ дней</span>
            </div>
            <div className="pro-detail-metric">
              <span className="pro-detail-metric-label">Активные</span>
              <span className="pro-detail-metric-value">{bookingStats.upcoming}</span>
              <span className="pro-detail-metric-meta">Предстоящие записи</span>
            </div>
          </div>
          <div className="pro-marketing-reco">
            <span className="pro-marketing-reco-label">Рекомендуем</span>
            <span className="pro-marketing-reco-title">{recommendedScenario.title}</span>
            <span className="pro-marketing-reco-meta">{recommendation.note}</span>
          </div>
        </section>

        <p className="pro-marketing-section">Сценарии</p>
        <div className="pro-marketing-stack">
          {scenarios.map((scenario) => (
            <section
              key={scenario.id}
              className={`pro-detail-card pro-marketing-card animate${
                scenario.id === recommendation.id ? ' is-recommended' : ''
              }`}
            >
              <div className="pro-detail-card-head">
                <h2>{scenario.title}</h2>
                <span className="pro-detail-pill">{scenario.pill}</span>
              </div>
              <p className="pro-detail-text">{scenario.description}</p>
              {scenario.isPromo && (
                <div className="pro-marketing-chip-row" role="group" aria-label="Скидка">
                  {DISCOUNT_OPTIONS.map((value) => (
                    <button
                      key={`discount-${value}`}
                      className={`pro-marketing-chip${
                        value === discountPercent ? ' is-active' : ''
                      }`}
                      type="button"
                      onClick={() => setDiscountPercent(value)}
                    >
                      -{value}%
                    </button>
                  ))}
                </div>
              )}
              {scenario.isPackage && (
                <div className="pro-marketing-chip-row" role="group" aria-label="Пакет">
                  {PACKAGE_OPTIONS.map((value) => (
                    <button
                      key={`package-${value}`}
                      className={`pro-marketing-chip${
                        value === packageVisits ? ' is-active' : ''
                      }`}
                      type="button"
                      onClick={() => setPackageVisits(value)}
                    >
                      {value} визита
                    </button>
                  ))}
                </div>
              )}
              {scenario.showLink && shareLink && (
                <div className="pro-detail-link">
                  <span className="pro-detail-link-label">Ссылка для записи</span>
                  <span className="pro-detail-link-value">{shareLink}</span>
                </div>
              )}
              <div className="pro-detail-actions">
                <button
                  className="pro-detail-action"
                  type="button"
                  onClick={() => handleShare(scenario)}
                  disabled={!canShare}
                >
                  {scenario.isShare ? 'Поделиться в Telegram' : 'Отправить в Telegram'}
                </button>
                <button
                  className="pro-detail-action is-ghost"
                  type="button"
                  onClick={() => void handleCopy(scenario)}
                  disabled={!canCopy}
                >
                  {scenario.isShare ? 'Скопировать ссылку' : 'Скопировать текст'}
                </button>
              </div>
            </section>
          ))}
        </div>

        <p className="pro-marketing-section">Быстрые действия</p>
        <section className="pro-detail-card">
          <div className="pro-detail-card-head">
            <h2>Коммуникации и возвраты</h2>
            <span className="pro-detail-pill is-ghost">1 касание</span>
          </div>
          <p className="pro-detail-text">
            Быстро переходите к готовым шаблонам рассылок и сценариям возврата.
          </p>
          <div className="pro-detail-actions">
            <button className="pro-detail-action" type="button" onClick={onOpenCampaigns}>
              Коммуникации
            </button>
            <button
              className="pro-detail-action is-ghost"
              type="button"
              onClick={onOpenReminders}
            >
              Возврат клиентов
            </button>
          </div>
        </section>

        <p className="pro-marketing-section">История активности</p>
        <section className="pro-detail-card">
          <div className="pro-detail-card-head">
            <h2>Последние действия</h2>
            <span className="pro-detail-pill is-ghost">{history.length}</span>
          </div>
          {history.length === 0 ? (
            <p className="pro-detail-empty">Пока нет активности. Запустите сценарий.</p>
          ) : (
            <div className="pro-detail-list">
              {history.map((item) => (
                <div className="pro-detail-list-item" key={item.id}>
                  <span className="pro-detail-avatar">
                    {item.channel === 'telegram' ? 'TG' : 'TXT'}
                  </span>
                  <div className="pro-detail-list-body">
                    <div className="pro-detail-list-title-row">
                      <span className="pro-detail-list-title">{item.title}</span>
                      <span className="pro-detail-pill is-ghost">
                        {item.channel === 'telegram' ? 'Telegram' : 'Копия'}
                      </span>
                    </div>
                    <span className="pro-detail-list-subtitle">
                      {item.channel === 'telegram'
                        ? 'Отправлено в Telegram'
                        : 'Скопировано в буфер'}
                    </span>
                    <span className="pro-detail-list-meta">
                      {formatShortDateTime(item.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {status && (
          <p className="pro-detail-status" role="status">
            {status}
          </p>
        )}
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
