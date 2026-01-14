import { useMemo, useState } from 'react'
import { ProBottomNav } from '../components/ProBottomNav'
import {
  BarChart,
  BubbleChart,
  DonutChart,
  LineChart,
  WaterfallChart,
} from '../components/analytics/Charts'
import { categoryItems } from '../data/clientData'
import { useProAnalyticsData } from '../hooks/useProAnalyticsData'
import type { AnalyticsRangeKey } from '../types/analytics'

const rangeOptions: Array<{ id: AnalyticsRangeKey; label: string }> = [
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
  { id: '90d', label: '90 дней' },
  { id: '365d', label: 'Год' },
]

const categoryLabelMap = new Map(
  categoryItems.map((item) => [item.id, item.label])
)

const formatNumber = (value: number) =>
  Math.round(value).toLocaleString('ru-RU')

const formatMoney = (value: number) => `${formatNumber(value)} ₽`

const formatShortDate = (value: string) => {
  if (!value) return ''
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(parsed)
}

const formatRangeLabel = (start?: string, end?: string) => {
  if (!start || !end) return ''
  return `${formatShortDate(start)} — ${formatShortDate(end)}`
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
  const { data, lastUpdated, isLoading, error, reload } = useProAnalyticsData(
    apiBase,
    userId,
    range
  )
  const lastUpdatedLabel = lastUpdated
    ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''
  const summary = data?.summary
  const timeseries = data?.timeseries ?? []
  const hasTimeseries = timeseries.length > 0
  const revenueSeries = timeseries.map((point) => point.revenue)
  const requestsSeries = timeseries.map((point) => point.requests)
  const responsesSeries = timeseries.map((point) => point.responses)
  const bookingsSeries = timeseries.map((point) => point.bookings)
  const rangeLabel = formatRangeLabel(data?.range.start, data?.range.end)

  const categoryChartData = useMemo(
    () =>
      (data?.categories ?? []).map((item) => ({
        label: categoryLabelMap.get(item.id) ?? item.id,
        value: item.revenue,
      })),
    [data?.categories]
  )

  const bubbleData = useMemo(
    () =>
      (data?.clients ?? []).map((client) => ({
        label: client.name,
        x: client.visits,
        y: client.revenue,
        size: Math.max(client.visits, 1),
      })),
    [data?.clients]
  )

  const donutData = summary
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
      ]
    : []

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
            className="analytics-refresh"
            type="button"
            onClick={() => reload()}
            aria-label="Обновить данные"
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
          {lastUpdatedLabel && <p className="analytics-meta">{lastUpdatedLabel}</p>}
        </div>

        {isLoading && (
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
            <section className="analytics-summary-grid animate delay-1">
              <article className="analytics-summary-card is-primary">
                <p className="analytics-summary-label">Выручка</p>
                <p className="analytics-summary-value">
                  {formatMoney(summary.revenue.confirmed)}
                </p>
                <p className="analytics-summary-meta">
                  Прогноз: {formatMoney(summary.revenue.projected)}
                </p>
              </article>
              <article className="analytics-summary-card">
                <p className="analytics-summary-label">Средний чек</p>
                <p className="analytics-summary-value">
                  {formatMoney(summary.revenue.avgCheck)}
                </p>
                <p className="analytics-summary-meta">
                  Записей: {formatNumber(summary.bookings.confirmed)}
                </p>
              </article>
              <article className="analytics-summary-card">
                <p className="analytics-summary-label">Записи</p>
                <p className="analytics-summary-value">
                  {formatNumber(summary.bookings.total)}
                </p>
                <p className="analytics-summary-meta">
                  Активные: {formatNumber(summary.bookings.pending)}
                </p>
              </article>
              <article className="analytics-summary-card">
                <p className="analytics-summary-label">Заявки</p>
                <p className="analytics-summary-value">
                  {formatNumber(summary.requests.total)}
                </p>
                <p className="analytics-summary-meta">
                  Ответов: {formatNumber(summary.requests.responded)}
                </p>
              </article>
              <article className="analytics-summary-card">
                <p className="analytics-summary-label">Подписчики</p>
                <p className="analytics-summary-value">
                  {formatNumber(summary.followers.total)}
                </p>
                <p className="analytics-summary-meta">
                  Новые: {formatNumber(summary.followers.new)}
                </p>
              </article>
              <article className="analytics-summary-card">
                <p className="analytics-summary-label">Рейтинг</p>
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

            <section className="analytics-card animate delay-2">
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
                <LineChart
                  labels={timeseries.map((point) => point.date)}
                  series={[
                    {
                      id: 'revenue',
                      label: 'Выручка',
                      values: revenueSeries,
                      color: 'var(--accent-strong)',
                      area: true,
                    },
                  ]}
                />
              ) : (
                <p className="analytics-empty">Нет данных по выручке.</p>
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
            </section>

            <section className="analytics-card animate delay-3">
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
                <LineChart
                  labels={timeseries.map((point) => point.date)}
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
            </section>

            <section className="analytics-card animate delay-4">
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
              <div className="analytics-split">
                <DonutChart
                  data={donutData}
                  centerLabel="Записи"
                  centerValue={formatNumber(summary.bookings.total)}
                />
                <div className="analytics-list">
                  {donutData.map((item) => (
                    <div key={item.label} className="analytics-list-item">
                      <span className="analytics-list-dot" style={{ color: item.color }} />
                      <div className="analytics-list-content">
                        <span className="analytics-list-title">{item.label}</span>
                        <span className="analytics-list-meta">
                          {formatNumber(item.value)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="analytics-card animate delay-5">
              <div className="analytics-card-head">
                <div>
                  <p className="analytics-card-kicker">Категории</p>
                  <h2 className="analytics-card-title">Выручка по категориям</h2>
                  <p className="analytics-card-subtitle">
                    Топ направлений по доходу
                  </p>
                </div>
              </div>
              {categoryChartData.length > 0 ? (
                <>
                  <BarChart data={categoryChartData} />
                  <div className="analytics-list analytics-list--grid">
                    {categoryChartData.map((item) => (
                      <div key={item.label} className="analytics-list-item">
                        <span className="analytics-list-dot is-accent" />
                        <div className="analytics-list-content">
                          <span className="analytics-list-title">{item.label}</span>
                          <span className="analytics-list-meta">
                            {formatMoney(item.value)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="analytics-empty">Пока нет данных по категориям.</p>
              )}
            </section>

            <section className="analytics-card animate delay-6">
              <div className="analytics-card-head">
                <div>
                  <p className="analytics-card-kicker">Клиенты</p>
                  <h2 className="analytics-card-title">Топ клиенты</h2>
                  <p className="analytics-card-subtitle">
                    Частота визитов и вклад в доход
                  </p>
                </div>
              </div>
              {bubbleData.length > 0 ? (
                <>
                  <BubbleChart data={bubbleData} />
                  <div className="analytics-list">
                    {data.clients.map((client) => (
                      <div key={client.id} className="analytics-list-item">
                        <span className="analytics-list-dot is-success" />
                        <div className="analytics-list-content">
                          <span className="analytics-list-title">{client.name}</span>
                          <span className="analytics-list-meta">
                            {formatNumber(client.visits)} визитов ·{' '}
                            {formatMoney(client.revenue)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="analytics-empty">Пока нет данных по клиентам.</p>
              )}
            </section>

            <section className="analytics-card animate delay-7">
              <div className="analytics-card-head">
                <div>
                  <p className="analytics-card-kicker">Доход</p>
                  <h2 className="analytics-card-title">Waterfall поток</h2>
                  <p className="analytics-card-subtitle">
                    Потенциал, потери и итог по выручке
                  </p>
                </div>
              </div>
              {data.waterfall.length > 0 ? (
                <>
                  <WaterfallChart data={data.waterfall} />
                  <div className="analytics-list analytics-list--grid">
                    {data.waterfall.map((step) => (
                      <div key={step.label} className="analytics-list-item">
                        <span
                          className={`analytics-list-dot${
                            step.isTotal
                              ? ' is-accent'
                              : step.value < 0
                                ? ' is-danger'
                                : ' is-warning'
                          }`}
                        />
                        <div className="analytics-list-content">
                          <span className="analytics-list-title">{step.label}</span>
                          <span className="analytics-list-meta">
                            {formatMoney(step.value)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="analytics-empty">Пока нет данных по доходу.</p>
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
                {funnelSteps.map((step) => (
                  <div key={step.label} className="analytics-funnel-row">
                    <span className="analytics-funnel-label">{step.label}</span>
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
                ))}
              </div>
            </section>

            <section className="pro-detail-actions animate delay-6">
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
