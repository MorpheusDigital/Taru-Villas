export const dynamic = 'force-dynamic'

import { requireAuth, getUserProperties } from '@/lib/auth/guards'
import { getProperties, getPropertiesForUser } from '@/lib/db/queries/properties'
import { listAssets } from '@/lib/db/queries/assets'
import { AssetDirectory } from '@/components/assets/asset-directory'

export default async function AssetDirectoryPage() {
  const profile = await requireAuth()
  if (!profile) return null

  const propertyIds = await getUserProperties(profile.id, profile.role)
  const showFinancials = profile.role !== 'staff'

  const [assets, properties] = await Promise.all([
    listAssets({ propertyIds }, showFinancials),
    profile.role === 'admin'
      ? getProperties(profile.orgId)
      : getPropertiesForUser(profile.id),
  ])

  return (
    <AssetDirectory
      assets={assets}
      properties={properties}
      showFinancials={showFinancials}
      canCreate={profile.role !== 'staff'}
    />
  )
}
