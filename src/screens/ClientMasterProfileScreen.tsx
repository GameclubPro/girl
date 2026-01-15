import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  IconChat,
  IconClock,
  IconHome,
  IconList,
  IconPin,
  IconUser,
  IconUsers,
} from '../components/icons'
import { categoryItems } from '../data/clientData'
import type {
  MasterCertificate,
  MasterProfile,
  MasterReview,
  MasterReviewSummary,
} from '../types/app'
import {
  isImageUrl,
  parsePortfolioItems,
  parseServiceItems,
} from '../utils/profileContent'
import type { PortfolioItem } from '../utils/profileContent'
import type { FavoriteMaster } from '../utils/favorites'

type ClientMasterProfileScreenProps = {
  apiBase: string
  masterId: string
  userId: string
  onBack: () => void
  onViewHome: () => void
  onViewMasters: () => void
  onViewRequests: (tab?: 'requests' | 'bookings') => void
  onViewChats: () => void
  onViewProfile: () => void
  onCreateBooking: () => void
  favorites: FavoriteMaster[]
  onToggleFavorite: (favorite: Omit<FavoriteMaster, 'savedAt'>) => void
  onUpdateFavorite: (favorite: Omit<FavoriteMaster, 'savedAt'>) => void
}

const scheduleLabels: Record<string, string> = {
  mon: 'Пн',
  tue: 'Вт',
  wed: 'Ср',
  thu: 'Чт',
  fri: 'Пт',
  sat: 'Сб',
  sun: 'Вс',
}

const scheduleOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const getCategoryLabel = (categoryId: string) =>
  categoryItems.find((item) => item.id === categoryId)?.label ?? categoryId

const formatPrice = (value: number) =>
  `${Math.round(value).toLocaleString('ru-RU')} ₽`

const formatPriceRange = (from: number | null, to: number | null) => {
  if (typeof from === 'number' && typeof to === 'number') {
    if (from === to) return formatPrice(from)
    return `${formatPrice(from)} - ${formatPrice(to)}`
  }
  if (typeof from === 'number') return `от ${formatPrice(from)}`
  if (typeof to === 'number') return `до ${formatPrice(to)}`
  return 'Цена не указана'
}

