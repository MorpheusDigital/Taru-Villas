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
