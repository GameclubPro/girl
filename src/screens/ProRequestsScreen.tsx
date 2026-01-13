import { useEffect, useMemo, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { categoryItems } from '../data/clientData'
import type {
  Booking,
  ProfileStatus,
  ProProfileSection,
  ServiceRequest,
} from '../types/app'

const locationLabelMap = {
  master: 'У мастера',
  client: 'У меня',
  any: 'Не важно',
} as const

const dateLabelMap = {
  today: 'Сегодня',
  tomorrow: 'Завтра',
  choose: 'По времени',
} as const

const responseStatusLabelMap = {
  sent: 'отправлен',
  accepted: 'принят',
  rejected: 'отклонен',
  expired: 'истек',
} as const

const bookingStatusLabelMap = {
  pending: 'Ждет подтверждения',
  price_pending: 'Нужна цена',
  price_proposed: 'Цена предложена',
  confirmed: 'Подтверждена',
  declined: 'Отклонена',
  cancelled: 'Отменена',
} as const

const bookingStatusToneMap = {
  pending: 'is-waiting',
  price_pending: 'is-waiting',
  price_proposed: 'is-offer',
  confirmed: 'is-confirmed',
  declined: 'is-cancelled',
  cancelled: 'is-cancelled',
} as const

const formatDateTime = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

const formatPrice = (value: number) =>
  `${Math.round(value).toLocaleString('ru-RU')} ₽`

const formatDistance = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  if (value < 1) {
    return `${Math.round(value * 1000)} м`
  }
  return `${value.toFixed(1).replace('.', ',')} км`
}

