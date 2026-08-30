import { expect, it } from 'vitest'
import { connectionMessage } from './connectivity'

it('only exposes an actionable message when offline', () => {
  expect(connectionMessage(true)).toBeNull()
  expect(connectionMessage(false)).toBe(
    'You are offline. Reconnect to continue using the portal.',
  )
})
