import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { listEligibleFleetTasks, listMyRides } from '@/lib/db/queries/dispatches'
import { listVehicles } from '@/lib/db/queries/fleet'
import { getProperties } from '@/lib/db/queries/properties'
import { getProjects } from '@/lib/db/queries/projects'
import { getProfiles } from '@/lib/db/queries/profiles'
import { RequestsTable } from '@/components/fleet/requests-table'

export const dynamic = 'force-dynamic'

export default async function MyRidesPage() {
  const profile = await requireAuth()
  if (!profile) return null
  if (!profile.isActive) redirect('/login?error=inactive')
  const requests = await listMyRides(profile.orgId, profile.id)
  const canCreateRequest = profile.canBookFleet || profile.role === 'admin'
  const canEditRequest = canCreateRequest || requests.some(request => request.requestedBy === profile.id && request.status === 'pending')
  const [vehicles, properties, projects, eligibleTasks, people] = canEditRequest ? await Promise.all([
    listVehicles(profile.orgId), getProperties(profile.orgId), getProjects(profile.orgId),
    listEligibleFleetTasks(profile.orgId), getProfiles(profile.orgId),
  ]) : [[], [], [], [], []]
  return <RequestsTable personalView requests={requests} vehicles={vehicles} properties={properties}
    projects={projects} eligibleTasks={eligibleTasks} currentUserId={profile.id}
    people={people.filter(person => person.isActive).map(({ id, fullName }) => ({ id, fullName }))}
    isFleetAdmin={false} canCreateRequest={canCreateRequest} />
}
