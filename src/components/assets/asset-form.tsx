'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { cn } from '@/lib/utils'
import { computeDepreciation } from '@/lib/assets/depreciation'
import {
  ASSET_CATEGORIES,
  categoryAbbr,
  categoryLabel,
  type AssetCategory,
} from '@/lib/assets/labels'
import type { AssetFinancialRow } from '@/lib/db/queries/assets'
import type { Property, Room } from '@/lib/db/schema'

// Radix Select forbids an empty-string item value — use a sentinel for "no room".
const NO_ROOM = '_none_'

const assetFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(300),
  category: z.enum(ASSET_CATEGORIES),
  imageUrl: z.string().max(2000).optional(),
  serialNumber: z.string().max(200).optional(),
  propertyId: z.string().min(1, 'Property is required'),
  roomId: z.string().optional(),
  assetCode: z.string().max(100).optional(),
  purchaseDate: z.string().min(1, 'Purchase date is required'),
  purchaseCost: z
    .string()
    .min(1, 'Purchase cost is required')
    .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, 'Enter a valid amount'),
  usefulLifeYears: z
    .number()
    .int('Must be a whole number of years')
    .positive('Must be at least 1 year'),
  salvageValue: z
    .string()
    .min(1, 'Salvage value is required')
    .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, 'Enter a valid amount'),
})

type AssetFormValues = z.infer<typeof assetFormSchema>

type AssetFormRole = 'admin' | 'property_manager'

interface AssetFormProps {
  mode: 'create' | 'edit'
  role: AssetFormRole
  properties: Property[]
  initial?: AssetFinancialRow | null
}

const STEPS = [
  { id: 1, title: 'General' },
  { id: 2, title: 'Location' },
  { id: 3, title: 'Financials' },
] as const

type StepId = (typeof STEPS)[number]['id']

const STEP_FIELDS = {
  1: ['name', 'category', 'imageUrl', 'serialNumber'],
  2: ['propertyId', 'roomId'],
  3: ['purchaseDate', 'purchaseCost', 'usefulLifeYears', 'salvageValue', 'assetCode'],
} as const satisfies Record<StepId, readonly (keyof AssetFormValues)[]>

const lkrFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 0,
})

function extractErrorMessage(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error
    if (typeof err === 'string') return err
    if (err && typeof err === 'object') {
      const flat = err as { formErrors?: string[]; fieldErrors?: Record<string, string[]> }
      const messages = [...(flat.formErrors ?? [])]
      for (const [field, fieldMessages] of Object.entries(flat.fieldErrors ?? {})) {
        if (fieldMessages && fieldMessages.length > 0) messages.push(`${field}: ${fieldMessages[0]}`)
      }
      if (messages.length > 0) return messages.join('; ')
    }
  }
  return 'Something went wrong'
}

