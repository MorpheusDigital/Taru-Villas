import { describe, it, expect } from 'vitest'
import { buildDistanceIndex, lookupDistanceKm } from './distance'
import type { DistanceEntry } from './types'

const entries: DistanceEntry[] = [
  { fromPropertyId: null, toPropertyId: 'p1', distanceKm: 65 },
  { fromPropertyId: 'p1', toPropertyId: 'p2', distanceKm: 22.5 },
]

describe('lookupDistanceKm', () => {
  it('returns 0 for the same node', () => {
    const idx = buildDistanceIndex(entries)
    expect(lookupDistanceKm(idx, 'p1', 'p1')).toBe(0)
    expect(lookupDistanceKm(idx, null, null)).toBe(0)
  })

  it('looks up a stored pair', () => {
    const idx = buildDistanceIndex(entries)
    expect(lookupDistanceKm(idx, 'p1', 'p2')).toBe(22.5)
  })

  it('is symmetric even when only one direction is stored', () => {
    const idx = buildDistanceIndex(entries)
    expect(lookupDistanceKm(idx, 'p2', 'p1')).toBe(22.5)
  })

  it('treats null as head office', () => {
    const idx = buildDistanceIndex(entries)
    expect(lookupDistanceKm(idx, 'p1', null)).toBe(65)
  })

  it('returns null for an unknown pair rather than guessing', () => {
    const idx = buildDistanceIndex(entries)
    expect(lookupDistanceKm(idx, 'p2', 'p9')).toBeNull()
  })
})
