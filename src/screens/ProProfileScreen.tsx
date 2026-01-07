import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { categoryItems } from '../data/clientData'
import { requestServiceCatalog } from '../data/requestData'
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
  onBackHandlerChange?: ((handler: (() => boolean) | null) => void) | undefined
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

type InlineSection = Exclude<ProProfileSection, 'availability'>
type CategoryId = (typeof categoryItems)[number]['id']
const isCategoryId = (value: string): value is CategoryId =>
  categoryItems.some((item) => item.id === value)

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
  onBackHandlerChange,
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
  const [serviceCategoryId, setServiceCategoryId] = useState<CategoryId>(
    categoryItems[0]?.id ?? 'beauty-nails'
  )
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
  const [editingSection, setEditingSection] = useState<InlineSection | null>(() =>
    focusSection
      ? focusSection === 'availability'
        ? 'location'
        : focusSection
      : null
  )
  const editingSectionRef = useRef<InlineSection | null>(null)
  const autosaveSuccessTimerRef = useRef<number | null>(null)
  const lastSavedRef = useRef('')
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
  const profilePayload = useMemo<ProfilePayload | null>(() => {
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
  const displayNameValue =
    displayName.trim() || displayNameFallback.trim() || 'Мастер'
  const activeTone = isActive ? 'is-active' : 'is-paused'
  const aboutPreview = about.trim() || 'Описание пока не добавлено.'
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
  const saveButtonLabel = isSaving ? 'Сохраняем...' : 'Сохранить'
  const canSave = Boolean(profilePayload) && !hasInvalidPriceRange && !isSaving
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
      : 'Нет услуг'
  const portfolioSummary =
    portfolioItems.length > 0
      ? formatCount(portfolioItems.length, 'работа', 'работы', 'работ')
      : 'Нет работ'
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
  const normalizeServiceKey = (value: string) => value.trim().toLowerCase()
  const selectedServiceKeys = useMemo(
    () => new Set(serviceItems.map((item) => normalizeServiceKey(item.name))),
    [serviceItems]
  )
  const selectedServiceCategory = useMemo(
    () => categoryItems.find((item) => item.id === serviceCategoryId),
    [serviceCategoryId]
  )
  const serviceCategoryIconStyle = selectedServiceCategory?.icon
    ? ({ '--request-category-icon': `url(${selectedServiceCategory.icon})` } as CSSProperties)
    : undefined
  const serviceCatalogOptions = useMemo(
    () => requestServiceCatalog[serviceCategoryId] ?? [],
    [serviceCategoryId]
  )
  const normalizeSection = (section: ProProfileSection): InlineSection =>
    section === 'availability' ? 'location' : section
  const openEditor = (section: ProProfileSection) => {
    setEditingSection(normalizeSection(section))
  }
  const closeEditor = () => {
    setEditingSection(null)
  }
  const persistSaveMessage = (message: string) => {
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
    editingSectionRef.current = editingSection
  }, [editingSection])

  useEffect(() => {
    if (!onBackHandlerChange) return
    const handler = () => {
      if (editingSectionRef.current) {
        setEditingSection(null)
        return true
      }
      return false
    }
    onBackHandlerChange(handler)
    return () => {
      onBackHandlerChange(null)
    }
  }, [onBackHandlerChange])

  useEffect(() => {
    if (!focusSection) return
    setEditingSection(focusSection === 'availability' ? 'location' : focusSection)
  }, [focusSection])

  useEffect(() => {
    if (!editingSection) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [editingSection])

  useEffect(() => {
    hasLoadedRef.current = false
    lastSavedRef.current = ''
    queuedPayloadRef.current = null
  }, [userId])

  useEffect(() => {
    return () => {
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
        const fallbackCategoryId = categoryItems[0]?.id ?? 'beauty-nails'
        const nextServiceCategoryId =
          nextCategories.find((categoryId) => isCategoryId(categoryId)) ??
          fallbackCategoryId
        setServiceCategoryId(nextServiceCategoryId)
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

  const saveProfile = async (payload: ProfilePayload) => {
    if (!payload.userId) return false
    if (isSavingRef.current) {
      queuedPayloadRef.current = payload
      return false
    }
    if (
      payload.priceFrom !== null &&
      payload.priceTo !== null &&
      payload.priceFrom > payload.priceTo
    ) {
      setSaveError(PRICE_RANGE_ERROR)
      persistSaveMessage('')
      return false
    }

    const payloadKey = JSON.stringify(payload)
    if (payloadKey === lastSavedRef.current) return true

    setSaveError('')
    persistSaveMessage('')
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
      persistSaveMessage(
        summary.missingFields.length > 0 ? 'Черновик сохранен' : 'Сохранено'
      )
      lastSavedRef.current = payloadKey
      return true
    } catch (error) {
      setSaveError('Не удалось сохранить профиль. Попробуйте еще раз.')
      return false
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

  const handleSave = async () => {
    if (!profilePayload) return
    const saved = await saveProfile(profilePayload)
    if (saved) {
      closeEditor()
    }
  }

  const handleServiceCategoryChange = (categoryId: CategoryId) => {
    setServiceCategoryId(categoryId)
  }

  const syncCategorySelection = (categoryId: string, nextItems: ServiceItem[]) => {
    if (!categoryId) return
    const optionNames = new Set(
      (requestServiceCatalog[categoryId] ?? []).map((option) =>
        normalizeServiceKey(option.title)
      )
    )
    const hasAny = nextItems.some((item) =>
      optionNames.has(normalizeServiceKey(item.name))
    )
    setCategories((current) => {
      const next = new Set(current)
      if (hasAny) {
        next.add(categoryId)
      } else {
        next.delete(categoryId)
      }
      return Array.from(next)
    })
  }

  const toggleCatalogService = (serviceTitle: string) => {
    if (!serviceTitle.trim()) return
    setServiceItems((current) => {
      const key = normalizeServiceKey(serviceTitle)
      const index = current.findIndex(
        (item) => normalizeServiceKey(item.name) === key
      )
      const next =
        index === -1
          ? [...current, { name: serviceTitle, price: null, duration: null }]
          : current.filter((_, itemIndex) => itemIndex !== index)
      syncCategorySelection(serviceCategoryId, next)
      return next
    })
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
    setServiceItems((current) => {
      const removed = current[index]
      const next = current.filter((_, itemIndex) => itemIndex !== index)
      if (removed) {
        const removedKey = normalizeServiceKey(removed.name)
        const matchedCategory = Object.entries(requestServiceCatalog).find(
          ([, options]) =>
            options.some(
              (option) => normalizeServiceKey(option.title) === removedKey
            )
        )?.[0]
        if (matchedCategory) {
          syncCategorySelection(matchedCategory, next)
        }
      }
      return next
    })
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

  return (
    <div className="screen screen--pro">
      <div className="pro-shell">
        <section className="pro-profile-social animate delay-1">
          <div
            className={`pro-profile-social-cover${coverUrl ? ' has-image' : ''}${
              isCoverUploading ? ' is-loading' : ''
            }`}
            style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
            aria-busy={isCoverUploading}
          >
            <div className="pro-profile-social-glow" aria-hidden="true" />
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
            <div className="pro-profile-cover-actions">
              <button
                className="pro-cover-action"
                type="button"
                onClick={handleCoverSelect}
                disabled={isCoverUploading}
              >
                {isCoverUploading
                  ? 'Загрузка...'
                  : coverUrl
                    ? 'Сменить обложку'
                    : 'Добавить обложку'}
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
          <div className="pro-profile-social-body">
            <div
              className={`pro-profile-social-avatar${
                isAvatarUploading ? ' is-loading' : ''
              }`}
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
            <div className="pro-profile-social-content">
              <div className="pro-profile-social-header">
                <h1 className="pro-profile-social-name">{displayNameValue}</h1>
                <button
                  className={`pro-profile-social-status ${activeTone}`}
                  type="button"
                  onClick={() => setIsActive((current) => !current)}
                >
                  <span className="pro-profile-social-dot" aria-hidden="true" />
                  {isActive ? 'Принимаю заявки' : 'Пауза'}
                </button>
              </div>
              <div className="pro-profile-social-tags">
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
                    Теги появятся здесь
                  </span>
                )}
              </div>
              <p
                className={`pro-profile-social-about${
                  about.trim() ? '' : ' is-muted'
                }`}
              >
                {aboutPreview}
              </p>
            </div>
          </div>
          <div className="pro-profile-social-actions">
            <button
              className="pro-profile-action is-primary"
              type="button"
              onClick={onViewRequests}
            >
              К заявкам
            </button>
          </div>
        </section>

        {isLoading && <p className="pro-status">Загружаем профиль...</p>}
        {loadError && <p className="pro-error">{loadError}</p>}
        {mediaError && <p className="pro-error">{mediaError}</p>}

        <section className="pro-profile-cards animate delay-2">
          <button
            className="pro-profile-card"
            type="button"
            onClick={() => openEditor('basic')}
          >
            <span className="pro-profile-card-icon" aria-hidden="true">
              👤
            </span>
            <span className="pro-profile-card-content">
              <span className="pro-profile-card-title">О себе</span>
              <span
                className={`pro-profile-card-value${
                  about.trim() ? '' : ' is-muted'
                }`}
              >
                {aboutPreview}
              </span>
              <span className="pro-profile-card-meta">{experienceLabel}</span>
            </span>
            <span className="pro-profile-card-chevron" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-profile-card"
            type="button"
            onClick={() => openEditor('location')}
          >
            <span className="pro-profile-card-icon" aria-hidden="true">
              📍
            </span>
            <span className="pro-profile-card-content">
              <span className="pro-profile-card-title">Работа</span>
              <span className="pro-profile-card-value">{locationLabel}</span>
              <span className="pro-profile-card-meta">{workFormatLabel}</span>
              <span className="pro-profile-card-meta">{scheduleSummary}</span>
            </span>
            <span className="pro-profile-card-chevron" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-profile-card"
            type="button"
            onClick={() => openEditor('services')}
          >
            <span className="pro-profile-card-icon" aria-hidden="true">
              💸
            </span>
            <span className="pro-profile-card-content">
              <span className="pro-profile-card-title">Услуги и цены</span>
              <span className="pro-profile-card-value">{servicesSummary}</span>
              <span className="pro-profile-card-meta">{priceLabel}</span>
            </span>
            <span className="pro-profile-card-chevron" aria-hidden="true">
              ›
            </span>
          </button>
          <button
            className="pro-profile-card"
            type="button"
            onClick={() => openEditor('portfolio')}
          >
            <span className="pro-profile-card-icon" aria-hidden="true">
              🖼️
            </span>
            <span className="pro-profile-card-content">
              <span className="pro-profile-card-title">Портфолио</span>
              <span className="pro-profile-card-value">{portfolioSummary}</span>
              {portfolioPreview.length > 0 ? (
                <span className="pro-profile-portfolio">
                  {portfolioPreview.map((item, index) => {
                    const showImage = isImageUrl(item.url)
                    return (
                      <span
                        key={`${item.url}-${index}`}
                        className={`pro-profile-portfolio-thumb${
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
                </span>
              ) : (
                <span className="pro-profile-card-meta is-muted">
                  Пока нет работ
                </span>
              )}
            </span>
            <span className="pro-profile-card-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        </section>

        <div className="pro-profile-footer">
          {saveError && <p className="pro-error">{saveError}</p>}
          {saveSuccess && <p className="pro-success">{saveSuccess}</p>}
        </div>
      </div>

      {editingSection && (
        <div className="pro-profile-editor-screen" role="dialog" aria-modal="true">
          <div className="pro-profile-editor-shell">
            <section className="pro-profile-editor-card">
              {editingSection === 'basic' && (
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
                      rows={4}
                    />
                  </div>
                </>
              )}

              {editingSection === 'location' && (
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
                          onChange={(event) =>
                            setWorksAtMaster(event.target.checked)
                          }
                        />
                        У мастера
                      </label>
                      <label className="pro-toggle">
                        <input
                          type="checkbox"
                          checked={worksAtClient}
                          onChange={(event) =>
                            setWorksAtClient(event.target.checked)
                          }
                        />
                        Выезд к клиенту
                      </label>
                    </div>
                  </div>
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

              {editingSection === 'services' && (
                <>
                  <div className="pro-field">
                    <span className="pro-label">Категория</span>
                    <select
                      className="request-select-input"
                      value={serviceCategoryId}
                      onChange={(event) =>
                        handleServiceCategoryChange(event.target.value as CategoryId)
                      }
                      style={serviceCategoryIconStyle}
                      aria-label="Категория"
                    >
                      {categoryItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="pro-field">
                    <div
                      className="request-service-grid"
                      role="list"
                      aria-label="Выберите услуги"
                    >
                      {serviceCatalogOptions.map((option) => {
                        const optionKey = normalizeServiceKey(option.title)
                        const isSelected = selectedServiceKeys.has(optionKey)
                        return (
                          <button
                            className={`request-service-card${
                              isSelected ? ' is-active' : ''
                            }`}
                            key={option.title}
                            type="button"
                            onClick={() => toggleCatalogService(option.title)}
                            aria-pressed={isSelected}
                          >
                            <span className="request-service-text">
                              <span className="request-service-title">
                                {option.title}
                              </span>
                              <span className="request-service-subtitle">
                                {option.subtitle}
                              </span>
                            </span>
                            <span
                              className="request-service-indicator"
                              aria-hidden="true"
                            />
                          </button>
                        )
                      })}
                    </div>
                    {serviceCatalogOptions.length === 0 && (
                      <p className="request-helper">
                        Пока нет услуг для этой категории.
                      </p>
                    )}
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
                              <span className="pro-service-name">{service.name}</span>
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
                      <div className="pro-service-empty">Пока нет услуг.</div>
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

              {editingSection === 'portfolio' && (
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
                      <div className="pro-portfolio-empty">Пока нет работ.</div>
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
            </section>
            {(saveError || saveSuccess) && (
              <div className="pro-profile-editor-messages">
                {saveError && <p className="pro-error">{saveError}</p>}
                {saveSuccess && <p className="pro-success">{saveSuccess}</p>}
              </div>
            )}
            <div className="pro-profile-editor-actions">
              <button
                className="pro-profile-action is-primary pro-profile-editor-save"
                type="button"
                onClick={handleSave}
                disabled={!canSave}
              >
                {saveButtonLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {!editingSection && (
        <ProBottomNav
          active="profile"
          onCabinet={onBack}
          onRequests={onViewRequests}
          onProfile={() => {}}
        />
      )}
    </div>
  )
}
