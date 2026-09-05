import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getProfileWithAssignments } from '@/lib/db/queries/profiles'
import { getProfileById } from '@/lib/db/queries/profiles'
import { getPropertiesForUser } from '@/lib/db/queries/properties'
import { getProperties } from '@/lib/db/queries/properties'
import { db } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import { redirect } from 'next/navigation'

/**
 * Deduplicated auth call — ensures only one Supabase API round-trip
 * per request even if multiple components call requireAuth().
 */
const getAuthUser = cache(async () => {
  const supabase = await createClient()
  return supabase.auth.getUser()
})

type UserRole = 'admin' | 'property_manager' | 'staff'

/**
 * Returns a mock admin profile for dev/testing when DEV_BYPASS_AUTH is set.
 */
async function getDevBypassProfile(): Promise<ProfileWithAssignments> {
  // Fetch the first org to get the real orgId
  const orgs = await db.select().from(organizations).limit(1)
  const orgId = orgs[0]?.id ?? 'dev-org-id'

  // Fetch real properties for the assignments
  const props = await getProperties(orgId)

  return {
    id: 'dev-bypass-user',
    orgId,
    email: 'admin@taruvillas.com',
    fullName: 'Dev Admin',
    role: 'admin',
    avatarUrl: null,
    isActive: true,
    isFleetAdmin: true,
    canBookFleet: true,
    canUseRestrictedVehicles: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignments: props.map((p) => ({
      assignmentId: `dev-assign-${p.id}`,
      propertyId: p.id,
      propertyName: p.name,
      propertyCode: p.code,
      propertyIsActive: p.isActive,
      assignedAt: new Date(),
    })),
  }
}

/**
 * Server-side auth guard. Returns the full profile (with property assignments)
 * for the currently authenticated user.
 *
 * Redirects to /login if there is no active Supabase session.
 * Returns null if the user has a session but no profile in the database
 * (e.g. signed in via Google but was never invited).
 */
export async function requireAuth() {
  // --- DEV BYPASS ---
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    return getDevBypassProfile()
  }

  const { data: { user }, error } = await getAuthUser()

  if (error || !user) {
    redirect('/login')
  }

  const profile = await getProfileWithAssignments(user.id)
  return profile
}

/**
 * Server-side role guard. Redirects to /login if no session, or to /
 * if the user does not have one of the required roles.
 */
export async function requireRole(roles: UserRole[]) {
  const profile = await requireAuth()

  if (!profile) {
    redirect('/login?error=no_profile')
  }

  if (!profile.isActive) {
    redirect('/login?error=inactive')
  }

  if (!roles.includes(profile.role as UserRole)) {
    redirect('/tasks')
  }

  return profile
}

/**
 * API-level auth guard (no redirect). Returns the profile or null.
 */
export async function getProfile() {
  // --- DEV BYPASS ---
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    return getDevBypassProfile()
  }

  const { data: { user }, error } = await getAuthUser()

  if (error || !user) return null

  return getProfileById(user.id)
}

/**
 * Get accessible property IDs for a user.
 * Returns null for admins (meaning all access).
 * Returns a list of property IDs for non-admin users.
 */
export async function getUserProperties(
  userId: string,
  role: UserRole
): Promise<string[] | null> {
  if (role === 'admin') return null

  const properties = await getPropertiesForUser(userId)
  return properties.map((p) => p.id)
}

/** Convenience type for the return value of getProfileWithAssignments */
export type ProfileWithAssignments = NonNullable<
  Awaited<ReturnType<typeof getProfileWithAssignments>>
>
