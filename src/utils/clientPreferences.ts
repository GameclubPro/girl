export type ClientPreferences = {
  defaultCategoryId?: string
  defaultLocationType?: 'master' | 'client' | 'any'
  defaultDateOption?: 'today' | 'tomorrow' | 'choose'
  defaultBudget?: string
  lastRequestServiceByCategory?: Record<string, string>
  lastBookingServiceByCategory?: Record<string, string>
  lastBookingServiceByMaster?: Record<string, string>
  lastBookingLocationType?: 'master' | 'client'
  lastBookingNote?: string
}

const PREFS_KEY = 'kiven-client-preferences'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizePreferences = (value: unknown): ClientPreferences => {
  if (!isRecord(value)) return {}
  const prefs: ClientPreferences = {}

  if (typeof value.defaultCategoryId === 'string') {
    prefs.defaultCategoryId = value.defaultCategoryId
  }
  if (
    value.defaultLocationType === 'master' ||
    value.defaultLocationType === 'client' ||
    value.defaultLocationType === 'any'
  ) {
    prefs.defaultLocationType = value.defaultLocationType
  }
  if (
    value.defaultDateOption === 'today' ||
    value.defaultDateOption === 'tomorrow' ||
    value.defaultDateOption === 'choose'
  ) {
    prefs.defaultDateOption = value.defaultDateOption
  }
  if (typeof value.defaultBudget === 'string') {
    prefs.defaultBudget = value.defaultBudget
  }
  if (isRecord(value.lastRequestServiceByCategory)) {
    prefs.lastRequestServiceByCategory = Object.fromEntries(
      Object.entries(value.lastRequestServiceByCategory).filter(
        ([, val]) => typeof val === 'string' && val.trim()
      )
    )
  }
  if (isRecord(value.lastBookingServiceByCategory)) {
    prefs.lastBookingServiceByCategory = Object.fromEntries(
      Object.entries(value.lastBookingServiceByCategory).filter(
        ([, val]) => typeof val === 'string' && val.trim()
      )
    )
  }
  if (isRecord(value.lastBookingServiceByMaster)) {
    prefs.lastBookingServiceByMaster = Object.fromEntries(
      Object.entries(value.lastBookingServiceByMaster).filter(
        ([, val]) => typeof val === 'string' && val.trim()
      )
    )
  }
  if (value.lastBookingLocationType === 'master' || value.lastBookingLocationType === 'client') {
    prefs.lastBookingLocationType = value.lastBookingLocationType
  }
  if (typeof value.lastBookingNote === 'string') {
    prefs.lastBookingNote = value.lastBookingNote
  }

  return prefs
}

export const loadClientPreferences = (): ClientPreferences => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return {}
    return normalizePreferences(JSON.parse(raw) as unknown)
  } catch (error) {
    return {}
  }
}

export const saveClientPreferences = (preferences: ClientPreferences) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(preferences))
  } catch (error) {
    // ignore storage errors
  }
}

export const updateClientPreferences = (
  updater: (current: ClientPreferences) => ClientPreferences
) => {
  const current = loadClientPreferences()
  const next = updater(current)
  saveClientPreferences(next)
  return next
}
