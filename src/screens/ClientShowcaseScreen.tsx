import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { IconFilter, IconHome, IconList, IconUser, IconUsers } from '../components/icons'
import { categoryItems } from '../data/clientData'
import type { MasterProfile } from '../types/app'
import {
  isImageUrl,
  parsePortfolioItems,
  parseServiceItems,
} from '../utils/profileContent'
import type { ServiceItem } from '../utils/profileContent'

type ClientShowcaseScreenProps = {
  apiBase: string
  activeCategoryId: string | null
  onCategoryChange: (categoryId: string | null) => void
  onBack: () => void
  onViewRequests: () => void
  onViewProfile: (masterId: string) => void
}

type ClientShowcaseGalleryScreenProps = {
  apiBase: string
  activeCategoryId: string | null
  onCategoryChange: (categoryId: string | null) => void
  onBack: () => void
  onViewMasters: () => void
  onViewRequests: () => void
}

const categoryLabelOverrides: Record<string, string> = {
  'beauty-nails': 'Маникюр',
  'makeup-look': 'Макияж',
  'cosmetology-care': 'Косметология',
  'fitness-health': 'Фитнес',
}

const categoryChips = [
  { id: null, label: 'Все' },
  ...categoryItems.map((item) => ({
    id: item.id,
    label: categoryLabelOverrides[item.id] ?? item.label,
  })),
]

type CategoryPalette = {
  accent: string
  soft: string
  ink: string
}

const categoryPalettes: Record<string, CategoryPalette> = {
  'beauty-nails': { accent: '#d27a9a', soft: '#f6e6ee', ink: '#6d354a' },
  'brows-lashes': { accent: '#9a7ad0', soft: '#eee9f7', ink: '#4f3c75' },
  hair: { accent: '#c08c6c', soft: '#f5ede6', ink: '#6c4a37' },
  'makeup-look': { accent: '#d06c6c', soft: '#f7e5e5', ink: '#6b3030' },
  'cosmetology-care': { accent: '#6fb5b0', soft: '#e5f4f2', ink: '#2f6c66' },
  'massage-body': { accent: '#8fae6a', soft: '#eef4e7', ink: '#4c6531' },
  'fitness-health': { accent: '#6ea8c7', soft: '#e6f1f8', ink: '#2e5a72' },
  'home-family': { accent: '#d1a35f', soft: '#f8eedf', ink: '#734f1c' },
  default: { accent: '#c58f7a', soft: '#f5eae5', ink: '#6c4b3e' },
}

const pickPalette = (categories: string[]) =>
  categoryPalettes[categories[0] ?? ''] ?? categoryPalettes.default

type ShowcaseMedia = {
  id: string
  url: string
  focusX: number
  focusY: number
  categories: string[]
}

const galleryShapePattern = [
  'is-square',
  'is-wide',
  'is-square',
  'is-tall',
  'is-square',
  'is-square',
  'is-wide',
  'is-square',
  'is-tall',
  'is-square',
  'is-wide',
] as const

const pickGalleryShape = (seed: number) =>
  galleryShapePattern[seed % galleryShapePattern.length]

type SortMode =
  | 'recent'
  | 'active'
  | 'experience'
  | 'price'
  | 'portfolio'
  | 'rating'

const sortOptions: { id: SortMode; label: string }[] = [
  { id: 'recent', label: 'Актуальные' },
  { id: 'active', label: 'Запись открыта' },
  { id: 'rating', label: 'Отзывы' },
  { id: 'experience', label: 'Опыт' },
  { id: 'price', label: 'Бюджет' },
  { id: 'portfolio', label: 'Работы' },
]

type PreviewMedia = {
  url: string
  focus: string
}

