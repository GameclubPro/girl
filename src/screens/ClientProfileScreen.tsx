import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconClock,
  IconHome,
  IconList,
  IconPin,
  IconRefresh,
  IconStar,
  IconUser,
  IconUsers,
} from '../components/icons'
import { categoryItems } from '../data/clientData'
import type { Booking, ServiceRequest, UserLocation } from '../types/app'
import type { FavoriteMaster } from '../utils/favorites'

type ClientProfileScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onViewHome: () => void
  onViewMasters: () => void
  onViewRequests: (tab?: 'requests' | 'bookings') => void
  onCreateRequest: () => void
  onEditAddress: () => void
  onViewMasterProfile: (masterId: string) => void
  onRequestLocation: () => Promise<void>
  onClearLocation: () => Promise<void>
  favorites: FavoriteMaster[]
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

const formatShortDate = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(parsed)
}

const formatCount = (value: number, one: string, few: string, many: string) => {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return `${value} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} ${few}`
  }
  return `${value} ${many}`
}

const formatRating = (average?: number | null, count?: number | null) => {
  const safeCount = typeof count === 'number' ? count : 0
  const safeAverage = typeof average === 'number' ? average : 0
  if (safeCount <= 0) return 'Новый'
  return `★ ${safeAverage.toFixed(1)} (${safeCount})`
}

const categoryLabelOverrides: Record<string, string> = {
  'beauty-nails': 'Маникюр',
  'makeup-look': 'Макияж',
  'cosmetology-care': 'Косметология',
  'fitness-health': 'Фитнес',
}

