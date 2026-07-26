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

/** True for a.b.c.d in 0.0.0.0/8, 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, or 169.254.0.0/16 (the last covers cloud metadata endpoints like 169.254.169.254). */
function isDisallowedIPv4(a: number, b: number): boolean {
  if (a === 0 || a === 127 || a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  return false
}

/**
 * `addr` is the bracket-stripped, lowercased IPv6 literal from `url.hostname`
 * (WHATWG normalizes to compressed form, e.g. `::1`, `fe80::1`, `::ffff:7f00:1`
 * for an IPv4-mapped address — never the uncompressed 8-hextet form). Rejects:
 * loopback (`::1`), unspecified (`::`), unique-local `fc00::/7`, link-local
 * `fe80::/10` (by numeric range on the first hextet, not a string prefix — a
 * plain `startsWith` would also match unrelated hostnames if ever applied to
 * one, which is exactly last round's bug), and IPv4-mapped addresses
 * (`::ffff:a.b.c.d` or the hex-group form) that resolve to a disallowed IPv4
 * range — otherwise a dual-stack host lets `[::ffff:169.254.169.254]` reach
 * the same metadata endpoint the plain IPv4 check already blocks.
 */
function isDisallowedIPv6(addr: string): boolean {
  if (addr === '::1' || addr === '::') return true

  const dottedMapped = addr.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)
  if (dottedMapped) return isDisallowedIPv4(parseInt(dottedMapped[1], 10), parseInt(dottedMapped[2], 10))

  // Second hex group (low 16 bits) isn't captured — isDisallowedIPv4 only
  // ever needs octets a/b, which live entirely in the first hex group.
  const hexMapped = addr.match(/^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/)
  if (hexMapped) {
    const v1 = parseInt(hexMapped[1], 16)
    return isDisallowedIPv4((v1 >> 8) & 0xff, v1 & 0xff)
  }

  const firstHextet = addr.split(':')[0]
  const value = firstHextet ? parseInt(firstHextet, 16) : NaN
  if (!Number.isNaN(value)) {
    if (value >= 0xfc00 && value <= 0xfdff) return true // fc00::/7 unique-local
    if (value >= 0xfe80 && value <= 0xfebf) return true // fe80::/10 link-local
  }
  return false
}

/**
 * Rejects loopback/private-range/link-local/`.local` hosts. Real push
 * services (fcm.googleapis.com, updates.push.services.mozilla.com,
 * *.push.apple.com, *.windows.com) are always public HTTPS hostnames, never
 * bracketed IPv6 literals, so the IPv6-specific checks below run ONLY when
 * `hostname` is actually a `[...]`-wrapped literal (per WHATWG `URL.hostname`)
 * — applying an IPv6 prefix test like `startsWith('fc')` to every hostname
 * unconditionally is what broke every Chromium/FCM endpoint last round,
 * since `fcm.googleapis.com` also starts with `fc`.
 */
function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower.startsWith('[') && lower.endsWith(']')) {
    return isDisallowedIPv6(lower.slice(1, -1))
  }
  if (lower === 'localhost' || lower.endsWith('.local')) return true

  const ipv4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)
  if (ipv4) return isDisallowedIPv4(parseInt(ipv4[1], 10), parseInt(ipv4[2], 10))

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
