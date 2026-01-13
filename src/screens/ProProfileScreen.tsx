import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, DragEvent, PointerEvent } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import {
  IconClock,
  IconHome,
  IconList,
  IconPin,
  IconSettings,
  IconUser,
} from '../components/icons'
import { categoryItems } from '../data/clientData'
import { requestServiceCatalog } from '../data/requestData'
import type {
  City,
  District,
  MasterProfile,
  MasterReview,
  MasterReviewSummary,
  ProProfileSection,
  UserLocation,
} from '../types/app'
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
import { isGeoFailure, requestPreciseLocation } from '../utils/geo'

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

const getServicePriceRange = (items: ServiceItem[]) => {
  const prices = items
    .map((item) => item.price)
    .filter((value): value is number => typeof value === 'number' && value > 0)
  if (prices.length === 0) {
    return { min: null, max: null }
  }
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  }
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

const formatReviewCount = (value: number) =>
  formatCount(value, 'отзыв', 'отзыва', 'отзывов')

const formatFollowerCount = (value: number) =>
  formatCount(value, 'подписчик', 'подписчика', 'подписчиков')

const buildReviewStars = (value: number) => {
  const clamped = Math.max(0, Math.min(5, Math.round(value)))
  return Array.from({ length: 5 }, (_, index) => (index < clamped ? '★' : '☆')).join(
    ''
  )
}

const formatReviewDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
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

const buildReviewerName = (review: MasterReview) => {
  const name = [review.reviewerFirstName, review.reviewerLastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  if (name) return name
  if (review.reviewerUsername) return `@${review.reviewerUsername}`
  return 'Клиент'
}

const getNameInitials = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return 'К'
  const parts = normalized.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0] ?? '')
  const joined = letters.join('').toUpperCase()
  if (joined) return joined
  return normalized.slice(0, 2).toUpperCase()
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value))

const resolvePortfolioFocus = (item?: PortfolioItem | null) => {
  const rawX = typeof item?.focusX === 'number' ? item.focusX : 0.5
  const rawY = typeof item?.focusY === 'number' ? item.focusY : 0.5
  const x = clampUnit(rawX)
  const y = clampUnit(rawY)
  return {
    x,
    y,
    position: `${x * 100}% ${y * 100}%`,
  }
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

type InlineSection = Exclude<ProProfileSection, 'portfolio'>
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
  showcaseUrls: string[]
}

