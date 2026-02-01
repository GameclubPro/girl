import {
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
} from 'react'
import { ScreenLoader } from './components/ScreenLoader'
import { NavPreloadContext } from './contexts/NavPreloadContext'
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
import {
  parseBookingStartParam,
  parseChatStartParam,
  parseUnsubscribeStartParam,
} from './utils/deeplink'
import {
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  type FavoriteMaster,
} from './utils/favorites'
import { prefetchJson } from './utils/dataCache'
import { markNavEnd, markNavStart, markScreenMount, markScreenPaint } from './utils/perf'
import type { ShowcaseMedia } from './screens/ClientShowcaseScreen'
import { StartScreen } from './screens/StartScreen'
import './App.css'

const loadAddressScreen = () => import('./screens/AddressScreen')
const AddressScreen = lazy(() =>
  loadAddressScreen().then((module) => ({
    default: module.AddressScreen,
  }))
)
const loadChatListScreen = () => import('./screens/ChatListScreen')
const ChatListScreen = lazy(() =>
  loadChatListScreen().then((module) => ({
    default: module.ChatListScreen,
  }))
)
const loadChatThreadScreen = () => import('./screens/ChatThreadScreen')
const ChatThreadScreen = lazy(() =>
  loadChatThreadScreen().then((module) => ({
    default: module.ChatThreadScreen,
  }))
)
const loadClientRequestsScreen = () => import('./screens/ClientRequestsScreen')
const ClientRequestsScreen = lazy(() =>
  loadClientRequestsScreen().then((module) => ({
    default: module.ClientRequestsScreen,
  }))
)
const loadClientProfileScreen = () => import('./screens/ClientProfileScreen')
const ClientProfileScreen = lazy(() =>
  loadClientProfileScreen().then((module) => ({
    default: module.ClientProfileScreen,
  }))
)
const loadClientScreen = () => import('./screens/ClientScreen')
const ClientScreen = lazy(() =>
  loadClientScreen().then((module) => ({
    default: module.ClientScreen,
  }))
)
const loadClientShowcase = () => import('./screens/ClientShowcaseScreen')
const ClientShowcaseScreen = lazy(() =>
  loadClientShowcase().then((module) => ({
    default: module.ClientShowcaseScreen,
  }))
)
const ClientShowcaseGalleryScreen = lazy(() =>
  loadClientShowcase().then((module) => ({
    default: module.ClientShowcaseGalleryScreen,
  }))
)
const ClientShowcaseDetailScreen = lazy(() =>
  loadClientShowcase().then((module) => ({
    default: module.ClientShowcaseDetailScreen,
  }))
)
const loadClientMasterProfileScreen = () =>
  import('./screens/ClientMasterProfileScreen')
const ClientMasterProfileScreen = lazy(() =>
  loadClientMasterProfileScreen().then((module) => ({
    default: module.ClientMasterProfileScreen,
  }))
)
const loadBookingScreen = () => import('./screens/BookingScreen')
const BookingScreen = lazy(() =>
  loadBookingScreen().then((module) => ({
    default: module.BookingScreen,
  }))
)
const loadProAnalyticsScreen = () => import('./screens/ProAnalyticsScreen')
const ProAnalyticsScreen = lazy(() =>
  loadProAnalyticsScreen().then((module) => ({
    default: module.ProAnalyticsScreen,
  }))
)
const loadProCabinetScreen = () => import('./screens/ProCabinetScreen')
const ProCabinetScreen = lazy(() =>
  loadProCabinetScreen().then((module) => ({
    default: module.ProCabinetScreen,
  }))
)
const loadProMarketingScreen = () => import('./screens/ProMarketingScreen')
const ProMarketingScreen = lazy(() =>
  loadProMarketingScreen().then((module) => ({
    default: module.ProMarketingScreen,
  }))
)
const loadProClientsScreen = () => import('./screens/ProClientsScreen')
const ProClientsScreen = lazy(() =>
  loadProClientsScreen().then((module) => ({
    default: module.ProClientsScreen,
  }))
)
const loadProProfileScreen = () => import('./screens/ProProfileScreen')
const ProProfileScreen = lazy(() =>
  loadProProfileScreen().then((module) => ({
    default: module.ProProfileScreen,
  }))
)
const loadProRequestsScreen = () => import('./screens/ProRequestsScreen')
const ProRequestsScreen = lazy(() =>
  loadProRequestsScreen().then((module) => ({
    default: module.ProRequestsScreen,
  }))
)
const loadProStoriesScreen = () => import('./screens/ProStoriesScreen')
const ProStoriesScreen = lazy(() =>
  loadProStoriesScreen().then((module) => ({
    default: module.ProStoriesScreen,
  }))
)
const loadRequestScreen = () => import('./screens/RequestScreen')
const RequestScreen = lazy(() =>
  loadRequestScreen().then((module) => ({
    default: module.RequestScreen,
  }))
)

