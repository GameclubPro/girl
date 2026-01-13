import { useCallback, useEffect, useRef, useState } from 'react'
import { AddressScreen } from './screens/AddressScreen'
import { ChatListScreen } from './screens/ChatListScreen'
import { ChatThreadScreen } from './screens/ChatThreadScreen'
import { ClientRequestsScreen } from './screens/ClientRequestsScreen'
import { ClientProfileScreen } from './screens/ClientProfileScreen'
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
import { parseBookingStartParam, parseChatStartParam } from './utils/deeplink'
import {
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  type FavoriteMaster,
} from './utils/favorites'
import './App.css'

const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  ''
)
const getTelegramUser = () => window.Telegram?.WebApp?.initDataUnsafe?.user
type BookingReturnView =
  | 'client'
  | 'client-profile'
  | 'client-showcase'
  | 'client-gallery'
  | 'client-gallery-detail'
  | 'client-master-profile'
  | 'requests'

type ChatReturnView =
  | 'chats'
  | 'requests'
  | 'client'
  | 'client-profile'
  | 'pro-requests'
  | 'pro-cabinet'

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
    | 'client-profile'
    | 'client-showcase'
    | 'client-gallery'
    | 'client-gallery-detail'
    | 'client-master-profile'
    | 'chats'
    | 'chat-thread'
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
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null)
  const [bookingMasterId, setBookingMasterId] = useState<string | null>(null)
  const [bookingPhotoUrls, setBookingPhotoUrls] = useState<string[]>([])
  const [bookingPreferredCategoryId, setBookingPreferredCategoryId] = useState<
    string | null
  >(null)
  const [bookingInitialServiceName, setBookingInitialServiceName] = useState<
    string | null
  >(null)
  const [bookingInitialLocationType, setBookingInitialLocationType] = useState<
    'master' | 'client' | null
  >(null)
  const [bookingInitialDetails, setBookingInitialDetails] = useState<string | null>(
    null
  )
  const [bookingReturnView, setBookingReturnView] =
    useState<BookingReturnView | null>(null)
  const [chatReturnView, setChatReturnView] = useState<ChatReturnView | null>(
    null
  )
  const [rescheduleBookingId, setRescheduleBookingId] = useState<number | null>(
    null
  )
  const [requestsInitialTab, setRequestsInitialTab] = useState<
    'requests' | 'bookings'
  >('requests')
  const [favorites, setFavorites] = useState<FavoriteMaster[]>(() =>
    loadFavorites()
  )
  const proProfileBackHandlerRef = useRef<(() => boolean) | null>(null)
  const deepLinkHandledRef = useRef(false)
  const clientName =
    [telegramUser?.first_name, telegramUser?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || telegramUser?.username?.trim() || ''

  useEffect(() => {
    if (deepLinkHandledRef.current) return
    const webAppStart = window.Telegram?.WebApp?.initDataUnsafe?.start_param
    const searchParams = new URLSearchParams(window.location.search)
    const queryStart =
      searchParams.get('startapp') ?? searchParams.get('start') ?? null
    const queryMaster =
      searchParams.get('masterId') ?? searchParams.get('master') ?? null
    const queryChat =
      searchParams.get('chatId') ?? searchParams.get('chat') ?? null
    const rawParam = webAppStart ?? queryStart
    const decodedParam = rawParam
      ? (() => {
          try {
            return decodeURIComponent(rawParam)
          } catch (error) {
            return rawParam
          }
        })()
      : null
    const parsedChatId = parseChatStartParam(decodedParam)
    const parsedMasterId = parseBookingStartParam(decodedParam)
    const rawChatId = parsedChatId ?? queryChat?.trim() ?? null
    const parsedChatNumber = rawChatId ? Number(rawChatId) : null
    const masterId = parsedMasterId ?? queryMaster?.trim() ?? null

    if (parsedChatNumber && Number.isInteger(parsedChatNumber)) {
      deepLinkHandledRef.current = true
      setSelectedChatId(parsedChatNumber)
      setChatReturnView('chats')
      setView('chat-thread')
      return
    }

    if (!masterId) return
    deepLinkHandledRef.current = true
    setRole('client')
    setSelectedMasterId(masterId)
    setBookingMasterId(masterId)
    setBookingPhotoUrls([])
    setBookingPreferredCategoryId(null)
    setBookingReturnView('client-master-profile')
    setRescheduleBookingId(null)
    setView('booking')
  }, [])

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
          address: address.trim() || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Save failed')
      }

      setAddress(address.trim())
      setView(role === 'pro' ? 'pro-profile' : 'client')
    } catch (error) {
      setSaveError('Не удалось сохранить город и район. Попробуйте еще раз.')
    } finally {
      setIsSaving(false)
    }
  }, [address, cityId, districtId, role, userId])

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
    const themeColor = '#ffffff'
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

        setAddress(typeof data.address === 'string' ? data.address : '')
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
      view === 'chats' ||
      view === 'chat-thread' ||
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
        case 'chat-thread':
          setSelectedChatId(null)
          setView(chatReturnView ?? 'chats')
          setChatReturnView(null)
          break
        case 'chats':
          setView(role === 'pro' ? 'pro-cabinet' : 'client')
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
      setBookingInitialServiceName(null)
      setBookingInitialLocationType(null)
      setBookingInitialDetails(null)
      setBookingReturnView(null)
      setView(bookingReturnView ?? 'client-showcase')
    }
  }, [bookingMasterId, bookingReturnView, view])

  useEffect(() => {
    if (view === 'chat-thread' && !selectedChatId) {
      setView('chats')
    }
  }, [selectedChatId, view])

  useEffect(() => {
    saveFavorites(favorites)
  }, [favorites])

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
        initialServiceName?: string | null
        initialLocationType?: 'master' | 'client' | null
        initialDetails?: string | null
        returnView?: BookingReturnView
        rescheduleBookingId?: number | null
      }
    ) => {
      setBookingMasterId(masterId)
      setBookingPhotoUrls(options?.photoUrls ?? [])
      setBookingPreferredCategoryId(options?.preferredCategoryId ?? null)
      setBookingInitialServiceName(options?.initialServiceName ?? null)
      setBookingInitialLocationType(options?.initialLocationType ?? null)
      setBookingInitialDetails(options?.initialDetails ?? null)
      setBookingReturnView(options?.returnView ?? 'client-showcase')
      setRescheduleBookingId(options?.rescheduleBookingId ?? null)
      setView('booking')
    },
    []
  )

  const openRequests = useCallback((tab?: 'requests' | 'bookings') => {
    setRequestsInitialTab(tab ?? 'requests')
    setView('requests')
  }, [])

  const openChatList = useCallback(() => {
    setSelectedChatId(null)
    setChatReturnView(null)
    setView('chats')
  }, [])

  const openChatThread = useCallback(
    (chatId: number, returnView?: ChatReturnView) => {
      setSelectedChatId(chatId)
      setChatReturnView(returnView ?? 'chats')
      setView('chat-thread')
    },
    []
  )

  const syncFollowWithFavorite = useCallback(
    async (favorite: Omit<FavoriteMaster, 'savedAt'>, shouldFollow: boolean) => {
      if (!userId || !favorite.masterId) return
      const action = shouldFollow ? 'follow' : 'unfollow'

      try {
        const response = await fetch(
          `${apiBase}/api/masters/${favorite.masterId}/${action}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          }
        )
        if (!response.ok) {
          throw new Error('Follow sync failed')
        }
      } catch (error) {
        console.error(`Failed to ${action} master:`, error)
        setFavorites((current) => {
          const isFavoriteNow = current.some(
            (item) => item.masterId === favorite.masterId
          )
          if (shouldFollow) {
            if (!isFavoriteNow) return current
            return current.filter((item) => item.masterId !== favorite.masterId)
          }
          if (isFavoriteNow) return current
          const savedAt = new Date().toISOString()
          return [{ ...favorite, savedAt }, ...current]
        })
      }
    },
    [apiBase, userId]
  )

  const handleToggleFavorite = useCallback(
    (favorite: Omit<FavoriteMaster, 'savedAt'>) => {
      setFavorites((prev) => {
        const isAlreadyFavorite = prev.some(
          (item) => item.masterId === favorite.masterId
        )
        const next = toggleFavorite(prev, favorite)
        void syncFollowWithFavorite(favorite, !isAlreadyFavorite)
        return next
      })
    },
    [syncFollowWithFavorite]
  )

  const handleUpsertFavorite = useCallback(
    (favorite: Omit<FavoriteMaster, 'savedAt'>) => {
      setFavorites((prev) => {
        const existing = prev.find((item) => item.masterId === favorite.masterId)
        const savedAt = existing?.savedAt ?? new Date().toISOString()
        if (!existing) {
          return [{ ...favorite, savedAt }, ...prev]
        }
        return prev.map((item) =>
          item.masterId === favorite.masterId ? { ...favorite, savedAt } : item
        )
      })
    },
    []
  )

  const handleBookingCreated = useCallback(
    async (_payload: { id: number | null; status?: string }) => {
      if (!rescheduleBookingId) return
      try {
        const response = await fetch(`${apiBase}/api/bookings/${rescheduleBookingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, action: 'client-cancel' }),
        })
        if (!response.ok) {
          throw new Error('Cancel rescheduled booking failed')
        }
      } catch (error) {
        console.error('Failed to cancel booking after reschedule:', error)
      } finally {
        setRescheduleBookingId(null)
      }
    },
    [apiBase, rescheduleBookingId, userId]
  )

  if (view === 'client') {
    return (
      <ClientScreen
        apiBase={apiBase}
        activeCategoryId={clientCategoryId}
        onCategoryChange={setClientCategoryId}
        onViewShowcase={() => setView('client-gallery')}
        onViewMasters={() => setView('client-showcase')}
        onViewChats={openChatList}
        onCreateRequest={(categoryId) => {
          setRequestCategoryId(
            categoryId ?? clientCategoryId ?? categoryItems[0]?.id ?? ''
          )
          setView('request')
        }}
        onViewRequests={(tab) => openRequests(tab)}
        onViewProfile={() => setView('client-profile')}
      />
    )
  }

  if (view === 'client-profile') {
    return (
      <ClientProfileScreen
        apiBase={apiBase}
        userId={userId}
        displayNameFallback={clientName}
        onViewHome={() => setView('client')}
        onViewMasters={() => setView('client-showcase')}
        onViewRequests={(tab) => openRequests(tab)}
        onViewChats={openChatList}
        onCreateRequest={() => {
          setRequestCategoryId(clientCategoryId ?? categoryItems[0]?.id ?? '')
          setView('request')
        }}
        onCreateBooking={(payload) =>
          openBooking(payload.masterId, {
            photoUrls: payload.photoUrls ?? [],
            preferredCategoryId: payload.categoryId ?? null,
            initialServiceName: payload.serviceName ?? null,
            initialLocationType: payload.locationType ?? null,
            initialDetails: payload.details ?? null,
            returnView: 'client-profile',
          })
        }
        onEditAddress={() => setView('address')}
        onViewMasterProfile={(masterId) => {
          setSelectedMasterId(masterId)
          setView('client-master-profile')
        }}
        onRequestLocation={handleRequestLocation}
        onClearLocation={handleClearLocation}
        favorites={favorites}
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
        onViewRequests={(tab) => openRequests(tab)}
        onViewChats={openChatList}
        onViewClientProfile={() => setView('client-profile')}
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
          openRequests()
        }}
        onViewChats={() => {
          setSelectedMasterId(null)
          setView('chats')
        }}
        onViewProfile={() => {
          setSelectedMasterId(null)
          setView('client-profile')
        }}
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
        onUpdateFavorite={handleUpsertFavorite}
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
          openRequests()
        }}
        onViewChats={() => {
          setSelectedShowcaseItem(null)
          setView('chats')
        }}
        onViewClientProfile={() => {
          setSelectedShowcaseItem(null)
          setView('client-profile')
        }}
        onViewProfile={(masterId) => {
          setSelectedShowcaseItem(null)
          setSelectedMasterId(masterId)
          setView('client-master-profile')
        }}
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
        onUpdateFavorite={handleUpsertFavorite}
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
        onViewRequests={(tab) => openRequests(tab)}
        onViewChats={openChatList}
        onViewClientProfile={() => setView('client-profile')}
        onViewDetail={(item) => {
          setSelectedShowcaseItem(item)
          setView('client-gallery-detail')
        }}
      />
    )
  }

  if (view === 'chats') {
    return (
      <ChatListScreen
        apiBase={apiBase}
        userId={userId}
        role={role}
        onOpenChat={(chatId) => openChatThread(chatId, 'chats')}
        onViewHome={() => setView('client')}
        onViewMasters={() => setView('client-showcase')}
        onViewRequests={() =>
          role === 'pro' ? setView('pro-requests') : openRequests()
        }
        onViewProfile={() =>
          setView(role === 'pro' ? 'pro-profile' : 'client-profile')
        }
        onViewCabinet={() => setView('pro-cabinet')}
      />
    )
  }

  if (view === 'chat-thread' && selectedChatId) {
    return (
      <ChatThreadScreen
        key={selectedChatId}
        apiBase={apiBase}
        userId={userId}
        chatId={selectedChatId}
        onBack={() => {
          setSelectedChatId(null)
          setView(chatReturnView ?? 'chats')
          setChatReturnView(null)
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
        initialServiceName={bookingInitialServiceName ?? undefined}
        initialLocationType={bookingInitialLocationType ?? undefined}
        initialDetails={bookingInitialDetails ?? undefined}
        onBack={() => {
          setBookingMasterId(null)
          setBookingPhotoUrls([])
          setBookingPreferredCategoryId(null)
          setView(bookingReturnView ?? 'client-showcase')
          setBookingReturnView(null)
          setRescheduleBookingId(null)
        }}
        onBookingCreated={handleBookingCreated}
      />
    )
  }

  if (view === 'requests') {
    return (
      <ClientRequestsScreen
        apiBase={apiBase}
        userId={userId}
        initialTab={requestsInitialTab}
        onCreateRequest={() => {
          setRequestCategoryId(clientCategoryId ?? categoryItems[0]?.id ?? '')
          setView('request')
        }}
        onViewHome={() => setView('client')}
        onViewMasters={() => setView('client-showcase')}
        onViewChats={openChatList}
        onViewProfile={(masterId) => {
          setSelectedMasterId(masterId)
          setView('client-master-profile')
        }}
        onOpenChat={(chatId) => openChatThread(chatId, 'requests')}
        onRescheduleBooking={(booking) => {
          openBooking(booking.masterId, {
            photoUrls: booking.photoUrls,
            preferredCategoryId: booking.categoryId,
            initialServiceName: booking.serviceName,
            initialLocationType: booking.locationType,
            initialDetails: booking.comment ?? null,
            returnView: 'requests',
            rescheduleBookingId: booking.id,
          })
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
        onViewChats={openChatList}
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
        onViewChats={openChatList}
        onOpenChat={(chatId) => openChatThread(chatId, 'pro-requests')}
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
        onViewChats={openChatList}
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
        address={address}
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
        onAddressChange={setAddress}
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
