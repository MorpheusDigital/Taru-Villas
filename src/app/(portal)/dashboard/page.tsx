export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth/guards'
import { getOrgUtilityKpiRollup } from '@/lib/db/queries/dashboard'
import { ConsolidatedDashboard, type DashboardFilters } from '@/components/dashboard/consolidated-dashboard'
import { UtilityKpiRollup } from '@/components/dashboard/utility-kpi-rollup'

export default async function DashboardPage({searchParams}:{searchParams:Promise<DashboardFilters>}) {
  const profile=await requireRole(['admin'])
  const [filters,rollup]=await Promise.all([searchParams,getOrgUtilityKpiRollup(profile.orgId)])
  return <div className="space-y-6"><ConsolidatedDashboard orgId={profile.orgId} filters={filters} /><UtilityKpiRollup rollup={rollup} /></div>
}