const formatExperience = (value: number | null) => {
  if (typeof value !== 'number' || value <= 0) {
    return 'Без опыта'
  }
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return `${value} год`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} года`
  }
  return `${value} лет`
}

const formatCount = (value: number, one: string, few: string, many: string) => {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return `${value} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} ${few}`
  }
  return `${value} ${many}`
}

const formatReviewCount = (value: number) =>
  formatCount(value, 'отзыв', 'отзыва', 'отзывов')

const formatCertificateCount = (value: number) =>
  formatCount(value, 'сертификат', 'сертификата', 'сертификатов')

const buildCertificateMeta = (certificate: MasterCertificate) => {
  const parts = [certificate.issuer, certificate.year?.toString()]
    .filter((item): item is string => Boolean(item && item.trim()))
  return parts.join(' · ')
}

const formatDistanceLabel = (value: number) => {
  if (value < 1) {
    return `${Math.round(value * 1000)} м`
  }
  return `${value.toFixed(1).replace('.', ',')} км`
}

const buildLocationLabel = (profile: MasterProfile | null) => {
  if (!profile) return 'Локация не указана'
  const parts = [profile.cityName, profile.districtName].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : 'Локация не указана'
}

const buildWorkFormatLabel = (profile: MasterProfile | null) => {
  if (!profile) return 'Формат не указан'
  if (profile.worksAtClient && profile.worksAtMaster) return 'У мастера и выезд'
  if (profile.worksAtClient) return 'Выезд к клиенту'
  if (profile.worksAtMaster) return 'У мастера'
  return 'Формат не указан'
}

const buildScheduleRange = (start?: string | null, end?: string | null) => {
  const normalizedStart = typeof start === 'string' ? start.trim() : ''
  const normalizedEnd = typeof end === 'string' ? end.trim() : ''
  if (normalizedStart && normalizedEnd) return `${normalizedStart} – ${normalizedEnd}`
  if (normalizedStart) return `с ${normalizedStart}`
  if (normalizedEnd) return `до ${normalizedEnd}`
  return 'Время не указано'
}

const parseTimeToMinutes = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) return null
  const [hoursRaw, minutesRaw] = normalized.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

const buildScheduleLabel = (days: string[]) =>
  days.length > 0
    ? days.map((day) => scheduleLabels[day] ?? day).join(', ')
    : 'График не указан'

const getInitials = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return 'М'
  const parts = normalized.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0] ?? '')
  const joined = letters.join('').toUpperCase()
  if (joined) return joined
  return normalized.slice(0, 2).toUpperCase()
}

const formatReviewDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const buildReviewerName = (review: MasterReview) => {
  const name = [review.reviewerFirstName, review.reviewerLastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  if (name) return name
  if (review.reviewerUsername) return `@${review.reviewerUsername}`
  return 'Клиент'
}

const buildStars = (value: number) => {
  const clamped = Math.max(0, Math.min(5, Math.round(value)))
  return Array.from({ length: 5 }, (_, index) => (index < clamped ? '★' : '☆')).join(
    ''
  )
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value))
const CERTIFICATE_RATIO_MIN = 3 / 4
const CERTIFICATE_RATIO_MAX = 4 / 3
const clampCertificateRatio = (value: number) =>
  Math.min(CERTIFICATE_RATIO_MAX, Math.max(CERTIFICATE_RATIO_MIN, value))

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

const PORTFOLIO_PREVIEW_LIMIT = 4

type MasterProfileTabId = 'overview' | 'portfolio' | 'schedule' | 'reviews'

export const ClientMasterProfileScreen = ({
  apiBase,
  masterId,
  userId,
  onBack,
  onViewHome,
  onViewMasters,
  onViewRequests,
  onViewChats,
  onViewProfile,
  onCreateBooking,
  favorites,
  onToggleFavorite,
  onUpdateFavorite,
}: ClientMasterProfileScreenProps) => {
  const [profile, setProfile] = useState<MasterProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reviews, setReviews] = useState<MasterReview[]>([])
  const [reviewSummary, setReviewSummary] =
    useState<MasterReviewSummary | null>(null)
  const [isReviewsLoading, setIsReviewsLoading] = useState(false)
  const [reviewsError, setReviewsError] = useState('')
  const [isPortfolioExpanded, setIsPortfolioExpanded] = useState(false)
  const [portfolioLightboxIndex, setPortfolioLightboxIndex] = useState<
    number | null
  >(null)
  const [certificateLightboxIndex, setCertificateLightboxIndex] = useState<
    number | null
  >(null)
  const [certificateRatios, setCertificateRatios] = useState<
    Record<string, number>
  >({})
  const [isScheduleInfoOpen, setIsScheduleInfoOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<MasterProfileTabId>('overview')
  const scheduleInfoRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!masterId) return
    let cancelled = false

    const loadProfile = async () => {
      setIsLoading(true)
      setLoadError('')
      setProfile(null)
      try {
        const response = await fetch(`${apiBase}/api/masters/${masterId}`)
        if (!response.ok) {
          throw new Error('Load profile failed')
        }
        const data = (await response.json()) as MasterProfile
        if (!cancelled) {
          setProfile(data)
        }
      } catch (error) {
        if (!cancelled) {
          setProfile(null)
          setLoadError('Не удалось загрузить профиль мастера.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [apiBase, masterId])

  useEffect(() => {
    if (!masterId || !userId || masterId === userId) return
    const reportView = async () => {
      try {
        await fetch(`${apiBase}/api/masters/${masterId}/view`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            tzOffset: new Date().getTimezoneOffset(),
          }),
        })
      } catch (error) {
        // View tracking should not block profile usage.
      }
    }
    void reportView()
  }, [apiBase, masterId, userId])

  useEffect(() => {
    if (!masterId) return
    let cancelled = false

    const loadReviews = async () => {
      setIsReviewsLoading(true)
      setReviewsError('')
      setReviews([])
      setReviewSummary(null)
      try {
        const response = await fetch(
          `${apiBase}/api/masters/${masterId}/reviews?limit=8`
        )
        if (!response.ok) {
          throw new Error('Load reviews failed')
        }
        const data = (await response.json()) as {
          summary?: MasterReviewSummary | null
          reviews?: MasterReview[]
        }
        if (!cancelled) {
          setReviewSummary(data.summary ?? null)
          setReviews(Array.isArray(data.reviews) ? data.reviews : [])
        }
      } catch (error) {
        if (!cancelled) {
          setReviews([])
          setReviewSummary(null)
          setReviewsError('Не удалось загрузить отзывы.')
        }
      } finally {
        if (!cancelled) {
          setIsReviewsLoading(false)
        }
      }
    }

    void loadReviews()

    return () => {
      cancelled = true
    }
  }, [apiBase, masterId])

  useEffect(() => {
    setIsPortfolioExpanded(false)
    setPortfolioLightboxIndex(null)
    setIsScheduleInfoOpen(false)
    setActiveTab('overview')
  }, [masterId])

  useEffect(() => {
    if (!isScheduleInfoOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) {
        setIsScheduleInfoOpen(false)
        return
      }
      const container = scheduleInfoRef.current
      if (container && container.contains(target)) {
        return
      }
      setIsScheduleInfoOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isScheduleInfoOpen])

  useEffect(() => {
    if (activeTab !== 'schedule') {
      setIsScheduleInfoOpen(false)
    }
  }, [activeTab])

  const handleTabChange = (nextTab: MasterProfileTabId) => {
    setActiveTab(nextTab)
    const panel = document.getElementById('master-profile-panel')
    if (!panel) return
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    panel.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  const serviceItems = useMemo(
    () => parseServiceItems(profile?.services ?? []),
    [profile]
  )

  const portfolioItems = useMemo(
    () => parsePortfolioItems(profile?.portfolioUrls ?? []),
    [profile]
  )

  const showcaseItems = useMemo(
    () => parsePortfolioItems(profile?.showcaseUrls ?? []),
    [profile]
  )

  const categoryLabels = useMemo(() => {
    const categories = Array.isArray(profile?.categories) ? profile?.categories : []
    if (!categories || categories.length === 0) return ['Мастер-универсал']
    return categories.map((categoryId) => getCategoryLabel(categoryId))
  }, [profile])

  const displayName = profile?.displayName?.trim() || 'Мастер'
  const initials = getInitials(displayName)
  const aboutValue = profile?.about?.trim() || ''
  const aboutText = aboutValue || 'Статус пока не добавлен.'
  const primaryCategory = categoryLabels[0]
  const reviewCount = reviewSummary?.count ?? 0
  const reviewAverage = reviewSummary?.average ?? 0
  const reviewDistribution = reviewSummary?.distribution ?? []
  const reviewCountLabel = reviewCount > 0 ? formatReviewCount(reviewCount) : 'Нет отзывов'
  const followersCount =
    typeof profile?.followersCount === 'number' &&
    Number.isFinite(profile.followersCount)
      ? Math.max(0, Math.round(profile.followersCount))
      : 0
  const followersValue = followersCount.toLocaleString('ru-RU')
  const portfolioCount = portfolioItems.filter((item) => item.url.trim()).length
  const reviewAverageLabel = reviewCount > 0 ? reviewAverage.toFixed(1) : '—'
  const profileStats = [
    { label: 'Работы', value: String(portfolioCount) },
    { label: 'Рейтинг', value: reviewAverageLabel },
    { label: 'Отзывы', value: String(reviewCount) },
    { label: 'Подписчики', value: followersValue },
  ]
  const priceLabel = formatPriceRange(
    profile?.priceFrom ?? null,
    profile?.priceTo ?? null
  )
  const experienceLabel = formatExperience(profile?.experienceYears ?? null)
  const distanceKm =
    typeof profile?.distanceKm === 'number' && Number.isFinite(profile.distanceKm)
      ? Math.max(0, profile.distanceKm)
      : null
  const distanceLabel = distanceKm !== null ? formatDistanceLabel(distanceKm) : null
  const locationLabelBase = buildLocationLabel(profile)
  const locationLabel =
    distanceLabel && locationLabelBase !== 'Локация не указана'
      ? `${locationLabelBase} · ${distanceLabel}`
      : distanceLabel
        ? `Рядом · ${distanceLabel}`
        : locationLabelBase
  const workFormatLabel = buildWorkFormatLabel(profile)
  const hasLocation = Boolean(
    profile?.cityName || profile?.districtName || distanceLabel
  )
  const hasWorkFormat = Boolean(profile?.worksAtClient || profile?.worksAtMaster)
  const hasPrice =
    typeof profile?.priceFrom === 'number' || typeof profile?.priceTo === 'number'
  const hasExperience =
    typeof profile?.experienceYears === 'number' &&
    Number.isFinite(profile.experienceYears)
  const profileFacts = [
    {
      id: 'location',
      label: 'Локация',
      value: locationLabel,
      icon: <IconPin />,
      isMuted: !hasLocation,
    },
    {
      id: 'format',
      label: 'Формат',
      value: workFormatLabel,
      icon: <IconHome />,
      isMuted: !hasWorkFormat,
    },
    {
      id: 'price',
      label: 'Цена',
      value: priceLabel,
      icon: <IconList />,
      isMuted: !hasPrice,
    },
    {
      id: 'experience',
      label: 'Опыт',
      value: experienceLabel,
      icon: <IconClock />,
      isMuted: !hasExperience,
    },
  ]
  const scheduleDays = Array.isArray(profile?.scheduleDays) ? profile?.scheduleDays : []
  const scheduleDayKeys = useMemo(
    () =>
      scheduleDays
        .map((day) => day.trim().toLowerCase())
        .filter((day) => Boolean(day)),
    [scheduleDays]
  )
  const scheduleDaySet = useMemo(() => new Set(scheduleDayKeys), [scheduleDayKeys])
  const scheduleWeek = useMemo(
    () =>
      scheduleOrder.map((day) => ({
        id: day,
        label: scheduleLabels[day] ?? day,
        isActive: scheduleDaySet.has(day),
      })),
    [scheduleDaySet]
  )
  const hasScheduleDays = scheduleDayKeys.length > 0
  const scheduleLabel = buildScheduleLabel(scheduleDayKeys)
  const workingDays = scheduleWeek
    .filter((day) => day.isActive)
    .map((day) => day.label)
  const offDays = scheduleWeek
    .filter((day) => !day.isActive)
    .map((day) => day.label)
  const workingDaysLabel = hasScheduleDays
    ? workingDays.length > 0
      ? workingDays.join(', ')
      : scheduleLabel
    : 'График не указан'
  const offDaysLabel = hasScheduleDays
    ? offDays.length > 0
      ? offDays.join(', ')
      : 'Нет'
    : '—'
  const scheduleRange = buildScheduleRange(
    profile?.scheduleStart,
    profile?.scheduleEnd
  )
  const scheduleStartMinutes = parseTimeToMinutes(profile?.scheduleStart)
  const scheduleEndMinutes = parseTimeToMinutes(profile?.scheduleEnd)
  const hasScheduleTimebar =
    scheduleStartMinutes !== null &&
    scheduleEndMinutes !== null &&
    scheduleEndMinutes > scheduleStartMinutes
  const scheduleTimeStyle = hasScheduleTimebar
    ? ({
        '--schedule-start': `${(scheduleStartMinutes / 1440) * 100}%`,
        '--schedule-width': `${((scheduleEndMinutes - scheduleStartMinutes) / 1440) * 100}%`,
      } as CSSProperties)
    : undefined
  const hasScheduleRange = scheduleRange !== 'Время не указано'
  const serviceNames = useMemo(
    () => serviceItems.map((item) => item.name.trim()).filter(Boolean),
    [serviceItems]
  )
  const previewTagSource = serviceNames.length > 0 ? serviceNames : categoryLabels
  const previewTags = previewTagSource.slice(0, 3)
  const previewTagRemainder = previewTagSource.length - previewTags.length
  const isActive = Boolean(profile?.isActive ?? true)
  const certificateItems = useMemo(
    () =>
      (Array.isArray(profile?.certificates) ? profile?.certificates : []).filter(
        (certificate) => certificate.url?.toString().trim() || certificate.title
      ),
    [profile]
  )
  const certificateCount = certificateItems.length
  const certificateCountLabel =
    certificateCount > 0 ? formatCertificateCount(certificateCount) : 'Нет сертификатов'
  const handleCertificateImageLoad = (
    certificateId: string,
    image: HTMLImageElement
  ) => {
    if (!image.naturalWidth || !image.naturalHeight) return
    const ratio = clampCertificateRatio(image.naturalWidth / image.naturalHeight)
    setCertificateRatios((current) =>
      current[certificateId] === ratio
        ? current
        : { ...current, [certificateId]: ratio }
    )
  }

  const portfolioGridItems = useMemo(
    () =>
      portfolioItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.url.trim()),
    [portfolioItems]
  )
  const hasPortfolioOverflow = portfolioGridItems.length > PORTFOLIO_PREVIEW_LIMIT
  const isPortfolioCollapsed = !isPortfolioExpanded
  const isFavorite = favorites.some((favorite) => favorite.masterId === masterId)
  const followActionLabel = isFavorite ? 'Вы подписаны' : 'Подписаться'
  const followAriaLabel = isFavorite
    ? 'Отписаться от мастера'
    : 'Подписаться на мастера'
  const favoritePayload = useMemo(
    () => ({
      masterId,
      displayName: profile?.displayName?.trim() || 'Мастер',
      avatarUrl: profile?.avatarUrl ?? null,
      categories: profile?.categories ?? [],
      cityName: profile?.cityName ?? null,
      districtName: profile?.districtName ?? null,
      reviewsAverage: profile?.reviewsAverage ?? null,
      reviewsCount: profile?.reviewsCount ?? null,
      priceFrom: profile?.priceFrom ?? null,
      priceTo: profile?.priceTo ?? null,
      updatedAt: profile?.updatedAt ?? null,
    }),
    [masterId, profile]
  )
  const visiblePortfolioItems = portfolioGridItems
  const portfolioCountLabel =
    portfolioGridItems.length > 0 ? `${portfolioGridItems.length} фото` : 'Нет фото'
  const masterTabs: { id: MasterProfileTabId; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Обзор' },
    { id: 'portfolio', label: 'Портфолио', badge: portfolioGridItems.length },
    { id: 'schedule', label: 'График' },
    { id: 'reviews', label: 'Отзывы', badge: reviewCount },
  ]

  const portfolioLightboxItem =
    portfolioLightboxIndex !== null ? portfolioItems[portfolioLightboxIndex] ?? null : null
  const portfolioLightboxFocus = resolvePortfolioFocus(portfolioLightboxItem)
  const isLightboxImage = portfolioLightboxItem
    ? isImageUrl(portfolioLightboxItem.url)
    : false
  const certificateLightboxItem =
    certificateLightboxIndex !== null
      ? certificateItems[certificateLightboxIndex] ?? null
      : null
  const certificateLightboxTitle =
    certificateLightboxItem?.title?.trim() || 'Сертификат'
  const certificateLightboxMeta = certificateLightboxItem
    ? buildCertificateMeta(certificateLightboxItem)
    : ''
  const certificateLightboxRatio = certificateLightboxItem
    ? certificateRatios[certificateLightboxItem.id]
    : undefined
  const certificateLightboxStyle = certificateLightboxRatio
    ? ({ '--certificate-ratio': certificateLightboxRatio } as CSSProperties)
    : undefined

  const coverUrl = profile?.coverUrl ?? null
  const coverFocus = '50% 50%'
  const openCertificateLightbox = (index: number) => {
    if (!certificateItems[index]) return
    setCertificateLightboxIndex(index)
  }
  const closeCertificateLightbox = () => {
    setCertificateLightboxIndex(null)
  }

  useEffect(() => {
    if (
      certificateLightboxIndex !== null &&
      !certificateItems[certificateLightboxIndex]
    ) {
      setCertificateLightboxIndex(null)
    }
  }, [certificateItems, certificateLightboxIndex])

  useEffect(() => {
    if (!certificateLightboxItem) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [certificateLightboxItem])

  useEffect(() => {
    if (profile && isFavorite) {
      onUpdateFavorite(favoritePayload)
    }
  }, [favoritePayload, isFavorite, onUpdateFavorite, profile])

  return (
    <div className="screen screen--client screen--client-master-profile">
      <div className="pro-shell pro-shell--ig">
        <header className="master-profile-header">
          <button
            className="pro-back"
            type="button"
            onClick={onBack}
            aria-label="Назад"
          >
            ←
          </button>
          <div className="master-profile-context">
            <span className="master-profile-context-kicker">Профиль мастера</span>
            <span className="master-profile-context-title">{primaryCategory}</span>
          </div>
          <button
            className={`master-profile-like${isFavorite ? ' is-active' : ''}`}
            type="button"
            onClick={() => onToggleFavorite(favoritePayload)}
            aria-label={followAriaLabel}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 20.2s-6.4-3.7-8.6-7.4c-1.6-2.7-0.8-6.1 2-7.2 2.1-0.9 4.6-0.1 6.6 1.8 2-1.9 4.5-2.7 6.6-1.8 2.8 1.1 3.6 4.5 2 7.2-2.2 3.7-8.6 7.4-8.6 7.4Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </header>

        {loadError && <p className="pro-error">{loadError}</p>}
        {isLoading ? (
          <div className="master-profile-skeleton" aria-hidden="true">
            <div className="master-profile-skeleton-cover" />
            <div className="master-profile-skeleton-line is-wide" />
            <div className="master-profile-skeleton-line" />
            <div className="master-profile-skeleton-line is-short" />
          </div>
        ) : profile ? (
          <>
            <section className="pro-profile-ig animate delay-1">
              <div
                className={`pro-profile-ig-cover${coverUrl ? ' has-image' : ''}`}
                style={
                  coverUrl
                    ? { backgroundImage: `url(${coverUrl})`, backgroundPosition: coverFocus }
                    : undefined
                }
              >
                <div className="pro-profile-ig-cover-glow" aria-hidden="true" />
                {!coverUrl && (
                  <span className="master-profile-cover-fallback" aria-hidden="true">
                    {initials}
                  </span>
                )}
              </div>
            <div className="pro-profile-ig-header">
              <div className="pro-profile-ig-avatar">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={`Аватар ${displayName}`} />
                ) : (
                  <span aria-hidden="true">{initials}</span>
                )}
              </div>
              <div className="pro-profile-ig-name-row">
                <h1 className="pro-profile-ig-name">{displayName}</h1>
              </div>
              <div className="pro-profile-ig-stats">
                {profileStats.map((stat) => (
                  <div className="pro-profile-ig-stat" key={stat.label}>
                    <span className="pro-profile-ig-stat-value">{stat.value}</span>
                    <span className="pro-profile-ig-stat-label">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
              <div className="pro-profile-ig-actions">
                <button
                  className="pro-profile-ig-button pro-profile-ig-button--primary"
                  type="button"
                  onClick={onCreateBooking}
                >
                  Записаться
                </button>
                <button
                  className={`pro-profile-ig-button master-profile-follow-button${
                    isFavorite ? ' is-active' : ''
                  }`}
                  type="button"
                  onClick={() => onToggleFavorite(favoritePayload)}
                  aria-label={followAriaLabel}
                >
                  <span className="pro-profile-ig-button-icon" aria-hidden="true">
                    <IconUsers />
                  </span>
                  <span className="pro-profile-ig-button-label">
                    {followActionLabel}
                  </span>
                </button>
                <button
                  className="pro-profile-ig-button"
                  type="button"
                  onClick={onViewMasters}
                >
                  Все мастера
                </button>
              </div>
            </section>

            <div
              className="master-profile-tabs"
              role="tablist"
              aria-label="Разделы профиля мастера"
            >
              {masterTabs.map((tab) => (
                <button
                  className={`master-profile-tab${
                    activeTab === tab.id ? ' is-active' : ''
                  }`}
                  type="button"
                  key={tab.id}
                  id={`master-profile-tab-${tab.id}`}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls="master-profile-panel"
                  onClick={() => handleTabChange(tab.id)}
                >
                  <span>{tab.label}</span>
                  {typeof tab.badge === 'number' && tab.badge > 0 && (
                    <span className="master-profile-tab-badge" aria-hidden="true">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div
              id="master-profile-panel"
              className="master-profile-panel"
              role="tabpanel"
              aria-labelledby={`master-profile-tab-${activeTab}`}
              key={activeTab}
            >
              {activeTab === 'overview' && (
                <div className="pro-profile-ig-body master-profile-overview animate delay-2">
                  <div className="pro-profile-status-card">
                    <div className="pro-profile-status-head">
                      <span className="pro-profile-status-title">Статус</span>
                      <span
                        className={`pro-profile-ig-status${
                          isActive ? '' : ' is-paused'
                        }`}
                      >
                        <span className="pro-profile-social-dot" aria-hidden="true" />
                        {isActive ? 'Запись открыта' : 'Пауза'}
                      </span>
                    </div>
                    <p
                      className={`pro-profile-status-text${
                        aboutValue ? '' : ' is-muted'
                      }`}
                    >
                      {aboutText}
                    </p>
                  </div>
                  <div className="pro-profile-facts-grid">
                    {profileFacts.map((fact) => (
                      <div
                        className={`pro-profile-fact-card${
                          fact.isMuted ? ' is-muted' : ''
                        }`}
                        key={fact.label}
                      >
                        <span
                          className={`pro-profile-fact-icon is-${fact.id}`}
                          aria-hidden="true"
                        >
                          {fact.icon}
                        </span>
                        <div className="pro-profile-fact-info">
                          <span className="pro-profile-fact-value">
                            {fact.value}
                          </span>
                          <span className="pro-profile-fact-label">
                            {fact.label}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pro-profile-certificates is-client">
                    <div className="pro-profile-certificates-head">
                      <div>
                        <p className="pro-profile-certificates-kicker">Квалификация</p>
                        <h3 className="pro-profile-certificates-title">
                          Сертификаты
                        </h3>
                      </div>
                      <div className="pro-profile-certificates-actions">
                        <span className="pro-profile-certificates-count">
                          {certificateCountLabel}
                        </span>
                      </div>
                    </div>
                    {certificateItems.length > 0 ? (
                      <div className="pro-profile-certificates-list" role="list">
                        {certificateItems.map((certificate, index) => {
                          const meta = buildCertificateMeta(certificate)
                          const title = certificate.title?.trim() || 'Сертификат'
                          const certificateStyle = certificateRatios[certificate.id]
                            ? ({
                                '--certificate-ratio': certificateRatios[certificate.id],
                              } as CSSProperties)
                            : undefined
                          return (
                            <button
                              className="pro-profile-certificate-card"
                              type="button"
                              key={certificate.id ?? `${certificate.url}-${index}`}
                              onClick={() => openCertificateLightbox(index)}
                              role="listitem"
                              aria-label={title}
                            >
                              <div
                                className="pro-profile-certificate-media"
                                style={certificateStyle}
                              >
                                {certificate.url ? (
                                  <img
                                    src={certificate.url}
                                    alt=""
                                    loading="lazy"
                                    onLoad={(event) =>
                                      handleCertificateImageLoad(
                                        certificate.id,
                                        event.currentTarget
                                      )
                                    }
                                  />
                                ) : (
                                  <span className="pro-profile-certificate-fallback">
                                    CERT
                                  </span>
                                )}
                              </div>
                              <div className="pro-profile-certificate-info">
                                <span className="pro-profile-certificate-title">
                                  {title}
                                </span>
                                <span
                                  className={`pro-profile-certificate-meta${
                                    meta ? '' : ' is-muted'
                                  }`}
                                >
                                  {meta || 'Данные не указаны'}
                                </span>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="pro-profile-certificates-empty">
                        Сертификатов пока нет.
                      </div>
                    )}
                  </div>
                  <div className="pro-profile-ig-tags">
                    {previewTags.length > 0 ? (
                      <>
                        {previewTags.map((label, index) => (
                          <span className="pro-profile-tag" key={`${label}-${index}`}>
                            {label}
                          </span>
                        ))}
                        {previewTagRemainder > 0 && (
                          <span className="pro-profile-tag is-muted">
                            +{previewTagRemainder}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="pro-profile-tag is-muted">
                        Теги появятся здесь
                      </span>
                    )}
                    {reviewCount > 0 ? (
                      <span className="pro-profile-tag is-review">
                        ★ {reviewAverage.toFixed(1)} · {reviewCountLabel}
                      </span>
                    ) : (
                      <span className="pro-profile-tag is-muted">Нет отзывов</span>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'portfolio' && (
                <section className="pro-profile-portfolio-panel animate delay-2">
                  <div className="pro-profile-portfolio-panel-head">
                    <div className="pro-profile-portfolio-panel-controls">
                      <span className="pro-profile-portfolio-panel-count">
                        {portfolioCountLabel}
                      </span>
                      {hasPortfolioOverflow && (
                        <button
                          className="pro-profile-portfolio-panel-action"
                          type="button"
                          onClick={() => setIsPortfolioExpanded((current) => !current)}
                          aria-expanded={isPortfolioExpanded}
                        >
                          {isPortfolioExpanded ? 'Свернуть' : 'Все фото'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    className={`pro-profile-portfolio-grid${
                      isPortfolioCollapsed ? ' is-collapsed' : ''
                    }`}
                    role="list"
                    aria-label="Портфолио"
                  >
                    {visiblePortfolioItems.length > 0 ? (
                      visiblePortfolioItems.map(({ item, index }) => {
                        const focus = resolvePortfolioFocus(item)
                        const showImage = isImageUrl(item.url)
                        const isInShowcase = showcaseItems.some(
                          (showcaseItem) => showcaseItem.url === item.url
                        )
                        return (
                          <button
                            className="pro-profile-portfolio-item"
                            key={`${item.url}-${index}`}
                            type="button"
                            onClick={() => setPortfolioLightboxIndex(index)}
                            role="listitem"
                            aria-label={`Открыть работу ${index + 1}`}
                          >
                            {showImage ? (
                              <img
                                src={item.url}
                                alt=""
                                loading="lazy"
                                style={{ objectPosition: focus.position }}
                              />
                            ) : (
                              <span className="pro-profile-portfolio-fallback">
                                LINK
                              </span>
                            )}
                            {isInShowcase && (
                              <span
                                className="pro-profile-portfolio-badge"
                                aria-hidden="true"
                                title="В витрине"
                              >
                                ✦
                              </span>
                            )}
                          </button>
                        )
                      })
                    ) : (
                      <div className="pro-profile-portfolio-empty" role="listitem">
                        У мастера пока нет работ.
                      </div>
                    )}
                  </div>
                </section>
              )}

              {activeTab === 'schedule' && (
                <section className="pro-profile-schedule-panel animate delay-2">
                  <div className="pro-profile-schedule-head">
                    <div>
                      <h3 className="pro-profile-schedule-title">График работы</h3>
                      <p className="pro-profile-schedule-subtitle">
                        {scheduleDays.length > 0 ? 'Дни приема' : 'График не указан'}
                      </p>
                    </div>
                    <div
                      className="pro-profile-schedule-info-wrap"
                      ref={scheduleInfoRef}
                    >
                      <button
                        className="pro-profile-schedule-info"
                        type="button"
                        aria-label="Показать график"
                        aria-expanded={isScheduleInfoOpen}
                        aria-controls="pro-profile-schedule-popover"
                        onClick={() => setIsScheduleInfoOpen((current) => !current)}
                      >
                        i
                      </button>
                      {isScheduleInfoOpen && (
                        <div
                          className="pro-profile-schedule-popover"
                          id="pro-profile-schedule-popover"
                          role="tooltip"
                        >
                          <p className="pro-profile-schedule-popover-title">
                            График
                          </p>
                          <div className="pro-profile-schedule-popover-row">
                            <span className="pro-profile-schedule-popover-label">
                              Рабочие дни
                            </span>
                            <span
                              className={`pro-profile-schedule-popover-value${
                                hasScheduleDays ? '' : ' is-muted'
                              }`}
                            >
                              {workingDaysLabel}
                            </span>
                          </div>
                          <div className="pro-profile-schedule-popover-row">
                            <span className="pro-profile-schedule-popover-label">
                              Выходные
                            </span>
                            <span
                              className={`pro-profile-schedule-popover-value${
                                hasScheduleDays ? '' : ' is-muted'
                              }`}
                            >
                              {offDaysLabel}
                            </span>
                          </div>
                          <div className="pro-profile-schedule-popover-row">
                            <span className="pro-profile-schedule-popover-label">
                              Время
                            </span>
                            <span
                              className={`pro-profile-schedule-popover-value${
                                hasScheduleRange ? '' : ' is-muted'
                              }`}
                            >
                              {scheduleRange}
                            </span>
                          </div>
                          <div
                            className="pro-profile-schedule-popover-week"
                            role="list"
                          >
                            {scheduleWeek.map((day) => (
                              <span
                                className={`pro-profile-schedule-popover-day${
                                  day.isActive ? ' is-active' : ''
                                }`}
                                key={`popover-${day.id}`}
                                role="listitem"
                              >
                                {day.label}
                              </span>
                            ))}
                          </div>
                          <div
                            className={`pro-profile-schedule-timebar${
                              hasScheduleTimebar ? '' : ' is-muted'
                            }`}
                            style={scheduleTimeStyle}
                          />
                          <div className="pro-profile-schedule-timebar-scale">
                            <span>0:00</span>
                            <span>24:00</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="pro-profile-schedule-week" role="list">
                    {scheduleWeek.map((day) => (
                      <span
                        className={`pro-profile-schedule-day${
                          day.isActive ? ' is-active' : ''
                        }`}
                        key={day.id}
                        role="listitem"
                      >
                        {day.label}
                      </span>
                    ))}
                  </div>
                  <div className="pro-profile-schedule-range">
                    <span className="pro-profile-schedule-range-label">Время</span>
                    <span
                      className={`pro-profile-schedule-range-value${
                        hasScheduleRange ? '' : ' is-muted'
                      }`}
                    >
                      {scheduleRange}
                    </span>
                  </div>
                </section>
              )}

              {activeTab === 'reviews' && (
                <section className="pro-profile-reviews animate delay-3">
                  <div className="pro-profile-reviews-head">
                    <div>
                      <p className="pro-profile-reviews-kicker">Отзывы</p>
                      <h2 className="pro-profile-reviews-title">Отзывы клиентов</h2>
                    </div>
                    <span className="pro-profile-reviews-count-pill">
                      {reviewCountLabel}
                    </span>
                  </div>

                  {isReviewsLoading ? (
                    <div className="pro-profile-reviews-skeleton" aria-hidden="true">
                      <div className="pro-profile-reviews-skeleton-line is-wide" />
                      <div className="pro-profile-reviews-skeleton-line" />
                      <div className="pro-profile-reviews-skeleton-line is-short" />
                    </div>
                  ) : reviewsError ? (
                    <p className="pro-error">{reviewsError}</p>
                  ) : reviewCount > 0 ? (
                    <>
                      <div className="pro-profile-reviews-summary">
                        <div className="pro-profile-reviews-score">
                          <span className="pro-profile-reviews-average">
                            {reviewAverage.toFixed(1)}
                          </span>
                          <span className="pro-profile-reviews-stars">
                            {buildStars(reviewAverage)}
                          </span>
                          <span className="pro-profile-reviews-count">
                            {reviewCountLabel}
                          </span>
                        </div>
                        <div className="pro-profile-reviews-bars">
                          {reviewDistribution.map((entry) => {
                            const percent =
                              reviewCount > 0
                                ? (entry.count / reviewCount) * 100
                                : 0
                            return (
                              <div
                                className="pro-profile-reviews-bar"
                                key={`rating-${entry.rating}`}
                              >
                                <span className="pro-profile-reviews-bar-label">
                                  {entry.rating}
                                </span>
                                <span className="pro-profile-reviews-bar-track">
                                  <span
                                    className="pro-profile-reviews-bar-fill"
                                    style={{ width: `${percent}%` }}
                                  />
                                </span>
                                <span className="pro-profile-reviews-bar-count">
                                  {entry.count}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <div className="pro-profile-reviews-list">
                        {reviews.map((review) => {
                          const reviewerName = buildReviewerName(review)
                          const reviewerInitials = getInitials(reviewerName)
                          const dateLabel = formatReviewDate(review.createdAt)
                          const comment =
                            review.comment?.trim() || 'Без комментария.'

                          return (
                            <article className="pro-profile-review-card" key={review.id}>
                              <span
                                className="pro-profile-review-avatar"
                                aria-hidden="true"
                              >
                                {reviewerInitials}
                              </span>
                              <div className="pro-profile-review-body">
                                <div className="pro-profile-review-head">
                                  <span className="pro-profile-review-name">
                                    {reviewerName}
                                  </span>
                                  <span className="pro-profile-review-rating">
                                    {buildStars(review.rating)}
                                  </span>
                                </div>
                                {(review.serviceName || dateLabel) && (
                                  <div className="pro-profile-review-meta">
                                    {review.serviceName && (
                                      <span className="pro-profile-review-service">
                                        {review.serviceName}
                                      </span>
                                    )}
                                    {dateLabel && (
                                      <span className="pro-profile-review-date">
                                        {dateLabel}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <p className="pro-profile-review-text">{comment}</p>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="pro-profile-reviews-empty">Пока нет отзывов.</p>
                  )}
                </section>
              )}
            </div>
          </>
        ) : null}
      </div>

      {portfolioLightboxItem && (
        <div
          className="pro-portfolio-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setPortfolioLightboxIndex(null)}
        >
          <div
            className="pro-portfolio-lightbox"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pro-portfolio-lightbox-head">
              <div>
                <p className="pro-portfolio-lightbox-kicker">Портфолио</p>
                <h3 className="pro-portfolio-lightbox-title">
                  {portfolioLightboxItem.title?.trim() ||
                    `Работа ${portfolioLightboxIndex !== null ? portfolioLightboxIndex + 1 : 1}`}
                </h3>
              </div>
              <button
                className="pro-portfolio-lightbox-close"
                type="button"
                onClick={() => setPortfolioLightboxIndex(null)}
              >
                Закрыть
              </button>
            </div>
            <div className="pro-portfolio-lightbox-media">
              {isLightboxImage ? (
                <img
                  src={portfolioLightboxItem.url}
                  alt={portfolioLightboxItem.title ?? 'Работа'}
                  style={{ objectPosition: portfolioLightboxFocus.position }}
                />
              ) : (
                <a
                  className="pro-portfolio-lightbox-link"
                  href={portfolioLightboxItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть ссылку
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {certificateLightboxItem && (
        <div
          className="pro-portfolio-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          onClick={closeCertificateLightbox}
        >
          <div
            className="pro-portfolio-lightbox is-certificate"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pro-portfolio-lightbox-head">
              <div>
                <p className="pro-portfolio-lightbox-kicker">Сертификат</p>
                <h3 className="pro-portfolio-lightbox-title">
                  {certificateLightboxTitle}
                </h3>
                {certificateLightboxMeta && (
                  <p className="pro-portfolio-lightbox-subtitle">
                    {certificateLightboxMeta}
                  </p>
                )}
              </div>
              <button
                className="pro-portfolio-lightbox-close"
                type="button"
                onClick={closeCertificateLightbox}
              >
                Закрыть
              </button>
            </div>
            <div
              className="pro-portfolio-lightbox-media is-certificate"
              style={certificateLightboxStyle}
            >
              {certificateLightboxItem.url ? (
                <img
                  src={certificateLightboxItem.url}
                  alt={certificateLightboxTitle}
                  loading="lazy"
                  onLoad={(event) =>
                    handleCertificateImageLoad(
                      certificateLightboxItem.id,
                      event.currentTarget
                    )
                  }
                />
              ) : (
                <span className="pro-profile-certificate-fallback">
                  Нет изображения
                </span>
              )}
            </div>
            {certificateLightboxItem.verifyUrl && (
              <div className="pro-portfolio-lightbox-actions">
                <a
                  className="pro-portfolio-lightbox-action"
                  href={certificateLightboxItem.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Проверить сертификат
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Навигация">
        <button className="nav-item" type="button" onClick={onViewHome}>
          <span className="nav-icon" aria-hidden="true">
            <IconHome />
          </span>
          Главная
        </button>
        <button className="nav-item is-active" type="button" onClick={onViewMasters}>
          <span className="nav-icon" aria-hidden="true">
            <IconUsers />
          </span>
          Мастера
        </button>
        <button className="nav-item" type="button" onClick={onViewChats}>
          <span className="nav-icon" aria-hidden="true">
            <IconChat />
          </span>
          Чаты
        </button>
        <button className="nav-item" type="button" onClick={() => onViewRequests()}>
          <span className="nav-icon" aria-hidden="true">
            <IconList />
          </span>
          Мои заявки
        </button>
        <button className="nav-item" type="button" onClick={onViewProfile}>
          <span className="nav-icon" aria-hidden="true">
            <IconUser />
          </span>
          Профиль
        </button>
      </nav>
    </div>
  )
}
