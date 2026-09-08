'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQueryState } from 'nuqs'
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { Ban, CarFront, ChevronLeft, ChevronRight, FileText, MoreHorizontal, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDayMonth } from '@/lib/fleet/dates'
import { formatTripRoute } from '@/lib/fleet/labels'
import { getReportStatus, type TripReportStatus } from '@/lib/fleet/reports'
import type { Property, Vehicle } from '@/lib/db/schema'
import { RequestForm, type FleetRequestRow } from './request-form'
import type { FleetTaskReasonOption, listMyRides } from '@/lib/db/queries/dispatches'
import type { ProjectWithCounts } from '@/lib/db/queries/projects'

const TYPE_LABELS: Record<FleetRequestRow['requestType'], string> = {
  visit: 'Property visit',
  standalone: 'Other trip',
}

const STATUS_LABELS: Record<FleetRequestRow['status'], string> = {
  pending: 'Pending',
  queued: 'Queued',
  dispatched: 'Dispatched',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// Matches the codebase's status badge convention (see e.g. tasks/task-meta.ts).
const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  queued: 'bg-blue-100 text-blue-800',
  dispatched: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-slate-100 text-slate-800',
  cancelled: 'bg-red-100 text-red-800',
}

const REPORT_STATUS_LABELS: Record<TripReportStatus, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  overdue: 'Overdue',
}

const reportStatusColors: Record<TripReportStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-emerald-100 text-emerald-800',
  overdue: 'bg-red-100 text-red-800',
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'queued', label: 'Queued' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error
    if (typeof err === 'string') return err
  }
  return fallback
}

/**
 * Mirrors the PATCH /api/fleet/requests/[id] gate exactly: only a pending
 * request can be edited, and only by its owner or a fleet admin. Showing an
 * Edit action outside these conditions would offer an action that is
 * guaranteed to 409.
 */
function canEditRow(r: FleetRequestRow, currentUserId: string, isFleetAdmin: boolean): boolean {
  const isOwner = r.requestedBy === currentUserId
  return r.status === 'pending' && (isOwner || isFleetAdmin)
}

/**
 * Mirrors the DELETE /api/fleet/requests/[id] gate exactly:
 * - completed / cancelled: never (already final, no reversal path)
 * - dispatched: fleet admin only (vehicle already committed, driver notified)
 * - pending / queued: owner or fleet admin
 */
function canCancelRow(r: FleetRequestRow, currentUserId: string, isFleetAdmin: boolean): boolean {
  if (r.status === 'completed' || r.status === 'cancelled') return false
  const isOwner = r.requestedBy === currentUserId
  if (r.status === 'dispatched') return isFleetAdmin
  return isOwner || isFleetAdmin
}

function getRowReportStatus(r: FleetRequestRow): TripReportStatus | null {
  if (!r.tripReportId && !r.tripReportDueAt) return null
  if (!r.tripReportDueAt) return r.tripReportSubmittedAt ? 'submitted' : 'pending'
  return getReportStatus(r.tripReportDueAt, r.tripReportSubmittedAt)
}

