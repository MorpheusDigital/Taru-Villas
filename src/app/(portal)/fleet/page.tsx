import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { listEligibleFleetTasks, listRequests } from '@/lib/db/queries/dispatches'
import { listVehicles } from '@/lib/db/queries/fleet'
import { getProperties } from '@/lib/db/queries/properties'
import { getProjects } from '@/lib/db/queries/projects'
import { getProfiles } from '@/lib/db/queries/profiles'
import { RequestsTable } from '@/components/fleet/requests-table'

export const dynamic = 'force-dynamic'

export default async function FleetPage() {
  const profile = await requireAuth()
  if (!profile) return null
  if (!profile.isActive) redirect('/login?error=inactive')

  const isFleetAdmin = profile.isFleetAdmin || profile.role === 'admin'
  if (!profile.canBookFleet && !isFleetAdmin) redirect('/surveys')

  const [requests, vehicles, properties, projects, eligibleTasks, profiles] = await Promise.all([
    listRequests(profile.orgId, isFleetAdmin ? {} : { requestedBy: profile.id }),
    listVehicles(profile.orgId),
    getProperties(profile.orgId),
    getProjects(profile.orgId),
    listEligibleFleetTasks(profile.orgId),
    getProfiles(profile.orgId),
  ])

  return (
    <RequestsTable
      requests={requests}
      vehicles={vehicles}
      properties={properties}
      projects={projects}
      eligibleTasks={eligibleTasks}
      currentUserId={profile.id}
      people={profiles.filter((person) => person.isActive).map(({ id, fullName }) => ({ id, fullName }))}
      isFleetAdmin={isFleetAdmin}
      // Mirrors POST /api/fleet/requests's own authorization check
      // (canBookFleet, or role admin) — deliberately not the same condition
      // as isFleetAdmin, which only grants review/dispatch access. Without
      // this, a fleet admin who cannot personally book trips would reach
      // this page (via the isFleetAdmin bypass above) and see a "New
      // request" button that predictably 403s on submit.
      canCreateRequest={profile.canBookFleet || profile.role === 'admin'}
    />
  )
}
