import type { DashboardData } from '@/lib/db/queries/assets'

export interface FeedItem { id: string; assetId: string; label: string; when: Date }

export function buildActivityFeed(
  events: DashboardData['recentRaw']['events'],
): FeedItem[] {
  const items = events.map((e) => {
    const by = e.actorName ? ` by ${e.actorName}` : ''
    let label: string
    switch (e.eventType) {
      case 'created': label = `${e.assetName} added${by}`; break
      case 'audited': label = `${e.assetName} verified present${by}`; break
      case 'moved': label = `${e.assetName} moved to ${e.detail ?? 'a new location'}`; break
      case 'repair_flagged': label = `${e.assetName} flagged for repair${e.detail ? `: ${e.detail}` : ''}`; break
      case 'status_changed': label = `${e.assetName} ${e.detail ?? 'status changed'}`; break
      default: label = `${e.assetName} updated${by}`
    }
    return { id: e.id, assetId: e.assetId, label, when: e.createdAt }
  })
  return items.sort((a, b) => b.when.getTime() - a.when.getTime())
}
