'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Droplets, Zap, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UtilitySummaryCards } from '@/components/admin/utility-summary-cards'
import { UtilityCharts } from '@/components/admin/utility-charts'
import { UtilityReadingsTable } from '@/components/admin/utility-readings-table'
import { UtilityReadingForm } from '@/components/admin/utility-reading-form'
import { UtilityTierForm } from '@/components/admin/utility-tier-form'
import { UtilityKpiBandsForm } from '@/components/admin/utility-kpi-bands-form'
import { UtilitySlotConfigForm } from '@/components/admin/utility-slot-config-form'
import { UtilityRangeSelector } from '@/components/admin/utility-range-selector'
import { BulkImportCard } from '@/components/admin/bulk-import-card'

interface UtilitiesPageClientProps {
  property: { id: string; name: string; code: string; slug: string }
  isAdmin: boolean
  initialUtilityType?: 'water' | 'electricity'
  showHeader?: boolean
  showUtilityTabs?: boolean
  embedded?: boolean
}

interface SummaryData {
  range: { from: string; to: string; days: number }
  current: {
    totalConsumption: number | null
    avgPerDay: number | null
    totalCost: number | null
    kpiPct: number | null
    kpiEvaluatedDays: number
    kpiAchievedDays: number
  }
  previous: {
    totalConsumption: number | null
    avgPerDay: number | null
    totalCost: number | null
    kpiPct: number | null
    kpiEvaluatedDays: number
    kpiAchievedDays: number
  }
  deltas: {
    consumptionPct: number | null
    avgPct: number | null
    costPct: number | null
    kpiDeltaPp: number | null
  }
  dailyConsumption: { date: string; consumption: number }[]
  history: { month: string; consumption: number; readingCount: number }[]
  tiersConfigured: boolean
  dailyRows: {
    date: string
    readingValue: number | null
    day: number | null
    peak: number | null
    offPeak: number | null
    total: number | null
    pending: boolean
    guestCount: number | null
    staffCount: number | null
    target: number | null
    achieved: boolean | null
    penalty: 'missed' | 'edited' | 'normal'
  }[]
  prediction: {
    actualConsumption: number
    actualCost: number
    predictedConsumption: number
    predictedCost: number
    avgDailyConsumption: number
    daysElapsed: number
    daysInMonth: number
    costBreakdown: { tierNumber: number; unitsInTier: number; ratePerUnit: number; cost: number }[]
    predictedBreakdown: { tierNumber: number; unitsInTier: number; ratePerUnit: number; cost: number }[]
  } | null
  kpi: { configured: boolean; pct: number | null; evaluatedDays: number; achievedDays: number }
}

interface ReadingEntry {
  id: string
  propertyId: string
  utilityType: string
  readingDate: string
  readingValue: string | null
  note: string | null
  recordedBy: string | null
  recorderName: string | null
  createdAt: string
  updatedAt: string
}

