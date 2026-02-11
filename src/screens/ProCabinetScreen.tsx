import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import {
  IconCalendar,
  IconChat,
  IconDashboard,
  IconList,
  IconShowcase,
  IconStories,
  IconSupport,
  IconUsers,
} from '../components/icons'
import { useProCabinetData, type ClientSummary } from '../hooks/useProCabinetData'
import type {
  MarketingSummary,
  MasterProfile,
  ProProfileSection,
  Promotion,
} from '../types/app'
import {
  isImageUrl,
  parsePortfolioItems,
  type PortfolioItem,
} from '../utils/profileContent'

const DAY_MS = 24 * 60 * 60 * 1000

const toDateKey = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatShortDate = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(
    value
  )

const formatWeekday = (value: Date) =>
  new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
    .format(value)
    .replace('.', '')

const formatCountLabel = (
  value: number,
  one: string,
  few: string,
  many: string
) => {
  const abs = Math.abs(value)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const formatVisits = (value: number) =>
  `${value} ${formatCountLabel(value, 'визит', 'визита', 'визитов')}`

const formatRelativeDay = (value: Date) => {
  if (Number.isNaN(value.getTime())) return 'без даты'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(value)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / DAY_MS)
  if (diffDays === 0) return 'сегодня'
  if (diffDays === -1) return 'вчера'
  return formatShortDate(value)
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value))

