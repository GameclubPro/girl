import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import { IconClock, IconPhoto, IconPin } from '../components/icons'
import { categoryItems } from '../data/clientData'
import { requestBudgetPresets, requestServiceCatalog } from '../data/requestData'
import { useTelegramMainButton } from '../hooks/useTelegramMainButton'
import {
  loadClientPreferences,
  updateClientPreferences,
} from '../utils/clientPreferences'
import {
  hapticImpact,
  hapticNotification,
  hapticSelection,
} from '../utils/haptics'

const locationOptions = [
  { value: 'master', label: 'У мастера' },
  { value: 'client', label: 'У меня' },
  { value: 'any', label: 'Не важно' },
] as const

const dateOptions = [
  { value: 'today', label: 'Сегодня' },
  { value: 'tomorrow', label: 'Завтра' },
  { value: 'choose', label: 'Выбрать' },
] as const

const timeWindowOptions = [
  { value: 'any', label: 'Не важно' },
  { value: 'morning', label: 'Утро' },
  { value: 'afternoon', label: 'День' },
  { value: 'evening', label: 'Вечер' },
  { value: 'exact', label: 'Точно' },
] as const

const durationOptions = [30, 60, 90, 120] as const

const requestSteps = [
  { id: 'service', title: 'Услуга' },
  { id: 'location', title: 'Локация' },
  { id: 'time', title: 'Когда' },
  { id: 'details', title: 'Детали' },
] as const

type RequestBudgetPreset = (typeof requestBudgetPresets)[number]

const resolveBudgetPreset = (label?: string) =>
  requestBudgetPresets.find((preset) => preset.label === label) ??
  requestBudgetPresets[0]

type RequestScreenProps = {
  apiBase: string
  userId: string
  defaultCategoryId?: string
  cityId: number | null
  districtId: number | null
  cityName: string
  districtName: string
  address: string
  onBack: () => void
  onBackHandlerChange?: ((handler: (() => boolean) | null) => void) | undefined
}

type RequestPhoto = {
  url: string
  path: string
}

const getServiceOptions = (categoryId: string) =>
  requestServiceCatalog[categoryId] ??
  requestServiceCatalog[categoryItems[0]?.id ?? ''] ??
  []

