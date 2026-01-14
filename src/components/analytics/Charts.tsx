type LineSeries = {
  id: string
  label: string
  values: number[]
  color: string
  area?: boolean
  dash?: string
  opacity?: number
}

type LineChartProps = {
  labels: string[]
  series: LineSeries[]
  height?: number
  activeIndex?: number | null
}

const buildLinePath = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
}

const buildAreaPath = (
  points: Array<{ x: number; y: number }>,
  baseline: number
) => {
  if (points.length === 0) return ''
  const head = `M${points[0].x},${points[0].y}`
  const body = points.slice(1).map((point) => `L${point.x},${point.y}`).join(' ')
  const tail = `L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`
  return `${head} ${body} ${tail}`
}

export const LineChart = ({
  labels,
  series,
  height = 160,
  activeIndex = null,
}: LineChartProps) => {
  const width = 320
  const paddingX = 14
  const paddingY = 16
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingY * 2
  const values = series.flatMap((item) => item.values)
  const maxValue = Math.max(1, ...values)
  const minValue = Math.min(0, ...values)
  const range = maxValue - minValue || 1
  const pointCount = Math.max(
    labels.length,
    ...series.map((item) => item.values.length),
    0
  )
  const step = pointCount > 1 ? chartWidth / (pointCount - 1) : 0
  const safeActiveIndex =
    typeof activeIndex === 'number' && activeIndex >= 0 && pointCount > 0
      ? Math.min(activeIndex, pointCount - 1)
      : null
  const activeX =
    safeActiveIndex !== null ? paddingX + step * safeActiveIndex : null

  return (
    <svg
      className="analytics-chart analytics-chart--line"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Line chart"
    >
      <g className="chart-grid">
        {[0, 0.5, 1].map((tick) => {
          const y = paddingY + chartHeight * tick
          return <line key={tick} x1={paddingX} x2={width - paddingX} y1={y} y2={y} />
        })}
      </g>
      {activeX !== null ? (
        <line
          className="chart-highlight-line"
          x1={activeX}
          x2={activeX}
          y1={paddingY}
          y2={paddingY + chartHeight}
        />
      ) : null}
      {series.map((item) => {
        const points = item.values.map((value, index) => {
          const x = paddingX + step * index
          const y =
            paddingY + chartHeight - ((value - minValue) / range) * chartHeight
          return { x, y }
        })
        const linePath = buildLinePath(points)
        const areaPath = item.area ? buildAreaPath(points, paddingY + chartHeight) : ''
        const dotIndex =
          safeActiveIndex !== null ? Math.min(safeActiveIndex, points.length - 1) : points.length - 1
        const dotPoint = points[dotIndex]
        return (
          <g key={item.id} className="chart-series">
            {item.area && (
              <path
                className="chart-area"
                d={areaPath}
                style={{ color: item.color, opacity: item.opacity ?? 1 }}
              />
            )}
            <path
              className="chart-line"
              d={linePath}
              style={{ color: item.color, opacity: item.opacity ?? 1 }}
              strokeDasharray={item.dash}
            />
            {dotPoint ? (
              <circle
                className="chart-dot"
                cx={dotPoint.x}
                cy={dotPoint.y}
                r={4.5}
                style={{ color: item.color }}
              />
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

type BarChartDatum = {
  label: string
  value: number
}

type BarChartProps = {
  data: BarChartDatum[]
  height?: number
}

export const BarChart = ({ data, height = 160 }: BarChartProps) => {
  const width = 320
  const paddingX = 12
  const paddingY = 18
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingY * 2
  const maxValue = Math.max(1, ...data.map((item) => item.value))
  const barSlot = data.length ? chartWidth / data.length : chartWidth
  const gap = Math.min(10, barSlot * 0.2)
  const barWidth = Math.max(6, barSlot - gap)

  return (
    <svg
      className="analytics-chart analytics-chart--bar"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Bar chart"
    >
      <g className="chart-grid">
        {[0, 0.5, 1].map((tick) => {
          const y = paddingY + chartHeight * tick
          return <line key={tick} x1={paddingX} x2={width - paddingX} y1={y} y2={y} />
        })}
      </g>
      {data.map((item, index) => {
        const value = item.value
        const heightValue = (value / maxValue) * chartHeight
        const x = paddingX + index * barSlot + gap / 2
        const y = paddingY + chartHeight - heightValue
        return (
          <g key={item.label} className="chart-bar-group">
            <rect
              className="chart-bar"
              x={x}
              y={y}
              width={barWidth}
              height={heightValue}
              rx={8}
            />
          </g>
        )
      })}
    </svg>
  )
}

type DonutChartDatum = {
  label: string
  value: number
  color: string
}

type DonutChartProps = {
  data: DonutChartDatum[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
}

export const DonutChart = ({
  data,
  size = 160,
  thickness = 20,
  centerLabel,
  centerValue,
}: DonutChartProps) => {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const total = data.reduce((sum, item) => sum + item.value, 0)
  let offset = 0

  return (
    <svg
      className="analytics-chart analytics-chart--donut"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Donut chart"
    >
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          className="chart-donut-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={thickness}
          fill="none"
        />
        {data.map((item) => {
          const slice = total ? (item.value / total) * circumference : 0
          const strokeDasharray = `${slice} ${circumference - slice}`
          const strokeDashoffset = -offset
          offset += slice
          return (
            <circle
              key={item.label}
              className="chart-donut-segment"
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={thickness}
              fill="none"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              style={{ color: item.color }}
            />
          )
        })}
      </g>
      {centerLabel ? (
        <text x="50%" y="46%" textAnchor="middle" className="chart-donut-label">
          {centerLabel}
        </text>
      ) : null}
      {centerValue ? (
        <text x="50%" y="58%" textAnchor="middle" className="chart-donut-value">
          {centerValue}
        </text>
      ) : null}
    </svg>
  )
}

type BubbleDatum = {
  label: string
  x: number
  y: number
  size: number
}

type BubbleChartProps = {
  data: BubbleDatum[]
  height?: number
}

export const BubbleChart = ({ data, height = 170 }: BubbleChartProps) => {
  const width = 320
  const paddingX = 20
  const paddingY = 20
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingY * 2
  const xValues = data.map((item) => item.x)
  const yValues = data.map((item) => item.y)
  const sizeValues = data.map((item) => item.size)
  const minX = Math.min(...xValues, 0)
  const maxX = Math.max(...xValues, 1)
  const minY = Math.min(...yValues, 0)
  const maxY = Math.max(...yValues, 1)
  const maxSize = Math.max(...sizeValues, 1)
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1

  return (
    <svg
      className="analytics-chart analytics-chart--bubble"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Bubble chart"
    >
      <g className="chart-grid">
        {[0, 0.5, 1].map((tick) => {
          const y = paddingY + chartHeight * tick
          return <line key={tick} x1={paddingX} x2={width - paddingX} y1={y} y2={y} />
        })}
      </g>
      {data.map((item) => {
        const x =
          paddingX + ((item.x - minX) / rangeX) * chartWidth
        const y =
          paddingY + chartHeight - ((item.y - minY) / rangeY) * chartHeight
        const radius = 8 + (item.size / maxSize) * 18
        return (
          <g key={item.label} className="chart-bubble">
            <circle cx={x} cy={y} r={radius} />
            <title>{item.label}</title>
          </g>
        )
      })}
    </svg>
  )
}

type WaterfallStep = {
  label: string
  value: number
  isTotal?: boolean
}

type WaterfallChartProps = {
  data: WaterfallStep[]
  height?: number
}

export const WaterfallChart = ({ data, height = 170 }: WaterfallChartProps) => {
  const width = 320
  const paddingX = 16
  const paddingY = 20
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingY * 2
  const steps: Array<{
    label: string
    start: number
    end: number
    value: number
    isTotal?: boolean
  }> = []
  let cumulative = 0

  data.forEach((step) => {
    if (step.isTotal) {
      steps.push({
        label: step.label,
        start: 0,
        end: step.value,
        value: step.value,
        isTotal: true,
      })
      cumulative = step.value
      return
    }
    const start = cumulative
    const end = cumulative + step.value
    steps.push({ label: step.label, start, end, value: step.value })
    cumulative = end
  })

  const extremes = steps.flatMap((item) => [item.start, item.end, 0])
  const minValue = Math.min(...extremes, 0)
  const maxValue = Math.max(...extremes, 1)
  const range = maxValue - minValue || 1
  const slot = steps.length ? chartWidth / steps.length : chartWidth
  const gap = Math.min(10, slot * 0.2)
  const barWidth = Math.max(8, slot - gap)

  const scaleY = (value: number) =>
    paddingY + chartHeight - ((value - minValue) / range) * chartHeight
  const zeroY = scaleY(0)

  return (
    <svg
      className="analytics-chart analytics-chart--waterfall"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Waterfall chart"
    >
      <g className="chart-grid">
        <line x1={paddingX} x2={width - paddingX} y1={zeroY} y2={zeroY} />
      </g>
      {steps.map((step, index) => {
        const y1 = scaleY(step.start)
        const y2 = scaleY(step.end)
        const barHeight = Math.abs(y2 - y1)
        const y = Math.min(y1, y2)
        const x = paddingX + index * slot + gap / 2
        return (
          <g key={step.label} className="chart-waterfall-group">
            <rect
              className={`chart-waterfall-bar${
                step.isTotal ? ' is-total' : step.value < 0 ? ' is-negative' : ''
              }`}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={8}
            />
          </g>
        )
      })}
    </svg>
  )
}
