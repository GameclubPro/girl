import { useEffect, useMemo, useState } from 'react'
import {
  IconClock,
  IconHome,
  IconList,
  IconPin,
  IconUser,
  IconUsers,
} from '../components/icons'
import { categoryItems } from '../data/clientData'
import type { MasterProfile, MasterReview, MasterReviewSummary } from '../types/app'
import {
  isImageUrl,
  parsePortfolioItems,
  parseServiceItems,
} from '../utils/profileContent'
import type { PortfolioItem } from '../utils/profileContent'

type ClientMasterProfileScreenProps = {
  apiBase: string
  masterId: string
  onBack: () => void
  onViewHome: () => void
  onViewMasters: () => void
  onViewRequests: () => void
  onCreateBooking: () => void
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

const formatServiceCount = (value: number) =>
  formatCount(value, 'услуга', 'услуги', 'услуг')

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

export const ClientMasterProfileScreen = ({
  apiBase,
  masterId,
  onBack,
  onViewHome,
  onViewMasters,
  onViewRequests,
  onCreateBooking,
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
  }, [masterId])

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
  const portfolioCount = portfolioItems.filter((item) => item.url.trim()).length
  const reviewAverageLabel = reviewCount > 0 ? reviewAverage.toFixed(1) : '—'
  const profileStats = [
    { label: 'Работы', value: String(portfolioCount) },
    { label: 'Рейтинг', value: reviewAverageLabel },
    { label: 'Отзывы', value: String(reviewCount) },
  ]
  const priceLabel = formatPriceRange(
    profile?.priceFrom ?? null,
    profile?.priceTo ?? null
  )
  const experienceLabel = formatExperience(profile?.experienceYears ?? null)
  const locationLabel = buildLocationLabel(profile)
  const workFormatLabel = buildWorkFormatLabel(profile)
  const hasLocation = Boolean(profile?.cityName || profile?.districtName)
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
  const scheduleLabel = buildScheduleLabel(scheduleDays)
  const scheduleRange = buildScheduleRange(
    profile?.scheduleStart,
    profile?.scheduleEnd
  )
  const scheduleMeta =
    scheduleDays.length > 0 && scheduleRange !== 'Время не указано'
      ? `${scheduleLabel} · ${scheduleRange}`
      : scheduleDays.length > 0
        ? scheduleLabel
        : scheduleRange
  const servicesSummary =
    serviceItems.length > 0
      ? formatServiceCount(serviceItems.length)
      : 'Нет услуг'
  const showcaseCount = showcaseItems.filter((item) => item.url.trim()).length
  const showcaseCountLabel = showcaseCount > 0 ? `${showcaseCount} фото` : 'Нет витрины'
  const showcasePreview = useMemo(
    () => showcaseItems.filter((item) => item.url.trim()).slice(0, 3),
    [showcaseItems]
  )
  const serviceNames = useMemo(
    () => serviceItems.map((item) => item.name.trim()).filter(Boolean),
    [serviceItems]
  )
  const previewTagSource = serviceNames.length > 0 ? serviceNames : categoryLabels
  const previewTags = previewTagSource.slice(0, 3)
  const previewTagRemainder = previewTagSource.length - previewTags.length
  const isActive = Boolean(profile?.isActive ?? true)
  const activeTone = isActive ? 'is-active' : 'is-paused'

  const portfolioGridItems = useMemo(
    () =>
      portfolioItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.url.trim()),
    [portfolioItems]
  )
  const hasPortfolioOverflow = portfolioGridItems.length > PORTFOLIO_PREVIEW_LIMIT
  const isPortfolioCollapsed = !isPortfolioExpanded
  const visiblePortfolioItems = portfolioGridItems
  const portfolioCountLabel =
    portfolioGridItems.length > 0 ? `${portfolioGridItems.length} фото` : 'Нет фото'

  const portfolioLightboxItem =
    portfolioLightboxIndex !== null ? portfolioItems[portfolioLightboxIndex] ?? null : null
  const portfolioLightboxFocus = resolvePortfolioFocus(portfolioLightboxItem)
  const isLightboxImage = portfolioLightboxItem
    ? isImageUrl(portfolioLightboxItem.url)
    : false

  const coverUrl = profile?.coverUrl ?? null
  const coverFocus = '50% 50%'

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
                <div className="pro-profile-ig-name-row">
                  <h1 className="pro-profile-ig-name">{displayName}</h1>
                  <span className={`pro-profile-ig-status ${activeTone}`}>
                    <span className="pro-profile-social-dot" aria-hidden="true" />
                    {isActive ? 'Запись открыта' : 'Пауза'}
                  </span>
                </div>
              </div>
              <div className="pro-profile-ig-body">
                <div className="pro-profile-status-card">
                  <div className="pro-profile-status-head">
                    <span className="pro-profile-status-title">Статус</span>
                    <span className="pro-profile-status-tag">статус мастера</span>
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
                        <span className="pro-profile-fact-value">{fact.value}</span>
                        <span className="pro-profile-fact-label">{fact.label}</span>
                      </div>
                    </div>
                  ))}
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
              <div className="pro-profile-ig-actions">
                <button
                  className="pro-profile-ig-button pro-profile-ig-button--primary"
                  type="button"
                  onClick={onCreateBooking}
                >
                  Записаться
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

            <section className="pro-profile-portfolio-panel animate delay-2">
              <div className="pro-profile-portfolio-panel-head">
                <div className="pro-profile-portfolio-panel-controls">
                  <p className="pro-profile-portfolio-panel-kicker">Портфолио</p>
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
                          <span className="pro-profile-portfolio-fallback">LINK</span>
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

            <section className="pro-profile-cards animate delay-2">
              <div className="pro-profile-card is-static">
                <span className="pro-profile-card-icon" aria-hidden="true">
                  👤
                </span>
                <span className="pro-profile-card-content">
                  <span className="pro-profile-card-title">Статус</span>
                  <span
                    className={`pro-profile-card-value${
                      aboutValue ? '' : ' is-muted'
                    }`}
                  >
                    {aboutText}
                  </span>
                  <span className="pro-profile-card-meta">{experienceLabel}</span>
                </span>
              </div>
              <div className="pro-profile-card is-static">
                <span className="pro-profile-card-icon" aria-hidden="true">
                  📍
                </span>
                <span className="pro-profile-card-content">
                  <span className="pro-profile-card-title">Работа</span>
                  <span className="pro-profile-card-value">{locationLabel}</span>
                  <span className="pro-profile-card-meta">{workFormatLabel}</span>
                  <span className="pro-profile-card-meta">{scheduleMeta}</span>
                </span>
              </div>
              <div className="pro-profile-card is-static">
                <span className="pro-profile-card-icon" aria-hidden="true">
                  💸
                </span>
                <span className="pro-profile-card-content">
                  <span className="pro-profile-card-title">Услуги и цены</span>
                  <span className="pro-profile-card-value">{servicesSummary}</span>
                  <span className="pro-profile-card-meta">{priceLabel}</span>
                </span>
              </div>
              <div className="pro-profile-card is-static">
                <span className="pro-profile-card-icon" aria-hidden="true">
                  🖼️
                </span>
                <span className="pro-profile-card-content">
                  <span className="pro-profile-card-title">Витрина</span>
                  <span
                    className={`pro-profile-card-value${
                      showcaseCount > 0 ? '' : ' is-muted'
                    }`}
                  >
                    {showcaseCountLabel}
                  </span>
                  {showcasePreview.length > 0 ? (
                    <span className="pro-profile-portfolio">
                      {showcasePreview.map((item, index) => {
                        const showImage = isImageUrl(item.url)
                        const focus = resolvePortfolioFocus(item)
                        return (
                          <span
                            key={`${item.url}-${index}`}
                            className={`pro-profile-portfolio-thumb${
                              showImage ? ' has-image' : ''
                            }`}
                            style={
                              showImage
                                ? {
                                    backgroundImage: `url(${item.url})`,
                                    backgroundPosition: focus.position,
                                  }
                                : undefined
                            }
                            aria-hidden="true"
                          />
                        )
                      })}
                    </span>
                  ) : (
                    <span className="pro-profile-card-meta is-muted">
                      Нет выбранных работ
                    </span>
                  )}
                </span>
              </div>
            </section>

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
                          reviewCount > 0 ? (entry.count / reviewCount) * 100 : 0
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
                      const comment = review.comment?.trim() || 'Без комментария.'

                      return (
                        <article className="pro-profile-review-card" key={review.id}>
                          <span className="pro-profile-review-avatar" aria-hidden="true">
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
        <button className="nav-item" type="button" onClick={onViewRequests}>
          <span className="nav-icon" aria-hidden="true">
            <IconList />
          </span>
          Мои заявки
        </button>
        <button className="nav-item" type="button">
          <span className="nav-icon" aria-hidden="true">
            <IconUser />
          </span>
          Профиль
        </button>
      </nav>
    </div>
  )
}
