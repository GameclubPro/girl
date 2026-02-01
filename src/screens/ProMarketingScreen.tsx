import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { useProCabinetData } from '../hooks/useProCabinetData'
import type { MarketingSummary, Promotion, RepeatSettings } from '../types/app'
import { buildBookingStartParam } from '../utils/deeplink'
import { buildShareLink } from '../utils/telegramShare'

const MARKETING_TEXT_LIMIT = 800
const PROMOTION_TITLE_LIMIT = 60
const PROMOTION_DESCRIPTION_LIMIT = 180
const PROMOTION_DISCOUNT_OPTIONS = [5, 10, 15, 20]
const PROMOTION_DURATION_OPTIONS = [3, 7, 14]
const BROADCAST_DISCOUNT_DURATION_OPTIONS = [1, 3, 7]
const PROMOTION_MAX_DURATION_DAYS = 14
const TEMPLATE_MENU_ESTIMATED_HEIGHT = 240
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

const PROMOTION_TYPES = [
  { id: 'discount', label: 'Скидка' },
  { id: 'bonus', label: 'Бонус' },
  { id: 'slots', label: 'Быстрые окна' },
] as const

const BROADCAST_SEGMENTS = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'regular', label: 'Постоянные' },
] as const

type BroadcastSegment = (typeof BROADCAST_SEGMENTS)[number]['id']


type Template = {
  id: string
  title: string
  description: string
  text: string
}

type PromotionDraft = {
  type: Promotion['type']
  title: string
  description: string
  durationDays: number
  discountPercent: number
}

type ProMarketingScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onBack: () => void
  onViewCabinet?: () => void
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

const formatShortDate = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
  })
}

