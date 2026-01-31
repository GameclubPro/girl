import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { useProCabinetData } from '../hooks/useProCabinetData'
import type { MarketingSummary, RepeatSettings } from '../types/app'
import { buildBookingStartParam } from '../utils/deeplink'
import { buildShareLink } from '../utils/telegramShare'

const MARKETING_TEXT_LIMIT = 800
const DISCOUNT_OPTIONS = [0, 5, 10, 15]
const REPEAT_INTERVAL_MIN = 7
const REPEAT_INTERVAL_MAX = 180
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

type Template = {
  id: string
  title: string
  description: string
  text: string
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

const categoryLabelOverrides: Record<string, string> = {
  'beauty-nails': 'Ногти',
  'brows-lashes': 'Брови и ресницы',
  hair: 'Волосы',
  'cosmetology-care': 'Уход за лицом',
}

const getCategoryLabel = (categoryId: string) =>
  categoryLabelOverrides[categoryId] ?? categoryId

const areIntervalsEqual = (
  first: Record<string, number>,
  second: Record<string, number>
) => {
  const firstKeys = Object.keys(first)
  const secondKeys = Object.keys(second)
  if (firstKeys.length !== secondKeys.length) return false
  return firstKeys.every((key) => Number(first[key]) === Number(second[key]))
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
  const { bookings, lastUpdated, isLoading, combinedError } = useProCabinetData(
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

  const [activeTab, setActiveTab] = useState<'broadcast' | 'repeat'>('broadcast')
  const [broadcastChannel, setBroadcastChannel] = useState<'bot' | 'chat'>('bot')
  const [discountPercent, setDiscountPercent] = useState(10)
  const [broadcastDraft, setBroadcastDraft] = useState('')
  const [broadcastTemplateOpen, setBroadcastTemplateOpen] = useState(false)
  const [broadcastTemplateId, setBroadcastTemplateId] = useState<string | null>(null)
  const [repeatSettings, setRepeatSettings] = useState<RepeatSettings | null>(null)
  const [repeatLoading, setRepeatLoading] = useState(true)
  const [repeatError, setRepeatError] = useState('')
  const [repeatSaving, setRepeatSaving] = useState(false)
  const [repeatTemplateDraft, setRepeatTemplateDraft] = useState('')
  const [repeatIntervalsDraft, setRepeatIntervalsDraft] = useState<Record<string, number>>({})
  const [repeatDraftInitialized, setRepeatDraftInitialized] = useState(false)

  const [marketingSummary, setMarketingSummary] = useState<MarketingSummary | null>(null)
  const [marketingLoading, setMarketingLoading] = useState(true)
  const [marketingError, setMarketingError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [status, setStatus] = useState('')
  const [sendError, setSendError] = useState('')
  const statusTimerRef = useRef<number | null>(null)
  const marketingAbortRef = useRef<AbortController | null>(null)
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
    if (!broadcastTemplateOpen) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (broadcastTemplateRef.current?.contains(target)) return
      setBroadcastTemplateOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBroadcastTemplateOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [broadcastTemplateOpen])

  useEffect(() => {
    if (activeTab !== 'broadcast') {
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
      const repeatUrl = `${apiBase}/api/pro/marketing/repeat-settings?userId=${encodeURIComponent(
        userId
      )}`
      const [summaryRes, repeatRes] = await Promise.all([
        fetch(summaryUrl, { signal: controller.signal }),
        fetch(repeatUrl, { signal: controller.signal }),
      ])

      if (summaryRes.ok) {
        const summaryPayload = await summaryRes.json().catch(() => null)
        if (!controller.signal.aborted) {
          setMarketingSummary({
            botOptInCount: Number(summaryPayload?.botOptInCount) || 0,
            chatCount: Number(summaryPayload?.chatCount) || 0,
            repeatEligibleTotal:
              summaryPayload?.repeatEligibleTotal === null
                ? null
                : Number(summaryPayload?.repeatEligibleTotal) || 0,
            repeatEligibleBotCount:
              summaryPayload?.repeatEligibleBotCount === null
                ? null
                : Number(summaryPayload?.repeatEligibleBotCount) || 0,
            repeatEligibleChatCount:
              summaryPayload?.repeatEligibleChatCount === null
                ? null
                : Number(summaryPayload?.repeatEligibleChatCount) || 0,
            repeatLastSentAt: summaryPayload?.repeatLastSentAt ?? null,
            repeatCheckedAt: summaryPayload?.repeatCheckedAt ?? null,
          })
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

  useEffect(() => {
    setRepeatDraftInitialized(false)
    setRepeatTemplateDraft('')
    setRepeatIntervalsDraft({})
  }, [userId])

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
  const broadcastChannelCount = broadcastChannel === 'bot' ? botAudience : chatAudience
  const broadcastHasAudience =
    typeof broadcastChannelCount !== 'number' || broadcastChannelCount > 0
  const canSend = Boolean(payloadText) && !isTextTooLong && !isSending && broadcastHasAudience

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
  const repeatIntervals = repeatDraftInitialized
    ? repeatIntervalsDraft
    : repeatSettings?.intervals ?? {}
  const repeatTemplateValue = repeatDraftInitialized
    ? repeatTemplateDraft
    : repeatSettings?.template ?? ''
  const repeatTemplateLength = repeatTemplateValue.trim().length
  const isRepeatTemplateTooLong = repeatTemplateLength > MARKETING_TEXT_LIMIT
  const repeatDefaultDays =
    typeof repeatIntervals.default === 'number' && repeatIntervals.default > 0
      ? repeatIntervals.default
      : REPEAT_INTERVALS.default

  const resolveRepeatInterval = useCallback(
    (categoryId: string) => {
      const custom = repeatIntervals[categoryId]
      if (typeof custom === 'number' && custom > 0) return custom
      const defaultOverride = repeatIntervals.default
      if (typeof defaultOverride === 'number' && defaultOverride > 0) {
        return defaultOverride
      }
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
  const repeatTemplate = repeatTemplateValue.trim()
  const repeatPreviewText = repeatTemplate
    ? repeatTemplate
        .replace(/\{\{\s*category\s*\}\}/gi, repeatPreviewCategory)
        .replace(
          /\{\{\s*master\s*\}\}/gi,
          displayName ? displayName : 'мастер'
        )
    : `Пора записаться на повторную услугу: ${repeatPreviewCategory}. Выберите удобное время по кнопке ниже.`

  const repeatDraftDirty = useMemo(() => {
    if (!repeatDraftInitialized || !repeatSettings) return false
    const baseTemplate = (repeatSettings.template ?? '').trim()
    const currentTemplate = repeatTemplateDraft.trim()
    if (baseTemplate !== currentTemplate) return true
    const baseIntervals = repeatSettings.intervals ?? {}
    return !areIntervalsEqual(repeatIntervalsDraft, baseIntervals)
  }, [repeatDraftInitialized, repeatIntervalsDraft, repeatSettings, repeatTemplateDraft])

  useEffect(() => {
    if (!repeatSettings) return
    if (!repeatDraftInitialized || !repeatDraftDirty) {
      setRepeatTemplateDraft(repeatSettings.template ?? '')
      setRepeatIntervalsDraft(repeatSettings.intervals ?? {})
      setRepeatDraftInitialized(true)
    }
  }, [repeatDraftDirty, repeatDraftInitialized, repeatSettings])

  const handleInsertBroadcastTemplate = useCallback(
    (template: Template) => {
      setBroadcastDraft(template.text)
      setBroadcastTemplateId(template.id)
      showStatus('Текст вставлен в сообщение.')
    },
    [showStatus]
  )

  const saveRepeatSettings = useCallback(
    async (
      next: Partial<RepeatSettings>,
      options?: { preserveDraft?: boolean }
    ) => {
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
        const nextSettings: RepeatSettings = {
          enabled: Boolean(data?.enabled),
          channel: data?.channel === 'chat' ? 'chat' : 'bot',
          includeLink: Boolean(data?.includeLink ?? data?.include_link ?? true),
          includeUnsubscribe: Boolean(
            data?.includeUnsubscribe ?? data?.include_unsubscribe ?? true
          ),
          intervals:
            data?.intervals && typeof data.intervals === 'object' ? data.intervals : {},
          template: data?.template ?? null,
        }
        setRepeatSettings(nextSettings)
        if (!options?.preserveDraft) {
          setRepeatTemplateDraft(nextSettings.template ?? '')
          setRepeatIntervalsDraft(nextSettings.intervals ?? {})
          setRepeatDraftInitialized(true)
        }
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

  const clampRepeatInterval = useCallback(
    (value: number) =>
      Math.min(REPEAT_INTERVAL_MAX, Math.max(REPEAT_INTERVAL_MIN, value)),
    []
  )

  const handleRepeatIntervalAdjust = useCallback(
    (categoryId: string, delta: number) => {
      if (repeatLoading || repeatSaving) return
      setRepeatDraftInitialized(true)
      const current = resolveRepeatInterval(categoryId)
      const nextValue = clampRepeatInterval(current + delta)
      setRepeatIntervalsDraft((prev) => ({
        ...prev,
        [categoryId]: nextValue,
      }))
    },
    [clampRepeatInterval, repeatLoading, repeatSaving, resolveRepeatInterval]
  )

  const handleRepeatIntervalReset = useCallback((categoryId: string) => {
    setRepeatDraftInitialized(true)
    setRepeatIntervalsDraft((prev) => {
      if (!(categoryId in prev)) return prev
      const next = { ...prev }
      delete next[categoryId]
      return next
    })
  }, [])

  const handleRepeatDefaultAdjust = useCallback(
    (delta: number) => {
      if (repeatLoading || repeatSaving) return
      setRepeatDraftInitialized(true)
      const current =
        typeof repeatIntervals.default === 'number' && repeatIntervals.default > 0
          ? repeatIntervals.default
          : REPEAT_INTERVALS.default
      const nextValue = clampRepeatInterval(current + delta)
      setRepeatIntervalsDraft((prev) => ({
        ...prev,
        default: nextValue,
      }))
    },
    [clampRepeatInterval, repeatIntervals.default, repeatLoading, repeatSaving]
  )

  const handleRepeatDefaultReset = useCallback(() => {
    setRepeatDraftInitialized(true)
    setRepeatIntervalsDraft((prev) => {
      if (!('default' in prev)) return prev
      const next = { ...prev }
      delete next.default
      return next
    })
  }, [])

  const handleRepeatDraftSave = useCallback(() => {
    if (isRepeatTemplateTooLong) {
      showStatus('Слишком длинный шаблон.', true)
      return
    }
    void saveRepeatSettings({
      intervals: repeatIntervalsDraft,
      template: repeatTemplateDraft.trim() ? repeatTemplateDraft.trim() : null,
    })
  }, [isRepeatTemplateTooLong, repeatIntervalsDraft, repeatTemplateDraft, saveRepeatSettings, showStatus])

  const handleRepeatDraftReset = useCallback(() => {
    if (!repeatSettings) return
    setRepeatIntervalsDraft(repeatSettings.intervals ?? {})
    setRepeatTemplateDraft(repeatSettings.template ?? '')
    setRepeatDraftInitialized(true)
  }, [repeatSettings])

  const lastUpdatedLabel = lastUpdated
    ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''

  const repeatEligibleBotCount = marketingSummary?.repeatEligibleBotCount
  const repeatEligibleChatCount = marketingSummary?.repeatEligibleChatCount
  const repeatEligibleCount =
    repeatChannel === 'bot' ? repeatEligibleBotCount : repeatEligibleChatCount
  const repeatEligibleLabel =
    marketingLoading || repeatEligibleCount === undefined || repeatEligibleCount === null
      ? '—'
      : repeatEligibleCount
  const repeatLastSentAt = marketingSummary?.repeatLastSentAt ?? null
  const repeatLastSentLabel = useMemo(() => {
    if (!repeatLastSentAt) return 'Пока не отправляли'
    const parsed = new Date(repeatLastSentAt)
    if (Number.isNaN(parsed.getTime())) return 'Пока не отправляли'
    const datePart = parsed.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short',
    })
    const timePart = parsed.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${datePart} ${timePart}`
  }, [repeatLastSentAt])

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
          <section className="pro-detail-card pro-marketing-panel pro-marketing-repeat animate delay-1">
            <div className="pro-detail-card-head pro-marketing-repeat-head">
              <div className="pro-marketing-repeat-heading">
                <h2>Повтор</h2>
                <p className="pro-marketing-repeat-subtitle">
                  Авто-напоминания о повторной записи.
                </p>
              </div>
              <button
                className={`pro-marketing-auto-toggle${
                  repeatEnabled ? ' is-active' : ''
                }`}
                type="button"
                onClick={() =>
                  void saveRepeatSettings(
                    { enabled: !repeatEnabled },
                    { preserveDraft: true }
                  )
                }
                aria-pressed={repeatEnabled}
                disabled={repeatLoading || repeatSaving}
              >
                {repeatSaving ? '...' : repeatEnabled ? 'Вкл' : 'Выкл'}
              </button>
            </div>
            <p className="pro-marketing-repeat-note">
              Проверяем каждые 12 часов и отправляем, если у клиента нет будущей записи.
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

            <div className="pro-marketing-repeat-surface">
              <p className="pro-marketing-section">Канал</p>
              <div
                className="pro-marketing-segment"
                role="group"
                aria-label="Канал напоминаний"
              >
                <button
                  className={`pro-marketing-segment-item${
                    repeatChannel === 'bot' ? ' is-active' : ''
                  }`}
                  type="button"
                  onClick={() =>
                    void saveRepeatSettings(
                      { channel: 'bot' },
                      { preserveDraft: true }
                    )
                  }
                  disabled={repeatLoading || repeatSaving}
                >
                  <span className="pro-marketing-segment-title">Бот</span>
                  <span className="pro-marketing-segment-meta">
                    {marketingLoading
                      ? 'Считаем аудиторию...'
                      : `Подписчиков: ${botAudience ?? 0}`}
                  </span>
                </button>
                <button
                  className={`pro-marketing-segment-item${
                    repeatChannel === 'chat' ? ' is-active' : ''
                  }`}
                  type="button"
                  onClick={() =>
                    void saveRepeatSettings(
                      { channel: 'chat' },
                      { preserveDraft: true }
                    )
                  }
                  disabled={repeatLoading || repeatSaving}
                >
                  <span className="pro-marketing-segment-title">Личные чаты</span>
                  <span className="pro-marketing-segment-meta">
                    {marketingLoading
                      ? 'Считаем аудиторию...'
                      : `Активных чатов: ${chatAudience ?? 0}`}
                  </span>
                </button>
              </div>

              <div className="pro-marketing-repeat-metrics">
                <div className="pro-marketing-metric-card">
                  <span className="pro-marketing-metric-label">
                    Ожидают напоминания
                  </span>
                  <span className="pro-marketing-metric-value">
                    {repeatEligibleLabel}
                  </span>
                </div>
                <div className="pro-marketing-metric-card">
                  <span className="pro-marketing-metric-label">
                    Последняя отправка
                  </span>
                  <span className="pro-marketing-metric-value">
                    {repeatLastSentLabel}
                  </span>
                </div>
              </div>

              {!shareConfigured && repeatChannel === 'bot' && (
                <p className="pro-detail-warning" role="status">
                  Добавьте VITE_TG_APP_URL, чтобы включить ссылку на запись.
                </p>
              )}
            </div>

            <div className="pro-marketing-repeat-surface">
              <p className="pro-marketing-section">Сроки</p>
              <div className="pro-marketing-interval-card is-base">
                <div className="pro-marketing-interval-meta">
                  <span className="pro-marketing-interval-title">
                    Базовый интервал
                  </span>
                  <span className="pro-marketing-interval-subtitle">
                    Для услуг без индивидуальных сроков.
                  </span>
                </div>
                <div className="pro-marketing-interval-actions">
                  <button
                    className="pro-marketing-interval-step"
                    type="button"
                    onClick={() => handleRepeatDefaultAdjust(-1)}
                    disabled={repeatLoading || repeatSaving}
                    aria-label="Уменьшить базовый интервал"
                  >
                    −
                  </button>
                  <span className="pro-marketing-interval-value">
                    {repeatDefaultDays} дней
                  </span>
                  <button
                    className="pro-marketing-interval-step"
                    type="button"
                    onClick={() => handleRepeatDefaultAdjust(1)}
                    disabled={repeatLoading || repeatSaving}
                    aria-label="Увеличить базовый интервал"
                  >
                    +
                  </button>
                </div>
                {'default' in repeatIntervalsDraft && (
                  <button
                    className="pro-marketing-interval-reset"
                    type="button"
                    onClick={handleRepeatDefaultReset}
                    disabled={repeatLoading || repeatSaving}
                  >
                    Сбросить
                  </button>
                )}
              </div>

              <div className="pro-marketing-repeat-grid">
                {repeatCategories.map((item) => {
                  const isCustom = Object.prototype.hasOwnProperty.call(
                    repeatIntervalsDraft,
                    item.id
                  )
                  return (
                    <div className="pro-marketing-interval-card" key={item.id}>
                      <div className="pro-marketing-interval-meta">
                        <span className="pro-marketing-interval-title">
                          {item.label}
                        </span>
                        <span className="pro-marketing-interval-subtitle">
                          {isCustom ? 'Свои сроки' : 'По умолчанию'}
                        </span>
                      </div>
                      <div className="pro-marketing-interval-actions">
                        <button
                          className="pro-marketing-interval-step"
                          type="button"
                          onClick={() => handleRepeatIntervalAdjust(item.id, -1)}
                          disabled={repeatLoading || repeatSaving}
                          aria-label={`Уменьшить срок для ${item.label}`}
                        >
                          −
                        </button>
                        <span className="pro-marketing-interval-value">
                          {item.days} дней
                        </span>
                        <button
                          className="pro-marketing-interval-step"
                          type="button"
                          onClick={() => handleRepeatIntervalAdjust(item.id, 1)}
                          disabled={repeatLoading || repeatSaving}
                          aria-label={`Увеличить срок для ${item.label}`}
                        >
                          +
                        </button>
                      </div>
                      {isCustom && (
                        <button
                          className="pro-marketing-interval-reset"
                          type="button"
                          onClick={() => handleRepeatIntervalReset(item.id)}
                          disabled={repeatLoading || repeatSaving}
                        >
                          Сбросить
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="pro-marketing-repeat-surface">
              <p className="pro-marketing-section">Сообщение</p>
              <div className="pro-marketing-template-editor">
                <textarea
                  className={`pro-marketing-textarea pro-marketing-textarea--compact${
                    isRepeatTemplateTooLong ? ' is-error' : ''
                  }`}
                  value={repeatTemplateValue}
                  onChange={(event) => {
                    setRepeatDraftInitialized(true)
                    setRepeatTemplateDraft(event.target.value)
                  }}
                  placeholder="Напишите шаблон или оставьте пустым для стандартного текста"
                  rows={4}
                />
                <div className="pro-marketing-template-footer">
                  <span
                    className={`pro-marketing-count${
                      isRepeatTemplateTooLong ? ' is-error' : ''
                    }`}
                  >
                    {repeatTemplateLength}/{MARKETING_TEXT_LIMIT}
                  </span>
                  <div className="pro-marketing-token-row">
                    <span className="pro-marketing-token">{'{{category}}'}</span>
                    <span className="pro-marketing-token">{'{{master}}'}</span>
                  </div>
                </div>
              </div>
              <div className="pro-marketing-preview-card">{repeatPreviewText}</div>
              <p className="pro-marketing-repeat-hint">
                Кнопка записи добавится автоматически в бот-канале.
              </p>
            </div>

            {repeatDraftDirty && (
              <div className="pro-detail-actions pro-detail-actions--compact">
                <button
                  className="pro-detail-action"
                  type="button"
                  onClick={handleRepeatDraftSave}
                  disabled={repeatLoading || repeatSaving || isRepeatTemplateTooLong}
                >
                  {repeatSaving ? 'Сохраняем...' : 'Сохранить'}
                </button>
                <button
                  className="pro-detail-action is-ghost"
                  type="button"
                  onClick={handleRepeatDraftReset}
                  disabled={repeatLoading || repeatSaving}
                >
                  Сбросить
                </button>
              </div>
            )}

            {status && (
              <p className="pro-detail-status" role="status">
                {status}
              </p>
            )}
          </section>
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
