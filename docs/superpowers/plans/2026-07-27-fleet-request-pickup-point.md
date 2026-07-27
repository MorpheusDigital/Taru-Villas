# Fleet Request Pick-up Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record where a fleet trip starts, as a structured reference, and show it everywhere the destination already appears — above all on the driver's manifest.

**Architecture:** A discriminated origin (`head_office | property | other`) on `fleet_requests`, reusing the node set the distance grid already defines (null property id = Head Office, plus each property) with a free-text escape hatch. Label formatting lives in one shared module consumed by all four display surfaces. The pooling engine is untouched.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM over Supabase Postgres, Zod v4, React Hook Form, shadcn/ui + Radix, vitest.

**Spec:** `docs/superpowers/specs/2026-07-27-fleet-request-pickup-point-design.md`

## Global Constraints

- Postgres client must keep `{ prepare: false }` — PgBouncer breaks prepared statements. Never change `src/lib/db/index.ts`.
- Zod: never use `.url()`. Coerce nullable arrays to `[]` before handing them to Drizzle.
- Next.js 16: route params are a Promise — `const { id } = await context.params`.
- Every `page.tsx` that fetches data needs `export const dynamic = 'force-dynamic'`.
- All mutations use `.returning()`.
- Pages use `requireAuth()` / `requireRole()`; API routes use `getProfile()` and return 401 rather than redirecting.
- **Lint gates the deploy.** An unused import or variable fails the Coolify build. Run `npm run lint` before every commit and confirm the touched files are clean.
- `npm run build` hangs on macOS — do not run it. `npx tsc --noEmit` is the local type gate.
- Migrations are **hand-written** SQL applied directly in Supabase; Drizzle's migration history in this repo is not reliable. Do not run `drizzle-kit generate` or `drizzle-kit migrate`.
- Do not add npm dependencies. If one were unavoidable: `npx npm@10.9.8 install --package-lock-only <pkg>` then `npx npm@10.9.8 ci` — a plain `npm install` on macOS strips linux/musl binaries from the lockfile and has broken the Coolify build three times.
- Commit messages end with: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## Ordering and the migration window

Task 1 applies the migration to Supabase **before** any code that reads the new columns is merged. Deploying code that queries columns which do not exist crashes the running app. Tasks 2–8 may only be pushed after Task 1's SQL has been confirmed applied.

---

### Task 1: Migration and Drizzle schema

**Files:**
- Create: `drizzle/0025_fleet_request_origin.sql`
- Modify: `src/lib/db/schema.ts` (enum block near line 1506; `fleetRequests` table near line 1571)

**Interfaces:**
- Consumes: nothing
- Produces: `fleetOriginKindEnum` (pgEnum), and `fleetRequests.originKind` / `fleetRequests.originPropertyId` columns. `NewFleetRequest` gains `originKind?: 'head_office' | 'property' | 'other'` and `originPropertyId?: string | null`.

- [ ] **Step 1: Write the migration SQL**

Create `drizzle/0025_fleet_request_origin.sql`, matching 0024's idempotent style:

```sql
-- 0025_fleet_request_origin.sql
DO $$ BEGIN
  CREATE TYPE fleet_origin_kind AS ENUM ('head_office','property','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE fleet_requests
  ADD COLUMN IF NOT EXISTS origin_kind fleet_origin_kind NOT NULL DEFAULT 'head_office';
--> statement-breakpoint
ALTER TABLE fleet_requests
  ADD COLUMN IF NOT EXISTS origin_property_id uuid REFERENCES properties(id) ON DELETE SET NULL;
```

`origin_text` already exists and is reused for `origin_kind = 'other'`. `fleet_requests` holds 0 rows, so the default needs no backfill.

- [ ] **Step 2: Apply the migration in Supabase**