const resolvePortfolioFocus = (item?: PortfolioItem | null) => {
  const rawX = typeof item?.focusX === 'number' ? item.focusX : 0.5
  const rawY = typeof item?.focusY === 'number' ? item.focusY : 0.5
  const x = clampUnit(rawX)
  const y = clampUnit(rawY)
  return {
    x,
    y,
    position: `${x * 100}% ${y * 100}%`,
  }
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

const formatClientMeta = (client: ClientSummary) => {
  const visits = formatVisits(client.count)
  if (!client.lastSeenTime) return `без даты · ${visits}`
  return `${formatRelativeDay(new Date(client.lastSeenTime))} · ${visits}`
}

const showcaseSlotClasses = ['is-a', 'is-b', 'is-c', 'is-d'] as const

type MasterJourneyStepId = 'profile' | 'flow' | 'growth' | 'retention'

type MasterJourneyStepStatus = 'done' | 'active' | 'todo'

type MasterJourneyDraftStep = {
  id: MasterJourneyStepId
  chipLabel: string
  title: string
  subtitle: string
  actionLabel: string
  onAction: () => void
  isDone: boolean
}

type MasterJourneyStep = Omit<MasterJourneyDraftStep, 'isDone'> & {
  status: MasterJourneyStepStatus
}

type ProfileLoadState = 'loading' | 'ready' | 'missing' | 'error'

const toMasterJourneySteps = (draft: MasterJourneyDraftStep[]) => {
  let locked = false
  return draft.map<MasterJourneyStep>((step) => {
    const { isDone, ...rest } = step
    if (locked) {
      return { ...rest, status: 'todo' }
    }
    if (isDone) {
      return { ...rest, status: 'done' }
    }
    locked = true
    return { ...rest, status: 'active' }
  })
}

type ProCabinetScreenProps = {
  apiBase: string
  userId: string
  telegramAvatarUrl?: string | null
  onEditProfile: (section?: ProProfileSection) => void
  onViewRequests: () => void
  onViewChats: () => void
  onOpenAnalytics: () => void
  onOpenClients: () => void
  onOpenMarketing: () => void
  onOpenCalendar: () => void
  onOpenShowcase: () => void
  onOpenStories: () => void
  onOpenSupport: () => void
}

export const ProCabinetScreen = ({
  apiBase,
  userId,
  telegramAvatarUrl,
  onEditProfile,
  onViewRequests,
  onViewChats,
  onOpenAnalytics,
  onOpenClients,
  onOpenMarketing,
  onOpenCalendar,
  onOpenShowcase,
  onOpenStories,
  onOpenSupport,
}: ProCabinetScreenProps) => {
  const {
    requestStats,
    bookingStats,
    bookings,
    isLoading,
    combinedError,
    refresh,
  } =
    useProCabinetData(
    apiBase,
    userId
  )
  const [showcasePreview, setShowcasePreview] = useState<PortfolioItem[]>([])
  const [profileData, setProfileData] = useState<MasterProfile | null>(null)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
  const [profileDisplayName, setProfileDisplayName] = useState('')
  const [profileLoadState, setProfileLoadState] =
    useState<ProfileLoadState>('loading')
  const [activeStoriesCount, setActiveStoriesCount] = useState(0)
  const [marketingSummary, setMarketingSummary] = useState<MarketingSummary | null>(
    null
  )
  const [promotions, setPromotions] = useState<Promotion[]>([])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadCabinetMeta = async () => {
      try {
        setProfileLoadState('loading')
        const encodedUserId = encodeURIComponent(userId)
        const profileUrl = `${apiBase}/api/masters/${encodedUserId}?userId=${encodedUserId}`
        const storiesUrl = `${apiBase}/api/masters/${encodedUserId}/stories`
        const marketingSummaryUrl = `${apiBase}/api/pro/marketing/summary?userId=${encodedUserId}`
        const promotionsUrl = `${apiBase}/api/pro/marketing/promotions?userId=${encodedUserId}`
        const [
          profileResult,
          storiesResult,
          marketingSummaryResult,
          promotionsResult,
        ] = await Promise.allSettled([
          fetch(profileUrl),
          fetch(storiesUrl),
          fetch(marketingSummaryUrl),
          fetch(promotionsUrl),
        ])

        if (cancelled) return

        if (profileResult.status === 'fulfilled' && profileResult.value.ok) {
          const data = (await profileResult.value.json().catch(() => null)) as
            | MasterProfile
            | null
          if (!data) {
            throw new Error('Load profile failed')
          }
          const showcaseItems = parsePortfolioItems(data.showcaseUrls ?? [])
          const portfolioItems = parsePortfolioItems(data.portfolioUrls ?? [])
          const previewSource =
            showcaseItems.length > 0 ? showcaseItems : portfolioItems
          const imageItems = previewSource.filter((item) => isImageUrl(item.url))
          const previewItems = (
            imageItems.length > 0 ? imageItems : previewSource
          ).slice(0, 2)
          setProfileData(data)
          setShowcasePreview(previewItems)
          setProfileAvatarUrl(data.avatarUrl ?? null)
          setProfileDisplayName(data.displayName ?? '')
          setProfileLoadState('ready')
        } else if (
          profileResult.status === 'fulfilled' &&
          profileResult.value.status === 404
        ) {
          setProfileData(null)
          setShowcasePreview([])
          setProfileAvatarUrl(null)
          setProfileDisplayName('')
          setProfileLoadState('missing')
        } else {
          setProfileData(null)
          setShowcasePreview([])
          setProfileAvatarUrl(null)
          setProfileDisplayName('')
          setProfileLoadState('error')
        }

        if (storiesResult.status === 'fulfilled' && storiesResult.value.ok) {
          const storiesPayload = (await storiesResult.value
            .json()
            .catch(() => [])) as unknown
          setActiveStoriesCount(
            Array.isArray(storiesPayload) ? storiesPayload.length : 0
          )
        } else {
          setActiveStoriesCount(0)
        }

        if (
          marketingSummaryResult.status === 'fulfilled' &&
          marketingSummaryResult.value.ok
        ) {
          const summary = (await marketingSummaryResult.value
            .json()
            .catch(() => null)) as MarketingSummary | null
          if (summary) {
            setMarketingSummary({
              botOptInCount: Number(summary.botOptInCount) || 0,
              chatCount: Number(summary.chatCount) || 0,
              repeatEligibleTotal:
                summary.repeatEligibleTotal === null
                  ? null
                  : Number(summary.repeatEligibleTotal) || 0,
              repeatEligibleBotCount:
                summary.repeatEligibleBotCount === null
                  ? null
                  : Number(summary.repeatEligibleBotCount) || 0,
              repeatEligibleChatCount:
                summary.repeatEligibleChatCount === null
                  ? null
                  : Number(summary.repeatEligibleChatCount) || 0,
              repeatLastSentAt: summary.repeatLastSentAt ?? null,
              repeatCheckedAt: summary.repeatCheckedAt ?? null,
            })
          } else {
            setMarketingSummary(null)
          }
        } else {
          setMarketingSummary(null)
        }

        if (promotionsResult.status === 'fulfilled' && promotionsResult.value.ok) {
          const promotionsPayload = (await promotionsResult.value
            .json()
            .catch(() => [])) as unknown
          setPromotions(
            Array.isArray(promotionsPayload)
              ? (promotionsPayload as Promotion[])
              : []
          )
        } else {
          setPromotions([])
        }
      } catch (error) {
        if (!cancelled) {
          setProfileData(null)
          setShowcasePreview([])
          setProfileAvatarUrl(null)
          setProfileDisplayName('')
          setProfileLoadState('error')
          setActiveStoriesCount(0)
          setMarketingSummary(null)
          setPromotions([])
        }
      }
    }

    void loadCabinetMeta()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])
  const analyticsSpark = useMemo(() => {
    const values = [
      requestStats.open,
      requestStats.responses,
      bookingStats.confirmed,
      bookingStats.pending,
      bookingStats.upcomingWeek,
      requestStats.total,
    ]
    const max = Math.max(...values)
    if (!max) return [10, 18, 14, 22, 16, 12]
    return values.map((value) => Math.max(6, Math.round((value / max) * 24) + 6))
  }, [bookingStats, requestStats])
  const calendarPreview = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() + index)
      return {
        key: toDateKey(date),
        label: formatWeekday(date),
        isToday: index === 0,
      }
    })
    const counts = new Map<string, number>()
    bookings.forEach((booking) => {
      if (['declined', 'cancelled'].includes(booking.status)) return
      const date = new Date(booking.scheduledAt)
      if (Number.isNaN(date.getTime())) return
      date.setHours(0, 0, 0, 0)
      const diffDays = Math.floor((date.getTime() - today.getTime()) / DAY_MS)
      if (diffDays < 0 || diffDays > 6) return
      const key = toDateKey(date)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return days.map((day) => ({
      ...day,
      count: counts.get(day.key) ?? 0,
    }))
  }, [bookings])
  const clientHighlights = useMemo(
    () => bookingStats.clientSummaries.slice(0, 2),
    [bookingStats.clientSummaries]
  )
  const clientRows = clientHighlights.length > 0 ? clientHighlights : [null]
  const totalClients = bookingStats.uniqueClients
  const repeatClients = bookingStats.repeatClients
  const marketingAudience = bookingStats.uniqueClients
  const marketingRepeatRate = marketingAudience
    ? bookingStats.repeatClients / marketingAudience
    : 0
  const marketingMeter = marketingAudience
    ? Math.min(100, Math.max(12, Math.round(marketingRepeatRate * 100)))
    : 0
  const showcaseTiles: Array<PortfolioItem | null> =
    showcasePreview.length > 0 ? showcasePreview : [null, null]
  const profileInitials = useMemo(
    () => getInitials(profileDisplayName || 'Мастер'),
    [profileDisplayName]
  )
  const avatarDisplayUrl = profileAvatarUrl || telegramAvatarUrl || null
  const isProfileMetaUnavailable = profileLoadState === 'error'
  const isProfileMissing = profileLoadState === 'missing'
  const profileMissingFields = profileData?.missingFields ?? []
  const hasProfileBasicsGap =
    isProfileMissing ||
    profileMissingFields.some((field) =>
      ['displayName', 'categories', 'workFormat', 'cityId', 'districtId'].includes(
        field
      )
    )
  const hasServicesConfigured = (profileData?.services?.length ?? 0) > 0
  const hasPortfolioConfigured =
    (profileData?.portfolioUrls?.length ?? 0) > 0 ||
    (profileData?.showcaseUrls?.length ?? 0) > 0
  const hasScheduleConfigured =
    (profileData?.scheduleDays?.length ?? 0) > 0 &&
    Boolean(profileData?.scheduleStart) &&
    Boolean(profileData?.scheduleEnd)
  const hasScheduleEvidence = hasScheduleConfigured || bookingStats.upcoming > 0
  const isProfileReadyForFlow =
    !hasProfileBasicsGap &&
    hasServicesConfigured &&
    hasPortfolioConfigured &&
    hasScheduleEvidence
  const marketingReach =
    (marketingSummary?.botOptInCount ?? 0) + (marketingSummary?.chatCount ?? 0)
  const hasGrowthChannels = marketingReach > 0
  const hasActivePromotion =
    Boolean(profileData?.activePromotion) ||
    promotions.some((promotion) => promotion.status === 'active')
  const hasStoriesPublished = activeStoriesCount > 0
  const pendingActions = requestStats.open + bookingStats.pending
  const hasPendingActions = pendingActions > 0
  const hasMetricsData = requestStats.total > 0 || bookingStats.total > 0
  const isOfflineFallback = Boolean(combinedError) && !hasMetricsData
  const journeySteps = useMemo(() => {
    let profileTitle = 'Профиль и график готовы'
    let profileSubtitle = 'Основа собрана, можно принимать записи.'
    let profileActionLabel = 'Открыть профиль'
    let profileAction = () => onEditProfile()
    if (isProfileMetaUnavailable) {
      profileTitle = 'Проверьте профиль'
      profileSubtitle = 'Синхронизация профиля недоступна. Обновите данные.'
      profileActionLabel = 'Обновить данные'
      profileAction = refresh
    } else if (hasProfileBasicsGap) {
      const missingBasics = new Set(profileMissingFields)
      profileTitle = 'Заполните основу профиля'
      profileSubtitle = 'Имя, категории и локация нужны для выдачи.'
      profileActionLabel = 'Заполнить основу'
      profileAction = () => onEditProfile('basic')
      if (missingBasics.has('cityId') || missingBasics.has('districtId')) {
        profileTitle = 'Добавьте локацию'
        profileSubtitle = 'Укажите город и район для поиска.'
        profileActionLabel = 'Указать локацию'
        profileAction = () => onEditProfile('location')
      } else if (missingBasics.has('displayName')) {
        profileTitle = 'Добавьте имя профиля'
        profileSubtitle = 'Понятное имя повышает доверие.'
        profileActionLabel = 'Заполнить имя'
        profileAction = () => onEditProfile('basic')
      } else if (missingBasics.has('categories')) {
        profileTitle = 'Выберите категории'
        profileSubtitle = 'Категории влияют на выдачу в подборках.'
        profileActionLabel = 'Выбрать категории'
        profileAction = () => onEditProfile('services')
      } else if (missingBasics.has('workFormat')) {
        profileTitle = 'Выберите формат работы'
        profileSubtitle = 'Уточните, где принимаете клиентов.'
        profileActionLabel = 'Выбрать формат'
        profileAction = () => onEditProfile('location')
      }
    } else if (!hasServicesConfigured) {
      profileTitle = 'Добавьте услуги'
      profileSubtitle = 'Клиенты должны видеть список услуг.'
      profileActionLabel = 'Добавить услуги'
      profileAction = () => onEditProfile('services')
    } else if (!hasPortfolioConfigured) {
      profileTitle = 'Добавьте примеры работ'
      profileSubtitle = 'Витрина повышает доверие и ускоряет выбор.'
      profileActionLabel = 'Добавить работы'
      profileAction = () => onEditProfile('portfolio')
    } else if (!hasScheduleEvidence) {
      profileTitle = 'Подключите график'
      profileSubtitle = 'Без графика нельзя принимать записи.'
      profileActionLabel = 'Подключить график'
      profileAction = () => onEditProfile('availability')
    }

    let flowTitle = 'Поток на неделе стабилен'
    let flowSubtitle = 'Входящие закрыты, неделя заполнена.'
    let flowActionLabel = 'Открыть календарь'
    let flowAction = onOpenCalendar
    if (requestStats.open > 0) {
      flowTitle = `Ответьте на ${requestStats.open} ${formatCountLabel(
        requestStats.open,
        'заявку',
        'заявки',
        'заявок'
      )}`
      flowSubtitle = 'Быстрый ответ повышает конверсию.'
      flowActionLabel = 'Открыть заявки'
      flowAction = onViewRequests
    } else if (!hasScheduleEvidence && !isProfileMetaUnavailable) {
      flowTitle = 'Подключите график'
      flowSubtitle = 'Без графика клиент не выберет время.'
      flowActionLabel = 'Подключить график'
      flowAction = () => onEditProfile('availability')
    } else if (bookingStats.upcomingWeek === 0) {
      flowTitle = 'На неделе пока нет записей'
      if (!hasActivePromotion && !hasGrowthChannels) {
        flowSubtitle = 'График есть. Запустите оффер для новых записей.'
        flowActionLabel = 'Подключить продвижение'
        flowAction = onOpenMarketing
      } else {
        flowSubtitle = 'Проверьте календарь и заявки по неделе.'
        flowActionLabel = requestStats.total > 0 ? 'Открыть заявки' : 'Открыть календарь'
        flowAction = requestStats.total > 0 ? onViewRequests : onOpenCalendar
      }
    } else if (bookingStats.upcomingWeek < 2) {
      flowTitle = 'На неделе мало записей'
      flowSubtitle = 'Усилите поток через быстрые ответы и оффер.'
      flowActionLabel =
        requestStats.total > 0
          ? 'Открыть заявки'
          : hasActivePromotion || hasGrowthChannels
            ? 'Открыть календарь'
            : 'Открыть продвижение'
      flowAction =
        requestStats.total > 0
          ? onViewRequests
          : hasActivePromotion || hasGrowthChannels
            ? onOpenCalendar
            : onOpenMarketing
    }

    let growthTitle = 'Продвижение подключено'
    let growthSubtitle = 'Контент и оффер уже работают.'
    let growthActionLabel = 'Управлять ростом'
    let growthAction = onOpenMarketing
    if (!hasStoriesPublished) {
      growthTitle = 'Добавьте первую историю'
      growthSubtitle = 'Истории возвращают внимание клиентов.'
      growthActionLabel = 'Добавить сторис'
      growthAction = onOpenStories
    } else if (!hasActivePromotion && !hasGrowthChannels) {
      growthTitle = 'Подключите продвижение'
      growthSubtitle = 'Соберите каналы и запустите оффер.'
      growthActionLabel = 'Подключить рост'
      growthAction = onOpenMarketing
    } else if (!hasActivePromotion) {
      growthTitle = 'Запустите акцию'
      growthSubtitle = 'Аудитория подключена, пора запускать оффер.'
      growthActionLabel = 'Запустить акцию'
      growthAction = onOpenMarketing
    }

    let retentionTitle = 'Повторы запущены'
    let retentionSubtitle = 'База клиентов растет и возвращается.'
    let retentionActionLabel = 'Открыть аналитику'
    let retentionAction = onOpenAnalytics
    if (totalClients === 0) {
      retentionTitle = 'Соберите первых клиентов'
      retentionSubtitle = 'Начните с заявок и соберите базу.'
      retentionActionLabel = 'Открыть заявки'
      retentionAction = onViewRequests
    } else if (repeatClients === 0) {
      retentionTitle = 'Запустите повторные записи'
      retentionSubtitle = 'Добавьте сценарий возврата в базе.'
      retentionActionLabel = 'Открыть базу'
      retentionAction = onOpenClients
    } else if (totalClients < 3) {
      retentionTitle = 'Расширьте клиентскую базу'
      retentionSubtitle = 'Нужно минимум 3 клиента для стабильных повторов.'
      retentionActionLabel = 'Открыть базу'
      retentionAction = onOpenClients
    }

    const draftSteps: MasterJourneyDraftStep[] = [
      {
        id: 'profile',
        chipLabel: 'Профиль',
        title: profileTitle,
        subtitle: profileSubtitle,
        actionLabel: profileActionLabel,
        onAction: profileAction,
        isDone: isProfileReadyForFlow,
      },
      {
        id: 'flow',
        chipLabel: 'Поток',
        title: flowTitle,
        subtitle: flowSubtitle,
        actionLabel: flowActionLabel,
        onAction: flowAction,
        isDone:
          requestStats.open === 0 &&
          (bookingStats.upcomingWeek >= 2 ||
            (bookingStats.upcomingWeek > 0 &&
              (hasActivePromotion || hasGrowthChannels))),
      },
      {
        id: 'growth',
        chipLabel: 'Рост',
        title: growthTitle,
        subtitle: growthSubtitle,
        actionLabel: growthActionLabel,
        onAction: growthAction,
        isDone: hasStoriesPublished && (hasActivePromotion || hasGrowthChannels),
      },
      {
        id: 'retention',
        chipLabel: 'Повторы',
        title: retentionTitle,
        subtitle: retentionSubtitle,
        actionLabel: retentionActionLabel,
        onAction: retentionAction,
        isDone: totalClients >= 3 && repeatClients > 0,
      },
    ]

    return toMasterJourneySteps(draftSteps)
  }, [
    bookingStats.upcomingWeek,
    profileMissingFields,
    hasActivePromotion,
    hasGrowthChannels,
    hasProfileBasicsGap,
    hasPortfolioConfigured,
    hasScheduleEvidence,
    hasServicesConfigured,
    hasStoriesPublished,
    isProfileReadyForFlow,
    isProfileMetaUnavailable,
    onEditProfile,
    onOpenAnalytics,
    onOpenCalendar,
    onOpenClients,
    onOpenMarketing,
    onOpenStories,
    onViewRequests,
    repeatClients,
    refresh,
    requestStats.open,
    requestStats.total,
    totalClients,
  ])
  const completedJourneySteps = journeySteps.filter(
    (step) => step.status === 'done'
  ).length
  const activeJourneyStep =
    journeySteps.find((step) => step.status === 'active') ??
    journeySteps[journeySteps.length - 1]
  const profileRoadmapStepNumber =
    activeJourneyStep.status === 'active'
      ? completedJourneySteps + 1
      : journeySteps.length
  const nextBookingLabel = bookingStats.nextBookingTime
    ? formatShortDate(new Date(bookingStats.nextBookingTime))
    : 'нет'
  const nextBookingCompactLabel = bookingStats.nextBookingTime
    ? formatShortDate(new Date(bookingStats.nextBookingTime))
    : 'нет'
  const overviewStatusLabel = isOfflineFallback
    ? 'Оффлайн'
    : combinedError
      ? 'Требуется синхронизация'
    : isLoading
      ? 'Обновляем данные'
      : 'Данные актуальны'
  const overviewStatusClassName = isOfflineFallback
    ? ' is-loading'
    : combinedError
      ? ' is-error'
      : isLoading
        ? ' is-loading'
        : ' is-ok'
  const requiredActionsCount = Math.max(
    pendingActions,
    activeJourneyStep.status === 'active' ? 1 : 0
  )
  const hasActionBacklog = requiredActionsCount > 0
  const journeyMetaLong =
    activeJourneyStep.status === 'active'
      ? `Онбординг в профиле: шаг ${profileRoadmapStepNumber}/${journeySteps.length}`
      : `Онбординг в профиле завершен: ${journeySteps.length}/${journeySteps.length}`
  const focusActionsChipClassName = hasActionBacklog ? ' is-alert' : ' is-ok'
  const focusWeekChipClassName =
    bookingStats.upcomingWeek > 0 ? ' is-ok' : ' is-neutral'
  const focusClientsChipClassName =
    bookingStats.uniqueClients > 0 ? ' is-neutral' : ' is-muted'
  const focusActionsChipAction = hasActionBacklog
    ? onViewRequests
    : activeJourneyStep.onAction
  const focusJourneyChipLabel = `Профиль ${profileRoadmapStepNumber}/${journeySteps.length}`
  const requestsCardStateClassName =
    requestStats.open > 0
      ? ' is-attention'
      : requestStats.total > 0 || bookingStats.pending > 0
        ? ' is-warm'
        : ' is-calm'
  const shouldPromptScheduleSetup =
    !hasScheduleEvidence && !isProfileMetaUnavailable
  const shouldPromptMarketing =
    hasScheduleEvidence &&
    bookingStats.upcomingWeek === 0 &&
    !hasPendingActions &&
    !hasActivePromotion &&
    !hasGrowthChannels
  const shouldFocusProfileStep =
    !isOfflineFallback &&
    !combinedError &&
    !hasPendingActions &&
    activeJourneyStep.id === 'profile' &&
    activeJourneyStep.status === 'active'
  const calendarCardStateClassName =
    bookingStats.upcomingWeek > 0
      ? ' is-busy'
      : shouldPromptScheduleSetup || isProfileMetaUnavailable
        ? ' is-setup'
        : ' is-empty'
  const focusTitle = isOfflineFallback
    ? 'Начните рабочий день'
    : combinedError
      ? 'Проверьте синхронизацию'
      : hasPendingActions
        ? `${pendingActions} задач на сейчас`
        : shouldFocusProfileStep
          ? activeJourneyStep.title
        : shouldPromptScheduleSetup
          ? 'Подключите рабочий график'
          : bookingStats.upcomingWeek > 0
          ? 'День под контролем'
          : shouldPromptMarketing
            ? 'Неделя без записей'
            : 'Свободная неделя для роста'
  const focusSubtitle = isOfflineFallback
    ? 'Нет связи. Нажмите «Обновить данные».'
    : combinedError
      ? 'Синхронизация сбилась. Обновите данные.'
      : hasPendingActions
        ? 'Сначала закройте входящие заявки и ожидания.'
        : shouldFocusProfileStep
          ? activeJourneyStep.subtitle
        : shouldPromptScheduleSetup
          ? 'Без графика клиенты не выберут время.'
          : bookingStats.upcomingWeek > 0
          ? 'Проверьте окна в календаре и подтверждения.'
          : shouldPromptMarketing
            ? 'График есть. Запустите оффер для новых записей.'
            : 'Неделя свободна: сфокусируйтесь на росте.'
  const focusPrimaryActionLabel = isOfflineFallback
    ? 'Обновить данные'
    : combinedError
      ? 'Обновить данные'
      : hasPendingActions
        ? 'Разобрать заявки'
        : shouldFocusProfileStep
          ? activeJourneyStep.actionLabel
        : shouldPromptScheduleSetup
          ? 'Подключить график'
          : bookingStats.upcomingWeek > 0
          ? 'Открыть календарь'
          : shouldPromptMarketing
            ? 'Подключить продвижение'
            : activeJourneyStep.actionLabel
  const focusPrimaryAction = combinedError
    ? refresh
    : hasPendingActions
      ? onViewRequests
      : shouldFocusProfileStep
        ? activeJourneyStep.onAction
      : shouldPromptScheduleSetup
        ? () => onEditProfile('availability')
        : bookingStats.upcomingWeek > 0
        ? onOpenCalendar
        : shouldPromptMarketing
        ? onOpenMarketing
        : activeJourneyStep.onAction
  const storiesBadgeLabel = hasStoriesPublished ? 'ЭФИР' : 'СТАРТ'
  const storiesHintCompact = hasStoriesPublished
    ? `${activeStoriesCount} ${formatCountLabel(
        activeStoriesCount,
        'история',
        'истории',
        'историй'
      )} в эфире`
    : 'Опубликуйте первую сторис'
  const marketingHintCompact = hasActivePromotion
    ? 'Оффер активен'
    : hasGrowthChannels
      ? 'Каналы подключены'
      : marketingAudience
        ? 'База готова к офферу'
        : 'Соберите базу через заявки'
  const requestsHintCompact = requestStats.open
    ? `${requestStats.open} к ответу`
    : requestStats.total > 0
      ? 'Очередь чистая'
      : 'Новых нет'
  const calendarHintCompact = bookingStats.upcomingWeek
    ? `${bookingStats.upcomingWeek} на неделе`
    : shouldPromptScheduleSetup
      ? 'Нужен график'
      : isProfileMetaUnavailable
        ? 'Нет данных'
        : requestStats.total > 0
          ? 'Есть заявки'
          : 'Записей нет'
  const leadClient = clientRows[0]
  const leadClientName = leadClient?.name ?? 'Клиентов пока нет'
  const leadClientMeta = leadClient
    ? formatClientMeta(leadClient)
    : 'Примите первую заявку'
  const showcaseItemsCount =
    (profileData?.showcaseUrls?.length ?? 0) +
    (profileData?.portfolioUrls?.length ?? 0)
  const showcaseHintCompact =
    showcaseItemsCount > 0
      ? 'Освежите витрину'
      : 'Добавьте первую работу'
  const quickFocusTool: 'analytics' | 'clients' | 'marketing' | 'stories' | null =
    combinedError
      ? 'analytics'
      : totalClients === 0
        ? 'clients'
        : !hasActivePromotion
          ? 'marketing'
          : !hasStoriesPublished
            ? 'stories'
            : bookingStats.confirmed === 0
              ? 'analytics'
              : null
  const analyticsFooterNote = bookingStats.upcomingWeek
    ? `На неделе: ${bookingStats.upcomingWeek}`
    : 'Неделя пустая'
  const clientsFooterNote =
    totalClients > 0 ? `Повторы ${repeatClients}` : 'Соберите первую базу'
  const analyticsCtaLabel = bookingStats.confirmed > 0 ? 'Детали' : 'Открыть'
  const clientsCtaLabel = totalClients > 0 ? 'База' : 'Добавить'
  const marketingCtaLabel = hasActivePromotion ? 'Управлять' : 'Запустить'
  const storiesCtaLabel = hasStoriesPublished ? 'Лента' : 'Создать'
  const showcaseCtaLabel = showcaseItemsCount > 0 ? 'Витрина' : 'Добавить'

  return (
    <div className="screen screen--pro screen--pro-cabinet">
      <div className="pro-cabinet-shell pro-cabinet-shell--icons">
        <section className="pro-cabinet-overview animate delay-1">
          <div className="pro-cabinet-overview-copy">
            <div className="pro-cabinet-overview-head">
              <p className="pro-cabinet-overview-kicker">Сегодня</p>
              <span
                className={`pro-cabinet-overview-state${overviewStatusClassName}`}
              >
                {overviewStatusLabel}
              </span>
            </div>
            <h1 className="pro-cabinet-overview-title">{focusTitle}</h1>
            <p className="pro-cabinet-overview-subtitle">{focusSubtitle}</p>
          </div>
          <div className="pro-cabinet-overview-rail">
            <button
              className={`pro-cabinet-overview-chip is-actions${focusActionsChipClassName}`}
              type="button"
              onClick={focusActionsChipAction}
            >
              <span className="pro-cabinet-overview-chip-label">Действия</span>
              <span className="pro-cabinet-overview-chip-value">
                {requiredActionsCount}
              </span>
            </button>
            <button
              className={`pro-cabinet-overview-chip${focusWeekChipClassName}`}
              type="button"
              onClick={onOpenCalendar}
            >
              <span className="pro-cabinet-overview-chip-label">Неделя</span>
              <span className="pro-cabinet-overview-chip-value">
                {bookingStats.upcomingWeek}
              </span>
            </button>
            <button
              className={`pro-cabinet-overview-chip${focusClientsChipClassName}`}
              type="button"
              onClick={onOpenClients}
            >
              <span className="pro-cabinet-overview-chip-label">Клиенты</span>
              <span className="pro-cabinet-overview-chip-value">
                {bookingStats.uniqueClients}
              </span>
            </button>
          </div>
          <div className="pro-cabinet-overview-meta">
            <span className="pro-cabinet-overview-meta-pill">
              <span className="pro-cabinet-overview-meta-long">
                Ближайшая запись: {nextBookingLabel}
              </span>
              <span className="pro-cabinet-overview-meta-short">
                Запись: {nextBookingCompactLabel}
              </span>
            </span>
            <button
              className="pro-cabinet-overview-meta-pill is-journey is-action"
              type="button"
              onClick={() => onEditProfile()}
              aria-label={`Открыть профиль мастера. ${journeyMetaLong}`}
            >
              <span className="pro-cabinet-overview-meta-journey-long">
                {journeyMetaLong}
              </span>
              <span className="pro-cabinet-overview-meta-journey-short">
                {focusJourneyChipLabel}
              </span>
            </button>
          </div>
          <div className="pro-cabinet-overview-actions is-single">
            <button
              className="pro-cabinet-overview-action is-primary is-focus"
              type="button"
              onClick={focusPrimaryAction}
            >
              {focusPrimaryActionLabel}
            </button>
          </div>
        </section>

        <div className="pro-cabinet-nav-grid pro-cabinet-nav-grid--primary">
          <button
            className={`pro-cabinet-nav-card is-requests is-primary animate delay-2${requestsCardStateClassName}`}
            type="button"
            onClick={onViewRequests}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconList />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">Приоритет</span>
                <span className="pro-cabinet-nav-title">Заявки</span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview">
              <div className="pro-cabinet-nav-pills">
                <span className="pro-cabinet-nav-pill is-alert">
                  Новые {requestStats.open}
                </span>
                <span className="pro-cabinet-nav-pill is-ghost">
                  Ожидают {bookingStats.pending}
                </span>
              </div>
              <div className="pro-cabinet-nav-stats">
                <div className="pro-cabinet-nav-stat">
                  <span className="pro-cabinet-nav-stat-value">
                    {requestStats.total}
                  </span>
                  <span className="pro-cabinet-nav-stat-label">В работе</span>
                </div>
                <div className="pro-cabinet-nav-stat">
                  <span className="pro-cabinet-nav-stat-value">
                    {requestStats.responses}
                  </span>
                  <span className="pro-cabinet-nav-stat-label">Отклики</span>
                </div>
              </div>
              <div className="pro-cabinet-nav-inline">
                <span className="pro-cabinet-nav-inline-note">
                  {requestsHintCompact}
                </span>
                <span className="pro-cabinet-nav-inline-link">
                  {requestStats.open > 0 ? 'К ответам' : 'Шаблоны'}
                </span>
              </div>
            </div>
          </button>
          <button
            className={`pro-cabinet-nav-card is-calendar is-primary animate delay-3${calendarCardStateClassName}`}
            type="button"
            onClick={onOpenCalendar}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconCalendar />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">График</span>
                <span className="pro-cabinet-nav-title">Календарь</span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview">
              <div className="pro-cabinet-nav-week" aria-hidden="true">
                {calendarPreview.map((day) => (
                  <div
                    className={`pro-cabinet-nav-day${day.isToday ? ' is-today' : ''}`}
                    key={day.key}
                  >
                    <span className="pro-cabinet-nav-day-label">{day.label}</span>
                    <span
                      className={`pro-cabinet-nav-day-dot${
                        day.count > 0 ? ' is-active' : ''
                      }`}
                    />
                  </div>
                ))}
              </div>
              <div className="pro-cabinet-nav-pills">
                <span className="pro-cabinet-nav-pill">
                  Записей {bookingStats.upcomingWeek}
                </span>
                <span className="pro-cabinet-nav-pill is-ghost">
                  Будущих {bookingStats.upcoming}
                </span>
              </div>
              <div className="pro-cabinet-nav-inline">
                <span className="pro-cabinet-nav-inline-note">
                  {calendarHintCompact}
                </span>
                <span className="pro-cabinet-nav-inline-link">
                  {bookingStats.upcomingWeek > 0
                    ? 'Окна'
                    : shouldPromptScheduleSetup || isProfileMetaUnavailable
                      ? 'График'
                      : 'Неделя'}
                </span>
              </div>
            </div>
          </button>
        </div>

        <div
          className="pro-cabinet-tools-quick animate delay-4"
          role="navigation"
          aria-label="Быстрые переходы по инструментам"
        >
          <button
            className={`pro-cabinet-tools-quick-item${
              quickFocusTool === 'analytics' ? ' is-focus' : ''
            }`}
            type="button"
            onClick={onOpenAnalytics}
          >
            <span className="pro-cabinet-tools-quick-icon" aria-hidden="true">
              <IconDashboard />
            </span>
            <span className="pro-cabinet-tools-quick-label">Отчеты</span>
          </button>
          <button
            className={`pro-cabinet-tools-quick-item${
              quickFocusTool === 'clients' ? ' is-focus' : ''
            }`}
            type="button"
            onClick={onOpenClients}
          >
            <span className="pro-cabinet-tools-quick-icon" aria-hidden="true">
              <IconUsers />
            </span>
            <span className="pro-cabinet-tools-quick-label">База</span>
          </button>
          <button
            className={`pro-cabinet-tools-quick-item${
              quickFocusTool === 'marketing' ? ' is-focus' : ''
            }`}
            type="button"
            onClick={onOpenMarketing}
          >
            <span className="pro-cabinet-tools-quick-icon" aria-hidden="true">
              <IconChat />
            </span>
            <span className="pro-cabinet-tools-quick-label">Промо</span>
          </button>
          <button
            className={`pro-cabinet-tools-quick-item${
              quickFocusTool === 'stories' ? ' is-focus' : ''
            }`}
            type="button"
            onClick={onOpenStories}
          >
            <span className="pro-cabinet-tools-quick-icon" aria-hidden="true">
              <IconStories />
            </span>
            <span className="pro-cabinet-tools-quick-label">Сторис</span>
          </button>
        </div>

        <div className="pro-cabinet-nav-grid pro-cabinet-nav-grid--secondary">
          <button
            className="pro-cabinet-nav-card is-analytics is-tool animate delay-5"
            type="button"
            onClick={onOpenAnalytics}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconDashboard />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">Тренды</span>
                <span className="pro-cabinet-nav-title">Аналитика</span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview is-tool-preview">
              <div className="pro-cabinet-tool-metric">
                <span className="pro-cabinet-tool-metric-value">
                  {bookingStats.confirmed}
                </span>
                <span className="pro-cabinet-tool-metric-label">записей</span>
              </div>
              <div className="pro-cabinet-tool-spark" aria-hidden="true">
                {analyticsSpark.slice(0, 5).map((value, index) => (
                  <span
                    className="pro-cabinet-tool-spark-bar"
                    key={`compact-spark-${index}`}
                    style={{ '--spark': value } as CSSProperties}
                  />
                ))}
              </div>
              <div className="pro-cabinet-tool-footer">
                <span className="pro-cabinet-tool-note">{analyticsFooterNote}</span>
                <span className="pro-cabinet-tool-link">{analyticsCtaLabel}</span>
              </div>
            </div>
          </button>
          <button
            className="pro-cabinet-nav-card is-clients is-tool animate delay-6"
            type="button"
            onClick={onOpenClients}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconUsers />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">База</span>
                <span className="pro-cabinet-nav-title">Клиенты</span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview is-tool-preview">
              <div className="pro-cabinet-tool-metric">
                <span className="pro-cabinet-tool-metric-value">{totalClients}</span>
                <span className="pro-cabinet-tool-metric-label">клиентов</span>
              </div>
              <div className="pro-cabinet-tool-client-row">
                <span className="pro-cabinet-nav-client-avatar" aria-hidden="true">
                  {leadClient ? getInitials(leadClient.name) : '•'}
                </span>
                <div className="pro-cabinet-tool-client-copy">
                  <span className="pro-cabinet-tool-client-name">{leadClientName}</span>
                  <span className="pro-cabinet-tool-client-meta">{leadClientMeta}</span>
                </div>
              </div>
              <div className="pro-cabinet-tool-footer">
                <span className="pro-cabinet-tool-note">{clientsFooterNote}</span>
                <span className="pro-cabinet-tool-link">{clientsCtaLabel}</span>
              </div>
            </div>
          </button>
          <button
            className="pro-cabinet-nav-card is-marketing is-tool animate delay-7"
            type="button"
            onClick={onOpenMarketing}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconChat />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">Рост</span>
                <span className="pro-cabinet-nav-title">Продвижение</span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview is-tool-preview">
              <div className="pro-cabinet-tool-metric">
                <span className="pro-cabinet-tool-metric-value">{marketingReach}</span>
                <span className="pro-cabinet-tool-metric-label">контактов</span>
              </div>
              <p className="pro-cabinet-tool-note is-clamp">{marketingHintCompact}</p>
              <div className="pro-cabinet-nav-meter is-compact" aria-hidden="true">
                <span
                  className="pro-cabinet-nav-meter-fill"
                  style={{ '--meter': marketingMeter } as CSSProperties}
                />
              </div>
              <div className="pro-cabinet-tool-footer">
                <span className="pro-cabinet-tool-note">Аудитория {totalClients}</span>
                <span className="pro-cabinet-tool-link">{marketingCtaLabel}</span>
              </div>
            </div>
          </button>
          <button
            className="pro-cabinet-nav-card is-stories is-tool animate delay-8"
            type="button"
            onClick={onOpenStories}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconStories />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">Контент</span>
                <span className="pro-cabinet-nav-title">Истории</span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview is-tool-preview">
              <div className="pro-cabinet-tool-metric">
                <span className="pro-cabinet-tool-metric-value">
                  {activeStoriesCount}
                </span>
                <span className="pro-cabinet-tool-metric-label">историй</span>
              </div>
              <div className="pro-cabinet-tool-story-row">
                <span className="pro-cabinet-nav-story-avatar" aria-hidden="true">
                  {avatarDisplayUrl ? (
                    <img src={avatarDisplayUrl} alt="" loading="lazy" />
                  ) : (
                    <span>{profileInitials}</span>
                  )}
                </span>
                <span className="pro-cabinet-tool-note is-clamp">
                  {storiesHintCompact}
                </span>
              </div>
              <div className="pro-cabinet-tool-footer">
                <span className="pro-cabinet-tool-note">{storiesBadgeLabel}</span>
                <span className="pro-cabinet-tool-link">{storiesCtaLabel}</span>
              </div>
            </div>
          </button>
          <button
            className="pro-cabinet-nav-card is-showcase is-wide is-tool animate delay-8"
            type="button"
            onClick={onOpenShowcase}
          >
            <div className="pro-cabinet-nav-head">
              <span className="pro-cabinet-nav-icon" aria-hidden="true">
                <IconShowcase />
              </span>
              <div className="pro-cabinet-nav-info">
                <span className="pro-cabinet-nav-kicker">Портфолио</span>
                <span className="pro-cabinet-nav-title">Витрина</span>
              </div>
            </div>
            <div className="pro-cabinet-nav-preview is-tool-preview is-showcase-preview">
              <div className="pro-cabinet-tool-metric">
                <span className="pro-cabinet-tool-metric-value">
                  {showcaseItemsCount}
                </span>
                <span className="pro-cabinet-tool-metric-label">работ</span>
              </div>
              <div className="pro-cabinet-nav-mosaic is-compact" aria-hidden="true">
                {showcaseTiles.map((item, index) => {
                  const slotClass =
                    showcaseSlotClasses[index % showcaseSlotClasses.length]
                  const isImage = item ? isImageUrl(item.url) : false
                  const focus = item ? resolvePortfolioFocus(item) : null
                  return (
                    <span
                      className={`pro-cabinet-nav-mosaic-tile ${slotClass}${
                        item ? ' is-media' : ''
                      }`}
                      key={`showcase-preview-${item?.url ?? index}`}
                    >
                      {item ? (
                        isImage ? (
                          <img
                            src={item.url}
                            alt=""
                            loading="lazy"
                            style={{ objectPosition: focus?.position }}
                          />
                        ) : (
                          <span className="pro-cabinet-nav-mosaic-fallback">LINK</span>
                        )
                      ) : (
                        <span className="pro-cabinet-nav-mosaic-fallback">+</span>
                      )}
                    </span>
                  )
                })}
              </div>
              <div className="pro-cabinet-tool-footer">
                <span className="pro-cabinet-tool-note">{showcaseHintCompact}</span>
                <span className="pro-cabinet-tool-link">{showcaseCtaLabel}</span>
              </div>
            </div>
          </button>
        </div>

            <button
              className="pro-cabinet-support-card animate delay-8"
              type="button"
              onClick={onOpenSupport}
            >
              <span className="pro-cabinet-support-icon" aria-hidden="true">
                <IconSupport />
              </span>
              <span className="pro-cabinet-support-body">
                <span className="pro-cabinet-support-title">Поддержка</span>
                <span className="pro-cabinet-support-subtitle">
                  Ответим быстро и поможем с записью или оплатой.
                </span>
              </span>
              <span className="pro-cabinet-support-action">Написать</span>
            </button>
        </div>

      <ProBottomNav
        active="cabinet"
        onCabinet={() => {}}
        onRequests={onViewRequests}
        onChats={onViewChats}
        onProfile={() => onEditProfile()}
      />
    </div>
  )
}