const getCategoryLabel = (categoryId: string) =>
  categoryLabelOverrides[categoryId] ??
  categoryItems.find((item) => item.id === categoryId)?.label ??
  categoryId

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
  onViewMasterProfile,
  onRequestLocation,
  onClearLocation,
  favorites,
}: ClientProfileScreenProps) => {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [cityName, setCityName] = useState('')
  const [districtName, setDistrictName] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [addressUpdatedAt, setAddressUpdatedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [metaError, setMetaError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [shareError, setShareError] = useState('')
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
      if (
        requestsResult.status === 'fulfilled' ||
        bookingsResult.status === 'fulfilled'
      ) {
        setLastUpdated(new Date())
      }
      setIsLoading(false)
    }

    void loadSummary()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  const refreshSummary = useCallback(async () => {
    if (!userId) return
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

    const [requestsResult, bookingsResult] = await Promise.allSettled([
      loadRequests(),
      loadBookings(),
    ])

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
    if (
      requestsResult.status === 'fulfilled' ||
      bookingsResult.status === 'fulfilled'
    ) {
      setLastUpdated(new Date())
    }
  }, [apiBase, userId])

  const refreshMeta = useCallback(async () => {
    if (!userId) return

    const loadAddress = async () => {
      const response = await fetch(
        `${apiBase}/api/address?userId=${encodeURIComponent(userId)}`
      )
      if (response.status === 404) {
        setCityName('')
        setDistrictName('')
        setAddressLine('')
        setAddressUpdatedAt(null)
        return
      }
      if (!response.ok) {
        throw new Error('Load address failed')
      }
      const data = (await response.json()) as {
        cityId?: number | null
        districtId?: number | null
        address?: string | null
        updatedAt?: string | null
      }

      if (!data.cityId) {
        setCityName('')
        setDistrictName('')
        setAddressLine(typeof data.address === 'string' ? data.address : '')
        setAddressUpdatedAt(
          typeof data.updatedAt === 'string' ? data.updatedAt : null
        )
        return
      }

      const [citiesResponse, districtsResponse] = await Promise.all([
        fetch(`${apiBase}/api/cities`),
        data.districtId
          ? fetch(`${apiBase}/api/cities/${data.cityId}/districts`)
          : Promise.resolve(null),
      ])

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

      setAddressLine(typeof data.address === 'string' ? data.address : '')
      setAddressUpdatedAt(typeof data.updatedAt === 'string' ? data.updatedAt : null)
    }

    const loadLocation = async () => {
      const response = await fetch(
        `${apiBase}/api/location?userId=${encodeURIComponent(userId)}`
      )
      if (response.status === 404) {
        setLocation(null)
        return
      }
      if (!response.ok) {
        throw new Error('Load location failed')
      }
      const data = (await response.json()) as UserLocation
      setLocation(data)
    }

    setMetaError('')
    const [addressResult, locationResult] = await Promise.allSettled([
      loadAddress(),
      loadLocation(),
    ])
    const nextError = [
      addressResult.status === 'rejected' ? 'Не удалось загрузить адрес.' : '',
      locationResult.status === 'rejected'
        ? 'Не удалось загрузить геолокацию.'
        : '',
    ]
      .filter(Boolean)
      .join(' ')
    setMetaError(nextError)
  }, [apiBase, userId])

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    await Promise.allSettled([refreshSummary(), refreshMeta()])
    setIsRefreshing(false)
  }, [isRefreshing, refreshMeta, refreshSummary])

  const handleRequestLocation = useCallback(async () => {
    setShareError('')
    setIsSharing(true)
    try {
      await onRequestLocation()
      await refreshMeta()
    } catch (error) {
      setShareError('Не удалось обновить геолокацию.')
    } finally {
      setIsSharing(false)
    }
  }, [onRequestLocation, refreshMeta])

  const handleClearLocation = useCallback(async () => {
    setShareError('')
    setIsSharing(true)
    try {
      await onClearLocation()
      await refreshMeta()
    } catch (error) {
      setShareError('Не удалось удалить геолокацию.')
    } finally {
      setIsSharing(false)
    }
  }, [onClearLocation, refreshMeta])

  const handleShareToggle = useCallback(
    async (nextShareToMasters: boolean) => {
      if (!userId || !location) return
      setIsSharing(true)
      setShareError('')
      try {
        const response = await fetch(`${apiBase}/api/location/share`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            shareToMasters: nextShareToMasters,
          }),
        })

        if (!response.ok) {
          throw new Error('Share update failed')
        }

        const data = (await response.json().catch(() => null)) as {
          location?: UserLocation | null
        } | null
        if (data?.location) {
          setLocation(data.location)
        } else {
          await refreshMeta()
        }
      } catch (error) {
        setShareError('Не удалось обновить настройки приватности.')
      } finally {
        setIsSharing(false)
      }
    },
    [apiBase, location, refreshMeta, userId]
  )

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
          setAddressLine('')
          setAddressUpdatedAt(null)
        }
        return
      }
      if (!response.ok) {
        throw new Error('Load address failed')
      }
      const data = (await response.json()) as {
        cityId?: number | null
        districtId?: number | null
        address?: string | null
        updatedAt?: string | null
      }

      if (!data.cityId) {
        if (!cancelled) {
          setCityName('')
          setDistrictName('')
          setAddressLine(typeof data.address === 'string' ? data.address : '')
          setAddressUpdatedAt(
            typeof data.updatedAt === 'string' ? data.updatedAt : null
          )
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

      setAddressLine(typeof data.address === 'string' ? data.address : '')
      setAddressUpdatedAt(typeof data.updatedAt === 'string' ? data.updatedAt : null)
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
      setMetaError('')
      const [addressResult, locationResult] = await Promise.allSettled([
        loadAddress(),
        loadLocation(),
      ])
      if (cancelled) return
      const nextError = [
        addressResult.status === 'rejected'
          ? 'Не удалось загрузить адрес.'
          : '',
        locationResult.status === 'rejected'
          ? 'Не удалось загрузить геолокацию.'
          : '',
      ]
        .filter(Boolean)
        .join(' ')
      setMetaError(nextError)
    }

    void loadProfileMeta()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  const openRequests = useMemo(
    () => requests.filter((request) => request.status === 'open'),
    [requests]
  )
  const openRequestsCount = openRequests.length
  const responseCount = useMemo(
    () =>
      openRequests.reduce(
        (total, request) => total + (request.responsesCount ?? 0),
        0
      ),
    [openRequests]
  )
  const priceOfferCount = useMemo(
    () => bookings.filter((booking) => booking.status === 'price_proposed').length,
    [bookings]
  )
  const pendingBookingCount = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status === 'pending' || booking.status === 'price_pending'
      ).length,
    [bookings]
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
  const recentBookings = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => {
      const aDate = new Date(a.scheduledAt).getTime()
      const bDate = new Date(b.scheduledAt).getTime()
      return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate)
    })
    return sorted.slice(0, 3)
  }, [bookings])
  const recentRequests = useMemo(() => {
    const sorted = [...openRequests].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    return sorted.slice(0, 3)
  }, [openRequests])
  const favoritesPreview = useMemo(() => favorites.slice(0, 3), [favorites])
  const favoriteCount = favorites.length
  const nextBookingTime = nextBooking ? formatDateTime(nextBooking.scheduledAt) : ''
  const nextBookingStatus = nextBooking
    ? bookingStatusLabelMap[nextBooking.status] ?? ''
    : ''
  const nextBookingTone = nextBooking
    ? bookingStatusToneMap[nextBooking.status] ?? 'is-muted'
    : 'is-muted'
  const profileChecklist = useMemo(
    () => [
      { id: 'address', label: 'Город и район', done: Boolean(cityName && districtName) },
      { id: 'location', label: 'Геолокация', done: Boolean(location) },
      { id: 'request', label: 'Первая заявка', done: requests.length > 0 },
      { id: 'booking', label: 'Первая запись', done: bookings.length > 0 },
      { id: 'favorite', label: 'Избранное', done: favoriteCount > 0 },
    ],
    [bookings, cityName, districtName, favoriteCount, location, requests]
  )
  const completionPercent = Math.round(
    (profileChecklist.filter((item) => item.done).length /
      profileChecklist.length) *
      100
  )
  const locationLabel = buildLocationLabel(cityName, districtName)
  const locationMeta = formatLocationMeta(location)
  const locationStatusLabel = location ? 'Геолокация включена' : 'Геолокация выключена'
  const addressLabel = addressLine.trim() || 'Адрес не указан'
  const addressMeta = addressUpdatedAt ? `Обновлено ${formatShortDate(addressUpdatedAt)}` : ''
  const locationShareLabel = location
    ? location.shareToMasters === false
      ? 'Расстояние скрыто от мастеров'
      : 'Мастера видят расстояние'
    : 'Геолокация не задана'
  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className="screen screen--client screen--client-profile">
      <div className="client-shell client-profile-shell">
        <header className="client-profile-header">
          <div>
            <p className="client-profile-kicker">Профиль</p>
            <h1 className="client-profile-title">Мой кабинет</h1>
            {lastUpdatedLabel && (
              <p className="client-profile-updated">
                Обновлено в {lastUpdatedLabel}
              </p>
            )}
          </div>
          <div className="client-profile-header-actions">
            <button
              className={`client-profile-header-action${
                isRefreshing ? ' is-loading' : ''
              }`}
              type="button"
              onClick={handleRefresh}
              aria-label="Обновить данные"
              disabled={isRefreshing}
            >
              <IconRefresh />
            </button>
            <button
              className="client-profile-header-action"
              type="button"
              onClick={onEditAddress}
              aria-label="Изменить город и район"
            >
              <IconPin />
            </button>
          </div>
        </header>

        {isLoading && (
          <p className="client-profile-loading">Обновляем данные...</p>
        )}
        {loadError && <p className="client-profile-error">{loadError}</p>}
        {metaError && <p className="client-profile-error">{metaError}</p>}
        {shareError && <p className="client-profile-error">{shareError}</p>}

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
            <button className="cta cta--secondary" type="button" onClick={onViewMasters}>
              Найти мастера
            </button>
          </div>

          <div className="client-profile-shortcuts">
            <button
              className="client-profile-shortcut"
              type="button"
              onClick={() => onViewRequests('requests')}
            >
              Мои заявки
            </button>
            <button
              className="client-profile-shortcut"
              type="button"
              onClick={() => onViewRequests('bookings')}
            >
              Мои записи
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
              <span className="client-profile-stat-value">{favoriteCount}</span>
              <span className="client-profile-stat-label">Избранное</span>
            </div>
          </div>

          {(responseCount > 0 || priceOfferCount > 0 || pendingBookingCount > 0) && (
            <div className="client-profile-alerts" role="list">
              {responseCount > 0 && (
                <button
                  className="client-profile-alert is-accent"
                  type="button"
                  onClick={() => onViewRequests('requests')}
                  role="listitem"
                >
                  <span className="client-profile-alert-count">
                    {formatCount(responseCount, 'отклик', 'отклика', 'откликов')}
                  </span>
                  <span className="client-profile-alert-label">Новые отклики</span>
                </button>
              )}
              {priceOfferCount > 0 && (
                <button
                  className="client-profile-alert is-warning"
                  type="button"
                  onClick={() => onViewRequests('bookings')}
                  role="listitem"
                >
                  <span className="client-profile-alert-count">
                    {formatCount(
                      priceOfferCount,
                      'предложение',
                      'предложения',
                      'предложений'
                    )}
                  </span>
                  <span className="client-profile-alert-label">Цена от мастера</span>
                </button>
              )}
              {pendingBookingCount > 0 && (
                <button
                  className="client-profile-alert is-neutral"
                  type="button"
                  onClick={() => onViewRequests('bookings')}
                  role="listitem"
                >
                  <span className="client-profile-alert-count">
                    {formatCount(
                      pendingBookingCount,
                      'запись',
                      'записи',
                      'записей'
                    )}
                  </span>
                  <span className="client-profile-alert-label">Ждут подтверждения</span>
                </button>
              )}
            </div>
          )}
        </section>

        <section className="client-section client-profile-section animate delay-2">
          <div className="section-header">
            <h3>Готовность профиля</h3>
          </div>
          <div className="client-profile-card client-profile-progress">
            <div className="client-profile-progress-head">
              <span className="client-profile-progress-title">
                Заполнено {completionPercent}%
              </span>
              <span className="client-profile-progress-value">{completionPercent}%</span>
            </div>
            <div className="client-profile-progress-bar" aria-hidden="true">
              <span style={{ width: `${completionPercent}%` }} />
            </div>
            <div className="client-profile-progress-list">
              {profileChecklist.map((item) => (
                <span
                  className={`client-profile-progress-item${
                    item.done ? ' is-done' : ''
                  }`}
                  key={item.id}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="client-section client-profile-section animate delay-3">
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
                onClick={() => onViewRequests('bookings')}
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

        <section className="client-section client-profile-section animate delay-4">
          <div className="section-header">
            <h3>Последние записи</h3>
          </div>
          <div className="client-profile-card">
            <div className="client-profile-card-head">
              <div className="client-profile-card-title">
                <span className="client-profile-card-icon" aria-hidden="true">
                  <IconClock />
                </span>
                <span>Недавние визиты</span>
              </div>
              <button
                className="client-profile-card-action"
                type="button"
                onClick={() => onViewRequests('bookings')}
              >
                Все
              </button>
            </div>
            {recentBookings.length > 0 ? (
              <div className="client-profile-bookings">
                {recentBookings.map((booking) => {
                  const bookingDate = formatShortDate(booking.scheduledAt)
                  const bookingStatus =
                    bookingStatusLabelMap[booking.status] ?? booking.status
                  const bookingTone =
                    bookingStatusToneMap[booking.status] ?? 'is-muted'
                  return (
                    <button
                      className="client-profile-booking-row"
                      type="button"
                      key={booking.id}
                      onClick={() => onViewMasterProfile(booking.masterId)}
                    >
                      <div className="client-profile-booking-info">
                        <span className="client-profile-booking-title">
                          {booking.serviceName || 'Услуга'}
                        </span>
                        <span className="client-profile-booking-meta">
                          {booking.masterName || 'Мастер'}
                          {bookingDate ? ` • ${bookingDate}` : ''}
                        </span>
                      </div>
                      <span className={`client-profile-chip ${bookingTone}`}>
                        {bookingStatus}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="client-profile-empty">Пока нет завершенных записей.</p>
            )}
          </div>
        </section>

        <section className="client-section client-profile-section animate delay-5">
          <div className="section-header">
            <h3>Активные заявки</h3>
          </div>
          <div className="client-profile-card">
            <div className="client-profile-card-head">
              <div className="client-profile-card-title">
                <span className="client-profile-card-icon" aria-hidden="true">
                  <IconList />
                </span>
                <span>Ваши заявки</span>
              </div>
              <button
                className="client-profile-card-action"
                type="button"
                onClick={() => onViewRequests('requests')}
              >
                Все
              </button>
            </div>
            {recentRequests.length > 0 ? (
              <div className="client-profile-requests">
                {recentRequests.map((request) => (
                  <button
                    className="client-profile-request"
                    key={request.id}
                    type="button"
                    onClick={() => onViewRequests('requests')}
                  >
                    <div className="client-profile-request-info">
                      <span className="client-profile-request-title">
                        {request.serviceName || 'Услуга'}
                      </span>
                      <span className="client-profile-request-meta">
                        {getCategoryLabel(request.categoryId)}
                        {request.createdAt
                          ? ` • ${formatShortDate(request.createdAt)}`
                          : ''}
                      </span>
                    </div>
                    <span
                      className={`client-profile-chip${
                        (request.responsesCount ?? 0) > 0 ? ' is-warning' : ' is-muted'
                      }`}
                    >
                      {(request.responsesCount ?? 0) > 0
                        ? formatCount(
                            request.responsesCount ?? 0,
                            'отклик',
                            'отклика',
                            'откликов'
                          )
                        : 'Без откликов'}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="client-profile-empty-block">
                <p className="client-profile-empty">
                  Открытых заявок пока нет. Создайте первую и получите отклики.
                </p>
                <button
                  className="client-profile-action"
                  type="button"
                  onClick={onCreateRequest}
                >
                  Создать заявку
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="client-section client-profile-section animate delay-6">
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
                <span className="client-profile-location-address">{addressLabel}</span>
                {addressMeta && (
                  <span className="client-profile-location-meta">{addressMeta}</span>
                )}
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
            <div className="client-profile-location-privacy">
              <button
                className={`client-profile-toggle${
                  location?.shareToMasters === false ? '' : ' is-active'
                }`}
                type="button"
                onClick={() => handleShareToggle(location?.shareToMasters === false)}
                disabled={!location || isSharing}
                aria-pressed={location?.shareToMasters !== false}
              >
                {location?.shareToMasters === false
                  ? 'Скрыто от мастеров'
                  : 'Видно мастерам'}
              </button>
              <span className="client-profile-location-meta">{locationShareLabel}</span>
            </div>
            <div className="client-profile-location-actions">
              <button
                className="client-profile-action"
                type="button"
                onClick={handleRequestLocation}
                disabled={isSharing}
              >
                {location ? 'Обновить геолокацию' : 'Поделиться геолокацией'}
              </button>
              {location && (
                <button
                  className="client-profile-action is-ghost"
                  type="button"
                  onClick={handleClearLocation}
                  disabled={isSharing}
                >
                  Удалить
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="client-section client-profile-section animate delay-7">
          <div className="section-header">
            <h3>Избранное</h3>
          </div>
          <div className="client-profile-card">
            <div className="client-profile-card-head">
              <div className="client-profile-card-title">
                <span className="client-profile-card-icon" aria-hidden="true">
                  <IconStar />
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
            {favoritesPreview.length > 0 ? (
              <div className="client-profile-favorites">
                {favoritesPreview.map((favorite) => {
                  const categoryLabels = Array.isArray(favorite.categories)
                    ? favorite.categories.slice(0, 2).map(getCategoryLabel)
                    : []
                  const ratingLabel = formatRating(
                    favorite.reviewsAverage,
                    favorite.reviewsCount
                  )
                  const locationLine = [favorite.cityName, favorite.districtName]
                    .filter(Boolean)
                    .join(', ')
                  return (
                    <button
                      className="client-profile-favorite"
                      key={favorite.masterId}
                      type="button"
                      onClick={() => onViewMasterProfile(favorite.masterId)}
                    >
                      <span className="client-profile-favorite-avatar" aria-hidden="true">
                        {favorite.avatarUrl ? (
                          <img src={favorite.avatarUrl} alt="" loading="lazy" />
                        ) : (
                          <span>{getInitials(favorite.displayName)}</span>
                        )}
                      </span>
                      <span className="client-profile-favorite-body">
                        <span className="client-profile-favorite-head">
                          <span className="client-profile-favorite-name">
                            {favorite.displayName}
                          </span>
                          <span className="client-profile-favorite-rating">
                            {ratingLabel}
                          </span>
                        </span>
                        <span className="client-profile-favorite-meta">
                          {categoryLabels.join(' • ') || 'Категории не указаны'}
                        </span>
                        <span className="client-profile-favorite-meta">
                          {locationLine || 'Локация не указана'}
                        </span>
                      </span>
                      <span className="client-profile-favorite-chevron" aria-hidden="true">
                        →
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="client-profile-empty">
                Пока нет сохраненных мастеров. Откройте витрину и добавьте тех,
                кто понравился.
              </p>
            )}
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
