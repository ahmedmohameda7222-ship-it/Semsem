const dayMs = 86400000
const parts = (iso: string) => iso.split('-').map(Number)
const utc = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day)
const monthDays = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate()
const todayParts = (today: Date) =>
  [today.getFullYear(), today.getMonth() + 1, today.getDate()] as const
const clampDay = (year: number, month: number, day: number) =>
  Math.min(day, monthDays(year, month))

export function daysUntil(iso: string, annual: boolean, today = new Date()) {
  const [originalYear, month, day] = parts(iso)
  const [year, currentMonth, currentDay] = todayParts(today)
  const start = utc(year, currentMonth, currentDay)
  const original = utc(originalYear, month, day)
  if (original >= start || !annual) return (original - start) / dayMs
  const candidate = utc(year, month, clampDay(year, month, day))
  const next =
    candidate < start
      ? utc(year + 1, month, clampDay(year + 1, month, day))
      : candidate
  return (next - start) / dayMs
}

export function timeSince(iso: string, today = new Date()) {
  const [originalYear, month, day] = parts(iso)
  const [year, currentMonth, currentDay] = todayParts(today)
  const end = utc(year, currentMonth, currentDay)
  let months = (year - originalYear) * 12 + currentMonth - month
  function anchor(offset: number) {
    const absolute = originalYear * 12 + month - 1 + offset
    const y = Math.floor(absolute / 12)
    const m = (absolute % 12) + 1
    return utc(y, m, clampDay(y, m, day))
  }
  if (anchor(months) > end) months--
  if (months < 0) return null
  const years = Math.floor(months / 12)
  const remainder = months % 12
  const days = (end - anchor(months)) / dayMs
  return [
    years && years + (years === 1 ? ' yr' : ' yrs'),
    remainder && remainder + ' mo',
    days + (days === 1 ? ' day' : ' days'),
  ]
    .filter(Boolean)
    .slice(0, 2)
    .join(', ')
}

export function prettyDate(value: string, short = false) {
  return new Intl.DateTimeFormat('en-GB', {
    day: short ? '2-digit' : 'numeric',
    month: short ? 'short' : 'long',
    year: 'numeric',
  }).format(new Date(value + 'T12:00:00'))
}

export function celebrationOn(date: Date) {
  const [, month, day] = todayParts(date)
  if (month === 12 && day === 5) return 'anniversary'
  if (month === 2 && day === 26) return 'kisses'
  return null
}
