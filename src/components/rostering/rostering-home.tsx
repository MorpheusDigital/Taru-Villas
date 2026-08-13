'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Loader2,
  MapPinned,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface HubOption {
  id: string
  name: string
  code: string
  properties: Array<{
    id: string
    name: string
    code: string
    kind: 'hub' | 'spoke'
  }>
}

interface CycleSummary {
  id: string
  hubId: string
  hubName: string
  month: string
  revision: number
  status: 'draft' | 'submitted' | 'published' | 'superseded'
  version: number
  createdAt: Date
  updatedAt: Date
  properties: Array<{
    cycleId: string
    propertyId: string
    propertyName: string
    status: 'draft' | 'submitted'
  }>
  openHardViolations: number
  openSoftViolations: number
}

interface RosteringHomeProps {
  hubs: HubOption[]
  cycles: CycleSummary[]
  defaultMonth: string
  isAdmin: boolean
}

function monthLabel(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`))
}

const statusTone: Record<CycleSummary['status'], string> = {
  draft: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  submitted: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  superseded: 'border-border bg-muted text-muted-foreground',
}

export function RosteringHome({
  hubs,
  cycles,
  defaultMonth,
  isAdmin,
}: RosteringHomeProps) {
  const router = useRouter()
  const [hubId, setHubId] = useState(hubs[0]?.id ?? '')
  const [month, setMonth] = useState(defaultMonth)
  const [isGenerating, setIsGenerating] = useState(false)
  const selectedHub = useMemo(
    () => hubs.find((hub) => hub.id === hubId),
    [hubId, hubs],
  )

  async function generate() {
    if (!hubId || !month) {
      toast.error('Choose a hub and month')
      return
    }
    setIsGenerating(true)
    try {
      const response = await fetch('/api/rostering/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubId, month: `${month}-01` }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
        cycleId?: string
      }
      if (!response.ok || !body.cycleId) {
        throw new Error(body.error ?? 'Roster generation failed')
      }
      toast.success('Draft roster generated')
      router.push(`/rostering/${body.cycleId}`)
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Roster generation failed',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <section className="relative overflow-hidden rounded-2xl border bg-[linear-gradient(120deg,rgba(15,23,42,0.98),rgba(27,45,58,0.96))] px-6 py-7 text-white shadow-sm sm:px-8 sm:py-9">
        <div className="absolute inset-y-0 right-0 hidden w-[42%] opacity-25 lg:block" aria-hidden="true">
          <div className="grid h-full grid-cols-7 border-l border-white/15">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="border-r border-white/15" />
            ))}
          </div>
        </div>
        <div className="relative max-w-3xl">
          <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-teal-200">
            <CalendarDays className="size-4" />
            Monthly operations desk
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Build the month around service, rest, and real property demand.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Generate one coordinated draft for every property in a hub. Hard
            rules stay visible; optimization warnings remain explainable.
          </p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.8fr)]">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
                <Sparkles className="size-5" />
              </div>
              <div>
                <CardTitle>Generate a coordinated draft</CardTitle>
                <CardDescription className="mt-1">
                  The selected hub is planned and validated as one monthly cycle.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 px-6 py-6 md:grid-cols-[1fr_220px_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="hub-select">Roster hub</Label>
              <Select value={hubId} onValueChange={setHubId} disabled={hubs.length === 0}>
                <SelectTrigger id="hub-select" className="w-full">
                  <SelectValue placeholder="No eligible hub" />
                </SelectTrigger>
                <SelectContent>
                  {hubs.map((hub) => (
                    <SelectItem key={hub.id} value={hub.id}>
                      {hub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="roster-month">Roster month</Label>
              <Input
                id="roster-month"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </div>
            <Button onClick={generate} disabled={!hubId || !month || isGenerating}>
              {isGenerating ? <Loader2 className="animate-spin" /> : <CalendarDays />}
              {isGenerating ? 'Generating…' : 'Generate draft'}
            </Button>
          </CardContent>
          {selectedHub && (
            <div className="border-t bg-muted/30 px-6 py-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <MapPinned className="size-4 text-muted-foreground" />
                {selectedHub.properties.map((property) => (
                  <Badge key={property.id} variant="outline" className="bg-background/70 font-normal">
                    {property.name}
                    <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                      {property.kind}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="gap-4 border-teal-900/10 bg-teal-50/50 py-5 dark:bg-teal-950/10">
          <CardHeader className="px-5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-teal-700 dark:text-teal-300" />
              Publication control
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-5 text-sm leading-6 text-muted-foreground">
            <p>Property managers prepare and submit their child rosters.</p>
            <p>
              An admin approves and publishes the complete hub cycle after hard
              violations are cleared and soft warnings are resolved.
            </p>
            {isAdmin && (
              <Badge variant="outline" className="border-teal-600/30 bg-background text-teal-800 dark:text-teal-200">
                Admin approval access
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Roster cycles</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a draft to inspect daily assignments and rule evidence.
            </p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {cycles.length} {cycles.length === 1 ? 'cycle' : 'cycles'}
          </span>
        </div>

        {cycles.length === 0 ? (
          <Card className="items-center border-dashed py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <CalendarDays className="size-5 text-muted-foreground" />
            </div>
            <div className="max-w-md px-6">
              <CardTitle>No roster cycles yet</CardTitle>
              <CardDescription className="mt-2 leading-6">
                Seed or configure workforce, policy, forecasts, and boundary
                context, then generate the first monthly draft above.
              </CardDescription>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3">
            {cycles.map((cycle) => (
              <Card key={cycle.id} className="gap-0 py-0 transition-colors hover:border-foreground/20">
                <CardContent className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.4fr)_auto_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{cycle.hubName}</h3>
                      <Badge variant="outline" className={statusTone[cycle.status]}>
                        {cycle.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {monthLabel(cycle.month)} · Revision {cycle.revision}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cycle.properties.map((property) => (
                      <Badge key={property.propertyId} variant="secondary" className="font-normal">
                        {property.propertyName}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CircleAlert className="size-3.5 text-rose-600" />
                      {cycle.openHardViolations} hard
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-amber-600" />
                      {cycle.openSoftViolations} soft
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock3 className="size-3.5" />
                      v{cycle.version}
                    </span>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/rostering/${cycle.id}`}>
                      Open <ArrowRight />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
