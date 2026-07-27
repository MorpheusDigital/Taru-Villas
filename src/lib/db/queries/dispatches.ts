import { and, asc, desc, eq, gte, inArray, ne, not, notExists, or } from 'drizzle-orm'
import { db } from '..'
import {
  dispatches,
  dispatchStops,
  drivers,
  driverVehicles,
  fleetRequests,
  profiles,
  properties,
  vehicles,
  type NewFleetRequest,
} from '../schema'
import type { EngineInput, EngineResult } from '@/lib/fleet/types'
import { getFleetSettings, listDistances } from './fleet'

// --- Requests --------------------------------------------------------------

export async function listRequests(
  orgId: string,
  filters: { status?: 'pending' | 'queued' | 'dispatched' | 'completed' | 'cancelled'; requestedBy?: string } = {},
) {
  const conditions = [eq(fleetRequests.orgId, orgId)]
  if (filters.status) conditions.push(eq(fleetRequests.status, filters.status))
  if (filters.requestedBy) conditions.push(eq(fleetRequests.requestedBy, filters.requestedBy))

  return db
    .select({
      id: fleetRequests.id,
      requestType: fleetRequests.requestType,
      requestedBy: fleetRequests.requestedBy,
      requesterName: profiles.fullName,
      // Needed client-side by the dispatch editor's mirror of
      // validateVehicleForCluster's restricted-vehicle rule — without it,
      // the UI cannot tell whether attaching this request to a restricted
      // vehicle would be refused by the server, and the licence-style
      // "don't offer what the server will refuse" pattern used for driver
      // eligibility can't be applied to this rule too. profiles is already
      // joined below for requesterName, so this is a zero-cost addition.
      requesterCanUseRestricted: profiles.canUseRestrictedVehicles,
      targetPropertyId: fleetRequests.targetPropertyId,
      propertyName: properties.name,
      originText: fleetRequests.originText,
      destinationText: fleetRequests.destinationText,
      startDate: fleetRequests.startDate,
      endDate: fleetRequests.endDate,
      paxCount: fleetRequests.paxCount,
      cargoRequired: fleetRequests.cargoRequired,
      purpose: fleetRequests.purpose,
      notes: fleetRequests.notes,
      status: fleetRequests.status,
      createdAt: fleetRequests.createdAt,
    })
    .from(fleetRequests)
    .leftJoin(profiles, eq(fleetRequests.requestedBy, profiles.id))
    .leftJoin(properties, eq(fleetRequests.targetPropertyId, properties.id))
    .where(and(...conditions))
    .orderBy(asc(fleetRequests.startDate), desc(fleetRequests.createdAt))
}

export async function getRequestById(id: string) {
  const rows = await db.select().from(fleetRequests).where(eq(fleetRequests.id, id)).limit(1)
  return rows[0]
}

export async function createRequest(data: NewFleetRequest) {
  const [inserted] = await db.insert(fleetRequests).values(data).returning()
  return inserted
}

export async function updateRequest(id: string, data: Partial<NewFleetRequest>) {
  const [updated] = await db
    .update(fleetRequests)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(fleetRequests.id, id))
    .returning()
  return updated
}

export async function cancelRequest(id: string) {
  return updateRequest(id, { status: 'cancelled' })
}

// --- Engine plumbing -------------------------------------------------------

/**
 * True for dispatches the "Run engine now" rebuild is free to discard and
 * replan: engine-generated drafts. `replaceDraftDispatches`'s cleanup,
 * `loadEngineInput`'s claimed-request exclusion, and its busy-vehicle set
 * all have to agree on exactly this predicate — if any of the three drifts
 * from the others, a request or a vehicle can fall through the gap between
 * "still claimed" and "free to re-plan", which is how duplicate dispatches
 * on one vehicle come back.
 */
function isDiscardableEngineDraft() {
  // `and()` with two fixed arguments always returns a defined SQL fragment;
  // the `!` just satisfies its general `SQL | undefined` signature so this
  // can be passed to `not()`, which requires a non-undefined SQLWrapper.
  return and(eq(dispatches.status, 'draft'), eq(dispatches.generatedBy, 'engine'))!
}

