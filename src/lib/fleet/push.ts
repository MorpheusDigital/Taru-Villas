import webpush from 'web-push'
import {
  createNotification,
  deleteSubscriptionByEndpoint,
  getSubscriptionsForDriver,
  getSubscriptionsForProfile,
} from '@/lib/db/queries/notifications'

let configured = false

function configure(): boolean {
  if (configured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
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
          await deleteSubscriptionByEndpoint(sub.endpoint)
          errors.push(`stale subscription pruned (${status})`)
        } else {
          errors.push(e instanceof Error ? e.message : String(e))
        }
      }
    }
  } else {
    errors.push('VAPID keys not configured')
  }

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
}
