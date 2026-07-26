import { requireRole } from '@/lib/auth/guards'
import { listDistances } from '@/lib/db/queries/fleet'
import { getProperties } from '@/lib/db/queries/properties'
import { DistancesGrid } from '@/components/fleet/distances-grid'

export const dynamic = 'force-dynamic'

export default async function FleetDistancesPage() {
  const profile = await requireRole(['admin'])
  const [distances, properties] = await Promise.all([
    listDistances(profile.orgId),
    getProperties(profile.orgId),
  ])

  return <DistancesGrid distances={distances} properties={properties} />
}