const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  ''
)
const getTelegramUser = () => window.Telegram?.WebApp?.initDataUnsafe?.user
type View =
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
  | 'pro-analytics'
  | 'pro-clients'
  | 'pro-marketing'
  | 'pro-stories'
  | 'pro-requests'

type PendingNavPerf = { view: View; id: number }

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
  | 'pro-cabinet'
  | 'pro-requests'

const ScreenPerfMarker = ({
  screenView,
  children,
  pendingNavPerfRef,
}: {
  screenView: View
  children: ReactElement
  pendingNavPerfRef: MutableRefObject<PendingNavPerf | null>
}) => {
  useEffect(() => {
    markScreenMount(screenView)
    const rafId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const pending = pendingNavPerfRef.current
        if (pending?.view === screenView) {
          markNavEnd(screenView, pending.id, { view: screenView })
          if (pendingNavPerfRef.current?.id === pending.id) {
            pendingNavPerfRef.current = null
          }
        }
        markScreenPaint(screenView)
      })
    })
    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [pendingNavPerfRef, screenView])

  return children
}

type RequestsNavOptions = {
  tab?: 'requests' | 'bookings'
  focusRequestId?: number | null
  focusBookingId?: number | null
}

type NavState = {
  view: View
  stack: View[]
}

type NavAction =
  | { type: 'GO'; view: View; replace?: boolean; reset?: boolean }
  | { type: 'BACK'; fallback?: View }

const viewLoaders: Partial<Record<View, () => Promise<unknown>>> = {
  address: loadAddressScreen,
  chats: loadChatListScreen,
  'chat-thread': loadChatThreadScreen,
  requests: loadClientRequestsScreen,
  'client-profile': loadClientProfileScreen,
  client: loadClientScreen,
  'client-showcase': loadClientShowcase,
  'client-gallery': loadClientShowcase,
  'client-gallery-detail': loadClientShowcase,
  'client-master-profile': loadClientMasterProfileScreen,
  booking: loadBookingScreen,
  'pro-analytics': loadProAnalyticsScreen,
  'pro-cabinet': loadProCabinetScreen,
  'pro-marketing': loadProMarketingScreen,
  'pro-clients': loadProClientsScreen,
  'pro-profile': loadProProfileScreen,
  'pro-requests': loadProRequestsScreen,
  'pro-stories': loadProStoriesScreen,
  request: loadRequestScreen,
}

const clientWarmViews: View[] = [
  'address',
  'client',
  'client-showcase',
  'client-gallery',
  'client-master-profile',
  'booking',
  'request',
  'requests',
  'client-profile',
  'chats',
  'chat-thread',
]

const proWarmViews: View[] = [
  'pro-cabinet',
  'pro-profile',
  'pro-requests',
  'pro-analytics',
  'pro-clients',
  'pro-marketing',
  'pro-stories',
  'chats',
  'chat-thread',
]

const NAV_PREFETCH_TTL_MS = {
  masters: 2 * 60 * 1000,
  showcase: 2 * 60 * 1000,
  stories: 60 * 1000,
  requests: 60 * 1000,
  bookings: 60 * 1000,
}

