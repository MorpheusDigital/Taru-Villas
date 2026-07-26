import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDriverByToken } from '@/lib/db/queries/fleet'
import {
  deleteSubscriptionByEndpoint,
  getSubscriptionsForDriver,
  saveSubscription,
} from '@/lib/db/queries/notifications'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ token: string }> }

const subscriptionSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

/** A driver replacing phones should never be locked out, so the cap evicts the oldest row instead of rejecting the new one. */
const MAX_SUBSCRIPTIONS_PER_DRIVER = 5

/**
 * Rejects loopback/private-range/link-local/`.local` hosts (this includes
 * cloud metadata endpoints like 169.254.169.254). Real push services
 * (fcm.googleapis.com, updates.push.services.mozilla.com, *.push.apple.com,
 * *.windows.com) are always public HTTPS hosts, so this is a no-op for
 * legitimate subscriptions and closes off the endpoint as a blind
 * server-side-request primitive for anyone holding a driver token.
 */
function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local')) return true
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    return true
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)
  if (ipv4) {
    const a = parseInt(ipv4[1], 10)
    const b = parseInt(ipv4[2], 10)
    if (a === 0 || a === 127 || a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
  }
  return false
}

/** Not a zod `.url()` (too strict on legitimate query strings, per house style) — a manual `new URL()` parse gives control over exactly protocol + host, which is all this check needs. */
function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return !isPrivateOrLocalHost(url.hostname)
}

/**
 * Public, token-authenticated subscribe. The body is attacker-controlled, so
 * `endpoint`/`p256dh`/`auth` are validated as non-empty strings before ever
 * reaching the database — an unvalidated blob is never stored. `endpoint` is
 * further required to be an absolute `https://` URL on a public host
 * (`isAllowedPushEndpoint`), and this driver's row count is capped at
 * `MAX_SUBSCRIPTIONS_PER_DRIVER` (oldest evicted, new one always accepted) —
 * both close the same hazard: this route is the ONLY writer into
 * `push_subscriptions` in the app, on a token-only surface, and its rows are
 * later read back by `notify()` and awaited serially with a live outbound
 * HTTP request per row. Without a cap, a token holder could register an
 * unbounded number of subscriptions and stall any admin action that awaits a
 * notification (e.g. dispatch approval); without the host check, one of
 * those rows could point `notify()`'s outbound request at an internal
 * service or cloud metadata endpoint.
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

    if (!isAllowedPushEndpoint(parsed.data.endpoint)) {
      return NextResponse.json(
        { error: 'endpoint must be an https:// URL on a public host' },
        { status: 400 },
      )
    }

    // Cap this driver's row count BEFORE inserting, and only evict when the
    // new endpoint is genuinely new — re-registering an endpoint already on
    // file is an update-in-place via saveSubscription's onConflictDoUpdate,
    // not a new row, so it must never itself trigger an eviction.
    const existing = await getSubscriptionsForDriver(driver.id)
    const isNewEndpoint = !existing.some((s) => s.endpoint === parsed.data.endpoint)
    if (isNewEndpoint && existing.length >= MAX_SUBSCRIPTIONS_PER_DRIVER) {
      const oldest = [...existing].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )[0]
      if (oldest) await deleteSubscriptionByEndpoint(oldest.endpoint)
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
