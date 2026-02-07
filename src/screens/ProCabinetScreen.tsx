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
  const newClients = Math.max(0, totalClients - repeatClients)
  const repeatShare = totalClients
    ? Math.max(0, Math.min(100, Math.round((repeatClients / totalClients) * 100)))
    : 0
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
  const [isToolsExpanded, setIsToolsExpanded] = useState(false)
  const [isRoadmapCoachmarkVisible, setIsRoadmapCoachmarkVisible] =
    useState(false)
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
    let profileSubtitle = 'Основа собрана, можно стабильно принимать записи.'
    let profileActionLabel = 'Открыть профиль'
    let profileAction = () => onEditProfile()
    if (isProfileMetaUnavailable) {
      profileTitle = 'Проверьте профиль'
      profileSubtitle = 'Синхронизация профиля недоступна, обновите экран.'
      profileActionLabel = 'Обновить данные'
      profileAction = refresh
    } else if (hasProfileBasicsGap) {
      const missingBasics = new Set(profileMissingFields)
      profileTitle = 'Заполните основу профиля'
      profileSubtitle = 'Имя, категории, формат и локация нужны для выдачи.'
      profileActionLabel = 'Заполнить основу'
      profileAction = () => onEditProfile('basic')
      if (missingBasics.has('cityId') || missingBasics.has('districtId')) {
        profileTitle = 'Добавьте локацию'
        profileSubtitle = 'Укажите город и район, чтобы клиенты находили вас в выдаче.'
        profileActionLabel = 'Указать локацию'
      } else if (missingBasics.has('displayName')) {
        profileTitle = 'Добавьте имя профиля'
        profileSubtitle = 'Понятное имя повышает доверие и кликабельность.'
        profileActionLabel = 'Заполнить имя'
      } else if (missingBasics.has('categories')) {
        profileTitle = 'Выберите категории'
        profileSubtitle = 'Категории влияют на попадание в подборки и поиск.'
        profileActionLabel = 'Выбрать категории'
      } else if (missingBasics.has('workFormat')) {
        profileTitle = 'Выберите формат работы'
        profileSubtitle = 'Уточните, где принимаете: у себя, у клиента или оба формата.'
        profileActionLabel = 'Выбрать формат'
      }
    } else if (!hasServicesConfigured) {
      profileTitle = 'Добавьте услуги'
      profileSubtitle = 'Клиенты должны видеть понятный список услуг.'
      profileActionLabel = 'Добавить услуги'
      profileAction = () => onEditProfile('services')
    } else if (!hasPortfolioConfigured) {
      profileTitle = 'Добавьте примеры работ'
      profileSubtitle = 'Витрина повышает доверие и ускоряет выбор.'
      profileActionLabel = 'Добавить работы'
      profileAction = () => onEditProfile('portfolio')
    } else if (!hasScheduleEvidence) {
      profileTitle = 'Подключите график'
      profileSubtitle = 'Без графика нельзя стабильно принимать записи.'
      profileActionLabel = 'Подключить график'
      profileAction = () => onEditProfile('availability')
    }

    let flowTitle = 'Поток на неделе стабилен'
    let flowSubtitle = 'Входящие закрыты, неделя уже заполнена записями.'
    let flowActionLabel = 'Открыть календарь'
    let flowAction = onOpenCalendar
    if (requestStats.open > 0) {
      flowTitle = `Ответьте на ${requestStats.open} ${formatCountLabel(
        requestStats.open,
        'заявку',
        'заявки',
        'заявок'
      )}`
      flowSubtitle = 'Быстрый ответ повышает шанс получить запись.'
      flowActionLabel = 'Открыть заявки'
      flowAction = onViewRequests
    } else if (!hasScheduleEvidence && !isProfileMetaUnavailable) {
      flowTitle = 'Подключите график'
      flowSubtitle = 'Без графика клиенты не могут записаться на удобное время.'
      flowActionLabel = 'Подключить график'
      flowAction = () => onEditProfile('availability')
    } else if (bookingStats.upcomingWeek === 0) {
      flowTitle = 'На неделе пока нет записей'
      if (!hasActivePromotion && !hasGrowthChannels) {
        flowSubtitle =
          'График уже есть. Подключите продвижение, чтобы получить новые записи.'
        flowActionLabel = 'Подключить продвижение'
        flowAction = onOpenMarketing
      } else {
        flowSubtitle =
          'Проверьте календарь и заявки: сейчас важнее конверсия, а не новые окна.'
        flowActionLabel = requestStats.total > 0 ? 'Открыть заявки' : 'Открыть календарь'
        flowAction = requestStats.total > 0 ? onViewRequests : onOpenCalendar
      }
    } else if (bookingStats.upcomingWeek < 2) {
      flowTitle = 'На неделе мало записей'
      flowSubtitle =
        'Усилите поток через быстрые ответы и продвижение, чтобы добрать загрузку.'
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
    let growthSubtitle = 'Контент и оффер уже работают на рост.'
    let growthActionLabel = 'Управлять ростом'
    let growthAction = onOpenMarketing
    if (!hasStoriesPublished) {
      growthTitle = 'Добавьте первую историю'
      growthSubtitle = 'Истории возвращают внимание клиентов в ленте.'
      growthActionLabel = 'Добавить сторис'
      growthAction = onOpenStories
    } else if (!hasActivePromotion && !hasGrowthChannels) {
      growthTitle = 'Подключите продвижение'
      growthSubtitle = 'Соберите каналы и запустите первый оффер.'
      growthActionLabel = 'Подключить рост'
      growthAction = onOpenMarketing
    } else if (!hasActivePromotion) {
      growthTitle = 'Запустите акцию'
      growthSubtitle = 'Аудитория подключена, пора дать повод записаться.'
      growthActionLabel = 'Запустить акцию'
      growthAction = onOpenMarketing
    }

    let retentionTitle = 'Повторы запущены'
    let retentionSubtitle = 'База клиентов растет и возвращается снова.'
    let retentionActionLabel = 'Открыть аналитику'
    let retentionAction = onOpenAnalytics
    if (totalClients === 0) {
      retentionTitle = 'Соберите первых клиентов'
      retentionSubtitle = 'Начните с заявок, чтобы сформировать клиентскую базу.'
      retentionActionLabel = 'Открыть заявки'
      retentionAction = onViewRequests
    } else if (repeatClients === 0) {
      retentionTitle = 'Запустите повторные записи'
      retentionSubtitle = 'Добавьте сценарий возврата в базе клиентов.'
      retentionActionLabel = 'Открыть базу'
      retentionAction = onOpenClients
    } else if (totalClients < 3) {
      retentionTitle = 'Расширьте клиентскую базу'
      retentionSubtitle = 'Нужно минимум 3 клиента для стабильного повтора.'
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
  const journeyProgress = Math.round(
    (completedJourneySteps / journeySteps.length) * 100
  )
  const activeJourneyStep =
    journeySteps.find((step) => step.status === 'active') ??
    journeySteps[journeySteps.length - 1]
  const toolsPreviewSubtitle =
    activeJourneyStep.status === 'active'
      ? `Сфокусируйтесь на шаге «${activeJourneyStep.chipLabel}», затем открывайте блоки роста.`
      : 'Блоки роста готовы: масштабируйте стабильный поток.'
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
  const focusSecondaryActionLabel =
    activeJourneyStep.id === 'profile'
      ? 'Заявки'
      : activeJourneyStep.id === 'flow'
        ? 'Чаты'
        : activeJourneyStep.id === 'growth'
          ? 'Календарь'
          : 'Продвижение'
  const focusSecondaryAction =
    activeJourneyStep.id === 'profile'
      ? onViewRequests
      : activeJourneyStep.id === 'flow'
        ? onViewChats
        : activeJourneyStep.id === 'growth'
          ? onOpenCalendar
          : onOpenMarketing
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
    ? 'Нет связи с сервером. Нажмите «Обновить данные».'
    : combinedError
      ? 'Обновите ленту, чтобы вернуть актуальные заявки.'
      : hasPendingActions
        ? 'Сначала закройте входящие и ожидания по записям.'
        : shouldFocusProfileStep
          ? activeJourneyStep.subtitle
        : shouldPromptScheduleSetup
          ? 'Без графика клиентам не выбрать время. Подключите расписание.'
          : bookingStats.upcomingWeek > 0
          ? 'Проверьте окна в календаре и поддержите текущий темп.'
          : shouldPromptMarketing
            ? 'График есть, но спроса мало. Подключите продвижение и оффер.'
            : 'Свободная неделя: выполните шаг из дорожки ниже.'
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
  const storiesBadgeLabel = hasStoriesPublished ? 'LIVE' : 'START'
  const storiesHint = hasStoriesPublished
    ? `${activeStoriesCount} ${formatCountLabel(
        activeStoriesCount,
        'история',
        'истории',
        'историй'
      )} в эфире`
    : 'Добавьте первую историю'
  const marketingHint = hasActivePromotion
    ? 'Акция активна и приводит записи'
    : hasGrowthChannels
      ? 'Каналы подключены, можно запускать оффер'
      : marketingAudience
        ? 'Есть база клиентов, подключите продвижение'
        : 'Начните с заявок, затем подключите рост'
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
          <div className="pro-cabinet-overview-stats">
            <div className="pro-cabinet-overview-stat">
              <span className="pro-cabinet-overview-stat-value">
                {pendingActions}
              </span>
              <span className="pro-cabinet-overview-stat-label">
                Нужны действия
              </span>
            </div>
            <div className="pro-cabinet-overview-stat">
              <span className="pro-cabinet-overview-stat-value">
                {bookingStats.upcomingWeek}
              </span>
              <span className="pro-cabinet-overview-stat-label">
                Записи 7д
              </span>
            </div>
            <div className="pro-cabinet-overview-stat">
              <span className="pro-cabinet-overview-stat-value">
                {bookingStats.uniqueClients}
              </span>
              <span className="pro-cabinet-overview-stat-label">Клиентов</span>
            </div>
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
          </div>
          <div className="pro-cabinet-overview-actions">
            <button
              className="pro-cabinet-overview-action is-primary"
              type="button"
              onClick={focusPrimaryAction}
            >
              {focusPrimaryActionLabel}
            </button>
            <button
              className="pro-cabinet-overview-action is-ghost"
              type="button"
              onClick={focusSecondaryAction}
            >
              {focusSecondaryActionLabel}
            </button>
          </div>
        </section>

        <div className="pro-cabinet-nav-grid pro-cabinet-nav-grid--primary">
          <button
            className="pro-cabinet-nav-card is-requests is-primary animate delay-2"
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
            className="pro-cabinet-nav-card is-calendar is-primary animate delay-3"
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

        <section className="pro-cabinet-next-step animate delay-4">
          <div className="pro-cabinet-next-step-copy">
            <div className="pro-cabinet-next-step-head">
              <p className="pro-cabinet-next-step-kicker">Рабочая дорожка</p>
              <div className="pro-cabinet-next-step-head-actions">
                <button
                  className="pro-cabinet-next-step-info"
                  type="button"
                  onClick={() =>
                    setIsRoadmapCoachmarkVisible((current) => !current)
                  }
                  aria-expanded={isRoadmapCoachmarkVisible}
                  aria-label="Показать подсказку"
                >
                  i
                </button>
                <span className="pro-cabinet-next-step-score">
                  {completedJourneySteps}/{journeySteps.length}
                </span>
              </div>
            </div>
            <h2 className="pro-cabinet-next-step-title">{activeJourneyStep.title}</h2>
            <p className="pro-cabinet-next-step-subtitle">
              {activeJourneyStep.subtitle}
            </p>
          </div>
          <div
            className={`pro-cabinet-roadmap-tip${
              isRoadmapCoachmarkVisible ? ' is-visible' : ''
            }`}
            role="status"
            aria-live="polite"
          >
            Шаги кликабельны: откройте нужный раздел в 1 тап.
          </div>
          <div className="pro-cabinet-roadmap-meter" aria-hidden="true">
            <span
              className="pro-cabinet-roadmap-meter-fill"
              style={{ '--roadmap-progress': `${journeyProgress}%` } as CSSProperties}
            />
          </div>
          <div className="pro-cabinet-roadmap-steps">
            {journeySteps.map((step) => (
              <button
                className={`pro-cabinet-roadmap-step is-${step.status}${
                  step.id === activeJourneyStep.id ? ' is-current' : ''
                }`}
                key={step.id}
                type="button"
                onClick={step.onAction}
              >
                <span className="pro-cabinet-roadmap-step-label">{step.chipLabel}</span>
                <span className="pro-cabinet-roadmap-step-dot" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="pro-cabinet-next-step-actions">
            <button
              className="pro-cabinet-next-step-action is-primary"
              type="button"
              onClick={activeJourneyStep.onAction}
            >
              {activeJourneyStep.actionLabel}
            </button>
            <button
              className="pro-cabinet-next-step-action is-ghost is-compact"
              type="button"
              onClick={() => setIsToolsExpanded((current) => !current)}
            >
              {isToolsExpanded ? 'Свернуть блоки' : 'Инструменты'}
            </button>
          </div>
        </section>
        {isToolsExpanded ? (
          <>
            <div className="pro-cabinet-nav-grid pro-cabinet-nav-grid--secondary">
              <button
                className="pro-cabinet-nav-card is-analytics animate delay-5"
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
                <div className="pro-cabinet-nav-preview">
                  <div className="pro-cabinet-nav-spark" aria-hidden="true">
                    {analyticsSpark.map((value, index) => (
                      <span
                        className="pro-cabinet-nav-spark-bar"
                        key={`analytics-spark-${index}`}
                        style={{ '--spark': value } as CSSProperties}
                      />
                    ))}
                  </div>
                  <div className="pro-cabinet-nav-stats">
                    <div className="pro-cabinet-nav-stat">
                      <span className="pro-cabinet-nav-stat-value">
                        {bookingStats.confirmed}
                      </span>
                      <span className="pro-cabinet-nav-stat-label">Подтверждено</span>
                    </div>
                    <div className="pro-cabinet-nav-stat">
                      <span className="pro-cabinet-nav-stat-value">
                        {bookingStats.upcomingWeek}
                      </span>
                      <span className="pro-cabinet-nav-stat-label">Неделя</span>
                    </div>
                  </div>
                </div>
              </button>
              <button
                className="pro-cabinet-nav-card is-clients animate delay-6"
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
                <div className="pro-cabinet-nav-preview is-clients-preview">
                  <div className="pro-cabinet-nav-client-list">
                    {clientRows.map((client, index) => {
                      const isGhost = !client
                      const name = client?.name ?? 'Клиентов пока нет'
                      const meta = client
                        ? formatClientMeta(client)
                        : 'Примите первую заявку'
                      const isRepeat = client ? client.count > 1 : false
                      const badge = client ? (isRepeat ? 'повторный' : 'новый') : null
                      return (
                        <div
                          className={`pro-cabinet-nav-client-row${
                            isGhost ? ' is-ghost' : ''
                          }`}
                          key={`client-row-${client?.id ?? index}`}
                        >
                          <span className="pro-cabinet-nav-client-avatar" aria-hidden="true">
                            {client ? getInitials(client.name) : '•'}
                          </span>
                          <div className="pro-cabinet-nav-client-text">
                            <span className="pro-cabinet-nav-client-name">{name}</span>
                            <span className="pro-cabinet-nav-client-meta-text">
                              {meta}
                            </span>
                          </div>
                          {badge ? (
                            <span
                              className={`pro-cabinet-nav-client-badge${
                                isRepeat ? ' is-repeat' : ' is-new'
                              }`}
                            >
                              {badge}
                            </span>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <div className="pro-cabinet-nav-client-foot">
                    {totalClients > 0 ? (
                      <>
                        <div
                          className="pro-cabinet-nav-client-meter"
                          style={{ '--repeat-share': repeatShare } as CSSProperties}
                          aria-hidden="true"
                        />
                        <div className="pro-cabinet-nav-client-meta">
                          <span>Повторные {repeatClients}</span>
                          <span className="is-muted">Новые {newClients}</span>
                        </div>
                      </>
                    ) : (
                      <span className="pro-cabinet-nav-client-empty-hint">
                        Первые клиенты появятся из заявок
                      </span>
                    )}
                  </div>
                </div>
              </button>
              <button
                className="pro-cabinet-nav-card is-marketing animate delay-7"
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
                <div className="pro-cabinet-nav-preview">
                  <p className="pro-cabinet-nav-note">{marketingHint}</p>
                  <div className="pro-cabinet-nav-meter" aria-hidden="true">
                    <span
                      className="pro-cabinet-nav-meter-fill"
                      style={{ '--meter': marketingMeter } as CSSProperties}
                    />
                  </div>
                  <div className="pro-cabinet-nav-stats">
                    <div className="pro-cabinet-nav-stat">
                      <span className="pro-cabinet-nav-stat-value">
                        {bookingStats.uniqueClients}
                      </span>
                      <span className="pro-cabinet-nav-stat-label">Аудитория</span>
                    </div>
                    <div className="pro-cabinet-nav-stat">
                      <span className="pro-cabinet-nav-stat-value">
                        {bookingStats.repeatClients}
                      </span>
                      <span className="pro-cabinet-nav-stat-label">Повторные</span>
                    </div>
                  </div>
                </div>
              </button>
              <button
                className="pro-cabinet-nav-card is-stories animate delay-8"
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
                <div className="pro-cabinet-nav-preview">
                  <div className="pro-cabinet-nav-stories">
                    <span className="pro-cabinet-nav-stories-badge">
                      {storiesBadgeLabel}
                    </span>
                    <span className="pro-cabinet-nav-story-ring" aria-hidden="true">
                      <span className="pro-cabinet-nav-story-avatar">
                        {avatarDisplayUrl ? (
                          <img src={avatarDisplayUrl} alt="" loading="lazy" />
                        ) : (
                          <span>{profileInitials}</span>
                        )}
                      </span>
                    </span>
                    <p className="pro-cabinet-nav-stories-text">{storiesHint}</p>
                  </div>
                </div>
              </button>
              <button
                className="pro-cabinet-nav-card is-showcase is-wide animate delay-8"
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
                <div className="pro-cabinet-nav-preview is-showcase-preview">
                  <div className="pro-cabinet-nav-mosaic" aria-hidden="true">
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
                              <span className="pro-cabinet-nav-mosaic-fallback">
                                LINK
                              </span>
                            )
                          ) : (
                            <span className="pro-cabinet-nav-mosaic-fallback">+</span>
                          )}
                        </span>
                      )
                    })}
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
          </>
        ) : (
          <button
            className="pro-cabinet-tools-collapsed animate delay-5"
            type="button"
            onClick={() => setIsToolsExpanded(true)}
          >
            <span className="pro-cabinet-tools-collapsed-kicker">
              Инструменты роста
            </span>
            <span className="pro-cabinet-tools-collapsed-title">
              Аналитика, клиенты, контент
            </span>
            <span className="pro-cabinet-tools-collapsed-subtitle">
              {toolsPreviewSubtitle}
            </span>
            <span className="pro-cabinet-tools-collapsed-action">
              Открыть блоки
            </span>
          </button>
        )}
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
