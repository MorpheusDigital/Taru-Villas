import { requireRole } from '@/lib/auth/guards'
import { listVehicles } from '@/lib/db/queries/fleet'
import { getProperties } from '@/lib/db/queries/properties'
import { VehiclesClient } from '@/components/fleet/vehicles-client'

export const dynamic = 'force-dynamic'

export default async function FleetVehiclesPage() {
  const profile = await requireRole(['admin'])
  const [vehicles, properties] = await Promise.all([
    listVehicles(profile.orgId),
    getProperties(profile.orgId),
  ])

  return <VehiclesClient vehicles={vehicles} properties={properties} />
}
