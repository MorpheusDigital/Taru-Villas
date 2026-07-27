import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import {
  approveDispatch,
  discardDraftDispatch,
  getDispatchWithStops,
  getRequestById,
  updateDraftDispatch,
} from '@/lib/db/queries/dispatches'
import { getDriverById } from '@/lib/db/queries/fleet'
import { validateManualDispatchInput } from '@/lib/fleet/dispatch-validation'
import { notify } from '@/lib/fleet/push'
import { formatDayMonth } from '@/lib/fleet/dates'

type RouteContext = { params: Promise<{ id: string }> }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tvpl.morpheusds.com'

const updateSchema = z.object({
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestIds: z.array(z.string().uuid()).default([]),
  notes: z.string().max(2000).nullable().optional(),
})

/**
 * `discardDraftDispatch`/`updateDraftDispatch` returning `undefined` is
 * ambiguous on its own: it means either "this id no longer resolves to
 * anything" (a concurrent discard, or a run-engine rebuild, deleted it in
 * the gap between this route's up-front existence check and the write
 * below) or "it still exists, just not as a draft anymore" (a concurrent
 * approval won the race). Those need different status codes — 404 for the
 * first (the id genuinely doesn't resolve to anything), 409 for the second
 * (it resolves to something, just not something this action can touch) —
 * so this re-checks existence once more before choosing.
 */