/** The transaction type `db.transaction()`'s callback receives, extracted
 *  rather than hand-written so it can never drift from what `db` actually
 *  produces. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Frees requests still `status = 'queued'` back to `pending`, inside an
 * already-open transaction. Extracted so `replaceDraftDispatches`,
 * `discardDraftDispatch`, and `updateDraftDispatch` — the three places that
 * can each detach a request from a dispatch — cannot independently drift on
 * what "safe to free" means. Per this project's own history, three call
 * sites quietly agreeing on the same rule is exactly the shape that has
 * produced defects here before.
 *
 * The `eq(status, 'queued')` guard is the whole point: a request that raced
 * to `dispatched` (approved elsewhere) or was independently `cancelled` by
 * its requester is left exactly where it is, never dragged back to
 * `pending`. A no-op (issues no query) when `requestIds` is empty.
 */
async function freeQueuedRequests(tx: Tx, requestIds: string[]) {
  if (requestIds.length === 0) return
  await tx
    .update(fleetRequests)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(and(inArray(fleetRequests.id, requestIds), eq(fleetRequests.status, 'queued')))
    .returning()
}

/** Gathers everything planDispatches() needs, converting numerics to numbers. */
export async function loadEngineInput(orgId: string, today: string): Promise<EngineInput> {
  const [settings, distances, vehicleRows, driverRows, licenceRows, liveDispatches, requestRows] =
    await Promise.all([
      getFleetSettings(orgId),
      listDistances(orgId),
      db.select().from(vehicles).where(eq(vehicles.orgId, orgId)),
      db.select().from(drivers).where(eq(drivers.orgId, orgId)),
      db
        .select({ driverId: driverVehicles.driverId, vehicleId: driverVehicles.vehicleId })
        .from(driverVehicles)
        .innerJoin(drivers, eq(driverVehicles.driverId, drivers.id))
        .where(eq(drivers.orgId, orgId)),
      // Vehicle/driver busy set: approved-or-running work, plus surviving
      // manual drafts (the rebuild never discards these — see
      // isDiscardableEngineDraft — so their resources must read as claimed,
      // not free, or the engine can double-book them into a fresh draft).
      db
        .select()
        .from(dispatches)
        .where(
          and(
            eq(dispatches.orgId, orgId),
            or(
              inArray(dispatches.status, ['approved', 'in_progress']),
              and(eq(dispatches.status, 'draft'), eq(dispatches.generatedBy, 'manual')),
            ),
          ),
        ),
      db
        .select({
          id: fleetRequests.id,
          requestType: fleetRequests.requestType,
          requestedById: fleetRequests.requestedBy,
          requesterCanUseRestricted: profiles.canUseRestrictedVehicles,
          targetPropertyId: fleetRequests.targetPropertyId,
          destinationLabel: fleetRequests.destinationText,
          startDate: fleetRequests.startDate,
          endDate: fleetRequests.endDate,
          paxCount: fleetRequests.paxCount,
          cargoRequired: fleetRequests.cargoRequired,
        })
        .from(fleetRequests)
        .leftJoin(profiles, eq(fleetRequests.requestedBy, profiles.id))
        .where(
          and(
            eq(fleetRequests.orgId, orgId),
            inArray(fleetRequests.status, ['pending', 'queued']),
            // Exclude requests already claimed by a dispatch the rebuild
            // won't discard (approved/in-progress work, or a surviving
            // manual draft). A request claimed only by an engine draft is
            // still fed in — that draft is about to be discarded and
            // re-planned by replaceDraftDispatches.
            notExists(
              db
                .select({ id: dispatchStops.id })
                .from(dispatchStops)
                .innerJoin(dispatches, eq(dispatchStops.dispatchId, dispatches.id))
                .where(
                  and(
                    eq(dispatchStops.requestId, fleetRequests.id),
                    eq(dispatches.orgId, orgId),
                    not(isDiscardableEngineDraft()),
                  ),
                ),
            ),
          ),
        ),
    ])

  const licencesByDriver = new Map<string, string[]>()
  for (const l of licenceRows) {
    const list = licencesByDriver.get(l.driverId) ?? []
    list.push(l.vehicleId)
    licencesByDriver.set(l.driverId, list)
  }

  return {
    requests: requestRows.map((r) => ({
      id: r.id,
      requestType: r.requestType,
      requestedById: r.requestedById,
      requesterCanUseRestricted: r.requesterCanUseRestricted ?? false,
      targetPropertyId: r.targetPropertyId,
      destinationLabel: r.destinationLabel,
      startDate: r.startDate,
      endDate: r.endDate,
      paxCount: r.paxCount,
      cargoRequired: r.cargoRequired,
    })),
    vehicles: vehicleRows.map((v) => ({
      id: v.id,
      name: v.name,
      maxPassengers: v.maxPassengers,
      cargoCapable: v.cargoCapable,
      isRestricted: v.isRestricted,
      status: v.status,
      currentLocationPropertyId: v.currentLocationPropertyId,
      sortOrder: v.sortOrder,
    })),
    drivers: driverRows.map((d) => ({
      id: d.id,
      fullName: d.fullName,
      isActive: d.isActive,
      vehicleIds: licencesByDriver.get(d.id) ?? [],
    })),
    distances: distances.map((d) => ({
      fromPropertyId: d.fromPropertyId,
      toPropertyId: d.toPropertyId,
      distanceKm: d.distanceKm,
    })),
    existingDispatches: liveDispatches.map((d) => ({
      id: d.id,
      vehicleId: d.vehicleId,
      driverId: d.driverId,
      startDate: d.startDate,
      endDate: d.endDate,
    })),
    settings: {
      poolingThresholdKm: settings.poolingThresholdKm,
      planningHorizonDays: settings.planningHorizonDays,
    },
    today,
  }
}

