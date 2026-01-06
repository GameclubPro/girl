import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { categoryItems } from '../data/clientData'
import type { City, District, MasterProfile, ProProfileSection } from '../types/app'
import {
  formatServiceMeta,
  isImageUrl,
  parsePortfolioItems,
  parseServiceItems,
  toPortfolioStrings,
  toServiceStrings,
} from '../utils/profileContent'
import type { PortfolioItem, ServiceItem } from '../utils/profileContent'
import { getProfileStatusSummary } from '../utils/profileStatus'

type ProProfileScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  onBack: () => void
  onViewRequests: () => void
  focusSection?: ProProfileSection | null
}

const parseNumber = (value: string) => {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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

const scheduleDayOptions = [
  { id: 'mon', label: 'Пн' },
  { id: 'tue', label: 'Вт' },
  { id: 'wed', label: 'Ср' },
  { id: 'thu', label: 'Чт' },
  { id: 'fri', label: 'Пт' },
  { id: 'sat', label: 'Сб' },
  { id: 'sun', label: 'Вс' },
]

const profileSections: Array<{
  id: ProProfileSection
  step: string
  label: string
  subtitle: string
}> = [
  {
    id: 'basic',
    step: '01',
    label: 'Основное',
    subtitle: 'Имя, описание и специализации',
  },
  {
    id: 'services',
    step: '02',
    label: 'Услуги и цены',
    subtitle: 'Что делаете и сколько это стоит',
  },
  {
    id: 'location',
    step: '03',
    label: 'Локация и опыт',
    subtitle: 'Где вы работаете и сколько лет в профессии',
  },
  {
    id: 'availability',
    step: '04',
    label: 'График и доступность',
    subtitle: 'Управляйте приемом заявок и расписанием',
  },
  {
    id: 'portfolio',
    step: '05',
    label: 'Портфолио',
    subtitle: 'Добавьте ссылки на лучшие работы',
  },
]

type ProfileTemplate = {
  id: string
  label: string
  categories: string[]
  services: ServiceItem[]
  priceFrom?: number
  priceTo?: number
  about?: string
  worksAtClient?: boolean
  worksAtMaster?: boolean
}

type ProfilePayload = {
  userId: string
  displayName: string
  about: string | null
  cityId: number | null
  districtId: number | null
  experienceYears: number | null
  priceFrom: number | null
  priceTo: number | null
  isActive: boolean
  scheduleDays: string[]
  scheduleStart: string | null
  scheduleEnd: string | null
  worksAtClient: boolean
  worksAtMaster: boolean
  categories: string[]
  services: string[]
  portfolioUrls: string[]
}

const profileTemplates: ProfileTemplate[] = [
  {
    id: 'nails',
    label: 'Маникюр',
    categories: ['beauty-nails'],
    services: [
      { name: 'Маникюр комбинированный', price: 1800, duration: 90 },
      { name: 'Покрытие гель-лак', price: 2200, duration: 120 },
      { name: 'Снятие + уход', price: 800, duration: 30 },
    ],
    priceFrom: 1500,
    priceTo: 3500,
    worksAtMaster: true,
  },
  {
    id: 'brows',
    label: 'Брови/ресницы',
    categories: ['brows-lashes'],
    services: [
      { name: 'Оформление бровей', price: 1200, duration: 40 },
      { name: 'Ламинирование бровей', price: 2200, duration: 75 },
      { name: 'Ламинирование ресниц', price: 2400, duration: 80 },
    ],
    priceFrom: 1200,
    priceTo: 3000,
    worksAtMaster: true,
  },
  {
    id: 'hair',
    label: 'Стрижка',
    categories: ['hair'],
    services: [
      { name: 'Женская стрижка', price: 2000, duration: 60 },
      { name: 'Мужская стрижка', price: 1500, duration: 45 },
      { name: 'Укладка', price: 1800, duration: 50 },
    ],
    priceFrom: 1500,
    priceTo: 4000,
    worksAtMaster: true,
  },
  {
    id: 'massage',
    label: 'Массаж',
    categories: ['massage-body'],
    services: [
      { name: 'Классический массаж', price: 2500, duration: 60 },
      { name: 'Антистресс массаж', price: 2800, duration: 70 },
      { name: 'Спортивный массаж', price: 3200, duration: 70 },
    ],
    priceFrom: 2200,
    priceTo: 4500,
    worksAtClient: true,
  },
]

const MAX_MEDIA_BYTES = 3 * 1024 * 1024
const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const PRICE_RANGE_ERROR = 'Минимальная цена не может быть выше максимальной.'

export const ProProfileScreen = ({
  apiBase,
  userId,
  displayNameFallback,
  onBack,
  onViewRequests,
  focusSection,
}: ProProfileScreenProps) => {
  const [cities, setCities] = useState<City[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [cityId, setCityId] = useState<number | null>(null)
  const [districtId, setDistrictId] = useState<number | null>(null)
  const [displayName, setDisplayName] = useState(displayNameFallback)
  const [about, setAbout] = useState('')
  const [experienceYears, setExperienceYears] = useState('')
  const [priceFrom, setPriceFrom] = useState('')
  const [priceTo, setPriceTo] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([])
  const [serviceInput, setServiceInput] = useState('')
  const [servicePriceInput, setServicePriceInput] = useState('')
  const [serviceDurationInput, setServiceDurationInput] = useState('')
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([])
  const [portfolioInput, setPortfolioInput] = useState('')
  const [portfolioTitleInput, setPortfolioTitleInput] = useState('')
  const [showAllPortfolio, setShowAllPortfolio] = useState(false)
  const [worksAtClient, setWorksAtClient] = useState(true)
  const [worksAtMaster, setWorksAtMaster] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [scheduleDays, setScheduleDays] = useState<string[]>([])
  const [scheduleStart, setScheduleStart] = useState('')
  const [scheduleEnd, setScheduleEnd] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [isAvatarUploading, setIsAvatarUploading] = useState(false)
  const [isCoverUploading, setIsCoverUploading] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const [activeSection, setActiveSection] = useState<ProProfileSection>('basic')
  const [isEditing, setIsEditing] = useState(() => Boolean(focusSection))
  const autosaveTimerRef = useRef<number | null>(null)
  const autosaveSuccessTimerRef = useRef<number | null>(null)
  const lastSavedRef = useRef('')
  const lastAttemptedRef = useRef('')
  const hasLoadedRef = useRef(false)
  const isSavingRef = useRef(false)
  const queuedPayloadRef = useRef<ProfilePayload | null>(null)
  const serviceStrings = useMemo(
    () => toServiceStrings(serviceItems),
    [serviceItems]
  )
  const portfolioStrings = useMemo(
    () => toPortfolioStrings(portfolioItems),
    [portfolioItems]
  )
  const autosavePayload = useMemo<ProfilePayload | null>(() => {
    if (!userId) return null
    const normalizedName = displayName.trim()
    const parsedPriceFrom = parseNumber(priceFrom)
    const parsedPriceTo = parseNumber(priceTo)
    return {
      userId,
      displayName: normalizedName,
      about: about.trim() || null,
      cityId,
      districtId,
      experienceYears: parseNumber(experienceYears),
      priceFrom: parsedPriceFrom,
      priceTo: parsedPriceTo,
      isActive,
      scheduleDays: [...scheduleDays],
      scheduleStart: scheduleStart.trim() || null,
      scheduleEnd: scheduleEnd.trim() || null,
      worksAtClient,
      worksAtMaster,
      categories: [...categories],
      services: [...serviceStrings],
      portfolioUrls: [...portfolioStrings],
    }
  }, [
    about,
    categories,
    cityId,
    displayName,
    districtId,
    experienceYears,
    isActive,
    portfolioStrings,
    priceFrom,
    priceTo,
    scheduleDays,
    scheduleEnd,
    scheduleStart,
    serviceStrings,
    userId,
    worksAtClient,
    worksAtMaster,
  ])
  const autosaveKey = useMemo(
    () => (autosavePayload ? JSON.stringify(autosavePayload) : ''),
    [autosavePayload]
  )
  const profileStatus = useMemo(
    () =>
      getProfileStatusSummary({
        displayName,
        about,
        cityId,
        districtId,
        experienceYears: parseNumber(experienceYears),
        priceFrom: parseNumber(priceFrom),
        priceTo: parseNumber(priceTo),
        worksAtClient,
        worksAtMaster,
        categories,
        services: serviceStrings,
        portfolioUrls: portfolioStrings,
      }),
    [
      about,
      categories,
      cityId,
      displayName,
      districtId,
      experienceYears,
      priceFrom,
      priceTo,
      portfolioStrings,
      serviceStrings,
      worksAtClient,
      worksAtMaster,
    ]
  )
  const statusLabelMap = {
    draft: 'Черновик',
    ready: 'Готов к откликам',
    complete: 'Профиль заполнен',
  }
  const displayNameValue =
    displayName.trim() || displayNameFallback.trim() || 'Мастер'
  const profileTone =
    profileStatus.profileStatus === 'complete'
      ? 'is-complete'
      : profileStatus.profileStatus === 'ready'
        ? 'is-ready'
        : 'is-draft'
  const activeTone = isActive ? 'is-active' : 'is-paused'
  const aboutPreview =
    about.trim() ||
    'Добавьте пару слов о своем стиле работы — это повышает доверие.'
  const profileInitials = useMemo(() => {
    const source = displayNameValue.trim()
    if (!source) return 'MK'
    const parts = source.split(/[\s•|-]+/).filter(Boolean)
    const initials = parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('')
    return initials || 'MK'
  }, [displayNameValue])
  const experienceValue = parseNumber(experienceYears)
  const priceFromValue = parseNumber(priceFrom)
  const priceToValue = parseNumber(priceTo)
  const hasInvalidPriceRange =
    priceFromValue !== null &&
    priceToValue !== null &&
    priceFromValue > priceToValue
  const autosaveLabel = hasInvalidPriceRange
    ? 'Проверьте диапазон цен'
    : saveError
      ? 'Не удалось сохранить'
      : isSaving
        ? 'Сохраняем...'
        : saveSuccess
          ? 'Сохранено'
          : 'Автосохранение включено'
  const autosaveTone = hasInvalidPriceRange
    ? 'is-error'
    : saveError
      ? 'is-error'
      : isSaving
        ? 'is-saving'
        : saveSuccess
          ? 'is-success'
          : 'is-idle'
  const priceLabel =
    priceFromValue !== null && priceToValue !== null
      ? `${priceFromValue}–${priceToValue} ₽`
      : priceFromValue !== null
        ? `от ${priceFromValue} ₽`
        : priceToValue !== null
          ? `до ${priceToValue} ₽`
          : 'Цена не указана'
  const experienceLabel =
    experienceValue !== null ? `${experienceValue} лет` : 'Опыт не указан'
  const workFormatLabel =
    worksAtClient && worksAtMaster
      ? 'У мастера и выезд'
      : worksAtClient
        ? 'Выезд к клиенту'
        : worksAtMaster
          ? 'У мастера'
          : 'Формат не указан'
  const servicesSummary =
    serviceItems.length > 0
      ? formatCount(serviceItems.length, 'услуга', 'услуги', 'услуг')
      : 'Не заполнено'
  const portfolioSummary =
    portfolioItems.length > 0
      ? formatCount(portfolioItems.length, 'работа', 'работы', 'работ')
      : 'Пусто'
  const scheduleSummary =
    scheduleDays.length > 0
      ? formatCount(scheduleDays.length, 'день', 'дня', 'дней')
      : isActive
        ? 'Открыт'
        : 'Пауза'
  const locationLabel = useMemo(() => {
    const cityLabel = cityId
      ? cities.find((city) => city.id === cityId)?.name
      : ''
    const districtLabel = districtId
      ? districts.find((district) => district.id === districtId)?.name
      : ''
    return [cityLabel, districtLabel].filter(Boolean).join(', ') || 'Город не указан'
  }, [cities, cityId, districts, districtId])
  const categoryLabels = useMemo(
    () =>
      categoryItems
        .filter((category) => categories.includes(category.id))
        .map((category) => category.label),
    [categories]
  )
  const primaryCategory = categoryLabels[0] ?? ''
  const serviceNames = useMemo(
    () => serviceItems.filter((item) => item.name.trim()).map((item) => item.name),
    [serviceItems]
  )
  const portfolioPreview = useMemo(
    () => portfolioItems.filter((item) => item.url.trim()).slice(0, 3),
    [portfolioItems]
  )
  const visiblePortfolio = showAllPortfolio
    ? portfolioItems
    : portfolioItems.slice(0, 6)
  const hasMorePortfolio = portfolioItems.length > 6
  const previewTagSource =
    serviceNames.length > 0 ? serviceNames : categoryLabels
  const previewTags = previewTagSource.slice(0, 3)
  const previewTagRemainder = previewTagSource.length - previewTags.length
  const missingLabels = useMemo(() => {
    const labels: string[] = []
    if (profileStatus.missingFields.includes('displayName')) {
      labels.push('Имя и специализация')
    }
    if (profileStatus.missingFields.includes('categories')) {
      labels.push('Категории услуг')
    }
    if (
      profileStatus.missingFields.includes('cityId') ||
      profileStatus.missingFields.includes('districtId')
    ) {
      labels.push('Город и район')
    }
    if (profileStatus.missingFields.includes('workFormat')) {
      labels.push('Формат работы')
    }
    return labels
  }, [profileStatus.missingFields])
  const responseLabel = profileStatus.isResponseReady
    ? isActive
      ? 'Открыты'
      : 'Пауза'
    : 'Недоступны'
  const nextFocus = useMemo<
    | {
        section: ProProfileSection
        label: string
      }
    | null
  >(() => {
    const missing = profileStatus.missingFields
    if (missing.includes('displayName') || missing.includes('categories')) {
      return { section: 'basic', label: 'Имя и категории' }
    }
    if (
      missing.includes('cityId') ||
      missing.includes('districtId') ||
      missing.includes('workFormat')
    ) {
      return { section: 'location', label: 'Локация и формат' }
    }
    if (serviceStrings.length === 0 && priceFromValue === null && priceToValue === null) {
      return { section: 'services', label: 'Услуги и цены' }
    }
    if (portfolioStrings.length === 0) {
      return { section: 'portfolio', label: 'Портфолио' }
    }
    if (!about.trim()) {
      return { section: 'basic', label: 'О себе' }
    }
    return null
  }, [
    about,
    portfolioStrings.length,
    priceFromValue,
    priceToValue,
    profileStatus.missingFields,
    serviceStrings.length,
  ])
  const activeSectionMeta =
    profileSections.find((section) => section.id === activeSection) ?? profileSections[0]
  const activeStepIndex =
    profileSections.findIndex((section) => section.id === activeSection) + 1
  const persistAutosaveMessage = (message: string) => {
    if (autosaveSuccessTimerRef.current) {
      window.clearTimeout(autosaveSuccessTimerRef.current)
    }
    setSaveSuccess(message)
    if (!message) return
    autosaveSuccessTimerRef.current = window.setTimeout(() => {
      setSaveSuccess('')
    }, 2000)
  }

  useEffect(() => {
    if (hasInvalidPriceRange) {
      if (saveError !== PRICE_RANGE_ERROR) {
        if (autosaveSuccessTimerRef.current) {
          window.clearTimeout(autosaveSuccessTimerRef.current)
        }
        setSaveSuccess('')
        setSaveError(PRICE_RANGE_ERROR)
      }
      return
    }
    if (saveError === PRICE_RANGE_ERROR) {
      setSaveError('')
    }
  }, [hasInvalidPriceRange, saveError])

  useEffect(() => {
    if (!focusSection) return
    setIsEditing(true)
    setActiveSection(focusSection)
    const timeout = window.setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
    return () => window.clearTimeout(timeout)
  }, [focusSection])

  useEffect(() => {
    hasLoadedRef.current = false
    lastSavedRef.current = ''
    lastAttemptedRef.current = ''
    queuedPayloadRef.current = null
  }, [userId])

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
      }
      if (autosaveSuccessTimerRef.current) {
        window.clearTimeout(autosaveSuccessTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadCities = async () => {
      try {
        const response = await fetch(`${apiBase}/api/cities`)
        if (!response.ok) {
          throw new Error('Load cities failed')
        }
        const data = (await response.json()) as City[]
        if (!cancelled) {
          setCities(data)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError('Не удалось загрузить города.')
        }
      }
    }

    loadCities()

    return () => {
      cancelled = true
    }
  }, [apiBase])

  useEffect(() => {
    if (!cityId) {
      setDistricts([])
      setDistrictId(null)
      return
    }

    let cancelled = false

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
          setLoadError('Не удалось загрузить районы.')
        }
      }
    }

    loadDistricts()

    return () => {
      cancelled = true
    }
  }, [apiBase, cityId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadProfile = async () => {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch(`${apiBase}/api/masters/${userId}`)
        if (response.status === 404) {
          return
        }
        if (!response.ok) {
          throw new Error('Load profile failed')
        }
        const data = (await response.json()) as MasterProfile
        if (cancelled) return

        const nextDisplayName = data.displayName ?? displayNameFallback
        const nextAbout = data.about ?? ''
        const nextCityId = data.cityId ?? null
        const nextDistrictId = data.districtId ?? null
        const nextExperienceYears =
          data.experienceYears !== null && data.experienceYears !== undefined
            ? String(data.experienceYears)
            : ''
        const nextPriceFrom =
          data.priceFrom !== null && data.priceFrom !== undefined
            ? String(data.priceFrom)
            : ''
        const nextPriceTo =
          data.priceTo !== null && data.priceTo !== undefined
            ? String(data.priceTo)
            : ''
        const nextIsActive = data.isActive ?? true
        const nextScheduleDays = data.scheduleDays ?? []
        const nextScheduleStart = data.scheduleStart ?? ''
        const nextScheduleEnd = data.scheduleEnd ?? ''
        const nextWorksAtClient = data.worksAtClient
        const nextWorksAtMaster = data.worksAtMaster
        const nextCategories = data.categories ?? []
        const nextServiceItems = parseServiceItems(data.services ?? [])
        const nextPortfolioItems = parsePortfolioItems(data.portfolioUrls ?? [])

        setDisplayName(nextDisplayName)
        setAbout(nextAbout)
        setCityId(nextCityId)
        setDistrictId(nextDistrictId)
        setExperienceYears(nextExperienceYears)
        setPriceFrom(nextPriceFrom)
        setPriceTo(nextPriceTo)
        setIsActive(nextIsActive)
        setScheduleDays(nextScheduleDays)
        setScheduleStart(nextScheduleStart)
        setScheduleEnd(nextScheduleEnd)
        setWorksAtClient(nextWorksAtClient)
        setWorksAtMaster(nextWorksAtMaster)
        setCategories(nextCategories)
        setServiceItems(nextServiceItems)
        setPortfolioItems(nextPortfolioItems)
        setShowAllPortfolio(false)
        setAvatarUrl(data.avatarUrl ?? '')
        setCoverUrl(data.coverUrl ?? '')

        lastSavedRef.current = JSON.stringify({
          userId,
          displayName: nextDisplayName.trim(),
          about: nextAbout.trim() || null,
          cityId: nextCityId,
          districtId: nextDistrictId,
          experienceYears: parseNumber(nextExperienceYears),
          priceFrom: parseNumber(nextPriceFrom),
          priceTo: parseNumber(nextPriceTo),
          isActive: nextIsActive,
          scheduleDays: [...nextScheduleDays],
          scheduleStart: nextScheduleStart.trim() || null,
          scheduleEnd: nextScheduleEnd.trim() || null,
          worksAtClient: nextWorksAtClient,
          worksAtMaster: nextWorksAtMaster,
          categories: [...nextCategories],
          services: toServiceStrings(nextServiceItems),
          portfolioUrls: toPortfolioStrings(nextPortfolioItems),
        })
      } catch (error) {
        if (!cancelled) {
          setLoadError('Не удалось загрузить профиль.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          hasLoadedRef.current = true
        }
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [apiBase, displayNameFallback, userId])

  useEffect(() => {
    if (!hasLoadedRef.current || lastSavedRef.current || !autosaveKey) return
    lastSavedRef.current = autosaveKey
  }, [autosaveKey])

  const saveProfile = async (payload: ProfilePayload) => {
    if (!payload.userId) return
    if (isSavingRef.current) {
      queuedPayloadRef.current = payload
      return
    }
    if (
      payload.priceFrom !== null &&
      payload.priceTo !== null &&
      payload.priceFrom > payload.priceTo
    ) {
      setSaveError(PRICE_RANGE_ERROR)
      persistAutosaveMessage('')
      return
    }

    const payloadKey = JSON.stringify(payload)
    if (payloadKey === lastSavedRef.current) return

    lastAttemptedRef.current = payloadKey
    setSaveError('')
    persistAutosaveMessage('')
    setIsSaving(true)
    isSavingRef.current = true

    try {
      const response = await fetch(`${apiBase}/api/masters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Save profile failed')
      }

      const summary = getProfileStatusSummary(payload)
      persistAutosaveMessage(
        summary.missingFields.length > 0 ? 'Черновик сохранен' : 'Сохранено'
      )
      lastSavedRef.current = payloadKey
    } catch (error) {
      setSaveError('Не удалось сохранить профиль. Попробуйте еще раз.')
    } finally {
      setIsSaving(false)
      isSavingRef.current = false
      if (queuedPayloadRef.current) {
        const nextPayload = queuedPayloadRef.current
        queuedPayloadRef.current = null
        void saveProfile(nextPayload)
      }
    }
  }

  useEffect(() => {
    if (!autosavePayload || !hasLoadedRef.current || isLoading) return
    if (autosaveKey === lastSavedRef.current) return
    if (autosaveKey === lastAttemptedRef.current) return
    if (hasInvalidPriceRange) return
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current)
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      void saveProfile(autosavePayload)
    }, 700)
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [autosaveKey, autosavePayload, hasInvalidPriceRange, isLoading])

  const toggleCategory = (categoryId: string) => {
    setCategories((current) =>
      current.includes(categoryId)
        ? current.filter((item) => item !== categoryId)
        : [...current, categoryId]
    )
  }

  const normalizeServiceKey = (value: string) => value.trim().toLowerCase()

  const applyTemplate = (template: ProfileTemplate) => {
    setCategories((current) => {
      const next = new Set(current)
      template.categories.forEach((category) => next.add(category))
      return Array.from(next)
    })
    setServiceItems((current) => {
      const byName = new Map(
        current.map((item) => [normalizeServiceKey(item.name), item])
      )
      template.services.forEach((item) => {
        const key = normalizeServiceKey(item.name)
        const existing = byName.get(key)
        if (existing) {
          byName.set(key, {
            ...existing,
            price: existing.price ?? item.price ?? null,
            duration: existing.duration ?? item.duration ?? null,
          })
        } else {
          byName.set(key, { ...item })
        }
      })
      return Array.from(byName.values())
    })
    setPriceFrom((current) =>
      current.trim()
        ? current
        : template.priceFrom !== undefined
          ? String(template.priceFrom)
          : ''
    )
    setPriceTo((current) =>
      current.trim()
        ? current
        : template.priceTo !== undefined
          ? String(template.priceTo)
          : ''
    )
    if (!about.trim() && template.about) {
      setAbout(template.about)
    }
    if (!worksAtClient && !worksAtMaster) {
      setWorksAtClient(Boolean(template.worksAtClient))
      setWorksAtMaster(Boolean(template.worksAtMaster))
    }
  }

  const addService = () => {
    const trimmed = serviceInput.trim()
    if (!trimmed) return
    const priceValue = parseNumber(servicePriceInput)
    const durationValue = parseNumber(serviceDurationInput)
    setServiceItems((current) => {
      const key = normalizeServiceKey(trimmed)
      const index = current.findIndex(
        (item) => normalizeServiceKey(item.name) === key
      )
      if (index === -1) {
        return [
          ...current,
          {
            name: trimmed,
            price: priceValue,
            duration: durationValue,
          },
        ]
      }
      const next = [...current]
      const existing = next[index]
      next[index] = {
        ...existing,
        price: existing.price ?? priceValue ?? null,
        duration: existing.duration ?? durationValue ?? null,
      }
      return next
    })
    setServiceInput('')
    setServicePriceInput('')
    setServiceDurationInput('')
  }

  const updateServiceItem = (
    index: number,
    updates: Partial<ServiceItem>
  ) => {
    setServiceItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item
      )
    )
  }

  const removeService = (index: number) => {
    setServiceItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const addPortfolio = () => {
    const trimmed = portfolioInput.trim()
    if (!trimmed) return
    const title = portfolioTitleInput.trim()
    setPortfolioItems((current) =>
      current.some((item) => item.url === trimmed)
        ? current
        : [{ url: trimmed, title: title || null }, ...current]
    )
    setPortfolioInput('')
    setPortfolioTitleInput('')
  }

  const updatePortfolioItem = (
    index: number,
    updates: Partial<PortfolioItem>
  ) => {
    setPortfolioItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item
      )
    )
  }

  const removePortfolio = (index: number) => {
    setPortfolioItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  const toggleScheduleDay = (dayId: string) => {
    setScheduleDays((current) =>
      current.includes(dayId)
        ? current.filter((item) => item !== dayId)
        : [...current, dayId]
    )
  }

  const readImageFile = (file: File, onLoad: (dataUrl: string) => void) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (result) {
        onLoad(result)
      }
    }
    reader.readAsDataURL(file)
  }

  const uploadMedia = async (kind: 'avatar' | 'cover', dataUrl: string) => {
    if (!userId) return
    setMediaError('')
    if (kind === 'avatar') {
      setIsAvatarUploading(true)
    } else {
      setIsCoverUploading(true)
    }

    try {
      const response = await fetch(`${apiBase}/api/masters/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          kind,
          dataUrl,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message =
          payload?.error === 'profile_not_found'
            ? 'Сначала сохраните профиль, чтобы загрузить медиа.'
            : payload?.error === 'image_too_large'
              ? 'Файл слишком большой. Максимум 3 МБ.'
              : payload?.error === 'invalid_image'
                ? 'Формат изображения не поддерживается.'
                : 'Не удалось загрузить изображение.'
        throw new Error(message)
      }
      const payload = (await response.json()) as {
        avatarUrl?: string | null
        coverUrl?: string | null
      }
      if (kind === 'avatar') {
        setAvatarUrl(payload.avatarUrl ?? '')
      } else {
        setCoverUrl(payload.coverUrl ?? '')
      }
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : 'Не удалось загрузить изображение.'
      )
    } finally {
      if (kind === 'avatar') {
        setIsAvatarUploading(false)
      } else {
        setIsCoverUploading(false)
      }
    }
  }

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setMediaError('')
    if (!allowedImageTypes.has(file.type)) {
      setMediaError('Поддерживаются только PNG, JPG или WebP.')
      event.target.value = ''
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setMediaError('Файл слишком большой. Максимум 3 МБ.')
      event.target.value = ''
      return
    }
    readImageFile(file, (dataUrl) => uploadMedia('avatar', dataUrl))
    event.target.value = ''
  }

  const handleCoverChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setMediaError('')
    if (!allowedImageTypes.has(file.type)) {
      setMediaError('Поддерживаются только PNG, JPG или WebP.')
      event.target.value = ''
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setMediaError('Файл слишком большой. Максимум 3 МБ.')
      event.target.value = ''
      return
    }
    readImageFile(file, (dataUrl) => uploadMedia('cover', dataUrl))
    event.target.value = ''
  }

  const handleAvatarSelect = () => {
    if (isAvatarUploading) return
    avatarInputRef.current?.click()
  }

  const handleCoverSelect = () => {
    if (isCoverUploading) return
    coverInputRef.current?.click()
  }

  const handleAvatarClear = async () => {
    if (!userId || isAvatarUploading) return
    setMediaError('')
    setIsAvatarUploading(true)
    try {
      const response = await fetch(`${apiBase}/api/masters/media`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, kind: 'avatar' }),
      })
      if (!response.ok) {
        throw new Error('Не удалось удалить аватар.')
      }
      setAvatarUrl('')
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : 'Не удалось удалить аватар.'
      )
    } finally {
      setIsAvatarUploading(false)
    }
  }

  const handleCoverClear = async () => {
    if (!userId || isCoverUploading) return
    setMediaError('')
    setIsCoverUploading(true)
    try {
      const response = await fetch(`${apiBase}/api/masters/media`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, kind: 'cover' }),
      })
      if (!response.ok) {
        throw new Error('Не удалось удалить шапку.')
      }
      setCoverUrl('')
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : 'Не удалось удалить шапку.'
      )
    } finally {
      setIsCoverUploading(false)
    }
  }

  const openEditor = (section?: ProProfileSection) => {
    if (section) {
      setActiveSection(section)
    }
    if (!isEditing) {
      setIsEditing(true)
    }
    window.setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  const jumpToEditor = (section: ProProfileSection) => {
    openEditor(section)
  }

  return (
    <div className="screen screen--pro">
      <div className="pro-shell">
        <section className="pro-profile-compact animate delay-1">
          <div
            className={`pro-profile-compact-cover${
              coverUrl ? ' has-image' : ''
            }`}
            style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
          >
            <div className="pro-profile-compact-cover-grid" aria-hidden="true" />
          </div>
          <div className="pro-profile-compact-body">
            <div className="pro-profile-compact-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt={`Аватар ${displayNameValue}`} />
              ) : (
                <span aria-hidden="true">{profileInitials}</span>
              )}
            </div>
            <div className="pro-profile-compact-title">
              <h1 className="pro-profile-compact-name">{displayNameValue}</h1>
              <span className={`pro-pill ${profileTone}`}>
                {profileStatus.completeness}%
              </span>
            </div>
            <div className="pro-profile-compact-badges">
              <span className={`pro-status-chip ${activeTone}`}>
                {isActive ? 'Активен' : 'Пауза'}
              </span>
              <span className={`pro-status-chip ${profileTone}`}>
                {statusLabelMap[profileStatus.profileStatus]}
              </span>
              <span
                className={`pro-status-chip is-neutral${
                  primaryCategory ? '' : ' is-muted'
                }`}
              >
                {primaryCategory || 'Категории'}
              </span>
            </div>
            <p
              className={`pro-profile-compact-about${
                about.trim() ? '' : ' is-muted'
              }`}
            >
              {aboutPreview}
            </p>
            <div className="pro-profile-compact-tags">
              {previewTags.length > 0 ? (
                <>
                  {previewTags.map((label, index) => (
                    <span className="pro-profile-tag" key={`${label}-${index}`}>
                      {label}
                    </span>
                  ))}
                  {previewTagRemainder > 0 && (
                    <span className="pro-profile-tag is-muted">
                      +{previewTagRemainder}
                    </span>
                  )}
                </>
              ) : (
                <span className="pro-profile-tag is-muted">
                  Добавьте услуги
                </span>
              )}
            </div>
            <div className="pro-profile-actions">
              <button
                className={`pro-cabinet-pill${isEditing ? '' : ' is-primary'}`}
                type="button"
                onClick={() => {
                  if (isEditing) {
                    setIsEditing(false)
                    return
                  }
                  openEditor()
                }}
              >
                {isEditing ? 'Свернуть редактор' : 'Редактировать профиль'}
              </button>
              <button
                className="pro-cabinet-pill"
                type="button"
                onClick={onViewRequests}
              >
                К заявкам
              </button>
            </div>
            {missingLabels.length > 0 && (
              <p className="pro-profile-compact-hint">
                Для отклика заполните: {missingLabels.join(', ')}.
              </p>
            )}
          </div>
        </section>

        <section className="pro-profile-grid animate delay-2">
          <button
            className="pro-profile-tile is-wide"
            type="button"
            onClick={() => openEditor('location')}
          >
            <span className="pro-profile-tile-icon" aria-hidden="true">
              📍
            </span>
            <span className="pro-profile-tile-info">
              <span className="pro-profile-tile-title">Локация</span>
              <span className="pro-profile-tile-value">{locationLabel}</span>
            </span>
            <span className="pro-profile-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-profile-tile is-wide"
            type="button"
            onClick={() => openEditor('location')}
          >
            <span className="pro-profile-tile-icon" aria-hidden="true">
              🧳
            </span>
            <span className="pro-profile-tile-info">
              <span className="pro-profile-tile-title">Опыт</span>
              <span className="pro-profile-tile-value">{experienceLabel}</span>
            </span>
            <span className="pro-profile-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-profile-tile"
            type="button"
            onClick={() => openEditor('location')}
          >
            <span className="pro-profile-tile-icon" aria-hidden="true">
              🧷
            </span>
            <span className="pro-profile-tile-info">
              <span className="pro-profile-tile-title">Формат</span>
              <span className="pro-profile-tile-value">{workFormatLabel}</span>
            </span>
            <span className="pro-profile-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-profile-tile"
            type="button"
            onClick={() => openEditor('services')}
          >
            <span className="pro-profile-tile-icon" aria-hidden="true">
              💸
            </span>
            <span className="pro-profile-tile-info">
              <span className="pro-profile-tile-title">Цены</span>
              <span className="pro-profile-tile-value">{priceLabel}</span>
            </span>
            <span className="pro-profile-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-profile-tile"
            type="button"
            onClick={() => openEditor('services')}
          >
            <span className="pro-profile-tile-icon" aria-hidden="true">
              🧴
            </span>
            <span className="pro-profile-tile-info">
              <span className="pro-profile-tile-title">Услуги</span>
              <span className="pro-profile-tile-value">{servicesSummary}</span>
            </span>
            <span className="pro-profile-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-profile-tile"
            type="button"
            onClick={() => openEditor('portfolio')}
          >
            <span className="pro-profile-tile-icon" aria-hidden="true">
              🖼️
            </span>
            <span className="pro-profile-tile-info">
              <span className="pro-profile-tile-title">Портфолио</span>
              <span className="pro-profile-tile-value">{portfolioSummary}</span>
            </span>
            <span className="pro-profile-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-profile-tile is-wide"
            type="button"
            onClick={() => openEditor('availability')}
          >
            <span className="pro-profile-tile-icon" aria-hidden="true">
              ⏱️
            </span>
            <span className="pro-profile-tile-info">
              <span className="pro-profile-tile-title">График</span>
              <span className="pro-profile-tile-value">{scheduleSummary}</span>
            </span>
            <span className="pro-profile-tile-arrow" aria-hidden="true">
              ›
            </span>
          </button>
        </section>

        {isLoading && <p className="pro-status">Загружаем профиль...</p>}
        {loadError && <p className="pro-error">{loadError}</p>}
        {isEditing && (
          <>
            <header className="pro-hero animate delay-1">
          <div
            className={`pro-hero-cover pro-hero-cover--bleed${
              coverUrl ? ' has-image' : ''
            }${isCoverUploading ? ' is-loading' : ''}`}
            style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
            aria-busy={isCoverUploading}
          >
            <div className="pro-hero-grid" aria-hidden="true" />
            <div className="pro-hero-orb pro-hero-orb--one" aria-hidden="true" />
            <div className="pro-hero-orb pro-hero-orb--two" aria-hidden="true" />
            <div className="pro-hero-orb pro-hero-orb--three" aria-hidden="true" />
            <div className="pro-hero-controls">
              <input
                ref={coverInputRef}
                className="pro-file-input"
                type="file"
                accept="image/*"
                onChange={handleCoverChange}
                disabled={isCoverUploading}
                aria-hidden="true"
                tabIndex={-1}
              />
              <button
                className="pro-cover-action"
                type="button"
                onClick={handleCoverSelect}
                disabled={isCoverUploading}
              >
                {isCoverUploading ? 'Загрузка...' : 'Сменить шапку'}
              </button>
              {coverUrl && (
                <button
                  className="pro-cover-action is-muted"
                  type="button"
                  onClick={handleCoverClear}
                  disabled={isCoverUploading}
                >
                  Убрать
                </button>
              )}
            </div>
          </div>

          <div className="pro-hero-profile">
            <div
              className={`pro-avatar${isAvatarUploading ? ' is-loading' : ''}`}
              aria-busy={isAvatarUploading}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={`Аватар ${displayNameValue}`} />
              ) : (
                <span aria-hidden="true">{profileInitials}</span>
              )}
              <input
                ref={avatarInputRef}
                className="pro-file-input"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={isAvatarUploading}
                aria-hidden="true"
                tabIndex={-1}
              />
              <button
                className="pro-avatar-action"
                type="button"
                onClick={handleAvatarSelect}
                disabled={isAvatarUploading}
                aria-label="Обновить аватар"
              >
                +
              </button>
              {avatarUrl && (
                <button
                  className="pro-avatar-clear"
                  type="button"
                  onClick={handleAvatarClear}
                  disabled={isAvatarUploading}
                  aria-label="Удалить аватар"
                >
                  ×
                </button>
              )}
            </div>
            <div className="pro-hero-info">
              <span className="pro-hero-label">Профиль мастера</span>
              <div className="pro-hero-name">
                <h1 className="pro-hero-title">{displayNameValue}</h1>
                <div className="pro-hero-badges">
                  <span className={`pro-status-chip ${profileTone}`}>
                    {statusLabelMap[profileStatus.profileStatus]}
                  </span>
                  <span className={`pro-status-chip ${activeTone}`}>
                    {isActive ? 'Принимаю заявки' : 'Пауза'}
                  </span>
                </div>
              </div>
              <p
                className={`pro-hero-subtitle${
                  about.trim() ? '' : ' is-placeholder'
                }`}
              >
                {aboutPreview}
              </p>
              <div className="pro-hero-tags">
                {categoryLabels.length > 0 ? (
                  <>
                    {categoryLabels.slice(0, 4).map((label) => (
                      <span className="pro-tag" key={label}>
                        {label}
                      </span>
                    ))}
                    {categoryLabels.length > 4 && (
                      <span className="pro-tag pro-tag--empty">
                        +{categoryLabels.length - 4}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="pro-tag pro-tag--empty">Добавьте категории</span>
                )}
              </div>
            </div>
          </div>

          <div className="pro-hero-metrics">
            <div className="pro-metric">
              <span className="pro-metric-label">Локация</span>
              <strong className="pro-metric-value">{locationLabel}</strong>
            </div>
            <div className="pro-metric">
              <span className="pro-metric-label">Опыт</span>
              <strong className="pro-metric-value">{experienceLabel}</strong>
            </div>
            <div className="pro-metric">
              <span className="pro-metric-label">Цены</span>
              <strong className="pro-metric-value">{priceLabel}</strong>
            </div>
          </div>
        </header>

        <section className="pro-card pro-card--insight pro-profile-status animate delay-2">
          <div className="pro-card-head">
            <div>
              <p className="pro-card-eyebrow">Статус</p>
              <h2 className="pro-card-title">Профиль без лишнего</h2>
            </div>
            <span className={`pro-pill ${profileTone}`}>
              {profileStatus.completeness}%
            </span>
          </div>
          <div className="pro-profile-status-grid">
            <div className="pro-profile-status-item">
              <span className="pro-insight-label">Статус</span>
              <strong className="pro-insight-value">
                {statusLabelMap[profileStatus.profileStatus]}
              </strong>
            </div>
            <div className="pro-profile-status-item">
              <span className="pro-insight-label">Отклики</span>
              <strong className="pro-insight-value">{responseLabel}</strong>
            </div>
            <div className="pro-profile-status-item">
              <span className="pro-insight-label">Фокус</span>
              <strong className="pro-insight-value">
                {missingLabels[0] ?? 'Портфолио'}
              </strong>
            </div>
          </div>
          <div className="pro-progress">
            <div className="pro-progress-row">
              <span>Готовность</span>
              <strong>{profileStatus.completeness}%</strong>
            </div>
            <div className="pro-progress-bar" aria-hidden="true">
              <span style={{ width: `${profileStatus.completeness}%` }} />
            </div>
          </div>
          <p className="pro-progress-note">
            {profileStatus.missingFields.length > 0
              ? 'Заполните минимум, чтобы откликаться на заявки.'
              : isActive
                ? 'Профиль готов. Можно принимать заявки.'
                : 'Профиль готов. Включите прием заявок, когда будете готовы.'}
          </p>
          {missingLabels.length > 0 && (
            <p className="pro-progress-missing">
              Для отклика заполните: {missingLabels.join(', ')}.
            </p>
          )}
          {nextFocus && (
            <div className="pro-profile-focus">
              <div>
                <p className="pro-profile-focus-label">Следующий шаг</p>
                <p className="pro-profile-focus-text">{nextFocus.label}</p>
              </div>
              <button
                className="pro-focus-button"
                type="button"
                onClick={() => jumpToEditor(nextFocus.section)}
              >
                Перейти
              </button>
            </div>
          )}
        </section>

        {mediaError && <p className="pro-error">{mediaError}</p>}

        <section className="pro-card pro-profile-editor animate delay-3" ref={editorRef}>
          <div className="pro-card-head">
            <div>
              <p className="pro-card-eyebrow">Редактор</p>
              <h2 className="pro-card-title">Соберите профиль</h2>
            </div>
            <span className="pro-editor-step">
              Шаг {activeStepIndex} из {profileSections.length}
            </span>
          </div>
          <div className="pro-editor-tabs" role="tablist" aria-label="Разделы профиля">
            {profileSections.map((section) => (
              <button
                key={section.id}
                id={`section-tab-${section.id}`}
                className={`pro-editor-tab${
                  activeSection === section.id ? ' is-active' : ''
                }`}
                type="button"
                role="tab"
                aria-selected={activeSection === section.id}
                aria-controls={`section-panel-${section.id}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="pro-editor-tab-step">{section.step}</span>
                {section.label}
              </button>
            ))}
          </div>
          <div className="pro-editor-preview">
            <div className="pro-editor-preview-head">
              <span className="pro-editor-preview-label">Клиентский взгляд</span>
              <span className="pro-preview-badge">Live</span>
            </div>
            <div className="pro-editor-preview-card">
              <div className="pro-editor-preview-main">
                <div className="pro-editor-preview-avatar">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={`Аватар ${displayNameValue}`} />
                  ) : (
                    <span aria-hidden="true">{profileInitials}</span>
                  )}
                </div>
                <div className="pro-editor-preview-info">
                  <div className="pro-editor-preview-name">{displayNameValue}</div>
                  <div className="pro-editor-preview-meta">{locationLabel}</div>
                </div>
                <div className="pro-editor-preview-price">{priceLabel}</div>
              </div>
              <div className="pro-editor-preview-tags">
                {previewTags.length > 0 ? (
                  <>
                    {previewTags.map((label, index) => (
                      <span className="pro-editor-preview-tag" key={`${label}-${index}`}>
                        {label}
                      </span>
                    ))}
                    {previewTagRemainder > 0 && (
                      <span className="pro-editor-preview-tag is-muted">
                        +{previewTagRemainder}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="pro-editor-preview-tag is-muted">
                    Добавьте услуги
                  </span>
                )}
              </div>
              <div className="pro-editor-preview-stats">
                <span>{experienceLabel}</span>
                <span>{workFormatLabel}</span>
              </div>
              {portfolioPreview.length > 0 && (
                <div className="pro-editor-preview-gallery">
                  {portfolioPreview.map((item, index) => {
                    const showImage = isImageUrl(item.url)
                    return (
                      <div
                        key={`${item.url}-${index}`}
                        className={`pro-editor-preview-thumb${
                          showImage ? ' has-image' : ''
                        }`}
                        style={
                          showImage
                            ? { backgroundImage: `url(${item.url})` }
                            : undefined
                        }
                        aria-hidden="true"
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <div
            className="pro-editor-panel"
            role="tabpanel"
            id={`section-panel-${activeSection}`}
            aria-labelledby={`section-tab-${activeSection}`}
          >
            <div className="pro-section-head">
              <div className="pro-section-index">{activeSectionMeta.step}</div>
              <div>
                <h3 className="pro-card-title">{activeSectionMeta.label}</h3>
                <p className="pro-section-subtitle">{activeSectionMeta.subtitle}</p>
              </div>
            </div>

            {activeSection === 'basic' && (
              <>
                <div className="pro-field">
                  <label className="pro-label" htmlFor="pro-name">
                    Имя и специализация
                  </label>
                  <input
                    id="pro-name"
                    className="pro-input"
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Например, Алина • Маникюр"
                  />
                </div>
                <div className="pro-field">
                  <label className="pro-label" htmlFor="pro-about">
                    О себе
                  </label>
                  <textarea
                    id="pro-about"
                    className="pro-textarea"
                    value={about}
                    onChange={(event) => setAbout(event.target.value)}
                    placeholder="Коротко о вашем опыте и стиле работы"
                    rows={3}
                  />
                </div>
                <div className="pro-field">
                  <span className="pro-label">Категории</span>
                  <div className="request-chips">
                    {categoryItems.map((category) => (
                      <button
                        className={`request-chip${
                          categories.includes(category.id) ? ' is-active' : ''
                        }`}
                        key={category.id}
                        type="button"
                        onClick={() => toggleCategory(category.id)}
                        aria-pressed={categories.includes(category.id)}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeSection === 'services' && (
              <>
                <div className="pro-field">
                  <span className="pro-label">Шаблоны</span>
                  <div className="pro-template-row">
                    {profileTemplates.map((template) => (
                      <button
                        className="pro-template-chip"
                        key={template.id}
                        type="button"
                        onClick={() => applyTemplate(template)}
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                  <p className="pro-template-hint">
                    Добавляет услуги и цены, не удаляя ваши данные.
                  </p>
                </div>
                <div className="pro-field">
                  <span className="pro-label">Добавить услугу</span>
                  <div className="pro-service-add">
                    <input
                      className="pro-input"
                      type="text"
                      value={serviceInput}
                      onChange={(event) => setServiceInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addService()
                        }
                      }}
                      placeholder="Название"
                    />
                    <input
                      className="pro-input"
                      type="number"
                      value={servicePriceInput}
                      onChange={(event) => setServicePriceInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addService()
                        }
                      }}
                      placeholder="Цена"
                      min="0"
                    />
                    <input
                      className="pro-input"
                      type="number"
                      value={serviceDurationInput}
                      onChange={(event) => setServiceDurationInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addService()
                        }
                      }}
                      placeholder="Мин"
                      min="0"
                    />
                    <button className="pro-add" type="button" onClick={addService}>
                      Добавить
                    </button>
                  </div>
                </div>
                <div className="pro-service-grid">
                  {serviceItems.length > 0 ? (
                    serviceItems.map((service, index) => {
                      const metaLabel = formatServiceMeta(service)
                      return (
                        <div
                          className="pro-service-card"
                          key={`${service.name}-${index}`}
                        >
                          <div className="pro-service-card-head">
                            <input
                              className="pro-service-name"
                              type="text"
                              value={service.name}
                              onChange={(event) =>
                                updateServiceItem(index, {
                                  name: event.target.value,
                                })
                              }
                              placeholder="Название услуги"
                            />
                            <button
                              className="pro-service-remove"
                              type="button"
                              onClick={() => removeService(index)}
                              aria-label={`Удалить ${service.name || 'услугу'}`}
                            >
                              ×
                            </button>
                          </div>
                          <div className="pro-service-meta">
                            <input
                              className="pro-input pro-service-meta-input"
                              type="number"
                              value={service.price ?? ''}
                              onChange={(event) =>
                                updateServiceItem(index, {
                                  price: parseNumber(event.target.value),
                                })
                              }
                              placeholder="Цена"
                              min="0"
                            />
                            <input
                              className="pro-input pro-service-meta-input"
                              type="number"
                              value={service.duration ?? ''}
                              onChange={(event) =>
                                updateServiceItem(index, {
                                  duration: parseNumber(event.target.value),
                                })
                              }
                              placeholder="Мин"
                              min="0"
                            />
                          </div>
                          {metaLabel && (
                            <div className="pro-service-meta-preview">
                              {metaLabel}
                            </div>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <div className="pro-service-empty">
                      Добавьте 2-3 ключевые услуги — так вас быстрее выбирают.
                    </div>
                  )}
                </div>
                <div className="pro-field pro-field--split">
                  <div>
                    <label className="pro-label" htmlFor="price-from">
                      Цена от
                    </label>
                    <input
                      id="price-from"
                      className="pro-input"
                      type="number"
                      value={priceFrom}
                      onChange={(event) => setPriceFrom(event.target.value)}
                      placeholder="1500"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="pro-label" htmlFor="price-to">
                      Цена до
                    </label>
                    <input
                      id="price-to"
                      className="pro-input"
                      type="number"
                      value={priceTo}
                      onChange={(event) => setPriceTo(event.target.value)}
                      placeholder="3000"
                      min="0"
                    />
                  </div>
                </div>
              </>
            )}

            {activeSection === 'location' && (
              <>
                <div className="pro-field pro-field--split">
                  <div>
                    <label className="pro-label" htmlFor="pro-city">
                      Город
                    </label>
                    <select
                      id="pro-city"
                      className="pro-select"
                      value={cityId ?? ''}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        if (!nextValue) {
                          setCityId(null)
                          return
                        }
                        const parsedValue = Number(nextValue)
                        setCityId(Number.isInteger(parsedValue) ? parsedValue : null)
                      }}
                    >
                      <option value="">Выберите город</option>
                      {cities.map((city) => (
                        <option key={city.id} value={city.id}>
                          {city.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="pro-label" htmlFor="pro-district">
                      Район
                    </label>
                    <select
                      id="pro-district"
                      className="pro-select"
                      value={districtId ?? ''}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        if (!nextValue) {
                          setDistrictId(null)
                          return
                        }
                        const parsedValue = Number(nextValue)
                        setDistrictId(
                          Number.isInteger(parsedValue) ? parsedValue : null
                        )
                      }}
                      disabled={!cityId || districts.length === 0}
                    >
                      <option value="">
                        {cityId ? 'Выберите район' : 'Сначала выберите город'}
                      </option>
                      {districts.map((district) => (
                        <option key={district.id} value={district.id}>
                          {district.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="pro-field">
                  <label className="pro-label" htmlFor="experience">
                    Опыт (лет)
                  </label>
                  <input
                    id="experience"
                    className="pro-input"
                    type="number"
                    value={experienceYears}
                    onChange={(event) => setExperienceYears(event.target.value)}
                    placeholder="3"
                    min="0"
                  />
                </div>
                <div className="pro-field">
                  <span className="pro-label">Формат работы</span>
                  <div className="pro-toggle-grid">
                    <label className="pro-toggle">
                      <input
                        type="checkbox"
                        checked={worksAtMaster}
                        onChange={(event) => setWorksAtMaster(event.target.checked)}
                      />
                      У мастера
                    </label>
                    <label className="pro-toggle">
                      <input
                        type="checkbox"
                        checked={worksAtClient}
                        onChange={(event) => setWorksAtClient(event.target.checked)}
                      />
                      Выезд к клиенту
                    </label>
                  </div>
                </div>
              </>
            )}

            {activeSection === 'availability' && (
              <>
                <div className="pro-field">
                  <span className="pro-label">Статус</span>
                  <label className="pro-toggle">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(event) => setIsActive(event.target.checked)}
                    />
                    Принимаю заявки
                  </label>
                </div>
                <div className="pro-field">
                  <span className="pro-label">Дни работы</span>
                  <div className="request-chips">
                    {scheduleDayOptions.map((day) => (
                      <button
                        className={`request-chip${
                          scheduleDays.includes(day.id) ? ' is-active' : ''
                        }`}
                        key={day.id}
                        type="button"
                        onClick={() => toggleScheduleDay(day.id)}
                        aria-pressed={scheduleDays.includes(day.id)}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pro-field pro-field--split">
                  <div>
                    <label className="pro-label" htmlFor="schedule-start">
                      Начало
                    </label>
                    <input
                      id="schedule-start"
                      className="pro-input"
                      type="time"
                      value={scheduleStart}
                      onChange={(event) => setScheduleStart(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="pro-label" htmlFor="schedule-end">
                      Окончание
                    </label>
                    <input
                      id="schedule-end"
                      className="pro-input"
                      type="time"
                      value={scheduleEnd}
                      onChange={(event) => setScheduleEnd(event.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {activeSection === 'portfolio' && (
              <>
                <div className="pro-field">
                  <span className="pro-label">Витрина работ</span>
                  <div className="pro-portfolio-add">
                    <input
                      className="pro-input"
                      type="url"
                      value={portfolioInput}
                      onChange={(event) => setPortfolioInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addPortfolio()
                        }
                      }}
                      placeholder="Ссылка на фото или видео"
                    />
                    <input
                      className="pro-input"
                      type="text"
                      value={portfolioTitleInput}
                      onChange={(event) =>
                        setPortfolioTitleInput(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addPortfolio()
                        }
                      }}
                      placeholder="Подпись (опционально)"
                    />
                    <button className="pro-add" type="button" onClick={addPortfolio}>
                      Добавить
                    </button>
                  </div>
                </div>
                <div className="pro-portfolio-grid">
                  {visiblePortfolio.length > 0 ? (
                    visiblePortfolio.map((item, index) => {
                      const showImage = isImageUrl(item.url)
                      return (
                        <div
                          className="pro-portfolio-card"
                          key={`${item.url}-${index}`}
                        >
                          <div
                            className={`pro-portfolio-thumb${
                              showImage ? ' has-image' : ''
                            }`}
                            style={
                              showImage
                                ? { backgroundImage: `url(${item.url})` }
                                : undefined
                            }
                          >
                            {!showImage && (
                              <span className="pro-portfolio-thumb-label">LINK</span>
                            )}
                          </div>
                          <div className="pro-portfolio-body">
                            <input
                              className="pro-portfolio-title"
                              type="text"
                              value={item.title ?? ''}
                              onChange={(event) =>
                                updatePortfolioItem(index, {
                                  title: event.target.value,
                                })
                              }
                              placeholder="Подпись (опционально)"
                            />
                            <a
                              className="pro-portfolio-link"
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Открыть работу
                            </a>
                          </div>
                          <button
                            className="pro-portfolio-remove"
                            type="button"
                            onClick={() => removePortfolio(index)}
                            aria-label="Удалить работу"
                          >
                            ×
                          </button>
                        </div>
                      )
                    })
                  ) : (
                    <div className="pro-portfolio-empty">
                      Добавьте 3-6 лучших работ, чтобы клиенты сразу видели стиль.
                    </div>
                  )}
                </div>
                {hasMorePortfolio && (
                  <button
                    className="pro-ghost pro-portfolio-toggle"
                    type="button"
                    onClick={() => setShowAllPortfolio((current) => !current)}
                  >
                    {showAllPortfolio ? 'Свернуть' : 'Показать все'}
                  </button>
                )}
              </>
            )}
          </div>
        </section>

            <div className="pro-actions">
              <div className={`pro-autosave ${autosaveTone}`}>
                <span className="pro-autosave-dot" aria-hidden="true" />
                <span className="pro-autosave-text">{autosaveLabel}</span>
              </div>
              <button
                className="pro-secondary"
                type="button"
                onClick={onViewRequests}
              >
                Перейти к заявкам
              </button>
            </div>

            {saveError && <p className="pro-error">{saveError}</p>}
            {saveSuccess && <p className="pro-success">{saveSuccess}</p>}
          </>
        )}
      </div>

      <ProBottomNav
        active="profile"
        onCabinet={onBack}
        onRequests={onViewRequests}
        onProfile={() => {}}
      />
    </div>
  )
}