type MasterCard = {
  id: string
  name: string
  categories: string[]
  categoryLabels: string[]
  primaryCategory: string
  services: ServiceItem[]
  serviceNames: string[]
  avatarUrl: string | null
  thumbItems: PreviewMedia[]
  priceFrom: number | null
  priceTo: number | null
  experienceYears: number | null
  reviewsCount: number
  reviewsAverage: number | null
  worksAtClient: boolean
  worksAtMaster: boolean
  isActive: boolean
  cityName: string | null
  districtName: string | null
  locationLabel: string
  about: string | null
  updatedAt: string | null
  updatedAtTs: number
  portfolioCount: number
  updateLabel: string
  initials: string
}

const toSeed = (value: string) =>
  value.split('').reduce((total, char) => total + char.charCodeAt(0), 0)

const formatPrice = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`

const getCategoryLabel = (categoryId: string) =>
  categoryLabelOverrides[categoryId] ??
  categoryItems.find((item) => item.id === categoryId)?.label ??
  categoryId

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

const getInitials = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return 'М'
  const parts = normalized.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0] ?? '')
  const joined = letters.join('').toUpperCase()
  if (joined) return joined
  return normalized.slice(0, 2).toUpperCase()
}

const buildLocationLabel = (profile: MasterProfile) => {
  const parts = [profile.cityName, profile.districtName].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : 'Локация не указана'
}

const formatUpdatedLabel = (value: string | null) => {
  if (!value) return 'Нет обновлений'
  const updatedDate = new Date(value)
  if (Number.isNaN(updatedDate.getTime())) return 'Нет обновлений'
  const now = new Date()
  const diffMs = now.getTime() - updatedDate.getTime()
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (diffDays <= 0) return 'Обновлено сегодня'
  if (diffDays === 1) return 'Обновлено вчера'
  if (diffDays < 7) return `Обновлено ${diffDays} дн. назад`
  return `Обновлено ${updatedDate.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })}`
}

const formatRecencyChip = (updatedAtTs: number) => {
  if (!updatedAtTs) return 'Недавно'
  const diffDays = Math.floor(
    (Date.now() - updatedAtTs) / (24 * 60 * 60 * 1000)
  )
  if (diffDays <= 0) return 'Сегодня'
  if (diffDays === 1) return 'Вчера'
  if (diffDays < 7) return `${diffDays} дн`
  return 'Недавно'
}

const buildDistanceLabel = (seed: number, hasLocation: boolean) => {
  if (!hasLocation) return 'Рядом'
  const value = 1 + (seed % 80) / 10
  return `${value.toFixed(1).replace('.', ',')} км`
}

const buildResponseLabel = (seed: number) =>
  `Ответ ${20 + (seed % 41)} мин`

export const ClientShowcaseGalleryScreen = ({
  apiBase,
  activeCategoryId,
  onCategoryChange,
  onBack,
  onViewMasters,
  onViewRequests,
}: ClientShowcaseGalleryScreenProps) => {
  const [showcasePool, setShowcasePool] = useState<ShowcaseMedia[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadShowcase = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const response = await fetch(`${apiBase}/api/masters?limit=0`)
        if (!response.ok) {
          throw new Error('Load showcase failed')
        }
        const data = (await response.json()) as MasterProfile[]
        if (cancelled) return

        const nextPool = (Array.isArray(data) ? data : []).flatMap((profile) => {
          const categories = Array.isArray(profile.categories) ? profile.categories : []
          return parsePortfolioItems(profile.portfolioUrls ?? [])
            .filter((item) => isImageUrl(item.url))
            .map((item, index) => ({
              id: `${profile.userId}-${index}`,
              url: item.url,
              focusX: item.focusX ?? 0.5,
              focusY: item.focusY ?? 0.5,
              categories,
            }))
        })
        setShowcasePool(nextPool)
      } catch (error) {
        if (!cancelled) {
          setShowcasePool([])
          setLoadError('Не удалось загрузить витрину работ.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadShowcase()

    return () => {
      cancelled = true
    }
  }, [apiBase])

  const showcaseItems = useMemo(() => {
    if (!activeCategoryId) return showcasePool
    return showcasePool.filter((item) => item.categories.includes(activeCategoryId))
  }, [activeCategoryId, showcasePool])

  const countLabel = isLoading
    ? 'Загрузка...'
    : showcaseItems.length > 0
      ? `${showcaseItems.length} фото`
      : 'Нет работ'

  return (
    <div className="screen screen--client screen--client-showcase screen--client-gallery">
      <div className="client-shell">
        <section className="client-section">
          <div className="client-category-bar" role="tablist" aria-label="Категории">
            {categoryChips.map((chip) => {
              const isActive =
                chip.id === activeCategoryId || (!activeCategoryId && chip.id === null)
              return (
                <button
                  className={`client-category-chip${isActive ? ' is-active' : ''}`}
                  key={chip.id ?? 'all'}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onCategoryChange(chip.id)}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="client-section">
          <div className="client-gallery-meta">
            <span className="client-gallery-count">{countLabel}</span>
          </div>
        </section>

        <section className="client-section">
          {loadError && <p className="client-gallery-error">{loadError}</p>}
          {isLoading ? (
            <div className="client-gallery-grid is-skeleton" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => {
                const shapeClass = pickGalleryShape(index * 7 + 3)
                return (
                  <span
                    className={`client-gallery-item ${shapeClass} is-skeleton`}
                    key={`skeleton-${index}`}
                  />
                )
              })}
            </div>
          ) : showcaseItems.length > 0 ? (
            <div className="client-gallery-grid" role="list">
              {showcaseItems.map((item, index) => {
                const shapeClass = pickGalleryShape(toSeed(item.id) + index * 7)
                return (
                  <span
                    className={`client-gallery-item ${shapeClass}`}
                    key={item.id}
                    role="listitem"
                  >
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      style={{
                        objectPosition: `${item.focusX * 100}% ${item.focusY * 100}%`,
                      }}
                    />
                  </span>
                )
              })}
            </div>
          ) : (
            <p className="client-gallery-empty">Пока нет работ в этой категории.</p>
          )}
        </section>
      </div>

      <nav className="bottom-nav" aria-label="Навигация">
        <button className="nav-item" type="button" onClick={onBack}>
          <span className="nav-icon" aria-hidden="true">
            <IconHome />
          </span>
          Главная
        </button>
        <button className="nav-item" type="button" onClick={onViewMasters}>
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

export const ClientShowcaseScreen = ({
  apiBase,
  activeCategoryId,
  onCategoryChange,
  onBack,
  onViewRequests,
  onViewProfile,
}: ClientShowcaseScreenProps) => {
  const [profiles, setProfiles] = useState<MasterProfile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [onlyActive, setOnlyActive] = useState(false)
  const [onlyAtClient, setOnlyAtClient] = useState(false)
  const [onlyAtMaster, setOnlyAtMaster] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadMasters = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const response = await fetch(`${apiBase}/api/masters`)
        if (!response.ok) {
          throw new Error('Load masters failed')
        }
        const data = (await response.json()) as MasterProfile[]
        if (!cancelled) {
          setProfiles(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        if (!cancelled) {
          setProfiles([])
          setLoadError('Не удалось загрузить список мастеров.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadMasters()

    return () => {
      cancelled = true
    }
  }, [apiBase])

  const masterCards = useMemo<MasterCard[]>(() => {
    const source = profiles
    return source.map((profile, index) => {
      const portfolioItems = parsePortfolioItems(
        profile.portfolioUrls ?? []
      )
        .filter((item) => isImageUrl(item.url))
        .map((item) => ({
          url: item.url,
          focus: `${(item.focusX ?? 0.5) * 100}% ${(item.focusY ?? 0.5) * 100}%`,
      }))

      const avatarUrl = profile.avatarUrl ?? null
      const thumbItems = portfolioItems.slice(-3)
      const portfolioCount = portfolioItems.length

      const services = parseServiceItems(profile.services ?? [])
      const serviceNames = services.map((item) => item.name)

      const experienceYears = profile.experienceYears ?? null
      const priceFrom = profile.priceFrom ?? null
      const priceTo = profile.priceTo ?? null
      const isActive = Boolean(profile.isActive ?? true)
      const reviewsCount =
        typeof profile.reviewsCount === 'number' ? profile.reviewsCount : 0
      const reviewsAverage =
        reviewsCount > 0 && typeof profile.reviewsAverage === 'number'
          ? profile.reviewsAverage
          : null
      const updatedAt = profile.updatedAt ?? null
      const updatedAtTs =
        updatedAt && Number.isFinite(Date.parse(updatedAt))
          ? Date.parse(updatedAt)
          : 0
      const updateLabel = formatUpdatedLabel(updatedAt)
      const about = profile.about?.trim() || null
      const locationLabel = buildLocationLabel(profile)

      const categories = Array.isArray(profile.categories) ? profile.categories : []
      const categoryLabels =
        categories.length > 0
          ? categories.map((id) => getCategoryLabel(id))
          : ['Мастер-универсал']

      return {
        id: profile.userId || `profile-${index}`,
        name: profile.displayName || 'Мастер',
        categories,
        categoryLabels,
        primaryCategory: categoryLabels[0],
        services,
        serviceNames,
        avatarUrl,
        thumbItems,
        priceFrom,
        priceTo,
        experienceYears,
        reviewsCount,
        reviewsAverage,
        worksAtClient: Boolean(profile.worksAtClient),
        worksAtMaster: Boolean(profile.worksAtMaster),
        isActive,
        cityName: profile.cityName ?? null,
        districtName: profile.districtName ?? null,
        locationLabel,
        about,
        updatedAt,
        updatedAtTs,
        portfolioCount,
        updateLabel,
        initials: getInitials(profile.displayName || 'Мастер'),
      }
    })
  }, [profiles])

  const filteredMasters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    let list = masterCards
    if (activeCategoryId) {
      list = list.filter((master) => master.categories.includes(activeCategoryId))
    }
    if (normalizedQuery) {
      list = list.filter((master) => {
        const haystack = [
          master.name,
          master.primaryCategory,
          ...master.categoryLabels,
          ...master.serviceNames,
          master.about ?? '',
          master.locationLabel,
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(normalizedQuery)
      })
    }
    if (onlyActive) {
      list = list.filter((master) => master.isActive)
    }
    if (onlyAtClient) {
      list = list.filter((master) => master.worksAtClient)
    }
    if (onlyAtMaster) {
      list = list.filter((master) => master.worksAtMaster)
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      switch (sortMode) {
        case 'active':
          if (a.isActive !== b.isActive) {
            return a.isActive ? -1 : 1
          }
          return b.updatedAtTs - a.updatedAtTs
        case 'rating': {
          const ratingDiff =
            (b.reviewsAverage ?? 0) - (a.reviewsAverage ?? 0)
          if (ratingDiff !== 0) return ratingDiff
          return b.reviewsCount - a.reviewsCount
        }
        case 'price':
          return (a.priceFrom ?? Number.POSITIVE_INFINITY) -
            (b.priceFrom ?? Number.POSITIVE_INFINITY)
        case 'experience':
          return (b.experienceYears ?? 0) - (a.experienceYears ?? 0)
        case 'portfolio':
          return b.portfolioCount - a.portfolioCount
        case 'recent':
        default:
          return b.updatedAtTs - a.updatedAtTs
      }
    })
    return sorted
  }, [activeCategoryId, masterCards, onlyActive, onlyAtClient, onlyAtMaster, query, sortMode])

  const featuredIds = useMemo(
    () => new Set(filteredMasters.slice(0, 2).map((master) => master.id)),
    [filteredMasters]
  )
  const hasActiveFilters = onlyActive || onlyAtClient || onlyAtMaster
  const resetFilters = () => {
    setOnlyActive(false)
    setOnlyAtClient(false)
    setOnlyAtMaster(false)
  }

  return (
    <div className="screen screen--client screen--client-showcase">
      <div className="client-shell">
        <section className="client-section">
          <div className="client-category-bar" role="tablist" aria-label="Категории">
            {categoryChips.map((chip) => {
              const isActive =
                chip.id === activeCategoryId || (!activeCategoryId && chip.id === null)
              return (
                <button
                  className={`client-category-chip${isActive ? ' is-active' : ''}`}
                  key={chip.id ?? 'all'}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onCategoryChange(chip.id)}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="client-section">
          <div className="client-master-search">
            <div className="client-master-search-field">
              <span className="client-master-search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                type="search"
                placeholder="Имя, услуга или район"
                aria-label="Поиск"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                className={`client-master-filter${
                  filtersOpen ? ' is-open' : ''
                }${hasActiveFilters ? ' is-active' : ''}`}
                type="button"
                aria-label="Фильтры"
                aria-expanded={filtersOpen}
                aria-controls="client-master-filters"
                onClick={() => setFiltersOpen((prev) => !prev)}
              >
                <IconFilter />
              </button>
            </div>
          </div>
        </section>

        <section className="client-section">
          <div className="client-master-sort" role="tablist" aria-label="Сортировка">
            {sortOptions.map((option) => (
              <button
                className={`client-master-sort-pill${
                  sortMode === option.id ? ' is-active' : ''
                }`}
                key={option.id}
                type="button"
                role="tab"
                aria-selected={sortMode === option.id}
                onClick={() => setSortMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {filtersOpen && (
            <div
              className="client-master-filters"
              id="client-master-filters"
              role="region"
              aria-label="Фильтры"
            >
              <div className="client-master-filter-head">
                <span className="client-master-filter-title">Фильтры</span>
                {hasActiveFilters && (
                  <button
                    className="client-master-filter-reset"
                    type="button"
                    onClick={resetFilters}
                  >
                    Сбросить
                  </button>
                )}
              </div>
              <div className="client-master-toggles">
                <button
                  className={`client-master-toggle${onlyActive ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setOnlyActive((prev) => !prev)}
                >
                  Запись открыта
                </button>
                <button
                  className={`client-master-toggle${onlyAtClient ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setOnlyAtClient((prev) => !prev)}
                >
                  Выезд
                </button>
                <button
                  className={`client-master-toggle${onlyAtMaster ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setOnlyAtMaster((prev) => !prev)}
                >
                  У мастера
                </button>
              </div>
            </div>
          )}
          <p className="client-master-summary">
            {filteredMasters.length > 0
              ? `Найдено мастеров: ${filteredMasters.length}`
              : 'Пока нет мастеров по выбранным фильтрам'}
          </p>
        </section>

        <section className="client-section">
          {loadError && <p className="client-master-error">{loadError}</p>}
          {isLoading ? (
            <div className="client-master-skeletons" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <div className="client-master-card is-skeleton" key={`skeleton-${index}`}>
                  <div className="client-master-skeleton-bar is-wide" />
                  <div className="client-master-skeleton-bar" />
                  <div className="client-master-skeleton-row">
                    <span className="client-master-skeleton-chip" />
                    <span className="client-master-skeleton-chip" />
                    <span className="client-master-skeleton-chip" />
                  </div>
                  <div className="client-master-skeleton-bar is-short" />
                </div>
              ))}
            </div>
          ) : (
            <div className="client-master-list" role="list">
              {filteredMasters.map((master) => {
                const isFeatured = featuredIds.has(master.id)
                const cardClassName = `client-master-card${
                  isFeatured ? ' is-featured' : ''
                }`
                const palette = pickPalette(master.categories)
                const cardStyle = {
                  '--card-accent': palette.accent,
                  '--card-accent-soft': palette.soft,
                  '--card-accent-ink': palette.ink,
                } as CSSProperties
                const experienceLabel = formatExperience(master.experienceYears)
                const priceTag =
                  master.priceFrom !== null || master.priceTo !== null
                    ? formatPriceRange(master.priceFrom, master.priceTo)
                    : null
                const metaItems = [
                  master.primaryCategory,
                  experienceLabel,
                  priceTag,
                ].filter((item): item is string => Boolean(item))
                const ratingLabel =
                  master.reviewsAverage !== null
                    ? `${master.reviewsAverage.toFixed(1)} ★`
                    : 'Новый'
                const seed = toSeed(master.id)
                const distanceLabel = buildDistanceLabel(
                  seed,
                  master.locationLabel !== 'Локация не указана'
                )
                const responseLabel = buildResponseLabel(seed)
                const recencyLabel = formatRecencyChip(master.updatedAtTs)
                const chipItems = [
                  distanceLabel,
                  responseLabel,
                  master.worksAtClient ? 'Выезд' : null,
                  master.worksAtMaster ? 'У мастера' : null,
                ].filter(Boolean) as string[]
                const thumbSlots = Array.from({ length: 3 }, (_, index) => ({
                  item: master.thumbItems[index] ?? null,
                  index,
                }))
                const slotFill = 4 + (seed % 5)
                const slotIndicators = Array.from({ length: 10 }, (_, index) =>
                  index < slotFill
                )

                return (
                  <article
                    className={cardClassName}
                    key={master.id}
                    role="listitem"
                    style={cardStyle}
                  >
                    <div className="client-master-overview">
                      <div className="client-master-avatar-block">
                        <span className="client-master-avatar" aria-hidden="true">
                          {master.avatarUrl ? (
                            <img src={master.avatarUrl} alt="" loading="lazy" />
                          ) : (
                            <span className="client-master-avatar-fallback">
                              {master.initials}
                            </span>
                          )}
                        </span>
                        <span className="client-master-chip client-master-chip--status is-accent">
                          {recencyLabel}
                        </span>
                      </div>
                      <div className="client-master-overview-main">
                        <div className="client-master-name-row">
                          <h2 className="client-master-name">{master.name}</h2>
                          <span className="client-master-score">
                            {ratingLabel}
                          </span>
                        </div>
                        <p className="client-master-meta">
                          {metaItems.join(' · ')}
                        </p>
                        <div className="client-master-chip-row">
                          {chipItems.map((chip, index) => (
                            <span className="client-master-chip" key={`${chip}-${index}`}>
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="client-master-availability">
                      <span className="client-master-availability-label">
                        Ближайшие слоты
                      </span>
                      <div className="client-master-slots">
                        {slotIndicators.map((isOpen, index) => (
                          <span
                            className={`client-master-slot${
                              isOpen ? ' is-open' : ''
                            }`}
                            key={`slot-${master.id}-${index}`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="client-master-thumbs" role="list">
                      {thumbSlots.map(({ item, index }) => (
                        <span
                          className={`client-master-thumb${
                            item ? '' : ' is-empty'
                          }`}
                          key={item?.url ?? `thumb-${master.id}-${index}`}
                          role="listitem"
                        >
                          {item ? (
                            <img
                              src={item.url}
                              alt=""
                              loading="lazy"
                              style={{ objectPosition: item.focus }}
                            />
                          ) : (
                            <span className="client-master-thumb-fallback">
                              {master.initials}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="client-master-actions">
                      <button className="client-master-cta" type="button">
                        Записаться
                      </button>
                      <button
                        className="client-master-ghost"
                        type="button"
                        onClick={() => onViewProfile(master.id)}
                      >
                        Профиль
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <nav className="bottom-nav" aria-label="Навигация">
        <button className="nav-item" type="button" onClick={onBack}>
          <span className="nav-icon" aria-hidden="true">
            <IconHome />
          </span>
          Главная
        </button>
        <button className="nav-item is-active" type="button">
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
