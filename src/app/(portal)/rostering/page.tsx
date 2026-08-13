import { redirect } from 'next/navigation'

import { RosteringHome } from '@/components/rostering/rostering-home'
import { requireAuth } from '@/lib/auth/guards'
import { listCycles } from '@/lib/db/queries/rostering-cycles'
import { listActiveRosteringHubs } from '@/lib/db/queries/rostering-setup'
import { canGenerateHub, getRosteringAccess } from '@/lib/rostering/access'

export const dynamic = 'force-dynamic'

function currentColomboMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return `${year}-${month}`
}

export default async function RosteringPage() {
  const profile = await requireAuth()
  if (!profile) return null
  if (!profile.isActive || profile.role === 'staff') redirect('/surveys')

  const access = await getRosteringAccess(
    profile.id,
    profile.role,
    profile.orgId,
  )
  const [allHubs, cycles] = await Promise.all([
    listActiveRosteringHubs(profile.orgId),
    listCycles(profile.orgId, access.propertyIds),
  ])
  const hubs = allHubs.filter((hub) =>
    canGenerateHub(
      access,
      hub.properties.map((property) => property.id),
    ),
  )

  return (
    <RosteringHome
      hubs={hubs}
      cycles={cycles}
      defaultMonth={currentColomboMonth()}
      isAdmin={access.isAdmin}
    />
  )
}
