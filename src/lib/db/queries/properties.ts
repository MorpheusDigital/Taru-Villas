import { eq, and, desc, ilike, or, inArray } from 'drizzle-orm'
import { db } from '..'
import {
  properties,
  propertyAssignments,
  profiles,
  surveySubmissions,
  surveyResponses,
  type Property,
  type NewProperty,
} from '../schema'

/**
 * Get all active properties for an organization.
 */
export async function getProperties(orgId: string): Promise<Property[]> {
  return db
    .select()
    .from(properties)
    .where(and(eq(properties.orgId, orgId), eq(properties.isActive, true)))
    .orderBy(properties.name)
}

/**
 * Get all properties for an organization (including inactive).
 * Used by admin property management pages.
 */
export async function getAllProperties(orgId: string): Promise<Property[]> {
  return db
    .select()
    .from(properties)
    .where(eq(properties.orgId, orgId))
    .orderBy(properties.name)
}

/**
 * Get a single property by its ID.
 */
export async function getPropertyById(id: string): Promise<Property | undefined> {
  const results = await db
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1)

  return results[0]
}

export async function getPropertyByIdForOrganization(
  id: string,
  orgId: string
): Promise<Property | undefined> {
  const results = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.orgId, orgId)))
    .limit(1)

  return results[0]
}

/**
 * Get all properties a user has access to.
 * Admins see all active properties in their org; others see only assigned properties.
 */
export async function getPropertiesForUser(userId: string): Promise<Property[]> {
  const profile = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)

  if (!profile[0]) return []

  // Admins can access every active property in their organization
  if (profile[0].role === 'admin') {
    return getProperties(profile[0].orgId)
  }

  // Non-admin users: return only properties they are assigned to
  const rows = await db
    .select({ property: properties })
    .from(propertyAssignments)
    .innerJoin(properties, eq(propertyAssignments.propertyId, properties.id))
    .where(
      and(
        eq(propertyAssignments.userId, userId),
        eq(properties.isActive, true)
      )
    )
    .orderBy(properties.name)

  return rows.map((r) => r.property)
}

/**
 * Insert a new property.
 */
export async function createProperty(
  data: NewProperty
): Promise<Property> {
  const results = await db.insert(properties).values(data).returning()
  return results[0]
}

/**
 * Update an existing property by ID.
 */
export async function updateProperty(
  id: string,
  data: Partial<Omit<NewProperty, 'id'>>
): Promise<Property | undefined> {
  const results = await db
    .update(properties)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(properties.id, id))
    .returning()

  return results[0]
}

/**
 * Permanently delete a property, its assignments, and any survey submissions.
 * Survey responses are cascade-deleted when their submission is removed.
 */
export async function deleteProperty(id: string): Promise<void> {
  // Delete survey submissions for this property (responses cascade-delete)
  await db.delete(surveySubmissions).where(eq(surveySubmissions.propertyId, id))
  // Delete property assignments
  await db.delete(propertyAssignments).where(eq(propertyAssignments.propertyId, id))
  // Delete the property itself
  await db.delete(properties).where(eq(properties.id, id))
}
