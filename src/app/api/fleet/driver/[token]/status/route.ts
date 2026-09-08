import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDriverByToken } from '@/lib/db/queries/fleet'
import {
  completeDispatch,
  getDispatchWithStops,
  getRequestById,
  markDispatchStarted,
  markStopArrived,
} from '@/lib/db/queries/dispatches'
import { notify } from '@/lib/fleet/push'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ token: string }> }

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), dispatchId: z.string().uuid() }),
  z.object({ action: z.literal('arrive'), stopId: z.string().uuid() }),
  z.object({ action: z.literal('complete'), dispatchId: z.string().uuid() }),
])

/**
 * Public, token-authenticated status progression. The token resolves to a
 * `driverId` that is threaded into every mutation below (markDispatchStarted,
 * markStopArrived, completeDispatch) — those queries scope their own WHERE
 * clause by driverId, so a dispatch/stop that doesn't belong to this driver
 * simply doesn't match and the query returns `undefined`, which this route
 * treats as 404. There is no second, divergent status check here: each Task 7
 * query function enforces its own guard, and duplicating any of them here
 * would only risk this route drifting out of sync with them. Precisely, per
 * function: `markDispatchStarted` and `completeDispatch` both scope by
 * `driverId` AND require `status IN (approved, in_progress)`. `markStopArrived`
 * scopes by `driverId` via the same dispatch-ids subquery pattern and also
 * requires `status IN (approved, in_progress)` (see its docstring in
 * `queries/dispatches.ts` for why `approved` is included, not just
 * `in_progress`) — so all three now reject a dispatch/stop that either isn't
 * owned by this driver or has already left the approved/in_progress window.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params
    const driver = await getDriverByToken(token)
    if (!driver || !driver.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    const body = parsed.data

    if (body.action === 'start') {
      const updated = await markDispatchStarted(body.dispatchId, driver.id)
      if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'arrive') {
      const updated = await markStopArrived(body.stopId, driver.id)
      if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ ok: true })
    }

    // action === 'complete'. Ownership is proven FIRST, by completeDispatch's
    // own driverId-scoped update, before any dispatch_stops row is read.
    // getDispatchWithStops takes a bare id with no driver filter, so it is
    // fetched only after `completed` is truthy — completeDispatch never
    // mutates dispatch_stops itself, so reading `full` afterwards returns the
    // identical stop list with the same driverId guarantee that already
    // gated the write. This way a foreign-org/foreign-driver dispatchId's
    // stops are never read into memory at all on the 404 path, rather than
    // being read-then-discarded.
    const completed = await completeDispatch(body.dispatchId, driver.id)
    if (!completed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const full = await getDispatchWithStops(body.dispatchId)

    // Notifications are best-effort and run AFTER completeDispatch has
    // already committed. A driver on a bad connection tapping "Complete"
    // twice must see the same result both times (second call 404s on the
    // now-non-approved/in_progress status) without a failed notify ever
    // turning into an error response or a second notification going out.
    try {
      const notified = new Set<string>()
      for (const stop of full?.stops ?? []) {
        if (!stop.requestId) continue
        const req = await getRequestById(stop.requestId)
        // A dispatch can carry several stops from the same requester (pooled
        // legs for one guest) — deduplicate by profile id before sending, or
        // that person gets one push per stop for what is, to them, a single
        // trip. The cancelled check runs BEFORE the dedup slot is consumed:
        // a requester with one cancelled stop and one live stop on the same
        // dispatch must still be notified for the live one, so a cancelled
        // stop must never occupy their slot in `notified`.
        if (!req || req.status === 'cancelled') continue
        const reportOwnerId = req.reportOwnerId ?? req.requestedBy
        if (notified.has(reportOwnerId)) continue
        notified.add(reportOwnerId)
        await notify({
          orgId: completed.orgId,
          profileId: reportOwnerId,
          type: 'trip_completed',
          title: 'Trip completed',
          body: `${driver.fullName} has completed your trip. Please submit your visit report within 48 hours.`,
          linkUrl: `${request.nextUrl.origin}/fleet/reports/${req.id}`,
        })
      }
    } catch (notifyError) {
      console.error('Trip completed but notification failed:', notifyError)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('POST /api/fleet/driver/[token]/status error:', error)
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }
}