export function UtilitiesPageClient({
  property,
  isAdmin,
  initialUtilityType = 'water',
  showHeader = true,
  showUtilityTabs = true,
  embedded = false,
}: UtilitiesPageClientProps) {
  const router = useRouter()
  const [utilityType, setUtilityType] = useState<'water' | 'electricity'>(initialUtilityType)
  const [range, setRange] = useState<{ from: string; to: string; isThisMonth: boolean } | null>(null)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [readings, setReadings] = useState<ReadingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [slotTimes, setSlotTimes] = useState<{ morningTime: string; eveningTime: string; nightTime: string } | null>(null)

  useEffect(() => {
    fetch('/api/utilities/slot-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSlotTimes(d))
      .catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    if (!range) return
    setLoading(true)
    try {
      const qs = `propertyId=${property.id}&utilityType=${utilityType}&from=${range.from}&to=${range.to}&isThisMonth=${range.isThisMonth ? 1 : 0}`
      const [summaryRes, readingsRes] = await Promise.all([
        fetch(`/api/utilities/summary?${qs}`),
        fetch(`/api/utilities/readings?propertyId=${property.id}&utilityType=${utilityType}&from=${range.from}&to=${range.to}`),
      ])
      if (summaryRes.ok) setSummary(await summaryRes.json())
      if (readingsRes.ok) setReadings(await readingsRes.json())
    } catch (error) {
      console.error('Failed to fetch utility data:', error)
    } finally {
      setLoading(false)
    }
  }, [property.id, utilityType, range])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const todayStr = new Date().toISOString().split('T')[0]
  const todayRow = summary?.dailyRows?.find((r) => r.date === todayStr)

  const tabContent = (
    <div className="space-y-6">
      {/* Summary Cards */}
      <UtilitySummaryCards
        utilityType={utilityType}
        isThisMonth={range?.isThisMonth ?? false}
        current={summary?.current ?? null}
        deltas={summary?.deltas ?? null}
        prediction={summary?.prediction ?? null}
        tiersConfigured={summary?.tiersConfigured ?? false}
        rangeLabel={summary?.range ? `${summary.range.days} days` : ''}
        showKpi={isAdmin}
        loading={loading}
      />

      {/* Charts */}
      <UtilityCharts
        dailyConsumption={summary?.dailyConsumption ?? []}
        history={summary?.history ?? []}
        utilityType={utilityType}
        loading={loading}
      />

      {/* Readings Table + Entry Form */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UtilityReadingsTable
            readings={readings}
            dailyRows={summary?.dailyRows ?? []}
            utilityType={utilityType}
            isAdmin={isAdmin}
            onRefresh={fetchData}
          />
        </div>
        <div>
          <UtilityReadingForm
            propertyId={property.id}
            utilityType={utilityType}
            slotTimes={slotTimes ?? undefined}
            isAdmin={isAdmin}
            initialGuests={todayRow?.guestCount ?? null}
            initialStaff={todayRow?.staffCount ?? null}
            onSuccess={fetchData}
          />
        </div>
      </div>

      {/* Config (admin only) */}
      {isAdmin && (
        <div className="space-y-6">
          <UtilityTierForm propertyId={property.id} utilityType={utilityType} onRefresh={fetchData} />
          <UtilityKpiBandsForm propertyId={property.id} utilityType={utilityType} onRefresh={fetchData} />
          {utilityType === 'electricity' && (
            <UtilitySlotConfigForm onRefresh={() => {
              fetch('/api/utilities/slot-config')
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => d && setSlotTimes(d))
                .catch(() => {})
            }} />
          )}
          <BulkImportCard type={utilityType} propertyId={property.id} onSuccess={fetchData} />
        </div>
      )}
    </div>
  )

  const rangeSelector = (
    <UtilityRangeSelector
      onChange={(r) => setRange({ from: r.from, to: r.to, isThisMonth: r.isThisMonth })}
    />
  )

  const publicLinkButton = (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-center sm:w-auto"
      onClick={() => {
        const url = `${window.location.origin}/u/${property.slug}`
        navigator.clipboard.writeText(url)
        toast.success('Public link copied to clipboard')
      }}
    >
      <Link2 className="size-4" />
      Copy Public Link
    </Button>
  )

  const content = showUtilityTabs ? (
    <Tabs
      value={utilityType}
      onValueChange={(v) => setUtilityType(v as 'water' | 'electricity')}
    >
      <TabsList>
        <TabsTrigger value="water" className="gap-2">
          <Droplets className="size-4" />
          Water
        </TabsTrigger>
        <TabsTrigger value="electricity" className="gap-2">
          <Zap className="size-4" />
          Electricity
        </TabsTrigger>
      </TabsList>

      <TabsContent value="water" className="mt-6">
        {tabContent}
      </TabsContent>

      <TabsContent value="electricity" className="mt-6">
        {tabContent}
      </TabsContent>
    </Tabs>
  ) : tabContent

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 p-6'}>
      {/* Header */}
      {showHeader && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/daily-records')}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Utilities — {property.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Track meter readings and monitor utility costs
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
            {publicLinkButton}

            {rangeSelector}
          </div>
        </div>
      )}

      {!showHeader && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {publicLinkButton}
          {rangeSelector}
        </div>
      )}

      {content}
    </div>
  )
}