Paste the SQL into the Supabase SQL editor and run it. Then confirm:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'fleet_requests' AND column_name LIKE 'origin%'
ORDER BY column_name;
```

Expected: three rows — `origin_kind` (USER-DEFINED, NO, `'head_office'::fleet_origin_kind`), `origin_property_id` (uuid, YES), `origin_text` (text, YES).

- [ ] **Step 3: Add the enum to the Drizzle schema**

In `src/lib/db/schema.ts`, beside `fleetRequestTypeEnum` (~line 1506):

```ts
export const fleetOriginKindEnum = pgEnum('fleet_origin_kind', [
  'head_office',
  'property',
  'other',
])
```

- [ ] **Step 4: Add the columns to `fleetRequests`**

In the same file, inside `fleetRequests` (~line 1577), directly after `originText`:

```ts
  originText: text('origin_text'),
  originKind: fleetOriginKindEnum('origin_kind').default('head_office').notNull(),
  originPropertyId: uuid('origin_property_id').references(() => properties.id, { onDelete: 'set null' }),
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add drizzle/0025_fleet_request_origin.sql src/lib/db/schema.ts
git commit -m "feat(fleet): add structured pick-up columns to fleet_requests

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Label formatting module

**Files:**
- Create: `src/lib/fleet/labels.ts`
- Test: `src/lib/fleet/labels.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions, no imports from the app)
- Produces:
  - `type OriginKind = 'head_office' | 'property' | 'other'`
  - `interface OriginFields { originKind: OriginKind; originPropertyName: string | null; originText: string | null }`
  - `interface DestinationFields { requestType: 'visit' | 'standalone'; propertyName: string | null; destinationText: string | null }`
  - `formatOriginLabel(o: OriginFields): string`
  - `formatDestinationLabel(d: DestinationFields): string`
  - `formatTripRoute(r: OriginFields & DestinationFields): string`

This module also absorbs the destination ternary currently copy-pasted at `requests-table.tsx:147`, `dispatch-editor-dialog.tsx:435` and `dispatch-board.tsx:479`. The branch review recorded `parseErrorMessage` having been duplicated eight times across `src/components/fleet/`; do not start a second such family.

- [ ] **Step 1: Write the failing test**

Create `src/lib/fleet/labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatOriginLabel, formatDestinationLabel, formatTripRoute } from './labels'

describe('formatOriginLabel', () => {
  it('names the head office', () => {
    expect(formatOriginLabel({ originKind: 'head_office', originPropertyName: null, originText: null }))
      .toBe('Head Office')
  })

  it('uses the property name', () => {
    expect(formatOriginLabel({ originKind: 'property', originPropertyName: 'The Long House', originText: null }))
      .toBe('The Long House')
  })

  it('degrades to Unknown property when the pick-up property was deleted', () => {
    expect(formatOriginLabel({ originKind: 'property', originPropertyName: null, originText: null }))
      .toBe('Unknown property')
  })

  it('uses the free text for other', () => {
    expect(formatOriginLabel({ originKind: 'other', originPropertyName: null, originText: 'Bandaranaike Airport' }))
      .toBe('Bandaranaike Airport')
  })

  it('falls back to an em dash when other has no text', () => {
    expect(formatOriginLabel({ originKind: 'other', originPropertyName: null, originText: null }))
      .toBe('—')
  })

  it('ignores a property name that does not belong to the kind', () => {
    expect(formatOriginLabel({ originKind: 'head_office', originPropertyName: 'The Long House', originText: 'x' }))
      .toBe('Head Office')
  })
})

describe('formatDestinationLabel', () => {
  it('uses the property name for a visit', () => {
    expect(formatDestinationLabel({ requestType: 'visit', propertyName: 'The Long House', destinationText: null }))
      .toBe('The Long House')
  })

  it('degrades to Unknown property for a visit with no property', () => {
    expect(formatDestinationLabel({ requestType: 'visit', propertyName: null, destinationText: null }))
      .toBe('Unknown property')
  })

  it('uses the free text for a standalone trip', () => {
    expect(formatDestinationLabel({ requestType: 'standalone', propertyName: null, destinationText: 'Airport' }))
      .toBe('Airport')
  })

  it('falls back to an em dash for a standalone trip with no destination', () => {
    expect(formatDestinationLabel({ requestType: 'standalone', propertyName: null, destinationText: null }))
      .toBe('—')
  })
})