const formatDateValue = (value: string) => {
  const parts = value.split('-')
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}`
  }
  return value
}

export const RequestScreen = ({
  apiBase,
  userId,
  defaultCategoryId,
  cityId,
  districtId,
  cityName,
  districtName,
  address,
  onBack,
  onBackHandlerChange,
}: RequestScreenProps) => {
  const preferencesRef = useRef(loadClientPreferences())
  const initialCategoryId =
    defaultCategoryId ??
    preferencesRef.current.defaultCategoryId ??
    categoryItems[0]?.id ??
    ''
  const initialServiceOptions = getServiceOptions(initialCategoryId)
  const preferredService =
    preferencesRef.current.lastRequestServiceByCategory?.[initialCategoryId] ?? ''
  const [categoryId, setCategoryId] = useState<string>(initialCategoryId)
  const [serviceName, setServiceName] = useState<string>(
    initialServiceOptions.some((option) => option.title === preferredService)
      ? preferredService
      : initialServiceOptions[0]?.title ?? ''
  )
  const initialLocationType =
    preferencesRef.current.defaultLocationType &&
    locationOptions.some(
      (option) => option.value === preferencesRef.current.defaultLocationType
    )
      ? preferencesRef.current.defaultLocationType
      : 'master'
  const initialDateOption =
    preferencesRef.current.defaultDateOption &&
    dateOptions.some(
      (option) => option.value === preferencesRef.current.defaultDateOption
    )
      ? preferencesRef.current.defaultDateOption
      : 'today'
  const initialBudgetPreset = resolveBudgetPreset(
    preferencesRef.current.defaultBudget
  )
  const initialTimeWindow =
    preferencesRef.current.defaultTimeWindow &&
    timeWindowOptions.some(
      (option) => option.value === preferencesRef.current.defaultTimeWindow
    )
      ? preferencesRef.current.defaultTimeWindow
      : 'any'
  const initialDurationOption =
    typeof preferencesRef.current.defaultDurationMinutes === 'number'
      ? preferencesRef.current.defaultDurationMinutes
      : 60
  const [locationType, setLocationType] = useState<
    (typeof locationOptions)[number]['value']
  >(initialLocationType)
  const [dateOption, setDateOption] = useState<
    (typeof dateOptions)[number]['value']
  >(initialDateOption)
  const [timeWindow, setTimeWindow] = useState<
    (typeof timeWindowOptions)[number]['value']
  >(initialTimeWindow)
  const [dateValue, setDateValue] = useState('')
  const [timeValue, setTimeValue] = useState('')
  const [budgetPreset, setBudgetPreset] =
    useState<RequestBudgetPreset>(initialBudgetPreset)
  const [customBudgetMin, setCustomBudgetMin] = useState(
    preferencesRef.current.defaultBudgetMin?.toString() ?? ''
  )
  const [customBudgetMax, setCustomBudgetMax] = useState(
    preferencesRef.current.defaultBudgetMax?.toString() ?? ''
  )
  const [durationOption, setDurationOption] = useState<number | 'custom'>(
    durationOptions.includes(initialDurationOption as (typeof durationOptions)[number])
      ? (initialDurationOption as (typeof durationOptions)[number])
      : 'custom'
  )
  const [customDuration, setCustomDuration] = useState(
    durationOptions.includes(initialDurationOption as (typeof durationOptions)[number])
      ? ''
      : String(initialDurationOption)
  )
  const [details, setDetails] = useState('')
  const [photos, setPhotos] = useState<RequestPhoto[]>([])
  const [uploadError, setUploadError] = useState('')
  const [uploadingCount, setUploadingCount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [step, setStep] = useState(0)
  const [hasTelegramMainButton, setHasTelegramMainButton] = useState(false)
  const [hasTelegramWebApp, setHasTelegramWebApp] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const maxPhotos = 5
  const maxUploadBytes = 6 * 1024 * 1024
  const stepCount = requestSteps.length
  const safeStep = Math.min(Math.max(step, 0), stepCount - 1)
  const currentStep = requestSteps[safeStep] ?? requestSteps[0]

  const serviceOptions = useMemo(
    () => getServiceOptions(categoryId),
    [categoryId]
  )
  const selectedCategory = useMemo(
    () => categoryItems.find((item) => item.id === categoryId),
    [categoryId]
  )
  const categoryIconStyle = selectedCategory?.icon
    ? ({ '--request-category-icon': `url(${selectedCategory.icon})` } as CSSProperties)
    : undefined

  useEffect(() => {
    setHasTelegramMainButton(Boolean(window.Telegram?.WebApp?.MainButton))
    setHasTelegramWebApp(Boolean(window.Telegram?.WebApp))
  }, [])

  useEffect(() => {
    if (serviceOptions.length === 0) {
      setServiceName('')
      return
    }
    setServiceName((current) => {
      if (serviceOptions.some((option) => option.title === current)) {
        return current
      }
      const preferred =
        preferencesRef.current.lastRequestServiceByCategory?.[categoryId]
      if (preferred && serviceOptions.some((option) => option.title === preferred)) {
        return preferred
      }
      return serviceOptions[0].title
    })
  }, [categoryId, serviceOptions])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }, [safeStep])

  const dateLabel = useMemo(() => {
    const match = dateOptions.find((option) => option.value === dateOption)
    return match?.label ?? ''
  }, [dateOption])

  useEffect(() => {
    updateClientPreferences((current) => ({
      ...current,
      defaultCategoryId: categoryId,
      defaultLocationType: locationType,
      defaultDateOption: dateOption,
      defaultBudget: budgetPreset.label,
      defaultBudgetMin: customBudgetMin ? Number(customBudgetMin) : null,
      defaultBudgetMax: customBudgetMax ? Number(customBudgetMax) : null,
      defaultTimeWindow: timeWindow,
      defaultDurationMinutes:
        durationOption === 'custom'
          ? Number(customDuration) || undefined
          : durationOption,
    }))
  }, [
    budgetPreset.label,
    categoryId,
    customBudgetMax,
    customBudgetMin,
    customDuration,
    dateOption,
    durationOption,
    locationType,
    timeWindow,
  ])

  useEffect(() => {
    if (!serviceName.trim()) return
    updateClientPreferences((current) => ({
      ...current,
      lastRequestServiceByCategory: {
        ...(current.lastRequestServiceByCategory ?? {}),
        [categoryId]: serviceName.trim(),
      },
    }))
  }, [categoryId, serviceName])

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
    hapticImpact('light')
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

        if (typeof payload.url !== 'string' || typeof payload.path !== 'string') {
          throw new Error('upload_failed')
        }

        const nextUrl = payload.url
        const nextPath = payload.path
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

  const handleRemovePhoto = async (photo: RequestPhoto) => {
    setPhotos((current) => current.filter((item) => item.path !== photo.path))
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

  const hasLocation = Boolean(cityId && districtId)
  const resolvedDuration =
    durationOption === 'custom'
      ? Number(customDuration)
      : durationOption
  const hasDuration = Number.isFinite(resolvedDuration) && resolvedDuration > 0
  const needsExactTime = timeWindow === 'exact'
  const hasDateTime =
    dateOption !== 'choose'
      ? !needsExactTime || Boolean(timeValue)
      : Boolean(dateValue && (!needsExactTime || timeValue))
  const isUploading = uploadingCount > 0
  const canContinueService = Boolean(categoryId && serviceName.trim())
  const canContinueLocation = hasLocation
  const canContinueTime = hasDateTime && hasDuration
  const isFinalStep = safeStep >= stepCount - 1
  const canSubmit =
    Boolean(categoryId) &&
    Boolean(serviceName.trim()) &&
    hasLocation &&
    hasDateTime &&
    hasDuration &&
    !isSubmitting &&
    !isUploading
  const canContinue = isFinalStep
    ? canSubmit
    : safeStep === 0
      ? canContinueService
      : safeStep === 1
        ? canContinueLocation
        : canContinueTime
  const canAddPhotos =
    photos.length < maxPhotos && !isSubmitting && !isUploading
  const selectedCategoryLabel = selectedCategory?.label ?? ''
  const serviceSummary = serviceName
    ? `${selectedCategoryLabel || 'Категория'} · ${serviceName}`
    : 'Услуга не выбрана'
  const locationSummary = hasLocation
    ? [cityName, districtName].filter(Boolean).join(', ')
    : 'Локация не выбрана'
  const dateSummary =
    dateOption === 'choose'
      ? dateValue
        ? `${formatDateValue(dateValue)}${
            needsExactTime && timeValue ? ` ${timeValue}` : ''
          }`
        : 'Выберите дату'
      : needsExactTime && timeValue
        ? `${dateLabel} ${timeValue}`
        : dateLabel
  const timeWindowLabel =
    timeWindowOptions.find((option) => option.value === timeWindow)?.label ??
    'Не важно'
  const durationSummary = hasDuration
    ? resolvedDuration % 60 === 0
      ? `${resolvedDuration / 60} ч`
      : `${resolvedDuration} мин`
    : 'Длительность не выбрана'

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return
    setSubmitError('')
    setSubmitSuccess('')

    if (!categoryId || !serviceName.trim()) {
      setSubmitError('Укажите категорию и услугу.')
      return
    }

    if (!cityId || !districtId) {
      setSubmitError('Укажите город и район в профиле.')
      return
    }

    if (isUploading) {
      setSubmitError('Дождитесь загрузки фото.')
      return
    }

    const parsedCustomDuration =
      durationOption === 'custom' ? Number(customDuration) : durationOption
    if (!Number.isFinite(parsedCustomDuration) || parsedCustomDuration <= 0) {
      setSubmitError('Укажите длительность услуги.')
      return
    }

    const parseBudgetValue = (value: string) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
    }

    let budgetMin: number | null = budgetPreset.min
    let budgetMax: number | null = budgetPreset.max
    let budgetLabel = budgetPreset.label

    if (budgetPreset.isCustom) {
      budgetMin = parseBudgetValue(customBudgetMin)
      budgetMax = parseBudgetValue(customBudgetMax)
      if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
        setSubmitError('Бюджет: минимум не может быть больше максимума.')
        return
      }
      budgetLabel =
        budgetMin !== null && budgetMax !== null
          ? `${budgetMin}–${budgetMax} ₽`
          : budgetMax !== null
            ? `до ${budgetMax} ₽`
            : budgetMin !== null
              ? `от ${budgetMin} ₽`
              : 'не важно'
    }

    let dateTime: string | null = null
    if (dateOption === 'choose') {
      if (!dateValue) {
        setSubmitError('Выберите дату.')
        return
      }
      if (needsExactTime && !timeValue) {
        setSubmitError('Выберите точное время.')
        return
      }
      const time = needsExactTime ? timeValue : '00:00'
      const parsedDate = new Date(`${dateValue}T${time}`)
      if (Number.isNaN(parsedDate.getTime())) {
        setSubmitError('Некорректная дата или время.')
        return
      }
      dateTime = parsedDate.toISOString()
    } else if (needsExactTime) {
      if (!timeValue) {
        setSubmitError('Выберите точное время.')
        return
      }
      const base = new Date()
      if (dateOption === 'tomorrow') {
        base.setDate(base.getDate() + 1)
      }
      const date = `${String(base.getFullYear())}-${String(
        base.getMonth() + 1
      ).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
      const parsedDate = new Date(`${date}T${timeValue}`)
      if (Number.isNaN(parsedDate.getTime())) {
        setSubmitError('Некорректная дата или время.')
        return
      }
      dateTime = parsedDate.toISOString()
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`${apiBase}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          cityId,
          districtId,
          address: address.trim() || null,
          categoryId,
          serviceName: serviceName.trim(),
          tags: [],
          locationType,
          dateOption,
          dateTime,
          budget: budgetLabel,
          budgetMin,
          budgetMax,
          durationMinutes: Math.round(parsedCustomDuration),
          timeWindow,
          details: details.trim() || null,
          photoUrls: photos.map((photo) => photo.url),
        }),
      })

      if (!response.ok) {
        throw new Error('Create request failed')
      }

      setSubmitSuccess('Заявка опубликована. Ожидайте отклики.')
      hapticNotification('success')
      updateClientPreferences((current) => ({
        ...current,
        defaultCategoryId: categoryId,
        defaultLocationType: locationType,
        defaultDateOption: dateOption,
        defaultBudget: budgetPreset.label,
        defaultBudgetMin: budgetMin,
        defaultBudgetMax: budgetMax,
        defaultTimeWindow: timeWindow,
        defaultDurationMinutes: Math.round(parsedCustomDuration),
        lastRequestServiceByCategory: {
          ...(current.lastRequestServiceByCategory ?? {}),
          [categoryId]: serviceName.trim(),
        },
      }))
    } catch (error) {
      setSubmitError('Не удалось опубликовать заявку. Попробуйте еще раз.')
      hapticNotification('error')
    } finally {
      setIsSubmitting(false)
    }
  }, [
    address,
    apiBase,
    budgetPreset,
    categoryId,
    cityId,
    customBudgetMax,
    customBudgetMin,
    customDuration,
    dateOption,
    dateValue,
    details,
    districtId,
    isSubmitting,
    isUploading,
    locationType,
    needsExactTime,
    photos,
    serviceName,
    timeValue,
    timeWindow,
    userId,
    durationOption,
  ])

  const handleStepBack = useCallback(() => {
    if (safeStep > 0) {
      setStep((current) => Math.max(0, current - 1))
      hapticSelection()
      return true
    }
    return false
  }, [safeStep])

  const handleBackPress = useCallback(() => {
    if (handleStepBack()) return
    onBack()
  }, [handleStepBack, onBack])

  const handleStepNext = useCallback(() => {
    if (!canContinue) {
      hapticImpact('light')
      return
    }
    if (isFinalStep) {
      void handleSubmit()
      return
    }
    setStep((current) => Math.min(stepCount - 1, current + 1))
    hapticImpact('medium')
  }, [canContinue, handleSubmit, isFinalStep, stepCount])

  useEffect(() => {
    onBackHandlerChange?.(handleStepBack)
    return () => onBackHandlerChange?.(null)
  }, [handleStepBack, onBackHandlerChange])

  useTelegramMainButton({
    text: isFinalStep ? 'Опубликовать заявку' : 'Далее',
    isVisible: hasTelegramMainButton,
    isEnabled: canContinue,
    isLoading: isSubmitting,
    onClick: handleStepNext,
  })

  return (
    <div
      className={`screen screen--request${
        hasTelegramMainButton ? ' is-main-button' : ''
      }`}
    >
      <div className="request-shell">
        <header className="request-header animate delay-1">
          {!hasTelegramWebApp && (
            <button
              className="request-back"
              type="button"
              onClick={handleBackPress}
              aria-label="Назад"
            >
              ←
            </button>
          )}
          <div className="request-header-body">
            <h1 className="request-title">Новая заявка</h1>
            <p className="request-subtitle">
              Шаг {safeStep + 1} из {stepCount} · {currentStep.title}
            </p>
          </div>
        </header>

        <div
          className="request-progress"
          style={
            {
              '--progress': `${Math.round(((safeStep + 1) / stepCount) * 100)}%`,
            } as CSSProperties
          }
          aria-hidden="true"
        >
          <span className="request-progress-bar" />
        </div>

        {safeStep > 0 && (
          <div className="request-summary">
            <div className="request-summary-item">
              <span className="request-summary-label">Услуга</span>
              <span className="request-summary-value">{serviceSummary}</span>
            </div>
            <div className="request-summary-item">
              <span className="request-summary-label">Локация</span>
              <span className="request-summary-value">{locationSummary}</span>
            </div>
            <div className="request-summary-item">
              <span className="request-summary-label">Когда</span>
              <span className="request-summary-value">{dateSummary}</span>
            </div>
            <div className="request-summary-item">
              <span className="request-summary-label">Окно и длительность</span>
              <span className="request-summary-value">
                {timeWindowLabel} · {durationSummary}
              </span>
            </div>
          </div>
        )}

        {safeStep === 0 && (
          <section className="request-card animate delay-2" aria-label="Услуга">
            <div className="request-field">
              <select
                className="request-select-input"
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value)
                  hapticSelection()
                }}
                style={categoryIconStyle}
                aria-label="Категория"
              >
                {categoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="request-field">
              <div
                className="request-service-grid"
                role="list"
                aria-label="Выберите услугу"
              >
                {serviceOptions.map((option) => {
                  const isSelected = option.title === serviceName
                  return (
                    <button
                      className={`request-service-card${
                        isSelected ? ' is-active' : ''
                      }`}
                      key={option.title}
                      type="button"
                      onClick={() => {
                        setServiceName(option.title)
                        hapticSelection()
                      }}
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
              {serviceOptions.length === 0 && (
                <p className="request-helper">
                  Пока нет шаблонов услуг для этой категории.
                </p>
              )}
            </div>
          </section>
        )}

        {safeStep === 1 && (
          <section className="request-card animate delay-2">
            <h2 className="request-card-title">Где делать</h2>
            <div className="request-segment">
              {locationOptions.map((option) => (
                <button
                  className={`request-segment-button${
                    option.value === locationType ? ' is-active' : ''
                  }`}
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setLocationType(option.value)
                    hapticSelection()
                  }}
                  aria-pressed={option.value === locationType}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="request-field">
              <span className="request-label">Город *</span>
              <div className="request-select request-select--icon request-select--static">
                <span className="request-select-main">
                  <span className="request-select-icon" aria-hidden="true">
                    <IconPin />
                  </span>
                  {cityName || 'Город не указан'}
                </span>
              </div>
            </div>
            <div className="request-field">
              <span className="request-label">Район / метро *</span>
              <div className="request-select request-select--icon request-select--static">
                <span className="request-select-main">
                  <span className="request-select-icon" aria-hidden="true">
                    <IconPin />
                  </span>
                  {districtName || 'Район не указан'}
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
                Заполните город и район в профиле, чтобы продолжить.
              </p>
            )}
          </section>
        )}

        {safeStep === 2 && (
          <section className="request-card animate delay-2">
            <h2 className="request-card-title">Когда</h2>
            <div className="request-segment">
              {dateOptions.map((option) => (
                <button
                  className={`request-segment-button${
                    option.value === dateOption ? ' is-active' : ''
                  }`}
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setDateOption(option.value)
                    hapticSelection()
                  }}
                  aria-pressed={option.value === dateOption}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="request-field">
              <span className="request-label">Время</span>
              <div className="request-chips">
                {timeWindowOptions.map((option) => (
                  <button
                    className={`request-chip${
                      option.value === timeWindow ? ' is-active' : ''
                    }`}
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setTimeWindow(option.value)
                      hapticSelection()
                    }}
                    aria-pressed={option.value === timeWindow}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="request-field">
              <span className="request-label">Длительность</span>
              <div className="request-chips">
                {durationOptions.map((option) => (
                  <button
                    className={`request-chip${
                      durationOption === option ? ' is-active' : ''
                    }`}
                    key={option}
                    type="button"
                    onClick={() => {
                      setDurationOption(option)
                      setCustomDuration('')
                      hapticSelection()
                    }}
                    aria-pressed={durationOption === option}
                  >
                    {option} мин
                  </button>
                ))}
                <button
                  className={`request-chip${
                    durationOption === 'custom' ? ' is-active' : ''
                  }`}
                  type="button"
                  onClick={() => {
                    setDurationOption('custom')
                    hapticSelection()
                  }}
                  aria-pressed={durationOption === 'custom'}
                >
                  Другое
                </button>
              </div>
              {durationOption === 'custom' && (
                <input
                  className="request-input"
                  type="number"
                  inputMode="numeric"
                  min="10"
                  step="5"
                  placeholder="Минут"
                  value={customDuration}
                  onChange={(event) => setCustomDuration(event.target.value)}
                />
              )}
            </div>
            <div className="request-field">
              <span className="request-label">Дата</span>
              {dateOption === 'choose' || needsExactTime ? (
                <div className="request-date-grid">
                  {dateOption === 'choose' && (
                    <input
                      className="request-input"
                      type="date"
                      value={dateValue}
                      onChange={(event) => setDateValue(event.target.value)}
                    />
                  )}
                  {needsExactTime && (
                    <input
                      className="request-input"
                      type="time"
                      value={timeValue}
                      onChange={(event) => setTimeValue(event.target.value)}
                    />
                  )}
                </div>
              ) : (
                <div className="request-select request-select--icon request-select--static">
                  <span className="request-select-main">
                    <span className="request-select-icon" aria-hidden="true">
                      <IconClock />
                    </span>
                    {dateLabel}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {safeStep === 3 && (
          <section className="request-card animate delay-2">
            <h2 className="request-card-title">Детали</h2>
            <div className="request-field">
              <span className="request-label">Бюджет</span>
              <div className="request-chips">
                {requestBudgetPresets.map((option) => (
                  <button
                    className={`request-chip${
                      option.label === budgetPreset.label ? ' is-active' : ''
                    }`}
                    key={option.label}
                    type="button"
                    onClick={() => {
                      setBudgetPreset(option)
                      hapticSelection()
                    }}
                    aria-pressed={option.label === budgetPreset.label}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {budgetPreset.isCustom && (
                <div className="request-date-grid">
                  <input
                    className="request-input"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="От, ₽"
                    value={customBudgetMin}
                    onChange={(event) => setCustomBudgetMin(event.target.value)}
                  />
                  <input
                    className="request-input"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="До, ₽"
                    value={customBudgetMax}
                    onChange={(event) => setCustomBudgetMax(event.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="request-field">
              <span className="request-label">Комментарий</span>
              <textarea
                className="request-textarea"
                placeholder="Пожелания, особенности, что важно для вас"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={3}
              />
            </div>
            <div className="request-field">
              <span className="request-label">Фото примера (желательно)</span>
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
                  <div className="request-upload-title">Добавить фото-пример</div>
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
                      key={photo.path}
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
        )}

        {isFinalStep && (
          <>
            <p className="request-disclaimer">
              Нажимая «Опубликовать», вы соглашаетесь с правилами
            </p>
            {submitError && <p className="request-error">{submitError}</p>}
            {submitSuccess && <p className="request-success">{submitSuccess}</p>}
          </>
        )}
      </div>

      <div
        className={`request-submit-bar${
          hasTelegramMainButton ? ' is-hidden' : ''
        }`}
      >
        <button
          className="request-submit"
          type="button"
          onClick={handleStepNext}
          disabled={!canContinue}
        >
          {isFinalStep
            ? isSubmitting
              ? 'Публикуем...'
              : 'Опубликовать заявку'
            : 'Далее'}
        </button>
      </div>
    </div>
  )
}
