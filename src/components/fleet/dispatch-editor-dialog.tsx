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
import { formatTripRoute } from '@/lib/fleet/labels'
import { validateVehicleForCluster } from '@/lib/fleet/constraints'
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

type DispatchStopRow = DispatchRow['stops'][number]

/** Narrows a stop to one that actually points at a request — the only kind
 *  that can be toggled on/off in the editor (a stop with no requestId has
 *  nothing to attach/detach and is never shown as a checkbox). */
function hasRequestId(s: DispatchStopRow): s is DispatchStopRow & { requestId: string } {
  return s.requestId !== null
}

/** The subset of fields validateVehicleForCluster's requirements are built
 *  from, common to a dispatch's own currently-attached stops and to a
 *  pending request available to add — so both can feed the same check. */
interface ClusterCandidate {
  id: string
  paxCount: number
  cargoRequired: boolean
  requesterCanUseRestricted: boolean
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
   * Present only when opened from an existing DRAFT (the card's "Edit"
   * action, or clicking its bar on the timeline — never a non-draft, since
   * neither offers this dialog for approved/in-progress/completed work) —
   * used to prefill vehicle/driver/dates and its currently-attached
   * requests, and to route submission to `PATCH
   * /api/fleet/dispatches/[id]` (a real update) instead of `POST` (create).
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
  // (validateManualDispatchInput) — a maintenance/retired vehicle is
  // guaranteed to be rejected server-side, so it is not offered as a
  // pickable option (see vehicleOptions below for the one exception: the
  // dispatch being edited, prefilled and disabled).
  const activeVehicles = useMemo(() => vehicles.filter((v) => v.status === 'active'), [vehicles])

  // When editing a draft whose vehicle has since gone to maintenance/
  // retired, activeVehicles alone would omit it — the Select's trigger
  // would then show its placeholder instead of the vehicle's actual name,
  // reading as "my selection was lost" even though field.value still holds
  // the real id (the exact bug class request-form.tsx's
  // visitPropertyOptions was written to avoid, for a deactivated
  // property). Appended back as a disabled option so the trigger shows the
  // correct name; `vehicleInactive` below still blocks submission until
  // the admin actively picks a different, active vehicle.
  const vehicleOptions = useMemo(() => {
    if (!dispatch) return activeVehicles
    if (activeVehicles.some((v) => v.id === dispatch.vehicleId)) return activeVehicles
    const staleVehicle = vehicles.find((v) => v.id === dispatch.vehicleId)
    return staleVehicle ? [...activeVehicles, staleVehicle] : activeVehicles
  }, [activeVehicles, vehicles, dispatch])

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

