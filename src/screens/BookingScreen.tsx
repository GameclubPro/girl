import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { IconClock, IconPin, IconPhoto } from '../components/icons'
import { categoryItems } from '../data/clientData'
import { requestServiceCatalog } from '../data/requestData'
import type {
  BookingStatus,
  MasterProfile,
  MasterReview,
  MasterReviewSummary,
} from '../types/app'
import {
  loadClientPreferences,
  updateClientPreferences,
} from '../utils/clientPreferences'
import { parseServiceItems } from '../utils/profileContent'

type BookingScreenProps = {
  apiBase: string
  userId: string
  masterId: string
  cityId: number | null
  districtId: number | null
  cityName: string
  districtName: string
  address: string
  photoUrls?: string[]
  preferredCategoryId?: string | null
  initialServiceName?: string
  initialLocationType?: 'master' | 'client'
  initialDetails?: string
  onBack: () => void
  onBookingCreated?: (payload: { id: number | null; status?: BookingStatus }) => void
}

type MasterBookingSlot = {
  scheduledAt: string
  serviceDuration: number | null
  status: string
}

type BookingPhoto = {
  url: string
  path?: string | null
}

type CategoryId = (typeof categoryItems)[number]['id']

const isCategoryId = (value: string): value is CategoryId =>
  categoryItems.some((item) => item.id === value)

const scheduleLabels: Record<string, string> = {
  mon: 'Пн',
  tue: 'Вт',
  wed: 'Ср',
  thu: 'Чт',
  fri: 'Пт',
  sat: 'Сб',
  sun: 'Вс',
}

const dayKeyOrder = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const getDayKey = (date: Date) => dayKeyOrder[date.getDay()] ?? 'mon'

const parseTimeToMinutes = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? ''
  if (!normalized) return null
  const [hoursRaw, minutesRaw] = normalized.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

const formatTime = (minutes: number) => {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mins = String(minutes % 60).padStart(2, '0')
  return `${hours}:${mins}`
}

const formatDateLabel = (date: Date) => {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}`
}

const normalizeServiceKey = (value: string) => value.trim().toLowerCase()

const resolveServiceCategory = (serviceName: string) => {
  const normalized = normalizeServiceKey(serviceName)
  const match = Object.entries(requestServiceCatalog).find(([, options]) =>
    options.some((option) => normalizeServiceKey(option.title) === normalized)
  )
  return match?.[0] ?? null
}

const formatPrice = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`

const getInitials = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return 'М'
  const parts = normalized.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0] ?? '')
  const joined = letters.join('').toUpperCase()
  if (joined) return joined
  return normalized.slice(0, 2).toUpperCase()
}

const formatReviewName = (review: MasterReview) => {
  const name = [review.reviewerFirstName, review.reviewerLastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  if (name) return name
  if (review.reviewerUsername) return `@${review.reviewerUsername}`
  return 'Клиент'
}

const formatReviewDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const formatReviewCount = (count: number) => {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} отзыв`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} отзыва`
  }
  return `${count} отзывов`
}

