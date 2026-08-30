import { expect, it } from 'vitest'
import { shouldCacheStaticPath } from './cache-policy'

it('allows static assets and rejects data paths', () => {
  expect(shouldCacheStaticPath('/_next/static/chunks/app.js', 'GET')).toBe(true)
  expect(shouldCacheStaticPath('/icon-192.png', 'GET')).toBe(true)
  expect(shouldCacheStaticPath('/api/tasks', 'GET')).toBe(false)
  expect(shouldCacheStaticPath('/dashboard', 'GET')).toBe(false)
  expect(shouldCacheStaticPath('/api/fleet/requests', 'POST')).toBe(false)
})
