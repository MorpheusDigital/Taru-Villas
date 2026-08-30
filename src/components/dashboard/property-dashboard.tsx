'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CalendarDays,
} from 'lucide-react'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { DateFilter } from './date-filter'
import { ScoreCard, getScoreColor } from './score-card'
import { TrendChart } from './trend-chart'
import { CategoryRadar } from './category-radar'
import { NotesFeed, type NoteItem } from './notes-feed'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PropertyInfo {
  id: string
  name: string
  code: string
  imageUrl?: string | null
  location?: string | null
  overallScore: number
  overallTrend: number
  lastSurveyDate: string | null
  submissionCount: number
}

export interface SubcategoryScoreData {
  subcategoryId: string
  subcategoryName: string
  score: number
  trend: number
}

export interface CategoryScoreData {
  categoryId: string
  categoryName: string
  score: number
  weight: number
  trend: number // positive = improving
  subcategories: SubcategoryScoreData[]
}

export interface PropertyTrendPoint {
  date: string
  overall: number
  [categoryKey: string]: string | number
}

interface PropertyDashboardProps {
  property: PropertyInfo
  categories: CategoryScoreData[]
  trendData: PropertyTrendPoint[]
  notes: NoteItem[]
  surveyType: 'internal' | 'guest'
}

// ---------------------------------------------------------------------------
// Category Score Card
// ---------------------------------------------------------------------------

