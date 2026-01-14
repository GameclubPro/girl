import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Booking, ServiceRequest } from '../types/app'

type RequestStats = {
  total: number
  open: number
  closed: number
  responses: number
}

export type ClientSummary = {
  id: string
  name: string
  count: number
  lastSeenTime: number | null
}

export type BookingStats = {
  total: number
  confirmed: number
  pending: number
  cancelled: number
  upcoming: number
  upcomingWeek: number
  nextBookingTime: number | null
  lastCreatedTime: number | null
  uniqueClients: number
  repeatClients: number
  recentClients: string[]
  clientSummaries: ClientSummary[]
}

type CacheEntry = {
  requests: ServiceRequest[]
  bookings: Booking[]
  lastUpdated: number | null
}

const cache = new Map<string, CacheEntry>()

const buildKey = (apiBase: string, userId: string) =>
  `${apiBase.trim()}::${userId.trim()}`

const toTimeMs = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.getTime()
}

const getRequestStats = (requests: ServiceRequest[]): RequestStats => {
  const total = requests.length
  const open = requests.filter((request) => request.status === 'open').length
  const responses = requests.reduce(
    (sum, request) => sum + (request.responsesCount ?? 0),
    0
  )
  return {
    total,
    open,
    closed: total - open,
    responses,
  }
}

const getBookingStats = (bookings: Booking[]): BookingStats => {
  const now = Date.now()
  const weekEnd = now + 7 * 24 * 60 * 60 * 1000
  const clients = new Map<string, ClientSummary>()
  let confirmed = 0
  let pending = 0
  let cancelled = 0
  let upcoming = 0
  let upcomingWeek = 0
  let nextBookingTime: number | null = null
  let lastCreatedTime: number | null = null

  bookings.forEach((booking) => {
    if (booking.status === 'confirmed') {
      confirmed += 1
    }
    if (['pending', 'price_pending', 'price_proposed'].includes(booking.status)) {
      pending += 1
    }
    if (['declined', 'cancelled'].includes(booking.status)) {
      cancelled += 1
    }

    const scheduledMs = toTimeMs(booking.scheduledAt)
    if (scheduledMs !== null) {
      if (
        scheduledMs >= now &&
        !['declined', 'cancelled'].includes(booking.status)
      ) {
        upcoming += 1
        if (scheduledMs < weekEnd) {
          upcomingWeek += 1
        }
        if (nextBookingTime === null || scheduledMs < nextBookingTime) {
          nextBookingTime = scheduledMs
        }
      }
    }

    const createdMs = toTimeMs(booking.createdAt)
    if (createdMs !== null) {
      if (lastCreatedTime === null || createdMs > lastCreatedTime) {
        lastCreatedTime = createdMs
      }
    }

    const clientId = booking.clientId ? String(booking.clientId) : null
    if (!clientId) return
    const clientName = booking.clientName?.trim() || 'Клиент'
    const existing = clients.get(clientId)
    const nextLastSeen =
      createdMs !== null && (!existing?.lastSeenTime || createdMs > existing.lastSeenTime)
        ? createdMs
        : existing?.lastSeenTime ?? null
    clients.set(clientId, {
      id: clientId,
      name: clientName,
      count: (existing?.count ?? 0) + 1,
      lastSeenTime: nextLastSeen,
    })
  })

  const clientSummaries = Array.from(clients.values()).sort((a, b) => {
    const timeDiff = (b.lastSeenTime ?? 0) - (a.lastSeenTime ?? 0)
    if (timeDiff !== 0) return timeDiff
    return b.count - a.count
  })
  const repeatClients = clientSummaries.filter((client) => client.count > 1).length
  const recentClients = clientSummaries.slice(0, 3).map((client) => client.name)

  return {
    total: bookings.length,
    confirmed,
    pending,
    cancelled,
    upcoming,
    upcomingWeek,
    nextBookingTime,
    lastCreatedTime,
    uniqueClients: clientSummaries.length,
    repeatClients,
    recentClients,
    clientSummaries,
  }
}

