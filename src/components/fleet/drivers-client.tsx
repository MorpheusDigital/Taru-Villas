'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import QRCode from 'qrcode'
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  Trash2,
  UserRound,
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
import type { Vehicle } from '@/lib/db/schema'
import type { listDrivers } from '@/lib/db/queries/fleet'

type Driver = Awaited<ReturnType<typeof listDrivers>>[number]

const LANGUAGE_LABELS: Record<Driver['preferredLanguage'], string> = {
  en: 'English',
  si: 'Sinhala',
  ta: 'Tamil',
}

function manifestUrl(appUrl: string, driver: Driver): string {
  return `${appUrl}/d/${driver.accessToken}`
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
// Manifest link cell — copy button + "Show QR" affordance.
// The driver's accessToken is never rendered as text, only embedded in the
// manifest URL used for the copy action and the QR code below.
// ---------------------------------------------------------------------------

function ManifestLinkCell({
  driver,
  appUrl,
  onShowQr,
}: {
  driver: Driver
  appUrl: string
  onShowQr: (driver: Driver) => void
}) {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(manifestUrl(appUrl, driver))
      toast.success('Manifest link copied')
    } catch {
      toast.error('Could not copy the link')
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={handleCopy}>
        <Copy className="size-3.5" />
        Copy link
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onShowQr(driver)}>
        <QrCode className="size-3.5" />
        Show QR
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// QR dialog — mirrors src/components/assets/asset-qr-label.tsx exactly: a
// useEffect calls QRCode.toDataURL and renders the result as an <img>.
// ---------------------------------------------------------------------------

function ManifestQrDialog({
  driver,
  appUrl,
  onOpenChange,
}: {
  driver: Driver | null
  appUrl: string
  onOpenChange: (open: boolean) => void
}) {
  // Keyed by the url it was generated for, so a stale image from a
  // previously-shown driver is never displayed while the new one loads.
  const [generated, setGenerated] = useState<{ url: string; dataUrl: string } | null>(null)
  const url = driver ? manifestUrl(appUrl, driver) : null

  useEffect(() => {
    if (!url) return
    let cancelled = false
    QRCode.toDataURL(url, { width: 320, margin: 1 })
      .then((dataUrl) => {
        if (!cancelled) setGenerated({ url, dataUrl })
      })
      .catch(() => {
        if (!cancelled) setGenerated(null)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  const dataUrl = generated && generated.url === url ? generated.dataUrl : null

  return (
    <Dialog open={!!driver} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Manifest QR</DialogTitle>
          <DialogDescription>
            {driver ? `Scan to open ${driver.fullName}'s manifest link.` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-6 text-center">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt="Manifest link QR code" className="size-56" />
          ) : (
            <div className="flex size-56 items-center justify-center text-xs text-muted-foreground">
              Generating QR...
            </div>
          )}
          {driver && <p className="font-medium">{driver.fullName}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function createColumns(
  vehicleNameById: Map<string, string>,
  appUrl: string,
  onEdit: (driver: Driver) => void,
  onDelete: (driver: Driver) => void,
  onShowQr: (driver: Driver) => void
): ColumnDef<Driver>[] {
  return [
    {
      accessorKey: 'fullName',
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
      cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span>,
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.phone ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'preferredLanguage',
      header: 'Language',
      cell: ({ row }) => LANGUAGE_LABELS[row.original.preferredLanguage],
    },
    {
      id: 'vehicleIds',
      header: 'Licensed for',
      cell: ({ row }) => {
        const ids = row.original.vehicleIds
        if (ids.length === 0) {
          return <span className="text-xs text-muted-foreground italic">None</span>
        }
        return (
          <div className="flex flex-wrap gap-1">
            {ids.map((id) => (
              <Badge key={id} variant="secondary" className="text-[11px]">
                {vehicleNameById.get(id) ?? 'Unknown vehicle'}
              </Badge>
            ))}
          </div>
        )
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Active',
      cell: ({ row }) => {
        const isActive = row.original.isActive
        return (
          <Badge
            variant={isActive ? 'default' : 'secondary'}
            className={
              isActive
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-zinc-100 text-zinc-500 border-zinc-200'
            }
          >
            {isActive ? 'Active' : 'Inactive'}
          </Badge>
        )
      },
    },
    {
      id: 'manifest',
      header: 'Manifest link',
      cell: ({ row }) => (
        <ManifestLinkCell driver={row.original} appUrl={appUrl} onShowQr={onShowQr} />
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const driver = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(driver)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(driver)}>
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

interface DriverFormValues {
  fullName: string
  phone: string
  preferredLanguage: 'en' | 'si' | 'ta'
  isActive: boolean
  vehicleIds: string[]
}

interface DriverFormProps {
  driver?: Driver | null
  vehicles: Vehicle[]
  onSuccess: () => void
}

function DriverForm({ driver, vehicles, onSuccess }: DriverFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!driver

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DriverFormValues>({
    defaultValues: {
      fullName: driver?.fullName ?? '',
      phone: driver?.phone ?? '',
      preferredLanguage: driver?.preferredLanguage ?? 'en',
      isActive: driver?.isActive ?? true,
      vehicleIds: driver?.vehicleIds ?? [],
    },
  })

  const selectedLanguage = watch('preferredLanguage')
  const isActive = watch('isActive')
  const selectedVehicleIds = watch('vehicleIds')

  function toggleVehicle(vehicleId: string) {
    const current = selectedVehicleIds || []
    if (current.includes(vehicleId)) {
      setValue(
        'vehicleIds',
        current.filter((id) => id !== vehicleId)
      )
    } else {
      setValue('vehicleIds', [...current, vehicleId])
    }
  }

  async function onSubmit(values: DriverFormValues) {
    setIsSubmitting(true)
    try {
      const body = {
        fullName: values.fullName,
        phone: values.phone.trim() || null,
        preferredLanguage: values.preferredLanguage,
        isActive: values.isActive,
        // Always sent in full: the API treats an absent vehicleIds as "leave
        // licences alone" and [] as "revoke all licences". Since the licence
        // checklist is part of every save here, we must always send the
        // complete current selection so a save never silently revokes.
        vehicleIds: values.vehicleIds,
      }

      const res = await fetch(
        isEditing ? `/api/fleet/drivers/${driver.id}` : '/api/fleet/drivers',
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
            isEditing ? 'Failed to update driver' : 'Failed to create driver'
          )
        )
      }

      toast.success(isEditing ? 'Driver updated' : 'Driver created')
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
        <Label htmlFor="driver-name">Full name</Label>
        <Input
          id="driver-name"
          {...register('fullName', { required: 'Full name is required' })}
        />
        {errors.fullName && (
          <p className="text-sm text-destructive">{errors.fullName.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="driver-phone">Phone</Label>
        <Input id="driver-phone" placeholder="Optional" {...register('phone')} />
      </div>

      <div className="space-y-2">
        <Label>Preferred language</Label>
        <Select
          value={selectedLanguage}
          onValueChange={(value) =>
            setValue('preferredLanguage', value as DriverFormValues['preferredLanguage'])
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="si">Sinhala</SelectItem>
            <SelectItem value="ta">Tamil</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label htmlFor="driver-active">Active</Label>
        <Switch
          id="driver-active"
          checked={isActive}
          onCheckedChange={(checked) => setValue('isActive', checked)}
        />
      </div>

      {/* Licensed to drive — a safety control, not a preference. A driver can
          only be dispatched with a vehicle ticked here; both the engine and
          the manual dispatch path enforce it. */}
      <div className="space-y-2">
        <Label>Licensed to drive</Label>
        <p className="text-xs text-muted-foreground">
          A driver can only be dispatched with a vehicle ticked here.
        </p>
        {vehicles.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            No vehicles yet — add one first.
          </p>
        ) : (
          <div className="space-y-2 rounded-lg border p-3 max-h-48 overflow-y-auto">
            {vehicles.map((vehicle) => (
              <label
                key={vehicle.id}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedVehicleIds?.includes(vehicle.id) ?? false}
                  onChange={() => toggleVehicle(vehicle.id)}
                  className="size-4 rounded border-input accent-primary"
                />
                <span className="flex-1">{vehicle.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isEditing
              ? 'Saving...'
              : 'Creating...'
            : isEditing
              ? 'Save Changes'
              : 'Create Driver'}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// DriversClient
// ---------------------------------------------------------------------------

interface DriversClientProps {
  drivers: Driver[]
  vehicles: Vehicle[]
  appUrl: string
}

export function DriversClient({ drivers, vehicles, appUrl }: DriversClientProps) {
  const router = useRouter()

  const [sorting, setSorting] = useState<SortingState>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editDriver, setEditDriver] = useState<Driver | null>(null)
  const [deleteDriverTarget, setDeleteDriverTarget] = useState<Driver | null>(null)
  const [qrDriver, setQrDriver] = useState<Driver | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const vehicleNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const v of vehicles) map.set(v.id, v.name)
    return map
  }, [vehicles])

  function handleEdit(driver: Driver) {
    setEditDriver(driver)
  }

  function handleDeleteClick(driver: Driver) {
    setDeleteDriverTarget(driver)
  }

  function handleShowQr(driver: Driver) {
    setQrDriver(driver)
  }

  async function handleDelete() {
    if (!deleteDriverTarget) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/fleet/drivers/${deleteDriverTarget.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        // A driver referenced by a dispatch comes back as a 409 with a message
        // telling the admin to deactivate them instead — expected, not a bug.
        throw new Error(await parseErrorMessage(res, 'Failed to delete driver'))
      }

      toast.success('Driver deleted')
      setDeleteDriverTarget(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete driver')
    } finally {
      setIsDeleting(false)
    }
  }

  const columns = useMemo(
    () => createColumns(vehicleNameById, appUrl, handleEdit, handleDeleteClick, handleShowQr),
    [vehicleNameById, appUrl]
  )

  const table = useReactTable({
    data: drivers,
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
          <h1 className="text-2xl font-semibold tracking-tight">Drivers</h1>
          <p className="text-sm text-muted-foreground">
            Manage drivers and which vehicles they are licensed to drive
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Add Driver
        </Button>
      </div>

      {/* Onboarding instructions — the most failure-prone part of this feature */}
      <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <Info className="size-5 shrink-0 text-amber-600" />
        <p>
          Send the driver their manifest link. They must open it{' '}
          <strong>in Chrome or Samsung Internet</strong> — NOT inside WhatsApp — then choose{' '}
          <strong>&quot;Add to Home screen&quot;</strong>, then tap <strong>Allow</strong> when
          asked about notifications. Without all three steps they will not receive trip alerts.
        </p>
      </div>

      {drivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <UserRound className="size-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No drivers yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first driver to start dispatching trips.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Add Driver
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
                Showing {table.getRowModel().rows.length} of {drivers.length} drivers
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
            <DialogTitle>Add Driver</DialogTitle>
            <DialogDescription>
              Add a driver and set which vehicles they are licensed for.
            </DialogDescription>
          </DialogHeader>
          <DriverForm vehicles={vehicles} onSuccess={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDriver} onOpenChange={(open) => !open && setEditDriver(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Driver</DialogTitle>
            <DialogDescription>Update driver details and vehicle licences.</DialogDescription>
          </DialogHeader>
          {editDriver && (
            <DriverForm
              driver={editDriver}
              vehicles={vehicles}
              onSuccess={() => setEditDriver(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Alert Dialog */}
      <AlertDialog
        open={!!deleteDriverTarget}
        onOpenChange={(open) => !open && setDeleteDriverTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteDriverTarget?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. If this driver has dispatches assigned to them, the
              deletion will be rejected — deactivate them instead.
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

      {/* QR Dialog */}
      <ManifestQrDialog
        driver={qrDriver}
        appUrl={appUrl}
        onOpenChange={(open) => !open && setQrDriver(null)}
      />
    </div>
  )
}
