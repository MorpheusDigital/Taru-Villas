# Fleet Requests — Pick-up Point

**Date:** 2026-07-27
**Status:** Approved, not yet implemented
**Depends on:** `drizzle/0024_fleet_command.sql`, commit `e808935`

## Problem

A fleet request records where a trip *goes* but not where it *starts*.

`fleet_requests.origin_text` exists and the "Other trip" tab collects it as "Origin", but the
column is write-only: nothing renders it. Every display path uses the destination alone —
`propertyName` for a visit, `destinationText` for a standalone trip:

| Surface | Reads origin? |
|---|---|
| `requests-table.tsx` | No |
| `dispatch-board.tsx` | No |
| `dispatch-editor-dialog.tsx` | No |
| `driver-manifest.tsx` | No |
| `engine.ts` stop labels | No — built from `destinationLabel` |

The only reader is `request-form.tsx`, repopulating its own edit form. So the driver is told
where to go and never where to collect anyone. The "Property visit" tab has no origin field at
all.

Pick-ups in practice come from a small, repeatable set: Head Office, a property, or a
named place such as the airport.

## Decision

Store the pick-up as a **discriminated reference**, not free text, and surface it everywhere the
destination already appears — most importantly the driver's manifest.

The fleet domain already has this node set. `distances-grid.tsx:65` defines it:

```ts
{ id: null, name: 'Head Office' },   // null property id == Head Office
...properties                         // each property is a node
```

The pick-up picker is that same set, plus an "Other" escape hatch for places that are neither
Head Office nor a property (the airport).

### Rejected alternatives

**Two nullable columns, no enum** (`origin_property_id` + `origin_text`, interpreted
text-wins-else-property-else-Head-Office). Head Office and "not specified" both collapse to
`(null, null)`. That is the same NULL ambiguity that already forced
`UNIQUE NULLS NOT DISTINCT` onto `property_distances`; one occurrence in the codebase is
enough.

**Free text with a datalist.** No migration, but "Head Office" / "head office" / "HO" never
reconcile, and it cannot later feed the engine. It also contradicts the fact that pick-ups come
from a known set.

## Data model

Migration `drizzle/0025_fleet_request_origin.sql`, following 0024's idempotent style:

```sql
DO $$ BEGIN
  CREATE TYPE fleet_origin_kind AS ENUM ('head_office','property','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE fleet_requests
  ADD COLUMN IF NOT EXISTS origin_kind fleet_origin_kind NOT NULL DEFAULT 'head_office',
  ADD COLUMN IF NOT EXISTS origin_property_id uuid REFERENCES properties(id) ON DELETE SET NULL;
```

`origin_text` is retained and reused for `origin_kind = 'other'`.

`fleet_requests` currently holds **0 rows**, so the `DEFAULT 'head_office'` needs no backfill and
cannot mislabel historic data.

`ON DELETE SET NULL` matches `target_property_id`. A deleted pick-up property leaves
`origin_kind = 'property'` with a null id, which renders as "Unknown property" — the same
degradation `requests-table.tsx` already applies to a deleted target property.

Drizzle (`src/lib/db/schema.ts`), beside `fleetRequestTypeEnum`:

```ts
export const fleetOriginKindEnum = pgEnum('fleet_origin_kind', ['head_office', 'property', 'other'])
```

with `originKind` and `originPropertyId` added to `fleetRequests`.

## Field semantics

| `origin_kind` | `origin_property_id` | `origin_text` | Renders as |
|---|---|---|---|
| `head_office` | null | null | "Head Office" |
| `property` | required | null | the property's name |
| `other` | null | required | the entered text |

Writes **normalise**: the fields that do not belong to the chosen kind are set to null. This
mirrors the POST route's existing treatment of `destinationText`, which it nulls for a visit
regardless of what the client sent. Without it, switching a request from "Other" back to
"Head Office" would strand the old text in the row.

## Validation

Mirrored client-side and server-side, as this feature already does for `requestType`.

**Server** — two `.refine()`s on `createSchema` in `POST /api/fleet/requests`, matching the
existing pair:

```ts
.refine((d) => d.originKind !== 'property' || Boolean(d.originPropertyId), {
  message: 'Choose a pick-up property', path: ['originPropertyId'],
})
.refine((d) => d.originKind !== 'other' || Boolean(d.originText), {
  message: 'Enter a pick-up location', path: ['originText'],
})
```

**PATCH** (`/api/fleet/requests/[id]`) is a partial update, so its checks stay imperative and must
run against the **merged** state, not the patch alone:

