const unavailableCityNames = [
  'Москва',
  'Санкт-Петербург',
  'Казань',
  'Новосибирск',
  'Екатеринбург',
] as const

const normalizeCityName = (name: string) => name.trim().toLowerCase()

export const isCityAvailable = (name: string) => {
  const normalized = normalizeCityName(name)
  if (!normalized) return false
  return !unavailableCityNames.some(
    (item) => normalizeCityName(item) === normalized
  )
}

export const unavailableCities = [...unavailableCityNames]
