import { and, asc, eq } from 'drizzle-orm'

import { db } from '../db'
import { properties, propertyAssignments } from '../db/schema'

export interface RosteringAccess {
  isAdmin: boolean
  propertyIds: string[] | null
  canManage: boolean
}

export function canGenerateHub(
  access: RosteringAccess,
  activePropertyIds: string[],
): boolean {
  if (!access.canManage) return false
  if (access.isAdmin) return true

  const assigned = new Set(access.propertyIds ?? [])
  return activePropertyIds.every((propertyId) => assigned.has(propertyId))
}

export function canViewManagementCycle(
  access: RosteringAccess,
  childPropertyIds: string[],
): boolean {
  if (!access.canManage) return false
  if (access.isAdmin) return true

  const assigned = new Set(access.propertyIds ?? [])
  return childPropertyIds.some((propertyId) => assigned.has(propertyId))
}

export async function getRosteringAccess(
  profileId: string,
  role: 'admin' | 'property_manager' | 'staff',
  orgId: string,
): Promise<RosteringAccess> {
  if (role === 'admin') {
    return { isAdmin: true, propertyIds: null, canManage: true }
  }

  if (role !== 'property_manager') {
    return { isAdmin: false, propertyIds: [], canManage: false }
  }

  const rows = await db
    .select({ propertyId: propertyAssignments.propertyId })
    .from(propertyAssignments)
    .innerJoin(
      properties,
      and(
        eq(properties.id, propertyAssignments.propertyId),
        eq(properties.orgId, orgId),
      ),
    )
    .where(eq(propertyAssignments.userId, profileId))
    .orderBy(asc(propertyAssignments.propertyId))

  return {
    isAdmin: false,
    propertyIds: rows.map((row) => row.propertyId),
    canManage: true,
  }
}
