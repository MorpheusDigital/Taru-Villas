const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function parseIsoDate(value: string): Date {
  if (!ISO_DATE.test(value)) throw new Error(`invalid ISO date: ${value}`)

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`invalid ISO date: ${value}`)
  }

  return date
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + amount)
  return next
}

function assertMonthStart(month: string): Date {
  const date = parseIsoDate(month)
  if (date.getUTCDate() !== 1) {
    throw new Error('month must be the first calendar date')
  }
  return date
}

function assertWeekStartsOn(value: number): asserts value is 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    throw new Error('weekStartsOn must be an integer from 0 to 6')
  }
}

export function datesInMonth(month: string): string[] {
  const first = assertMonthStart(month)
  const monthIndex = first.getUTCMonth()
  const dates: string[] = []

  for (let date = first; date.getUTCMonth() === monthIndex; date = addUtcDays(date, 1)) {
    dates.push(formatIsoDate(date))
  }

  return dates
}

export function workWeekKey(dateValue: string, weekStartsOn: number): string {
  assertWeekStartsOn(weekStartsOn)
  const date = parseIsoDate(dateValue)
  const daysSinceWeekStart = (date.getUTCDay() - weekStartsOn + 7) % 7
  return formatIsoDate(addUtcDays(date, -daysSinceWeekStart))
}

export function previousBoundaryDates(
  month: string,
  weekStartsOn: number,
): string[] {
  const first = assertMonthStart(month)
  const weekStart = parseIsoDate(workWeekKey(month, weekStartsOn))
  const dates: string[] = []

  for (let date = weekStart; date < first; date = addUtcDays(date, 1)) {
    dates.push(formatIsoDate(date))
  }

  return dates
}
