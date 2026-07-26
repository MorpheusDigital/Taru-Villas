import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '..'
import { notifications, pushSubscriptions } from '../schema'

export interface SaveSubscriptionInput {
  profileId?: string | null
  driverId?: string | null
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}

export async function saveSubscription(input: SaveSubscriptionInput) {
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      profileId: input.profileId ?? null,
      driverId: input.driverId ?? null,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh: input.p256dh,
        auth: input.auth,
        lastSeenAt: new Date(),
      },
    })
    .returning()
  return row
}

export async function deleteSubscriptionByEndpoint(endpoint: string) {
  const [deleted] = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .returning()
  return deleted
}

export async function getSubscriptionsForProfile(profileId: string) {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.profileId, profileId))
}

export async function getSubscriptionsForDriver(driverId: string) {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.driverId, driverId))
}

/** Used by the dispatch board to show which drivers can actually be reached. */
export async function driverHasSubscription(driverId: string) {
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.driverId, driverId))
    .limit(1)
  return rows.length > 0
}

export async function createNotification(data: {
  orgId: string
  profileId?: string | null
  driverId?: string | null
  type: string
  title: string
  body?: string | null
  linkUrl?: string | null
  channel?: string
  sentAt?: Date | null
  deliveryError?: string | null
}) {
  const [row] = await db
    .insert(notifications)
    .values({
      orgId: data.orgId,
      profileId: data.profileId ?? null,
      driverId: data.driverId ?? null,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      linkUrl: data.linkUrl ?? null,
      channel: data.channel ?? 'in_app',
      sentAt: data.sentAt ?? null,
      deliveryError: data.deliveryError ?? null,
    })
    .returning()
  return row
}

export async function listNotificationsForProfile(profileId: string, unreadOnly = false) {
  const conditions = [eq(notifications.profileId, profileId)]
  if (unreadOnly) conditions.push(isNull(notifications.readAt))
  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(50)
}

export async function markNotificationRead(id: string, profileId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.profileId, profileId)))
    .returning()
  return updated
}
