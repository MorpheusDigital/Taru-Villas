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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tvpl.morpheusds.com'

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
 * treats as 404. There is no second, divergent status check here: the Task 7
 * query functions already enforce approved/in_progress-only transitions and
 * ownership, and duplicating that logic here would only risk it drifting out
 * of sync with them.
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

    // action === 'complete'. Fetched before the write purely to get the stop
    // list for the notify loop below — it is never returned in the HTTP
    // response and never used to authorize anything. If `dispatchId` belongs
    // to another driver, `full` may still resolve here, but completeDispatch
    // (scoped by driverId) then fails to match and we return 404 before this
    // data is touched again, so nothing about another driver's trip ever
    // reaches the response or the notify loop.
    const full = await getDispatchWithStops(body.dispatchId)
    const completed = await completeDispatch(body.dispatchId, driver.id)
    if (!completed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
        if (!req || req.status === 'cancelled' || notified.has(req.requestedBy)) continue
        notified.add(req.requestedBy)
        await notify({
          orgId: completed.orgId,
          profileId: req.requestedBy,
          type: 'trip_completed',
          title: 'Trip completed',
          body: `${driver.fullName} has completed your trip.`,
          linkUrl: `${APP_URL}/fleet`,
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
