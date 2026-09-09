export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { getPropertyByIdForOrganization } from '@/lib/db/queries/properties'
import { ConsolidatedDashboard, type DashboardFilters } from '@/components/dashboard/consolidated-dashboard'

export default async function PropertyDashboardPage({params,searchParams}:{
  params:Promise<{propertyId:string}>;searchParams:Promise<DashboardFilters>
}) {
  const profile=await requireAuth()
  if(!profile || !profile.isActive) redirect('/login')
  const [{propertyId},filters]=await Promise.all([params,searchParams])
  const property=await getPropertyByIdForOrganization(propertyId,profile.orgId)
  if(!property || !property.isActive) notFound()
  const isAdmin=profile.role==='admin'
  if(!isAdmin&&property.primaryPmId!==profile.id&&!(profile.assignments??[]).some(a=>a.propertyId===propertyId)) redirect('/tasks')
  return <ConsolidatedDashboard orgId={profile.orgId} property={property} filters={filters} showPortfolioLink={isAdmin} />
}
