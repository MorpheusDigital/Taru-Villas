import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { listVehicles } from '@/lib/db/queries/fleet'
import { createRequest, listRequests } from '@/lib/db/queries/dispatches'
import { validateFleetRequest } from '@/lib/fleet/constraints'

const createSchema = z
  .object({
    requestType: z.enum(['visit', 'standalone']),
    targetPropertyId: z.string().uuid().nullable().optional(),
    originText: z.string().max(500).nullable().optional(),
    destinationText: z.string().max(500).nullable().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    paxCount: z.number().int().min(0).max(60),
    cargoRequired: z.boolean().default(false),
    purpose: z.string().max(1000).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  })
  .refine((d) => d.requestType !== 'visit' || Boolean(d.targetPropertyId), {
    message: 'A visit needs a target property',
    path: ['targetPropertyId'],
  })
  .refine((d) => d.requestType !== 'standalone' || Boolean(d.destinationText), {
    message: 'A standalone booking needs a destination',
    path: ['destinationText'],
  })

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })

    const status = request.nextUrl.searchParams.get('status')
    const scope = request.nextUrl.searchParams.get('scope') // 'mine' | 'all'

    // Only fleet admins may see the whole org's queue. A non-admin passing
    // scope=all silently falls back to their own requests rather than erroring.
    const seesAll = profile.isFleetAdmin || profile.role === 'admin'
    const requestedBy = scope === 'all' && seesAll ? undefined : profile.id

    const requests = await listRequests(profile.orgId, {
      status: status as 'pending' | 'queued' | 'dispatched' | 'completed' | 'cancelled' | undefined,
      requestedBy,
    })
    return NextResponse.json({ requests })
  } catch (error) {
    console.error('GET /api/fleet/requests error:', error)
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (!profile.canBookFleet && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    // Fleet constraint check against the real vehicle roster (§5.1). This is
    // the server-side enforcement of the cargo/capacity rules — the UI's
    // check is instant feedback only, not the source of truth.
    const fleet = await listVehicles(profile.orgId)
    const check = validateFleetRequest(
      { cargoRequired: data.cargoRequired, paxCount: data.paxCount },
      fleet.map((v) => ({
        id: v.id,
        name: v.name,
        maxPassengers: v.maxPassengers,
        cargoCapable: v.cargoCapable,
        isRestricted: v.isRestricted,
        status: v.status,
        currentLocationPropertyId: v.currentLocationPropertyId,
        sortOrder: v.sortOrder,
      })),
    )
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

    const created = await createRequest({
      orgId: profile.orgId,
      requestType: data.requestType,
      requestedBy: profile.id,
      targetPropertyId: data.requestType === 'visit' ? (data.targetPropertyId ?? null) : null,
      originText: data.originText ?? null,
      destinationText: data.requestType === 'standalone' ? (data.destinationText ?? null) : null,
      startDate: data.startDate,
      endDate: data.endDate,
      paxCount: data.paxCount,
      cargoRequired: data.cargoRequired,
      purpose: data.purpose ?? null,
      notes: data.notes ?? null,
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('POST /api/fleet/requests error:', error)
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
  }
}