const formatTimeLeft = (value?: string | null) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const diffMs = parsed.getTime() - Date.now()
  if (diffMs <= 0) return ''
  const minutesTotal = Math.ceil(diffMs / 60000)
  const hours = Math.floor(minutesTotal / 60)
  const minutes = minutesTotal % 60
  if (hours <= 0) return `${minutesTotal} мин`
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`
}

const getInitials = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return 'К'
  const parts = normalized.split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part[0] ?? '')
  const joined = letters.join('').toUpperCase()
  if (joined) return joined
  return normalized.slice(0, 2).toUpperCase()
}

type ProRequest = ServiceRequest & {
  responseId?: number | null
  responseStatus?: string | null
  responsePrice?: number | null
  responseComment?: string | null
  responseProposedTime?: string | null
  responseCreatedAt?: string | null
}

type ResponseDraft = {
  price: string
  comment: string
  proposedTime: string
}

type ProRequestsScreenProps = {
  apiBase: string
  userId: string
  onBack: () => void
  onEditProfile: (section?: ProProfileSection) => void
  onViewChats: () => void
  onOpenChat: (chatId: number) => void
}

export const ProRequestsScreen = ({
  apiBase,
  userId,
  onBack,
  onEditProfile,
  onViewChats,
  onOpenChat,
}: ProRequestsScreenProps) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'bookings'>('requests')
  const [requests, setRequests] = useState<ProRequest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState<Record<number, string>>({})
  const [submitSuccess, setSubmitSuccess] = useState<Record<number, string>>({})
  const [submittingId, setSubmittingId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, ResponseDraft>>({})
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [isActive, setIsActive] = useState(true)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [isBookingsLoading, setIsBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState('')
  const [bookingActionId, setBookingActionId] = useState<number | null>(null)
  const [bookingActionError, setBookingActionError] = useState<
    Record<number, string>
  >({})
  const [bookingDrafts, setBookingDrafts] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadRequests = async () => {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch(
          `${apiBase}/api/pro/requests?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load pro requests failed')
        }
        const data = (await response.json()) as
          | ProRequest[]
          | {
              profileStatus?: ProfileStatus
              missingFields?: string[]
              isActive?: boolean
              requests?: ProRequest[]
            }
        if (cancelled) return

        const requestItems = Array.isArray(data) ? data : data.requests ?? []
        const nextMissing = Array.isArray(data) ? [] : data.missingFields ?? []
        const nextActive = Array.isArray(data) ? true : data.isActive ?? true

        setRequests(requestItems)
        setMissingFields(nextMissing)
        setIsActive(nextActive)
        setDrafts((current) => {
          const nextDrafts = { ...current }
          requestItems.forEach((item) => {
            if (!nextDrafts[item.id]) {
              nextDrafts[item.id] = {
                price:
                  item.responsePrice !== null && item.responsePrice !== undefined
                    ? String(item.responsePrice)
                    : '',
                comment: item.responseComment ?? '',
                proposedTime: item.responseProposedTime ?? '',
              }
            }
          })
          return nextDrafts
        })
      } catch (error) {
        if (!cancelled) {
          setLoadError('Не удалось загрузить заявки.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadRequests()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadBookings = async () => {
      setIsBookingsLoading(true)
      setBookingsError('')

      try {
        const response = await fetch(
          `${apiBase}/api/pro/bookings?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load bookings failed')
        }
        const data = (await response.json()) as Booking[]
        if (cancelled) return
        const bookingItems = Array.isArray(data) ? data : []
        setBookings(bookingItems)
        setBookingDrafts((current) => {
          const next = { ...current }
          bookingItems.forEach((booking) => {
            if (next[booking.id] === undefined) {
              next[booking.id] =
                typeof booking.proposedPrice === 'number'
                  ? String(booking.proposedPrice)
                  : ''
            }
          })
          return next
        })
      } catch (error) {
        if (!cancelled) {
          setBookings([])
          setBookingsError('Не удалось загрузить записи.')
        }
      } finally {
        if (!cancelled) {
          setIsBookingsLoading(false)
        }
      }
    }

    loadBookings()

    return () => {
      cancelled = true
    }
  }, [apiBase, userId])

  const items = useMemo(() => requests, [requests])
  const bookingItems = useMemo(() => bookings, [bookings])
  const missingLabels = useMemo(() => {
    const labels: string[] = []
    if (missingFields.includes('displayName')) {
      labels.push('Имя и специализация')
    }
    if (missingFields.includes('categories')) {
      labels.push('Категории услуг')
    }
    if (
      missingFields.includes('cityId') ||
      missingFields.includes('districtId')
    ) {
      labels.push('Город и район')
    }
    if (missingFields.includes('workFormat')) {
      labels.push('Формат работы')
    }
    return labels
  }, [missingFields])
  const missingSummary =
    missingLabels.length > 0 ? missingLabels.join(', ') : 'минимум профиля'

  const handleDraftChange = (
    requestId: number,
    field: keyof ResponseDraft,
    value: string
  ) => {
    setDrafts((current) => ({
      ...current,
      [requestId]: {
        ...current[requestId],
        [field]: value,
      },
    }))
  }

  const handleBookingDraftChange = (bookingId: number, value: string) => {
    setBookingDrafts((current) => ({
      ...current,
      [bookingId]: value,
    }))
  }

  const handleBookingAction = async (
    bookingId: number,
    action: 'master-accept' | 'master-decline' | 'master-propose-price',
    price?: string
  ) => {
    if (bookingActionId !== null) return

    if (action === 'master-propose-price') {
      const parsedPrice = Number(price)
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        setBookingActionError((current) => ({
          ...current,
          [bookingId]: 'Укажите корректную цену.',
        }))
        return
      }
    }

    setBookingActionId(bookingId)
    setBookingActionError((current) => ({ ...current, [bookingId]: '' }))

    try {
      const payload: { userId: string; action: string; price?: number } = {
        userId,
        action,
      }
      if (action === 'master-propose-price') {
        payload.price = Number(price)
      }

      const response = await fetch(`${apiBase}/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Booking update failed')
      }

      const data = (await response.json().catch(() => null)) as
        | { status?: Booking['status']; proposedPrice?: number | null }
        | null

      setBookings((current) =>
        current.map((booking) => {
          if (booking.id !== bookingId) return booking
          const next = { ...booking }
          if (data?.status) {
            next.status = data.status
          } else if (action === 'master-accept') {
            next.status = 'confirmed'
          } else if (action === 'master-decline') {
            next.status = 'declined'
          } else if (action === 'master-propose-price') {
            next.status = 'price_proposed'
          }
          if (action === 'master-propose-price') {
            const updatedPrice =
              typeof data?.proposedPrice === 'number'
                ? data.proposedPrice
                : Number(price)
            next.proposedPrice = updatedPrice
          }
          return next
        })
      )
    } catch (error) {
      setBookingActionError((current) => ({
        ...current,
        [bookingId]: 'Не удалось обновить запись.',
      }))
    } finally {
      setBookingActionId((current) => (current === bookingId ? null : current))
    }
  }

  const handleSubmit = async (requestId: number) => {
    if (submittingId) return
    if (missingFields.length > 0) {
      setSubmitError((current) => ({
        ...current,
        [requestId]: 'Заполните минимум профиля, чтобы откликаться.',
      }))
      return
    }
    if (!isActive) {
      setSubmitError((current) => ({
        ...current,
        [requestId]: 'Вы на паузе. Включите прием заявок в кабинете.',
      }))
      return
    }
    const draft = drafts[requestId]
    if (!draft) return

    setSubmittingId(requestId)
    setSubmitError((current) => ({ ...current, [requestId]: '' }))
    setSubmitSuccess((current) => ({ ...current, [requestId]: '' }))

    const priceValue = draft.price.trim()
    const hasPrice = priceValue.length > 0
    const hasComment = draft.comment.trim().length > 0
    const hasProposedTime = draft.proposedTime.trim().length > 0

    if (!hasPrice && !hasComment && !hasProposedTime) {
      setSubmitError((current) => ({
        ...current,
        [requestId]: 'Добавьте цену или комментарий.',
      }))
      setSubmittingId(null)
      return
    }

    try {
      const response = await fetch(
        `${apiBase}/api/requests/${requestId}/responses`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            price: hasPrice ? Number(priceValue) : null,
            comment: draft.comment.trim() || null,
            proposedTime: draft.proposedTime.trim() || null,
          }),
        }
      )

      if (response.status === 403) {
        setSubmitError((current) => ({
          ...current,
          [requestId]: 'Эта заявка больше недоступна.',
        }))
        return
      }

      if (response.status === 409) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string; missingFields?: string[] }
          | null
        if (data?.error === 'profile_paused') {
          setIsActive(false)
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Вы на паузе. Включите прием заявок в кабинете.',
          }))
          return
        }
        if (data?.error === 'response_window_closed') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Окно отклика истекло.',
          }))
          return
        }

        if (data?.error === 'response_locked') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Отклик уже принят или отклонен.',
          }))
          return
        }

        if (data?.error === 'request_closed') {
          setSubmitError((current) => ({
            ...current,
            [requestId]: 'Заявка уже закрыта клиентом.',
          }))
          return
        }

        setSubmitError((current) => ({
          ...current,
          [requestId]: 'Заполните минимум профиля, чтобы откликаться.',
        }))
        if (data?.missingFields) {
          setMissingFields(data.missingFields)
        }
        return
      }

      if (!response.ok) {
        throw new Error('Submit response failed')
      }

      setSubmitSuccess((current) => ({
        ...current,
        [requestId]: 'Отклик отправлен.',
      }))

      setRequests((current) =>
        current.map((item) =>
          item.id === requestId
            ? {
                ...item,
                responseStatus: 'sent',
                responsePrice: hasPrice ? Number(priceValue) : null,
                responseComment: draft.comment.trim() || null,
                responseProposedTime: draft.proposedTime.trim() || null,
              }
            : item
        )
      )
    } catch (error) {
      setSubmitError((current) => ({
        ...current,
        [requestId]: 'Не удалось отправить отклик.',
      }))
    } finally {
      setSubmittingId(null)
    }
  }

  return (
    <div className="screen screen--pro screen--pro-requests">
      <div className="pro-shell">
        <section className="pro-card pro-requests-hero animate delay-1">
          <div>
            <p className="pro-card-eyebrow">Заявки и записи</p>
            <h1 className="pro-card-title">Заявки и записи</h1>
            <p className="pro-requests-subtitle">
              Отклики, подтверждения и цены в одном месте
            </p>
          </div>
        </section>

        <section className="pro-card pro-requests-panel animate delay-2">
          {!isActive && (
            <div className="pro-banner">
              <div>
                <div className="pro-banner-title">Вы на паузе</div>
                <p className="pro-banner-text">
                  Включите прием заявок в кабинете или в профиле.
                </p>
              </div>
              <button
                className="pro-banner-button"
                type="button"
                onClick={() => onEditProfile('availability')}
              >
                Изменить
              </button>
            </div>
          )}
          {missingFields.length > 0 && (
            <div className="pro-banner">
              <div>
                <div className="pro-banner-title">Чтобы откликаться</div>
                <p className="pro-banner-text">
                  Заполните профиль: {missingSummary}.
                </p>
              </div>
              <button
                className="pro-banner-button"
                type="button"
                onClick={() => onEditProfile('basic')}
              >
                Заполнить
              </button>
            </div>
          )}
          <div
            className="requests-tabs pro-requests-tabs"
            role="tablist"
            aria-label="Разделы"
          >
            <button
              className={`requests-tab${activeTab === 'requests' ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'requests'}
              onClick={() => setActiveTab('requests')}
            >
              Заявки
            </button>
            <button
              className={`requests-tab${activeTab === 'bookings' ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'bookings'}
              onClick={() => setActiveTab('bookings')}
            >
              Записи
            </button>
          </div>

          {activeTab === 'requests' && (
            <>
              {isLoading && <p className="requests-status">Загружаем заявки...</p>}
              {loadError && <p className="requests-error">{loadError}</p>}

              {!isLoading && !items.length && !loadError && (
                <p className="requests-empty">
                  {!isActive
                    ? 'Вы на паузе. Включите прием заявок.'
                    : missingFields.some((field) => field !== 'displayName')
                    ? 'Заполните профиль, чтобы видеть заявки рядом.'
                    : 'Пока нет подходящих заявок.'}
                </p>
              )}

              <div className="requests-list">
                {items.map((item) => {
                  const categoryLabel =
                    categoryItems.find((category) => category.id === item.categoryId)
                      ?.label ?? item.categoryId
                  const locationLabel =
                    locationLabelMap[item.locationType] ?? 'Не важно'
                  const distanceLabel = formatDistance(item.distanceKm)
                  const dateLabel =
                    item.dateOption === 'choose'
                      ? formatDateTime(item.dateTime) || 'По договоренности'
                      : dateLabelMap[item.dateOption]
                  const statusLabel = item.status === 'open' ? 'Открыта' : 'Закрыта'
                  const tagItems = Array.isArray(item.tags) ? item.tags : []
                  const photoItems = Array.isArray(item.photoUrls)
                    ? item.photoUrls
                    : []
                  const responseStatusLabel = item.responseStatus
                    ? responseStatusLabelMap[
                        item.responseStatus as keyof typeof responseStatusLabelMap
                      ] ?? item.responseStatus
                    : ''
                  const dispatchTimeLeft = formatTimeLeft(item.dispatchExpiresAt)
                  const dispatchBatchLabel = item.dispatchBatch
                    ? `Волна ${item.dispatchBatch}`
                    : ''
                  const isFinalResponse = ['accepted', 'rejected', 'expired'].includes(
                    item.responseStatus ?? ''
                  )
                  const draft = drafts[item.id] ?? {
                    price: '',
                    comment: '',
                    proposedTime: '',
                  }
                  const isSubmitting = submittingId === item.id
                  const canRespond =
                    missingFields.length === 0 &&
                    isActive &&
                    item.status === 'open' &&
                    !isFinalResponse &&
                    (item.responseStatus === 'sent' || Boolean(dispatchTimeLeft))

                  return (
                    <div className="pro-request-item" key={item.id}>
                      <div className="request-item-top">
                        <div className="request-item-title">{item.serviceName}</div>
                        <span
                          className={`request-status${
                            item.status === 'open' ? ' is-open' : ' is-closed'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="request-item-meta">
                        {categoryLabel}
                        {item.budget ? ` • ${item.budget}` : ''}
                      </div>
                      <div className="request-item-meta">
                        {locationLabel}
                        {item.cityName ? ` • ${item.cityName}` : ''}
                        {item.districtName ? ` • ${item.districtName}` : ''}
                        {distanceLabel ? ` • ${distanceLabel}` : ''}
                      </div>
                      <div className="request-item-meta">{dateLabel}</div>
                      {item.status === 'open' &&
                        !item.responseStatus &&
                        (dispatchTimeLeft || dispatchBatchLabel) && (
                          <div className="request-item-meta request-item-meta--hint">
                            {dispatchBatchLabel}
                            {dispatchBatchLabel && dispatchTimeLeft ? ' • ' : ''}
                            {dispatchTimeLeft
                              ? `Осталось ${dispatchTimeLeft} на отклик`
                              : 'Окно отклика истекло'}
                          </div>
                        )}
                      {item.locationType === 'client' && item.address && (
                        <div className="request-item-meta">Адрес: {item.address}</div>
                      )}
                      {tagItems.length > 0 && (
                        <div className="request-tags" role="list">
                          {tagItems.map((tag) => (
                            <span
                              className="request-chip is-active"
                              key={`${item.id}-${tag}`}
                              role="listitem"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {responseStatusLabel && (
                        <div className="request-item-meta">
                          Ваш отклик: {responseStatusLabel}
                        </div>
                      )}
                      {item.responseStatus === 'accepted' && item.chatId && (
                        <button
                          className="request-chat-cta"
                          type="button"
                          onClick={() => onOpenChat(item.chatId!)}
                        >
                          Перейти в чат
                        </button>
                      )}
                      {item.details && (
                        <div className="request-item-details">{item.details}</div>
                      )}
                      {photoItems.length > 0 && (
                        <div className="booking-photo-strip" role="list">
                          {photoItems.map((url, index) => (
                            <span
                              className="booking-photo-thumb"
                              key={`${item.id}-photo-${index}`}
                              role="listitem"
                            >
                              <img src={url} alt="" loading="lazy" />
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="pro-response-form">
                        <input
                          className="pro-response-input"
                          type="number"
                          placeholder="Ваша цена, ₽"
                          value={draft.price}
                          onChange={(event) =>
                            handleDraftChange(item.id, 'price', event.target.value)
                          }
                          min="0"
                          disabled={!canRespond}
                        />
                        <input
                          className="pro-response-input"
                          type="text"
                          placeholder="Предложенное время (опционально)"
                          value={draft.proposedTime}
                          onChange={(event) =>
                            handleDraftChange(
                              item.id,
                              'proposedTime',
                              event.target.value
                            )
                          }
                          disabled={!canRespond}
                        />
                        <textarea
                          className="pro-response-textarea"
                          placeholder="Комментарий для клиента"
                          rows={3}
                          value={draft.comment}
                          onChange={(event) =>
                            handleDraftChange(
                              item.id,
                              'comment',
                              event.target.value
                            )
                          }
                          disabled={!canRespond}
                        />
                        <button
                          className="pro-response-button"
                          type="button"
                          onClick={() => handleSubmit(item.id)}
                          disabled={isSubmitting || !canRespond}
                        >
                          {isSubmitting
                            ? 'Отправляем...'
                            : item.responseStatus
                              ? 'Обновить отклик'
                              : 'Откликнуться'}
                        </button>
                        {submitError[item.id] && (
                          <p className="pro-response-error">
                            {submitError[item.id]}
                          </p>
                        )}
                        {submitSuccess[item.id] && (
                          <p className="pro-response-success">
                            {submitSuccess[item.id]}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {activeTab === 'bookings' && (
            <>
              {isBookingsLoading && (
                <p className="requests-status">Загружаем записи...</p>
              )}
              {bookingsError && <p className="requests-error">{bookingsError}</p>}

              {!isBookingsLoading && bookingItems.length === 0 && !bookingsError && (
                <p className="requests-empty">Пока нет записей.</p>
              )}

              <div className="requests-list booking-list">
                {bookingItems.map((booking) => {
                  const statusLabel =
                    bookingStatusLabelMap[booking.status] ?? booking.status
                  const statusTone =
                    bookingStatusToneMap[booking.status] ?? 'is-waiting'
                  const categoryLabel =
                    categoryItems.find(
                      (category) => category.id === booking.categoryId
                    )?.label ?? booking.categoryId
                  const locationLabel =
                    locationLabelMap[booking.locationType] ?? 'Не важно'
                  const distanceLabel = formatDistance(booking.distanceKm)
                  const scheduledLabel = formatDateTime(booking.scheduledAt)
                  const hasServicePrice = typeof booking.servicePrice === 'number'
                  const priceLabel = hasServicePrice
                    ? `Стоимость: ${formatPrice(booking.servicePrice ?? 0)}`
                    : typeof booking.proposedPrice === 'number'
                      ? `Предложенная цена: ${formatPrice(booking.proposedPrice)}`
                      : 'Цена не указана'
                  const canAccept = booking.status === 'pending' && hasServicePrice
                  const canPropose =
                    !hasServicePrice &&
                    ['pending', 'price_pending', 'price_proposed'].includes(
                      booking.status
                    )
                  const canDecline = ['pending', 'price_pending', 'price_proposed'].includes(
                    booking.status
                  )
                  const isActionLoading = bookingActionId !== null
                  const draftPrice = bookingDrafts[booking.id] ?? ''
                  const clientName = booking.clientName ?? 'Клиент'
                  const clientInitials = getInitials(clientName)
                  const photoItems = Array.isArray(booking.photoUrls)
                    ? booking.photoUrls
                    : []

                  return (
                    <div className="booking-item" key={booking.id}>
                      <div className="booking-item-head">
                        <span className="booking-item-avatar" aria-hidden="true">
                          <span>{clientInitials}</span>
                        </span>
                        <div className="booking-item-main">
                          <div className="booking-item-master">{clientName}</div>
                          <div className="booking-item-service">
                            {booking.serviceName}
                          </div>
                        </div>
                        <span className={`booking-status ${statusTone}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="booking-item-meta">
                        {categoryLabel}
                        {scheduledLabel ? ` • ${scheduledLabel}` : ''}
                      </div>
                      <div className="booking-item-meta">
                        {locationLabel}
                        {booking.cityName ? ` • ${booking.cityName}` : ''}
                        {booking.districtName ? ` • ${booking.districtName}` : ''}
                        {distanceLabel ? ` • ${distanceLabel}` : ''}
                      </div>
                      {booking.locationType === 'client' && booking.address && (
                        <div className="booking-item-meta">
                          Адрес: {booking.address}
                        </div>
                      )}
                      <div className="booking-item-price">{priceLabel}</div>
                      {booking.comment && (
                        <div className="booking-item-comment">{booking.comment}</div>
                      )}
                      {photoItems.length > 0 && (
                        <div className="booking-photo-strip" role="list">
                          {photoItems.map((url, index) => (
                            <span
                              className="booking-photo-thumb"
                              key={`${booking.id}-${index}`}
                              role="listitem"
                            >
                              <img src={url} alt="" loading="lazy" />
                            </span>
                          ))}
                        </div>
                      )}
                      {canPropose && (
                        <div className="booking-price-form">
                          <input
                            className="booking-price-input"
                            type="number"
                            placeholder="Ваша цена, ₽"
                            value={draftPrice}
                            onChange={(event) =>
                              handleBookingDraftChange(booking.id, event.target.value)
                            }
                            min="0"
                            disabled={isActionLoading}
                          />
                          <button
                            className="booking-action is-primary"
                            type="button"
                            onClick={() =>
                              handleBookingAction(
                                booking.id,
                                'master-propose-price',
                                draftPrice
                              )
                            }
                            disabled={isActionLoading}
                          >
                            {booking.status === 'price_proposed'
                              ? 'Обновить цену'
                              : 'Предложить цену'}
                          </button>
                        </div>
                      )}
                      {(canAccept || canDecline) && (
                        <div className="booking-actions">
                          {canAccept && (
                            <button
                              className="booking-action is-primary"
                              type="button"
                              onClick={() =>
                                handleBookingAction(booking.id, 'master-accept')
                              }
                              disabled={isActionLoading}
                            >
                              Подтвердить
                            </button>
                          )}
                          {canDecline && (
                            <button
                              className="booking-action"
                              type="button"
                              onClick={() =>
                                handleBookingAction(booking.id, 'master-decline')
                              }
                              disabled={isActionLoading}
                            >
                              Отказать
                            </button>
                          )}
                        </div>
                      )}
                      {bookingActionError[booking.id] && (
                        <p className="booking-action-error">
                          {bookingActionError[booking.id]}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </div>

      <ProBottomNav
        active="requests"
        onCabinet={onBack}
        onRequests={() => {}}
        onChats={onViewChats}
        onProfile={() => onEditProfile()}
      />
    </div>
  )
}
