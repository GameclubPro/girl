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
const REMINDER_WINDOWS = [30, 60] as const

type ReminderWindow = (typeof REMINDER_WINDOWS)[number]

type MarketingSummary = {
  botOptInCount: number
  chatCount: number
}

type MarketingCampaign = {
  id: number
  channel: 'bot' | 'chat'
  audience?: string | null
  body: string
  includeUnsubscribe: boolean
  total: number
  sent: number
  failed: number
  createdAt: string
}

type Template = {
  id: string
  title: string
  description: string
  pill?: string
  text: string
  isPromo?: boolean
  isPackage?: boolean
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

const formatAudienceLabel = (value?: string | null) => {
  if (!value || value === 'all') return 'Все клиенты'
  if (value === 'inactive_30') return 'Пауза 30+ дней'
  if (value === 'inactive_60') return 'Пауза 60+ дней'
  return 'Аудитория'
}

export const ProMarketingScreen = (props: ProMarketingScreenProps) => {
  const {
    apiBase,
    userId,
    displayNameFallback,
    onBack,
    onViewRequests,
    onViewChats,
    onEditProfile,
  } = props
  const { bookingStats, lastUpdated, isLoading, combinedError } = useProCabinetData(
    apiBase,
    userId
  )
  const shareBase = (import.meta.env.VITE_TG_APP_URL ?? '').trim()
  const shareConfigured = Boolean(shareBase)
  const bookingStartParam = useMemo(() => buildBookingStartParam(userId), [userId])
  const shareLink = useMemo(
    () => (shareBase ? buildShareLink(shareBase, bookingStartParam) : ''),
    [bookingStartParam, shareBase]
  )
  const displayName = displayNameFallback.trim()
  const masterLabel = displayName ? `у мастера ${displayName}` : 'у мастера'

  const [activeTab, setActiveTab] = useState<'broadcast' | 'reminder'>('broadcast')
  const [channel, setChannel] = useState<'bot' | 'chat'>('bot')
  const [discountPercent, setDiscountPercent] = useState(10)
  const [packageVisits, setPackageVisits] = useState(3)
  const [broadcastDraft, setBroadcastDraft] = useState('')
  const [reminderDraft, setReminderDraft] = useState('')
  const [broadcastIncludeLink, setBroadcastIncludeLink] = useState(true)
  const [reminderIncludeLink, setReminderIncludeLink] = useState(true)
  const [broadcastIncludeUnsubscribe, setBroadcastIncludeUnsubscribe] = useState(true)
  const [reminderIncludeUnsubscribe, setReminderIncludeUnsubscribe] = useState(true)
  const [reminderWindow, setReminderWindow] = useState<ReminderWindow>(30)
  const [reminderTone, setReminderTone] = useState('friendly')
  const [historyOpen, setHistoryOpen] = useState(false)

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

  const inactiveCounts = useMemo(() => {
    const now = Date.now()
    let count30 = 0
    let count60 = 0
    bookingStats.clientSummaries.forEach((client) => {
      if (!client.lastSeenTime) return
      const diffDays = (now - client.lastSeenTime) / DAY_MS
      if (diffDays >= 30) {
        count30 += 1
      }
      if (diffDays >= 60) {
        count60 += 1
      }
    })
    return { count30, count60 }
  }, [bookingStats.clientSummaries])

  const repeatRate = bookingStats.uniqueClients
    ? bookingStats.repeatClients / bookingStats.uniqueClients
    : 0

  const recommendedTemplateId = useMemo(() => {
    if (!bookingStats.uniqueClients) return 'share'
    if (bookingStats.upcomingWeek < 3) return 'fill-week'
    if (inactiveCounts.count30 >= Math.max(2, Math.ceil(bookingStats.uniqueClients * 0.3))) {
      return 'win-back'
    }
    if (repeatRate < 0.4) return 'package'
    return 'promo-week'
  }, [
    bookingStats.uniqueClients,
    bookingStats.upcomingWeek,
    inactiveCounts.count30,
    repeatRate,
  ])

  const broadcastTemplates: Template[] = useMemo(() => {
    const fillWeekText = `Открылись новые окна для записи ${masterLabel}. Если удобно, выберите время по кнопке ниже.`
    const promoText = `На этой неделе действует спец-условие: -${discountPercent}% на ближайшие окна ${masterLabel}. Если интересно, выберите время по кнопке ниже.`
    const packageText = `Пакет ${packageVisits} визитов выгоднее разовых ${masterLabel}. Если интересно, выберите время по кнопке ниже.`
    const winBackText = `Давно не виделись ${masterLabel}. Есть новые окна, если удобно, выберите время по кнопке ниже.`

    return [
      {
        id: 'fill-week',
        title: 'Свободные окна недели',
        description: 'Короткое сообщение о доступных слотах.',
        pill: `На неделе: ${bookingStats.upcomingWeek}`,
        text: fillWeekText,
      },
      {
        id: 'promo-week',
        title: 'Акция недели',
        description: 'Мягкое промо без агрессивных скидок.',
        pill: `Скидка ${discountPercent}%`,
        text: promoText,
        isPromo: true,
      },
      {
        id: 'package',
        title: `Пакет ${packageVisits} визитов`,
        description: 'Выгодное предложение для повторных клиентов.',
        pill: `Повторных: ${bookingStats.repeatClients}`,
        text: packageText,
        isPackage: true,
      },
      {
        id: 'win-back',
        title: 'Вернуть клиентов',
        description: 'Напоминание для тех, кто давно не был.',
        pill: `Спящих: ${inactiveCounts.count30}`,
        text: winBackText,
      },
    ]
  }, [
    bookingStats.repeatClients,
    bookingStats.upcomingWeek,
    discountPercent,
    inactiveCounts.count30,
    masterLabel,
    packageVisits,
  ])

  const reminderTemplates: Template[] = useMemo(() => {
    const friendlyText = `Привет! Давно не виделись ${masterLabel}. Если хотите вернуться, выберите удобное время по кнопке ниже.`
    const careText = `Напоминаем о себе ${masterLabel}: появились свободные окна. Если удобно, выберите время по кнопке ниже.`
    const bonusText = `Для возвращения действует небольшой бонус: -${discountPercent}% на ближайшую запись ${masterLabel}. Если удобно, выберите время по кнопке ниже.`

    return [
      {
        id: 'friendly',
        title: 'Дружелюбно',
        description: 'Легкое напоминание без давления.',
        text: friendlyText,
      },
      {
        id: 'care',
        title: 'С заботой',
        description: 'Спокойное, поддерживающее сообщение.',
        text: careText,
      },
      {
        id: 'bonus',
        title: 'С бонусом',
        description: `Скидка ${discountPercent}% для возвращения.`,
        text: bonusText,
        isPromo: true,
      },
    ]
  }, [discountPercent, masterLabel])

  const currentDraft = activeTab === 'broadcast' ? broadcastDraft : reminderDraft
  const setCurrentDraft = activeTab === 'broadcast' ? setBroadcastDraft : setReminderDraft
  const includeLinkEnabled =
    activeTab === 'broadcast' ? broadcastIncludeLink : reminderIncludeLink
  const includeUnsubscribeEnabled =
    activeTab === 'broadcast'
      ? broadcastIncludeUnsubscribe
      : reminderIncludeUnsubscribe

  const payloadText = useMemo(() => {
    const trimmed = currentDraft.trim()
    if (!trimmed) return ''
    if (channel === 'bot') return trimmed
    if (includeLinkEnabled && shareLink) {
      return `${trimmed}\n${shareLink}`
    }
    return trimmed
  }, [channel, currentDraft, includeLinkEnabled, shareLink])

  const payloadLength = payloadText.length
  const isTextTooLong = payloadLength > MARKETING_TEXT_LIMIT

  const botAudience = marketingSummary?.botOptInCount
  const chatAudience = marketingSummary?.chatCount
  const reminderAudience = reminderWindow === 60 ? inactiveCounts.count60 : inactiveCounts.count30
  const audienceCount =
    activeTab === 'broadcast'
      ? channel === 'bot'
        ? botAudience
        : chatAudience
      : reminderAudience
  const hasAudience = typeof audienceCount !== 'number' || audienceCount > 0
  const canSend = Boolean(payloadText) && !isTextTooLong && !isSending && hasAudience

  const audienceLabel =
    activeTab === 'broadcast'
      ? marketingLoading
        ? 'Считаем аудиторию...'
        : channel === 'bot'
          ? `Подписчиков: ${botAudience ?? 0}`
          : `Активных чатов: ${chatAudience ?? 0}`
      : `Клиентов с паузой: ${reminderAudience}`

  const channelHint =
    channel === 'bot'
      ? 'Сообщение уйдет подписчикам рассылки через бот.'
      : 'Сообщение появится в активных чатах с клиентами.'

  const reminderHint = `Напомним клиентам, которые не были ${reminderWindow}+ дней.`

  const handleInsertTemplate = useCallback(
    (tab: 'broadcast' | 'reminder', template: Template) => {
      if (tab === 'broadcast') {
        setBroadcastDraft(template.text)
      } else {
        setReminderDraft(template.text)
        setReminderTone(template.id)
      }
      showStatus('Текст вставлен в сообщение.')
    },
    [showStatus]
  )

  const handleCopyTemplate = useCallback(
    async (template: Template) => {
      const payload = shareLink ? `${template.text}\n${shareLink}` : template.text
      const success = await copyToClipboard(payload.trim())
      showStatus(success ? 'Текст скопирован.' : 'Не удалось скопировать.', !success)
    },
    [shareLink, showStatus]
  )

  const handleSend = useCallback(async () => {
    if (!payloadText) {
      showStatus('Введите текст сообщения.', true)
      return
    }
    if (isTextTooLong) {
      showStatus('Слишком длинное сообщение.', true)
      return
    }
    if (!hasAudience) {
      showStatus(
        activeTab === 'broadcast'
          ? 'Нет получателей для рассылки.'
          : 'Нет клиентов для напоминания.',
        true
      )
      return
    }

    const audience =
      activeTab === 'broadcast'
        ? 'all'
        : reminderWindow === 60
          ? 'inactive_60'
          : 'inactive_30'

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
          includeUnsubscribe: channel === 'bot' && includeUnsubscribeEnabled,
          audience,
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
    activeTab,
    apiBase,
    channel,
    includeLinkEnabled,
    includeUnsubscribeEnabled,
    isTextTooLong,
    payloadText,
    hasAudience,
    reminderWindow,
    userId,
    showStatus,
  ])

  const handleClear = useCallback(() => {
    if (activeTab === 'broadcast') {
      setBroadcastDraft('')
    } else {
      setReminderDraft('')
    }
    showStatus('Черновик очищен.')
  }, [activeTab, showStatus])

  const handleToggleLink = useCallback(() => {
    if (!shareLink) {
      showStatus('Ссылка для записи недоступна.', true)
      return
    }
    if (activeTab === 'broadcast') {
      setBroadcastIncludeLink((current) => !current)
    } else {
      setReminderIncludeLink((current) => !current)
    }
  }, [activeTab, shareLink, showStatus])

  const lastUpdatedLabel = lastUpdated
    ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''

  return (
    <div className="screen screen--pro screen--pro-detail screen--pro-marketing">
      <div className="pro-detail-shell">
        <header className="pro-detail-header">
          <button className="pro-back" type="button" onClick={onBack}>
            ←
          </button>
          <div className="pro-detail-title">
            <p className="pro-detail-kicker">Маркетинг</p>
            <h1 className="pro-detail-heading">Коммуникации</h1>
            <p className="pro-detail-subtitle">
              Два удобных окна: массовая рассылка и повторные записи.
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

        <div className="pro-marketing-tabbar" role="tablist">
          <button
            className={`pro-marketing-tab${activeTab === 'broadcast' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setActiveTab('broadcast')}
            role="tab"
            aria-selected={activeTab === 'broadcast'}
          >
            Рассылка
          </button>
          <button
            className={`pro-marketing-tab${activeTab === 'reminder' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setActiveTab('reminder')}
            role="tab"
            aria-selected={activeTab === 'reminder'}
          >
            Напомнить
          </button>
        </div>

        {activeTab === 'broadcast' ? (
          <section className="pro-detail-card pro-marketing-panel animate delay-1">
            <div className="pro-detail-card-head">
              <h2>Рассылка клиентам</h2>
              <span className="pro-detail-pill is-ghost">{audienceLabel}</span>
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

            <div className="pro-marketing-templates">
              <p className="pro-marketing-section">Шаблоны</p>
              <div className="pro-marketing-template-grid">
                {broadcastTemplates.map((template) => (
                  <section
                    key={template.id}
                    className={`pro-marketing-template-card${
                      template.id === recommendedTemplateId ? ' is-recommended' : ''
                    }`}
                  >
                    <div className="pro-marketing-template-head">
                      <div>
                        <h3 className="pro-marketing-template-title">{template.title}</h3>
                        <p className="pro-marketing-template-desc">
                          {template.description}
                        </p>
                      </div>
                      <button
                        className="pro-marketing-template-action"
                        type="button"
                        onClick={() => handleInsertTemplate('broadcast', template)}
                      >
                        Вставить
                      </button>
                    </div>
                    {template.pill && (
                      <span className="pro-detail-pill is-ghost">{template.pill}</span>
                    )}
                    {template.isPromo && (
                      <div className="pro-marketing-chip-row" role="group" aria-label="Скидка">
                        {DISCOUNT_OPTIONS.map((value) => (
                          <button
                            key={`discount-${value}`}
                            className={`pro-marketing-chip${
                              value === discountPercent ? ' is-active' : ''
                            }`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setDiscountPercent(value)
                            }}
                          >
                            -{value}%
                          </button>
                        ))}
                      </div>
                    )}
                    {template.isPackage && (
                      <div className="pro-marketing-chip-row" role="group" aria-label="Пакет">
                        {PACKAGE_OPTIONS.map((value) => (
                          <button
                            key={`package-${value}`}
                            className={`pro-marketing-chip${
                              value === packageVisits ? ' is-active' : ''
                            }`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setPackageVisits(value)
                            }}
                          >
                            {value} визита
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      className="pro-marketing-template-link"
                      type="button"
                      onClick={() => void handleCopyTemplate(template)}
                    >
                      Скопировать текст
                    </button>
                  </section>
                ))}
              </div>
            </div>

            <div className="pro-marketing-textarea-wrap">
              <textarea
                className={`pro-marketing-textarea${isTextTooLong ? ' is-error' : ''}`}
                value={currentDraft}
                onChange={(event) => setCurrentDraft(event.target.value)}
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

            <div className="pro-marketing-toggle-row">
              <label
                className={`pro-marketing-switch${shareLink ? '' : ' is-disabled'}`}
              >
                <input
                  type="checkbox"
                  checked={includeLinkEnabled && Boolean(shareLink)}
                  onChange={handleToggleLink}
                  disabled={!shareLink}
                />
                <span>Добавлять ссылку на запись</span>
              </label>
              {channel === 'bot' && (
                <label className="pro-marketing-switch">
                  <input
                    type="checkbox"
                    checked={includeUnsubscribeEnabled}
                    onChange={() =>
                      setBroadcastIncludeUnsubscribe((current) => !current)
                    }
                  />
                  <span>Добавить кнопку «Отписаться»</span>
                </label>
              )}
            </div>

            {!shareConfigured && (
              <p className="pro-detail-warning" role="status">
                Добавьте VITE_TG_APP_URL, чтобы включить ссылку на запись.
              </p>
            )}

            <div className="pro-detail-actions">
              <button
                className="pro-detail-action"
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSend}
              >
                {isSending ? 'Отправляем...' : 'Отправить'}
              </button>
              <button
                className="pro-detail-action is-ghost"
                type="button"
                onClick={handleClear}
                disabled={!currentDraft}
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
        ) : (
          <section className="pro-detail-card pro-marketing-panel animate delay-1">
            <div className="pro-detail-card-head">
              <h2>Напомнить записаться</h2>
              <span className="pro-detail-pill is-ghost">{audienceLabel}</span>
            </div>
            <p className="pro-detail-text">{reminderHint}</p>

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

            <div className="pro-marketing-window-row" role="group" aria-label="Пауза">
              {REMINDER_WINDOWS.map((value) => (
                <button
                  key={`reminder-${value}`}
                  className={`pro-marketing-chip${
                    value === reminderWindow ? ' is-active' : ''
                  }`}
                  type="button"
                  onClick={() => setReminderWindow(value)}
                >
                  {value}+ дней
                </button>
              ))}
            </div>

            <div className="pro-marketing-templates">
              <p className="pro-marketing-section">Тон сообщения</p>
              <div className="pro-marketing-tone-grid">
                {reminderTemplates.map((template) => (
                  <section
                    key={template.id}
                    className={`pro-marketing-tone-card${
                      template.id === reminderTone ? ' is-active' : ''
                    }`}
                  >
                    <div className="pro-marketing-template-head">
                      <div>
                        <h3 className="pro-marketing-template-title">{template.title}</h3>
                        <p className="pro-marketing-template-desc">
                          {template.description}
                        </p>
                      </div>
                      <button
                        className="pro-marketing-template-action"
                        type="button"
                        onClick={() => handleInsertTemplate('reminder', template)}
                      >
                        Вставить
                      </button>
                    </div>
                    {template.isPromo && (
                      <div className="pro-marketing-chip-row" role="group" aria-label="Скидка">
                        {DISCOUNT_OPTIONS.map((value) => (
                          <button
                            key={`reminder-discount-${value}`}
                            className={`pro-marketing-chip${
                              value === discountPercent ? ' is-active' : ''
                            }`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setDiscountPercent(value)
                            }}
                          >
                            -{value}%
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </div>

            <div className="pro-marketing-textarea-wrap">
              <textarea
                className={`pro-marketing-textarea${isTextTooLong ? ' is-error' : ''}`}
                value={currentDraft}
                onChange={(event) => setCurrentDraft(event.target.value)}
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

            <div className="pro-marketing-toggle-row">
              <label
                className={`pro-marketing-switch${shareLink ? '' : ' is-disabled'}`}
              >
                <input
                  type="checkbox"
                  checked={includeLinkEnabled && Boolean(shareLink)}
                  onChange={handleToggleLink}
                  disabled={!shareLink}
                />
                <span>Добавлять ссылку на запись</span>
              </label>
              {channel === 'bot' && (
                <label className="pro-marketing-switch">
                  <input
                    type="checkbox"
                    checked={includeUnsubscribeEnabled}
                    onChange={() =>
                      setReminderIncludeUnsubscribe((current) => !current)
                    }
                  />
                  <span>Добавить кнопку «Отписаться»</span>
                </label>
              )}
            </div>

            {!shareConfigured && (
              <p className="pro-detail-warning" role="status">
                Добавьте VITE_TG_APP_URL, чтобы включить ссылку на запись.
              </p>
            )}

            <div className="pro-detail-actions">
              <button
                className="pro-detail-action"
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSend}
              >
                {isSending ? 'Отправляем...' : 'Отправить'}
              </button>
              <button
                className="pro-detail-action is-ghost"
                type="button"
                onClick={handleClear}
                disabled={!currentDraft}
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
        )}

        <div className="pro-marketing-history">
          <button
            className="pro-marketing-history-toggle"
            type="button"
            onClick={() => setHistoryOpen((current) => !current)}
          >
            История рассылок
            <span>{historyOpen ? 'Свернуть' : `${campaigns.length} кампаний`}</span>
          </button>
          {historyOpen && (
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
                            {item.audience ? ` · ${formatAudienceLabel(item.audience)}` : ''}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}
        </div>
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
