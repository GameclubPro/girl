import { useEffect, useMemo, useState } from 'react'
import {
  IconClock,
  IconHome,
  IconList,
  IconPin,
  IconUser,
  IconUsers,
} from '../components/icons'
import type { Booking, ServiceRequest, UserLocation } from '../types/app'

type ClientProfileScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onViewHome: () => void
  onViewMasters: () => void
  onViewRequests: () => void
  onCreateRequest: () => void
  onEditAddress: () => void
}

type BookingChipTone = 'is-waiting' | 'is-warning' | 'is-confirmed' | 'is-muted'

const bookingStatusLabelMap: Record<Booking['status'], string> = {
  pending: 'Ожидает',
  price_pending: 'Цена',
  price_proposed: 'Предложение',
  confirmed: 'Подтверждена',
  declined: 'Отклонена',
  cancelled: 'Отменена',
}

const bookingStatusToneMap: Record<Booking['status'], BookingChipTone> = {
  pending: 'is-waiting',
  price_pending: 'is-waiting',
  price_proposed: 'is-warning',
  confirmed: 'is-confirmed',
  declined: 'is-muted',
  cancelled: 'is-muted',
}

const upcomingBookingStatuses = new Set<Booking['status']>([
  'pending',
  'price_pending',
  'price_proposed',
  'confirmed',
])

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

const getInitials = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return 'К'
  const parts = normalized.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0] ?? '')
  const joined = letters.join('').toUpperCase()
  if (joined) return joined
  return normalized.slice(0, 2).toUpperCase()
}

const buildLocationLabel = (cityName: string, districtName: string) => {
  const parts = [cityName, districtName].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : 'Город и район не указаны'
}

