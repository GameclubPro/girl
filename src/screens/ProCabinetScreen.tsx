import { useEffect, useMemo, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { categoryItems } from '../data/clientData'
import type { MasterProfile, ProProfileSection, ServiceRequest } from '../types/app'
import { getProfileStatusSummary } from '../utils/profileStatus'

const locationLabelMap = {
  master: 'У мастера',
  client: 'У меня',
  any: 'Не важно',
} as const

const dateLabelMap = {
  today: 'Сегодня',
  tomorrow: 'Завтра',
  choose: 'По времени',
} as const

const scheduleDayLabelMap = {
  mon: 'Пн',
  tue: 'Вт',
  wed: 'Ср',
  thu: 'Чт',
  fri: 'Пт',
  sat: 'Сб',
  sun: 'Вс',
} as const

const formatDateTime = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
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
  const [previewRequests, setPreviewRequests] = useState<ServiceRequest[]>([])
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [statusError, setStatusError] = useState('')

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
    if (profile?.isActive === undefined) return
    setIsActive(profile.isActive)
  }, [profile?.isActive])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadPreview = async () => {
      setIsPreviewLoading(true)
      setPreviewError('')

      try {
        const response = await fetch(
          `${apiBase}/api/pro/requests?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load preview failed')
        }
        const data = (await response.json()) as
          | ServiceRequest[]
          | {
              requests?: ServiceRequest[]
            }
        if (cancelled) return
        const nextRequests = Array.isArray(data) ? data : data.requests ?? []
        setPreviewRequests(nextRequests.slice(0, 3))
      } catch (error) {
        if (!cancelled) {
          setPreviewError('Не удалось загрузить заявки.')
        }
      } finally {
        if (!cancelled) {
          setIsPreviewLoading(false)
        }
      }
    }

    loadPreview()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  const status = useMemo(() => getProfileStatusSummary(profile), [profile])
  const displayName =
    profile?.displayName?.trim() || displayNameFallback.trim() || 'Мастер'
  const hasMissing = status.missingFields.length > 0
  const statusLabelMap = {
    draft: 'Черновик',
    ready: 'Готов к откликам',
    complete: 'Профиль заполнен',
  }
  const activeValue = profile?.isActive ?? isActive
  const statusLabel =
    activeValue === false ? 'Пауза' : statusLabelMap[status.profileStatus]
  const missingLabels: string[] = []
  if (status.missingFields.includes('displayName')) {
    missingLabels.push('Имя и специализация')
  }
  if (status.missingFields.includes('categories')) {
    missingLabels.push('Категории услуг')
  }
  if (
    status.missingFields.includes('cityId') ||
    status.missingFields.includes('districtId')
  ) {
    missingLabels.push('Город и район')
  }
  if (status.missingFields.includes('workFormat')) {
    missingLabels.push('Формат работы')
  }

  const scheduleDays = profile?.scheduleDays ?? []
  const scheduleDayLabels = scheduleDays
    .map((day) => scheduleDayLabelMap[day as keyof typeof scheduleDayLabelMap])
    .filter(Boolean)
  const scheduleTimeLabel =
    profile?.scheduleStart && profile?.scheduleEnd
      ? `${profile.scheduleStart}–${profile.scheduleEnd}`
      : profile?.scheduleStart
        ? `с ${profile.scheduleStart}`
        : profile?.scheduleEnd
          ? `до ${profile.scheduleEnd}`
          : ''
  const scheduleParts = [
    scheduleDayLabels.length > 0 ? scheduleDayLabels.join(' ') : '',
    scheduleTimeLabel,
  ].filter(Boolean)
  const scheduleSummary =
    scheduleParts.length > 0 ? scheduleParts.join(' • ') : 'График не задан'

  const canToggleStatus = Boolean(profile?.userId)
  const handleToggleActive = async () => {
    if (!canToggleStatus || isUpdatingStatus) return
    const nextValue = !isActive
    setIsActive(nextValue)
    setIsUpdatingStatus(true)
    setStatusError('')

    try {
      const response = await fetch(`${apiBase}/api/masters/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          isActive: nextValue,
        }),
      })
      if (!response.ok) {
        throw new Error('Update status failed')
      }
      setProfile((current) =>
        current ? { ...current, isActive: nextValue } : current
      )
    } catch (error) {
      setIsActive((current) => !current)
      setStatusError('Не удалось обновить статус.')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const firstMissingSection: ProProfileSection | undefined =
    status.missingFields.includes('displayName') ||
    status.missingFields.includes('categories')
      ? 'basic'
      : status.missingFields.includes('cityId') ||
          status.missingFields.includes('districtId') ||
          status.missingFields.includes('workFormat')
        ? 'location'
        : undefined
  const isPaused = activeValue === false
  const nextActionTitle = isPaused
    ? 'Пауза'
    : hasMissing
      ? 'Следующий шаг'
      : 'Новые заявки'
  const nextActionText = isPaused
    ? 'Сейчас вы не принимаете заявки'
    : hasMissing
      ? 'Заполните стартовый профиль • 2–3 минуты'
      : 'Проверьте свежие заявки рядом'
  const nextActionButton = isPaused ? 'Включить' : hasMissing ? 'Начать' : 'Открыть'
  const handleNextAction = () => {
    if (isPaused) {
      handleToggleActive()
      return
    }
    if (hasMissing) {
      onEditProfile(firstMissingSection ?? 'basic')
      return
    }
    onViewRequests()
  }
  const nextActionDisabled = isPaused ? !canToggleStatus || isUpdatingStatus : false

  const checklist: {
    key: string
    label: string
    done: boolean
    section: ProProfileSection
  }[] = [
    {
      key: 'displayName',
      label: 'Имя и специализация',
      done: !status.missingFields.includes('displayName'),
      section: 'basic',
    },
    {
      key: 'categories',
      label: 'Категории услуг',
      done: !status.missingFields.includes('categories'),
      section: 'basic',
    },
    {
      key: 'location',
      label: 'Город и район',
      done:
        !status.missingFields.includes('cityId') &&
        !status.missingFields.includes('districtId'),
      section: 'location',
    },
    {
      key: 'workFormat',
      label: 'Формат работы',
      done: !status.missingFields.includes('workFormat'),
      section: 'location',
    },
  ]

  return (
    <div className="screen screen--pro-cabinet">
      <div className="pro-cabinet-shell">
        <header className="pro-cabinet-header animate delay-1">
          <div className="request-headings">
            <h1 className="request-title">Кабинет мастера</h1>
            <p className="request-subtitle">Профиль • заявки • отклики</p>
          </div>
        </header>

        <section className="pro-cabinet-card animate delay-2">
          <div className="cabinet-greeting">
            <p className="cabinet-hello">Привет, {displayName}</p>
            <span className="cabinet-status">{statusLabel}</span>
          </div>
          <div className="cabinet-progress">
            <div className="cabinet-progress-row">
              <span>Готовность профиля</span>
              <strong>{status.completeness}%</strong>
            </div>
            <div className="cabinet-progress-bar" aria-hidden="true">
              <span style={{ width: `${status.completeness}%` }} />
            </div>
            <p className="cabinet-progress-note">
              {hasMissing
                ? 'Заполните минимум, чтобы откликаться на заявки.'
                : 'Можно откликаться на заявки. Доведите профиль до 100% для большего доверия.'}
            </p>
          </div>
          <div className="cabinet-next">
            <div>
              <div className="cabinet-next-title">{nextActionTitle}</div>
              <p className="cabinet-next-text">{nextActionText}</p>
            </div>
            <button
              className="cabinet-next-button"
              type="button"
              onClick={handleNextAction}
              disabled={nextActionDisabled}
            >
              {nextActionButton}
            </button>
          </div>
          {isLoading && <p className="cabinet-status-note">Загружаем профиль...</p>}
          {loadError && <p className="cabinet-status-error">{loadError}</p>}
        </section>

        <section className="pro-cabinet-card animate delay-3">
          <h2 className="cabinet-card-title">Стартовый профиль</h2>
          <div className="cabinet-checklist">
            {checklist.map((item) => (
              <button
                className={`cabinet-check-item${item.done ? ' is-done' : ''}`}
                key={item.key}
                type="button"
                onClick={() => onEditProfile(item.section)}
              >
                <span className="cabinet-checkmark">{item.done ? '[x]' : '[ ]'}</span>
                {item.label}
              </button>
            ))}
          </div>
          <p className="cabinet-hint">
            Стартовый профиль нужен, чтобы показывать заявки рядом и отправлять отклики.
          </p>
        </section>

        <section className="pro-cabinet-card animate delay-4">
          <h2 className="cabinet-card-title">Заявки рядом</h2>
          {isPreviewLoading && (
            <p className="cabinet-status-note">Загружаем заявки...</p>
          )}
          {previewError && <p className="cabinet-status-error">{previewError}</p>}
          {!isPreviewLoading && !previewError && previewRequests.length === 0 && (
            <p className="cabinet-hint">
              {hasMissing
                ? 'Заполните стартовый профиль, чтобы видеть заявки рядом.'
                : 'Пока нет подходящих заявок.'}
            </p>
          )}
          <div className="cabinet-request-list">
            {previewRequests.map((item) => {
              const categoryLabel =
                categoryItems.find((category) => category.id === item.categoryId)
                  ?.label ?? item.categoryId
              const locationLabel =
                locationLabelMap[item.locationType] ?? 'Не важно'
              const dateLabel =
                item.dateOption === 'choose'
                  ? formatDateTime(item.dateTime) || 'По договоренности'
                  : dateLabelMap[item.dateOption]

              return (
                <div className="cabinet-request-card" key={item.id}>
                  <div className="cabinet-request-title">{item.serviceName}</div>
                  <div className="cabinet-request-meta">
                    {categoryLabel}
                    {item.budget ? ` • ${item.budget}` : ''}
                  </div>
                  <div className="cabinet-request-meta">
                    {locationLabel}
                    {item.cityName ? ` • ${item.cityName}` : ''}
                    {item.districtName ? ` • ${item.districtName}` : ''}
                  </div>
                  <div className="cabinet-request-meta">{dateLabel}</div>
                </div>
              )
            })}
          </div>
          {hasMissing && missingLabels.length > 0 && (
            <p className="cabinet-missing">
              Для отклика заполните: {missingLabels.join(', ')}.
            </p>
          )}
          <button className="pro-secondary" type="button" onClick={onViewRequests}>
            Смотреть все заявки
          </button>
        </section>

        <section className="pro-cabinet-card animate delay-5">
          <h2 className="cabinet-card-title">Доступность</h2>
          <div className="cabinet-availability">
            <label className="cabinet-toggle">
              <input
                type="checkbox"
                checked={isActive}
                onChange={handleToggleActive}
                disabled={!canToggleStatus || isUpdatingStatus}
              />
              Принимаю заявки
            </label>
            <div className="cabinet-schedule">
              <span className="cabinet-schedule-label">График</span>
              <span className="cabinet-schedule-value">{scheduleSummary}</span>
            </div>
            <button
              className="cabinet-link"
              type="button"
              onClick={() => onEditProfile('availability')}
            >
              Изменить график
            </button>
            {!canToggleStatus && (
              <p className="cabinet-hint">
                Заполните профиль, чтобы включить прием заявок.
              </p>
            )}
            {statusError && <p className="cabinet-status-error">{statusError}</p>}
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
