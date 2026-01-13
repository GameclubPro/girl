import {
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
import {
  loadClientPreferences,
  updateClientPreferences,
} from '../utils/clientPreferences'

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

type RequestScreenProps = {
  apiBase: string
  userId: string
  defaultCategoryId?: string
  cityId: number | null
  districtId: number | null
  cityName: string
  districtName: string
  address: string
}

type RequestPhoto = {
  url: string
  path: string
}

const getServiceOptions = (categoryId: string) =>
  requestServiceCatalog[categoryId] ??
  requestServiceCatalog[categoryItems[0]?.id ?? ''] ??
  []

export const RequestScreen = ({
  apiBase,
  userId,
  defaultCategoryId,
  cityId,
  districtId,
  cityName,
  districtName,
  address,
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
  const initialBudget =
    preferencesRef.current.defaultBudget &&
    requestBudgetOptions.includes(preferencesRef.current.defaultBudget)
      ? preferencesRef.current.defaultBudget
      : requestBudgetOptions[0] ?? 'не важно'
  const [locationType, setLocationType] = useState<
    (typeof locationOptions)[number]['value']
  >(initialLocationType)
  const [dateOption, setDateOption] = useState<
    (typeof dateOptions)[number]['value']
  >(initialDateOption)
  const [dateValue, setDateValue] = useState('')
  const [timeValue, setTimeValue] = useState('')
  const [budget, setBudget] = useState<string>(initialBudget)
  const [details, setDetails] = useState('')
  const [photos, setPhotos] = useState<RequestPhoto[]>([])
  const [uploadError, setUploadError] = useState('')
  const [uploadingCount, setUploadingCount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const maxPhotos = 5
  const maxUploadBytes = 6 * 1024 * 1024

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

  const dateLabel = useMemo(() => {
    const match = dateOptions.find((option) => option.value === dateOption)
    return match?.label ?? ''
  }, [dateOption])

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
    dateOption !== 'choose' || Boolean(dateValue && timeValue)
  const isUploading = uploadingCount > 0
  const canSubmit =
    Boolean(categoryId) &&
    Boolean(serviceName.trim()) &&
    hasLocation &&
    hasDateTime &&
    !isSubmitting &&
    !isUploading
  const canAddPhotos =
    photos.length < maxPhotos && !isSubmitting && !isUploading

  const handleSubmit = async () => {
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
          budget,
          details: details.trim() || null,
          photoUrls: photos.map((photo) => photo.url),
        }),
      })

      if (!response.ok) {
        throw new Error('Create request failed')
      }

      setSubmitSuccess('Заявка опубликована. Ожидайте отклики.')
      updateClientPreferences((current) => ({
        ...current,
        defaultCategoryId: categoryId,
        defaultLocationType: locationType,
        defaultDateOption: dateOption,
        defaultBudget: budget,
        lastRequestServiceByCategory: {
          ...(current.lastRequestServiceByCategory ?? {}),
          [categoryId]: serviceName.trim(),
        },
      }))
    } catch (error) {
      setSubmitError('Не удалось опубликовать заявку. Попробуйте еще раз.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="screen screen--request">
      <div className="request-shell">
        <section className="request-card animate delay-2" aria-label="Услуга">
          <div className="request-field">
            <select
              className="request-select-input"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
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
                  onClick={() => setServiceName(option.title)}
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
                  <span className="request-service-indicator" aria-hidden="true" />
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

        <section className="request-card animate delay-3">
          <h2 className="request-card-title">Где делать</h2>
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
              Заполните город и район в профиле, чтобы опубликовать заявку.
            </p>
          )}
        </section>

        <section className="request-card animate delay-4">
          <h2 className="request-card-title">Когда</h2>
          <div className="request-segment">
            {dateOptions.map((option) => (
              <button
                className={`request-segment-button${
                  option.value === dateOption ? ' is-active' : ''
                }`}
                key={option.value}
                type="button"
                onClick={() => setDateOption(option.value)}
                aria-pressed={option.value === dateOption}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="request-field">
            <span className="request-label">Дата и время *</span>
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

        <section className="request-card animate delay-5">
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
                  onClick={() => setBudget(option)}
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
            {uploadError && <p className="request-upload-error">{uploadError}</p>}
            {photos.length > 0 && (
              <div className="request-upload-grid" role="list">
                {photos.map((photo) => (
                  <div className="request-upload-thumb" role="listitem" key={photo.path}>
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

        <p className="request-disclaimer">
          Нажимая «Опубликовать», вы соглашаетесь с правилами
        </p>
        {submitError && <p className="request-error">{submitError}</p>}
        {submitSuccess && <p className="request-success">{submitSuccess}</p>}
      </div>

      <div className="request-submit-bar">
        <button
          className="request-submit"
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isSubmitting ? 'Публикуем...' : 'Опубликовать заявку'}
        </button>
      </div>
    </div>
  )
}