const MAX_MEDIA_BYTES = 3 * 1024 * 1024
const MAX_PORTFOLIO_ITEMS = 30
const MAX_SHOWCASE_ITEMS = 6
const PORTFOLIO_ROW_LIMIT = 4
const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const showcaseSlotClasses = [
  'is-slot-portrait-a',
  'is-slot-portrait-b',
  'is-slot-square-a',
  'is-slot-square-b',
  'is-slot-landscape-a',
  'is-slot-landscape-b',
]

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
  const [categories, setCategories] = useState<string[]>([])
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([])
  const [serviceCategoryId, setServiceCategoryId] = useState<CategoryId>(
    categoryItems[0]?.id ?? 'beauty-nails'
  )
  const [isServiceCatalogExpanded, setIsServiceCatalogExpanded] = useState(false)
  const [serviceAddTarget, setServiceAddTarget] = useState<string | null>(null)
  const [serviceAddPrice, setServiceAddPrice] = useState('')
  const [serviceAddDuration, setServiceAddDuration] = useState('')
  const [serviceAddError, setServiceAddError] = useState('')
  const [openServiceMetaKeys, setOpenServiceMetaKeys] = useState<string[]>([])
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([])
  const [showcaseItems, setShowcaseItems] = useState<PortfolioItem[]>([])
  const [portfolioView, setPortfolioView] = useState<'portfolio' | 'showcase'>(
    'portfolio'
  )
  const [worksAtClient, setWorksAtClient] = useState(true)
  const [worksAtMaster, setWorksAtMaster] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [scheduleDays, setScheduleDays] = useState<string[]>([])
  const [scheduleStart, setScheduleStart] = useState('')
  const [scheduleEnd, setScheduleEnd] = useState('')
  const [proLocation, setProLocation] = useState<UserLocation | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [reviews, setReviews] = useState<MasterReview[]>([])
  const [reviewSummary, setReviewSummary] =
    useState<MasterReviewSummary | null>(null)
  const [followersCount, setFollowersCount] = useState(0)
  const [isReviewsLoading, setIsReviewsLoading] = useState(false)
  const [reviewsError, setReviewsError] = useState('')
  const [isAvatarUploading, setIsAvatarUploading] = useState(false)
  const [isCoverUploading, setIsCoverUploading] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [portfolioLightboxIndex, setPortfolioLightboxIndex] = useState<
    number | null
  >(null)
  const [isPortfolioExpanded, setIsPortfolioExpanded] = useState(false)
  const [isPortfolioPickerOpen, setIsPortfolioPickerOpen] = useState(false)
  const [portfolioQuickActionIndex, setPortfolioQuickActionIndex] = useState<
    number | null
  >(null)
  const [showcaseDragOverIndex, setShowcaseDragOverIndex] = useState<
    number | null
  >(null)
  const [isPortfolioUploading, setIsPortfolioUploading] = useState(false)
  const [isShowcaseUploading, setIsShowcaseUploading] = useState(false)
  const [portfolioError, setPortfolioError] = useState('')
  const [showcaseError, setShowcaseError] = useState('')
  const [portfolioFocusIndex, setPortfolioFocusIndex] = useState<number | null>(
    null
  )
  const [showcaseFocusIndex, setShowcaseFocusIndex] = useState<number | null>(
    null
  )
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const portfolioUploadInputRef = useRef<HTMLInputElement>(null)
  const portfolioCameraInputRef = useRef<HTMLInputElement>(null)
  const portfolioReplaceInputRef = useRef<HTMLInputElement>(null)
  const portfolioReplaceIndexRef = useRef<number | null>(null)
  const showcaseUploadInputRef = useRef<HTMLInputElement>(null)
  const showcaseReplaceInputRef = useRef<HTMLInputElement>(null)
  const showcaseReplaceIndexRef = useRef<number | null>(null)
  const showcaseDragIndexRef = useRef<number | null>(null)
  const portfolioFocusPointerRef = useRef(false)
  const showcaseFocusPointerRef = useRef(false)
  const portfolioLightboxIndexRef = useRef<number | null>(null)
  const portfolioFocusIndexRef = useRef<number | null>(null)
  const showcaseFocusIndexRef = useRef<number | null>(null)
  const portfolioPanelRef = useRef<HTMLElement | null>(null)
  const portfolioAutosaveTimerRef = useRef<number | null>(null)
  const portfolioLongPressTimerRef = useRef<number | null>(null)
  const portfolioLongPressTriggeredRef = useRef(false)
  const portfolioLongPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const [editingSection, setEditingSection] = useState<InlineSection | null>(() =>
    focusSection && focusSection !== 'portfolio' ? focusSection : null
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
  const showcaseStrings = useMemo(
    () => toPortfolioStrings(showcaseItems),
    [showcaseItems]
  )
  const portfolioAutosaveKey = useMemo(
    () =>
      JSON.stringify({
        portfolio: portfolioStrings,
        showcase: showcaseStrings,
      }),
    [portfolioStrings, showcaseStrings]
  )
  const servicePriceRange = useMemo(
    () => getServicePriceRange(serviceItems),
    [serviceItems]
  )
  const priceFromValue = servicePriceRange.min
  const priceToValue = servicePriceRange.max
  const profilePayload = useMemo<ProfilePayload | null>(() => {
    if (!userId) return null
    const normalizedName = displayName.trim()
    return {
      userId,
      displayName: normalizedName,
      about: about.trim() || null,
      cityId,
      districtId,
      experienceYears: parseNumber(experienceYears),
      priceFrom: priceFromValue,
      priceTo: priceToValue,
      isActive,
      scheduleDays: [...scheduleDays],
      scheduleStart: scheduleStart.trim() || null,
      scheduleEnd: scheduleEnd.trim() || null,
      worksAtClient,
      worksAtMaster,
      categories: [...categories],
      services: [...serviceStrings],
      portfolioUrls: [...portfolioStrings],
      showcaseUrls: [...showcaseStrings],
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
    priceFromValue,
    priceToValue,
    scheduleDays,
    scheduleEnd,
    scheduleStart,
    showcaseStrings,
    serviceStrings,
    userId,
    worksAtClient,
    worksAtMaster,
  ])
  const displayNameValue =
    displayName.trim() || displayNameFallback.trim() || 'Мастер'
  const aboutPreview = about.trim() || 'Статус пока не добавлен.'
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
  const saveButtonLabel = isSaving ? 'Сохраняем...' : 'Сохранить'
  const canSave = Boolean(profilePayload) && !isSaving
  const priceLabel =
    priceFromValue !== null && priceToValue !== null
      ? `${priceFromValue}–${priceToValue} ₽`
      : priceFromValue !== null
        ? `от ${priceFromValue} ₽`
        : priceToValue !== null
          ? `до ${priceToValue} ₽`
          : 'Цена не указана'
  const servicePriceLabel =
    priceFromValue !== null || priceToValue !== null ? priceLabel : 'Нет цены'
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
  const reviewCount = reviewSummary?.count ?? 0
  const reviewAverage = reviewSummary?.average ?? 0
  const reviewDistribution = reviewSummary?.distribution ?? []
  const reviewCountLabel =
    reviewCount > 0 ? formatReviewCount(reviewCount) : 'Нет отзывов'
  const followersCountLabel =
    followersCount > 0 ? formatFollowerCount(followersCount) : 'Нет подписчиков'
  const followersValue = followersCount.toLocaleString('ru-RU')
  const portfolioCount = portfolioItems.filter((item) => item.url.trim()).length
  const showcaseCount = showcaseItems.length
  const portfolioCountLabel = `${portfolioCount} из ${MAX_PORTFOLIO_ITEMS}`
  const showcaseCountLabel = `${showcaseCount} из ${MAX_SHOWCASE_ITEMS}`
  const portfolioPanelCountLabel =
    portfolioView === 'portfolio' ? portfolioCountLabel : showcaseCountLabel
  const reviewAverageLabel = reviewCount > 0 ? reviewAverage.toFixed(1) : '—'
  const profileStats = [
    { label: 'Работы', value: String(portfolioCount) },
    { label: 'Рейтинг', value: reviewAverageLabel },
    { label: 'Отзывы', value: String(reviewCount) },
    { label: 'Подписчики', value: followersValue },
  ]
  const locationLabel = useMemo(() => {
    const cityLabel = cityId
      ? cities.find((city) => city.id === cityId)?.name
      : ''
    const districtLabel = districtId
      ? districts.find((district) => district.id === districtId)?.name
      : ''
    return [cityLabel, districtLabel].filter(Boolean).join(', ') || 'Город не указан'
  }, [cities, cityId, districts, districtId])
  const hasLocation = cityId !== null || districtId !== null
  const hasWorkFormat = worksAtClient || worksAtMaster
  const hasPrice = priceFromValue !== null || priceToValue !== null
  const hasExperience = experienceValue !== null
  const profileFacts = [
    {
      id: 'location',
      label: 'Локация',
      value: locationLabel,
      icon: <IconPin />,
      isMuted: !hasLocation,
    },
    {
      id: 'format',
      label: 'Формат',
      value: workFormatLabel,
      icon: <IconHome />,
      isMuted: !hasWorkFormat,
    },
    {
      id: 'price',
      label: 'Цена',
      value: priceLabel,
      icon: <IconList />,
      isMuted: !hasPrice,
    },
    {
      id: 'experience',
      label: 'Опыт',
      value: experienceLabel,
      icon: <IconClock />,
      isMuted: !hasExperience,
    },
  ]
  const hasGeoLocation =
    typeof proLocation?.lat === 'number' && typeof proLocation?.lng === 'number'
  const geoUpdatedLabel = proLocation?.updatedAt
    ? new Date(proLocation.updatedAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  const geoAccuracyLabel =
    typeof proLocation?.accuracy === 'number'
      ? `Точность ~${proLocation.accuracy} м`
      : ''
  const isGeoLowAccuracy =
    typeof proLocation?.accuracy === 'number' && proLocation.accuracy > 1500
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
  const portfolioGridItems = useMemo(
    () =>
      portfolioItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.url.trim())
        .slice(0, MAX_PORTFOLIO_ITEMS),
    [portfolioItems]
  )
  const portfolioRecentItems = useMemo(
    () =>
      portfolioItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.url.trim() && isImageUrl(item.url))
        .slice(0, 6),
    [portfolioItems]
  )
  const hasShowcase = showcaseItems.length > 0
  const showShowcaseAddTile = showcaseItems.length < MAX_SHOWCASE_ITEMS
  const showcaseMosaicItems = showShowcaseAddTile
    ? [...showcaseItems, null]
    : showcaseItems
  const showcaseSubtitle = hasShowcase
    ? `Работ в витрине: ${showcaseCountLabel}`
    : `Добавьте до ${MAX_SHOWCASE_ITEMS} лучших работ`
  const isPortfolioFull = portfolioItems.length >= MAX_PORTFOLIO_ITEMS
  const portfolioLightboxItem =
    portfolioLightboxIndex !== null ? portfolioItems[portfolioLightboxIndex] ?? null : null
  const portfolioLightboxFocus = resolvePortfolioFocus(portfolioLightboxItem)
  const isLightboxImage = portfolioLightboxItem
    ? isImageUrl(portfolioLightboxItem.url)
    : false
  const isLightboxInShowcase = portfolioLightboxItem
    ? showcaseItems.some((item) => item.url === portfolioLightboxItem.url)
    : false
  const portfolioQuickActionItem =
    portfolioQuickActionIndex !== null
      ? portfolioItems[portfolioQuickActionIndex] ?? null
      : null
  const isQuickActionInShowcase = portfolioQuickActionItem
    ? showcaseItems.some((item) => item.url === portfolioQuickActionItem.url)
    : false
  const quickActionFocus = resolvePortfolioFocus(portfolioQuickActionItem)
  const isPortfolioOverlayOpen =
    portfolioLightboxIndex !== null ||
    portfolioFocusIndex !== null ||
    showcaseFocusIndex !== null ||
    isPortfolioPickerOpen ||
    portfolioQuickActionIndex !== null
  const focusItem =
    portfolioFocusIndex !== null ? portfolioItems[portfolioFocusIndex] ?? null : null
  const focusPoint = resolvePortfolioFocus(focusItem)
  const focusIndex = portfolioFocusIndex ?? 0
  const showcaseFocusItem =
    showcaseFocusIndex !== null ? showcaseItems[showcaseFocusIndex] ?? null : null
  const showcaseFocusPoint = resolvePortfolioFocus(showcaseFocusItem)
  const showcaseFocusIndexValue = showcaseFocusIndex ?? 0
  const hasPortfolioOverflow = portfolioGridItems.length > PORTFOLIO_ROW_LIMIT
  const isPortfolioCollapsed = !isPortfolioExpanded
  const visiblePortfolioItems = portfolioGridItems
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
  const availableServiceOptions = useMemo(
    () =>
      serviceCatalogOptions.filter(
        (option) => !selectedServiceKeys.has(normalizeServiceKey(option.title))
      ),
    [serviceCatalogOptions, selectedServiceKeys]
  )
  const visibleServiceOptions = useMemo(() => {
    if (isServiceCatalogExpanded) {
      return availableServiceOptions
    }
    return availableServiceOptions.slice(0, 6)
  }, [availableServiceOptions, isServiceCatalogExpanded])
  const hasMoreServiceOptions = availableServiceOptions.length > 6
  const parsedServiceAddPrice = parseNumber(serviceAddPrice)
  const isServiceAddReady =
    parsedServiceAddPrice !== null && parsedServiceAddPrice > 0
  const selectedServicesCount = serviceItems.length
  const selectedServicesLabel =
    selectedServicesCount > 0
      ? formatCount(selectedServicesCount, 'услуга', 'услуги', 'услуг')
      : 'Нет услуг'
  const selectedInCategoryCount = serviceCatalogOptions.filter((option) =>
    selectedServiceKeys.has(normalizeServiceKey(option.title))
  ).length
  const categorySelectionLabel =
    serviceCatalogOptions.length > 0
      ? `${selectedInCategoryCount}/${serviceCatalogOptions.length}`
      : '0'
  const openPortfolioLightbox = (index: number) => {
    if (!portfolioItems[index]) return
    setPortfolioError('')
    setPortfolioLightboxIndex(index)
  }
  const closePortfolioLightbox = () => {
    setPortfolioLightboxIndex(null)
    setPortfolioError('')
    setPortfolioFocusIndex(null)
    portfolioFocusPointerRef.current = false
  }
  const openPortfolioPicker = () => {
    setPortfolioError('')
    setIsPortfolioPickerOpen(true)
  }
  const closePortfolioPicker = () => {
    setIsPortfolioPickerOpen(false)
  }
  const openPortfolioQuickActions = (index: number) => {
    if (!portfolioItems[index]) return
    setPortfolioError('')
    setPortfolioQuickActionIndex(index)
  }
  const openMediaEditor = () => {
    if (isAvatarUploading || isCoverUploading) return
    setEditingSection('media')
  }
  const openEditor = (section: ProProfileSection) => {
    if (section === 'portfolio') {
      portfolioPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      return
    }
    setEditingSection(section)
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

  const setLocationState = (location: UserLocation | null) => {
    setProLocation(location)
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
            shareToClients: true,
            shareToMasters: true,
          }),
        })

        if (!response.ok) {
          throw new Error('Save location failed')
        }

        const data = (await response.json()) as { location?: UserLocation | null }
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

  useEffect(() => {
    editingSectionRef.current = editingSection
  }, [editingSection])

  useEffect(() => {
    portfolioLightboxIndexRef.current = portfolioLightboxIndex
  }, [portfolioLightboxIndex])

  useEffect(() => {
    portfolioFocusIndexRef.current = portfolioFocusIndex
  }, [portfolioFocusIndex])

  useEffect(() => {
    showcaseFocusIndexRef.current = showcaseFocusIndex
  }, [showcaseFocusIndex])

  useEffect(() => {
    if (!onBackHandlerChange) return
    const handler = () => {
      if (showcaseFocusIndexRef.current !== null) {
        closeShowcaseFocusEditor()
        return true
      }
      if (portfolioFocusIndexRef.current !== null) {
        closePortfolioFocusEditor()
        return true
      }
      if (portfolioLightboxIndexRef.current !== null) {
        closePortfolioLightbox()
        return true
      }
      if (portfolioQuickActionIndex !== null) {
        setPortfolioQuickActionIndex(null)
        return true
      }
      if (isPortfolioPickerOpen) {
        setIsPortfolioPickerOpen(false)
        return true
      }
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
  }, [isPortfolioPickerOpen, onBackHandlerChange, portfolioQuickActionIndex])

  useEffect(() => {
    if (!focusSection) return
    if (focusSection === 'portfolio') {
      portfolioPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      return
    }
    setEditingSection(focusSection)
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
    if (!isPortfolioOverlayOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isPortfolioOverlayOpen])

  useEffect(() => {
    if (portfolioFocusIndex !== null && !portfolioItems[portfolioFocusIndex]) {
      setPortfolioFocusIndex(null)
      portfolioFocusPointerRef.current = false
    }
  }, [portfolioFocusIndex, portfolioItems])

  useEffect(() => {
    if (showcaseFocusIndex !== null && !showcaseItems[showcaseFocusIndex]) {
      setShowcaseFocusIndex(null)
      showcaseFocusPointerRef.current = false
    }
  }, [showcaseFocusIndex, showcaseItems])

  useEffect(() => {
    if (
      portfolioLightboxIndex !== null &&
      !portfolioItems[portfolioLightboxIndex]
    ) {
      setPortfolioLightboxIndex(null)
    }
  }, [portfolioItems, portfolioLightboxIndex])

  useEffect(() => {
    if (
      portfolioQuickActionIndex !== null &&
      !portfolioItems[portfolioQuickActionIndex]
    ) {
      setPortfolioQuickActionIndex(null)
    }
  }, [portfolioItems, portfolioQuickActionIndex])

  useEffect(() => {
    if (!profilePayload) return
    if (!hasLoadedRef.current) return
    if (isPortfolioUploading || isShowcaseUploading) return
    if (portfolioAutosaveTimerRef.current) {
      window.clearTimeout(portfolioAutosaveTimerRef.current)
    }
    portfolioAutosaveTimerRef.current = window.setTimeout(() => {
      void saveProfile(profilePayload)
    }, 700)
    return () => {
      if (portfolioAutosaveTimerRef.current) {
        window.clearTimeout(portfolioAutosaveTimerRef.current)
      }
    }
  }, [isPortfolioUploading, isShowcaseUploading, portfolioAutosaveKey])

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
      if (portfolioAutosaveTimerRef.current) {
        window.clearTimeout(portfolioAutosaveTimerRef.current)
      }
      if (portfolioLongPressTimerRef.current) {
        window.clearTimeout(portfolioLongPressTimerRef.current)
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
        const nextIsActive = data.isActive ?? true
        const nextScheduleDays = data.scheduleDays ?? []
        const nextScheduleStart = data.scheduleStart ?? ''
        const nextScheduleEnd = data.scheduleEnd ?? ''
        const nextWorksAtClient = data.worksAtClient
        const nextWorksAtMaster = data.worksAtMaster
        const nextCategories = data.categories ?? []
        const nextServiceItems = parseServiceItems(data.services ?? [])
        const nextPortfolioItems = parsePortfolioItems(data.portfolioUrls ?? []).slice(
          0,
          MAX_PORTFOLIO_ITEMS
        )
        const nextShowcaseItems = parsePortfolioItems(data.showcaseUrls ?? []).slice(
          0,
          MAX_SHOWCASE_ITEMS
        )

        setDisplayName(nextDisplayName)
        setAbout(nextAbout)
        setCityId(nextCityId)
        setDistrictId(nextDistrictId)
        setExperienceYears(nextExperienceYears)
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
        setShowcaseItems(nextShowcaseItems)
        setAvatarUrl(data.avatarUrl ?? '')
        setCoverUrl(data.coverUrl ?? '')
        const nextFollowersCount =
          typeof data.followersCount === 'number' &&
          Number.isFinite(data.followersCount)
            ? Math.max(0, Math.round(data.followersCount))
            : 0
        setFollowersCount(nextFollowersCount)

        const nextPriceRange = getServicePriceRange(nextServiceItems)

        lastSavedRef.current = JSON.stringify({
          userId,
          displayName: nextDisplayName.trim(),
          about: nextAbout.trim() || null,
          cityId: nextCityId,
          districtId: nextDistrictId,
          experienceYears: parseNumber(nextExperienceYears),
          priceFrom: nextPriceRange.min,
          priceTo: nextPriceRange.max,
          isActive: nextIsActive,
          scheduleDays: [...nextScheduleDays],
          scheduleStart: nextScheduleStart.trim() || null,
          scheduleEnd: nextScheduleEnd.trim() || null,
          worksAtClient: nextWorksAtClient,
          worksAtMaster: nextWorksAtMaster,
          categories: [...nextCategories],
          services: toServiceStrings(nextServiceItems),
          portfolioUrls: toPortfolioStrings(nextPortfolioItems),
          showcaseUrls: toPortfolioStrings(nextShowcaseItems),
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
    if (!userId) return
    let cancelled = false

    const loadLocation = async () => {
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
        if (!cancelled) {
          setLocationState(data)
        }
      } catch (error) {
        if (!cancelled) {
          setLocationError('Не удалось загрузить геолокацию.')
        }
      }
    }

    loadLocation()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadReviews = async () => {
      setIsReviewsLoading(true)
      setReviewsError('')
      setReviews([])
      setReviewSummary(null)
      try {
        const response = await fetch(
          `${apiBase}/api/masters/${userId}/reviews?limit=6`
        )
        if (!response.ok) {
          throw new Error('Load reviews failed')
        }
        const data = (await response.json()) as {
          summary?: MasterReviewSummary | null
          reviews?: MasterReview[]
        }
        if (!cancelled) {
          setReviewSummary(data.summary ?? null)
          setReviews(Array.isArray(data.reviews) ? data.reviews : [])
        }
      } catch (error) {
        if (!cancelled) {
          setReviewSummary(null)
          setReviews([])
          setReviewsError('Не удалось загрузить отзывы.')
        }
      } finally {
        if (!cancelled) {
          setIsReviewsLoading(false)
        }
      }
    }

    void loadReviews()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  const saveProfile = async (payload: ProfilePayload) => {
    if (!payload.userId) return false
    if (isSavingRef.current) {
      queuedPayloadRef.current = payload
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
      setEditingSection(null)
    }
  }

  const handleServiceCategoryChange = (categoryId: CategoryId) => {
    setServiceCategoryId(categoryId)
  }

  useEffect(() => {
    setIsServiceCatalogExpanded(false)
    setServiceAddTarget(null)
    setServiceAddPrice('')
    setServiceAddDuration('')
    setServiceAddError('')
  }, [serviceCategoryId])

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

  const resetServiceAddForm = () => {
    setServiceAddPrice('')
    setServiceAddDuration('')
    setServiceAddError('')
  }

  const closeServiceAddPanel = () => {
    setServiceAddTarget(null)
    resetServiceAddForm()
  }

  const openServiceAddPanel = (serviceTitle: string) => {
    setServiceAddTarget((current) =>
      current === serviceTitle ? null : serviceTitle
    )
    resetServiceAddForm()
  }

  const handleServiceAdd = () => {
    if (!serviceAddTarget) return
    const parsedPrice = parsedServiceAddPrice
    if (parsedPrice === null || parsedPrice <= 0) {
      setServiceAddError('Укажите цену услуги.')
      return
    }
    const parsedDuration = parseNumber(serviceAddDuration)
    const targetName = serviceAddTarget

    setServiceItems((current) => {
      const key = normalizeServiceKey(targetName)
      const exists = current.some(
        (item) => normalizeServiceKey(item.name) === key
      )
      if (exists) return current
      const next = [
        ...current,
        {
          name: targetName,
          price: parsedPrice,
          duration: parsedDuration,
        },
      ]
      syncCategorySelection(serviceCategoryId, next)
      return next
    })

    closeServiceAddPanel()
  }

  const buildServiceMetaKey = (service: ServiceItem, index: number) =>
    service.name.trim() ? service.name.trim() : `service-${index}`

  const isServiceMetaOpen = (key: string) => openServiceMetaKeys.includes(key)

  const toggleServiceMeta = (key: string) => {
    setOpenServiceMetaKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    )
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
        const removedMetaKey = buildServiceMetaKey(removed, index)
        setOpenServiceMetaKeys((prev) =>
          prev.filter((item) => item !== removedMetaKey)
        )
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

  const validatePortfolioFile = (file: File) => {
    if (!allowedImageTypes.has(file.type)) {
      return 'Поддерживаются только PNG, JPG или WebP.'
    }
    if (file.size > MAX_MEDIA_BYTES) {
      return 'Файл слишком большой. Максимум 3 МБ.'
    }
    return ''
  }

  const readImageFileAsync = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : ''
        if (!result) {
          reject(new Error('read_failed'))
          return
        }
        resolve(result)
      }
      reader.onerror = () => reject(new Error('read_failed'))
      reader.readAsDataURL(file)
    })

  const resolvePortfolioUploadError = (payload: { error?: string } | null) => {
    if (payload?.error === 'image_too_large') {
      return 'Файл слишком большой. Максимум 3 МБ.'
    }
    if (payload?.error === 'invalid_image') {
      return 'Формат изображения не поддерживается.'
    }
    if (payload?.error === 'userId_required') {
      return 'Не удалось загрузить файл. Нет пользователя.'
    }
    return 'Не удалось загрузить файл.'
  }

  const uploadPortfolioDataUrl = async (dataUrl: string) => {
    if (!userId) {
      throw new Error('Не удалось загрузить файл. Нет пользователя.')
    }
    const response = await fetch(`${apiBase}/api/masters/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, dataUrl }),
    })
    const payload = (await response.json().catch(() => null)) as {
      url?: string
      error?: string
    } | null
    if (!response.ok) {
      throw new Error(resolvePortfolioUploadError(payload))
    }
    if (!payload?.url) {
      throw new Error('Не удалось загрузить файл.')
    }
    return payload.url
  }

  const uploadPortfolioFile = async (file: File) => {
    const dataUrl = await readImageFileAsync(file)
    return uploadPortfolioDataUrl(dataUrl)
  }

  const handlePortfolioUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (portfolioItems.length >= MAX_PORTFOLIO_ITEMS) {
      setPortfolioError(`Можно добавить максимум ${MAX_PORTFOLIO_ITEMS} работ.`)
      return
    }
    const remaining = MAX_PORTFOLIO_ITEMS - portfolioItems.length
    const selection = Array.from(files).slice(0, remaining)
    for (const file of selection) {
      const errorMessage = validatePortfolioFile(file)
      if (errorMessage) {
        setPortfolioError(errorMessage)
        return
      }
    }
    setIsPortfolioUploading(true)
    setPortfolioError('')
    try {
      const uploadedUrls: string[] = []
      for (const file of selection) {
        const url = await uploadPortfolioFile(file)
        uploadedUrls.push(url)
      }
      setPortfolioItems((current) => {
        const next = [
          ...uploadedUrls.map((url) => ({
            url,
            title: null,
            focusX: 0.5,
            focusY: 0.5,
          })),
          ...current,
        ]
        return next.slice(0, MAX_PORTFOLIO_ITEMS)
      })
      setPortfolioError('')
    } catch (error) {
      setPortfolioError(
        error instanceof Error ? error.message : 'Не удалось загрузить файл.'
      )
    } finally {
      setIsPortfolioUploading(false)
    }
  }

  const handlePortfolioUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    closePortfolioPicker()
    void handlePortfolioUpload(event.target.files)
    event.target.value = ''
  }

  const handlePortfolioCameraChange = (event: ChangeEvent<HTMLInputElement>) => {
    closePortfolioPicker()
    void handlePortfolioUpload(event.target.files)
    event.target.value = ''
  }

  const handlePortfolioCameraClick = () => {
    if (isPortfolioUploading) return
    setPortfolioError('')
    closePortfolioPicker()
    portfolioCameraInputRef.current?.click()
  }

  const handlePortfolioGalleryClick = () => {
    if (isPortfolioUploading) return
    setPortfolioError('')
    closePortfolioPicker()
    portfolioUploadInputRef.current?.click()
  }

  const handlePortfolioAddClick = () => {
    if (isPortfolioUploading) return
    setPortfolioError('')
    openPortfolioPicker()
  }

  const handlePortfolioReplaceClick = (index: number) => {
    setPortfolioError('')
    setPortfolioQuickActionIndex(null)
    portfolioReplaceIndexRef.current = index
    portfolioReplaceInputRef.current?.click()
  }

  const handlePortfolioReplace = async (file: File, index: number) => {
    const errorMessage = validatePortfolioFile(file)
    if (errorMessage) {
      setPortfolioError(errorMessage)
      return
    }
    const previousUrl = portfolioItems[index]?.url
    setIsPortfolioUploading(true)
    setPortfolioError('')
    try {
      const url = await uploadPortfolioFile(file)
      setPortfolioItems((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index ? { ...item, url, focusX: 0.5, focusY: 0.5 } : item
        )
      )
      if (previousUrl) {
        setShowcaseItems((current) =>
          current.map((item) =>
            item.url === previousUrl
              ? { ...item, url, focusX: 0.5, focusY: 0.5 }
              : item
          )
        )
      }
      setPortfolioError('')
    } catch (error) {
      setPortfolioError(
        error instanceof Error ? error.message : 'Не удалось загрузить файл.'
      )
    } finally {
      setIsPortfolioUploading(false)
    }
  }

  const handlePortfolioReplaceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const index = portfolioReplaceIndexRef.current
    if (!file || index === null || index === undefined) {
      event.target.value = ''
      return
    }
    void handlePortfolioReplace(file, index)
    event.target.value = ''
  }

  const handleShowcaseUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (showcaseItems.length >= MAX_SHOWCASE_ITEMS) {
      setShowcaseError(`Можно добавить максимум ${MAX_SHOWCASE_ITEMS} работ.`)
      return
    }
    const remaining = MAX_SHOWCASE_ITEMS - showcaseItems.length
    const selection = Array.from(files).slice(0, remaining)
    for (const file of selection) {
      const errorMessage = validatePortfolioFile(file)
      if (errorMessage) {
        setShowcaseError(errorMessage)
        return
      }
    }
    setIsShowcaseUploading(true)
    setShowcaseError('')
    try {
      const uploadedUrls: string[] = []
      for (const file of selection) {
        const url = await uploadPortfolioFile(file)
        uploadedUrls.push(url)
      }
      setShowcaseItems((current) => {
        const next = [
          ...uploadedUrls.map((url) => ({
            url,
            title: null,
            focusX: 0.5,
            focusY: 0.5,
          })),
          ...current,
        ]
        return next.slice(0, MAX_SHOWCASE_ITEMS)
      })
      setShowcaseError('')
    } catch (error) {
      setShowcaseError(
        error instanceof Error ? error.message : 'Не удалось загрузить файл.'
      )
    } finally {
      setIsShowcaseUploading(false)
    }
  }

  const handleShowcaseUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleShowcaseUpload(event.target.files)
    event.target.value = ''
  }

  const handleShowcaseAddClick = () => {
    if (isShowcaseUploading) return
    setShowcaseError('')
    showcaseUploadInputRef.current?.click()
  }

  const handleShowcaseReplaceClick = (index: number) => {
    setShowcaseError('')
    showcaseReplaceIndexRef.current = index
    showcaseReplaceInputRef.current?.click()
  }

  const handleShowcaseReplace = async (file: File, index: number) => {
    const errorMessage = validatePortfolioFile(file)
    if (errorMessage) {
      setShowcaseError(errorMessage)
      return
    }
    const previousUrl = showcaseItems[index]?.url
    setIsShowcaseUploading(true)
    setShowcaseError('')
    try {
      const url = await uploadPortfolioFile(file)
      setShowcaseItems((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index ? { ...item, url, focusX: 0.5, focusY: 0.5 } : item
        )
      )
      if (previousUrl) {
        setPortfolioItems((current) =>
          current.map((item) =>
            item.url === previousUrl
              ? { ...item, url, focusX: 0.5, focusY: 0.5 }
              : item
          )
        )
      }
      setShowcaseError('')
    } catch (error) {
      setShowcaseError(
        error instanceof Error ? error.message : 'Не удалось загрузить файл.'
      )
    } finally {
      setIsShowcaseUploading(false)
    }
  }

  const handleShowcaseReplaceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const index = showcaseReplaceIndexRef.current
    if (!file || index === null || index === undefined) {
      event.target.value = ''
      return
    }
    void handleShowcaseReplace(file, index)
    event.target.value = ''
  }

  const removeShowcaseItem = (index: number) => {
    setShowcaseItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    )
    setShowcaseError('')
  }

  const handleShowcaseDragStart = (
    event: DragEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (isShowcaseUploading) return
    showcaseDragIndexRef.current = index
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleShowcaseDragOver = (
    event: DragEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (isShowcaseUploading) return
    event.preventDefault()
    setShowcaseDragOverIndex(index)
  }

  const handleShowcaseDragLeave = () => {
    setShowcaseDragOverIndex(null)
  }

  const handleShowcaseDrop = (index: number, hasItem: boolean) => {
    const fromIndex = showcaseDragIndexRef.current
    const targetIndex = hasItem ? index : showcaseItems.length
    if (fromIndex === null || fromIndex === targetIndex) {
      setShowcaseDragOverIndex(null)
      return
    }
    setShowcaseItems((current) => {
      if (fromIndex < 0 || fromIndex >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
    showcaseDragIndexRef.current = null
    setShowcaseDragOverIndex(null)
  }

  const handleShowcaseDragEnd = () => {
    showcaseDragIndexRef.current = null
    setShowcaseDragOverIndex(null)
  }

  const openShowcaseFocusEditor = (index: number) => {
    const item = showcaseItems[index]
    if (!item || !isImageUrl(item.url)) return
    setShowcaseFocusIndex(index)
  }

  const closeShowcaseFocusEditor = () => {
    setShowcaseFocusIndex(null)
    showcaseFocusPointerRef.current = false
  }

  const updateShowcaseFocusFromEvent = (
    event: PointerEvent<HTMLDivElement>,
    index: number
  ) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clampUnit((event.clientX - rect.left) / rect.width)
    const y = clampUnit((event.clientY - rect.top) / rect.height)
    const focusUrl = showcaseItems[index]?.url
    setShowcaseItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, focusX: x, focusY: y } : item
      )
    )
    if (focusUrl) {
      setPortfolioItems((current) =>
        current.map((item) =>
          item.url === focusUrl ? { ...item, focusX: x, focusY: y } : item
        )
      )
    }
  }

  const handleShowcaseFocusPointerDown = (
    event: PointerEvent<HTMLDivElement>,
    index: number
  ) => {
    showcaseFocusPointerRef.current = true
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    updateShowcaseFocusFromEvent(event, index)
  }

  const handleShowcaseFocusPointerMove = (
    event: PointerEvent<HTMLDivElement>,
    index: number
  ) => {
    if (!showcaseFocusPointerRef.current) return
    updateShowcaseFocusFromEvent(event, index)
  }

  const handleShowcaseFocusPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    showcaseFocusPointerRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleShowcaseTileClick = (index: number) => {
    const item = showcaseItems[index]
    if (!item) return
    if (!isImageUrl(item.url)) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
      return
    }
    openShowcaseFocusEditor(index)
  }

  const clearPortfolioLongPress = () => {
    if (portfolioLongPressTimerRef.current) {
      window.clearTimeout(portfolioLongPressTimerRef.current)
    }
    portfolioLongPressTimerRef.current = null
    portfolioLongPressStartRef.current = null
  }

  const handlePortfolioThumbPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (event.pointerType === 'mouse') return
    portfolioLongPressTriggeredRef.current = false
    portfolioLongPressStartRef.current = { x: event.clientX, y: event.clientY }
    if (portfolioLongPressTimerRef.current) {
      window.clearTimeout(portfolioLongPressTimerRef.current)
    }
    portfolioLongPressTimerRef.current = window.setTimeout(() => {
      portfolioLongPressTriggeredRef.current = true
      openPortfolioQuickActions(index)
    }, 420)
  }

  const handlePortfolioThumbPointerMove = (
    event: PointerEvent<HTMLButtonElement>
  ) => {
    if (!portfolioLongPressStartRef.current) return
    if (!portfolioLongPressTimerRef.current) return
    const dx = Math.abs(event.clientX - portfolioLongPressStartRef.current.x)
    const dy = Math.abs(event.clientY - portfolioLongPressStartRef.current.y)
    if (dx > 10 || dy > 10) {
      clearPortfolioLongPress()
    }
  }

  const handlePortfolioThumbPointerUp = () => {
    clearPortfolioLongPress()
  }

  const handlePortfolioThumbClick = (index: number) => {
    if (portfolioLongPressTriggeredRef.current) {
      portfolioLongPressTriggeredRef.current = false
      return
    }
    openPortfolioLightbox(index)
  }

  const removePortfolioItem = (index: number) => {
    const removedUrl = portfolioItems[index]?.url
    setPortfolioItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    )
    if (removedUrl) {
      setShowcaseItems((current) =>
        current.filter((item) => item.url !== removedUrl)
      )
    }
    setPortfolioError('')
  }

  const toggleShowcaseItem = (item: PortfolioItem | null) => {
    if (!item?.url) return
    const isSelected = showcaseItems.some((current) => current.url === item.url)
    setPortfolioError('')
    setShowcaseError('')
    if (isSelected) {
      setShowcaseItems((current) =>
        current.filter((currentItem) => currentItem.url !== item.url)
      )
      return
    }
    if (showcaseItems.length >= MAX_SHOWCASE_ITEMS) {
      setPortfolioError(`В витрину можно добавить максимум ${MAX_SHOWCASE_ITEMS} фото.`)
      return
    }
    setShowcaseItems((current) => [
      {
        ...item,
        focusX: typeof item.focusX === 'number' ? item.focusX : 0.5,
        focusY: typeof item.focusY === 'number' ? item.focusY : 0.5,
        title: item.title ?? null,
      },
      ...current,
    ])
  }

  const openPortfolioFocusEditor = (index: number) => {
    const item = portfolioItems[index]
    if (!item || !isImageUrl(item.url)) return
    setPortfolioFocusIndex(index)
  }

  const closePortfolioFocusEditor = () => {
    setPortfolioFocusIndex(null)
    portfolioFocusPointerRef.current = false
  }

  const updatePortfolioFocusFromEvent = (
    event: PointerEvent<HTMLDivElement>,
    index: number
  ) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clampUnit((event.clientX - rect.left) / rect.width)
    const y = clampUnit((event.clientY - rect.top) / rect.height)
    const focusUrl = portfolioItems[index]?.url
    setPortfolioItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, focusX: x, focusY: y } : item
      )
    )
    if (focusUrl) {
      setShowcaseItems((current) =>
        current.map((item) =>
          item.url === focusUrl ? { ...item, focusX: x, focusY: y } : item
        )
      )
    }
  }

  const handlePortfolioFocusPointerDown = (
    event: PointerEvent<HTMLDivElement>,
    index: number
  ) => {
    portfolioFocusPointerRef.current = true
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    updatePortfolioFocusFromEvent(event, index)
  }

  const handlePortfolioFocusPointerMove = (
    event: PointerEvent<HTMLDivElement>,
    index: number
  ) => {
    if (!portfolioFocusPointerRef.current) return
    updatePortfolioFocusFromEvent(event, index)
  }

  const handlePortfolioFocusPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    portfolioFocusPointerRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="screen screen--pro">
      <div className="pro-shell pro-shell--ig">
        <section className="pro-profile-ig animate delay-1">
          <div
            className={`pro-profile-ig-cover is-editable${
              coverUrl ? ' has-image' : ''
            }${isCoverUploading ? ' is-loading' : ''}`}
            style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
            aria-busy={isCoverUploading}
            aria-disabled={isCoverUploading}
            role="button"
            tabIndex={0}
            aria-label="Открыть редактор шапки"
            onClick={openMediaEditor}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openMediaEditor()
              }
            }}
          >
            <div className="pro-profile-ig-cover-glow" aria-hidden="true" />
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
              className="pro-profile-ig-button pro-profile-ig-button--fab"
              type="button"
              aria-label="Настройки профиля"
              onClick={(event) => {
                event.stopPropagation()
                openEditor('basic')
              }}
            >
              <span className="pro-profile-ig-button-icon" aria-hidden="true">
                <IconSettings />
              </span>
            </button>
          </div>
          <div className="pro-profile-ig-header">
            <div
              className={`pro-profile-ig-avatar is-editable${
                isAvatarUploading ? ' is-loading' : ''
              }`}
              aria-busy={isAvatarUploading}
              aria-disabled={isAvatarUploading}
              role="button"
              tabIndex={0}
              aria-label="Открыть редактор аватара"
              onClick={openMediaEditor}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openMediaEditor()
                }
              }}
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
            </div>
            <div className="pro-profile-ig-name-row">
              <h1 className="pro-profile-ig-name">{displayNameValue}</h1>
            </div>
            <div className="pro-profile-ig-stats">
              {profileStats.map((stat) => (
                <div className="pro-profile-ig-stat" key={stat.label}>
                  <span className="pro-profile-ig-stat-value">{stat.value}</span>
                  <span className="pro-profile-ig-stat-label">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pro-profile-ig-body">
            <div className="pro-profile-status-card">
              <div className="pro-profile-status-head">
                <span className="pro-profile-status-title">Статус</span>
                <button
                  className={`pro-profile-ig-status${isActive ? '' : ' is-paused'}`}
                  type="button"
                  onClick={() => setIsActive((current) => !current)}
                >
                  <span className="pro-profile-social-dot" aria-hidden="true" />
                  {isActive ? 'Принимаю заявки' : 'Пауза'}
                </button>
              </div>
              <p
                className={`pro-profile-status-text${
                  about.trim() ? '' : ' is-muted'
                }`}
              >
                {aboutPreview}
              </p>
            </div>
            <div className="pro-profile-audience-card">
              <div className="pro-profile-audience-main">
                <span className="pro-profile-audience-title">Подписчики</span>
                <span className="pro-profile-audience-pill">
                  {followersCountLabel}
                </span>
              </div>
              <div className="pro-profile-audience-value">{followersValue}</div>
            </div>
            <div className="pro-profile-facts">
              <div
                className="pro-profile-facts-grid"
                id="pro-profile-facts-grid"
              >
                {profileFacts.map((fact) => (
                  <div
                    className={`pro-profile-fact-card${
                      fact.isMuted ? ' is-muted' : ''
                    }`}
                    key={fact.label}
                  >
                    <span
                      className={`pro-profile-fact-icon is-${fact.id}`}
                      aria-hidden="true"
                    >
                      {fact.icon}
                    </span>
                    <div className="pro-profile-fact-info">
                      <span className="pro-profile-fact-value">{fact.value}</span>
                      <span className="pro-profile-fact-label">{fact.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pro-profile-ig-tags">
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
              {reviewCount > 0 ? (
                <span className="pro-profile-tag is-review">
                  ★ {reviewAverage.toFixed(1)} · {reviewCountLabel}
                </span>
              ) : (
                <span className="pro-profile-tag is-muted">Нет отзывов</span>
              )}
            </div>
          </div>
        </section>

        {isLoading && <p className="pro-status">Загружаем профиль...</p>}
        {loadError && <p className="pro-error">{loadError}</p>}
        {mediaError && <p className="pro-error">{mediaError}</p>}

        <section
          ref={portfolioPanelRef}
          className="pro-profile-portfolio-panel animate delay-2"
        >
          <div className="pro-profile-portfolio-panel-head">
            <div className="pro-profile-portfolio-panel-controls">
              <span className="pro-profile-portfolio-panel-count">
                {portfolioPanelCountLabel}
              </span>
              <div className="pro-profile-portfolio-panel-left">
                <div
                  className="pro-profile-portfolio-panel-nav"
                  role="tablist"
                  aria-label="Портфолио и витрина"
                >
                  <button
                    className={`pro-profile-portfolio-panel-tab${
                      portfolioView === 'portfolio' ? ' is-active' : ''
                    }`}
                    type="button"
                    role="tab"
                    aria-selected={portfolioView === 'portfolio'}
                    aria-controls="pro-profile-portfolio-content"
                    onClick={() => setPortfolioView('portfolio')}
                  >
                    Портфолио
                  </button>
                  <button
                    className={`pro-profile-portfolio-panel-tab${
                      portfolioView === 'showcase' ? ' is-active' : ''
                    }`}
                    type="button"
                    role="tab"
                    aria-selected={portfolioView === 'showcase'}
                    aria-controls="pro-profile-showcase-content"
                    onClick={() => setPortfolioView('showcase')}
                  >
                    Витрина
                  </button>
                </div>
              </div>
              {portfolioView === 'portfolio' && hasPortfolioOverflow && (
                <button
                  className="pro-profile-portfolio-panel-action"
                  type="button"
                  onClick={() => setIsPortfolioExpanded((current) => !current)}
                  aria-expanded={isPortfolioExpanded}
                >
                  {isPortfolioExpanded ? 'Свернуть' : 'Все фото'}
                </button>
              )}
            </div>
          </div>
          {portfolioView === 'portfolio' ? (
            <div
              id="pro-profile-portfolio-content"
              role="tabpanel"
              aria-label="Портфолио"
            >
              <input
                ref={portfolioUploadInputRef}
                className="pro-file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={handlePortfolioUploadChange}
                disabled={isPortfolioUploading}
                aria-hidden="true"
                tabIndex={-1}
              />
              <input
                ref={portfolioCameraInputRef}
                className="pro-file-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePortfolioCameraChange}
                disabled={isPortfolioUploading}
                aria-hidden="true"
                tabIndex={-1}
              />
              <input
                ref={portfolioReplaceInputRef}
                className="pro-file-input"
                type="file"
                accept="image/*"
                onChange={handlePortfolioReplaceChange}
                disabled={isPortfolioUploading}
                aria-hidden="true"
                tabIndex={-1}
              />
              {portfolioError && (
                <div className="pro-profile-editor-messages">
                  <p className="pro-error">{portfolioError}</p>
                </div>
              )}
              <div
                className={`pro-profile-portfolio-grid${
                  isPortfolioCollapsed ? ' is-collapsed' : ''
                }`}
                role="list"
                aria-label="Портфолио"
              >
                {visiblePortfolioItems.length > 0 ? (
                  visiblePortfolioItems.map(({ item, index }) => {
                    const focus = resolvePortfolioFocus(item)
                    const showImage = isImageUrl(item.url)
                    const isInShowcase = showcaseItems.some(
                      (showcaseItem) => showcaseItem.url === item.url
                    )
                    return (
                      <button
                        className="pro-profile-portfolio-item"
                        key={`${item.url}-${index}`}
                        type="button"
                        onClick={() => handlePortfolioThumbClick(index)}
                        onPointerDown={(event) =>
                          handlePortfolioThumbPointerDown(event, index)
                        }
                        onPointerMove={handlePortfolioThumbPointerMove}
                        onPointerUp={handlePortfolioThumbPointerUp}
                        onPointerLeave={handlePortfolioThumbPointerUp}
                        onPointerCancel={handlePortfolioThumbPointerUp}
                        role="listitem"
                        aria-label={`Открыть работу ${index + 1}`}
                      >
                        {showImage ? (
                          <img
                            src={item.url}
                            alt=""
                            loading="lazy"
                            style={{ objectPosition: focus.position }}
                          />
                        ) : (
                          <span className="pro-profile-portfolio-fallback">LINK</span>
                        )}
                        {isInShowcase && (
                          <span
                            className="pro-profile-portfolio-badge"
                            aria-hidden="true"
                            title="В витрине"
                          >
                            ✦
                          </span>
                        )}
                      </button>
                    )
                  })
                ) : (
                  <div className="pro-profile-portfolio-empty" role="listitem">
                    Пока нет фото. Добавьте первые работы.
                  </div>
                )}
                {!isPortfolioFull && (
                  <button
                    className="pro-profile-portfolio-item is-add"
                    type="button"
                    onClick={handlePortfolioAddClick}
                    role="listitem"
                    disabled={isPortfolioUploading}
                    aria-label="Добавить фото"
                  >
                    <span className="pro-profile-portfolio-add-icon">+</span>
                    <span className="pro-profile-portfolio-add-label">
                      Добавить
                    </span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              id="pro-profile-showcase-content"
              role="tabpanel"
              aria-label="Витрина"
            >
              <input
                ref={showcaseUploadInputRef}
                className="pro-file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={handleShowcaseUploadChange}
                disabled={isShowcaseUploading}
                aria-hidden="true"
                tabIndex={-1}
              />
              <input
                ref={showcaseReplaceInputRef}
                className="pro-file-input"
                type="file"
                accept="image/*"
                onChange={handleShowcaseReplaceChange}
                disabled={isShowcaseUploading}
                aria-hidden="true"
                tabIndex={-1}
              />
              {showcaseError && (
                <div className="pro-profile-editor-messages">
                  <p className="pro-error">{showcaseError}</p>
                </div>
              )}
              <div className="pro-profile-showcase-panel">
                {!hasShowcase ? (
                  <div className="pro-profile-showcase-empty">
                    <button
                      className="pro-cabinet-showcase-add"
                      type="button"
                      onClick={handleShowcaseAddClick}
                      disabled={isShowcaseUploading}
                    >
                      + Добавить работу
                    </button>
                    <div className="pro-cabinet-showcase-preview">
                      <div className="pro-cabinet-showcase-sample">
                        <span className="pro-cabinet-showcase-sample-icon">✦</span>
                        <span className="pro-cabinet-showcase-sample-label">
                          Пример витрины
                        </span>
                      </div>
                      <p className="pro-cabinet-showcase-hint">
                        Перетащите, чтобы задать порядок. Нажмите на фото, чтобы
                        выбрать фокус кадра.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="pro-profile-showcase-subtitle">
                      {showcaseSubtitle}
                    </p>
                    <div
                      className="pro-cabinet-showcase-grid"
                      role="list"
                      aria-label="Витрина работ"
                    >
                      {showcaseMosaicItems.map((item, index) => {
                        const hasItem = Boolean(item?.url)
                        const isImage = item?.url ? isImageUrl(item.url) : false
                        const caption = item?.title?.trim() || 'Работа'
                        const focus = resolvePortfolioFocus(item)
                        const slotClass =
                          showcaseSlotClasses[index] ?? showcaseSlotClasses[0]
                        const cardClassName = [
                          'pro-cabinet-showcase-card',
                          slotClass,
                          showcaseDragOverIndex === index ? 'is-drag-over' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')
                        const mediaClassName = [
                          'pro-cabinet-showcase-media',
                          hasItem ? 'is-draggable' : '',
                          !isImage && hasItem ? 'is-link' : '',
                          !hasItem ? 'is-add' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')

                        return (
                          <article
                            className={cardClassName}
                            key={`${item?.url ?? 'add'}-${index}`}
                            role="listitem"
                          >
                            {hasItem ? (
                              <button
                                className={mediaClassName}
                                type="button"
                                onClick={() => handleShowcaseTileClick(index)}
                                draggable
                                onDragStart={(event) =>
                                  handleShowcaseDragStart(event, index)
                                }
                                onDragOver={(event) =>
                                  handleShowcaseDragOver(event, index)
                                }
                                onDragLeave={handleShowcaseDragLeave}
                                onDrop={() => handleShowcaseDrop(index, true)}
                                onDragEnd={handleShowcaseDragEnd}
                              >
                                {isImage ? (
                                  <img
                                    src={item?.url ?? ''}
                                    alt={caption}
                                    loading="lazy"
                                    style={{ objectPosition: focus.position }}
                                  />
                                ) : (
                                  <span className="pro-cabinet-showcase-link">
                                    LINK
                                  </span>
                                )}
                              </button>
                            ) : (
                              <button
                                className={mediaClassName}
                                type="button"
                                onClick={handleShowcaseAddClick}
                                onDragOver={(event) =>
                                  handleShowcaseDragOver(event, index)
                                }
                                onDrop={() => handleShowcaseDrop(index, false)}
                                disabled={isShowcaseUploading}
                              >
                                <span className="pro-cabinet-showcase-add-icon">
                                  +
                                </span>
                              </button>
                            )}
                          </article>
                        )
                      })}
                    </div>
                    <p className="pro-cabinet-showcase-hint">
                      Перетащите, чтобы задать порядок. Нажмите на фото, чтобы
                      выбрать фокус кадра.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="pro-profile-reviews animate delay-3">
          <div className="pro-profile-reviews-head">
            <div>
              <p className="pro-profile-reviews-kicker">Отзывы</p>
              <h2 className="pro-profile-reviews-title">Отзывы клиентов</h2>
            </div>
            <span className="pro-profile-reviews-count-pill">
              {reviewCountLabel}
            </span>
          </div>

          {isReviewsLoading ? (
            <div className="pro-profile-reviews-skeleton" aria-hidden="true">
              <div className="pro-profile-reviews-skeleton-line is-wide" />
              <div className="pro-profile-reviews-skeleton-line" />
              <div className="pro-profile-reviews-skeleton-line is-short" />
            </div>
          ) : reviewsError ? (
            <p className="pro-error">{reviewsError}</p>
          ) : reviewCount > 0 ? (
            <>
              <div className="pro-profile-reviews-summary">
                <div className="pro-profile-reviews-score">
                  <span className="pro-profile-reviews-average">
                    {reviewAverage.toFixed(1)}
                  </span>
                  <span className="pro-profile-reviews-stars">
                    {buildReviewStars(reviewAverage)}
                  </span>
                  <span className="pro-profile-reviews-count">
                    {reviewCountLabel}
                  </span>
                </div>
                <div className="pro-profile-reviews-bars">
                  {reviewDistribution.map((entry) => {
                    const percent =
                      reviewCount > 0 ? (entry.count / reviewCount) * 100 : 0
                    return (
                      <div
                        className="pro-profile-reviews-bar"
                        key={`review-bar-${entry.rating}`}
                      >
                        <span className="pro-profile-reviews-bar-label">
                          {entry.rating}
                        </span>
                        <span className="pro-profile-reviews-bar-track">
                          <span
                            className="pro-profile-reviews-bar-fill"
                            style={{ width: `${percent}%` }}
                          />
                        </span>
                        <span className="pro-profile-reviews-bar-count">
                          {entry.count}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="pro-profile-reviews-list">
                {reviews.map((review) => {
                  const reviewerName = buildReviewerName(review)
                  const reviewerInitials = getNameInitials(reviewerName)
                  const dateLabel = formatReviewDate(review.createdAt)
                  const comment =
                    review.comment?.trim() || 'Без комментария.'

                  return (
                    <article
                      className="pro-profile-review-card"
                      key={review.id}
                    >
                      <span
                        className="pro-profile-review-avatar"
                        aria-hidden="true"
                      >
                        {reviewerInitials}
                      </span>
                      <div className="pro-profile-review-body">
                        <div className="pro-profile-review-head">
                          <span className="pro-profile-review-name">
                            {reviewerName}
                          </span>
                          <span className="pro-profile-review-rating">
                            {buildReviewStars(review.rating)}
                          </span>
                        </div>
                        {(review.serviceName || dateLabel) && (
                          <div className="pro-profile-review-meta">
                            {review.serviceName && (
                              <span className="pro-profile-review-service">
                                {review.serviceName}
                              </span>
                            )}
                            {dateLabel && (
                              <span className="pro-profile-review-date">
                                {dateLabel}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="pro-profile-review-text">{comment}</p>
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="pro-profile-reviews-empty">Пока нет отзывов.</p>
          )}
        </section>

        <div className="pro-profile-footer">
          {saveError && <p className="pro-error">{saveError}</p>}
          {saveSuccess && <p className="pro-success">{saveSuccess}</p>}
        </div>
      </div>

      {portfolioLightboxItem && (
        <div
          className="pro-portfolio-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          onClick={closePortfolioLightbox}
        >
          <div
            className="pro-portfolio-lightbox"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pro-portfolio-lightbox-head">
              <div>
                <p className="pro-portfolio-lightbox-kicker">Портфолио</p>
                <h3 className="pro-portfolio-lightbox-title">
                  {portfolioLightboxItem.title?.trim() ||
                    `Работа ${portfolioLightboxIndex !== null ? portfolioLightboxIndex + 1 : 1}`}
                </h3>
                <p className="pro-portfolio-lightbox-subtitle">
                  Нажмите «Фокус», чтобы выбрать центр кадра
                </p>
              </div>
              <button
                className="pro-portfolio-lightbox-close"
                type="button"
                onClick={closePortfolioLightbox}
              >
                Закрыть
              </button>
            </div>
            <div className="pro-portfolio-lightbox-media">
              {isLightboxImage ? (
                <img
                  src={portfolioLightboxItem.url}
                  alt={portfolioLightboxItem.title ?? 'Работа'}
                  style={{ objectPosition: portfolioLightboxFocus.position }}
                />
              ) : (
                <a
                  className="pro-portfolio-lightbox-link"
                  href={portfolioLightboxItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть ссылку
                </a>
              )}
            </div>
            <div className="pro-portfolio-lightbox-actions">
              <button
                className="pro-portfolio-lightbox-action"
                type="button"
                onClick={() =>
                  openPortfolioFocusEditor(
                    portfolioLightboxIndex !== null ? portfolioLightboxIndex : 0
                  )
                }
                disabled={!isLightboxImage}
              >
                Фокус
              </button>
              <button
                className="pro-portfolio-lightbox-action"
                type="button"
                onClick={() =>
                  handlePortfolioReplaceClick(
                    portfolioLightboxIndex !== null ? portfolioLightboxIndex : 0
                  )
                }
                disabled={isPortfolioUploading}
              >
                Заменить
              </button>
              <button
                className="pro-portfolio-lightbox-action"
                type="button"
                onClick={() => toggleShowcaseItem(portfolioLightboxItem)}
              >
                {isLightboxInShowcase ? 'Убрать из витрины' : 'В витрину'}
              </button>
              <button
                className="pro-portfolio-lightbox-action is-danger"
                type="button"
                onClick={() => {
                  if (portfolioLightboxIndex !== null) {
                    removePortfolioItem(portfolioLightboxIndex)
                  }
                  closePortfolioLightbox()
                }}
              >
                Удалить
              </button>
            </div>
            {portfolioError && <p className="pro-error">{portfolioError}</p>}
          </div>
        </div>
      )}

      {isPortfolioPickerOpen && (
        <div
          className="pro-portfolio-sheet-overlay"
          role="dialog"
          aria-modal="true"
          onClick={closePortfolioPicker}
        >
          <div
            className="pro-portfolio-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="pro-portfolio-sheet-handle" aria-hidden="true" />
            <div className="pro-portfolio-sheet-head">
              <h3 className="pro-portfolio-sheet-title">Добавить фото</h3>
              <p className="pro-portfolio-sheet-subtitle">
                Камера или галерея телефона
              </p>
            </div>
            <div className="pro-portfolio-sheet-actions">
              <button
                className="pro-portfolio-sheet-action"
                type="button"
                onClick={handlePortfolioCameraClick}
                disabled={isPortfolioUploading}
              >
                Камера
              </button>
              <button
                className="pro-portfolio-sheet-action"
                type="button"
                onClick={handlePortfolioGalleryClick}
                disabled={isPortfolioUploading}
              >
                Галерея
              </button>
            </div>
            <div className="pro-portfolio-sheet-recent">
              <p className="pro-portfolio-sheet-label">Последние</p>
              <div className="pro-portfolio-sheet-carousel" role="list">
                {portfolioRecentItems.length > 0 ? (
                  portfolioRecentItems.map(({ item, index }) => {
                    const focus = resolvePortfolioFocus(item)
                    return (
                      <button
                        className="pro-portfolio-sheet-thumb"
                        key={`${item.url}-recent-${index}`}
                        type="button"
                        onClick={() => {
                          closePortfolioPicker()
                          openPortfolioLightbox(index)
                        }}
                        role="listitem"
                        aria-label="Открыть недавнее фото"
                      >
                        <img
                          src={item.url}
                          alt=""
                          loading="lazy"
                          style={{ objectPosition: focus.position }}
                        />
                      </button>
                    )
                  })
                ) : (
                  <span className="pro-portfolio-sheet-empty">Пока нет фото</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {portfolioQuickActionItem && (
        <div
          className="pro-portfolio-sheet-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setPortfolioQuickActionIndex(null)}
        >
          <div
            className="pro-portfolio-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="pro-portfolio-sheet-handle" aria-hidden="true" />
            <div className="pro-portfolio-sheet-preview">
              {isImageUrl(portfolioQuickActionItem.url) ? (
                <img
                  src={portfolioQuickActionItem.url}
                  alt={portfolioQuickActionItem.title ?? 'Работа'}
                  style={{ objectPosition: quickActionFocus.position }}
                />
              ) : (
                <span className="pro-portfolio-sheet-link">LINK</span>
              )}
            </div>
            <div className="pro-portfolio-sheet-actions is-stacked">
              <button
                className="pro-portfolio-sheet-action"
                type="button"
                onClick={() => {
                  toggleShowcaseItem(portfolioQuickActionItem)
                  setPortfolioQuickActionIndex(null)
                }}
              >
                {isQuickActionInShowcase ? 'Убрать из витрины' : 'В витрину'}
              </button>
              <button
                className="pro-portfolio-sheet-action"
                type="button"
                onClick={() =>
                  handlePortfolioReplaceClick(
                    portfolioQuickActionIndex !== null
                      ? portfolioQuickActionIndex
                      : 0
                  )
                }
                disabled={isPortfolioUploading}
              >
                Заменить
              </button>
              <button
                className="pro-portfolio-sheet-action is-danger"
                type="button"
                onClick={() => {
                  if (portfolioQuickActionIndex !== null) {
                    removePortfolioItem(portfolioQuickActionIndex)
                  }
                  setPortfolioQuickActionIndex(null)
                }}
              >
                Удалить
              </button>
            </div>
            <button
              className="pro-portfolio-sheet-cancel"
              type="button"
              onClick={() => setPortfolioQuickActionIndex(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {focusItem && (
        <div className="pro-portfolio-focus-overlay" role="dialog" aria-modal="true">
          <div className="pro-portfolio-focus-card">
            <div className="pro-portfolio-focus-header">
              <div>
                <p className="pro-portfolio-focus-kicker">Кадрирование</p>
                <h3 className="pro-portfolio-focus-title">Выберите фокус</h3>
              </div>
              <button
                className="pro-portfolio-focus-close"
                type="button"
                onClick={closePortfolioFocusEditor}
              >
                Готово
              </button>
            </div>
            <div
              className="pro-portfolio-focus-preview"
              onPointerDown={(event) =>
                handlePortfolioFocusPointerDown(event, focusIndex)
              }
              onPointerMove={(event) =>
                handlePortfolioFocusPointerMove(event, focusIndex)
              }
              onPointerUp={handlePortfolioFocusPointerUp}
              onPointerLeave={handlePortfolioFocusPointerUp}
              role="presentation"
            >
              <img
                src={focusItem.url}
                alt={focusItem.title ?? 'Фокус'}
                style={{ objectPosition: focusPoint.position }}
              />
              <span
                className="pro-portfolio-focus-point"
                style={{
                  left: `${focusPoint.x * 100}%`,
                  top: `${focusPoint.y * 100}%`,
                }}
                aria-hidden="true"
              />
            </div>
            <div className="pro-portfolio-focus-actions">
              <button
                className="pro-portfolio-focus-action"
                type="button"
                onClick={() => handlePortfolioReplaceClick(focusIndex)}
              >
                Заменить
              </button>
              <button
                className="pro-portfolio-focus-action is-danger"
                type="button"
                onClick={() => {
                  removePortfolioItem(focusIndex)
                  closePortfolioFocusEditor()
                }}
              >
                Удалить
              </button>
            </div>
            <p className="pro-portfolio-focus-hint">
              Перетащите точку, чтобы выбрать главный фокус кадра.
            </p>
          </div>
        </div>
      )}

      {showcaseFocusItem && (
        <div className="pro-portfolio-focus-overlay" role="dialog" aria-modal="true">
          <div className="pro-portfolio-focus-card">
            <div className="pro-portfolio-focus-header">
              <div>
                <p className="pro-portfolio-focus-kicker">Кадрирование</p>
                <h3 className="pro-portfolio-focus-title">Выберите фокус</h3>
              </div>
              <button
                className="pro-portfolio-focus-close"
                type="button"
                onClick={closeShowcaseFocusEditor}
              >
                Готово
              </button>
            </div>
            <div
              className="pro-portfolio-focus-preview"
              onPointerDown={(event) =>
                handleShowcaseFocusPointerDown(event, showcaseFocusIndexValue)
              }
              onPointerMove={(event) =>
                handleShowcaseFocusPointerMove(event, showcaseFocusIndexValue)
              }
              onPointerUp={handleShowcaseFocusPointerUp}
              onPointerLeave={handleShowcaseFocusPointerUp}
              role="presentation"
            >
              <img
                src={showcaseFocusItem.url}
                alt={showcaseFocusItem.title ?? 'Фокус'}
                style={{ objectPosition: showcaseFocusPoint.position }}
              />
              <span
                className="pro-portfolio-focus-point"
                style={{
                  left: `${showcaseFocusPoint.x * 100}%`,
                  top: `${showcaseFocusPoint.y * 100}%`,
                }}
                aria-hidden="true"
              />
            </div>
            <div className="pro-portfolio-focus-actions">
              <button
                className="pro-portfolio-focus-action"
                type="button"
                onClick={() => handleShowcaseReplaceClick(showcaseFocusIndexValue)}
                disabled={isShowcaseUploading}
              >
                Заменить
              </button>
              <button
                className="pro-portfolio-focus-action is-danger"
                type="button"
                onClick={() => {
                  removeShowcaseItem(showcaseFocusIndexValue)
                  closeShowcaseFocusEditor()
                }}
              >
                Удалить
              </button>
            </div>
            <p className="pro-portfolio-focus-hint">
              Перетащите точку, чтобы выбрать главный фокус кадра.
            </p>
          </div>
        </div>
      )}

      {editingSection && (
        <div
          className={`pro-profile-editor-screen${
            editingSection === 'services' ? ' is-inline-save' : ''
          }`}
          role="dialog"
          aria-modal="true"
        >
          <div className="pro-profile-editor-shell">
            {editingSection !== 'media' && (
              <div className="pro-profile-editor-tabs" role="tablist">
                <button
                  className={`pro-profile-editor-tab${
                    editingSection === 'basic' ? ' is-active' : ''
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={editingSection === 'basic'}
                  onClick={() => openEditor('basic')}
                >
                  <span className="pro-profile-editor-tab-icon" aria-hidden="true">
                    <IconUser />
                  </span>
                  <span className="pro-profile-editor-tab-label">О себе</span>
                </button>
                <button
                  className={`pro-profile-editor-tab${
                    editingSection === 'location' ? ' is-active' : ''
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={editingSection === 'location'}
                  onClick={() => openEditor('location')}
                >
                  <span className="pro-profile-editor-tab-icon" aria-hidden="true">
                    <IconPin />
                  </span>
                  <span className="pro-profile-editor-tab-label">Локация</span>
                </button>
                <button
                  className={`pro-profile-editor-tab${
                    editingSection === 'availability' ? ' is-active' : ''
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={editingSection === 'availability'}
                  onClick={() => openEditor('availability')}
                >
                  <span className="pro-profile-editor-tab-icon" aria-hidden="true">
                    <IconClock />
                  </span>
                  <span className="pro-profile-editor-tab-label">График</span>
                </button>
                <button
                  className={`pro-profile-editor-tab${
                    editingSection === 'services' ? ' is-active' : ''
                  }`}
                  type="button"
                  role="tab"
                  aria-selected={editingSection === 'services'}
                  onClick={() => openEditor('services')}
                >
                  <span className="pro-profile-editor-tab-icon" aria-hidden="true">
                    <IconList />
                  </span>
                  <span className="pro-profile-editor-tab-label">Услуги</span>
                </button>
              </div>
            )}
            <section className="pro-profile-editor-card">
              {editingSection === 'media' && (
                <div className="pro-profile-editor-media">
                  <div className="pro-profile-editor-media-group">
                    <div className="pro-profile-editor-media-label">Аватар</div>
                    <div className="pro-profile-editor-media-row">
                      <div
                        className={`pro-profile-editor-media-avatar${
                          isAvatarUploading ? ' is-loading' : ''
                        }`}
                        aria-busy={isAvatarUploading}
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Аватар" />
                        ) : (
                          <span aria-hidden="true">{profileInitials}</span>
                        )}
                      </div>
                      <div className="pro-profile-editor-media-actions">
                        <button
                          className="pro-profile-editor-media-action"
                          type="button"
                          onClick={handleAvatarSelect}
                          disabled={isAvatarUploading}
                        >
                          Сменить
                        </button>
                        {avatarUrl && (
                          <button
                            className="pro-profile-editor-media-action is-danger"
                            type="button"
                            onClick={handleAvatarClear}
                            disabled={isAvatarUploading}
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pro-profile-editor-media-group">
                    <div className="pro-profile-editor-media-label">Шапка</div>
                    <div
                      className={`pro-profile-editor-media-cover${
                        coverUrl ? ' has-image' : ''
                      }${isCoverUploading ? ' is-loading' : ''}`}
                      style={
                        coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined
                      }
                      aria-busy={isCoverUploading}
                    >
                      {!coverUrl && (
                        <span className="pro-profile-editor-media-cover-text">
                          Шапка не задана
                        </span>
                      )}
                    </div>
                    <div className="pro-profile-editor-media-actions is-row">
                      <button
                        className="pro-profile-editor-media-action"
                        type="button"
                        onClick={handleCoverSelect}
                        disabled={isCoverUploading}
                      >
                        Сменить
                      </button>
                      {coverUrl && (
                        <button
                          className="pro-profile-editor-media-action is-danger"
                          type="button"
                          onClick={handleCoverClear}
                          disabled={isCoverUploading}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>

                  {mediaError && <p className="pro-error">{mediaError}</p>}
                </div>
              )}
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
                      Статус
                    </label>
                    <textarea
                      id="pro-about"
                      className="pro-textarea"
                      value={about}
                      onChange={(event) => setAbout(event.target.value)}
                      placeholder="Короткий статус, что важно клиенту"
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
                    <span className="pro-label">Геолокация (по желанию)</span>
                    <div className="pro-geo-card">
                      <div className="pro-geo-row">
                        <div>
                          <div className="pro-geo-title">
                            {hasGeoLocation
                              ? 'Геолокация сохранена'
                              : 'Геолокация не задана'}
                          </div>
                          {hasGeoLocation && (
                            <div className="pro-geo-meta">
                              {geoUpdatedLabel
                                ? `Обновлено ${geoUpdatedLabel}`
                                : 'Недавно'}
                              {geoAccuracyLabel ? ` • ${geoAccuracyLabel}` : ''}
                            </div>
                          )}
                        </div>
                        <button
                          className="pro-geo-action"
                          type="button"
                          onClick={handleRequestLocation}
                          disabled={isLocating}
                        >
                          {isLocating
                            ? 'Определяем...'
                            : hasGeoLocation
                              ? 'Обновить'
                              : 'Поделиться'}
                        </button>
                      </div>
                      <div className="pro-geo-actions">
                        {hasGeoLocation && (
                          <button
                            className="pro-geo-clear"
                            type="button"
                            onClick={handleClearLocation}
                            disabled={isLocating}
                          >
                            Удалить геолокацию
                          </button>
                        )}
                      </div>
                      {hasGeoLocation && isGeoLowAccuracy && (
                        <p className="pro-geo-warning">
                          Точность низкая — расстояние для клиентов будет
                          приблизительным. Включите GPS и обновите геолокацию.
                        </p>
                      )}
                      {locationError && (
                        <p className="pro-geo-error">{locationError}</p>
                      )}
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
                </>
              )}

              {editingSection === 'availability' && (
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

              {editingSection === 'services' && (
                <>
                  <div className="pro-service-block pro-service-block--category">
                    <div className="pro-service-panel-head">
                      <span className="pro-label">Категория</span>
                      <span className="pro-service-count-pill">
                        {selectedServicesLabel}
                      </span>
                    </div>
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

                  <div className="pro-service-block">
                    <div className="pro-service-panel-head">
                      <span className="pro-label">Добавить услуги</span>
                      <span className="pro-service-count-pill">
                        {categorySelectionLabel}
                      </span>
                    </div>
                    {visibleServiceOptions.length > 0 && (
                      <div className="pro-service-suggestions" role="list">
                        {visibleServiceOptions.map((option) => {
                          const isActive = serviceAddTarget === option.title
                          return (
                            <div
                              className="pro-service-suggestion-row"
                              key={option.title}
                              role="listitem"
                            >
                              <div
                                className={`pro-service-suggestion${
                                  isActive ? ' is-active' : ''
                                }`}
                              >
                                <span className="pro-service-suggestion-body">
                                  <span className="pro-service-suggestion-title">
                                    {option.title}
                                  </span>
                                </span>
                                <button
                                  className={`pro-service-suggestion-action${
                                    isActive ? ' is-active' : ''
                                  }`}
                                  type="button"
                                  onClick={() => openServiceAddPanel(option.title)}
                                >
                                  {isActive ? 'Открыто' : 'Добавить'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {serviceCatalogOptions.length === 0 && (
                      <p className="pro-service-empty">
                        Пока нет услуг для этой категории.
                      </p>
                    )}
                    {serviceCatalogOptions.length > 0 &&
                      availableServiceOptions.length === 0 && (
                        <p className="pro-service-empty">
                          Все услуги категории уже добавлены.
                        </p>
                      )}
                    {hasMoreServiceOptions && (
                      <button
                        className="pro-service-expand"
                        type="button"
                        onClick={() =>
                          setIsServiceCatalogExpanded((prev) => !prev)
                        }
                      >
                        {isServiceCatalogExpanded
                          ? 'Скрыть услуги'
                          : `Показать все (${availableServiceOptions.length})`}
                      </button>
                    )}
                  </div>

                  {serviceAddTarget && (
                    <div
                      className="pro-service-add-overlay"
                      role="dialog"
                      aria-modal="true"
                      onClick={(event) => {
                        if (event.target === event.currentTarget) {
                          closeServiceAddPanel()
                        }
                      }}
                    >
                      <div className="pro-service-add-sheet">
                        <span className="pro-service-add-handle" aria-hidden="true" />
                        <div className="pro-service-add-head">
                          <p className="pro-service-add-kicker">Добавление услуги</p>
                          <h3 className="pro-service-add-title">
                            {serviceAddTarget}
                          </h3>
                          <p className="pro-service-add-subtitle">
                            Укажите цену и длительность, чтобы услуга попала в
                            профиль.
                          </p>
                        </div>
                        {selectedServiceCategory?.label && (
                          <span className="pro-service-add-category">
                            {selectedServiceCategory.label}
                          </span>
                        )}
                        <div className="pro-service-add-form">
                          <label className="pro-service-add-field">
                            <span className="pro-service-add-label">Цена, ₽</span>
                            <input
                              className="pro-input pro-service-add-input"
                              type="number"
                              value={serviceAddPrice}
                              onChange={(event) => {
                                setServiceAddPrice(event.target.value)
                                if (serviceAddError) {
                                  setServiceAddError('')
                                }
                              }}
                              placeholder="1500"
                              min="0"
                            />
                          </label>
                          <label className="pro-service-add-field">
                            <span className="pro-service-add-label">
                              Длительность, мин
                            </span>
                            <input
                              className="pro-input pro-service-add-input"
                              type="number"
                              value={serviceAddDuration}
                              onChange={(event) => {
                                setServiceAddDuration(event.target.value)
                                if (serviceAddError) {
                                  setServiceAddError('')
                                }
                              }}
                              placeholder="60"
                              min="0"
                            />
                          </label>
                          <div className="pro-service-add-actions">
                            <button
                              className="pro-service-add-confirm"
                              type="button"
                              onClick={handleServiceAdd}
                              disabled={!isServiceAddReady}
                            >
                              Добавить услугу
                            </button>
                            <button
                              className="pro-service-add-cancel"
                              type="button"
                              onClick={closeServiceAddPanel}
                            >
                              Отмена
                            </button>
                          </div>
                          {serviceAddError && (
                            <p className="pro-service-add-error">{serviceAddError}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pro-service-block">
                    <div className="pro-service-panel-head">
                      <span className="pro-label">Ваши услуги</span>
                      <div className="pro-service-panel-pills">
                        <span className="pro-service-count-pill">
                          {selectedServicesLabel}
                        </span>
                        <span className="pro-service-range-pill">
                          {servicePriceLabel}
                        </span>
                      </div>
                    </div>
                    <div className="pro-service-grid pro-service-grid--stacked">
                      {serviceItems.length > 0 ? (
                        serviceItems.map((service, index) => {
                          const metaLabel = formatServiceMeta(service)
                          const serviceMetaKey = buildServiceMetaKey(service, index)
                          const isMetaOpen = isServiceMetaOpen(serviceMetaKey)
                          return (
                            <div
                              className="pro-service-card"
                              key={`${service.name}-${index}`}
                            >
                              <div className="pro-service-card-head">
                                <button
                                  className={`pro-service-settings${
                                    isMetaOpen ? ' is-active' : ''
                                  }`}
                                  type="button"
                                  onClick={() => toggleServiceMeta(serviceMetaKey)}
                                  aria-pressed={isMetaOpen}
                                  aria-label={`Настроить ${
                                    service.name || 'услугу'
                                  }`}
                                >
                                  <IconSettings />
                                </button>
                                <span className="pro-service-name">
                                  {service.name}
                                </span>
                                <button
                                  className="pro-service-remove"
                                  type="button"
                                  onClick={() => removeService(index)}
                                  aria-label={`Удалить ${service.name || 'услугу'}`}
                                >
                                  ×
                                </button>
                              </div>
                              {isMetaOpen && (
                                <div className="pro-service-meta">
                                  <label className="pro-service-meta-field">
                                    <span className="pro-service-meta-label">
                                      Цена, ₽
                                    </span>
                                    <input
                                      className="pro-input pro-service-meta-input"
                                      type="number"
                                      value={service.price ?? ''}
                                      onChange={(event) =>
                                        updateServiceItem(index, {
                                          price: parseNumber(event.target.value),
                                        })
                                      }
                                      placeholder="1500"
                                      min="0"
                                    />
                                  </label>
                                  <label className="pro-service-meta-field">
                                    <span className="pro-service-meta-label">
                                      Длительность, мин
                                    </span>
                                    <input
                                      className="pro-input pro-service-meta-input"
                                      type="number"
                                      value={service.duration ?? ''}
                                      onChange={(event) =>
                                        updateServiceItem(index, {
                                          duration: parseNumber(event.target.value),
                                        })
                                      }
                                      placeholder="60"
                                      min="0"
                                    />
                                  </label>
                                </div>
                              )}
                              {metaLabel && !isMetaOpen && (
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
                  </div>

                </>
              )}

            </section>
            {(saveError || saveSuccess) && (
              <div className="pro-profile-editor-messages">
                {saveError && <p className="pro-error">{saveError}</p>}
                {saveSuccess && <p className="pro-success">{saveSuccess}</p>}
              </div>
            )}
            <div
              className={`pro-profile-editor-actions${
                editingSection === 'services' ? ' is-inline' : ''
              }`}
            >
              <button
                className="pro-profile-action pro-profile-editor-save"
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
