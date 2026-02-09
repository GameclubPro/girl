import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconClock,
  IconList,
  IconPin,
  IconRefresh,
  IconStar,
} from '../components/icons'
import { ClientBottomNav } from '../components/ClientBottomNav'
import { TrustMeter } from '../components/TrustMeter'
import { categoryItems } from '../data/clientData'
import type {
  Booking,
  ClientTrust,
  ServiceRequest,
  UserLocation,
} from '../types/app'
import type { FavoriteMaster } from '../utils/favorites'
import { buildTrustTips } from '../utils/trustScore'

type ClientProfileScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onViewHome: () => void
  onViewMasters: () => void
  onViewRequests: (tab?: 'requests' | 'bookings') => void
  onViewChats: () => void
  onCreateRequest: () => void
  onOpenSupport: () => void
  onCreateBooking: (payload: {
    masterId: string
    categoryId?: string | null
    serviceName?: string | null
    locationType?: 'master' | 'client' | null
    details?: string | null
    photoUrls?: string[]
  }) => void
  onEditAddress: () => void
  onViewMasterProfile: (masterId: string) => void
  onRequestLocation: () => Promise<void>
  onClearLocation: () => Promise<void>
  favorites: FavoriteMaster[]
}

type BookingChipTone = 'waiting' | 'warning' | 'confirmed' | 'muted'

type ProfileTabId = 'overview' | 'activity' | 'location' | 'favorites'

const profileTabs: Array<{ id: ProfileTabId; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'activity', label: 'Активность' },
  { id: 'location', label: 'Локация' },
  { id: 'favorites', label: 'Избранное' },
]

const bookingStatusLabelMap: Record<Booking['status'], string> = {
  pending: 'Ожидает',
  price_pending: 'Цена',
  price_proposed: 'Предложение',
  confirmed: 'Подтверждена',
  declined: 'Отклонена',
  cancelled: 'Отменена',
}

const bookingStatusToneMap: Record<Booking['status'], BookingChipTone> = {
  pending: 'waiting',
  price_pending: 'waiting',
  price_proposed: 'warning',
  confirmed: 'confirmed',
  declined: 'muted',
  cancelled: 'muted',
}

const upcomingBookingStatuses = new Set<Booking['status']>([
  'pending',
  'price_pending',
  'price_proposed',
  'confirmed',
])

const categoryLabelOverrides: Record<string, string> = {
  'beauty-nails': 'Ногти',
  'cosmetology-care': 'Уход за лицом',
}

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
  const safeAverage =
    typeof average === 'number' && Number.isFinite(average) ? average : 0
  if (safeCount <= 0) return 'Новый'
  return `★ ${safeAverage.toFixed(1)} (${safeCount})`
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
  if (!location) return [] as string[]
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
  return [updatedLabel ? `Обновлено ${updatedLabel}` : '', accuracyLabel].filter(
    Boolean
  )
}

const getBadgeTone = (tone: BookingChipTone) => {
  if (tone === 'waiting') return 'is-waiting'
  if (tone === 'warning') return 'is-warning'
  if (tone === 'confirmed') return 'is-confirmed'
  return 'is-muted'
}