export const useProCabinetData = (apiBase: string, userId: string) => {
  const key = buildKey(apiBase, userId)
  const cached = cache.get(key)
  const [requests, setRequests] = useState<ServiceRequest[]>(
    cached?.requests ?? []
  )
  const [bookings, setBookings] = useState<Booking[]>(
    cached?.bookings ?? []
  )
  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    cached?.lastUpdated ? new Date(cached.lastUpdated) : null
  )
  const [requestsError, setRequestsError] = useState('')
  const [bookingsError, setBookingsError] = useState('')
  const [isRequestsLoading, setIsRequestsLoading] = useState(!cached)
  const [isBookingsLoading, setIsBookingsLoading] = useState(!cached)
  const requestsAbortRef = useRef<AbortController | null>(null)
  const bookingsAbortRef = useRef<AbortController | null>(null)
  const requestsRequestIdRef = useRef(0)
  const bookingsRequestIdRef = useRef(0)

  const updateCache = useCallback(
    (payload: Partial<CacheEntry>) => {
      const prev = cache.get(key) ?? { requests: [], bookings: [], lastUpdated: null }
      const next = { ...prev, ...payload }
      cache.set(key, next)
    },
    [key]
  )

  const loadRequests = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) return
      const silent = options?.silent ?? false
      const requestId = (requestsRequestIdRef.current += 1)
      if (!silent) {
        setIsRequestsLoading(true)
        setRequestsError('')
      }
      if (requestsAbortRef.current) {
        requestsAbortRef.current.abort()
      }
      const controller = new AbortController()
      requestsAbortRef.current = controller

      try {
        const response = await fetch(
          `${apiBase}/api/pro/requests?userId=${encodeURIComponent(userId)}`,
          { signal: controller.signal }
        )
        if (!response.ok) {
          throw new Error('Load requests failed')
        }
        const data = (await response.json().catch(() => null)) as
          | ServiceRequest[]
          | { requests?: ServiceRequest[] }
          | null
        if (
          controller.signal.aborted ||
          requestsRequestIdRef.current !== requestId
        ) {
          return
        }
        const items = Array.isArray(data) ? data : data?.requests ?? []
        setRequests(items)
        setRequestsError('')
        const updated = Date.now()
        setLastUpdated(new Date(updated))
        updateCache({ requests: items, lastUpdated: updated })
      } catch (error) {
        if (controller.signal.aborted) return
        setRequestsError('Не удалось загрузить заявки.')
      } finally {
        if (requestsRequestIdRef.current === requestId) {
          if (!silent) {
            setIsRequestsLoading(false)
          }
          if (requestsAbortRef.current === controller) {
            requestsAbortRef.current = null
          }
        }
      }
    },
    [apiBase, updateCache, userId]
  )

  const loadBookings = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId) return
      const silent = options?.silent ?? false
      const requestId = (bookingsRequestIdRef.current += 1)
      if (!silent) {
        setIsBookingsLoading(true)
        setBookingsError('')
      }
      if (bookingsAbortRef.current) {
        bookingsAbortRef.current.abort()
      }
      const controller = new AbortController()
      bookingsAbortRef.current = controller

      try {
        const response = await fetch(
          `${apiBase}/api/pro/bookings?userId=${encodeURIComponent(userId)}`,
          { signal: controller.signal }
        )
        if (!response.ok) {
          throw new Error('Load bookings failed')
        }
        const data = (await response.json().catch(() => null)) as Booking[] | null
        if (
          controller.signal.aborted ||
          bookingsRequestIdRef.current !== requestId
        ) {
          return
        }
        const items = Array.isArray(data) ? data : []
        setBookings(items)
        setBookingsError('')
        const updated = Date.now()
        setLastUpdated(new Date(updated))
        updateCache({ bookings: items, lastUpdated: updated })
      } catch (error) {
        if (controller.signal.aborted) return
        setBookingsError('Не удалось загрузить записи.')
      } finally {
        if (bookingsRequestIdRef.current === requestId) {
          if (!silent) {
            setIsBookingsLoading(false)
          }
          if (bookingsAbortRef.current === controller) {
            bookingsAbortRef.current = null
          }
        }
      }
    },
    [apiBase, updateCache, userId]
  )

  useEffect(() => {
    if (!userId) return
    const silent = Boolean(cache.get(key))
    void loadRequests({ silent })
    void loadBookings({ silent })

    return () => {
      if (requestsAbortRef.current) {
        requestsAbortRef.current.abort()
        requestsAbortRef.current = null
      }
      if (bookingsAbortRef.current) {
        bookingsAbortRef.current.abort()
        bookingsAbortRef.current = null
      }
    }
  }, [key, loadBookings, loadRequests, userId])

  const requestStats = useMemo(() => getRequestStats(requests), [requests])
  const bookingStats = useMemo(() => getBookingStats(bookings), [bookings])
  const isLoading = isRequestsLoading || isBookingsLoading
  const combinedError = requestsError || bookingsError

  const refresh = useCallback(() => {
    void loadRequests()
    void loadBookings()
  }, [loadBookings, loadRequests])

  return {
    requests,
    bookings,
    requestStats,
    bookingStats,
    lastUpdated,
    isLoading,
    combinedError,
    requestsError,
    bookingsError,
    refresh,
  }
}
