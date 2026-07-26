import { requireRole } from '@/lib/auth/guards'
import { listDrivers, listVehicles } from '@/lib/db/queries/fleet'
import { DriversClient } from '@/components/fleet/drivers-client'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tvpl.morpheusds.com'

export default async function FleetDriversPage() {
  const profile = await requireRole(['admin'])
  const [drivers, vehicles] = await Promise.all([
    listDrivers(profile.orgId),
    listVehicles(profile.orgId),
  ])

  return <DriversClient drivers={drivers} vehicles={vehicles} appUrl={APP_URL} />
}
