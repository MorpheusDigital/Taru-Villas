import { eq, sql } from 'drizzle-orm'
import type { User } from '@supabase/supabase-js'
import { db } from '@/lib/db'
import { organizations, profiles, properties, propertyAssignments } from '@/lib/db/schema'

export async function provisionLegacyUser(user: User) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(719624)`)

    const existing = await tx.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)
    if (existing[0]) return { profile: existing[0], created: false }

    const firstProfile = await tx.select({ id: profiles.id }).from(profiles).limit(1)
    const isFirstUser = firstProfile.length === 0
    const orgs = await tx.select().from(organizations).limit(1)
    const orgId = orgs[0]?.id

    if (!orgId) return null

    const [profile] = await tx.insert(profiles).values({
      id: user.id,
      orgId,
      email: user.email ?? '',
      fullName: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User',
      avatarUrl: user.user_metadata?.avatar_url ?? null,
      role: isFirstUser ? 'admin' : 'staff',
      isActive: true,
    }).returning()

    if (isFirstUser) {
      const allProperties = await tx
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.orgId, orgId))

      if (allProperties.length > 0) {
        await tx.insert(propertyAssignments).values(
          allProperties.map((property) => ({ userId: user.id, propertyId: property.id }))
        )
      }
    }

    return { profile, created: true }
  })
}