/**
 * Persists an engine run. Only `draft` dispatches are discarded and rebuilt —
 * approved work is never touched, which is what makes "Run engine now" safe.
 * Requests freed by a discarded draft return to `pending` so none can strand
 * in `queued` with no dispatch pointing at it.
 */
export async function replaceDraftDispatches(orgId: string, result: EngineResult) {
  return db.transaction(async (tx) => {
    const staleDrafts = await tx
      .select({ id: dispatches.id })
      .from(dispatches)
      .where(and(eq(dispatches.orgId, orgId), isDiscardableEngineDraft()))

    if (staleDrafts.length > 0) {
      const ids = staleDrafts.map((d) => d.id)
      const freed = await tx
        .select({ requestId: dispatchStops.requestId })
        .from(dispatchStops)
        .where(inArray(dispatchStops.dispatchId, ids))
      const freedIds = freed.map((f) => f.requestId).filter((v): v is string => v !== null)
      await freeQueuedRequests(tx, freedIds)
      // Re-apply isDiscardableEngineDraft() at DELETE time, not just at the
      // SELECT above: under READ COMMITTED, a concurrent approveDispatch()
      // that commits in the gap between the SELECT and this DELETE would
      // otherwise still get deleted, since `ids` was captured before that
      // commit. That deletes a dispatch whose requests were just flipped to
      // 'dispatched' — dispatch_stops cascades away with it, and those
      // requests then strand permanently (loadEngineInput only loads
      // pending/queued). Re-checking here means the DELETE's own WHERE
      // clause sees the post-commit 'approved' status and skips that row.
      await tx
        .delete(dispatches)
        .where(and(inArray(dispatches.id, ids), isDiscardableEngineDraft()))
        .returning()
    }

    const created: string[] = []
    for (const draft of result.drafts) {
      // The plan was computed from a `loadEngineInput` snapshot that may
      // now be stale — a request in `draft.stops` can have been cancelled
      // in the gap between planning and this transaction. Re-check right
      // before building the stop rows so a cancelled request never gets a
      // stop (matching the `ne('cancelled')` guard already on the status
      // update below).
      const draftRequestIds = draft.stops.map((s) => s.requestId)
      const liveRequestIds = new Set(
        draftRequestIds.length > 0
          ? (
              await tx
                .select({ id: fleetRequests.id })
                .from(fleetRequests)
                .where(and(inArray(fleetRequests.id, draftRequestIds), ne(fleetRequests.status, 'cancelled')))
            ).map((r) => r.id)
          : [],
      )
      const liveStops = draft.stops.filter((s) => liveRequestIds.has(s.requestId))

      const [dispatch] = await tx
        .insert(dispatches)
        .values({
          orgId,
          vehicleId: draft.vehicleId,
          driverId: draft.driverId,
          startDate: draft.startDate,
          endDate: draft.endDate,
          status: 'draft',
          generatedBy: 'engine',
        })
        .returning()

      if (liveStops.length > 0) {
        await tx
          .insert(dispatchStops)
          .values(
            liveStops.map((s) => ({
              dispatchId: dispatch.id,
              requestId: s.requestId,
              propertyId: s.propertyId,
              label: s.label,
              sortOrder: s.sortOrder,
            })),
          )
          .returning()

        await tx
          .update(fleetRequests)
          .set({ status: 'queued', updatedAt: new Date() })
          .where(
            and(
              inArray(fleetRequests.id, liveStops.map((s) => s.requestId)),
              ne(fleetRequests.status, 'cancelled'),
            ),
          )
          .returning()
      }

      created.push(dispatch.id)
    }

    return { createdDispatchIds: created, unassignable: result.unassignable }
  })
}