export const ProMarketingScreen = (props: ProMarketingScreenProps) => {
  const {
    apiBase,
    userId,
    displayNameFallback,
    onBack,
    onViewCabinet,
    onViewRequests,
    onViewChats,
    onEditProfile,
  } = props
  const { bookings, isLoading, combinedError } = useProCabinetData(apiBase, userId)
  const shareBase = (import.meta.env.VITE_TG_APP_URL ?? '').trim()
  const shareConfigured = Boolean(shareBase)
  const bookingStartParam = useMemo(() => buildBookingStartParam(userId), [userId])
  const shareLink = useMemo(
    () => (shareBase ? buildShareLink(shareBase, bookingStartParam) : ''),
    [bookingStartParam, shareBase]
  )
  const displayName = displayNameFallback.trim()
  const masterLabel = displayName ? `у мастера ${displayName}` : 'у мастера'

  const [activeTab, setActiveTab] = useState<
    'broadcast' | 'repeat' | 'promotions'
  >('broadcast')
  const [broadcastChannel, setBroadcastChannel] = useState<'bot' | 'chat'>('bot')
  const [broadcastDraft, setBroadcastDraft] = useState('')
  const [broadcastTemplateOpen, setBroadcastTemplateOpen] = useState(false)
  const [broadcastTemplateId, setBroadcastTemplateId] = useState<string | null>(null)
  const [broadcastTemplatePlacement, setBroadcastTemplatePlacement] = useState<
    'down' | 'up'
  >('down')
  const [broadcastSegment, setBroadcastSegment] =
    useState<BroadcastSegment>('all')
  const [broadcastDiscountEnabled, setBroadcastDiscountEnabled] = useState(false)
  const [broadcastDiscountPercent, setBroadcastDiscountPercent] = useState(
    PROMOTION_DISCOUNT_OPTIONS[1]
  )
  const [broadcastDiscountDuration, setBroadcastDiscountDuration] = useState(
    BROADCAST_DISCOUNT_DURATION_OPTIONS[2]
  )
  const [repeatSettings, setRepeatSettings] = useState<RepeatSettings | null>(null)
  const [repeatLoading, setRepeatLoading] = useState(true)
  const [repeatError, setRepeatError] = useState('')
  const [repeatSaving, setRepeatSaving] = useState(false)
  const [repeatTemplateDraft, setRepeatTemplateDraft] = useState('')
  const [repeatIntervalsDraft, setRepeatIntervalsDraft] = useState<Record<string, number>>({})
  const [repeatDraftInitialized, setRepeatDraftInitialized] = useState(false)
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [promotionsLoading, setPromotionsLoading] = useState(true)
  const [promotionsError, setPromotionsError] = useState('')
  const [promotionsSaving, setPromotionsSaving] = useState(false)
  const [repeatAdvancedOpen, setRepeatAdvancedOpen] = useState(false)
  const [promotionHistoryOpen, setPromotionHistoryOpen] = useState(false)
  const [promotionDraft, setPromotionDraft] = useState<PromotionDraft>({
    type: 'discount',
    title: '',
    description: '',
    durationDays: PROMOTION_DURATION_OPTIONS[1],
    discountPercent: PROMOTION_DISCOUNT_OPTIONS[1],
  })

  const [marketingSummary, setMarketingSummary] = useState<MarketingSummary | null>(null)
  const [marketingLoading, setMarketingLoading] = useState(true)
  const [marketingError, setMarketingError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [status, setStatus] = useState('')
  const [sendError, setSendError] = useState('')
  const statusTimerRef = useRef<number | null>(null)
  const marketingAbortRef = useRef<AbortController | null>(null)
  const broadcastTemplateRef = useRef<HTMLDivElement | null>(null)

  const resolveBroadcastTemplatePlacement = useCallback(() => {
    const wrapper = broadcastTemplateRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    const viewportHeight = window.innerHeight || 0
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top
    const shouldOpenUp =
      spaceBelow < TEMPLATE_MENU_ESTIMATED_HEIGHT && spaceAbove > spaceBelow
    setBroadcastTemplatePlacement(shouldOpenUp ? 'up' : 'down')
  }, [])

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
    resolveBroadcastTemplatePlacement()
    const handleViewportChange = () => {
      resolveBroadcastTemplatePlacement()
    }
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
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [broadcastTemplateOpen, resolveBroadcastTemplatePlacement])

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
    setPromotionsLoading(true)
    setPromotionsError('')

    try {
      const summaryUrl = `${apiBase}/api/pro/marketing/summary?userId=${encodeURIComponent(
        userId
      )}`
      const repeatUrl = `${apiBase}/api/pro/marketing/repeat-settings?userId=${encodeURIComponent(
        userId
      )}`
      const promotionsUrl = `${apiBase}/api/pro/marketing/promotions?userId=${encodeURIComponent(
        userId
      )}`
      const [summaryRes, repeatRes, promotionsRes] = await Promise.all([
        fetch(summaryUrl, { signal: controller.signal }),
        fetch(repeatUrl, { signal: controller.signal }),
        fetch(promotionsUrl, { signal: controller.signal }),
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

      if (promotionsRes.ok) {
        const promotionsPayload = await promotionsRes.json().catch(() => [])
        if (!controller.signal.aborted) {
          setPromotions(
            Array.isArray(promotionsPayload) ? promotionsPayload : []
          )
        }
      } else {
        setPromotionsError('Не удалось загрузить акции.')
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setMarketingError('Не удалось загрузить данные рассылок. Повторите позже.')
      setRepeatError('Не удалось загрузить авто-напоминания.')
      setPromotionsError('Не удалось загрузить акции.')
    } finally {
      if (!controller.signal.aborted) {
        setMarketingLoading(false)
        setRepeatLoading(false)
        setPromotionsLoading(false)
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
    setPromotions([])
    setPromotionDraft({
      type: 'discount',
      title: '',
      description: '',
      durationDays: PROMOTION_DURATION_OPTIONS[1],
      discountPercent: PROMOTION_DISCOUNT_OPTIONS[1],
    })
    setBroadcastSegment('all')
    setBroadcastDiscountEnabled(false)
    setBroadcastDiscountPercent(PROMOTION_DISCOUNT_OPTIONS[1])
    setBroadcastDiscountDuration(BROADCAST_DISCOUNT_DURATION_OPTIONS[2])
  }, [userId])

  const broadcastTemplates: Template[] = useMemo(() => {
    const slotsText = `Привет! ${masterLabel} появились свободные окна на ближайшие дни. Если хотите записаться, выберите время по кнопке ниже.`
    const promoText = `Есть приятная новость ${masterLabel}: действует спецпредложение для записи. Если интересно, выберите время по кнопке ниже.`
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
        title: 'Спецпредложение',
        description: 'Короткое предложение для записи.',
        text: promoText,
      },
      {
        id: 'news',
        title: 'Новости',
        description: 'Новые работы, портфолио и идеи.',
        text: newsText,
      },
    ]
  }, [masterLabel])

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
  const isBroadcastDiscountInvalid =
    broadcastDiscountEnabled &&
    (broadcastDiscountPercent <= 0 ||
      broadcastDiscountDuration <= 0 ||
      broadcastDiscountDuration > 7)
  const canSend =
    Boolean(payloadText) &&
    !isTextTooLong &&
    !isSending &&
    broadcastHasAudience &&
    !isBroadcastDiscountInvalid

  const channelHint =
    broadcastChannel === 'bot'
      ? 'Сообщение уйдет подписчикам рассылки через бот.'
      : 'Сообщение появится в активных чатах с клиентами.'
  const broadcastAudienceLabel =
    broadcastChannel === 'bot' ? 'подписчикам' : 'клиентам'
  const broadcastSegmentLabel =
    broadcastSegment === 'new'
      ? 'новым'
      : broadcastSegment === 'regular'
        ? 'постоянным'
        : 'всем'
  const broadcastDiscountNote = broadcastDiscountEnabled
    ? `Скидка -${broadcastDiscountPercent}% · ${broadcastSegmentLabel} ${broadcastAudienceLabel} на ${broadcastDiscountDuration} дн.`
    : ''

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

  useEffect(() => {
    if (repeatDraftDirty) {
      setRepeatAdvancedOpen(true)
    }
  }, [repeatDraftDirty])

  useEffect(() => {
    if (!repeatSettings) return
    const hasCustomIntervals =
      repeatSettings.intervals &&
      typeof repeatSettings.intervals === 'object' &&
      Object.keys(repeatSettings.intervals).length > 0
    const hasTemplate = Boolean(repeatSettings.template?.trim())
    if (hasCustomIntervals || hasTemplate) {
      setRepeatAdvancedOpen(true)
    }
  }, [repeatSettings])

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
          segment: broadcastSegment,
          includeLink: broadcastChannel === 'bot' && includeLinkEnabled,
          includeUnsubscribe: broadcastChannel === 'bot' && includeUnsubscribeEnabled,
          discount: broadcastDiscountEnabled
            ? {
                discountPercent: broadcastDiscountPercent,
                durationDays: broadcastDiscountDuration,
              }
            : null,
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
        if (data?.error === 'promotion_requirements') {
          showStatus('Нужны аватар и минимум 1 работа в портфолио.', true)
          return
        }
        if (data?.error === 'campaign_discount_invalid') {
          showStatus('Укажите корректную скидку.', true)
          return
        }
        if (data?.error === 'campaign_duration_invalid') {
          showStatus('Срок скидки должен быть от 1 до 7 дней.', true)
          return
        }
        if (data?.error === 'audience_empty') {
          showStatus('Нет получателей для рассылки.', true)
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
    broadcastDiscountDuration,
    broadcastDiscountEnabled,
    broadcastDiscountPercent,
    broadcastSegment,
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

  const promotionTitleLength = promotionDraft.title.trim().length
  const promotionDescriptionLength = promotionDraft.description.trim().length
  const isPromotionTitleTooLong = promotionTitleLength > PROMOTION_TITLE_LIMIT
  const isPromotionDescriptionTooLong =
    promotionDescriptionLength > PROMOTION_DESCRIPTION_LIMIT
  const isPromotionDiscountInvalid =
    promotionDraft.type === 'discount' && promotionDraft.discountPercent <= 0
  const canSavePromotion =
    promotionTitleLength > 0 &&
    !isPromotionTitleTooLong &&
    !isPromotionDescriptionTooLong &&
    !isPromotionDiscountInvalid &&
    !promotionsSaving

  const resolvePromotionTypeLabel = useCallback(
    (value: Promotion['type']) =>
      PROMOTION_TYPES.find((item) => item.id === value)?.label ?? 'Акция',
    []
  )
  const resolvePromotionStatus = useCallback((promotion: Promotion) => {
    const now = Date.now()
    const startMs = Date.parse(promotion.startAt)
    const endMs = Date.parse(promotion.endAt)
    const isExpired = Number.isFinite(endMs) && endMs <= now
    if (promotion.status === 'archived' || isExpired) {
      return { label: 'Завершена', tone: 'is-ended', canPause: false, canResume: false, isExpired }
    }
    if (promotion.status === 'paused') {
      return { label: 'Пауза', tone: 'is-paused', canPause: false, canResume: true, isExpired }
    }
    if (Number.isFinite(startMs) && startMs > now) {
      return { label: 'Запланирована', tone: 'is-scheduled', canPause: true, canResume: false, isExpired }
    }
    return { label: 'Активна', tone: 'is-active', canPause: true, canResume: false, isExpired }
  }, [])

  const handlePromotionSave = useCallback(async () => {
    if (!userId) return
    if (isPromotionTitleTooLong) {
      showStatus('Название акции слишком длинное.', true)
      return
    }
    if (isPromotionDescriptionTooLong) {
      showStatus('Описание акции слишком длинное.', true)
      return
    }
    if (!promotionTitleLength) {
      showStatus('Заполните название акции.', true)
      return
    }
    if (isPromotionDiscountInvalid) {
      showStatus('Укажите размер скидки.', true)
      return
    }
    setPromotionsSaving(true)
    setPromotionsError('')
    const startAt = new Date()
    const endAt = new Date(startAt.getTime() + promotionDraft.durationDays * 24 * 60 * 60 * 1000)
    try {
      const response = await fetch(`${apiBase}/api/pro/marketing/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: promotionDraft.type,
          title: promotionDraft.title.trim(),
          description: promotionDraft.description.trim(),
          discountPercent:
            promotionDraft.type === 'discount'
              ? promotionDraft.discountPercent
              : 0,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          status: 'active',
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const errorCode = data?.error
        if (errorCode === 'promotion_requirements') {
          showStatus('Нужны аватар и минимум 1 работа в портфолио.', true)
          return
        }
        if (errorCode === 'duration_too_long') {
          showStatus('Максимальный срок акции — 14 дней.', true)
          return
        }
        if (errorCode === 'discount_required') {
          showStatus('Укажите размер скидки.', true)
          return
        }
        throw new Error(errorCode || 'promotion_save_failed')
      }
      const promotion = data as Promotion
      setPromotions((prev) => [
        promotion,
        ...prev.filter((item) => item.id !== promotion.id),
      ])
      setPromotionDraft((prev) => ({
        ...prev,
        title: '',
        description: '',
      }))
      showStatus('Акция запущена.')
    } catch (error) {
      setPromotionsError('Не удалось сохранить акцию.')
    } finally {
      setPromotionsSaving(false)
    }
  }, [
    apiBase,
    isPromotionDiscountInvalid,
    isPromotionDescriptionTooLong,
    isPromotionTitleTooLong,
    promotionDraft,
    promotionTitleLength,
    showStatus,
    userId,
  ])

  const handlePromotionAction = useCallback(
    async (promotionId: number, action: 'pause' | 'resume' | 'archive') => {
      if (!userId) return
      setPromotionsSaving(true)
      setPromotionsError('')
      try {
        const response = await fetch(
          `${apiBase}/api/pro/marketing/promotions/${promotionId}/action`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action }),
          }
        )
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          const errorCode = data?.error
          if (errorCode === 'promotion_requirements') {
            showStatus('Нужны аватар и минимум 1 работа в портфолио.', true)
            return
          }
          if (errorCode === 'promotion_expired') {
            showStatus('Срок акции истёк.', true)
            return
          }
          throw new Error(errorCode || 'promotion_action_failed')
        }
        const promotion = data as Promotion
        setPromotions((prev) => [
          promotion,
          ...prev.filter((item) => item.id !== promotion.id),
        ])
        showStatus('Готово.')
      } catch (error) {
        setPromotionsError('Не удалось обновить акцию.')
      } finally {
        setPromotionsSaving(false)
      }
    },
    [apiBase, showStatus, userId]
  )

  const handlePromotionExtend = useCallback(
    async (promotion: Promotion) => {
      if (!userId) return
      const startAt = new Date(promotion.startAt)
      const endAt = new Date(promotion.endAt)
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        showStatus('Не удалось продлить акцию.', true)
        return
      }
      const currentDuration =
        Math.ceil((endAt.getTime() - startAt.getTime()) / (24 * 60 * 60 * 1000))
      if (currentDuration >= PROMOTION_MAX_DURATION_DAYS) {
        showStatus('Максимальный срок акции — 14 дней.', true)
        return
      }
      const nextEnd = new Date(endAt.getTime() + 7 * 24 * 60 * 60 * 1000)
      setPromotionsSaving(true)
      setPromotionsError('')
      try {
        const response = await fetch(`${apiBase}/api/pro/marketing/promotions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            promotionId: promotion.id,
            endAt: nextEnd.toISOString(),
          }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          const errorCode = data?.error
          if (errorCode === 'promotion_requirements') {
            showStatus('Нужны аватар и минимум 1 работа в портфолио.', true)
            return
          }
          if (errorCode === 'duration_too_long') {
            showStatus('Максимальный срок акции — 14 дней.', true)
            return
          }
          throw new Error(errorCode || 'promotion_extend_failed')
        }
        const updated = data as Promotion
        setPromotions((prev) => [
          updated,
          ...prev.filter((item) => item.id !== updated.id),
        ])
        showStatus('Акция продлена на 7 дней.')
      } catch (error) {
        setPromotionsError('Не удалось продлить акцию.')
      } finally {
        setPromotionsSaving(false)
      }
    },
    [apiBase, showStatus, userId]
  )

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

  const activePromotion = useMemo(() => {
    return (
      promotions.find((promotion) => {
        const status = resolvePromotionStatus(promotion)
        return status.label === 'Активна' || status.label === 'Запланирована'
      }) ?? null
    )
  }, [promotions, resolvePromotionStatus])

  const promotionHistory = useMemo(
    () => promotions.filter((promotion) => promotion.id !== activePromotion?.id),
    [activePromotion?.id, promotions]
  )

  const broadcastTabAttention =
    Boolean(broadcastDraft.trim()) || broadcastDiscountEnabled
  const repeatTabAttention = repeatEnabled || repeatDraftDirty
  const promotionsTabAttention = Boolean(activePromotion)

  return (
    <div className="screen screen--pro screen--pro-detail screen--pro-marketing">
      <div className="pro-detail-shell">
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
        {marketingError && (
          <p className="pro-detail-warning" role="alert">
            {marketingError}
          </p>
        )}

        <div className="pro-marketing-tabbar-wrap">
          <p className="pro-marketing-tabbar-caption">Сценарии продвижения</p>
          <div className="pro-marketing-tabbar" role="tablist">
            <button
              className={`pro-marketing-tab${activeTab === 'broadcast' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setActiveTab('broadcast')}
              role="tab"
              aria-selected={activeTab === 'broadcast'}
            >
              <span className="pro-marketing-tab-label">Рассылка</span>
              {broadcastTabAttention && (
                <span className="pro-marketing-tab-dot" aria-hidden="true" />
              )}
            </button>
            <button
              className={`pro-marketing-tab${activeTab === 'repeat' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setActiveTab('repeat')}
              role="tab"
              aria-selected={activeTab === 'repeat'}
            >
              <span className="pro-marketing-tab-label">Повтор</span>
              {repeatTabAttention && (
                <span className="pro-marketing-tab-dot" aria-hidden="true" />
              )}
            </button>
            <button
              className={`pro-marketing-tab${activeTab === 'promotions' ? ' is-active' : ''}`}
              type="button"
              onClick={() => setActiveTab('promotions')}
              role="tab"
              aria-selected={activeTab === 'promotions'}
            >
              <span className="pro-marketing-tab-label">Акции</span>
              {promotionsTabAttention && (
                <span className="pro-marketing-tab-dot" aria-hidden="true" />
              )}
            </button>
          </div>
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

            <div className="pro-marketing-discount">
              <span className="pro-marketing-promo-label">Аудитория</span>
              <div
                className="pro-marketing-promo-chip-row"
                role="group"
                aria-label="Сегмент аудитории"
              >
                {BROADCAST_SEGMENTS.map((item) => (
                  <button
                    key={`broadcast-segment-${item.id}`}
                    className={`pro-marketing-promo-chip${
                      broadcastSegment === item.id ? ' is-active' : ''
                    }`}
                    type="button"
                    onClick={() => setBroadcastSegment(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pro-marketing-discount">
              <div className="pro-marketing-discount-head">
                <span className="pro-marketing-promo-label">Скидка в рассылке</span>
                <div className="pro-marketing-toggle">
                  <button
                    className={`pro-marketing-auto-toggle${
                      broadcastDiscountEnabled ? ' is-active' : ''
                    }`}
                    type="button"
                    role="switch"
                    aria-checked={broadcastDiscountEnabled}
                    aria-label="Скидка в рассылке"
                    onClick={() =>
                      setBroadcastDiscountEnabled((current) => !current)
                    }
                    disabled={isSending}
                  />
                  <span className="pro-marketing-auto-toggle-text">
                    {broadcastDiscountEnabled ? 'Вкл' : 'Выкл'}
                  </span>
                </div>
              </div>
              {broadcastDiscountEnabled && (
                <>
                  <div
                    className="pro-marketing-promo-chip-row"
                    role="group"
                    aria-label="Размер скидки"
                  >
                    {PROMOTION_DISCOUNT_OPTIONS.map((value) => (
                      <button
                        key={`broadcast-discount-${value}`}
                        className={`pro-marketing-promo-chip${
                          broadcastDiscountPercent === value ? ' is-active' : ''
                        }`}
                        type="button"
                        onClick={() => setBroadcastDiscountPercent(value)}
                      >
                        -{value}%
                      </button>
                    ))}
                  </div>
                  <div
                    className="pro-marketing-promo-chip-row"
                    role="group"
                    aria-label="Срок скидки"
                  >
                    {BROADCAST_DISCOUNT_DURATION_OPTIONS.map((value) => (
                      <button
                        key={`broadcast-discount-duration-${value}`}
                        className={`pro-marketing-promo-chip${
                          broadcastDiscountDuration === value ? ' is-active' : ''
                        }`}
                        type="button"
                        onClick={() => setBroadcastDiscountDuration(value)}
                      >
                        {value} дн.
                      </button>
                    ))}
                  </div>
                </>
              )}
              {broadcastDiscountNote && (
                <p className="pro-detail-text is-muted">{broadcastDiscountNote}</p>
              )}
              {broadcastDiscountEnabled && activePromotion && (
                <p className="pro-detail-text is-muted">
                  Скидка из рассылки действует отдельно от акций.
                </p>
              )}
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
                    className={`pro-marketing-select-menu${
                      broadcastTemplatePlacement === 'up' ? ' is-up' : ''
                    }`}
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
        ) : activeTab === 'repeat' ? (
          <section className="pro-detail-card pro-marketing-panel pro-marketing-repeat animate delay-1">
            <div className="pro-detail-card-head pro-marketing-repeat-head">
              <div className="pro-marketing-repeat-heading">
                <h2>Повтор</h2>
                <p className="pro-marketing-repeat-subtitle">
                  Авто-напоминания
                </p>
              </div>
              <div className="pro-marketing-toggle">
                <button
                  className={`pro-marketing-auto-toggle${
                    repeatEnabled ? ' is-active' : ''
                  }`}
                  type="button"
                  role="switch"
                  aria-checked={repeatEnabled}
                  aria-label="Авто-напоминания"
                  onClick={() =>
                    void saveRepeatSettings(
                      { enabled: !repeatEnabled },
                      { preserveDraft: true }
                    )
                  }
                  disabled={repeatLoading || repeatSaving}
                />
                <span className="pro-marketing-auto-toggle-text">
                  {repeatSaving ? '...' : repeatEnabled ? 'Вкл' : 'Выкл'}
                </span>
              </div>
            </div>
            <p className="pro-marketing-repeat-note">
              Проверяем каждые 12 часов. Если нет будущей записи — отправим.
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
                    Ожидают повтор
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

            <button
              className={`pro-marketing-disclosure${
                repeatAdvancedOpen ? ' is-open' : ''
              }`}
              type="button"
              onClick={() => setRepeatAdvancedOpen((current) => !current)}
            >
              Настроить сроки и текст
            </button>

            {repeatAdvancedOpen && (
              <>
                <div className="pro-marketing-repeat-surface">
                  <p className="pro-marketing-section">Сроки по услугам</p>
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
                              onClick={() =>
                                handleRepeatIntervalAdjust(item.id, -1)
                              }
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
                              onClick={() =>
                                handleRepeatIntervalAdjust(item.id, 1)
                              }
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
                      placeholder="Шаблон напоминания (необязательно)"
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
                  <div className="pro-marketing-preview-card">
                    {repeatPreviewText}
                  </div>
                  {repeatChannel === 'bot' && (
                    <p className="pro-marketing-repeat-hint">
                      В боте добавим кнопку записи.
                    </p>
                  )}
                </div>
              </>
            )}

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
        ) : (
          <section className="pro-detail-card pro-marketing-panel pro-marketing-promotions animate delay-1">
            <div className="pro-detail-card-head">
              <h2>Акции</h2>
            </div>
            <p className="pro-detail-text">
              Запускайте короткие предложения, чтобы быстрее заполнить записи.
            </p>

            {promotionsLoading && (
              <p className="pro-detail-status" role="status">
                Загружаем акции...
              </p>
            )}
            {promotionsError && (
              <p className="pro-detail-warning" role="alert">
                {promotionsError}
              </p>
            )}

            {activePromotion ? (
              <div className="pro-marketing-promo-card">
                {(() => {
                  const statusMeta = resolvePromotionStatus(activePromotion)
                  const dateLabel = formatShortDate(activePromotion.endAt)
                  const discountLabel =
                    activePromotion.type === 'discount' &&
                    typeof activePromotion.discountPercent === 'number' &&
                    activePromotion.discountPercent > 0
                      ? `Скидка -${activePromotion.discountPercent}%`
                      : ''
                  return (
                    <>
                      <div className="pro-marketing-promo-head">
                        <div className="pro-marketing-promo-title-wrap">
                          <span
                            className={`pro-marketing-promo-status ${statusMeta.tone}`}
                          >
                            {statusMeta.label}
                          </span>
                          <span className="pro-marketing-promo-title">
                            {activePromotion.title}
                          </span>
                        </div>
                        <span className="pro-marketing-promo-type">
                          {resolvePromotionTypeLabel(activePromotion.type)}
                        </span>
                      </div>
                      {activePromotion.description && (
                        <p className="pro-marketing-promo-text">
                          {activePromotion.description}
                        </p>
                      )}
                      {(dateLabel || discountLabel) && (
                        <div className="pro-marketing-promo-meta">
                          {discountLabel && <span>{discountLabel}</span>}
                          {dateLabel && <span>до {dateLabel}</span>}
                        </div>
                      )}
                      <div className="pro-detail-actions pro-detail-actions--compact">
                        {(() => {
                          const startAt = new Date(activePromotion.startAt)
                          const endAt = new Date(activePromotion.endAt)
                          const durationDays =
                            Number.isNaN(startAt.getTime()) ||
                            Number.isNaN(endAt.getTime())
                              ? PROMOTION_MAX_DURATION_DAYS
                              : Math.ceil(
                                  (endAt.getTime() - startAt.getTime()) /
                                    (24 * 60 * 60 * 1000)
                                )
                          const canExtend = durationDays < PROMOTION_MAX_DURATION_DAYS
                          return (
                            <button
                              className="pro-detail-action"
                              type="button"
                              onClick={() => void handlePromotionExtend(activePromotion)}
                              disabled={promotionsSaving || !canExtend}
                            >
                              +7 дней
                            </button>
                          )
                        })()}
                        {statusMeta.canPause && (
                          <button
                            className="pro-detail-action is-ghost"
                            type="button"
                            onClick={() =>
                              void handlePromotionAction(activePromotion.id, 'pause')
                            }
                            disabled={promotionsSaving}
                          >
                            Пауза
                          </button>
                        )}
                        {statusMeta.canResume && (
                          <button
                            className="pro-detail-action"
                            type="button"
                            onClick={() =>
                              void handlePromotionAction(activePromotion.id, 'resume')
                            }
                            disabled={promotionsSaving}
                          >
                            Возобновить
                          </button>
                        )}
                        <button
                          className="pro-detail-action is-ghost"
                          type="button"
                          onClick={() =>
                            void handlePromotionAction(activePromotion.id, 'archive')
                          }
                          disabled={promotionsSaving || statusMeta.tone === 'is-ended'}
                        >
                          В архив
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : (
              !promotionsLoading && (
                <p className="pro-detail-empty">
                  Пока нет активных акций. Создайте первую — клиенты увидят её в
                  подборке и разделе «Акции».
                </p>
              )
            )}

            {promotionHistory.length > 0 && (
              <div className="pro-marketing-promo-history">
                <button
                  className={`pro-marketing-disclosure${
                    promotionHistoryOpen ? ' is-open' : ''
                  }`}
                  type="button"
                  onClick={() => setPromotionHistoryOpen((current) => !current)}
                >
                  История
                </button>
                {promotionHistoryOpen && (
                  <div className="pro-marketing-promo-list">
                    {promotionHistory.map((promotion) => {
                      const statusMeta = resolvePromotionStatus(promotion)
                      const dateLabel = formatShortDate(promotion.endAt)
                      const discountLabel =
                        promotion.type === 'discount' &&
                        typeof promotion.discountPercent === 'number' &&
                        promotion.discountPercent > 0
                          ? `Скидка -${promotion.discountPercent}%`
                          : ''
                      return (
                        <div
                          className="pro-marketing-promo-card is-compact"
                          key={promotion.id}
                        >
                          <div className="pro-marketing-promo-head">
                            <div className="pro-marketing-promo-title-wrap">
                              <span
                                className={`pro-marketing-promo-status ${statusMeta.tone}`}
                              >
                                {statusMeta.label}
                              </span>
                              <span className="pro-marketing-promo-title">
                                {promotion.title}
                              </span>
                            </div>
                            <span className="pro-marketing-promo-type">
                              {resolvePromotionTypeLabel(promotion.type)}
                            </span>
                          </div>
                          {(dateLabel || discountLabel) && (
                            <div className="pro-marketing-promo-meta">
                              {discountLabel && <span>{discountLabel}</span>}
                              {dateLabel && <span>до {dateLabel}</span>}
                            </div>
                          )}
                          <div className="pro-detail-actions pro-detail-actions--compact">
                            {statusMeta.canResume && (
                              <button
                                className="pro-detail-action"
                                type="button"
                                onClick={() =>
                                  void handlePromotionAction(promotion.id, 'resume')
                                }
                                disabled={promotionsSaving}
                              >
                                Возобновить
                              </button>
                            )}
                            {statusMeta.canPause && (
                              <button
                                className="pro-detail-action is-ghost"
                                type="button"
                                onClick={() =>
                                  void handlePromotionAction(promotion.id, 'pause')
                                }
                                disabled={promotionsSaving}
                              >
                                Пауза
                              </button>
                            )}
                            {statusMeta.tone !== 'is-ended' && (
                              <button
                                className="pro-detail-action is-ghost"
                                type="button"
                                onClick={() =>
                                  void handlePromotionAction(promotion.id, 'archive')
                                }
                                disabled={promotionsSaving}
                              >
                                В архив
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="pro-marketing-promo-form">
              <p className="pro-marketing-section">Новая акция</p>
              {activePromotion && (
                <p className="pro-marketing-promo-hint">
                  Новая акция поставит текущую на паузу.
                </p>
              )}

              <div className="pro-marketing-promo-field">
                <span className="pro-marketing-promo-label">Тип</span>
                <div className="pro-marketing-promo-chip-row" role="group" aria-label="Тип акции">
                  {PROMOTION_TYPES.map((item) => (
                    <button
                      key={`promo-type-${item.id}`}
                      className={`pro-marketing-promo-chip${
                        promotionDraft.type === item.id ? ' is-active' : ''
                      }`}
                      type="button"
                      onClick={() =>
                        setPromotionDraft((prev) => ({ ...prev, type: item.id }))
                      }
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {promotionDraft.type === 'discount' && (
                <div className="pro-marketing-promo-field">
                  <span className="pro-marketing-promo-label">Скидка</span>
                  <div
                    className="pro-marketing-promo-chip-row"
                    role="group"
                    aria-label="Размер скидки"
                  >
                    {PROMOTION_DISCOUNT_OPTIONS.map((value) => (
                      <button
                        key={`promo-discount-${value}`}
                        className={`pro-marketing-promo-chip${
                          promotionDraft.discountPercent === value ? ' is-active' : ''
                        }`}
                        type="button"
                        onClick={() =>
                          setPromotionDraft((prev) => ({
                            ...prev,
                            discountPercent: value,
                          }))
                        }
                      >
                        -{value}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pro-marketing-promo-field">
                <span className="pro-marketing-promo-label">Название</span>
                <input
                  className={`pro-marketing-input${
                    isPromotionTitleTooLong ? ' is-error' : ''
                  }`}
                  value={promotionDraft.title}
                  onChange={(event) =>
                    setPromotionDraft((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Например, -10% на ближайшую запись"
                />
                <span
                  className={`pro-marketing-count${
                    isPromotionTitleTooLong ? ' is-error' : ''
                  }`}
                >
                  {promotionTitleLength}/{PROMOTION_TITLE_LIMIT}
                </span>
              </div>

              <div className="pro-marketing-promo-field">
                <span className="pro-marketing-promo-label">Описание</span>
                <textarea
                  className={`pro-marketing-textarea pro-marketing-textarea--compact${
                    isPromotionDescriptionTooLong ? ' is-error' : ''
                  }`}
                  value={promotionDraft.description}
                  onChange={(event) =>
                    setPromotionDraft((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Коротко опишите условия"
                  rows={3}
                />
                <span
                  className={`pro-marketing-count${
                    isPromotionDescriptionTooLong ? ' is-error' : ''
                  }`}
                >
                  {promotionDescriptionLength}/{PROMOTION_DESCRIPTION_LIMIT}
                </span>
              </div>

              <div className="pro-marketing-promo-field">
                <span className="pro-marketing-promo-label">Срок</span>
                <div className="pro-marketing-promo-chip-row" role="group" aria-label="Срок акции">
                  {PROMOTION_DURATION_OPTIONS.map((value) => (
                    <button
                      key={`promo-duration-${value}`}
                      className={`pro-marketing-promo-chip${
                        promotionDraft.durationDays === value ? ' is-active' : ''
                      }`}
                      type="button"
                      onClick={() =>
                        setPromotionDraft((prev) => ({ ...prev, durationDays: value }))
                      }
                    >
                      {value} дн.
                    </button>
                  ))}
                </div>
              </div>

              <div className="pro-detail-actions">
                <button
                  className="pro-detail-action"
                  type="button"
                  onClick={() => void handlePromotionSave()}
                  disabled={!canSavePromotion}
                >
                  {promotionsSaving ? 'Сохраняем...' : 'Запустить акцию'}
                </button>
              </div>
              {status && (
                <p className="pro-detail-status" role="status">
                  {status}
                </p>
              )}
            </div>
          </section>
        )}

      </div>

      <ProBottomNav
        active="cabinet"
        onCabinet={onViewCabinet ?? onBack}
        onRequests={onViewRequests}
        onChats={onViewChats}
        onProfile={onEditProfile}
        allowActiveClick
      />
    </div>
  )
}
