import { describe, expect, it } from 'vitest'
import { getFleetNavigationItems } from './navigation'

describe('getFleetNavigationItems', () => {
  it('lets every user access their rides without granting fleet administration', () => {
    expect(getFleetNavigationItems(false, false).map(item => item.href)).toEqual(['/fleet/my-rides'])
  })

  it('includes personal rides and fleet requests for a fleet booker', () => {
    expect(getFleetNavigationItems(true, false).map((item) => item.href)).toEqual([
      '/fleet/my-rides',
      '/fleet',
    ])
  })

  it('returns all fleet links in operational order for a fleet admin', () => {
    expect(getFleetNavigationItems(false, true).map((item) => item.href)).toEqual([
      '/fleet/my-rides',
      '/fleet',
      '/fleet/dispatch',
      '/admin/fleet/vehicles',
      '/admin/fleet/drivers',
      '/admin/fleet/distances',
    ])
  })
})
