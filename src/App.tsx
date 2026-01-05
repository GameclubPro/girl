import { useCallback, useEffect, useState } from 'react'
import { AddressScreen } from './screens/AddressScreen'
import { ClientRequestsScreen } from './screens/ClientRequestsScreen'
import { ClientScreen } from './screens/ClientScreen'
import { ProCabinetScreen } from './screens/ProCabinetScreen'
import { ProProfileScreen } from './screens/ProProfileScreen'
import { ProRequestsScreen } from './screens/ProRequestsScreen'
import { RequestScreen } from './screens/RequestScreen'
import { StartScreen } from './screens/StartScreen'
import { categoryItems } from './data/clientData'
import { isCityAvailable } from './data/cityAvailability'
import type { City, District, ProProfileSection, Role } from './types/app'
import './App.css'

const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  ''
)
const getTelegramUser = () => window.Telegram?.WebApp?.initDataUnsafe?.user

function App() {
  const [view, setView] = useState<
    | 'start'
    | 'address'
    | 'client'
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
  const [isLoadingCities, setIsLoadingCities] = useState(false)
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [requestCategoryId, setRequestCategoryId] = useState<string>(
    categoryItems[0]?.id ?? ''
  )
  const clientName =
    [telegramUser?.first_name, telegramUser?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || telegramUser?.username?.trim() || ''

  const handleAddressChange = (value: string) => {
    setAddress(value)
    if (saveError) {
      setSaveError('')
    }
  }

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

  const handleSaveAddress = useCallback(async () => {
    if (!cityId || !districtId || !address.trim()) {
      setSaveError('Укажите город, район и адрес.')
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
          address: address.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error('Save failed')
      }

      setView(role === 'pro' ? 'pro-profile' : 'client')
    } catch (error) {
      setSaveError('Не удалось сохранить адрес. Попробуйте еще раз.')
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
    const isClient =
      view === 'client' ||
      view === 'request' ||
      view === 'requests' ||
      view === 'pro-cabinet' ||
      view === 'pro-profile' ||
      view === 'pro-requests'
    const themeColor = view === 'pro-profile' ? '#fff3e8' : isClient ? '#f3edf7' : '#f7f2ef'
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

        if (typeof data.address === 'string') {
          setAddress(data.address)
        }
        if (typeof data.cityId === 'number') {
          setCityId(data.cityId)
        }
        if (typeof data.districtId === 'number') {
          setDistrictId(data.districtId)
        }
      } catch (error) {
        if (!cancelled) {
          setSaveError('Не удалось загрузить адрес.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAddress(false)
        }
      }
    }

    loadCities()
    loadAddress()

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
        case 'pro-profile':
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

  if (view === 'client') {
    return (
      <ClientScreen
        clientName={clientName}
        onCreateRequest={(categoryId) => {
          setRequestCategoryId(categoryId ?? categoryItems[0]?.id ?? '')
          setView('request')
        }}
        onViewRequests={() => setView('requests')}
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

  if (view === 'requests') {
    return (
      <ClientRequestsScreen
        apiBase={apiBase}
        userId={userId}
        onCreateRequest={() => setView('request')}
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
          setProProfileSection(section ?? 'basic')
          setView('pro-profile')
        }}
      />
    )
  }

  if (view === 'pro-cabinet') {
    return (
      <ProCabinetScreen
        onEditProfile={(section) => {
          setProProfileSection(section ?? 'basic')
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
        address={address}
        isSaving={isSaving}
        isLoading={isLoadingAddress || isLoadingCities || isLoadingDistricts}
        saveError={saveError}
        onCityQueryChange={handleCityQueryChange}
        onCitySelect={handleCitySelect}
        onDistrictChange={handleDistrictChange}
        onAddressChange={handleAddressChange}
        onContinue={handleSaveAddress}
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
