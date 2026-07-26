import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { getProfile } from '@/lib/auth/guards'
import {
  deleteDriver, listVehicles, setDriverVehicles, updateDriver,
} from '@/lib/db/queries/fleet'
import { db } from '@/lib/db'
import { drivers } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  phone: z.string().max(50).nullable().optional(),
  preferredLanguage: z.enum(['en', 'si', 'ta']).optional(),
  isActive: z.boolean().optional(),
  vehicleIds: z.array(z.string().uuid()).optional()
    .transform((ids) => (ids ? Array.from(new Set(ids)) : ids)),
})

// Task 6's updateDriver/deleteDriver take a bare id with no org filter, so
// this route is the only thing standing between an admin of one org and a
// driver belonging to another. Verify org ownership before every mutation.
async function driverBelongsToOrg(id: string, orgId: string) {
  const rows = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(and(eq(drivers.id, id), eq(drivers.orgId, orgId)))
    .limit(1)
  return rows.length > 0
}

/**
 * Returns the subset of vehicleIds that do not belong to this org, so
 * callers can reject a bad payload with a useful 400 before mutating
 * anything (an unknown or cross-org id would otherwise surface as a bare
 * 500 from the driver_vehicles foreign key, after the driver row itself
 * had already been updated).
 */
async function findInvalidVehicleIds(orgId: string, vehicleIds: string[]) {
  if (vehicleIds.length === 0) return []
  const orgVehicles = await listVehicles(orgId)
  const validIds = new Set(orgVehicles.map((v) => v.id))
  return vehicleIds.filter((id) => !validIds.has(id))
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!(await driverBelongsToOrg(id, profile.orgId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    // vehicleIds is handled separately: absent means "leave licences alone",
    // present (including []) means "replace the licence set".
    const { vehicleIds, ...rest } = parsed.data

    // Validate before touching the driver row at all — a bad vehicle id
    // must not leave the name/phone/etc. update committed while the
    // licence write fails underneath it.
    if (vehicleIds !== undefined) {
      const invalidIds = await findInvalidVehicleIds(profile.orgId, vehicleIds)
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: `Unknown vehicle id(s): ${invalidIds.join(', ')}` },
          { status: 400 },
        )
      }
    }

    const updated = await updateDriver(id, rest)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (vehicleIds !== undefined) {
      await setDriverVehicles(id, vehicleIds)
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/fleet/drivers/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!(await driverBelongsToOrg(id, profile.orgId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const deleted = await deleteDriver(id)
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    // A driver referenced by a dispatch is protected by ON DELETE RESTRICT.
    const code = (error as { code?: string }).code
    if (code === '23503') {
      return NextResponse.json(
        { error: 'This driver has dispatches and cannot be deleted. Set them to inactive instead.' },
        { status: 409 },
      )
    }
    console.error('DELETE /api/fleet/drivers/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete driver' }, { status: 500 })
  }
}
