'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Droplets, Zap, Link2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UtilitySummaryCards } from '@/components/admin/utility-summary-cards'
import { UtilityCharts } from '@/components/admin/utility-charts'
import { UtilityReadingsTable } from '@/components/admin/utility-readings-table'
import { UtilityReadingForm } from '@/components/admin/utility-reading-form'
import { UtilityTierForm } from '@/components/admin/utility-tier-form'

interface UtilitiesPageClientProps {
  property: { id: string; name: string; code: string; slug: string }
  isAdmin: boolean
}

interface SummaryData {
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
  }
  dailyConsumption: { date: string; consumption: number }[]
  history: { month: string; consumption: number; readingCount: number }[]
  tiersConfigured: boolean
  readingCount: number
}

interface ReadingEntry {
  id: string
  propertyId: string
  utilityType: string
  readingDate: string
  readingValue: string
  note: string | null
  recordedBy: string | null
  recorderName: string | null
  createdAt: string
  updatedAt: string
}

export function UtilitiesPageClient({ property, isAdmin }: UtilitiesPageClientProps) {
  const router = useRouter()
  const now = new Date()
  const [utilityType, setUtilityType] = useState<'water' | 'electricity'>('water')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [readings, setReadings] = useState<ReadingEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, readingsRes] = await Promise.all([
        fetch(
          `/api/utilities/summary?propertyId=${property.id}&utilityType=${utilityType}&year=${year}&month=${month}`
        ),
        fetch(
          `/api/utilities/readings?propertyId=${property.id}&utilityType=${utilityType}&year=${year}&month=${month}`
        ),
      ])

      if (summaryRes.ok) {
        setSummary(await summaryRes.json())
      }
      if (readingsRes.ok) {
        setReadings(await readingsRes.json())
      }
    } catch (error) {
      console.error('Failed to fetch utility data:', error)
    } finally {
      setLoading(false)
    }
  }, [property.id, utilityType, year, month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  const yearOptions = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  const pred = summary?.prediction

  const tabContent = (
    <div className="space-y-6">
      {/* Summary Cards */}
      <UtilitySummaryCards
        utilityType={utilityType}
        actualConsumption={pred?.actualConsumption ?? 0}
        actualCost={pred?.actualCost ?? 0}
        predictedConsumption={pred?.predictedConsumption ?? 0}
        predictedCost={pred?.predictedCost ?? 0}
        avgDailyConsumption={pred?.avgDailyConsumption ?? 0}
        daysElapsed={pred?.daysElapsed ?? 0}
        daysInMonth={pred?.daysInMonth ?? 30}
        tiersConfigured={summary?.tiersConfigured ?? false}
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
            onRefresh={fetchData}
          />
        </div>
        <div>
          <UtilityReadingForm
            propertyId={property.id}
            utilityType={utilityType}
            onSuccess={fetchData}
          />
        </div>
      </div>

      {/* Tier Configuration (admin only) */}
      {isAdmin && (
        <UtilityTierForm
          propertyId={property.id}
          utilityType={utilityType}
          onRefresh={fetchData}
        />
      )}
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/utilities')}
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = `${window.location.origin}/u/${property.slug}`
              navigator.clipboard.writeText(url)
              toast.success('Public link copied to clipboard')
            }}
          >
            <Link2 className="size-4" />
            Copy Public Link
          </Button>

          <Select
            value={String(month)}
            onValueChange={(v) => setMonth(parseInt(v))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthNames.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(year)}
            onValueChange={(v) => setYear(parseInt(v))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Utility Type Tabs */}
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
    </div>
  )
}
