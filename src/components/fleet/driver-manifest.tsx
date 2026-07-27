'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Car, CheckCircle2, MapPin, Package, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { colomboToday, formatColomboTime } from '@/lib/fleet/dates'
import { formatOriginLabel } from '@/lib/fleet/labels'
import {
  formatManifestDayMonth,
  MANIFEST_STRINGS,
  type ManifestLanguage,
  type ManifestStrings,
} from '@/lib/fleet/manifest-strings'
import type { getDriverDispatches } from '@/lib/db/queries/dispatches'
import { PushSetupBanner } from './push-setup-banner'

type DriverDispatch = Awaited<ReturnType<typeof getDriverDispatches>>[number]
type DispatchStop = DriverDispatch['stops'][number]

interface DriverManifestProps {
  token: string
  driverName: string
  initialLanguage: ManifestLanguage
  initialDispatches: DriverDispatch[]
  vapidPublicKey: string
}

const STORAGE_KEY = 'taru-driver-lang'

// This is a known duplicate of the same helper in drivers-client.tsx,
// requests-table.tsx, dispatch-editor-dialog.tsx, distances-grid.tsx,
// vehicles-client.tsx, request-form.tsx and dispatch-board.tsx. A single
// consolidation pass across all fleet components is deferred to the end of
// the project — copying it here rather than extracting keeps this task's
// diff scoped to the driver manifest.
async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error
    if (typeof err === 'string') return err
  }
  return fallback
}

type StatusBody =
  | { action: 'start'; dispatchId: string }
  | { action: 'complete'; dispatchId: string }
  | { action: 'arrive'; stopId: string }

