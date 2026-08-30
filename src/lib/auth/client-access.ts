export function isInviteOnlyClient(value = process.env.CLIENT_INVITE_ONLY): boolean {
  return value?.trim().toLowerCase() === 'true'
}

export function canAutoProvisionUser(value = process.env.CLIENT_INVITE_ONLY): boolean {
  return !isInviteOnlyClient(value)
}

export function shouldRejectUninvitedUser(
  inviteOnly: boolean,
  hasExistingProfile: boolean
): boolean {
  return inviteOnly && !hasExistingProfile
}

export function isInviteOnlyLaunchReady(
  inviteOnlyValue = process.env.CLIENT_INVITE_ONLY,
  publicSignupsDisabledValue = process.env.CLIENT_SUPABASE_PUBLIC_SIGNUPS_DISABLED
): boolean {
  return !isInviteOnlyClient(inviteOnlyValue)
    || publicSignupsDisabledValue?.trim().toLowerCase() === 'true'
}
