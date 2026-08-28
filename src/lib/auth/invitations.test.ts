import { expect, it } from 'vitest'
import { parseInviteUser } from './invitations'

it('accepts a valid client email and rejects malformed mail', () => {
  expect(parseInviteUser({
    email: 'manager@client.example', fullName: 'Client Manager',
    role: 'property_manager', propertyIds: [],
  }).success).toBe(true)
  expect(parseInviteUser({
    email: 'not-an-email', fullName: 'Client Manager', role: 'staff', propertyIds: [],
  }).success).toBe(false)
})