describe('formatTripRoute', () => {
  it('joins pick-up and destination with an arrow', () => {
    expect(
      formatTripRoute({
        originKind: 'head_office',
        originPropertyName: null,
        originText: null,
        requestType: 'visit',
        propertyName: 'The Long House',
        destinationText: null,
      })
    ).toBe('Head Office → The Long House')
  })

  it('renders the head office half even though it is the default', () => {
    // A pick-up that is sometimes shown and sometimes implied would force the
    // reader to know the omission rule to tell "starts from Head Office" from
    // "nobody set a pick-up".
    expect(
      formatTripRoute({
        originKind: 'other',
        originPropertyName: null,
        originText: 'Airport',
        requestType: 'standalone',
        propertyName: null,
        destinationText: 'Head Office',
      })
    ).toBe('Airport → Head Office')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/fleet/labels.test.ts`
Expected: FAIL — cannot resolve `./labels`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/fleet/labels.ts`:

```ts
export type OriginKind = 'head_office' | 'property' | 'other'

export interface OriginFields {
  originKind: OriginKind
  originPropertyName: string | null
  originText: string | null
}

export interface DestinationFields {
  requestType: 'visit' | 'standalone'
  propertyName: string | null
  destinationText: string | null
}

/**
 * Where a trip starts. `head_office` is the null-property-id node the
 * distance grid already uses (see distances-grid.tsx), so the three kinds
 * cover the whole node set plus anything that is neither — the airport being
 * the case that motivated `other`.
 *
 * A `property` pick-up whose property row was deleted arrives here with a
 * null name (the FK is ON DELETE SET NULL) and degrades to "Unknown
 * property", matching how a deleted target property already reads.
 */
export function formatOriginLabel(o: OriginFields): string {
  switch (o.originKind) {
    case 'head_office':
      return 'Head Office'
    case 'property':
      return o.originPropertyName ?? 'Unknown property'
    case 'other':
      return o.originText?.trim() || '—'
  }
}

/** Where a trip goes. Absorbs the ternary formerly repeated at three call sites. */
export function formatDestinationLabel(d: DestinationFields): string {
  return d.requestType === 'visit'
    ? (d.propertyName ?? 'Unknown property')
    : (d.destinationText?.trim() || '—')
}

/** "Head Office → The Long House". Both halves always render. */
export function formatTripRoute(r: OriginFields & DestinationFields): string {
  return `${formatOriginLabel(r)} → ${formatDestinationLabel(r)}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/fleet/labels.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint 2>&1 | grep -A3 "labels" || echo "clean"`
Expected: tsc exit 0; no lint findings for `labels.ts` or `labels.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fleet/labels.ts src/lib/fleet/labels.test.ts
git commit -m "feat(fleet): add shared pick-up and destination label formatting

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Expose origin through the query layer

**Files:**
- Modify: `src/lib/db/queries/dispatches.ts` — `listRequests` (~line 18) and `getDriverDispatches` stop select (~line 824)

**Interfaces:**
- Consumes: `fleetRequests.originKind` / `.originPropertyId` (Task 1)
- Produces: `listRequests()` rows gain `originKind`, `originPropertyId`, `originPropertyName`. `getDriverDispatches()` stops gain `originKind`, `originPropertyName`, `originText`. Both flow automatically into the derived component types `FleetRequestRow` and `DispatchStop`.

Both functions already `leftJoin(properties, …)` on the *destination*, so the origin property needs a second, aliased join — the pattern already used for `closer_profile` in the tasks queries.

- [ ] **Step 1: Import `alias`**

At the top of `src/lib/db/queries/dispatches.ts`, add the Drizzle alias helper:

```ts
import { alias } from 'drizzle-orm/pg-core'
```

- [ ] **Step 2: Extend `listRequests`**

Inside `listRequests`, before the `db.select({...})` call:

```ts
const originProperty = alias(properties, 'origin_property')
```

Add to the select object, directly after the existing `originText: fleetRequests.originText,` line:

```ts
      originKind: fleetRequests.originKind,
      originPropertyId: fleetRequests.originPropertyId,
      originPropertyName: originProperty.name,
```

And add the join immediately after the existing destination-property join:

```ts
    .leftJoin(originProperty, eq(fleetRequests.originPropertyId, originProperty.id))
```

- [ ] **Step 3: Extend the driver stop select**

In `getDriverDispatches`, before the `const stops = await db` call:

```ts
const originProperty = alias(properties, 'origin_property')
```

Add to the stop select object, after `cargoRequired: fleetRequests.cargoRequired,`:

```ts
      originKind: fleetRequests.originKind,
      originPropertyName: originProperty.name,
      originText: fleetRequests.originText,
```

And add the join after the existing `.leftJoin(fleetRequests, …)`:

```ts
    .leftJoin(originProperty, eq(fleetRequests.originPropertyId, originProperty.id))
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

Note: `originKind` on a driver stop is `OriginKind | null` because `fleetRequests` is left-joined (a stop whose request was deleted has none). Task 8 handles the null.

- [ ] **Step 5: Verify the query returns the columns**

Create a throwaway probe at the repo root (so Node resolves `node_modules`), run it, then delete it:

```js
// .probe.tmp.mjs
import postgres from 'postgres'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const sql = postgres(get('POSTGRES_URL') || get('DATABASE_URL'), { prepare: false })
console.log(await sql`select origin_kind, origin_property_id, origin_text from fleet_requests limit 5`)
await sql.end()
```

```bash
node ./.probe.tmp.mjs; rm -f ./.probe.tmp.mjs
```

Expected: an empty result set with no error. An error naming `origin_kind` means Task 1 Step 2 was not applied.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/queries/dispatches.ts
git commit -m "feat(fleet): select pick-up fields in request and driver queries

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Accept a pick-up on POST

**Files:**
- Modify: `src/app/api/fleet/requests/route.ts` — `createSchema` (line 8) and the `createRequest` call (line 96)

**Interfaces:**
- Consumes: `fleetRequests` columns (Task 1)
- Produces: `POST /api/fleet/requests` accepts `originKind`, `originPropertyId`, `originText`.

- [ ] **Step 1: Extend `createSchema`**

Add these three fields to the object (the existing `originText` line is replaced by the one below, which is identical — keep only one):

```ts
    originKind: z.enum(['head_office', 'property', 'other']).default('head_office'),
    originPropertyId: z.string().uuid().nullable().optional(),
    originText: z.string().max(500).nullable().optional(),
```

Add two refines after the three existing ones:

```ts
  .refine((d) => d.originKind !== 'property' || Boolean(d.originPropertyId), {
    message: 'Choose a pick-up property',
    path: ['originPropertyId'],
  })
  .refine((d) => d.originKind !== 'other' || Boolean(d.originText), {
    message: 'Enter a pick-up location',
    path: ['originText'],
  })
```

- [ ] **Step 2: Normalise on write**

In the `createRequest({...})` call, replace the existing line `originText: data.originText ?? null,` with:

```ts
      originKind: data.originKind,
      originPropertyId: data.originKind === 'property' ? (data.originPropertyId ?? null) : null,
      originText: data.originKind === 'other' ? (data.originText ?? null) : null,
```

Nulling the fields that do not belong to the chosen kind mirrors how this route already nulls `destinationText` for a visit. Without it, a request switched from "Other" back to "Head Office" strands its old text in the row.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Verify the validation rules by hand**

Start the dev server with the auth bypass:

```bash
DEV_BYPASS_AUTH=true npm run dev
```

Note: the bypass profile's id is the literal string `dev-bypass-user`, which is not a UUID, so a request that passes validation fails at the DB insert with a 500. That is expected and is exactly the signal you want — it proves the body cleared Zod. A **400** means validation rejected it.

```bash
# Expect 400 + "Choose a pick-up property"
curl -s -X POST localhost:3000/api/fleet/requests -H 'Content-Type: application/json' \
  -d '{"requestType":"standalone","destinationText":"Airport","startDate":"2026-08-05","endDate":"2026-08-06","paxCount":1,"originKind":"property"}'

# Expect 400 + "Enter a pick-up location"
curl -s -X POST localhost:3000/api/fleet/requests -H 'Content-Type: application/json' \
  -d '{"requestType":"standalone","destinationText":"Airport","startDate":"2026-08-05","endDate":"2026-08-06","paxCount":1,"originKind":"other"}'

# Expect 500 (insert-time uuid failure) — i.e. validation passed
curl -s -X POST localhost:3000/api/fleet/requests -H 'Content-Type: application/json' \
  -d '{"requestType":"standalone","destinationText":"Airport","startDate":"2026-08-05","endDate":"2026-08-06","paxCount":1,"originKind":"head_office"}'
```

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/fleet/requests/route.ts
git commit -m "feat(fleet): accept and normalise a pick-up point on request creation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Accept a pick-up on PATCH

**Files:**
- Modify: `src/app/api/fleet/requests/[id]/route.ts` — `updateSchema` (line 14), the coherence checks (~line 88), and `updatePayload` (~line 113)

**Interfaces:**
- Consumes: `fleetRequests` columns (Task 1)
- Produces: `PATCH /api/fleet/requests/[id]` accepts the same three fields, validated against the merged row.

- [ ] **Step 1: Extend `updateSchema`**

Add to the object — note `.optional()` and **no** `.default()`, or every PATCH would silently reset the pick-up:

```ts
  originKind: z.enum(['head_office', 'property', 'other']).optional(),
  originPropertyId: z.string().uuid().nullable().optional(),
```

`originText` is already present; leave it as is.

- [ ] **Step 2: Validate the merged state**

Directly after the existing `requestType` coherence block (after the `standalone`/destination check), add:

```ts
    // Fix 3: pick-up coherence, against the EFFECTIVE row. A partial body such
    // as `{ originKind: 'property' }` carries no property id at all, so
    // checking the patch in isolation would admit a row that names a property
    // pick-up while pointing at nothing. hasOwnProperty (not `??`) for the same
    // reason as above: both fields are nullable, so `??` cannot tell an explicit
    // null-to-clear from "not provided".
    const hasOriginKind = Object.prototype.hasOwnProperty.call(data, 'originKind')
    const hasOriginPropertyId = Object.prototype.hasOwnProperty.call(data, 'originPropertyId')
    const hasOriginText = Object.prototype.hasOwnProperty.call(data, 'originText')
    const effectiveOriginKind = hasOriginKind ? data.originKind! : existing.originKind
    const effectiveOriginPropertyId = hasOriginPropertyId
      ? data.originPropertyId
      : existing.originPropertyId
    const effectiveOriginText = hasOriginText ? data.originText : existing.originText

    if (effectiveOriginKind === 'property' && !effectiveOriginPropertyId) {
      return NextResponse.json({ error: 'Choose a pick-up property' }, { status: 400 })
    }
    if (effectiveOriginKind === 'other' && !effectiveOriginText) {
      return NextResponse.json({ error: 'Enter a pick-up location' }, { status: 400 })
    }
```

- [ ] **Step 3: Write the normalised values**

In `updatePayload`, replace the existing line `originText: data.originText,` with:

```ts
      originKind: effectiveOriginKind,
      originPropertyId: effectiveOriginKind === 'property' ? effectiveOriginPropertyId : null,
      originText: effectiveOriginKind === 'other' ? effectiveOriginText : null,
```

- [ ] **Step 4: Verify the merged-state rule**

This is the least obvious logic in the plan, so exercise it rather than trusting it.
PATCH needs an existing `pending` row, and `fleet_requests` is empty, so seed one with a
real `requested_by`. Under `DEV_BYPASS_AUTH` the caller is `role: 'admin'`, so it clears
the owner-or-fleet-admin gate even though it does not own the row.

Create `.probe.tmp.mjs` at the repo root, run it, then delete it:

```js
import postgres from 'postgres'
import { readFileSync } from 'fs'
const env = readFileSync('.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const sql = postgres(get('POSTGRES_URL') || get('DATABASE_URL'), { prepare: false })
const [admin] = await sql`select id, org_id from profiles where role = 'admin' limit 1`
const [row] = await sql`
  insert into fleet_requests (org_id, request_type, requested_by, destination_text, start_date, end_date, pax_count)
  values (${admin.org_id}, 'standalone', ${admin.id}, 'Airport', '2026-08-05', '2026-08-06', 1)
  returning id`
console.log('SEEDED', row.id)
await sql.end()
```

```bash
node ./.probe.tmp.mjs; rm -f ./.probe.tmp.mjs
```

With `DEV_BYPASS_AUTH=true npm run dev` running, substituting the seeded id:

```bash
# Expect 400 "Choose a pick-up property" — the patch names a property kind but
# carries no id, which is the case a patch-only check would wrongly admit
curl -s -X PATCH localhost:3000/api/fleet/requests/<ID> -H 'Content-Type: application/json' \
  -d '{"originKind":"property"}'

# Expect 200 — kind and id supplied together
curl -s -X PATCH localhost:3000/api/fleet/requests/<ID> -H 'Content-Type: application/json' \
  -d '{"originKind":"other","originText":"Bandaranaike Airport"}'

# Expect 200, and origin_text cleared to null by the normalisation
curl -s -X PATCH localhost:3000/api/fleet/requests/<ID> -H 'Content-Type: application/json' \
  -d '{"originKind":"head_office"}'
```

Confirm the last one really cleared the text (spec acceptance criterion 7), then remove the
seeded row:

```sql
SELECT origin_kind, origin_property_id, origin_text FROM fleet_requests WHERE id = '<ID>';
DELETE FROM fleet_requests WHERE id = '<ID>';
```

Expected: `head_office | null | null`, then the table is empty again.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint 2>&1 | grep -A3 "requests/\[id\]" || echo "clean"`
Expected: tsc exit 0; no lint findings for this route.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/fleet/requests/[id]/route.ts"
git commit -m "feat(fleet): validate pick-up against the merged row on PATCH

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Pick-up field on the request form

**Files:**
- Modify: `src/components/fleet/request-form.tsx`

**Interfaces:**
- Consumes: `POST`/`PATCH` contract (Tasks 4–5); `FleetRequestRow` gains origin fields (Task 3)
- Produces: no exports change

The field goes in the **shared** block — after `</Tabs>`, before the start/end date grid — not inside a `TabsContent`. A pick-up applies to both trip modes, and a shared field placed inside one tab is unreachable from the other. This is also the arrangement that avoids the defect fixed in `e808935`.

A single `Select` carries the whole choice, encoded as `head_office` | `other` | `prop:<uuid>`, so there is one field to validate rather than two coupled ones.

- [ ] **Step 1: Remove the old Origin input from the standalone tab**

The "Other trip" panel currently renders an Origin field bound to the same
`originText` value the new pick-up will own. Leaving it in place would bind two
inputs to one form field, so delete this whole block from the
`<TabsContent value="standalone">` panel:

```tsx
          <div className="space-y-2">
            <Label htmlFor="request-origin">Origin</Label>
            <Input
              id="request-origin"
              placeholder="e.g. Head Office"
              maxLength={500}
              {...register('originText')}
            />
          </div>
```

The pick-up field added in Step 5 replaces it for both trip modes.

- [ ] **Step 2: Extend the form value type**

In `interface RequestFormValues`, add:

```ts
  originSelection: string
  originText: string
```

`originText` already exists in the interface — keep only one copy.

- [ ] **Step 3: Set the defaults**

In the `useForm({ defaultValues: { … } })` object, replace the existing `originText` default and add the selection:

```ts
      originSelection:
        request?.originKind === 'property' && request.originPropertyId
          ? `prop:${request.originPropertyId}`
          : (request?.originKind ?? 'head_office'),
      originText: request?.originText ?? '',
```

- [ ] **Step 4: Watch the selection**

Beside the existing `watch` calls:

```ts
  const originSelection = watch('originSelection')
```

- [ ] **Step 5: Render the field**

Insert directly after the closing `</Tabs>` tag and before the `grid grid-cols-2` date block:

```tsx
      <div className="space-y-2">
        <Label>Pick-up</Label>
        <Controller
          control={control}
          name="originSelection"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="head_office">Head Office</SelectItem>
                {visitPropertyOptions.map((p) => (
                  <SelectItem key={p.id} value={`prop:${p.id}`}>
                    {p.name}
                  </SelectItem>
                ))}
                <SelectItem value="other">Other…</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
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
```

`visitPropertyOptions` is the existing memo, which already re-adds a deactivated property when editing a request that points at it.

- [ ] **Step 6: Map the selection into the request body**

In `onSubmit`, inside the `const body = {…}` object, replace the existing `originText: …` line with:

```ts
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
```

The old line tied origin to `requestType === 'standalone'`; the pick-up now applies to both modes, so that condition is gone.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint 2>&1 | grep -A3 "request-form" || echo "clean"`
Expected: tsc exit 0; no lint findings.

- [ ] **Step 8: Verify in the browser**

Start `DEV_BYPASS_AUTH=true npm run dev`, open `http://localhost:3000/fleet`, click **New request**, and confirm all four:

1. "Pick-up" shows on the **Property visit** tab, defaulting to Head Office.
2. Switching to **Other trip** keeps the pick-up visible and its value intact.
3. Choosing **Other…** reveals the text box; submitting it empty shows "Enter a pick-up location" **on screen** — not a dead button.
4. With a valid pick-up, submitting POSTs `/api/fleet/requests` (check the Network panel). A 500 from the insert is the expected bypass artifact; a request that never fires is a failure.

- [ ] **Step 9: Commit**

```bash
git add src/components/fleet/request-form.tsx
git commit -m "feat(fleet): collect a pick-up point on both request modes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Show the route on the admin surfaces

**Files:**
- Modify: `src/components/fleet/requests-table.tsx:144-149`
- Modify: `src/components/fleet/dispatch-board.tsx:476-481`
- Modify: `src/components/fleet/dispatch-editor-dialog.tsx:433-436`

**Interfaces:**
- Consumes: `formatTripRoute`, `formatDestinationLabel` (Task 2); origin fields on `listRequests` rows (Task 3)
- Produces: no exports change

- [ ] **Step 1: Requests table — render the full route**

In `requests-table.tsx`, add the import:

```ts
import { formatTripRoute } from '@/lib/fleet/labels'
```

Replace the body of the `destination` column cell (lines 144–149) with:

```tsx
      cell: ({ row }) => <span className="font-medium">{formatTripRoute(row.original)}</span>,
```

In the same column definition, change `header: 'Destination',` to `header: 'Route',` so the
heading matches what the cell now shows. Leave the column `id: 'destination'` alone — it is an
internal key, not display text.

- [ ] **Step 2: Dispatch board — render the full route**

In `dispatch-board.tsx`, add the import:

```ts
import { formatTripRoute } from '@/lib/fleet/labels'
```

Replace the `const label = …` ternary (lines 477–480) with:

```ts
                  const label = formatTripRoute(r)
```

- [ ] **Step 3: Dispatch editor — render the full route**

In `dispatch-editor-dialog.tsx`, add the import:

```ts
import { formatTripRoute } from '@/lib/fleet/labels'
```

Replace the `const label = …` ternary (lines 434–435) with:

```ts
                  const label = formatTripRoute(r)
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint 2>&1 | grep -A3 -E "requests-table|dispatch-board|dispatch-editor" || echo "clean"`
Expected: tsc exit 0; no lint findings. In particular, confirm no now-unused import remains at any of the three sites — an unused import fails the Coolify build.

- [ ] **Step 5: Verify in the browser**

With the dev server running, visit `/fleet` and `/fleet/dispatch`. Every request row reads `<pick-up> → <destination>`, e.g. `Head Office → The Long House`.

- [ ] **Step 6: Commit**

```bash
git add src/components/fleet/requests-table.tsx src/components/fleet/dispatch-board.tsx src/components/fleet/dispatch-editor-dialog.tsx
git commit -m "feat(fleet): show pick-up to destination as a route on fleet surfaces

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Show the pick-up on the driver manifest

**Files:**
- Modify: `src/lib/fleet/manifest-strings.ts`
- Modify: `src/components/fleet/driver-manifest.tsx` — `StopCard` (~line 332)

**Interfaces:**
- Consumes: origin fields on driver stops (Task 3); `formatOriginLabel` (Task 2)
- Produces: `ManifestStrings` gains a `pickUp` key

This is the point of the feature: today the driver is told where to go and never where to collect anyone.

- [ ] **Step 1: Add the string key to the interface**

In `manifest-strings.ts`, add to `interface ManifestStrings`, after `stops`:

```ts
  pickUp: string
```

- [ ] **Step 2: Add all three translations**

In each language block, after the `stops` entry:

```ts
    // en
    pickUp: 'Collect from',
```

```ts
    // si
    pickUp: 'රැගෙන යන ස්ථානය',
```

```ts
    // ta
    pickUp: 'அழைத்துச் செல்லும் இடம்',
```

SI and TA are first-pass drafts, consistent with the file's existing note and the `draftNotice` already shown to drivers. Flag both for native-speaker review when reporting completion — correcting them later is a data edit here with no component change.

- [ ] **Step 3: Render the pick-up on each stop**

In `driver-manifest.tsx`, add the import:

```ts
import { formatOriginLabel } from '@/lib/fleet/labels'
```

In `StopCard`, insert directly after the closing `</div>` of the destination block (the one containing `stop.propertyName ?? stop.label`) and before the passengers/cargo row:

```tsx
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
```

The `stop.originKind &&` guard is required: `fleetRequests` is left-joined in the stop query, so a stop whose request row was deleted has a null `originKind` and no pick-up to show.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint 2>&1 | grep -A3 -E "manifest-strings|driver-manifest" || echo "clean"`
Expected: tsc exit 0; no lint findings.

- [ ] **Step 5: Verify the manifest renders**

A driver manifest needs a real token, and `fleet_requests` is empty, so seed one trip through the UI rather than by hand:

1. With the dev server running, create a request at `/fleet` with a pick-up set. (Under `DEV_BYPASS_AUTH` the insert 500s on the fake user id — instead create it while logged in as a real user, or insert one row directly with a real `requested_by` uuid.)
2. At `/fleet/dispatch`, build and approve a dispatch containing that request.
3. Open the driver link and confirm the stop shows `Collect from: <pick-up>` above the passenger count.
4. Switch the manifest language and confirm the label changes.

If seeding a full dispatch is impractical, at minimum confirm `npx tsc --noEmit` passes and record in the completion report that the manifest was not visually verified — do not claim it was.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fleet/manifest-strings.ts src/components/fleet/driver-manifest.tsx
git commit -m "feat(fleet): show the pick-up point on the driver manifest

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npx vitest run` — the whole fleet suite passes, not just `labels.test.ts`
- [ ] `npx tsc --noEmit` — exit 0
- [ ] `npm run lint` — no **new** findings; the repo has 17 pre-existing errors in other files (`src/lib/oracle/*`, `src/lib/db/queries/surveys.ts`, and others). Compare against `git stash`-ed baseline if unsure.
- [ ] Walk the spec's ten acceptance criteria and tick each one
- [ ] Confirm `0025` is applied in Supabase **before** pushing

## Notes for the reporter

State plainly what was and was not verified. In particular: whether the driver manifest was seen rendering with a real dispatch, and that the Sinhala and Tamil wording for `pickUp` is an unreviewed draft.