function canEditTripReport(r: FleetRequestRow, currentUserId: string): boolean {
  return r.status !== 'cancelled' && (r.tripReportOwnerId ?? r.reportOwnerId ?? r.requestedBy) === currentUserId && !!(r.tripReportId || r.tripReportDueAt) && (!r.tripReportDueAt || new Date(r.tripReportDueAt).getTime() > Date.now())
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function createColumns(
  currentUserId: string,
  isFleetAdmin: boolean,
  onEdit: (r: FleetRequestRow) => void,
  onCancel: (r: FleetRequestRow) => void,
): ColumnDef<FleetRequestRow>[] {
  return [
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => <Badge variant="outline">{TYPE_LABELS[row.original.requestType]}</Badge>,
    },
    {
      id: 'destination',
      header: 'Route',
      cell: ({ row }) => <span className="font-medium">{formatTripRoute(row.original)}</span>,
    },
    {
      id: 'dates',
      header: 'Dates',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDayMonth(row.original.startDate)}–{formatDayMonth(row.original.endDate)}
        </span>
      ),
    },
    {
      accessorKey: 'paxCount',
      header: 'Pax',
      cell: ({ row }) => row.original.paxCount,
    },
    {
      id: 'cargoRequired',
      header: 'Cargo',
      cell: ({ row }) =>
        row.original.cargoRequired ? (
          <Badge variant="secondary">Cargo</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'requester',
      header: 'Requester',
      cell: ({ row }) => row.original.requesterName ?? 'Unknown',
    },
    {
      id: 'task',
      header: 'Task reason',
      cell: ({ row }) => row.original.taskTitle ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status
        return (
          <Badge variant="outline" className={statusColors[status]}>
            {STATUS_LABELS[status]}
          </Badge>
        )
      },
    },
    {
      id: 'tripReport',
      header: 'Trip report',
      cell: ({ row }) => {
        const reportStatus = getRowReportStatus(row.original)
        if (!reportStatus) return <span className="text-muted-foreground">—</span>
        return (
          <Link href={`/fleet/reports/${row.original.id}`} className="inline-flex flex-col gap-1">
            <Badge variant="outline" className={row.original.status === 'cancelled' ? statusColors.cancelled : reportStatusColors[reportStatus]}>{row.original.status === 'cancelled' ? 'Cancelled' : !row.original.tripReportDueAt && reportStatus !== 'submitted' ? 'Draft' : REPORT_STATUS_LABELS[reportStatus]}</Badge>
            <span className="text-xs underline">{canEditTripReport(row.original, currentUserId) ? row.original.tripReportSubmittedAt ? 'Edit report' : 'Continue draft' : 'Open report'}</span>
          </Link>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const r = row.original
        const editable = canEditRow(r, currentUserId, isFleetAdmin)
        const cancellable = canCancelRow(r, currentUserId, isFleetAdmin)
        const canSubmitReport = canEditTripReport(r, currentUserId)
        if (!editable && !cancellable && !r.tripReportId && !r.tripReportDueAt) {
          return <span className="text-muted-foreground">—</span>
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {editable && (
                <DropdownMenuItem onClick={() => onEdit(r)}>
                  <Pencil className="size-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {(editable || canSubmitReport) && cancellable && <DropdownMenuSeparator />}
              {(r.tripReportId || r.tripReportDueAt) && (
                <DropdownMenuItem asChild>
                  <Link href={`/fleet/reports/${r.id}`}><FileText className="size-4" />{canSubmitReport ? r.tripReportSubmittedAt ? 'Edit report' : 'Continue draft' : 'Open report'}</Link>
                </DropdownMenuItem>
              )}
              {editable && canSubmitReport && <DropdownMenuSeparator />}
              {cancellable && (
                <DropdownMenuItem variant="destructive" onClick={() => onCancel(r)}>
                  <Ban className="size-4" />
                  Cancel
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// RequestsTable
// ---------------------------------------------------------------------------

interface RequestsTableProps {
  personalView?: boolean
  people: { id: string; fullName: string }[]
  requests: (FleetRequestRow & { assignment?: Awaited<ReturnType<typeof listMyRides>>[number]['assignment'] })[]
  vehicles: Vehicle[]
  properties: Property[]
  projects: ProjectWithCounts[]
  eligibleTasks: FleetTaskReasonOption[]
  currentUserId: string
  isFleetAdmin: boolean
  /**
   * Mirrors POST /api/fleet/requests's own gate (canBookFleet, or role
   * admin). Deliberately NOT the same as isFleetAdmin — a fleet admin who
   * dispatches/reviews trips is not automatically an executive who books
   * them, and offering "New request" to one who can't book would 403 on
   * every submit.
   */
  canCreateRequest: boolean
}

export function RequestsTable({
  personalView = false,
  requests,
  vehicles,
  properties,
  projects,
  eligibleTasks,
  people,
  currentUserId,
  isFleetAdmin,
  canCreateRequest,
}: RequestsTableProps) {
  const router = useRouter()

  const [status, setStatus] = useQueryState('status', { defaultValue: 'all', shallow: false })
  const [scope, setScope] = useQueryState('scope', { defaultValue: 'mine', shallow: false })
  const [view, setView] = useQueryState('view', { defaultValue: 'all', shallow: false })

  const [createOpen, setCreateOpen] = useState(false)
  const [editRequest, setEditRequest] = useState<FleetRequestRow | null>(null)
  const [cancelTarget, setCancelTarget] = useState<FleetRequestRow | null>(null)
  const [isCanceling, setIsCanceling] = useState(false)

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (status !== 'all' && r.status !== status) return false
      if (personalView && view === 'upcoming' && (r.status === 'completed' || r.status === 'cancelled')) return false
      if (personalView && view === 'completed' && r.status !== 'completed') return false
      if (personalView && view === 'reports' && (!r.tripReportId || r.tripReportSubmittedAt || r.status === 'cancelled' || (r.tripReportOwnerId ?? r.reportOwnerId ?? r.requestedBy) !== currentUserId)) return false
      if (isFleetAdmin && scope === 'mine' && r.requestedBy !== currentUserId && (r.tripReportOwnerId ?? r.reportOwnerId) !== currentUserId) return false
      return true
    })
  }, [requests, status, isFleetAdmin, scope, currentUserId, personalView, view])

  function handleEdit(r: FleetRequestRow) {
    setEditRequest(r)
  }

  function handleCancelClick(r: FleetRequestRow) {
    setCancelTarget(r)
  }

  async function handleCancel() {
    if (!cancelTarget) return
    setIsCanceling(true)
    try {
      const res = await fetch(`/api/fleet/requests/${cancelTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error(await parseErrorMessage(res, 'Failed to cancel request'))
      }
      toast.success('Request cancelled')
      setCancelTarget(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel request')
    } finally {
      setIsCanceling(false)
    }
  }

  const columns = useMemo(
    () => createColumns(currentUserId, isFleetAdmin, handleEdit, handleCancelClick),
    [currentUserId, isFleetAdmin]
  )

  const table = useReactTable<RequestsTableProps['requests'][number]>({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{personalView ? 'My Rides' : 'Fleet Requests'}</h1>
          <p className="text-sm text-muted-foreground">
            {personalView ? 'Your requests, assigned trips and visit reports in one place.' : 'Raise a trip request and track it through to dispatch'}
          </p>
        </div>
        {canCreateRequest && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {personalView ? 'Request a ride' : 'New request'}
          </Button>
        )}
      </div>

      {personalView && <div className="flex flex-wrap gap-2" aria-label="Ride views">
        {([['all', 'All rides'], ['upcoming', 'Upcoming & active'], ['completed', 'Completed'], ['reports', 'Reports to submit']] as const).map(([value, label]) =>
          <Button key={value} variant={view === value ? 'default' : 'outline'} size="sm" aria-pressed={view === value} onClick={() => { setView(value); setStatus('all') }}>{label}</Button>)}
      </div>}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isFleetAdmin && (
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">My requests</SelectItem>
              <SelectItem value="all">All requests</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CarFront className="size-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No trip requests yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {canCreateRequest ? 'Request a ride and the fleet team will assign a vehicle.' : 'Trips appear here when someone books a ride for you. Contact the fleet team to arrange travel.'}
          </p>
          {canCreateRequest && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {personalView ? 'Request a ride' : 'New request'}
            </Button>
          )}
        </div>
      ) : personalView ? (
        <div className="space-y-4">
          {filtered.length === 0 && <p className="py-12 text-center text-muted-foreground">No rides match this view.</p>}
          {table.getRowModel().rows.map(({ original: ride }) => {
            const editable = canEditTripReport(ride, currentUserId)
            const reportStatus = getRowReportStatus(ride)
            const deadline = ride.tripReportDueAt ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ride.tripReportDueAt)) : null
            return <article key={ride.id} className="rounded-xl border bg-background p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={statusColors[ride.status]}>{STATUS_LABELS[ride.status]}</Badge><span className="text-sm text-muted-foreground">{formatDayMonth(ride.startDate)}–{formatDayMonth(ride.endDate)}</span></div>
                  <h2 className="break-words text-lg font-semibold">{formatTripRoute(ride)}</h2>
                  {ride.purpose && <p className="max-w-prose break-words text-sm text-muted-foreground">{ride.purpose}</p>}
                  <p className="text-sm text-muted-foreground">{ride.requestedBy === currentUserId ? 'Requested by you' : `Booked by ${ride.requesterName ?? 'your team'}`}{(ride.tripReportOwnerId ?? ride.reportOwnerId ?? ride.requestedBy) === currentUserId ? ' · You are the report owner' : ''}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {canEditRow(ride, currentUserId, false) && <Button size="sm" variant="outline" onClick={() => handleEdit(ride)}>Edit request</Button>}
                  {canCancelRow(ride, currentUserId, false) && <Button size="sm" variant="ghost" onClick={() => handleCancelClick(ride)}>Cancel request</Button>}
                </div>
              </div>
              <div className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-2">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{ride.assignment?.status === 'draft' ? 'Provisional assignment' : 'Vehicle & driver'}</p>
                  {ride.assignment ? <><p>{ride.assignment.vehicleName}{ride.assignment.registrationNo ? ` (${ride.assignment.registrationNo})` : ''}</p><p className="text-muted-foreground">{ride.assignment.driverName}{ride.assignment.status === 'in_progress' ? ' · Trip in progress' : ''}</p></> : <p className="text-muted-foreground">{ride.status === 'cancelled' ? 'Request cancelled' : 'Awaiting assignment'}</p>}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">Visit report</p>{reportStatus && <Badge variant="outline" className={reportStatusColors[reportStatus]}>{REPORT_STATUS_LABELS[reportStatus]}</Badge>}</div>
                  <p className="text-muted-foreground">{ride.status === 'cancelled' ? 'No report required for this cancelled trip.' : !reportStatus ? 'Available as soon as a vehicle is assigned.' : deadline ? `Editing closes ${deadline} (Sri Lanka time).` : 'Start now; the deadline is 48 hours after trip completion.'}</p>
                  {reportStatus && <Button asChild size="sm" variant={editable ? 'default' : 'outline'}><Link href={`/fleet/reports/${ride.id}`}><FileText className="size-4" />{editable ? ride.tripReportSubmittedAt ? 'Edit report' : 'Continue report' : 'View report'}</Link></Button>}
                </div>
              </div>
            </article>
          })}
          {table.getPageCount() > 1 && <div className="flex items-center justify-between"><Button variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</Button><span className="text-sm">Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span><Button variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</Button></div>}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                      No requests match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {table.getPageCount() > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {table.getRowModel().rows.length} of {filtered.length} requests
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Request</DialogTitle>
            <DialogDescription>Raise a trip request for the fleet team.</DialogDescription>
          </DialogHeader>
          <RequestForm
            people={people}
            currentUserId={currentUserId}
            vehicles={vehicles}
            properties={properties}
            projects={projects}
            eligibleTasks={eligibleTasks}
            onSuccess={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editRequest} onOpenChange={(open) => !open && setEditRequest(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Request</DialogTitle>
            <DialogDescription>Update the trip details.</DialogDescription>
          </DialogHeader>
          {editRequest && (
            <RequestForm
              people={people}
              currentUserId={currentUserId}
              request={editRequest}
              vehicles={vehicles}
              properties={properties}
              projects={projects}
              eligibleTasks={eligibleTasks}
              onSuccess={() => setEditRequest(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Alert Dialog */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this trip request?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The fleet team will no longer plan a vehicle for this
              trip.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep request</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleCancel} disabled={isCanceling}>
              {isCanceling ? 'Cancelling...' : 'Cancel request'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