export function DriverManifest({
  token,
  driverName,
  initialLanguage,
  initialDispatches,
  vapidPublicKey,
}: DriverManifestProps) {
  const router = useRouter()
  const [lang, setLang] = useState<ManifestLanguage>(initialLanguage)
  // The set of controls currently in flight (e.g. "dispatch:<id>" or
  // "stop:<id>"), so only the matching button disables — a driver marking
  // arrival at one stop should not be blocked from anything else on the
  // page. A single `string | null` slot isn't enough here: tapping Arrived
  // on a stop and then Complete trip while it's still in flight is a
  // legitimate sequence, and with one slot the Arrived request landing
  // first would clear busy state and silently re-enable Complete trip
  // while its own request is still outstanding.
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set())
  const strings = MANIFEST_STRINGS[lang]

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'si' || stored === 'ta') setLang(stored)
  }, [])

  function selectLanguage(next: ManifestLanguage) {
    setLang(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  /**
   * Re-fetches this driver's manifest (the same public, token-authenticated
   * GET the page itself used) and reports whether `dispatchId` is still in
   * it. `getDriverDispatches` only ever returns approved/in_progress
   * dispatches, so "no longer listed" covers both "completed by an earlier
   * successful tap" and "started by an earlier successful tap" — exactly the
   * two 404 cases this page needs to distinguish from a genuine failure.
   * Returns null (rather than throwing) when the check itself cannot be
   * completed, so the caller can tell "confirmed still there" apart from
   * "connection too bad to tell".
   */
  async function isDispatchStillListed(dispatchId: string): Promise<boolean | null> {
    try {
      const res = await fetch(`/api/fleet/driver/${token}`)
      if (!res.ok) return null
      const data: unknown = await res.json()
      const list =
        data && typeof data === 'object' && Array.isArray((data as { dispatches?: unknown }).dispatches)
          ? ((data as { dispatches: { id: string }[] }).dispatches)
          : null
      if (!list) return null
      return list.some((d) => d.id === dispatchId)
    } catch {
      return null
    }
  }

  /**
   * Shared status-write path for start/arrive/complete. `recoverDispatchId`
   * is only set for start/complete: a driver on a bad connection WILL
   * double-tap "Start trip" or "Complete trip", and by the time the second
   * tap lands the dispatch is no longer approved/in_progress, so the write
   * 404s even though the first tap succeeded. Rather than show that as a
   * failure, we re-fetch and treat "the dispatch has disappeared from the
   * list" as success. Only a dispatch that is STILL listed after a 404 is a
   * genuine failure (wrong driver, or truly not found).
   */
  async function runStatusAction(key: string, body: StatusBody, recoverDispatchId?: string) {
    setBusyKeys((prev) => new Set(prev).add(key))
    try {
      const res = await fetch(`/api/fleet/driver/${token}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        router.refresh()
        return
      }

      if (res.status === 404 && recoverDispatchId) {
        const stillListed = await isDispatchStillListed(recoverDispatchId)
        if (stillListed === false) {
          // Already moved on by the tap that landed first — this is success.
          router.refresh()
          return
        }
        if (stillListed === null) {
          // The verification GET itself couldn't be loaded, so we genuinely
          // don't know whether the tap took — this is a load failure, not a
          // confirmed write failure, hence loadError rather than
          // statusUpdateFailed.
          toast.error(strings.loadError, {
            action: { label: strings.retry, onClick: () => runStatusAction(key, body, recoverDispatchId) },
          })
          return
        }
        // Still listed: this 404 is real (not this driver's dispatch, or
        // truly gone), not a double-tap artifact — the write itself failed.
        toast.error(strings.statusUpdateFailed)
        return
      }

      const message = await parseErrorMessage(res, strings.statusUpdateFailed)
      console.error('Fleet driver status update failed:', message)
      toast.error(strings.statusUpdateFailed)
    } catch (error) {
      console.error('Fleet driver status update error:', error)
      toast.error(strings.statusUpdateFailed)
    } finally {
      setBusyKeys((prev) => {
        if (!prev.has(key)) return prev
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  function handlePrimaryAction(dispatch: DriverDispatch) {
    const key = `dispatch:${dispatch.id}`
    if (dispatch.status === 'approved') {
      runStatusAction(key, { action: 'start', dispatchId: dispatch.id }, dispatch.id)
      return
    }
    // Complete trip is irreversible from the driver's side (their only undo
    // is a phone call), and it lands in exactly the pixel position Start
    // trip occupied a moment earlier — a confirmation is the only thing
    // standing between a reflex second tap and an unintended completion.
    if (!window.confirm(strings.confirmCompleteTrip)) return
    runStatusAction(key, { action: 'complete', dispatchId: dispatch.id }, dispatch.id)
  }

  function handleArrive(stopId: string) {
    runStatusAction(`stop:${stopId}`, { action: 'arrive', stopId })
  }

  const today = colomboToday()
  const todayDispatch = initialDispatches.find((d) => d.startDate <= today && today <= d.endDate)
  const upcomingDispatches = initialDispatches.filter((d) => d.id !== todayDispatch?.id)

  return (
    <div className="space-y-6 text-base">
      <h1 className="text-xl font-bold">{driverName}</h1>

      {/* Language autonyms are the labels themselves, not translated
          content — they must always read the same regardless of which
          language is currently selected, so they are not looked up in
          MANIFEST_STRINGS. */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant={lang === 'en' ? 'default' : 'outline'}
          onClick={() => selectLanguage('en')}
          className="h-14 text-lg"
        >
          English
        </Button>
        <Button
          type="button"
          variant={lang === 'si' ? 'default' : 'outline'}
          onClick={() => selectLanguage('si')}
          className="h-14 text-lg"
        >
          සිංහල
        </Button>
        <Button
          type="button"
          variant={lang === 'ta' ? 'default' : 'outline'}
          onClick={() => selectLanguage('ta')}
          className="h-14 text-lg"
        >
          தமிழ்
        </Button>
      </div>

      <PushSetupBanner token={token} vapidPublicKey={vapidPublicKey} strings={strings} />

      {initialDispatches.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-xl font-medium text-muted-foreground">{strings.noTrips}</p>
        </div>
      )}

      {/* Dispatches exist, just none of them cover today: say so explicitly
          rather than leaving this slot blank — a driver looking at an empty
          space here cannot tell "nothing today" from "the page is broken". */}
      {initialDispatches.length > 0 && !todayDispatch && (
        <div className="flex flex-col items-center justify-center rounded-lg border py-16 text-center">
          <p className="text-xl font-medium text-muted-foreground">{strings.noTripToday}</p>
        </div>
      )}

      {todayDispatch && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xl">{strings.todaysTrip}</CardTitle>
              {todayDispatch.status === 'in_progress' && (
                <Badge className="h-7 px-3 text-base" variant="secondary">
                  {strings.inProgress}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <Car className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-base text-muted-foreground">{strings.vehicle}</p>
                <p className="text-lg font-semibold">
                  {todayDispatch.vehicleName} · {todayDispatch.registrationNo}
                </p>
                <p className="text-base text-muted-foreground">
                  {formatManifestDayMonth(todayDispatch.startDate, lang)} –{' '}
                  {formatManifestDayMonth(todayDispatch.endDate, lang)}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">
                {strings.stops}
              </h2>
              {todayDispatch.stops.map((stop) => (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  strings={strings}
                  isBusy={busyKeys.has(`stop:${stop.id}`)}
                  onArrive={handleArrive}
                />
              ))}
            </div>

            <Button
              type="button"
              size="lg"
              className="h-14 w-full text-lg font-semibold"
              disabled={busyKeys.has(`dispatch:${todayDispatch.id}`)}
              onClick={() => handlePrimaryAction(todayDispatch)}
            >
              {busyKeys.has(`dispatch:${todayDispatch.id}`)
                ? strings.loading
                : todayDispatch.status === 'approved'
                  ? strings.startTrip
                  : strings.completeTrip}
            </Button>
          </CardContent>
        </Card>
      )}

      {upcomingDispatches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{strings.upcomingTrips}</h2>
          <ul className="space-y-3">
            {upcomingDispatches.map((dispatch) => (
              <li key={dispatch.id} className="rounded-lg border p-4">
                <p className="text-lg font-semibold">
                  {dispatch.vehicleName} · {dispatch.registrationNo}
                </p>
                <p className="text-base text-muted-foreground">
                  {formatManifestDayMonth(dispatch.startDate, lang)} – {formatManifestDayMonth(dispatch.endDate, lang)}
                </p>
                <p className="text-base text-muted-foreground">
                  {strings.stops}: {dispatch.stops.length}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lang !== 'en' && <p className="text-sm text-muted-foreground">{strings.draftNotice}</p>}
    </div>
  )
}

function StopCard({
  stop,
  strings,
  isBusy,
  onArrive,
}: {
  stop: DispatchStop
  strings: ManifestStrings
  isBusy: boolean
  onArrive: (stopId: string) => void
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-lg font-semibold">{stop.propertyName ?? stop.label ?? '—'}</p>
          {stop.propertyLocation && <p className="text-base text-muted-foreground">{stop.propertyLocation}</p>}
        </div>
      </div>

      {stop.originKind && (
        <p className="text-base text-muted-foreground">
          {strings.pickUp}:{' '}
          <span className="font-medium text-foreground">
            {formatOriginLabel({
              originKind: stop.originKind,
              originPropertyName: stop.originPropertyName,
              originText: stop.originText,
            })}
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-base">
          <Users className="size-5 text-muted-foreground" />
          {strings.passengers}: {stop.paxCount ?? '—'}
        </span>
        {stop.cargoRequired && (
          <Badge variant="secondary" className="h-7 gap-1.5 px-3 text-base">
            <Package className="size-4" />
            {strings.cargo}
          </Badge>
        )}
      </div>

      {stop.arrivedAt ? (
        <p className="flex items-center gap-2 text-base font-medium text-emerald-700">
          <CheckCircle2 className="size-5" />
          {strings.arrivedAt} {formatColomboTime(stop.arrivedAt)}
        </p>
      ) : (
        // Outline, not the default filled variant: this page's one real
        // primary action is Start/Complete trip below. A row of identical
        // full-width filled buttons gives a driver no visual cue for which
        // one matters most, which is exactly the "one big button, not a row
        // of equals" rule this page is built around.
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-14 w-full text-lg font-semibold"
          disabled={isBusy}
          onClick={() => onArrive(stop.id)}
        >
          {isBusy ? strings.loading : strings.arrived}
        </Button>
      )}
    </div>
  )
}
