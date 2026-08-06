import { describe, expect, it } from 'vitest'
import { getReportStatus } from './reports'

describe('getReportStatus', () => {
  it('is pending before its 72-hour deadline', () => {
    expect(
      getReportStatus(
        new Date('2026-08-09T12:00:00Z'),
        null,
        new Date('2026-08-08T12:00:00Z')
      )
    ).toBe('pending')
  })

  it('is overdue after its deadline without a submission', () => {
    expect(
      getReportStatus(
        new Date('2026-08-09T12:00:00Z'),
        null,
        new Date('2026-08-10T12:00:00Z')
      )
    ).toBe('overdue')
  })

  it('is submitted regardless of the deadline', () => {
    expect(
      getReportStatus(
        new Date('2026-08-09T12:00:00Z'),
        new Date('2026-08-10T12:00:00Z'),
        new Date('2026-08-10T12:00:00Z')
      )
    ).toBe('submitted')
  })
})
