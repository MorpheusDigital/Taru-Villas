import { describe, expect, it } from 'vitest'
import {
  canAutoProvisionUser,
  isInviteOnlyClient,
  shouldRejectUninvitedUser,
} from './client-access'

describe('client access policy', () => {
  it('requires an existing invitation only when Client 1 opts into invite-only access', () => {
    expect(isInviteOnlyClient('true')).toBe(true)
    expect(canAutoProvisionUser('true')).toBe(false)
  })

  it('preserves legacy automatic provisioning when the policy is not configured', () => {
    expect(isInviteOnlyClient(undefined)).toBe(false)
    expect(canAutoProvisionUser(undefined)).toBe(true)
  })

  it('rejects only uninvited Client 1 users after authentication', () => {
    expect(shouldRejectUninvitedUser(true, false)).toBe(true)
    expect(shouldRejectUninvitedUser(true, true)).toBe(false)
    expect(shouldRejectUninvitedUser(false, false)).toBe(false)
  })
})
