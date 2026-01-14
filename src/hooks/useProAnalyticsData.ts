import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalyticsRangeKey, ProAnalyticsResponse } from '../types/analytics'

type CacheEntry = {
  data: ProAnalyticsResponse
  lastUpdated: number
}

const cache = new Map<string, CacheEntry>()

const buildKey = (apiBase: string, userId: string, range: AnalyticsRangeKey) =>
  `${apiBase.trim()}::${userId.trim()}::${range}`

export const useProAnalyticsData = (
  apiBase: string,
  userId: string,
  range: AnalyticsRangeKey = '30d'
) => {
  const key = buildKey(apiBase, userId, range)
  const cached = cache.get(key)
  const [data, setData] = useState<ProAnalyticsResponse | null>(
    cached?.data ?? null
  )
  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    cached?.lastUpdated ? new Date(cached.lastUpdated) : null
  )
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(!cached)
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  const updateCache = useCallback(
    (payload: CacheEntry) => {
      cache.set(key, payload)
    },
    [key]
  )

  const loadAnalytics = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!userId || !apiBase) return
      const silent = options?.silent ?? false
      const requestId = (requestIdRef.current += 1)
      if (!silent) {
        setIsLoading(true)
        setError('')
      }
      if (abortRef.current) {
        abortRef.current.abort()
      }
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const tzOffset = new Date().getTimezoneOffset()
        const response = await fetch(
          `${apiBase}/api/pro/analytics?userId=${encodeURIComponent(
            userId
          )}&range=${encodeURIComponent(range)}&tzOffset=${encodeURIComponent(tzOffset)}`,
          { signal: controller.signal }
        )
        if (!response.ok) {
          throw new Error('Load analytics failed')
        }
        const payload = (await response.json().catch(() => null)) as
          | ProAnalyticsResponse
          | null
        if (
          controller.signal.aborted ||
          requestIdRef.current !== requestId ||
          !payload
        ) {
          return
        }
        setData(payload)
        setError('')
        const updated = Date.now()
        setLastUpdated(new Date(updated))
        updateCache({ data: payload, lastUpdated: updated })
      } catch (error) {
        if (controller.signal.aborted) return
        setError('Не удалось загрузить аналитику.')
      } finally {
        if (requestIdRef.current === requestId) {
          if (!silent) {
            setIsLoading(false)
          }
          if (abortRef.current === controller) {
            abortRef.current = null
          }
        }
      }
    },
    [apiBase, range, updateCache, userId]
  )

  useEffect(() => {
    loadAnalytics()
    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [loadAnalytics])

  return {
    data,
    lastUpdated,
    isLoading,
    error,
    reload: loadAnalytics,
  }
}
