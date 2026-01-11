import { useCallback, useEffect, useRef, useState } from 'react'
import { AddressScreen } from './screens/AddressScreen'
import { ClientRequestsScreen } from './screens/ClientRequestsScreen'
import { ClientScreen } from './screens/ClientScreen'
import {
  ClientShowcaseDetailScreen,
  ClientShowcaseGalleryScreen,
  ClientShowcaseScreen,
  type ShowcaseMedia,
} from './screens/ClientShowcaseScreen'
import { ClientMasterProfileScreen } from './screens/ClientMasterProfileScreen'
import { BookingScreen } from './screens/BookingScreen'
import { ProCabinetScreen } from './screens/ProCabinetScreen'
import { ProProfileScreen } from './screens/ProProfileScreen'
import { ProRequestsScreen } from './screens/ProRequestsScreen'
import { RequestScreen } from './screens/RequestScreen'
import { StartScreen } from './screens/StartScreen'
import { categoryItems } from './data/clientData'
import { isCityAvailable } from './data/cityAvailability'
import type {
  City,
  District,
  ProProfileSection,
  Role,
  UserLocation,
} from './types/app'
import { isGeoFailure, requestPreciseLocation } from './utils/geo'
import './App.css'

const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  ''
)
const getTelegramUser = () => window.Telegram?.WebApp?.initDataUnsafe?.user
type BookingReturnView =
  | 'client'
  | 'client-showcase'
  | 'client-gallery'
  | 'client-gallery-detail'
  | 'client-master-profile'

const formatGeoError = (error: unknown) => {
  if (!isGeoFailure(error)) {
    return 'Не удалось получить геолокацию.'
  }
  switch (error.code) {
    case 'unsupported':
      return 'Геолокация недоступна на вашем устройстве.'
    case 'permission_denied':
      return 'Разрешите доступ к геолокации и включите точный режим (GPS).'
    case 'position_unavailable':
      return 'Не удалось определить местоположение. Проверьте GPS и интернет.'
    case 'timeout':
      return 'Сигнал GPS слабый. Включите точный режим и попробуйте снова.'
    case 'low_accuracy': {
      const accuracy =
        typeof error.accuracy === 'number' ? Math.round(error.accuracy) : null
      return accuracy
        ? `Точность слишком низкая (${accuracy} м). Включите GPS и попробуйте снова.`
        : 'Точность слишком низкая. Включите GPS и попробуйте снова.'
    }
    case 'unknown':
    default:
      return 'Не удалось получить геолокацию.'
  }
}

