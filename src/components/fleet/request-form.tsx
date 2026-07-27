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
  originSelection: string
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
  onSuccess?: () => void
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
    getValues,
    formState: { errors },
  } = useForm<RequestFormValues>({
    defaultValues: {
      requestType: request?.requestType ?? 'visit',
      targetPropertyId: request?.targetPropertyId ?? '',
      // A hard-deleted origin property leaves origin_kind: 'property' but
      // origin_property_id: null (ON DELETE SET NULL — see the Pick-up
      // Controller's validate below). Falling through to the bare
      // `request.originKind` string in that case would resolve this to the
      // literal 'property', which matches no SelectItem and Radix only
      // shows a placeholder for '' — so the trigger would render silently
      // empty instead of the honest "Select a pick-up point" placeholder.
      // Resolve to '' whenever the kind is 'property' but its id is gone.
      originSelection:
        request?.originKind === 'property'
          ? request.originPropertyId
            ? `prop:${request.originPropertyId}`
            : ''
          : (request?.originKind ?? 'head_office'),
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
  const originSelection = watch('originSelection')

  // `properties` is active-only (correct for creating a new request — nobody
  // should book a visit to a closed property). But when editing an existing
  // request whose target property has since been deactivated, the active
  // list alone would make the Select render its placeholder while
  // field.value still holds the real (now-inactive) id — reading to the user
  // as "my property selection was lost". Append that one property back in
  // so the trigger shows the correct name; its own name comes from the
  // request row's already-joined propertyName if it's missing here.
  //
  // This is deliberately its OWN memo, separate from pickupPropertyOptions
  // below, even though both start from the same `properties` array and both
  // append-one-if-missing. A single shared list would offer this Select the
  // OTHER field's appended property too — e.g. a visit's deactivated pick-up
  // property would show up as a choosable, unlabelled-inactive DESTINATION,
  // and picking it would book a visit to a closed property with no server
  // check to catch it. Keeping the two lists separate means each Select can
  // only ever offer its own field's current value back to itself.
  const visitPropertyOptions = useMemo(() => {
    if (!request?.targetPropertyId) return properties
    if (properties.some((p) => p.id === request.targetPropertyId)) return properties
    return [
      ...properties,
      {
        id: request.targetPropertyId,
        name: request.propertyName ?? 'Inactive property',
      } as Property,
    ]
  }, [properties, request])

  // Mirror of visitPropertyOptions above, for the Pick-up Select's own value
  // (originPropertyId) instead of the Property Select's (targetPropertyId).
  // See the comment on visitPropertyOptions for why this must be a separate
  // memo rather than one shared list re-appending both ids.
  const pickupPropertyOptions = useMemo(() => {
    if (!request?.originPropertyId) return properties
    if (properties.some((p) => p.id === request.originPropertyId)) return properties
    return [
      ...properties,
      {
        id: request.originPropertyId,
        name: request.originPropertyName ?? 'Inactive property',
      } as Property,
    ]
  }, [properties, request])

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
        originKind:
          values.originSelection === 'head_office'
            ? ('head_office' as const)
            : values.originSelection === 'other'
              ? ('other' as const)
              : ('property' as const),
        originPropertyId: values.originSelection.startsWith('prop:')
          ? values.originSelection.slice('prop:'.length)
          : null,
        originText:
          values.originSelection === 'other' ? (values.originText.trim() || null) : null,
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
              // Scoped to the mode it belongs to rather than a bare `required`,
              // for the reason spelled out on destinationText below: a rule
              // attached to a field in one tab must not be able to block a
              // submit made from the other, where its error message is not on
              // screen. Mirrors the POST route's `.refine` on requestType.
              rules={{
                validate: (v) =>
                  getValues('requestType') !== 'visit' || Boolean(v) || 'Select a property',
              }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {visitPropertyOptions.map((p) => (
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
            <Textarea
              id="request-purpose"
              placeholder="Optional"
              maxLength={1000}
              {...register('purpose')}
            />
          </div>
        </TabsContent>

        <TabsContent value="standalone" className="space-y-5 pt-4">
          <div className="space-y-2">
            <Label htmlFor="request-destination">Destination</Label>
            <Input
              id="request-destination"
              placeholder="e.g. Bandaranaike Airport"
              maxLength={500}
              // NOT a bare `required`. register() runs while this element's
              // props are evaluated, which React does on every render of this
              // component — including renders where Radix never mounts this
              // tab's panel. RHF therefore holds the rule permanently (each
              // re-register sets mount: true again), so a `required` here also
              // fires on the "Property visit" tab, where this input and the
              // error paragraph below are both off screen. The result is a
              // Submit Request button that silently does nothing: handleSubmit
              // fails validation, onSubmit never runs, and the reason is
              // rendered inside a panel the user cannot see. Scoping the rule
              // to standalone mode — mirroring the POST route's own
              // `.refine((d) => d.requestType !== 'standalone' || ...)` —
              // keeps it enforced where it applies and inert where it does not.
              {...register('destinationText', {
                validate: (v) =>
                  getValues('requestType') !== 'standalone' ||
                  Boolean(v?.trim()) ||
                  'Destination is required',
              })}
            />
            {errors.destinationText && (
              <p className="text-sm text-destructive">{errors.destinationText.message}</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-2">
        <Label>Pick-up</Label>
        <Controller
          control={control}
          name="originSelection"
          // This field is always mounted (it lives outside the Tabs, in the
          // shared section), so unlike targetPropertyId/destinationText a
          // plain always-on rule here carries none of the e808935 risk of
          // firing while off screen — but it still uses `validate`, not a
          // bare `required`, per the same house rule. Guards against '' (the
          // unset placeholder state) AND the literal string 'property' (what
          // a hard-deleted origin property — origin_kind: 'property' with
          // origin_property_id set to NULL by ON DELETE SET NULL — would
          // fall through to if this were ever read without the defaults'
          // own guard above). Mirrors the PATCH/POST routes' own
          // `.refine((d) => d.originKind !== 'property' || Boolean(d.originPropertyId))`.
          rules={{
            validate: (v) => (v !== '' && v !== 'property') || 'Choose a pick-up point',
          }}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a pick-up point" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="head_office">Head Office</SelectItem>
                {pickupPropertyOptions.map((p) => (
                  <SelectItem key={p.id} value={`prop:${p.id}`}>
                    {p.name}
                  </SelectItem>
                ))}
                <SelectItem value="other">Other…</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {errors.originSelection && (
          <p className="text-sm text-destructive">{errors.originSelection.message}</p>
        )}
      </div>

      {originSelection === 'other' && (
        <div className="space-y-2">
          <Label htmlFor="request-origin-text">Pick-up location</Label>
          <Input
            id="request-origin-text"
            placeholder="e.g. Bandaranaike Airport"
            maxLength={500}
            // Scoped with validate, never a bare `required`. register() runs
            // while this element's props are evaluated, and RHF keeps the rule
            // once registered — so a bare required here would fire while the
            // field is hidden, blocking submit with its message off screen.
            // That is exactly the defect fixed in e808935.
            {...register('originText', {
              validate: (v) =>
                getValues('originSelection') !== 'other' ||
                Boolean(v?.trim()) ||
                'Enter a pick-up location',
            })}
          />
          {errors.originText && (
            <p className="text-sm text-destructive">{errors.originText.message}</p>
          )}
        </div>
      )}

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
            {...register('endDate', {
              required: 'End date is required',
              // Mirrors the POST route's Zod `.refine` (and the PATCH route's
              // identical imperative check) word-for-word, so a transposed
              // date is caught here instead of round-tripping to a bare
              // "Validation failed" toast with the real reason buried in
              // `details`, which parseErrorMessage doesn't read.
              validate: (v) =>
                !v || v >= getValues('startDate') || 'End date cannot be before the start date',
            })}
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
          max={60}
          {...register('paxCount', {
            required: 'Passenger count is required',
            valueAsNumber: true,
            min: { value: 0, message: 'Must be 0 or more' },
            max: { value: 60, message: 'Must be 60 or fewer' },
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
        <Textarea
          id="request-notes"
          placeholder="Optional"
          maxLength={2000}
          {...register('notes')}
        />
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
