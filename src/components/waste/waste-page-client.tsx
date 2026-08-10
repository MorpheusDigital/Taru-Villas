'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WasteSummaryCards } from '@/components/waste/waste-summary-cards'
import { WasteCharts } from '@/components/waste/waste-charts'
import { WasteLogTable } from '@/components/waste/waste-log-table'
import { WasteLogForm } from '@/components/waste/waste-log-form'
import { BulkImportCard } from '@/components/admin/bulk-import-card'

interface WasteTotals {
  paperKg: number
  glassKg: number
  plasticKg: number
  foodKg: number
  metalKg: number
  electronicKg: number
  total: number
}

interface SummaryData {
  summary: WasteTotals
  history: ({ month: string } & WasteTotals)[]
  logCount: number
}

interface WasteLogEntry {
  id: string
  propertyId: string
  logDate: string
  paperKg: string
  glassKg: string
  plasticKg: string
  foodKg: string
  metalKg: string
  electronicKg: string
  note: string | null
  recordedBy: string | null
  recorderName: string | null
  createdAt: string
  updatedAt: string
}

interface WastePageClientProps {
  property: { id: string; name: string; code: string; slug: string }
  isAdmin: boolean
  showHeader?: boolean
  embedded?: boolean
}

export function WastePageClient({
  property,
  isAdmin,
  showHeader = true,
  embedded = false,
}: WastePageClientProps) {
  const router = useRouter()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [logs, setLogs] = useState<WasteLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, logsRes] = await Promise.all([
        fetch(`/api/waste/summary?propertyId=${property.id}&year=${year}&month=${month}`),
        fetch(`/api/waste?propertyId=${property.id}&year=${year}&month=${month}`),
      ])
      if (summaryRes.ok) setSummary(await summaryRes.json())
      if (logsRes.ok) setLogs(await logsRes.json())
    } catch (error) {
      console.error('Failed to fetch waste data:', error)
    } finally {
      setLoading(false)
    }
  }, [property.id, year, month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const yearOptions = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  const dateControls = (
    <div className="flex items-center gap-2">
      <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
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

      <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
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
  )

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 p-6'}>
      {/* Header */}
      {showHeader ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/daily-records')}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Daily Wastage — {property.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Log daily waste by category and monitor trends
              </p>
            </div>
          </div>
          {dateControls}
        </div>
      ) : (
        <div className="flex justify-end">{dateControls}</div>
      )}

      {/* Summary Cards */}
      <WasteSummaryCards summary={summary?.summary ?? null} loading={loading} />

      {/* Charts */}
      <WasteCharts
        summary={summary?.summary ?? null}
        history={summary?.history ?? []}
        loading={loading}
      />

      {/* Log table + entry form */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WasteLogTable logs={logs} propertyId={property.id} onRefresh={fetchData} />
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <WasteLogForm propertyId={property.id} onSuccess={fetchData} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bulk import (admin only) */}
      {isAdmin && (
        <BulkImportCard type="wastage" propertyId={property.id} onSuccess={fetchData} />
      )}
    </div>
  )
}