const navReducer = (state: NavState, action: NavAction): NavState => {
  switch (action.type) {
    case 'GO': {
      const nextStack = action.reset
        ? []
        : action.replace
          ? state.stack
          : [...state.stack, state.view]
      return { view: action.view, stack: nextStack }
    }
    case 'BACK': {
      if (state.stack.length === 0) {
        return { view: action.fallback ?? 'start', stack: [] }
      }
      const nextView = state.stack[state.stack.length - 1] ?? 'start'
      return {
        view: nextView,
        stack: state.stack.slice(0, -1),
      }
    }
    default:
      return state
  }
}

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
  const [nav, dispatchNav] = useReducer(navReducer, {
    view: 'start',
    stack: [],
  })
  const view = nav.view
  const navStack = nav.stack
  const navIntentRef = useRef(0)
  const pendingNavPerfRef = useRef<{ view: View; id: number } | null>(null)
  const preloadedViewsRef = useRef<Set<View>>(new Set())
  const preloadPromisesRef = useRef<Map<View, Promise<void>>>(new Map())
  const prefetchViewDataRef = useRef<(target: View) => void>(() => {})

  const preloadView = useCallback((target: View) => {
    prefetchViewDataRef.current(target)
    const loader = viewLoaders[target]
    if (!loader || preloadedViewsRef.current.has(target)) {
      return null
    }
    const existing = preloadPromisesRef.current.get(target)
    if (existing) {
      return existing
    }
    const promise = loader()
      .then(() => {
        preloadedViewsRef.current.add(target)
      })
      .catch((error) => {
        console.warn('Не удалось прогреть экран:', target, error)
      })
      .finally(() => {
        preloadPromisesRef.current.delete(target)
      })
    preloadPromisesRef.current.set(target, promise)
    return promise
  }, [])

  const navigate = useCallback(
    (next: View, options?: { replace?: boolean; reset?: boolean }) => {
      const intentId = ++navIntentRef.current
      pendingNavPerfRef.current = { view: next, id: intentId }
      markNavStart(next, intentId)
      const commit = () => {
        if (navIntentRef.current !== intentId) return
        startTransition(() => {
          dispatchNav({ type: 'GO', view: next, ...options })
        })
      }
      const promise = preloadView(next)
      if (!promise) {
        commit()
        return
      }
      void promise.finally(commit)
    },
    [preloadView]
  )

  const goBack = useCallback((fallback?: View) => {
    navIntentRef.current += 1
    dispatchNav({ type: 'BACK', fallback })
  }, [])
  const [role, setRole] = useState<Role>('client')
  const [proProfileSection, setProProfileSection] =
    useState<ProProfileSection | null>(null)
  const [proProfilePortfolioView, setProProfilePortfolioView] = useState<
    'portfolio' | 'showcase' | null
  >(null)
  const [proProfileReturnView, setProProfileReturnView] = useState<
    'pro-cabinet' | 'pro-requests'
  >('pro-cabinet')
  const [proStoriesReturnView, setProStoriesReturnView] = useState<
    'pro-cabinet' | 'pro-profile'
  >('pro-cabinet')
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
  const [clientShowcasePreset, setClientShowcasePreset] = useState<{
    promotionsOnly?: boolean
  } | null>(null)
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
  const [requestsInitialTab, setRequestsInitialTab] = useState<
    'requests' | 'bookings'
  >('requests')
  const [requestsFocusRequestId, setRequestsFocusRequestId] = useState<
    number | null
  >(null)
  const [requestsFocusBookingId, setRequestsFocusBookingId] = useState<
    number | null
  >(null)
  const [proRequestsInitialTab, setProRequestsInitialTab] = useState<
    'requests' | 'bookings'
  >('requests')
  const [proRequestsFocusRequestId, setProRequestsFocusRequestId] = useState<
    number | null
  >(null)
  const [proRequestsFocusBookingId, setProRequestsFocusBookingId] = useState<
    number | null
  >(null)
  const [favorites, setFavorites] = useState<FavoriteMaster[]>(() =>
    loadFavorites()
  )
  const [supportChatId, setSupportChatId] = useState<number | null>(null)
  const supportChatPromiseRef = useRef<Promise<number | null> | null>(null)
  const proProfileBackHandlerRef = useRef<(() => boolean) | null>(null)
  const screenBackHandlerRef = useRef<(() => boolean) | null>(null)
  const deepLinkHandledRef = useRef(false)
  const warmupDoneRef = useRef(false)
  const clientName =
    [telegramUser?.first_name, telegramUser?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || telegramUser?.username?.trim() || ''
  const telegramAvatarUrl = telegramUser?.photo_url ?? null

  const prefetchViewData = useCallback(
    (target: View) => {
      if (!apiBase) return
      switch (target) {
        case 'client': {
          void prefetchJson(`${apiBase}/api/masters`, {
            ttlMs: NAV_PREFETCH_TTL_MS.masters,
          })
          if (userId) {
            void prefetchJson(
              `${apiBase}/api/stories?userId=${encodeURIComponent(userId)}`,
              { ttlMs: NAV_PREFETCH_TTL_MS.stories, persist: true }
            )
          }
          break
        }
        case 'client-showcase':
        case 'client-gallery':
        case 'client-gallery-detail': {
          void prefetchJson(`${apiBase}/api/masters?limit=0`, {
            ttlMs: NAV_PREFETCH_TTL_MS.showcase,
          })
          break
        }
        case 'requests': {
          if (!userId) return
          void prefetchJson(
            `${apiBase}/api/requests?userId=${encodeURIComponent(userId)}`,
            { ttlMs: NAV_PREFETCH_TTL_MS.requests, persist: true }
          )
          void prefetchJson(
            `${apiBase}/api/bookings?userId=${encodeURIComponent(userId)}`,
            { ttlMs: NAV_PREFETCH_TTL_MS.bookings, persist: true }
          )
          break
        }
        case 'pro-requests': {
          if (!userId) return
          void prefetchJson(
            `${apiBase}/api/pro/requests?userId=${encodeURIComponent(userId)}`,
            { ttlMs: NAV_PREFETCH_TTL_MS.requests, persist: true }
          )
          void prefetchJson(
            `${apiBase}/api/pro/bookings?userId=${encodeURIComponent(userId)}`,
            { ttlMs: NAV_PREFETCH_TTL_MS.bookings, persist: true }
          )
          break
        }
        default:
          break
      }
    },
    [apiBase, userId]
  )

  useEffect(() => {
    prefetchViewDataRef.current = prefetchViewData
  }, [prefetchViewData])

  useEffect(() => {
    preloadedViewsRef.current.add(view)
  }, [view])

  useEffect(() => {
    if (warmupDoneRef.current || view === 'start') return
    warmupDoneRef.current = true
    const queue = (role === 'pro' ? proWarmViews : clientWarmViews).filter(
      (target) => target !== view
    )
    const idleApi = window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const idleIds: number[] = []
    const timers: number[] = []
    const schedule = (target: View, index: number) => {
      const run = () => {
        void preloadView(target)
      }
      if (typeof idleApi.requestIdleCallback === 'function') {
        const id = idleApi.requestIdleCallback(
          () => run(),
          { timeout: 900 + index * 180 }
        )
        idleIds.push(id)
        return
      }
      const timer = window.setTimeout(run, 200 + index * 160)
      timers.push(timer)
    }
    queue.forEach(schedule)
    return () => {
      idleIds.forEach((id) => idleApi.cancelIdleCallback?.(id))
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [preloadView, role, view])

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
    const parsedUnsubMasterId = parseUnsubscribeStartParam(decodedParam)
    const rawChatId = parsedChatId ?? queryChat?.trim() ?? null
    const parsedChatNumber = rawChatId ? Number(rawChatId) : null
    const masterId = parsedMasterId ?? queryMaster?.trim() ?? null

    if (parsedUnsubMasterId) {
      deepLinkHandledRef.current = true
      setRole('client')
      const targetMasterId = parsedUnsubMasterId
      const runOptOut = async () => {
        if (!userId) {
          window.alert('Не удалось подтвердить пользователя.')
          navigate('client', { reset: true })
          return
        }
        try {
          const response = await fetch(
            `${apiBase}/api/masters/${encodeURIComponent(
              targetMasterId
            )}/marketing/opt-out`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId }),
            }
          )
          if (response.ok) {
            window.alert('Вы отписались от предложений мастера.')
          } else {
            window.alert('Не удалось отписаться. Попробуйте еще раз.')
          }
        } catch (error) {
          window.alert('Не удалось отписаться. Попробуйте еще раз.')
        } finally {
          navigate('client', { reset: true })
        }
      }
      void runOptOut()
      return
    }

    if (parsedChatNumber && Number.isInteger(parsedChatNumber)) {
      deepLinkHandledRef.current = true
      setSelectedChatId(parsedChatNumber)
      setChatReturnView('chats')
      navigate('chat-thread', { reset: true })
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
    navigate('booking', { reset: true })
  }, [apiBase, navigate, userId])

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
      navigate(role === 'pro' ? 'pro-profile' : 'client', { reset: true })
    } catch (error) {
      setSaveError('Не удалось сохранить город и район. Попробуйте еще раз.')
    } finally {
      setIsSaving(false)
    }
  }, [address, cityId, districtId, navigate, role, userId])

  useEffect(() => {
    if (!telegramUser?.id) return

    const payload = {
      userId,
      firstName: telegramUser.first_name ?? null,
      lastName: telegramUser.last_name ?? null,
      username: telegramUser.username ?? null,
      languageCode: telegramUser.language_code ?? null,
      photoUrl: telegramUser.photo_url ?? null,
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
    telegramUser?.photo_url,
    userId,
  ])

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return

    webApp.ready()
    webApp.expand()
    webApp.requestFullscreen?.()
    webApp.disableVerticalSwipes?.()
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
      root.style.setProperty('--tg-safe-bottom-js', `${safe?.bottom ?? 0}px`)
      root.style.setProperty(
        '--tg-content-safe-bottom-js',
        `${content?.bottom ?? 0}px`
      )
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

    const shouldShow = view !== 'start' && (view !== 'client' || navStack.length > 0)

    const handleBack = () => {
      if (screenBackHandlerRef.current?.()) {
        return
      }
      switch (view) {
        case 'address':
          goBack('start')
          break
        case 'request':
        case 'requests':
          goBack('client')
          break
        case 'client-showcase':
        case 'client-gallery':
          goBack('client')
          break
        case 'client-gallery-detail':
          setSelectedShowcaseItem(null)
          goBack('client-gallery')
          break
        case 'client-master-profile':
          setSelectedMasterId(null)
          goBack('client-showcase')
          break
        case 'booking':
          setBookingMasterId(null)
          setBookingPhotoUrls([])
          setBookingPreferredCategoryId(null)
          goBack(bookingReturnView ?? 'client-showcase')
          setBookingReturnView(null)
          break
        case 'chat-thread':
          setSelectedChatId(null)
          goBack(chatReturnView ?? 'chats')
          setChatReturnView(null)
          break
        case 'chats':
          goBack(role === 'pro' ? 'pro-cabinet' : 'client')
          break
        case 'pro-profile':
          if (proProfileBackHandlerRef.current?.()) {
            return
          }
          setProProfileSection(null)
          setProProfilePortfolioView(null)
          goBack(proProfileReturnView)
          setProProfileReturnView('pro-cabinet')
          break
        case 'pro-requests':
          goBack('pro-cabinet')
          break
        case 'pro-analytics':
        case 'pro-clients':
        case 'pro-marketing':
        case 'pro-stories':
          goBack('pro-cabinet')
          break
        case 'pro-cabinet':
          goBack('start')
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
  }, [
    bookingReturnView,
    chatReturnView,
    goBack,
    navStack.length,
    proProfileReturnView,
    role,
    view,
  ])

  useEffect(() => {
    if (view === 'client-master-profile' && !selectedMasterId) {
      navigate('client-showcase', { replace: true })
    }
  }, [navigate, selectedMasterId, view])

  useEffect(() => {
    if (view === 'client-gallery-detail' && !selectedShowcaseItem) {
      navigate('client-gallery', { replace: true })
    }
  }, [navigate, selectedShowcaseItem, view])

  useEffect(() => {
    if (view === 'booking' && !bookingMasterId) {
      setBookingPreferredCategoryId(null)
      setBookingPhotoUrls([])
      setBookingInitialServiceName(null)
      setBookingInitialLocationType(null)
      setBookingInitialDetails(null)
      setBookingReturnView(null)
      navigate(bookingReturnView ?? 'client-showcase', { replace: true })
    }
  }, [bookingMasterId, bookingReturnView, navigate, view])

  useEffect(() => {
    if (view === 'chat-thread' && !selectedChatId) {
      navigate('chats', { replace: true })
    }
  }, [navigate, selectedChatId, view])

  useEffect(() => {
    saveFavorites(favorites)
  }, [favorites])

  const registerProProfileBackHandler = useCallback(
    (handler: (() => boolean) | null) => {
      proProfileBackHandlerRef.current = handler
    },
    []
  )

  const registerScreenBackHandler = useCallback(
    (handler: (() => boolean) | null) => {
      screenBackHandlerRef.current = handler
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
      }
    ) => {
      setBookingMasterId(masterId)
      setBookingPhotoUrls(options?.photoUrls ?? [])
      setBookingPreferredCategoryId(options?.preferredCategoryId ?? null)
      setBookingInitialServiceName(options?.initialServiceName ?? null)
      setBookingInitialLocationType(options?.initialLocationType ?? null)
      setBookingInitialDetails(options?.initialDetails ?? null)
      setBookingReturnView(options?.returnView ?? 'client-showcase')
      navigate('booking')
    },
    [navigate]
  )

  const openRequests = useCallback(
    (input?: 'requests' | 'bookings' | RequestsNavOptions) => {
      const options =
        typeof input === 'string' ? { tab: input } : input ?? {}
      setRequestsInitialTab(options.tab ?? 'requests')
      setRequestsFocusRequestId(options.focusRequestId ?? null)
      setRequestsFocusBookingId(options.focusBookingId ?? null)
      navigate('requests')
    },
    [navigate]
  )

  const openProRequests = useCallback(
    (input?: 'requests' | 'bookings' | RequestsNavOptions) => {
      const options =
        typeof input === 'string' ? { tab: input } : input ?? {}
      setProRequestsInitialTab(options.tab ?? 'requests')
      setProRequestsFocusRequestId(options.focusRequestId ?? null)
      setProRequestsFocusBookingId(options.focusBookingId ?? null)
      navigate('pro-requests')
    },
    [navigate]
  )

  const openProProfile = useCallback(
    (options?: {
      section?: ProProfileSection | null
      portfolioView?: 'portfolio' | 'showcase' | null
      returnView?: 'pro-cabinet' | 'pro-requests' | null
    }) => {
      setProProfileSection(options?.section ?? null)
      setProProfilePortfolioView(options?.portfolioView ?? null)
      setProProfileReturnView(options?.returnView ?? 'pro-cabinet')
      navigate('pro-profile')
    },
    [navigate]
  )

  const openProStories = useCallback(
    (returnView: 'pro-cabinet' | 'pro-profile') => {
      setProStoriesReturnView(returnView)
      navigate('pro-stories')
    },
    [navigate]
  )

  const openChatList = useCallback(() => {
    setSelectedChatId(null)
    setChatReturnView(null)
    navigate('chats')
  }, [navigate])

  const openChatThread = useCallback(
    (chatId: number, returnView?: ChatReturnView) => {
      setSelectedChatId(chatId)
      setChatReturnView(returnView ?? 'chats')
      navigate('chat-thread')
    },
    [navigate]
  )

  const ensureSupportChat = useCallback(async () => {
    if (!userId) return null
    if (supportChatId) return supportChatId
    if (supportChatPromiseRef.current) {
      return supportChatPromiseRef.current
    }

    const promise = (async () => {
      try {
        const response = await fetch(`${apiBase}/api/support/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        })
        if (!response.ok) {
          throw new Error('Support chat failed')
        }
        const data = (await response.json()) as { chatId?: number | null }
        const chatId = typeof data.chatId === 'number' ? data.chatId : null
        if (chatId) {
          setSupportChatId(chatId)
        }
        return chatId
      } catch (error) {
        console.error('Failed to create support chat:', error)
        return null
      } finally {
        supportChatPromiseRef.current = null
      }
    })()

    supportChatPromiseRef.current = promise
    return promise
  }, [apiBase, supportChatId, userId])

  const openSupportChat = useCallback(
    async (returnView: ChatReturnView) => {
      void preloadView('chat-thread')
      const chatId = await ensureSupportChat()
      if (!chatId) return
      setSelectedChatId(chatId)
      setChatReturnView(returnView)
      navigate('chat-thread')
    },
    [ensureSupportChat, navigate, preloadView]
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
        if (existing) {
          const existingCategories = Array.isArray(existing.categories)
            ? existing.categories
            : []
          const nextCategories = Array.isArray(favorite.categories)
            ? favorite.categories
            : []
          const categoriesEqual =
            existingCategories.length === nextCategories.length &&
            existingCategories.every((item, index) => item === nextCategories[index])
          const isSame =
            categoriesEqual &&
            existing.masterId === favorite.masterId &&
            existing.displayName === favorite.displayName &&
            (existing.avatarUrl ?? null) === (favorite.avatarUrl ?? null) &&
            (existing.cityName ?? null) === (favorite.cityName ?? null) &&
            (existing.districtName ?? null) === (favorite.districtName ?? null) &&
            (existing.reviewsAverage ?? null) === (favorite.reviewsAverage ?? null) &&
            (existing.reviewsCount ?? null) === (favorite.reviewsCount ?? null) &&
            (existing.priceFrom ?? null) === (favorite.priceFrom ?? null) &&
            (existing.priceTo ?? null) === (favorite.priceTo ?? null) &&
            (existing.updatedAt ?? null) === (favorite.updatedAt ?? null)
          if (isSame) {
            return prev
          }
        }
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

  const navPreloadHandler = useCallback(
    (target: string) => {
      if (!Object.prototype.hasOwnProperty.call(viewLoaders, target)) return
      void preloadView(target as View)
    },
    [preloadView]
  )

  const renderScreen = (screenView: View, screen: ReactElement) => (
    <NavPreloadContext.Provider value={navPreloadHandler}>
      <Suspense fallback={<ScreenLoader />}>
        <ScreenPerfMarker screenView={screenView} pendingNavPerfRef={pendingNavPerfRef}>
          {screen}
        </ScreenPerfMarker>
      </Suspense>
    </NavPreloadContext.Provider>
  )

  if (view === 'client') {
    return renderScreen(
      'client',
      <ClientScreen
        apiBase={apiBase}
        userId={userId}
        displayName={clientName}
        activeCategoryId={clientCategoryId}
        onCategoryChange={setClientCategoryId}
        onViewShowcase={() => navigate('client-gallery')}
        onViewMasters={() => navigate('client-showcase')}
        onViewPromotions={() => {
          setClientShowcasePreset({ promotionsOnly: true })
          navigate('client-showcase')
        }}
        onViewChats={openChatList}
        onViewRequests={(tab) => openRequests(tab)}
        onViewProfile={() => navigate('client-profile')}
        onViewMasterProfile={(masterId) => {
          setSelectedMasterId(masterId)
          navigate('client-master-profile')
        }}
        onCreateRequest={(categoryId) => {
          setRequestCategoryId(
            categoryId ?? clientCategoryId ?? categoryItems[0]?.id ?? ''
          )
          navigate('request')
        }}
      />
    )
  }

  if (view === 'client-profile') {
    return renderScreen(
      'client-profile',
      <ClientProfileScreen
        apiBase={apiBase}
        userId={userId}
        displayNameFallback={clientName}
        onViewHome={() => navigate('client', { reset: true })}
        onViewMasters={() => navigate('client-showcase')}
        onViewRequests={(tab) => openRequests(tab)}
        onViewChats={openChatList}
        onCreateRequest={() => {
          setRequestCategoryId(clientCategoryId ?? categoryItems[0]?.id ?? '')
          navigate('request')
        }}
        onOpenSupport={() => void openSupportChat('client-profile')}
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
        onEditAddress={() => navigate('address')}
        onViewMasterProfile={(masterId) => {
          setSelectedMasterId(masterId)
          navigate('client-master-profile')
        }}
        onRequestLocation={handleRequestLocation}
        onClearLocation={handleClearLocation}
        favorites={favorites}
      />
    )
  }

  if (view === 'client-showcase') {
    return renderScreen(
      'client-showcase',
      <ClientShowcaseScreen
        apiBase={apiBase}
        userId={userId}
        activeCategoryId={clientCategoryId}
        onCategoryChange={setClientCategoryId}
        preset={clientShowcasePreset}
        onPresetApplied={() => setClientShowcasePreset(null)}
        onBack={() => goBack('client')}
        onViewRequests={(tab) => openRequests(tab)}
        onViewChats={openChatList}
        onViewClientProfile={() => navigate('client-profile')}
        onCreateRequest={(categoryId) => {
          setRequestCategoryId(
            categoryId ?? clientCategoryId ?? categoryItems[0]?.id ?? ''
          )
          navigate('request')
        }}
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
          navigate('client-master-profile')
        }}
      />
    )
  }

  if (view === 'client-master-profile' && selectedMasterId) {
    return renderScreen(
      'client-master-profile',
      <ClientMasterProfileScreen
        apiBase={apiBase}
        masterId={selectedMasterId}
        userId={userId}
        onViewHome={() => {
          setSelectedMasterId(null)
          navigate('client', { reset: true })
        }}
        onViewRequests={() => {
          setSelectedMasterId(null)
          openRequests()
        }}
        onViewChats={() => {
          setSelectedMasterId(null)
          navigate('chats')
        }}
        onViewProfile={() => {
          setSelectedMasterId(null)
          navigate('client-profile')
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
    return renderScreen(
      'client-gallery-detail',
      <ClientShowcaseDetailScreen
        item={selectedShowcaseItem}
        activeCategoryId={clientCategoryId}
        onBack={() => {
          setSelectedShowcaseItem(null)
          goBack('client-gallery')
        }}
        onViewHome={() => {
          setSelectedShowcaseItem(null)
          navigate('client', { reset: true })
        }}
        onViewRequests={() => {
          setSelectedShowcaseItem(null)
          openRequests()
        }}
        onViewChats={() => {
          setSelectedShowcaseItem(null)
          navigate('chats')
        }}
        onViewClientProfile={() => {
          setSelectedShowcaseItem(null)
          navigate('client-profile')
        }}
        onViewProfile={(masterId) => {
          setSelectedShowcaseItem(null)
          setSelectedMasterId(masterId)
          navigate('client-master-profile')
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
    return renderScreen(
      'client-gallery',
      <ClientShowcaseGalleryScreen
        apiBase={apiBase}
        activeCategoryId={clientCategoryId}
        onCategoryChange={setClientCategoryId}
        onBack={() => goBack('client')}
        onViewRequests={(tab) => openRequests(tab)}
        onViewChats={openChatList}
        onViewClientProfile={() => navigate('client-profile')}
        onViewDetail={(item) => {
          setSelectedShowcaseItem(item)
          navigate('client-gallery-detail')
        }}
      />
    )
  }

  if (view === 'chats') {
    return renderScreen(
      'chats',
      <ChatListScreen
        apiBase={apiBase}
        userId={userId}
        role={role}
        onOpenChat={(chatId) => openChatThread(chatId, 'chats')}
        onOpenSupport={() => void openSupportChat('chats')}
        onViewHome={() => navigate('client', { reset: true })}
        onViewRequests={() =>
          role === 'pro' ? openProRequests() : openRequests()
        }
        onViewProfile={() =>
          role === 'pro' ? openProProfile() : navigate('client-profile')
        }
        onViewCabinet={() => navigate('pro-cabinet', { reset: true })}
      />
    )
  }

  if (view === 'chat-thread' && selectedChatId) {
    return renderScreen(
      'chat-thread',
      <ChatThreadScreen
        key={selectedChatId}
        apiBase={apiBase}
        userId={userId}
        chatId={selectedChatId}
        onBack={() => {
          setSelectedChatId(null)
          goBack(chatReturnView ?? 'chats')
          setChatReturnView(null)
        }}
        onViewRequests={(options) =>
          role === 'pro' ? openProRequests(options) : openRequests(options)
        }
      />
    )
  }

  if (view === 'request') {
    const cityName = cities.find((item) => item.id === cityId)?.name ?? ''
    const districtName =
      districts.find((item) => item.id === districtId)?.name ?? ''

    return renderScreen(
      'request',
      <RequestScreen
        apiBase={apiBase}
        userId={userId}
        defaultCategoryId={requestCategoryId}
        cityId={cityId}
        districtId={districtId}
        cityName={cityName}
        districtName={districtName}
        address={address}
        onBack={() => goBack('client')}
        onBackHandlerChange={registerScreenBackHandler}
      />
    )
  }

  if (view === 'booking' && bookingMasterId) {
    const cityName = cities.find((item) => item.id === cityId)?.name ?? ''
    const districtName =
      districts.find((item) => item.id === districtId)?.name ?? ''

    return renderScreen(
      'booking',
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
          goBack(bookingReturnView ?? 'client-showcase')
          setBookingReturnView(null)
        }}
        onBackHandlerChange={registerScreenBackHandler}
      />
    )
  }

  if (view === 'requests') {
    return renderScreen(
      'requests',
      <ClientRequestsScreen
        apiBase={apiBase}
        userId={userId}
        initialTab={requestsInitialTab}
        focusRequestId={requestsFocusRequestId}
        focusBookingId={requestsFocusBookingId}
        onFocusHandled={() => {
          setRequestsFocusRequestId(null)
          setRequestsFocusBookingId(null)
        }}
        onCreateRequest={() => {
          setRequestCategoryId(clientCategoryId ?? categoryItems[0]?.id ?? '')
          navigate('request')
        }}
        onViewHome={() => navigate('client', { reset: true })}
        onViewChats={openChatList}
        onViewClientProfile={() => navigate('client-profile')}
        onViewProfile={(masterId) => {
          setSelectedMasterId(masterId)
          navigate('client-master-profile')
        }}
        onOpenChat={(chatId) => openChatThread(chatId, 'requests')}
      />
    )
  }

  if (view === 'pro-profile') {
    return renderScreen(
      'pro-profile',
      <ProProfileScreen
        apiBase={apiBase}
        userId={userId}
        displayNameFallback={clientName}
        telegramAvatarUrl={telegramAvatarUrl}
        returnView={proProfileReturnView}
        onBack={() => {
          setProProfileSection(null)
          setProProfilePortfolioView(null)
          goBack(proProfileReturnView)
          setProProfileReturnView('pro-cabinet')
        }}
        onViewCabinet={() => navigate('pro-cabinet', { reset: true })}
        onViewRequests={() => openProRequests()}
        onViewChats={openChatList}
        onViewStories={() => openProStories('pro-profile')}
        focusSection={proProfileSection}
        initialPortfolioView={proProfilePortfolioView ?? undefined}
        onBackHandlerChange={registerProProfileBackHandler}
      />
    )
  }

  if (view === 'pro-requests') {
    return renderScreen(
      'pro-requests',
      <ProRequestsScreen
        apiBase={apiBase}
        userId={userId}
        initialTab={proRequestsInitialTab}
        focusRequestId={proRequestsFocusRequestId}
        focusBookingId={proRequestsFocusBookingId}
        onFocusHandled={() => {
          setProRequestsFocusRequestId(null)
          setProRequestsFocusBookingId(null)
        }}
        onBack={() => goBack('pro-cabinet')}
        onViewCabinet={() => navigate('pro-cabinet', { reset: true })}
        onTabChange={(tab) => setProRequestsInitialTab(tab)}
        onEditProfile={(section) => {
          openProProfile({ section: section ?? null, returnView: 'pro-requests' })
        }}
        onViewChats={openChatList}
        onOpenChat={(chatId) => openChatThread(chatId, 'pro-requests')}
      />
    )
  }

  if (view === 'pro-analytics') {
    return renderScreen(
      'pro-analytics',
      <ProAnalyticsScreen
        apiBase={apiBase}
        userId={userId}
        onBack={() => goBack('pro-cabinet')}
        onViewCabinet={() => navigate('pro-cabinet', { reset: true })}
        onViewRequests={() => openProRequests()}
        onViewChats={openChatList}
        onEditProfile={() => {
          openProProfile()
        }}
      />
    )
  }

  if (view === 'pro-clients') {
    return renderScreen(
      'pro-clients',
      <ProClientsScreen
        apiBase={apiBase}
        userId={userId}
        onBack={() => goBack('pro-cabinet')}
        onViewCabinet={() => navigate('pro-cabinet', { reset: true })}
        onViewRequests={() => openProRequests()}
        onViewChats={openChatList}
        onEditProfile={() => {
          openProProfile()
        }}
      />
    )
  }

  if (view === 'pro-marketing') {
    return renderScreen(
      'pro-marketing',
      <ProMarketingScreen
        apiBase={apiBase}
        userId={userId}
        displayNameFallback={clientName}
        onBack={() => goBack('pro-cabinet')}
        onViewCabinet={() => navigate('pro-cabinet', { reset: true })}
        onViewRequests={() => openProRequests()}
        onViewChats={openChatList}
        onEditProfile={() => {
          openProProfile()
        }}
      />
    )
  }

  if (view === 'pro-stories') {
    return renderScreen(
      'pro-stories',
      <ProStoriesScreen
        apiBase={apiBase}
        userId={userId}
        displayNameFallback={clientName}
        onBack={() => navigate(proStoriesReturnView, { replace: true })}
        onViewCabinet={() => navigate('pro-cabinet', { reset: true })}
        onViewRequests={() => openProRequests()}
        onViewChats={openChatList}
        onViewProfile={() => openProProfile()}
        activeNav={proStoriesReturnView === 'pro-profile' ? 'profile' : 'cabinet'}
      />
    )
  }

  if (view === 'pro-cabinet') {
    return renderScreen(
      'pro-cabinet',
      <ProCabinetScreen
        apiBase={apiBase}
        userId={userId}
        telegramAvatarUrl={telegramAvatarUrl}
        onEditProfile={(section) => openProProfile({ section: section ?? null })}
        onViewRequests={() => openProRequests()}
        onViewChats={openChatList}
        onOpenSupport={() => void openSupportChat('pro-cabinet')}
        onOpenAnalytics={() => navigate('pro-analytics')}
        onOpenClients={() => navigate('pro-clients')}
        onOpenMarketing={() => navigate('pro-marketing')}
        onOpenCalendar={() => openProRequests('bookings')}
        onOpenShowcase={() =>
          openProProfile({ section: 'portfolio', portfolioView: 'showcase' })
        }
        onOpenStories={() => openProStories('pro-cabinet')}
      />
    )
  }

  if (view === 'address') {
    return renderScreen(
      'address',
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

  return renderScreen(
    'start',
    <StartScreen
      onRoleSelect={(nextRole) => {
        setRole(nextRole)
        if (nextRole === 'pro') {
          setProProfileSection(null)
        }
        navigate(nextRole === 'pro' ? 'pro-profile' : 'address', { reset: true })
      }}
    />
  )
}

export default App
