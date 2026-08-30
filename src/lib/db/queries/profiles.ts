import { eq, and } from 'drizzle-orm'
import { db } from '..'
import {
  profiles,
  propertyAssignments,
  properties,
  type Profile,
  type NewProfile,
} from '../schema'

/**
 * Get a profile by user ID.
 */
export async function getProfileById(id: string): Promise<Profile | undefined> {
  const results = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1)

  return results[0]
}

export async function getProfileByIdForOrganization(
  id: string,
  orgId: string
): Promise<Profile | undefined> {
  const results = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, id), eq(profiles.orgId, orgId)))
    .limit(1)

  return results[0]
}

/**
 * Get a profile by email address.
 */
export async function getProfileByEmail(
  email: string
): Promise<Profile | undefined> {
  const results = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1)

  return results[0]
}

/**
 * Get all profiles for an organization.
 */
export async function getProfiles(orgId: string): Promise<Profile[]> {
  return db
    .select()
    .from(profiles)
    .where(eq(profiles.orgId, orgId))
    .orderBy(profiles.fullName)
}

/**
 * Insert a new profile.
 */
export async function createProfile(data: NewProfile): Promise<Profile> {
  const results = await db.insert(profiles).values(data).returning()
  return results[0]
}

/**
 * Update an existing profile by ID.
 */
export async function updateProfile(
  id: string,
  data: Partial<Omit<NewProfile, 'id'>>
): Promise<Profile | undefined> {
  const results = await db
    .update(profiles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(profiles.id, id))
    .returning()

  return results[0]
}

/**
 * Get all profiles for an organization, each with their property assignments.
 * Used by admin user management pages.
 */
export async function getProfilesWithAssignments(orgId: string) {
  const allProfiles = await db
    .select()
    .from(profiles)
    .where(eq(profiles.orgId, orgId))
    .orderBy(profiles.fullName)

  const allAssignments = await db
    .select({
      userId: propertyAssignments.userId,
      propertyId: properties.id,
      propertyName: properties.name,
      propertyCode: properties.code,
    })
    .from(propertyAssignments)
    .innerJoin(properties, eq(propertyAssignments.propertyId, properties.id))
    .innerJoin(profiles, eq(propertyAssignments.userId, profiles.id))
    .where(eq(profiles.orgId, orgId))

  return allProfiles.map((profile) => ({
    ...profile,
    assignments: allAssignments.filter((a) => a.userId === profile.id),
  }))
}

export type ProfileWithAssignments = Awaited<
  ReturnType<typeof getProfilesWithAssignments>
>[number]

/**
 * Get a profile together with its property assignments.
 */
export async function getProfileWithAssignments(id: string) {
  const profile = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1)

  if (!profile[0]) return null

  const assignments = await db
    .select({
      assignmentId: propertyAssignments.id,
      propertyId: properties.id,
      propertyName: properties.name,
      propertyCode: properties.code,
      propertyIsActive: properties.isActive,
      assignedAt: propertyAssignments.createdAt,
    })
    .from(propertyAssignments)
    .innerJoin(properties, eq(propertyAssignments.propertyId, properties.id))
    .where(eq(propertyAssignments.userId, id))
    .orderBy(properties.name)

  return {
    ...profile[0],
    assignments,
  }
}

export async function getProfileWithAssignmentsForOrganization(
  id: string,
  orgId: string
) {
  const profile = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, id), eq(profiles.orgId, orgId)))
    .limit(1)

  if (!profile[0]) return null

  const assignments = await db
    .select({
      assignmentId: propertyAssignments.id,
      propertyId: properties.id,
      propertyName: properties.name,
      propertyCode: properties.code,
      propertyIsActive: properties.isActive,
      assignedAt: propertyAssignments.createdAt,
    })
    .from(propertyAssignments)
    .innerJoin(properties, eq(propertyAssignments.propertyId, properties.id))
    .where(and(
      eq(propertyAssignments.userId, id),
      eq(properties.orgId, orgId)
    ))
    .orderBy(properties.name)

  return { ...profile[0], assignments }
}
