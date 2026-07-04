export const dynamic = 'force-dynamic'

import { redirect, notFound } from 'next/navigation'
import { requireRole, getUserProperties } from '@/lib/auth/guards'
import { getAssetById, type AssetRow, type AssetFinancialRow } from '@/lib/db/queries/assets'
import { getProperties, getPropertiesForUser } from '@/lib/db/queries/properties'
import { AssetForm } from '@/components/assets/asset-form'

// `getAssetById(id, true)` is requested with financials, but its return type is
// a plain union (not tied to the literal argument) — narrow with a real runtime
// guard rather than a cast, mirroring the guard used in asset-directory.tsx.
function isFinancialRow(row: AssetRow | AssetFinancialRow): row is AssetFinancialRow {
  return 'netBookValue' in row
}

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireRole(['admin', 'property_manager'])
  const role: 'admin' | 'property_manager' =
    profile.role === 'admin' ? 'admin' : 'property_manager'

  const asset = await getAssetById(id, true)
  if (!asset || !isFinancialRow(asset)) notFound()

  if (role === 'property_manager') {
    const userProps = await getUserProperties(profile.id, profile.role)
    if (userProps && !userProps.includes(asset.propertyId)) {
      redirect('/assets/directory')
    }
  }

  const properties =
    role === 'admin'
      ? await getProperties(profile.orgId)
      : await getPropertiesForUser(profile.id)

  return <AssetForm mode="edit" role={role} properties={properties} initial={asset} />
}
