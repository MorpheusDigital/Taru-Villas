export const dynamic = 'force-dynamic'

import { requireRole, getUserProperties } from '@/lib/auth/guards'
import { getDashboardData } from '@/lib/db/queries/assets'
import { buildActivityFeed } from '@/lib/assets/activity'
import { AssetDashboard } from '@/components/assets/asset-dashboard'

export default async function AssetDashboardPage() {
  const profile = await requireRole(['admin', 'property_manager'])

  const propertyIds = await getUserProperties(profile.id, profile.role)
  const data = await getDashboardData(propertyIds)
  const feed = buildActivityFeed(data.recentRaw.events)

  return <AssetDashboard data={data} feed={feed} />
}
