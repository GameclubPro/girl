import { useEffect, useMemo, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { categoryItems } from '../data/clientData'
import type { City, District, MasterProfile, ProProfileSection } from '../types/app'
import { getProfileStatusSummary } from '../utils/profileStatus'

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
  const previewAbout = profile?.about?.trim() || 'Описание пока не добавлено.'
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
  const portfolioUrls = Array.isArray(profile?.portfolioUrls)
    ? profile?.portfolioUrls
    : []
  const categoryLabels = useMemo(
    () =>
      categoryItems
        .filter((category) => categories.includes(category.id))
        .map((category) => category.label),
    [categories]
  )
  const previewTags = useMemo(() => {
    const serviceList = services.filter(Boolean).slice(0, 4)
    if (serviceList.length > 0) return serviceList
    return categoryLabels.slice(0, 4)
  }, [categoryLabels, services])

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

  const portfolioSummary =
    portfolioUrls.length > 0 ? `${portfolioUrls.length} работ` : 'Портфолио пустое'

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

  return (
    <div className="screen screen--pro screen--pro-cabinet">
      <div className="pro-shell">
        <section className="pro-card pro-cabinet-hero animate delay-1">
          <div className="pro-cabinet-head">
            <div>
              <p className="pro-card-eyebrow">Кабинет</p>
              <h1 className="pro-card-title">Панель мастера</h1>
            </div>
            <div className="pro-hero-badges">
              <span className={`pro-status-chip ${profileTone}`}>
                {statusLabelMap[profileStatus.profileStatus]}
              </span>
              <span className={`pro-status-chip ${activeTone}`}>
                {isActive ? 'Принимаю заявки' : 'Пауза'}
              </span>
            </div>
          </div>
          <p className="pro-cabinet-subtitle">
            Управляйте профилем, заявками и доступностью без перегруза.
          </p>
          <div className="pro-cabinet-actions">
            <button className="pro-ghost" type="button" onClick={() => onEditProfile()}>
              Редактировать профиль
            </button>
            <button className="pro-ghost" type="button" onClick={onViewRequests}>
              Открыть заявки
            </button>
          </div>
        </section>

        {isLoading && <p className="pro-status">Загружаем кабинет...</p>}
        {loadError && <p className="pro-error">{loadError}</p>}

        <section className="pro-card pro-card--insight animate delay-2">
          <div className="pro-card-head">
            <div>
              <p className="pro-card-eyebrow">Навигатор профиля</p>
              <h2 className="pro-card-title">Готовность к заявкам</h2>
            </div>
            <span className={`pro-pill ${profileTone}`}>
              {profileStatus.completeness}%
            </span>
          </div>
          <div className="pro-insight-grid">
            <div className="pro-insight-item">
              <span className="pro-insight-label">Статус</span>
              <strong className="pro-insight-value">
                {statusLabelMap[profileStatus.profileStatus]}
              </strong>
            </div>
            <div className="pro-insight-item">
              <span className="pro-insight-label">Отклики</span>
              <strong className="pro-insight-value">
                {profileStatus.missingFields.length > 0 ? 'Недоступны' : 'Доступны'}
              </strong>
            </div>
            <div className="pro-insight-item">
              <span className="pro-insight-label">Фокус</span>
              <strong className="pro-insight-value">
                {missingLabels[0] ?? 'Портфолио'}
              </strong>
            </div>
          </div>
          <div className="pro-progress">
            <div className="pro-progress-row">
              <span>Готовность профиля</span>
              <strong>{profileStatus.completeness}%</strong>
            </div>
            <div className="pro-progress-bar" aria-hidden="true">
              <span style={{ width: `${profileStatus.completeness}%` }} />
            </div>
          </div>
          <p className="pro-progress-note">
            {profileStatus.missingFields.length > 0
              ? 'Заполните минимум, чтобы откликаться на заявки.'
              : 'Можно откликаться на заявки. Доведите профиль до 100% для доверия.'}
          </p>
          {missingLabels.length > 0 && (
            <p className="pro-progress-missing">
              Для отклика заполните: {missingLabels.join(', ')}.
            </p>
          )}
        </section>

        <section className="pro-card pro-preview animate delay-3">
          <div className="pro-preview-head">
            <div>
              <p className="pro-card-eyebrow">Превью</p>
              <h2 className="pro-card-title">Как видят клиенты</h2>
            </div>
            <span className="pro-preview-badge">Live</span>
          </div>
          <div className="master-preview-card">
            <div
              className={`master-preview-cover${coverUrl ? ' has-image' : ''}`}
              style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
            >
              <span className="master-preview-pill">{workFormatLabel}</span>
            </div>
            <div className="master-preview-body">
              <div className="master-preview-main">
                <div className="master-preview-avatar">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={`Аватар ${displayNameValue}`} />
                  ) : (
                    <span aria-hidden="true">{profileInitials}</span>
                  )}
                </div>
                <div className="master-preview-info">
                  <div className="master-preview-name">{displayNameValue}</div>
                  <div className="master-preview-meta">{locationLabel}</div>
                </div>
                <div className="master-preview-price">{priceLabel}</div>
              </div>
              <p
                className={`master-preview-about${profile?.about?.trim() ? '' : ' is-muted'}`}
              >
                {previewAbout}
              </p>
              <div className="master-preview-tags">
                {previewTags.length > 0 ? (
                  previewTags.map((tag, index) => (
                    <span className="master-preview-tag" key={`${tag}-${index}`}>
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="master-preview-tag is-empty">Добавьте услуги</span>
                )}
              </div>
              <div className="master-preview-stats">
                <span>{experienceSummary}</span>
                <span>{portfolioSummary}</span>
              </div>
              <div className="master-preview-footer">
                <span className="master-preview-format">{workFormatLabel}</span>
                <button className="master-preview-action" type="button" disabled>
                  Откликнуться
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="pro-card pro-cabinet-actions-card animate delay-3">
          <div className="pro-card-head">
            <div>
              <p className="pro-card-eyebrow">Быстрые правки</p>
              <h2 className="pro-card-title">Разделы профиля</h2>
            </div>
          </div>
          <div className="pro-cabinet-action-grid">
            <button
              className="pro-action-chip"
              type="button"
              onClick={() => onEditProfile('basic')}
            >
              Основное
            </button>
            <button
              className="pro-action-chip"
              type="button"
              onClick={() => onEditProfile('services')}
            >
              Услуги
            </button>
            <button
              className="pro-action-chip"
              type="button"
              onClick={() => onEditProfile('location')}
            >
              Локация
            </button>
            <button
              className="pro-action-chip"
              type="button"
              onClick={() => onEditProfile('availability')}
            >
              График
            </button>
            <button
              className="pro-action-chip"
              type="button"
              onClick={() => onEditProfile('portfolio')}
            >
              Портфолио
            </button>
          </div>
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