// --- Dispatches ------------------------------------------------------------

export async function listDispatches(
  orgId: string,
  filters: { status?: 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled' } = {},
) {
  const conditions = [eq(dispatches.orgId, orgId)]
  if (filters.status) conditions.push(eq(dispatches.status, filters.status))

  const rows = await db
    .select({
      id: dispatches.id,
      vehicleId: dispatches.vehicleId,
      vehicleName: vehicles.name,
      driverId: dispatches.driverId,
      driverName: drivers.fullName,
      startDate: dispatches.startDate,
      endDate: dispatches.endDate,
      status: dispatches.status,
      generatedBy: dispatches.generatedBy,
      approvedAt: dispatches.approvedAt,
      startedAt: dispatches.startedAt,
      completedAt: dispatches.completedAt,
    })
    .from(dispatches)
    .innerJoin(vehicles, eq(dispatches.vehicleId, vehicles.id))
    .innerJoin(drivers, eq(dispatches.driverId, drivers.id))
    .where(and(...conditions))
    .orderBy(asc(dispatches.startDate))

  if (rows.length === 0) return []

  const stops = await db
    .select({
      id: dispatchStops.id,
      dispatchId: dispatchStops.dispatchId,
      requestId: dispatchStops.requestId,
      propertyId: dispatchStops.propertyId,
      propertyName: properties.name,
      label: dispatchStops.label,
      sortOrder: dispatchStops.sortOrder,
      arrivedAt: dispatchStops.arrivedAt,
      paxCount: fleetRequests.paxCount,
      cargoRequired: fleetRequests.cargoRequired,
      requesterName: profiles.fullName,
      // Same addition as listRequests, same reason: lets the dispatch
      // editor mirror validateVehicleForCluster's restricted-vehicle rule
      // against a dispatch's OWN currently-attached stops, not just the
      // pending requests available to add.
      requesterCanUseRestricted: profiles.canUseRestrictedVehicles,
    })
    .from(dispatchStops)
    .leftJoin(properties, eq(dispatchStops.propertyId, properties.id))
    .leftJoin(fleetRequests, eq(dispatchStops.requestId, fleetRequests.id))
    .leftJoin(profiles, eq(fleetRequests.requestedBy, profiles.id))
    .where(inArray(dispatchStops.dispatchId, rows.map((r) => r.id)))
    .orderBy(asc(dispatchStops.sortOrder))

  return rows.map((r) => ({ ...r, stops: stops.filter((s) => s.dispatchId === r.id) }))
}

export async function getDispatchWithStops(id: string) {
  const rows = await db.select().from(dispatches).where(eq(dispatches.id, id)).limit(1)
  if (!rows[0]) return undefined
  const stops = await db
    .select()
    .from(dispatchStops)
    .where(eq(dispatchStops.dispatchId, id))
    .orderBy(asc(dispatchStops.sortOrder))
  return { ...rows[0], stops }
}

export async function approveDispatch(id: string, approvedBy: string) {
  return db.transaction(async (tx) => {
    const now = new Date()
    const [updated] = await tx
      .update(dispatches)
      .set({ status: 'approved', approvedBy, approvedAt: now, dispatchedAt: now, updatedAt: now })
      .where(and(eq(dispatches.id, id), eq(dispatches.status, 'draft')))
      .returning()

    if (!updated) return undefined

    const stops = await tx
      .select({ requestId: dispatchStops.requestId })
      .from(dispatchStops)
      .where(eq(dispatchStops.dispatchId, id))
    const requestIds = stops.map((s) => s.requestId).filter((v): v is string => v !== null)

    if (requestIds.length > 0) {
      await tx
        .update(fleetRequests)
        .set({ status: 'dispatched', updatedAt: now })
        .where(and(inArray(fleetRequests.id, requestIds), ne(fleetRequests.status, 'cancelled')))
        .returning()
    }

    return updated
  })
}

export async function createManualDispatch(
  orgId: string,
  data: {
    vehicleId: string
    driverId: string
    startDate: string
    endDate: string
    requestIds: string[]
    notes?: string | null
  },
) {
  return db.transaction(async (tx) => {
    const [dispatch] = await tx
      .insert(dispatches)
      .values({
        orgId,
        vehicleId: data.vehicleId,
        driverId: data.driverId,
        startDate: data.startDate,
        endDate: data.endDate,
        status: 'draft',
        generatedBy: 'manual',
        notes: data.notes ?? null,
      })
      .returning()

    if (data.requestIds.length > 0) {
      const requests = await tx
        .select()
        .from(fleetRequests)
        .where(
          and(
            inArray(fleetRequests.id, data.requestIds),
            eq(fleetRequests.orgId, orgId),
            ne(fleetRequests.status, 'cancelled'),
          ),
        )

      // `requests` can come back empty if every id was foreign-org or
      // already cancelled — guard the insert so it's never called with an
      // empty values array.
      if (requests.length > 0) {
        await tx
          .insert(dispatchStops)
          .values(
            requests.map((r, i) => ({
              dispatchId: dispatch.id,
              requestId: r.id,
              propertyId: r.targetPropertyId,
              label: r.destinationText,
              sortOrder: i,
            })),
          )
          .returning()

        await tx
          .update(fleetRequests)
          .set({ status: 'queued', updatedAt: new Date() })
          .where(
            and(
              inArray(fleetRequests.id, data.requestIds),
              eq(fleetRequests.orgId, orgId),
              ne(fleetRequests.status, 'cancelled'),
            ),
          )
          .returning()
      }
    }

    return dispatch
  })
}

/**
 * Deletes a still-draft dispatch and frees its requests back to `pending`,
 * in the same transaction — the removal path this project's ledger carries
 * forward as a rule: whenever dispatch cancellation/removal is added, it
 * must free its requests, or they strand permanently (stuck `queued` with
 * no dispatch pointing at them, invisible to both the unassigned-requests
 * list and the engine, which only ever loads `pending`/`queued`). This is
 * the first thing to satisfy that rule.
 *
 * Mirrors `replaceDraftDispatches`'s own freeing step: request ids are
 * harvested from `dispatch_stops` BEFORE the delete (not after — the FK's
 * `onDelete: 'cascade'` means the stops are gone the instant the dispatch
 * row is), and only a request still `status = 'queued'` is moved back to
 * `pending` (`ne('cancelled')` alongside it, matching that function's own
 * belt-and-braces guard) — one that independently raced to `dispatched` or
 * was `cancelled` by its requester in the meantime is left exactly where it
 * is, never dragged backwards.
 *
 * Scoped by BOTH `id` and `orgId`, and by `status = 'draft'`, in the delete's
 * own WHERE clause — not just checked beforehand — so a concurrent approval
 * of the same dispatch (a request racing this one) cannot be undone by a
 * discard that was already in flight when the approval committed: whichever
 * commits first wins, and the loser's WHERE clause simply matches nothing.
 * Returns the deleted row, or `undefined` if the id didn't exist, belonged
 * to another org, or was no longer a draft — the caller (the API route) is
 * expected to turn a `undefined` into 404/409 as appropriate, not this
 * function.
 */
export async function discardDraftDispatch(id: string, orgId: string) {
  return db.transaction(async (tx) => {
    const stops = await tx
      .select({ requestId: dispatchStops.requestId })
      .from(dispatchStops)
      .where(eq(dispatchStops.dispatchId, id))
    const requestIds = stops.map((s) => s.requestId).filter((v): v is string => v !== null)

    const [deleted] = await tx
      .delete(dispatches)
      .where(and(eq(dispatches.id, id), eq(dispatches.orgId, orgId), eq(dispatches.status, 'draft')))
      .returning()

    if (!deleted) return undefined

    await freeQueuedRequests(tx, requestIds)

    return deleted
  })
}

/**
 * Updates a still-draft dispatch's vehicle/driver/dates/notes and reconciles
 * its attached requests against a new desired set — the real edit path a
 * draft needs, in place of the create-then-discard workaround this
 * component used before this function existed. That workaround seeded its
 * "requests to attach" list by intersecting the dispatch's stops with
 * `listRequests(orgId, { status: 'pending' })`, but a draft's own attached
 * requests are always `queued`, never `pending` — the intersection was
 * therefore always empty, so every "edit" silently detached all of a
 * dispatch's trips. This function exists specifically to close that.
 *
 * Three request buckets, computed once against the dispatch's CURRENT stops:
 *  - dropped (currently attached, not in the new set): their stops are
 *    deleted and `freeQueuedRequests` returns them to `pending` if they're
 *    still `queued` (never if they raced to `dispatched`/`cancelled`).
 *  - added (in the new set, not currently attached): a fresh stop is
 *    inserted for each (scoped to `orgId`, excluding `cancelled` — same
 *    guard `createManualDispatch` uses for its own attach step) and their
 *    status is set to `queued`.
 *  - staying (in both): completely untouched — no stop deleted and
 *    reinserted, no status write of any kind. This is deliberate, not an
 *    optimisation: routing a staying request through
 *    free-then-requeue would open the exact window where a concurrent
 *    `approveDispatch()` or a second manual dispatch could grab it while it
 *    was transiently `pending`, which is how a request ends up attached to
 *    two live dispatches at once.
 *
 * Same status/org guard as `discardDraftDispatch`, inside the UPDATE's own
 * WHERE rather than checked beforehand, so a racing `approveDispatch()`
 * wins cleanly — this simply returns `undefined` rather than overwriting an
 * already-approved dispatch's vehicle/driver/dates out from under it.
 *
 * Always stamps `generatedBy: 'manual'`, even when the dispatch was
 * originally engine-generated. `isDiscardableEngineDraft()` (used by
 * `replaceDraftDispatches`) is `status = 'draft' AND generatedBy = 'engine'`
 * — if an edited draft kept `generatedBy: 'engine'`, the very next "Run
 * engine now" (from this same board) or the 5pm cron would silently delete
 * the admin's hand-corrected assignment and re-plan from scratch, with no
 * message. An admin-touched draft is no longer purely engine output, and
 * `'manual'` is what the rebuild's own discard predicate already treats as
 * off-limits — the same protection `createManualDispatch` gives a
 * brand-new manual dispatch, extended to one that started as an engine
 * draft and was then edited.
 *
 * `notes` is genuinely optional here, not create-shaped: the key is only
 * written when the caller's `data` object actually has a `notes` property
 * (checked with `'notes' in data`, not `data.notes ?? null`) — a caller
 * that omits `notes` entirely leaves the row's existing note untouched,
 * the same absent-vs-explicit-null distinction the fleet requests PATCH
 * route already applies via `hasOwnProperty`.
 */
export async function updateDraftDispatch(
  id: string,
  orgId: string,
  data: {
    vehicleId: string
    driverId: string
    startDate: string
    endDate: string
    requestIds: string[]
    notes?: string | null
  },
) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(dispatches)
      .set({
        vehicleId: data.vehicleId,
        driverId: data.driverId,
        startDate: data.startDate,
        endDate: data.endDate,
        generatedBy: 'manual',
        ...('notes' in data ? { notes: data.notes ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(dispatches.id, id), eq(dispatches.orgId, orgId), eq(dispatches.status, 'draft')))
      .returning()

    if (!updated) return undefined

    const currentStops = await tx
      .select({ requestId: dispatchStops.requestId, sortOrder: dispatchStops.sortOrder })
      .from(dispatchStops)
      .where(eq(dispatchStops.dispatchId, id))

    const currentRequestIds = new Set(
      currentStops.map((s) => s.requestId).filter((v): v is string => v !== null),
    )
    const desiredRequestIds = new Set(data.requestIds)

    const toRemove = [...currentRequestIds].filter((rid) => !desiredRequestIds.has(rid))
    const toAdd = [...desiredRequestIds].filter((rid) => !currentRequestIds.has(rid))
    // Anything in both sets (the intersection) stays attached and is never
    // referenced by either branch below — see the function-level comment
    // for why that has to be true, not just convenient.

    if (toRemove.length > 0) {
      await tx
        .delete(dispatchStops)
        .where(and(eq(dispatchStops.dispatchId, id), inArray(dispatchStops.requestId, toRemove)))
        .returning()
      await freeQueuedRequests(tx, toRemove)
    }

    if (toAdd.length > 0) {
      const requestsToAdd = await tx
        .select()
        .from(fleetRequests)
        .where(
          and(
            inArray(fleetRequests.id, toAdd),
            eq(fleetRequests.orgId, orgId),
            ne(fleetRequests.status, 'cancelled'),
          ),
        )

      // Can come back shorter than `toAdd` if an id was foreign-org or
      // already cancelled — guard both writes below so neither is ever
      // called with an empty list.
      if (requestsToAdd.length > 0) {
        const nextSortOrder = currentStops.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1
        await tx
          .insert(dispatchStops)
          .values(
            requestsToAdd.map((r, i) => ({
              dispatchId: id,
              requestId: r.id,
              propertyId: r.targetPropertyId,
              label: r.destinationText,
              sortOrder: nextSortOrder + i,
            })),
          )
          .returning()

        await tx
          .update(fleetRequests)
          .set({ status: 'queued', updatedAt: new Date() })
          .where(
            and(
              inArray(fleetRequests.id, requestsToAdd.map((r) => r.id)),
              ne(fleetRequests.status, 'cancelled'),
            ),
          )
          .returning()
      }
    }

    return updated
  })
}

