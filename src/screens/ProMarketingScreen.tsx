import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { useProCabinetData } from '../hooks/useProCabinetData'
import { buildBookingStartParam } from '../utils/deeplink'
import { buildShareLink } from '../utils/telegramShare'

const MARKETING_TEXT_LIMIT = 800
const CAMPAIGN_LIMIT = 12
const DISCOUNT_OPTIONS = [0, 5, 10, 15]
const REPEAT_INTERVALS = {
  'beauty-nails': 21,
  'brows-lashes': 21,
  hair: 35,
  'cosmetology-care': 30,
  default: 30,
} as const
const REPEAT_CATEGORY_ORDER = [
  'beauty-nails',
  'brows-lashes',
  'hair',
  'cosmetology-care',
] as const

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
  text: string
}

type RepeatSettings = {
  enabled: boolean
  channel: 'bot' | 'chat'
  includeLink: boolean
  includeUnsubscribe: boolean
  intervals: Record<string, number>
  template?: string | null
}

type ProMarketingScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onBack: () => void
  onViewRequests: () => void
  onViewChats: () => void
  onEditProfile: () => void
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
  if (value === 'repeat') return 'Постоянные клиенты'
  if (value === 'inactive_30') return 'Пауза 30+ дней'
  if (value === 'inactive_60') return 'Пауза 60+ дней'
  return 'Аудитория'
}

const categoryLabelOverrides: Record<string, string> = {
  'beauty-nails': 'Ногти',
  'brows-lashes': 'Брови и ресницы',
  hair: 'Волосы',
  'cosmetology-care': 'Уход за лицом',
}

