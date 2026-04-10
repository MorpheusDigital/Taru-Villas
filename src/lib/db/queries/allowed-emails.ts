import { eq } from 'drizzle-orm'
import { db } from '..'
import { allowedEmails, profiles } from '../schema'

/**
 * Check if an email is in the allowed list.
 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const results = await db
    .select({ id: allowedEmails.id })
    .from(allowedEmails)
    .where(eq(allowedEmails.email, email.toLowerCase()))
    .limit(1)

  return results.length > 0
}

/**
 * Get all allowed emails for an organization, with the name of who added them.
 */
export async function getAllowedEmails(orgId: string) {
  const emails = await db
    .select()
    .from(allowedEmails)
    .where(eq(allowedEmails.orgId, orgId))
    .orderBy(allowedEmails.email)

  const addedByIds = emails.map((e) => e.addedBy).filter(Boolean) as string[]

  let profileMap: Record<string, string> = {}
  if (addedByIds.length > 0) {
    const addedByProfiles = await db
      .select({ id: profiles.id, fullName: profiles.fullName })
      .from(profiles)

    profileMap = Object.fromEntries(
      addedByProfiles.map((p) => [p.id, p.fullName])
    )
  }

  return emails.map((e) => ({
    ...e,
    addedByName: e.addedBy ? profileMap[e.addedBy] ?? null : null,
  }))
}

/**
 * Add an email to the allowed list.
 */
export async function addAllowedEmail(data: {
  orgId: string
  email: string
  addedBy: string
}) {
  const [inserted] = await db
    .insert(allowedEmails)
    .values({
      orgId: data.orgId,
      email: data.email.toLowerCase(),
      addedBy: data.addedBy,
    })
    .returning()

  return inserted
}

/**
 * Remove an email from the allowed list.
 */
export async function removeAllowedEmail(id: string) {
  const [deleted] = await db
    .delete(allowedEmails)
    .where(eq(allowedEmails.id, id))
    .returning()

  return deleted
}