// --- Driver-facing ---------------------------------------------------------

/** Dispatches a driver should see: approved or running, ending today or later. */
export async function getDriverDispatches(driverId: string, today: string) {
  const rows = await db
    .select({
      id: dispatches.id,
      vehicleName: vehicles.name,
      registrationNo: vehicles.registrationNo,
      startDate: dispatches.startDate,
      endDate: dispatches.endDate,
      status: dispatches.status,
      startedAt: dispatches.startedAt,
    })
    .from(dispatches)
    .innerJoin(vehicles, eq(dispatches.vehicleId, vehicles.id))
    .where(
      and(
        eq(dispatches.driverId, driverId),
        inArray(dispatches.status, ['approved', 'in_progress']),
        gte(dispatches.endDate, today),
      ),
    )
    .orderBy(asc(dispatches.startDate))

  if (rows.length === 0) return []

  const stops = await db
    .select({
      id: dispatchStops.id,
      dispatchId: dispatchStops.dispatchId,
      propertyName: properties.name,
      propertyLocation: properties.location,
      label: dispatchStops.label,
      sortOrder: dispatchStops.sortOrder,
      arrivedAt: dispatchStops.arrivedAt,
      paxCount: fleetRequests.paxCount,
      cargoRequired: fleetRequests.cargoRequired,
    })
    .from(dispatchStops)
    .leftJoin(properties, eq(dispatchStops.propertyId, properties.id))
    .leftJoin(fleetRequests, eq(dispatchStops.requestId, fleetRequests.id))
    .where(inArray(dispatchStops.dispatchId, rows.map((r) => r.id)))
    .orderBy(asc(dispatchStops.sortOrder))

  return rows.map((r) => ({ ...r, stops: stops.filter((s) => s.dispatchId === r.id) }))
}

