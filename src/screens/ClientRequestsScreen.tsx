import { useEffect, useMemo, useState } from 'react'
import { categoryItems } from '../data/clientData'
import type { RequestResponse, ServiceRequest } from '../types/app'

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

type ClientRequestsScreenProps = {
  apiBase: string
  userId: string
  onBack: () => void
  onCreateRequest: () => void
}

export const ClientRequestsScreen = ({
  apiBase,
  userId,
  onBack,
  onCreateRequest,
}: ClientRequestsScreenProps) => {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [expandedRequestId, setExpandedRequestId] = useState<number | null>(null)
  const [responsesByRequestId, setResponsesByRequestId] = useState<
    Record<number, RequestResponse[]>
  >({})
  const [responsesLoadingId, setResponsesLoadingId] = useState<number | null>(
    null
  )
  const [responsesError, setResponsesError] = useState('')
  const [responsesErrorId, setResponsesErrorId] = useState<number | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const loadRequests = async () => {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch(
          `${apiBase}/api/requests?userId=${encodeURIComponent(userId)}`
        )
        if (!response.ok) {
          throw new Error('Load requests failed')
        }
        const data = (await response.json()) as ServiceRequest[]
        if (!cancelled) {
          setRequests(data)
        }
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

  const toggleResponses = async (requestId: number) => {
    if (expandedRequestId === requestId) {
      setExpandedRequestId(null)
      return
    }

    setExpandedRequestId(requestId)

    if (responsesByRequestId[requestId]) {
      return
    }

    setResponsesLoadingId(requestId)
    setResponsesError('')
    setResponsesErrorId(null)

    try {
      const response = await fetch(
        `${apiBase}/api/requests/${requestId}/responses?userId=${encodeURIComponent(
          userId
        )}`
      )
      if (!response.ok) {
        throw new Error('Load responses failed')
      }
      const data = (await response.json()) as RequestResponse[]
      setResponsesByRequestId((current) => ({ ...current, [requestId]: data }))
    } catch (error) {
      setResponsesError('Не удалось загрузить отклики.')
      setResponsesErrorId(requestId)
    } finally {
      setResponsesLoadingId((current) => (current === requestId ? null : current))
    }
  }

  return (
    <div className="screen screen--requests">
      <div className="requests-shell">
        <header className="requests-header animate delay-1">
          <button className="request-back" type="button" onClick={onBack}>
            <span aria-hidden="true">‹</span>
          </button>
          <div className="request-headings">
            <h1 className="request-title">Мои заявки</h1>
            <p className="request-subtitle">История и статус заявок</p>
          </div>
        </header>

        <section className="requests-card animate delay-2">
          <div className="requests-top">
            <h2 className="requests-title">Активные</h2>
            <button
              className="cta cta--secondary"
              type="button"
              onClick={onCreateRequest}
            >
              + Новая заявка
            </button>
          </div>

          {isLoading && <p className="requests-status">Загружаем заявки...</p>}
          {loadError && <p className="requests-error">{loadError}</p>}

          {!isLoading && !items.length && !loadError && (
            <p className="requests-empty">
              Пока нет заявок. Создайте первую!
            </p>
          )}

          <div className="requests-list">
            {items.map((item) => {
              const locationLabel =
                locationLabelMap[item.locationType] ?? 'Не важно'
              const dateLabel =
                item.dateOption === 'choose'
                  ? formatDateTime(item.dateTime) || 'По договоренности'
                  : dateLabelMap[item.dateOption]
              const statusLabel = item.status === 'open' ? 'Открыта' : 'Закрыта'
              const categoryLabel =
                categoryItems.find((category) => category.id === item.categoryId)
                  ?.label ?? item.categoryId
              const responseCount = item.responsesCount ?? 0
              const responses = responsesByRequestId[item.id] ?? []
              const isResponsesOpen = expandedRequestId === item.id

              return (
                <div className="request-item" key={item.id}>
                  <div className="request-item-top">
                    <div className="request-item-title">{item.serviceName}</div>
                    <span
                      className={`request-status${
                        item.status === 'open' ? ' is-open' : ''
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
                  </div>
                  <div className="request-item-meta">{dateLabel}</div>
                  <div className="request-item-actions">
                    <button
                      className="response-toggle"
                      type="button"
                      onClick={() => toggleResponses(item.id)}
                    >
                      {isResponsesOpen ? 'Скрыть отклики' : 'Отклики'}
                      {responseCount > 0 ? ` (${responseCount})` : ''}
                    </button>
                  </div>
                  {isResponsesOpen && (
                    <div className="request-responses">
                      {responsesLoadingId === item.id && (
                        <p className="response-status">Загружаем отклики...</p>
                      )}
                      {responsesErrorId === item.id && responsesError && (
                        <p className="response-error">{responsesError}</p>
                      )}
                      {responsesLoadingId !== item.id &&
                        responses.length === 0 &&
                        responsesErrorId !== item.id && (
                          <p className="response-status">Откликов пока нет.</p>
                        )}
                      {responses.map((responseItem) => {
                        const responseStatusLabel =
                          responseStatusLabelMap[responseItem.status] ??
                          responseItem.status

                        return (
                          <div className="response-card" key={responseItem.id}>
                            <div className="response-top">
                              <div className="response-name">
                                {responseItem.displayName || 'Мастер'}
                              </div>
                              {responseItem.price !== null &&
                                responseItem.price !== undefined && (
                                  <span className="response-price">
                                    {responseItem.price} ₽
                                  </span>
                                )}
                            </div>
                            {responseItem.comment && (
                              <div className="response-comment">
                                {responseItem.comment}
                              </div>
                            )}
                            {responseItem.proposedTime && (
                              <div className="response-meta">
                                Время: {responseItem.proposedTime}
                              </div>
                            )}
                            <div className="response-meta">
                              Статус: {responseStatusLabel}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
