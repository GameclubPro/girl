import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
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
  const basicRef = useRef<HTMLDivElement | null>(null)
  const servicesRef = useRef<HTMLDivElement | null>(null)
  const locationRef = useRef<HTMLDivElement | null>(null)
  const availabilityRef = useRef<HTMLDivElement | null>(null)
  const portfolioRef = useRef<HTMLDivElement | null>(null)
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
  const statusLabelMap = {
    draft: 'Черновик',
    ready: 'Готов к откликам',
    complete: 'Профиль заполнен',
  }

  useEffect(() => {
    if (!focusSection) return
    const targetMap: Record<ProProfileSection, RefObject<HTMLDivElement>> = {
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
      <div className="pro-shell">
        <header className="pro-header animate delay-1">
          <button className="request-back" type="button" onClick={onBack}>
            <span aria-hidden="true">‹</span>
          </button>
          <div className="request-headings">
            <h1 className="request-title">Профиль мастера</h1>
            <p className="request-subtitle">Настройте профиль и получайте заявки</p>
          </div>
        </header>

        {isLoading && <p className="pro-status">Загружаем анкету...</p>}
        {loadError && <p className="pro-error">{loadError}</p>}

        <section className="pro-card animate delay-2">
          <h2 className="pro-card-title">Прогресс профиля</h2>
          <div className="pro-progress">
            <div className="pro-progress-row">
              <span>Готовность профиля</span>
              <strong>{profileStatus.completeness}%</strong>
            </div>
            <div className="pro-progress-bar" aria-hidden="true">
              <span style={{ width: `${profileStatus.completeness}%` }} />
            </div>
            <div className="pro-progress-row pro-progress-status">
              <span>Статус</span>
              <strong>{statusLabelMap[profileStatus.profileStatus]}</strong>
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
          </div>
        </section>

        <section className="pro-card animate delay-2" ref={basicRef}>
          <h2 className="pro-card-title">Основное</h2>
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

        <section className="pro-card animate delay-3" ref={servicesRef}>
          <h2 className="pro-card-title">Услуги и цены</h2>
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

        <section className="pro-card animate delay-4" ref={locationRef}>
          <h2 className="pro-card-title">Локация и опыт</h2>
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

        <section className="pro-card animate delay-5" ref={availabilityRef}>
          <h2 className="pro-card-title">График и доступность</h2>
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

        <section className="pro-card animate delay-6" ref={portfolioRef}>
          <h2 className="pro-card-title">Портфолио</h2>
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
          <button className="pro-primary" type="button" onClick={handleSave}>
            {isSaving ? 'Сохраняем...' : 'Сохранить профиль'}
          </button>
          <button className="pro-secondary" type="button" onClick={onViewRequests}>
            Перейти к заявкам
          </button>
        </div>

        {saveError && <p className="pro-error">{saveError}</p>}
        {saveSuccess && <p className="pro-success">{saveSuccess}</p>}
      </div>
    </div>
  )
}
