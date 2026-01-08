import { useEffect, useMemo, useState } from 'react'
import { IconHome, IconList, IconUser, IconUsers } from '../components/icons'
import { categoryItems, popularItems, storyItems } from '../data/clientData'
import type { MasterProfile } from '../types/app'
import { isImageUrl, parsePortfolioItems } from '../utils/profileContent'

type ClientShowcaseScreenProps = {
  apiBase: string
  activeCategoryId: string | null
  onCategoryChange: (categoryId: string | null) => void
  onBack: () => void
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

type SortMode = 'smart' | 'rating' | 'price' | 'distance' | 'available'

const sortOptions: { id: SortMode; label: string }[] = [
  { id: 'smart', label: 'Лучшие рядом' },
  { id: 'available', label: 'Сегодня' },
  { id: 'rating', label: 'Рейтинг' },
  { id: 'price', label: 'Бюджет' },
  { id: 'distance', label: 'Ближе' },
]

const signalLabels = [
  'Лучшее рядом',
  'Быстрый отклик',
  'Топ по отзывам',
  'Под ваш стиль',
  'Можно сегодня',
]

const dayLabels = ['Сегодня', 'Завтра', 'Послезавтра']
const timeSlots = ['09:00', '11:30', '13:00', '15:30', '18:00', '19:30']

const fallbackProfiles: MasterProfile[] = storyItems.map((story, index) => ({
  userId: `fallback-${story.id}`,
  displayName: story.name,
  categories: [categoryItems[index % categoryItems.length].id],
  services: [],
  portfolioUrls: [popularItems[index % popularItems.length].image],
  avatarUrl: story.avatar,
  worksAtClient: index % 2 === 0,
  worksAtMaster: true,
  experienceYears: 2 + (index % 7),
  priceFrom: 1200 + index * 250,
  priceTo: 2600 + index * 300,
  isActive: true,
}))

type MasterCard = {
  id: string
  name: string
  categories: string[]
  categoryLabels: string[]
  primaryCategory: string
  services: string[]
  avatarUrl: string
  heroUrl: string
  heroFocus: string
  rating: number
  reviews: number
  distance: number
  responseMinutes: number
  priceFrom: number
  priceTo: number
  experienceYears: number
  worksAtClient: boolean
  worksAtMaster: boolean
  isAvailable: boolean
  nextSlot: string
  slots: boolean[]
  signal: string
  gallery: { url: string; focus: string }[]
  score: number
  slotCount: number
}

const toSeed = (value: string) =>
  value.split('').reduce((total, char) => total + char.charCodeAt(0), 0)

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const formatDistance = (value: number) =>
  `${value.toFixed(1).replace('.', ',')} км`

const formatPrice = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`

const getCategoryLabel = (categoryId: string) =>
  categoryLabelOverrides[categoryId] ??
  categoryItems.find((item) => item.id === categoryId)?.label ??
  categoryId

const buildPriceRange = (profile: MasterProfile, seed: number) => {
  let from = profile.priceFrom ?? null
  let to = profile.priceTo ?? null
  if (!from && !to) {
    from = 1400 + (seed % 8) * 250
    to = from + 900 + (seed % 5) * 250
  } else if (from && !to) {
    to = from + 900 + (seed % 5) * 250
  } else if (!from && to) {
    from = Math.max(800, to - (900 + (seed % 5) * 250))
  }
  return {
    from: Math.round(from ?? 0),
    to: Math.round(to ?? 0),
  }
}

const buildNextSlot = (seed: number) => {
  const day = dayLabels[seed % dayLabels.length]
  const time = timeSlots[(seed + 2) % timeSlots.length]
  return `${day} ${time}`
}

const buildSlots = (seed: number) =>
  Array.from({ length: 8 }, (_, index) => (seed + index * 3) % 7 !== 0)

export const ClientShowcaseScreen = ({
  apiBase,
  activeCategoryId,
  onCategoryChange,
  onBack,
  onViewRequests,
}: ClientShowcaseScreenProps) => {
  const [profiles, setProfiles] = useState<MasterProfile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('smart')
  const [query, setQuery] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [onlyAtClient, setOnlyAtClient] = useState(false)
  const [onlyAtMaster, setOnlyAtMaster] = useState(false)

  const activeCategoryLabel =
    categoryChips.find((chip) => chip.id === activeCategoryId)?.label ??
    categoryItems.find((item) => item.id === activeCategoryId)?.label ??
    ''

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
    const source = profiles.length > 0 ? profiles : fallbackProfiles
    return source.map((profile, index) => {
      const seed = toSeed(profile.userId || profile.displayName || `${index}`)
      const portfolioItems = parsePortfolioItems(profile.portfolioUrls ?? [])
        .filter((item) => isImageUrl(item.url))
        .map((item) => ({
          url: item.url,
          focus: `${(item.focusX ?? 0.5) * 100}% ${(item.focusY ?? 0.5) * 100}%`,
        }))

      const fallbackImage = popularItems[index % popularItems.length]?.image
      const heroItem = portfolioItems[0]
      const heroUrl = heroItem?.url ?? fallbackImage
      const heroFocus = heroItem?.focus ?? '50% 50%'

      const avatarUrl =
        profile.avatarUrl ?? heroUrl ?? storyItems[index % storyItems.length]?.avatar
      const gallery = portfolioItems.slice(1, 4)

      const rating = clampNumber(4.5 + (seed % 45) / 100, 4.5, 5)
      const reviews = 12 + (seed % 220)
      const distance = clampNumber(0.6 + (seed % 90) / 10, 0.6, 12.5)
      const responseMinutes = 6 + (seed % 40)
      const isAvailable = Boolean(profile.isActive ?? true) && seed % 3 !== 0
      const experienceYears = profile.experienceYears ?? 2 + (seed % 12)
      const { from, to } = buildPriceRange(profile, seed)
      const nextSlot = buildNextSlot(seed)
      const slots = buildSlots(seed)
      const slotCount = slots.filter(Boolean).length

      const categories = Array.isArray(profile.categories) ? profile.categories : []
      const categoryLabels =
        categories.length > 0
          ? categories.map((id) => getCategoryLabel(id))
          : ['Мастер-универсал']

      const score =
        rating * 1.8 +
        (isAvailable ? 1.2 : 0) +
        (profile.worksAtClient ? 0.3 : 0) -
        distance * 0.08 -
        from / 5200

      return {
        id: profile.userId || `fallback-${index}`,
        name: profile.displayName || 'Мастер',
        categories,
        categoryLabels,
        primaryCategory: categoryLabels[0],
        services: Array.isArray(profile.services) ? profile.services : [],
        avatarUrl: avatarUrl ?? fallbackImage ?? '',
        heroUrl: heroUrl ?? avatarUrl ?? '',
        heroFocus,
        rating,
        reviews,
        distance,
        responseMinutes,
        priceFrom: from,
        priceTo: to,
        experienceYears,
        worksAtClient: Boolean(profile.worksAtClient),
        worksAtMaster: Boolean(profile.worksAtMaster),
        isAvailable,
        nextSlot,
        slots,
        signal: signalLabels[seed % signalLabels.length],
        gallery,
        score,
        slotCount,
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
          ...master.services,
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(normalizedQuery)
      })
    }
    if (onlyAvailable) {
      list = list.filter((master) => master.isAvailable)
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
        case 'rating':
          return b.rating - a.rating
        case 'price':
          return a.priceFrom - b.priceFrom
        case 'distance':
          return a.distance - b.distance
        case 'available':
          if (a.isAvailable !== b.isAvailable) {
            return a.isAvailable ? -1 : 1
          }
          return b.slotCount - a.slotCount
        case 'smart':
        default:
          return b.score - a.score
      }
    })
    return sorted
  }, [activeCategoryId, masterCards, onlyAtClient, onlyAtMaster, onlyAvailable, query, sortMode])

  const featuredIds = useMemo(
    () => new Set(filteredMasters.slice(0, 2).map((master) => master.id)),
    [filteredMasters]
  )

  return (
    <div className="screen screen--client screen--client-showcase">
      <div className="client-shell">
        <header className="client-showcase-header">
          <button
            className="client-showcase-back"
            type="button"
            onClick={onBack}
            aria-label="Назад"
          >
            ←
          </button>
          <div className="client-showcase-headings">
            <p className="client-showcase-page-kicker">Мастера</p>
            <h1 className="client-showcase-page-title">
              {activeCategoryLabel || 'Все специалисты'}
            </h1>
            <p className="client-showcase-page-subtitle">
              Сравнивай по свободным слотам, цене и отзывам
            </p>
          </div>
        </header>

        <section className="client-section">
          <div className="client-master-search">
            <label className="client-master-search-field">
              <span className="client-master-search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                type="search"
                placeholder="Имя, услуга или район"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button className="client-master-filter" type="button">
              Фильтры
            </button>
          </div>
        </section>

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
          <div className="client-master-toggles">
            <button
              className={`client-master-toggle${onlyAvailable ? ' is-active' : ''}`}
              type="button"
              onClick={() => setOnlyAvailable((prev) => !prev)}
            >
              Сейчас свободны
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
                const experienceLabel = `${master.experienceYears} ${
                  master.experienceYears % 10 === 1 && master.experienceYears % 100 !== 11
                    ? 'год'
                    : master.experienceYears % 10 >= 2 &&
                        master.experienceYears % 10 <= 4 &&
                        (master.experienceYears % 100 < 12 ||
                          master.experienceYears % 100 > 14)
                      ? 'года'
                      : 'лет'
                }`
                const priceLabel =
                  master.priceFrom === master.priceTo
                    ? formatPrice(master.priceFrom)
                    : `${formatPrice(master.priceFrom)} - ${formatPrice(master.priceTo)}`

                return (
                  <article className={cardClassName} key={master.id} role="listitem">
                    <div className="client-master-top">
                      <div className="client-master-info">
                        <span className="client-master-avatar" aria-hidden="true">
                          <img src={master.avatarUrl} alt="" loading="lazy" />
                          <span
                            className={`client-master-status${
                              master.isAvailable ? ' is-live' : ''
                            }`}
                          >
                            {master.isAvailable ? 'Сегодня' : 'По записи'}
                          </span>
                        </span>
                        <div className="client-master-main">
                          <div className="client-master-name-row">
                            <h2 className="client-master-name">{master.name}</h2>
                            <span className="client-master-score">
                              {master.rating.toFixed(1)} ★
                            </span>
                          </div>
                          <p className="client-master-meta">
                            {master.primaryCategory} · {experienceLabel}
                          </p>
                          <div className="client-master-tags">
                            <span className="client-master-tag">
                              {formatDistance(master.distance)}
                            </span>
                            <span className="client-master-tag">
                              Ответ {master.responseMinutes} мин
                            </span>
                            {master.worksAtClient && (
                              <span className="client-master-tag">Выезд</span>
                            )}
                            {master.worksAtMaster && (
                              <span className="client-master-tag">У мастера</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="client-master-hero">
                        <img
                          src={master.heroUrl}
                          alt=""
                          loading="lazy"
                          style={{ objectPosition: master.heroFocus }}
                        />
                        <span className="client-master-signal">{master.signal}</span>
                      </div>
                    </div>

                    <div className="client-master-stats">
                      <div className="client-master-stat">
                        <span className="client-master-stat-value">{priceLabel}</span>
                        <span className="client-master-stat-label">Цена</span>
                      </div>
                      <div className="client-master-stat">
                        <span className="client-master-stat-value">{master.nextSlot}</span>
                        <span className="client-master-stat-label">Окно</span>
                      </div>
                      <div className="client-master-stat">
                        <span className="client-master-stat-value">
                          {master.reviews}
                        </span>
                        <span className="client-master-stat-label">Отзывы</span>
                      </div>
                    </div>

                    <div className="client-master-availability">
                      <span className="client-master-availability-label">
                        Ближайшие слоты
                      </span>
                      <div className="client-master-slots">
                        {master.slots.map((slot, index) => (
                          <span
                            className={`client-master-slot${slot ? ' is-open' : ''}`}
                            key={`${master.id}-slot-${index}`}
                          />
                        ))}
                      </div>
                    </div>

                    {master.gallery.length > 0 && (
                      <div className="client-master-gallery">
                        {master.gallery.map((shot, index) => (
                          <span className="client-master-shot" key={`${master.id}-g-${index}`}>
                            <img
                              src={shot.url}
                              alt=""
                              loading="lazy"
                              style={{ objectPosition: shot.focus }}
                            />
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="client-master-actions">
                      <button className="client-master-cta" type="button">
                        Записаться
                      </button>
                      <button className="client-master-ghost" type="button">
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
