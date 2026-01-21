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
