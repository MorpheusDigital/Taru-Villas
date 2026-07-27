'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BellOff, BellRing, CalendarClock, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { addDays, colomboToday, formatDayMonth, windowsOverlap } from '@/lib/fleet/dates'
import type { Vehicle } from '@/lib/db/schema'
import type { listDispatches } from '@/lib/db/queries/dispatches'
import type { listDrivers } from '@/lib/db/queries/fleet'
import type { UnassignableRequest } from '@/lib/fleet/types'
import { DispatchEditorDialog } from './dispatch-editor-dialog'
import type { FleetRequestRow } from './request-form'

export type DispatchRow = Awaited<ReturnType<typeof listDispatches>>[number]
export type DriverWithPush = Awaited<ReturnType<typeof listDrivers>>[number] & { hasPush: boolean }

const TIMELINE_DAYS = 14

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error
    if (typeof err === 'string') return err
  }
  return fallback
}

const STATUS_LABELS: Record<DispatchRow['status'], string> = {
  draft: 'Draft',
  approved: 'Approved',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// Matches the codebase's status badge convention (see requests-table.tsx).
const statusColors: Record<DispatchRow['status'], string> = {
  draft: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-slate-100 text-slate-800',
  cancelled: 'bg-red-100 text-red-800',
}

// Timeline bar fills — same palette as statusColors, saturated enough to
// read as a filled bar rather than a text badge.
const barColors: Record<DispatchRow['status'], string> = {
  draft: 'bg-amber-200 text-amber-900 border-amber-300',
  approved: 'bg-emerald-200 text-emerald-900 border-emerald-300',
  in_progress: 'bg-blue-200 text-blue-900 border-blue-300',
  completed: 'bg-slate-200 text-slate-700 border-slate-300',
  cancelled: 'bg-red-200 text-red-800 border-red-300',
}

/**
 * The operationally important bit: an admin must be able to see, before
 * relying on a notification, whether a driver can actually be reached by
 * one. Push is best-effort — a driver who never finished the Add-to-Home-
 * Screen setup will simply never hear about the trip. "No push" needs to be
 * noticeable without reading as an error state, hence amber rather than red.
 */
function PushStatus({ hasPush }: { hasPush: boolean }) {
  return hasPush ? (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
      <BellRing className="size-3" /> Push enabled
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
      <BellOff className="size-3" /> No push — contact the driver directly
    </span>
  )
}

// ---------------------------------------------------------------------------
// Timeline — one row per vehicle, 14 day-columns starting today. Dispatches
// overlapping the same vehicle/window are stacked as separate sub-rows
// rather than packed into one row, so two back-to-back or pooled trips on
// the same vehicle never visually collide.
// ---------------------------------------------------------------------------

function Timeline({
  vehicles,
  dispatches,
  timelineDays,
  today,
  timelineEnd,
  onClickDispatch,
}: {
  vehicles: Vehicle[]
  dispatches: DispatchRow[]
  timelineDays: string[]
  today: string
  timelineEnd: string
  onClickDispatch: (dispatch: DispatchRow) => void
}) {
  const gridTemplateColumns = `repeat(${TIMELINE_DAYS}, minmax(64px, 1fr))`

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="min-w-[980px]">
        {/* Header */}
        <div
          className="grid border-b bg-muted/40 text-xs font-medium text-muted-foreground"
          style={{ gridTemplateColumns: `160px ${gridTemplateColumns}` }}
        >
          <div className="px-3 py-2">Vehicle</div>
          {timelineDays.map((day) => (
            <div key={day} className="border-l px-2 py-2 text-center">
              {formatDayMonth(day)}
            </div>
          ))}
        </div>

        {/* Rows */}
        {vehicles.map((vehicle) => {
          const vehicleDispatches = dispatches
            .filter((d) => d.vehicleId === vehicle.id)
            .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))

          return (
            <div key={vehicle.id} className="grid grid-cols-[160px_1fr] border-b last:border-b-0">
              <div className="flex items-center px-3 py-2 text-sm font-medium">{vehicle.name}</div>
              <div className="flex flex-col gap-1 py-2">
                {vehicleDispatches.length === 0 ? (
                  <div className="h-8" />
                ) : (
                  vehicleDispatches.map((d) => {
                    const clampedStart = d.startDate < today ? today : d.startDate
                    const clampedEnd = d.endDate > timelineEnd ? timelineEnd : d.endDate
                    const startIdx = timelineDays.indexOf(clampedStart)
                    const endIdx = timelineDays.indexOf(clampedEnd)
                    const span = Math.max(1, endIdx - startIdx + 1)

                    return (
                      <div
                        key={d.id}
                        className="grid"
                        style={{ gridTemplateColumns }}
                      >
                        <button
                          type="button"
                          onClick={() => onClickDispatch(d)}
                          style={{ gridColumn: `${startIdx + 1} / span ${span}` }}
                          className={cn(
                            'h-8 truncate rounded-md border px-2 text-left text-xs font-medium transition-opacity hover:opacity-80',
                            barColors[d.status],
                          )}
                          title={`${d.driverName} — ${d.stops.length} stop${d.stops.length === 1 ? '' : 's'}`}
                        >
                          {d.driverName} · {d.stops.length} stop{d.stops.length === 1 ? '' : 's'}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Draft card
// ---------------------------------------------------------------------------

function DraftCard({
  dispatch,
  driverById,
  onApprove,
  onEdit,
  isApproving,
}: {
  dispatch: DispatchRow
  driverById: Map<string, DriverWithPush>
  onApprove: (dispatch: DispatchRow) => void
  onEdit: (dispatch: DispatchRow) => void
  isApproving: boolean
}) {
  const driver = driverById.get(dispatch.driverId)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{dispatch.vehicleName}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatDayMonth(dispatch.startDate)}–{formatDayMonth(dispatch.endDate)}
            </p>
          </div>
          <Badge variant="outline" className={statusColors[dispatch.status]}>
            {STATUS_LABELS[dispatch.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{dispatch.driverName}</span>
          <PushStatus hasPush={driver?.hasPush ?? false} />
        </div>

        {dispatch.stops.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stops attached.</p>
        ) : (
          <ol className="space-y-1.5">
            {dispatch.stops.map((stop, i) => (
              <li key={stop.id} className="text-sm">
                <span className="text-muted-foreground">{i + 1}.</span>{' '}
                <span className="font-medium">{stop.propertyName ?? stop.label ?? 'Destination'}</span>{' '}
                <span className="text-muted-foreground">
                  · {stop.requesterName ?? 'Unknown requester'} · {stop.paxCount ?? '—'} pax
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => onEdit(dispatch)}>
            Edit
          </Button>
          <Button size="sm" onClick={() => onApprove(dispatch)} disabled={isApproving}>
            {isApproving ? 'Approving...' : 'Approve & Dispatch'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// DispatchBoard
// ---------------------------------------------------------------------------

interface DispatchBoardProps {
  dispatches: DispatchRow[]
  pendingRequests: FleetRequestRow[]
  vehicles: Vehicle[]
  drivers: DriverWithPush[]
}

export function DispatchBoard({ dispatches, pendingRequests, vehicles, drivers }: DispatchBoardProps) {
  const router = useRouter()

  const [isRunning, setIsRunning] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editDispatch, setEditDispatch] = useState<DispatchRow | null>(null)
  const [prefillRequest, setPrefillRequest] = useState<FleetRequestRow | null>(null)
  // Reasons come back keyed by requestId from the last "Run engine now"
  // response, and are shown verbatim against the matching request below —
  // they're written for a human to read (e.g. "No cargo-capable vehicle free
  // 12–14 Aug"), not paraphrased or re-derived here.
  const [unassignableReasons, setUnassignableReasons] = useState<Record<string, string>>({})

  const driverById = useMemo(() => {
    const map = new Map<string, DriverWithPush>()
    for (const d of drivers) map.set(d.id, d)
    return map
  }, [drivers])

  const today = colomboToday()
  const timelineDays = useMemo(
    () => Array.from({ length: TIMELINE_DAYS }, (_, i) => addDays(today, i)),
    [today],
  )
  const timelineEnd = timelineDays[timelineDays.length - 1]

  const timelineDispatches = useMemo(
    () => dispatches.filter((d) => windowsOverlap(d.startDate, d.endDate, today, timelineEnd)),
    [dispatches, today, timelineEnd],
  )

  const draftDispatches = useMemo(() => dispatches.filter((d) => d.status === 'draft'), [dispatches])

  const isEmpty = dispatches.length === 0 && pendingRequests.length === 0

  async function handleRunEngine() {
    setIsRunning(true)
    try {
      const res = await fetch('/api/fleet/dispatches/run-engine', { method: 'POST' })
      if (!res.ok) {
        // A 409 means the engine is disabled in fleet settings — the
        // server's message says so; surface it verbatim rather than a
        // generic failure toast.
        throw new Error(await parseErrorMessage(res, 'Engine run failed'))
      }
      const result: { created: number; unassignable: UnassignableRequest[] } = await res.json()
      toast.success(
        result.created === 0
          ? 'Engine ran — no new dispatches to draft'
          : `Engine drafted ${result.created} dispatch${result.created === 1 ? '' : 'es'}`,
      )
      const reasons: Record<string, string> = {}
      for (const u of result.unassignable) reasons[u.requestId] = u.reason
      setUnassignableReasons(reasons)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Engine run failed')
    } finally {
      setIsRunning(false)
    }
  }

  async function handleApprove(dispatch: DispatchRow) {
    setApprovingId(dispatch.id)
    try {
      const res = await fetch(`/api/fleet/dispatches/${dispatch.id}`, { method: 'POST' })
      if (!res.ok) {
        throw new Error(await parseErrorMessage(res, 'Failed to approve dispatch'))
      }
      toast.success('Dispatched — driver notified')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve dispatch')
    } finally {
      setApprovingId(null)
    }
  }

  function openEditor(next: { dispatch?: DispatchRow | null; request?: FleetRequestRow | null }) {
    setEditDispatch(next.dispatch ?? null)
    setPrefillRequest(next.request ?? null)
    setEditorOpen(true)
  }

  return (
    <div className="space-y-8">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dispatch Review</h1>
          <p className="text-sm text-muted-foreground">
            Review the pooling engine&apos;s draft dispatches and approve them for the road.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRunEngine} disabled={isRunning}>
            {isRunning ? 'Planning…' : 'Run engine now'}
          </Button>
          <Button onClick={() => openEditor({})}>
            <Plus className="size-4" />
            New dispatch
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarClock className="size-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">Nothing scheduled</h3>
          <p className="text-sm text-muted-foreground">
            Run the engine to draft dispatches from pending requests.
          </p>
        </div>
      ) : (
        <>
          {/* Timeline */}
          <div className="space-y-3">
            <h2 className="text-lg font-medium">Timeline</h2>
            {vehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No vehicles configured yet.</p>
            ) : (
              <Timeline
                vehicles={vehicles}
                dispatches={timelineDispatches}
                timelineDays={timelineDays}
                today={today}
                timelineEnd={timelineEnd}
                onClickDispatch={(dispatch) => openEditor({ dispatch })}
              />
            )}
          </div>

          {/* Drafts awaiting approval */}
          <div className="space-y-3">
            <h2 className="text-lg font-medium">Drafts awaiting approval</h2>
            {draftDispatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drafts awaiting approval.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {draftDispatches.map((dispatch) => (
                  <DraftCard
                    key={dispatch.id}
                    dispatch={dispatch}
                    driverById={driverById}
                    onApprove={handleApprove}
                    onEdit={(d) => openEditor({ dispatch: d })}
                    isApproving={approvingId === dispatch.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Unassigned requests */}
          <div className="space-y-3">
            <h2 className="text-lg font-medium">Unassigned requests</h2>
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unassigned requests.</p>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((r) => {
                  const label =
                    r.requestType === 'visit'
                      ? (r.propertyName ?? 'Unknown property')
                      : (r.destinationText ?? '—')
                  return (
                    <Card key={r.id}>
                      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">{label}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDayMonth(r.startDate)}–{formatDayMonth(r.endDate)} · {r.paxCount} pax ·{' '}
                            {r.requesterName ?? 'Unknown'}
                          </p>
                          {unassignableReasons[r.id] && (
                            <p className="mt-1 text-sm text-destructive">{unassignableReasons[r.id]}</p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditor({ request: r })}
                        >
                          Assign manually
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      <DispatchEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        vehicles={vehicles}
        drivers={drivers}
        pendingRequests={pendingRequests}
        dispatch={editDispatch}
        prefillRequest={prefillRequest}
        onSuccess={() => setEditorOpen(false)}
      />
    </div>
  )
}
