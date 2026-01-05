import { useEffect, useMemo, useState } from 'react'
import { categoryItems } from '../data/clientData'
import type { ServiceRequest } from '../types/app'

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

type ProRequest = ServiceRequest & {
  responseId?: number | null
  responseStatus?: string | null
  responsePrice?: number | null
  responseComment?: string | null
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
}

export const ProRequestsScreen = ({
  apiBase,
  userId,
  onBack,
}: ProRequestsScreenProps) => {
  const [requests, setRequests] = useState<ProRequest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState<Record<number, string>>({})
  const [submitSuccess, setSubmitSuccess] = useState<Record<number, string>>({})
  const [submittingId, setSubmittingId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, ResponseDraft>>({})

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
        const data = (await response.json()) as ProRequest[]
        if (cancelled) return

        setRequests(data)
        setDrafts((current) => {
          const nextDrafts = { ...current }
          data.forEach((item) => {
            if (!nextDrafts[item.id]) {
              nextDrafts[item.id] = {
                price:
                  item.responsePrice !== null && item.responsePrice !== undefined
                    ? String(item.responsePrice)
                    : '',
                comment: item.responseComment ?? '',
                proposedTime: '',
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

  const items = useMemo(() => requests, [requests])

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

  const handleSubmit = async (requestId: number) => {
    if (submittingId) return
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
    <div className="screen screen--pro-requests">
      <div className="pro-requests-shell">
        <header className="requests-header animate delay-1">
          <button className="request-back" type="button" onClick={onBack}>
            <span aria-hidden="true">‹</span>
          </button>
          <div className="request-headings">
            <h1 className="request-title">Заявки рядом</h1>
            <p className="request-subtitle">Откликайтесь на подходящие заявки</p>
          </div>
        </header>

        <section className="requests-card animate delay-2">
          {isLoading && <p className="requests-status">Загружаем заявки...</p>}
          {loadError && <p className="requests-error">{loadError}</p>}

          {!isLoading && !items.length && !loadError && (
            <p className="requests-empty">Пока нет подходящих заявок.</p>
          )}

          <div className="requests-list">
            {items.map((item) => {
              const categoryLabel =
                categoryItems.find((category) => category.id === item.categoryId)
                  ?.label ?? item.categoryId
              const locationLabel =
                locationLabelMap[item.locationType] ?? 'Не важно'
              const dateLabel =
                item.dateOption === 'choose'
                  ? formatDateTime(item.dateTime) || 'По договоренности'
                  : dateLabelMap[item.dateOption]
              const responseStatusLabel = item.responseStatus
                ? responseStatusLabelMap[
                    item.responseStatus as keyof typeof responseStatusLabelMap
                  ] ?? item.responseStatus
                : ''
              const draft = drafts[item.id] ?? {
                price: '',
                comment: '',
                proposedTime: '',
              }
              const isSubmitting = submittingId === item.id

              return (
                <div className="pro-request-item" key={item.id}>
                  <div className="request-item-top">
                    <div className="request-item-title">{item.serviceName}</div>
                    <span className="request-status is-open">Открыта</span>
                  </div>
                  <div className="request-item-meta">
                    {categoryLabel}
                    {item.budget ? ` • ${item.budget}` : ''}
                  </div>
                  <div className="request-item-meta">
                    {locationLabel}
                    {item.cityName ? ` • ${item.cityName}` : ''}
                    {item.districtName ? ` • ${item.districtName}` : ''}
                  </div>
                  <div className="request-item-meta">{dateLabel}</div>
                  {responseStatusLabel && (
                    <div className="request-item-meta">
                      Ваш отклик: {responseStatusLabel}
                    </div>
                  )}
                  {item.details && (
                    <div className="request-item-details">{item.details}</div>
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
                    />
                    <textarea
                      className="pro-response-textarea"
                      placeholder="Комментарий для клиента"
                      rows={3}
                      value={draft.comment}
                      onChange={(event) =>
                        handleDraftChange(item.id, 'comment', event.target.value)
                      }
                    />
                    <button
                      className="pro-response-button"
                      type="button"
                      onClick={() => handleSubmit(item.id)}
                      disabled={isSubmitting}
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
        </section>
      </div>
    </div>
  )
}
