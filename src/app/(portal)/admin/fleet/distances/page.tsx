import { requireRole } from '@/lib/auth/guards'
import { listDistances } from '@/lib/db/queries/fleet'
import { getAllProperties } from '@/lib/db/queries/properties'
import { DistancesGrid } from '@/components/fleet/distances-grid'

export const dynamic = 'force-dynamic'

export default async function FleetDistancesPage() {
  const profile = await requireRole(['admin'])
  // Admin configuration page: distances must be enterable for every
  // property, including inactive ones — otherwise lookupDistanceKm can
  // never resolve for them and pooling is permanently dead for that node.
  const [distances, properties] = await Promise.all([
    listDistances(profile.orgId),
    getAllProperties(profile.orgId),
  ])

  return <DistancesGrid distances={distances} properties={properties} />
}
