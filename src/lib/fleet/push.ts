import webpush from 'web-push'
import {
  createNotification,
  deleteSubscriptionByEndpoint,
  getSubscriptionsForDriver,
  getSubscriptionsForProfile,
} from '@/lib/db/queries/notifications'

let configured = false
/** Reason the last `configure()` call returned false — absent or malformed keys. */
let configureError: string | null = null

/**
 * `webpush.setVapidDetails` throws synchronously when the keys are present
 * but malformed (e.g. a subject missing a URL scheme, a mistyped key) — an
 * ops mistake, not a code bug, and a realistic one since it happens by
 * pasting a bad value into Coolify. That throw is caught here so `configure`
 * keeps its `boolean`, never-throws contract: absent and malformed keys are
 * operationally the same failure ("push is not working"), so both return
 * false and leave `configureError` for `notify()` to record as a
 * `deliveryError` instead of it propagating out silently.
 */
function configure(): boolean {
  if (configured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    configureError = 'VAPID keys not configured'
    return false
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
  } catch (e) {
    configureError = `VAPID keys invalid: ${e instanceof Error ? e.message : String(e)}`
    return false
  }
  configured = true
  configureError = null
  return true
}

export interface NotifyInput {
  orgId: string
  profileId?: string | null
  driverId?: string | null
  type: string
  title: string
  body?: string
  linkUrl?: string
}

/**
 * Records an in-app notification and attempts a push. Delivery is best-effort
 * and never throws: a failed push must not roll back the dispatch that
 * triggered it. Dead subscriptions (410/404) are pruned on discovery.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const errors: string[] = []
  let sentAt: Date | null = null

  if (configure()) {
    // The subscription lookup is a plain DB read outside the per-subscription
    // try/catch below — a connection blip there would otherwise propagate
    // straight out of notify(). Wrapping the whole configured branch (not
    // just the send loop) is what makes "never throws" true rather than
    // "never throws once we're past the lookup".
    try {
      const subs = input.driverId
        ? await getSubscriptionsForDriver(input.driverId)
        : input.profileId
          ? await getSubscriptionsForProfile(input.profileId)
          : []

      const payload = JSON.stringify({
        title: input.title,
        body: input.body ?? '',
        url: input.linkUrl ?? '/',
      })

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          )
          sentAt = new Date()
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            // Pruning a dead subscription is itself a DB write and can fail
            // (connection blip, etc.) — that failure must not escape either,
            // or a routine 410 turns into an uncaught rejection.
            try {
              await deleteSubscriptionByEndpoint(sub.endpoint)
              errors.push(`stale subscription pruned (${status})`)
            } catch (pruneError) {
              errors.push(
                `stale subscription (${status}) could not be pruned: ${
                  pruneError instanceof Error ? pruneError.message : String(pruneError)
                }`,
              )
            }
          } else {
            errors.push(e instanceof Error ? e.message : String(e))
          }
        }
      }
    } catch (e) {
      errors.push(`push delivery failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else {
    errors.push(configureError ?? 'VAPID keys not configured')
  }

  // The notification record is the last thing this function does, and by
  // this point every push-side failure has already been caught above. If
  // the insert itself fails (DB blip), there is nothing left to record the
  // failure with — log it and return rather than let it propagate, since a
  // throw here reaching the caller (a dispatch-approval flow that already
  // committed its own transaction) is exactly the double-notify hazard this
  // function exists to avoid.
  try {
    await createNotification({
      orgId: input.orgId,
      profileId: input.profileId ?? null,
      driverId: input.driverId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      linkUrl: input.linkUrl ?? null,
      channel: sentAt ? 'push' : 'in_app',
      sentAt,
      deliveryError: errors.length > 0 ? errors.join('; ') : null,
    })
  } catch (e) {
    console.error('notify(): failed to record notification', e)
  }
}