export async function markDispatchStarted(id: string, driverId: string) {
  const [updated] = await db
    .update(dispatches)
    .set({ status: 'in_progress', startedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(dispatches.id, id),
        eq(dispatches.driverId, driverId),
        inArray(dispatches.status, ['approved', 'in_progress']),
      ),
    )
    .returning()
  return updated
}

/**
 * The dispatch-ids subquery also requires `status IN (approved, in_progress)`
 * — the same set `markDispatchStarted`/`completeDispatch` transition between
 * — so a stop on a driver's own completed or cancelled dispatch can no
 * longer have its `arrivedAt` silently overwritten after the fact. `approved`
 * is included (not just `in_progress`) because a driver may legitimately mark
 * arrival at a stop before tapping "start trip"; excluding it would break
 * that ordering, not just close a corner case.
 */
export async function markStopArrived(stopId: string, driverId: string) {
  const [updated] = await db
    .update(dispatchStops)
    .set({ arrivedAt: new Date() })
    .where(
      and(
        eq(dispatchStops.id, stopId),
        inArray(
          dispatchStops.dispatchId,
          db
            .select({ id: dispatches.id })
            .from(dispatches)
            .where(
              and(
                eq(dispatches.driverId, driverId),
                inArray(dispatches.status, ['approved', 'in_progress']),
              ),
            ),
        ),
      ),
    )
    .returning()
  return updated
}

