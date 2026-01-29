const PERF_STORAGE_KEY = 'kiven:perf'

type PerfMeasure = {
  name: string
  duration: number
}

const canUsePerformance = () =>
  typeof performance !== 'undefined' &&
  typeof performance.mark === 'function' &&
  typeof performance.measure === 'function'

const isPerfEnabled = () => {
  if (import.meta.env.DEV) return true
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(PERF_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const safeMark = (name: string) => {
  if (!isPerfEnabled() || !canUsePerformance()) return
  try {
    performance.mark(name)
  } catch {
    // ignore mark failures
  }
}

const safeMeasure = (name: string, start: string, end: string): PerfMeasure | null => {
  if (!isPerfEnabled() || !canUsePerformance()) return null
  try {
    performance.measure(name, start, end)
    const entries = performance.getEntriesByName(name)
    const entry = entries[entries.length - 1]
    if (!entry) return null
    return { name: entry.name, duration: entry.duration }
  } catch {
    return null
  } finally {
    try {
      performance.clearMarks(start)
      performance.clearMarks(end)
      performance.clearMeasures(name)
    } catch {
      // ignore cleanup failures
    }
  }
}

const logPerf = (label: string, payload?: Record<string, unknown>) => {
  if (!isPerfEnabled()) return
  if (payload) {
    console.info(`[perf] ${label}`, payload)
  } else {
    console.info(`[perf] ${label}`)
  }
}

const buildNavMark = (phase: 'start' | 'end', view: string, id: number) =>
  `nav:${phase}:${view}:${id}`

const buildNavMeasure = (view: string, id: number) => `nav:${view}:${id}`

export const markNavStart = (view: string, id: number) => {
  safeMark(buildNavMark('start', view, id))
}

export const markNavEnd = (
  view: string,
  id: number,
  context?: Record<string, unknown>
) => {
  const start = buildNavMark('start', view, id)
  const end = buildNavMark('end', view, id)
  safeMark(end)
  const result = safeMeasure(buildNavMeasure(view, id), start, end)
  if (result) {
    logPerf(`${view} → ${Math.round(result.duration)}ms`, context)
  }
}

export const markScreenMount = (view: string) => {
  safeMark(`screen:mount:${view}:${Date.now()}`)
  logPerf(`screen mount ${view}`)
}

export const markScreenPaint = (view: string) => {
  safeMark(`screen:paint:${view}:${Date.now()}`)
  logPerf(`screen paint ${view}`)
}
