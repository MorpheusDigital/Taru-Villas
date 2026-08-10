import { describe, expect, it } from 'vitest'
import { buildDailyRecordsPath, getDailyRecordTab } from './tabs'

describe('getDailyRecordTab', () => {
  it('opens Daily Wastage when the waste tab is requested', () => {
    expect(getDailyRecordTab('waste')).toBe('waste')
  })

  it('defaults unsupported tab values to Water', () => {
    expect(getDailyRecordTab(undefined)).toBe('water')
    expect(getDailyRecordTab('gas')).toBe('water')
  })

  it('keeps a selected tab and reporting range when opening a property', () => {
    expect(
      buildDailyRecordsPath('property-123', 'waste', new URLSearchParams('range=last-3m'))
    ).toBe('/properties/property-123/daily-records?range=last-3m&tab=waste')
  })
})
