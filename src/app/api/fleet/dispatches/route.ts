import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { createManualDispatch, listDispatches } from '@/lib/db/queries/dispatches'
import { validateManualDispatchInput } from '@/lib/fleet/dispatch-validation'

const createSchema = z.object({
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestIds: z.array(z.string().uuid()).default([]),
  notes: z.string().max(2000).nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (!profile.isFleetAdmin && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const status = request.nextUrl.searchParams.get('status')
    const dispatches = await listDispatches(profile.orgId, {
      status: status as 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled' | undefined,
    })
    return NextResponse.json({ dispatches })
  } catch (error) {
    console.error('GET /api/fleet/dispatches error:', error)
    return NextResponse.json({ error: 'Failed to fetch dispatches' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (!profile.isFleetAdmin && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    if (parsed.data.endDate < parsed.data.startDate) {
      return NextResponse.json({ error: 'End date cannot be before the start date' }, { status: 400 })
    }

    // createManualDispatch scopes the REQUEST ids it attaches by org, but it
    // takes vehicleId/driverId as bare ids with no org filter and no licence
    // check — this route is the only barrier standing between a fleet admin
    // and another org's vehicle/driver, and between a driver and a vehicle
    // class they are not licensed for. validateManualDispatchInput runs the
    // full set of checks (org/active/licence + capacity/cargo/restricted),
    // shared with PATCH /api/fleet/dispatches/[id] so the two manual paths
    // cannot drift on what a valid pairing is.
    const validation = await validateManualDispatchInput(profile.orgId, parsed.data)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }

    const dispatch = await createManualDispatch(profile.orgId, {
      ...parsed.data,
      notes: parsed.data.notes ?? null,
    })
    return NextResponse.json(dispatch, { status: 201 })
  } catch (error) {
    console.error('POST /api/fleet/dispatches error:', error)
    return NextResponse.json({ error: 'Failed to create dispatch' }, { status: 500 })
  }
}