export const BookingScreen = ({
  apiBase,
  userId,
  masterId,
  cityId,
  districtId,
  cityName,
  districtName,
  address,
  photoUrls = [],
  preferredCategoryId,
  initialServiceName,
  initialLocationType,
  initialDetails,
  onBack,
  onBookingCreated,
}: BookingScreenProps) => {
  const preferencesRef = useRef(loadClientPreferences())
  const [profile, setProfile] = useState<MasterProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [bookings, setBookings] = useState<MasterBookingSlot[]>([])
  const [isBookingLoading, setIsBookingLoading] = useState(false)
  const [bookingError, setBookingError] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [serviceName, setServiceName] = useState<string>('')
  const [locationType, setLocationType] = useState<'master' | 'client'>('master')
  const [selectedDayKey, setSelectedDayKey] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [details, setDetails] = useState(
    initialDetails ?? preferencesRef.current.lastBookingNote ?? ''
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [photos, setPhotos] = useState<BookingPhoto[]>(
    () => photoUrls.map((url) => ({ url, path: null }))
  )
  const [uploadError, setUploadError] = useState('')
  const [uploadingCount, setUploadingCount] = useState(0)
  const [reviews, setReviews] = useState<MasterReview[]>([])
  const [reviewSummary, setReviewSummary] = useState<MasterReviewSummary | null>(
    null
  )
  const [isReviewsLoading, setIsReviewsLoading] = useState(false)
  const [reviewsError, setReviewsError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const maxPhotos = 5
  const maxUploadBytes = 6 * 1024 * 1024

  useEffect(() => {
    if (!masterId) return
    let cancelled = false

    const loadProfile = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const response = await fetch(`${apiBase}/api/masters/${masterId}`)
        if (!response.ok) {
          throw new Error('Load master failed')
        }
        const data = (await response.json()) as MasterProfile
        if (!cancelled) {
          setProfile(data)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError('Не удалось загрузить профиль мастера.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [apiBase, masterId])

  useEffect(() => {
    if (!masterId) return
    let cancelled = false

    const loadBookings = async () => {
      setIsBookingLoading(true)
      setBookingError('')
      try {
        const from = new Date().toISOString()
        const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
        const response = await fetch(
          `${apiBase}/api/masters/${masterId}/bookings?from=${encodeURIComponent(
            from
          )}&to=${encodeURIComponent(to)}`
        )
        if (!response.ok) {
          throw new Error('Load bookings failed')
        }
        const data = (await response.json()) as MasterBookingSlot[]
        if (!cancelled) {
          setBookings(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        if (!cancelled) {
          setBookingError('Не удалось загрузить расписание мастера.')
        }
      } finally {
        if (!cancelled) {
          setIsBookingLoading(false)
        }
      }
    }

    void loadBookings()

    return () => {
      cancelled = true
    }
  }, [apiBase, masterId])

  useEffect(() => {
    if (!masterId) return
    let cancelled = false

    const loadReviews = async () => {
      setIsReviewsLoading(true)
      setReviewsError('')
      setReviews([])
      setReviewSummary(null)
      try {
        const response = await fetch(
          `${apiBase}/api/masters/${masterId}/reviews?limit=2`
        )
        if (!response.ok) {
          throw new Error('Load reviews failed')
        }
        const data = (await response.json()) as {
          summary?: MasterReviewSummary
          reviews?: MasterReview[]
        }
        if (!cancelled) {
          setReviewSummary(data?.summary ?? null)
          setReviews(Array.isArray(data?.reviews) ? data.reviews : [])
        }
      } catch (error) {
        if (!cancelled) {
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
  }, [apiBase, masterId])

  const serviceItems = useMemo(() => parseServiceItems(profile?.services ?? []), [profile])

  const servicesByCategory = useMemo(() => {
    const map = new Map<string, typeof serviceItems>()
    serviceItems.forEach((service) => {
      const category = resolveServiceCategory(service.name)
      if (!category) return
      if (!map.has(category)) {
        map.set(category, [])
      }
      map.get(category)?.push(service)
    })
    return map
  }, [serviceItems])

  const availableCategoryIds = useMemo(() => {
    const allowed = new Set(
      Array.isArray(profile?.categories) ? profile?.categories : []
    )
    return categoryItems
      .map((item) => item.id)
      .filter((id) => allowed.has(id) && (servicesByCategory.get(id)?.length ?? 0) > 0)
  }, [profile, servicesByCategory])

  useEffect(() => {
    if (availableCategoryIds.length === 0) {
      setCategoryId('')
      return
    }
    setCategoryId((current) => {
      if (
        preferredCategoryId &&
        isCategoryId(preferredCategoryId) &&
        availableCategoryIds.includes(preferredCategoryId)
      ) {
        return preferredCategoryId
      }
      return isCategoryId(current) && availableCategoryIds.includes(current)
        ? current
        : availableCategoryIds[0]
    })
  }, [availableCategoryIds, preferredCategoryId])

  const serviceOptions = useMemo(() => {
    if (!categoryId) return []
    return servicesByCategory.get(categoryId) ?? []
  }, [categoryId, servicesByCategory])

  useEffect(() => {
    if (!serviceOptions.length) {
      setServiceName('')
      return
    }
    setServiceName((current) =>
      serviceOptions.some((item) => item.name === current)
        ? current
        : (() => {
            const masterPreferred =
              preferencesRef.current.lastBookingServiceByMaster?.[masterId]
            const categoryPreferred =
              preferencesRef.current.lastBookingServiceByCategory?.[categoryId]
            if (
              initialServiceName &&
              serviceOptions.some((item) => item.name === initialServiceName)
            ) {
              return initialServiceName
            }
            if (
              masterPreferred &&
              serviceOptions.some((item) => item.name === masterPreferred)
            ) {
              return masterPreferred
            }
            if (
              categoryPreferred &&
              serviceOptions.some((item) => item.name === categoryPreferred)
            ) {
              return categoryPreferred
            }
            return serviceOptions[0].name
          })()
    )
  }, [categoryId, initialServiceName, masterId, serviceOptions])

  const selectedService = useMemo(
    () => serviceOptions.find((item) => item.name === serviceName) ?? null,
    [serviceName, serviceOptions]
  )

  const locationOptions = useMemo(() => {
    const options: { value: 'master' | 'client'; label: string }[] = []
    if (profile?.worksAtMaster) {
      options.push({ value: 'master', label: 'У мастера' })
    }
    if (profile?.worksAtClient) {
      options.push({ value: 'client', label: 'Выезд' })
    }
    return options
  }, [profile])

  useEffect(() => {
    if (!locationOptions.length) return
    setLocationType((current) =>
      locationOptions.some((option) => option.value === current)
        ? current
        : (() => {
            if (
              initialLocationType &&
              locationOptions.some((option) => option.value === initialLocationType)
            ) {
              return initialLocationType
            }
            const preferred = preferencesRef.current.lastBookingLocationType
            if (preferred && locationOptions.some((option) => option.value === preferred)) {
              return preferred
            }
            return locationOptions[0].value
          })()
    )
  }, [initialLocationType, locationOptions])

  const availableDays = useMemo(() => {
    if (!profile) return []
    const scheduleDays = Array.isArray(profile.scheduleDays)
      ? profile.scheduleDays.map((day) => day.trim().toLowerCase())
      : []
    const startMinutes = parseTimeToMinutes(profile.scheduleStart ?? null)
    const endMinutes = parseTimeToMinutes(profile.scheduleEnd ?? null)
    if (!scheduleDays.length || startMinutes === null || endMinutes === null) {
      return []
    }

    const duration = selectedService?.duration ?? 60
    const bookedRanges = bookings
      .filter((booking) => booking.scheduledAt)
      .map((booking) => {
        const start = new Date(booking.scheduledAt).getTime()
        const bookingDuration = booking.serviceDuration ?? 60
        return {
          start,
          end: start + bookingDuration * 60 * 1000,
        }
      })

    const result: {
      key: string
      date: Date
      label: string
      slots: string[]
    }[] = []

    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const minLeadMinutes = 30

    for (let offset = 0; offset < 14; offset += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
      const dayKey = getDayKey(date)
      if (!scheduleDays.includes(dayKey)) continue

      const slots: string[] = []
      const baseMinutes =
        offset === 0 ? Math.max(startMinutes, nowMinutes + minLeadMinutes) : startMinutes
      for (
        let minutes = baseMinutes;
        minutes + duration <= endMinutes;
        minutes += 30
      ) {
        const slotDate = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          Math.floor(minutes / 60),
          minutes % 60
        )
        const slotStart = slotDate.getTime()
        const slotEnd = slotStart + duration * 60 * 1000
        if (slotStart < now.getTime()) continue
        const isBusy = bookedRanges.some(
          (range) => slotStart < range.end && slotEnd > range.start
        )
        if (!isBusy) {
          slots.push(formatTime(minutes))
        }
      }

      if (slots.length > 0) {
        result.push({
          key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
          date,
          label: `${scheduleLabels[dayKey] ?? dayKey} ${formatDateLabel(date)}`,
          slots,
        })
      }
    }

    return result
  }, [bookings, profile, selectedService])

  useEffect(() => {
    if (!availableDays.length) {
      setSelectedDayKey('')
      setSelectedTime('')
      return
    }
    setSelectedDayKey((current) => {
      const exists = availableDays.some((day) => day.key === current)
      return exists ? current : availableDays[0].key
    })
  }, [availableDays])

  useEffect(() => {
    if (!selectedDayKey) {
      setSelectedTime('')
      return
    }
    const day = availableDays.find((item) => item.key === selectedDayKey)
    if (!day) {
      setSelectedTime('')
      return
    }
    setSelectedTime((current) =>
      day.slots.includes(current) ? current : day.slots[0] ?? ''
    )
  }, [availableDays, selectedDayKey])

  const selectedDay = availableDays.find((item) => item.key === selectedDayKey) ?? null

  const masterCityId =
    typeof profile?.cityId === 'number' ? profile.cityId : cityId
  const masterDistrictId =
    typeof profile?.districtId === 'number' ? profile.districtId : districtId
  const masterCityName = profile?.cityName?.trim() || cityName || 'Город не указан'
  const masterDistrictName =
    profile?.districtName?.trim() || districtName || 'Район не указан'
  const hasDistrictName = Boolean(profile?.districtName?.trim() || districtName)
  const masterDisplayName = profile?.displayName?.trim() || 'Мастер'
  const masterInitials = getInitials(masterDisplayName)
  const reviewsCountRaw = reviewSummary?.count ?? profile?.reviewsCount ?? 0
  const reviewsAverageRaw = reviewSummary?.average ?? profile?.reviewsAverage ?? 0
  const reviewsCount = Number.isFinite(reviewsCountRaw) ? reviewsCountRaw : 0
  const reviewsAverage = Number.isFinite(reviewsAverageRaw) ? reviewsAverageRaw : 0
  const hasReviews = reviewsCount > 0
  const reviewsCountLabel = hasReviews
    ? formatReviewCount(reviewsCount)
    : 'Нет отзывов'

  const priceLabel =
    selectedService?.price !== null && selectedService?.price !== undefined
      ? formatPrice(selectedService.price)
      : null
  const hasServices = serviceOptions.length > 0
  const hasCategoryChoice = availableCategoryIds.length > 1
  const hasServiceChoice = serviceOptions.length > 1
  const hasLocation = Boolean(masterCityId && masterDistrictId)
  const hasSlots = Boolean(selectedDay && selectedTime)
  const isUploading = uploadingCount > 0
  const canSubmit =
    Boolean(categoryId) &&
    Boolean(serviceName) &&
    hasLocation &&
    hasSlots &&
    !isSubmitting &&
    !isUploading

  const canAddPhotos =
    photos.length < maxPhotos && !isSubmitting && !isUploading

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === 'string') {
          resolve(result)
        } else {
          reject(new Error('invalid_data'))
        }
      }
      reader.onerror = () => reject(new Error('read_failed'))
      reader.readAsDataURL(file)
    })

  const handleAddPhotos = () => {
    fileInputRef.current?.click()
  }

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    setUploadError('')

    if (files.length === 0) return

    const remaining = maxPhotos - photos.length
    if (remaining <= 0) {
      setUploadError('Можно добавить максимум 5 фото.')
      return
    }

    const queue = files.slice(0, remaining)
    setUploadingCount((current) => current + queue.length)

    for (const file of queue) {
      if (!file.type.startsWith('image/')) {
        setUploadError('Поддерживаются только изображения.')
        setUploadingCount((current) => Math.max(0, current - 1))
        continue
      }
      if (file.size > maxUploadBytes) {
        setUploadError('Фото слишком большое. Максимум 6 МБ.')
        setUploadingCount((current) => Math.max(0, current - 1))
        continue
      }

      try {
        const dataUrl = await readFileAsDataUrl(file)
        const response = await fetch(`${apiBase}/api/requests/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, dataUrl }),
        })

        if (response.status === 413) {
          setUploadError('Фото слишком большое. Максимум 6 МБ.')
          continue
        }
        if (!response.ok) {
          throw new Error('upload_failed')
        }

        const payload = (await response.json()) as {
          url?: string | null
          path?: string | null
        }
        const nextUrl = payload.url
        const nextPath = payload.path

        if (typeof nextUrl !== 'string' || typeof nextPath !== 'string') {
          throw new Error('upload_failed')
        }

        setPhotos((current) => [
          ...current,
          { url: nextUrl, path: nextPath },
        ])
      } catch (error) {
        setUploadError('Не удалось загрузить фото. Попробуйте еще раз.')
      } finally {
        setUploadingCount((current) => Math.max(0, current - 1))
      }
    }
  }

  const handleRemovePhoto = async (photo: BookingPhoto) => {
    setPhotos((current) => current.filter((item) => item.url !== photo.url))
    if (!photo.path || photo.path.startsWith('http')) {
      return
    }
    try {
      await fetch(`${apiBase}/api/requests/media`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, path: photo.path }),
      })
    } catch (error) {
      setUploadError('Не удалось удалить фото. Попробуйте снова.')
    }
  }

  const handleSubmit = async () => {
    if (isSubmitting) return
    setSubmitError('')
    setSubmitSuccess('')

    if (!categoryId || !serviceName) {
      setSubmitError('Укажите услугу для записи.')
      return
    }

    if (!selectedDay || !selectedTime) {
      setSubmitError('Выберите свободное время.')
      return
    }

    if (!masterCityId || !masterDistrictId) {
      setSubmitError('Мастер не указал город и район.')
      return
    }

    if (isUploading) {
      setSubmitError('Дождитесь загрузки фото.')
      return
    }

    const [hoursRaw, minutesRaw] = selectedTime.split(':')
    const hours = Number(hoursRaw)
    const minutes = Number(minutesRaw)
    const scheduledAt = new Date(
      selectedDay.date.getFullYear(),
      selectedDay.date.getMonth(),
      selectedDay.date.getDate(),
      hours,
      minutes
    )

    if (Number.isNaN(scheduledAt.getTime())) {
      setSubmitError('Некорректное время записи.')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`${apiBase}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          masterId,
          cityId: masterCityId,
          districtId: masterDistrictId,
          address: address.trim() || null,
          categoryId,
          serviceName: serviceName.trim(),
          locationType,
          scheduledAt: scheduledAt.toISOString(),
          photoUrls: photos.map((photo) => photo.url),
          comment: details.trim() || null,
        }),
      })

      const data = (await response.json().catch(() => null)) as
        | { error?: string; id?: number; status?: BookingStatus }
        | null

      if (!response.ok) {
        if (data?.error === 'time_unavailable') {
          setSubmitError('Это время уже занято. Выберите другое.')
          return
        }
        if (data?.error === 'schedule_unavailable') {
          setSubmitError('Мастер еще не настроил расписание.')
          return
        }
        if (data?.error === 'day_unavailable') {
          setSubmitError('Мастер не принимает в этот день.')
          return
        }
        if (data?.error === 'location_required') {
          setSubmitError('Мастер не указал город и район.')
          return
        }
        if (data?.error === 'location_type_mismatch') {
          setSubmitError('Мастер не работает в выбранном формате.')
          return
        }
        if (data?.error === 'location_mismatch') {
          setSubmitError('Локация мастера не совпадает с выбранной.')
          return
        }
        if (data?.error === 'service_mismatch') {
          setSubmitError('Выбранная услуга недоступна.')
          return
        }
        if (data?.error === 'category_mismatch') {
          setSubmitError('Категория услуги не совпадает с профилем мастера.')
          return
        }
        if (data?.error === 'master_not_found') {
          setSubmitError('Мастер не найден.')
          return
        }
        throw new Error('Create booking failed')
      }

      onBookingCreated?.({ id: data?.id ?? null, status: data?.status })
      updateClientPreferences((current) => ({
        ...current,
        lastBookingLocationType: locationType,
        lastBookingNote: details.trim(),
        lastBookingServiceByMaster: {
          ...(current.lastBookingServiceByMaster ?? {}),
          [masterId]: serviceName.trim(),
        },
        lastBookingServiceByCategory: {
          ...(current.lastBookingServiceByCategory ?? {}),
          [categoryId]: serviceName.trim(),
        },
      }))
      setSubmitSuccess('Запись отправлена мастеру.')
    } catch (error) {
      setSubmitError('Не удалось создать запись. Попробуйте еще раз.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="screen screen--request screen--booking">
      <div className="request-shell booking-shell">
        <header className="request-header booking-header animate delay-1">
          <button className="request-back" type="button" onClick={onBack}>
            ←
          </button>
        </header>

        {loadError && <p className="request-error">{loadError}</p>}

        {isLoading ? (
          <section className="request-card booking-card animate delay-2">
            <p className="request-helper">Загружаем профиль мастера...</p>
          </section>
        ) : profile ? (
          <>
            <section className="request-card booking-card booking-master-card animate delay-2">
              <div className="booking-master-preview">
                <span className="booking-master-avatar" aria-hidden="true">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="booking-master-avatar-fallback">
                      {masterInitials}
                    </span>
                  )}
                </span>
                <div className="booking-master-body">
                  <div className="booking-master-row">
                    <span className="booking-master-name">{masterDisplayName}</span>
                    <div className="booking-master-stats">
                      {hasReviews ? (
                        <span className="booking-master-rating">
                          ★ {reviewsAverage.toFixed(1)}
                        </span>
                      ) : (
                        <span className="booking-master-rating is-muted">
                          Новый
                        </span>
                      )}
                      <span
                        className={`booking-master-reviews-count${
                          hasReviews ? '' : ' is-muted'
                        }`}
                      >
                        {reviewsCountLabel}
                      </span>
                    </div>
                  </div>
                  <p className="booking-master-meta">
                    {masterCityName}
                    {hasDistrictName ? ` • ${masterDistrictName}` : ''}
                  </p>
                </div>
              </div>
              <div className="booking-master-reviews">
                <div className="booking-master-reviews-header">
                  <span className="booking-master-reviews-title">Отзывы</span>
                  {hasReviews && (
                    <span className="booking-master-reviews-average">
                      ★ {reviewsAverage.toFixed(1)}
                    </span>
                  )}
                </div>
                {isReviewsLoading && (
                  <p className="booking-master-reviews-state">
                    Загружаем отзывы...
                  </p>
                )}
                {reviewsError && (
                  <p className="booking-master-reviews-state is-error">
                    {reviewsError}
                  </p>
                )}
                {!isReviewsLoading && !reviewsError && reviews.length === 0 && (
                  <p className="booking-master-reviews-empty">
                    Пока нет отзывов.
                  </p>
                )}
                {!isReviewsLoading && !reviewsError && reviews.length > 0 && (
                  <div className="booking-master-reviews-list">
                    {reviews.slice(0, 2).map((review) => {
                      const metaParts = [
                        review.serviceName,
                        formatReviewDate(review.createdAt),
                      ].filter(Boolean)
                      const metaLabel = metaParts.join(' • ')
                      return (
                        <article className="booking-review-card" key={review.id}>
                          <div className="booking-review-head">
                            <span className="booking-review-author">
                              {formatReviewName(review)}
                            </span>
                            <span className="booking-review-rating">
                              ★ {review.rating}
                            </span>
                          </div>
                          <p className="booking-review-text">
                            {review.comment?.trim() || 'Без текста'}
                          </p>
                          {metaLabel && (
                            <span className="booking-review-meta">{metaLabel}</span>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="request-card booking-card animate delay-2">
              <h2 className="request-card-title">Услуга</h2>
              {!hasServices ? (
                <p className="request-helper">
                  Мастер еще не добавил услуги для записи.
                </p>
              ) : !hasCategoryChoice && !hasServiceChoice ? (
                <div className="booking-summary">
                  <span className="booking-summary-label">
                    {categoryItems.find((item) => item.id === categoryId)?.label ??
                      'Категория'}
                  </span>
                  <span className="booking-summary-value">{serviceName}</span>
                </div>
              ) : (
                <>
                  {hasCategoryChoice && (
                    <div className="request-field">
                      <select
                        className="request-select-input"
                        value={categoryId}
                        onChange={(event) => setCategoryId(event.target.value)}
                        aria-label="Категория"
                      >
                        {availableCategoryIds.map((id) => {
                          const category = categoryItems.find((item) => item.id === id)
                          return (
                            <option key={id} value={id}>
                              {category?.label ?? id}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  )}
                  {hasServiceChoice && (
                    <div className="request-field">
                      <div className="request-service-grid" role="list">
                        {serviceOptions.map((option) => {
                          const isSelected = option.name === serviceName
                          return (
                            <button
                              className={`request-service-card${
                                isSelected ? ' is-active' : ''
                              }`}
                              key={option.name}
                              type="button"
                              onClick={() => setServiceName(option.name)}
                              aria-pressed={isSelected}
                            >
                              <span className="request-service-text">
                                <span className="request-service-title">
                                  {option.name}
                                </span>
                                {option.duration ? (
                                  <span className="request-service-subtitle">
                                    {option.duration} мин
                                  </span>
                                ) : null}
                              </span>
                              <span
                                className="request-service-indicator"
                                aria-hidden="true"
                              />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
              {hasServices && (
                <>
                  {priceLabel ? (
                    <div className="booking-price">Стоимость: {priceLabel}</div>
                  ) : (
                    <p className="booking-price is-muted">
                      Цена согласуется с мастером.
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="request-card booking-card animate delay-3">
              <h2 className="request-card-title">Где делать</h2>
              {locationOptions.length > 1 ? (
                <div className="request-segment">
                  {locationOptions.map((option) => (
                    <button
                      className={`request-segment-button${
                        option.value === locationType ? ' is-active' : ''
                      }`}
                      key={option.value}
                      type="button"
                      onClick={() => setLocationType(option.value)}
                      aria-pressed={option.value === locationType}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="booking-summary">
                  <span className="booking-summary-label">Формат</span>
                  <span className="booking-summary-value">
                    {locationOptions[0]?.label ?? 'Не указан'}
                  </span>
                </div>
              )}
              <div className="request-field">
                <span className="request-label">Город мастера *</span>
                <div className="request-select request-select--icon request-select--static">
                  <span className="request-select-main">
                    <span className="request-select-icon" aria-hidden="true">
                      <IconPin />
                    </span>
                    {masterCityName}
                  </span>
                </div>
              </div>
              <div className="request-field">
                <span className="request-label">Район / метро мастера *</span>
                <div className="request-select request-select--icon request-select--static">
                  <span className="request-select-main">
                    <span className="request-select-icon" aria-hidden="true">
                      <IconPin />
                    </span>
                    {masterDistrictName}
                  </span>
                </div>
              </div>
              {locationType === 'client' && (
                <div className="request-field">
                  <span className="request-label">Адрес для выезда</span>
                  <div className="request-select request-select--static">
                    {address.trim() || 'Адрес уточняется после подтверждения'}
                  </div>
                </div>
              )}
              {!hasLocation && (
                <p className="request-helper">
                  Мастер еще не указал город и район.
                </p>
              )}
            </section>

            <section className="request-card booking-card animate delay-4">
              <h2 className="request-card-title">Когда</h2>
              {bookingError && <p className="request-helper">{bookingError}</p>}
              {isBookingLoading && (
                <p className="request-helper">Загружаем свободное время...</p>
              )}
              {!isBookingLoading && availableDays.length > 0 ? (
                <>
                  <div className="booking-days">
                    {availableDays.map((day) => (
                      <button
                        className={`booking-day${
                          day.key === selectedDayKey ? ' is-active' : ''
                        }`}
                        key={day.key}
                        type="button"
                        onClick={() => setSelectedDayKey(day.key)}
                      >
                        <span className="booking-day-title">{day.label}</span>
                        <span className="booking-day-count">
                          {day.slots.length} слота
                        </span>
                      </button>
                    ))}
                  </div>
                  {selectedDay && (
                    <div className="booking-slots">
                      {selectedDay.slots.map((slot) => (
                        <button
                          className={`booking-slot${
                            slot === selectedTime ? ' is-active' : ''
                          }`}
                          key={`${selectedDay.key}-${slot}`}
                          type="button"
                          onClick={() => setSelectedTime(slot)}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                !isBookingLoading && (
                  <div className="request-select request-select--icon request-select--static">
                    <span className="request-select-main">
                      <span className="request-select-icon" aria-hidden="true">
                        <IconClock />
                      </span>
                      Нет свободного времени
                    </span>
                  </div>
                )
              )}
            </section>

            <section className="request-card booking-card animate delay-5">
              <h2 className="request-card-title">Детали</h2>
              <div className="request-field">
                <span className="request-label">Комментарий</span>
                <textarea
                  className="request-textarea"
                  placeholder="Пожелания и детали"
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={3}
                />
              </div>
              <div className="request-field">
                <span className="request-label">Фото примера</span>
                <input
                  ref={fileInputRef}
                  className="request-upload-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoChange}
                />
                <div className="request-upload">
                  <div className="request-upload-media" aria-hidden="true">
                    <IconPhoto />
                  </div>
                  <div className="request-upload-body">
                    <div className="request-upload-title">
                      {photos.length > 0 ? 'Фото добавлены' : 'Добавить фото'}
                    </div>
                    <div className="request-upload-meta">
                      {photos.length > 0
                        ? `Добавлено ${photos.length}/${maxPhotos}`
                        : '1-5 фото • до 6 МБ'}
                    </div>
                  </div>
                  <button
                    className="request-upload-button"
                    type="button"
                    onClick={handleAddPhotos}
                    disabled={!canAddPhotos}
                  >
                    {photos.length > 0 ? 'Добавить еще' : 'Добавить'}
                  </button>
                </div>
                {uploadingCount > 0 && (
                  <p className="request-upload-status">
                    Загружаем фото: {uploadingCount}
                  </p>
                )}
                {uploadError && (
                  <p className="request-upload-error">{uploadError}</p>
                )}
                {photos.length > 0 && (
                  <div className="request-upload-grid" role="list">
                    {photos.map((photo) => (
                      <div
                        className="request-upload-thumb"
                        role="listitem"
                        key={photo.url}
                      >
                        <img src={photo.url} alt="" loading="lazy" />
                        <button
                          className="request-upload-remove"
                          type="button"
                          onClick={() => handleRemovePhoto(photo)}
                          aria-label="Удалить фото"
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {submitError && <p className="request-error">{submitError}</p>}
            {submitSuccess && <p className="request-success">{submitSuccess}</p>}
          </>
        ) : null}
      </div>

      <div className="request-submit-bar">
        <button
          className="request-submit"
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isSubmitting ? 'Отправляем...' : 'Записаться'}
        </button>
      </div>
    </div>
  )
}
