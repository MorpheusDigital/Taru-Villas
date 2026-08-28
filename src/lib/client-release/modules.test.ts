import { describe, expect, it } from 'vitest'
import { getEnabledClientModules, isPathEnabled, moduleForPath } from './modules'

describe('Client module policy', () => {
  it('normalizes the Client 1 setting', () => {
    expect([...getEnabledClientModules(' dashboard, tasks ,surveys,fleet ')]).toEqual([
      'dashboard', 'tasks', 'surveys', 'fleet',
    ])
  })

  it('maps protected and public routes', () => {
    expect(moduleForPath('/fleet/dispatch')).toBe('fleet')
    expect(moduleForPath('/api/surveys/guest/example')).toBe('surveys')
    expect(moduleForPath('/m/example-menu')).toBe('menus')
  })

  it('keeps core admin routes while rejecting disabled products', () => {
    const enabled = getEnabledClientModules('dashboard,tasks,surveys,fleet')
    expect(isPathEnabled('/admin/users', enabled)).toBe(true)
    expect(isPathEnabled('/fleet/dispatch', enabled)).toBe(true)
    expect(isPathEnabled('/sops', enabled)).toBe(false)
    expect(isPathEnabled('/m/example-menu', enabled)).toBe(false)
  })
})
