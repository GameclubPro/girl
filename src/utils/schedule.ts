const scheduleDayAliases: Record<string, string> = {
  mon: 'mon',
  monday: 'mon',
  'mon.': 'mon',
  пн: 'mon',
  понедельник: 'mon',
  tue: 'tue',
  tues: 'tue',
  tuesday: 'tue',
  'tue.': 'tue',
  вт: 'tue',
  вторник: 'tue',
  wed: 'wed',
  wednesday: 'wed',
  'wed.': 'wed',
  ср: 'wed',
  среда: 'wed',
  thu: 'thu',
  thur: 'thu',
  thurs: 'thu',
  thursday: 'thu',
  'thu.': 'thu',
  чт: 'thu',
  четверг: 'thu',
  fri: 'fri',
  friday: 'fri',
  'fri.': 'fri',
  пт: 'fri',
  пятница: 'fri',
  sat: 'sat',
  saturday: 'sat',
  'sat.': 'sat',
  сб: 'sat',
  суббота: 'sat',
  sun: 'sun',
  sunday: 'sun',
  'sun.': 'sun',
  вс: 'sun',
  воскресенье: 'sun',
  '1': 'mon',
  '2': 'tue',
  '3': 'wed',
  '4': 'thu',
  '5': 'fri',
  '6': 'sat',
  '7': 'sun',
  '0': 'sun',
}

const scheduleDayKeys = new Set([
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
])

export const normalizeScheduleDay = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return scheduleDayAliases[normalized] ?? normalized
}

export const normalizeScheduleDays = (values: string[]) => {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const result: string[] = []
  values.forEach((value) => {
    if (typeof value !== 'string') return
    const normalized = normalizeScheduleDay(value)
    if (!scheduleDayKeys.has(normalized) || seen.has(normalized)) return
    seen.add(normalized)
    result.push(normalized)
  })
  return result
}

export const parseScheduleTimeToMinutes = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!normalized) return null
  const compact = normalized.replace(/\s+/g, '')
  let hours: number | null = null
  let minutes: number | null = null

  const match = compact.match(/(\d{1,2})[:.,-](\d{1,2})/)
  if (match) {
    hours = Number(match[1])
    minutes = Number(match[2])
  } else if (/^\d{1,2}$/.test(compact)) {
    hours = Number(compact)
    minutes = 0
  } else if (/^\d{3,4}$/.test(compact)) {
    const hoursRaw = compact.slice(0, -2)
    const minutesRaw = compact.slice(-2)
    hours = Number(hoursRaw)
    minutes = Number(minutesRaw)
  }

  if (hours === null || minutes === null) return null
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

export const parseScheduleRange = (value?: string | null) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) return null
  const parts = normalized.split(/[-–—]+/)
  if (parts.length < 2) return null
  const start = parseScheduleTimeToMinutes(parts[0] ?? '')
  const end = parseScheduleTimeToMinutes(parts[1] ?? '')
  if (start === null || end === null) return null
  return { start, end }
}
