import { describe, expect, it } from 'vitest'
import { reviewDateLabel, reviewListingUrl, reviewPagination } from './display'

describe('imported review display', () => {
  it('does not present a relative month estimate as an exact date', () => {
    expect(reviewDateLabel(new Date('2026-04-09T10:00:00Z'), { reviewed_at_is_estimate: true, date_precision: 'month' })).toBe('Around Apr 2026')
  })
  it('distinguishes edited dates and coarse year estimates', () => {
    expect(reviewDateLabel(new Date('2024-09-09T10:00:00Z'), { reviewed_at_is_estimate: true, date_precision: 'year', date_event: 'edited' })).toBe('Edited around 2024')
  })
  it('only builds source links from numeric Google identifiers', () => {
    expect(reviewListingUrl({ google_maps_cid: '123456789' })).toBe('https://www.google.com/maps?cid=123456789')
    expect(reviewListingUrl({ listing_url: 'javascript:alert(1)', google_maps_cid: '../evil' })).toBeNull()
    expect(reviewListingUrl(null)).toBeNull()
  })
  it('clamps malformed and out-of-range pages, including empty results', () => {
    expect(reviewPagination('NaN', 93)).toEqual({ page: 1, pages: 4, offset: 0 })
    expect(reviewPagination('999999999999999999', 93)).toEqual({ page: 4, pages: 4, offset: 75 })
    expect(reviewPagination('-4', 0)).toEqual({ page: 1, pages: 1, offset: 0 })
  })
})
