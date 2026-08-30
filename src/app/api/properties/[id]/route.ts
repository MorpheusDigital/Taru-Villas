import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getPropertyByIdForOrganization,
} from '@/lib/db/queries/properties'
import { db } from '@/lib/db'
import {
  profiles,
  properties,
  propertyAssignments,
  surveySubmissions,
} from '@/lib/db/schema'
import {
  belongsToOrganization,
  referencesBelongToOrganization,
} from '@/lib/auth/organization-scope'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const updatePropertySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  slug: z.string().min(1).max(255).optional(),
  location: z.string().max(500).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  oracleHotelId: z.string().max(50).nullable().optional(),
  menuCoverImageUrl: z.string().nullable().optional(),
  excursionCoverImageUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  primaryPmId: z.string().uuid().nullable().optional(),
  assignedUserIds: z.array(z.string().uuid()).optional(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> }

async function checkPropertyAccess(profile: { id: string; role: string }, propertyId: string) {
  if (profile.role === 'admin') return true
  const userProps = await getUserProperties(profile.id, profile.role as 'admin' | 'property_manager' | 'staff')
  if (!userProps) return true // null means admin — all access
  return userProps.includes(propertyId)
}

// ---------------------------------------------------------------------------
// GET /api/properties/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const hasAccess = await checkPropertyAccess(profile, id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden: no access to this property' }, { status: 403 })
    }

    const property = await getPropertyByIdForOrganization(id, profile.orgId)
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    return NextResponse.json(property)
  } catch (error) {
    console.error('GET /api/properties/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch property' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/properties/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    const existing = await getPropertyByIdForOrganization(id, profile.orgId)
    if (!belongsToOrganization(existing, profile.orgId)) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updatePropertySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { assignedUserIds, ...propertyData } = parsed.data
    const mutation = await db.transaction(async (tx) => {
      const uniqueAssignedUserIds = assignedUserIds === undefined
        ? undefined
        : [...new Set(assignedUserIds)]
      const referencedUserIds = [...new Set([
        ...(uniqueAssignedUserIds ?? []),
        ...(propertyData.primaryPmId ? [propertyData.primaryPmId] : []),
      ])]

      if (referencedUserIds.length > 0) {
        const referencedProfiles = await tx
          .select({ id: profiles.id, orgId: profiles.orgId })
          .from(profiles)
          .where(inArray(profiles.id, referencedUserIds))

        if (!referencesBelongToOrganization(
          referencedUserIds,
          referencedProfiles,
          profile.orgId
        )) {
          return { ok: false as const }
        }
      }

      const [updated] = await tx
        .update(properties)
        .set({ ...propertyData, updatedAt: new Date() })
        .where(and(eq(properties.id, id), eq(properties.orgId, profile.orgId)))
        .returning()

      if (uniqueAssignedUserIds !== undefined) {
        await tx
          .delete(propertyAssignments)
          .where(eq(propertyAssignments.propertyId, id))

        if (uniqueAssignedUserIds.length > 0) {
          await tx.insert(propertyAssignments).values(
            uniqueAssignedUserIds.map((userId) => ({
              userId,
              propertyId: id,
            }))
          )
        }
      }

      return { ok: true as const, updated }
    })

    if (!mutation.ok) {
      return NextResponse.json(
        { error: 'Forbidden: user does not belong to your organization' },
        { status: 403 }
      )
    }

    return NextResponse.json(mutation.updated)
  } catch (error) {
    console.error('PATCH /api/properties/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update property' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/properties/[id]
// ?hard=true → permanent delete (removes property + assignments)
// default   → soft delete (set is_active = false)
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    const existing = await getPropertyByIdForOrganization(id, profile.orgId)
    if (!belongsToOrganization(existing, profile.orgId)) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const hard = request.nextUrl.searchParams.get('hard') === 'true'

    if (hard) {
      await db.transaction(async (tx) => {
        await tx
          .delete(surveySubmissions)
          .where(eq(surveySubmissions.propertyId, id))
        await tx
          .delete(propertyAssignments)
          .where(eq(propertyAssignments.propertyId, id))
        await tx
          .delete(properties)
          .where(and(eq(properties.id, id), eq(properties.orgId, profile.orgId)))
      })
      return NextResponse.json({ success: true, deleted: id })
    }

    const [deactivated] = await db
      .update(properties)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(properties.id, id), eq(properties.orgId, profile.orgId)))
      .returning()
    return NextResponse.json(deactivated)
  } catch (error) {
    console.error('DELETE /api/properties/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete property' },
      { status: 500 }
    )
  }
}