const getCategoryLabel = (categoryId: string) =>
  categoryLabelOverrides[categoryId] ?? categoryId

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
  const { bookings, bookingStats, lastUpdated, isLoading, combinedError } =
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

  const [activeTab, setActiveTab] = useState<'broadcast' | 'repeat'>('broadcast')
  const [broadcastChannel, setBroadcastChannel] = useState<'bot' | 'chat'>('bot')
  const [discountPercent, setDiscountPercent] = useState(10)
  const [broadcastAudience, setBroadcastAudience] = useState<'all' | 'repeat'>(
    'all'
  )
  const [broadcastDraft, setBroadcastDraft] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [audienceOpen, setAudienceOpen] = useState(false)
  const [broadcastTemplateOpen, setBroadcastTemplateOpen] = useState(false)
  const [broadcastTemplateId, setBroadcastTemplateId] = useState<string | null>(null)
  const [repeatSettings, setRepeatSettings] = useState<RepeatSettings | null>(null)
  const [repeatLoading, setRepeatLoading] = useState(true)
  const [repeatError, setRepeatError] = useState('')
  const [repeatSaving, setRepeatSaving] = useState(false)

  const [marketingSummary, setMarketingSummary] = useState<MarketingSummary | null>(null)
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([])
  const [marketingLoading, setMarketingLoading] = useState(true)
  const [marketingError, setMarketingError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [status, setStatus] = useState('')
  const [sendError, setSendError] = useState('')
  const statusTimerRef = useRef<number | null>(null)
  const marketingAbortRef = useRef<AbortController | null>(null)
  const audienceRef = useRef<HTMLDivElement | null>(null)
  const broadcastTemplateRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    if (!audienceOpen && !broadcastTemplateOpen) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (audienceRef.current?.contains(target)) return
      if (broadcastTemplateRef.current?.contains(target)) return
      setAudienceOpen(false)
      setBroadcastTemplateOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAudienceOpen(false)
        setBroadcastTemplateOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [audienceOpen, broadcastTemplateOpen])

  useEffect(() => {
    if (activeTab !== 'broadcast') {
      setAudienceOpen(false)
      setBroadcastTemplateOpen(false)
    }
  }, [activeTab])

  const loadMarketingData = useCallback(async () => {
    if (!userId) return
    if (marketingAbortRef.current) {
      marketingAbortRef.current.abort()
    }
    const controller = new AbortController()
    marketingAbortRef.current = controller
    setMarketingLoading(true)
    setMarketingError('')
    setRepeatLoading(true)
    setRepeatError('')

    try {
      const summaryUrl = `${apiBase}/api/pro/marketing/summary?userId=${encodeURIComponent(
        userId
      )}`
      const campaignsUrl = `${apiBase}/api/pro/marketing/campaigns?userId=${encodeURIComponent(
        userId
      )}&limit=${CAMPAIGN_LIMIT}`
      const repeatUrl = `${apiBase}/api/pro/marketing/repeat-settings?userId=${encodeURIComponent(
        userId
      )}`
      const [summaryRes, campaignsRes, repeatRes] = await Promise.all([
        fetch(summaryUrl, { signal: controller.signal }),
        fetch(campaignsUrl, { signal: controller.signal }),
        fetch(repeatUrl, { signal: controller.signal }),
      ])

      if (summaryRes.ok) {
        const summaryPayload = await summaryRes.json().catch(() => null)
        if (!controller.signal.aborted) {
          setMarketingSummary({
            botOptInCount: Number(summaryPayload?.botOptInCount) || 0,
            chatCount: Number(summaryPayload?.chatCount) || 0,
          })
        }
      } else {
        setMarketingError('Не удалось загрузить данные рассылок. Повторите позже.')
      }

      if (campaignsRes.ok) {
        const campaignsPayload = await campaignsRes.json().catch(() => null)
        if (!controller.signal.aborted) {
          setCampaigns(
            Array.isArray(campaignsPayload?.items) ? campaignsPayload.items : []
          )
        }
      } else {
        setMarketingError('Не удалось загрузить данные рассылок. Повторите позже.')
      }

      if (repeatRes.ok) {
        const repeatPayload = await repeatRes.json().catch(() => null)
        if (!controller.signal.aborted) {
          setRepeatSettings({
            enabled: Boolean(repeatPayload?.enabled),
            channel: repeatPayload?.channel === 'chat' ? 'chat' : 'bot',
            includeLink: Boolean(
              repeatPayload?.includeLink ?? repeatPayload?.include_link ?? true
            ),
            includeUnsubscribe: Boolean(
              repeatPayload?.includeUnsubscribe ??
                repeatPayload?.include_unsubscribe ??
                true
            ),
            intervals:
              repeatPayload?.intervals && typeof repeatPayload.intervals === 'object'
                ? repeatPayload.intervals
                : {},
            template: repeatPayload?.template ?? null,
          })
        }
      } else {
        setRepeatError('Не удалось загрузить авто-напоминания.')
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setMarketingError('Не удалось загрузить данные рассылок. Повторите позже.')
      setRepeatError('Не удалось загрузить авто-напоминания.')
    } finally {
      if (!controller.signal.aborted) {
        setMarketingLoading(false)
        setRepeatLoading(false)
      }
    }
  }, [apiBase, userId])

  useEffect(() => {
    void loadMarketingData()
  }, [loadMarketingData])

  const broadcastTemplates: Template[] = useMemo(() => {
    const slotsText = `Привет! ${masterLabel} появились свободные окна на ближайшие дни. Если хотите записаться, выберите время по кнопке ниже.`
    const promoText =
      discountPercent > 0
        ? `Есть приятная новость ${masterLabel}: действует скидка -${discountPercent}% на ближайшую запись. Если интересно, выберите время по кнопке ниже.`
        : `Есть приятная новость ${masterLabel}: для записи действует небольшой бонус. Если интересно, выберите время по кнопке ниже.`
    const newsText = `Короткое обновление ${masterLabel}: появились новые работы и свежие идеи. Если хотите записаться, выберите время по кнопке ниже.`

    return [
      {
        id: 'slots',
        title: 'Свободные окна',
        description: 'Слоты на ближайшие дни и недели.',
        text: slotsText,
      },
      {
        id: 'promo',
        title: discountPercent > 0 ? `Акция -${discountPercent}%` : 'Спецпредложение',
        description:
          discountPercent > 0
            ? 'Скидка для быстрой записи.'
            : 'Небольшой бонус для записи.',
        text: promoText,
      },
      {
        id: 'news',
        title: 'Новости',
        description: 'Новые работы, портфолио и идеи.',
        text: newsText,
      },
    ]
  }, [discountPercent, masterLabel])

  const includeLinkEnabled = Boolean(shareLink)
  const includeUnsubscribeEnabled = true

  const payloadText = useMemo(() => {
    const trimmed = broadcastDraft.trim()
    if (!trimmed) return ''
    if (broadcastChannel === 'bot') return trimmed
    if (includeLinkEnabled && shareLink) {
      return `${trimmed}\n${shareLink}`
    }
    return trimmed
  }, [broadcastChannel, broadcastDraft, includeLinkEnabled, shareLink])

  const payloadLength = payloadText.length
  const isTextTooLong = payloadLength > MARKETING_TEXT_LIMIT

  const botAudience = marketingSummary?.botOptInCount
  const chatAudience = marketingSummary?.chatCount
  const broadcastFilterCount =
    broadcastAudience === 'repeat'
      ? bookingStats.repeatClients
      : bookingStats.uniqueClients
  const broadcastChannelCount = broadcastChannel === 'bot' ? botAudience : chatAudience
  const broadcastHasAudience =
    (typeof broadcastChannelCount !== 'number' || broadcastChannelCount > 0) &&
    broadcastFilterCount > 0
  const canSend = Boolean(payloadText) && !isTextTooLong && !isSending && broadcastHasAudience

  const broadcastAudienceLabel =
    broadcastAudience === 'repeat'
      ? `Постоянные · ${bookingStats.repeatClients}`
      : `Все клиенты · ${bookingStats.uniqueClients}`

  const channelHint =
    broadcastChannel === 'bot'
      ? 'Сообщение уйдет подписчикам рассылки через бот.'
      : 'Сообщение появится в активных чатах с клиентами.'

  const selectedBroadcastTemplate = broadcastTemplateId
    ? broadcastTemplates.find((template) => template.id === broadcastTemplateId)
    : null
  const broadcastTemplateLabel = selectedBroadcastTemplate?.title ?? 'Шаблон сообщения'
  const repeatEnabled = repeatSettings?.enabled ?? false
  const repeatChannel = repeatSettings?.channel === 'chat' ? 'chat' : 'bot'
  const repeatIntervals = repeatSettings?.intervals ?? {}

  const resolveRepeatInterval = useCallback(
    (categoryId: string) => {
      const custom = repeatIntervals[categoryId]
      if (typeof custom === 'number' && custom > 0) return custom
      const preset = REPEAT_INTERVALS[categoryId as keyof typeof REPEAT_INTERVALS]
      return preset ?? REPEAT_INTERVALS.default
    },
    [repeatIntervals]
  )

  const repeatCategories = useMemo(() => {
    const bookedCategories = Array.from(
      new Set(
        bookings
          .map((booking) => booking.categoryId)
          .filter((categoryId): categoryId is string => Boolean(categoryId))
      )
    )
    const baseList =
      bookedCategories.length > 0 ? bookedCategories : [...REPEAT_CATEGORY_ORDER]
    return baseList.map((categoryId) => ({
      id: categoryId,
      label: getCategoryLabel(categoryId),
      days: resolveRepeatInterval(categoryId),
    }))
  }, [bookings, resolveRepeatInterval])

  const repeatPreviewCategory = repeatCategories[0]?.label ?? 'вашу услугу'
  const repeatTemplate = repeatSettings?.template?.trim() ?? ''
  const repeatPreviewText = repeatTemplate
    ? repeatTemplate.replace(/\{\{\s*category\s*\}\}/gi, repeatPreviewCategory)
    : `Пора записаться на повторную услугу: ${repeatPreviewCategory}. Выберите удобное время по кнопке ниже.`

  const handleInsertBroadcastTemplate = useCallback(
    (template: Template) => {
      setBroadcastDraft(template.text)
      setBroadcastTemplateId(template.id)
      showStatus('Текст вставлен в сообщение.')
    },
    [showStatus]
  )

  const saveRepeatSettings = useCallback(
    async (next: Partial<RepeatSettings>) => {
      if (!userId) return
      const base: RepeatSettings = repeatSettings ?? {
        enabled: false,
        channel: 'bot',
        includeLink: true,
        includeUnsubscribe: true,
        intervals: {},
        template: null,
      }
      const payload = { ...base, ...next }
      setRepeatSettings(payload)
      setRepeatSaving(true)
      setRepeatError('')
      try {
        const response = await fetch(`${apiBase}/api/pro/marketing/repeat-settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            enabled: payload.enabled,
            channel: payload.channel,
            includeLink: payload.includeLink,
            includeUnsubscribe: payload.includeUnsubscribe,
            intervals: payload.intervals,
            template: payload.template,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data?.error || 'repeat_save_failed')
        }
        setRepeatSettings({
          enabled: Boolean(data?.enabled),
          channel: data?.channel === 'chat' ? 'chat' : 'bot',
          includeLink: Boolean(data?.includeLink ?? data?.include_link ?? true),
          includeUnsubscribe: Boolean(
            data?.includeUnsubscribe ?? data?.include_unsubscribe ?? true
          ),
          intervals:
            data?.intervals && typeof data.intervals === 'object' ? data.intervals : {},
          template: data?.template ?? null,
        })
        showStatus('Настройки сохранены.')
      } catch (error) {
        setRepeatError('Не удалось сохранить авто-напоминания.')
      } finally {
        setRepeatSaving(false)
      }
    },
    [apiBase, repeatSettings, showStatus, userId]
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
    if (!broadcastHasAudience) {
      showStatus('Нет получателей для рассылки.', true)
      return
    }

    const audience = broadcastAudience === 'repeat' ? 'repeat' : 'all'

    setIsSending(true)
    setSendError('')
    try {
      const response = await fetch(`${apiBase}/api/pro/marketing/campaigns/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          channel: broadcastChannel,
          text: payloadText,
          includeLink: broadcastChannel === 'bot' && includeLinkEnabled,
          includeUnsubscribe: broadcastChannel === 'bot' && includeUnsubscribeEnabled,
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
    apiBase,
    broadcastAudience,
    broadcastChannel,
    includeLinkEnabled,
    includeUnsubscribeEnabled,
    isTextTooLong,
    payloadText,
    broadcastHasAudience,
    userId,
    showStatus,
  ])

  const handleClear = useCallback(() => {
    setBroadcastDraft('')
    setBroadcastTemplateId(null)
    showStatus('Черновик очищен.')
  }, [showStatus])

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
            className={`pro-marketing-tab${activeTab === 'repeat' ? ' is-active' : ''}`}
            type="button"
            onClick={() => setActiveTab('repeat')}
            role="tab"
            aria-selected={activeTab === 'repeat'}
          >
            Повтор
          </button>
        </div>

        {activeTab === 'broadcast' ? (
          <section className="pro-detail-card pro-marketing-panel animate delay-1">
            <div className="pro-detail-card-head">
              <h2>Рассылка клиентам</h2>
              <div className="pro-marketing-head-controls" ref={audienceRef}>
                <button
                  className={`pro-marketing-select-trigger${
                    audienceOpen ? ' is-open' : ''
                  }`}
                  type="button"
                  onClick={() => {
                    setAudienceOpen((current) => !current)
                    setBroadcastTemplateOpen(false)
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={audienceOpen}
                >
                  {broadcastAudienceLabel}
                </button>
                {audienceOpen && (
                  <div
                    className="pro-marketing-select-menu"
                    role="listbox"
                    aria-label="Аудитория рассылки"
                  >
                    <button
                      className={`pro-marketing-select-option${
                        broadcastAudience === 'all' ? ' is-active' : ''
                      }`}
                      type="button"
                      role="option"
                      aria-selected={broadcastAudience === 'all'}
                      onClick={() => {
                        setBroadcastAudience('all')
                        setAudienceOpen(false)
                      }}
                    >
                      Все клиенты · {bookingStats.uniqueClients}
                    </button>
                    <button
                      className={`pro-marketing-select-option${
                        broadcastAudience === 'repeat' ? ' is-active' : ''
                      }`}
                      type="button"
                      role="option"
                      aria-selected={broadcastAudience === 'repeat'}
                      onClick={() => {
                        setBroadcastAudience('repeat')
                        setAudienceOpen(false)
                      }}
                    >
                      Постоянные · {bookingStats.repeatClients}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <p className="pro-detail-text">{channelHint}</p>

            <div
              className="pro-marketing-channel-grid"
              role="group"
              aria-label="Канал рассылки"
            >
              <button
                className={`pro-marketing-channel${
                  broadcastChannel === 'bot' ? ' is-active' : ''
                }`}
                type="button"
                onClick={() => setBroadcastChannel('bot')}
              >
                <span className="pro-marketing-channel-title">Бот</span>
                <span className="pro-marketing-channel-meta">
                  {marketingLoading ? 'Считаем аудиторию...' : `Подписчиков: ${botAudience ?? 0}`}
                </span>
              </button>
              <button
                className={`pro-marketing-channel${
                  broadcastChannel === 'chat' ? ' is-active' : ''
                }`}
                type="button"
                onClick={() => setBroadcastChannel('chat')}
              >
                <span className="pro-marketing-channel-title">Личные чаты</span>
                <span className="pro-marketing-channel-meta">
                  {marketingLoading
                    ? 'Считаем аудиторию...'
                    : `Активных чатов: ${chatAudience ?? 0}`}
                </span>
              </button>
            </div>

            <div className="pro-marketing-textarea-wrap">
              <textarea
                className={`pro-marketing-textarea${isTextTooLong ? ' is-error' : ''}`}
                value={broadcastDraft}
                onChange={(event) => setBroadcastDraft(event.target.value)}
                placeholder="Напишите короткое сообщение для клиентов"
                rows={5}
              />
            </div>

            <div className="pro-marketing-template-row">
              <div className="pro-marketing-template-select" ref={broadcastTemplateRef}>
                <button
                  className={`pro-marketing-select-trigger${
                    broadcastTemplateId ? '' : ' is-placeholder'
                  }${broadcastTemplateOpen ? ' is-open' : ''}`}
                  type="button"
                  onClick={() => {
                    setBroadcastTemplateOpen((current) => !current)
                    setAudienceOpen(false)
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={broadcastTemplateOpen}
                >
                  {broadcastTemplateLabel}
                </button>
                {broadcastTemplateOpen && (
                  <div
                    className="pro-marketing-select-menu"
                    role="listbox"
                    aria-label="Шаблон рассылки"
                  >
                    {broadcastTemplates.map((template) => (
                      <button
                        key={template.id}
                        className={`pro-marketing-select-option${
                          broadcastTemplateId === template.id ? ' is-active' : ''
                        }`}
                        type="button"
                        role="option"
                        aria-selected={broadcastTemplateId === template.id}
                        onClick={() => {
                          handleInsertBroadcastTemplate(template)
                          setBroadcastTemplateOpen(false)
                        }}
                      >
                        <span className="pro-marketing-select-option-title">
                          {template.title}
                        </span>
                        <span className="pro-marketing-select-option-desc">
                          {template.description}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className={`pro-marketing-count${isTextTooLong ? ' is-error' : ''}`}>
                {payloadLength}/{MARKETING_TEXT_LIMIT}
              </span>
            </div>

            <div className="pro-marketing-discount">
              <span className="pro-marketing-discount-label">Скидка</span>
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
                    {value === 0 ? '— без скидки' : `-${value}%`}
                  </button>
                ))}
              </div>
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
                disabled={!broadcastDraft}
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
              <h2>Повторная запись</h2>
              <span
                className={`pro-detail-pill is-ghost${
                  repeatEnabled ? '' : ' is-muted'
                }`}
              >
                Авто {repeatEnabled ? 'включено' : 'выключено'}
              </span>
            </div>
            <p className="pro-detail-text">
              Автоматически напомним клиентам записаться повторно, когда подходит
              срок по услуге.
            </p>

            {repeatLoading && (
              <p className="pro-detail-status" role="status">
                Загружаем настройки...
              </p>
            )}
            {repeatError && (
              <p className="pro-detail-warning" role="alert">
                {repeatError}
              </p>
            )}

            <div className="pro-marketing-auto-row">
              <div className="pro-marketing-auto-text">
                <p className="pro-marketing-auto-title">Авто-напоминания</p>
                <p className="pro-marketing-auto-subtitle">
                  Достаточно включить один раз.
                </p>
              </div>
              <button
                className={`pro-marketing-auto-toggle${
                  repeatEnabled ? ' is-active' : ''
                }`}
                type="button"
                onClick={() => void saveRepeatSettings({ enabled: !repeatEnabled })}
                aria-pressed={repeatEnabled}
                disabled={repeatLoading || repeatSaving}
              >
                {repeatSaving ? '...' : repeatEnabled ? 'Вкл' : 'Выкл'}
              </button>
            </div>

            <div
              className="pro-marketing-channel-grid"
              role="group"
              aria-label="Канал рассылки"
            >
              <button
                className={`pro-marketing-channel${
                  repeatChannel === 'bot' ? ' is-active' : ''
                }`}
                type="button"
                onClick={() => void saveRepeatSettings({ channel: 'bot' })}
                disabled={repeatLoading || repeatSaving}
              >
                <span className="pro-marketing-channel-title">Бот</span>
                <span className="pro-marketing-channel-meta">
                  {marketingLoading
                    ? 'Считаем аудиторию...'
                    : `Подписчиков: ${botAudience ?? 0}`}
                </span>
              </button>
              <button
                className={`pro-marketing-channel${
                  repeatChannel === 'chat' ? ' is-active' : ''
                }`}
                type="button"
                onClick={() => void saveRepeatSettings({ channel: 'chat' })}
                disabled={repeatLoading || repeatSaving}
              >
                <span className="pro-marketing-channel-title">Личные чаты</span>
                <span className="pro-marketing-channel-meta">
                  {marketingLoading
                    ? 'Считаем аудиторию...'
                    : `Активных чатов: ${chatAudience ?? 0}`}
                </span>
              </button>
            </div>

            <div className="pro-marketing-repeat-list">
              <p className="pro-marketing-section">Сроки по категориям</p>
              <div className="pro-marketing-repeat-grid">
                {repeatCategories.map((item) => (
                  <div className="pro-marketing-repeat-card" key={item.id}>
                    <span className="pro-marketing-repeat-title">{item.label}</span>
                    <span className="pro-marketing-repeat-days">
                      {item.days} дней
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pro-marketing-repeat-preview">
              <p className="pro-marketing-section">Шаблон сообщения</p>
              <div className="pro-marketing-preview-card">{repeatPreviewText}</div>
            </div>

            {!shareConfigured && (
              <p className="pro-detail-warning" role="status">
                Добавьте VITE_TG_APP_URL, чтобы включить ссылку на запись.
              </p>
            )}

            <p className="pro-marketing-repeat-hint">
              Проверяем ежедневно и отправляем только если у клиента нет будущей записи.
            </p>
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
