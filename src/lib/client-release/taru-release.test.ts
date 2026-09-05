import { describe, expect, it } from 'vitest'
import config from '../../../next.config'
import { getClientModuleRequestStatus, getEnabledClientModules, isPathEnabled } from './modules'

const modules = 'dashboard,tasks,fleet,daily-records'

describe('Taru release', () => {
  it('pins the four requested modules in the deployed build', () => {
    expect(config.env?.CLIENT_ENABLED_MODULES).toBe(modules)
  })

  it.each([
    '/dashboard', '/tasks', '/api/projects', '/api/issues',
    '/fleet', '/fleet/dispatch', '/admin/fleet/vehicles', '/admin/fleet/drivers',
    '/admin/fleet/distances', '/api/fleet/requests', '/d/example',
    '/api/cron/fleet-optimize', '/daily-records',
    '/properties/example/daily-records', '/api/utilities/readings',
    '/api/utilities/summary', '/api/utilities/extract-reading',
    '/api/waste', '/api/cron/electricity-autofill',
    '/admin/users', '/admin/properties', '/api/auth/provision',
    '/login', '/callback', '/set-password',
  ])('keeps the required route accessible: %s', (path) => {
    expect(getClientModuleRequestStatus(path, modules)).toBeNull()
  })

  it.each([
    '/surveys', '/api/surveys', '/api/templates', '/g/example',
    '/sops', '/api/sops/templates', '/rostering', '/api/rostering/cycles',
    '/assets', '/api/assets', '/menus', '/m/example', '/excursions', '/e/example',
    '/guest-profiles', '/api/oracle/test-connection', '/settings',
    '/admin/allowed-emails', '/utilities', '/u/example',
    '/properties/example/menus', '/properties/example/guest-profiles',
  ])('blocks excluded modules at their routes: %s', (path) => {
    expect(getClientModuleRequestStatus(path, modules)).toBe(404)
    expect(isPathEnabled(path, getEnabledClientModules(modules))).toBe(false)
  })
})
