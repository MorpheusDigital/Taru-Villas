'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryState } from 'nuqs'
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { Ban, CarFront, ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus } from 'lucide-react'
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
import type { Property, Vehicle } from '@/lib/db/schema'
import { RequestForm, type FleetRequestRow } from './request-form'

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

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function createColumns(
  currentUserId: string,
  isFleetAdmin: boolean,
  onEdit: (r: FleetRequestRow) => void,
  onCancel: (r: FleetRequestRow) => void
): ColumnDef<FleetRequestRow>[] {
  return [
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => <Badge variant="outline">{TYPE_LABELS[row.original.requestType]}</Badge>,
    },
    {
      id: 'destination',
      header: 'Destination',
      cell: ({ row }) => {
        const r = row.original
        const label =
          r.requestType === 'visit' ? (r.propertyName ?? 'Unknown property') : (r.destinationText ?? '—')
        return <span className="font-medium">{label}</span>
      },
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
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const r = row.original
        const editable = canEditRow(r, currentUserId, isFleetAdmin)
        const cancellable = canCancelRow(r, currentUserId, isFleetAdmin)
        if (!editable && !cancellable) {
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
              {editable && cancellable && <DropdownMenuSeparator />}
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
  requests: FleetRequestRow[]
  vehicles: Vehicle[]
  properties: Property[]
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
  requests,
  vehicles,
  properties,
  currentUserId,
  isFleetAdmin,
  canCreateRequest,
}: RequestsTableProps) {
  const router = useRouter()

  const [status, setStatus] = useQueryState('status', { defaultValue: 'all', shallow: false })
  const [scope, setScope] = useQueryState('scope', { defaultValue: 'mine', shallow: false })

  const [createOpen, setCreateOpen] = useState(false)
  const [editRequest, setEditRequest] = useState<FleetRequestRow | null>(null)
  const [cancelTarget, setCancelTarget] = useState<FleetRequestRow | null>(null)
  const [isCanceling, setIsCanceling] = useState(false)

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (status !== 'all' && r.status !== status) return false
      if (isFleetAdmin && scope === 'mine' && r.requestedBy !== currentUserId) return false
      return true
    })
  }, [requests, status, isFleetAdmin, scope, currentUserId])

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

  const table = useReactTable({
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
          <h1 className="text-2xl font-semibold tracking-tight">Fleet Requests</h1>
          <p className="text-sm text-muted-foreground">
            Raise a trip request and track it through to dispatch
          </p>
        </div>
        {canCreateRequest && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New request
          </Button>
        )}
      </div>

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
            Raise a request and the fleet team will assign a vehicle.
          </p>
          {canCreateRequest && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New request
            </Button>
          )}
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
            vehicles={vehicles}
            properties={properties}
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
              request={editRequest}
              vehicles={vehicles}
              properties={properties}
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
