import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClientBottomNav } from '../components/ClientBottomNav'
import { IconBell, IconLogout, IconPin } from '../components/icons'
import type { Booking, ServiceRequest, UserLocation } from '../types/app'

type ClientSettingsScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  favoritesCount: number
  onBack: () => void
  onViewHome: () => void
  onViewChats: () => void
  onViewRequests: (tab?: 'requests' | 'bookings') => void
  onEditAddress: () => void
  onOpenSupport: () => void
  onRequestLocation: () => Promise<void>
  onClearLocation: () => Promise<void>
  onLogout: () => void
  accountLinkLabel: string
  accountLinkStatusLabel: string
  accountLinkHint?: string
  isAccountLinkDisabled?: boolean
  isAccountLinkPending?: boolean
  onStartAccountLink: () => void
}

type SettingsPrefs = {
  notifyChats: boolean
  notifyOffers: boolean
  remindBooking: boolean
  haptics: boolean
}

type ToggleItem = {
  id: keyof SettingsPrefs
  label: string
  hint: string
}

const PREFS_KEY = 'kiven-client-settings-v1'

const defaultPrefs: SettingsPrefs = {
  notifyChats: true,
  notifyOffers: true,
  remindBooking: true,
  haptics: true,
}

const upcomingBookingStatuses = new Set<Booking['status']>([
  'pending',
  'price_pending',
  'price_proposed',
  'confirmed',
])

const toggleItems: ToggleItem[] = [
  {
    id: 'notifyChats',
    label: 'Сообщения и чаты',
    hint: 'Ответы мастеров и новые сообщения',
  },
  {
    id: 'notifyOffers',
    label: 'Цены и предложения',
    hint: 'Когда мастер прислал условия записи',
  },
  {
    id: 'remindBooking',
    label: 'Напоминания о записи',
    hint: 'Перед визитом и при изменениях',
  },
  {
    id: 'haptics',
    label: 'Тактильный отклик',
    hint: 'Легкая вибрация на важных действиях',
  },
]

const loadPrefs = (): SettingsPrefs => {
  if (typeof window === 'undefined') return defaultPrefs
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return defaultPrefs
    const parsed = JSON.parse(raw) as Partial<SettingsPrefs>
    return {
      notifyChats: parsed.notifyChats ?? defaultPrefs.notifyChats,
      notifyOffers: parsed.notifyOffers ?? defaultPrefs.notifyOffers,
      remindBooking: parsed.remindBooking ?? defaultPrefs.remindBooking,
      haptics: parsed.haptics ?? defaultPrefs.haptics,
    }
  } catch {
    return defaultPrefs
  }
}

const savePrefs = (value: SettingsPrefs) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(value))
  } catch {
    // ignore
  }
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

