import { describe, it, expect } from 'vitest'
import { addDays, windowsOverlap, formatDayMonth, colomboToday } from './dates'

describe('addDays', () => {
  it('adds days without timezone drift', () => {
    expect(addDays('2026-08-12', 14)).toBe('2026-08-26')
  })

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-28', 5)).toBe('2027-01-02')
  })

  it('handles negative offsets', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('windowsOverlap', () => {
  it('detects overlapping windows', () => {
    expect(windowsOverlap('2026-08-12', '2026-08-14', '2026-08-13', '2026-08-15')).toBe(true)
  })

  it('treats shared boundary dates as overlapping', () => {
    expect(windowsOverlap('2026-08-12', '2026-08-14', '2026-08-14', '2026-08-16')).toBe(true)
  })

  it('rejects disjoint windows', () => {
    expect(windowsOverlap('2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15')).toBe(false)
  })
})

describe('formatDayMonth', () => {
  it('formats without locale or timezone dependence', () => {
    expect(formatDayMonth('2026-08-12')).toBe('12 Aug')
    expect(formatDayMonth('2026-01-01')).toBe('1 Jan')
  })
})

describe('colomboToday', () => {
  it('returns the Colombo date, not the UTC date, near midnight', () => {
    // 2026-08-11 20:00 UTC is 2026-08-12 01:30 in Colombo (UTC+5:30)
    expect(colomboToday(new Date('2026-08-11T20:00:00Z'))).toBe('2026-08-12')
  })

  it('returns the same date mid-afternoon UTC', () => {
    expect(colomboToday(new Date('2026-08-12T06:00:00Z'))).toBe('2026-08-12')
  })
})
