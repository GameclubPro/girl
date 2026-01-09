import { useEffect, useMemo, useState } from 'react'
import { IconHome, IconList, IconUser, IconUsers } from '../components/icons'
import { categoryItems } from '../data/clientData'
import type { MasterProfile } from '../types/app'
import {
  formatServiceMeta,
  isImageUrl,
  parsePortfolioItems,
  parseServiceItems,
} from '../utils/profileContent'

type ClientMasterProfileScreenProps = {
  apiBase: string
  masterId: string
  onBack: () => void
  onViewHome: () => void
  onViewMasters: () => void
  onViewRequests: () => void
  onCreateRequest: (categoryId?: string | null) => void
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

const formatPrice = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`

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

const buildLocationLabel = (profile: MasterProfile | null) => {
  if (!profile) return 'Локация не указана'
  const parts = [profile.cityName, profile.districtName].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : 'Локация не указана'
}

const buildWorkFormat = (profile: MasterProfile | null) => {
  if (!profile) return []
  const formats: string[] = []
  if (profile.worksAtClient) formats.push('Выезд')
  if (profile.worksAtMaster) formats.push('У мастера')
  return formats
}

const buildScheduleRange = (start?: string | null, end?: string | null) => {
  const normalizedStart = typeof start === 'string' ? start.trim() : ''
  const normalizedEnd = typeof end === 'string' ? end.trim() : ''
  if (normalizedStart && normalizedEnd) return `${normalizedStart} – ${normalizedEnd}`
  if (normalizedStart) return `с ${normalizedStart}`
  if (normalizedEnd) return `до ${normalizedEnd}`
  return 'Время не указано'
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

export const ClientMasterProfileScreen = ({
  apiBase,
  masterId,
  onBack,
  onViewHome,
  onViewMasters,
  onViewRequests,
  onCreateRequest,
}: ClientMasterProfileScreenProps) => {
  const [profile, setProfile] = useState<MasterProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

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

  const serviceItems = useMemo(
    () => parseServiceItems(profile?.services ?? []),
    [profile]
  )

  const portfolioItems = useMemo(
    () =>
      parsePortfolioItems(profile?.portfolioUrls ?? []).filter((item) =>
        isImageUrl(item.url)
      ),
    [profile]
  )

  const coverItem = useMemo(() => {
    if (!profile || profile.coverUrl) return null
    return portfolioItems[0] ?? null
  }, [portfolioItems, profile])

  const coverUrl = profile?.coverUrl ?? coverItem?.url ?? null
  const coverFocus = coverItem
    ? `${(coverItem.focusX ?? 0.5) * 100}% ${(coverItem.focusY ?? 0.5) * 100}%`
    : '50% 50%'
  const galleryItems = coverItem ? portfolioItems.slice(1) : portfolioItems

  const categoryLabels = useMemo(() => {
    const categories = Array.isArray(profile?.categories) ? profile?.categories : []
    if (!categories || categories.length === 0) return ['Мастер-универсал']
    return categories.map((categoryId) => getCategoryLabel(categoryId))
  }, [profile])

  const priceLabel = formatPriceRange(
    profile?.priceFrom ?? null,
    profile?.priceTo ?? null
  )
  const experienceLabel = formatExperience(profile?.experienceYears ?? null)
  const locationLabel = buildLocationLabel(profile)
  const formats = buildWorkFormat(profile)
  const scheduleDays = Array.isArray(profile?.scheduleDays) ? profile?.scheduleDays : []
  const scheduleRange = buildScheduleRange(
    profile?.scheduleStart,
    profile?.scheduleEnd
  )
  const scheduleLabel =
    scheduleDays.length > 0
      ? scheduleDays
          .map((day) => scheduleLabels[day] ?? day)
          .join(', ')
      : 'График не указан'

  const isActive = Boolean(profile?.isActive ?? true)
  const displayName = profile?.displayName?.trim() || 'Мастер'
  const initials = getInitials(displayName)
  const aboutText = profile?.about?.trim() || 'Описание пока не заполнено.'
  const primaryCategory = categoryLabels[0]
  const extraCategories = categoryLabels.slice(1)

  return (
    <div className="screen screen--client screen--client-master-profile">
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
            <p className="client-showcase-page-kicker">Мастер</p>
            <h1 className="client-showcase-page-title">{displayName}</h1>
            <p className="client-showcase-page-subtitle">{primaryCategory}</p>
          </div>
        </header>

        {loadError && <p className="client-master-profile-error">{loadError}</p>}
        {isLoading ? (
          <div className="client-master-profile-skeleton" aria-hidden="true">
            <div className="client-master-profile-skeleton-cover" />
            <div className="client-master-profile-skeleton-line is-wide" />
            <div className="client-master-profile-skeleton-line" />
            <div className="client-master-profile-skeleton-line is-short" />
          </div>
        ) : profile ? (
          <>
            <section className="client-master-profile-hero">
              <div
                className={`client-master-profile-cover${
                  coverUrl ? '' : ' is-empty'
                }`}
              >
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt=""
                    loading="lazy"
                    style={{ objectPosition: coverFocus }}
                  />
                ) : (
                  <span className="client-master-profile-cover-fallback">
                    {initials}
                  </span>
                )}
              </div>
              <div className="client-master-profile-identity">
                <span className="client-master-profile-avatar" aria-hidden="true">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="client-master-profile-avatar-fallback">
                      {initials}
                    </span>
                  )}
                  <span
                    className={`client-master-profile-status${
                      isActive ? ' is-active' : ''
                    }`}
                  >
                    {isActive ? 'Запись открыта' : 'Пауза'}
                  </span>
                </span>
                <div className="client-master-profile-title">
                  <h2>{displayName}</h2>
                  <span>{primaryCategory}</span>
                </div>
                <div className="client-master-profile-tags">
                  <span className="client-master-profile-tag">{locationLabel}</span>
                  {formats.map((format) => (
                    <span className="client-master-profile-tag" key={format}>
                      {format}
                    </span>
                  ))}
                  {extraCategories.map((category) => (
                    <span className="client-master-profile-tag" key={category}>
                      {category}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="client-master-profile-actions">
              <button
                className="client-master-cta"
                type="button"
                onClick={() =>
                  onCreateRequest(
                    Array.isArray(profile.categories)
                      ? profile.categories[0] ?? null
                      : null
                  )
                }
              >
                Записаться
              </button>
              <button className="client-master-ghost" type="button" onClick={onViewMasters}>
                Все мастера
              </button>
            </section>

            <section className="client-master-profile-stats">
              <div className="client-master-profile-stat">
                <span className="client-master-profile-stat-value">{priceLabel}</span>
                <span className="client-master-profile-stat-label">Цена</span>
              </div>
              <div className="client-master-profile-stat">
                <span className="client-master-profile-stat-value">{experienceLabel}</span>
                <span className="client-master-profile-stat-label">Опыт</span>
              </div>
              <div className="client-master-profile-stat">
                <span className="client-master-profile-stat-value">{scheduleRange}</span>
                <span className="client-master-profile-stat-label">Время</span>
              </div>
            </section>

            <section className="client-master-profile-section">
              <div className="client-master-profile-section-head">
                <h3>График</h3>
                <span>{scheduleLabel}</span>
              </div>
              {scheduleDays.length > 0 ? (
                <div className="client-master-profile-week">
                  {scheduleDays.map((day) => (
                    <span className="client-master-profile-chip" key={day}>
                      {scheduleLabels[day] ?? day}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="client-master-profile-empty">
                  Мастер пока не указал расписание.
                </p>
              )}
            </section>

            <section className="client-master-profile-section">
              <div className="client-master-profile-section-head">
                <h3>О себе</h3>
              </div>
              <p className="client-master-profile-about">{aboutText}</p>
            </section>

            <section className="client-master-profile-section">
              <div className="client-master-profile-section-head">
                <h3>Услуги</h3>
                <span>{serviceItems.length > 0 ? `${serviceItems.length}` : '0'}</span>
              </div>
              {serviceItems.length > 0 ? (
                <div className="client-master-profile-services">
                  {serviceItems.map((service, index) => {
                    const meta = formatServiceMeta(service)
                    return (
                      <div
                        className="client-master-profile-service"
                        key={`${service.name}-${index}`}
                      >
                        <span className="client-master-profile-service-title">
                          {service.name}
                        </span>
                        {meta && (
                          <span className="client-master-profile-service-meta">
                            {meta}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="client-master-profile-empty">
                  Список услуг пока не заполнен.
                </p>
              )}
            </section>

            <section className="client-master-profile-section">
              <div className="client-master-profile-section-head">
                <h3>Портфолио</h3>
                <span>
                  {galleryItems.length > 0 ? `${galleryItems.length} фото` : 'Нет фото'}
                </span>
              </div>
              {galleryItems.length > 0 ? (
                <div className="client-master-profile-portfolio" role="list">
                  {galleryItems.map((item, index) => (
                    <span
                      className="client-master-profile-shot"
                      key={`${item.url}-${index}`}
                      role="listitem"
                    >
                      <img
                        src={item.url}
                        alt=""
                        loading="lazy"
                        style={{
                          objectPosition: `${(item.focusX ?? 0.5) * 100}% ${
                            (item.focusY ?? 0.5) * 100
                          }%`,
                        }}
                      />
                    </span>
                  ))}
                </div>
              ) : (
                <p className="client-master-profile-empty">
                  У мастера пока нет работ.
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>

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
