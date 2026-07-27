'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Property } from '@/lib/db/schema'
import type { listDistances } from '@/lib/db/queries/fleet'

type Distance = Awaited<ReturnType<typeof listDistances>>[number]

// Matches the API's z.number().min(0).max(2000) in
// src/app/api/fleet/distances/route.ts — checked client-side too so a typo
// gets an immediate, specific message instead of a round-trip 400.
const MAX_DISTANCE_KM = 2000

interface DistancesGridProps {
  distances: Distance[]
  properties: Property[]
}

interface Node {
  id: string | null
  name: string
}

/**
 * Builds a lookup key that is the same regardless of which side of the pair
 * a node is on — head office (null) always keys first, otherwise the smaller
 * uuid string does. This mirrors the canonicalisation the PUT route already
 * performs on write, so the grid can find a saved leg no matter which
 * direction it happens to be stored in.
 */
function canonicalKey(a: string | null, b: string | null): string {
  if (a === null) return `head:${b}`
  if (b === null) return `head:${a}`
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error
    if (typeof err === 'string') return err
  }
  return fallback
}

export function DistancesGrid({ distances, properties }: DistancesGridProps) {
  const router = useRouter()

  // Head office is a node represented by a null property id, and comes first.
  const nodes: Node[] = useMemo(
    () => [
      { id: null, name: 'Head Office' },
      ...properties.map((p) => ({ id: p.id, name: p.name })),
    ],
    [properties]
  )

  const distanceMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of distances) {
      map.set(canonicalKey(d.fromPropertyId, d.toPropertyId), d.distanceKm)
    }
    return map
  }, [distances])

  async function handleSave(fromId: string | null, toId: string | null, distanceKm: number) {
    const res = await fetch('/api/fleet/distances', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromPropertyId: fromId,
        toPropertyId: toId,
        distanceKm,
        driveMinutes: null,
      }),
    })

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, 'Failed to save distance'))
    }

    // No toast here — an admin filling in the whole grid in one sitting can
    // save dozens of cells in a row (11x11 = up to ~55 pairs), and a
    // stacked "Saved" toast per cell is noise, not feedback. DistanceCell
    // shows a quiet inline checkmark instead. router.refresh() re-syncs
    // every cell with the authoritative server value.
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Property Distances</h1>
        <p className="text-sm text-muted-foreground">
          Distances between Head Office and each property, and between properties
        </p>
      </div>

      <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        Distances decide which trips can share a vehicle. A blank pair is treated as too far
        apart to pool.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-muted/40"> </TableHead>
              {nodes.map((node) => (
                <TableHead key={node.id ?? 'head'} className="text-center">
                  {node.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.map((rowNode, i) => (
              <TableRow key={rowNode.id ?? 'head'}>
                <TableHead className="bg-muted/40">{rowNode.name}</TableHead>
                {nodes.map((colNode, j) => {
                  if (i === j) {
                    return (
                      <TableCell
                        key={colNode.id ?? 'head'}
                        className="text-center text-muted-foreground"
                      >
                        —
                      </TableCell>
                    )
                  }

                  const km = distanceMap.get(canonicalKey(rowNode.id, colNode.id)) ?? null

                  if (j > i) {
                    return (
                      <TableCell key={colNode.id ?? 'head'} className="text-center">
                        <DistanceCell
                          value={km}
                          onSave={(value) => handleSave(rowNode.id, colNode.id, value)}
                          ariaLabel={`Distance from ${rowNode.name} to ${colNode.name} in kilometres`}
                        />
                      </TableCell>
                    )
                  }

                  // Lower triangle mirrors the upper cell — display only,
                  // since the API canonicalises pairs and a separate write
                  // here would be redundant.
                  return (
                    <TableCell
                      key={colNode.id ?? 'head'}
                      className="text-center text-muted-foreground"
                    >
                      {km ?? '—'}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editable cell — a small numeric input holding km, saved on blur.
// ---------------------------------------------------------------------------

function DistanceCell({
  value,
  onSave,
  ariaLabel,
}: {
  value: number | null
  onSave: (km: number) => Promise<void>
  ariaLabel: string
}) {
  // Seeded once from the server-provided value at mount, then left alone.
  // Deliberately NOT kept in sync via a useEffect on `value`: saving any
  // *other* cell in the grid calls router.refresh(), which re-renders every
  // cell with fresh props, and an effect keyed on the incoming value would
  // stomp on whatever the admin is mid-typing here. The success and failure
  // paths below already update `draft` directly from the outcome of this
  // cell's own save, so local state stays correct without ever needing to
  // resync from props — it survives any number of unrelated refreshes.
  const [draft, setDraft] = useState(value !== null ? String(value) : '')
  const [isSaving, setIsSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // Auto-clears the quiet "saved" indicator — see the toast-noise note on
  // handleSave in the parent: dozens of per-cell saves in one sitting
  // should not stack dozens of toasts, so success is shown inline instead.
  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 1500)
    return () => clearTimeout(timer)
  }, [justSaved])

  async function handleBlur() {
    const trimmed = draft.trim()

    // Blank means "not set" — there is no delete endpoint, so blanking a
    // previously-saved cell just reverts to the last saved value rather
    // than attempting an invalid save.
    if (trimmed === '') {
      setDraft(value !== null ? String(value) : '')
      return
    }

    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Enter a valid distance in km')
      setDraft(value !== null ? String(value) : '')
      return
    }

    // No-op if nothing actually changed — checked before the max-distance
    // validation so simply tabbing through an already-saved cell can never
    // surface a spurious error.
    if (value !== null && parsed === value) return

    if (parsed > MAX_DISTANCE_KM) {
      toast.error(`Distance must be ${MAX_DISTANCE_KM} km or less`)
      setDraft(value !== null ? String(value) : '')
      return
    }

    setIsSaving(true)
    try {
      await onSave(parsed)
      setJustSaved(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save distance')
      setDraft(value !== null ? String(value) : '')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto flex w-24 items-center justify-center gap-1">
      <Input
        type="number"
        min={0}
        max={MAX_DISTANCE_KM}
        step="0.1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        disabled={isSaving}
        placeholder="—"
        aria-label={ariaLabel}
        className="h-8 w-20 text-center"
      />
      <Check
        className={`size-3.5 shrink-0 text-emerald-600 transition-opacity ${
          justSaved ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
    </div>
  )
}
