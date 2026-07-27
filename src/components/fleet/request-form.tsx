'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { validateFleetRequest } from '@/lib/fleet/constraints'
import type { EngineVehicle } from '@/lib/fleet/types'
import type { Property, Vehicle } from '@/lib/db/schema'
import type { listRequests } from '@/lib/db/queries/dispatches'

/** Row shape produced by listRequests — shared with requests-table.tsx. */
export type FleetRequestRow = Awaited<ReturnType<typeof listRequests>>[number]

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error
    if (typeof err === 'string') return err
  }
  return fallback
}

interface RequestFormValues {
  requestType: 'visit' | 'standalone'
  targetPropertyId: string
  originText: string
  destinationText: string
  startDate: string
  endDate: string
  paxCount: number
  cargoRequired: boolean
  purpose: string
  notes: string
}

interface RequestFormProps {
  request?: FleetRequestRow | null
  vehicles: Vehicle[]
  properties: Property[]
  onSuccess: () => void
}

export function RequestForm({ request, vehicles, properties, onSuccess }: RequestFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!request

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RequestFormValues>({
    // Only the two tab-specific fields (targetPropertyId, destinationText) are
    // ever unmounted (Radix Tabs removes the inactive TabsContent from the
    // DOM). shouldUnregister makes RHF drop an unmounted field's value AND
    // its validation rules entirely, so switching to "Other trip" cannot
    // leave a stale, still-`required` targetPropertyId blocking submission.
    // Fields outside the Tabs (dates, pax, cargo, notes) never unmount, so
    // this has no effect on them.
    shouldUnregister: true,
    defaultValues: {
      requestType: request?.requestType ?? 'visit',
      targetPropertyId: request?.targetPropertyId ?? '',
      originText: request?.originText ?? '',
      destinationText: request?.destinationText ?? '',
      startDate: request?.startDate ?? '',
      endDate: request?.endDate ?? '',
      paxCount: request?.paxCount ?? 1,
      cargoRequired: request?.cargoRequired ?? false,
      purpose: request?.purpose ?? '',
      notes: request?.notes ?? '',
    },
  })

  const requestType = watch('requestType')
  const cargoRequired = watch('cargoRequired')
  const paxCount = watch('paxCount')

  // Mapped exactly like src/app/api/fleet/requests/route.ts maps listVehicles()
  // rows before calling validateFleetRequest — same function, same shape, so
  // the message shown here is exactly the message the server would return.
  const engineVehicles: EngineVehicle[] = useMemo(
    () =>
      vehicles.map((v) => ({
        id: v.id,
        name: v.name,
        maxPassengers: v.maxPassengers,
        cargoCapable: v.cargoCapable,
        isRestricted: v.isRestricted,
        status: v.status,
        currentLocationPropertyId: v.currentLocationPropertyId,
        sortOrder: v.sortOrder,
      })),
    [vehicles]
  )

  const constraintCheck = useMemo(
    () => validateFleetRequest({ cargoRequired, paxCount }, engineVehicles),
    [cargoRequired, paxCount, engineVehicles]
  )

  async function onSubmit(values: RequestFormValues) {
    setIsSubmitting(true)
    try {
      const body = {
        requestType: values.requestType,
        targetPropertyId: values.requestType === 'visit' ? values.targetPropertyId : null,
        originText:
          values.requestType === 'standalone' ? (values.originText.trim() || null) : null,
        destinationText:
          values.requestType === 'standalone' ? (values.destinationText.trim() || null) : null,
        startDate: values.startDate,
        endDate: values.endDate,
        paxCount: values.paxCount,
        cargoRequired: values.cargoRequired,
        purpose: values.requestType === 'visit' ? (values.purpose.trim() || null) : null,
        notes: values.notes.trim() || null,
      }

      const res = await fetch(
        isEditing ? `/api/fleet/requests/${request.id}` : '/api/fleet/requests',
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
            isEditing ? 'Failed to update request' : 'Failed to submit request'
          )
        )
      }

      toast.success(isEditing ? 'Request updated' : 'Request submitted')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Tabs
        value={requestType}
        onValueChange={(value) =>
          setValue('requestType', value as RequestFormValues['requestType'])
        }
      >
        <TabsList className="w-full">
          {/* requestType cannot be changed by PATCH (the API fixes it to the
              existing row's type) — disable switching while editing so the
              tab shown always matches what a save will actually apply. */}
          <TabsTrigger value="visit" disabled={isEditing}>
            Property visit
          </TabsTrigger>
          <TabsTrigger value="standalone" disabled={isEditing}>
            Other trip
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visit" className="space-y-5 pt-4">
          <div className="space-y-2">
            <Label>Property</Label>
            <Controller
              control={control}
              name="targetPropertyId"
              rules={{ required: 'Select a property' }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.targetPropertyId && (
              <p className="text-sm text-destructive">{errors.targetPropertyId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="request-purpose">Purpose</Label>
            <Textarea id="request-purpose" placeholder="Optional" {...register('purpose')} />
          </div>
        </TabsContent>

        <TabsContent value="standalone" className="space-y-5 pt-4">
          <div className="space-y-2">
            <Label htmlFor="request-origin">Origin</Label>
            <Input
              id="request-origin"
              placeholder="e.g. Head Office"
              {...register('originText')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="request-destination">Destination</Label>
            <Input
              id="request-destination"
              placeholder="e.g. Bandaranaike Airport"
              {...register('destinationText', { required: 'Destination is required' })}
            />
            {errors.destinationText && (
              <p className="text-sm text-destructive">{errors.destinationText.message}</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="request-start">Start date</Label>
          <Input
            id="request-start"
            type="date"
            {...register('startDate', { required: 'Start date is required' })}
          />
          {errors.startDate && (
            <p className="text-sm text-destructive">{errors.startDate.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="request-end">End date</Label>
          <Input
            id="request-end"
            type="date"
            {...register('endDate', { required: 'End date is required' })}
          />
          {errors.endDate && <p className="text-sm text-destructive">{errors.endDate.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="request-pax">Passengers</Label>
        <Input
          id="request-pax"
          type="number"
          min={0}
          {...register('paxCount', {
            required: 'Passenger count is required',
            valueAsNumber: true,
            min: { value: 0, message: 'Must be 0 or more' },
            // A cleared input yields NaN from valueAsNumber, which is not ''
            // so `required` alone doesn't catch it — see the identical
            // comment in vehicles-client.tsx's maxPassengers field.
            validate: (v) => !Number.isNaN(v) || 'Passenger count is required',
          })}
        />
        {/* The live constraint check (§5.1) — validateFleetRequest is the
            exact function the API re-runs server-side, so this is the exact
            message the server would return, not a paraphrase. RHF's own
            required/min error takes priority when the field itself is
            invalid; the constraint error only shows once it holds a number. */}
        {errors.paxCount ? (
          <p className="text-sm text-destructive">{errors.paxCount.message}</p>
        ) : !constraintCheck.ok ? (
          <p className="text-sm text-destructive">{constraintCheck.error}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label htmlFor="request-cargo">Needs cargo transport</Label>
        <Controller
          control={control}
          name="cargoRequired"
          render={({ field }) => (
            <Switch id="request-cargo" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="request-notes">Notes</Label>
        <Textarea id="request-notes" placeholder="Optional" {...register('notes')} />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting || !constraintCheck.ok}>
          {isSubmitting
            ? isEditing
              ? 'Saving...'
              : 'Submitting...'
            : isEditing
              ? 'Save Changes'
              : 'Submit Request'}
        </Button>
      </div>
    </form>
  )
}
