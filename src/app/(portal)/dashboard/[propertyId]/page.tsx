export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import {
  getPropertyScores,
  getCategoryBreakdown,
  getSubcategoryBreakdown,
  getTrends,
  getRecentNotes,
} from '@/lib/db/queries/dashboard'
import {
  PropertyDashboard,
  type PropertyInfo,
  type CategoryScoreData,
  type SubcategoryScoreData,
  type PropertyTrendPoint,
} from '@/components/dashboard/property-dashboard'

// ---------------------------------------------------------------------------
// Page Component (Server)
// ---------------------------------------------------------------------------

export default async function PropertyDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>
  searchParams: Promise<{ surveyType?: string }>
}) {
  const { propertyId } = await params
  const sp = await searchParams
  const surveyType = (sp.surveyType as 'internal' | 'guest') || undefined
  const profile = await requireAuth()

  if (!profile) {
    return null
  }

  // Fetch property details
  const property = await getPropertyById(propertyId)
  if (!property) {
    notFound()
  }

  // Access check: admin, the property's PM, or an assigned user
  const isAdmin = profile.role === 'admin'
  const isPM = property.primaryPmId === profile.id
  const isAssigned = (profile.assignments ?? []).some(
    (a) => a.propertyId === propertyId
  )
  if (!isAdmin && !isPM && !isAssigned) {
    redirect('/tasks')
  }

  // Fetch all dashboard data in parallel — only submitted surveys
  const [scores, categories, subcategories, trends, notes] = await Promise.all([
    getPropertyScores(propertyId, undefined, surveyType),
    getCategoryBreakdown(propertyId, undefined, surveyType),
    getSubcategoryBreakdown(propertyId, undefined, surveyType),
    getTrends(propertyId, 12, surveyType),
    getRecentNotes(propertyId, 20),
  ])

  // Build PropertyInfo
  const overallScore = scores?.averageScore ?? 0
  const trendValues = trends.map((t) => t.averageScore)
  const overallTrend =
    trendValues.length >= 2
      ? trendValues[trendValues.length - 1] - trendValues[trendValues.length - 2]
      : 0

  const propertyInfo: PropertyInfo = {
    id: property.id,
    name: property.name,
    code: property.code,
    imageUrl: property.imageUrl,
    location: property.location,
    overallScore: Math.round(overallScore * 10) / 10,
    overallTrend: Math.round(overallTrend * 10) / 10,
    lastSurveyDate: trends.length > 0 ? trends[trends.length - 1].month : null,
    submissionCount: scores?.submissionCount ?? 0,
  }

  // Build subcategory data grouped by category
  const subcatsByCategory = new Map<string, SubcategoryScoreData[]>()
  for (const sub of subcategories) {
    const existing = subcatsByCategory.get(sub.categoryId) ?? []
    existing.push({
      subcategoryId: sub.subcategoryId,
      subcategoryName: sub.subcategoryName,
      score: Math.round(sub.averageScore * 10) / 10,
      trend: 0,
    })
    subcatsByCategory.set(sub.categoryId, existing)
  }

  // Build CategoryScoreData with subcategories
  const categoryData: CategoryScoreData[] = categories.map((c) => ({
    categoryId: c.categoryId,
    categoryName: c.categoryName,
    score: Math.round(c.averageScore * 10) / 10,
    weight: c.weight,
    trend: 0,
    subcategories: subcatsByCategory.get(c.categoryId) ?? [],
  }))

  // Build PropertyTrendPoint array
  const trendData: PropertyTrendPoint[] = trends.map((t) => {
    const [y, m] = t.month.split('-')
    const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })
    return {
      date: label,
      overall: Math.round(t.averageScore * 10) / 10,
    }
  })

  return (
    <PropertyDashboard
      property={propertyInfo}
      categories={categoryData}
      trendData={trendData}
      notes={notes}
      surveyType={surveyType ?? 'internal'}
    />
  )
}
