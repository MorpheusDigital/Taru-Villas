# Fleet & Visit Command — Known Gaps and Follow-Ups

**Date:** 2026-07-27
**Branch:** `feat/fleet-command` (41 commits)
**Status:** Shipped. Nothing here blocks merge; everything here is a deliberate deferral, triaged during the whole-branch review.

This is the residue of ~35 review findings that were consciously not fixed. It exists so the
next person to open these files inherits the reasoning rather than rediscovering it.

## Functional gaps a user will notice

**An approved dispatch cannot be cancelled.** `dispatch_status` has a `cancelled` value that no
code path writes. There is no `cancelDispatch` and no admin action for a non-draft dispatch, so a
trip cancelled in the real world leaves its dispatch `approved` until `endDate` passes: the driver
keeps seeing it, and the vehicle and driver stay in the engine's busy set for that window. Recourse
today is SQL. When this is built it MUST free the dispatch's requests back to `pending`, or they
strand permanently — `loadEngineInput` only ever loads `pending` and `queued`.

**`fleet_settings` is unreachable from the product.** `PATCH /api/fleet/settings` works, but nothing
calls it. The spec's stated purpose — tuning `poolingThresholdKm` and `planningHorizonDays`, and
pausing the nightly run via `engineEnabled`, without a deploy — is therefore unmet. Needs a small
admin page.

**The nightly cron discards its unassignable reasons.** `runFleetEngine` returns them; the cron route
counts them and throws them away. The board only ever populates reasons from a manual "Run engine
now". Spec §10 requires notifying the fleet admin when a request cannot be placed — not implemented,
so in the primary (nightly) mode a request sits unassigned with no reason and no alert.

**Distance cells cannot be cleared.** There is no DELETE for `property_distances`, so a value entered
by mistake can be changed but never returned to blank — while the grid's own hint text describes
blank as a meaningful state.

## Correctness risks, latent today

**Org scoping on property ids.** `targetPropertyId` (requests) and `currentLocationPropertyId`
(vehicles) are never validated against the caller's org, and `listRequests`' join to `properties` has
no org predicate — so a foreign property id returns another tenant's property *name*. Harmless while
the install is single-org; a real cross-tenant leak the day a second org exists. **Fix this before
any second organisation is created.** The `vehicleBelongsToOrg` / `driverBelongsToOrg` helpers show
the shape.

**Manual paths accept an already-claimed request.** `createManualDispatch` and `updateDraftDispatch`
filter attached requests by org and not-cancelled, but not by "already on another live dispatch".
Unreachable from the UI (only `pending` requests are offered) but reachable by direct API call, and
the result is one trip on two dispatches with two drivers.

**A request claimed by both an engine and a manual draft** is reset to `pending` when the engine
draft is discarded, even though the manual draft still holds it — so it displays as unplanned while
being permanently unplannable.

**Duplicated predicate.** `loadEngineInput`'s busy set hand-writes `(draft AND generatedBy='manual')`
instead of deriving from `isDiscardableEngineDraft()`. They are complementary today. `generated_by`
is a plain varchar with no CHECK constraint, so any third value produces a draft that is neither
discardable nor booked — i.e. double-booking. Either derive the predicate or constrain the column.

## Quality items

- `parseErrorMessage` is duplicated 8× across `src/components/fleet/` and reads only `error`,
  ignoring the `details` object every Zod `.refine` failure returns. Consequence: refine failures
  surface as a bare "Validation failed" with no field named. Consolidate into `src/lib/utils.ts` and
  teach it to read `details`.
- The cron returns HTTP 200 even when `ok: false`, so a monitor watching status codes reads a partial
  failure as success.
- No test that `maxCargoCapacity` excludes non-active vehicles — a regression dropping that filter
  would pass all existing tests. Cheap to add, guards a safety rule.
- No unit test for `formatColomboTime`, though `dates.ts` is the one unit-tested module here.
- `markDispatchStarted` permits `in_progress → in_progress`, so a second Start tap resets `startedAt`.
- The driver's push messages are English-only despite the trilingual manifest.
- `window.confirm` on Complete trip: the message is translated, the OK/Cancel chrome is not.

## Schema note

`src/lib/db/schema.ts` deliberately omits three things `drizzle/0024_fleet_command.sql` creates:
the `property_distances` unique constraint (Drizzle has no `NULLS NOT DISTINCT` builder), the
`push_subscriptions` one-owner CHECK, and the five indexes. No runtime effect, but a future
`drizzle-kit generate` will try to re-add them. The SQL is authoritative.

## Operational reminders

- Adding any dependency: `npx npm@10.9.8 install --package-lock-only <pkg>` then `npx npm@10.9.8 ci`.
  A plain `npm install` on macOS strips musl/linux platform binaries from the lockfile and breaks the
  Coolify build — it has done so three times (`9b973ee`, `1b5ac04`, `30d5a33`).
- `NEXT_PUBLIC_*` variables must be declared as `ARG` in the Dockerfile's **builder** stage or they
  are not inlined, regardless of what Coolify passes.
- Pooling does nothing until the distance grid has data. An unentered pair is correctly treated as
  "too far to pool", so an empty grid looks identical to a broken engine.