async function goneOrNotDraft(id: string, orgId: string, action: 'discarded' | 'edited') {
  const stillThere = await getDispatchWithStops(id)
  if (!stillThere || stillThere.orgId !== orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(
    { error: `Only a draft dispatch can be ${action} — this one has already been approved.` },
    { status: 409 },
  )
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (!profile.isFleetAdmin && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // approveDispatch takes a bare id with no org filter, so this route is
    // the only thing standing between a fleet admin of one org and a
    // dispatch belonging to another. 404 (not 403) for a foreign-org id, so
    // the endpoint does not confirm the id exists — same pattern as
    // requests/[id]/route.ts. Fetching with stops here (rather than a
    // lighter existence check) also gives the notify block below its stop
    // list for free, since approveDispatch never touches dispatch_stops.
    const existing = await getDispatchWithStops(id)
    if (!existing || existing.orgId !== profile.orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const approved = await approveDispatch(id, profile.id)
    if (!approved) {
      return NextResponse.json(
        { error: 'Dispatch is not in draft status and cannot be approved' },
        { status: 409 },
      )
    }

    // Notifications are best-effort and run AFTER the approval has already
    // committed. notify() is designed never to throw, but the whole block is
    // wrapped anyway: if a notification problem ever surfaced as a failed
    // approval, an admin would retry the request and double-dispatch the
    // same trip. The HTTP response below must never depend on this
    // succeeding.
    try {
      const window = `${formatDayMonth(approved.startDate)}–${formatDayMonth(approved.endDate)}`

      // /d/ (no token) is not a route — the driver has no account and no
      // session, so `sw.js`'s notificationclick handler falling back to
      // openWindow() on that URL would land them on /login. The driver's
      // own token-scoped manifest link is the only thing that works; do not
      // log the token or return it in the response body below.
      const driver = await getDriverById(approved.driverId)
      if (driver) {
        await notify({
          orgId: profile.orgId,
          driverId: approved.driverId,
          type: 'dispatch_assigned',
          title: 'New trip assigned',
          body: `You have a trip on ${window}. Open your manifest for details.`,
          linkUrl: `${APP_URL}/d/${driver.accessToken}`,
        })
      }

      // A dispatch can carry several stops from the SAME requester (pooled
      // legs for one guest, or one requester with two visit legs) —
      // deduplicate by profile id before sending, or that person gets one
      // push per stop for what is, to them, a single trip.
      const notified = new Set<string>()
      for (const stop of existing.stops) {
        if (!stop.requestId) continue
        const req = await getRequestById(stop.requestId)
        // approveDispatch deliberately refuses to flip a cancelled request to
        // 'dispatched' (its fleetRequests update is guarded by
        // ne(status, 'cancelled')) — the notify loop must honour the same
        // rule, or a requester who cancelled still gets "Your trip is
        // confirmed" for a trip that is still `cancelled` in the database.
        if (!req || req.status === 'cancelled' || notified.has(req.requestedBy)) continue
        notified.add(req.requestedBy)
        await notify({
          orgId: profile.orgId,
          profileId: req.requestedBy,
          type: 'request_dispatched',
          title: 'Your trip is confirmed',
          body: `Transport confirmed for ${window}.`,
          linkUrl: `${APP_URL}/fleet`,
        })
      }
    } catch (notifyError) {
      console.error('Dispatch approved but notification failed:', notifyError)
    }

    return NextResponse.json(approved)
  } catch (error) {
    console.error('POST /api/fleet/dispatches/[id] error:', error)
    return NextResponse.json({ error: 'Failed to approve dispatch' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (!profile.isFleetAdmin && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // discardDraftDispatch takes a bare id + orgId with no further scoping,
    // so this route is the only thing standing between a fleet admin of one
    // org and a dispatch belonging to another — same pattern as the POST
    // handler above and requests/[id]/route.ts. 404 (not 403) for a
    // foreign-org id, so the endpoint does not confirm the id exists.
    const existing = await getDispatchWithStops(id)
    if (!existing || existing.orgId !== profile.orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const discarded = await discardDraftDispatch(id, profile.orgId)
    if (!discarded) {
      return goneOrNotDraft(id, profile.orgId, 'discarded')
    }

    return NextResponse.json(discarded)
  } catch (error) {
    console.error('DELETE /api/fleet/dispatches/[id] error:', error)
    return NextResponse.json({ error: 'Failed to discard dispatch' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (!profile.isFleetAdmin && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    if (parsed.data.endDate < parsed.data.startDate) {
      return NextResponse.json({ error: 'End date cannot be before the start date' }, { status: 400 })
    }

    // Same org-ownership pattern as POST/DELETE above: 404, not 403, for a
    // foreign-org id, so the endpoint does not confirm the id exists.
    const existing = await getDispatchWithStops(id)
    if (!existing || existing.orgId !== profile.orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only a draft dispatch can be edited — this one has already been approved.' },
        { status: 409 },
      )
    }

    // The exact same rules POST /api/fleet/dispatches runs before creating
    // a dispatch — org/active/licence on the vehicle+driver pairing, and
    // capacity/cargo/restricted-access on the vehicle against the requests
    // that will end up attached. Without this, PATCH would be the one
    // manual path that lets a fleet admin move a dispatch onto a
    // vehicle/driver pairing (or an overloaded vehicle) the create route
    // already refuses — the same class of drift the run-engine/manual-
    // create split had to be closed for earlier in this feature.
    const validation = await validateManualDispatchInput(profile.orgId, parsed.data)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }

    // `notes` gets create-shaped semantics from `parsed.data.notes ?? null`
    // if applied unconditionally — a PATCH body that simply doesn't mention
    // notes (the dialog never sends it today) would then wipe an existing
    // note rather than leaving it alone. `hasOwnProperty` (not `??`)
    // distinguishes "caller sent an explicit null to clear the note" from
    // "caller didn't touch this field", the same pattern
    // requests/[id]/route.ts already uses for targetPropertyId/
    // destinationText — only spread the key through when it was actually
    // present in the request body.
    const hasNotes = Object.prototype.hasOwnProperty.call(parsed.data, 'notes')
    const updated = await updateDraftDispatch(id, profile.orgId, {
      vehicleId: parsed.data.vehicleId,
      driverId: parsed.data.driverId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      requestIds: parsed.data.requestIds,
      ...(hasNotes ? { notes: parsed.data.notes } : {}),
    })
    if (!updated) {
      // A concurrent approval/discard won the race between the checks
      // above and this write — caught at the transaction boundary instead
      // of the up-front status check.
      return goneOrNotDraft(id, profile.orgId, 'edited')
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/fleet/dispatches/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update dispatch' }, { status: 500 })
  }
}
