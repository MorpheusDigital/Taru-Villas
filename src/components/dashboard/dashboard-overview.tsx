'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  TrendingUp,
  TrendingDown,
  ClipboardCheck,
  BarChart3,
} from 'lucide-react'
import {
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { DateFilter } from './date-filter'
import { TrendChart } from './trend-chart'
import { ComparisonChart } from './comparison-chart'
import { getScoreColor } from './score-card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PropertyOverview {
  propertyId: string
  propertyName: string
  propertyCode: string
  imageUrl?: string | null
  score: number
  trend: number
  lastSurveyDate: string | null
  sparkline: number[]
}

export interface OverviewStats {
  totalProperties: number
  averageScore: number
  surveysThisMonth: number
  overallTrend: number
}

export interface TrendDataPoint {
  date: string
  [propertyKey: string]: string | number
}

interface DashboardOverviewProps {
  properties: PropertyOverview[]
  stats: OverviewStats
  trendData: TrendDataPoint[]
  trendLines: Array<{ key: string; label: string; color: string }>
  surveyType: 'internal' | 'guest'
}

// ---------------------------------------------------------------------------
// Summary Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
}: {
  title: string
  value: string | number
  description?: string
  icon: React.ComponentType<{ className?: string }>
  trend?: number
}) {
  return (
    <Card>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              {trend !== undefined && (
                <span
                  className={cn(
                    'flex items-center gap-0.5 text-xs font-medium',
                    trend >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {trend >= 0 ? (
                    <TrendingUp className="size-3" />
                  ) : (
                    <TrendingDown className="size-3" />
                  )}
                  {Math.abs(trend).toFixed(1)}%
                </span>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="rounded-lg bg-muted p-3">
            <Icon className="size-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Property Score Card (with sparkline)
// ---------------------------------------------------------------------------

function PropertyCard({
  property,
  onClick,
}: {
  property: PropertyOverview
  onClick: () => void
}) {
  const scoreColor = getScoreColor(property.score)
  const sparklineData = property.sparkline.map((v, i) => ({ i, v }))

  return (
    <Card
      className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/20"
      onClick={onClick}
    >
      <CardContent className="pt-0">
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
            <img
              src={property.imageUrl || `/properties/${property.propertyCode}.png`}
              alt={property.propertyName}
              className="size-full object-cover"
            />
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold">
              {property.propertyName}
            </p>
            <p className="text-xs text-muted-foreground">
              {property.propertyCode}
            </p>
          </div>
          {/* Score */}
          <div className="text-right">
            <p className={cn('text-2xl font-bold tabular-nums', scoreColor)}>
              {property.score.toFixed(0)}
            </p>
          </div>
        </div>

        {/* Sparkline + meta */}
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="h-8 w-24">
            {sparklineData.length > 1 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={
                      property.trend >= 0 ? '#10b981' : '#ef4444'
                    }
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="text-right">
            <span
              className={cn(
                'text-xs font-medium',
                property.trend >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              )}
            >
              {property.trend >= 0 ? '+' : ''}
              {property.trend.toFixed(1)}
            </span>
            {property.lastSurveyDate && (
              <p className="text-[11px] text-muted-foreground">
                {new Date(property.lastSurveyDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DashboardOverview({
  properties,
  stats,
  trendData,
  trendLines,
  surveyType,
}: DashboardOverviewProps) {
  const router = useRouter()
  const [, setDateRange] = useState<{ from: Date; to: Date }>(() => {
    const now = new Date()
    return {
      from: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
      to: now,
    }
  })

  const handleDateChange = useCallback(
    (range: { from: Date; to: Date }) => {
      setDateRange(range)
    },
    []
  )

  function handleSurveyTypeChange(type: string) {
    if (type === 'internal') {
      router.push('/dashboard')
    } else {
      router.push(`/dashboard?surveyType=${type}`)
    }
  }

  const comparisonData = properties.map((p) => ({
    name: p.propertyName.replace('Taru Villas - ', ''),
    score: p.score,
  }))

  return (
    <div className="space-y-8">
      {/* Page header + date filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Quality scores overview across all properties
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs value={surveyType} onValueChange={handleSurveyTypeChange}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="internal" className="flex-1 sm:flex-none">
                Internal
              </TabsTrigger>
              <TabsTrigger value="guest" className="flex-1 sm:flex-none">
                Guest
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <DateFilter onChange={handleDateChange} />
        </div>
      </div>

      {/* Row 1: Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Properties"
          value={stats.totalProperties}
          description="Active properties"
          icon={Building2}
        />
        <StatCard
          title="Average Score"
          value={stats.averageScore.toFixed(1)}
          description="Across all properties"
          icon={BarChart3}
          trend={stats.overallTrend}
        />
        <StatCard
          title="Surveys This Month"
          value={stats.surveysThisMonth}
          description="Completed surveys"
          icon={ClipboardCheck}
        />
        <StatCard
          title="Overall Trend"
          value={`${stats.overallTrend >= 0 ? '+' : ''}${stats.overallTrend.toFixed(1)}%`}
          description="vs previous period"
          icon={stats.overallTrend >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      {/* Row 2: Property score cards grid */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Property Scores</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {properties.map((property) => (
            <PropertyCard
              key={property.propertyId}
              property={property}
              onClick={() =>
                router.push(
                  `/dashboard/${property.propertyId}${surveyType !== 'internal' ? `?surveyType=${surveyType}` : ''}`
                )
              }
            />
          ))}
        </div>
      </div>

      {/* Row 3: Charts side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TrendChart
          title="Score Trends Over Time"
          data={trendData}
          lines={trendLines}
          height={350}
        />
        <ComparisonChart
          title="Property Comparison"
          data={comparisonData}
          height={350}
        />
      </div>
    </div>
  )
}