export const ClientProfileScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onViewHome,
  onViewMasters,
  onViewRequests,
  onViewChats,
  onCreateRequest,
  onOpenSupport,
  onCreateBooking,
  onEditAddress,
  onViewMasterProfile,
  onRequestLocation,
  onClearLocation,
  favorites,
}: ClientProfileScreenProps) => {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [trust, setTrust] = useState<ClientTrust | null>(null)
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [cityName, setCityName] = useState('')
  const [districtName, setDistrictName] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [addressUpdatedAt, setAddressUpdatedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [trustError, setTrustError] = useState('')
  const [metaError, setMetaError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [shareError, setShareError] = useState('')
  const [activeTab, setActiveTab] = useState<ProfileTabId>('overview')
  const [isRoadmapExpanded, setIsRoadmapExpanded] = useState(false)
  const [isErrorDetailsOpen, setIsErrorDetailsOpen] = useState(false)

  const displayName = displayNameFallback.trim() || 'Клиент'
  const initials = getInitials(displayName)

  const fetchRequests = useCallback(async () => {
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
  }, [apiBase, userId])

  const fetchBookings = useCallback(async () => {
    const response = await fetch(
      `${apiBase}/api/bookings?userId=${encodeURIComponent(userId)}`
    )
    if (!response.ok) {
      throw new Error('Load bookings failed')
    }
    const data = (await response.json().catch(() => null)) as Booking[] | null
    return Array.isArray(data) ? data : []
  }, [apiBase, userId])

  const fetchTrust = useCallback(async () => {
    const response = await fetch(
      `${apiBase}/api/clients/${encodeURIComponent(userId)}/trust?userId=${encodeURIComponent(userId)}`
    )
    if (!response.ok) {
      throw new Error('Load trust failed')
    }
    const data = (await response.json().catch(() => null)) as ClientTrust | null
    return data ?? null
  }, [apiBase, userId])

  const fetchAddress = useCallback(async () => {
    const response = await fetch(
      `${apiBase}/api/address?userId=${encodeURIComponent(userId)}`
    )
    if (response.status === 404) {
      return {
        cityName: '',
        districtName: '',
        addressLine: '',
        addressUpdatedAt: null,
      }
    }
    if (!response.ok) {
      throw new Error('Load address failed')
    }

    const data = (await response.json().catch(() => null)) as {
      cityId?: number | null
      districtId?: number | null
      address?: string | null
      updatedAt?: string | null
    } | null

    if (!data?.cityId) {
      return {
        cityName: '',
        districtName: '',
        addressLine: typeof data?.address === 'string' ? data.address : '',
        addressUpdatedAt:
          typeof data?.updatedAt === 'string' ? data.updatedAt : null,
      }
    }

    const [citiesResponse, districtsResponse] = await Promise.all([
      fetch(`${apiBase}/api/cities`),
      data.districtId
        ? fetch(`${apiBase}/api/cities/${data.cityId}/districts`)
        : Promise.resolve(null),
    ])

    let resolvedCityName = ''
    let resolvedDistrictName = ''

    if (citiesResponse.ok) {
      const cities = (await citiesResponse.json().catch(() => [])) as Array<{
        id: number
        name: string
      }>
      resolvedCityName = cities.find((item) => item.id === data.cityId)?.name ?? ''
    }

    if (districtsResponse?.ok && data.districtId) {
      const districts = (await districtsResponse.json().catch(() => [])) as Array<{
        id: number
        name: string
      }>
      resolvedDistrictName =
        districts.find((item) => item.id === data.districtId)?.name ?? ''
    }

    return {
      cityName: resolvedCityName,
      districtName: resolvedDistrictName,
      addressLine: typeof data.address === 'string' ? data.address : '',
      addressUpdatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    }
  }, [apiBase, userId])

  const fetchLocation = useCallback(async () => {
    const response = await fetch(
      `${apiBase}/api/location?userId=${encodeURIComponent(userId)}`
    )
    if (response.status === 404) {
      return null
    }
    if (!response.ok) {
      throw new Error('Load location failed')
    }
    const data = (await response.json().catch(() => null)) as UserLocation | null
    return data ?? null
  }, [apiBase, userId])

  const refreshSummary = useCallback(
    async (isCancelled?: () => boolean) => {
      setTrustError('')
      const [requestsResult, bookingsResult, trustResult] =
        await Promise.allSettled([fetchRequests(), fetchBookings(), fetchTrust()])

      if (isCancelled?.()) return false

      if (requestsResult.status === 'fulfilled') {
        setRequests(requestsResult.value)
      }
      if (bookingsResult.status === 'fulfilled') {
        setBookings(bookingsResult.value)
      }
      if (trustResult.status === 'fulfilled') {
        setTrust(trustResult.value)
        setTrustError('')
      } else {
        setTrustError('Не удалось загрузить добросовестность.')
      }

      const nextError = [
        requestsResult.status === 'rejected' ? 'Не удалось загрузить заявки.' : '',
        bookingsResult.status === 'rejected' ? 'Не удалось загрузить записи.' : '',
      ]
        .filter(Boolean)
        .join(' ')

      setLoadError(nextError)

      const hasSuccess =
        requestsResult.status === 'fulfilled' ||
        bookingsResult.status === 'fulfilled' ||
        trustResult.status === 'fulfilled'

      if (hasSuccess) {
        setLastUpdated(new Date())
      }

      return hasSuccess
    },
    [fetchBookings, fetchRequests, fetchTrust]
  )

  const refreshMeta = useCallback(
    async (isCancelled?: () => boolean) => {
      const [addressResult, locationResult] = await Promise.allSettled([
        fetchAddress(),
        fetchLocation(),
      ])

      if (isCancelled?.()) return false

      if (addressResult.status === 'fulfilled') {
        setCityName(addressResult.value.cityName)
        setDistrictName(addressResult.value.districtName)
        setAddressLine(addressResult.value.addressLine)
        setAddressUpdatedAt(addressResult.value.addressUpdatedAt)
      }

      if (locationResult.status === 'fulfilled') {
        setLocation(locationResult.value)
      }

      const nextError = [
        addressResult.status === 'rejected' ? 'Не удалось загрузить адрес.' : '',
        locationResult.status === 'rejected' ? 'Не удалось загрузить геолокацию.' : '',
      ]
        .filter(Boolean)
        .join(' ')

      setMetaError(nextError)

      return (
        addressResult.status === 'fulfilled' || locationResult.status === 'fulfilled'
      )
    },
    [fetchAddress, fetchLocation]
  )

  useEffect(() => {
    if (!userId) return

    let cancelled = false
    const isCancelled = () => cancelled

    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      setMetaError('')
      setShareError('')
      await Promise.allSettled([refreshSummary(isCancelled), refreshMeta(isCancelled)])
      if (!isCancelled()) {
        setIsLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [refreshMeta, refreshSummary, userId])

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setLoadError('')
    setMetaError('')
    setShareError('')
    setIsErrorDetailsOpen(false)
    await Promise.allSettled([refreshSummary(), refreshMeta()])
    setIsRefreshing(false)
  }, [isRefreshing, refreshMeta, refreshSummary])

  const handleRequestLocation = useCallback(async () => {
    setShareError('')
    setIsSharing(true)
    try {
      await onRequestLocation()
      await refreshMeta()
    } catch {
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
    } catch {
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
      } catch {
        setShareError('Не удалось обновить настройки приватности.')
      } finally {
        setIsSharing(false)
      }
    },
    [apiBase, location, refreshMeta, userId]
  )

  const handleTabChange = useCallback((tab: ProfileTabId) => {
    setActiveTab(tab)
    if (typeof window === 'undefined') return
    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    document
      .getElementById('client-profile-panel')
      ?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' })
  }, [])

  const openRequests = useMemo(
    () => requests.filter((request) => request.status === 'open'),
    [requests]
  )

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
    return [...bookings]
      .sort(
        (a, b) =>
          new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      )
      .slice(0, 4)
  }, [bookings])

  const recentRequests = useMemo(() => {
    return [...openRequests]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4)
  }, [openRequests])

  const focusItems = useMemo(
    () =>
      [
        {
          id: 'responses',
          count: responseCount,
          title: 'Новые отклики',
          subtitle: 'Нужен ответ мастеру',
          tone: 'accent',
          onClick: () => onViewRequests('requests'),
        },
        {
          id: 'offers',
          count: priceOfferCount,
          title: 'Предложения цены',
          subtitle: 'Проверьте условия',
          tone: 'warning',
          onClick: () => onViewRequests('bookings'),
        },
        {
          id: 'pending',
          count: pendingBookingCount,
          title: 'Ожидают подтверждения',
          subtitle: 'Завершите запись',
          tone: 'neutral',
          onClick: () => onViewRequests('bookings'),
        },
      ].filter((item) => item.count > 0),
    [onViewRequests, pendingBookingCount, priceOfferCount, responseCount]
  )

  const focusTotal = useMemo(
    () => focusItems.reduce((total, item) => total + item.count, 0),
    [focusItems]
  )

  const nextBookingStatusLabel = nextBooking
    ? bookingStatusLabelMap[nextBooking.status] ?? ''
    : ''
  const nextBookingTone = nextBooking
    ? bookingStatusToneMap[nextBooking.status] ?? 'muted'
    : 'muted'

  const locationLabel = buildLocationLabel(cityName, districtName)
  const locationMetaItems = formatLocationMeta(location)
  const locationStatusLabel = location ? 'Геолокация включена' : 'Геолокация выключена'
  const addressLabel = addressLine.trim() || 'Адрес не указан'
  const addressMeta = addressUpdatedAt
    ? `Обновлено ${formatShortDate(addressUpdatedAt)}`
    : ''
  const locationShareLabel = !location
    ? 'Геолокация не задана'
    : location.shareToMasters === false
      ? 'Расстояние скрыто'
      : 'Мастера видят только расстояние'

  const profileChecklist = useMemo(
    () => [
      {
        id: 'address',
        label: 'Город и район',
        done: Boolean(cityName && districtName),
        actionLabel: 'Заполнить',
        onAction: onEditAddress,
      },
      {
        id: 'location',
        label: 'Геолокация',
        done: Boolean(location),
        actionLabel: 'Включить',
        onAction: handleRequestLocation,
      },
      {
        id: 'request',
        label: 'Первая заявка',
        done: requests.length > 0,
        actionLabel: 'Создать',
        onAction: onCreateRequest,
      },
      {
        id: 'booking',
        label: 'Первая запись',
        done: bookings.length > 0,
        actionLabel: 'Найти мастера',
        onAction: onViewMasters,
      },
      {
        id: 'favorite',
        label: 'Избранные мастера',
        done: favorites.length > 0,
        actionLabel: 'Открыть витрину',
        onAction: onViewMasters,
      },
    ],
    [
      bookings.length,
      cityName,
      districtName,
      favorites.length,
      handleRequestLocation,
      location,
      onCreateRequest,
      onEditAddress,
      onViewMasters,
      requests.length,
    ]
  )

  const completedSteps = profileChecklist.filter((item) => item.done).length
  const completionPercent = Math.round(
    (completedSteps / profileChecklist.length) * 100
  )
  const remainingSteps = Math.max(profileChecklist.length - completedSteps, 0)
  const isProfileComplete = completionPercent >= 100
  const nextSteps = profileChecklist.filter((item) => !item.done).slice(0, 3)

  const trustTips = useMemo(() => buildTrustTips(trust), [trust])
  const primaryFocusItem = focusItems[0] ?? null
  const focusItemsPreview = focusItems.slice(0, 2)
  const hiddenFocusItemsCount = Math.max(focusItems.length - focusItemsPreview.length, 0)
  const hiddenRoadmapItemsCount = Math.max(nextSteps.length - 1, 0)

  const showSkeleton = isLoading && requests.length === 0 && bookings.length === 0
  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : ''
  const updatedLabel = isRefreshing
    ? 'Обновляем...'
    : lastUpdatedLabel
      ? `Обновлено в ${lastUpdatedLabel}`
      : ''

  const errorParts = [loadError, metaError, shareError].filter(Boolean)
  const hasSyncIssues = errorParts.length > 0
  const errorSummary =
    errorParts.length <= 1 ? (errorParts[0] ?? '') : 'Часть данных не синхронизировалась'

  useEffect(() => {
    if (!hasSyncIssues) {
      setIsErrorDetailsOpen(false)
    }
  }, [hasSyncIssues])

  return (
    <div className="screen screen--client screen--client-profile cp26-screen">
      <div className="client-shell cp26-shell">
        {hasSyncIssues && (
          <div className={`cp26-alert${isErrorDetailsOpen ? ' is-expanded' : ''}`} role="alert">
            <div className="cp26-alert-main">
              <span className="cp26-alert-dot" aria-hidden="true" />
              <span className="cp26-alert-summary">
                {errorSummary.length > 52 ? `${errorSummary.slice(0, 52)}...` : errorSummary}
              </span>
            </div>
            <div className="cp26-alert-actions">
              <button type="button" onClick={handleRefresh}>
                Обновить
              </button>
              {errorParts.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIsErrorDetailsOpen((current) => !current)}
                  aria-expanded={isErrorDetailsOpen}
                >
                  {isErrorDetailsOpen ? 'Скрыть' : 'Детали'}
                </button>
              )}
            </div>
            {isErrorDetailsOpen && (
              <div className="cp26-alert-details">
                {errorParts.map((item, index) => (
                  <span key={`${item}-${index}`}>{item}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <section className="cp26-hero animate delay-1">
          <div className="cp26-hero-top">
            <div className="cp26-avatar" aria-hidden="true">
              {initials}
            </div>
            <div className="cp26-hero-main">
              <div className="cp26-identity-row">
                <h2 className="cp26-name">{displayName}</h2>
                <button
                  className={`cp26-icon-btn${isRefreshing ? ' is-loading' : ''}`}
                  type="button"
                  onClick={handleRefresh}
                  aria-label="Обновить данные"
                  disabled={isRefreshing}
                >
                  <IconRefresh />
                </button>
              </div>
              <div className="cp26-status-row">
                <span className={`cp26-status-pill${isProfileComplete ? ' is-ready' : ''}`}>
                  {isProfileComplete
                    ? 'Профиль готов'
                    : `Прогресс ${completionPercent}%`}
                </span>
                <span className="cp26-subline">{locationLabel}</span>
              </div>
              <div className="cp26-meta-row">
                <span className="cp26-meta-chip">Профиль клиента</span>
                {updatedLabel && (
                  <span className={`cp26-meta-chip${isRefreshing ? ' is-loading' : ''}`}>
                    {updatedLabel}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="cp26-actions-main">
            <button
              className="cp26-btn cp26-btn--primary"
              type="button"
              onClick={onCreateRequest}
            >
              Создать заявку
            </button>
            <button
              className="cp26-btn cp26-btn--secondary"
              type="button"
              onClick={onViewMasters}
            >
              Найти мастера
            </button>
          </div>

          <div className="cp26-quick-row">
            <button className="cp26-quick-pill" type="button" onClick={onEditAddress}>
              Город и район
            </button>
            <button className="cp26-quick-pill" type="button" onClick={onOpenSupport}>
              Поддержка
            </button>
          </div>

          <div className="cp26-metric-row">
            <button
              className="cp26-metric-pill"
              type="button"
              onClick={() => handleTabChange('activity')}
            >
              <span className="cp26-metric-value">{openRequests.length}</span>
              <span className="cp26-metric-label">заявки</span>
            </button>
            <button
              className="cp26-metric-pill"
              type="button"
              onClick={() => handleTabChange('activity')}
            >
              <span className="cp26-metric-value">{upcomingBookings.length}</span>
              <span className="cp26-metric-label">записи</span>
            </button>
            <button
              className="cp26-metric-pill"
              type="button"
              onClick={() => handleTabChange('activity')}
            >
              <span className="cp26-metric-value">{focusTotal}</span>
              <span className="cp26-metric-label">фокус</span>
            </button>
            <button
              className="cp26-metric-pill"
              type="button"
              onClick={() => handleTabChange('favorites')}
            >
              <span className="cp26-metric-value">{favorites.length}</span>
              <span className="cp26-metric-label">избранное</span>
            </button>
          </div>

          <button
            className={`cp26-next-action${primaryFocusItem ? '' : ' is-calm'}`}
            type="button"
            onClick={primaryFocusItem ? primaryFocusItem.onClick : onCreateRequest}
          >
            <span className="cp26-next-copy">
              <span className="cp26-next-title">
                {primaryFocusItem ? primaryFocusItem.title : 'Срочных задач нет'}
              </span>
              <span className="cp26-next-subtitle">
                {primaryFocusItem
                  ? `${primaryFocusItem.count} • ${primaryFocusItem.subtitle}`
                  : 'Создайте новую заявку или выберите мастера'}
              </span>
            </span>
            <span className="cp26-next-cta" aria-hidden="true">
              {primaryFocusItem ? 'Открыть' : 'Старт'}
            </span>
          </button>
        </section>

        <div className="cp26-tabs" role="tablist" aria-label="Разделы профиля клиента">
          {profileTabs.map((tab) => (
            <button
              className={`cp26-tab${activeTab === tab.id ? ' is-active' : ''}`}
              key={tab.id}
              id={`cp26-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="client-profile-panel"
              type="button"
              onClick={() => handleTabChange(tab.id)}
            >
              <span>{tab.label}</span>
              {tab.id === 'activity' && focusTotal > 0 && (
                <span className="cp26-tab-count">{focusTotal}</span>
              )}
            </button>
          ))}
        </div>

        {showSkeleton ? (
          <div className="cp26-skeleton" aria-hidden="true">
            <div className="cp26-skeleton-card" />
            <div className="cp26-skeleton-card" />
            <div className="cp26-skeleton-row">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : (
          <div
            id="client-profile-panel"
            className="cp26-panel animate"
            role="tabpanel"
            aria-labelledby={`cp26-tab-${activeTab}`}
            key={activeTab}
          >
            {activeTab === 'overview' && (
              <>
                <section className="cp26-card animate delay-1">
                  <div className="cp26-card-head">
                    <h3>Фокус на сегодня</h3>
                    {focusTotal > 0 && (
                      <span className="cp26-pill">
                        {formatCount(focusTotal, 'задача', 'задачи', 'задач')}
                      </span>
                    )}
                  </div>
                  {focusItems.length > 0 ? (
                    <>
                      <div className="cp26-focus-list" role="list">
                        {focusItemsPreview.map((item) => (
                          <button
                            className={`cp26-focus-item is-${item.tone}`}
                            type="button"
                            key={item.id}
                            onClick={item.onClick}
                            role="listitem"
                          >
                            <span className="cp26-focus-count">{item.count}</span>
                            <span className="cp26-focus-copy">
                              <span className="cp26-focus-title">{item.title}</span>
                              <span className="cp26-focus-subtitle">{item.subtitle}</span>
                            </span>
                            <span className="cp26-arrow" aria-hidden="true">
                              →
                            </span>
                          </button>
                        ))}
                      </div>
                      {hiddenFocusItemsCount > 0 && (
                        <button
                          className="cp26-inline-link"
                          type="button"
                          onClick={() => handleTabChange('activity')}
                        >
                          Еще {hiddenFocusItemsCount}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="cp26-empty">
                      <p>Срочных задач нет. Можно планировать следующую запись.</p>
                    </div>
                  )}
                </section>

                <section className="cp26-card animate delay-2">
                  <div className="cp26-card-head">
                    <h3>Путь профиля</h3>
                    <span className="cp26-pill is-progress">
                      {completedSteps}/{profileChecklist.length}
                    </span>
                  </div>
                  <div className="cp26-progress-track" aria-hidden="true">
                    <span style={{ width: `${completionPercent}%` }} />
                  </div>
                  {remainingSteps > 0 ? (
                    <>
                      <div className="cp26-step-list">
                        {(isRoadmapExpanded ? nextSteps : nextSteps.slice(0, 1)).map(
                          (item) => (
                            <div className="cp26-step" key={item.id}>
                              <span className="cp26-step-label">{item.label}</span>
                              <button type="button" onClick={item.onAction}>
                                {item.actionLabel}
                              </button>
                            </div>
                          )
                        )}
                      </div>
                      {hiddenRoadmapItemsCount > 0 && (
                        <button
                          className="cp26-inline-link"
                          type="button"
                          onClick={() => setIsRoadmapExpanded((current) => !current)}
                          aria-expanded={isRoadmapExpanded}
                        >
                          {isRoadmapExpanded
                            ? 'Скрыть лишние шаги'
                            : `Еще ${hiddenRoadmapItemsCount}`}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="cp26-empty is-compact">
                      <p>Профиль полностью готов к быстрому бронированию.</p>
                      <button
                        className="cp26-btn cp26-btn--ghost"
                        type="button"
                        onClick={() => handleTabChange('location')}
                      >
                        Проверить приватность
                      </button>
                    </div>
                  )}
                </section>

                <section className="cp26-card animate delay-3">
                  <div className="cp26-card-head">
                    <h3>Ближайшая запись</h3>
                    <button type="button" onClick={() => onViewRequests('bookings')}>
                      Все
                    </button>
                  </div>
                  {nextBooking ? (
                    <button
                      className="cp26-booking-main"
                      type="button"
                      onClick={() => onViewRequests('bookings')}
                    >
                      <span className="cp26-booking-copy">
                        <span className="cp26-booking-title">
                          {nextBooking.serviceName || 'Услуга'}
                        </span>
                        <span className="cp26-booking-meta">
                          {nextBooking.masterName || 'Мастер'}
                          {nextBooking.scheduledAt
                            ? ` • ${formatDateTime(nextBooking.scheduledAt)}`
                            : ''}
                        </span>
                      </span>
                      <span className={`cp26-chip ${getBadgeTone(nextBookingTone)}`}>
                        {nextBookingStatusLabel}
                      </span>
                    </button>
                  ) : (
                    <div className="cp26-empty">
                      <p>Активных записей пока нет.</p>
                      <div className="cp26-empty-actions">
                        <button
                          className="cp26-btn cp26-btn--primary"
                          type="button"
                          onClick={onViewMasters}
                        >
                          Найти мастера
                        </button>
                        <button
                          className="cp26-btn cp26-btn--ghost"
                          type="button"
                          onClick={onCreateRequest}
                        >
                          Создать заявку
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                <section className="animate delay-3">
                  <div className="cp26-card-head cp26-card-head--plain">
                    <h3>Добросовестность</h3>
                  </div>
                  {trustError ? (
                    <div className="cp26-card cp26-inline-error" role="alert">
                      Не удалось загрузить шкалу добросовестности.
                    </div>
                  ) : (
                    <TrustMeter trust={trust} tips={trustTips} />
                  )}
                </section>
              </>
            )}

            {activeTab === 'activity' && (
              <>
                <section className="cp26-card animate delay-1">
                  <div className="cp26-card-head">
                    <h3>Активные заявки</h3>
                    <button type="button" onClick={() => onViewRequests('requests')}>
                      Все
                    </button>
                  </div>
                  {recentRequests.length > 0 ? (
                    <div className="cp26-list" role="list">
                      {recentRequests.map((request) => (
                        <button
                          className="cp26-list-item"
                          type="button"
                          key={request.id}
                          onClick={() => onViewRequests('requests')}
                          role="listitem"
                        >
                          <span className="cp26-list-copy">
                            <span className="cp26-list-title">
                              {request.serviceName || 'Услуга'}
                            </span>
                            <span className="cp26-list-meta">
                              {getCategoryLabel(request.categoryId)}
                              {request.createdAt
                                ? ` • ${formatShortDate(request.createdAt)}`
                                : ''}
                            </span>
                          </span>
                          <span
                            className={`cp26-chip ${(request.responsesCount ?? 0) > 0 ? 'is-warning' : 'is-muted'}`}
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
                    <div className="cp26-empty">
                      <p>Открытых заявок нет.</p>
                      <button
                        className="cp26-btn cp26-btn--primary"
                        type="button"
                        onClick={onCreateRequest}
                      >
                        Создать заявку
                      </button>
                    </div>
                  )}
                </section>

                <section className="cp26-card animate delay-2">
                  <div className="cp26-card-head">
                    <h3>Последние записи</h3>
                    <button type="button" onClick={() => onViewRequests('bookings')}>
                      Все
                    </button>
                  </div>
                  {recentBookings.length > 0 ? (
                    <div className="cp26-list" role="list">
                      {recentBookings.map((booking) => {
                        const bookingStatus =
                          bookingStatusLabelMap[booking.status] ?? booking.status
                        const bookingTone = bookingStatusToneMap[booking.status] ?? 'muted'

                        return (
                          <button
                            className="cp26-list-item"
                            type="button"
                            key={booking.id}
                            onClick={() =>
                              onCreateBooking({
                                masterId: booking.masterId,
                                categoryId: booking.categoryId,
                                serviceName: booking.serviceName,
                                locationType: booking.locationType,
                                details: booking.comment ?? null,
                                photoUrls: booking.photoUrls,
                              })
                            }
                            role="listitem"
                          >
                            <span className="cp26-list-copy">
                              <span className="cp26-list-title">
                                {booking.serviceName || 'Услуга'}
                              </span>
                              <span className="cp26-list-meta">
                                {booking.masterName || 'Мастер'}
                                {booking.scheduledAt
                                  ? ` • ${formatShortDate(booking.scheduledAt)}`
                                  : ''}
                              </span>
                            </span>
                            <span className={`cp26-chip ${getBadgeTone(bookingTone)}`}>
                              {bookingStatus}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="cp26-empty">
                      <p>История появится после первой записи.</p>
                      <button
                        className="cp26-btn cp26-btn--ghost"
                        type="button"
                        onClick={onViewMasters}
                      >
                        Найти мастера
                      </button>
                    </div>
                  )}
                </section>
              </>
            )}

            {activeTab === 'location' && (
              <section className="cp26-card animate delay-1">
                <div className="cp26-card-head">
                  <h3>Локация и приватность</h3>
                  <button type="button" onClick={onEditAddress}>
                    Изменить
                  </button>
                </div>

                <div className="cp26-location-main">
                  <div className="cp26-location-icon" aria-hidden="true">
                    <IconPin />
                  </div>
                  <div className="cp26-location-copy">
                    <span className="cp26-location-title">{locationLabel}</span>
                    <span className="cp26-location-address">{addressLabel}</span>
                    {addressMeta && <span className="cp26-location-meta">{addressMeta}</span>}
                  </div>
                </div>

                <div className="cp26-location-state">
                  <span className={`cp26-pill${location ? ' is-success' : ''}`}>
                    {locationStatusLabel}
                  </span>
                  <span className="cp26-location-help">{locationShareLabel}</span>
                </div>

                {locationMetaItems.length > 0 && (
                  <div className="cp26-meta-chips">
                    {locationMetaItems.map((item, index) => (
                      <span key={`${item}-${index}`} className="cp26-meta-chip">
                        {item}
                      </span>
                    ))}
                  </div>
                )}

                <div className="cp26-location-controls">
                  <button
                    className={`cp26-toggle${location?.shareToMasters === false ? '' : ' is-active'}`}
                    type="button"
                    onClick={() => handleShareToggle(location?.shareToMasters === false)}
                    disabled={!location || isSharing}
                    aria-pressed={location?.shareToMasters !== false}
                  >
                    {location?.shareToMasters === false
                      ? 'Расстояние скрыто'
                      : 'Расстояние видно'}
                  </button>
                </div>

                <div className="cp26-location-actions">
                  <button
                    className="cp26-btn cp26-btn--primary"
                    type="button"
                    onClick={handleRequestLocation}
                    disabled={isSharing}
                  >
                    {location ? 'Обновить геолокацию' : 'Поделиться геолокацией'}
                  </button>
                  {location && (
                    <button
                      className="cp26-btn cp26-btn--ghost"
                      type="button"
                      onClick={handleClearLocation}
                      disabled={isSharing}
                    >
                      Удалить геолокацию
                    </button>
                  )}
                </div>
              </section>
            )}

            {activeTab === 'favorites' && (
              <section className="cp26-card animate delay-1">
                <div className="cp26-card-head">
                  <h3>Сохраненные мастера</h3>
                  <button type="button" onClick={onViewMasters}>
                    Витрина
                  </button>
                </div>

                {favorites.length > 0 ? (
                  <div className="cp26-favorites" role="list">
                    {favorites.map((favorite) => {
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
                          className="cp26-favorite"
                          type="button"
                          key={favorite.masterId}
                          onClick={() => onViewMasterProfile(favorite.masterId)}
                          role="listitem"
                        >
                          <span className="cp26-favorite-avatar" aria-hidden="true">
                            {favorite.avatarUrl ? (
                              <img src={favorite.avatarUrl} alt="" loading="lazy" />
                            ) : (
                              <span>{getInitials(favorite.displayName)}</span>
                            )}
                          </span>
                          <span className="cp26-favorite-copy">
                            <span className="cp26-favorite-head">
                              <span className="cp26-favorite-name">{favorite.displayName}</span>
                              <span className="cp26-favorite-rating">{ratingLabel}</span>
                            </span>
                            <span className="cp26-favorite-meta">
                              {categoryLabels.join(' • ') || 'Категории не указаны'}
                            </span>
                            <span className="cp26-favorite-meta">
                              {locationLine || 'Локация не указана'}
                            </span>
                          </span>
                          <span className="cp26-arrow" aria-hidden="true">
                            →
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="cp26-empty">
                    <p>Пока нет сохраненных мастеров.</p>
                    <button
                      className="cp26-btn cp26-btn--primary"
                      type="button"
                      onClick={onViewMasters}
                    >
                      Открыть витрину
                    </button>
                  </div>
                )}
              </section>
            )}

            {(activeTab === 'overview' || activeTab === 'activity') && (
              <section className="cp26-card cp26-card--compact animate delay-4">
                <div className="cp26-card-head">
                  <h3>Быстрые переходы</h3>
                </div>
                <div className="cp26-shortcuts">
                  <button type="button" onClick={() => onViewRequests('requests')}>
                    <IconList />
                    <span>Заявки</span>
                  </button>
                  <button type="button" onClick={() => onViewRequests('bookings')}>
                    <IconClock />
                    <span>Записи</span>
                  </button>
                  <button type="button" onClick={() => handleTabChange('favorites')}>
                    <IconStar />
                    <span>Избранное</span>
                  </button>
                  <button type="button" onClick={() => handleTabChange('location')}>
                    <IconPin />
                    <span>Локация</span>
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <ClientBottomNav
        active="profile"
        onHome={onViewHome}
        onChats={onViewChats}
        onRequests={() => onViewRequests()}
        onProfile={() => {}}
      />
    </div>
  )
}