function App() {
  const [view, setView] = useState<
    | 'start'
    | 'address'
    | 'client'
    | 'client-showcase'
    | 'client-gallery'
    | 'client-gallery-detail'
    | 'client-master-profile'
    | 'booking'
    | 'request'
    | 'requests'
    | 'pro-cabinet'
    | 'pro-profile'
    | 'pro-requests'
  >('start')
  const [role, setRole] = useState<Role>('client')
  const [proProfileSection, setProProfileSection] =
    useState<ProProfileSection | null>(null)
  const [address, setAddress] = useState('')
  const [telegramUser] = useState(() => getTelegramUser())
  const [userId] = useState(() => telegramUser?.id?.toString() ?? 'local-dev')
  const [cities, setCities] = useState<City[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [cityId, setCityId] = useState<number | null>(null)
  const [districtId, setDistrictId] = useState<number | null>(null)
  const [cityQuery, setCityQuery] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingAddress, setIsLoadingAddress] = useState(false)
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [isLoadingCities, setIsLoadingCities] = useState(false)
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [locationError, setLocationError] = useState('')
  const [clientCategoryId, setClientCategoryId] = useState<string | null>(null)
  const [requestCategoryId, setRequestCategoryId] = useState<string>(
    categoryItems[0]?.id ?? ''
  )
  const [clientLocation, setClientLocation] = useState<UserLocation | null>(null)
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null)
  const [selectedShowcaseItem, setSelectedShowcaseItem] =
    useState<ShowcaseMedia | null>(null)
  const [bookingMasterId, setBookingMasterId] = useState<string | null>(null)
  const [bookingPhotoUrls, setBookingPhotoUrls] = useState<string[]>([])
  const [bookingPreferredCategoryId, setBookingPreferredCategoryId] = useState<
    string | null
  >(null)
  const [bookingReturnView, setBookingReturnView] =
    useState<BookingReturnView | null>(null)
  const proProfileBackHandlerRef = useRef<(() => boolean) | null>(null)
  const clientName =
    [telegramUser?.first_name, telegramUser?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || telegramUser?.username?.trim() || ''

  const handleDistrictChange = (value: number | null) => {
    setDistrictId(value)
    if (saveError) {
      setSaveError('')
    }
  }

  const handleCityQueryChange = (value: string) => {
    const trimmedValue = value.trim()
    const matchedCity = cities.find(
      (city) => city.name.toLowerCase() === trimmedValue.toLowerCase()
    )

    setCityQuery(value)

    if (matchedCity && isCityAvailable(matchedCity.name)) {
      setCityId(matchedCity.id)
      if (matchedCity.id !== cityId) {
        setDistrictId(null)
      }
    } else {
      setCityId(null)
      setDistrictId(null)
    }
    if (saveError) {
      setSaveError('')
    }
  }

  const handleCitySelect = (city: City) => {
    if (!isCityAvailable(city.name)) {
      return
    }
    setCityId(city.id)
    setCityQuery(city.name)
    setDistrictId(null)
    if (saveError) {
      setSaveError('')
    }
  }

  const setLocationState = (location: UserLocation | null) => {
    setClientLocation(location)
  }

  const saveLocation = useCallback(
    async (location: { lat: number; lng: number; accuracy?: number | null }) => {
      if (!userId) return
      setLocationError('')

      try {
        const response = await fetch(`${apiBase}/api/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy ?? null,
            shareToMasters: true,
            shareToClients: true,
          }),
        })

        if (!response.ok) {
          throw new Error('Save location failed')
        }

        const data = (await response.json()) as {
          location?: UserLocation | null
        }
        setLocationState(data.location ?? null)
      } catch (error) {
        setLocationError('Не удалось сохранить геолокацию. Попробуйте еще раз.')
      } finally {
        setIsLocating(false)
      }
    },
    [apiBase, userId]
  )

  const handleRequestLocation = useCallback(async () => {
    if (!userId) return
    setLocationError('')
    setIsLocating(true)

    try {
      const position = await requestPreciseLocation({
        minAccuracy: 100,
        maxAccuracy: 1500,
        maxWaitMs: 20000,
        timeoutMs: 12000,
      })
      await saveLocation({
        lat: position.lat,
        lng: position.lng,
        accuracy: Math.round(position.accuracy),
      })
    } catch (error) {
      setIsLocating(false)
      setLocationError(formatGeoError(error))
    }
  }, [saveLocation, userId])

  const handleClearLocation = useCallback(async () => {
    if (!userId) return
    setLocationError('')
    setIsLocating(true)

    try {
      const response = await fetch(
        `${apiBase}/api/location?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        throw new Error('Clear location failed')
      }

      setLocationState(null)
    } catch (error) {
      setLocationError('Не удалось очистить геолокацию.')
    } finally {
      setIsLocating(false)
    }
  }, [apiBase, userId])

  const handleSaveAddress = useCallback(async () => {
    if (!cityId || !districtId) {
      setSaveError('Укажите город и район.')
      return
    }

    setIsSaving(true)
    setSaveError('')

    try {
      const response = await fetch(`${apiBase}/api/address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          cityId,
          districtId,
          address: null,
        }),
      })

      if (!response.ok) {
        throw new Error('Save failed')
      }

      setAddress('')
      setView(role === 'pro' ? 'pro-profile' : 'client')
    } catch (error) {
      setSaveError('Не удалось сохранить город и район. Попробуйте еще раз.')
    } finally {
      setIsSaving(false)
    }
  }, [cityId, districtId, role, userId])

  useEffect(() => {
    if (!telegramUser?.id) return

    const payload = {
      userId,
      firstName: telegramUser.first_name ?? null,
      lastName: telegramUser.last_name ?? null,
      username: telegramUser.username ?? null,
      languageCode: telegramUser.language_code ?? null,
    }

    const controller = new AbortController()

    fetch(`${apiBase}/api/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch(() => {})

    return () => controller.abort()
  }, [
    telegramUser?.id,
    telegramUser?.first_name,
    telegramUser?.last_name,
    telegramUser?.username,
    telegramUser?.language_code,
    userId,
  ])

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return

    webApp.ready()
    webApp.expand()
    webApp.requestFullscreen?.()
    webApp.disableVerticalSwipes?.()
    const isPro =
      view === 'pro-cabinet' || view === 'pro-profile' || view === 'pro-requests'
    const isClient =
      view === 'client' ||
      view === 'client-showcase' ||
      view === 'client-gallery' ||
      view === 'client-gallery-detail' ||
      view === 'client-master-profile' ||
      view === 'booking' ||
      view === 'request' ||
      view === 'requests' ||
      isPro
    const themeColor = isPro ? '#fff3e8' : isClient ? '#f3edf7' : '#f7f2ef'
    webApp.setHeaderColor?.(themeColor)
    webApp.setBackgroundColor?.(themeColor)
  }, [view])

  useEffect(() => {
    if (view !== 'address') return
    if (!userId) return
    let cancelled = false

    const loadCities = async () => {
      setIsLoadingCities(true)
      setSaveError('')

      try {
        const response = await fetch(`${apiBase}/api/cities`)
        if (!response.ok) {
          throw new Error('Load cities failed')
        }
        const data = (await response.json()) as City[]

        if (cancelled) return

        setCities(data)
        if (data.length === 1) {
          setCityId((current) => current ?? data[0].id)
        }
      } catch (error) {
        if (!cancelled) {
          setSaveError('Не удалось загрузить города.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCities(false)
        }
      }
    }

    const loadAddress = async () => {
      setIsLoadingAddress(true)
      setSaveError('')

      try {
        const response = await fetch(
          `${apiBase}/api/address?userId=${encodeURIComponent(userId)}`
        )

        if (response.status === 404) {
          setAddress('')
          return
        }
        if (!response.ok) {
          throw new Error('Load failed')
        }

        const data = (await response.json()) as {
          address?: string | null
          cityId?: number | null
          districtId?: number | null
        }

        if (cancelled) return

        setAddress('')
        if (typeof data.cityId === 'number') {
          setCityId(data.cityId)
        }
        if (typeof data.districtId === 'number') {
          setDistrictId(data.districtId)
        }
      } catch (error) {
        if (!cancelled) {
          setSaveError('Не удалось загрузить город и район.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAddress(false)
        }
      }
    }

    const loadLocation = async () => {
      setIsLoadingLocation(true)
      setLocationError('')

      try {
        const response = await fetch(
          `${apiBase}/api/location?userId=${encodeURIComponent(userId)}`
        )
        if (response.status === 404) {
          setLocationState(null)
          return
        }
        if (!response.ok) {
          throw new Error('Load location failed')
        }
        const data = (await response.json()) as UserLocation
        if (cancelled) return
        setLocationState(data)
      } catch (error) {
        if (!cancelled) {
          setLocationError('Не удалось загрузить геолокацию.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLocation(false)
        }
      }
    }

    loadCities()
    loadAddress()
    loadLocation()

    return () => {
      cancelled = true
    }
  }, [userId, view])

  useEffect(() => {
    if (!cityId) {
      setDistricts([])
      return
    }

    let cancelled = false
    setIsLoadingDistricts(true)
    setSaveError('')

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
          setSaveError('Не удалось загрузить районы.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDistricts(false)
        }
      }
    }

    loadDistricts()

    return () => {
      cancelled = true
    }
  }, [cityId])

  useEffect(() => {
    if (!cityId) return
    const city = cities.find((item) => item.id === cityId)
    if (!city) return
    setCityQuery((current) => (current.trim() ? current : city.name))
  }, [cities, cityId])

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return

    const root = document.documentElement
    const updateSafeArea = () => {
      const safe = webApp.safeAreaInset
      const content = webApp.contentSafeAreaInset
      root.style.setProperty('--tg-safe-top-js', `${safe?.top ?? 0}px`)
      root.style.setProperty('--tg-content-safe-top-js', `${content?.top ?? 0}px`)
    }

    updateSafeArea()
    webApp.onEvent?.('safeAreaChanged', updateSafeArea)
    webApp.onEvent?.('contentSafeAreaChanged', updateSafeArea)
    webApp.onEvent?.('viewportChanged', updateSafeArea)

    return () => {
      webApp.offEvent?.('safeAreaChanged', updateSafeArea)
      webApp.offEvent?.('contentSafeAreaChanged', updateSafeArea)
      webApp.offEvent?.('viewportChanged', updateSafeArea)
    }
  }, [])

  useEffect(() => {
    const backButton = window.Telegram?.WebApp?.BackButton
    if (!backButton) return

    const shouldShow =
      view === 'address' ||
      view === 'client-showcase' ||
      view === 'client-gallery' ||
      view === 'client-gallery-detail' ||
      view === 'client-master-profile' ||
      view === 'booking' ||
      view === 'request' ||
      view === 'requests' ||
      view === 'pro-cabinet' ||
      view === 'pro-profile' ||
      view === 'pro-requests'

    const handleBack = () => {
      switch (view) {
        case 'address':
          setView('start')
          break
        case 'request':
        case 'requests':
          setView('client')
          break
        case 'client-showcase':
        case 'client-gallery':
          setView('client')
          break
        case 'client-gallery-detail':
          setSelectedShowcaseItem(null)
          setView('client-gallery')
          break
        case 'client-master-profile':
          setSelectedMasterId(null)
          setView('client-showcase')
          break
        case 'booking':
          setBookingMasterId(null)
          setBookingPhotoUrls([])
          setBookingPreferredCategoryId(null)
          setView(bookingReturnView ?? 'client-showcase')
          setBookingReturnView(null)
          break
        case 'pro-profile':
          if (proProfileBackHandlerRef.current?.()) {
            return
          }
          setProProfileSection(null)
          setView('pro-cabinet')
          break
        case 'pro-requests':
          setView('pro-cabinet')
          break
        case 'pro-cabinet':
          setView('start')
          break
        default:
          break
      }
    }

    if (shouldShow) {
      backButton.show()
      backButton.onClick(handleBack)
    } else {
      backButton.hide()
    }

    return () => {
      backButton.offClick(handleBack)
    }
  }, [view])

  useEffect(() => {
    if (view === 'client-master-profile' && !selectedMasterId) {
      setView('client-showcase')
    }
  }, [selectedMasterId, view])

  useEffect(() => {
    if (view === 'client-gallery-detail' && !selectedShowcaseItem) {
      setView('client-gallery')
    }
  }, [selectedShowcaseItem, view])

  useEffect(() => {
    if (view === 'booking' && !bookingMasterId) {
      setBookingPreferredCategoryId(null)
      setBookingPhotoUrls([])
      setBookingReturnView(null)
      setView(bookingReturnView ?? 'client-showcase')
    }
  }, [bookingMasterId, bookingReturnView, view])

  const registerProProfileBackHandler = useCallback(
    (handler: (() => boolean) | null) => {
      proProfileBackHandlerRef.current = handler
    },
    []
  )

  const openBooking = useCallback(
    (
      masterId: string,
      options?: {
        photoUrls?: string[]
        preferredCategoryId?: string | null
        returnView?: BookingReturnView
      }
    ) => {
      setBookingMasterId(masterId)
      setBookingPhotoUrls(options?.photoUrls ?? [])
      setBookingPreferredCategoryId(options?.preferredCategoryId ?? null)
      setBookingReturnView(options?.returnView ?? 'client-showcase')
      setView('booking')
    },
    []
  )

  if (view === 'client') {
    return (
      <ClientScreen
        apiBase={apiBase}
        activeCategoryId={clientCategoryId}
        onCategoryChange={setClientCategoryId}
        onViewShowcase={() => setView('client-gallery')}
        onViewMasters={() => setView('client-showcase')}
        onCreateRequest={(categoryId) => {
          setRequestCategoryId(
            categoryId ?? clientCategoryId ?? categoryItems[0]?.id ?? ''
          )
          setView('request')
        }}
        onViewRequests={() => setView('requests')}
      />
    )
  }

  if (view === 'client-showcase') {
    return (
      <ClientShowcaseScreen
        apiBase={apiBase}
        activeCategoryId={clientCategoryId}
        onCategoryChange={setClientCategoryId}
        onBack={() => setView('client')}
        onViewRequests={() => setView('requests')}
        clientLocation={clientLocation}
        isLocating={isLocating}
        onRequestLocation={handleRequestLocation}
        locationError={locationError}
        onCreateBooking={(masterId) =>
          openBooking(masterId, {
            returnView: 'client-showcase',
            preferredCategoryId: clientCategoryId,
          })
        }
        onViewProfile={(masterId) => {
          setSelectedMasterId(masterId)
          setView('client-master-profile')
        }}
      />
    )
  }

  if (view === 'client-master-profile' && selectedMasterId) {
    return (
      <ClientMasterProfileScreen
        apiBase={apiBase}
        masterId={selectedMasterId}
        onBack={() => {
          setSelectedMasterId(null)
          setView('client-showcase')
        }}
        onViewHome={() => {
          setSelectedMasterId(null)
          setView('client')
        }}
        onViewMasters={() => {
          setSelectedMasterId(null)
          setView('client-showcase')
        }}
        onViewRequests={() => {
          setSelectedMasterId(null)
          setView('requests')
        }}
        onCreateBooking={() =>
          openBooking(selectedMasterId, {
            returnView: 'client-master-profile',
            preferredCategoryId: clientCategoryId,
          })
        }
      />
    )
  }

  if (view === 'client-gallery-detail' && selectedShowcaseItem) {
    return (
      <ClientShowcaseDetailScreen
        item={selectedShowcaseItem}
        activeCategoryId={clientCategoryId}
        onBack={() => {
          setSelectedShowcaseItem(null)
          setView('client-gallery')
        }}
        onViewHome={() => {
          setSelectedShowcaseItem(null)
          setView('client')
        }}
        onViewMasters={() => {
          setSelectedShowcaseItem(null)
          setView('client-showcase')
        }}
        onViewRequests={() => {
          setSelectedShowcaseItem(null)
          setView('requests')
        }}
        onViewProfile={(masterId) => {
          setSelectedShowcaseItem(null)
          setSelectedMasterId(masterId)
          setView('client-master-profile')
        }}
        onCreateBooking={() =>
          openBooking(selectedShowcaseItem.masterId, {
            photoUrls: [selectedShowcaseItem.url],
            preferredCategoryId:
              selectedShowcaseItem.categories[0] ?? clientCategoryId,
            returnView: 'client-gallery-detail',
          })
        }
      />
    )
  }

  if (view === 'client-gallery') {
    return (
      <ClientShowcaseGalleryScreen
        apiBase={apiBase}
        activeCategoryId={clientCategoryId}
        onCategoryChange={setClientCategoryId}
        onBack={() => setView('client')}
        onViewMasters={() => setView('client-showcase')}
        onViewRequests={() => setView('requests')}
        onViewDetail={(item) => {
          setSelectedShowcaseItem(item)
          setView('client-gallery-detail')
        }}
      />
    )
  }

  if (view === 'request') {
    const cityName = cities.find((item) => item.id === cityId)?.name ?? ''
    const districtName =
      districts.find((item) => item.id === districtId)?.name ?? ''

    return (
      <RequestScreen
        apiBase={apiBase}
        userId={userId}
        defaultCategoryId={requestCategoryId}
        cityId={cityId}
        districtId={districtId}
        cityName={cityName}
        districtName={districtName}
        address={address}
      />
    )
  }

  if (view === 'booking' && bookingMasterId) {
    const cityName = cities.find((item) => item.id === cityId)?.name ?? ''
    const districtName =
      districts.find((item) => item.id === districtId)?.name ?? ''

    return (
      <BookingScreen
        apiBase={apiBase}
        userId={userId}
        masterId={bookingMasterId}
        cityId={cityId}
        districtId={districtId}
        cityName={cityName}
        districtName={districtName}
        address={address}
        photoUrls={bookingPhotoUrls}
        preferredCategoryId={bookingPreferredCategoryId}
        onBack={() => {
          setBookingMasterId(null)
          setBookingPhotoUrls([])
          setBookingPreferredCategoryId(null)
          setView(bookingReturnView ?? 'client-showcase')
          setBookingReturnView(null)
        }}
      />
    )
  }

  if (view === 'requests') {
    return (
      <ClientRequestsScreen
        apiBase={apiBase}
        userId={userId}
        onCreateRequest={() => {
          setRequestCategoryId(clientCategoryId ?? categoryItems[0]?.id ?? '')
          setView('request')
        }}
        onViewProfile={(masterId) => {
          setSelectedMasterId(masterId)
          setView('client-master-profile')
        }}
      />
    )
  }

  if (view === 'pro-profile') {
    return (
      <ProProfileScreen
        apiBase={apiBase}
        userId={userId}
        displayNameFallback={clientName}
        onBack={() => {
          setProProfileSection(null)
          setView('pro-cabinet')
        }}
        onViewRequests={() => setView('pro-requests')}
        focusSection={proProfileSection}
        onBackHandlerChange={registerProProfileBackHandler}
      />
    )
  }

  if (view === 'pro-requests') {
    return (
      <ProRequestsScreen
        apiBase={apiBase}
        userId={userId}
        onBack={() => setView('pro-cabinet')}
        onEditProfile={(section) => {
          setProProfileSection(section ?? null)
          setView('pro-profile')
        }}
      />
    )
  }

  if (view === 'pro-cabinet') {
    return (
      <ProCabinetScreen
        apiBase={apiBase}
        userId={userId}
        displayNameFallback={clientName}
        onEditProfile={(section) => {
          setProProfileSection(section ?? null)
          setView('pro-profile')
        }}
        onViewRequests={() => setView('pro-requests')}
      />
    )
  }

  if (view === 'address') {
    return (
      <AddressScreen
        role={role}
        cities={cities}
        districts={districts}
        cityId={cityId}
        districtId={districtId}
        cityQuery={cityQuery}
        isSaving={isSaving}
        isLoading={
          isLoadingAddress ||
          isLoadingCities ||
          isLoadingDistricts ||
          isLoadingLocation
        }
        saveError={saveError}
        location={clientLocation}
        isLocating={isLocating}
        locationError={locationError}
        onCityQueryChange={handleCityQueryChange}
        onCitySelect={handleCitySelect}
        onDistrictChange={handleDistrictChange}
        onContinue={handleSaveAddress}
        onRequestLocation={handleRequestLocation}
        onClearLocation={handleClearLocation}
      />
    )
  }

  return (
    <StartScreen
      onRoleSelect={(nextRole) => {
        setRole(nextRole)
        if (nextRole === 'pro') {
          setProProfileSection(null)
        }
        setView(nextRole === 'pro' ? 'pro-profile' : 'address')
      }}
    />
  )
}

export default App
