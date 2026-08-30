export interface CallbackUser {
  id: string
  email?: string | null
}

export interface BoundProfile {
  id: string
  orgId: string
  email: string
  role: string
}

export interface AuthCallbackDependencies<User extends CallbackUser = CallbackUser> {
  exchangeCodeForSession(code: string): Promise<{ error: unknown | null }>
  verifyInviteOtp(tokenHash: string): Promise<{ error: unknown | null }>
  getUser(): Promise<User | undefined>
  getProfile(userId: string): Promise<BoundProfile | undefined>
  provisionLegacyUser(user: User): Promise<boolean>
  clearSession(): Promise<void>
}

export interface AuthCallbackInput {
  code?: string | null
  tokenHash?: string | null
  type?: string | null
  next?: string | null
  inviteOnly: boolean
}

export interface AuthCallbackResult {
  destination: string
}

export type PasswordSetupResult =
  | { ok: true; destination: '/dashboard' }
  | { ok: false; error: string }

export function normalizeNextPath(
  value: string | null | undefined,
  fallback = '/dashboard'
): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback
  }

  try {
    const base = new URL('https://app.invalid')
    const normalized = new URL(value, base)
    if (
      normalized.origin !== base.origin
      || normalized.pathname.startsWith('//')
    ) return fallback
    return `${normalized.pathname}${normalized.search}${normalized.hash}`
  } catch {
    return fallback
  }
}

export function getApplicationOrigin(
  value = process.env.NEXT_PUBLIC_APP_URL
): string {
  if (!value) throw new Error('NEXT_PUBLIC_APP_URL is required')

  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('NEXT_PUBLIC_APP_URL must be an http(s) origin')
  }

  return url.origin
}

function isBoundProfile(
  user: CallbackUser,
  profile: BoundProfile | undefined
): profile is BoundProfile {
  return Boolean(
    profile
    && profile.id === user.id
    && profile.orgId
    && profile.role
    && user.email
    && profile.email.trim().toLowerCase() === user.email.trim().toLowerCase()
  )
}

export async function completeAuthCallback<User extends CallbackUser>(
  input: AuthCallbackInput,
  dependencies: AuthCallbackDependencies<User>
): Promise<AuthCallbackResult> {
  const isInviteConfirmation = Boolean(input.tokenHash)

  if (isInviteConfirmation) {
    if (input.type !== 'invite') {
      return { destination: '/login?error=invite_invalid' }
    }

    const verification = await dependencies.verifyInviteOtp(input.tokenHash!)
    if (verification.error) {
      return { destination: '/login?error=invite_invalid' }
    }
  } else if (input.code) {
    const exchange = await dependencies.exchangeCodeForSession(input.code)
    if (exchange.error) return { destination: '/login?error=auth_failed' }
  } else {
    return { destination: '/login?error=auth_failed' }
  }

  const user = await dependencies.getUser()
  if (!user) return { destination: '/login?error=auth_failed' }

  const profile = await dependencies.getProfile(user.id)
  if (isInviteConfirmation) {
    if (!isBoundProfile(user, profile)) {
      await dependencies.clearSession()
      return { destination: '/login?error=no_profile' }
    }
    return { destination: '/set-password' }
  }

  if (profile) return { destination: normalizeNextPath(input.next) }
  if (input.inviteOnly) {
    await dependencies.clearSession()
    return { destination: '/login?error=no_profile' }
  }

  const provisioned = await dependencies.provisionLegacyUser(user)
  return provisioned
    ? { destination: normalizeNextPath(input.next) }
    : { destination: '/login?error=auth_failed' }
}

export async function completePasswordSetup(
  password: string,
  confirmation: string,
  updatePassword: (password: string) => Promise<{ error: { message?: string } | null }>
): Promise<PasswordSetupResult> {
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' }
  }
  if (password !== confirmation) {
    return { ok: false, error: 'Passwords do not match.' }
  }

  const result = await updatePassword(password)
  if (result.error) {
    return {
      ok: false,
      error: result.error.message ?? 'Failed to set password. Request a new invitation.',
    }
  }

  return { ok: true, destination: '/dashboard' }
}
