import { notFound, redirect } from 'next/navigation'

import { RosterPreview } from '@/components/rostering/roster-preview'
import { requireAuth } from '@/lib/auth/guards'
import { getCyclePreview } from '@/lib/db/queries/rostering-cycles'
import {
  canViewManagementCycle,
  getRosteringAccess,
} from '@/lib/rostering/access'

export const dynamic = 'force-dynamic'

export default async function RosterCyclePage({
  params,
}: {
  params: Promise<{ cycleId: string }>
}) {
  const profile = await requireAuth()
  if (!profile) return null
  if (!profile.isActive || profile.role === 'staff') redirect('/surveys')

  const { cycleId } = await params
  const [access, preview] = await Promise.all([
    getRosteringAccess(profile.id, profile.role, profile.orgId),
    getCyclePreview(profile.orgId, cycleId),
  ])
  if (
    !preview ||
    !canViewManagementCycle(
      access,
      preview.children.map((child) => child.propertyId),
    )
  ) {
    notFound()
  }

  return (
    <RosterPreview
      preview={preview}
      isAdmin={access.isAdmin}
      accessiblePropertyIds={access.propertyIds}
    />
  )
}
