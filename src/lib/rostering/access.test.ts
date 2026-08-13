import { describe, expect, it } from 'vitest'

import { canGenerateHub, canViewManagementCycle } from './access'
import type { RosteringAccess } from './access'

const admin: RosteringAccess = {
  isAdmin: true,
  propertyIds: null,
  canManage: true,
}
const manager: RosteringAccess = {
  isAdmin: false,
  propertyIds: ['property-a', 'property-b'],
  canManage: true,
}
const staff: RosteringAccess = {
  isAdmin: false,
  propertyIds: ['property-a'],
  canManage: false,
}

describe('rostering access', () => {
  it('allows admins to generate any hub', () => {
    expect(canGenerateHub(admin, ['property-a', 'property-z'])).toBe(true)
  })

  it('allows a manager to generate only hubs whose active properties are all assigned', () => {
    expect(canGenerateHub(manager, ['property-a', 'property-b'])).toBe(true)
    expect(canGenerateHub(manager, ['property-a', 'property-c'])).toBe(false)
  })

  it('allows a manager to view a cycle with at least one assigned child property', () => {
    expect(canViewManagementCycle(manager, ['property-b', 'property-c'])).toBe(true)
    expect(canViewManagementCycle(manager, ['property-c'])).toBe(false)
  })

  it('never gives staff management-cycle access', () => {
    expect(canGenerateHub(staff, ['property-a'])).toBe(false)
    expect(canViewManagementCycle(staff, ['property-a'])).toBe(false)
  })
})
