import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { cancelRequest, getRequestById, updateRequest } from '@/lib/db/queries/dispatches'
import { getDriverById, listVehicles } from '@/lib/db/queries/fleet'
import { validateFleetRequest } from '@/lib/fleet/constraints'
import { notify } from '@/lib/fleet/push'
import type { NewFleetRequest } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tvpl.morpheusds.com'

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

    const data = parsed.data

    // Fix 1: date-range coherence — the same rule createSchema's `.refine`
    // applies at creation (endDate >= startDate), re-checked against the
    // EFFECTIVE dates: the incoming value where the caller supplied one,
    // else the value already on the row. A PATCH touching only `endDate`
    // must still be checked against the stored `startDate` (and vice
    // versa), or `{ endDate: '2026-08-01' }` on a 20–22 Aug request would
    // silently invert the window — the engine's horizon filter reads an
    // inverted window as "already passed" and stealth-stalls it
    // unassignable while the requester believes the trip is booked.
    const effectiveStartDate = data.startDate ?? existing.startDate
    const effectiveEndDate = data.endDate ?? existing.endDate
    if (effectiveEndDate < effectiveStartDate) {
      return NextResponse.json(
        { error: 'End date cannot be before the start date' },
        { status: 400 },
      )
    }

    // Fix 2: requestType coherence — the same rules POST applies (createSchema's
    // refine requiring the field for this request's type, plus the ternaries
    // in POST's createRequest call that null out the field that doesn't
    // belong). requestType itself isn't editable via PATCH, so it's fixed at
    // existing.requestType. `hasOwnProperty` (not `??`) distinguishes "caller
    // sent an explicit null to clear this field" from "caller didn't touch
    // this field" — both fields are nullable, so `??` would treat an
    // explicit clear the same as "not provided" and silently keep the old
    // value, defeating the very check below.
    const hasTargetPropertyId = Object.prototype.hasOwnProperty.call(data, 'targetPropertyId')
    const hasDestinationText = Object.prototype.hasOwnProperty.call(data, 'destinationText')
    const effectiveTargetPropertyId = hasTargetPropertyId ? data.targetPropertyId : existing.targetPropertyId
    const effectiveDestinationText = hasDestinationText ? data.destinationText : existing.destinationText

    if (existing.requestType === 'visit' && !effectiveTargetPropertyId) {
      return NextResponse.json({ error: 'A visit needs a target property' }, { status: 400 })
    }
    if (existing.requestType === 'standalone' && !effectiveDestinationText) {
      return NextResponse.json({ error: 'A standalone booking needs a destination' }, { status: 400 })
    }

    // Whitelist the editable fields explicitly rather than spreading
    // parsed.data straight through. updateRequest() takes a bare
    // Partial<NewFleetRequest> and will write ANY column it is handed —
    // including orgId, status, and requestedBy. Today's schema doesn't list
    // those fields, so nothing leaks, but that safety must live here in the
    // route, not merely in the current shape of updateSchema.
    //
    // targetPropertyId/destinationText are forced to the coherent value for
    // this row's fixed requestType (null on the side that doesn't apply),
    // exactly like POST's own ternaries — not just left as whatever the
    // caller sent. Without this, `{ targetPropertyId: '<uuid>' }` on a
    // standalone request would pass the required-field check above (its
    // destinationText is untouched and still present) yet still smuggle a
    // property onto a request whose type says it shouldn't have one — the
    // "mirror case" that pools/dispatches against the wrong location.
    const updatePayload: Partial<NewFleetRequest> = {
      targetPropertyId: existing.requestType === 'visit' ? effectiveTargetPropertyId : null,
      originText: data.originText,
      destinationText: existing.requestType === 'standalone' ? effectiveDestinationText : null,
      startDate: data.startDate,
      endDate: data.endDate,
      paxCount: data.paxCount,
      cargoRequired: data.cargoRequired,
      purpose: data.purpose,
      notes: data.notes,
    }

    // Re-run the cargo/capacity rule (§5.1) against the EFFECTIVE values —
    // the incoming field where the caller supplied one, else the value
    // already on the row. A PATCH touching only paxCount must still be
    // checked against the request's stored cargoRequired, and vice versa,
    // or `{ paxCount: 5 }` on an existing cargoRequired: true request would
    // sail through unchecked. This must run — and fail closed — before
    // updateRequest() so a rejected edit never leaves a partial write.
    const effectiveCargoRequired = data.cargoRequired ?? existing.cargoRequired
    const effectivePaxCount = data.paxCount ?? existing.paxCount

    const fleet = await listVehicles(profile.orgId)
    const check = validateFleetRequest(
      { cargoRequired: effectiveCargoRequired, paxCount: effectivePaxCount },
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

    // Fix 3: a completed trip already happened — cancelling it after the
    // fact would flip a real trip to `cancelled` with no admin involved and
    // no audit trail, and it would drop out of completed-trip reporting.
    // Unlike `dispatched` below, this has no admin override: it isn't a
    // permission gap, it's a state this endpoint must never be able to
    // reverse.
    if (existing.status === 'completed') {
      return NextResponse.json(
        { error: 'This trip has already been completed and cannot be cancelled.' },
        { status: 409 },
      )
    }

    // Re-cancelling an already-cancelled request used to succeed silently
    // (and bump updatedAt), which reads as "just cancelled it" when nothing
    // changed. Fail with 409 instead.
    if (existing.status === 'cancelled') {
      return NextResponse.json({ error: 'This request is already cancelled.' }, { status: 409 })
    }

    // A dispatched request can only be cancelled by a fleet admin — the
    // vehicle is already committed and the driver has been notified.
    if (existing.status === 'dispatched' && !isFleetAdmin) {
      return NextResponse.json(
        { error: 'This trip is already dispatched. Ask a fleet admin to cancel it.' },
        { status: 409 },
      )
    }

    const result = await cancelRequest(id)
    if (!result) {
      // existing was just re-fetched above and passed every check, so this
      // only fires on a genuine race (e.g. deleted between the checks and
      // the write) — treat it the same as "not found" rather than 500.
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Best-effort, and run AFTER the cancellation has already committed —
    // same shape as the approve handler's notify block. A dispatch in
    // dispatchesToNotify is already approved/in_progress, meaning its driver
    // was already told "go here"; removing the stop without telling them is
    // wrong, but a notification failure must never turn into a failed
    // cancellation (the requester would retry and could double-cancel).
    try {
      for (const d of result.dispatchesToNotify) {
        const driver = await getDriverById(d.driverId)
        if (!driver) continue
        await notify({
          orgId: profile.orgId,
          driverId: d.driverId,
          type: 'dispatch_stop_removed',
          title: 'Trip update',
          body: 'A stop was cancelled and removed from your manifest.',
          linkUrl: `${APP_URL}/d/${driver.accessToken}`,
        })
      }
    } catch (notifyError) {
      console.error('Request cancelled but notification failed:', notifyError)
    }

    return NextResponse.json(result.request)
  } catch (error) {
    console.error('DELETE /api/fleet/requests/[id] error:', error)
    return NextResponse.json({ error: 'Failed to cancel request' }, { status: 500 })
  }
}
