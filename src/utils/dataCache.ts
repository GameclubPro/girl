type CacheEntry<T> = {
  value: T
  updatedAt: number
}

type CacheRead<T> = {
  value: T
  updatedAt: number
  isFresh: boolean
}

type CacheOptions = {
  ttlMs?: number
  persist?: boolean
}

const DEFAULT_TTL_MS = 90 * 1000
const STORAGE_PREFIX = 'kiven:data-cache'
const memoryCache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

const normalizeKey = (key: string) => encodeURIComponent(key.trim().toLowerCase())

const buildStorageKey = (key: string) => `${STORAGE_PREFIX}:${normalizeKey(key)}`

const isFresh = (entry: CacheEntry<unknown>, ttlMs: number) =>
  Date.now() - entry.updatedAt < ttlMs

const readStorage = <T>(key: string): CacheEntry<T> | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (!parsed || typeof parsed.updatedAt !== 'number') return null
    return parsed
  } catch (error) {
    console.warn('Cache read failed:', error)
    return null
  }
}

const writeStorage = <T>(key: string, entry: CacheEntry<T>) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(entry))
  } catch (error) {
    console.warn('Cache write failed:', error)
  }
}

const clearStorage = (key: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch (error) {
    console.warn('Cache clear failed:', error)
  }
}

export const readCache = <T>(key: string, options?: CacheOptions): CacheRead<T> | null => {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS
  const entry = memoryCache.get(key) as CacheEntry<T> | undefined
  if (entry) {
    return { value: entry.value, updatedAt: entry.updatedAt, isFresh: isFresh(entry, ttlMs) }
  }
  if (options?.persist) {
    const storageKey = buildStorageKey(key)
    const stored = readStorage<T>(storageKey)
    if (stored) {
      memoryCache.set(key, stored)
      return {
        value: stored.value,
        updatedAt: stored.updatedAt,
        isFresh: isFresh(stored, ttlMs),
      }
    }
    clearStorage(storageKey)
  }
  return null
}

export const writeCache = <T>(key: string, value: T, options?: CacheOptions) => {
  const entry = { value, updatedAt: Date.now() }
  memoryCache.set(key, entry)
  if (options?.persist) {
    writeStorage(buildStorageKey(key), entry)
  }
}

export const fetchJsonCached = async <T>(
  url: string,
  options?: CacheOptions & { cacheKey?: string; signal?: AbortSignal }
) => {
  const cacheKey = options?.cacheKey ?? url
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS
  const cached = readCache<T>(cacheKey, { ttlMs, persist: options?.persist })
  if (cached?.isFresh) {
    return { data: cached.value, fromCache: true }
  }
  const inflightPromise = inflight.get(cacheKey) as Promise<T> | undefined
  if (inflightPromise) {
    const data = await inflightPromise
    return { data, fromCache: false }
  }
  const promise = fetch(url, { signal: options?.signal })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status}`)
      }
      return response.json() as Promise<T>
    })
    .then((data) => {
      writeCache(cacheKey, data, { persist: options?.persist })
      return data
    })
    .finally(() => {
      inflight.delete(cacheKey)
    })
  inflight.set(cacheKey, promise)
  const data = await promise
  return { data, fromCache: false }
}

export const prefetchJson = async <T>(
  url: string,
  options?: CacheOptions & { cacheKey?: string }
) => {
  const cacheKey = options?.cacheKey ?? url
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS
  const cached = readCache<T>(cacheKey, { ttlMs, persist: options?.persist })
  if (cached?.isFresh) {
    return cached.value
  }
  try {
    const result = await fetchJsonCached<T>(url, {
      cacheKey,
      ttlMs,
      persist: options?.persist,
    })
    return result.data
  } catch {
    return null
  }
}

export const resetDataCache = () => {
  memoryCache.clear()
  inflight.clear()
  if (typeof window === 'undefined') return
  try {
    const prefix = `${STORAGE_PREFIX}:`
    const keysToRemove: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key)
    })
  } catch (error) {
    console.warn('Cache reset failed:', error)
  }
}
