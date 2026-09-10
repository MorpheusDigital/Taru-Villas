/** Display-only forward fill. Counts and underlying score calculations are untouched. */
export function forwardFillScores<T extends Record<string, unknown>>(rows: T[], keys: readonly string[]) {
  const previous = new Map<string, {value: number; date: string}>()
  return rows.map(row => {
    const display: Record<string, unknown> = {...row}
    const carriedFrom: Record<string, string> = {}
    for (const key of keys) {
      const value = row[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        previous.set(key, {value, date: String(row.label ?? row.date ?? row.month ?? '')})
      } else {
        const last = previous.get(key)
        display[key] = last?.value ?? null
        if (last) carriedFrom[key] = last.date
      }
    }
    return {...display, carriedFrom} as T & {carriedFrom: Record<string, string>}
  })
}