/**
 * Completes a trip and repositions the vehicle to the last stop's property,
 * which keeps the engine's "already parked nearest" tiebreak honest.
 */
export async function completeDispatch(id: string, driverId: string) {
  return db.transaction(async (tx) => {
    const now = new Date()
    const [updated] = await tx
      .update(dispatches)
      .set({ status: 'completed', completedAt: now, updatedAt: now })
      .where(
        and(
          eq(dispatches.id, id),
          eq(dispatches.driverId, driverId),
          inArray(dispatches.status, ['approved', 'in_progress']),
        ),
      )
      .returning()

    if (!updated) return undefined

    const stops = await tx
      .select()
      .from(dispatchStops)
      .where(eq(dispatchStops.dispatchId, id))
      .orderBy(desc(dispatchStops.sortOrder))

    // A stop that doesn't resolve to a property (standalone free-text trip,
    // or a dispatch with no stops) tells us nothing about where the vehicle
    // is now — leave its recorded location untouched rather than defaulting
    // to head office, which is what `null` means in this system.
    const lastPropertyId = stops[0]?.propertyId ?? null
    if (lastPropertyId !== null) {
      await tx
        .update(vehicles)
        .set({ currentLocationPropertyId: lastPropertyId, updatedAt: now })
        .where(eq(vehicles.id, updated.vehicleId))
        .returning()
    }

    const requestIds = stops.map((s) => s.requestId).filter((v): v is string => v !== null)
    if (requestIds.length > 0) {
      await tx
        .update(fleetRequests)
        .set({ status: 'completed', updatedAt: now })
        .where(and(inArray(fleetRequests.id, requestIds), ne(fleetRequests.status, 'cancelled')))
        .returning()
    }

    return updated
  })
}
