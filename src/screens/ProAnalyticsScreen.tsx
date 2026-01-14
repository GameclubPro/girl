import { useEffect, useMemo, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import { LineChart } from '../components/analytics/Charts'
import { categoryItems } from '../data/clientData'
import { useProAnalyticsData } from '../hooks/useProAnalyticsData'
import type { AnalyticsRangeKey } from '../types/analytics'

const rangeOptions: Array<{ id: AnalyticsRangeKey; label: string }> = [
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
  { id: '90d', label: '90 дней' },
  { id: '365d', label: 'Год' },
]

const categoryLabelMap = new Map<string, string>(
  categoryItems.map((item) => [item.id, item.label])
)

const formatNumber = (value: number) =>
  Math.round(value).toLocaleString('ru-RU')

const formatMoney = (value: number) => `${formatNumber(value)} ₽`

const formatShortDate = (value: string) => {
  if (!value) return ''
  const normalized = value.includes('T') ? value : `${value}T00:00:00`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(value)
    if (Number.isNaN(fallback.getTime())) return value
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
    }).format(fallback)
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(parsed)
}

const formatRangeLabel = (start?: string, end?: string) => {
  if (!start || !end) return ''
  return `${formatShortDate(start)} — ${formatShortDate(end)}`
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const formatPercent = (value: number | null, showSign = false) => {
  if (value === null || !Number.isFinite(value)) return '—'
  const sign = showSign ? (value > 0 ? '+' : value < 0 ? '-' : '') : ''
  const absValue = Math.abs(value)
  const percent =
    absValue < 0.1 ? (absValue * 100).toFixed(1) : Math.round(absValue * 100)
  return `${sign}${percent}%`
}

type Delta = {
  diff: number
  percent: number | null
  trend: 'up' | 'down' | 'flat'
}

const buildDelta = (current?: number, previous?: number): Delta | null => {
  if (typeof current !== 'number' || typeof previous !== 'number') return null
  const diff = current - previous
  const percent = previous ? diff / previous : null
  return {
    diff,
    percent,
    trend: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
  }
}

const formatSignedValue = (value: number, format: (value: number) => string) => {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${format(Math.abs(value))}`
}

const formatDeltaLabel = (
  delta: Delta | null,
  format: (value: number) => string,
  usePercent = true
) => {
  if (!delta) return '—'
  if (usePercent && delta.percent !== null) {
    return formatPercent(delta.percent, true)
  }
  return formatSignedValue(delta.diff, format)
}

const getDeltaClass = (delta: Delta | null) =>
  ` is-${delta?.trend ?? 'flat'}`

const getTooltipLeft = (index: number, count: number) => {
  if (count <= 1) return '50%'
  const ratio = index / (count - 1)
  const percent = clamp(ratio * 100, 6, 94)
  return `${percent}%`
}

type ProAnalyticsScreenProps = {
  apiBase: string
  userId: string
  onBack: () => void
  onViewRequests: () => void
  onViewChats: () => void
  onEditProfile: () => void
}

export const ProAnalyticsScreen = ({
  apiBase,
  userId,
  onBack,
  onViewRequests,
  onViewChats,
  onEditProfile,
}: ProAnalyticsScreenProps) => {
  const [range, setRange] = useState<AnalyticsRangeKey>('30d')
  const { data, lastUpdated, isLoading, isRefreshing, error, reload } = useProAnalyticsData(
    apiBase,
    userId,
    range
  )
  const [activeRevenueIndex, setActiveRevenueIndex] = useState<number | null>(
    null
  )
  const [activeActivityIndex, setActiveActivityIndex] = useState<number | null>(
    null
  )
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [showAllClients, setShowAllClients] = useState(false)
  const lastUpdatedLabel = lastUpdated
    ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''
  const summary = data?.summary
  const timeseries = data?.timeseries ?? []
  const compareSummary = data?.compare?.summary
  const compareTimeseries = data?.compare?.timeseries ?? []
  const hasTimeseries = timeseries.length > 0

  useEffect(() => {
    setActiveRevenueIndex(null)
    setActiveActivityIndex(null)
    setShowAllCategories(false)
    setShowAllClients(false)
  }, [range, timeseries.length])

  const revenueSeries = timeseries.map((point) => point.revenue)
  const requestsSeries = timeseries.map((point) => point.requests)
  const responsesSeries = timeseries.map((point) => point.responses)
  const bookingsSeries = timeseries.map((point) => point.bookings)
  const rangeLabel = formatRangeLabel(data?.range.start, data?.range.end)
  const compareRangeLabel = formatRangeLabel(
    data?.compare?.range.start,
    data?.compare?.range.end
  )
  const compareRevenueSeries = compareTimeseries.map((point) => point.revenue)
  const compareRevenueValues =
    compareRevenueSeries.length > 0
      ? compareRevenueSeries.slice(0, revenueSeries.length)
      : []

  const responseRate = summary?.requests.total
    ? summary.requests.responded / summary.requests.total
    : null
  const bookingRate = summary?.requests.total
    ? summary.bookings.confirmed / summary.requests.total
    : null
  const acceptRate = summary?.requests.responded
    ? summary.requests.accepted / summary.requests.responded
    : null
  const revenueDelta = buildDelta(
    summary?.revenue.confirmed,
    compareSummary?.revenue.confirmed
  )
  const bookingsDelta = buildDelta(
    summary?.bookings.total,
    compareSummary?.bookings.total
  )
  const requestsDelta = buildDelta(
    summary?.requests.total,
    compareSummary?.requests.total
  )
  const followersDelta = buildDelta(
    summary?.followers.total,
    compareSummary?.followers.total
  )
  const avgCheckDelta = buildDelta(
    summary?.revenue.avgCheck,
    compareSummary?.revenue.avgCheck
  )
  const ratingDelta = buildDelta(
    summary?.reviews.average,
    compareSummary?.reviews.average
  )

  const categoryList = useMemo(
    () =>
      (data?.categories ?? []).map((item) => ({
        label: categoryLabelMap.get(item.id) ?? item.id,
        value: item.revenue,
      })),
    [data?.categories]
  )
  const clients = data?.clients ?? []
  const categoryTotal = categoryList.reduce((sum, item) => sum + item.value, 0)
  const visibleCategories = showAllCategories
    ? categoryList
    : categoryList.slice(0, 4)
  const visibleClients = showAllClients ? clients : clients.slice(0, 6)

  const bookingTotal = summary?.bookings.total ?? 0
  const bookingStatusItems = summary
    ? [
        {
          label: 'Подтверждено',
          value: summary.bookings.confirmed,
          color: 'var(--success)',
        },
        {
          label: 'В ожидании',
          value: summary.bookings.pending,
          color: 'var(--warning)',
        },
        {
          label: 'Отменено',
          value: summary.bookings.cancelled,
          color: 'var(--danger)',
        },
      ].map((item) => ({
        ...item,
        percent: bookingTotal ? item.value / bookingTotal : 0,
      }))
    : []

  const peakRevenuePoint = useMemo(() => {
    if (!hasTimeseries) return null
    return timeseries.reduce((best, point) =>
      point.revenue > best.revenue ? point : best
    )
  }, [hasTimeseries, timeseries])

  const zeroRevenueDays = useMemo(() => {
    if (!hasTimeseries) return 0
    return timeseries.filter((point) => point.revenue === 0).length
  }, [hasTimeseries, timeseries])

  const peakRequestPoint = useMemo(() => {
    if (!hasTimeseries) return null
    return timeseries.reduce((best, point) =>
      point.requests > best.requests ? point : best
    )
  }, [hasTimeseries, timeseries])

  const bestResponseRatePoint = useMemo(() => {
    if (!hasTimeseries) return null
    return timeseries.reduce<{ date: string; rate: number } | null>(
      (best, point) => {
        if (!point.requests) return best
        const rate = point.responses / point.requests
        if (!best || rate > best.rate) {
          return { date: point.date, rate }
        }
        return best
      },
      null
    )
  }, [hasTimeseries, timeseries])

  const funnelSteps = summary
    ? [
        { label: 'Заявки', value: data?.funnel.requests ?? 0 },
        { label: 'Ответы', value: data?.funnel.responses ?? 0 },
        { label: 'Чаты', value: data?.funnel.chats ?? 0 },
        { label: 'Записи', value: data?.funnel.bookings ?? 0 },
        { label: 'Подтверждено', value: data?.funnel.confirmed ?? 0 },
      ]
    : []
  const funnelMax = Math.max(1, ...funnelSteps.map((step) => step.value))
  const insight = useMemo(() => {
    if (!summary) return null
    const revenueTrend =
      revenueDelta && revenueDelta.percent !== null ? revenueDelta.percent : null
    if (revenueTrend !== null && revenueTrend <= -0.05) {
      return {
        tone: 'danger',
        title: 'Выручка ниже прошлого периода',
        text: 'Проверьте отмены и скорость ответа — это быстрее всего влияет на доход.',
        action: 'requests',
        actionLabel: 'Перейти к заявкам',
      }
    }
    if (responseRate !== null && responseRate < 0.4) {
      return {
        tone: 'warning',
        title: 'Ответы ниже 40%',
        text: 'Быстрые ответы повышают вероятность записи и конверсию.',
        action: 'requests',
        actionLabel: 'Открыть заявки',
      }
    }
    if (bookingRate !== null && bookingRate < 0.2) {
      return {
        tone: 'warning',
        title: 'Низкая конверсия в запись',
        text: 'Добавьте уточняющие вопросы в чате и предложите ближайшее окно.',
        action: 'chats',
        actionLabel: 'Открыть чаты',
      }
    }
    if (revenueTrend !== null && revenueTrend >= 0.1) {
      return {
        tone: 'success',
        title: 'Выручка растет',
        text: 'Сохраните темп: закрепите лучшие услуги и поддержите активность.',
        action: 'chats',
        actionLabel: 'Открыть чаты',
      }
    }
    return {
      tone: 'neutral',
      title: 'Стабильная динамика',
      text: 'Держите стабильный отклик — это самый сильный драйвер конверсии.',
      action: 'requests',
      actionLabel: 'Перейти к заявкам',
    }
  }, [bookingRate, responseRate, revenueDelta, summary])

  const isInitialLoading = isLoading && !data
  const getPointerIndex = (event: { currentTarget: HTMLElement; clientX: number }, count: number) => {
    if (count <= 1) return 0
    const rect = event.currentTarget.getBoundingClientRect()
    const offset = event.clientX - rect.left
    const ratio = rect.width ? offset / rect.width : 0
    const index = Math.round(ratio * (count - 1))
    return clamp(index, 0, count - 1)
  }
  const handleRevenuePointer = (event: { currentTarget: HTMLElement; clientX: number }) => {
    if (!hasTimeseries) return
    setActiveRevenueIndex(getPointerIndex(event, timeseries.length))
  }
  const handleActivityPointer = (event: { currentTarget: HTMLElement; clientX: number }) => {
    if (!hasTimeseries) return
    setActiveActivityIndex(getPointerIndex(event, timeseries.length))
  }
  const activeRevenuePoint =
    activeRevenueIndex !== null ? timeseries[activeRevenueIndex] : null
  const activeRevenueComparePoint =
    activeRevenueIndex !== null ? compareTimeseries[activeRevenueIndex] : null
  const activeActivityPoint =
    activeActivityIndex !== null ? timeseries[activeActivityIndex] : null

  return (
    <div className="screen screen--pro screen--pro-detail screen--pro-analytics">
      <div className="analytics-shell">
        <header className="analytics-header">
          <button className="pro-back" type="button" onClick={onBack}>
            ←
          </button>
          <div className="analytics-title">
            <p className="analytics-kicker">Аналитика</p>
            <h1 className="analytics-heading">Статистика бизнеса</h1>
            <p className="analytics-subtitle">
              Доход, заявки, клиенты и конверсии в одном мобильном дашборде.
            </p>
          </div>
          <button
            className={`analytics-refresh${isRefreshing ? ' is-loading' : ''}`}
            type="button"
            onClick={() => reload({ force: true, silent: true })}
            aria-label="Обновить данные"
            disabled={isRefreshing}
          >
            ⟳
          </button>
        </header>

        <div className="analytics-toolbar">
          <div className="analytics-range">
            {rangeOptions.map((option) => (
              <button
                key={option.id}
                className={`analytics-range-chip${
                  range === option.id ? ' is-active' : ''
                }`}
                type="button"
                onClick={() => setRange(option.id)}
                aria-pressed={range === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="analytics-meta-row">
            {lastUpdatedLabel && <p className="analytics-meta">{lastUpdatedLabel}</p>}
            {compareRangeLabel && (
              <p className="analytics-meta">Сравнение: {compareRangeLabel}</p>
            )}
          </div>
        </div>

        {isInitialLoading && (
          <p className="analytics-status" role="status">
            Синхронизируем аналитику...
          </p>
        )}
        {error && (
          <p className="analytics-status is-error" role="alert">
            {error}
          </p>
        )}

        {!data && !isLoading && !error && (
          <p className="analytics-status">Пока нет данных за выбранный период.</p>
        )}

        {data && summary && (
          <>
            <section className="analytics-summary-grid">
              <article className="analytics-summary-card">
                <div className="analytics-summary-head">
                  <div>
                    <p className="analytics-summary-label">Выручка</p>
                    <div className="analytics-summary-value-row">
                      <p className="analytics-summary-value">
                        {formatMoney(summary.revenue.confirmed)}
                      </p>
                      <span
                        className={`analytics-delta${getDeltaClass(
                          revenueDelta
                        )}`}
                      >
                        {formatDeltaLabel(revenueDelta, formatMoney)}
                      </span>
                    </div>
                    <p className="analytics-summary-meta">
                      Прогноз: {formatMoney(summary.revenue.projected)}
                    </p>
                  </div>
                  {rangeLabel && <span className="analytics-pill">{rangeLabel}</span>}
                </div>
                <div className="analytics-summary-row">
                  <div className="analytics-summary-stat">
                    <span className="analytics-summary-stat-label">Ответы</span>
                    <span className="analytics-summary-stat-value">
                      {formatPercent(responseRate)}
                    </span>
                  </div>
                  <div className="analytics-summary-stat">
                    <span className="analytics-summary-stat-label">Конверсия</span>
                    <span className="analytics-summary-stat-value">
                      {formatPercent(bookingRate)}
                    </span>
                  </div>
                  <div className="analytics-summary-stat">
                    <span className="analytics-summary-stat-label">Принято</span>
                    <span className="analytics-summary-stat-value">
                      {formatPercent(acceptRate)}
                    </span>
                  </div>
                </div>
              </article>
              <article className="analytics-summary-card">
                <div className="analytics-summary-head">
                  <p className="analytics-summary-label">Средний чек</p>
                  <span
                    className={`analytics-delta${getDeltaClass(avgCheckDelta)}`}
                  >
                    {formatDeltaLabel(avgCheckDelta, formatMoney)}
                  </span>
                </div>
                <p className="analytics-summary-value">
                  {formatMoney(summary.revenue.avgCheck)}
                </p>
                <p className="analytics-summary-meta">
                  Записей: {formatNumber(summary.bookings.confirmed)}
                </p>
              </article>
              <article className="analytics-summary-card">
                <div className="analytics-summary-head">
                  <p className="analytics-summary-label">Записи</p>
                  <span
                    className={`analytics-delta${getDeltaClass(bookingsDelta)}`}
                  >
                    {formatDeltaLabel(bookingsDelta, formatNumber)}
                  </span>
                </div>
                <p className="analytics-summary-value">
                  {formatNumber(summary.bookings.total)}
                </p>
                <p className="analytics-summary-meta">
                  Активные: {formatNumber(summary.bookings.pending)}
                </p>
              </article>
              <article className="analytics-summary-card">
                <div className="analytics-summary-head">
                  <p className="analytics-summary-label">Заявки</p>
                  <span
                    className={`analytics-delta${getDeltaClass(requestsDelta)}`}
                  >
                    {formatDeltaLabel(requestsDelta, formatNumber)}
                  </span>
                </div>
                <p className="analytics-summary-value">
                  {formatNumber(summary.requests.total)}
                </p>
                <p className="analytics-summary-meta">
                  Ответов: {formatNumber(summary.requests.responded)}
                </p>
              </article>
              <article className="analytics-summary-card">
                <div className="analytics-summary-head">
                  <p className="analytics-summary-label">Подписчики</p>
                  <span
                    className={`analytics-delta${getDeltaClass(followersDelta)}`}
                  >
                    {formatDeltaLabel(followersDelta, formatNumber)}
                  </span>
                </div>
                <p className="analytics-summary-value">
                  {formatNumber(summary.followers.total)}
                </p>
                <p className="analytics-summary-meta">
                  Новые: {formatNumber(summary.followers.new)}
                </p>
              </article>
              <article className="analytics-summary-card">
                <div className="analytics-summary-head">
                  <p className="analytics-summary-label">Рейтинг</p>
                  <span
                    className={`analytics-delta${getDeltaClass(ratingDelta)}`}
                  >
                    {formatDeltaLabel(
                      ratingDelta,
                      (value) => value.toFixed(1),
                      false
                    )}
                  </span>
                </div>
                <p className="analytics-summary-value">
                  {summary.reviews.average
                    ? summary.reviews.average.toFixed(1)
                    : '—'}
                </p>
                <p className="analytics-summary-meta">
                  Отзывов: {formatNumber(summary.reviews.count)}
                </p>
              </article>
            </section>

            {insight && (
              <section
                className={`analytics-insight${
                  insight.tone === 'neutral' ? '' : ` is-${insight.tone}`
                }`}
              >
                <div className="analytics-insight-content">
                  <p className="analytics-insight-title">{insight.title}</p>
                  <p className="analytics-insight-text">{insight.text}</p>
                </div>
                {insight.action && (
                  <button
                    className="analytics-insight-action"
                    type="button"
                    onClick={
                      insight.action === 'requests' ? onViewRequests : onViewChats
                    }
                  >
                    {insight.actionLabel}
                  </button>
                )}
              </section>
            )}

            <section className="analytics-card animate delay-3">
              <div className="analytics-card-head">
                <div>
                  <p className="analytics-card-kicker">Доход</p>
                  <h2 className="analytics-card-title">Выручка по дням</h2>
                  <p className="analytics-card-subtitle">
                    Подтверждено {formatMoney(summary.revenue.confirmed)}
                  </p>
                </div>
                {rangeLabel && <span className="analytics-pill">{rangeLabel}</span>}
              </div>
              {hasTimeseries ? (
                <div
                  className="analytics-chart-wrap"
                  onPointerDown={handleRevenuePointer}
                  onPointerMove={handleRevenuePointer}
                  onPointerLeave={() => setActiveRevenueIndex(null)}
                >
                  <LineChart
                    labels={timeseries.map((point) => point.date)}
                    activeIndex={activeRevenueIndex}
                    series={[
                      {
                        id: 'revenue',
                        label: 'Выручка',
                        values: revenueSeries,
                        color: 'var(--accent-strong)',
                        area: true,
                      },
                      ...(compareRevenueValues.length > 0
                        ? [
                            {
                              id: 'revenue-compare',
                              label: 'Прошлый период',
                              values: compareRevenueValues,
                              color: 'var(--accent-strong)',
                              dash: '6 6',
                              opacity: 0.5,
                            },
                          ]
                        : []),
                    ]}
                  />
                  {activeRevenuePoint && activeRevenueIndex !== null && (
                    <div
                      className="analytics-tooltip"
                      style={{
                        left: getTooltipLeft(
                          activeRevenueIndex,
                          timeseries.length
                        ),
                      }}
                    >
                      <span className="analytics-tooltip-date">
                        {formatShortDate(activeRevenuePoint.date)}
                      </span>
                      <div className="analytics-tooltip-row">
                        <span className="analytics-tooltip-label">Выручка</span>
                        <span className="analytics-tooltip-value">
                          {formatMoney(activeRevenuePoint.revenue)}
                        </span>
                      </div>
                      {activeRevenueComparePoint && (
                        <div className="analytics-tooltip-row is-muted">
                          <span className="analytics-tooltip-label">
                            Прошлый период
                          </span>
                          <span className="analytics-tooltip-value">
                            {formatMoney(activeRevenueComparePoint.revenue)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="analytics-empty">Нет данных по выручке.</p>
              )}
              {compareRevenueValues.length > 0 && (
                <div className="analytics-compare">
                  <span className="analytics-compare-line" />
                  <span className="analytics-compare-label">Прошлый период</span>
                  {compareRangeLabel && (
                    <span className="analytics-compare-meta">
                      {compareRangeLabel}
                    </span>
                  )}
                </div>
              )}
              <div className="analytics-legend">
                <div className="analytics-legend-item">
                  <span className="analytics-legend-dot is-accent" />
                  <span className="analytics-legend-label">Подтверждено</span>
                  <span className="analytics-legend-value">
                    {formatMoney(summary.revenue.confirmed)}
                  </span>
                </div>
                <div className="analytics-legend-item">
                  <span className="analytics-legend-dot is-warning" />
                  <span className="analytics-legend-label">Проекция</span>
                  <span className="analytics-legend-value">
                    {formatMoney(summary.revenue.projected)}
                  </span>
                </div>
                <div className="analytics-legend-item">
                  <span className="analytics-legend-dot is-danger" />
                  <span className="analytics-legend-label">Потери</span>
                  <span className="analytics-legend-value">
                    {formatMoney(summary.revenue.lost)}
                  </span>
                </div>
              </div>
              {hasTimeseries && (
                <div className="analytics-note-row">
                  {peakRevenuePoint && (
                    <div className="analytics-note">
                      <span className="analytics-note-label">Пик выручки</span>
                      <span className="analytics-note-value">
                        {formatMoney(peakRevenuePoint.revenue)}
                      </span>
                      <span className="analytics-note-meta">
                        {formatShortDate(peakRevenuePoint.date)}
                      </span>
                    </div>
                  )}
                  <div className="analytics-note">
                    <span className="analytics-note-label">Дней без выручки</span>
                    <span className="analytics-note-value">
                      {formatNumber(zeroRevenueDays)}
                    </span>
                    <span className="analytics-note-meta">за период</span>
                  </div>
                </div>
              )}
            </section>

            <section className="analytics-card animate delay-4">
              <div className="analytics-card-head">
                <div>
                  <p className="analytics-card-kicker">Активность</p>
                  <h2 className="analytics-card-title">Заявки и отклики</h2>
                  <p className="analytics-card-subtitle">
                    Ответов: {formatNumber(summary.requests.responded)} ·
                    Принято: {formatNumber(summary.requests.accepted)}
                  </p>
                </div>
              </div>
              {hasTimeseries ? (
                <div
                  className="analytics-chart-wrap"
                  onPointerDown={handleActivityPointer}
                  onPointerMove={handleActivityPointer}
                  onPointerLeave={() => setActiveActivityIndex(null)}
                >
                  <LineChart
                    labels={timeseries.map((point) => point.date)}
                    activeIndex={activeActivityIndex}
                    series={[
                      {
                        id: 'requests',
                        label: 'Заявки',
                        values: requestsSeries,
                        color: 'var(--accent)',
                        area: true,
                      },
                      {
                        id: 'responses',
                        label: 'Ответы',
                        values: responsesSeries,
                        color: 'var(--success)',
                      },
                      {
                        id: 'bookings',
                        label: 'Записи',
                        values: bookingsSeries,
                        color: 'var(--warning)',
                      },
                    ]}
                  />
                  {activeActivityPoint && activeActivityIndex !== null && (
                    <div
                      className="analytics-tooltip"
                      style={{
                        left: getTooltipLeft(
                          activeActivityIndex,
                          timeseries.length
                        ),
                      }}
                    >
                      <span className="analytics-tooltip-date">
                        {formatShortDate(activeActivityPoint.date)}
                      </span>
                      <div className="analytics-tooltip-row">
                        <span className="analytics-tooltip-label">Заявки</span>
                        <span className="analytics-tooltip-value">
                          {formatNumber(activeActivityPoint.requests)}
                        </span>
                      </div>
                      <div className="analytics-tooltip-row">
                        <span className="analytics-tooltip-label">Ответы</span>
                        <span className="analytics-tooltip-value">
                          {formatNumber(activeActivityPoint.responses)}
                        </span>
                      </div>
                      <div className="analytics-tooltip-row">
                        <span className="analytics-tooltip-label">Записи</span>
                        <span className="analytics-tooltip-value">
                          {formatNumber(activeActivityPoint.bookings)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="analytics-empty">Нет данных по заявкам.</p>
              )}
              <div className="analytics-legend">
                <div className="analytics-legend-item">
                  <span className="analytics-legend-dot is-accent" />
                  <span className="analytics-legend-label">Заявки</span>
                  <span className="analytics-legend-value">
                    {formatNumber(summary.requests.total)}
                  </span>
                </div>
                <div className="analytics-legend-item">
                  <span className="analytics-legend-dot is-success" />
                  <span className="analytics-legend-label">Ответы</span>
                  <span className="analytics-legend-value">
                    {formatNumber(summary.requests.responded)}
                  </span>
                </div>
                <div className="analytics-legend-item">
                  <span className="analytics-legend-dot is-warning" />
                  <span className="analytics-legend-label">Записи</span>
                  <span className="analytics-legend-value">
                    {formatNumber(summary.bookings.total)}
                  </span>
                </div>
              </div>
              {hasTimeseries && (
                <div className="analytics-note-row">
                  {peakRequestPoint && (
                    <div className="analytics-note">
                      <span className="analytics-note-label">Пик заявок</span>
                      <span className="analytics-note-value">
                        {formatNumber(peakRequestPoint.requests)}
                      </span>
                      <span className="analytics-note-meta">
                        {formatShortDate(peakRequestPoint.date)}
                      </span>
                    </div>
                  )}
                  {bestResponseRatePoint && (
                    <div className="analytics-note">
                      <span className="analytics-note-label">Лучший отклик</span>
                      <span className="analytics-note-value">
                        {formatPercent(bestResponseRatePoint.rate)}
                      </span>
                      <span className="analytics-note-meta">
                        {formatShortDate(bestResponseRatePoint.date)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="analytics-card animate delay-5">
              <div className="analytics-card-head">
                <div>
                  <p className="analytics-card-kicker">Записи</p>
                  <h2 className="analytics-card-title">Статусы записей</h2>
                  <p className="analytics-card-subtitle">
                    Подтверждено {formatNumber(summary.bookings.confirmed)} из{' '}
                    {formatNumber(summary.bookings.total)}
                  </p>
                </div>
              </div>
              {bookingStatusItems.length > 0 ? (
                <div className="analytics-status-grid">
                  {bookingStatusItems.map((item) => (
                    <div key={item.label} className="analytics-status-card">
                      <span
                        className="analytics-status-dot"
                        style={{ color: item.color }}
                      />
                      <div className="analytics-status-content">
                        <span className="analytics-status-title">{item.label}</span>
                        <span className="analytics-status-value">
                          {formatNumber(item.value)}
                        </span>
                        <span className="analytics-status-meta">
                          {formatPercent(item.percent)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="analytics-empty">Пока нет данных по записям.</p>
              )}
            </section>

            <section className="analytics-card animate delay-6">
              <div className="analytics-card-head">
                <div>
                  <p className="analytics-card-kicker">Категории</p>
                  <h2 className="analytics-card-title">Сильные направления</h2>
                  <p className="analytics-card-subtitle">
                    Топ направлений по подтвержденной выручке
                  </p>
                </div>
              </div>
              {categoryList.length > 0 ? (
                <>
                  <div className="analytics-rank-list">
                    {visibleCategories.map((item, index) => {
                      const share = categoryTotal ? item.value / categoryTotal : 0
                      return (
                        <div key={item.label} className="analytics-rank-item">
                          <span className="analytics-rank-index">
                            {index + 1}
                          </span>
                          <div className="analytics-rank-content">
                            <span className="analytics-rank-title">
                              {item.label}
                            </span>
                            <span className="analytics-rank-meta">
                              {formatMoney(item.value)} · {formatPercent(share)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {categoryList.length > 4 && (
                    <div className="analytics-action-row">
                      <button
                        className="analytics-link-button"
                        type="button"
                        onClick={() => setShowAllCategories((prev) => !prev)}
                      >
                        {showAllCategories ? 'Скрыть' : 'Показать еще'}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="analytics-empty">Пока нет данных по категориям.</p>
              )}
            </section>

            <section className="analytics-card animate delay-7">
              <div className="analytics-card-head">
                <div>
                  <p className="analytics-card-kicker">Клиенты</p>
                  <h2 className="analytics-card-title">Топ клиенты</h2>
                  <p className="analytics-card-subtitle">
                    Частота визитов и вклад в доход
                  </p>
                </div>
              </div>
              {clients.length > 0 ? (
                <>
                  <div className="analytics-list">
                    {visibleClients.map((client) => (
                      <div key={client.id} className="analytics-list-item is-compact">
                        <span className="analytics-list-dot is-success" />
                        <div className="analytics-list-content">
                          <span className="analytics-list-title">{client.name}</span>
                          <span className="analytics-list-meta">
                            {formatNumber(client.visits)} визитов ·{' '}
                            {formatMoney(client.revenue)}
                            {client.lastSeenAt
                              ? ` · ${formatShortDate(client.lastSeenAt)}`
                              : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {clients.length > 6 && (
                    <div className="analytics-action-row">
                      <button
                        className="analytics-link-button"
                        type="button"
                        onClick={() => setShowAllClients((prev) => !prev)}
                      >
                        {showAllClients ? 'Скрыть' : 'Показать еще'}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="analytics-empty">Пока нет данных по клиентам.</p>
              )}
            </section>

            <section className="analytics-card animate delay-7">
              <div className="analytics-card-head">
                <div>
                  <p className="analytics-card-kicker">Конверсия</p>
                  <h2 className="analytics-card-title">Воронка в заявки</h2>
                  <p className="analytics-card-subtitle">
                    Сколько клиентов дошли до записи
                  </p>
                </div>
              </div>
              <div className="analytics-funnel">
                {funnelSteps.map((step, index) => {
                  const previousValue =
                    index === 0 ? null : funnelSteps[index - 1]?.value ?? null
                  const stepRate =
                    previousValue && previousValue > 0
                      ? step.value / previousValue
                      : null
                  return (
                  <div key={step.label} className="analytics-funnel-row">
                    <span className="analytics-funnel-label">
                      <span className="analytics-funnel-title">{step.label}</span>
                      {stepRate !== null && (
                        <span className="analytics-funnel-meta">
                          {formatPercent(stepRate)}
                        </span>
                      )}
                    </span>
                    <div className="analytics-funnel-bar">
                      <span
                        className="analytics-funnel-fill"
                        style={{
                          width: `${Math.round(
                            (step.value / funnelMax) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="analytics-funnel-value">
                      {formatNumber(step.value)}
                    </span>
                  </div>
                  )
                })}
              </div>
            </section>

            <section className="pro-detail-actions animate delay-7">
              <button
                className="pro-detail-action"
                type="button"
                onClick={onViewRequests}
              >
                Перейти к заявкам
              </button>
              <button
                className="pro-detail-action is-ghost"
                type="button"
                onClick={onViewChats}
              >
                Открыть чаты
              </button>
            </section>
          </>
        )}
      </div>

      <ProBottomNav
        active="cabinet"
        onCabinet={onBack}
        onRequests={onViewRequests}
        onChats={onViewChats}
        onProfile={onEditProfile}
        allowActiveClick
      />
    </div>
  )
}
