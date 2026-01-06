import { useEffect, useMemo, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { categoryItems } from '../data/clientData'
import type { City, District, MasterProfile, ProProfileSection } from '../types/app'
import { parsePortfolioItems, parseServiceItems } from '../utils/profileContent'
import { getProfileStatusSummary } from '../utils/profileStatus'

const formatCount = (value: number, one: string, few: string, many: string) => {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return `${value} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} ${few}`
  }
  return `${value} ${many}`
}

type ProCabinetScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onEditProfile: (section?: ProProfileSection) => void
  onViewRequests: () => void
}

export const ProCabinetScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onEditProfile,
  onViewRequests,
}: ProCabinetScreenProps) => {
  const [profile, setProfile] = useState<MasterProfile | null>(null)
  const [cities, setCities] = useState<City[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadCities = async () => {
      try {
        const response = await fetch(`${apiBase}/api/cities`)
        if (!response.ok) {
          throw new Error('Load cities failed')
        }
        const data = (await response.json()) as City[]
        if (!cancelled) {
          setCities(data)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError('Не удалось загрузить города.')
        }
      }
    }

    loadCities()

    return () => {
      cancelled = true
    }
  }, [apiBase])

  const cityId = profile?.cityId ?? null
  const districtId = profile?.districtId ?? null

  useEffect(() => {
    if (!cityId) {
      setDistricts([])
      return
    }

    let cancelled = false

    const loadDistricts = async () => {
      try {
        const response = await fetch(`${apiBase}/api/cities/${cityId}/districts`)
        if (!response.ok) {
          throw new Error('Load districts failed')
        }
        const data = (await response.json()) as District[]
        if (!cancelled) {
          setDistricts(data)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError('Не удалось загрузить районы.')
        }
      }
    }

    loadDistricts()

    return () => {
      cancelled = true
    }
  }, [apiBase, cityId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadProfile = async () => {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch(`${apiBase}/api/masters/${userId}`)
        if (response.status === 404) {
          if (!cancelled) {
            setProfile(null)
          }
          return
        }
        if (!response.ok) {
          throw new Error('Load profile failed')
        }
        const data = (await response.json()) as MasterProfile
        if (!cancelled) {
          setProfile(data)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError('Не удалось загрузить кабинет мастера.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  const profileStatus = useMemo(() => getProfileStatusSummary(profile), [profile])
  const statusLabelMap = {
    draft: 'Черновик',
    ready: 'Готов к откликам',
    complete: 'Профиль заполнен',
  }
  const isActive = profile?.isActive ?? true
  const profileTone =
    profileStatus.profileStatus === 'complete'
      ? 'is-complete'
      : profileStatus.profileStatus === 'ready'
        ? 'is-ready'
        : 'is-draft'
  const activeTone = isActive ? 'is-active' : 'is-paused'

  const displayNameValue =
    profile?.displayName?.trim() || displayNameFallback.trim() || 'Мастер'
  const profileInitials = useMemo(() => {
    const source = displayNameValue.trim()
    if (!source) return 'MK'
    const parts = source.split(/[\s•|-]+/).filter(Boolean)
    const initials = parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('')
    return initials || 'MK'
  }, [displayNameValue])

  const categories = Array.isArray(profile?.categories) ? profile?.categories : []
  const services = Array.isArray(profile?.services) ? profile?.services : []
  const serviceItems = useMemo(() => parseServiceItems(services), [services])
  const portfolioUrls = Array.isArray(profile?.portfolioUrls)
    ? profile?.portfolioUrls
    : []
  const portfolioItems = useMemo(
    () => parsePortfolioItems(portfolioUrls),
    [portfolioUrls]
  )
  const categoryLabels = useMemo(
    () =>
      categoryItems
        .filter((category) => categories.includes(category.id))
        .map((category) => category.label),
    [categories]
  )
  const workFormatLabel =
    profile?.worksAtClient && profile?.worksAtMaster
      ? 'У мастера и выезд'
      : profile?.worksAtClient
        ? 'Выезд к клиенту'
        : profile?.worksAtMaster
          ? 'У мастера'
          : 'Формат не указан'

  const priceLabel = (() => {
    const priceFrom =
      profile?.priceFrom !== null && profile?.priceFrom !== undefined
        ? profile.priceFrom
        : null
    const priceTo =
      profile?.priceTo !== null && profile?.priceTo !== undefined
        ? profile.priceTo
        : null

    if (priceFrom !== null && priceTo !== null) return `${priceFrom}–${priceTo} ₽`
    if (priceFrom !== null) return `от ${priceFrom} ₽`
    if (priceTo !== null) return `до ${priceTo} ₽`
    return 'Цена не указана'
  })()

  const experienceSummary =
    profile?.experienceYears !== null && profile?.experienceYears !== undefined
      ? `${profile.experienceYears} лет опыта`
      : 'Опыт не указан'

  const servicesSummary =
    serviceItems.length > 0
      ? formatCount(serviceItems.length, 'услуга', 'услуги', 'услуг')
      : 'Не заполнено'

  const portfolioSummary =
    portfolioItems.length > 0
      ? formatCount(portfolioItems.length, 'работа', 'работы', 'работ')
      : 'Пусто'

  const scheduleDays = Array.isArray(profile?.scheduleDays)
    ? profile?.scheduleDays
    : []
  const scheduleSummary =
    scheduleDays.length > 0
      ? formatCount(scheduleDays.length, 'день', 'дня', 'дней')
      : isActive
        ? 'Открыт'
        : 'Пауза'

  const locationLabel = useMemo(() => {
    const cityLabel = cityId
      ? cities.find((city) => city.id === cityId)?.name
      : ''
    const districtLabel = districtId
      ? districts.find((district) => district.id === districtId)?.name
      : ''
    return [cityLabel, districtLabel].filter(Boolean).join(', ') || 'Город не указан'
  }, [cities, cityId, districtId, districts])

  const missingLabels = useMemo(() => {
    const labels: string[] = []
    if (profileStatus.missingFields.includes('displayName')) {
      labels.push('Имя и специализация')
    }
    if (profileStatus.missingFields.includes('categories')) {
      labels.push('Категории услуг')
    }
    if (
      profileStatus.missingFields.includes('cityId') ||
      profileStatus.missingFields.includes('districtId')
    ) {
      labels.push('Город и район')
    }
    if (profileStatus.missingFields.includes('workFormat')) {
      labels.push('Формат работы')
    }
    return labels
  }, [profileStatus.missingFields])

  const avatarUrl = profile?.avatarUrl ?? ''
  const coverUrl = profile?.coverUrl ?? ''
  const primaryCategory = categoryLabels[0] ?? ''

  return (
    <div className="screen screen--pro screen--pro-cabinet">
      <div className="pro-cabinet-shell">
        <section
          className={`pro-cabinet-hero animate delay-1${
            coverUrl ? ' has-image' : ''
          }`}
          style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
        >
          <div className="pro-cabinet-hero-inner">
            <div className="pro-cabinet-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt={`Аватар ${displayNameValue}`} />
              ) : (
                <span aria-hidden="true">{profileInitials}</span>
              )}
            </div>
            <h1 className="pro-cabinet-name">{displayNameValue}</h1>
            <div className="pro-cabinet-badges">
              <span className={`pro-status-chip ${activeTone}`}>
                {isActive ? 'Активен' : 'Пауза'}
              </span>
              <span className={`pro-status-chip ${profileTone}`}>
                {statusLabelMap[profileStatus.profileStatus]}
              </span>
              <span
                className={`pro-status-chip is-neutral${
                  primaryCategory ? '' : ' is-muted'
                }`}
              >
                {primaryCategory || 'Категории'}
              </span>
            </div>
            {missingLabels.length > 0 && (
              <p className="pro-cabinet-hint">
                Заполните: {missingLabels.join(', ')}.
              </p>
            )}
            <div className="pro-cabinet-actions">
              <button
                className="pro-cabinet-pill is-primary"
                type="button"
                onClick={() => onEditProfile()}
              >
                Редактировать профиль
              </button>
              <button
                className="pro-cabinet-pill"
                type="button"
                onClick={onViewRequests}
              >
                Открыть заявки
              </button>
            </div>
          </div>
        </section>

        {isLoading && <p className="pro-status">Загружаем кабинет...</p>}
        {loadError && <p className="pro-error">{loadError}</p>}

        <section className="pro-cabinet-grid animate delay-2">
          <button
            className="pro-cabinet-tile is-wide"
            type="button"
            onClick={() => onEditProfile('location')}
          >
            <span className="pro-cabinet-tile-icon" aria-hidden="true">
              📍
            </span>
            <span className="pro-cabinet-tile-info">
              <span className="pro-cabinet-tile-title">Локация</span>
              <span className="pro-cabinet-tile-value">{locationLabel}</span>
            </span>
            <span className="pro-cabinet-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-cabinet-tile is-wide"
            type="button"
            onClick={() => onEditProfile('location')}
          >
            <span className="pro-cabinet-tile-icon" aria-hidden="true">
              🧳
            </span>
            <span className="pro-cabinet-tile-info">
              <span className="pro-cabinet-tile-title">Опыт</span>
              <span className="pro-cabinet-tile-value">{experienceSummary}</span>
            </span>
            <span className="pro-cabinet-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-cabinet-tile"
            type="button"
            onClick={() => onEditProfile('location')}
          >
            <span className="pro-cabinet-tile-icon" aria-hidden="true">
              🧷
            </span>
            <span className="pro-cabinet-tile-info">
              <span className="pro-cabinet-tile-title">Формат</span>
              <span className="pro-cabinet-tile-value">{workFormatLabel}</span>
            </span>
            <span className="pro-cabinet-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-cabinet-tile"
            type="button"
            onClick={() => onEditProfile('services')}
          >
            <span className="pro-cabinet-tile-icon" aria-hidden="true">
              💸
            </span>
            <span className="pro-cabinet-tile-info">
              <span className="pro-cabinet-tile-title">Цены</span>
              <span className="pro-cabinet-tile-value">{priceLabel}</span>
            </span>
            <span className="pro-cabinet-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-cabinet-tile"
            type="button"
            onClick={() => onEditProfile('services')}
          >
            <span className="pro-cabinet-tile-icon" aria-hidden="true">
              🧴
            </span>
            <span className="pro-cabinet-tile-info">
              <span className="pro-cabinet-tile-title">Услуги</span>
              <span className="pro-cabinet-tile-value">{servicesSummary}</span>
            </span>
            <span className="pro-cabinet-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-cabinet-tile"
            type="button"
            onClick={() => onEditProfile('portfolio')}
          >
            <span className="pro-cabinet-tile-icon" aria-hidden="true">
              🖼️
            </span>
            <span className="pro-cabinet-tile-info">
              <span className="pro-cabinet-tile-title">Портфолио</span>
              <span className="pro-cabinet-tile-value">{portfolioSummary}</span>
            </span>
            <span className="pro-cabinet-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-cabinet-tile is-wide"
            type="button"
            onClick={() => onEditProfile('availability')}
          >
            <span className="pro-cabinet-tile-icon" aria-hidden="true">
              ⏱️
            </span>
            <span className="pro-cabinet-tile-info">
              <span className="pro-cabinet-tile-title">График</span>
              <span className="pro-cabinet-tile-value">{scheduleSummary}</span>
            </span>
            <span className="pro-cabinet-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
        </section>
      </div>

      <ProBottomNav
        active="cabinet"
        onCabinet={() => {}}
        onRequests={onViewRequests}
        onProfile={() => onEditProfile()}
      />
    </div>
  )
}