export const ClientSettingsScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  favoritesCount,
  onBack,
  onViewHome,
  onViewChats,
  onViewRequests,
  onEditAddress,
  onOpenSupport,
  onRequestLocation,
  onClearLocation,
  onLogout,
  accountLinkLabel,
  accountLinkStatusLabel,
  accountLinkHint = '',
  isAccountLinkDisabled = false,
  isAccountLinkPending = false,
  onStartAccountLink,
}: ClientSettingsScreenProps) => {
  const [prefs, setPrefs] = useState<SettingsPrefs>(() => loadPrefs())
  const [requestsCount, setRequestsCount] = useState(0)
  const [bookingsCount, setBookingsCount] = useState(0)
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [cityName, setCityName] = useState('')
  const [districtName, setDistrictName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [shareError, setShareError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const displayName = displayNameFallback.trim() || 'Клиент'
  const initials = getInitials(displayName)

  useEffect(() => {
    savePrefs(prefs)
  }, [prefs])

  const fetchAddress = useCallback(async () => {
    const response = await fetch(
      `${apiBase}/api/address?userId=${encodeURIComponent(userId)}`
    )
    if (response.status === 404) {
      return { cityName: '', districtName: '' }
    }
    if (!response.ok) {
      throw new Error('Load address failed')
    }
    const data = (await response.json().catch(() => null)) as {
      cityId?: number | null
      districtId?: number | null
    } | null

    if (!data?.cityId) {
      return { cityName: '', districtName: '' }
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
      resolvedCityName = cities.find((city) => city.id === data.cityId)?.name ?? ''
    }

    if (districtsResponse?.ok && data.districtId) {
      const districts = (await districtsResponse.json().catch(() => [])) as Array<{
        id: number
        name: string
      }>
      resolvedDistrictName =
        districts.find((district) => district.id === data.districtId)?.name ?? ''
    }

    return { cityName: resolvedCityName, districtName: resolvedDistrictName }
  }, [apiBase, userId])

  const fetchLocation = useCallback(async () => {
    const response = await fetch(
      `${apiBase}/api/location?userId=${encodeURIComponent(userId)}`
    )
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error('Load location failed')
    }
    const data = (await response.json().catch(() => null)) as UserLocation | null
    return data ?? null
  }, [apiBase, userId])

  const fetchOverview = useCallback(async () => {
    const [requestsResponse, bookingsResponse] = await Promise.all([
      fetch(`${apiBase}/api/requests?userId=${encodeURIComponent(userId)}`),
      fetch(`${apiBase}/api/bookings?userId=${encodeURIComponent(userId)}`),
    ])
    if (!requestsResponse.ok || !bookingsResponse.ok) {
      throw new Error('Load overview failed')
    }

    const requestsData = (await requestsResponse.json().catch(() => null)) as
      | ServiceRequest[]
      | { requests?: ServiceRequest[] }
      | null
    const bookingsData = (await bookingsResponse.json().catch(() => null)) as
      | Booking[]
      | null

    const requests = Array.isArray(requestsData)
      ? requestsData
      : requestsData?.requests ?? []
    const bookings = Array.isArray(bookingsData) ? bookingsData : []
    const now = Date.now()

    setRequestsCount(requests.filter((item) => item.status === 'open').length)
    setBookingsCount(
      bookings.filter((booking) => {
        if (!upcomingBookingStatuses.has(booking.status)) return false
        const scheduledAt = new Date(booking.scheduledAt)
        if (Number.isNaN(scheduledAt.getTime())) return false
        return scheduledAt.getTime() >= now
      }).length
    )
  }, [apiBase, userId])

  const refreshAll = useCallback(async () => {
    setLoadError('')
    setShareError('')
    const [addressResult, locationResult, overviewResult] = await Promise.allSettled([
      fetchAddress(),
      fetchLocation(),
      fetchOverview(),
    ])

    if (addressResult.status === 'fulfilled') {
      setCityName(addressResult.value.cityName)
      setDistrictName(addressResult.value.districtName)
    }

    if (locationResult.status === 'fulfilled') {
      setLocation(locationResult.value)
    }

    const nextError = [
      addressResult.status === 'rejected' ? 'Не загрузился адрес.' : '',
      locationResult.status === 'rejected' ? 'Не загрузилась геолокация.' : '',
      overviewResult.status === 'rejected' ? 'Не загрузилась статистика.' : '',
    ]
      .filter(Boolean)
      .join(' ')

    setLoadError(nextError)
    if (addressResult.status === 'fulfilled' || locationResult.status === 'fulfilled') {
      setLastUpdated(new Date())
    }
  }, [fetchAddress, fetchLocation, fetchOverview])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      await refreshAll()
      if (!cancelled) {
        setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refreshAll, userId])

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    await refreshAll()
    setIsRefreshing(false)
  }, [isRefreshing, refreshAll])

  const handleShareToggle = useCallback(
    async (nextShareToMasters: boolean) => {
      if (!location) return
      setIsSharing(true)
      setShareError('')
      try {
        const response = await fetch(`${apiBase}/api/location/share`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, shareToMasters: nextShareToMasters }),
        })
        if (!response.ok) throw new Error('Share update failed')
        const data = (await response.json().catch(() => null)) as {
          location?: UserLocation | null
        } | null
        if (data?.location) {
          setLocation(data.location)
        } else {
          await refreshAll()
        }
      } catch {
        setShareError('Не удалось обновить приватность.')
      } finally {
        setIsSharing(false)
      }
    },
    [apiBase, location, refreshAll, userId]
  )

  const handleRequestLocation = useCallback(async () => {
    setIsSharing(true)
    setShareError('')
    try {
      await onRequestLocation()
      await refreshAll()
    } catch {
      setShareError('Не удалось обновить геолокацию.')
    } finally {
      setIsSharing(false)
    }
  }, [onRequestLocation, refreshAll])

  const handleClearLocation = useCallback(async () => {
    setIsSharing(true)
    setShareError('')
    try {
      await onClearLocation()
      await refreshAll()
    } catch {
      setShareError('Не удалось удалить геолокацию.')
    } finally {
      setIsSharing(false)
    }
  }, [onClearLocation, refreshAll])

  const handleLogout = useCallback(() => {
    onLogout()
  }, [onLogout])

  const locationLabel = buildLocationLabel(cityName, districtName)
  const locationMeta = formatLocationMeta(location)
  const locationShareLabel = !location
    ? 'Геолокация выключена'
    : location.shareToMasters === false
      ? 'Расстояние скрыто'
      : 'Мастера видят только расстояние'
  const updatedLabel = lastUpdated
    ? `Синхронизировано ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''

  const totalEnabledNotifications = useMemo(
    () =>
      Object.values({
        notifyChats: prefs.notifyChats,
        notifyOffers: prefs.notifyOffers,
        remindBooking: prefs.remindBooking,
      }).filter(Boolean).length,
    [prefs.notifyChats, prefs.notifyOffers, prefs.remindBooking]
  )

  return (
    <div className="screen screen--client screen--client-settings">
      <div className="client-shell cs26-shell">
        <header className="cs26-header">
          <div className="cs26-header-copy">
            <p className="cs26-kicker">Параметры</p>
            <h1 className="cs26-title">Настройки клиента</h1>
            {updatedLabel && <p className="cs26-updated">{updatedLabel}</p>}
          </div>
          <button
            className={`cs26-refresh${isRefreshing ? ' is-loading' : ''}`}
            type="button"
            onClick={handleRefresh}
            aria-label="Обновить данные"
            disabled={isRefreshing}
          >
            ⟳
          </button>
        </header>

        {loadError && <div className="cs26-banner">{loadError}</div>}
        {shareError && <div className="cs26-banner">{shareError}</div>}

        <section className="cs26-profile-card animate delay-1">
          <div className="cs26-profile-top">
            <div className="cs26-avatar" aria-hidden="true">
              {initials}
            </div>
            <div className="cs26-profile-copy">
              <h2>{displayName}</h2>
              <p>{locationLabel}</p>
            </div>
          </div>
          <div className="cs26-profile-stats">
            <button type="button" onClick={() => onViewRequests('requests')}>
              <strong>{requestsCount}</strong>
              <span>заявки</span>
            </button>
            <button type="button" onClick={() => onViewRequests('bookings')}>
              <strong>{bookingsCount}</strong>
              <span>записи</span>
            </button>
            <div className="cs26-profile-stat">
              <strong>{favoritesCount}</strong>
              <span>избранное</span>
            </div>
          </div>
        </section>

        <section className="cs26-card animate delay-2">
          <div className="cs26-card-head">
            <h3>
              <IconBell />
              Уведомления
            </h3>
            <span>{totalEnabledNotifications}/3</span>
          </div>
          <div className="cs26-toggle-list">
            {toggleItems.map((item) => (
              <button
                className={`cs26-toggle-item${prefs[item.id] ? ' is-active' : ''}`}
                type="button"
                key={item.id}
                onClick={() =>
                  setPrefs((current) => ({ ...current, [item.id]: !current[item.id] }))
                }
                aria-pressed={prefs[item.id]}
              >
                <span className="cs26-toggle-copy">
                  <span className="cs26-toggle-title">{item.label}</span>
                  <span className="cs26-toggle-hint">{item.hint}</span>
                </span>
                <span className="cs26-toggle-knob" aria-hidden="true">
                  <span />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="cs26-card animate delay-3">
          <div className="cs26-card-head">
            <h3>
              <IconPin />
              Локация и приватность
            </h3>
            <button type="button" onClick={onEditAddress}>
              Адрес
            </button>
          </div>
          <div className="cs26-location">
            <p className="cs26-location-main">{locationLabel}</p>
            <p className="cs26-location-sub">{locationShareLabel}</p>
            {locationMeta && <p className="cs26-location-meta">{locationMeta}</p>}
          </div>
          <div className="cs26-location-actions">
            <button
              className={`cs26-pill-toggle${location?.shareToMasters === false ? '' : ' is-active'}`}
              type="button"
              onClick={() => handleShareToggle(location?.shareToMasters === false)}
              disabled={!location || isSharing}
            >
              {location?.shareToMasters === false
                ? 'Расстояние скрыто'
                : 'Расстояние видно'}
            </button>
            <button
              className="cs26-action is-primary"
              type="button"
              onClick={handleRequestLocation}
              disabled={isSharing}
            >
              {location ? 'Обновить гео' : 'Поделиться гео'}
            </button>
            {location && (
              <button
                className="cs26-action"
                type="button"
                onClick={handleClearLocation}
                disabled={isSharing}
              >
                Удалить гео
              </button>
            )}
          </div>
        </section>

        <section className="cs26-card animate delay-4">
          <div className="cs26-card-head">
            <h3>Сервис</h3>
          </div>
          <div className="cs26-actions-grid">
            <button type="button" onClick={onEditAddress}>
              Город и район
            </button>
            <button type="button" onClick={onOpenSupport}>
              Поддержка
            </button>
            <button type="button" onClick={() => onViewRequests('bookings')}>
              Мои записи
            </button>
            <button type="button" onClick={() => onViewRequests('requests')}>
              Мои заявки
            </button>
          </div>
        </section>

        <section className="cs26-card animate delay-4">
          <div className="cs26-card-head">
            <h3>
              <IconLogout />
              Аккаунт
            </h3>
            <span>Сессия</span>
          </div>
          <p className="cs26-role-note">
            После выхода откроется стартовый экран выбора роли.
          </p>
          <div className="cs26-role-actions">
            <button
              className="cs26-action"
              type="button"
              onClick={onStartAccountLink}
              disabled={isAccountLinkDisabled || isAccountLinkPending}
            >
              {isAccountLinkPending ? 'Открываем...' : accountLinkLabel}
            </button>
            <button
              className="cs26-action is-primary"
              type="button"
              onClick={handleLogout}
            >
              Выйти из аккаунта
            </button>
          </div>
          <p className="cs26-role-note">
            {accountLinkStatusLabel}
            {accountLinkHint ? ` · ${accountLinkHint}` : ''}
          </p>
        </section>

        <section className="cs26-note animate delay-4">
          {isLoading ? 'Загружаем настройки...' : 'Настройки сохраняются автоматически.'}
        </section>
      </div>

      <ClientBottomNav
        active="profile"
        onHome={onViewHome}
        onChats={onViewChats}
        onRequests={() => onViewRequests()}
        onProfile={onBack}
      />
    </div>
  )
}
