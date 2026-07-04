# Fixed Asset Registry — Plan 1: Foundation & Core Asset Management

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a usable Fixed Asset Registry — create/list/view/edit assets and rooms across properties, with straight-line depreciation and role-scoped access — everything except the dashboard charts and QR/mobile-scan flow (those are Plan 2).

**Architecture:** A feature module inside the existing Next.js 16 App Router app. New Drizzle tables (`rooms`, `assets`, `maintenance_logs`, `asset_events`) applied via a hand-written additive migration. Pure depreciation + asset-code libraries (vitest-tested). Query layer with two projections (financial vs physical-only) selected by role in the server. API routes mirror the existing excursions/menus route pattern. UI mirrors the existing area-tabs + property-scoped patterns.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Drizzle ORM + postgres.js, Supabase Postgres, Zod v4, shadcn/ui, TanStack React Table (already installed), vitest (new, for pure logic only).

## Global Constraints

- **DB driver:** always use the shared `db` from `src/lib/db` (postgres.js with `{ prepare: false }`). Never create a new client.
- **Migrations:** Drizzle migration history is broken. Hand-write `drizzle/NNNN_*.sql` using `IF NOT EXISTS` + `--> statement-breakpoint`, apply it to Supabase **before** merge. Never run `drizzle-kit generate`/`migrate`.
- **Enum values are lowercase snake_case** in the DB (e.g. `in_repair`); display labels are formatted in the UI.
- **RBAC is enforced server-side** in the guard/query layer — never rely on RLS. Staff must never receive financial fields (`purchaseCost`, `salvageValue`, NBV, accumulated depreciation) over the wire.
- **Money** is `numeric(12,2)` in Postgres → comes back as a **string** from postgres.js. Parse with `Number(...)` only inside calculation/formatting code; store/pass as string elsewhere.
- **ESLint fails the Coolify build** on unused imports/vars. Prefix intentionally-unused params with `_`. No unused imports.
- **Local `next build`/`tsc`/`lint` deadlock on the dev Mac** — do not rely on them for verification. Verify by inspection; vitest (pure logic) is the only runnable local check.
- **Timezone:** "today" for depreciation is Asia/Colombo.
- Roles: `admin` (Admin/Finance), `property_manager` (assigned-property scoped), `staff` (physical-only, financial-blind).

---

### Task 1: Add vitest for pure-logic tests

**Files:**
- Modify: `package.json` (add devDep + `test` script)
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: an `npm test` command that runs `*.test.ts` files under `src/` via vitest (node environment, no Next/Turbopack).

- [ ] **Step 1: Install vitest**

Run:
```bash
npm install -D vitest
```
Expected: `vitest` added to devDependencies.

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add the test script**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run"
```

- [ ] **Step 4: Verify the runner works (no tests yet)**

Run: `npm test`
Expected: vitest exits 0 with "No test files found" (or similar) — the runner is wired up.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(far): add vitest for pure-logic unit tests"
```

---

### Task 2: Depreciation engine (pure, TDD)

**Files:**
- Create: `src/lib/assets/depreciation.ts`
- Test: `src/lib/assets/depreciation.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface DepreciationInput {
    purchaseCost: number
    salvageValue: number
    usefulLifeYears: number
    purchaseDate: Date | string   // 'YYYY-MM-DD' or Date
  }
  export interface DepreciationResult {
    annualDepreciation: number
    monthlyDepreciation: number
    monthsActive: number
    accumulatedDepreciation: number
    netBookValue: number
  }
  export function computeDepreciation(input: DepreciationInput, asOf?: Date): DepreciationResult
  ```
- Consumed by: queries (Task 8), directory/detail/wizard UI (Tasks 12/14/15), dashboard (Plan 2).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/assets/depreciation.test.ts
import { describe, it, expect } from 'vitest'
import { computeDepreciation } from './depreciation'

const asOf = new Date('2026-07-03T00:00:00Z')

