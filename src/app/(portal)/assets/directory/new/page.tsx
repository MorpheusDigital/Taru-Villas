export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth/guards'
import { getProperties, getPropertiesForUser } from '@/lib/db/queries/properties'
import { AssetForm } from '@/components/assets/asset-form'

export default async function NewAssetPage() {
  const profile = await requireRole(['admin', 'property_manager'])
  const role: 'admin' | 'property_manager' =
    profile.role === 'admin' ? 'admin' : 'property_manager'

  const properties =
    role === 'admin'
      ? await getProperties(profile.orgId)
      : await getPropertiesForUser(profile.id)

  return <AssetForm mode="create" role={role} properties={properties} />
}
