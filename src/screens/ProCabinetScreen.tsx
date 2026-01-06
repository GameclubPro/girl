import { useEffect, useMemo, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import type { MasterProfile, ProProfileSection } from '../types/app'
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
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [requestsCount, setRequestsCount] = useState<number | null>(null)

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

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadRequestsCount = async () => {
      try {
        const response = await fetch(
          `${apiBase}/api/pro/requests?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load pro requests failed')
        }
        const data = (await response.json()) as
          | { requests?: unknown[] }
          | unknown[]
        if (cancelled) return
        const requestItems = Array.isArray(data) ? data : data.requests ?? []
        setRequestsCount(requestItems.length)
      } catch (error) {
        if (!cancelled) {
          setRequestsCount(null)
        }
      }
    }

    loadRequestsCount()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  const profileStatus = useMemo(() => getProfileStatusSummary(profile), [profile])
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

  const hasExperience =
    profile?.experienceYears !== null && profile?.experienceYears !== undefined
  const hasAbout = Boolean(profile?.about?.trim()) || hasExperience
  const hasPrice =
    (profile?.priceFrom !== null && profile?.priceFrom !== undefined) ||
    (profile?.priceTo !== null && profile?.priceTo !== undefined)
  const hasServices = serviceItems.length > 0
  const hasPortfolio = portfolioItems.length > 0
  const hasLocation = Boolean(profile?.cityId) && Boolean(profile?.districtId)

  const scheduleDays = Array.isArray(profile?.scheduleDays)
    ? profile?.scheduleDays
    : []
  const hasSchedule =
    scheduleDays.length > 0 ||
    Boolean(profile?.scheduleStart?.trim()) ||
    Boolean(profile?.scheduleEnd?.trim())

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

  const responseLabel = profileStatus.isResponseReady
    ? isActive
      ? 'Открыты'
      : 'Пауза'
    : 'Недоступны'
  const requestsSummary =
    requestsCount === null
      ? 'Нет данных'
      : formatCount(requestsCount, 'заявка', 'заявки', 'заявок')
  const nextTasks = useMemo(
    () => [
      !profile?.displayName?.trim()
        ? { id: 'name', label: 'Добавьте имя и специализацию', section: 'basic' }
        : null,
      categories.length === 0
        ? { id: 'categories', label: 'Выберите категории услуг', section: 'basic' }
        : null,
      !hasLocation
        ? { id: 'location', label: 'Добавьте город и район', section: 'location' }
        : null,
      !profile?.worksAtClient && !profile?.worksAtMaster
        ? {
            id: 'format',
            label: 'Укажите формат работы',
            section: 'location',
          }
        : null,
      !hasPrice
        ? { id: 'price', label: 'Укажите диапазон цен', section: 'services' }
        : null,
      !hasServices
        ? { id: 'services', label: 'Добавьте 2-3 услуги', section: 'services' }
        : null,
      !hasPortfolio
        ? { id: 'portfolio', label: 'Добавьте работы в портфолио', section: 'portfolio' }
        : null,
      !hasAbout
        ? { id: 'about', label: 'Напишите пару строк о себе', section: 'basic' }
        : null,
      !hasSchedule
        ? { id: 'schedule', label: 'Настройте график работы', section: 'availability' }
        : null,
    ].filter(Boolean) as Array<{
      id: string
      label: string
      section: ProProfileSection
    }>,
    [
      categories.length,
      hasAbout,
      hasLocation,
      hasPortfolio,
      hasPrice,
      hasSchedule,
      hasServices,
      profile?.displayName,
      profile?.worksAtClient,
      profile?.worksAtMaster,
    ]
  )
  const visibleTasks = nextTasks.slice(0, 4)

  return (
    <div className="screen screen--pro screen--pro-cabinet">
      <div className="pro-cabinet-shell">
        <section className="pro-cabinet-hero animate delay-1">
          <div className="pro-cabinet-hero-top">
            <div>
              <p className="pro-card-eyebrow">Ассистент</p>
              <h1 className="pro-cabinet-title">Привет, {displayNameValue}</h1>
            </div>
            <span className={`pro-status-chip ${activeTone}`}>
              {isActive ? 'Активен' : 'Пауза'}
            </span>
          </div>
          <p className="pro-cabinet-subtitle">
            Держите профиль и заявки под контролем, не утопая в настройках.
          </p>
          <div className="pro-cabinet-summary">
            <div className="pro-cabinet-summary-item">
              <span className="pro-cabinet-summary-label">Готовность</span>
              <strong className="pro-cabinet-summary-value">
                {profileStatus.completeness}%
              </strong>
            </div>
            <div className="pro-cabinet-summary-item">
              <span className="pro-cabinet-summary-label">Отклики</span>
              <strong className="pro-cabinet-summary-value">{responseLabel}</strong>
            </div>
            <div className="pro-cabinet-summary-item">
              <span className="pro-cabinet-summary-label">Заявки</span>
              <strong className="pro-cabinet-summary-value">{requestsSummary}</strong>
            </div>
          </div>
          {missingLabels.length > 0 && (
            <p className="pro-cabinet-hint">
              Для отклика нужно: {missingLabels.join(', ')}.
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
        </section>

        {isLoading && <p className="pro-status">Загружаем кабинет...</p>}
        {loadError && <p className="pro-error">{loadError}</p>}

        <section className="pro-cabinet-tasks animate delay-2">
          <div className="pro-card-head">
            <div>
              <p className="pro-card-eyebrow">Сегодня</p>
              <h2 className="pro-card-title">Следующие шаги</h2>
            </div>
            <span className={`pro-pill ${profileTone}`}>
              {profileStatus.completeness}%
            </span>
          </div>
          <div className="pro-cabinet-task-list">
            {visibleTasks.length > 0 ? (
              visibleTasks.map((task) => (
                <button
                  className="pro-cabinet-task"
                  type="button"
                  key={task.id}
                  onClick={() => onEditProfile(task.section)}
                >
                  <span className="pro-cabinet-task-dot" aria-hidden="true" />
                  <span className="pro-cabinet-task-text">{task.label}</span>
                  <span className="pro-cabinet-task-arrow" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))
            ) : (
              <div className="pro-cabinet-task-empty">
                Профиль готов. Можно брать заявки без ограничений.
              </div>
            )}
          </div>
        </section>

        <section className="pro-cabinet-quick animate delay-3">
          <div className="pro-card-head">
            <div>
              <p className="pro-card-eyebrow">Быстрые действия</p>
              <h2 className="pro-card-title">Ускорить работу</h2>
            </div>
          </div>
          <div className="pro-cabinet-quick-grid">
            <button
              className="pro-cabinet-quick-chip"
              type="button"
              onClick={onViewRequests}
            >
              Заявки
            </button>
            <button
              className="pro-cabinet-quick-chip"
              type="button"
              onClick={() => onEditProfile('services')}
            >
              Цены и услуги
            </button>
            <button
              className="pro-cabinet-quick-chip"
              type="button"
              onClick={() => onEditProfile('portfolio')}
            >
              Портфолио
            </button>
            <button
              className="pro-cabinet-quick-chip"
              type="button"
              onClick={() => onEditProfile('availability')}
            >
              График
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
