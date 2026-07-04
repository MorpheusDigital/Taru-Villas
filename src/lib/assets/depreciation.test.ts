import { describe, it, expect } from 'vitest'
import { computeDepreciation } from './depreciation'

const asOf = new Date('2026-07-03T00:00:00Z')

describe('computeDepreciation', () => {
  it('computes straight-line NBV partway through life', () => {
    // cost 120000, salvage 0, life 10y => annual 12000, monthly 1000
    // purchased 2026-01-03 => 6 whole months active by 2026-07-03
    const r = computeDepreciation(
      { purchaseCost: 120000, salvageValue: 0, usefulLifeYears: 10, purchaseDate: '2026-01-03' },
      asOf,
    )
    expect(r.annualDepreciation).toBe(12000)
    expect(r.monthlyDepreciation).toBe(1000)
    expect(r.monthsActive).toBe(6)
    expect(r.accumulatedDepreciation).toBe(6000)
    expect(r.netBookValue).toBe(114000)
  })

  it('respects salvage value as the NBV floor', () => {
    // cost 100000, salvage 20000, life 1y => annual 80000, monthly ~6666.67
    // 24 months elapsed (past end of life) => fully depreciated to salvage
    const r = computeDepreciation(
      { purchaseCost: 100000, salvageValue: 20000, usefulLifeYears: 1, purchaseDate: '2024-07-03' },
      asOf,
    )
    expect(r.accumulatedDepreciation).toBe(80000)
    expect(r.netBookValue).toBe(20000)
  })

  it('clamps NBV to salvage once useful life is exceeded regardless of extra time', () => {
    const r = computeDepreciation(
      { purchaseCost: 50000, salvageValue: 5000, usefulLifeYears: 2, purchaseDate: '2020-01-01' },
      asOf,
    )
    expect(r.netBookValue).toBe(5000)
    expect(r.accumulatedDepreciation).toBe(45000)
  })

  it('returns zero accumulated depreciation on the purchase date', () => {
    const r = computeDepreciation(
      { purchaseCost: 90000, salvageValue: 0, usefulLifeYears: 5, purchaseDate: '2026-07-03' },
      asOf,
    )
    expect(r.monthsActive).toBe(0)
    expect(r.accumulatedDepreciation).toBe(0)
    expect(r.netBookValue).toBe(90000)
  })

  it('guards against zero/negative useful life (treats as fully depreciated)', () => {
    const r = computeDepreciation(
      { purchaseCost: 10000, salvageValue: 1000, usefulLifeYears: 0, purchaseDate: '2026-01-01' },
      asOf,
    )
    expect(r.netBookValue).toBe(1000)
    expect(r.accumulatedDepreciation).toBe(9000)
  })
})
