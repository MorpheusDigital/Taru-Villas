'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Droplets, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface UtilitiesPageClientProps {
  property: { id: string; name: string; code: string }
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
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-indexed
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

  // Generate year options (current year and 2 years back)
  const yearOptions = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

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

        {/* Month/Year Selectors */}
        <div className="flex items-center gap-2">
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

        <TabsContent value="water" className="space-y-6 mt-6">
          {/* Summary Cards — placeholder for Task 8 */}
          <div id="summary-cards" data-utility="water">
            {/* UtilitySummaryCards will go here */}
          </div>

          {/* Charts — placeholder for Task 10 */}
          <div id="charts" data-utility="water">
            {/* UtilityCharts will go here */}
          </div>

          {/* Readings Table + Entry Form — placeholders for Tasks 8, 9 */}
          <div id="readings-section" data-utility="water" className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {/* UtilityReadingsTable will go here */}
            </div>
            <div>
              {/* UtilityReadingForm will go here */}
            </div>
          </div>

          {/* Tier Config — placeholder for Task 11 */}
          {isAdmin && (
            <div id="tier-config" data-utility="water">
              {/* UtilityTierForm will go here */}
            </div>
          )}
        </TabsContent>

        <TabsContent value="electricity" className="space-y-6 mt-6">
          {/* Same structure as water tab — components will be shared */}
          <div id="summary-cards" data-utility="electricity" />
          <div id="charts" data-utility="electricity" />
          <div id="readings-section" data-utility="electricity" className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2" />
            <div />
          </div>
          {isAdmin && <div id="tier-config" data-utility="electricity" />}
        </TabsContent>
      </Tabs>
    </div>
  )
}
