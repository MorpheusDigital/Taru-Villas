import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getProfile } from '@/lib/auth/guards'
import { deleteVehicle } from '@/lib/db/queries/fleet'
import { saveVehicle, VehicleValidationError } from '@/lib/db/queries/vehicle-renewals'
import { vehiclePatchSchema } from '@/lib/fleet/vehicle-compliance'
import { db } from '@/lib/db'
import { vehicles } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

const updateSchema = vehiclePatchSchema

// Task 6's updateVehicle/deleteVehicle take a bare id with no org filter, so
// this route is the only thing standing between an admin of one org and a
// vehicle belonging to another. Verify org ownership before every mutation.
async function vehicleBelongsToOrg(id: string, orgId: string) {
  const rows = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)))
    .limit(1)
  return rows.length > 0
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!(await vehicleBelongsToOrg(id, profile.orgId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    try {
      const updated = await saveVehicle(profile.orgId, parsed.data, id)
      if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json(updated)
    } catch (e) {
      if (e instanceof VehicleValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
      // A rename onto an existing (orgId, name) pair hits vehicles_org_name_unique.
      const code = (e as { code?: string }).code
      if (code === '23505') {
        return NextResponse.json(
          { error: 'A vehicle with that name already exists' },
          { status: 409 },
        )
      }
      throw e
    }
  } catch (error) {
    console.error('PATCH /api/fleet/vehicles/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update vehicle' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!(await vehicleBelongsToOrg(id, profile.orgId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const deleted = await deleteVehicle(id)
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    // A vehicle referenced by a dispatch is protected by ON DELETE RESTRICT.
    const code = (error as { code?: string }).code
    if (code === '23503') {
      return NextResponse.json(
        { error: 'This vehicle has dispatches or renewal history and cannot be deleted. Set it to retired instead.' },
        { status: 409 },
      )
    }
    console.error('DELETE /api/fleet/vehicles/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete vehicle' }, { status: 500 })
  }
}
