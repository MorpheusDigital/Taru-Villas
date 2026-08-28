import { describe, expect, it } from 'vitest'
import { getEnabledClientModules, isPathEnabled, moduleForPath } from './modules'

describe('Client module policy', () => {
  it('normalizes the Client 1 setting', () => {
    expect([...getEnabledClientModules(' dashboard, tasks ,surveys,fleet ')]).toEqual([
      'dashboard', 'tasks', 'surveys', 'fleet',
    ])
  })

  it('uses the configured module setting when no value is supplied', () => {
    const previousValue = process.env.CLIENT_ENABLED_MODULES
    process.env.CLIENT_ENABLED_MODULES = 'dashboard,tasks,surveys,fleet'

    try {
      expect([...getEnabledClientModules()]).toEqual([
        'dashboard', 'tasks', 'surveys', 'fleet',
      ])
    } finally {
      if (previousValue === undefined) {
        delete process.env.CLIENT_ENABLED_MODULES
      } else {
        process.env.CLIENT_ENABLED_MODULES = previousValue
      }
    }
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

  it('never blocks auth or PWA infrastructure', () => {
    const enabled = getEnabledClientModules('dashboard,tasks,surveys,fleet')
    expect(isPathEnabled('/login', enabled)).toBe(true)
    expect(isPathEnabled('/manifest.webmanifest', enabled)).toBe(true)
    expect(isPathEnabled('/sw.js', enabled)).toBe(true)
  })
})
