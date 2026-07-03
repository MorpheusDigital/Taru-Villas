export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { requireAuth, getUserProperties } from '@/lib/auth/guards'
import { getAssetById } from '@/lib/db/queries/assets'
import { getMaintenanceLogsForAsset } from '@/lib/db/queries/maintenance'
import { AssetDetail } from '@/components/assets/asset-detail'

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireAuth()
  if (!profile) return null

  const showFinancials = profile.role !== 'staff'
  const asset = await getAssetById(id, showFinancials)
  if (!asset) notFound()

  if (profile.role === 'property_manager') {
    const userProps = await getUserProperties(profile.id, profile.role)
    if (userProps && !userProps.includes(asset.propertyId)) {
      redirect('/assets/directory')
    }
  }

  const rawLogs = await getMaintenanceLogsForAsset(id)
  // repairCost is a financial figure — strip it before it ever reaches the
  // client props payload for staff. The component render-gates on
  // showFinancials too, but that only hides the DOM output; the prop value
  // is still serialized into the page source unless we strip it here.
  const logs = showFinancials ? rawLogs : rawLogs.map((l) => ({ ...l, repairCost: null }))

  return (
    <AssetDetail
      asset={asset}
      logs={logs}
      showFinancials={showFinancials}
      canEdit={profile.role !== 'staff'}
      canDelete={profile.role === 'admin'}
    />
  )
}
