import { useEffect, useMemo, useState } from 'react'
import { IconClock, IconPhoto, IconPin } from '../components/icons'
import { categoryItems } from '../data/clientData'
import {
  requestBudgetOptions,
  requestServiceCatalog,
} from '../data/requestData'

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
  const initialCategoryId = defaultCategoryId ?? categoryItems[0]?.id ?? ''
  const initialServiceOptions = getServiceOptions(initialCategoryId)
  const [categoryId, setCategoryId] = useState<string>(initialCategoryId)
  const [serviceName, setServiceName] = useState<string>(
    initialServiceOptions[0]?.title ?? ''
  )
  const [locationType, setLocationType] = useState<
    (typeof locationOptions)[number]['value']
  >('master')
  const [dateOption, setDateOption] = useState<
    (typeof dateOptions)[number]['value']
  >('today')
  const [dateValue, setDateValue] = useState('')
  const [timeValue, setTimeValue] = useState('')
  const [budget, setBudget] = useState<string>(
    requestBudgetOptions[0] ?? 'не важно'
  )
  const [details, setDetails] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')

  const serviceOptions = useMemo(
    () => getServiceOptions(categoryId),
    [categoryId]
  )

  useEffect(() => {
    if (serviceOptions.length === 0) {
      setServiceName('')
      return
    }
    setServiceName(serviceOptions[0].title)
  }, [serviceOptions])

  const dateLabel = useMemo(() => {
    const match = dateOptions.find((option) => option.value === dateOption)
    return match?.label ?? ''
  }, [dateOption])

  const hasLocation = Boolean(cityId && districtId)
  const hasAddress = Boolean(address.trim())
  const hasDateTime =
    dateOption !== 'choose' || Boolean(dateValue && timeValue)
  const canSubmit =
    Boolean(categoryId) &&
    Boolean(serviceName.trim()) &&
    hasLocation &&
    (locationType !== 'client' || hasAddress) &&
    hasDateTime &&
    !isSubmitting

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

    if (locationType === 'client' && !address.trim()) {
      setSubmitError('Для выезда укажите адрес в профиле.')
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
        }),
      })

      if (!response.ok) {
        throw new Error('Create request failed')
      }

      setSubmitSuccess('Заявка опубликована. Ожидайте отклики.')
    } catch (error) {
      setSubmitError('Не удалось опубликовать заявку. Попробуйте еще раз.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="screen screen--request">
      <div className="request-shell">
        <header className="request-header animate delay-1">
          <div className="request-headings">
            <h1 className="request-title">Создать заявку</h1>
            <p className="request-subtitle">Услуга • где • когда • детали</p>
          </div>
        </header>

        <section className="request-card animate delay-2">
          <h2 className="request-card-title">Услуга</h2>
          <div className="request-field">
            <span className="request-label">Категория *</span>
            <select
              className="request-select-input"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categoryItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="request-field">
            <span className="request-label">Выберите услугу *</span>
            <div className="request-service-grid" role="list">
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
              <span className="request-label">Адрес для выезда *</span>
              <div className="request-select request-select--static">
                {address.trim() || 'Адрес не указан'}
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
            <div className="request-upload">
              <div className="request-upload-media" aria-hidden="true">
                <IconPhoto />
              </div>
              <div className="request-upload-body">
                <div className="request-upload-title">Добавить фото-пример</div>
                <div className="request-upload-meta">1-5 фото • до/после</div>
              </div>
              <button className="request-upload-button" type="button">
                Добавить
              </button>
            </div>
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