```ts
const effectiveKind = data.originKind ?? existing.originKind
```

Validating the patch in isolation would let `{ originKind: 'property' }` through with no property
id, since the id is simply absent from the body.

**Client** — every conditional rule is scoped with `validate`, never a bare `required`:

```ts
validate: (v) => getValues('originKind') !== 'other' || Boolean(v?.trim()) || 'Enter a pick-up location'
```

This is not stylistic. `register()` runs while an element's props are evaluated, which React does
on every render regardless of whether the branch is displayed — the exact defect fixed in
`e808935`, where a hidden tab's `required` silently blocked every submit with its error message
rendered off screen. A bare `required` on the "Other" text box would reintroduce it.

## UI

### Request form (`request-form.tsx`)

The pick-up applies to both trip modes, so it is placed in the **shared** section alongside
Start date / End date / Passengers — *outside* the `<Tabs>`. This is deliberate: a shared field
inside a `TabsContent` is unreachable from the other mode and is precisely how the previous bug
arose.

- "Pick-up" `Select`: `Head Office` (default) · each active property · `Other…`
- Choosing `Other…` reveals a free-text `Input` (`maxLength={500}`, placeholder "e.g. Bandaranaike Airport")
- Editing an existing request whose pick-up property has since been deactivated appends that one
  property back into the options, reusing the `visitPropertyOptions` memo pattern already in this
  file, so the trigger shows a name rather than falling back to the placeholder

### Display

Rendered as a route on the **existing** Destination cell rather than a new column — the requests
table already carries seven columns plus actions:

```
Head Office → The Long House
```

Both halves always render, including when the origin is Head Office. A pick-up that is sometimes
shown and sometimes implied is worse than a slightly longer cell: the reader would have to know
the omission rule to tell "starts from Head Office" from "nobody set a pick-up".

One shared helper, `formatOriginLabel()`, in `src/lib/fleet/` — used by `requests-table.tsx`,
`dispatch-board.tsx`, `dispatch-editor-dialog.tsx` and the manifest. The follow-ups doc records
`parseErrorMessage` having been copy-pasted eight times across `src/components/fleet/`; this
helper does not repeat that.

### Driver manifest (`driver-manifest.tsx`)

The point of the feature. Each stop gains a "Collect from" line.

`ManifestStrings` gains one key, `pickUp`, in all three languages. SI/TA are first-pass drafts,
consistent with the existing `draftNotice` already shown to drivers.

## Queries

Both `listRequests` and `getDriverDispatches` already `leftJoin(properties, …)` on the
*destination*, so resolving the origin property's name needs a second, aliased join:

```ts
const originProperty = alias(properties, 'origin_property')
```

This is the pattern already used for `closer_profile` in the tasks queries.

`getDriverDispatches`'s stop select already joins `fleetRequests` for `paxCount` / `cargoRequired`,
so the origin columns come along at no extra join cost beyond the alias.

## Out of scope

Deliberately excluded, and each would be its own change:

- The pooling engine does **not** read the pick-up. Cluster distance and stop ordering stay
  destination-only.
- No multi-pickup routing. A pooled trip whose requests have different pick-ups shows each
  request's pick-up as information; it does not generate a collection stop per pick-up.
- No integration with `property_distances`, though the `uuid | null` representation is chosen to
  make that possible later without another migration.

## Risks and operational notes

- **Migration before merge.** `0025` must be applied in Supabase *before* the code merges, or the
  deployed build queries columns that do not exist. This is the known crash window in this
  project's workflow.
- **Lint gates the build.** An unused import or variable fails the Coolify build.
- **Drizzle history is unreliable here.** `0025` is hand-written and applied directly, per the
  established practice for this repo.
- SI/TA manifest wording remains unreviewed by a native speaker.

## Acceptance criteria

1. A new Property visit request can set a pick-up; it defaults to Head Office.
2. A new Other trip request can set a pick-up, including "Other…" free text.
3. Submitting from **either** tab succeeds with a pick-up set — no silent validation block.
4. Choosing "Other…" without typing anything shows a visible error on screen.
5. `POST` rejects `originKind: 'property'` with no property id, and `originKind: 'other'` with no text.
6. `PATCH` rejects a body that would leave the *merged* row in either invalid state.
7. Switching a request from "Other" back to "Head Office" leaves no residual `origin_text`.
8. The requests table, dispatch board and dispatch editor show the pick-up.
9. The driver manifest shows "Collect from" for each stop, in the driver's language.
10. `npx tsc --noEmit` and `npm run lint` are clean for all touched files.
