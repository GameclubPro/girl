import { useEffect, useMemo, useState } from 'react'
import type { MasterProfile } from '../types/app'
import { getProfileStatusSummary } from '../utils/profileStatus'

type ProCabinetScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onBack: () => void
  onEditProfile: () => void
  onViewRequests: () => void
}

export const ProCabinetScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onBack,
  onEditProfile,
  onViewRequests,
}: ProCabinetScreenProps) => {
  const [profile, setProfile] = useState<MasterProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

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

  const status = useMemo(() => getProfileStatusSummary(profile), [profile])
  const displayName =
    profile?.displayName?.trim() || displayNameFallback.trim() || 'Мастер'
  const hasMissing = status.missingFields.length > 0
  const statusLabelMap = {
    draft: 'Черновик',
    ready: 'Готов к откликам',
    complete: 'Профиль заполнен',
  }
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

  const checklist = [
    {
      key: 'displayName',
      label: 'Имя и специализация',
      done: !status.missingFields.includes('displayName'),
    },
    {
      key: 'categories',
      label: 'Категории услуг',
      done: !status.missingFields.includes('categories'),
    },
    {
      key: 'location',
      label: 'Город и район',
      done:
        !status.missingFields.includes('cityId') &&
        !status.missingFields.includes('districtId'),
    },
    {
      key: 'workFormat',
      label: 'Формат работы',
      done: !status.missingFields.includes('workFormat'),
    },
  ]

  return (
    <div className="screen screen--pro-cabinet">
      <div className="pro-cabinet-shell">
        <header className="pro-cabinet-header animate delay-1">
          <button className="request-back" type="button" onClick={onBack}>
            <span aria-hidden="true">‹</span>
          </button>
          <div className="request-headings">
            <h1 className="request-title">Кабинет мастера</h1>
            <p className="request-subtitle">Профиль • заявки • отклики</p>
          </div>
        </header>

        <section className="pro-cabinet-card animate delay-2">
          <div className="cabinet-greeting">
            <p className="cabinet-hello">Привет, {displayName}</p>
            <span className="cabinet-status">{statusLabelMap[status.profileStatus]}</span>
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
          {isLoading && <p className="cabinet-status-note">Загружаем профиль...</p>}
          {loadError && <p className="cabinet-status-error">{loadError}</p>}
        </section>

        <section className="pro-cabinet-card animate delay-3">
          <h2 className="cabinet-card-title">Минимальный профиль</h2>
          <div className="cabinet-checklist" role="list">
            {checklist.map((item) => (
              <div
                className={`cabinet-check-item${item.done ? ' is-done' : ''}`}
                key={item.key}
                role="listitem"
              >
                <span className="cabinet-checkmark">{item.done ? '[x]' : '[ ]'}</span>
                {item.label}
              </div>
            ))}
          </div>
          <p className="cabinet-hint">
            Минимум нужен, чтобы показывать заявки рядом и отправлять отклики.
          </p>
        </section>

        <section className="pro-cabinet-card animate delay-4">
          <h2 className="cabinet-card-title">Действия</h2>
          <div className="cabinet-actions">
            <button className="pro-primary" type="button" onClick={onEditProfile}>
              Заполнить профиль
            </button>
            <button className="pro-secondary" type="button" onClick={onViewRequests}>
              Смотреть заявки
            </button>
          </div>
          {hasMissing && missingLabels.length > 0 && (
            <p className="cabinet-missing">
              Для отклика заполните: {missingLabels.join(', ')}.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
