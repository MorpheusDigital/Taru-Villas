import { requireRole } from '@/lib/auth/guards'
import { listVehicles } from '@/lib/db/queries/fleet'
import { getAllProperties } from '@/lib/db/queries/properties'
import { VehiclesClient } from '@/components/fleet/vehicles-client'

export const dynamic = 'force-dynamic'

export default async function FleetVehiclesPage() {
  const profile = await requireRole(['admin'])
  // Admin configuration page: a vehicle can legitimately be parked at a
  // property that is currently inactive/closed, so the "currently at"
  // selector must offer every property, not just active ones.
  const [vehicles, properties] = await Promise.all([
    listVehicles(profile.orgId),
    getAllProperties(profile.orgId),
  ])

  return <VehiclesClient vehicles={vehicles} properties={properties} />
}
