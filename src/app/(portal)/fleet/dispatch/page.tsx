import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { listDispatches, listRequests } from '@/lib/db/queries/dispatches'
import { listDrivers, listVehicles } from '@/lib/db/queries/fleet'
import { driverHasSubscription } from '@/lib/db/queries/notifications'
import { DispatchBoard } from '@/components/fleet/dispatch-board'

export const dynamic = 'force-dynamic'

export default async function DispatchPage() {
  const profile = await requireAuth()
  if (!profile) return null
  if (!profile.isFleetAdmin && profile.role !== 'admin') redirect('/fleet')

  const [dispatches, pendingRequests, vehicles, drivers] = await Promise.all([
    listDispatches(profile.orgId),
    listRequests(profile.orgId, { status: 'pending' }),
    listVehicles(profile.orgId),
    listDrivers(profile.orgId),
  ])

  const driversWithPush = await Promise.all(
    drivers.map(async (d) => ({ ...d, hasPush: await driverHasSubscription(d.id) })),
  )

  return (
    <DispatchBoard
      dispatches={dispatches}
      pendingRequests={pendingRequests}
      vehicles={vehicles}
      drivers={driversWithPush}
    />
  )
}