describe('computeDepreciation', () => {
  it('computes straight-line NBV partway through life', () => {
    // cost 120000, salvage 0, life 10y => annual 12000, monthly 1000
    // purchased 2026-01-03 => 6 whole months active by 2026-07-03
    const r = computeDepreciation(
      { purchaseCost: 120000, salvageValue: 0, usefulLifeYears: 10, purchaseDate: '2026-01-03' },
      asOf,
    )
    expect(r.annualDepreciation).toBe(12000)
    expect(r.monthlyDepreciation).toBe(1000)
    expect(r.monthsActive).toBe(6)
    expect(r.accumulatedDepreciation).toBe(6000)
    expect(r.netBookValue).toBe(114000)
  })

  it('respects salvage value as the NBV floor', () => {
    // cost 100000, salvage 20000, life 1y => annual 80000, monthly ~6666.67
    // 24 months elapsed (past end of life) => fully depreciated to salvage
    const r = computeDepreciation(
      { purchaseCost: 100000, salvageValue: 20000, usefulLifeYears: 1, purchaseDate: '2024-07-03' },
      asOf,
    )
    expect(r.accumulatedDepreciation).toBe(80000)
    expect(r.netBookValue).toBe(20000)
  })

  it('clamps NBV to salvage once useful life is exceeded regardless of extra time', () => {
    const r = computeDepreciation(
      { purchaseCost: 50000, salvageValue: 5000, usefulLifeYears: 2, purchaseDate: '2020-01-01' },
      asOf,
    )
    expect(r.netBookValue).toBe(5000)
    expect(r.accumulatedDepreciation).toBe(45000)
  })

  it('returns zero accumulated depreciation on the purchase date', () => {
    const r = computeDepreciation(
      { purchaseCost: 90000, salvageValue: 0, usefulLifeYears: 5, purchaseDate: '2026-07-03' },
      asOf,
    )
    expect(r.monthsActive).toBe(0)
    expect(r.accumulatedDepreciation).toBe(0)
    expect(r.netBookValue).toBe(90000)
  })

  it('guards against zero/negative useful life (treats as fully depreciated)', () => {
    const r = computeDepreciation(
      { purchaseCost: 10000, salvageValue: 1000, usefulLifeYears: 0, purchaseDate: '2026-01-01' },
      asOf,
    )
    expect(r.netBookValue).toBe(1000)
    expect(r.accumulatedDepreciation).toBe(9000)
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test`
Expected: FAIL — `computeDepreciation` is not exported / module not found.

- [ ] **Step 3: Implement the engine**

```typescript
// src/lib/assets/depreciation.ts

export interface DepreciationInput {
  purchaseCost: number
  salvageValue: number
  usefulLifeYears: number
  purchaseDate: Date | string
}

export interface DepreciationResult {
  annualDepreciation: number
  monthlyDepreciation: number
  monthsActive: number
  accumulatedDepreciation: number
  netBookValue: number
}

function toDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(`${d}T00:00:00Z`) : d
}

/** Whole calendar months between two dates (never negative). */
function wholeMonthsBetween(start: Date, end: Date): number {
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth())
  if (end.getUTCDate() < start.getUTCDate()) months -= 1
  return Math.max(0, months)
}

/**
 * Straight-line depreciation. NBV never falls below salvage; accumulated
 * depreciation never exceeds the depreciable base (cost - salvage). If the
 * asset has passed its useful life, NBV equals salvage regardless of extra time.
 */
export function computeDepreciation(
  input: DepreciationInput,
  asOf: Date = new Date(),
): DepreciationResult {
  const { purchaseCost, salvageValue, usefulLifeYears } = input
  const depreciableBase = Math.max(0, purchaseCost - salvageValue)
  const monthsActive = wholeMonthsBetween(toDate(input.purchaseDate), asOf)

  // Guard: zero/negative life => immediately fully depreciated.
  if (usefulLifeYears <= 0) {
    return {
      annualDepreciation: depreciableBase,
      monthlyDepreciation: depreciableBase,
      monthsActive,
      accumulatedDepreciation: depreciableBase,
      netBookValue: purchaseCost - depreciableBase,
    }
  }

  const annualDepreciation = depreciableBase / usefulLifeYears
  const monthlyDepreciation = annualDepreciation / 12
  const accumulatedDepreciation = Math.min(
    monthlyDepreciation * monthsActive,
    depreciableBase,
  )
  const netBookValue = purchaseCost - accumulatedDepreciation

  return {
    annualDepreciation,
    monthlyDepreciation,
    monthsActive,
    accumulatedDepreciation,
    netBookValue,
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/assets/depreciation.ts src/lib/assets/depreciation.test.ts
git commit -m "feat(far): straight-line depreciation engine"
```

---

### Task 3: Asset-code generator + enum label maps (pure, TDD)

**Files:**
- Create: `src/lib/assets/labels.ts`
- Create: `src/lib/assets/asset-code.ts`
- Test: `src/lib/assets/asset-code.test.ts`

**Interfaces:**
- Produces (labels.ts):
  ```typescript
  export const ASSET_CATEGORIES = ['ffe','machinery','kitchen','it','vehicles'] as const
  export type AssetCategory = (typeof ASSET_CATEGORIES)[number]
  export const ASSET_STATUSES = ['active','in_repair','missing','disposed'] as const
  export type AssetStatus = (typeof ASSET_STATUSES)[number]
  export const MAINTENANCE_STATUSES = ['pending','resolved'] as const
  export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]
  export function categoryLabel(c: AssetCategory): string
  export function statusLabel(s: AssetStatus): string
  export function categoryAbbr(c: AssetCategory): string   // FFE, MAC, KIT, IT, VEH
  ```
- Produces (asset-code.ts):
  ```typescript
  export function buildAssetCode(propertyCode: string, category: AssetCategory, sequence: number): string
  ```
- Consumed by: assets queries (Task 8, next-sequence lookup), wizard (Task 14).

- [ ] **Step 1: Write `labels.ts`**

```typescript
// src/lib/assets/labels.ts
export const ASSET_CATEGORIES = ['ffe', 'machinery', 'kitchen', 'it', 'vehicles'] as const
export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

export const ASSET_STATUSES = ['active', 'in_repair', 'missing', 'disposed'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

export const MAINTENANCE_STATUSES = ['pending', 'resolved'] as const
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  ffe: 'FF&E',
  machinery: 'Machinery',
  kitchen: 'Kitchen',
  it: 'IT',
  vehicles: 'Vehicles',
}
const CATEGORY_ABBR: Record<AssetCategory, string> = {
  ffe: 'FFE',
  machinery: 'MAC',
  kitchen: 'KIT',
  it: 'IT',
  vehicles: 'VEH',
}
const STATUS_LABELS: Record<AssetStatus, string> = {
  active: 'Active',
  in_repair: 'In Repair',
  missing: 'Missing',
  disposed: 'Disposed',
}

export function categoryLabel(c: AssetCategory): string {
  return CATEGORY_LABELS[c]
}
export function categoryAbbr(c: AssetCategory): string {
  return CATEGORY_ABBR[c]
}
export function statusLabel(s: AssetStatus): string {
  return STATUS_LABELS[s]
}
```

- [ ] **Step 2: Write the failing test for `asset-code.ts`**

```typescript
// src/lib/assets/asset-code.test.ts
import { describe, it, expect } from 'vitest'
import { buildAssetCode } from './asset-code'

describe('buildAssetCode', () => {
  it('builds a zero-padded code from property code, category and sequence', () => {
    expect(buildAssetCode('RAMPART', 'ffe', 1)).toBe('RAMPART-FFE-001')
    expect(buildAssetCode('MAIA', 'it', 42)).toBe('MAIA-IT-042')
  })
  it('uppercases and strips spaces from the property code', () => {
    expect(buildAssetCode('the lake house', 'kitchen', 7)).toBe('THELAKEHOUSE-KIT-007')
  })
  it('does not truncate sequences beyond 999', () => {
    expect(buildAssetCode('906', 'vehicles', 1000)).toBe('906-VEH-1000')
  })
})
```

- [ ] **Step 3: Run to confirm failure**

Run: `npm test`
Expected: FAIL — `buildAssetCode` not found.

- [ ] **Step 4: Implement `asset-code.ts`**

```typescript
// src/lib/assets/asset-code.ts
import { categoryAbbr, type AssetCategory } from './labels'

export function buildAssetCode(
  propertyCode: string,
  category: AssetCategory,
  sequence: number,
): string {
  const prefix = propertyCode.toUpperCase().replace(/\s+/g, '')
  const seq = String(sequence).padStart(3, '0')
  return `${prefix}-${categoryAbbr(category)}-${seq}`
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assets/labels.ts src/lib/assets/asset-code.ts src/lib/assets/asset-code.test.ts
git commit -m "feat(far): asset category/status labels + asset-code generator"
```

---

### Task 4: Schema — enums, tables, relations, types

**Files:**
- Modify: `src/lib/db/schema.ts` (append new section near the end, before the trailing type exports if grouped, following the file's existing ordering)

**Interfaces:**
- Produces Drizzle tables `rooms`, `assets`, `maintenanceLogs`, `assetEvents` and inferred types `Room`/`NewRoom`, `Asset`/`NewAsset`, `MaintenanceLog`/`NewMaintenanceLog`, `AssetEvent`/`NewAssetEvent`, plus enums `assetCategoryEnum`, `assetStatusEnum`, `maintenanceStatusEnum`.
- Consumed by: every query (Task 7/8) and migration (Task 5 mirrors these columns).

- [ ] **Step 1: Add the enums**

In `src/lib/db/schema.ts`, alongside the other `pgEnum` declarations near the top:
```typescript
export const assetCategoryEnum = pgEnum('asset_category', [
  'ffe', 'machinery', 'kitchen', 'it', 'vehicles',
])
export const assetStatusEnum = pgEnum('asset_status', [
  'active', 'in_repair', 'missing', 'disposed',
])
export const maintenanceStatusEnum = pgEnum('maintenance_status', [
  'pending', 'resolved',
])
```

- [ ] **Step 2: Add the `rooms` table**

Append a new section (mirroring the `excursions` block style):
```typescript
// ---------------------------------------------------------------------------
// Fixed Asset Registry
// ---------------------------------------------------------------------------
export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    floorLevel: text('floor_level'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('rooms_property_name_unique').on(t.propertyId, t.name)],
)
```
> Note: check how `unique(...)` is imported at the top of `schema.ts`. If the file uses the array-return table-extra syntax elsewhere (as menus/sops do), match it. If `unique` is not yet imported from `drizzle-orm/pg-core`, add it to that import.

- [ ] **Step 3: Add the `assets` table**

```typescript
export const assets = pgTable('assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetCode: text('asset_code').notNull().unique(),
  name: text('name').notNull(),
  category: assetCategoryEnum('category').notNull(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  purchaseDate: date('purchase_date').notNull(),
  purchaseCost: numeric('purchase_cost', { precision: 12, scale: 2 }).notNull(),
  usefulLifeYears: integer('useful_life_years').notNull(),
  salvageValue: numeric('salvage_value', { precision: 12, scale: 2 }).default('0').notNull(),
  status: assetStatusEnum('status').default('active').notNull(),
  serialNumber: text('serial_number'),
  vendorName: text('vendor_name'),
  warrantyExpiry: date('warranty_expiry'),
  imageUrl: text('image_url'),
  qrUrl: text('qr_url').unique(),
  lastAuditedAt: timestamp('last_audited_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```
> Confirm `date` and `numeric` are imported from `drizzle-orm/pg-core` at the top; add them if missing.

- [ ] **Step 4: Add `maintenanceLogs` and `assetEvents`**

```typescript
export const maintenanceLogs = pgTable('maintenance_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id, { onDelete: 'cascade' }),
  reportedBy: uuid('reported_by').references(() => profiles.id, { onDelete: 'set null' }),
  serviceDate: date('service_date'),
  issueDescription: text('issue_description').notNull(),
  repairCost: numeric('repair_cost', { precision: 12, scale: 2 }),
  resolutionStatus: maintenanceStatusEnum('resolution_status').default('pending').notNull(),
  resolvedBy: uuid('resolved_by').references(() => profiles.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const assetEvents = pgTable('asset_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(), // created | audited | moved | status_changed | repair_flagged
  detail: text('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Step 5: Add relations + inferred types**

```typescript
export const roomsRelations = relations(rooms, ({ one, many }) => ({
  property: one(properties, { fields: [rooms.propertyId], references: [properties.id] }),
  assets: many(assets),
}))

export const assetsRelations = relations(assets, ({ one, many }) => ({
  property: one(properties, { fields: [assets.propertyId], references: [properties.id] }),
  room: one(rooms, { fields: [assets.roomId], references: [rooms.id] }),
  maintenanceLogs: many(maintenanceLogs),
  events: many(assetEvents),
}))

export const maintenanceLogsRelations = relations(maintenanceLogs, ({ one }) => ({
  asset: one(assets, { fields: [maintenanceLogs.assetId], references: [assets.id] }),
}))

export const assetEventsRelations = relations(assetEvents, ({ one }) => ({
  asset: one(assets, { fields: [assetEvents.assetId], references: [assets.id] }),
}))

export type Room = typeof rooms.$inferSelect
export type NewRoom = typeof rooms.$inferInsert
export type Asset = typeof assets.$inferSelect
export type NewAsset = typeof assets.$inferInsert
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect
export type NewMaintenanceLog = typeof maintenanceLogs.$inferInsert
export type AssetEvent = typeof assetEvents.$inferSelect
export type NewAssetEvent = typeof assetEvents.$inferInsert
```

- [ ] **Step 6: Verify by inspection**

Read the appended section back. Confirm: every `references()` target exists, `properties`/`profiles` are defined earlier in the file, and all imports (`unique`, `date`, `numeric`, `integer`) are present at the top. (Local `tsc` deadlocks — do not run it.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(far): drizzle schema for rooms/assets/maintenance_logs/asset_events"
```

---

### Task 5: Migration SQL `0023` + apply to Supabase

**Files:**
- Create: `drizzle/0023_fixed_asset_registry.sql`

**Interfaces:**
- Produces: the physical tables matching Task 4's schema. No code consumes this directly, but every query fails at runtime until it's applied.

- [ ] **Step 1: Write the migration**

```sql
-- 0023_fixed_asset_registry.sql
DO $$ BEGIN
  CREATE TYPE asset_category AS ENUM ('ffe','machinery','kitchen','it','vehicles');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE asset_status AS ENUM ('active','in_repair','missing','disposed');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE maintenance_status AS ENUM ('pending','resolved');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  floor_level text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT rooms_property_name_unique UNIQUE (property_id, name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS assets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_code text NOT NULL UNIQUE,
  name text NOT NULL,
  category asset_category NOT NULL,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  purchase_date date NOT NULL,
  purchase_cost numeric(12,2) NOT NULL,
  useful_life_years integer NOT NULL,
  salvage_value numeric(12,2) DEFAULT 0 NOT NULL,
  status asset_status DEFAULT 'active' NOT NULL,
  serial_number text,
  vendor_name text,
  warranty_expiry date,
  image_url text,
  qr_url text UNIQUE,
  last_audited_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assets_property_idx ON assets(property_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assets_room_idx ON assets(room_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  reported_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  service_date date,
  issue_description text NOT NULL,
  repair_cost numeric(12,2),
  resolution_status maintenance_status DEFAULT 'pending' NOT NULL,
  resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS maintenance_logs_asset_idx ON maintenance_logs(asset_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS asset_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  detail text,
  created_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS asset_events_asset_idx ON asset_events(asset_id);
```

- [ ] **Step 2: Apply to Supabase from the dev box**

Run (uses `POSTGRES_URL` from `.env.local`, per the established idempotent-apply workflow):
```bash
node -e "const postgres=require('postgres');const fs=require('fs');require('dotenv').config({path:'.env.local'});const sql=postgres(process.env.POSTGRES_URL,{prepare:false});(async()=>{await sql.unsafe(fs.readFileSync('drizzle/0023_fixed_asset_registry.sql','utf8'));console.log('0023 applied');await sql.end()})().catch(e=>{console.error(e);process.exit(1)})"
```
Expected: prints `0023 applied`. (If `dotenv` isn't available, export `POSTGRES_URL` inline instead.)

- [ ] **Step 3: Verify the tables exist**

Run:
```bash
node -e "const postgres=require('postgres');require('dotenv').config({path:'.env.local'});const sql=postgres(process.env.POSTGRES_URL,{prepare:false});(async()=>{const r=await sql\`select table_name from information_schema.tables where table_name in ('rooms','assets','maintenance_logs','asset_events') order by 1\`;console.log(r.map(x=>x.table_name));await sql.end()})()"
```
Expected: `[ 'asset_events', 'assets', 'maintenance_logs', 'rooms' ]`.

- [ ] **Step 4: Commit**

```bash
git add drizzle/0023_fixed_asset_registry.sql
git commit -m "feat(far): migration 0023 — asset registry tables (applied to Supabase)"
```

---

### Task 6: Rooms query layer

**Files:**
- Create: `src/lib/db/queries/rooms.ts`

**Interfaces:**
- Consumes: `db`, `rooms` table, types from schema.
- Produces:
  ```typescript
  export function getRoomsForProperty(propertyId: string): Promise<Room[]>
  export function getRoomsForProperties(propertyIds: string[]): Promise<Room[]>
  export function createRoom(input: { propertyId: string; name: string; floorLevel?: string | null }): Promise<Room>
  export function updateRoom(id: string, input: { name?: string; floorLevel?: string | null }): Promise<Room | undefined>
  export function deleteRoom(id: string): Promise<void>
  ```
- Consumed by: rooms API (Task 9), wizard location step (Task 14).

- [ ] **Step 1: Implement `rooms.ts`**

```typescript
// src/lib/db/queries/rooms.ts
import { eq, inArray, asc } from 'drizzle-orm'
import { db } from '..'
import { rooms, type Room } from '../schema'

export async function getRoomsForProperty(propertyId: string): Promise<Room[]> {
  return db.select().from(rooms).where(eq(rooms.propertyId, propertyId)).orderBy(asc(rooms.name))
}

export async function getRoomsForProperties(propertyIds: string[]): Promise<Room[]> {
  if (propertyIds.length === 0) return []
  return db.select().from(rooms).where(inArray(rooms.propertyId, propertyIds)).orderBy(asc(rooms.name))
}

export async function createRoom(input: {
  propertyId: string
  name: string
  floorLevel?: string | null
}): Promise<Room> {
  const [row] = await db
    .insert(rooms)
    .values({ propertyId: input.propertyId, name: input.name, floorLevel: input.floorLevel ?? null })
    .returning()
  return row
}

export async function updateRoom(
  id: string,
  input: { name?: string; floorLevel?: string | null },
): Promise<Room | undefined> {
  const [row] = await db
    .update(rooms)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(rooms.id, id))
    .returning()
  return row
}

export async function deleteRoom(id: string): Promise<void> {
  await db.delete(rooms).where(eq(rooms.id, id))
}
```

- [ ] **Step 2: Verify by inspection** — imports resolve, `Room` type exists. Commit.

```bash
git add src/lib/db/queries/rooms.ts
git commit -m "feat(far): rooms query layer"
```

---

### Task 7: Assets query layer (financial + physical projections, events, next-sequence)

**Files:**
- Create: `src/lib/db/queries/assets.ts`

**Interfaces:**
- Consumes: `db`, `assets`/`rooms`/`properties`/`maintenanceLogs`/`assetEvents` tables, `computeDepreciation` (Task 2).
- Produces:
  ```typescript
  export interface AssetRow {            // physical fields — safe for staff
    id: string; assetCode: string; name: string; category: AssetCategory
    propertyId: string; propertyName: string; roomId: string | null; roomName: string | null
    status: AssetStatus; serialNumber: string | null; vendorName: string | null
    warrantyExpiry: string | null; imageUrl: string | null; qrUrl: string | null
    lastAuditedAt: Date | null; purchaseDate: string; createdAt: Date
  }
  export interface AssetFinancialRow extends AssetRow {
    purchaseCost: string; salvageValue: string; usefulLifeYears: number
    netBookValue: number; accumulatedDepreciation: number; annualDepreciation: number
  }
  export interface ListAssetsFilter { propertyIds: string[] | null; category?: AssetCategory; status?: AssetStatus; search?: string }
  export function listAssets(filter: ListAssetsFilter, includeFinancials: boolean): Promise<AssetRow[] | AssetFinancialRow[]>
  export function getAssetById(id: string, includeFinancials: boolean): Promise<AssetRow | AssetFinancialRow | null>
  export function getNextAssetSequence(propertyId: string, category: AssetCategory): Promise<number>
  export function createAsset(input: NewAsset): Promise<Asset>
  export function updateAsset(id: string, input: Partial<NewAsset>): Promise<Asset | undefined>
  export function deleteAsset(id: string): Promise<void>
  export function logAssetEvent(assetId: string, actorId: string | null, eventType: string, detail?: string | null): Promise<void>
  ```
- Consumed by: assets API (Task 8), directory/detail/wizard UI, Plan 2 dashboard + scan.

- [ ] **Step 1: Implement the read helpers + mapping**

```typescript
// src/lib/db/queries/assets.ts
import { eq, and, inArray, ilike, or, desc, sql } from 'drizzle-orm'
import { db } from '..'
import {
  assets, rooms, properties, assetEvents,
  type Asset, type NewAsset,
} from '../schema'
import { computeDepreciation } from '@/lib/assets/depreciation'
import type { AssetCategory, AssetStatus } from '@/lib/assets/labels'

export interface AssetRow {
  id: string
  assetCode: string
  name: string
  category: AssetCategory
  propertyId: string
  propertyName: string
  roomId: string | null
  roomName: string | null
  status: AssetStatus
  serialNumber: string | null
  vendorName: string | null
  warrantyExpiry: string | null
  imageUrl: string | null
  qrUrl: string | null
  lastAuditedAt: Date | null
  purchaseDate: string
  createdAt: Date
}
export interface AssetFinancialRow extends AssetRow {
  purchaseCost: string
  salvageValue: string
  usefulLifeYears: number
  netBookValue: number
  accumulatedDepreciation: number
  annualDepreciation: number
}
export interface ListAssetsFilter {
  propertyIds: string[] | null // null = all (admin)
  category?: AssetCategory
  status?: AssetStatus
  search?: string
}

// Colombo "today" for depreciation.
function colomboToday(): Date {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }) // YYYY-MM-DD
  return new Date(`${s}T00:00:00Z`)
}

type RawJoined = typeof assets.$inferSelect & {
  propertyName: string
  roomName: string | null
}

function toPhysical(r: RawJoined): AssetRow {
  return {
    id: r.id, assetCode: r.assetCode, name: r.name, category: r.category as AssetCategory,
    propertyId: r.propertyId, propertyName: r.propertyName, roomId: r.roomId, roomName: r.roomName,
    status: r.status as AssetStatus, serialNumber: r.serialNumber, vendorName: r.vendorName,
    warrantyExpiry: r.warrantyExpiry, imageUrl: r.imageUrl, qrUrl: r.qrUrl,
    lastAuditedAt: r.lastAuditedAt, purchaseDate: r.purchaseDate, createdAt: r.createdAt,
  }
}

function toFinancial(r: RawJoined): AssetFinancialRow {
  const dep = computeDepreciation(
    {
      purchaseCost: Number(r.purchaseCost),
      salvageValue: Number(r.salvageValue),
      usefulLifeYears: r.usefulLifeYears,
      purchaseDate: r.purchaseDate,
    },
    colomboToday(),
  )
  return {
    ...toPhysical(r),
    purchaseCost: r.purchaseCost,
    salvageValue: r.salvageValue,
    usefulLifeYears: r.usefulLifeYears,
    netBookValue: dep.netBookValue,
    accumulatedDepreciation: dep.accumulatedDepreciation,
    annualDepreciation: dep.annualDepreciation,
  }
}

function baseSelect() {
  return db
    .select({
      ...assets._.columns, // all asset columns
      propertyName: properties.name,
      roomName: rooms.name,
    })
    .from(assets)
    .innerJoin(properties, eq(assets.propertyId, properties.id))
    .leftJoin(rooms, eq(assets.roomId, rooms.id))
}
```
> If `assets._.columns` spread is awkward with the Drizzle version, list the columns explicitly in the `.select({...})` object (each `assets.<col>`). Verify against the installed Drizzle version; prefer explicit columns if unsure.

- [ ] **Step 2: Implement `listAssets` / `getAssetById`**

```typescript
export async function listAssets(
  filter: ListAssetsFilter,
  includeFinancials: boolean,
): Promise<AssetRow[] | AssetFinancialRow[]> {
  const conds = []
  if (filter.propertyIds !== null) {
    if (filter.propertyIds.length === 0) return []
    conds.push(inArray(assets.propertyId, filter.propertyIds))
  }
  if (filter.category) conds.push(eq(assets.category, filter.category))
  if (filter.status) conds.push(eq(assets.status, filter.status))
  if (filter.search) {
    const q = `%${filter.search}%`
    conds.push(or(ilike(assets.name, q), ilike(assets.assetCode, q), ilike(assets.serialNumber, q)))
  }
  const rowsRaw = await baseSelect()
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(assets.createdAt))
  const rows = rowsRaw as unknown as RawJoined[]
  return includeFinancials ? rows.map(toFinancial) : rows.map(toPhysical)
}

export async function getAssetById(
  id: string,
  includeFinancials: boolean,
): Promise<AssetRow | AssetFinancialRow | null> {
  const rowsRaw = await baseSelect().where(eq(assets.id, id)).limit(1)
  const rows = rowsRaw as unknown as RawJoined[]
  if (!rows[0]) return null
  return includeFinancials ? toFinancial(rows[0]) : toPhysical(rows[0])
}
```

- [ ] **Step 3: Implement mutations + sequence + events**

```typescript
export async function getNextAssetSequence(
  propertyId: string,
  category: AssetCategory,
): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assets)
    .where(and(eq(assets.propertyId, propertyId), eq(assets.category, category)))
  return Number(count) + 1
}

export async function createAsset(input: NewAsset): Promise<Asset> {
  const [row] = await db.insert(assets).values(input).returning()
  return row
}

export async function updateAsset(id: string, input: Partial<NewAsset>): Promise<Asset | undefined> {
  const [row] = await db
    .update(assets)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(assets.id, id))
    .returning()
  return row
}

export async function deleteAsset(id: string): Promise<void> {
  await db.delete(assets).where(eq(assets.id, id))
}

export async function logAssetEvent(
  assetId: string,
  actorId: string | null,
  eventType: string,
  detail: string | null = null,
): Promise<void> {
  await db.insert(assetEvents).values({ assetId, actorId, eventType, detail })
}
```

- [ ] **Step 4: Verify by inspection** — every imported symbol exists; `RawJoined` matches the select shape. Commit.

```bash
git add src/lib/db/queries/assets.ts
git commit -m "feat(far): assets query layer with financial/physical projections"
```

---

### Task 8: Rooms API routes

**Files:**
- Create: `src/app/api/assets/rooms/route.ts` (GET list by property, POST create)
- Create: `src/app/api/assets/rooms/[id]/route.ts` (PATCH, DELETE)

**Interfaces:**
- Consumes: `getProfile`, `getUserProperties`, rooms queries (Task 6). Mirrors the excursions route auth/`checkPropertyAccess` pattern (read at `src/app/api/excursions/route.ts`).
- Produces: JSON REST for rooms. Admin + PM (scoped) only; staff 403.

- [ ] **Step 1: Implement `rooms/route.ts`**

```typescript
// src/app/api/assets/rooms/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getRoomsForProperty, createRoom } from '@/lib/db/queries/rooms'

const createSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1).max(200),
  floorLevel: z.string().max(100).nullable().optional(),
})

async function canWrite(profile: { id: string; role: string }, propertyId: string) {
  if (profile.role === 'admin') return true
  if (profile.role !== 'property_manager') return false
  const props = await getUserProperties(profile.id, profile.role as 'property_manager')
  return !props || props.includes(propertyId)
}

export async function GET(request: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  const propertyId = request.nextUrl.searchParams.get('propertyId')
  if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
  // staff may read rooms (needed for the scan "Move Location" dropdown in Plan 2)
  const rooms = await getRoomsForProperty(propertyId)
  return NextResponse.json({ rooms })
}

export async function POST(request: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  if (!(await canWrite(profile, parsed.data.propertyId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const room = await createRoom(parsed.data)
    return NextResponse.json({ room }, { status: 201 })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505')
      return NextResponse.json({ error: 'A room with that name already exists' }, { status: 409 })
    throw e
  }
}
```

- [ ] **Step 2: Implement `rooms/[id]/route.ts`** (PATCH name/floor, DELETE). Mirror the `canWrite` guard; look up the room's `propertyId` first (add a `getRoomById` to `rooms.ts` if needed, or accept `propertyId` in the body for the access check). Use the same 409-on-`23505` handling for PATCH.

```typescript
// src/app/api/assets/rooms/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { updateRoom, deleteRoom } from '@/lib/db/queries/rooms'

const patchSchema = z.object({
  propertyId: z.string().uuid(), // for the access check
  name: z.string().min(1).max(200).optional(),
  floorLevel: z.string().max(100).nullable().optional(),
})

async function canWrite(profile: { id: string; role: string }, propertyId: string) {
  if (profile.role === 'admin') return true
  if (profile.role !== 'property_manager') return false
  const props = await getUserProperties(profile.id, profile.role as 'property_manager')
  return !props || props.includes(propertyId)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  if (!(await canWrite(profile, parsed.data.propertyId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name, floorLevel } = parsed.data
  const room = await updateRoom(id, { name, floorLevel })
  return NextResponse.json({ room })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role === 'staff') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await deleteRoom(id)
  return NextResponse.json({ ok: true })
}
```
> Note: Next.js 16 route handlers receive `params` as a Promise — always `await params`. Confirm against an existing `[id]` route in this repo.

- [ ] **Step 3: Verify by inspection.** Commit.

```bash
git add src/app/api/assets/rooms
git commit -m "feat(far): rooms API routes"
```

---

### Task 9: Assets API routes (list/create + [id] get/patch/delete) with RBAC

**Files:**
- Create: `src/app/api/assets/route.ts`
- Create: `src/app/api/assets/[id]/route.ts`

**Interfaces:**
- Consumes: assets queries (Task 7), asset-code builder (Task 3), `getUserProperties`, `getProfile`.
- Produces: REST for assets. `includeFinancials = role !== 'staff'`. On create, generate `assetCode` (if not supplied) via `buildAssetCode(propertyCode, category, getNextAssetSequence(...))`, generate `id` app-side, set `qrUrl = ${APP_URL}/scan/asset/${id}`, and `logAssetEvent(id, actor, 'created')`.

- [ ] **Step 1: Implement `assets/route.ts` (GET list, POST create)**

```typescript
// src/app/api/assets/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  listAssets, createAsset, getNextAssetSequence, logAssetEvent,
} from '@/lib/db/queries/assets'
import { buildAssetCode } from '@/lib/assets/asset-code'
import { ASSET_CATEGORIES, ASSET_STATUSES } from '@/lib/assets/labels'
import { getPropertyById } from '@/lib/db/queries/properties'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tvpl.morpheusds.com'

const createSchema = z.object({
  name: z.string().min(1).max(300),
  category: z.enum(ASSET_CATEGORIES),
  propertyId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
  purchaseDate: z.string(), // YYYY-MM-DD
  purchaseCost: z.string(), // numeric as string
  usefulLifeYears: z.number().int().positive(),
  salvageValue: z.string().default('0'),
  serialNumber: z.string().max(200).nullable().optional(),
  vendorName: z.string().max(300).nullable().optional(),
  warrantyExpiry: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  assetCode: z.string().max(100).optional(), // optional override
})

async function accessiblePropertyIds(profile: { id: string; role: string }) {
  return getUserProperties(profile.id, profile.role as 'admin' | 'property_manager' | 'staff')
}

export async function GET(request: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const propertyIds = await accessiblePropertyIds(profile) // null = all (admin)
  const category = sp.get('category')
  const status = sp.get('status')
  const search = sp.get('search') ?? undefined
  const includeFinancials = profile.role !== 'staff'
  const rows = await listAssets(
    {
      propertyIds,
      category: category && ASSET_CATEGORIES.includes(category as never) ? (category as never) : undefined,
      status: status && ASSET_STATUSES.includes(status as never) ? (status as never) : undefined,
      search,
    },
    includeFinancials,
  )
  return NextResponse.json({ assets: rows })
}

export async function POST(request: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role === 'staff') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const data = parsed.data

  // PM scope check
  if (profile.role === 'property_manager') {
    const props = await accessiblePropertyIds(profile)
    if (props && !props.includes(data.propertyId))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const id = randomUUID()
  let assetCode = data.assetCode
  if (!assetCode) {
    const property = await getPropertyById(data.propertyId)
    if (!property) return NextResponse.json({ error: 'Unknown property' }, { status: 400 })
    const seq = await getNextAssetSequence(data.propertyId, data.category)
    assetCode = buildAssetCode(property.code, data.category, seq)
  }

  try {
    await createAsset({
      id,
      assetCode,
      name: data.name,
      category: data.category,
      propertyId: data.propertyId,
      roomId: data.roomId ?? null,
      purchaseDate: data.purchaseDate,
      purchaseCost: data.purchaseCost,
      usefulLifeYears: data.usefulLifeYears,
      salvageValue: data.salvageValue,
      serialNumber: data.serialNumber ?? null,
      vendorName: data.vendorName ?? null,
      warrantyExpiry: data.warrantyExpiry ?? null,
      imageUrl: data.imageUrl ?? null,
      qrUrl: `${APP_URL}/scan/asset/${id}`,
      createdBy: profile.id,
    })
    await logAssetEvent(id, profile.id, 'created')
    return NextResponse.json({ id, assetCode }, { status: 201 })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505')
      return NextResponse.json({ error: 'Asset code already exists' }, { status: 409 })
    throw e
  }
}
```
> `getPropertyById` — confirm it exists in `src/lib/db/queries/properties.ts`; if not, add a small `getPropertyById(id)` there.

- [ ] **Step 2: Implement `assets/[id]/route.ts` (GET, PATCH, DELETE)**

Key RBAC rules to enforce in PATCH:
- staff → 403 (cannot edit via this route; their mutations are the scan actions in Plan 2).
- property_manager → allowed only for assets in their assigned properties, and **`purchaseCost` and `usefulLifeYears` are stripped** from the update payload.
- admin → full edit.

```typescript
// src/app/api/assets/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getAssetById, updateAsset, deleteAsset, logAssetEvent } from '@/lib/db/queries/assets'
import { ASSET_CATEGORIES, ASSET_STATUSES } from '@/lib/assets/labels'

const patchSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  category: z.enum(ASSET_CATEGORIES).optional(),
  roomId: z.string().uuid().nullable().optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  serialNumber: z.string().max(200).nullable().optional(),
  vendorName: z.string().max(300).nullable().optional(),
  warrantyExpiry: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  purchaseDate: z.string().optional(),
  salvageValue: z.string().optional(),
  // admin-only fields:
  purchaseCost: z.string().optional(),
  usefulLifeYears: z.number().int().positive().optional(),
})

async function loadAndAuthorize(profile: { id: string; role: string }, id: string) {
  const includeFinancials = profile.role !== 'staff'
  const asset = await getAssetById(id, includeFinancials)
  if (!asset) return { asset: null as const }
  if (profile.role === 'property_manager') {
    const props = await getUserProperties(profile.id, 'property_manager')
    if (props && !props.includes(asset.propertyId)) return { asset: null as const, forbidden: true }
  }
  return { asset }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { asset, forbidden } = await loadAndAuthorize(profile, id)
  if (forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ asset })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role === 'staff') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { asset, forbidden } = await loadAndAuthorize(profile, id)
  if (forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const update = { ...parsed.data }
  if (profile.role === 'property_manager') {
    delete update.purchaseCost
    delete update.usefulLifeYears
  }
  const updated = await updateAsset(id, update)
  return NextResponse.json({ asset: updated })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await deleteAsset(id) // asset_events + maintenance_logs cascade-delete with the asset
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Manual smoke test (dev server)**

Start `npm run dev`. With `DEV_BYPASS_AUTH=true` (admin), exercise:
```bash
# create
curl -sX POST localhost:3000/api/assets -H 'content-type: application/json' \
  -d '{"name":"Teak Four-Poster Bed","category":"ffe","propertyId":"<REAL_PROPERTY_UUID>","purchaseDate":"2026-01-03","purchaseCost":"120000.00","usefulLifeYears":10,"salvageValue":"0"}'
# list
curl -s 'localhost:3000/api/assets' | head
```
Expected: create returns `{id, assetCode:"<CODE>-FFE-001"}`; list returns the asset with `netBookValue` present.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/assets/route.ts src/app/api/assets/[id]/route.ts
git commit -m "feat(far): assets REST API with role-scoped financial projection"
```

---

### Task 10: Sidebar nav + `/assets` area shell + tabs

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx` (add "Asset Registry" to `mainNavItems`; import a `Boxes` or `Package` icon from lucide-react)
- Create: `src/components/assets/assets-area-tabs.tsx`
- Create: `src/app/(portal)/assets/layout.tsx` (renders heading + tabs + children)
- Create: `src/app/(portal)/assets/page.tsx` (redirect to `/assets/directory`)

**Interfaces:**
- Consumes: `useAuth` provider (as `surveys-area-tabs.tsx` does).
- Produces: the `/assets` shell with tabs Directory (all) · Rooms (admin+PM) · Dashboard (admin+PM, wired in Plan 2) · Scan (all, wired in Plan 2).

- [ ] **Step 1: Add the sidebar item.** In `app-sidebar.tsx`, add to `mainNavItems` (after Daily Wastage):
```typescript
{ title: 'Asset Registry', href: '/assets', icon: Package },
```
Add `Package` to the `lucide-react` import. Leave it visible to all authenticated roles (staff need it).

- [ ] **Step 2: Create `assets-area-tabs.tsx`** (mirror `surveys-area-tabs.tsx`):
```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/providers/auth-provider'

interface Tab { label: string; href: string; match: (p: string) => boolean; roles?: string[] }

const tabs: Tab[] = [
  { label: 'Dashboard', href: '/assets/dashboard', match: (p) => p.startsWith('/assets/dashboard'), roles: ['admin', 'property_manager'] },
  { label: 'Directory', href: '/assets/directory', match: (p) => p.startsWith('/assets/directory') },
  { label: 'Rooms', href: '/assets/rooms', match: (p) => p.startsWith('/assets/rooms'), roles: ['admin', 'property_manager'] },
  { label: 'Scan', href: '/assets/scan', match: (p) => p.startsWith('/assets/scan') },
]

export function AssetsAreaTabs() {
  const pathname = usePathname()
  const { profile } = useAuth()
  const visible = tabs.filter((t) => !t.roles || t.roles.includes(profile.role))
  if (visible.length <= 1) return null
  return (
    <nav aria-label="Asset registry sections" className="inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground">
      {visible.map((tab) => {
        const active = tab.match(pathname)
        return (
          <Link key={tab.href} href={tab.href}
            className={cn('inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium transition-colors',
              active ? 'bg-background text-foreground shadow' : 'hover:text-foreground')}>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 3: Create `layout.tsx`** for `/assets` — server component; guard with `requireAuth()`, render a page title, `<AssetsAreaTabs />`, and `{children}`. Mirror an existing area layout (e.g. `src/app/(portal)/surveys/layout.tsx` if present; otherwise a simple `div` wrapper).

- [ ] **Step 4: Create `page.tsx`** — `import { redirect } from 'next/navigation'; export default function Page(){ redirect('/assets/directory') }`.

- [ ] **Step 5: Manual check** — `npm run dev`, visit `/assets` → redirects to `/assets/directory` (will 404 until Task 11) and the sidebar shows "Asset Registry". Commit.

```bash
git add src/components/layout/app-sidebar.tsx src/components/assets/assets-area-tabs.tsx "src/app/(portal)/assets/layout.tsx" "src/app/(portal)/assets/page.tsx"
git commit -m "feat(far): assets area shell, tabs and sidebar nav"
```

---

### Task 11: Asset Directory (server page + TanStack table client)

**Files:**
- Create: `src/app/(portal)/assets/directory/page.tsx` (RSC — loads assets + properties server-side)
- Create: `src/components/assets/asset-directory.tsx` (client — TanStack table, search, filters, sort)
- Create: `src/lib/assets/csv.ts` (pure CSV builder)
- Test: `src/lib/assets/csv.test.ts`

**Interfaces:**
- Consumes: `listAssets` (Task 7), `getPropertiesForUser`/`getProperties`, `AssetRow`/`AssetFinancialRow`.
- Produces: the directory view. Financial columns (NBV, cost) only render when `showFinancials` (role !== staff).

- [ ] **Step 1: CSV builder — failing test**
```typescript
// src/lib/assets/csv.test.ts
import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('joins headers and rows and escapes commas/quotes', () => {
    const csv = toCsv(
      ['Code', 'Name'],
      [['A-1', 'Bed, teak'], ['A-2', 'Chair "oak"']],
    )
    expect(csv).toBe('Code,Name\r\n"A-1","Bed, teak"\r\n"A-2","Chair ""oak"""')
  })
})
```
- [ ] **Step 2: Run → FAIL.** `npm test`
- [ ] **Step 3: Implement `csv.ts`**
```typescript
// src/lib/assets/csv.ts
function cell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const head = headers.join(',')
  const body = rows.map((r) => r.map(cell).join(',')).join('\r\n')
  return body ? `${head}\r\n${body}` : head
}
```
- [ ] **Step 4: Run → PASS.** `npm test`

- [ ] **Step 5: Build the server page** `directory/page.tsx`:
  - `const profile = await requireAuth()`; compute `propertyIds = await getUserProperties(profile.id, profile.role)`.
  - `const showFinancials = profile.role !== 'staff'`.
  - `const assets = await listAssets({ propertyIds }, showFinancials)`.
  - Load properties for the filter dropdown (`getPropertiesForUser(profile.id)` for non-admins, `getProperties(profile.orgId)` for admin).
  - `export const dynamic = 'force-dynamic'`.
  - Render `<AssetDirectory assets={assets} properties={...} showFinancials={showFinancials} canCreate={profile.role !== 'staff'} />`.

- [ ] **Step 6: Build `asset-directory.tsx`** (client) using `@tanstack/react-table` + shadcn `Table`, `Input` (search), `Select` (category/status/property filters), and a "Add Asset" button (→ `/assets/directory/new`, gated by `canCreate`). Columns: Code, Name, Category (`categoryLabel`), Property, Room, Status (badge via `statusLabel`), Purchase Date; plus NBV + Purchase Cost **only when `showFinancials`**. Wire an "Export CSV" button that builds a Blob from `toCsv(headers, rows)` of the current filtered view and triggers download (financial columns only when `showFinancials`). Reference the existing survey/tasks table components for the project's TanStack setup conventions.

- [ ] **Step 7: Manual check** — visit `/assets/directory` as admin (via DEV_BYPASS): rows show with NBV; filters/search/sort work; CSV downloads. Commit.

```bash
git add src/lib/assets/csv.ts src/lib/assets/csv.test.ts "src/app/(portal)/assets/directory/page.tsx" src/components/assets/asset-directory.tsx
git commit -m "feat(far): asset directory table with search/filter/sort/CSV"
```

---

### Task 12: Add / Edit Asset wizard (3-step)

**Files:**
- Create: `src/app/(portal)/assets/directory/new/page.tsx` (RSC — loads properties + their rooms for the current user)
- Create: `src/app/(portal)/assets/[id]/edit/page.tsx` (RSC — loads the asset + properties/rooms)
- Create: `src/components/assets/asset-form.tsx` (client — 3-step form, shared by create + edit)

**Interfaces:**
- Consumes: `POST /api/assets`, `PATCH /api/assets/[id]`, `GET /api/assets/rooms?propertyId=`, `computeDepreciation`, `buildAssetCode`, `getNextAssetSequence` (indirectly, server suggests code on create — or the client previews it), label maps.
- Produces: the create + edit UX.

- [ ] **Step 1: Build `asset-form.tsx`** with React Hook Form + Zod, three sections rendered as steps (General → Location → Financials):
  - **General:** name, category (`Select` over `ASSET_CATEGORIES` w/ `categoryLabel`), image URL, serial number.
  - **Location:** property `Select` (from props). On property change, fetch `GET /api/assets/rooms?propertyId=` and populate the room `Select` (cascading; room optional).
  - **Financials:** purchase date, purchase cost, useful life years, salvage value. Show a **live "Annual depreciation" preview** = `computeDepreciation({...}).annualDepreciation` formatted LKR, recomputed as fields change. In **edit mode for a `property_manager`**, disable `purchaseCost` and `usefulLifeYears` inputs (read-only) — mirror the server rule.
  - Asset code field: show an auto-suggested, editable input. On create, suggest client-side as `${propertyCode}-${categoryAbbr}-${'###'}` placeholder and let the server assign the real sequence if left blank (send `assetCode` only if the user edited it).
  - Submit: create → `POST /api/assets` then `router.push('/assets/directory')`; edit → `PATCH /api/assets/[id]`.
- [ ] **Step 2: Build the two page wrappers** (`new/page.tsx`, `[id]/edit/page.tsx`) — `requireRole(['admin','property_manager'])`, load properties (+ rooms optionally prefetched), pass to `<AssetForm mode=... />`. Edit page also loads the asset via `getAssetById(id, true)` and passes `initial`.
- [ ] **Step 3: Manual check** — create an asset end-to-end; annual-depreciation preview updates; cascading rooms work; edit as admin changes cost, as PM the cost field is disabled. Commit.

```bash
git add "src/app/(portal)/assets/directory/new/page.tsx" "src/app/(portal)/assets/[id]/edit/page.tsx" src/components/assets/asset-form.tsx
git commit -m "feat(far): 3-step add/edit asset wizard with depreciation preview"
```

---

### Task 13: Asset detail page

**Files:**
- Create: `src/app/(portal)/assets/[id]/page.tsx` (RSC)
- Create: `src/components/assets/asset-detail.tsx` (client/server split as needed)

**Interfaces:**
- Consumes: `getAssetById(id, showFinancials)`, `getMaintenanceLogsForAsset` (add to `assets.ts` or a small `maintenance.ts` query — `SELECT * FROM maintenance_logs WHERE asset_id = ? ORDER BY created_at DESC`).
- Produces: full record view: image, all physical fields, financial block (admin/PM only: purchase cost, salvage, useful life, annual/accumulated depreciation, **NBV**), a maintenance-history list, and Edit / Delete (delete admin-only) actions. The QR label block is added in Plan 2.

- [ ] **Step 1: Add `getMaintenanceLogsForAsset(assetId)` to the query layer** (new file `src/lib/db/queries/maintenance.ts`, joining `profiles` for the reporter name).
- [ ] **Step 2: Build the detail page** — `requireAuth()`, `showFinancials = role !== 'staff'`, PM/asset property access check (redirect to `/assets/directory` if out of scope), render `<AssetDetail asset={...} logs={...} showFinancials={...} canEdit={role!=='staff'} canDelete={role==='admin'} />`.
- [ ] **Step 3: Manual check** — open an asset as admin (financials + NBV visible) and simulate staff (`DEV_BYPASS` is admin; verify staff path by reading the code / temporarily returning a staff profile) → financial block absent. Commit.

```bash
git add "src/app/(portal)/assets/[id]/page.tsx" src/components/assets/asset-detail.tsx src/lib/db/queries/maintenance.ts
git commit -m "feat(far): asset detail page with maintenance history"
```

---

### Task 14: Rooms manager page

**Files:**
- Create: `src/app/(portal)/assets/rooms/page.tsx` (RSC — admin+PM)
- Create: `src/components/assets/rooms-manager.tsx` (client)

**Interfaces:**
- Consumes: rooms API (Task 8), `getRoomsForProperties`, properties for the current user.
- Produces: per-property room CRUD UI.

- [ ] **Step 1: Build the page** — `requireRole(['admin','property_manager'])`; load the user's properties + `getRoomsForProperties(propertyIds or all)`; pass to the client.
- [ ] **Step 2: Build `rooms-manager.tsx`** — a property `Select`, a list of that property's rooms, an "Add room" inline form (name + floor level) → `POST /api/assets/rooms`, edit (PATCH) and delete (DELETE) per row. Handle the 409 duplicate-name error with an inline message.
- [ ] **Step 3: Manual check** — add/rename/delete a room; duplicate name shows the 409 message. Commit.

```bash
git add "src/app/(portal)/assets/rooms/page.tsx" src/components/assets/rooms-manager.tsx
git commit -m "feat(far): rooms manager UI"
```

---

### Task 15: Wire env + docs

**Files:**
- Modify: `.env.local` (dev), and note for Coolify: `NEXT_PUBLIC_APP_URL`
- Modify: `CLAUDE.md` (add `NEXT_PUBLIC_APP_URL` to the env section + a one-line FAR entry under features)

**Interfaces:** none (documentation/config).

- [ ] **Step 1:** Add `NEXT_PUBLIC_APP_URL="https://tvpl.morpheusds.com"` to `.env.local` (and `http://localhost:3000` is fine for local dev). Document that it must be set in Coolify (build-time, since it's `NEXT_PUBLIC_*`) so generated `qrUrl`s are correct.
- [ ] **Step 2:** Add a short FAR line to CLAUDE.md's feature notes and the env var to the env list.
- [ ] **Step 3: Commit.**
```bash
git add CLAUDE.md
git commit -m "docs(far): document NEXT_PUBLIC_APP_URL and FAR feature"
```

---

## Self-Review (author's check against the spec)

- **Spec §4 data model** → Tasks 4 (schema) + 5 (migration). ✓ All columns present; `roomId` nullable; asset owns `propertyId`.
- **Spec §5 depreciation** → Task 2, all edge cases (salvage floor, past-life clamp, zero-life guard, purchase-date zero). ✓
- **Spec §7 RBAC** → financial projection split in Task 7; staff 403 on write + no financial fields (Tasks 9, 11, 13); PM `purchaseCost`/`usefulLifeYears` stripped (Task 9) + disabled in UI (Task 12). ✓
- **Spec §8 IA** → nav + tabs (Task 10), directory w/ search/filter/sort/CSV (Task 11), add/edit wizard w/ cascading rooms + dep preview (Task 12), detail (Task 13), rooms manager (Task 14). ✓
- **Spec §3 asset code** auto-but-editable → Task 3 + Task 9 (server assigns sequence, accepts override). ✓
- **Deferred to Plan 2:** Dashboard tab (charts/KPIs/feed), QR label generation, camera scan page, `/scan/asset/[id]` quick-view + Verify/Move/Flag actions, maintenance resolve. The `assetEvents` table + `logAssetEvent` and `maintenance_logs` table are created here so Plan 2 only wires UI/actions.
- **Placeholder scan:** none — pure-logic tasks carry full test+impl code; boilerplate tasks name the exact existing pattern file to mirror.
- **Type consistency:** `AssetRow`/`AssetFinancialRow`, `computeDepreciation` signature, `buildAssetCode`, label maps used consistently across Tasks 7/9/11/12/13. ✓

## Notes for the executor
- Verify Next.js 16 route-handler `params` are awaited (`await params`) against an existing `[id]` route before copying.
- If the `.select({ ...assets._.columns })` spread misbehaves on the installed Drizzle version, enumerate columns explicitly — this is the single most likely friction point.
- Do not run `next build`/`tsc`/`lint` locally (they deadlock). `npm test` (vitest) is the only local automated check; everything else is dev-server smoke + inspection.
