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

  const logs = await getMaintenanceLogsForAsset(id)

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
