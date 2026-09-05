'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useForm, Controller } from 'react-hook-form'
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Truck,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import type { Property, Vehicle } from '@/lib/db/schema'
import { VehicleComplianceFields, type VehicleFormValues, type ManagerOption } from './vehicle-compliance-fields'
import { complianceSchema, documentStatus, renewalKinds } from '@/lib/fleet/vehicle-compliance'
import { colomboToday } from '@/lib/fleet/dates'

// Radix Select forbids an empty-string item value — use a sentinel for "no property".
const HEAD_OFFICE = '_head_office_'

const STATUS_CONFIG = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  maintenance: {
    label: 'Maintenance',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  retired: { label: 'Retired', className: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
} as const

function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error
    if (typeof err === 'string') return err
  }
  return fallback
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function createColumns(
  propertyNameById: Map<string, string>,
  onEdit: (vehicle: Vehicle) => void,
  onDelete: (vehicle: Vehicle) => void
): ColumnDef<Vehicle>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Name
          <ArrowUpDown className="size-3.5" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'registrationNo',
      header: 'Registration',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.registrationNo ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'maxPassengers',
      header: 'Seats',
      cell: ({ row }) => row.original.maxPassengers === 0 && row.original.compliance.sourceRecord ? 'Not confirmed' : row.original.maxPassengers,
    },
    {
      id: 'cargoCapable',
      header: 'Cargo',
      cell: ({ row }) =>
        row.original.cargoCapable ? (
          <Badge variant="secondary">Cargo</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'isRestricted',
      header: 'Restricted',
      cell: ({ row }) =>
        row.original.isRestricted ? (
          <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
            Restricted
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'currentLocation',
      header: 'Currently at',
      cell: ({ row }) => {
        const id = row.original.currentLocationPropertyId
        return (
          <span className="text-muted-foreground">
            {id ? (propertyNameById.get(id) ?? 'Unknown property') : 'Head office'}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const vehicle = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(vehicle)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(vehicle)}>
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Create/edit form
// ---------------------------------------------------------------------------

interface VehicleFormProps {
  vehicle?: Vehicle | null
  properties: Property[]
  onSuccess: () => void
  managers: ManagerOption[]
}

function VehicleForm({ vehicle, properties, managers, onSuccess }: VehicleFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!vehicle

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<VehicleFormValues>({
    defaultValues: {
      name: vehicle?.name ?? '',
      registrationNo: vehicle?.registrationNo ?? '',
      maxPassengers: vehicle?.maxPassengers ?? 1,
      cargoCapable: vehicle?.cargoCapable ?? false,
      isRestricted: vehicle?.isRestricted ?? false,
      status: vehicle?.status ?? 'active',
      currentLocationPropertyId: vehicle?.currentLocationPropertyId ?? HEAD_OFFICE,
      sortOrder: vehicle?.sortOrder ?? 0,
      administrationManagerId: vehicle?.administrationManagerId ?? '',
      renewalLeadDays: vehicle?.renewalLeadDays ?? 30,
      compliance: vehicle?.compliance ?? {},
    },
  })

  async function onSubmit(values: VehicleFormValues) {
    setIsSubmitting(true)
    try {
      const compliance = complianceSchema.safeParse(Object.fromEntries(Object.entries(values.compliance).map(([key, value]) => [key, value === '' ? null : value])))
      if (!compliance.success) throw new Error(compliance.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '))
      const body = {
        name: values.name,
        registrationNo: values.registrationNo.trim() || null,
        maxPassengers: values.maxPassengers,
        cargoCapable: values.cargoCapable,
        isRestricted: values.isRestricted,
        status: values.status,
        currentLocationPropertyId:
          values.currentLocationPropertyId === HEAD_OFFICE
            ? null
            : values.currentLocationPropertyId,
        sortOrder: values.sortOrder,
        administrationManagerId: values.administrationManagerId || null,
        renewalLeadDays: values.renewalLeadDays,
        compliance: compliance.data,
      }

      const res = await fetch(
        isEditing ? `/api/fleet/vehicles/${vehicle.id}` : '/api/fleet/vehicles',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )

      if (!res.ok) {
        throw new Error(
          await parseErrorMessage(
            res,
            isEditing ? 'Failed to update vehicle' : 'Failed to create vehicle'
          )
        )
      }

      toast.success(isEditing ? 'Vehicle updated' : 'Vehicle created')
      onSuccess()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="vehicle-name">Name</Label>
        <Input id="vehicle-name" {...register('name', { required: 'Name is required' })} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="vehicle-registration">Registration No.</Label>
        <Input id="vehicle-registration" placeholder="Optional" {...register('registrationNo')} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vehicle-seats">Seats</Label>
        <Input
          id="vehicle-seats"
          type="number"
          min={0}
          {...register('maxPassengers', {
            required: 'Seats is required',
            valueAsNumber: true,
            min: { value: 0, message: 'Must be 0 or more' },
            // A cleared input yields NaN from valueAsNumber. NaN is not ''
            // so RHF's `required` check alone lets it through, and it would
            // otherwise serialise as JSON null and fail the API's Zod schema
            // with a confusing "Validation failed". Catch it explicitly.
            validate: (v) => !Number.isNaN(v) || 'Seats is required',
          })}
        />
        {errors.maxPassengers && (
          <p className="text-sm text-destructive">{errors.maxPassengers.message}</p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label htmlFor="vehicle-cargo">Cargo capable</Label>
        <Controller
          control={control}
          name="cargoCapable"
          render={({ field }) => (
            <Switch id="vehicle-cargo" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5 pr-4">
          <Label htmlFor="vehicle-restricted">Restricted</Label>
          <p className="text-xs text-muted-foreground">
            Only executives with restricted-vehicle access can book this
          </p>
        </div>
        <Controller
          control={control}
          name="isRestricted"
          render={({ field }) => (
            <Switch
              id="vehicle-restricted"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label>Currently at</Label>
        <Controller
          control={control}
          name="currentLocationPropertyId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HEAD_OFFICE}>Head office</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vehicle-sort-order">Sort order</Label>
        <Input
          id="vehicle-sort-order"
          type="number"
          {...register('sortOrder', {
            // sortOrder is not nullable server-side, and a blank field has
            // no meaningful "unset" state distinct from 0 — clearing it
            // just means "back to the default", so coerce the empty string
            // to 0 explicitly rather than letting valueAsNumber send NaN
            // (which serialises as JSON null and fails the API schema).
            setValueAs: (v) => (v === '' ? 0 : Number(v)),
          })}
        />
      </div>

      <VehicleComplianceFields control={control} register={register} managers={managers} />
      {errors.renewalLeadDays && <p role="alert" className="text-sm text-destructive">Lead time must be a whole number from 0 to 365.</p>}
      <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-background py-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isEditing
              ? 'Saving...'
              : 'Creating...'
            : isEditing
              ? 'Save Changes'
              : 'Create Vehicle'}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// VehiclesClient
// ---------------------------------------------------------------------------

interface VehiclesClientProps {
  vehicles: Vehicle[]
  properties: Property[]
  managers: ManagerOption[]
}

export function VehiclesClient({ vehicles, properties, managers }: VehiclesClientProps) {
  const router = useRouter()

  const [sorting, setSorting] = useState<SortingState>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null)
  const [deleteVehicleTarget, setDeleteVehicleTarget] = useState<Vehicle | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  async function checkRenewals() {
    setIsChecking(true)
    try {
      const res = await fetch('/api/fleet/renewals', { method: 'POST' })
      if (!res.ok) throw new Error(await parseErrorMessage(res, 'Renewal check failed'))
      const result = await res.json()
      toast.success(`Checked ${result.checked} vehicles; created ${result.created} renewal tasks`)
      router.refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Renewal check failed') }
    finally { setIsChecking(false) }
  }

  const propertyNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of properties) map.set(p.id, p.name)
    return map
  }, [properties])

  function handleEdit(vehicle: Vehicle) {
    setEditVehicle(vehicle)
  }

  function handleDeleteClick(vehicle: Vehicle) {
    setDeleteVehicleTarget(vehicle)
  }

  async function handleDelete() {
    if (!deleteVehicleTarget) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/fleet/vehicles/${deleteVehicleTarget.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        // A vehicle referenced by a dispatch comes back as a 409 with a message
        // telling the admin to retire it instead — that is expected, not a bug.
        throw new Error(await parseErrorMessage(res, 'Failed to delete vehicle'))
      }

      toast.success('Vehicle deleted')
      setDeleteVehicleTarget(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete vehicle')
    } finally {
      setIsDeleting(false)
    }
  }

  const columns = useMemo(
    () => {
      const result = createColumns(propertyNameById, handleEdit, handleDeleteClick)
      result.splice(result.length - 1, 0, {
        id: 'renewals', header: 'Renewals', cell: ({ row }) => {
          const v = row.original
          const manager = managers.find(m => m.id === v.administrationManagerId)
          return <div className="min-w-44 space-y-1 text-xs">
            <div className={!manager?.isActive ? 'text-amber-700' : ''}>{manager?.isActive ? manager.fullName : 'Assign an active manager'}</div>
            {renewalKinds.map(({ kind, label }) => {
              const status = kind === 'emission' && v.compliance.emissionRequired === false ? 'Not applicable' : documentStatus(v.compliance[`${kind}End`], v.compliance[`${kind}Valid`], colomboToday(), v.renewalLeadDays)
              return <div key={kind} className={status === 'Expired' || status === 'Invalid' ? 'text-red-700' : status === 'Current' ? 'text-muted-foreground' : 'text-amber-700'}>{label}: {status}</div>
            })}
            <Link className="inline-block underline underline-offset-2" href={`/fleet/vehicles/${v.id}`}>View renewal tasks</Link>
          </div>
        },
      })
      return result
    },
    [propertyNameById, managers]
  )

  const table = useReactTable({
    data: vehicles,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vehicles</h1>
          <p className="text-sm text-muted-foreground">
            Manage the fleet used for guest and staff transport
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={checkRenewals} disabled={isChecking}>{isChecking ? 'Checking…' : 'Check renewals now'}</Button>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Add Vehicle
        </Button>
        </div>
      </div>

      {vehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Truck className="size-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No vehicles yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add the Bolero Lorry, Car 1 and Car 2 to get started.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Add Vehicle
          </Button>
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
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {table.getPageCount() > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {table.getRowModel().rows.length} of {vehicles.length} vehicles
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
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Vehicle</DialogTitle>
            <DialogDescription>Add a vehicle to the fleet.</DialogDescription>
          </DialogHeader>
          <VehicleForm properties={properties} managers={managers} onSuccess={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editVehicle} onOpenChange={(open) => !open && setEditVehicle(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Vehicle</DialogTitle>
            <DialogDescription>Update vehicle details.</DialogDescription>
          </DialogHeader>
          {editVehicle && (
            <VehicleForm
              vehicle={editVehicle}
              managers={managers}
              properties={properties}
              onSuccess={() => setEditVehicle(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Alert Dialog */}
      <AlertDialog
        open={!!deleteVehicleTarget}
        onOpenChange={(open) => !open && setDeleteVehicleTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteVehicleTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. If this vehicle has dispatches assigned to it, the
              deletion will be rejected — set it to retired instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
