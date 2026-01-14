import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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

const createSeededRandom = (seed: number) => {
  let value = seed % 2147483647
  if (value <= 0) value += 2147483646
  return () => {
    value = (value * 48271) % 2147483647
    return value / 2147483647
  }
}

const buildBubbleSeed = (items: Array<{ label: string; value: number }>) =>
  items.reduce((acc, item) => {
    const labelScore = [...item.label].reduce(
      (sum, char) => sum + char.charCodeAt(0),
      0
    )
    return acc + item.value * 31 + labelScore * 17
  }, 1)

const shuffle = <T,>(items: T[], rng: () => number) => {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    const temp = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = temp
  }
  return copy
}

type PackedBubble<T> = T & {
  x: number
  y: number
  radius: number
  size: number
  labelOffset: number
  collisionRadius: number
}
type IndexedBubble<T> = PackedBubble<T> & { __index: number }

const packBubbles = <T extends { size: number; labelOffset?: number }>(
  items: T[],
  options: {
    width: number
    height: number
    padding: number
    gap: number
    seed: number
  }
): PackedBubble<T>[] => {
  if (items.length === 0) return []
  const containerWidth = Math.max(options.width, 1)
  const containerHeight = Math.max(options.height, 1)
  const angleStep = Math.PI * (3 - Math.sqrt(5))
  const maxScaleAttempts = 6
  const maxIterations = 90
  let result: IndexedBubble<T>[] = []

  for (let attempt = 0; attempt < maxScaleAttempts; attempt += 1) {
    const scale = Math.pow(0.92, attempt)
    const rng = createSeededRandom(options.seed + attempt * 101)
    const indexed = items.map((item, index) => ({ ...item, __index: index }))
    const ordered = shuffle(indexed, rng)
    const laidOut: IndexedBubble<T>[] = ordered.map((item, index) => {
      const scaledSize = item.size * scale
      const radius = scaledSize / 2
      const labelOffset = item.labelOffset ?? 0
      const collisionRadius = radius + labelOffset * 0.6
      const minX = options.padding + radius
      const maxX = Math.max(
        minX,
        containerWidth - options.padding - radius
      )
      const minY = options.padding + radius
      const maxY = Math.max(
        minY,
        containerHeight - options.padding - radius - labelOffset
      )
      const maxRadial = Math.max(
        0,
        Math.min(containerWidth, containerHeight) / 2 -
          options.padding -
          radius -
          labelOffset * 0.35
      )
      const radial =
        maxRadial * ((index + 1) / Math.max(ordered.length, 1))
      const angle = angleStep * index + rng() * 0.6
      const x = clamp(
        containerWidth / 2 + Math.cos(angle) * radial,
        minX,
        maxX
      )
      const y = clamp(
        containerHeight / 2 + Math.sin(angle) * radial,
        minY,
        maxY
      )
      return {
        ...item,
        size: scaledSize,
        radius,
        labelOffset,
        collisionRadius,
        x,
        y,
      }
    })

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let moved = false
      for (let i = 0; i < laidOut.length; i += 1) {
        for (let j = i + 1; j < laidOut.length; j += 1) {
          const current = laidOut[i]
          const other = laidOut[j]
          let dx = other.x - current.x
          let dy = other.y - current.y
          let distance = Math.hypot(dx, dy)
          const minDistance =
            current.collisionRadius + other.collisionRadius + options.gap
          if (distance < minDistance) {
            if (distance < 0.001) {
              const angle = rng() * Math.PI * 2
              dx = Math.cos(angle) * 0.001
              dy = Math.sin(angle) * 0.001
              distance = 0.001
            }
            const push = (minDistance - distance) / 2
            const nx = dx / distance
            const ny = dy / distance
            current.x -= nx * push
            current.y -= ny * push
            other.x += nx * push
            other.y += ny * push
            moved = true
          }
        }
      }

      laidOut.forEach((item) => {
        const minX = options.padding + item.radius
        const maxX = Math.max(
          minX,
          containerWidth - options.padding - item.radius
        )
        const minY = options.padding + item.radius
        const maxY = Math.max(
          minY,
          containerHeight - options.padding - item.radius - item.labelOffset
        )
        item.x = clamp(item.x, minX, maxX)
        item.y = clamp(item.y, minY, maxY)
      })

      if (!moved) break
    }

    const hasOverlap = laidOut.some((item, index) =>
      laidOut.slice(index + 1).some((other) => {
        const dx = other.x - item.x
        const dy = other.y - item.y
        const minDistance =
          item.collisionRadius + other.collisionRadius + options.gap
        return dx * dx + dy * dy < minDistance * minDistance
      })
    )

    result = laidOut
    if (!hasOverlap) {
      return [...laidOut]
        .sort((a, b) => a.__index - b.__index)
        .map(({ __index, ...rest }) => rest as PackedBubble<T>)
    }
  }

  return [...result]
    .sort((a, b) => a.__index - b.__index)
    .map(({ __index, ...rest }) => rest as PackedBubble<T>)
}

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
  const { data, isLoading, error } = useProAnalyticsData(apiBase, userId, range)
  const [activeRevenueIndex, setActiveRevenueIndex] = useState<number | null>(
    null
  )
  const [activeActivityIndex, setActiveActivityIndex] = useState<number | null>(
    null
  )
  const [activeProfileViewsIndex, setActiveProfileViewsIndex] = useState<
    number | null
  >(null)
  const [showAllCategories, setShowAllCategories] = useState(false)
  const [showAllClients, setShowAllClients] = useState(false)
  const statusBubbleRef = useRef<HTMLDivElement | null>(null)
  const [statusBubbleBounds, setStatusBubbleBounds] = useState({
    width: 0,
    height: 0,
  })
  const summary = data?.summary
  const timeseries = data?.timeseries ?? []
  const compareTimeseries = data?.compare?.timeseries ?? []
  const hasTimeseries = timeseries.length > 0

  useEffect(() => {
    setActiveRevenueIndex(null)
    setActiveActivityIndex(null)
    setActiveProfileViewsIndex(null)
    setShowAllCategories(false)
    setShowAllClients(false)
  }, [range, timeseries.length])

  useEffect(() => {
    const node = statusBubbleRef.current
    if (!node) return undefined
    const update = () => {
      const rect = node.getBoundingClientRect()
      setStatusBubbleBounds({
        width: rect.width,
        height: rect.height,
      })
    }
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => update())
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const revenueSeries = timeseries.map((point) => point.revenue)
  const requestsSeries = timeseries.map((point) => point.requests)
  const responsesSeries = timeseries.map((point) => point.responses)
  const bookingsSeries = timeseries.map((point) => point.bookings)
  const profileViewsSeries = timeseries.map(
    (point) => point.profileViews ?? 0
  )
  const compareRangeLabel = formatRangeLabel(
    data?.compare?.range.start,
    data?.compare?.range.end
  )
  const compareRevenueSeries = compareTimeseries.map((point) => point.revenue)
  const compareProfileViewsSeries = compareTimeseries.map(
    (point) => point.profileViews ?? 0
  )
  const compareRevenueValues =
    compareRevenueSeries.length > 0
      ? compareRevenueSeries.slice(0, revenueSeries.length)
      : []
  const compareProfileViewsValues =
    compareProfileViewsSeries.length > 0
      ? compareProfileViewsSeries.slice(0, profileViewsSeries.length)
      : []
  const renderRangeControls = () => (
    <div className="analytics-range analytics-range--card" role="group">
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
  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => b.revenue - a.revenue),
    [clients]
  )
  const categoryTotal = categoryList.reduce((sum, item) => sum + item.value, 0)
  const visibleCategories = showAllCategories
    ? categoryList
    : categoryList.slice(0, 4)
  const visibleClients = showAllClients ? sortedClients : sortedClients.slice(0, 6)
  const clientHistogramItems = useMemo(() => {
    if (visibleClients.length === 0) return []
    const maxRevenue = Math.max(
      1,
      ...visibleClients.map((client) => client.revenue)
    )
    return visibleClients.map((client) => {
      const ratio = maxRevenue ? client.revenue / maxRevenue : 0
      const height = ratio > 0 ? Math.max(0.18, ratio) : 0.08
      return {
        ...client,
        barHeight: Math.round(height * 100),
      }
    })
  }, [visibleClients])

  const bookingTotal = summary?.bookings.total ?? 0
  const bookingStatusItems = summary
    ? [
        {
          label: 'Подтверждено',
          value: summary.bookings.confirmed,
          colorRgb: 'var(--success-rgb)',
        },
        {
          label: 'В ожидании',
          value: summary.bookings.pending,
          colorRgb: 'var(--warning-rgb)',
        },
        {
          label: 'Отменено',
          value: summary.bookings.cancelled,
          colorRgb: 'var(--danger-rgb)',
        },
      ].map((item) => ({
        ...item,
        percent: bookingTotal ? item.value / bookingTotal : 0,
      }))
    : []

  const statusBubbles = useMemo(() => {
    if (bookingStatusItems.length === 0) return []
    const maxValue = Math.max(
      ...bookingStatusItems.map((item) => item.value),
      1
    )
    const minSize = 82
    const maxSize = 150
    return bookingStatusItems.map((item) => {
      const ratio = maxValue ? item.value / maxValue : 0
      const size = Math.round(
        minSize + (maxSize - minSize) * Math.sqrt(ratio)
      )
      return {
        ...item,
        size,
        labelOffset: 24,
      }
    })
  }, [bookingStatusItems])

  const positionedStatusBubbles = useMemo(() => {
    if (statusBubbles.length === 0) return []
    const width = statusBubbleBounds.width || 320
    const height = statusBubbleBounds.height || 240
    const padding = 14
    const minGap = 12
    return packBubbles(statusBubbles, {
      width,
      height,
      padding,
      gap: minGap,
      seed: buildBubbleSeed(statusBubbles),
    })
  }, [statusBubbles, statusBubbleBounds])

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

  const profileViewsTotal = useMemo(
    () => profileViewsSeries.reduce((sum, value) => sum + value, 0),
    [profileViewsSeries]
  )
  const averageProfileViews = useMemo(() => {
    if (profileViewsSeries.length === 0) return 0
    return profileViewsTotal / profileViewsSeries.length
  }, [profileViewsSeries, profileViewsTotal])
  const peakProfileViewsPoint = useMemo(() => {
    if (!hasTimeseries) return null
    return timeseries.reduce((best, point) => {
      const current = point.profileViews ?? 0
      const bestValue = best?.profileViews ?? 0
      return current > bestValue ? point : best
    }, timeseries[0] ?? null)
  }, [hasTimeseries, timeseries])
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
  const handleProfileViewsPointer = (event: {
    currentTarget: HTMLElement
    clientX: number
  }) => {
    if (!hasTimeseries) return
    setActiveProfileViewsIndex(getPointerIndex(event, timeseries.length))
  }
  const activeRevenuePoint =
    activeRevenueIndex !== null ? timeseries[activeRevenueIndex] : null
  const activeRevenueComparePoint =
    activeRevenueIndex !== null ? compareTimeseries[activeRevenueIndex] : null
  const activeActivityPoint =
    activeActivityIndex !== null ? timeseries[activeActivityIndex] : null
  const activeProfileViewsPoint =
    activeProfileViewsIndex !== null
      ? timeseries[activeProfileViewsIndex]
      : null
  const activeProfileViewsValue =
    activeProfileViewsIndex !== null
      ? profileViewsSeries[activeProfileViewsIndex]
      : null
  const activeProfileViewsCompareValue =
    activeProfileViewsIndex !== null
      ? compareProfileViewsValues[activeProfileViewsIndex]
      : null

  return (
    <div className="screen screen--pro screen--pro-detail screen--pro-analytics">
      <div className="analytics-shell">
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
            <section className="analytics-card animate delay-3">
              <div className="analytics-card-head">
                <div>
                  <p className="analytics-card-kicker">Доход</p>
                  <h2 className="analytics-card-title">Выручка по дням</h2>
                  <p className="analytics-card-subtitle">
                    Подтверждено {formatMoney(summary.revenue.confirmed)}
                  </p>
                </div>
              </div>
              {renderRangeControls()}
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
              {renderRangeControls()}
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
              {renderRangeControls()}
              {positionedStatusBubbles.length > 0 ? (
                <div
                  className="analytics-status-bubbles"
                  ref={statusBubbleRef}
                  role="list"
                  aria-label="Статусы записей"
                >
                  {positionedStatusBubbles.map((item, index) => {
                    const itemStyle: CSSProperties & {
                      '--bubble-rgb'?: string
                      '--bubble-size'?: string
                    } = {
                      '--bubble-rgb': item.colorRgb,
                      '--bubble-size': `${item.size}px`,
                      left: `${item.x}px`,
                      top: `${item.y}px`,
                      animationDelay: `${index * 0.35}s`,
                    }
                    return (
                      <div
                        key={item.label}
                        className="analytics-status-bubble-item"
                        style={itemStyle}
                        role="listitem"
                        aria-label={`${item.label}: ${formatNumber(
                          item.value
                        )} (${formatPercent(item.percent)})`}
                      >
                        <div className="analytics-status-bubble" aria-hidden="true">
                          <span className="analytics-status-bubble-value">
                            {formatNumber(item.value)}
                          </span>
                          <span className="analytics-status-bubble-meta">
                            {formatPercent(item.percent)}
                          </span>
                        </div>
                        <span className="analytics-status-bubble-label" aria-hidden="true">
                          {item.label}
                        </span>
                      </div>
                    )
                  })}
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
              {renderRangeControls()}
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
                    Высота столбца — выручка, подпись — визиты
                  </p>
                </div>
              </div>
              {renderRangeControls()}
              {clients.length > 0 ? (
                <>
                  <div
                    className="analytics-histogram"
                    role="list"
                    aria-label="Топ клиенты по выручке"
                  >
                    {clientHistogramItems.map((client, index) => {
                      const itemStyle: CSSProperties & {
                        '--bar-height'?: string
                        '--bar-index'?: string
                      } = {
                        '--bar-height': `${client.barHeight}%`,
                        '--bar-index': `${index}`,
                      }
                      return (
                        <div
                          key={client.id}
                          className={`analytics-histogram-item${
                            index === 0 ? ' is-leader' : ''
                          }`}
                          style={itemStyle}
                          role="listitem"
                          aria-label={`${client.name}: ${formatMoney(
                            client.revenue
                          )}, ${formatNumber(client.visits)} визитов`}
                        >
                          <div className="analytics-histogram-track">
                            <span
                              className="analytics-histogram-name"
                              title={client.name}
                            >
                              {client.name}
                            </span>
                            <div
                              className="analytics-histogram-bar"
                              aria-hidden="true"
                            >
                              <span className="analytics-histogram-fill" />
                              <span className="analytics-histogram-bar-value">
                                {formatMoney(client.revenue)}
                              </span>
                            </div>
                          </div>
                          <span className="analytics-histogram-meta">
                            {formatNumber(client.visits)} визитов
                          </span>
                        </div>
                      )
                    })}
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
                  <p className="analytics-card-kicker">Профиль</p>
                  <h2 className="analytics-card-title">Просмотры профиля</h2>
                  <p className="analytics-card-subtitle">
                    Всего {formatNumber(profileViewsTotal)} просмотров
                  </p>
                </div>
              </div>
              {renderRangeControls()}
              {hasTimeseries ? (
                <div
                  className="analytics-chart-wrap"
                  onPointerDown={handleProfileViewsPointer}
                  onPointerMove={handleProfileViewsPointer}
                  onPointerLeave={() => setActiveProfileViewsIndex(null)}
                >
                  <LineChart
                    labels={timeseries.map((point) => point.date)}
                    activeIndex={activeProfileViewsIndex}
                    series={[
                      {
                        id: 'profile-views',
                        label: 'Просмотры',
                        values: profileViewsSeries,
                        color: 'var(--accent)',
                        area: true,
                        curve: true,
                      },
                      ...(compareProfileViewsValues.length > 0
                        ? [
                            {
                              id: 'profile-views-compare',
                              label: 'Прошлый период',
                              values: compareProfileViewsValues,
                              color: 'var(--accent)',
                              dash: '6 6',
                              opacity: 0.45,
                              curve: true,
                            },
                          ]
                        : []),
                    ]}
                  />
                  {activeProfileViewsPoint &&
                    activeProfileViewsIndex !== null &&
                    activeProfileViewsValue !== null && (
                      <div
                        className="analytics-tooltip"
                        style={{
                          left: getTooltipLeft(
                            activeProfileViewsIndex,
                            timeseries.length
                          ),
                        }}
                      >
                        <span className="analytics-tooltip-date">
                          {formatShortDate(activeProfileViewsPoint.date)}
                        </span>
                        <div className="analytics-tooltip-row">
                          <span className="analytics-tooltip-label">
                            Просмотры
                          </span>
                          <span className="analytics-tooltip-value">
                            {formatNumber(activeProfileViewsValue)}
                          </span>
                        </div>
                        {activeProfileViewsCompareValue !== null &&
                          activeProfileViewsCompareValue !== undefined && (
                            <div className="analytics-tooltip-row is-muted">
                              <span className="analytics-tooltip-label">
                                Прошлый период
                              </span>
                              <span className="analytics-tooltip-value">
                                {formatNumber(activeProfileViewsCompareValue)}
                              </span>
                            </div>
                          )}
                      </div>
                    )}
                </div>
              ) : (
                <p className="analytics-empty">Нет данных по просмотрам.</p>
              )}
              {compareProfileViewsValues.length > 0 && (
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
              {hasTimeseries && (
                <div className="analytics-note-row">
                  <div className="analytics-note">
                    <span className="analytics-note-label">
                      В среднем за день
                    </span>
                    <span className="analytics-note-value">
                      {formatNumber(Math.round(averageProfileViews))}
                    </span>
                    <span className="analytics-note-meta">за период</span>
                  </div>
                  {peakProfileViewsPoint && (
                    <div className="analytics-note">
                      <span className="analytics-note-label">Пик просмотров</span>
                      <span className="analytics-note-value">
                        {formatNumber(peakProfileViewsPoint.profileViews ?? 0)}
                      </span>
                      <span className="analytics-note-meta">
                        {formatShortDate(peakProfileViewsPoint.date)}
                      </span>
                    </div>
                  )}
                </div>
              )}
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
