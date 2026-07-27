# Fleet Pick-up Point — Known Gaps and Follow-Ups

**Date:** 2026-07-27
**Branch:** `feat/fleet-pickup-point` (12 commits, merge-base `7879a98`)
**Status:** Shipped. Nothing here blocks merge; everything here was consciously deferred.

Residue of the whole-branch review. It exists so the next person to open these files inherits the
reasoning rather than rediscovering it. Companion to `2026-07-27-fleet-command-follow-ups.md`.

## Functional gaps a user will notice

**The dispatcher cannot see a pick-up on the plan they are approving.** Acceptance criterion 8 is half
met. The pick-up shows in the board's *Unassigned requests* list and the editor's *Available to add*
list, but NOT in the board's `DraftCard` stop list (`dispatch-board.tsx`) or the editor's *Currently
attached* list (`dispatch-editor-dialog.tsx`) — precisely the two places a dispatcher reviews a trip
before approving it.

This is more work than it looks. `listDispatches` (`src/lib/db/queries/dispatches.ts`) does **not**
select the origin columns; only `getDriverDispatches` does. Showing a pick-up on the board therefore
needs the same aliased `origin_property` join added to `listDispatches`, not just a JSX change.

**Three hand-rolled stop labels that disagree with each other.** `dispatch-board.tsx` (DraftCard),
`dispatch-editor-dialog.tsx` (Currently attached) and `driver-manifest.tsx` each write their own
`stop.propertyName ?? stop.label ?? …` with **three different fallbacks** (`'Destination'`,
`'Destination'`, `'—'`) and no `.trim()`. `src/lib/fleet/labels.ts` was introduced on this branch to
kill exactly this pattern for *requests*, and commit `42616dd` deliberately moved it from `??` to
`.trim() ||`. The stop triplet was left on the old semantics: a property named `'  '` renders as a
blank stop on the manifest while the line above it in the same card reads "Unknown property".
Fold these into the shared helper when the item above is done.

**The driver manifest has never been seen rendering a pick-up.** Code-verified only. Confirming it
needs an approved dispatch plus a driver token, which means writing production data the live pooling
engine could then act on, so it was not done. The risk is layout, not correctness — `tsc` proves the
field shapes, and `formatOriginLabel` has unit coverage. Check it on the first real dispatch.

**Sinhala and Tamil `pickUp` strings are unreviewed drafts.** `රැගෙන යන ස්ථානය` / `අழைத்துச் செல்லும் இடம்`.
Consistent with this file's existing convention — `draftNotice` already tells non-English drivers the
wording is provisional. Correcting them is a data edit in `manifest-strings.ts`, no component change.

## Correctness risks, latent today

**Whitespace-only pick-up text passes both routes.** `Boolean('   ')` is `true`, so
`{ originKind: 'other', originText: '   ' }` satisfies the "Enter a pick-up location" check in both
`POST /api/fleet/requests` and `PATCH /api/fleet/requests/[id]`. The row stores `'   '`;
`formatOriginLabel` trims and falls back, so the driver sees `Collect from: —` for a request the
server certified as having a pick-up. Unreachable from the browser form (it trims before sending) —
this needs a direct API call or a future second client. Fix with `z.string().trim()` in both schemas,
or compare `.trim()` in the checks. Symmetric across both routes, so it is a gap, not a divergence.

**No database-level guard on the `(kind, id, text)` invariant.** The two API routes are the only thing
keeping `origin_kind = 'property'` paired with a non-null `origin_property_id`. That is sufficient
today — the engine and `createManualDispatch` never write the origin columns (all nine
`insert/update(fleetRequests)` sites were checked) — but a `CHECK` constraint would make the invariant
self-documenting for the next writer.

**A hard-deleted pick-up property degrades, by design.** `origin_property_id` is `ON DELETE SET NULL`
and `DELETE /api/properties/[id]?hard=true` has no reference guard, so rows can exist with
`origin_kind = 'property'` and a null id. The form now resolves that to an empty selection, shows its
placeholder, and blocks submit with a visible "Choose a pick-up point" (commit `a5b1a9e`). The row is
still wrong in the database until someone edits it; nothing repairs it automatically.

**Neither route validates `originPropertyId` against the caller's org.** A bogus uuid becomes an FK
violation and surfaces as a 500 "Failed to create request". Symmetric with the pre-existing
`targetPropertyId` handling, so not a regression — but it lands on the same list as the org-scoping
item in the fleet-command follow-ups, and should be fixed with it before a second organisation exists.

## Quality items

- `POST /api/fleet/requests` returns `{ error: 'Validation failed', details }` for a Zod refine
  failure, and the `parseErrorMessage` helper (still duplicated 8× across `src/components/fleet/`)
  reads only `error`. So a refine failure surfaces as a bare "Validation failed" with no field named,
  while `PATCH` returns a human string for the identical rule — the same rule, two different user
  experiences. Currently unreachable from `request-form.tsx`, but one regression away.
- `requests-table.tsx`: the column `id` is still `'destination'` while its header reads "Route" and it
  renders a route. Nothing else references the id, so it is safe — but rename it.
- `labels.ts`: `formatOriginLabel`'s `switch` has no `default` or exhaustiveness assert. `tsc` catches
  a new variant today because of the explicit `: string` return type; an assert would fail louder.
- `labels.ts`: `formatDestinationLabel` is exported but has no consumer outside `formatTripRoute` and
  its own tests.

## Notes for whoever picks this up

The pick-up is stored as a discriminated reference over the node set the distance grid already
defines — `null` property id means Head Office, plus each property, plus free text for anything else.
That representation was chosen so the pooling engine can consume it later without a second migration.
The engine ignores it entirely today: cluster distance and stop ordering remain destination-only.
