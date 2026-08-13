'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PropertyOption {
  id: string
  name: string
  code: string
}

interface ForecastGridProps {
  properties: PropertyOption[]
  defaultMonth: string
}

interface EditableForecast {
  date: string
  occupancyPercent: string
  arrivalsCount: string
  departuresCount: string
  source?: string
}

function datesInMonth(month: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number)
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return Array.from(
    { length: count },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  )
}

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`))
}

export function ForecastGrid({ properties, defaultMonth }: ForecastGridProps) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '')
  const [month, setMonth] = useState(defaultMonth)
  const [rows, setRows] = useState<EditableForecast[]>([])
  const [fillOccupancy, setFillOccupancy] = useState('65')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!propertyId || !month) return
    let cancelled = false
    async function load() {
      setIsLoading(true)
      try {
        const response = await fetch(
          `/api/rostering/forecasts?propertyId=${encodeURIComponent(propertyId)}&month=${encodeURIComponent(month)}`,
        )
        const body = (await response.json()) as {
          error?: string
          forecasts?: Array<{
            forecastDate: string
            occupancyPercent: string
            arrivalsCount: number
            departuresCount: number
            source: string
          }>
        }
        if (!response.ok) throw new Error(body.error ?? 'Failed to load forecasts')
        if (cancelled) return
        const byDate = new Map(
          (body.forecasts ?? []).map((forecast) => [forecast.forecastDate, forecast]),
        )
        setRows(
          datesInMonth(month).map((date) => {
            const existing = byDate.get(date)
            return {
              date,
              occupancyPercent: existing ? String(Number(existing.occupancyPercent)) : '',
              arrivalsCount: existing ? String(existing.arrivalsCount) : '0',
              departuresCount: existing ? String(existing.departuresCount) : '0',
              source: existing?.source,
            }
          }),
        )
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load forecasts')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [month, propertyId])

  function updateRow(date: string, field: keyof EditableForecast, value: string) {
    setRows((current) =>
      current.map((row) => (row.date === date ? { ...row, [field]: value } : row)),
    )
  }

  function fillMonth() {
    const value = Number(fillOccupancy)
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return toast.error('Occupancy must be between 0 and 100')
    }
    setRows((current) =>
      current.map((row) => ({ ...row, occupancyPercent: String(value) })),
    )
  }

  async function save() {
    if (rows.some((row) => row.occupancyPercent === '')) {
      return toast.error('Enter occupancy for every calendar day')
    }
    setIsSaving(true)
    try {
      const response = await fetch('/api/rostering/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forecasts: rows.map((row) => ({
            propertyId,
            date: row.date,
            occupancyPercent: Number(row.occupancyPercent),
            arrivalsCount: Number(row.arrivalsCount),
            departuresCount: Number(row.departuresCount),
          })),
        }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Failed to save forecasts')
      toast.success(`Saved ${rows.length} daily forecasts`)
      setRows((current) => current.map((row) => ({ ...row, source: 'manual' })))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save forecasts')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b px-6 py-5">
        <CardTitle>Daily occupancy forecast</CardTitle>
        <CardDescription>
          Occupancy drives staffing bands. Arrivals and departures are retained as planning context.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-6 py-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Property</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="No property" /></SelectTrigger>
              <SelectContent>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="forecast-month">Month</Label>
            <Input id="forecast-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-44" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fill-occupancy">Fill occupancy %</Label>
            <div className="flex gap-2">
              <Input id="fill-occupancy" type="number" min="0" max="100" value={fillOccupancy} onChange={(event) => setFillOccupancy(event.target.value)} className="w-28" />
              <Button variant="outline" onClick={fillMonth}>Fill month</Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading forecasts…
          </div>
        ) : (
          <div className="max-h-[600px] overflow-auto rounded-xl border">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                <tr>
                  <th className="px-3 py-2.5 text-left">Date</th>
                  <th className="px-3 py-2.5 text-left">Occupancy %</th>
                  <th className="px-3 py-2.5 text-left">Arrivals</th>
                  <th className="px-3 py-2.5 text-left">Departures</th>
                  <th className="px-3 py-2.5 text-left">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.date} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{dayLabel(row.date)}</td>
                    <td className="px-3 py-2"><Input type="number" min="0" max="100" value={row.occupancyPercent} onChange={(event) => updateRow(row.date, 'occupancyPercent', event.target.value)} className="h-8 w-28" /></td>
                    <td className="px-3 py-2"><Input type="number" min="0" value={row.arrivalsCount} onChange={(event) => updateRow(row.date, 'arrivalsCount', event.target.value)} className="h-8 w-24" /></td>
                    <td className="px-3 py-2"><Input type="number" min="0" value={row.departuresCount} onChange={(event) => updateRow(row.date, 'departuresCount', event.target.value)} className="h-8 w-24" /></td>
                    <td className="px-3 py-2 text-xs capitalize text-muted-foreground">{row.source ?? 'missing'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={save} disabled={isLoading || isSaving || rows.length === 0}>
            {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
            {isSaving ? 'Saving…' : 'Save month'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
