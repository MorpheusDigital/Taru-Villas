'use client'

import Link from 'next/link'
import { Boxes, PiggyBank, TrendingDown, Wrench } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useIsMobile } from '@/hooks/use-mobile'
import { categoryLabel } from '@/lib/assets/labels'
import type { FeedItem } from '@/lib/assets/activity'
import type { DashboardData } from '@/lib/db/queries/assets'

interface AssetDashboardProps {
  data: DashboardData
  feed: FeedItem[]
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const currencyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 0,
})

function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

const countFormatter = new Intl.NumberFormat('en-LK')

const dateTimeFormatter = new Intl.DateTimeFormat('en-LK', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Colombo',
})

function formatWhen(when: Date): string {
  return dateTimeFormatter.format(when)
}

const PIE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

// ---------------------------------------------------------------------------
// KPI row
// ---------------------------------------------------------------------------

function KpiCard({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">{value}</p>
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
// Bar chart — NBV by property
// ---------------------------------------------------------------------------

function NbvTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1 text-sm font-medium">{label}</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">NBV:</span>
        <span className="font-semibold tabular-nums">{formatCurrency(payload[0].value)}</span>
      </div>
    </div>
  )
}

function NbvByPropertyChart({ data }: { data: DashboardData['byProperty'] }) {
  const isMobile = useIsMobile()
  const chartHeight = isMobile ? 280 : 350

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Net Book Value by Property</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height: chartHeight }}
          >
            No data available
          </div>
        </CardContent>
      </Card>
    )
  }

  const sortedData = [...data].sort((a, b) => b.totalNbv - a.totalNbv)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Net Book Value by Property</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={sortedData}
            layout="vertical"
            margin={{ top: 5, right: isMobile ? 12 : 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(value: number) => currencyFormatter.format(value)}
              tick={{ fontSize: isMobile ? 10 : 12 }}
              tickLine={false}
              axisLine={false}
              className="fill-muted-foreground"
            />
            <YAxis
              type="category"
              dataKey="propertyName"
              tick={{ fontSize: isMobile ? 10 : 12 }}
              tickLine={false}
              axisLine={false}
              width={isMobile ? 78 : 120}
              className="fill-muted-foreground"
            />
            <Tooltip content={<NbvTooltip />} />
            <Bar dataKey="totalNbv" radius={[0, 4, 4, 0]} barSize={isMobile ? 16 : 24} fill="var(--chart-1)" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Pie chart — count by category
// ---------------------------------------------------------------------------

function CategoryTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0]

  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{item.name}:</span>
        <span className="font-semibold tabular-nums">{item.value}</span>
      </div>
    </div>
  )
}

function CategoryPieChart({ data }: { data: DashboardData['byCategory'] }) {
  const isMobile = useIsMobile()
  const chartHeight = isMobile ? 280 : 350

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assets by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height: chartHeight }}
          >
            No data available
          </div>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((d) => ({ name: categoryLabel(d.category), count: d.count }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assets by Category</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={isMobile ? '62%' : '70%'}
            >
              {chartData.map((entry, index) => (
                <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CategoryTooltip />} />
            <Legend wrapperStyle={{ fontSize: isMobile ? 11 : 13 }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Recent activity feed
// ---------------------------------------------------------------------------

function ActivityFeed({ feed }: { feed: FeedItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {feed.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No recent activity
          </div>
        ) : (
          <ul className="space-y-4">
            {feed.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/assets/${item.assetId}`}
                  className="flex items-start justify-between gap-3 text-sm hover:underline"
                >
                  <span>{item.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatWhen(item.when)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function AssetDashboard({ data, feed }: AssetDashboardProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Asset Value" value={formatCurrency(data.totalNbv)} icon={PiggyBank} />
        <KpiCard
          title="Accumulated Depreciation"
          value={formatCurrency(data.totalAccumulatedDepreciation)}
          icon={TrendingDown}
        />
        <KpiCard title="Total Active Assets" value={countFormatter.format(data.activeCount)} icon={Boxes} />
        <KpiCard title="In Repair" value={countFormatter.format(data.inRepairCount)} icon={Wrench} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <NbvByPropertyChart data={data.byProperty} />
        <CategoryPieChart data={data.byCategory} />
      </div>

      <ActivityFeed feed={feed} />
    </div>
  )
}
