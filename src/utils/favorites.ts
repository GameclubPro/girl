export type FavoriteMaster = {
  masterId: string
  displayName: string
  avatarUrl?: string | null
  categories?: string[]
  cityName?: string | null
  districtName?: string | null
  reviewsAverage?: number | null
  reviewsCount?: number | null
  priceFrom?: number | null
  priceTo?: number | null
  updatedAt?: string | null
  savedAt: string
}

const FAVORITES_KEY = 'kiven-client-favorites'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeFavorite = (value: unknown): FavoriteMaster | null => {
  if (!isRecord(value)) return null
  const masterId = typeof value.masterId === 'string' ? value.masterId.trim() : ''
  if (!masterId) return null
  const displayName =
    typeof value.displayName === 'string' && value.displayName.trim()
      ? value.displayName.trim()
      : 'Мастер'
  const savedAtRaw = typeof value.savedAt === 'string' ? value.savedAt : ''
  const savedAt = savedAtRaw && !Number.isNaN(new Date(savedAtRaw).getTime())
    ? savedAtRaw
    : new Date().toISOString()
  return {
    masterId,
    displayName,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
    categories: Array.isArray(value.categories)
      ? value.categories.filter((item): item is string => typeof item === 'string')
      : [],
    cityName: typeof value.cityName === 'string' ? value.cityName : null,
    districtName: typeof value.districtName === 'string' ? value.districtName : null,
    reviewsAverage:
      typeof value.reviewsAverage === 'number' ? value.reviewsAverage : null,
    reviewsCount:
      typeof value.reviewsCount === 'number' ? value.reviewsCount : null,
    priceFrom: typeof value.priceFrom === 'number' ? value.priceFrom : null,
    priceTo: typeof value.priceTo === 'number' ? value.priceTo : null,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    savedAt,
  }
}

export const loadFavorites = (): FavoriteMaster[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => normalizeFavorite(item))
      .filter((item): item is FavoriteMaster => Boolean(item))
      .sort(
        (a, b) =>
          new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
      )
  } catch (error) {
    return []
  }
}

export const saveFavorites = (favorites: FavoriteMaster[]) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
  } catch (error) {
    // ignore storage errors
  }
}

export const isFavorite = (favorites: FavoriteMaster[], masterId: string) =>
  favorites.some((favorite) => favorite.masterId === masterId)

export const upsertFavorite = (
  favorites: FavoriteMaster[],
  favorite: FavoriteMaster
) => {
  const next = favorites.filter((item) => item.masterId !== favorite.masterId)
  return [favorite, ...next]
}

export const toggleFavorite = (
  favorites: FavoriteMaster[],
  favorite: Omit<FavoriteMaster, 'savedAt'>
) => {
  if (favorites.some((item) => item.masterId === favorite.masterId)) {
    return favorites.filter((item) => item.masterId !== favorite.masterId)
  }
  const savedAt = new Date().toISOString()
  return [{ ...favorite, savedAt }, ...favorites]
}
