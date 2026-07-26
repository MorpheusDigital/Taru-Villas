import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { getProfile } from '@/lib/auth/guards'
import { createManualDispatch, listDispatches } from '@/lib/db/queries/dispatches'
import { listDrivers, listVehicles } from '@/lib/db/queries/fleet'
import { validateVehicleForCluster } from '@/lib/fleet/constraints'
import { db } from '@/lib/db'
import { fleetRequests, profiles } from '@/lib/db/schema'

/**
 * The same set of requests createManualDispatch will actually attach — org
 * match, not cancelled — loaded here with the requester's
 * canUseRestrictedVehicles flag so the chosen vehicle can be checked against
 * the REAL attached load, not just the caller-supplied requestIds array.
 */
async function loadAttachedRequests(orgId: string, requestIds: string[]) {
  if (requestIds.length === 0) return []
  return db
    .select({
      id: fleetRequests.id,
      paxCount: fleetRequests.paxCount,
      cargoRequired: fleetRequests.cargoRequired,
      requesterCanUseRestricted: profiles.canUseRestrictedVehicles,
    })
    .from(fleetRequests)
    .leftJoin(profiles, eq(fleetRequests.requestedBy, profiles.id))
    .where(
      and(
        inArray(fleetRequests.id, requestIds),
        eq(fleetRequests.orgId, orgId),
        ne(fleetRequests.status, 'cancelled'),
      ),
    )
}

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
    // class they are not licensed for. The engine enforces the licence rule
    // (eligibleDriversFor requires vehicleIds.includes(vehicleId)) for every
    // dispatch it plans; the manual path must enforce the same rule or it
    // becomes the way to bypass a legal/safety constraint, not just a
    // preference.
    const [orgVehicles, orgDrivers] = await Promise.all([
      listVehicles(profile.orgId),
      listDrivers(profile.orgId),
    ])

    const vehicle = orgVehicles.find((v) => v.id === parsed.data.vehicleId)
    if (!vehicle) {
      return NextResponse.json({ error: 'Unknown vehicle.' }, { status: 400 })
    }
    // Must match the engine's own eligibility filter (constraints.ts: usable()
    // only ever plans against status === 'active') — a `maintenance` vehicle
    // is excluded from automatic planning, so the manual path must reject it
    // too, or hand-assignment becomes the way to put a vehicle that's
    // physically in the garage back on the road.
    if (vehicle.status !== 'active') {
      const reason = vehicle.status === 'maintenance' ? 'is in maintenance' : 'is retired'
      return NextResponse.json(
        { error: `${vehicle.name} ${reason} and cannot be dispatched.` },
        { status: 400 },
      )
    }

    const driver = orgDrivers.find((d) => d.id === parsed.data.driverId)
    if (!driver) {
      return NextResponse.json({ error: 'Unknown driver.' }, { status: 400 })
    }
    if (!driver.isActive) {
      return NextResponse.json({ error: 'This driver is inactive and cannot be dispatched.' }, { status: 400 })
    }
    if (!driver.vehicleIds.includes(vehicle.id)) {
      return NextResponse.json(
        { error: `${driver.fullName} is not licensed for ${vehicle.name}.` },
        { status: 400 },
      )
    }

    // Same class as the org/active/licence checks above: the manual path
    // must also match eligibleVehiclesFor's remaining rules (constraints.ts)
    // — total attached passengers vs seats, a cargo request on a non-cargo
    // vehicle, and a restricted vehicle with no cleared requester aboard —
    // or hand-assignment stays the way to put five people on a one-seat
    // lorry. validateVehicleForCluster is the exact function
    // eligibleVehiclesFor uses internally, so the engine and this route
    // cannot drift apart on what "eligible" means.
    const attachedRequests = await loadAttachedRequests(profile.orgId, parsed.data.requestIds)
    const clusterCheck = validateVehicleForCluster(vehicle, {
      totalPax: attachedRequests.reduce((sum, r) => sum + r.paxCount, 0),
      cargoRequired: attachedRequests.some((r) => r.cargoRequired),
      allowsRestricted: attachedRequests.some((r) => r.requesterCanUseRestricted),
    })
    if (!clusterCheck.ok) {
      return NextResponse.json({ error: clusterCheck.error }, { status: 400 })
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
