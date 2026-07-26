import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { cancelRequest, getRequestById, updateRequest } from '@/lib/db/queries/dispatches'
import type { NewFleetRequest } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  targetPropertyId: z.string().uuid().nullable().optional(),
  originText: z.string().max(500).nullable().optional(),
  destinationText: z.string().max(500).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paxCount: z.number().int().min(0).max(60).optional(),
  cargoRequired: z.boolean().optional(),
  purpose: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })

    // getRequestById takes a bare id with no org filter, so this route is the
    // only barrier between a user and another org's request. 404 (not 403)
    // for a foreign-org id, so the endpoint does not confirm the id exists.
    const existing = await getRequestById(id)
    if (!existing || existing.orgId !== profile.orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isOwner = existing.requestedBy === profile.id
    const isFleetAdmin = profile.isFleetAdmin || profile.role === 'admin'
    if (!isOwner && !isFleetAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending requests can be edited. Cancel and raise a new one.' },
        { status: 409 },
      )
    }

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    // Whitelist the editable fields explicitly rather than spreading
    // parsed.data straight through. updateRequest() takes a bare
    // Partial<NewFleetRequest> and will write ANY column it is handed —
    // including orgId, status, and requestedBy. Today's schema doesn't list
    // those fields, so nothing leaks, but that safety must live here in the
    // route, not merely in the current shape of updateSchema.
    const data = parsed.data
    const updatePayload: Partial<NewFleetRequest> = {
      targetPropertyId: data.targetPropertyId,
      originText: data.originText,
      destinationText: data.destinationText,
      startDate: data.startDate,
      endDate: data.endDate,
      paxCount: data.paxCount,
      cargoRequired: data.cargoRequired,
      purpose: data.purpose,
      notes: data.notes,
    }

    return NextResponse.json(await updateRequest(id, updatePayload))
  } catch (error) {
    console.error('PATCH /api/fleet/requests/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })

    const existing = await getRequestById(id)
    if (!existing || existing.orgId !== profile.orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isOwner = existing.requestedBy === profile.id
    const isFleetAdmin = profile.isFleetAdmin || profile.role === 'admin'
    if (!isOwner && !isFleetAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // A dispatched request can only be cancelled by a fleet admin — the
    // vehicle is already committed and the driver has been notified.
    if (existing.status === 'dispatched' && !isFleetAdmin) {
      return NextResponse.json(
        { error: 'This trip is already dispatched. Ask a fleet admin to cancel it.' },
        { status: 409 },
      )
    }

    return NextResponse.json(await cancelRequest(id))
  } catch (error) {
    console.error('DELETE /api/fleet/requests/[id] error:', error)
    return NextResponse.json({ error: 'Failed to cancel request' }, { status: 500 })
  }
}
