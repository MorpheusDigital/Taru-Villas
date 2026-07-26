import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { approveDispatch, getDispatchWithStops, getRequestById } from '@/lib/db/queries/dispatches'
import { notify } from '@/lib/fleet/push'
import { formatDayMonth } from '@/lib/fleet/dates'

type RouteContext = { params: Promise<{ id: string }> }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tvpl.morpheusds.com'

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

      await notify({
        orgId: profile.orgId,
        driverId: approved.driverId,
        type: 'dispatch_assigned',
        title: 'New trip assigned',
        body: `You have a trip on ${window}. Open your manifest for details.`,
        linkUrl: `${APP_URL}/d/`,
      })

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
