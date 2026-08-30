import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { getProfile } from '@/lib/auth/guards'
import {
  getProfileByIdForOrganization,
} from '@/lib/db/queries/profiles'
import { getProfileWithAssignmentsForOrganization } from '@/lib/db/queries/profiles'
import { db } from '@/lib/db'
import { profiles, properties, propertyAssignments } from '@/lib/db/schema'
import {
  belongsToOrganization,
  referencesBelongToOrganization,
} from '@/lib/auth/organization-scope'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const updateUserSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  role: z.enum(['admin', 'property_manager', 'staff']).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().optional(),
  propertyIds: z.array(z.string().uuid()).optional(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// GET /api/users/[id]
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

    // Users can view their own profile; admins can view any profile
    if (profile.role !== 'admin' && profile.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const user = await getProfileWithAssignmentsForOrganization(id, profile.orgId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error('GET /api/users/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/users/[id]
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

    const existing = await getProfileByIdForOrganization(id, profile.orgId)
    if (!belongsToOrganization(existing, profile.orgId)) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { propertyIds, ...profileData } = parsed.data

    const mutation = await db.transaction(async (tx) => {
      const uniquePropertyIds = propertyIds === undefined
        ? undefined
        : [...new Set(propertyIds)]

      if (uniquePropertyIds && uniquePropertyIds.length > 0) {
        const referencedProperties = await tx
          .select({ id: properties.id, orgId: properties.orgId })
          .from(properties)
          .where(inArray(properties.id, uniquePropertyIds))

        if (!referencesBelongToOrganization(
          uniquePropertyIds,
          referencedProperties,
          profile.orgId
        )) {
          return { ok: false as const }
        }
      }

      if (Object.keys(profileData).length > 0) {
        await tx
          .update(profiles)
          .set({ ...profileData, updatedAt: new Date() })
          .where(and(eq(profiles.id, id), eq(profiles.orgId, profile.orgId)))
      }

      if (uniquePropertyIds !== undefined) {
        await tx
          .delete(propertyAssignments)
          .where(eq(propertyAssignments.userId, id))

        if (uniquePropertyIds.length > 0) {
          await tx.insert(propertyAssignments).values(
            uniquePropertyIds.map((propertyId) => ({
              userId: id,
              propertyId,
            }))
          )
        }
      }

      return { ok: true as const }
    })

    if (!mutation.ok) {
      return NextResponse.json(
        { error: 'Forbidden: property does not belong to your organization' },
        { status: 403 }
      )
    }

    // Return the updated profile with assignments
    const result = await getProfileWithAssignmentsForOrganization(id, profile.orgId)

    return NextResponse.json(result)
  } catch (error) {
    console.error('PATCH /api/users/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/users/[id] — Deactivate user (soft delete)
// ---------------------------------------------------------------------------

export async function DELETE(
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
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    // Prevent self-deactivation
    if (profile.id === id) {
      return NextResponse.json(
        { error: 'Cannot deactivate your own account' },
        { status: 400 }
      )
    }

    const existing = await getProfileByIdForOrganization(id, profile.orgId)
    if (!belongsToOrganization(existing, profile.orgId)) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const [deactivated] = await db
      .update(profiles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(profiles.id, id), eq(profiles.orgId, profile.orgId)))
      .returning()

    return NextResponse.json(deactivated)
  } catch (error) {
    console.error('DELETE /api/users/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to deactivate user' },
      { status: 500 }
    )
  }
}
