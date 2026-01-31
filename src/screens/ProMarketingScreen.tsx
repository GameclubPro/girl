import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { useProCabinetData } from '../hooks/useProCabinetData'
import { buildBookingStartParam } from '../utils/deeplink'
import { buildShareLink, copyToClipboard } from '../utils/telegramShare'

const DAY_MS = 24 * 60 * 60 * 1000
const MARKETING_TEXT_LIMIT = 800
const CAMPAIGN_LIMIT = 12
const DISCOUNT_OPTIONS = [5, 10, 15]
const PACKAGE_OPTIONS = [3, 5]

const formatShortDateTime = (value: number) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const formatCampaignDate = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatShortDateTime(parsed.getTime())
}

type MarketingSummary = {
  botOptInCount: number
  chatCount: number
}

type MarketingCampaign = {
  id: number
  channel: 'bot' | 'chat'
  body: string
  includeUnsubscribe: boolean
  total: number
  sent: number
  failed: number
  createdAt: string
}

type Scenario = {
  id: string
  title: string
  description: string
  pill: string
  text: string
  showLink?: boolean
  isPromo?: boolean
  isPackage?: boolean
  isShare?: boolean
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
  const displayName = displayNameFallback.trim()
  const masterLabel = displayName ? `у мастера ${displayName}` : 'у мастера'

  const [discountPercent, setDiscountPercent] = useState(10)
  const [packageVisits, setPackageVisits] = useState(3)
  const [channel, setChannel] = useState<'bot' | 'chat'>('bot')
  const [message, setMessage] = useState('')
  const [includeLink, setIncludeLink] = useState(true)
  const [includeUnsubscribe, setIncludeUnsubscribe] = useState(true)
  const [marketingSummary, setMarketingSummary] = useState<MarketingSummary | null>(null)
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([])
  const [marketingLoading, setMarketingLoading] = useState(true)
  const [marketingError, setMarketingError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [status, setStatus] = useState('')
  const [sendError, setSendError] = useState('')
  const statusTimerRef = useRef<number | null>(null)
  const marketingAbortRef = useRef<AbortController | null>(null)

  const showStatus = useCallback((nextStatus: string, isError = false) => {
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current)
    }
    if (isError) {
      setSendError(nextStatus)
      setStatus('')
    } else {
      setStatus(nextStatus)
      setSendError('')
    }
    statusTimerRef.current = window.setTimeout(() => {
      setStatus('')
      setSendError('')
    }, 2400)
  }, [])

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        window.clearTimeout(statusTimerRef.current)
      }
      if (marketingAbortRef.current) {
        marketingAbortRef.current.abort()
      }
    }
  }, [])

  const loadMarketingData = useCallback(async () => {
    if (!userId) return
    if (marketingAbortRef.current) {
      marketingAbortRef.current.abort()
    }
    const controller = new AbortController()
    marketingAbortRef.current = controller
    setMarketingLoading(true)
    setMarketingError('')

    try {
      const summaryUrl = `${apiBase}/api/pro/marketing/summary?userId=${encodeURIComponent(
        userId
      )}`
      const campaignsUrl = `${apiBase}/api/pro/marketing/campaigns?userId=${encodeURIComponent(
        userId
      )}&limit=${CAMPAIGN_LIMIT}`
      const [summaryRes, campaignsRes] = await Promise.all([
        fetch(summaryUrl, { signal: controller.signal }),
        fetch(campaignsUrl, { signal: controller.signal }),
      ])

      if (!summaryRes.ok || !campaignsRes.ok) {
        throw new Error('marketing_load_failed')
      }

      const summaryPayload = await summaryRes.json().catch(() => null)
      const campaignsPayload = await campaignsRes.json().catch(() => null)

      if (controller.signal.aborted) return

      setMarketingSummary({
        botOptInCount: Number(summaryPayload?.botOptInCount) || 0,
        chatCount: Number(summaryPayload?.chatCount) || 0,
      })
      setCampaigns(Array.isArray(campaignsPayload?.items) ? campaignsPayload.items : [])
    } catch (error) {
      if (controller.signal.aborted) return
      setMarketingError('Не удалось загрузить данные рассылок. Повторите позже.')
    } finally {
      if (!controller.signal.aborted) {
        setMarketingLoading(false)
      }
    }
  }, [apiBase, userId])

  useEffect(() => {
    void loadMarketingData()
  }, [loadMarketingData])

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

  const sanitizedMessage = message.trim()
  const includeLinkEnabled = includeLink && Boolean(shareLink)
  const payloadText = useMemo(() => {
    if (!sanitizedMessage) return ''
    if (channel === 'bot') return sanitizedMessage
    if (includeLinkEnabled) {
      return `${sanitizedMessage}\n${shareLink}`
    }
    return sanitizedMessage
  }, [channel, includeLinkEnabled, sanitizedMessage, shareLink])

  const payloadLength = payloadText.length
  const isTextTooLong = payloadLength > MARKETING_TEXT_LIMIT
  const botAudience = marketingSummary?.botOptInCount
  const chatAudience = marketingSummary?.chatCount
  const audienceCount = channel === 'bot' ? botAudience : chatAudience
  const hasAudience = typeof audienceCount !== 'number' || audienceCount > 0
  const canSend = Boolean(payloadText) && !isTextTooLong && !isSending && hasAudience

  const handleInsertScenario = useCallback(
    (scenario: Scenario) => {
      setMessage(scenario.text)
      if (scenario.showLink && shareLink) {
        setIncludeLink(true)
      }
      showStatus('Текст вставлен в рассылку.')
    },
    [shareLink, showStatus]
  )

  const handleCopyScenario = useCallback(
    async (scenario: Scenario) => {
      const payload = shareLink ? `${scenario.text}\n${shareLink}` : scenario.text
      const success = await copyToClipboard(payload.trim())
      showStatus(success ? 'Текст скопирован.' : 'Не удалось скопировать.', !success)
    },
    [shareLink, showStatus]
  )

  const handleSend = useCallback(async () => {
    if (!payloadText) {
      showStatus('Введите текст рассылки.', true)
      return
    }
    if (isTextTooLong) {
      showStatus('Слишком длинное сообщение.', true)
      return
    }
    if (!hasAudience) {
      showStatus('Нет получателей для рассылки.', true)
      return
    }

    setIsSending(true)
    setSendError('')
    try {
      const response = await fetch(`${apiBase}/api/pro/marketing/campaigns/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          channel,
          text: payloadText,
          includeLink: channel === 'bot' && includeLinkEnabled,
          includeUnsubscribe: channel === 'bot' && includeUnsubscribe,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (data?.error === 'bot_not_configured') {
          showStatus('Подключите Telegram-бота, чтобы отправлять рассылки.', true)
          return
        }
        if (data?.error === 'text_too_long') {
          showStatus('Текст длиннее лимита.', true)
          return
        }
        showStatus('Не удалось отправить рассылку.', true)
        return
      }

      if (data?.campaign) {
        setCampaigns((current) => [data.campaign, ...current].slice(0, CAMPAIGN_LIMIT))
      }
      const sent = Number(data?.stats?.sent) || 0
      const total = Number(data?.stats?.total) || 0
      showStatus(`Рассылка отправлена: ${sent}/${total}.`)
    } catch (error) {
      showStatus('Не удалось отправить рассылку.', true)
    } finally {
      setIsSending(false)
    }
  }, [
    apiBase,
    channel,
    includeUnsubscribe,
    isTextTooLong,
    payloadText,
    hasAudience,
    userId,
    showStatus,
  ])

  const handleClear = useCallback(() => {
    setMessage('')
    showStatus('Черновик очищен.')
  }, [showStatus])

  const handleToggleLink = useCallback(() => {
    if (!shareLink) {
      showStatus('Ссылка для записи недоступна.', true)
      return
    }
    setIncludeLink((current) => !current)
  }, [shareLink, showStatus])

  const channelHint =
    channel === 'bot'
      ? 'Сообщение уйдет подписчикам рассылки через бот.'
      : 'Сообщение появится в активных чатах с клиентами.'

  const audienceLabel = marketingLoading
    ? 'Считаем аудиторию...'
    : channel === 'bot'
      ? `Подписчиков: ${botAudience ?? 0}`
      : `Активных чатов: ${chatAudience ?? 0}`

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
              Сценарии, рассылки и личные сообщения для клиентов.
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

        {marketingError && (
          <p className="pro-detail-warning" role="alert">
            {marketingError}
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

        <p className="pro-marketing-section">Рассылка</p>
        <section className="pro-detail-card pro-marketing-composer animate delay-2">
          <div className="pro-detail-card-head">
            <h2>Сообщение клиентам</h2>
            <span className="pro-detail-pill is-ghost">
              {channel === 'bot' ? 'Бот' : 'Личные чаты'}
            </span>
          </div>
          <p className="pro-detail-text">{channelHint}</p>

          <div
            className="pro-marketing-channel-grid"
            role="group"
            aria-label="Канал рассылки"
          >
            <button
              className={`pro-marketing-channel${channel === 'bot' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setChannel('bot')}
            >
              <span className="pro-marketing-channel-title">Бот</span>
              <span className="pro-marketing-channel-meta">
                {marketingLoading ? 'Считаем аудиторию...' : `Подписчиков: ${botAudience ?? 0}`}
              </span>
            </button>
            <button
              className={`pro-marketing-channel${channel === 'chat' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setChannel('chat')}
            >
              <span className="pro-marketing-channel-title">Личные чаты</span>
              <span className="pro-marketing-channel-meta">
                {marketingLoading
                  ? 'Считаем аудиторию...'
                  : `Активных чатов: ${chatAudience ?? 0}`}
              </span>
            </button>
          </div>

          <div className="pro-marketing-toggle-row">
            <label
              className={`pro-marketing-switch${shareLink ? '' : ' is-disabled'}`}
            >
              <input
                type="checkbox"
                checked={includeLinkEnabled}
                onChange={handleToggleLink}
                disabled={!shareLink}
              />
              <span>Добавлять ссылку на запись</span>
            </label>
            {channel === 'bot' && (
              <label className="pro-marketing-switch">
                <input
                  type="checkbox"
                  checked={includeUnsubscribe}
                  onChange={() => setIncludeUnsubscribe((current) => !current)}
                />
                <span>Добавить ссылку «Отписаться»</span>
              </label>
            )}
          </div>

          {!shareConfigured && (
            <p className="pro-detail-warning" role="status">
              Добавьте VITE_TG_APP_URL, чтобы включить ссылку на запись.
            </p>
          )}

          <div className="pro-marketing-textarea-wrap">
            <textarea
              className={`pro-marketing-textarea${isTextTooLong ? ' is-error' : ''}`}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Напишите короткое сообщение для клиентов"
              rows={5}
            />
            <div className="pro-marketing-textarea-meta">
              <span>{audienceLabel}</span>
              <span className={isTextTooLong ? 'is-error' : ''}>
                {payloadLength}/{MARKETING_TEXT_LIMIT}
              </span>
            </div>
          </div>

          {includeLinkEnabled && shareLink && (
            <div className="pro-detail-link pro-marketing-link">
              <span className="pro-detail-link-label">Ссылка для записи</span>
              <span className="pro-detail-link-value">{shareLink}</span>
            </div>
          )}

          <div className="pro-detail-actions">
            <button
              className="pro-detail-action"
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend}
            >
              {isSending ? 'Отправляем...' : 'Отправить рассылку'}
            </button>
            <button
              className="pro-detail-action is-ghost"
              type="button"
              onClick={handleClear}
              disabled={!message}
            >
              Очистить
            </button>
          </div>
          {sendError && (
            <p className="pro-detail-warning" role="alert">
              {sendError}
            </p>
          )}
          {status && (
            <p className="pro-detail-status" role="status">
              {status}
            </p>
          )}
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
                  onClick={() => handleInsertScenario(scenario)}
                >
                  Вставить в рассылку
                </button>
                <button
                  className="pro-detail-action is-ghost"
                  type="button"
                  onClick={() => void handleCopyScenario(scenario)}
                >
                  Скопировать
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

        <p className="pro-marketing-section">История рассылок</p>
        <section className="pro-detail-card">
          <div className="pro-detail-card-head">
            <h2>Последние кампании</h2>
            <span className="pro-detail-pill is-ghost">{campaigns.length}</span>
          </div>
          {marketingLoading ? (
            <p className="pro-detail-empty">Загружаем историю...</p>
          ) : campaigns.length === 0 ? (
            <p className="pro-detail-empty">Пока нет рассылок. Запустите первую.</p>
          ) : (
            <div className="pro-detail-list">
              {campaigns.map((item) => {
                const preview =
                  item.body.length > 120 ? `${item.body.slice(0, 117)}...` : item.body
                return (
                  <div className="pro-detail-list-item" key={item.id}>
                    <span className="pro-detail-avatar">
                      {item.channel === 'bot' ? 'BOT' : 'CHAT'}
                    </span>
                    <div className="pro-detail-list-body">
                      <div className="pro-detail-list-title-row">
                        <span className="pro-detail-list-title">
                          {item.channel === 'bot' ? 'Бот' : 'Личные чаты'}
                        </span>
                        <span className="pro-detail-pill is-ghost">
                          {item.sent}/{item.total}
                        </span>
                      </div>
                      <span className="pro-detail-list-subtitle">{preview}</span>
                      <span className="pro-detail-list-meta">
                        {formatCampaignDate(item.createdAt)}
                        {item.failed > 0 ? ` · Ошибок: ${item.failed}` : ''}
                        {item.includeUnsubscribe ? ' · Отписка' : ''}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
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