const formatLocationMeta = (location: UserLocation | null) => {
  if (!location) return ''
  const updatedLabel = location.updatedAt
    ? new Date(location.updatedAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  const accuracyLabel =
    typeof location.accuracy === 'number'
      ? `Точность ~${Math.round(location.accuracy)} м`
      : ''
  return [updatedLabel ? `Обновлено ${updatedLabel}` : '', accuracyLabel]
    .filter(Boolean)
    .join(' • ')
}

export const ClientProfileScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onViewHome,
  onViewMasters,
  onViewRequests,
  onCreateRequest,
  onEditAddress,
}: ClientProfileScreenProps) => {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [cityName, setCityName] = useState('')
  const [districtName, setDistrictName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const displayName = displayNameFallback.trim() || 'Клиент'
  const initials = getInitials(displayName)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadRequests = async () => {
      const response = await fetch(
        `${apiBase}/api/requests?userId=${encodeURIComponent(userId)}`
      )
      if (!response.ok) {
        throw new Error('Load requests failed')
      }
      const data = (await response.json().catch(() => null)) as
        | ServiceRequest[]
        | { requests?: ServiceRequest[] }
        | null
      return Array.isArray(data) ? data : data?.requests ?? []
    }

    const loadBookings = async () => {
      const response = await fetch(
        `${apiBase}/api/bookings?userId=${encodeURIComponent(userId)}`
      )
      if (!response.ok) {
        throw new Error('Load bookings failed')
      }
      const data = (await response.json().catch(() => null)) as Booking[] | null
      return Array.isArray(data) ? data : []
    }

    const loadSummary = async () => {
      setIsLoading(true)
      setLoadError('')
      const [requestsResult, bookingsResult] = await Promise.allSettled([
        loadRequests(),
        loadBookings(),
      ])

      if (cancelled) return

      if (requestsResult.status === 'fulfilled') {
        setRequests(requestsResult.value)
      }
      if (bookingsResult.status === 'fulfilled') {
        setBookings(bookingsResult.value)
      }

      const nextError = [
        requestsResult.status === 'rejected' ? 'Не удалось загрузить заявки.' : '',
        bookingsResult.status === 'rejected' ? 'Не удалось загрузить записи.' : '',
      ]
        .filter(Boolean)
        .join(' ')
      setLoadError(nextError)
      setIsLoading(false)
    }

    void loadSummary()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadAddress = async () => {
      const response = await fetch(
        `${apiBase}/api/address?userId=${encodeURIComponent(userId)}`
      )
      if (response.status === 404) {
        if (!cancelled) {
          setCityName('')
          setDistrictName('')
        }
        return
      }
      if (!response.ok) {
        throw new Error('Load address failed')
      }
      const data = (await response.json()) as {
        cityId?: number | null
        districtId?: number | null
      }

      if (!data.cityId) {
        if (!cancelled) {
          setCityName('')
          setDistrictName('')
        }
        return
      }

      const [citiesResponse, districtsResponse] = await Promise.all([
        fetch(`${apiBase}/api/cities`),
        data.districtId
          ? fetch(`${apiBase}/api/cities/${data.cityId}/districts`)
          : Promise.resolve(null),
      ])

      if (cancelled) return

      if (citiesResponse?.ok) {
        const cities = (await citiesResponse.json()) as { id: number; name: string }[]
        const matchedCity = cities.find((city) => city.id === data.cityId)
        setCityName(matchedCity?.name ?? '')
      } else {
        setCityName('')
      }

      if (districtsResponse?.ok && data.districtId) {
        const districts = (await districtsResponse.json()) as {
          id: number
          name: string
        }[]
        const matchedDistrict = districts.find(
          (district) => district.id === data.districtId
        )
        setDistrictName(matchedDistrict?.name ?? '')
      } else {
        setDistrictName('')
      }
    }

    const loadLocation = async () => {
      const response = await fetch(
        `${apiBase}/api/location?userId=${encodeURIComponent(userId)}`
      )
      if (response.status === 404) {
        if (!cancelled) {
          setLocation(null)
        }
        return
      }
      if (!response.ok) {
        throw new Error('Load location failed')
      }
      const data = (await response.json()) as UserLocation
      if (!cancelled) {
        setLocation(data)
      }
    }

    const loadProfileMeta = async () => {
      await Promise.allSettled([loadAddress(), loadLocation()])
    }

    void loadProfileMeta()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  const openRequestsCount = useMemo(
    () => requests.filter((request) => request.status === 'open').length,
    [requests]
  )
  const upcomingBookings = useMemo(() => {
    const now = Date.now()
    return bookings.filter((booking) => {
      if (!upcomingBookingStatuses.has(booking.status)) return false
      const scheduledAt = new Date(booking.scheduledAt)
      if (Number.isNaN(scheduledAt.getTime())) return false
      return scheduledAt.getTime() >= now
    })
  }, [bookings])
  const nextBooking = useMemo(() => {
    if (upcomingBookings.length === 0) return null
    return [...upcomingBookings].sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )[0]
  }, [upcomingBookings])
  const nextBookingTime = nextBooking ? formatDateTime(nextBooking.scheduledAt) : ''
  const nextBookingStatus = nextBooking
    ? bookingStatusLabelMap[nextBooking.status] ?? ''
    : ''
  const nextBookingTone = nextBooking
    ? bookingStatusToneMap[nextBooking.status] ?? 'is-muted'
    : 'is-muted'
  const locationLabel = buildLocationLabel(cityName, districtName)
  const locationMeta = formatLocationMeta(location)
  const locationStatusLabel = location ? 'Геолокация включена' : 'Геолокация выключена'

  return (
    <div className="screen screen--client screen--client-profile">
      <div className="client-shell client-profile-shell">
        <header className="client-profile-header">
          <div>
            <p className="client-profile-kicker">Профиль</p>
            <h1 className="client-profile-title">Мой кабинет</h1>
          </div>
          <button
            className="client-profile-header-action"
            type="button"
            onClick={onEditAddress}
            aria-label="Изменить город и район"
          >
            <IconPin />
          </button>
        </header>

        {isLoading && (
          <p className="client-profile-loading">Обновляем данные...</p>
        )}
        {loadError && <p className="client-profile-error">{loadError}</p>}

        <section className="client-profile-hero animate delay-1">
          <div className="client-profile-identity">
            <div className="client-profile-avatar" aria-hidden="true">
              {initials}
            </div>
            <div className="client-profile-title-group">
              <h2 className="client-profile-name">{displayName}</h2>
              <p className="client-profile-subtitle">Клиент KIVEN</p>
            </div>
          </div>

          <div className="cta-row">
            <button className="cta cta--primary" type="button" onClick={onCreateRequest}>
              Новая заявка
            </button>
            <button
              className="cta cta--secondary"
              type="button"
              onClick={onViewRequests}
            >
              Мои заявки
            </button>
          </div>

          <div className="client-profile-stats">
            <div className="client-profile-stat">
              <span className="client-profile-stat-value">{openRequestsCount}</span>
              <span className="client-profile-stat-label">Открытых заявок</span>
            </div>
            <div className="client-profile-stat">
              <span className="client-profile-stat-value">{upcomingBookings.length}</span>
              <span className="client-profile-stat-label">Активных записей</span>
            </div>
            <div className="client-profile-stat">
              <span className="client-profile-stat-value">{bookings.length}</span>
              <span className="client-profile-stat-label">Всего записей</span>
            </div>
          </div>
        </section>

        <section className="client-section client-profile-section animate delay-2">
          <div className="section-header">
            <h3>Ближайшее</h3>
          </div>
          <div className="client-profile-card">
            <div className="client-profile-card-head">
              <div className="client-profile-card-title">
                <span className="client-profile-card-icon" aria-hidden="true">
                  <IconClock />
                </span>
                <span>Ближайшая запись</span>
              </div>
              <button
                className="client-profile-card-action"
                type="button"
                onClick={onViewRequests}
              >
                Все
              </button>
            </div>
            {nextBooking ? (
              <div className="client-profile-booking">
                <div className="client-profile-booking-info">
                  <span className="client-profile-booking-title">
                    {nextBooking.serviceName || 'Услуга'}
                  </span>
                  <span className="client-profile-booking-meta">
                    {nextBooking.masterName || 'Мастер'}
                    {nextBookingTime ? ` • ${nextBookingTime}` : ''}
                  </span>
                  {(nextBooking.cityName || nextBooking.districtName) && (
                    <span className="client-profile-booking-meta">
                      {[nextBooking.cityName, nextBooking.districtName]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  )}
                </div>
                <span className={`client-profile-chip ${nextBookingTone}`}>
                  {nextBookingStatus}
                </span>
              </div>
            ) : (
              <p className="client-profile-empty">Пока нет активных записей.</p>
            )}
          </div>
        </section>

        <section className="client-section client-profile-section animate delay-3">
          <div className="section-header">
            <h3>Локация</h3>
          </div>
          <div className="client-profile-card">
            <div className="client-profile-card-head">
              <div className="client-profile-card-title">
                <span className="client-profile-card-icon" aria-hidden="true">
                  <IconPin />
                </span>
                <span>Город и район</span>
              </div>
              <button
                className="client-profile-card-action"
                type="button"
                onClick={onEditAddress}
              >
                Изменить
              </button>
            </div>
            <div className="client-profile-location">
              <div className="client-profile-location-info">
                <span className="client-profile-location-title">{locationLabel}</span>
                <span className="client-profile-location-subtitle">
                  Данные для подбора мастеров
                </span>
              </div>
            </div>
            <div className="client-profile-location-status">
              <span
                className={`client-profile-location-label${
                  location ? ' is-active' : ''
                }`}
              >
                {locationStatusLabel}
              </span>
              {locationMeta && (
                <span className="client-profile-location-meta">{locationMeta}</span>
              )}
            </div>
          </div>
        </section>

        <section className="client-section client-profile-section animate delay-4">
          <div className="section-header">
            <h3>Избранное</h3>
          </div>
          <div className="client-profile-card">
            <div className="client-profile-card-head">
              <div className="client-profile-card-title">
                <span className="client-profile-card-icon" aria-hidden="true">
                  <IconUser />
                </span>
                <span>Сохраненные мастера</span>
              </div>
              <button
                className="client-profile-card-action"
                type="button"
                onClick={onViewMasters}
              >
                Найти
              </button>
            </div>
            <p className="client-profile-empty">
              Пока нет сохраненных мастеров. Откройте витрину и добавьте тех,
              кто понравился.
            </p>
          </div>
        </section>
      </div>

      <nav className="bottom-nav" aria-label="Навигация">
        <button className="nav-item" type="button" onClick={onViewHome}>
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
        <button className="nav-item is-active" type="button">
          <span className="nav-icon" aria-hidden="true">
            <IconUser />
          </span>
          Профиль
        </button>
      </nav>
    </div>
  )
}
