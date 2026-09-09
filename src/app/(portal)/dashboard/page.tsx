export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth/guards'
import { getProperties } from '@/lib/db/queries/properties'
import {
  getAllPropertyScores,
  getSurveysThisMonth,
  getLastSurveyDates,
  getSparklines,
  getOrgTrends,
  getOrgUtilityKpiRollup,
} from '@/lib/db/queries/dashboard'
import {
  DashboardOverview,
  type PropertyOverview,
  type OverviewStats,
} from '@/components/dashboard/dashboard-overview'
import { GoogleReviewsDashboard } from '@/components/dashboard/google-reviews-dashboard'
import { UtilityKpiRollup } from '@/components/dashboard/utility-kpi-rollup'

// ---------------------------------------------------------------------------
// Chart colors
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
]

// ---------------------------------------------------------------------------
// Page Component (Server)
// ---------------------------------------------------------------------------

interface DashboardPageProps {
  searchParams: Promise<{ surveyType?: string; reviewPage?: string }>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const profile = await requireRole(['admin'])

  const params = await searchParams
  if (params.surveyType === 'google') return <GoogleReviewsDashboard orgId={profile.orgId} />
  const surveyType = params.surveyType === 'guest' ? 'guest' : 'internal'

  const orgId = profile.orgId

  // Fetch real data in parallel
  const [scores, surveysCount, lastDates, sparklines, trendData, allProperties, kpiRollup] =
    await Promise.all([
      getAllPropertyScores(orgId, undefined, surveyType),
      getSurveysThisMonth(orgId, surveyType),
      getLastSurveyDates(orgId, surveyType),
      getSparklines(orgId, undefined, surveyType),
      getOrgTrends(orgId, 6, surveyType),
      getProperties(orgId),
      getOrgUtilityKpiRollup(orgId),
    ])

  // Build PropertyOverview list from real scores
  // For properties that have no submitted surveys yet, we still want them visible
  const scoredIds = new Set(scores.map((s) => s.propertyId))
  const propertiesWithoutScores = allProperties.filter(
    (p) => !scoredIds.has(p.id)
  )

  const propertyOverviews: PropertyOverview[] = [
    ...scores.map((s) => {
      const spark = sparklines.get(s.propertyId) ?? []
      const trend =
        spark.length >= 2 ? spark[spark.length - 1] - spark[spark.length - 2] : 0
      return {
        propertyId: s.propertyId,
        propertyName: s.propertyName,
        propertyCode: s.propertyCode,
        imageUrl: null,
        score: Math.round(s.averageScore * 10) / 10,
        trend: Math.round(trend * 10) / 10,
        lastSurveyDate: lastDates.get(s.propertyId) ?? null,
        sparkline: spark,
      }
    }),
    ...propertiesWithoutScores.map((p) => ({
      propertyId: p.id,
      propertyName: p.name,
      propertyCode: p.code,
      imageUrl: p.imageUrl,
      score: 0,
      trend: 0,
      lastSurveyDate: null,
      sparkline: [],
    })),
  ]

  // Sort by score descending (properties with data first)
  propertyOverviews.sort((a, b) => b.score - a.score)

  // Calculate aggregate stats
  const propertiesWithScores = propertyOverviews.filter((p) => p.score > 0)
  const averageScore =
    propertiesWithScores.length > 0
      ? propertiesWithScores.reduce((sum, p) => sum + p.score, 0) /
        propertiesWithScores.length
      : 0

  const overallTrend =
    propertiesWithScores.length > 0
      ? propertiesWithScores.reduce((sum, p) => sum + p.trend, 0) /
        propertiesWithScores.length
      : 0

  const stats: OverviewStats = {
    totalProperties: propertyOverviews.length,
    averageScore: Math.round(averageScore * 10) / 10,
    surveysThisMonth: surveysCount,
    overallTrend: Math.round(overallTrend * 10) / 10,
  }

  // Build trend lines config from properties that have data
  const trendLines = propertiesWithScores.map((p, i) => ({
    key: p.propertyCode.toLowerCase(),
    label: p.propertyName.replace('Taru Villas - ', ''),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  return (
    <div className="space-y-6">
      <DashboardOverview
        properties={propertyOverviews}
        stats={stats}
        trendData={trendData}
        trendLines={trendLines}
        surveyType={surveyType ?? 'internal'}
      />
      <UtilityKpiRollup rollup={kpiRollup} />
    </div>
  )
}