    if (dispatch) {
      reset({
        vehicleId: dispatch.vehicleId,
        driverId: dispatch.driverId,
        startDate: dispatch.startDate,
        endDate: dispatch.endDate,
      })
      // Seed with the dispatch's ACTUAL currently-attached requests — these
      // are always `queued`, never `pending`, so they must be read from
      // `dispatch.stops` directly, not intersected against `pendingRequests`
      // (an earlier version of this dialog did exactly that, and since the
      // intersection of "queued" and "pending" is always empty, every edit
      // silently detached every trip on the dispatch — see task-15-report.md
      // for the full account of that defect).
      setSelectedRequestIds(new Set(dispatch.stops.filter(hasRequestId).map((s) => s.requestId)))
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
  }, [open, dispatch, prefillRequest, reset])

  const vehicleId = watch('vehicleId')
  const startDate = watch('startDate')

  const selectedVehicle = useMemo(
    () => activeVehicles.find((v) => v.id === vehicleId) ?? null,
    [activeVehicles, vehicleId],
  )

  // Looked up against the FULL vehicle list (not just active) so a stale
  // prefilled id can be recognised and explained, rather than silently
  // failing to match anything.
  const selectedVehicleAny = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  )
  const vehicleInactive = selectedVehicleAny !== null && selectedVehicleAny.status !== 'active'

  // The licence rule, enforced here so the UI cannot offer a pairing the
  // server will refuse — validateManualDispatchInput checks
  // driver.vehicleIds.includes(vehicle.id) with the exact same shape.
  const eligibleDrivers = useMemo(
    () => drivers.filter((d) => d.isActive && vehicleId !== '' && d.vehicleIds.includes(vehicleId)),
    [drivers, vehicleId],
  )
  const noEligibleDriver = vehicleId !== '' && eligibleDrivers.length === 0

  // The universe of requests the vehicle-cluster check runs against: the
  // dispatch's own currently-attached stops (only when editing) plus every
  // request available to add. This is also the exact universe the two
  // checkbox lists below render, so a request counted here is always one
  // the admin can actually see and toggle.
  const selectableRequests = useMemo<ClusterCandidate[]>(() => {
    const fromStops: ClusterCandidate[] = dispatch
      ? dispatch.stops.filter(hasRequestId).map((s) => ({
          id: s.requestId,
          paxCount: s.paxCount ?? 0,
          cargoRequired: s.cargoRequired ?? false,
          requesterCanUseRestricted: s.requesterCanUseRestricted ?? false,
        }))
      : []
    const fromPending: ClusterCandidate[] = pendingRequests.map((r) => ({
      id: r.id,
      paxCount: r.paxCount,
      cargoRequired: r.cargoRequired,
      requesterCanUseRestricted: r.requesterCanUseRestricted ?? false,
    }))
    return [...fromStops, ...fromPending]
  }, [dispatch, pendingRequests])

  const selectedClusterRequests = useMemo(
    () => selectableRequests.filter((r) => selectedRequestIds.has(r.id)),
    [selectableRequests, selectedRequestIds],
  )

  // The same function eligibleVehiclesFor uses internally (via
  // validateManualDispatchInput on the server) — called here against the
  // selected vehicle and the selected requests so the UI and server cannot
  // drift on what "a valid pairing" means. All three rules it checks
  // (seats vs pax, cargo vs cargoRequired, restricted vs a cleared
  // requester) are physical/legal constraints, not admin judgement calls,
  // so unlike the licence message this BLOCKS submission — it does not
  // just warn.
  const clusterCheck = useMemo(() => {
    if (!selectedVehicle) return null
    return validateVehicleForCluster(selectedVehicle, {
      totalPax: selectedClusterRequests.reduce((sum, r) => sum + r.paxCount, 0),
      cargoRequired: selectedClusterRequests.some((r) => r.cargoRequired),
      allowsRestricted: selectedClusterRequests.some((r) => r.requesterCanUseRestricted),
    })
  }, [selectedVehicle, selectedClusterRequests])
  const clusterError = clusterCheck && !clusterCheck.ok ? clusterCheck.error : null

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
      const body = {
        vehicleId: values.vehicleId,
        driverId: values.driverId,
        startDate: values.startDate,
        endDate: values.endDate,
        requestIds: [...selectedRequestIds],
      }

      // Editing a draft is a real PATCH against that dispatch (updateDraftDispatch
      // on the server) — not a create-then-discard workaround. Creating a
      // fresh dispatch (New dispatch / Assign manually) is still POST.
      const res = dispatch
        ? await fetch(`/api/fleet/dispatches/${dispatch.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/fleet/dispatches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

      if (!res.ok) {
        throw new Error(
          await parseErrorMessage(res, dispatch ? 'Failed to update dispatch' : 'Failed to create dispatch'),
        )
      }

      toast.success(dispatch ? 'Dispatch updated' : 'Dispatch created')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = dispatch ? 'Edit Dispatch' : prefillRequest ? 'Assign Manually' : 'New Dispatch'
  const submitLabel = dispatch
    ? isSubmitting
      ? 'Saving...'
      : 'Save Changes'
    : isSubmitting
      ? 'Creating...'
      : 'Create Dispatch'
  const submitDisabled = isSubmitting || noEligibleDriver || vehicleInactive || clusterError !== null

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
                    {vehicleOptions.map((v) => (
                      <SelectItem key={v.id} value={v.id} disabled={v.status !== 'active'}>
                        {v.name} ({v.maxPassengers} seats{v.cargoCapable ? ', cargo' : ''}
                        {v.status !== 'active' ? ` — ${v.status}` : ''})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.vehicleId && <p className="text-sm text-destructive">{errors.vehicleId.message}</p>}
            {vehicleInactive && selectedVehicleAny && (
              <p className="text-sm text-destructive">
                {selectedVehicleAny.name} is{' '}
                {selectedVehicleAny.status === 'maintenance' ? 'in maintenance' : 'retired'} and cannot be
                dispatched — choose another vehicle.
              </p>
            )}
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
                matching what the engine (and the manual-dispatch validation)
                enforce server-side — it takes priority over RHF's own
                "required" message, since it is the more specific and more
                actionable of the two. */}
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

            {dispatch && dispatch.stops.some(hasRequestId) && (
              <div className="space-y-1 rounded-lg border p-3">
                <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                  Currently attached — uncheck to remove
                </p>
                {dispatch.stops.filter(hasRequestId).map((stop) => (
                  <label
                    key={stop.id}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedRequestIds.has(stop.requestId)}
                      onCheckedChange={() => toggleRequest(stop.requestId)}
                    />
                    <span className="flex-1">
                      {stop.propertyName ?? stop.label ?? 'Destination'} —{' '}
                      {stop.requesterName ?? 'Unknown requester'} · {stop.paxCount ?? 0} pax
                    </span>
                  </label>
                ))}
              </div>
            )}

            {pendingRequests.length === 0 ? (
              !dispatch && <p className="py-3 text-sm text-muted-foreground">No pending requests.</p>
            ) : (
              <div className="space-y-1 rounded-lg border p-3 max-h-56 overflow-y-auto">
                {dispatch && (
                  <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Available to add</p>
                )}
                {pendingRequests.map((r) => {
                  const label = formatTripRoute(r)
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

            {/* Blocking, not a warning — capacity/cargo/restricted-access are
                physical and legal constraints validateVehicleForCluster
                enforces server-side too; an admin cannot deliberately
                override them, only pick a vehicle that actually satisfies
                them. */}
            {clusterError && <p className="text-sm text-destructive">{clusterError}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="submit" disabled={submitDisabled}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
