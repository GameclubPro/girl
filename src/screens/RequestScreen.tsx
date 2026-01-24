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
import {
  requestBudgetOptions,
  requestServiceCatalog,
} from '../data/requestData'
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
  { id: 'morning', label: 'Утро', start: '09:00', end: '12:00' },
  { id: 'day', label: 'День', start: '12:00', end: '17:00' },
  { id: 'evening', label: 'Вечер', start: '17:00', end: '21:00' },
  { id: 'late', label: 'Поздно', start: '21:00', end: '23:00' },
] as const

const requestSteps = [
  { id: 'service', title: 'Услуга' },
  { id: 'location', title: 'Локация' },
  { id: 'time', title: 'Когда' },
  { id: 'details', title: 'Детали' },
] as const

type RequestBudgetOption = (typeof requestBudgetOptions)[number]
type TimeWindowId = (typeof timeWindowOptions)[number]['id']

const isRequestBudgetOption = (value: string): value is RequestBudgetOption =>
  requestBudgetOptions.some((option) => option === value)

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

const toDateKey = (value: Date) => {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addDays = (value: Date, amount: number) => {
  const next = new Date(value)
  next.setDate(next.getDate() + amount)
  return next
}

const formatTimeWindowLabel = (idList: TimeWindowId[]) =>
  idList
    .map((id) => timeWindowOptions.find((option) => option.id === id)?.label)
    .filter(Boolean)
    .join(', ')

export const RequestScreen = ({
  apiBase,
  userId,
  defaultCategoryId,
  cityId,
  districtId,
  cityName,
  districtName,
  address,
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
  const initialTimeWindowIds = Array.isArray(
    preferencesRef.current.defaultTimeWindowIds
  )
    ? preferencesRef.current.defaultTimeWindowIds.filter((id): id is TimeWindowId =>
        timeWindowOptions.some((option) => option.id === id)
      )
    : []
  const initialBudget =
    preferencesRef.current.defaultBudget &&
    isRequestBudgetOption(preferencesRef.current.defaultBudget)
      ? preferencesRef.current.defaultBudget
      : requestBudgetOptions[0] ?? 'не важно'
  const [locationType, setLocationType] = useState<
    (typeof locationOptions)[number]['value']
  >(initialLocationType)
  const [dateOption, setDateOption] = useState<
    (typeof dateOptions)[number]['value']
  >(initialDateOption)
  const [timeWindowIds, setTimeWindowIds] = useState<TimeWindowId[]>(
    initialTimeWindowIds.length > 0 ? initialTimeWindowIds : ['day']
  )
  const [dateValue, setDateValue] = useState('')
  const [timeValue, setTimeValue] = useState('')
  const [budget, setBudget] = useState<RequestBudgetOption>(initialBudget)
  const [details, setDetails] = useState('')
  const [photos, setPhotos] = useState<RequestPhoto[]>([])
  const [uploadError, setUploadError] = useState('')
  const [uploadingCount, setUploadingCount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [step, setStep] = useState(0)
  const [hasTelegramMainButton, setHasTelegramMainButton] = useState(false)
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

  useEffect(() => {
    if (dateOption === 'choose') return
    if (timeWindowIds.length === 0) {
      setTimeWindowIds(['day'])
    }
  }, [dateOption, timeWindowIds])

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
      defaultTimeWindowIds: timeWindowIds,
      defaultBudget: budget,
    }))
  }, [budget, categoryId, dateOption, locationType, timeWindowIds])

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
  const hasDateTime =
    dateOption === 'choose'
      ? Boolean(dateValue && timeValue)
      : timeWindowIds.length > 0
  const isUploading = uploadingCount > 0
  const canContinueService = Boolean(categoryId && serviceName.trim())
  const canContinueLocation = hasLocation
  const canContinueTime = hasDateTime
  const isFinalStep = safeStep >= stepCount - 1
  const canSubmit =
    Boolean(categoryId) &&
    Boolean(serviceName.trim()) &&
    hasLocation &&
    hasDateTime &&
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
  const timeWindowSummary = formatTimeWindowLabel(timeWindowIds)
  const dateSummary =
    dateOption === 'choose'
      ? dateValue && timeValue
        ? `${formatDateValue(dateValue)} ${timeValue}`
        : 'Выберите дату'
      : [dateLabel, timeWindowSummary].filter(Boolean).join(' · ')

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

    let dateTime: string | null = null
    let timeWindowsPayload: {
      date: string
      start: string
      end: string
      label?: string | null
      exact?: boolean | null
    }[] = []
    if (dateOption === 'choose') {
      if (!dateValue || !timeValue) {
        setSubmitError('Выберите дату и время.')
        return
      }
      const parsedDate = new Date(`${dateValue}T${timeValue}`)
      if (Number.isNaN(parsedDate.getTime())) {
        setSubmitError('Некорректная дата или время.')
        return
      }
      dateTime = parsedDate.toISOString()
      timeWindowsPayload = [
        {
          date: dateValue,
          start: timeValue,
          end: timeValue,
          label: 'Точное время',
          exact: true,
        },
      ]
    } else {
      const base = new Date()
      base.setHours(0, 0, 0, 0)
      const baseDate = dateOption === 'tomorrow' ? addDays(base, 1) : base
      const dateKey = toDateKey(baseDate)
      timeWindowsPayload = timeWindowIds
        .map((id) => timeWindowOptions.find((option) => option.id === id))
        .filter(Boolean)
        .map((option) => ({
          date: dateKey,
          start: option!.start,
          end: option!.end,
          label: option!.label,
          exact: false,
        }))
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
          timeWindows: timeWindowsPayload,
          budget,
          details: details.trim() || null,
          photoUrls: photos.map((photo) => photo.url),
        }),
      })

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null

      if (!response.ok) {
        if (data?.error === 'user_blocked') {
          setSubmitError('Аккаунт заблокирован. Обратитесь в поддержку.')
          return
        }
        if (data?.error === 'open_request_limit') {
          setSubmitError(
            'У вас слишком много активных заявок. Закройте старые, чтобы создать новую.'
          )
          return
        }
        if (data?.error === 'daily_request_limit') {
          setSubmitError(
            'Достигнут дневной лимит заявок. Попробуйте снова позже.'
          )
          return
        }
        if (data?.error === 'duplicate_request') {
          setSubmitError(
            'Похожая заявка уже создана. Подождите немного или измените детали.'
          )
          return
        }
        throw new Error('Create request failed')
      }

      setSubmitSuccess('Заявка опубликована. Ожидайте отклики.')
      hapticNotification('success')
      updateClientPreferences((current) => ({
        ...current,
        defaultCategoryId: categoryId,
        defaultLocationType: locationType,
        defaultDateOption: dateOption,
        defaultTimeWindowIds: timeWindowIds,
        defaultBudget: budget,
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
    budget,
    categoryId,
    cityId,
    dateOption,
    dateValue,
    details,
    districtId,
    isSubmitting,
    isUploading,
    locationType,
    photos,
    serviceName,
    timeWindowIds,
    timeValue,
    userId,
  ])

  const handleStepBack = useCallback(() => {
    if (safeStep > 0) {
      setStep((current) => Math.max(0, current - 1))
      hapticSelection()
      return true
    }
    return false
  }, [safeStep])

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
            {dateOption !== 'choose' && (
              <div className="request-field">
                <span className="request-label">Дата *</span>
                <div className="request-select request-select--icon request-select--static">
                  <span className="request-select-main">
                    <span className="request-select-icon" aria-hidden="true">
                      <IconClock />
                    </span>
                    {dateLabel}
                  </span>
                </div>
              </div>
            )}
            <div className="request-field">
              <span className="request-label">
                {dateOption === 'choose' ? 'Дата и время *' : 'Время *'}
              </span>
              {dateOption === 'choose' ? (
                <div className="request-date-grid">
                  <input
                    className="request-input"
                    type="date"
                    value={dateValue}
                    onChange={(event) => setDateValue(event.target.value)}
                  />
                  <input
                    className="request-input"
                    type="time"
                    value={timeValue}
                    onChange={(event) => setTimeValue(event.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="request-chips">
                    {timeWindowOptions.map((option) => {
                      const isActive = timeWindowIds.includes(option.id)
                      return (
                        <button
                          className={`request-chip${isActive ? ' is-active' : ''}`}
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setTimeWindowIds((current) => {
                              if (current.includes(option.id)) {
                                return current.filter((id) => id !== option.id)
                              }
                              return [...current, option.id]
                            })
                            hapticSelection()
                          }}
                          aria-pressed={isActive}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                  {timeWindowIds.length === 0 && (
                    <p className="request-helper">
                      Выберите удобное окно времени.
                    </p>
                  )}
                </>
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
                {requestBudgetOptions.map((option) => (
                  <button
                    className={`request-chip${
                      option === budget ? ' is-active' : ''
                    }`}
                    key={option}
                    type="button"
                    onClick={() => {
                      setBudget(option)
                      hapticSelection()
                    }}
                    aria-pressed={option === budget}
                  >
                    {option}
                  </button>
                ))}
              </div>
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
