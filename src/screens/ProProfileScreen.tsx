import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  PointerEvent,
  ReactElement,
} from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { MediaCropper } from '../components/MediaCropper'
import {
  IconCertificate,
  IconClientVisit,
  IconExperience,
  IconFormat,
  IconHomeMaster,
  IconPin,
  IconPhoto,
  IconProfileAbout,
  IconPrice,
  IconServices,
  IconSchedule,
  IconSettings,
  IconTrash,
} from '../components/icons'
import { categoryItems } from '../data/clientData'
import { requestServiceCatalog } from '../data/requestData'
import type {
  City,
  District,
  MasterCertificate,
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
import { normalizeScheduleDays } from '../utils/schedule'
import { buildImageSrcSet, buildImageUrl } from '../utils/media'

type ProProfileScreenProps = {
  apiBase: string
  userId: string
  displayNameFallback: string
  telegramAvatarUrl?: string | null
  returnView?: 'pro-cabinet' | 'pro-requests'
  onBack: () => void
  onViewCabinet?: () => void
  onViewRequests: () => void
  onViewChats: () => void
  onViewStories: () => void
  focusSection?: ProProfileSection | null
  initialPortfolioView?: 'portfolio' | 'showcase'
  onBackHandlerChange?: ((handler: (() => boolean) | null) => void) | undefined
}

const parseNumber = (value: string) => {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const parseTimeToMinutes = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) return null
  const [hoursRaw, minutesRaw] = value.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }
  return hours * 60 + minutes
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

const formatPrice = (value: number) =>
  `${Math.round(value).toLocaleString('ru-RU')} ₽`

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

const CERTIFICATE_RATIO_MIN = 4 / 5
const CERTIFICATE_RATIO_MAX = 4 / 3
const clampCertificateRatio = (value: number) =>
  Math.min(CERTIFICATE_RATIO_MAX, Math.max(CERTIFICATE_RATIO_MIN, value))
const clampValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const buildCertificateId = () =>
  `cert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const normalizeCertificate = (
  value: Partial<MasterCertificate> | null | undefined
): MasterCertificate => ({
  id: value?.id ?? buildCertificateId(),
  title: value?.title ?? '',
  issuer: value?.issuer ?? '',
  year: typeof value?.year === 'number' ? value.year : null,
  url: value?.url ?? '',
  verifyUrl: value?.verifyUrl ?? '',
})

const buildCertificateMeta = (certificate: MasterCertificate) => {
  const parts = [certificate.issuer, certificate.year?.toString()]
    .filter((item): item is string => Boolean(item && item.trim()))
  return parts.join(' · ')
}


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

const formatFollowerDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
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

const buildFollowerName = (follower: MasterFollower) => {
  const profileName = follower.displayName?.trim()
  if (profileName) return profileName
  const name = [follower.firstName, follower.lastName].filter(Boolean).join(' ').trim()
  if (name) return name
  if (follower.username) return `@${follower.username}`
  return 'Подписчик'
}

const buildFollowerHandle = (follower: MasterFollower, name: string) => {
  const handle = follower.username?.trim()
  if (!handle) return ''
  const normalizedName = name.trim().toLowerCase()
  if (normalizedName === `@${handle.toLowerCase()}`) return ''
  return `@${handle}`
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

const schedulePresetOptions = [
  { id: 'weekdays', label: 'Будни', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { id: 'weekends', label: 'Выходные', days: ['sat', 'sun'] },
  {
    id: 'everyday',
    label: 'Каждый день',
    days: scheduleDayOptions.map((day) => day.id),
  },
] as const

const scheduleTimePresets = [
  { id: 'early', label: '09–17', start: '09:00', end: '17:00' },
  { id: 'day', label: '10–19', start: '10:00', end: '19:00' },
  { id: 'late', label: '12–21', start: '12:00', end: '21:00' },
] as const

type InlineSection = Exclude<ProProfileSection, 'portfolio'>
type CategoryId = (typeof categoryItems)[number]['id']
const isCategoryId = (value: string): value is CategoryId =>
  categoryItems.some((item) => item.id === value)

const profileSettingsItems = [
  { id: 'media', label: 'Фото профиля', icon: IconPhoto },
  { id: 'basic', label: 'О себе', icon: IconProfileAbout },
  { id: 'location', label: 'Локация', icon: IconPin },
  { id: 'availability', label: 'График', icon: IconSchedule },
  { id: 'policies', label: 'Политики и депозит', icon: IconPrice },
  { id: 'services', label: 'Услуги', icon: IconServices },
  { id: 'certificates', label: 'Сертификаты', icon: IconCertificate },
] as const

type SettingsItemId = (typeof profileSettingsItems)[number]['id']

const editorTitleMap: Record<InlineSection, string> = {
  basic: 'О себе',
  location: 'Локация',
  availability: 'График',
  policies: 'Политики и депозит',
  services: 'Услуги',
  certificates: 'Сертификаты',
  media: 'Фото профиля',
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
  cancelWindowHours: number | null
  depositPercent: number | null
  depositType: 'none' | 'percent' | 'fixed' | null
  depositFixed: number | null
  depositDetails: string | null
  depositQrUrl: string | null
  worksAtClient: boolean
  worksAtMaster: boolean
  categories: string[]
  services: string[]
  portfolioUrls: string[]
  showcaseUrls: string[]
  certificates: MasterCertificate[]
}

type MasterFollower = {
  userId: string
  firstName?: string | null
  lastName?: string | null
  username?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  followedAt?: string | null
  updatedAt?: string | null
  isPro?: boolean
}

type StatId = 'works' | 'rating' | 'reviews' | 'followers'
type CropperKind = 'avatar' | 'cover'
type CropperState = { kind: CropperKind; src: string; coverAspect?: number }

const MAX_MEDIA_BYTES = 3 * 1024 * 1024
const MAX_MEDIA_INPUT_BYTES = 12 * 1024 * 1024
const MAX_PORTFOLIO_ITEMS = 30
const MAX_SHOWCASE_ITEMS = 6
const MAX_CERTIFICATES = 12
const PORTFOLIO_ROW_LIMIT = 4
const FOLLOWERS_PAGE_SIZE = 24
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
  telegramAvatarUrl,
  returnView = 'pro-cabinet',
  onBack,
  onViewCabinet,
  onViewRequests,
  onViewChats,
  onViewStories,
  focusSection,
  initialPortfolioView,
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
  const [certificates, setCertificates] = useState<MasterCertificate[]>([])
  const [certificateRatios, setCertificateRatios] = useState<
    Record<string, number>
  >({})
  const [portfolioView, setPortfolioView] = useState<'portfolio' | 'showcase'>(
    () => initialPortfolioView ?? 'portfolio'
  )
  const [worksAtClient, setWorksAtClient] = useState(true)
  const [worksAtMaster, setWorksAtMaster] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [scheduleDays, setScheduleDays] = useState<string[]>([])
  const [scheduleStart, setScheduleStart] = useState('')
  const [scheduleEnd, setScheduleEnd] = useState('')
  const [cancelWindowHours, setCancelWindowHours] = useState('')
  const [depositPercent, setDepositPercent] = useState('')
  const [depositType, setDepositType] = useState<'none' | 'percent' | 'fixed'>(
    'none'
  )
  const [depositFixed, setDepositFixed] = useState('')
  const [depositDetails, setDepositDetails] = useState('')
  const [depositQrUrl, setDepositQrUrl] = useState<string | null>(null)
  const [depositQrUploading, setDepositQrUploading] = useState(false)
  const [depositQrError, setDepositQrError] = useState('')
  const [proLocation, setProLocation] = useState<UserLocation | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [certificatesError, setCertificatesError] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [hasAvatar, setHasAvatar] = useState(false)
  const [coverUrl, setCoverUrl] = useState('')
  const [coverAspectValue, setCoverAspectValue] = useState<number | null>(null)
  const [coverFrameWidth, setCoverFrameWidth] = useState<number | null>(null)
  const [reviews, setReviews] = useState<MasterReview[]>([])
  const [reviewSummary, setReviewSummary] =
    useState<MasterReviewSummary | null>(null)
  const [followersCount, setFollowersCount] = useState(0)
  const [isFollowersOpen, setIsFollowersOpen] = useState(false)
  const [followers, setFollowers] = useState<MasterFollower[]>([])
  const [followersTotal, setFollowersTotal] = useState(0)
  const [followersQuery, setFollowersQuery] = useState('')
  const [followersQueryDebounced, setFollowersQueryDebounced] = useState('')
  const [followersError, setFollowersError] = useState('')
  const [isFollowersLoading, setIsFollowersLoading] = useState(false)
  const [activeStat, setActiveStat] = useState<StatId | null>(null)
  const [isReviewsLoading, setIsReviewsLoading] = useState(false)
  const [reviewsError, setReviewsError] = useState('')
  const [isAvatarUploading, setIsAvatarUploading] = useState(false)
  const [isCoverUploading, setIsCoverUploading] = useState(false)
  const [isAvatarActionsOpen, setIsAvatarActionsOpen] = useState(false)
  const [cropperState, setCropperState] = useState<CropperState | null>(null)
  const [mediaError, setMediaError] = useState('')
  const [portfolioLightboxIndex, setPortfolioLightboxIndex] = useState<
    number | null
  >(null)
  const [certificateLightboxIndex, setCertificateLightboxIndex] = useState<
    number | null
  >(null)
  const [isPortfolioExpanded, setIsPortfolioExpanded] = useState(false)
  const [isCertificatesExpanded, setIsCertificatesExpanded] = useState(false)
  const [isPortfolioPickerOpen, setIsPortfolioPickerOpen] = useState(false)
  const [isCertificatesUploading, setIsCertificatesUploading] = useState(false)
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
  const coverRef = useRef<HTMLDivElement>(null)
  const editorCoverRef = useRef<HTMLDivElement>(null)
  const portfolioUploadInputRef = useRef<HTMLInputElement>(null)
  const portfolioCameraInputRef = useRef<HTMLInputElement>(null)
  const portfolioReplaceInputRef = useRef<HTMLInputElement>(null)
  const portfolioReplaceIndexRef = useRef<number | null>(null)
  const certificateUploadInputRef = useRef<HTMLInputElement>(null)
  const certificateReplaceInputRef = useRef<HTMLInputElement>(null)
  const certificateReplaceIdRef = useRef<string | null>(null)
  const showcaseUploadInputRef = useRef<HTMLInputElement>(null)
  const showcaseReplaceInputRef = useRef<HTMLInputElement>(null)
  const showcaseReplaceIndexRef = useRef<number | null>(null)
  const showcaseDragIndexRef = useRef<number | null>(null)
  const portfolioFocusPointerRef = useRef(false)
  const showcaseFocusPointerRef = useRef(false)
  const returnAfterEditorRef = useRef(false)
  const portfolioLightboxIndexRef = useRef<number | null>(null)
  const certificateLightboxIndexRef = useRef<number | null>(null)
  const portfolioFocusIndexRef = useRef<number | null>(null)
  const showcaseFocusIndexRef = useRef<number | null>(null)
  const cropperStateRef = useRef<CropperState | null>(null)
  const avatarActionsOpenRef = useRef(false)
  const portfolioPanelRef = useRef<HTMLElement | null>(null)
  const reviewsSectionRef = useRef<HTMLElement | null>(null)
  const profileAutosaveTimerRef = useRef<number | null>(null)
  const portfolioLongPressTimerRef = useRef<number | null>(null)
  const portfolioLongPressTriggeredRef = useRef(false)
  const portfolioLongPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const followersRequestIdRef = useRef(0)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const settingsOpenRef = useRef(false)
  const settingsReturnRef = useRef(false)
  const [editingSection, setEditingSection] = useState<InlineSection | null>(() =>
    focusSection && focusSection !== 'portfolio' ? focusSection : null
  )
  const editingSectionRef = useRef<InlineSection | null>(null)
  const autosaveSuccessTimerRef = useRef<number | null>(null)
  const lastSavedRef = useRef('')
  const hasLoadedRef = useRef(false)
  const isSavingRef = useRef(false)
  const queuedPayloadRef = useRef<ProfilePayload | null>(null)
  const getCoverRect = useCallback(() => {
    const editorRect = editorCoverRef.current?.getBoundingClientRect()
    if (editorRect && editorRect.width > 1 && editorRect.height > 1) {
      return editorRect
    }
    const heroRect = coverRef.current?.getBoundingClientRect()
    if (heroRect && heroRect.width > 1 && heroRect.height > 1) {
      return heroRect
    }
    return null
  }, [])
  const waitForCoverRect = useCallback(async () => {
    if (typeof window === 'undefined') return null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rect = getCoverRect()
      if (rect) return rect
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve())
      )
    }
    return null
  }, [getCoverRect])
  const getCoverAspectValue = useCallback(() => {
    const rect = getCoverRect()
    if (rect) {
      const aspect = rect.width / rect.height
      if (Number.isFinite(aspect) && aspect > 0) return aspect
    }
    if (typeof window === 'undefined') return 1.78
    const viewportWidth =
      document.documentElement?.clientWidth || window.innerWidth || 360
    const width = clampValue(viewportWidth, 320, 430)
    const height = clampValue(0.56 * width, 210, 250)
    const fallbackAspect = width / height
    return Number.isFinite(fallbackAspect) && fallbackAspect > 0 ? fallbackAspect : 1.78
  }, [getCoverRect])
  const getCoverFrameWidth = useCallback(() => {
    const rect = getCoverRect()
    if (rect && rect.width > 1) return rect.width
    if (typeof window === 'undefined') return undefined
    const viewportWidth = document.documentElement?.clientWidth || window.innerWidth
    const maxWidth = Math.max(0, viewportWidth - 32)
    return maxWidth > 0 ? maxWidth : undefined
  }, [getCoverRect])
  useEffect(() => {
    const updateAspect = () => {
      const next = getCoverAspectValue()
      if (!next) return
      setCoverAspectValue((current) =>
        current && Math.abs(current - next) < 0.01 ? current : next
      )
    }
    updateAspect()
    if (typeof window === 'undefined') return
    window.addEventListener('resize', updateAspect)
    const element = editorCoverRef.current ?? coverRef.current
    if (element && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateAspect)
      observer.observe(element)
      return () => {
        observer.disconnect()
        window.removeEventListener('resize', updateAspect)
      }
    }
    return () => {
      window.removeEventListener('resize', updateAspect)
    }
  }, [editingSection, getCoverAspectValue])
  useEffect(() => {
    const updateWidth = () => {
      const next = getCoverFrameWidth()
      if (!next) return
      setCoverFrameWidth((current) =>
        current && Math.abs(current - next) < 0.5 ? current : next
      )
    }
    updateWidth()
    if (typeof window === 'undefined') return
    window.addEventListener('resize', updateWidth)
    const element = editorCoverRef.current ?? coverRef.current
    if (element && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateWidth)
      observer.observe(element)
      return () => {
        observer.disconnect()
        window.removeEventListener('resize', updateWidth)
      }
    }
    return () => {
      window.removeEventListener('resize', updateWidth)
    }
  }, [editingSection, getCoverFrameWidth])
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
  const certificatesPayload = useMemo(
    () =>
      certificates
        .map((certificate) => ({
          id: certificate.id,
          title: certificate.title?.trim() || null,
          issuer: certificate.issuer?.trim() || null,
          year: typeof certificate.year === 'number' ? certificate.year : null,
          url: certificate.url?.trim() || null,
          verifyUrl: certificate.verifyUrl?.trim() || null,
        }))
        .filter((certificate) => certificate.title || certificate.url),
    [certificates]
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
      cancelWindowHours: parseNumber(cancelWindowHours),
      depositPercent: parseNumber(depositPercent),
      depositType,
      depositFixed: parseNumber(depositFixed),
      depositDetails: depositDetails.trim() || null,
      depositQrUrl: depositQrUrl?.trim() || null,
      worksAtClient,
      worksAtMaster,
      categories: [...categories],
      services: [...serviceStrings],
      portfolioUrls: [...portfolioStrings],
      showcaseUrls: [...showcaseStrings],
      certificates: certificatesPayload,
    }
  }, [
    about,
    categories,
    cityId,
    cancelWindowHours,
    displayName,
    districtId,
    depositDetails,
    depositFixed,
    depositPercent,
    depositQrUrl,
    depositType,
    experienceYears,
    isActive,
    portfolioStrings,
    priceFromValue,
    priceToValue,
    scheduleDays,
    scheduleEnd,
    scheduleStart,
    showcaseStrings,
    certificatesPayload,
    serviceStrings,
    userId,
    worksAtClient,
    worksAtMaster,
  ])
  const displayNameValue =
    displayName.trim() || displayNameFallback.trim() || 'Мастер'
  const aboutPreview = about.trim() || 'Статус пока не добавлен.'
  const avatarDisplayUrl = avatarUrl || telegramAvatarUrl || ''
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
  const saveButtonLabel = isSaving ? 'Сохраняем...' : 'Готово'
  const canSaveBase = Boolean(profilePayload) && !isSaving
  const editorTitle = editingSection ? editorTitleMap[editingSection] : ''
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
  const profileStatusSummary = useMemo(
    () => getProfileStatusSummary(profilePayload),
    [profilePayload]
  )
  const profileStatusTone =
    profileStatusSummary.profileStatus === 'complete'
      ? 'is-complete'
      : profileStatusSummary.profileStatus === 'ready'
        ? 'is-ready'
        : 'is-draft'
  const coverPreviewStyle = coverUrl
    ? ({ backgroundImage: `url(${coverUrl})` } as CSSProperties)
    : undefined
  const screenStyle = useMemo(() => {
    if (!coverAspectValue) return undefined
    return { '--cover-aspect': coverAspectValue.toString() } as CSSProperties &
      Record<string, string>
  }, [coverAspectValue])
  const reviewCount = reviewSummary?.count ?? 0
  const reviewAverage = reviewSummary?.average ?? 0
  const reviewDistribution = reviewSummary?.distribution ?? []
  const reviewCountLabel =
    reviewCount > 0 ? formatReviewCount(reviewCount) : 'Нет отзывов'
  const followersValue = followersCount.toLocaleString('ru-RU')
  const followersQueryValue = followersQuery.trim()
  const followersQueryFetch = followersQueryDebounced
  const followersTotalLabel = formatCount(
    followersTotal,
    'подписчик',
    'подписчика',
    'подписчиков'
  )
  const followersSummaryLabel = followersQueryFetch
    ? `Найдено: ${followersTotalLabel}`
    : `Всего: ${followersTotalLabel}`
  const followersHasMore = followers.length < followersTotal
  const followersEmptyLabel = followersQueryFetch
    ? 'Никого не нашли.'
    : 'Пока нет подписчиков.'
  const followersInitialLoading = isFollowersLoading && followers.length === 0
  const portfolioCount = portfolioItems.filter((item) => item.url.trim()).length
  const showcaseCount = showcaseItems.length
  const certificateItems = useMemo(
    () =>
      certificates.filter(
        (certificate) => certificate.url?.toString().trim() || certificate.title
      ),
    [certificates]
  )
  const certificateCount = certificateItems.length
  const certificatesToggleLabel = isCertificatesExpanded ? 'Свернуть' : 'Показать'
  const isCertificatesCollapsed = certificateCount > 0 && !isCertificatesExpanded
  const handleCertificateImageLoad = (
    certificateId: string,
    image: HTMLImageElement
  ) => {
    if (!image.naturalWidth || !image.naturalHeight) return
    const ratio = clampCertificateRatio(image.naturalWidth / image.naturalHeight)
    setCertificateRatios((current) =>
      current[certificateId] === ratio
        ? current
        : { ...current, [certificateId]: ratio }
    )
  }
  const certificatesActionLabel = certificateCount > 0 ? 'Редактировать' : 'Добавить'
  const showCertificatesEditAction = certificateCount === 0 || isCertificatesExpanded
  const certificatesListId = `pro-profile-certificates-list-${userId}`
  const avatarActionsId = 'pro-profile-avatar-actions'
  const portfolioCountLabel = `${portfolioCount} из ${MAX_PORTFOLIO_ITEMS}`
  const showcaseCountLabel = `${showcaseCount} из ${MAX_SHOWCASE_ITEMS}`
  const portfolioPanelCountLabel =
    portfolioView === 'portfolio' ? portfolioCountLabel : showcaseCountLabel
  const reviewAverageLabel = reviewCount > 0 ? reviewAverage.toFixed(1) : '—'
  const profileStats = [
    { id: 'works', label: 'Работы', value: String(portfolioCount) },
    { id: 'rating', label: 'Рейтинг', value: reviewAverageLabel },
    { id: 'reviews', label: 'Отзывы', value: String(reviewCount) },
    { id: 'followers', label: 'Подписчики', value: followersValue },
  ] satisfies { id: StatId; label: string; value: string }[]
  const locationLabel = useMemo(() => {
    const cityLabel = cityId
      ? cities.find((city) => city.id === cityId)?.name
      : ''
    const districtLabel = districtId
      ? districts.find((district) => district.id === districtId)?.name
      : ''
    return [cityLabel, districtLabel].filter(Boolean).join(', ') || 'Город не указан'
  }, [cities, cityId, districts, districtId])
  const hasLocationComplete = cityId !== null && districtId !== null
  const hasWorkFormat = worksAtClient || worksAtMaster
  const hasPrice = priceFromValue !== null || priceToValue !== null
  const hasExperience = experienceValue !== null
  const formatIcon =
    worksAtMaster && !worksAtClient
      ? <IconHomeMaster />
      : worksAtClient && !worksAtMaster
        ? <IconClientVisit />
        : <IconFormat />
  type ProfileFact = {
    id: string
    label: string
    value: string
    icon: ReactElement
    isMuted: boolean
    section: ProProfileSection
  }

  const profileFacts: ProfileFact[] = [
    {
      id: 'location',
      label: 'Локация',
      value: locationLabel,
      icon: <IconPin />,
      isMuted: !hasLocationComplete,
      section: 'location',
    },
    {
      id: 'format',
      label: 'Формат',
      value: workFormatLabel,
      icon: formatIcon,
      isMuted: !hasWorkFormat,
      section: 'location',
    },
    {
      id: 'price',
      label: 'Цена',
      value: priceLabel,
      icon: <IconPrice />,
      isMuted: !hasPrice,
      section: 'services',
    },
    {
      id: 'experience',
      label: 'Опыт',
      value: experienceLabel,
      icon: <IconExperience />,
      isMuted: !hasExperience,
      section: 'location',
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
  const scheduleDaysSet = useMemo(() => new Set(scheduleDays), [scheduleDays])
  const scheduleDayLabels = scheduleDayOptions
    .filter((day) => scheduleDays.includes(day.id))
    .map((day) => day.label)
  let scheduleDaysLabel = ''
  if (scheduleDayLabels.length === 7) {
    scheduleDaysLabel = 'Каждый день'
  } else if (scheduleDayLabels.length > 3) {
    scheduleDaysLabel = `${scheduleDayLabels.slice(0, 3).join(', ')} +${
      scheduleDayLabels.length - 3
    }`
  } else if (scheduleDayLabels.length > 0) {
    scheduleDaysLabel = scheduleDayLabels.join(', ')
  }
  const scheduleStartValue = scheduleStart.trim()
  const scheduleEndValue = scheduleEnd.trim()
  const scheduleTimeLabel =
    scheduleStartValue && scheduleEndValue
      ? `${scheduleStartValue}–${scheduleEndValue}`
      : scheduleStartValue || scheduleEndValue
        ? `${scheduleStartValue || scheduleEndValue}`
        : ''
  const availabilitySummary =
    scheduleDaysLabel || scheduleTimeLabel
      ? [scheduleDaysLabel, scheduleTimeLabel].filter(Boolean).join(' · ')
      : 'График не задан'
  const cancelWindowValue = parseNumber(cancelWindowHours)
  const depositPercentValue = parseNumber(depositPercent)
  const depositFixedValue = parseNumber(depositFixed)
  const cancelWindowLabel =
    cancelWindowValue !== null
      ? `Бесплатная отмена за ${cancelWindowValue} ч`
      : 'Окно отмены не задано'
  const depositLabel =
    depositType === 'fixed'
      ? depositFixedValue !== null && depositFixedValue > 0
        ? `Депозит ${formatPrice(depositFixedValue)}`
        : 'Без депозита'
      : depositType === 'percent'
        ? depositPercentValue !== null && depositPercentValue > 0
          ? `Депозит ${depositPercentValue}%`
          : 'Без депозита'
        : 'Без депозита'
  const hasCustomPolicies =
    (cancelWindowValue !== null && cancelWindowValue !== 12) ||
    ((depositType === 'fixed' &&
      depositFixedValue !== null &&
      depositFixedValue > 0) ||
      (depositType === 'percent' &&
        depositPercentValue !== null &&
        depositPercentValue > 0))
  const policiesSummary =
    cancelWindowLabel || depositLabel
      ? [cancelWindowLabel, depositLabel]
          .filter(Boolean)
          .join(' · ')
      : 'Политики не настроены'
  const servicesCount = serviceNames.length
  const servicesPriceLabel =
    priceFromValue !== null && priceToValue !== null
      ? `${priceFromValue}–${priceToValue} ₽`
      : priceFromValue !== null
        ? `от ${priceFromValue} ₽`
        : priceToValue !== null
          ? `до ${priceToValue} ₽`
          : ''
  const servicesSummary =
    servicesCount > 0
      ? [formatCount(servicesCount, 'услуга', 'услуги', 'услуг'), servicesPriceLabel]
          .filter(Boolean)
          .join(' · ')
      : 'Услуги не добавлены'
  const certificatesSummary =
    certificateCount > 0
      ? formatCount(certificateCount, 'сертификат', 'сертификата', 'сертификатов')
      : 'Сертификатов нет'
  const aboutSnippet = about.trim()
  const aboutSummary =
    aboutSnippet.length > 44 ? `${aboutSnippet.slice(0, 44)}...` : aboutSnippet
  const experienceSummary =
    experienceValue !== null ? `Опыт ${experienceValue} лет` : ''
  const basicSummary =
    aboutSummary ||
    [experienceSummary, servicesPriceLabel].filter(Boolean).join(' · ') ||
    'Имя, опыт, статус'
  const hasCover = Boolean(coverUrl.trim())
  const mediaSummary =
    hasAvatar && hasCover
      ? 'Аватар и шапка добавлены'
      : hasAvatar
        ? 'Добавьте шапку профиля'
        : hasCover
          ? 'Добавьте фото профиля'
          : 'Добавьте аватар и шапку'
  const settingsHints: Record<SettingsItemId, string> = {
    media: mediaSummary,
    basic: basicSummary,
    location: locationLabel,
    availability: availabilitySummary,
    policies: policiesSummary,
    services: servicesSummary,
    certificates: certificatesSummary,
  }
  const settingsItemStatus: Record<
    SettingsItemId,
    { label: string; tone: 'ready' | 'required' | 'optional' }
  > = {
    media:
      hasAvatar && hasCover
        ? { label: 'Готово', tone: 'ready' }
        : hasAvatar || hasCover
          ? { label: 'Почти', tone: 'optional' }
          : { label: 'Нужно', tone: 'required' },
    basic: displayName.trim()
      ? { label: 'Готово', tone: 'ready' }
      : { label: 'Нужно', tone: 'required' },
    location:
      hasLocationComplete && hasWorkFormat
        ? { label: 'Готово', tone: 'ready' }
        : { label: 'Нужно', tone: 'required' },
    availability:
      scheduleDays.length > 0 || scheduleStartValue || scheduleEndValue
        ? { label: 'Заполнено', tone: 'ready' }
        : { label: 'Опционально', tone: 'optional' },
    policies: hasCustomPolicies
      ? { label: 'Настроено', tone: 'ready' }
      : { label: 'Опционально', tone: 'optional' },
    services:
      serviceItems.length > 0
        ? { label: 'Готово', tone: 'ready' }
        : { label: 'Нужно', tone: 'required' },
    certificates:
      certificateCount > 0
        ? { label: 'Добавлено', tone: 'ready' }
        : { label: 'Опционально', tone: 'optional' },
  }
  const settingsReadyCount = profileSettingsItems.filter(
    (item) => settingsItemStatus[item.id].tone === 'ready'
  ).length
  const hasPartialTimeRange = Boolean(scheduleStartValue) !== Boolean(scheduleEndValue)
  const scheduleStartMinutes = scheduleStartValue
    ? parseTimeToMinutes(scheduleStartValue)
    : null
  const scheduleEndMinutes = scheduleEndValue ? parseTimeToMinutes(scheduleEndValue) : null
  const hasInvalidTimeRange =
    scheduleStartMinutes !== null &&
    scheduleEndMinutes !== null &&
    scheduleEndMinutes <= scheduleStartMinutes
  const scheduleDaysCountLabel =
    scheduleDayLabels.length > 0
      ? formatCount(scheduleDayLabels.length, 'день', 'дня', 'дней')
      : 'Дни не выбраны'
  const availabilityStatusLabel = isActive ? 'Онлайн для заявок' : 'Пауза'
  const availabilityStatusHint = isActive
    ? 'Клиенты могут писать в выбранные дни и часы.'
    : 'Новые заявки временно не принимаются.'
  const availabilityDayError = isActive && scheduleDays.length === 0
  const availabilityTimeError = hasPartialTimeRange || hasInvalidTimeRange
  const availabilityDaysHint =
    scheduleDays.length > 0
      ? `Выбрано: ${scheduleDaysLabel || scheduleDaysCountLabel}.`
      : 'Выберите рабочие дни, чтобы клиенты видели ваш ритм.'
  const availabilityTimeHint = hasPartialTimeRange
    ? 'Укажите и начало, и окончание рабочего времени.'
    : hasInvalidTimeRange
      ? 'Окончание должно быть позже начала.'
      : scheduleTimeLabel
        ? `Рабочее окно: ${scheduleTimeLabel}.`
        : 'Оставьте пусто, если время подтверждается в чате.'
  const availabilityTimelineHasRange =
    scheduleStartMinutes !== null &&
    scheduleEndMinutes !== null &&
    scheduleEndMinutes > scheduleStartMinutes &&
    !hasInvalidTimeRange
  const availabilityTimelineStartPercent = availabilityTimelineHasRange
    ? clampUnit(scheduleStartMinutes / (24 * 60)) * 100
    : 0
  const availabilityTimelineWidthPercent = availabilityTimelineHasRange
    ? clampUnit((scheduleEndMinutes - scheduleStartMinutes) / (24 * 60)) * 100
    : 0
  const availabilityTimelineStyle = {
    '--availability-start': `${availabilityTimelineStartPercent.toFixed(2)}%`,
    '--availability-width': `${availabilityTimelineWidthPercent.toFixed(2)}%`,
  } as CSSProperties & Record<string, string>
  const availabilityDurationMinutes = availabilityTimelineHasRange
    ? (scheduleEndMinutes ?? 0) - (scheduleStartMinutes ?? 0)
    : 0
  const availabilityDurationHours = availabilityDurationMinutes / 60
  const availabilityDurationLabel =
    availabilityDurationMinutes > 0
      ? `${(Number.isInteger(availabilityDurationHours)
          ? availabilityDurationHours.toString()
          : availabilityDurationHours.toFixed(1).replace('.', ','))} ч/день`
      : 'Время по договоренности'
  const hasServicesWithoutPrice = serviceItems.some((service) => {
    if (!service.name.trim()) return false
    return typeof service.price !== 'number' || service.price <= 0
  })
  const hasServicesWithoutDuration = serviceItems.some((service) => {
    if (!service.name.trim()) return false
    if (service.duration === null || service.duration === undefined) return false
    return service.duration <= 0
  })
  const hasCertificateDraftWithoutImage = certificates.some((certificate) => {
    const hasMeta =
      Boolean(certificate.title?.trim()) ||
      Boolean(certificate.issuer?.trim()) ||
      Boolean(certificate.verifyUrl?.trim()) ||
      typeof certificate.year === 'number'
    return hasMeta && !certificate.url?.trim()
  })
  const editorValidationError = useMemo(() => {
    if (!editingSection) return ''
    if (editingSection === 'basic') {
      if (displayName.trim().length < 3) {
        return 'Укажите имя и специализацию (минимум 3 символа).'
      }
      if (about.trim().length > 220) {
        return 'Сократите раздел «Коротко о вас» до 220 символов.'
      }
      return ''
    }
    if (editingSection === 'location') {
      if (!hasLocationComplete) {
        return 'Выберите город и район.'
      }
      if (!hasWorkFormat) {
        return 'Отметьте хотя бы один формат работы.'
      }
      return ''
    }
    if (editingSection === 'availability') {
      if (isActive && scheduleDays.length === 0) {
        return 'Выберите хотя бы один рабочий день.'
      }
      if (hasPartialTimeRange) {
        return 'Укажите и начало, и окончание рабочего времени.'
      }
      if (hasInvalidTimeRange) {
        return 'Окончание должно быть позже начала.'
      }
      return ''
    }
    if (editingSection === 'policies') {
      if (cancelWindowValue !== null && (cancelWindowValue < 0 || cancelWindowValue > 72)) {
        return 'Окно бесплатной отмены должно быть от 0 до 72 часов.'
      }
      if (depositType === 'percent') {
        if (depositPercentValue === null || depositPercentValue < 5 || depositPercentValue > 100) {
          return 'Депозит в процентах должен быть от 5% до 100%.'
        }
        if (!depositDetails.trim() && !depositQrUrl) {
          return 'Добавьте реквизиты или QR-код для депозита.'
        }
      }
      if (depositType === 'fixed') {
        if (depositFixedValue === null || depositFixedValue < 100) {
          return 'Фиксированный депозит должен быть не меньше 100 ₽.'
        }
        if (!depositDetails.trim() && !depositQrUrl) {
          return 'Добавьте реквизиты или QR-код для депозита.'
        }
      }
      return ''
    }
    if (editingSection === 'services') {
      if (serviceItems.length === 0) {
        return 'Добавьте хотя бы одну услугу.'
      }
      if (hasServicesWithoutPrice) {
        return 'Для каждой услуги укажите цену больше 0 ₽.'
      }
      if (hasServicesWithoutDuration) {
        return 'Длительность услуги должна быть больше 0 минут.'
      }
      return ''
    }
    if (editingSection === 'certificates') {
      if (hasCertificateDraftWithoutImage) {
        return 'Для заполненного сертификата загрузите изображение.'
      }
      return ''
    }
    return ''
  }, [
    about,
    cancelWindowValue,
    depositDetails,
    depositFixedValue,
    depositPercentValue,
    depositQrUrl,
    depositType,
    displayName,
    editingSection,
    hasCertificateDraftWithoutImage,
    hasInvalidTimeRange,
    hasLocationComplete,
    hasPartialTimeRange,
    hasServicesWithoutDuration,
    hasServicesWithoutPrice,
    hasWorkFormat,
    isActive,
    scheduleDays.length,
    serviceItems.length,
  ])
  const canSave = canSaveBase && !editorValidationError
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
  const showcasePreviewService = useMemo(
    () => serviceItems.find((item) => item.name.trim()),
    [serviceItems]
  )
  const showcasePreviewTitle =
    showcasePreviewService?.name.trim() || 'Маникюр'
  const showcasePreviewMetaRaw = showcasePreviewService
    ? formatServiceMeta(showcasePreviewService)
    : ''
  const showcasePreviewMeta = showcasePreviewMetaRaw
    ? showcasePreviewMetaRaw.split(' • ').join(' · ')
    : ''
  const showcasePreviewMetaLabel =
    showcasePreviewMeta ||
    (priceFromValue !== null || priceToValue !== null ? priceLabel : '') ||
    'от 1200 ₽ · 90 мин'
  const showcasePreviewMetaIsFallback =
    !showcasePreviewMeta &&
    !(priceFromValue !== null || priceToValue !== null)
  const showcasePreviewLocation =
    locationLabel !== 'Город не указан'
      ? locationLabel.replace(', ', ' · ')
      : 'Ростов-на-Дону · Кировский'
  const showcasePreviewLocationIsFallback = locationLabel === 'Город не указан'
  const showcasePreviewMedia = useMemo(
    () =>
      showcaseItems.find((item) => isImageUrl(item.url)) ??
      portfolioItems.find((item) => isImageUrl(item.url)) ??
      null,
    [portfolioItems, showcaseItems]
  )
  const showcasePreviewFocus = resolvePortfolioFocus(showcasePreviewMedia)
  const showcasePreviewMediaUrl = showcasePreviewMedia?.url ?? ''
  const showcasePreviewWidths = [64, 96, 128]
  const showcasePreviewQuality = 72
  const hasShowcasePreviewMedia = Boolean(showcasePreviewMediaUrl)
  const showcaseSampleUrl = '/showcase-sample.webp'
  const showcasePreviewDisplayUrl = hasShowcasePreviewMedia
    ? showcasePreviewMediaUrl
    : showcaseSampleUrl
  const showcasePreviewIsSample = !hasShowcasePreviewMedia
  const isPortfolioFull = portfolioItems.length >= MAX_PORTFOLIO_ITEMS
  const portfolioLightboxItem =
    portfolioLightboxIndex !== null ? portfolioItems[portfolioLightboxIndex] ?? null : null
  const portfolioLightboxFocus = resolvePortfolioFocus(portfolioLightboxItem)
  const isLightboxImage = portfolioLightboxItem
    ? isImageUrl(portfolioLightboxItem.url)
    : false
  const certificateLightboxItem =
    certificateLightboxIndex !== null
      ? certificateItems[certificateLightboxIndex] ?? null
      : null
  const certificateLightboxTitle =
    certificateLightboxItem?.title?.trim() || 'Сертификат'
  const certificateLightboxMeta = certificateLightboxItem
    ? buildCertificateMeta(certificateLightboxItem)
    : ''
  const certificateLightboxRatio = certificateLightboxItem
    ? certificateRatios[certificateLightboxItem.id]
    : undefined
  const certificateLightboxStyle = certificateLightboxRatio
    ? ({ '--certificate-ratio': certificateLightboxRatio } as CSSProperties)
    : undefined
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
    certificateLightboxIndex !== null ||
    portfolioFocusIndex !== null ||
    showcaseFocusIndex !== null ||
    isPortfolioPickerOpen ||
    portfolioQuickActionIndex !== null
  const isCropperUploading =
    cropperState?.kind === 'avatar' ? isAvatarUploading : isCoverUploading
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
  const isPortfolioSparse = visiblePortfolioItems.length === 1
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
  const parsedServiceAddDuration = parseNumber(serviceAddDuration)
  const isServiceAddReady =
    parsedServiceAddPrice !== null &&
    parsedServiceAddPrice > 0 &&
    parsedServiceAddDuration !== null &&
    parsedServiceAddDuration > 0
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
  const openCertificateLightbox = (index: number) => {
    if (!certificateItems[index]) return
    setCertificateLightboxIndex(index)
  }
  const closeCertificateLightbox = () => {
    setCertificateLightboxIndex(null)
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
  const openAvatarActions = () => {
    if (
      isAvatarUploading ||
      isCoverUploading ||
      isSettingsOpen ||
      editingSection ||
      cropperState
    ) {
      return
    }
    setIsAvatarActionsOpen(true)
  }
  const closeAvatarActions = () => {
    setIsAvatarActionsOpen(false)
  }
  const closeCropper = () => {
    if (isAvatarUploading || isCoverUploading) return
    setCropperState(null)
  }
  const openSettings = () => {
    if (isAvatarUploading || isCoverUploading || editingSection || cropperState) {
      return
    }
    settingsReturnRef.current = false
    setSaveError('')
    setIsAvatarActionsOpen(false)
    setIsSettingsOpen(true)
  }
  const closeSettings = () => {
    settingsReturnRef.current = false
    setIsSettingsOpen(false)
  }
  const openMediaEditor = () => {
    if (isAvatarUploading || isCoverUploading) return
    setIsSettingsOpen(false)
    settingsReturnRef.current = false
    setEditingSection('media')
  }
  const openEditor = (
    section: ProProfileSection,
    options?: { returnToSettings?: boolean }
  ) => {
    if (typeof options?.returnToSettings === 'boolean') {
      settingsReturnRef.current = options.returnToSettings
    } else if (!editingSection) {
      settingsReturnRef.current = false
    }
    setSaveError('')
    setIsSettingsOpen(false)
    if (section === 'portfolio') {
      portfolioPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      return
    }
    setEditingSection(section)
  }
  const closeEditor = () => {
    const shouldReturnAfterEdit =
      returnView === 'pro-requests' &&
      returnAfterEditorRef.current &&
      !settingsReturnRef.current
    setEditingSection(null)
    setSaveError('')
    if (settingsReturnRef.current) {
      settingsReturnRef.current = false
      setIsSettingsOpen(true)
      return
    }
    if (shouldReturnAfterEdit) {
      returnAfterEditorRef.current = false
      onBack()
    }
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
  const openFollowersSheet = useCallback(() => {
    setFollowersTotal((current) => (current > 0 ? current : followersCount))
    setIsFollowersOpen(true)
  }, [followersCount])

  const closeFollowersSheet = useCallback(() => {
    followersRequestIdRef.current += 1
    setIsFollowersOpen(false)
    setFollowers([])
    setFollowersTotal(0)
    setFollowersQuery('')
    setFollowersQueryDebounced('')
    setFollowersError('')
    setIsFollowersLoading(false)
  }, [])

  const loadFollowers = useCallback(
    async (options: { offset: number; append: boolean }) => {
      if (!userId) return
      const requestId = (followersRequestIdRef.current += 1)
      setFollowersError('')
      setIsFollowersLoading(true)
      if (!options.append) {
        setFollowers([])
      }

      const params = new URLSearchParams({
        limit: String(FOLLOWERS_PAGE_SIZE),
        offset: String(Math.max(0, options.offset)),
      })
      if (followersQueryFetch) {
        params.set('q', followersQueryFetch)
      }

      try {
        const response = await fetch(
          `${apiBase}/api/masters/${encodeURIComponent(userId)}/followers?${params.toString()}`
        )
        if (!response.ok) {
          throw new Error('Load followers failed')
        }
        const data = (await response.json()) as {
          total?: number
          followers?: MasterFollower[]
        }
        if (followersRequestIdRef.current !== requestId) return
        const nextFollowers = Array.isArray(data.followers) ? data.followers : []
        const nextTotal =
          typeof data.total === 'number' ? data.total : nextFollowers.length
        setFollowersTotal(nextTotal)
        setFollowersCount(nextTotal)
        setFollowers((current) =>
          options.append ? [...current, ...nextFollowers] : nextFollowers
        )
      } catch (error) {
        if (followersRequestIdRef.current === requestId) {
          setFollowersError('Не удалось загрузить подписчиков.')
        }
      } finally {
        if (followersRequestIdRef.current === requestId) {
          setIsFollowersLoading(false)
        }
      }
    },
    [apiBase, followersQueryFetch, userId]
  )

  const handleStatTap = (statId: StatId) => {
    setActiveStat(statId)
    if (statId === 'followers') {
      openFollowersSheet()
      return
    }
    if (statId === 'works') {
      setPortfolioView('portfolio')
      portfolioPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      return
    }
    reviewsSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  const getStatAriaLabel = (stat: { id: StatId; label: string; value: string }) => {
    switch (stat.id) {
      case 'followers':
        return `Открыть список подписчиков: ${stat.value}`
      case 'works':
        return `Портфолио: ${stat.value}`
      case 'rating':
        return `Рейтинг: ${stat.value}`
      case 'reviews':
      default:
        return `Отзывы: ${stat.value}`
    }
  }

  const handleFollowersLoadMore = () => {
    if (isFollowersLoading) return
    loadFollowers({ offset: followers.length, append: true })
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
    const trimmed = followersQuery.trim()
    const timer = window.setTimeout(() => {
      setFollowersQueryDebounced(trimmed)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [followersQuery])

  useEffect(() => {
    if (!activeStat) return
    const timer = window.setTimeout(() => {
      setActiveStat(null)
    }, 360)
    return () => window.clearTimeout(timer)
  }, [activeStat])

  useEffect(() => {
    if (!isFollowersOpen) return
    loadFollowers({ offset: 0, append: false })
  }, [followersQueryDebounced, isFollowersOpen, loadFollowers])

  useEffect(() => {
    if (!isFollowersOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFollowersOpen])

  useEffect(() => {
    if (editingSection) {
      setIsAvatarActionsOpen(false)
    }
  }, [editingSection])

  useEffect(() => {
    if (editingSection && isSettingsOpen) {
      setIsSettingsOpen(false)
    }
  }, [editingSection, isSettingsOpen])

  useEffect(() => {
    if (isSettingsOpen) {
      setIsAvatarActionsOpen(false)
    }
  }, [isSettingsOpen])

  useEffect(() => {
    if (cropperState) {
      setIsAvatarActionsOpen(false)
    }
  }, [cropperState])

  useEffect(() => {
    cropperStateRef.current = cropperState
  }, [cropperState])

  useEffect(() => {
    avatarActionsOpenRef.current = isAvatarActionsOpen
  }, [isAvatarActionsOpen])

  useEffect(() => {
    editingSectionRef.current = editingSection
  }, [editingSection])

  useEffect(() => {
    settingsOpenRef.current = isSettingsOpen
  }, [isSettingsOpen])

  useEffect(() => {
    portfolioLightboxIndexRef.current = portfolioLightboxIndex
  }, [portfolioLightboxIndex])

  useEffect(() => {
    certificateLightboxIndexRef.current = certificateLightboxIndex
  }, [certificateLightboxIndex])

  useEffect(() => {
    portfolioFocusIndexRef.current = portfolioFocusIndex
  }, [portfolioFocusIndex])

  useEffect(() => {
    showcaseFocusIndexRef.current = showcaseFocusIndex
  }, [showcaseFocusIndex])

  useEffect(() => {
    if (!onBackHandlerChange) return
    const handler = () => {
      if (cropperStateRef.current) {
        closeCropper()
        return true
      }
      if (avatarActionsOpenRef.current) {
        closeAvatarActions()
        return true
      }
      if (isFollowersOpen) {
        closeFollowersSheet()
        return true
      }
      if (settingsOpenRef.current) {
        closeSettings()
        return true
      }
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
      if (certificateLightboxIndexRef.current !== null) {
        closeCertificateLightbox()
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
        closeEditor()
        return true
      }
      return false
    }
    onBackHandlerChange(handler)
    return () => {
      onBackHandlerChange(null)
    }
  }, [
    closeEditor,
    closeFollowersSheet,
    closeSettings,
    isFollowersOpen,
    isPortfolioPickerOpen,
    onBackHandlerChange,
    portfolioQuickActionIndex,
  ])

  useEffect(() => {
    if (returnView !== 'pro-requests') {
      returnAfterEditorRef.current = false
      return
    }
    if (focusSection && focusSection !== 'portfolio') {
      returnAfterEditorRef.current = true
    }
  }, [focusSection, returnView])

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
    if (!initialPortfolioView) return
    setPortfolioView(initialPortfolioView)
  }, [initialPortfolioView])

  useEffect(() => {
    if (!editingSection) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [editingSection])

  useEffect(() => {
    if (!isSettingsOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isSettingsOpen])

  useEffect(() => {
    if (!cropperState) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [cropperState])

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
      certificateLightboxIndex !== null &&
      !certificateItems[certificateLightboxIndex]
    ) {
      setCertificateLightboxIndex(null)
    }
  }, [certificateItems, certificateLightboxIndex])

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
    if (editorValidationError) return
    if (profileAutosaveTimerRef.current) {
      window.clearTimeout(profileAutosaveTimerRef.current)
    }
    profileAutosaveTimerRef.current = window.setTimeout(() => {
      void saveProfile(profilePayload)
    }, 700)
    return () => {
      if (profileAutosaveTimerRef.current) {
        window.clearTimeout(profileAutosaveTimerRef.current)
      }
    }
  }, [editorValidationError, profilePayload, isPortfolioUploading, isShowcaseUploading])

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
      if (profileAutosaveTimerRef.current) {
        window.clearTimeout(profileAutosaveTimerRef.current)
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
        const nextScheduleDays = normalizeScheduleDays(
          Array.isArray(data.scheduleDays) ? data.scheduleDays : []
        )
        const nextScheduleStart = data.scheduleStart ?? ''
        const nextScheduleEnd = data.scheduleEnd ?? ''
        const nextCancelWindowHours =
          typeof data.cancelWindowHours === 'number'
            ? Math.max(0, Math.round(data.cancelWindowHours))
            : 12
        const nextDepositPercent =
          typeof data.depositPercent === 'number'
            ? Math.max(0, Math.round(data.depositPercent))
            : 0
        const nextDepositFixed =
          typeof data.depositFixed === 'number'
            ? Math.max(0, Math.round(data.depositFixed))
            : 0
        const normalizedDepositType =
          data.depositType === 'fixed' ||
          data.depositType === 'percent' ||
          data.depositType === 'none'
            ? data.depositType
            : null
        const nextDepositType =
          normalizedDepositType ??
          (nextDepositFixed > 0 ? 'fixed' : nextDepositPercent > 0 ? 'percent' : 'none')
        const nextDepositDetails =
          typeof data.depositDetails === 'string' ? data.depositDetails : ''
        const nextDepositQrUrl =
          typeof data.depositQrUrl === 'string' ? data.depositQrUrl : ''
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
        const nextCertificates = Array.isArray(data.certificates)
          ? data.certificates.map((certificate) => normalizeCertificate(certificate))
          : []

        setDisplayName(nextDisplayName)
        setAbout(nextAbout)
        setCityId(nextCityId)
        setDistrictId(nextDistrictId)
        setExperienceYears(nextExperienceYears)
        setIsActive(nextIsActive)
        setScheduleDays(nextScheduleDays)
        setScheduleStart(nextScheduleStart)
        setScheduleEnd(nextScheduleEnd)
        setCancelWindowHours(String(nextCancelWindowHours))
        setDepositPercent(String(nextDepositPercent))
        setDepositType(nextDepositType)
        setDepositFixed(String(nextDepositFixed || ''))
        setDepositDetails(nextDepositDetails)
        setDepositQrUrl(nextDepositQrUrl || null)
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
        setCertificates(nextCertificates)
        setAvatarUrl(data.avatarUrl ?? '')
        setHasAvatar(Boolean(data.hasAvatar))
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
          cancelWindowHours: nextCancelWindowHours,
          depositPercent: nextDepositPercent,
          depositType: nextDepositType,
          depositFixed: nextDepositFixed,
          depositDetails: nextDepositDetails.trim() || null,
          depositQrUrl: nextDepositQrUrl.trim() || null,
          worksAtClient: nextWorksAtClient,
          worksAtMaster: nextWorksAtMaster,
          categories: [...nextCategories],
          services: toServiceStrings(nextServiceItems),
          portfolioUrls: toPortfolioStrings(nextPortfolioItems),
          showcaseUrls: toPortfolioStrings(nextShowcaseItems),
          certificates: nextCertificates
            .map((certificate) => ({
              id: certificate.id,
              title: certificate.title?.trim() || null,
              issuer: certificate.issuer?.trim() || null,
              year: typeof certificate.year === 'number' ? certificate.year : null,
              url: certificate.url?.trim() || null,
              verifyUrl: certificate.verifyUrl?.trim() || null,
            }))
            .filter((certificate) => certificate.title || certificate.url),
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
    if (editorValidationError) {
      setSaveError(editorValidationError)
      return
    }
    const saved = await saveProfile(profilePayload)
    if (saved) {
      closeEditor()
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
    const parsedDuration = parsedServiceAddDuration
    if (parsedDuration === null || parsedDuration <= 0) {
      setServiceAddError('Укажите длительность услуги в минутах.')
      return
    }
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

  const uploadMedia = async (kind: 'avatar' | 'cover', dataUrl: string) => {
    if (!userId) return false
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
            ? 'Не удалось загрузить изображение.'
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
        setHasAvatar(true)
      } else {
        setCoverUrl(payload.coverUrl ?? '')
      }
      return true
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : 'Не удалось загрузить изображение.'
      )
      return false
    } finally {
      if (kind === 'avatar') {
        setIsAvatarUploading(false)
      } else {
        setIsCoverUploading(false)
      }
    }
  }

  const openMediaCropper = async (kind: CropperKind, file: File) => {
    setMediaError('')
    setIsAvatarActionsOpen(false)
    try {
      const dataUrl = await readImageFileAsync(file)
      let coverAspect: number | undefined
      if (kind === 'cover') {
        const rect = await waitForCoverRect()
        const rectAspect =
          rect && rect.height > 0 ? rect.width / rect.height : undefined
        coverAspect =
          typeof rectAspect === 'number' &&
          Number.isFinite(rectAspect) &&
          rectAspect > 0
            ? rectAspect
            : getCoverAspectValue()
        const width = rect?.width ?? getCoverFrameWidth()
        if (width) setCoverFrameWidth(width)
        if (
          typeof coverAspect === 'number' &&
          Number.isFinite(coverAspect) &&
          coverAspect > 0
        ) {
          setCoverAspectValue((current) =>
            current && Math.abs(current - coverAspect!) < 0.01
              ? current
              : coverAspect!
          )
        }
      }
      setCropperState({ kind, src: dataUrl, coverAspect })
    } catch (error) {
      setMediaError('Не удалось прочитать файл.')
    }
  }

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setMediaError('')
    if (!allowedImageTypes.has(file.type)) {
      setMediaError('Поддерживаются только PNG, JPG или WebP.')
      event.target.value = ''
      return
    }
    if (file.size > MAX_MEDIA_INPUT_BYTES) {
      setMediaError('Файл слишком большой. Максимум 12 МБ.')
      event.target.value = ''
      return
    }
    await openMediaCropper('avatar', file)
    event.target.value = ''
  }

  const handleCoverChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setMediaError('')
    if (!allowedImageTypes.has(file.type)) {
      setMediaError('Поддерживаются только PNG, JPG или WebP.')
      event.target.value = ''
      return
    }
    if (file.size > MAX_MEDIA_INPUT_BYTES) {
      setMediaError('Файл слишком большой. Максимум 12 МБ.')
      event.target.value = ''
      return
    }
    await openMediaCropper('cover', file)
    event.target.value = ''
  }

  const handleCropperConfirm = async (dataUrl: string) => {
    if (!cropperState) return false
    const ok = await uploadMedia(cropperState.kind, dataUrl)
    if (ok) {
      setCropperState(null)
    }
    return ok
  }

  const handleAvatarSelect = () => {
    if (isAvatarUploading || cropperState) return
    avatarInputRef.current?.click()
  }

  const handleCoverSelect = () => {
    if (isCoverUploading || cropperState) return
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
      setHasAvatar(false)
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

  const updateCertificate = (
    certificateId: string,
    updates: Partial<MasterCertificate>
  ) => {
    setCertificates((current) =>
      current.map((certificate) =>
        certificate.id === certificateId
          ? { ...certificate, ...updates }
          : certificate
      )
    )
  }

  const removeCertificate = (certificateId: string) => {
    setCertificates((current) =>
      current.filter((certificate) => certificate.id !== certificateId)
    )
  }

  const handleCertificateAddClick = () => {
    if (isCertificatesUploading) return
    if (certificates.length >= MAX_CERTIFICATES) {
      setCertificatesError(`Можно добавить максимум ${MAX_CERTIFICATES} сертификатов.`)
      return
    }
    setCertificatesError('')
    certificateUploadInputRef.current?.click()
  }

  const handleCertificateReplaceClick = (certificateId: string) => {
    if (isCertificatesUploading) return
    setCertificatesError('')
    certificateReplaceIdRef.current = certificateId
    certificateReplaceInputRef.current?.click()
  }

  const handleDepositQrUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    const errorMessage = validatePortfolioFile(file)
    if (errorMessage) {
      setDepositQrError(errorMessage)
      return
    }
    setDepositQrUploading(true)
    setDepositQrError('')
    try {
      const url = await uploadDepositQrFile(file)
      setDepositQrUrl(url)
    } catch (error) {
      setDepositQrError(
        error instanceof Error ? error.message : 'Не удалось загрузить файл.'
      )
    } finally {
      setDepositQrUploading(false)
    }
  }

  const handleDepositQrUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleDepositQrUpload(event.target.files)
    event.target.value = ''
  }

  const handleDepositQrRemove = () => {
    if (depositQrUploading) return
    setDepositQrUrl(null)
    setDepositQrError('')
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

  const uploadCertificateDataUrl = async (dataUrl: string) => {
    if (!userId) {
      throw new Error('Не удалось загрузить файл. Нет пользователя.')
    }
    const response = await fetch(`${apiBase}/api/masters/certificates`, {
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

  const uploadDepositQrDataUrl = async (dataUrl: string) => {
    if (!userId) {
      throw new Error('Не удалось загрузить файл. Нет пользователя.')
    }
    const response = await fetch(`${apiBase}/api/requests/media`, {
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

  const uploadCertificateFile = async (file: File) => {
    const dataUrl = await readImageFileAsync(file)
    return uploadCertificateDataUrl(dataUrl)
  }

  const uploadDepositQrFile = async (file: File) => {
    const dataUrl = await readImageFileAsync(file)
    return uploadDepositQrDataUrl(dataUrl)
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

  const handleCertificateUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (certificates.length >= MAX_CERTIFICATES) {
      setCertificatesError(`Можно добавить максимум ${MAX_CERTIFICATES} сертификатов.`)
      return
    }
    const remaining = MAX_CERTIFICATES - certificates.length
    const selection = Array.from(files).slice(0, remaining)
    for (const file of selection) {
      const errorMessage = validatePortfolioFile(file)
      if (errorMessage) {
        setCertificatesError(errorMessage)
        return
      }
    }
    setIsCertificatesUploading(true)
    setCertificatesError('')
    try {
      const uploadedUrls: string[] = []
      for (const file of selection) {
        const url = await uploadCertificateFile(file)
        uploadedUrls.push(url)
      }
      setCertificates((current) => {
        const next = [
          ...uploadedUrls.map((url) => normalizeCertificate({ url })),
          ...current,
        ]
        return next.slice(0, MAX_CERTIFICATES)
      })
    } catch (error) {
      setCertificatesError(
        error instanceof Error ? error.message : 'Не удалось загрузить файл.'
      )
    } finally {
      setIsCertificatesUploading(false)
    }
  }

  const handleCertificateUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleCertificateUpload(event.target.files)
    event.target.value = ''
  }

  const handleCertificateReplace = async (file: File, certificateId: string) => {
    const errorMessage = validatePortfolioFile(file)
    if (errorMessage) {
      setCertificatesError(errorMessage)
      return
    }
    setIsCertificatesUploading(true)
    setCertificatesError('')
    try {
      const url = await uploadCertificateFile(file)
      updateCertificate(certificateId, { url })
    } catch (error) {
      setCertificatesError(
        error instanceof Error ? error.message : 'Не удалось загрузить файл.'
      )
    } finally {
      setIsCertificatesUploading(false)
    }
  }

  const handleCertificateReplaceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const certificateId = certificateReplaceIdRef.current
    if (!file || !certificateId) {
      event.target.value = ''
      return
    }
    void handleCertificateReplace(file, certificateId)
    certificateReplaceIdRef.current = null
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
    <div className="screen screen--pro screen--pro-profile" style={screenStyle}>
      <div className="pro-shell pro-shell--ig">
        <section className="pro-profile-hero animate delay-1">
          <div
            className={`pro-profile-ig-cover pro-profile-hero-cover is-editable${
              coverUrl ? ' has-image' : ''
            }${isCoverUploading ? ' is-loading' : ''}`}
            style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
            ref={coverRef}
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
            {coverUrl && (
              <>
                <img
                  className="pro-cover-image is-blur"
                  src={coverUrl}
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pro-cover-image is-contain"
                  src={coverUrl}
                  alt=""
                  aria-hidden="true"
                />
              </>
            )}
            <div
              className="pro-profile-ig-cover-glow pro-profile-hero-cover-glow"
              aria-hidden="true"
            />
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
          </div>
          <div className="pro-profile-hero-card">
            <div className="pro-profile-hero-identity">
              <button
                className="pro-profile-ig-button pro-profile-ig-button--fab pro-profile-hero-settings"
                type="button"
                aria-label="Настройки профиля"
                onClick={openSettings}
              >
                <span className="pro-profile-ig-button-icon" aria-hidden="true">
                  <IconSettings />
                </span>
              </button>
              <div
                className={`pro-profile-ig-avatar pro-profile-hero-avatar is-editable${
                  isAvatarUploading ? ' is-loading' : ''
                }`}
                aria-busy={isAvatarUploading}
                aria-disabled={isAvatarUploading}
                role="button"
                tabIndex={0}
                aria-label="Открыть действия профиля"
                aria-haspopup="dialog"
                aria-expanded={isAvatarActionsOpen}
                aria-controls={avatarActionsId}
                onClick={openAvatarActions}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openAvatarActions()
                  }
                }}
              >
                {avatarDisplayUrl ? (
                  <img src={avatarDisplayUrl} alt={`Аватар ${displayNameValue}`} />
                ) : (
                  <span aria-hidden="true">{profileInitials}</span>
                )}
                <span className="pro-profile-ig-avatar-badge" aria-hidden="true">
                  +
                </span>
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
              <div className="pro-profile-hero-main">
                <div className="pro-profile-hero-name-row">
                  <div className="pro-profile-hero-name-wrap">
                    <h1 className="pro-profile-hero-name">{displayNameValue}</h1>
                  </div>
                </div>
                <div className="pro-profile-hero-status-row">
                  <button
                    className={`pro-profile-ig-status pro-profile-hero-status${
                      isActive ? '' : ' is-paused'
                    }`}
                    type="button"
                    onClick={() => setIsActive((current) => !current)}
                    aria-pressed={isActive}
                  >
                    <span className="pro-profile-ig-status-toggle" aria-hidden="true">
                      <span className="pro-profile-ig-status-knob" />
                    </span>
                    <span className="pro-profile-ig-status-label">
                      {isActive ? 'Принимаю заявки' : 'Пауза'}
                    </span>
                    <span className="pro-profile-ig-status-chevron" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            <p
              className={`pro-profile-hero-about${about.trim() ? '' : ' is-muted'}`}
            >
              {aboutPreview}
            </p>
            <div className="pro-profile-hero-tags pro-profile-ig-tags">
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
            <div className="pro-profile-ig-stats pro-profile-hero-stats">
              {profileStats.map((stat) => (
                <button
                  className={`pro-profile-ig-stat pro-profile-ig-stat-button${
                    activeStat === stat.id ? ' is-active' : ''
                  }`}
                  type="button"
                  key={stat.label}
                  onClick={() => handleStatTap(stat.id)}
                  aria-label={getStatAriaLabel(stat)}
                  aria-haspopup={stat.id === 'followers' ? 'dialog' : undefined}
                >
                  <span className="pro-profile-ig-stat-value">{stat.value}</span>
                  <span className="pro-profile-ig-stat-label">{stat.label}</span>
                </button>
              ))}
            </div>
            <div className="pro-profile-hero-actions" role="list">
              <button
                className="pro-profile-hero-action is-primary"
                type="button"
                onClick={handlePortfolioAddClick}
                disabled={isPortfolioUploading || isPortfolioFull}
              >
                Добавить работу
              </button>
              <button
                className="pro-profile-hero-action is-ghost"
                type="button"
                onClick={openSettings}
              >
                Редактировать
              </button>
            </div>
          </div>
          <div className="pro-profile-ig-body">
            <div className="pro-profile-facts">
              <div
                className="pro-profile-facts-grid"
                id="pro-profile-facts-grid"
              >
                {profileFacts.map((fact) => (
                  <button
                    className={`pro-profile-fact-card is-action${
                      fact.isMuted ? ' is-muted' : ''
                    }`}
                    key={fact.label}
                    type="button"
                    onClick={() => openEditor(fact.section)}
                    aria-label={`Открыть настройки: ${fact.label}`}
                    aria-haspopup="dialog"
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
                  </button>
                ))}
              </div>
            </div>
            <div
              className={`pro-profile-certificates${
                isCertificatesCollapsed
                  ? ' is-collapsed'
                  : isCertificatesExpanded
                    ? ' is-expanded'
                    : ''
              }`}
            >
              <div className="pro-profile-certificates-head">
                <div className="pro-profile-certificates-summary">
                  <p className="pro-profile-certificates-kicker">Доверие</p>
                  <h3 className="pro-profile-certificates-title">Сертификаты</h3>
                </div>
                <div className="pro-profile-certificates-actions">
                  {certificateItems.length > 0 && (
                    <button
                      className="pro-profile-certificates-action is-toggle"
                      type="button"
                      onClick={() => setIsCertificatesExpanded((current) => !current)}
                      aria-expanded={isCertificatesExpanded}
                      aria-controls={certificatesListId}
                    >
                      {certificatesToggleLabel}
                    </button>
                  )}
                  {showCertificatesEditAction && (
                    <button
                      className="pro-profile-certificates-action"
                      type="button"
                      onClick={() => openEditor('certificates')}
                    >
                      {certificatesActionLabel}
                    </button>
                  )}
                </div>
              </div>
              {certificateItems.length > 0 && (
                <div
                  className={`pro-profile-certificates-list${
                    isCertificatesExpanded ? ' is-expanded' : ''
                  }`}
                  role="list"
                  id={certificatesListId}
                  aria-hidden={!isCertificatesExpanded}
                >
                  {certificateItems.map((certificate, index) => {
                    const meta = buildCertificateMeta(certificate)
                    const title = certificate.title?.trim() || 'Сертификат'
                    const certificateStyle = certificateRatios[certificate.id]
                      ? ({
                          '--certificate-ratio': certificateRatios[certificate.id],
                        } as CSSProperties)
                      : undefined
                    return (
                      <button
                        className="pro-profile-certificate-card"
                        type="button"
                        key={certificate.id}
                        onClick={() => openCertificateLightbox(index)}
                        role="listitem"
                        aria-label={title}
                      >
                        <div
                          className="pro-profile-certificate-media"
                          style={certificateStyle}
                        >
                          {certificate.url ? (
                            <img
                              src={certificate.url}
                              alt=""
                              loading="lazy"
                              onLoad={(event) =>
                                handleCertificateImageLoad(
                                  certificate.id,
                                  event.currentTarget
                                )
                              }
                            />
                          ) : (
                            <span className="pro-profile-certificate-fallback">
                              CERT
                            </span>
                          )}
                        </div>
                        <div className="pro-profile-certificate-info">
                          <span className="pro-profile-certificate-title">
                            {title}
                          </span>
                          <span
                            className={`pro-profile-certificate-meta${
                              meta ? '' : ' is-muted'
                            }`}
                          >
                            {meta || 'Данные не указаны'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
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
              className={`pro-profile-portfolio-content${
                isPortfolioSparse ? ' is-sparse' : ''
              }`}
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
                    Пока нет работ. Добавьте первые фото в портфолио.
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
                <div className="pro-profile-showcase-card pro-profile-showcase-intro">
                  <div className="pro-profile-showcase-intro-text">
                    <h3 className="pro-profile-showcase-intro-title">
                      Витрина — это лента для клиентов
                    </h3>
                    <p className="pro-profile-showcase-intro-subtitle">
                      Клиент видит ваше фото в общем списке работ и может сразу
                      записаться по этой работе.
                    </p>
                  </div>
                  <button
                    className="pro-profile-showcase-add"
                    type="button"
                    onClick={handleShowcaseAddClick}
                    disabled={isShowcaseUploading || !showShowcaseAddTile}
                  >
                    <span
                      className="pro-profile-showcase-add-icon"
                      aria-hidden="true"
                    >
                      +
                    </span>
                    Добавить работу
                  </button>
                  <div className="pro-profile-showcase-preview">
                    <div className="pro-profile-showcase-preview-head">
                      <span className="pro-profile-showcase-preview-title">
                        Как это увидит клиент
                      </span>
                    </div>
                    <div className="pro-profile-showcase-preview-card">
                      <span
                        className={`pro-profile-showcase-preview-media${
                          showcasePreviewIsSample ? ' is-sample' : ''
                        }`}
                      >
                        {showcasePreviewDisplayUrl ? (
                          <img
                            src={buildImageUrl(showcasePreviewDisplayUrl, {
                              width: showcasePreviewWidths[1],
                              quality: showcasePreviewQuality,
                            })}
                            alt={
                              showcasePreviewIsSample
                                ? 'Пример витрины'
                                : showcasePreviewTitle
                            }
                            loading="lazy"
                            style={{ objectPosition: showcasePreviewFocus.position }}
                            srcSet={buildImageSrcSet(
                              showcasePreviewDisplayUrl,
                              showcasePreviewWidths,
                              { quality: showcasePreviewQuality }
                            )}
                            sizes="56px"
                          />
                        ) : (
                          <span
                            className="pro-profile-showcase-preview-icon"
                            aria-hidden="true"
                          >
                            ✦
                          </span>
                        )}
                      </span>
                      <div className="pro-profile-showcase-preview-body">
                        <span className="pro-profile-showcase-preview-name">
                          {showcasePreviewTitle}
                        </span>
                        <span
                          className={`pro-profile-showcase-preview-meta${
                            showcasePreviewMetaIsFallback ? ' is-muted' : ''
                          }`}
                        >
                          {showcasePreviewMetaLabel}
                        </span>
                        <span
                          className={`pro-profile-showcase-preview-location${
                            showcasePreviewLocationIsFallback ? ' is-muted' : ''
                          }`}
                        >
                          {showcasePreviewLocation}
                        </span>
                      </div>
                      <button
                        className="pro-profile-showcase-preview-cta"
                        type="button"
                        disabled
                        aria-disabled="true"
                      >
                        Хочу так же
                      </button>
                    </div>
                    <p className="pro-profile-showcase-preview-note">
                      После загрузки выберите услугу — цена и время подставятся
                      автоматически.
                    </p>
                  </div>
                </div>
                {hasShowcase && (
                  <div className="pro-profile-showcase-card pro-profile-showcase-gallery">
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
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section
          className="pro-profile-reviews animate delay-3"
          ref={reviewsSectionRef}
        >
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
            <p className="pro-profile-reviews-empty">
              Пока нет отзывов. Попросите клиентов оставить оценку.
            </p>
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

      {certificateLightboxItem && (
        <div
          className="pro-portfolio-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          onClick={closeCertificateLightbox}
        >
          <div
            className="pro-portfolio-lightbox is-certificate"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pro-portfolio-lightbox-head">
              <div>
                <p className="pro-portfolio-lightbox-kicker">Сертификат</p>
                <h3 className="pro-portfolio-lightbox-title">
                  {certificateLightboxTitle}
                </h3>
                {certificateLightboxMeta && (
                  <p className="pro-portfolio-lightbox-subtitle">
                    {certificateLightboxMeta}
                  </p>
                )}
              </div>
              <button
                className="pro-portfolio-lightbox-close"
                type="button"
                onClick={closeCertificateLightbox}
              >
                Закрыть
              </button>
            </div>
            <div
              className="pro-portfolio-lightbox-media is-certificate"
              style={certificateLightboxStyle}
            >
              {certificateLightboxItem.url ? (
                <img
                  src={certificateLightboxItem.url}
                  alt={certificateLightboxTitle}
                  loading="lazy"
                  onLoad={(event) =>
                    handleCertificateImageLoad(
                      certificateLightboxItem.id,
                      event.currentTarget
                    )
                  }
                />
              ) : (
                <span className="pro-profile-certificate-fallback">
                  Нет изображения
                </span>
              )}
            </div>
            {certificateLightboxItem.verifyUrl && (
              <div className="pro-portfolio-lightbox-actions">
                <a
                  className="pro-portfolio-lightbox-action"
                  href={certificateLightboxItem.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Проверить сертификат
                </a>
              </div>
            )}
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

      {isFollowersOpen && (
        <div
          className="pro-portfolio-sheet-overlay pro-followers-sheet-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pro-followers-title"
          onClick={closeFollowersSheet}
        >
          <div
            className="pro-portfolio-sheet pro-followers-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="pro-portfolio-sheet-handle" aria-hidden="true" />
            <div className="pro-followers-sheet-head">
              <div className="pro-followers-sheet-title-block">
                <p className="pro-followers-sheet-kicker">Аудитория</p>
                <h3 className="pro-followers-sheet-title" id="pro-followers-title">
                  Подписчики
                </h3>
                <p className="pro-followers-sheet-subtitle">
                  {followersSummaryLabel}
                </p>
              </div>
              <button
                className="pro-followers-sheet-close"
                type="button"
                onClick={closeFollowersSheet}
              >
                Закрыть
              </button>
            </div>
            <div className="pro-followers-sheet-search">
              <input
                className="pro-input pro-followers-search-input"
                type="search"
                placeholder="Поиск по имени или @username"
                value={followersQuery}
                onChange={(event) => setFollowersQuery(event.target.value)}
                aria-label="Поиск подписчиков"
              />
              {followersQueryValue && (
                <button
                  className="pro-followers-sheet-clear"
                  type="button"
                  onClick={() => setFollowersQuery('')}
                >
                  Сбросить
                </button>
              )}
            </div>
            {followersError && <p className="pro-error">{followersError}</p>}
            <div
              className="pro-followers-sheet-list"
              role="list"
              aria-busy={isFollowersLoading}
            >
              {followersInitialLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div
                    className="pro-followers-card is-skeleton"
                    key={`followers-skeleton-${index}`}
                    role="listitem"
                    aria-hidden="true"
                  >
                    <div className="pro-followers-avatar" />
                    <div className="pro-followers-info">
                      <span className="pro-followers-name">Загрузка</span>
                      <span className="pro-followers-username">Загрузка</span>
                    </div>
                  </div>
                ))
              ) : followers.length > 0 ? (
                followers.map((follower) => {
                  const followerName = buildFollowerName(follower)
                  const followerHandle = buildFollowerHandle(
                    follower,
                    followerName
                  )
                  const initialsSource = followerName.startsWith('@')
                    ? followerName.slice(1)
                    : followerName
                  const followerInitials = getNameInitials(initialsSource)
                  const followerSince = follower.followedAt
                    ? formatFollowerDate(follower.followedAt)
                    : ''

                  return (
                    <div
                      className="pro-followers-card"
                      key={follower.userId}
                      role="listitem"
                    >
                      <div className="pro-followers-avatar" aria-hidden="true">
                        {follower.avatarUrl ? (
                          <img src={follower.avatarUrl} alt="" />
                        ) : (
                          <span>{followerInitials}</span>
                        )}
                      </div>
                      <div className="pro-followers-info">
                        <div className="pro-followers-name-row">
                          <span className="pro-followers-name">
                            {followerName}
                          </span>
                          {follower.isPro && (
                            <span className="pro-followers-badge">Мастер</span>
                          )}
                        </div>
                        <div className="pro-followers-meta">
                          {followerHandle && (
                            <span className="pro-followers-username">
                              {followerHandle}
                            </span>
                          )}
                          {followerSince && (
                            <span className="pro-followers-since">
                              с {followerSince}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="pro-followers-empty">{followersEmptyLabel}</p>
              )}
            </div>
            {followersHasMore && !followersInitialLoading && (
              <button
                className="pro-followers-sheet-load"
                type="button"
                onClick={handleFollowersLoadMore}
                disabled={isFollowersLoading}
              >
                {isFollowersLoading ? 'Загружаем...' : 'Показать еще'}
              </button>
            )}
          </div>
        </div>
      )}

      {isAvatarActionsOpen && (
        <div
          className="pro-portfolio-sheet-overlay pro-profile-avatar-sheet-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pro-profile-avatar-sheet-title"
          onClick={closeAvatarActions}
        >
          <div
            className="pro-portfolio-sheet pro-profile-avatar-sheet"
            id={avatarActionsId}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="pro-portfolio-sheet-handle" aria-hidden="true" />
            <div className="pro-portfolio-sheet-head">
              <p className="pro-portfolio-sheet-subtitle">Профиль</p>
              <h3
                className="pro-portfolio-sheet-title"
                id="pro-profile-avatar-sheet-title"
              >
                Истории и фото
              </h3>
            </div>
            <div className="pro-portfolio-sheet-actions is-stacked">
              <button
                className="pro-portfolio-sheet-action is-story"
                type="button"
                onClick={() => {
                  closeAvatarActions()
                  onViewStories()
                }}
              >
                + Добавить историю
              </button>
              <button
                className="pro-portfolio-sheet-action"
                type="button"
                onClick={() => {
                  closeAvatarActions()
                  openMediaEditor()
                }}
              >
                Редактировать фото профиля
              </button>
            </div>
            <button
              className="pro-portfolio-sheet-cancel"
              type="button"
              onClick={closeAvatarActions}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {cropperState && (
        <MediaCropper
          src={cropperState.src}
          kind={cropperState.kind}
          coverAspect={cropperState.coverAspect}
          coverFrameWidth={
            cropperState.kind === 'cover' ? coverFrameWidth ?? undefined : undefined
          }
          maxBytes={MAX_MEDIA_BYTES}
          isBusy={isCropperUploading}
          error={mediaError}
          onCancel={closeCropper}
          onConfirm={handleCropperConfirm}
        />
      )}

      {isSettingsOpen && (
        <div
          className="pro-profile-editor-screen pro-profile-settings-screen"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pro-profile-settings-title"
        >
          <div className="pro-profile-editor-shell pro-profile-settings-shell">
            <div className="pro-profile-settings-head animate">
              <h2
                className="pro-profile-settings-title"
                id="pro-profile-settings-title"
              >
                Настройки профиля
              </h2>
              <div className="pro-profile-settings-head-meta">
                <span className={`pro-profile-settings-status ${profileStatusTone}`}>
                  {profileStatusSummary.isResponseReady ? 'Готов к заявкам' : 'Черновик'}
                </span>
                <span className="pro-profile-settings-progress-label">
                  {settingsReadyCount}/{profileSettingsItems.length}
                </span>
              </div>
            </div>
            <section className="pro-profile-settings-group animate delay-2">
              <div className="pro-profile-settings-group-head">
                <p className="pro-profile-settings-group-title">Разделы</p>
                <span className="pro-profile-settings-progress-label">
                  {profileStatusSummary.completeness}%
                </span>
              </div>
              <div className="pro-profile-settings-list" role="list">
                {profileSettingsItems.map((item) => {
                  const Icon = item.icon
                  const status = settingsItemStatus[item.id]
                  return (
                    <button
                      className={`pro-profile-settings-item${
                        status.tone === 'required' ? ' is-required' : ''
                      }`}
                      type="button"
                      key={item.id}
                      role="listitem"
                      onClick={() =>
                        openEditor(item.id, { returnToSettings: true })
                      }
                    >
                      <span
                        className="pro-profile-settings-icon"
                        aria-hidden="true"
                      >
                        <Icon />
                      </span>
                      <span className="pro-profile-settings-content">
                        <span className="pro-profile-settings-label">
                          {item.label}
                        </span>
                        <span className="pro-profile-settings-hint">
                          {settingsHints[item.id]}
                        </span>
                      </span>
                      <span className="pro-profile-settings-tail">
                        <span
                          className={`pro-profile-settings-status-pill is-${status.tone}`}
                        >
                          {status.label}
                        </span>
                        <span
                          className="pro-profile-settings-arrow"
                          aria-hidden="true"
                        >
                          ›
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>
        </div>
      )}

      {editingSection && (
        <div
          className={`pro-profile-editor-screen${
            editingSection === 'services' ? ' is-inline-save' : ''
          }`}
          data-editor-section={editingSection}
          role="dialog"
          aria-modal="true"
          aria-label={editorTitle}
        >
          <div className="pro-profile-editor-shell">
            <div className="pro-profile-editor-head">
              <div className="pro-profile-editor-title-block">
                <h2 className="pro-profile-editor-title">{editorTitle}</h2>
              </div>
            </div>
            <section className="pro-profile-editor-card">
              {editingSection === 'media' && (
                <div className="pro-profile-editor-media">
                  <div className="pro-profile-editor-section-head">
                    <p className="pro-profile-editor-section-kicker">Профиль</p>
                    <h3 className="pro-profile-editor-section-title">
                      Фото и обложка
                    </h3>
                    <p className="pro-profile-editor-section-subtitle">
                      Аватар виден во всех списках, обложка — в верхней части
                      профиля.
                    </p>
                  </div>
                  <div className="pro-profile-editor-media-group">
                    <div className="pro-profile-editor-media-label">Аватар</div>
                    <div className="pro-profile-editor-media-row">
                      <div
                        className={`pro-profile-editor-media-avatar${
                          isAvatarUploading ? ' is-loading' : ''
                        }`}
                        aria-busy={isAvatarUploading}
                      >
                        {avatarDisplayUrl ? (
                          <img src={avatarDisplayUrl} alt="Аватар" />
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
                        {hasAvatar && avatarUrl && (
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
                      style={coverPreviewStyle}
                      ref={editorCoverRef}
                      aria-busy={isCoverUploading}
                    >
                      {coverUrl && (
                        <>
                          <img
                            className="pro-cover-image is-blur"
                            src={coverUrl}
                            alt=""
                            aria-hidden="true"
                          />
                          <img
                            className="pro-cover-image is-contain"
                            src={coverUrl}
                            alt=""
                            aria-hidden="true"
                          />
                        </>
                      )}
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
                <div className="pro-profile-editor-stack">
                  <div className="pro-profile-editor-section">
                    <div className="pro-profile-editor-section-head">
                      <p className="pro-profile-editor-section-kicker">Визитка</p>
                      <h3 className="pro-profile-editor-section-title">
                        Имя и специализация
                      </h3>
                      <p className="pro-profile-editor-section-subtitle">
                        Именно это увидит клиент в выдаче и в карточке профиля.
                      </p>
                    </div>
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
                      <span className="pro-profile-editor-help">
                        Коротко, без лишних слов.
                      </span>
                    </div>
                  </div>
                  <div className="pro-profile-editor-section">
                    <div className="pro-profile-editor-section-head">
                      <p className="pro-profile-editor-section-kicker">Статус</p>
                      <h3 className="pro-profile-editor-section-title">
                        Коротко о вас
                      </h3>
                      <p className="pro-profile-editor-section-subtitle">
                        1–2 предложения о подходе, стиле или преимуществах.
                      </p>
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
                      <span className="pro-profile-editor-help">
                        Можно указать уникальность или ключевой опыт.
                      </span>
                    </div>
                  </div>
                  <div className="pro-profile-editor-preview">
                    <p className="pro-profile-editor-preview-title">
                      Предпросмотр
                    </p>
                    <div className="pro-profile-editor-preview-card">
                      <div className="pro-profile-editor-preview-avatar">
                        {avatarDisplayUrl ? (
                          <img
                            src={avatarDisplayUrl}
                            alt={`Аватар ${displayNameValue}`}
                          />
                        ) : (
                          <span aria-hidden="true">{profileInitials}</span>
                        )}
                      </div>
                      <div className="pro-profile-editor-preview-body">
                        <p className="pro-profile-editor-preview-name">
                          {displayNameValue}
                        </p>
                        <p className="pro-profile-editor-preview-meta">
                          {aboutPreview}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'location' && (
                <div className="pro-profile-editor-stack">
                  <div className="pro-profile-editor-section">
                    <div className="pro-profile-editor-section-head">
                      <p className="pro-profile-editor-section-kicker">Локация</p>
                      <h3 className="pro-profile-editor-section-title">
                        Город и район
                      </h3>
                      <p className="pro-profile-editor-section-subtitle">
                        Помогает клиентам быстрее находить вас рядом.
                      </p>
                    </div>
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
                            setCityId(
                              Number.isInteger(parsedValue) ? parsedValue : null
                            )
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
                  </div>
                  <div className="pro-profile-editor-section">
                    <div className="pro-profile-editor-section-head">
                      <p className="pro-profile-editor-section-kicker">
                        Геолокация
                      </p>
                      <h3 className="pro-profile-editor-section-title">
                        Поделиться координатой
                      </h3>
                      <p className="pro-profile-editor-section-subtitle">
                        Мы показываем примерное расстояние, а не точный адрес.
                      </p>
                    </div>
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
                    <p className="pro-profile-editor-note">
                      Точный адрес видите только вы.
                    </p>
                  </div>
                  <div className="pro-profile-editor-section">
                    <div className="pro-profile-editor-section-head">
                      <p className="pro-profile-editor-section-kicker">
                        Опыт и формат
                      </p>
                      <h3 className="pro-profile-editor-section-title">
                        Как вы работаете
                      </h3>
                      <p className="pro-profile-editor-section-subtitle">
                        Эти параметры влияют на фильтры и выдачу.
                      </p>
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
                      <div className="pro-profile-editor-toggle-grid">
                        <label
                          className={`pro-profile-editor-toggle-card${
                            worksAtMaster ? ' is-active' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={worksAtMaster}
                            onChange={(event) =>
                              setWorksAtMaster(event.target.checked)
                            }
                          />
                          <span className="pro-profile-editor-toggle-icon">
                            <IconHomeMaster />
                          </span>
                          <span className="pro-profile-editor-toggle-body">
                            <span className="pro-profile-editor-toggle-title">
                              У мастера
                            </span>
                            <span className="pro-profile-editor-toggle-subtitle">
                              Кабинет или студия
                            </span>
                          </span>
                          <span
                            className="pro-profile-editor-toggle-check"
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        </label>
                        <label
                          className={`pro-profile-editor-toggle-card${
                            worksAtClient ? ' is-active' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={worksAtClient}
                            onChange={(event) =>
                              setWorksAtClient(event.target.checked)
                            }
                          />
                          <span className="pro-profile-editor-toggle-icon">
                            <IconClientVisit />
                          </span>
                          <span className="pro-profile-editor-toggle-body">
                            <span className="pro-profile-editor-toggle-title">
                              Выезд к клиенту
                            </span>
                            <span className="pro-profile-editor-toggle-subtitle">
                              Дома или в офисе
                            </span>
                          </span>
                          <span
                            className="pro-profile-editor-toggle-check"
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'availability' && (
                <div className="pro-profile-editor-stack pro-profile-editor-stack--availability">
                  <div className="pro-profile-editor-section pro-availability-section">
                    <div className="pro-profile-editor-section-head">
                      <p className="pro-profile-editor-section-kicker">Статус</p>
                      <h3 className="pro-profile-editor-section-title">
                        Принимаете заявки
                      </h3>
                      <p className="pro-profile-editor-section-subtitle">
                        Можно быстро поставить паузу, если заняты.
                      </p>
                    </div>
                    <label
                      className={`pro-profile-editor-toggle-card is-wide${
                        isActive ? ' is-active' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(event) => setIsActive(event.target.checked)}
                      />
                      <span className="pro-profile-editor-toggle-body">
                        <span className="pro-profile-editor-toggle-title">
                          Принимаю заявки
                        </span>
                        <span className="pro-profile-editor-toggle-subtitle">
                          {isActive
                            ? 'Клиенты могут писать сейчас'
                            : 'Новые заявки временно на паузе'}
                        </span>
                      </span>
                      <span
                        className="pro-profile-editor-toggle-check"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    </label>
                    <div className="pro-availability-overview" style={availabilityTimelineStyle}>
                      <div className="pro-availability-overview-top">
                        <span
                          className={`pro-availability-status-pill${
                            isActive ? ' is-active' : ' is-paused'
                          }`}
                        >
                          {availabilityStatusLabel}
                        </span>
                        <span className="pro-availability-overview-summary">
                          {scheduleDaysCountLabel} • {availabilityDurationLabel}
                        </span>
                      </div>
                      <div className="pro-availability-overview-days">
                        {scheduleDayOptions.map((day) => (
                          <span
                            className={`pro-availability-overview-day${
                              scheduleDaysSet.has(day.id) ? ' is-active' : ''
                            }`}
                            key={day.id}
                          >
                            {day.label}
                          </span>
                        ))}
                      </div>
                      <div
                        className={`pro-availability-overview-timeline${
                          availabilityTimelineHasRange ? '' : ' is-empty'
                        }`}
                      >
                        <div className="pro-availability-overview-track">
                          <span className="pro-availability-overview-fill" />
                        </div>
                        <div className="pro-availability-overview-scale">
                          <span>00</span>
                          <span>12</span>
                          <span>24</span>
                        </div>
                        <p className="pro-availability-overview-meta">
                          {availabilityTimelineHasRange
                            ? `${scheduleTimeLabel} • ${availabilityStatusHint}`
                            : 'Время не задано — подтвердите слот в чате.'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="pro-profile-editor-section pro-availability-section">
                    <div className="pro-profile-editor-section-head">
                      <p className="pro-profile-editor-section-kicker">График</p>
                      <h3 className="pro-profile-editor-section-title">
                        Дни и время работы
                      </h3>
                      <p className="pro-profile-editor-section-subtitle">
                        Сначала выберите дни, затем задайте рабочее окно.
                      </p>
                    </div>
                    <div className="pro-availability-control-group">
                      <p className="pro-availability-field-label">Быстрый выбор</p>
                      <div className="pro-profile-editor-presets">
                        {schedulePresetOptions.map((preset) => {
                          const isPresetActive =
                            preset.days.length === scheduleDays.length &&
                            preset.days.every((day) => scheduleDaysSet.has(day))
                          return (
                            <button
                              className={`pro-profile-editor-preset${
                                isPresetActive ? ' is-active' : ''
                              }`}
                              key={preset.id}
                              type="button"
                              aria-pressed={isPresetActive}
                              onClick={() => setScheduleDays([...preset.days])}
                            >
                              {preset.label}
                            </button>
                          )
                        })}
                        <button
                          className="pro-profile-editor-preset is-ghost"
                          type="button"
                          onClick={() => setScheduleDays([])}
                        >
                          Сбросить
                        </button>
                      </div>
                    </div>
                    <div className="pro-availability-control-group">
                      <p className="pro-availability-field-label">Рабочие дни</p>
                      <div className="request-chips pro-availability-days">
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
                      <p
                        className={`pro-profile-editor-help pro-availability-hint${
                          availabilityDayError ? ' is-error' : ''
                        }`}
                      >
                        {availabilityDayError
                          ? 'Чтобы принимать заявки, выберите хотя бы один день.'
                          : availabilityDaysHint}
                      </p>
                    </div>
                    <div className="pro-availability-control-group">
                      <p className="pro-availability-field-label">Рабочее окно</p>
                      <div className="pro-profile-editor-presets is-time">
                        {scheduleTimePresets.map((preset) => {
                          const isPresetActive =
                            scheduleStartValue === preset.start &&
                            scheduleEndValue === preset.end
                          return (
                            <button
                              className={`pro-profile-editor-preset${
                                isPresetActive ? ' is-active' : ''
                              }`}
                              key={preset.id}
                              type="button"
                              aria-pressed={isPresetActive}
                              onClick={() => {
                                setScheduleStart(preset.start)
                                setScheduleEnd(preset.end)
                              }}
                            >
                              {preset.label}
                            </button>
                          )
                        })}
                        <button
                          className="pro-profile-editor-preset is-ghost"
                          type="button"
                          onClick={() => {
                            setScheduleStart('')
                            setScheduleEnd('')
                          }}
                        >
                          Без времени
                        </button>
                      </div>
                      <div className="pro-field pro-field--split pro-availability-time-fields">
                        <div>
                          <label className="pro-label" htmlFor="schedule-start">
                            Начало
                          </label>
                          <input
                            id="schedule-start"
                            className="pro-input"
                            type="time"
                            value={scheduleStart}
                            aria-invalid={availabilityTimeError}
                            onChange={(event) =>
                              setScheduleStart(event.target.value)
                            }
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
                            aria-invalid={availabilityTimeError}
                            onChange={(event) =>
                              setScheduleEnd(event.target.value)
                            }
                          />
                        </div>
                      </div>
                      <p
                        className={`pro-profile-editor-help pro-availability-hint${
                          availabilityTimeError ? ' is-error' : ''
                        }`}
                      >
                        {availabilityTimeHint}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'policies' && (
                <div className="pro-profile-editor-stack">
                  <div className="pro-profile-editor-section">
                    <div className="pro-profile-editor-section-head">
                      <p className="pro-profile-editor-section-kicker">Политика</p>
                      <h3 className="pro-profile-editor-section-title">
                        Отмена и удержание слота
                      </h3>
                      <p className="pro-profile-editor-section-subtitle">
                        Задайте сроки бесплатной отмены и правила удержания.
                      </p>
                    </div>
                    <div className="pro-field">
                      <div>
                        <label className="pro-label" htmlFor="policy-cancel-window">
                          Бесплатная отмена, ч
                        </label>
                        <input
                          id="policy-cancel-window"
                          className="pro-input"
                          type="number"
                          min="0"
                          max="72"
                          inputMode="numeric"
                          value={cancelWindowHours}
                          onChange={(event) =>
                            setCancelWindowHours(event.target.value)
                          }
                          placeholder="12"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pro-profile-editor-section">
                    <div className="pro-profile-editor-section-head">
                      <p className="pro-profile-editor-section-kicker">Депозит</p>
                      <h3 className="pro-profile-editor-section-title">
                        Предоплата для фиксации
                      </h3>
                      <p className="pro-profile-editor-section-subtitle">
                        Депозит помогает закрепить слот и снижает отмены.
                      </p>
                    </div>
                    <div className="pro-field">
                      <span className="pro-label">Формат депозита</span>
                      <div className="pro-profile-editor-toggle-grid">
                        <label
                          className={`pro-profile-editor-toggle-card${
                            depositType === 'none' ? ' is-active' : ''
                          }`}
                        >
                          <input
                            type="radio"
                            name="deposit-type"
                            checked={depositType === 'none'}
                            onChange={() => setDepositType('none')}
                          />
                          <span className="pro-profile-editor-toggle-icon">
                            <IconPrice />
                          </span>
                          <span className="pro-profile-editor-toggle-body">
                            <span className="pro-profile-editor-toggle-title">
                              Без депозита
                            </span>
                            <span className="pro-profile-editor-toggle-subtitle">
                              Оплата после визита
                            </span>
                          </span>
                          <span
                            className="pro-profile-editor-toggle-check"
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        </label>
                        <label
                          className={`pro-profile-editor-toggle-card${
                            depositType === 'percent' ? ' is-active' : ''
                          }`}
                        >
                          <input
                            type="radio"
                            name="deposit-type"
                            checked={depositType === 'percent'}
                            onChange={() => setDepositType('percent')}
                          />
                          <span className="pro-profile-editor-toggle-icon">
                            <IconPrice />
                          </span>
                          <span className="pro-profile-editor-toggle-body">
                            <span className="pro-profile-editor-toggle-title">
                              Процент
                            </span>
                            <span className="pro-profile-editor-toggle-subtitle">
                              Авто‑расчёт от цены услуги
                            </span>
                          </span>
                          <span
                            className="pro-profile-editor-toggle-check"
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        </label>
                        <label
                          className={`pro-profile-editor-toggle-card${
                            depositType === 'fixed' ? ' is-active' : ''
                          }`}
                        >
                          <input
                            type="radio"
                            name="deposit-type"
                            checked={depositType === 'fixed'}
                            onChange={() => setDepositType('fixed')}
                          />
                          <span className="pro-profile-editor-toggle-icon">
                            <IconPrice />
                          </span>
                          <span className="pro-profile-editor-toggle-body">
                            <span className="pro-profile-editor-toggle-title">
                              Фиксированная сумма
                            </span>
                            <span className="pro-profile-editor-toggle-subtitle">
                              Удобно при гибких ценах
                            </span>
                          </span>
                          <span
                            className="pro-profile-editor-toggle-check"
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        </label>
                      </div>
                    </div>
                    {depositType === 'percent' && (
                      <div className="pro-field">
                        <label className="pro-label" htmlFor="policy-deposit">
                          Размер депозита, %
                        </label>
                        <input
                          id="policy-deposit"
                          className="pro-input"
                          type="number"
                          min="0"
                          max="100"
                          inputMode="numeric"
                          value={depositPercent}
                          onChange={(event) =>
                            setDepositPercent(event.target.value)
                          }
                          placeholder="20"
                        />
                        <span className="pro-profile-editor-help">
                          20–30% — комфортный уровень, 0% — без депозита.
                        </span>
                      </div>
                    )}
                    {depositType === 'fixed' && (
                      <div className="pro-field">
                        <label className="pro-label" htmlFor="policy-deposit-fixed">
                          Размер депозита, ₽
                        </label>
                        <input
                          id="policy-deposit-fixed"
                          className="pro-input"
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={depositFixed}
                          onChange={(event) => setDepositFixed(event.target.value)}
                          placeholder="500"
                        />
                        <span className="pro-profile-editor-help">
                          Используйте фикс, если цена услуги обсуждается.
                        </span>
                      </div>
                    )}
                    <div className="pro-field">
                      <label className="pro-label" htmlFor="policy-deposit-details">
                        Реквизиты для депозита
                      </label>
                      <textarea
                        id="policy-deposit-details"
                        className="pro-textarea"
                        rows={3}
                        placeholder="Телефон, банк, комментарий для перевода"
                        value={depositDetails}
                        onChange={(event) => setDepositDetails(event.target.value)}
                      />
                      <span className="pro-profile-editor-help">
                        Например: «Сбербанк • 8 999 123‑45‑67 • Иван И.»
                      </span>
                    </div>
                    <div className="pro-field">
                      <span className="pro-label">QR‑код для оплаты</span>
                      <div className="pro-deposit-qr">
                        <input
                          className="pro-deposit-qr-input"
                          type="file"
                          accept="image/*"
                          onChange={handleDepositQrUploadChange}
                          disabled={depositQrUploading}
                        />
                        {depositQrUrl ? (
                          <div className="pro-deposit-qr-preview">
                            <img src={depositQrUrl} alt="QR депозита" />
                            <button
                              className="pro-deposit-qr-remove"
                              type="button"
                              onClick={handleDepositQrRemove}
                              disabled={depositQrUploading}
                            >
                              <IconTrash />
                              Удалить
                            </button>
                          </div>
                        ) : (
                          <div className="pro-deposit-qr-placeholder">
                            <span>Загрузить QR</span>
                          </div>
                        )}
                      </div>
                      {depositQrError && (
                        <span className="pro-profile-editor-help is-error">
                          {depositQrError}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pro-profile-editor-preview">
                    <p className="pro-profile-editor-preview-title">
                      Как увидит клиент
                    </p>
                    <div className="pro-profile-editor-preview-card pro-policy-preview-card">
                      <p className="pro-policy-preview-item">
                        {cancelWindowValue !== null
                          ? `Бесплатная отмена за ${cancelWindowValue} ч`
                          : 'Бесплатная отмена не задана'}
                      </p>
                      <p className="pro-policy-preview-item">
                        {depositLabel}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'services' && (
                <div className="pro-profile-editor-stack">
                  <div className="pro-profile-editor-section pro-profile-editor-section--summary">
                    <div className="pro-profile-editor-section-head">
                      <p className="pro-profile-editor-section-kicker">Услуги</p>
                      <h3 className="pro-profile-editor-section-title">
                        Каталог и прайс
                      </h3>
                      <p className="pro-profile-editor-section-subtitle">
                        Добавьте услуги, чтобы клиенту сразу было понятно, сколько
                        это стоит.
                      </p>
                    </div>
                    <div className="pro-profile-editor-metrics">
                      <div className="pro-profile-editor-metric">
                        <span className="pro-profile-editor-metric-label">
                          Услуг
                        </span>
                        <span className="pro-profile-editor-metric-value">
                          {selectedServicesLabel}
                        </span>
                      </div>
                      <div className="pro-profile-editor-metric">
                        <span className="pro-profile-editor-metric-label">
                          Цены
                        </span>
                        <span className="pro-profile-editor-metric-value">
                          {servicePriceLabel || 'Не указано'}
                        </span>
                      </div>
                    </div>
                  </div>
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
                                  <IconTrash />
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

                </div>
              )}

              {editingSection === 'certificates' && (
                <div className="pro-profile-editor-stack">
                  <div className="pro-profile-editor-highlight">
                    <div className="pro-profile-editor-highlight-icon">
                      <IconCertificate />
                    </div>
                    <div className="pro-profile-editor-highlight-body">
                      <p className="pro-profile-editor-highlight-title">
                        Доверие и квалификация
                      </p>
                      <p className="pro-profile-editor-highlight-subtitle">
                        Сертификаты повышают уверенность клиентов в выборе.
                      </p>
                    </div>
                    <span className="pro-profile-editor-highlight-pill">
                      {certificatesSummary}
                    </span>
                  </div>
                  <div className="pro-profile-editor-certificates">
                    <div className="pro-profile-editor-certificates-head">
                      <div>
                        <p className="pro-profile-editor-certificates-kicker">
                          Сертификаты
                        </p>
                        <h3 className="pro-profile-editor-certificates-title">
                          Подтвердите квалификацию
                        </h3>
                        <p className="pro-profile-editor-certificates-subtitle">
                          Добавьте дипломы и курсы, чтобы клиентам было проще
                          выбрать вас. Любой формат — мы аккуратно подгоним превью.
                        </p>
                      </div>
                      <button
                        className="pro-profile-editor-certificates-add"
                        type="button"
                        onClick={handleCertificateAddClick}
                        disabled={
                          isCertificatesUploading ||
                          certificates.length >= MAX_CERTIFICATES
                        }
                      >
                        + Добавить
                      </button>
                    </div>

                  <input
                    ref={certificateUploadInputRef}
                    className="pro-file-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleCertificateUploadChange}
                    disabled={isCertificatesUploading}
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                  <input
                    ref={certificateReplaceInputRef}
                    className="pro-file-input"
                    type="file"
                    accept="image/*"
                    onChange={handleCertificateReplaceChange}
                    disabled={isCertificatesUploading}
                    aria-hidden="true"
                    tabIndex={-1}
                  />

                  {certificatesError && (
                    <div className="pro-profile-editor-messages">
                      <p className="pro-error">{certificatesError}</p>
                    </div>
                  )}

                    <div className="pro-profile-editor-certificates-list">
                      {certificates.length > 0 ? (
                        certificates.map((certificate) => {
                          const title = certificate.title?.trim() || ''
                          const certificateStyle = certificateRatios[certificate.id]
                            ? ({
                                '--certificate-ratio': certificateRatios[certificate.id],
                              } as CSSProperties)
                            : undefined
                          return (
                            <div
                              className="pro-profile-editor-certificate-card"
                              key={certificate.id}
                            >
                              <button
                                className="pro-profile-editor-certificate-media"
                                type="button"
                                onClick={() =>
                                  handleCertificateReplaceClick(certificate.id)
                                }
                                aria-label="Загрузить изображение сертификата"
                                style={certificateStyle}
                              >
                                {certificate.url ? (
                                  <img
                                    src={certificate.url}
                                    alt=""
                                    loading="lazy"
                                    onLoad={(event) =>
                                      handleCertificateImageLoad(
                                        certificate.id,
                                        event.currentTarget
                                      )
                                    }
                                  />
                                ) : (
                                  <span className="pro-profile-editor-certificate-fallback">
                                    Добавить фото
                                  </span>
                                )}
                              </button>
                              <div className="pro-profile-editor-certificate-fields">
                                <label className="pro-profile-editor-certificate-field">
                                  <span className="pro-label">Название</span>
                                  <input
                                    className="pro-input"
                                    type="text"
                                    value={title}
                                    onChange={(event) =>
                                      updateCertificate(certificate.id, {
                                        title: event.target.value,
                                      })
                                    }
                                    placeholder="Сертификат повышения квалификации"
                                  />
                                </label>
                                <div className="pro-profile-editor-certificate-row">
                                  <label className="pro-profile-editor-certificate-field">
                                    <span className="pro-label">Организация</span>
                                    <input
                                      className="pro-input"
                                      type="text"
                                      value={certificate.issuer ?? ''}
                                      onChange={(event) =>
                                        updateCertificate(certificate.id, {
                                          issuer: event.target.value,
                                        })
                                      }
                                      placeholder="Название школы"
                                    />
                                  </label>
                                  <label className="pro-profile-editor-certificate-field">
                                    <span className="pro-label">Год</span>
                                    <input
                                      className="pro-input"
                                      type="number"
                                      min="1900"
                                      max={new Date().getFullYear() + 1}
                                      value={certificate.year ?? ''}
                                      onChange={(event) => {
                                        const raw = event.target.value.trim()
                                        if (!raw) {
                                          updateCertificate(certificate.id, {
                                            year: null,
                                          })
                                          return
                                        }
                                        const parsed = Number(raw)
                                        updateCertificate(certificate.id, {
                                          year: Number.isFinite(parsed)
                                            ? Math.round(parsed)
                                            : null,
                                        })
                                      }}
                                      placeholder="2024"
                                    />
                                  </label>
                                </div>
                                <label className="pro-profile-editor-certificate-field">
                                  <span className="pro-label">
                                    Ссылка на проверку
                                  </span>
                                  <input
                                    className="pro-input"
                                    type="url"
                                    inputMode="url"
                                    value={certificate.verifyUrl ?? ''}
                                    onChange={(event) =>
                                      updateCertificate(certificate.id, {
                                        verifyUrl: event.target.value,
                                      })
                                    }
                                    placeholder="https://..."
                                  />
                                </label>
                              </div>
                              <div className="pro-profile-editor-certificate-actions">
                                <button
                                  className="pro-profile-editor-certificate-action"
                                  type="button"
                                  onClick={() =>
                                    handleCertificateReplaceClick(certificate.id)
                                  }
                                >
                                  Заменить фото
                                </button>
                                <button
                                  className="pro-profile-editor-certificate-action is-danger"
                                  type="button"
                                  onClick={() => removeCertificate(certificate.id)}
                                >
                                  Удалить
                                </button>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <div className="pro-profile-editor-certificates-empty">
                          Пока нет сертификатов. Добавьте первый, чтобы повысить
                          доверие.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </section>
            {(editorValidationError || saveError || saveSuccess) && (
              <div className="pro-profile-editor-messages">
                {editorValidationError && <p className="pro-error">{editorValidationError}</p>}
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

      {!editingSection && !isSettingsOpen && (
        <ProBottomNav
          active="profile"
          onCabinet={onViewCabinet ?? onBack}
          onRequests={onViewRequests}
          onChats={onViewChats}
          onProfile={() => {}}
        />
      )}
    </div>
  )
}
