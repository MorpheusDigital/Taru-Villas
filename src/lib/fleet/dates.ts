const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Add days to a YYYY-MM-DD string. UTC-based, so no timezone drift. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Inclusive overlap test on YYYY-MM-DD strings (lexicographic compare is safe). */
export function windowsOverlap(
  aStart: string, aEnd: string, bStart: string, bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

/** "12 Aug" — built from string parts so it cannot shift by locale or timezone. */
export function formatDayMonth(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${parseInt(day, 10)} ${MONTHS[parseInt(month, 10) - 1]}`
}

/** Today's date in Asia/Colombo (UTC+5:30, no DST) as YYYY-MM-DD. */
export function colomboToday(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}

/**
 * "14:05" — pinned to Asia/Colombo and an explicit locale (24-hour, so no
 * AM/PM word ever needs translating), for the same reason `formatDayMonth`
 * is built from string parts: a client component is still server-rendered,
 * and a bare `toLocaleTimeString()` resolves against whatever
 * timezone/locale the *rendering* device has — UTC on the server, Asia/
 * Colombo on the driver's phone — which produces two different strings for
 * the same `Date` and a React hydration mismatch. Pinning both here is what
 * makes the output deterministic regardless of where it renders.
 */
export function formatColomboTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