export function AssetForm({ mode, role, properties, initial }: AssetFormProps) {
  const router = useRouter()
  const isEditing = mode === 'edit'
  const pmFinancialsLocked = isEditing && role === 'property_manager'

  const [step, setStep] = useState<StepId>(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loadingRooms, setLoadingRooms] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    trigger,
    setValue,
    formState: { errors },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      name: initial?.name ?? '',
      category: (initial?.category as AssetCategory | undefined) ?? ASSET_CATEGORIES[0],
      imageUrl: initial?.imageUrl ?? '',
      serialNumber: initial?.serialNumber ?? '',
      propertyId: initial?.propertyId ?? properties[0]?.id ?? '',
      roomId: initial?.roomId ?? '',
      assetCode: isEditing ? (initial?.assetCode ?? '') : '',
      purchaseDate: initial?.purchaseDate ?? new Date().toISOString().slice(0, 10),
      purchaseCost: initial?.purchaseCost ?? '',
      usefulLifeYears: initial?.usefulLifeYears ?? 0,
      salvageValue: initial?.salvageValue ?? '0',
    },
  })

  const propertyId = watch('propertyId')
  const category = watch('category')
  const purchaseCost = watch('purchaseCost')
  const salvageValue = watch('salvageValue')
  const usefulLifeYears = watch('usefulLifeYears')
  const purchaseDate = watch('purchaseDate')

  // Cascading room fetch — reruns whenever the selected property changes,
  // including on the initial render, so edit mode also gets a populated list.
  // On every run *after* the first, also clear a previously-picked room: a
  // room id from the old property is no longer valid once the property
  // changes, and leaving it in place would silently submit a mismatched
  // roomId/propertyId pair.
  const skipRoomResetRef = useRef(true)
  useEffect(() => {
    const isFirstRun = skipRoomResetRef.current
    skipRoomResetRef.current = false

    if (!propertyId) {
      setRooms([])
      if (!isFirstRun) setValue('roomId', '')
      return
    }
    let cancelled = false
    setLoadingRooms(true)
    fetch(`/api/assets/rooms?propertyId=${propertyId}`)
      .then((res) => (res.ok ? res.json() : { rooms: [] }))
      .then((data: { rooms?: Room[] }) => {
        if (!cancelled) setRooms(data.rooms ?? [])
      })
      .catch(() => {
        if (!cancelled) setRooms([])
      })
      .finally(() => {
        if (!cancelled) setLoadingRooms(false)
      })
    if (!isFirstRun) setValue('roomId', '')
    return () => {
      cancelled = true
    }
  }, [propertyId, setValue])

  const annualDepreciationPreview = useMemo(() => {
    const cost = Number(purchaseCost)
    const salvage = Number(salvageValue)
    if (
      !purchaseDate ||
      !Number.isFinite(cost) ||
      !Number.isFinite(salvage) ||
      !Number.isFinite(usefulLifeYears) ||
      usefulLifeYears <= 0
    ) {
      return null
    }
    const { annualDepreciation } = computeDepreciation({
      purchaseCost: cost,
      salvageValue: salvage,
      usefulLifeYears,
      purchaseDate,
    })
    return annualDepreciation
  }, [purchaseCost, salvageValue, usefulLifeYears, purchaseDate])

  const selectedProperty = properties.find((p) => p.id === propertyId)
  const assetCodePlaceholder = selectedProperty
    ? `${selectedProperty.code.toUpperCase().replace(/\s+/g, '')}-${categoryAbbr(category)}-###`
    : 'Auto-assigned on save'

  async function handleNext() {
    const valid = await trigger(STEP_FIELDS[step])
    if (!valid) return
    setStep((s) => (s < 3 ? ((s + 1) as StepId) : s))
  }

  function handleBack() {
    setStep((s) => (s > 1 ? ((s - 1) as StepId) : s))
  }

  async function onSubmit(values: AssetFormValues) {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      if (mode === 'create') {
        const body: Record<string, unknown> = {
          name: values.name,
          category: values.category,
          propertyId: values.propertyId,
          roomId: values.roomId || null,
          purchaseDate: values.purchaseDate,
          purchaseCost: values.purchaseCost,
          usefulLifeYears: values.usefulLifeYears,
          salvageValue: values.salvageValue || '0',
          serialNumber: values.serialNumber || null,
          imageUrl: values.imageUrl || null,
        }
        // Only send an assetCode override if the user actually typed one —
        // otherwise the server assigns the next sequence for this property/category.
        if (values.assetCode) body.assetCode = values.assetCode

        const res = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(extractErrorMessage(errBody))
        }
        toast.success('Asset created')
        router.push('/assets/directory')
        router.refresh()
        return
      }

      if (!initial) return
      const body: Record<string, unknown> = {
        name: values.name,
        category: values.category,
        roomId: values.roomId || null,
        serialNumber: values.serialNumber || null,
        imageUrl: values.imageUrl || null,
        purchaseDate: values.purchaseDate,
        salvageValue: values.salvageValue || '0',
      }
      // Mirrors the server rule (PATCH strips these for property_manager) — omit
      // them client-side too so the disabled inputs never appear to "work".
      if (role !== 'property_manager') {
        body.purchaseCost = values.purchaseCost
        body.usefulLifeYears = values.usefulLifeYears
      }

      const res = await fetch(`/api/assets/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(extractErrorMessage(errBody))
      }
      toast.success('Asset updated')
      router.push('/assets/directory')
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong'
      setSubmitError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Asset' : 'Add Asset'}</CardTitle>
          <CardDescription>
            Step {step} of {STEPS.length} — {STEPS[step - 1].title}
          </CardDescription>
          <div className="flex items-center gap-2 pt-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full border text-xs font-medium',
                    step === s.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : step > s.id
                        ? 'border-primary text-primary'
                        : 'border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  {s.id}
                </span>
                {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {submitError && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {submitError}
            </p>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="e.g. Teak Four-Poster Bed" {...register('name')} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Controller
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSET_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {categoryLabel(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input id="imageUrl" placeholder="https://..." {...register('imageUrl')} />
                {errors.imageUrl && <p className="text-sm text-destructive">{errors.imageUrl.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="serialNumber">Serial Number</Label>
                <Input id="serialNumber" placeholder="Optional" {...register('serialNumber')} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>Property</Label>
                <Controller
                  control={control}
                  name="propertyId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={isEditing}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a property..." />
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
                {errors.propertyId && (
                  <p className="text-sm text-destructive">{errors.propertyId.message}</p>
                )}
                {isEditing && (
                  <p className="text-xs text-muted-foreground">
                    An asset&rsquo;s property can&rsquo;t be changed here.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Room</Label>
                <Controller
                  control={control}
                  name="roomId"
                  render={({ field }) => (
                    <Select
                      value={field.value || NO_ROOM}
                      onValueChange={(v) => field.onChange(v === NO_ROOM ? '' : v)}
                      disabled={!propertyId || loadingRooms}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={loadingRooms ? 'Loading rooms...' : 'Select a room (optional)'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ROOM}>No specific room</SelectItem>
                        {rooms.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.floorLevel ? `${r.name} (${r.floorLevel})` : r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="purchaseDate">Purchase Date</Label>
                <Input id="purchaseDate" type="date" {...register('purchaseDate')} />
                {errors.purchaseDate && (
                  <p className="text-sm text-destructive">{errors.purchaseDate.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="purchaseCost">Purchase Cost (LKR)</Label>
                  <Input
                    id="purchaseCost"
                    type="number"
                    step="0.01"
                    min={0}
                    disabled={pmFinancialsLocked}
                    {...register('purchaseCost')}
                  />
                  {errors.purchaseCost && (
                    <p className="text-sm text-destructive">{errors.purchaseCost.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="usefulLifeYears">Useful Life (years)</Label>
                  <Input
                    id="usefulLifeYears"
                    type="number"
                    min={1}
                    disabled={pmFinancialsLocked}
                    {...register('usefulLifeYears', { valueAsNumber: true })}
                  />
                  {errors.usefulLifeYears && (
                    <p className="text-sm text-destructive">{errors.usefulLifeYears.message}</p>
                  )}
                </div>
              </div>

              {pmFinancialsLocked && (
                <p className="text-xs text-muted-foreground">
                  Only admins can change purchase cost and useful life once an asset is saved.
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="salvageValue">Salvage Value (LKR)</Label>
                <Input id="salvageValue" type="number" step="0.01" min={0} {...register('salvageValue')} />
                {errors.salvageValue && (
                  <p className="text-sm text-destructive">{errors.salvageValue.message}</p>
                )}
              </div>

              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="text-sm font-medium">Annual depreciation</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {annualDepreciationPreview === null
                    ? '—'
                    : lkrFormatter.format(annualDepreciationPreview)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Straight-line, based on purchase cost, salvage value and useful life.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assetCode">Asset Code</Label>
                <Input
                  id="assetCode"
                  placeholder={assetCodePlaceholder}
                  disabled={isEditing}
                  {...register('assetCode')}
                />
                <p className="text-xs text-muted-foreground">
                  {isEditing
                    ? 'Asset codes can’t be changed after creation.'
                    : 'Leave blank to auto-assign the next code for this property and category.'}
                </p>
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button type="button" variant="outline" onClick={handleBack} disabled={isSubmitting}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
            )}
          </div>
          <div>
            {step < 3 ? (
              <Button type="button" onClick={handleNext}>
                Next
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? isEditing
                    ? 'Saving...'
                    : 'Creating...'
                  : isEditing
                    ? 'Save Changes'
                    : 'Create Asset'}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </form>
  )
}
