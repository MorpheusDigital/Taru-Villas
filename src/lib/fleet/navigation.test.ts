import { describe, expect, it } from 'vitest'
import { getFleetNavigationItems } from './navigation'

describe('getFleetNavigationItems', () => {
  it('returns no links for a user without fleet access', () => {
    expect(getFleetNavigationItems(false, false)).toEqual([])
  })

  it('returns Fleet only for a fleet booker', () => {
    expect(getFleetNavigationItems(true, false).map((item) => item.href)).toEqual([
      '/fleet',
    ])
  })

  it('returns all fleet links in operational order for a fleet admin', () => {
    expect(getFleetNavigationItems(false, true).map((item) => item.href)).toEqual([
      '/fleet',
      '/fleet/dispatch',
      '/admin/fleet/vehicles',
      '/admin/fleet/drivers',
      '/admin/fleet/distances',
    ])
  })
})
