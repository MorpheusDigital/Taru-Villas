'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDayMonth } from '@/lib/fleet/dates'
import type { Vehicle } from '@/lib/db/schema'
import type { DispatchRow, DriverWithPush } from './dispatch-board'
import type { FleetRequestRow } from './request-form'

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error
    if (typeof err === 'string') return err
  }
  return fallback
}

interface DispatchEditorFormValues {
  vehicleId: string
  driverId: string
  startDate: string
  endDate: string
}

interface DispatchEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicles: Vehicle[]
  drivers: DriverWithPush[]
  pendingRequests: FleetRequestRow[]
  /**
   * Present when opened from an existing draft (the card's "Edit" action, or
   * clicking its bar on the timeline) — used to prefill vehicle/driver/dates
   * and its currently-attached requests. There is no dispatch-update API
   * (only POST /api/fleet/dispatches to create, and POST .../[id] to
   * approve), so submitting here always creates a NEW draft seeded from
   * these values rather than modifying the one that was clicked.
   */
  dispatch?: DispatchRow | null
  /** Present when opened via "Assign manually" from a single unassigned request. */
  prefillRequest?: FleetRequestRow | null
  onSuccess?: () => void
}

export function DispatchEditorDialog({
  open,
  onOpenChange,
  vehicles,
  drivers,
  pendingRequests,
  dispatch,
  prefillRequest,
  onSuccess,
}: DispatchEditorDialogProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set())

  // Matches the manual-dispatch API's own `status !== 'active'` check
  // (src/app/api/fleet/dispatches/route.ts) — a maintenance/retired vehicle
  // is guaranteed to be rejected server-side, so it is not offered here.
  const activeVehicles = useMemo(() => vehicles.filter((v) => v.status === 'active'), [vehicles])

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<DispatchEditorFormValues>({
    defaultValues: { vehicleId: '', driverId: '', startDate: '', endDate: '' },
  })

  // Re-seed the form every time the dialog opens for a (possibly different)
  // context — "New dispatch", "Edit" on a draft, or "Assign manually" on a
  // request are three different entry points into the same dialog.
  useEffect(() => {
    if (!open) return
    const pendingIds = new Set(pendingRequests.map((r) => r.id))

    if (dispatch) {
      reset({
        vehicleId: dispatch.vehicleId,
        driverId: dispatch.driverId,
        startDate: dispatch.startDate,
        endDate: dispatch.endDate,
      })
      // Only requests that are still actually pending can be (re-)attached —
      // a stop on an already-approved/completed dispatch may point at a
      // request that is no longer selectable at all.
      const stopRequestIds = dispatch.stops
        .map((s) => s.requestId)
        .filter((id): id is string => id !== null && pendingIds.has(id))
      setSelectedRequestIds(new Set(stopRequestIds))
    } else if (prefillRequest) {
      reset({
        vehicleId: '',
        driverId: '',
        startDate: prefillRequest.startDate,
        endDate: prefillRequest.endDate,
      })
      setSelectedRequestIds(new Set([prefillRequest.id]))
    } else {
      reset({ vehicleId: '', driverId: '', startDate: '', endDate: '' })
      setSelectedRequestIds(new Set())
    }
  }, [open, dispatch, prefillRequest, pendingRequests, reset])

  const vehicleId = watch('vehicleId')
  const startDate = watch('startDate')

  const selectedVehicle = useMemo(
    () => activeVehicles.find((v) => v.id === vehicleId) ?? null,
    [activeVehicles, vehicleId],
  )

  // The licence rule, enforced here so the UI cannot offer a pairing the
  // server will refuse — POST /api/fleet/dispatches checks
  // driver.vehicleIds.includes(vehicle.id) with the exact same shape.
  const eligibleDrivers = useMemo(
    () => drivers.filter((d) => d.isActive && vehicleId !== '' && d.vehicleIds.includes(vehicleId)),
    [drivers, vehicleId],
  )
  const noEligibleDriver = vehicleId !== '' && eligibleDrivers.length === 0

  const selectedPax = useMemo(
    () =>
      pendingRequests
        .filter((r) => selectedRequestIds.has(r.id))
        .reduce((sum, r) => sum + r.paxCount, 0),
    [pendingRequests, selectedRequestIds],
  )

  // Warn, don't block — a fleet admin overriding this deliberately (e.g. two
  // children counted as one adult-equivalent seat) is legitimate; doing it
  // silently is not.
  const paxWarning =
    selectedVehicle && selectedPax > selectedVehicle.maxPassengers
      ? `Selected trips carry ${selectedPax} passengers but this vehicle seats ${selectedVehicle.maxPassengers}.`
      : null

  function toggleRequest(requestId: string) {
    setSelectedRequestIds((prev) => {
      const next = new Set(prev)
      if (next.has(requestId)) next.delete(requestId)
      else next.add(requestId)
      return next
    })
  }

  async function onSubmit(values: DispatchEditorFormValues) {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/fleet/dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: values.vehicleId,
          driverId: values.driverId,
          startDate: values.startDate,
          endDate: values.endDate,
          requestIds: [...selectedRequestIds],
        }),
      })

      if (!res.ok) {
        throw new Error(await parseErrorMessage(res, 'Failed to create dispatch'))
      }

      toast.success('Dispatch created')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = dispatch ? 'Edit Dispatch' : prefillRequest ? 'Assign Manually' : 'New Dispatch'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Choose a vehicle, an eligible driver, and the requests to attach.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label>Vehicle</Label>
            <Controller
              control={control}
              name="vehicleId"
              rules={{ required: 'Select a vehicle' }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} ({v.maxPassengers} seats{v.cargoCapable ? ', cargo' : ''})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.vehicleId && <p className="text-sm text-destructive">{errors.vehicleId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Driver</Label>
            <Controller
              control={control}
              name="driverId"
              rules={{ required: 'Select a driver' }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={vehicleId === ''}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={vehicleId === '' ? 'Select a vehicle first' : 'Select a driver'} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleDrivers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {/* This makes the licence rule impossible to violate from the UI,
                matching what the engine (and the manual-dispatch API) enforce
                server-side — it takes priority over RHF's own "required"
                message, since it is the more specific and more actionable of
                the two. */}
            {noEligibleDriver ? (
              <p className="text-sm text-destructive">No driver is licensed for this vehicle.</p>
            ) : (
              errors.driverId && <p className="text-sm text-destructive">{errors.driverId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dispatch-start">Start date</Label>
              <Input
                id="dispatch-start"
                type="date"
                {...register('startDate', { required: 'Start date is required' })}
              />
              {errors.startDate && <p className="text-sm text-destructive">{errors.startDate.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispatch-end">End date</Label>
              <Input
                id="dispatch-end"
                type="date"
                {...register('endDate', {
                  required: 'End date is required',
                  validate: (v) => !v || v >= startDate || 'End date cannot be before the start date',
                })}
              />
              {errors.endDate && <p className="text-sm text-destructive">{errors.endDate.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Requests to attach</Label>
            {pendingRequests.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">No pending requests.</p>
            ) : (
              <div className="space-y-1 rounded-lg border p-3 max-h-56 overflow-y-auto">
                {pendingRequests.map((r) => {
                  const label =
                    r.requestType === 'visit' ? (r.propertyName ?? 'Unknown property') : (r.destinationText ?? '—')
                  return (
                    <label
                      key={r.id}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedRequestIds.has(r.id)}
                        onCheckedChange={() => toggleRequest(r.id)}
                      />
                      <span className="flex-1">
                        {label} — {formatDayMonth(r.startDate)}–{formatDayMonth(r.endDate)} · {r.paxCount} pax
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            {paxWarning && <p className="text-sm text-amber-600">{paxWarning}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting || noEligibleDriver}>
              {isSubmitting ? 'Creating...' : 'Create Dispatch'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
