export type AnalyticsRange = {
  start: string
  end: string
  days: number
}

export type AnalyticsSummary = {
  revenue: {
    confirmed: number
    projected: number
    lost: number
    avgCheck: number
  }
  bookings: {
    total: number
    confirmed: number
    pending: number
    cancelled: number
  }
  requests: {
    total: number
    responded: number
    accepted: number
  }
  followers: {
    total: number
    new: number
  }
  reviews: {
    count: number
    average: number
  }
}

export type AnalyticsTimePoint = {
  date: string
  revenue: number
  bookings: number
  requests: number
  responses: number
  followers: number
  reviews: number
}

export type AnalyticsCategory = {
  id: string
  count: number
  revenue: number
}

export type AnalyticsStatus = {
  status: string
  count: number
}

export type AnalyticsFunnel = {
  requests: number
  responses: number
  chats: number
  bookings: number
  confirmed: number
}

export type AnalyticsClient = {
  id: string
  name: string
  visits: number
  revenue: number
  lastSeenAt: string | null
}

export type AnalyticsWaterfallStep = {
  label: string
  value: number
  isTotal?: boolean
}

export type AnalyticsCompare = {
  range: AnalyticsRange
  summary: AnalyticsSummary
  timeseries: AnalyticsTimePoint[]
}

export type ProAnalyticsResponse = {
  range: AnalyticsRange
  summary: AnalyticsSummary
  timeseries: AnalyticsTimePoint[]
  categories: AnalyticsCategory[]
  statuses: AnalyticsStatus[]
  funnel: AnalyticsFunnel
  clients: AnalyticsClient[]
  waterfall: AnalyticsWaterfallStep[]
  compare?: AnalyticsCompare
}

export type AnalyticsRangeKey = '7d' | '30d' | '90d' | '365d'
