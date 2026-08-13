import { describe, expect, it } from 'vitest'

import {
  datesInMonth,
  previousBoundaryDates,
  workWeekKey,
} from './dates'

describe('rostering dates', () => {
  it('includes leap day when building a leap-February roster', () => {
    const dates = datesInMonth('2028-02-01')

    expect(dates).toHaveLength(29)
    expect(dates[0]).toBe('2028-02-01')
    expect(dates.at(-1)).toBe('2028-02-29')
  })

  it('rejects a roster month that is not the first calendar date', () => {
    expect(() => datesInMonth('2026-09-02')).toThrow(
      'month must be the first calendar date',
    )
  })

  it('returns only the preceding dates needed to complete the first work week', () => {
    expect(previousBoundaryDates('2026-09-01', 1)).toEqual([
      '2026-08-31',
    ])
    expect(previousBoundaryDates('2026-11-01', 1)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ])
  })

  it('places Sunday and Monday in different Monday-start work weeks', () => {
    expect(workWeekKey('2026-09-06', 1)).toBe('2026-08-31')
    expect(workWeekKey('2026-09-07', 1)).toBe('2026-09-07')
  })
})
