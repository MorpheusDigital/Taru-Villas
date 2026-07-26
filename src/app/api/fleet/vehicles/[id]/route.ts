import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { getProfile } from '@/lib/auth/guards'
import { deleteVehicle, updateVehicle } from '@/lib/db/queries/fleet'
import { db } from '@/lib/db'
import { vehicles } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  registrationNo: z.string().max(50).nullable().optional(),
  maxPassengers: z.number().int().min(0).max(60).optional(),
  cargoCapable: z.boolean().optional(),
  isRestricted: z.boolean().optional(),
  status: z.enum(['active', 'maintenance', 'retired']).optional(),
  currentLocationPropertyId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

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

    const updated = await updateVehicle(id, parsed.data)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(updated)
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
        { error: 'This vehicle has dispatches and cannot be deleted. Set it to retired instead.' },
        { status: 409 },
      )
    }
    console.error('DELETE /api/fleet/vehicles/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete vehicle' }, { status: 500 })
  }
}
