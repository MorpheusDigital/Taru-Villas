import { z } from 'zod'

const inviteEmailSchema = z.string().email('Must be a valid email')

const inviteUserSchema = z.object({
  email: inviteEmailSchema,
  fullName: z.string().min(1, 'Full name is required').max(255),
  role: z.enum(['admin', 'property_manager', 'staff']),
  propertyIds: z.array(z.string().uuid('Invalid property ID')).default([]),
})

export type InviteUserInput = z.infer<typeof inviteUserSchema>

interface InvitingAdmin {
  id: string
  orgId: string
}

interface InvitedAuthUser {
  id: string
}

export interface PersistInvitedUserInput extends InviteUserInput {
  id: string
  orgId: string
}

export interface InviteUserDependencies<CreatedProfile> {
  getOrganizationPropertyIds(orgId: string): Promise<readonly string[]>
  getExistingProfile(email: string): Promise<unknown>
  inviteUserByEmail(
    input: Pick<InviteUserInput, 'email' | 'fullName' | 'role'>
  ): Promise<InvitedAuthUser>
  persistInvitedUser(input: PersistInvitedUserInput): Promise<CreatedProfile>
  deleteInvitedUser(userId: string): Promise<void>
  logError(message: string, error: unknown): void
}

export type InviteUserResult<CreatedProfile> =
  | { ok: true; status: 201; profile: CreatedProfile }
  | { ok: false; status: 403 | 409 | 500; error: string }

export function parseInviteUser(body: unknown) {
  return inviteUserSchema.safeParse(body)
}

export function validateInviteEmail(value: string): true | string {
  const result = inviteEmailSchema.safeParse(value)
  return result.success ? true : result.error.issues[0]?.message ?? 'Must be a valid email'
}

export async function inviteUserForOrganization<CreatedProfile>(
  admin: InvitingAdmin,
  input: InviteUserInput,
  dependencies: InviteUserDependencies<CreatedProfile>
): Promise<InviteUserResult<CreatedProfile>> {
  const organizationPropertyIds = new Set(
    await dependencies.getOrganizationPropertyIds(admin.orgId)
  )

  if (input.propertyIds.some((propertyId) => !organizationPropertyIds.has(propertyId))) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden: property does not belong to your organization',
    }
  }

  const existingProfile = await dependencies.getExistingProfile(input.email)
  if (existingProfile) {
    return {
      ok: false,
      status: 409,
      error: 'A user with this email already exists',
    }
  }

  let invitedUser: InvitedAuthUser
  try {
    invitedUser = await dependencies.inviteUserByEmail(input)
  } catch (error) {
    dependencies.logError('Supabase invitation failed', error)
    return { ok: false, status: 500, error: 'Failed to invite user' }
  }

  try {
    const profile = await dependencies.persistInvitedUser({
      ...input,
      id: invitedUser.id,
      orgId: admin.orgId,
    })
    return { ok: true, status: 201, profile }
  } catch (error) {
    dependencies.logError('Invitation database persistence failed', error)
    try {
      await dependencies.deleteInvitedUser(invitedUser.id)
    } catch (cleanupError) {
      dependencies.logError('Failed to delete invited auth user after database failure', cleanupError)
    }
    return { ok: false, status: 500, error: 'Failed to invite user' }
  }
}