function CategoryCard({ category }: { category: CategoryScoreData }) {
  const scoreColor = getScoreColor(category.score)

  return (
    <Card>
      <CardContent className="pt-0">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">{category.categoryName}</p>
            <p className="text-xs text-muted-foreground">
              Weight: {category.weight.toFixed(1)}x
            </p>
          </div>
          <div
            className={cn(
              'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
              category.trend > 0 && 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
              category.trend < 0 && 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
              category.trend === 0 && 'bg-muted text-muted-foreground'
            )}
          >
            {category.trend > 0 ? (
              <ArrowUpRight className="size-3" />
            ) : category.trend < 0 ? (
              <ArrowDownRight className="size-3" />
            ) : (
              <Minus className="size-3" />
            )}
            {Math.abs(category.trend).toFixed(1)}
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-1.5">
            <span className={cn('text-3xl font-bold tabular-nums', scoreColor)}>
              {category.score.toFixed(1)}
            </span>
            <span className="text-sm text-muted-foreground">/10</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                category.score >= 8 && 'bg-emerald-500',
                category.score >= 6 && category.score < 8 && 'bg-amber-500',
                category.score < 6 && 'bg-red-500'
              )}
              style={{ width: `${Math.min(100, Math.max(0, (category.score / 10) * 100))}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Subcategory Score Card (mini)
// ---------------------------------------------------------------------------

function SubcategoryCard({
  subcategory,
  categoryName,
}: {
  subcategory: SubcategoryScoreData
  categoryName: string
}) {
  const scoreColor = getScoreColor(subcategory.score)

  return (
    <Card>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground truncate">{categoryName}</p>
        <p className="text-sm font-semibold truncate mt-0.5">
          {subcategory.subcategoryName}
        </p>
        <div className="mt-2 flex items-baseline gap-1">
          <span className={cn('text-2xl font-bold tabular-nums', scoreColor)}>
            {subcategory.score.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground">/10</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              subcategory.score >= 8 && 'bg-emerald-500',
              subcategory.score >= 6 && subcategory.score < 8 && 'bg-amber-500',
              subcategory.score < 6 && 'bg-red-500'
            )}
            style={{ width: `${Math.min(100, Math.max(0, (subcategory.score / 10) * 100))}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PropertyDashboard({
  property,
  categories,
  trendData,
  notes,
  surveyType,
}: PropertyDashboardProps) {
  const router = useRouter()
  const [, setDateRange] = useState<{ from: Date; to: Date }>(() => {
    const to = new Date()
    const from = new Date(to)
    from.setDate(from.getDate() - 180)
    return { from, to }
  })

  const handleDateChange = useCallback(
    (range: { from: Date; to: Date }) => {
      setDateRange(range)
    },
    []
  )

  function handleSurveyTypeChange(type: string) {
    if (type === 'internal') {
      router.push(`/dashboard/${property.id}`)
    } else {
      router.push(`/dashboard/${property.id}?surveyType=${type}`)
    }
  }

  // Flatten all subcategories for the subcategory grid (skip transparent ones with empty names)
  const allSubcategories = categories.flatMap((cat) =>
    cat.subcategories
      .filter((sub) => sub.subcategoryName)
      .map((sub) => ({ ...sub, categoryName: cat.categoryName }))
  )

  // Prepare radar data
  const radarData = categories.map((c) => ({
    category: c.categoryName,
    score: c.score,
    fullMark: 10,
  }))

  // Prepare trend lines config
  const trendLines = [
    { key: 'overall', label: 'Overall', color: 'var(--chart-1)' },
    ...categories.map((c, i) => ({
      key: c.categoryName.toLowerCase().replace(/\s+/g, '_'),
      label: c.categoryName,
      color: `var(--chart-${(i % 5) + 1})`,
    })),
  ]

  return (
    <div className="space-y-8">
      {/* Back nav + header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link href="/dashboard">
            <ArrowLeft className="size-4" />
            Back to overview
          </Link>
        </Button>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          {/* Property info */}
          <div className="flex items-start gap-4">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
              <img
                src={property.imageUrl || `/properties/${property.code}.png`}
                alt={property.name}
                className="size-full object-cover"
              />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">
                {property.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{property.code}</Badge>
                {property.location && <span>{property.location}</span>}
                {property.lastSurveyDate && (
                  <>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      Last survey:{' '}
                      {new Date(property.lastSurveyDate).toLocaleDateString(
                        'en-GB',
                        { day: 'numeric', month: 'short', year: 'numeric' }
                      )}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {property.submissionCount} survey
                {property.submissionCount !== 1 ? 's' : ''} completed
              </p>
            </div>
          </div>

          {/* Overall score display */}
          <Card className="shrink-0 sm:min-w-[160px]">
            <CardContent className="pt-0 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                Overall Score
              </p>
              <p
                className={cn(
                  'text-5xl font-bold tracking-tight tabular-nums',
                  getScoreColor(property.overallScore)
                )}
              >
                {property.overallScore.toFixed(1)}
              </p>
              <div
                className={cn(
                  'mt-1 inline-flex items-center gap-0.5 text-xs font-medium',
                  property.overallTrend >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {property.overallTrend >= 0 ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {Math.abs(property.overallTrend).toFixed(1)} vs prev. period
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Tabs value={surveyType} onValueChange={handleSurveyTypeChange}>
            <TabsList>
              <TabsTrigger value="internal">Internal</TabsTrigger>
              <TabsTrigger value="guest">Guest</TabsTrigger>
            </TabsList>
          </Tabs>
          <DateFilter onChange={handleDateChange} />
        </div>
      </div>

      <Separator />

      {/* Row 1: Category score cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Category Scores</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {categories.map((cat) => (
            <CategoryCard key={cat.categoryId} category={cat} />
          ))}
        </div>
      </div>

      {/* Row 2: Subcategory score cards */}
      {allSubcategories.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Sub-category Scores</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {allSubcategories.map((sub) => (
              <SubcategoryCard
                key={sub.subcategoryId}
                subcategory={sub}
                categoryName={sub.categoryName}
              />
            ))}
          </div>
        </div>
      )}

      {/* Row 3: Radar chart */}
      <CategoryRadar
        title="Category Overview"
        data={radarData}
        height={380}
      />

      {/* Row 4: Trend over time */}
      <TrendChart
        title="Score Trend Over Time"
        data={trendData}
        lines={trendLines}
        height={380}
      />

      {/* Row 5: Recent notes */}
      <NotesFeed
        title="Recent Survey Notes"
        notes={notes}
        maxHeight={600}
      />
    </div>
  )
}
