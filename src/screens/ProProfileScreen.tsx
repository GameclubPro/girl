import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, RefObject } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { categoryItems } from '../data/clientData'
import type { City, District, MasterProfile, ProProfileSection } from '../types/app'
import { getProfileStatusSummary } from '../utils/profileStatus'

type ProProfileScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onBack: () => void
  onViewRequests: () => void
  focusSection?: ProProfileSection | null
}

const parseNumber = (value: string) => {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const scheduleDayOptions = [
  { id: 'mon', label: 'Пн' },
  { id: 'tue', label: 'Вт' },
  { id: 'wed', label: 'Ср' },
  { id: 'thu', label: 'Чт' },
  { id: 'fri', label: 'Пт' },
  { id: 'sat', label: 'Сб' },
  { id: 'sun', label: 'Вс' },
]

const MAX_MEDIA_BYTES = 3 * 1024 * 1024
const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

export const ProProfileScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onBack,
  onViewRequests,
  focusSection,
}: ProProfileScreenProps) => {
  const [cities, setCities] = useState<City[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [cityId, setCityId] = useState<number | null>(null)
  const [districtId, setDistrictId] = useState<number | null>(null)
  const [displayName, setDisplayName] = useState(displayNameFallback)
  const [about, setAbout] = useState('')
  const [experienceYears, setExperienceYears] = useState('')
  const [priceFrom, setPriceFrom] = useState('')
  const [priceTo, setPriceTo] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [services, setServices] = useState<string[]>([])
  const [serviceInput, setServiceInput] = useState('')
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([])
  const [portfolioInput, setPortfolioInput] = useState('')
  const [worksAtClient, setWorksAtClient] = useState(true)
  const [worksAtMaster, setWorksAtMaster] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [scheduleDays, setScheduleDays] = useState<string[]>([])
  const [scheduleStart, setScheduleStart] = useState('')
  const [scheduleEnd, setScheduleEnd] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [isAvatarUploading, setIsAvatarUploading] = useState(false)
  const [isCoverUploading, setIsCoverUploading] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const basicRef = useRef<HTMLDivElement>(null)
  const servicesRef = useRef<HTMLDivElement>(null)
  const locationRef = useRef<HTMLDivElement>(null)
  const availabilityRef = useRef<HTMLDivElement>(null)
  const portfolioRef = useRef<HTMLDivElement>(null)
  const profileStatus = useMemo(
    () =>
      getProfileStatusSummary({
        displayName,
        about,
        cityId,
        districtId,
        experienceYears: parseNumber(experienceYears),
        priceFrom: parseNumber(priceFrom),
        priceTo: parseNumber(priceTo),
        worksAtClient,
        worksAtMaster,
        categories,
        services,
        portfolioUrls,
      }),
    [
      about,
      categories,
      cityId,
      displayName,
      districtId,
      experienceYears,
      portfolioUrls,
      priceFrom,
      priceTo,
      services,
      worksAtClient,
      worksAtMaster,
    ]
  )
  const statusLabelMap = {
    draft: 'Черновик',
    ready: 'Готов к откликам',
    complete: 'Профиль заполнен',
  }
  const displayNameValue =
    displayName.trim() || displayNameFallback.trim() || 'Мастер'
  const profileTone =
    profileStatus.profileStatus === 'complete'
      ? 'is-complete'
      : profileStatus.profileStatus === 'ready'
        ? 'is-ready'
        : 'is-draft'
  const activeTone = isActive ? 'is-active' : 'is-paused'
  const aboutPreview =
    about.trim() ||
    'Добавьте пару слов о своем стиле работы — это повышает доверие.'
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
  const experienceValue = parseNumber(experienceYears)
  const priceFromValue = parseNumber(priceFrom)
  const priceToValue = parseNumber(priceTo)
  const priceLabel =
    priceFromValue !== null && priceToValue !== null
      ? `${priceFromValue}–${priceToValue} ₽`
      : priceFromValue !== null
        ? `от ${priceFromValue} ₽`
        : priceToValue !== null
          ? `до ${priceToValue} ₽`
          : 'Цена не указана'
  const experienceLabel =
    experienceValue !== null ? `${experienceValue} лет` : 'Опыт не указан'
  const locationLabel = useMemo(() => {
    const cityLabel = cityId
      ? cities.find((city) => city.id === cityId)?.name
      : ''
    const districtLabel = districtId
      ? districts.find((district) => district.id === districtId)?.name
      : ''
    return [cityLabel, districtLabel].filter(Boolean).join(', ') || 'Город не указан'
  }, [cities, cityId, districts, districtId])
  const categoryLabels = useMemo(
    () =>
      categoryItems
        .filter((category) => categories.includes(category.id))
        .map((category) => category.label),
    [categories]
  )

  useEffect(() => {
    if (!focusSection) return
    const targetMap: Record<ProProfileSection, RefObject<HTMLDivElement | null>> = {
      basic: basicRef,
      services: servicesRef,
      location: locationRef,
      availability: availabilityRef,
      portfolio: portfolioRef,
    }
    const target = targetMap[focusSection]?.current
    if (!target) return
    const timeout = window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
    return () => window.clearTimeout(timeout)
  }, [focusSection])

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

  useEffect(() => {
    if (!cityId) {
      setDistricts([])
      setDistrictId(null)
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
          setDistrictId((current) =>
            current && data.some((district) => district.id === current)
              ? current
              : null
          )
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
          return
        }
        if (!response.ok) {
          throw new Error('Load profile failed')
        }
        const data = (await response.json()) as MasterProfile
        if (cancelled) return

        setDisplayName(data.displayName ?? displayNameFallback)
        setAbout(data.about ?? '')
        setCityId(data.cityId ?? null)
        setDistrictId(data.districtId ?? null)
        setExperienceYears(
          data.experienceYears !== null && data.experienceYears !== undefined
            ? String(data.experienceYears)
            : ''
        )
        setPriceFrom(
          data.priceFrom !== null && data.priceFrom !== undefined
            ? String(data.priceFrom)
            : ''
        )
        setPriceTo(
          data.priceTo !== null && data.priceTo !== undefined
            ? String(data.priceTo)
            : ''
        )
        setIsActive(data.isActive ?? true)
        setScheduleDays(data.scheduleDays ?? [])
        setScheduleStart(data.scheduleStart ?? '')
        setScheduleEnd(data.scheduleEnd ?? '')
        setWorksAtClient(data.worksAtClient)
        setWorksAtMaster(data.worksAtMaster)
        setCategories(data.categories ?? [])
        setServices(data.services ?? [])
        setPortfolioUrls(data.portfolioUrls ?? [])
        setAvatarUrl(data.avatarUrl ?? '')
        setCoverUrl(data.coverUrl ?? '')
      } catch (error) {
        if (!cancelled) {
          setLoadError('Не удалось загрузить профиль.')
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
  }, [apiBase, displayNameFallback, userId])

  const toggleCategory = (categoryId: string) => {
    setCategories((current) =>
      current.includes(categoryId)
        ? current.filter((item) => item !== categoryId)
        : [...current, categoryId]
    )
  }

  const addService = () => {
    const trimmed = serviceInput.trim()
    if (!trimmed) return
    setServices((current) =>
      current.includes(trimmed) ? current : [...current, trimmed]
    )
    setServiceInput('')
  }

  const removeService = (service: string) => {
    setServices((current) => current.filter((item) => item !== service))
  }

  const addPortfolio = () => {
    const trimmed = portfolioInput.trim()
    if (!trimmed) return
    setPortfolioUrls((current) =>
      current.includes(trimmed) ? current : [...current, trimmed]
    )
    setPortfolioInput('')
  }

  const removePortfolio = (url: string) => {
    setPortfolioUrls((current) => current.filter((item) => item !== url))
  }

  const toggleScheduleDay = (dayId: string) => {
    setScheduleDays((current) =>
      current.includes(dayId)
        ? current.filter((item) => item !== dayId)
        : [...current, dayId]
    )
  }

  const readImageFile = (file: File, onLoad: (dataUrl: string) => void) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (result) {
        onLoad(result)
      }
    }
    reader.readAsDataURL(file)
  }

  const uploadMedia = async (kind: 'avatar' | 'cover', dataUrl: string) => {
    if (!userId) return
    setMediaError('')
    if (kind === 'avatar') {
      setIsAvatarUploading(true)
    } else {
      setIsCoverUploading(true)
    }

    try {
      const response = await fetch(`${apiBase}/api/masters/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          kind,
          dataUrl,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message =
          payload?.error === 'profile_not_found'
            ? 'Сначала сохраните профиль, чтобы загрузить медиа.'
            : payload?.error === 'image_too_large'
              ? 'Файл слишком большой. Максимум 3 МБ.'
              : payload?.error === 'invalid_image'
                ? 'Формат изображения не поддерживается.'
                : 'Не удалось загрузить изображение.'
        throw new Error(message)
      }
      const payload = (await response.json()) as {
        avatarUrl?: string | null
        coverUrl?: string | null
      }
      if (kind === 'avatar') {
        setAvatarUrl(payload.avatarUrl ?? '')
      } else {
        setCoverUrl(payload.coverUrl ?? '')
      }
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : 'Не удалось загрузить изображение.'
      )
    } finally {
      if (kind === 'avatar') {
        setIsAvatarUploading(false)
      } else {
        setIsCoverUploading(false)
      }
    }
  }

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setMediaError('')
    if (!allowedImageTypes.has(file.type)) {
      setMediaError('Поддерживаются только PNG, JPG или WebP.')
      event.target.value = ''
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setMediaError('Файл слишком большой. Максимум 3 МБ.')
      event.target.value = ''
      return
    }
    readImageFile(file, (dataUrl) => uploadMedia('avatar', dataUrl))
    event.target.value = ''
  }

  const handleCoverChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setMediaError('')
    if (!allowedImageTypes.has(file.type)) {
      setMediaError('Поддерживаются только PNG, JPG или WebP.')
      event.target.value = ''
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setMediaError('Файл слишком большой. Максимум 3 МБ.')
      event.target.value = ''
      return
    }
    readImageFile(file, (dataUrl) => uploadMedia('cover', dataUrl))
    event.target.value = ''
  }

  const handleAvatarSelect = () => {
    if (isAvatarUploading) return
    avatarInputRef.current?.click()
  }

  const handleCoverSelect = () => {
    if (isCoverUploading) return
    coverInputRef.current?.click()
  }

  const handleAvatarClear = async () => {
    if (!userId || isAvatarUploading) return
    setMediaError('')
    setIsAvatarUploading(true)
    try {
      const response = await fetch(`${apiBase}/api/masters/media`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, kind: 'avatar' }),
      })
      if (!response.ok) {
        throw new Error('Не удалось удалить аватар.')
      }
      setAvatarUrl('')
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : 'Не удалось удалить аватар.'
      )
    } finally {
      setIsAvatarUploading(false)
    }
  }

  const handleCoverClear = async () => {
    if (!userId || isCoverUploading) return
    setMediaError('')
    setIsCoverUploading(true)
    try {
      const response = await fetch(`${apiBase}/api/masters/media`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, kind: 'cover' }),
      })
      if (!response.ok) {
        throw new Error('Не удалось удалить шапку.')
      }
      setCoverUrl('')
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : 'Не удалось удалить шапку.'
      )
    } finally {
      setIsCoverUploading(false)
    }
  }

  const scrollToSection = (ref: RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSave = async () => {
    if (isSaving) return
    setSaveError('')
    setSaveSuccess('')

    const normalizedName = displayName.trim()

    const parsedPriceFrom = parseNumber(priceFrom)
    const parsedPriceTo = parseNumber(priceTo)
    if (
      parsedPriceFrom !== null &&
      parsedPriceTo !== null &&
      parsedPriceFrom > parsedPriceTo
    ) {
      setSaveError('Минимальная цена не может быть выше максимальной.')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(`${apiBase}/api/masters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          displayName: normalizedName,
          about: about.trim() || null,
          cityId,
          districtId,
          experienceYears: parseNumber(experienceYears),
          priceFrom: parsedPriceFrom,
          priceTo: parsedPriceTo,
          isActive,
          scheduleDays,
          scheduleStart: scheduleStart.trim() || null,
          scheduleEnd: scheduleEnd.trim() || null,
          worksAtClient,
          worksAtMaster,
          categories,
          services,
          portfolioUrls,
        }),
      })

      if (!response.ok) {
        throw new Error('Save profile failed')
      }

      const summary = getProfileStatusSummary({
        displayName: normalizedName,
        about,
        cityId,
        districtId,
        experienceYears: parseNumber(experienceYears),
        priceFrom: parsedPriceFrom,
        priceTo: parsedPriceTo,
        isActive,
        scheduleDays,
        scheduleStart: scheduleStart.trim() || null,
        scheduleEnd: scheduleEnd.trim() || null,
        worksAtClient,
        worksAtMaster,
        categories,
        services,
        portfolioUrls,
      })

      setSaveSuccess(
        summary.missingFields.length > 0
          ? 'Профиль сохранен как черновик. Заполните минимум для отклика.'
          : 'Профиль сохранен. Можно откликаться на заявки.'
      )
    } catch (error) {
      setSaveError('Не удалось сохранить профиль. Попробуйте еще раз.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="screen screen--pro">
      <header className="pro-hero pro-hero--bleed animate delay-1">
          <div className="pro-hero-top">
            <div className="pro-hero-actions">
              <button className="pro-ghost" type="button" onClick={onViewRequests}>
                Заявки
              </button>
              <button
                className="pro-ghost"
                type="button"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </div>
          </div>

          <div
            className={`pro-hero-cover${coverUrl ? ' has-image' : ''}${
              isCoverUploading ? ' is-loading' : ''
            }`}
            style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
            aria-busy={isCoverUploading}
          >
            <div className="pro-hero-grid" aria-hidden="true" />
            <div className="pro-hero-orb pro-hero-orb--one" aria-hidden="true" />
            <div className="pro-hero-orb pro-hero-orb--two" aria-hidden="true" />
            <div className="pro-hero-orb pro-hero-orb--three" aria-hidden="true" />
            <div className="pro-hero-controls">
              <input
                ref={coverInputRef}
                className="pro-file-input"
                type="file"
                accept="image/*"
                onChange={handleCoverChange}
                disabled={isCoverUploading}
                aria-hidden="true"
                tabIndex={-1}
              />
              <button
                className="pro-cover-action"
                type="button"
                onClick={handleCoverSelect}
                disabled={isCoverUploading}
              >
                {isCoverUploading ? 'Загрузка...' : 'Сменить шапку'}
              </button>
              {coverUrl && (
                <button
                  className="pro-cover-action is-muted"
                  type="button"
                  onClick={handleCoverClear}
                  disabled={isCoverUploading}
                >
                  Убрать
                </button>
              )}
            </div>
          </div>

          <div className="pro-hero-profile">
            <div
              className={`pro-avatar${isAvatarUploading ? ' is-loading' : ''}`}
              aria-busy={isAvatarUploading}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={`Аватар ${displayNameValue}`} />
              ) : (
                <span aria-hidden="true">{profileInitials}</span>
              )}
              <input
                ref={avatarInputRef}
                className="pro-file-input"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={isAvatarUploading}
                aria-hidden="true"
                tabIndex={-1}
              />
              <button
                className="pro-avatar-action"
                type="button"
                onClick={handleAvatarSelect}
                disabled={isAvatarUploading}
                aria-label="Обновить аватар"
              >
                +
              </button>
              {avatarUrl && (
                <button
                  className="pro-avatar-clear"
                  type="button"
                  onClick={handleAvatarClear}
                  disabled={isAvatarUploading}
                  aria-label="Удалить аватар"
                >
                  ×
                </button>
              )}
            </div>
            <div className="pro-hero-info">
              <span className="pro-hero-label">Профиль мастера</span>
              <div className="pro-hero-name">
                <h1 className="pro-hero-title">{displayNameValue}</h1>
                <div className="pro-hero-badges">
                  <span className={`pro-status-chip ${profileTone}`}>
                    {statusLabelMap[profileStatus.profileStatus]}
                  </span>
                  <span className={`pro-status-chip ${activeTone}`}>
                    {isActive ? 'Принимаю заявки' : 'Пауза'}
                  </span>
                </div>
              </div>
              <p
                className={`pro-hero-subtitle${
                  about.trim() ? '' : ' is-placeholder'
                }`}
              >
                {aboutPreview}
              </p>
              <div className="pro-hero-tags">
                {categoryLabels.length > 0 ? (
                  <>
                    {categoryLabels.slice(0, 4).map((label) => (
                      <span className="pro-tag" key={label}>
                        {label}
                      </span>
                    ))}
                    {categoryLabels.length > 4 && (
                      <span className="pro-tag pro-tag--empty">
                        +{categoryLabels.length - 4}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="pro-tag pro-tag--empty">Добавьте категории</span>
                )}
              </div>
            </div>
          </div>

          <div className="pro-hero-metrics">
            <div className="pro-metric">
              <span className="pro-metric-label">Локация</span>
              <strong className="pro-metric-value">{locationLabel}</strong>
            </div>
            <div className="pro-metric">
              <span className="pro-metric-label">Опыт</span>
              <strong className="pro-metric-value">{experienceLabel}</strong>
            </div>
            <div className="pro-metric">
              <span className="pro-metric-label">Цены</span>
              <strong className="pro-metric-value">{priceLabel}</strong>
            </div>
          </div>
        </header>

      <div className="pro-shell">
        <nav className="pro-section-nav animate delay-2" aria-label="Разделы профиля">
          <button
            className="pro-nav-pill"
            type="button"
            onClick={() => scrollToSection(basicRef)}
          >
            Основное
          </button>
          <button
            className="pro-nav-pill"
            type="button"
            onClick={() => scrollToSection(servicesRef)}
          >
            Услуги
          </button>
          <button
            className="pro-nav-pill"
            type="button"
            onClick={() => scrollToSection(locationRef)}
          >
            Локация
          </button>
          <button
            className="pro-nav-pill"
            type="button"
            onClick={() => scrollToSection(availabilityRef)}
          >
            График
          </button>
          <button
            className="pro-nav-pill"
            type="button"
            onClick={() => scrollToSection(portfolioRef)}
          >
            Портфолио
          </button>
        </nav>

        {mediaError && <p className="pro-error">{mediaError}</p>}

        {isLoading && <p className="pro-status">Загружаем профиль...</p>}
        {loadError && <p className="pro-error">{loadError}</p>}

        <section className="pro-card pro-section animate delay-2" ref={basicRef}>
          <div className="pro-section-head">
            <div className="pro-section-index">01</div>
            <div>
              <h2 className="pro-card-title">Основное</h2>
              <p className="pro-section-subtitle">Имя, описание и специализации</p>
            </div>
          </div>
          <div className="pro-field">
            <label className="pro-label" htmlFor="pro-name">
              Имя и специализация
            </label>
            <input
              id="pro-name"
              className="pro-input"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Например, Алина • Маникюр"
            />
          </div>
          <div className="pro-field">
            <label className="pro-label" htmlFor="pro-about">
              О себе
            </label>
            <textarea
              id="pro-about"
              className="pro-textarea"
              value={about}
              onChange={(event) => setAbout(event.target.value)}
              placeholder="Коротко о вашем опыте и стиле работы"
              rows={3}
            />
          </div>
          <div className="pro-field">
            <span className="pro-label">Категории</span>
            <div className="request-chips">
              {categoryItems.map((category) => (
                <button
                  className={`request-chip${
                    categories.includes(category.id) ? ' is-active' : ''
                  }`}
                  key={category.id}
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  aria-pressed={categories.includes(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="pro-card pro-section animate delay-3" ref={servicesRef}>
          <div className="pro-section-head">
            <div className="pro-section-index">02</div>
            <div>
              <h2 className="pro-card-title">Услуги и цены</h2>
              <p className="pro-section-subtitle">Что делаете и сколько это стоит</p>
            </div>
          </div>
          <div className="pro-field">
            <span className="pro-label">Услуги</span>
            <div className="pro-chip-field">
              <input
                className="pro-input"
                type="text"
                value={serviceInput}
                onChange={(event) => setServiceInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addService()
                  }
                }}
                placeholder="Добавить услугу"
              />
              <button className="pro-add" type="button" onClick={addService}>
                Добавить
              </button>
            </div>
            <div className="pro-chip-list">
              {services.map((service) => (
                <span className="pro-chip" key={service}>
                  {service}
                  <button
                    className="pro-chip-remove"
                    type="button"
                    onClick={() => removeService(service)}
                    aria-label={`Удалить ${service}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="pro-field pro-field--split">
            <div>
              <label className="pro-label" htmlFor="price-from">
                Цена от
              </label>
              <input
                id="price-from"
                className="pro-input"
                type="number"
                value={priceFrom}
                onChange={(event) => setPriceFrom(event.target.value)}
                placeholder="1500"
                min="0"
              />
            </div>
            <div>
              <label className="pro-label" htmlFor="price-to">
                Цена до
              </label>
              <input
                id="price-to"
                className="pro-input"
                type="number"
                value={priceTo}
                onChange={(event) => setPriceTo(event.target.value)}
                placeholder="3000"
                min="0"
              />
            </div>
          </div>
        </section>

        <section className="pro-card pro-section animate delay-4" ref={locationRef}>
          <div className="pro-section-head">
            <div className="pro-section-index">03</div>
            <div>
              <h2 className="pro-card-title">Локация и опыт</h2>
              <p className="pro-section-subtitle">
                Где вы работаете и сколько лет в профессии
              </p>
            </div>
          </div>
          <div className="pro-field pro-field--split">
            <div>
              <label className="pro-label" htmlFor="pro-city">
                Город
              </label>
              <select
                id="pro-city"
                className="pro-select"
                value={cityId ?? ''}
                onChange={(event) => {
                  const nextValue = Number(event.target.value)
                  setCityId(Number.isInteger(nextValue) ? nextValue : null)
                }}
              >
                <option value="">Выберите город</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="pro-label" htmlFor="pro-district">
                Район
              </label>
              <select
                id="pro-district"
                className="pro-select"
                value={districtId ?? ''}
                onChange={(event) => {
                  const nextValue = Number(event.target.value)
                  setDistrictId(Number.isInteger(nextValue) ? nextValue : null)
                }}
                disabled={!cityId || districts.length === 0}
              >
                <option value="">
                  {cityId ? 'Выберите район' : 'Сначала выберите город'}
                </option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="pro-field">
            <label className="pro-label" htmlFor="experience">
              Опыт (лет)
            </label>
            <input
              id="experience"
              className="pro-input"
              type="number"
              value={experienceYears}
              onChange={(event) => setExperienceYears(event.target.value)}
              placeholder="3"
              min="0"
            />
          </div>
          <div className="pro-field">
            <span className="pro-label">Формат работы</span>
            <div className="pro-toggle-grid">
              <label className="pro-toggle">
                <input
                  type="checkbox"
                  checked={worksAtMaster}
                  onChange={(event) => setWorksAtMaster(event.target.checked)}
                />
                У мастера
              </label>
              <label className="pro-toggle">
                <input
                  type="checkbox"
                  checked={worksAtClient}
                  onChange={(event) => setWorksAtClient(event.target.checked)}
                />
                Выезд к клиенту
              </label>
            </div>
          </div>
        </section>

        <section className="pro-card pro-section animate delay-5" ref={availabilityRef}>
          <div className="pro-section-head">
            <div className="pro-section-index">04</div>
            <div>
              <h2 className="pro-card-title">График и доступность</h2>
              <p className="pro-section-subtitle">
                Управляйте приемом заявок и расписанием
              </p>
            </div>
          </div>
          <div className="pro-field">
            <span className="pro-label">Статус</span>
            <label className="pro-toggle">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              Принимаю заявки
            </label>
          </div>
          <div className="pro-field">
            <span className="pro-label">Дни работы</span>
            <div className="request-chips">
              {scheduleDayOptions.map((day) => (
                <button
                  className={`request-chip${
                    scheduleDays.includes(day.id) ? ' is-active' : ''
                  }`}
                  key={day.id}
                  type="button"
                  onClick={() => toggleScheduleDay(day.id)}
                  aria-pressed={scheduleDays.includes(day.id)}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
          <div className="pro-field pro-field--split">
            <div>
              <label className="pro-label" htmlFor="schedule-start">
                Начало
              </label>
              <input
                id="schedule-start"
                className="pro-input"
                type="time"
                value={scheduleStart}
                onChange={(event) => setScheduleStart(event.target.value)}
              />
            </div>
            <div>
              <label className="pro-label" htmlFor="schedule-end">
                Окончание
              </label>
              <input
                id="schedule-end"
                className="pro-input"
                type="time"
                value={scheduleEnd}
                onChange={(event) => setScheduleEnd(event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="pro-card pro-section animate delay-6" ref={portfolioRef}>
          <div className="pro-section-head">
            <div className="pro-section-index">05</div>
            <div>
              <h2 className="pro-card-title">Портфолио</h2>
              <p className="pro-section-subtitle">Добавьте ссылки на лучшие работы</p>
            </div>
          </div>
          <div className="pro-field">
            <span className="pro-label">Ссылки на работы</span>
            <div className="pro-chip-field">
              <input
                className="pro-input"
                type="url"
                value={portfolioInput}
                onChange={(event) => setPortfolioInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addPortfolio()
                  }
                }}
                placeholder="https://..."
              />
              <button className="pro-add" type="button" onClick={addPortfolio}>
                Добавить
              </button>
            </div>
            <div className="pro-chip-list">
              {portfolioUrls.map((url) => (
                <span className="pro-chip" key={url}>
                  {url}
                  <button
                    className="pro-chip-remove"
                    type="button"
                    onClick={() => removePortfolio(url)}
                    aria-label="Удалить ссылку"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="pro-actions">
          <button
            className="pro-primary"
            type="button"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Сохраняем...' : 'Сохранить профиль'}
          </button>
          <button className="pro-secondary" type="button" onClick={onViewRequests}>
            Перейти к заявкам
          </button>
        </div>

        {saveError && <p className="pro-error">{saveError}</p>}
        {saveSuccess && <p className="pro-success">{saveSuccess}</p>}
      </div>

      <ProBottomNav
        active="profile"
        onCabinet={onBack}
        onRequests={onViewRequests}
        onProfile={() => {}}
      />
    </div>
  )
}
