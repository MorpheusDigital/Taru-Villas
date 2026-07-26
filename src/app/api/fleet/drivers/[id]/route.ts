import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { getProfile } from '@/lib/auth/guards'
import { deleteDriver, setDriverVehicles, updateDriver } from '@/lib/db/queries/fleet'
import { db } from '@/lib/db'
import { drivers } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  phone: z.string().max(50).nullable().optional(),
  preferredLanguage: z.enum(['en', 'si', 'ta']).optional(),
  isActive: z.boolean().optional(),
  vehicleIds: z.array(z.string().uuid()).optional(),
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
