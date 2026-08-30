import { describe, expect, it } from 'vitest'
import {
  completeAuthCallback,
  completePasswordSetup,
  getApplicationOrigin,
  normalizeNextPath,
  type AuthCallbackDependencies,
} from './callback'

const invitedUser = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'manager@client.example',
}

const invitedProfile = {
  id: invitedUser.id,
  orgId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: invitedUser.email,
  role: 'property_manager',
}

function createDependencies(
  overrides: Partial<AuthCallbackDependencies> = {}
): AuthCallbackDependencies {
  return {
    exchangeCodeForSession: async () => ({ error: null }),
    verifyInviteOtp: async () => ({ error: null }),
    getUser: async () => invitedUser,
    getProfile: async () => invitedProfile,
    provisionLegacyUser: async () => true,
    clearSession: async () => undefined,
    ...overrides,
  }
}

describe('auth callback completion', () => {
  it('verifies an invite token and sends the bound user to password setup', async () => {
    const verifiedTokens: string[] = []
    const result = await completeAuthCallback(
      { tokenHash: 'invite-token', type: 'invite', inviteOnly: true },
      createDependencies({
        verifyInviteOtp: async (tokenHash) => {
          verifiedTokens.push(tokenHash)
          return { error: null }
        },
      })
    )

    expect(verifiedTokens).toEqual(['invite-token'])
    expect(result).toEqual({ destination: '/set-password' })
  })

  it('rejects expired invite tokens without creating a session flow', async () => {
    const result = await completeAuthCallback(
      { tokenHash: 'expired-token', type: 'invite', inviteOnly: true },
      createDependencies({
        verifyInviteOtp: async () => ({ error: new Error('expired') }),
      })
    )

    expect(result).toEqual({ destination: '/login?error=invite_invalid' })
  })

  it('rejects an invite when the authenticated user is not bound to its profile', async () => {
    const clearedSessions: boolean[] = []
    const result = await completeAuthCallback(
      { tokenHash: 'invite-token', type: 'invite', inviteOnly: true },
      createDependencies({
        getProfile: async () => ({
          ...invitedProfile,
          email: 'different@client.example',
        }),
        clearSession: async () => {
          clearedSessions.push(true)
        },
      })
    )

    expect(clearedSessions).toEqual([true])
    expect(result).toEqual({ destination: '/login?error=no_profile' })
  })

  it('preserves legacy PKCE provisioning when invite-only access is unset', async () => {
    const provisions: string[] = []
    const result = await completeAuthCallback(
      { code: 'pkce-code', next: '/surveys', inviteOnly: false },
      createDependencies({
        getProfile: async () => undefined,
        provisionLegacyUser: async (user) => {
          provisions.push(user.id)
          return true
        },
      })
    )

    expect(provisions).toEqual([invitedUser.id])
    expect(result).toEqual({ destination: '/surveys' })
  })

  it('clears an invite-only PKCE session that has no bound profile', async () => {
    const clearedSessions: boolean[] = []
    const result = await completeAuthCallback(
      { code: 'pkce-code', inviteOnly: true },
      createDependencies({
        getProfile: async () => undefined,
        clearSession: async () => {
          clearedSessions.push(true)
        },
      })
    )

    expect(clearedSessions).toEqual([true])
    expect(result).toEqual({ destination: '/login?error=no_profile' })
  })
})

describe('invite password setup', () => {
  it('updates a matching password and sends the user into the portal', async () => {
    const passwords: string[] = []
    const result = await completePasswordSetup(
      'new-secure-password',
      'new-secure-password',
      async (password) => {
        passwords.push(password)
        return { error: null }
      }
    )

    expect(passwords).toEqual(['new-secure-password'])
    expect(result).toEqual({ ok: true, destination: '/dashboard' })
  })

  it('rejects short or mismatched passwords before calling Supabase', async () => {
    const passwords: string[] = []
    const updatePassword = async (password: string) => {
      passwords.push(password)
      return { error: null }
    }

    expect(await completePasswordSetup('short', 'short', updatePassword)).toEqual({
      ok: false,
      error: 'Password must be at least 8 characters.',
    })
    expect(await completePasswordSetup('secure-password', 'different-password', updatePassword)).toEqual({
      ok: false,
      error: 'Passwords do not match.',
    })
    expect(passwords).toEqual([])
  })
})

describe('callback redirects', () => {
  it.each([
    ['https://attacker.example/path', '/dashboard'],
    ['//attacker.example/path', '/dashboard'],
    ['/safe/..//attacker.example/path', '/dashboard'],
    ['dashboard', '/dashboard'],
    ['/safe/../surveys?view=open', '/surveys?view=open'],
    ['/tasks', '/tasks'],
  ])('normalizes %s to %s', (value, expected) => {
    expect(normalizeNextPath(value)).toBe(expected)
  })

  it('accepts only an http(s) configured application origin', () => {
    expect(getApplicationOrigin('https://portal.client.example/path')).toBe(
      'https://portal.client.example'
    )
    expect(() => getApplicationOrigin('javascript:alert(1)')).toThrow(
      'NEXT_PUBLIC_APP_URL must be an http(s) origin'
    )
  })
})
