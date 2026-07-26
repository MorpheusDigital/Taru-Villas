import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDriverByToken } from '@/lib/db/queries/fleet'
import { saveSubscription } from '@/lib/db/queries/notifications'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ token: string }> }

const subscriptionSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

/**
 * Public, token-authenticated subscribe. The body is attacker-controlled, so
 * `endpoint`/`p256dh`/`auth` are validated as non-empty strings before ever
 * reaching the database — an unvalidated blob is never stored.
 *
 * `saveSubscription` is called with `driverId` only; `profileId` is never
 * passed. `push_subscriptions` carries a CHECK constraint requiring exactly
 * one of `profile_id`/`driver_id` to be non-null — passing both, or neither,
 * would raise a constraint violation that surfaces as a 500. Omitting
 * `profileId` here means `SaveSubscriptionInput` defaults it to `null` while
 * `driverId` is always this token's own driver, so exactly one owner is set
 * on every call.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params
    const driver = await getDriverByToken(token)
    if (!driver || !driver.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    await saveSubscription({
      driverId: driver.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: request.headers.get('user-agent'),
    })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error('POST /api/fleet/driver/[token]/push error:', error)
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }
}
