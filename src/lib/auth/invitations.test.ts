import { describe, expect, it } from 'vitest'
import {
  inviteUserForOrganization,
  parseInviteUser,
  validateInviteEmail,
  type InviteUserDependencies,
  type InviteUserInput,
} from './invitations'

it('accepts a valid client email and rejects malformed mail', () => {
  expect(parseInviteUser({
    email: 'manager@client.example', fullName: 'Client Manager',
    role: 'property_manager', propertyIds: [],
  }).success).toBe(true)
  expect(parseInviteUser({
    email: 'not-an-email', fullName: 'Client Manager', role: 'staff', propertyIds: [],
  }).success).toBe(false)
})

it('validates client form emails without restricting the domain', () => {
  expect(validateInviteEmail('manager@client.example')).toBe(true)
  expect(validateInviteEmail('not-an-email')).toBe('Must be a valid email')
})

const admin = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orgId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}

const organizationPropertyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const foreignPropertyId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const invite: InviteUserInput = {
  email: 'manager@client.example',
  fullName: 'Client Manager',
  role: 'property_manager',
  propertyIds: [organizationPropertyId],
}

interface TestProfile {
  id: string
  orgId: string
  email: string
  fullName: string
  role: InviteUserInput['role']
}

function createDependencies(overrides: Partial<InviteUserDependencies<TestProfile>> = {}) {
  const invitedEmails: string[] = []
  const createdProfiles: TestProfile[] = []
  const deletedUserIds: string[] = []

  const dependencies: InviteUserDependencies<TestProfile> = {
    getOrganizationPropertyIds: async () => [organizationPropertyId],
    getExistingProfile: async () => undefined,
    inviteUserByEmail: async (input) => {
      invitedEmails.push(input.email)
      return { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }
    },
    persistInvitedUser: async (input) => {
      const profile = {
        id: input.id,
        orgId: input.orgId,
        email: input.email,
        fullName: input.fullName,
        role: input.role,
      }
      createdProfiles.push(profile)
      return profile
    },
    deleteInvitedUser: async (userId) => {
      deletedUserIds.push(userId)
    },
    logError: () => undefined,
    ...overrides,
  }

  return { dependencies, invitedEmails, createdProfiles, deletedUserIds }
}

describe('inviteUserForOrganization', () => {
  it('rejects a foreign property before sending an external invitation', async () => {
    const state = createDependencies()

    const result = await inviteUserForOrganization(
      admin,
      { ...invite, propertyIds: [foreignPropertyId] },
      state.dependencies
    )

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: 'Forbidden: property does not belong to your organization',
    })
    expect(state.invitedEmails).toEqual([])
    expect(state.createdProfiles).toEqual([])
  })

  it('persists successful invitations in the authenticated admins organization', async () => {
    const state = createDependencies()
    const requestWithForeignOrg = {
      ...invite,
      orgId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    }

    const result = await inviteUserForOrganization(
      admin,
      requestWithForeignOrg,
      state.dependencies
    )

    expect(result.ok).toBe(true)
    expect(state.createdProfiles).toEqual([
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        orgId: admin.orgId,
        email: invite.email,
        fullName: invite.fullName,
        role: invite.role,
      },
    ])
  })

  it('deletes the invited auth user when database persistence fails', async () => {
    const state = createDependencies({
      persistInvitedUser: async () => {
        throw new Error('database unavailable')
      },
    })

    const result = await inviteUserForOrganization(admin, invite, state.dependencies)

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'Failed to invite user',
    })
    expect(state.deletedUserIds).toEqual([
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ])
  })
})
