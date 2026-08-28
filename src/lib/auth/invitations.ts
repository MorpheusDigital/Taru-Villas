import { z } from 'zod'
import { userRoleEnum } from '../db/schema'

const inviteUserSchema = z.object({
  email: z.string().email('Must be a valid email'),
  fullName: z.string().min(1, 'Full name is required').max(255),
  role: z.enum(userRoleEnum.enumValues),
  propertyIds: z.array(z.string().uuid('Invalid property ID')).default([]),
})

export function parseInviteUser(body: unknown) {
  return inviteUserSchema.safeParse(body)
}
