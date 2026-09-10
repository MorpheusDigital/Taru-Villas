'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { forwardFillScores } from '@/lib/reviews/trend-display'
import { useIsMobile } from '@/hooks/use-mobile'

interface LineConfig {
  key: string
  label: string
  color: string
}

interface TrendChartProps {
  title?: string
  data: Record<string, unknown>[]
  lines: LineConfig[]
  height?: number
  className?: string
}

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; dataKey?: string; payload?: {carriedFrom?: Record<string,string>} }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2 text-sm">
            <div
              className="size-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold tabular-nums">
              {entry.value.toFixed(1)}{entry.dataKey && entry.payload?.carriedFrom?.[entry.dataKey] ? ` · Carried forward from ${entry.payload.carriedFrom[entry.dataKey]}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TrendChart({
  title,
  data,
  lines,
  height = 350,
  className,
}: TrendChartProps) {
  const isMobile = useIsMobile()
  const chartHeight = isMobile ? 240 : height

  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        {title && (
          <CardHeader>
            <CardTitle className="text-base">{title}</CardTitle>
          </CardHeader>
        )}
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

  return (
    <Card className={className}>
      {title && (
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart
            data={forwardFillScores(data, lines.map(line=>line.key))}
            margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: isMobile ? 10 : 12 }}
              tickLine={false}
              axisLine={false}
              minTickGap={isMobile ? 24 : 8}
              className="fill-muted-foreground"
            />
            <YAxis
              domain={[0, 100]}
              width={isMobile ? 28 : 40}
              tick={{ fontSize: isMobile ? 10 : 12 }}
              tickLine={false}
              axisLine={false}
              className="fill-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{
                fontSize: isMobile ? '10px' : '12px',
                paddingTop: '8px',
              }}
            />
            {lines.map((line, i) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color || CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
