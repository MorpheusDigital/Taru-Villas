# Fleet & Visit Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visit scheduler and fleet dispatch module in the Taru Villas portal — executives raise trip requests, a nightly rules-based engine pools them into vehicle dispatches, a fleet admin approves, and drivers get a tokenised trilingual manifest with Web Push notifications.

**Architecture:** A feature module inside the existing Next.js 16 App Router app. All allocation logic lives in pure, unit-tested functions under `src/lib/fleet/` with zero database access; the database layer, API routes and UI are thin wrappers around them. Drivers are not portal users — they authenticate by a 22-char URL token, the same pattern as guest survey links.

**Tech Stack:** Next.js 16.1.6 (App Router, React 19), Drizzle ORM + Supabase Postgres via postgres.js, Zod v4, shadcn/ui + Tailwind 4, React Hook Form, nuqs, sonner, lucide-react, vitest, `web-push` (new).

**Source spec:** `docs/superpowers/specs/2026-07-26-fleet-visit-command-design.md`

## Global Constraints

- **Postgres client**: never change `{ prepare: false }` in `src/lib/db/index.ts` — PgBouncer breaks prepared statements.
- **Zod**: import from `zod` (matching neighbouring routes). Never use `.url()` on URL fields. Coerce nullable arrays to `[]` before passing to Drizzle.
- **Route params**: Next.js 16 requires `const { id } = await context.params`.
- **Every `page.tsx` that fetches data** must have `export const dynamic = 'force-dynamic'`.
- **Auth**: pages use `requireAuth()` / `requireRole()`; API routes use `getProfile()` and return `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })` on null.
- **All mutations** (insert, update, delete) use `.returning()`.
- **Migrations**: Drizzle's migration history is broken in this repo. Hand-write `drizzle/0024_fleet_command.sql` and apply it via the Supabase SQL editor. **Apply the migration BEFORE merging to `main`** — Coolify deploys on merge, and code hitting missing tables crashes the app.
- **Lint**: ESLint `no-unused-vars` fails the Coolify build. No unused imports or variables, ever.
- **Local builds**: `npm run build` hangs on macOS. Use `npx tsc --noEmit` and `npm run test` locally; Coolify's Linux build is authoritative.
- **Exact user-facing error string**, required verbatim by the brief: `Lorry cargo transport standard limits maximum passenger count to 1.`
- **Enum values** are lowercase snake_case in the database, display-formatted in the UI.
- **Timezone**: all date-window arithmetic is in Asia/Colombo. Request windows are `date` columns (no time component). Never use bare `new Date()` on a `YYYY-MM-DD` string — always `new Date(\`${d}T00:00:00Z\`)`.
- **Deploy**: push to `main` (Coolify). Do not run `npx vercel deploy`.

---

## File Structure

**New pure logic** (no DB access, unit-tested):
- `src/lib/fleet/types.ts` — shared engine types
- `src/lib/fleet/dates.ts` — string-based date helpers (`addDays`, `windowsOverlap`, `formatDayMonth`)
- `src/lib/fleet/distance.ts` — distance index + lookup
- `src/lib/fleet/constraints.ts` — request validation + vehicle/driver eligibility
- `src/lib/fleet/engine.ts` — `planDispatches()`, the pooling engine
- `src/lib/fleet/manifest-strings.ts` — EN/SI/TA string map
- `src/lib/fleet/push.ts` — `web-push` wrapper (impure, thin)

**Database:**
- `drizzle/0024_fleet_command.sql` — hand-written migration
- `src/lib/db/schema.ts` — MODIFY: 5 enums, 10 tables, relations, 3 `profiles` columns
- `src/lib/db/queries/fleet.ts` — vehicles, drivers, eligibility, distances, settings
- `src/lib/db/queries/dispatches.ts` — requests, dispatches, stops
- `src/lib/db/queries/notifications.ts` — notifications + push subscriptions

**API:**
- `src/app/api/fleet/vehicles/route.ts` + `[id]/route.ts`
- `src/app/api/fleet/drivers/route.ts` + `[id]/route.ts`
- `src/app/api/fleet/distances/route.ts`
- `src/app/api/fleet/settings/route.ts`
- `src/app/api/fleet/requests/route.ts` + `[id]/route.ts`
- `src/app/api/fleet/dispatches/route.ts` + `[id]/route.ts` + `run-engine/route.ts`
- `src/app/api/fleet/driver/[token]/route.ts` + `status/route.ts` + `push/route.ts`
- `src/app/api/cron/fleet-optimize/route.ts`

**Pages:**
- `src/app/(portal)/fleet/page.tsx` + `dispatch/page.tsx`
- `src/app/(portal)/admin/fleet/vehicles/page.tsx` + `drivers/page.tsx` + `distances/page.tsx`
- `src/app/(public)/d/[token]/page.tsx`

**Components:** `src/components/fleet/` — `request-form.tsx`, `requests-table.tsx`, `dispatch-board.tsx`, `dispatch-editor-dialog.tsx`, `vehicles-client.tsx`, `drivers-client.tsx`, `distances-grid.tsx`, `driver-manifest.tsx`, `push-setup-banner.tsx`

**Wiring:** `public/sw.js`, `src/middleware.ts`, `src/components/layout/app-sidebar.tsx`, `src/components/layout/header.tsx`, `src/lib/auth/guards.ts`

---

## Task 1: Database schema and migration

**Files:**
- Create: `drizzle/0024_fleet_command.sql`
- Modify: `src/lib/db/schema.ts` (append at end of file)
- Modify: `src/lib/auth/guards.ts:31-49` (dev-bypass mock profile)

**Interfaces:**
- Consumes: nothing
- Produces: Drizzle tables `vehicles`, `drivers`, `driverVehicles`, `propertyDistances`, `fleetSettings`, `fleetRequests`, `dispatches`, `dispatchStops`, `pushSubscriptions`, `notifications`; types `Vehicle`, `NewVehicle`, `Driver`, `NewDriver`, `FleetRequest`, `NewFleetRequest`, `Dispatch`, `NewDispatch`, `DispatchStop`, `NewDispatchStop`, `PushSubscription`, `Notification`; `profiles.isFleetAdmin`, `profiles.canBookFleet`, `profiles.canUseRestrictedVehicles`

- [ ] **Step 1: Write the migration SQL**

Create `drizzle/0024_fleet_command.sql`. Follow the `0023` style exactly — `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;` for enums, `CREATE TABLE IF NOT EXISTS`, and `--> statement-breakpoint` between statements.

```sql
-- 0024_fleet_command.sql
DO $$ BEGIN
  CREATE TYPE fleet_request_type AS ENUM ('visit','standalone');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE fleet_request_status AS ENUM ('pending','queued','dispatched','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE dispatch_status AS ENUM ('draft','approved','in_progress','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE vehicle_status AS ENUM ('active','maintenance','retired');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE driver_language AS ENUM ('en','si','ta');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  name varchar(255) NOT NULL,
  registration_no varchar(50),
  max_passengers integer NOT NULL,
  cargo_capable boolean DEFAULT false NOT NULL,
  is_restricted boolean DEFAULT false NOT NULL,
  status vehicle_status DEFAULT 'active' NOT NULL,
  current_location_property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT vehicles_org_name_unique UNIQUE (org_id, name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS drivers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  full_name text NOT NULL,
  phone varchar(50),
  preferred_language driver_language DEFAULT 'en' NOT NULL,
  access_token varchar(32) NOT NULL UNIQUE,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS driver_vehicles (
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  CONSTRAINT driver_vehicles_pk UNIQUE (driver_id, vehicle_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS property_distances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  from_property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  to_property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  distance_km numeric(6,1) NOT NULL,
  drive_minutes integer,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT property_distances_pair_unique
    UNIQUE NULLS NOT DISTINCT (org_id, from_property_id, to_property_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS fleet_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
  pooling_threshold_km numeric(6,1) DEFAULT 40.0 NOT NULL,
  planning_horizon_days integer DEFAULT 14 NOT NULL,
  engine_enabled boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS fleet_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  request_type fleet_request_type NOT NULL,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  target_property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  origin_text text,
  destination_text text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  pax_count integer DEFAULT 1 NOT NULL,
  cargo_required boolean DEFAULT false NOT NULL,
  purpose text,
  notes text,
  status fleet_request_status DEFAULT 'pending' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fleet_requests_status_idx ON fleet_requests(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fleet_requests_requested_by_idx ON fleet_requests(requested_by);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS dispatches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status dispatch_status DEFAULT 'draft' NOT NULL,
  generated_by varchar(16) DEFAULT 'engine' NOT NULL,
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  dispatched_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS dispatches_status_idx ON dispatches(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS dispatches_driver_idx ON dispatches(driver_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS dispatch_stops (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_id uuid NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  request_id uuid REFERENCES fleet_requests(id) ON DELETE SET NULL,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  label text,
  sort_order integer DEFAULT 0 NOT NULL,
  arrived_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS dispatch_stops_dispatch_idx ON dispatch_stops(dispatch_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL,
  last_seen_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT push_subscriptions_one_owner CHECK (num_nonnulls(profile_id, driver_id) = 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE,
  type varchar(50) NOT NULL,
  title text NOT NULL,
  body text,
  link_url text,
  channel varchar(16) DEFAULT 'in_app' NOT NULL,
  sent_at timestamptz,
  read_at timestamptz,
  delivery_error text,
  created_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notifications_profile_idx ON notifications(profile_id, read_at);
--> statement-breakpoint
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_fleet_admin boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_book_fleet boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_use_restricted_vehicles boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE profiles SET is_fleet_admin = true, can_book_fleet = true WHERE role = 'admin';
```

- [ ] **Step 2: Add enums and tables to `src/lib/db/schema.ts`**

Append at the end of the file, following the existing section-comment style. Import additions needed at the top: none beyond what the file already imports (`pgTable`, `pgEnum`, `uuid`, `text`, `varchar`, `integer`, `boolean`, `date`, `timestamp`, `numeric`, `unique`, `relations`).

```typescript
// ---------------------------------------------------------------------------
// Fleet & Visit Command
// ---------------------------------------------------------------------------
export const fleetRequestTypeEnum = pgEnum('fleet_request_type', ['visit', 'standalone'])
export const fleetRequestStatusEnum = pgEnum('fleet_request_status', [
  'pending', 'queued', 'dispatched', 'completed', 'cancelled',
])
export const dispatchStatusEnum = pgEnum('dispatch_status', [
  'draft', 'approved', 'in_progress', 'completed', 'cancelled',
])
export const vehicleStatusEnum = pgEnum('vehicle_status', ['active', 'maintenance', 'retired'])
export const driverLanguageEnum = pgEnum('driver_language', ['en', 'si', 'ta'])

export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  registrationNo: varchar('registration_no', { length: 50 }),
  maxPassengers: integer('max_passengers').notNull(),
  cargoCapable: boolean('cargo_capable').default(false).notNull(),
  isRestricted: boolean('is_restricted').default(false).notNull(),
  status: vehicleStatusEnum('status').default('active').notNull(),
  currentLocationPropertyId: uuid('current_location_property_id')
    .references(() => properties.id, { onDelete: 'set null' }),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique('vehicles_org_name_unique').on(t.orgId, t.name)])

export const drivers = pgTable('drivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  fullName: text('full_name').notNull(),
  phone: varchar('phone', { length: 50 }),
  preferredLanguage: driverLanguageEnum('preferred_language').default('en').notNull(),
  accessToken: varchar('access_token', { length: 32 }).notNull().unique(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const driverVehicles = pgTable('driver_vehicles', {
  driverId: uuid('driver_id').notNull().references(() => drivers.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
}, (t) => [unique('driver_vehicles_pk').on(t.driverId, t.vehicleId)])

export const propertyDistances = pgTable('property_distances', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  fromPropertyId: uuid('from_property_id').references(() => properties.id, { onDelete: 'cascade' }),
  toPropertyId: uuid('to_property_id').references(() => properties.id, { onDelete: 'cascade' }),
  distanceKm: numeric('distance_km', { precision: 6, scale: 1 }).notNull(),
  driveMinutes: integer('drive_minutes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const fleetSettings = pgTable('fleet_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().unique().references(() => organizations.id),
  poolingThresholdKm: numeric('pooling_threshold_km', { precision: 6, scale: 1 }).default('40.0').notNull(),
  planningHorizonDays: integer('planning_horizon_days').default(14).notNull(),
  engineEnabled: boolean('engine_enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const fleetRequests = pgTable('fleet_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  requestType: fleetRequestTypeEnum('request_type').notNull(),
  requestedBy: uuid('requested_by').notNull().references(() => profiles.id),
  targetPropertyId: uuid('target_property_id').references(() => properties.id, { onDelete: 'set null' }),
  originText: text('origin_text'),
  destinationText: text('destination_text'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  paxCount: integer('pax_count').default(1).notNull(),
  cargoRequired: boolean('cargo_required').default(false).notNull(),
  purpose: text('purpose'),
  notes: text('notes'),
  status: fleetRequestStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const dispatches = pgTable('dispatches', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'restrict' }),
  driverId: uuid('driver_id').notNull().references(() => drivers.id, { onDelete: 'restrict' }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: dispatchStatusEnum('status').default('draft').notNull(),
  generatedBy: varchar('generated_by', { length: 16 }).default('engine').notNull(),
  approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const dispatchStops = pgTable('dispatch_stops', {
  id: uuid('id').defaultRandom().primaryKey(),
  dispatchId: uuid('dispatch_id').notNull().references(() => dispatches.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').references(() => fleetRequests.id, { onDelete: 'set null' }),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
  label: text('label'),
  sortOrder: integer('sort_order').default(0).notNull(),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }),
})

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').references(() => drivers.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
})

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').references(() => drivers.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: text('title').notNull(),
  body: text('body'),
  linkUrl: text('link_url'),
  channel: varchar('channel', { length: 16 }).default('in_app').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  deliveryError: text('delivery_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  organization: one(organizations, { fields: [vehicles.orgId], references: [organizations.id] }),
  currentLocation: one(properties, {
    fields: [vehicles.currentLocationPropertyId],
    references: [properties.id],
  }),
  driverLinks: many(driverVehicles),
  dispatches: many(dispatches),
}))

export const driversRelations = relations(drivers, ({ one, many }) => ({
  organization: one(organizations, { fields: [drivers.orgId], references: [organizations.id] }),
  vehicleLinks: many(driverVehicles),
  dispatches: many(dispatches),
}))

export const driverVehiclesRelations = relations(driverVehicles, ({ one }) => ({
  driver: one(drivers, { fields: [driverVehicles.driverId], references: [drivers.id] }),
  vehicle: one(vehicles, { fields: [driverVehicles.vehicleId], references: [vehicles.id] }),
}))

export const fleetRequestsRelations = relations(fleetRequests, ({ one, many }) => ({
  organization: one(organizations, { fields: [fleetRequests.orgId], references: [organizations.id] }),
  requester: one(profiles, { fields: [fleetRequests.requestedBy], references: [profiles.id] }),
  targetProperty: one(properties, {
    fields: [fleetRequests.targetPropertyId],
    references: [properties.id],
  }),
  stops: many(dispatchStops),
}))

export const dispatchesRelations = relations(dispatches, ({ one, many }) => ({
  organization: one(organizations, { fields: [dispatches.orgId], references: [organizations.id] }),
  vehicle: one(vehicles, { fields: [dispatches.vehicleId], references: [vehicles.id] }),
  driver: one(drivers, { fields: [dispatches.driverId], references: [drivers.id] }),
  approver: one(profiles, { fields: [dispatches.approvedBy], references: [profiles.id] }),
  stops: many(dispatchStops),
}))

export const dispatchStopsRelations = relations(dispatchStops, ({ one }) => ({
  dispatch: one(dispatches, { fields: [dispatchStops.dispatchId], references: [dispatches.id] }),
  request: one(fleetRequests, { fields: [dispatchStops.requestId], references: [fleetRequests.id] }),
  property: one(properties, { fields: [dispatchStops.propertyId], references: [properties.id] }),
}))

export type Vehicle = typeof vehicles.$inferSelect
export type NewVehicle = typeof vehicles.$inferInsert
export type Driver = typeof drivers.$inferSelect
export type NewDriver = typeof drivers.$inferInsert
export type PropertyDistance = typeof propertyDistances.$inferSelect
export type FleetSetting = typeof fleetSettings.$inferSelect
export type FleetRequest = typeof fleetRequests.$inferSelect
export type NewFleetRequest = typeof fleetRequests.$inferInsert
export type Dispatch = typeof dispatches.$inferSelect
export type NewDispatch = typeof dispatches.$inferInsert
export type DispatchStop = typeof dispatchStops.$inferSelect
export type NewDispatchStop = typeof dispatchStops.$inferInsert
export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type Notification = typeof notifications.$inferSelect
```

Note: the `propertyDistances` unique constraint is intentionally **not** declared in Drizzle — Drizzle has no `NULLS NOT DISTINCT` builder, and declaring a plain `unique()` here would generate a constraint that silently fails to dedupe head-office rows. The SQL migration owns it.

- [ ] **Step 3: Add the three new columns to the `profiles` table definition**

In `src/lib/db/schema.ts`, inside the existing `profiles` table (around line 158-172), add after `isActive`:

```typescript
  isFleetAdmin: boolean('is_fleet_admin').default(false).notNull(),
  canBookFleet: boolean('can_book_fleet').default(false).notNull(),
  canUseRestrictedVehicles: boolean('can_use_restricted_vehicles').default(false).notNull(),
```

- [ ] **Step 4: Fix the dev-bypass mock profile**

`getProfileWithAssignments` uses `select()` with no column list, so the new columns flow through `ProfileWithAssignments` automatically. But the hand-written mock object in `src/lib/auth/guards.ts` will now fail to typecheck. Add the three fields to the returned object in `getDevBypassProfile()`, after `isActive: true`:

```typescript
    isFleetAdmin: true,
    canBookFleet: true,
    canUseRestrictedVehicles: true,
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0 with no output.

- [ ] **Step 6: Apply the migration to Supabase**

Open the Supabase SQL editor for the project and paste the full contents of `drizzle/0024_fleet_command.sql`, minus the `--> statement-breakpoint` marker lines (they are a Drizzle convention, not SQL). Run it. Confirm with:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('vehicles','drivers','driver_vehicles','property_distances',
  'fleet_settings','fleet_requests','dispatches','dispatch_stops',
  'push_subscriptions','notifications')
ORDER BY table_name;
```
Expected: 10 rows.

- [ ] **Step 7: Commit**

```bash
git add drizzle/0024_fleet_command.sql src/lib/db/schema.ts src/lib/auth/guards.ts
git commit -m "feat(fleet): add fleet command schema and migration 0024"
```

---

## Task 2: Date helpers and engine types

**Files:**
- Create: `src/lib/fleet/types.ts`
- Create: `src/lib/fleet/dates.ts`
- Test: `src/lib/fleet/dates.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: all engine types (see code below); `addDays(iso: string, days: number): string`, `windowsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean`, `formatDayMonth(iso: string): string`, `colomboToday(now?: Date): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fleet/dates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { addDays, windowsOverlap, formatDayMonth, colomboToday } from './dates'

describe('addDays', () => {
  it('adds days without timezone drift', () => {
    expect(addDays('2026-08-12', 14)).toBe('2026-08-26')
  })

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-28', 5)).toBe('2027-01-02')
  })

  it('handles negative offsets', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('windowsOverlap', () => {
  it('detects overlapping windows', () => {
    expect(windowsOverlap('2026-08-12', '2026-08-14', '2026-08-13', '2026-08-15')).toBe(true)
  })

  it('treats shared boundary dates as overlapping', () => {
    expect(windowsOverlap('2026-08-12', '2026-08-14', '2026-08-14', '2026-08-16')).toBe(true)
  })

  it('rejects disjoint windows', () => {
    expect(windowsOverlap('2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15')).toBe(false)
  })
})

describe('formatDayMonth', () => {
  it('formats without locale or timezone dependence', () => {
    expect(formatDayMonth('2026-08-12')).toBe('12 Aug')
    expect(formatDayMonth('2026-01-01')).toBe('1 Jan')
  })
})

describe('colomboToday', () => {
  it('returns the Colombo date, not the UTC date, near midnight', () => {
    // 2026-08-11 20:00 UTC is 2026-08-12 01:30 in Colombo (UTC+5:30)
    expect(colomboToday(new Date('2026-08-11T20:00:00Z'))).toBe('2026-08-12')
  })

  it('returns the same date mid-afternoon UTC', () => {
    expect(colomboToday(new Date('2026-08-12T06:00:00Z'))).toBe('2026-08-12')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/fleet/dates.test.ts`
Expected: FAIL — `Failed to resolve import "./dates"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/fleet/dates.ts`:

```typescript
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Add days to a YYYY-MM-DD string. UTC-based, so no timezone drift. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Inclusive overlap test on YYYY-MM-DD strings (lexicographic compare is safe). */
export function windowsOverlap(
  aStart: string, aEnd: string, bStart: string, bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

/** "12 Aug" — built from string parts so it cannot shift by locale or timezone. */
export function formatDayMonth(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${parseInt(day, 10)} ${MONTHS[parseInt(month, 10) - 1]}`
}

/** Today's date in Asia/Colombo (UTC+5:30, no DST) as YYYY-MM-DD. */
export function colomboToday(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/fleet/dates.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Create the shared types file**

Create `src/lib/fleet/types.ts`. These types are the contract every later task depends on — the engine, the queries that feed it, and the API routes that surface its output.

```typescript
export interface EngineVehicle {
  id: string
  name: string
  maxPassengers: number
  cargoCapable: boolean
  isRestricted: boolean
  status: 'active' | 'maintenance' | 'retired'
  currentLocationPropertyId: string | null
  sortOrder: number
}

export interface EngineDriver {
  id: string
  fullName: string
  isActive: boolean
  /** Vehicle ids this driver is licensed for, from driver_vehicles. */
  vehicleIds: string[]
}

export interface EngineRequest {
  id: string
  requestType: 'visit' | 'standalone'
  requestedById: string
  /** From profiles.canUseRestrictedVehicles, resolved by the caller. */
  requesterCanUseRestricted: boolean
  targetPropertyId: string | null
  /** Free-text destination for standalone requests. */
  destinationLabel: string | null
  startDate: string
  endDate: string
  paxCount: number
  cargoRequired: boolean
}

export interface ExistingDispatch {
  id: string
  vehicleId: string
  driverId: string
  startDate: string
  endDate: string
}

export interface DistanceEntry {
  /** null means head office. */
  fromPropertyId: string | null
  toPropertyId: string | null
  distanceKm: number
}

export interface EngineSettings {
  poolingThresholdKm: number
  planningHorizonDays: number
}

export interface EngineInput {
  requests: EngineRequest[]
  vehicles: EngineVehicle[]
  drivers: EngineDriver[]
  distances: DistanceEntry[]
  existingDispatches: ExistingDispatch[]
  settings: EngineSettings
  /** Today in Asia/Colombo, YYYY-MM-DD. */
  today: string
}

export interface DraftStop {
  requestId: string
  propertyId: string | null
  label: string | null
  sortOrder: number
}

export interface DraftDispatch {
  vehicleId: string
  driverId: string
  startDate: string
  endDate: string
  stops: DraftStop[]
}

export interface UnassignableRequest {
  requestId: string
  reason: string
}

export interface EngineResult {
  drafts: DraftDispatch[]
  unassignable: UnassignableRequest[]
}
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/fleet/types.ts src/lib/fleet/dates.ts src/lib/fleet/dates.test.ts
git commit -m "feat(fleet): add engine types and timezone-safe date helpers"
```

---

## Task 3: Distance index

**Files:**
- Create: `src/lib/fleet/distance.ts`
- Test: `src/lib/fleet/distance.test.ts`

**Interfaces:**
- Consumes: `DistanceEntry` from `src/lib/fleet/types.ts`
- Produces: `buildDistanceIndex(entries: DistanceEntry[]): Map<string, number>`, `lookupDistanceKm(index: Map<string, number>, a: string | null, b: string | null): number | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fleet/distance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildDistanceIndex, lookupDistanceKm } from './distance'
import type { DistanceEntry } from './types'

const entries: DistanceEntry[] = [
  { fromPropertyId: null, toPropertyId: 'p1', distanceKm: 65 },
  { fromPropertyId: 'p1', toPropertyId: 'p2', distanceKm: 22.5 },
]

describe('lookupDistanceKm', () => {
  it('returns 0 for the same node', () => {
    const idx = buildDistanceIndex(entries)
    expect(lookupDistanceKm(idx, 'p1', 'p1')).toBe(0)
    expect(lookupDistanceKm(idx, null, null)).toBe(0)
  })

  it('looks up a stored pair', () => {
    const idx = buildDistanceIndex(entries)
    expect(lookupDistanceKm(idx, 'p1', 'p2')).toBe(22.5)
  })

  it('is symmetric even when only one direction is stored', () => {
    const idx = buildDistanceIndex(entries)
    expect(lookupDistanceKm(idx, 'p2', 'p1')).toBe(22.5)
  })

  it('treats null as head office', () => {
    const idx = buildDistanceIndex(entries)
    expect(lookupDistanceKm(idx, 'p1', null)).toBe(65)
  })

  it('returns null for an unknown pair rather than guessing', () => {
    const idx = buildDistanceIndex(entries)
    expect(lookupDistanceKm(idx, 'p2', 'p9')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/fleet/distance.test.ts`
Expected: FAIL — cannot resolve `./distance`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/fleet/distance.ts`:

```typescript
import type { DistanceEntry } from './types'

const HEAD_OFFICE = 'HO'

function nodeId(id: string | null): string {
  return id ?? HEAD_OFFICE
}

/** Order-independent key so a single stored row answers both directions. */
function pairKey(a: string | null, b: string | null): string {
  return [nodeId(a), nodeId(b)].sort().join('|')
}

export function buildDistanceIndex(entries: DistanceEntry[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const e of entries) {
    index.set(pairKey(e.fromPropertyId, e.toPropertyId), e.distanceKm)
  }
  return index
}

/**
 * Distance between two nodes in km. Returns 0 for identical nodes and null
 * when the pair has not been entered — callers must treat null as "unknown",
 * never as "close", or the engine would pool trips across the island.
 */
export function lookupDistanceKm(
  index: Map<string, number>,
  a: string | null,
  b: string | null,
): number | null {
  if (nodeId(a) === nodeId(b)) return 0
  return index.get(pairKey(a, b)) ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/fleet/distance.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fleet/distance.ts src/lib/fleet/distance.test.ts
git commit -m "feat(fleet): add symmetric property distance index"
```

---

## Task 4: Constraint rules

This task implements §5.1 of the brief. The exact error string is a hard requirement — do not reword it.

**Files:**
- Create: `src/lib/fleet/constraints.ts`
- Test: `src/lib/fleet/constraints.test.ts`

**Interfaces:**
- Consumes: `EngineVehicle`, `EngineDriver` from `./types`
- Produces: `LORRY_PAX_ERROR`, `NO_CARGO_VEHICLE_ERROR`, `maxFleetCapacity(vehicles: EngineVehicle[]): number`, `validateFleetRequest(input: { cargoRequired: boolean; paxCount: number }, vehicles: EngineVehicle[]): ValidationResult`, `ClusterSpec`, `eligibleVehiclesFor(cluster: ClusterSpec, vehicles: EngineVehicle[], busyVehicleIds: Set<string>): EngineVehicle[]`, `eligibleDriversFor(vehicleId: string, drivers: EngineDriver[], busyDriverIds: Set<string>): EngineDriver[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fleet/constraints.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  LORRY_PAX_ERROR,
  NO_CARGO_VEHICLE_ERROR,
  maxFleetCapacity,
  validateFleetRequest,
  eligibleVehiclesFor,
  eligibleDriversFor,
} from './constraints'
import type { EngineVehicle, EngineDriver } from './types'

const lorry: EngineVehicle = {
  id: 'v-lorry', name: 'Bolero Lorry', maxPassengers: 1, cargoCapable: true,
  isRestricted: false, status: 'active', currentLocationPropertyId: null, sortOrder: 0,
}
const car1: EngineVehicle = {
  id: 'v-car1', name: 'Car 1', maxPassengers: 4, cargoCapable: false,
  isRestricted: true, status: 'active', currentLocationPropertyId: null, sortOrder: 1,
}
const van: EngineVehicle = {
  id: 'v-van', name: 'Van', maxPassengers: 8, cargoCapable: false,
  isRestricted: false, status: 'active', currentLocationPropertyId: null, sortOrder: 2,
}
const fleet = [lorry, car1, van]

const baseCluster = {
  startDate: '2026-08-12', endDate: '2026-08-14', totalPax: 2,
  cargoRequired: false, allowsRestricted: false, destinationPropertyId: 'p1',
}

describe('validateFleetRequest', () => {
  it('rejects cargo with more than one passenger using the exact brief wording', () => {
    const r = validateFleetRequest({ cargoRequired: true, paxCount: 2 }, fleet)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Lorry cargo transport standard limits maximum passenger count to 1.')
  })

  it('exports that same string as LORRY_PAX_ERROR', () => {
    expect(LORRY_PAX_ERROR).toBe('Lorry cargo transport standard limits maximum passenger count to 1.')
  })

  it('accepts cargo with one passenger', () => {
    expect(validateFleetRequest({ cargoRequired: true, paxCount: 1 }, fleet).ok).toBe(true)
  })

  it('accepts a cargo-only run with zero passengers', () => {
    expect(validateFleetRequest({ cargoRequired: true, paxCount: 0 }, fleet).ok).toBe(true)
  })

  it('rejects cargo when no cargo-capable vehicle exists', () => {
    const r = validateFleetRequest({ cargoRequired: true, paxCount: 1 }, [car1, van])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe(NO_CARGO_VEHICLE_ERROR)
  })

  it('rejects a passenger request exceeding the whole fleet', () => {
    const r = validateFleetRequest({ cargoRequired: false, paxCount: 12 }, fleet)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('No vehicle in the fleet seats 12 passengers.')
  })

  it('rejects a non-cargo request with no passengers', () => {
    const r = validateFleetRequest({ cargoRequired: false, paxCount: 0 }, fleet)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Passenger count must be at least 1.')
  })

  it('ignores retired and in-maintenance vehicles when sizing the fleet', () => {
    const grounded: EngineVehicle[] = [{ ...van, status: 'maintenance' }, car1]
    expect(maxFleetCapacity(grounded)).toBe(4)
  })
})

describe('eligibleVehiclesFor', () => {
  it('returns only cargo-capable vehicles for a cargo cluster', () => {
    const r = eligibleVehiclesFor(
      { ...baseCluster, cargoRequired: true, totalPax: 1 }, fleet, new Set(),
    )
    expect(r.map((v) => v.id)).toEqual(['v-lorry'])
  })

  it('excludes restricted vehicles when nobody on the trip is privileged', () => {
    const r = eligibleVehiclesFor(baseCluster, fleet, new Set())
    expect(r.map((v) => v.id)).toEqual(['v-van'])
  })

  it('includes restricted vehicles when a privileged passenger is aboard', () => {
    const r = eligibleVehiclesFor({ ...baseCluster, allowsRestricted: true }, fleet, new Set())
    expect(r.map((v) => v.id)).toEqual(['v-car1', 'v-van'])
  })

  it('excludes vehicles without enough seats', () => {
    const r = eligibleVehiclesFor(
      { ...baseCluster, totalPax: 6, allowsRestricted: true }, fleet, new Set(),
    )
    expect(r.map((v) => v.id)).toEqual(['v-van'])
  })

  it('excludes vehicles already busy in the window', () => {
    const r = eligibleVehiclesFor(baseCluster, fleet, new Set(['v-van']))
    expect(r).toEqual([])
  })

  it('excludes vehicles that are not active', () => {
    const r = eligibleVehiclesFor(baseCluster, [{ ...van, status: 'maintenance' }], new Set())
    expect(r).toEqual([])
  })
})

describe('eligibleDriversFor', () => {
  const drivers: EngineDriver[] = [
    { id: 'd1', fullName: 'Nimal', isActive: true, vehicleIds: ['v-car1', 'v-van'] },
    { id: 'd2', fullName: 'Sunil', isActive: true, vehicleIds: ['v-lorry', 'v-van'] },
    { id: 'd3', fullName: 'Retired', isActive: false, vehicleIds: ['v-lorry'] },
  ]

  it('returns only drivers licensed for the vehicle', () => {
    expect(eligibleDriversFor('v-lorry', drivers, new Set()).map((d) => d.id)).toEqual(['d2'])
  })

  it('excludes inactive drivers', () => {
    const r = eligibleDriversFor('v-lorry', [drivers[2]], new Set())
    expect(r).toEqual([])
  })

  it('excludes drivers already booked in the window', () => {
    expect(eligibleDriversFor('v-van', drivers, new Set(['d1'])).map((d) => d.id)).toEqual(['d2'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/fleet/constraints.test.ts`
Expected: FAIL — cannot resolve `./constraints`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/fleet/constraints.ts`:

```typescript
import type { EngineDriver, EngineVehicle } from './types'

/**
 * Required verbatim by the brief (§5.1). Do not reword — it is quoted in the
 * source SRS and in the acceptance tests.
 */
export const LORRY_PAX_ERROR =
  'Lorry cargo transport standard limits maximum passenger count to 1.'

export const NO_CARGO_VEHICLE_ERROR = 'No cargo-capable vehicle is configured.'

export type ValidationResult = { ok: true } | { ok: false; error: string }

export interface ClusterSpec {
  startDate: string
  endDate: string
  totalPax: number
  cargoRequired: boolean
  /** True when at least one requester on the trip may use restricted vehicles. */
  allowsRestricted: boolean
  destinationPropertyId: string | null
}

function usable(vehicles: EngineVehicle[]): EngineVehicle[] {
  return vehicles.filter((v) => v.status === 'active')
}

/** Largest passenger capacity available anywhere in the active fleet. */
export function maxFleetCapacity(vehicles: EngineVehicle[]): number {
  return usable(vehicles).reduce((max, v) => Math.max(max, v.maxPassengers), 0)
}

function maxCargoCapacity(vehicles: EngineVehicle[]): number | null {
  const cargo = usable(vehicles).filter((v) => v.cargoCapable)
  if (cargo.length === 0) return null
  return cargo.reduce((max, v) => Math.max(max, v.maxPassengers), 0)
}

/**
 * Validates a request at submission time, before any vehicle is chosen.
 * The cargo passenger cap is derived from the cargo fleet's own capacity
 * rather than hardcoded to the Bolero Lorry, so buying a second lorry with a
 * different cab does not require a code change.
 */
export function validateFleetRequest(
  input: { cargoRequired: boolean; paxCount: number },
  vehicles: EngineVehicle[],
): ValidationResult {
  const { cargoRequired, paxCount } = input

  if (paxCount < 0) return { ok: false, error: 'Passenger count cannot be negative.' }

  if (cargoRequired) {
    const cap = maxCargoCapacity(vehicles)
    if (cap === null) return { ok: false, error: NO_CARGO_VEHICLE_ERROR }
    if (paxCount > cap) return { ok: false, error: LORRY_PAX_ERROR }
    return { ok: true }
  }

  if (paxCount < 1) return { ok: false, error: 'Passenger count must be at least 1.' }

  const cap = maxFleetCapacity(vehicles)
  if (paxCount > cap) {
    return { ok: false, error: `No vehicle in the fleet seats ${paxCount} passengers.` }
  }
  return { ok: true }
}

/**
 * Vehicles that could serve this cluster. Busy ids are supplied by the caller,
 * which knows about both already-approved dispatches and drafts planned
 * earlier in the same engine run.
 */
export function eligibleVehiclesFor(
  cluster: ClusterSpec,
  vehicles: EngineVehicle[],
  busyVehicleIds: Set<string>,
): EngineVehicle[] {
  return usable(vehicles).filter((v) => {
    if (busyVehicleIds.has(v.id)) return false
    if (cluster.cargoRequired && !v.cargoCapable) return false
    if (v.maxPassengers < cluster.totalPax) return false
    if (v.isRestricted && !cluster.allowsRestricted) return false
    return true
  })
}

export function eligibleDriversFor(
  vehicleId: string,
  drivers: EngineDriver[],
  busyDriverIds: Set<string>,
): EngineDriver[] {
  return drivers.filter(
    (d) => d.isActive && !busyDriverIds.has(d.id) && d.vehicleIds.includes(vehicleId),
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/fleet/constraints.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fleet/constraints.ts src/lib/fleet/constraints.test.ts
git commit -m "feat(fleet): add cargo, capacity and restricted-vehicle constraint rules"
```

---

## Task 5: The pooling engine

**Files:**
- Create: `src/lib/fleet/engine.ts`
- Test: `src/lib/fleet/engine.test.ts`

**Interfaces:**
- Consumes: everything from `./types`, `./dates`, `./distance`, `./constraints`
- Produces: `planDispatches(input: EngineInput): EngineResult`

Two pooling rules that the brief leaves unstated, decided here and asserted in tests:
- **Cargo requests never pool.** The cargo vehicle seats one passenger, so any pooling would immediately breach the cap.
- **Standalone requests never pool.** Their destination is free text, so no distance can be computed for it — and an unknown distance must never be treated as "close".

- [ ] **Step 1: Write the failing test**

Create `src/lib/fleet/engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { planDispatches } from './engine'
import type { EngineInput, EngineRequest, EngineVehicle, EngineDriver } from './types'

const lorry: EngineVehicle = {
  id: 'v-lorry', name: 'Bolero Lorry', maxPassengers: 1, cargoCapable: true,
  isRestricted: false, status: 'active', currentLocationPropertyId: null, sortOrder: 0,
}
const car1: EngineVehicle = {
  id: 'v-car1', name: 'Car 1', maxPassengers: 4, cargoCapable: false,
  isRestricted: true, status: 'active', currentLocationPropertyId: null, sortOrder: 1,
}
const van: EngineVehicle = {
  id: 'v-van', name: 'Van', maxPassengers: 8, cargoCapable: false,
  isRestricted: false, status: 'active', currentLocationPropertyId: null, sortOrder: 2,
}

const drivers: EngineDriver[] = [
  { id: 'd-nimal', fullName: 'Nimal', isActive: true, vehicleIds: ['v-car1', 'v-van'] },
  { id: 'd-sunil', fullName: 'Sunil', isActive: true, vehicleIds: ['v-lorry', 'v-van'] },
]

function request(over: Partial<EngineRequest> & { id: string }): EngineRequest {
  return {
    requestType: 'visit',
    requestedById: 'u1',
    requesterCanUseRestricted: false,
    targetPropertyId: 'p1',
    destinationLabel: null,
    startDate: '2026-08-12',
    endDate: '2026-08-14',
    paxCount: 2,
    cargoRequired: false,
    ...over,
  }
}

function input(over: Partial<EngineInput>): EngineInput {
  return {
    requests: [],
    vehicles: [lorry, car1, van],
    drivers,
    distances: [
      { fromPropertyId: 'p1', toPropertyId: 'p2', distanceKm: 18 },
      { fromPropertyId: 'p1', toPropertyId: 'p3', distanceKm: 140 },
      { fromPropertyId: null, toPropertyId: 'p1', distanceKm: 65 },
      { fromPropertyId: null, toPropertyId: 'p2', distanceKm: 70 },
      { fromPropertyId: null, toPropertyId: 'p3', distanceKm: 200 },
    ],
    existingDispatches: [],
    settings: { poolingThresholdKm: 40, planningHorizonDays: 14 },
    today: '2026-08-10',
    ...over,
  }
}

describe('planDispatches', () => {
  it('assigns a single request to the smallest sufficient vehicle', () => {
    const r = planDispatches(input({ requests: [request({ id: 'r1', paxCount: 2 })] }))
    expect(r.unassignable).toEqual([])
    expect(r.drafts).toHaveLength(1)
    // Car 1 is restricted and the requester is not privileged, so the van wins.
    expect(r.drafts[0].vehicleId).toBe('v-van')
    expect(r.drafts[0].stops.map((s) => s.requestId)).toEqual(['r1'])
  })

  it('pools two nearby overlapping visits into one dispatch with two stops', () => {
    const r = planDispatches(input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', paxCount: 2 }),
        request({ id: 'r2', targetPropertyId: 'p2', paxCount: 3 }),
      ],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].stops.map((s) => s.requestId)).toEqual(['r1', 'r2'])
    expect(r.drafts[0].stops.map((s) => s.sortOrder)).toEqual([0, 1])
  })

  it('refuses to pool destinations beyond the distance threshold', () => {
    const r = planDispatches(input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1' }),
        request({ id: 'r2', targetPropertyId: 'p3' }),
      ],
    }))
    expect(r.drafts).toHaveLength(2)
  })

  it('refuses to pool when the distance pair is unknown', () => {
    const r = planDispatches(input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1' }),
        request({ id: 'r2', targetPropertyId: 'p-unknown' }),
      ],
    }))
    expect(r.drafts).toHaveLength(2)
  })

  it('refuses to pool non-overlapping windows', () => {
    const r = planDispatches(input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', startDate: '2026-08-12', endDate: '2026-08-13' }),
        request({ id: 'r2', targetPropertyId: 'p2', startDate: '2026-08-15', endDate: '2026-08-16' }),
      ],
    }))
    expect(r.drafts).toHaveLength(2)
  })

  it('splits a cluster that would exceed the largest vehicle', () => {
    const r = planDispatches(input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', paxCount: 6 }),
        request({ id: 'r2', targetPropertyId: 'p2', paxCount: 6 }),
      ],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].stops.map((s) => s.requestId)).toEqual(['r1'])
    // Only one van exists, so the second cluster has no vehicle left.
    expect(r.unassignable).toEqual([
      { requestId: 'r2', reason: 'No vehicle seating 6 free 12 Aug–14 Aug' },
    ])
  })

  it('never pools a cargo request', () => {
    const r = planDispatches(input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', paxCount: 1, cargoRequired: true }),
        request({ id: 'r2', targetPropertyId: 'p2', paxCount: 1 }),
      ],
    }))
    expect(r.drafts).toHaveLength(2)
    const cargoDraft = r.drafts.find((d) => d.stops.some((s) => s.requestId === 'r1'))
    expect(cargoDraft?.vehicleId).toBe('v-lorry')
    expect(cargoDraft?.driverId).toBe('d-sunil')
  })

  it('never pools a standalone request', () => {
    const r = planDispatches(input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', paxCount: 1 }),
        request({
          id: 'r2', requestType: 'standalone', targetPropertyId: null,
          destinationLabel: 'Bandaranaike Airport', paxCount: 1,
        }),
      ],
    }))
    expect(r.drafts).toHaveLength(2)
    const standalone = r.drafts.find((d) => d.stops.some((s) => s.requestId === 'r2'))
    expect(standalone?.stops[0].label).toBe('Bandaranaike Airport')
    expect(standalone?.stops[0].propertyId).toBeNull()
  })

  it('allows a restricted vehicle when a privileged requester is aboard', () => {
    const r = planDispatches(input({
      vehicles: [car1],
      requests: [request({ id: 'r1', paxCount: 2, requesterCanUseRestricted: true })],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].vehicleId).toBe('v-car1')
  })

  it('reports no cargo vehicle in plain English', () => {
    const r = planDispatches(input({
      vehicles: [van],
      requests: [request({ id: 'r1', paxCount: 1, cargoRequired: true })],
    }))
    expect(r.drafts).toEqual([])
    expect(r.unassignable).toEqual([
      { requestId: 'r1', reason: 'No cargo-capable vehicle free 12 Aug–14 Aug' },
    ])
  })

  it('reports a missing licensed driver separately from a missing vehicle', () => {
    const r = planDispatches(input({
      vehicles: [lorry],
      drivers: [{ id: 'd-nimal', fullName: 'Nimal', isActive: true, vehicleIds: ['v-car1'] }],
      requests: [request({ id: 'r1', paxCount: 1, cargoRequired: true })],
    }))
    expect(r.unassignable).toEqual([
      { requestId: 'r1', reason: 'No licensed driver available 12 Aug–14 Aug' },
    ])
  })

  it('excludes a vehicle already committed to an approved dispatch', () => {
    const r = planDispatches(input({
      vehicles: [van],
      requests: [request({ id: 'r1', paxCount: 2 })],
      existingDispatches: [
        { id: 'x1', vehicleId: 'v-van', driverId: 'd-nimal', startDate: '2026-08-13', endDate: '2026-08-15' },
      ],
    }))
    expect(r.drafts).toEqual([])
    expect(r.unassignable[0].reason).toBe('No vehicle seating 2 free 12 Aug–14 Aug')
  })

  it('does not reuse a vehicle across two drafts in the same run', () => {
    const r = planDispatches(input({
      vehicles: [van],
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', paxCount: 2 }),
        request({ id: 'r2', targetPropertyId: 'p3', paxCount: 2 }),
      ],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.unassignable).toHaveLength(1)
  })

  // Both drivers are licensed for the van and neither is busy in the request
  // window, so licence and availability cannot decide it — only load can.
  // The second case is the one that matters: 'd-nimal' sorts first
  // alphabetically, so if load were ignored it would win by the id tiebreak.
  it('gives the trip to the less-loaded driver when Sunil is busier', () => {
    const r = planDispatches(input({
      vehicles: [van],
      requests: [request({ id: 'r1', paxCount: 2 })],
      existingDispatches: [
        { id: 'x1', vehicleId: 'v-lorry', driverId: 'd-sunil', startDate: '2026-08-20', endDate: '2026-08-20' },
      ],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].driverId).toBe('d-nimal')
  })

  it('gives the trip to the less-loaded driver when Nimal is busier', () => {
    const r = planDispatches(input({
      vehicles: [van],
      requests: [request({ id: 'r1', paxCount: 2 })],
      existingDispatches: [
        { id: 'x1', vehicleId: 'v-car1', driverId: 'd-nimal', startDate: '2026-08-20', endDate: '2026-08-20' },
      ],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].driverId).toBe('d-sunil')
  })

  it('flags requests whose window has already passed', () => {
    const r = planDispatches(input({
      requests: [request({ id: 'r1', startDate: '2026-08-01', endDate: '2026-08-02' })],
    }))
    expect(r.drafts).toEqual([])
    expect(r.unassignable).toEqual([
      { requestId: 'r1', reason: 'Window 1 Aug–2 Aug has already passed' },
    ])
  })

  it('leaves requests beyond the planning horizon untouched', () => {
    const r = planDispatches(input({
      requests: [request({ id: 'r1', startDate: '2026-09-20', endDate: '2026-09-21' })],
    }))
    expect(r.drafts).toEqual([])
    expect(r.unassignable).toEqual([])
  })

  it('is deterministic across repeated runs', () => {
    const build = () => input({
      requests: [
        request({ id: 'r2', targetPropertyId: 'p2', paxCount: 2 }),
        request({ id: 'r1', targetPropertyId: 'p3', paxCount: 2 }),
      ],
    })
    expect(planDispatches(build())).toEqual(planDispatches(build()))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/fleet/engine.test.ts`
Expected: FAIL — cannot resolve `./engine`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/fleet/engine.ts`:

```typescript
import { addDays, formatDayMonth, windowsOverlap } from './dates'
import { buildDistanceIndex, lookupDistanceKm } from './distance'
import {
  eligibleDriversFor,
  eligibleVehiclesFor,
  maxFleetCapacity,
  type ClusterSpec,
} from './constraints'
import type {
  DraftDispatch,
  DraftStop,
  EngineInput,
  EngineRequest,
  EngineResult,
  EngineVehicle,
  UnassignableRequest,
} from './types'

interface Cluster {
  requests: EngineRequest[]
  startDate: string
  endDate: string
}

interface Booking {
  vehicleId: string
  driverId: string
  startDate: string
  endDate: string
}

function clusterPax(c: Cluster): number {
  return c.requests.reduce((sum, r) => sum + r.paxCount, 0)
}

function describeWindow(start: string, end: string): string {
  return `${formatDayMonth(start)}–${formatDayMonth(end)}`
}

/**
 * Cargo and standalone requests are never pooled: cargo because the cargo
 * vehicle seats one, standalone because a free-text destination has no
 * distance and an unknown distance must never read as "nearby".
 */
function poolable(r: EngineRequest): boolean {
  return !r.cargoRequired && r.requestType === 'visit'
}

function canJoin(
  cluster: Cluster,
  r: EngineRequest,
  index: Map<string, number>,
  thresholdKm: number,
  fleetCapacity: number,
): boolean {
  if (!poolable(r) || !cluster.requests.every(poolable)) return false
  if (!windowsOverlap(cluster.startDate, cluster.endDate, r.startDate, r.endDate)) return false
  if (clusterPax(cluster) + r.paxCount > fleetCapacity) return false
  return cluster.requests.every((existing) => {
    const km = lookupDistanceKm(index, existing.targetPropertyId, r.targetPropertyId)
    return km !== null && km <= thresholdKm
  })
}

function busyIn(bookings: Booking[], start: string, end: string) {
  const vehicleIds = new Set<string>()
  const driverIds = new Set<string>()
  for (const b of bookings) {
    if (windowsOverlap(b.startDate, b.endDate, start, end)) {
      vehicleIds.add(b.vehicleId)
      driverIds.add(b.driverId)
    }
  }
  return { vehicleIds, driverIds }
}

/**
 * Orders candidate vehicles: already parked nearest to the destination first,
 * then the smallest vehicle that still fits (never send a lorry for one
 * passenger), then admin sort order, then id so runs are reproducible.
 */
function rankVehicles(
  candidates: EngineVehicle[],
  destinationPropertyId: string | null,
  index: Map<string, number>,
): EngineVehicle[] {
  const distanceOf = (v: EngineVehicle): number => {
    const km = lookupDistanceKm(index, v.currentLocationPropertyId, destinationPropertyId)
    return km ?? Number.POSITIVE_INFINITY
  }
  return [...candidates].sort(
    (a, b) =>
      distanceOf(a) - distanceOf(b) ||
      a.maxPassengers - b.maxPassengers ||
      a.sortOrder - b.sortOrder ||
      a.id.localeCompare(b.id),
  )
}

export function planDispatches(input: EngineInput): EngineResult {
  const { requests, vehicles, drivers, distances, existingDispatches, settings, today } = input

  const index = buildDistanceIndex(distances)
  const fleetCapacity = maxFleetCapacity(vehicles)
  const horizonEnd = addDays(today, settings.planningHorizonDays)
  const unassignable: UnassignableRequest[] = []

  // --- 1. Filter to the planning horizon ------------------------------------
  const candidates: EngineRequest[] = []
  for (const r of requests) {
    if (r.endDate < today) {
      unassignable.push({
        requestId: r.id,
        reason: `Window ${describeWindow(r.startDate, r.endDate)} has already passed`,
      })
      continue
    }
    // Beyond the horizon: leave pending, silently, for a later run.
    if (r.startDate > horizonEnd) continue
    candidates.push(r)
  }
  candidates.sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
  )

  // --- 2. Cluster by window overlap and destination proximity ---------------
  const clusters: Cluster[] = []
  for (const r of candidates) {
    const target = clusters.find((c) =>
      canJoin(c, r, index, settings.poolingThresholdKm, fleetCapacity),
    )
    if (target) {
      target.requests.push(r)
      if (r.startDate < target.startDate) target.startDate = r.startDate
      if (r.endDate > target.endDate) target.endDate = r.endDate
    } else {
      clusters.push({ requests: [r], startDate: r.startDate, endDate: r.endDate })
    }
  }

  // --- 3. Allocate a vehicle and driver to each cluster ---------------------
  const bookings: Booking[] = existingDispatches.map((d) => ({
    vehicleId: d.vehicleId,
    driverId: d.driverId,
    startDate: d.startDate,
    endDate: d.endDate,
  }))
  const driverLoad = new Map<string, number>()
  for (const d of existingDispatches) {
    driverLoad.set(d.driverId, (driverLoad.get(d.driverId) ?? 0) + 1)
  }

  const drafts: DraftDispatch[] = []

  for (const cluster of clusters) {
    const totalPax = clusterPax(cluster)
    const cargoRequired = cluster.requests.some((r) => r.cargoRequired)
    const spec: ClusterSpec = {
      startDate: cluster.startDate,
      endDate: cluster.endDate,
      totalPax,
      cargoRequired,
      allowsRestricted: cluster.requests.some((r) => r.requesterCanUseRestricted),
      destinationPropertyId: cluster.requests[0].targetPropertyId,
    }

    const busy = busyIn(bookings, cluster.startDate, cluster.endDate)
    const ranked = rankVehicles(
      eligibleVehiclesFor(spec, vehicles, busy.vehicleIds),
      spec.destinationPropertyId,
      index,
    )

    const window = describeWindow(cluster.startDate, cluster.endDate)

    if (ranked.length === 0) {
      const reason = cargoRequired
        ? `No cargo-capable vehicle free ${window}`
        : `No vehicle seating ${totalPax} free ${window}`
      for (const r of cluster.requests) unassignable.push({ requestId: r.id, reason })
      continue
    }

    // Walk the ranked vehicles until one has an available licensed driver.
    let placed = false
    for (const vehicle of ranked) {
      const eligible = eligibleDriversFor(vehicle.id, drivers, busy.driverIds)
      if (eligible.length === 0) continue

      const driver = [...eligible].sort(
        (a, b) =>
          (driverLoad.get(a.id) ?? 0) - (driverLoad.get(b.id) ?? 0) ||
          a.id.localeCompare(b.id),
      )[0]

      const stops: DraftStop[] = cluster.requests.map((r, i) => ({
        requestId: r.id,
        propertyId: r.targetPropertyId,
        label: r.destinationLabel,
        sortOrder: i,
      }))

      drafts.push({
        vehicleId: vehicle.id,
        driverId: driver.id,
        startDate: cluster.startDate,
        endDate: cluster.endDate,
        stops,
      })
      bookings.push({
        vehicleId: vehicle.id,
        driverId: driver.id,
        startDate: cluster.startDate,
        endDate: cluster.endDate,
      })
      driverLoad.set(driver.id, (driverLoad.get(driver.id) ?? 0) + 1)
      placed = true
      break
    }

    if (!placed) {
      const reason = `No licensed driver available ${window}`
      for (const r of cluster.requests) unassignable.push({ requestId: r.id, reason })
    }
  }

  return { drafts, unassignable }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/fleet/engine.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm run test && npx tsc --noEmit`
Expected: all tests pass (including the four pre-existing `src/lib/assets/*` suites), tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fleet/engine.ts src/lib/fleet/engine.test.ts
git commit -m "feat(fleet): add deterministic pooling and allocation engine"
```

---

## Task 6: Fleet configuration queries

**Files:**
- Create: `src/lib/db/queries/fleet.ts`

**Interfaces:**
- Consumes: schema tables from Task 1
- Produces: `listVehicles(orgId)`, `createVehicle(data)`, `updateVehicle(id, data)`, `deleteVehicle(id)`, `listDrivers(orgId)`, `getDriverByToken(token)`, `createDriver(data)`, `updateDriver(id, data)`, `deleteDriver(id)`, `setDriverVehicles(driverId, vehicleIds)`, `listDistances(orgId)`, `upsertDistance(orgId, from, to, km, minutes)`, `getFleetSettings(orgId)`, `updateFleetSettings(orgId, data)`, `generateDriverToken()`

Note: Drizzle returns `numeric` columns as **strings**. Every consumer must `parseFloat` them — the engine's types demand `number`.

- [ ] **Step 1: Write the query module**

Create `src/lib/db/queries/fleet.ts`:

```typescript
import { randomBytes } from 'crypto'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '..'
import {
  drivers,
  driverVehicles,
  fleetSettings,
  propertyDistances,
  vehicles,
  type NewDriver,
  type NewVehicle,
} from '../schema'

/** 22-char base64url token, matching the guest-link scheme. */
export function generateDriverToken(): string {
  return randomBytes(16).toString('base64url')
}

// --- Vehicles --------------------------------------------------------------

export async function listVehicles(orgId: string) {
  return db
    .select()
    .from(vehicles)
    .where(eq(vehicles.orgId, orgId))
    .orderBy(asc(vehicles.sortOrder), asc(vehicles.name))
}

export async function createVehicle(data: NewVehicle) {
  const [inserted] = await db.insert(vehicles).values(data).returning()
  return inserted
}

export async function updateVehicle(id: string, data: Partial<NewVehicle>) {
  const [updated] = await db
    .update(vehicles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(vehicles.id, id))
    .returning()
  return updated
}

export async function deleteVehicle(id: string) {
  const [deleted] = await db.delete(vehicles).where(eq(vehicles.id, id)).returning()
  return deleted
}

// --- Drivers ---------------------------------------------------------------

/** Drivers with the vehicle ids they are licensed for, in one round trip. */
export async function listDrivers(orgId: string) {
  const rows = await db
    .select({
      id: drivers.id,
      orgId: drivers.orgId,
      fullName: drivers.fullName,
      phone: drivers.phone,
      preferredLanguage: drivers.preferredLanguage,
      accessToken: drivers.accessToken,
      isActive: drivers.isActive,
      vehicleId: driverVehicles.vehicleId,
    })
    .from(drivers)
    .leftJoin(driverVehicles, eq(driverVehicles.driverId, drivers.id))
    .where(eq(drivers.orgId, orgId))
    .orderBy(asc(drivers.fullName))

  const byId = new Map<string, {
    id: string
    orgId: string
    fullName: string
    phone: string | null
    preferredLanguage: 'en' | 'si' | 'ta'
    accessToken: string
    isActive: boolean
    vehicleIds: string[]
  }>()

  for (const row of rows) {
    const existing = byId.get(row.id)
    if (existing) {
      if (row.vehicleId) existing.vehicleIds.push(row.vehicleId)
      continue
    }
    byId.set(row.id, {
      id: row.id,
      orgId: row.orgId,
      fullName: row.fullName,
      phone: row.phone,
      preferredLanguage: row.preferredLanguage,
      accessToken: row.accessToken,
      isActive: row.isActive,
      vehicleIds: row.vehicleId ? [row.vehicleId] : [],
    })
  }

  return [...byId.values()]
}

export async function getDriverByToken(token: string) {
  const rows = await db.select().from(drivers).where(eq(drivers.accessToken, token)).limit(1)
  return rows[0]
}

export async function createDriver(data: NewDriver) {
  const [inserted] = await db.insert(drivers).values(data).returning()
  return inserted
}

export async function updateDriver(id: string, data: Partial<NewDriver>) {
  const [updated] = await db
    .update(drivers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(drivers.id, id))
    .returning()
  return updated
}

export async function deleteDriver(id: string) {
  const [deleted] = await db.delete(drivers).where(eq(drivers.id, id)).returning()
  return deleted
}

/** Replaces the driver's licence set wholesale. */
export async function setDriverVehicles(driverId: string, vehicleIds: string[]) {
  return db.transaction(async (tx) => {
    await tx.delete(driverVehicles).where(eq(driverVehicles.driverId, driverId))
    if (vehicleIds.length === 0) return []
    return tx
      .insert(driverVehicles)
      .values(vehicleIds.map((vehicleId) => ({ driverId, vehicleId })))
      .returning()
  })
}

// --- Distances -------------------------------------------------------------

export async function listDistances(orgId: string) {
  const rows = await db
    .select()
    .from(propertyDistances)
    .where(eq(propertyDistances.orgId, orgId))
  return rows.map((r) => ({
    fromPropertyId: r.fromPropertyId,
    toPropertyId: r.toPropertyId,
    distanceKm: parseFloat(r.distanceKm),
    driveMinutes: r.driveMinutes,
  }))
}

/**
 * Upserts one leg. Null property id means head office; because the unique
 * constraint is NULLS NOT DISTINCT, a null-bearing pair still conflicts
 * correctly. Written in one direction only — lookups are symmetric.
 */
export async function upsertDistance(
  orgId: string,
  fromPropertyId: string | null,
  toPropertyId: string | null,
  distanceKm: number,
  driveMinutes: number | null,
) {
  const [row] = await db
    .insert(propertyDistances)
    .values({
      orgId,
      fromPropertyId,
      toPropertyId,
      distanceKm: distanceKm.toFixed(1),
      driveMinutes,
    })
    .onConflictDoUpdate({
      target: [
        propertyDistances.orgId,
        propertyDistances.fromPropertyId,
        propertyDistances.toPropertyId,
      ],
      set: { distanceKm: distanceKm.toFixed(1), driveMinutes, updatedAt: new Date() },
    })
    .returning()
  return row
}

// --- Settings --------------------------------------------------------------

/** Returns the org's settings, creating the default row on first read. */
export async function getFleetSettings(orgId: string) {
  const rows = await db
    .select()
    .from(fleetSettings)
    .where(eq(fleetSettings.orgId, orgId))
    .limit(1)

  const row =
    rows[0] ??
    (await db.insert(fleetSettings).values({ orgId }).onConflictDoNothing().returning())[0] ??
    (await db.select().from(fleetSettings).where(eq(fleetSettings.orgId, orgId)).limit(1))[0]

  return {
    id: row.id,
    orgId: row.orgId,
    poolingThresholdKm: parseFloat(row.poolingThresholdKm),
    planningHorizonDays: row.planningHorizonDays,
    engineEnabled: row.engineEnabled,
  }
}

export async function updateFleetSettings(
  orgId: string,
  data: { poolingThresholdKm?: number; planningHorizonDays?: number; engineEnabled?: boolean },
) {
  const [updated] = await db
    .update(fleetSettings)
    .set({
      ...(data.poolingThresholdKm !== undefined
        ? { poolingThresholdKm: data.poolingThresholdKm.toFixed(1) }
        : {}),
      ...(data.planningHorizonDays !== undefined
        ? { planningHorizonDays: data.planningHorizonDays }
        : {}),
      ...(data.engineEnabled !== undefined ? { engineEnabled: data.engineEnabled } : {}),
      updatedAt: new Date(),
    })
    .where(eq(fleetSettings.orgId, orgId))
    .returning()
  return updated
}
```

Remove the `and`, `isNull` and `sql` imports if the final file does not use them — ESLint `no-unused-vars` fails the Coolify build.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/fleet.ts
git commit -m "feat(fleet): add vehicle, driver, distance and settings queries"
```

---

## Task 7: Request and dispatch queries

**Files:**
- Create: `src/lib/db/queries/dispatches.ts`

**Interfaces:**
- Consumes: schema from Task 1, `EngineInput`/`EngineResult` from `src/lib/fleet/types.ts`, `getFleetSettings` and `listDistances` from Task 6
- Produces: `listRequests(orgId, filters)`, `getRequestById(id)`, `createRequest(data)`, `updateRequest(id, data)`, `cancelRequest(id)`, `loadEngineInput(orgId, today)`, `replaceDraftDispatches(orgId, result)`, `listDispatches(orgId, filters)`, `getDispatchWithStops(id)`, `approveDispatch(id, approvedBy)`, `createManualDispatch(orgId, data)`, `getDriverDispatches(driverId)`, `markDispatchStarted(id)`, `markStopArrived(stopId)`, `completeDispatch(id)`

- [ ] **Step 1: Write the query module**

Create `src/lib/db/queries/dispatches.ts`:

```typescript
import { and, asc, desc, eq, gte, inArray, ne } from 'drizzle-orm'
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
  type NewDispatch,
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

/** Gathers everything planDispatches() needs, converting numerics to numbers. */
export async function loadEngineInput(orgId: string, today: string): Promise<EngineInput> {
  const [settings, distances, vehicleRows, driverRows, licenceRows, liveDispatches, requestRows] =
    await Promise.all([
      getFleetSettings(orgId),
      listDistances(orgId),
      db.select().from(vehicles).where(eq(vehicles.orgId, orgId)),
      db.select().from(drivers).where(eq(drivers.orgId, orgId)),
      db.select().from(driverVehicles),
      db
        .select()
        .from(dispatches)
        .where(and(eq(dispatches.orgId, orgId), inArray(dispatches.status, ['approved', 'in_progress']))),
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
        .where(and(eq(fleetRequests.orgId, orgId), inArray(fleetRequests.status, ['pending', 'queued']))),
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
      .where(and(eq(dispatches.orgId, orgId), eq(dispatches.status, 'draft')))

    if (staleDrafts.length > 0) {
      const ids = staleDrafts.map((d) => d.id)
      const freed = await tx
        .select({ requestId: dispatchStops.requestId })
        .from(dispatchStops)
        .where(inArray(dispatchStops.dispatchId, ids))
      const freedIds = freed.map((f) => f.requestId).filter((v): v is string => v !== null)
      if (freedIds.length > 0) {
        await tx
          .update(fleetRequests)
          .set({ status: 'pending', updatedAt: new Date() })
          .where(and(inArray(fleetRequests.id, freedIds), eq(fleetRequests.status, 'queued')))
          .returning()
      }
      await tx.delete(dispatches).where(inArray(dispatches.id, ids)).returning()
    }

    const created: string[] = []
    for (const draft of result.drafts) {
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

      await tx
        .insert(dispatchStops)
        .values(
          draft.stops.map((s) => ({
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
        .where(inArray(fleetRequests.id, draft.stops.map((s) => s.requestId)))
        .returning()

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
        .where(inArray(fleetRequests.id, requestIds))
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
        .where(inArray(fleetRequests.id, data.requestIds))

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
        .where(inArray(fleetRequests.id, data.requestIds))
        .returning()
    }

    return dispatch
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
    .where(and(eq(dispatches.id, id), eq(dispatches.driverId, driverId), ne(dispatches.status, 'completed')))
    .returning()
  return updated
}

export async function markStopArrived(stopId: string, driverId: string) {
  const rows = await db
    .select({ dispatchId: dispatchStops.dispatchId })
    .from(dispatchStops)
    .innerJoin(dispatches, eq(dispatchStops.dispatchId, dispatches.id))
    .where(and(eq(dispatchStops.id, stopId), eq(dispatches.driverId, driverId)))
    .limit(1)

  if (!rows[0]) return undefined

  const [updated] = await db
    .update(dispatchStops)
    .set({ arrivedAt: new Date() })
    .where(eq(dispatchStops.id, stopId))
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
      .where(and(eq(dispatches.id, id), eq(dispatches.driverId, driverId)))
      .returning()

    if (!updated) return undefined

    const stops = await tx
      .select()
      .from(dispatchStops)
      .where(eq(dispatchStops.dispatchId, id))
      .orderBy(desc(dispatchStops.sortOrder))

    await tx
      .update(vehicles)
      .set({ currentLocationPropertyId: stops[0]?.propertyId ?? null, updatedAt: now })
      .where(eq(vehicles.id, updated.vehicleId))
      .returning()

    const requestIds = stops.map((s) => s.requestId).filter((v): v is string => v !== null)
    if (requestIds.length > 0) {
      await tx
        .update(fleetRequests)
        .set({ status: 'completed', updatedAt: now })
        .where(inArray(fleetRequests.id, requestIds))
        .returning()
    }

    return updated
  })
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0. If `and`, `desc`, `gte`, `ne` or `inArray` end up unused, delete them from the import — the Coolify build fails on unused vars.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/dispatches.ts
git commit -m "feat(fleet): add request and dispatch queries with engine plumbing"
```

---

## Task 8: Notifications and Web Push

**Files:**
- Create: `src/lib/db/queries/notifications.ts`
- Create: `src/lib/fleet/push.ts`
- Create: `public/sw.js`
- Modify: `package.json` (add `web-push` and `@types/web-push`)

**Interfaces:**
- Consumes: schema from Task 1
- Produces: `saveSubscription(input)`, `deleteSubscriptionByEndpoint(endpoint)`, `getSubscriptionsForProfile(profileId)`, `getSubscriptionsForDriver(driverId)`, `driverHasSubscription(driverId)`, `createNotification(data)`, `listNotificationsForProfile(profileId)`, `markNotificationRead(id, profileId)`, `notify(input: NotifyInput): Promise<void>`

- [ ] **Step 1: Install the dependency and generate VAPID keys**

```bash
npm install web-push
npm install --save-dev @types/web-push
npx web-push generate-vapid-keys
```

The command prints a public and private key. Add all four variables to `.env.local` and to Coolify:

```bash
VAPID_PUBLIC_KEY="<public key>"
VAPID_PRIVATE_KEY="<private key>"
VAPID_SUBJECT="mailto:admin@taruvillas.com"
NEXT_PUBLIC_VAPID_PUBLIC_KEY="<same public key>"
```

**In Coolify, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` must be marked "Available at Buildtime"** — the browser bundle inlines it at build time, and without that flag it compiles to `undefined` and every subscription attempt fails silently.

- [ ] **Step 2: Write the notification queries**

Create `src/lib/db/queries/notifications.ts`:

```typescript
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '..'
import { notifications, pushSubscriptions } from '../schema'

export interface SaveSubscriptionInput {
  profileId?: string | null
  driverId?: string | null
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}

export async function saveSubscription(input: SaveSubscriptionInput) {
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      profileId: input.profileId ?? null,
      driverId: input.driverId ?? null,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh: input.p256dh,
        auth: input.auth,
        lastSeenAt: new Date(),
      },
    })
    .returning()
  return row
}

export async function deleteSubscriptionByEndpoint(endpoint: string) {
  const [deleted] = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .returning()
  return deleted
}

export async function getSubscriptionsForProfile(profileId: string) {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.profileId, profileId))
}

export async function getSubscriptionsForDriver(driverId: string) {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.driverId, driverId))
}

/** Used by the dispatch board to show which drivers can actually be reached. */
export async function driverHasSubscription(driverId: string) {
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.driverId, driverId))
    .limit(1)
  return rows.length > 0
}

export async function createNotification(data: {
  orgId: string
  profileId?: string | null
  driverId?: string | null
  type: string
  title: string
  body?: string | null
  linkUrl?: string | null
  channel?: string
  sentAt?: Date | null
  deliveryError?: string | null
}) {
  const [row] = await db
    .insert(notifications)
    .values({
      orgId: data.orgId,
      profileId: data.profileId ?? null,
      driverId: data.driverId ?? null,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      linkUrl: data.linkUrl ?? null,
      channel: data.channel ?? 'in_app',
      sentAt: data.sentAt ?? null,
      deliveryError: data.deliveryError ?? null,
    })
    .returning()
  return row
}

export async function listNotificationsForProfile(profileId: string, unreadOnly = false) {
  const conditions = [eq(notifications.profileId, profileId)]
  if (unreadOnly) conditions.push(isNull(notifications.readAt))
  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(50)
}

export async function markNotificationRead(id: string, profileId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.profileId, profileId)))
    .returning()
  return updated
}
```

- [ ] **Step 3: Write the push wrapper**

Create `src/lib/fleet/push.ts`:

```typescript
import webpush from 'web-push'
import {
  createNotification,
  deleteSubscriptionByEndpoint,
  getSubscriptionsForDriver,
  getSubscriptionsForProfile,
} from '@/lib/db/queries/notifications'

let configured = false

function configure(): boolean {
  if (configured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export interface NotifyInput {
  orgId: string
  profileId?: string | null
  driverId?: string | null
  type: string
  title: string
  body?: string
  linkUrl?: string
}

/**
 * Records an in-app notification and attempts a push. Delivery is best-effort
 * and never throws: a failed push must not roll back the dispatch that
 * triggered it. Dead subscriptions (410/404) are pruned on discovery.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const errors: string[] = []
  let sentAt: Date | null = null

  if (configure()) {
    const subs = input.driverId
      ? await getSubscriptionsForDriver(input.driverId)
      : input.profileId
        ? await getSubscriptionsForProfile(input.profileId)
        : []

    const payload = JSON.stringify({
      title: input.title,
      body: input.body ?? '',
      url: input.linkUrl ?? '/',
    })

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        sentAt = new Date()
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await deleteSubscriptionByEndpoint(sub.endpoint)
          errors.push(`stale subscription pruned (${status})`)
        } else {
          errors.push(e instanceof Error ? e.message : String(e))
        }
      }
    }
  } else {
    errors.push('VAPID keys not configured')
  }

  await createNotification({
    orgId: input.orgId,
    profileId: input.profileId ?? null,
    driverId: input.driverId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    linkUrl: input.linkUrl ?? null,
    channel: sentAt ? 'push' : 'in_app',
    sentAt,
    deliveryError: errors.length > 0 ? errors.join('; ') : null,
  })
}
```

- [ ] **Step 4: Write the service worker**

Create `public/sw.js`. Push and click handling only — no caching. Slice B extends this file rather than replacing it.

```javascript
// Taru Villas service worker.
// Scope: Web Push only. The offline caching tier is a separate project slice —
// add fetch handlers here rather than creating a second service worker.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = { title: 'Taru Villas', body: '', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // Payload was not JSON — fall back to the defaults above.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/TVPL.png',
      badge: '/TVPL.png',
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/db/queries/notifications.ts src/lib/fleet/push.ts public/sw.js
git commit -m "feat(fleet): add notification store, web-push delivery and service worker"
```

---

## Task 9: Fleet configuration API routes

**Files:**
- Create: `src/app/api/fleet/vehicles/route.ts`, `src/app/api/fleet/vehicles/[id]/route.ts`
- Create: `src/app/api/fleet/drivers/route.ts`, `src/app/api/fleet/drivers/[id]/route.ts`
- Create: `src/app/api/fleet/distances/route.ts`
- Create: `src/app/api/fleet/settings/route.ts`

**Interfaces:**
- Consumes: Task 6 queries, `getProfile` from `@/lib/auth/guards`
- Produces: REST endpoints consumed by the Task 13 admin UI

All six routes are admin-only. The shape below is the template; apply it to each resource.

- [ ] **Step 1: Write the vehicles collection route**

Create `src/app/api/fleet/vehicles/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { createVehicle, listVehicles } from '@/lib/db/queries/fleet'

const createSchema = z.object({
  name: z.string().min(1).max(255),
  registrationNo: z.string().max(50).nullable().optional(),
  maxPassengers: z.number().int().min(0).max(60),
  cargoCapable: z.boolean().default(false),
  isRestricted: z.boolean().default(false),
  status: z.enum(['active', 'maintenance', 'retired']).default('active'),
  currentLocationPropertyId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().default(0),
})

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ vehicles: await listVehicles(profile.orgId) })
  } catch (error) {
    console.error('GET /api/fleet/vehicles error:', error)
    return NextResponse.json({ error: 'Failed to fetch vehicles' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const vehicle = await createVehicle({
      ...parsed.data,
      registrationNo: parsed.data.registrationNo ?? null,
      currentLocationPropertyId: parsed.data.currentLocationPropertyId ?? null,
      orgId: profile.orgId,
    })
    return NextResponse.json(vehicle, { status: 201 })
  } catch (error) {
    console.error('POST /api/fleet/vehicles error:', error)
    return NextResponse.json({ error: 'Failed to create vehicle' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Write the vehicle item route**

Create `src/app/api/fleet/vehicles/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { deleteVehicle, updateVehicle } from '@/lib/db/queries/fleet'

type RouteContext = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  registrationNo: z.string().max(50).nullable().optional(),
  maxPassengers: z.number().int().min(0).max(60).optional(),
  cargoCapable: z.boolean().optional(),
  isRestricted: z.boolean().optional(),
  status: z.enum(['active', 'maintenance', 'retired']).optional(),
  currentLocationPropertyId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const updated = await updateVehicle(id, parsed.data)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/fleet/vehicles/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update vehicle' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const deleted = await deleteVehicle(id)
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    // A vehicle referenced by a dispatch is protected by ON DELETE RESTRICT.
    const code = (error as { code?: string }).code
    if (code === '23503') {
      return NextResponse.json(
        { error: 'This vehicle has dispatches and cannot be deleted. Set it to retired instead.' },
        { status: 409 },
      )
    }
    console.error('DELETE /api/fleet/vehicles/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete vehicle' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Write the drivers routes**

Create `src/app/api/fleet/drivers/route.ts` mirroring the vehicles collection route, with this schema and body:

```typescript
const createSchema = z.object({
  fullName: z.string().min(1).max(255),
  phone: z.string().max(50).nullable().optional(),
  preferredLanguage: z.enum(['en', 'si', 'ta']).default('en'),
  isActive: z.boolean().default(true),
  vehicleIds: z.array(z.string().uuid()).default([]),
})
```

In `POST`, create the driver then set eligibility:

```typescript
    const driver = await createDriver({
      orgId: profile.orgId,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      preferredLanguage: parsed.data.preferredLanguage,
      isActive: parsed.data.isActive,
      accessToken: generateDriverToken(),
    })
    await setDriverVehicles(driver.id, parsed.data.vehicleIds ?? [])
    return NextResponse.json(driver, { status: 201 })
```

`GET` returns `{ drivers: await listDrivers(profile.orgId) }`.

Create `src/app/api/fleet/drivers/[id]/route.ts` mirroring the vehicle item route. Its `PATCH` schema makes every field optional, and when `vehicleIds` is present it calls `await setDriverVehicles(id, parsed.data.vehicleIds)` after the update. Its `DELETE` handles the same `23503` foreign-key case with the message: `This driver has dispatches and cannot be deleted. Set them to inactive instead.`

- [ ] **Step 4: Write the distances route**

Create `src/app/api/fleet/distances/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { listDistances, upsertDistance } from '@/lib/db/queries/fleet'

const upsertSchema = z.object({
  fromPropertyId: z.string().uuid().nullable(),
  toPropertyId: z.string().uuid().nullable(),
  distanceKm: z.number().min(0).max(2000),
  driveMinutes: z.number().int().min(0).max(2000).nullable().optional(),
})

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ distances: await listDistances(profile.orgId) })
  } catch (error) {
    console.error('GET /api/fleet/distances error:', error)
    return NextResponse.json({ error: 'Failed to fetch distances' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = upsertSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { fromPropertyId, toPropertyId, distanceKm, driveMinutes } = parsed.data
    if (fromPropertyId === toPropertyId) {
      return NextResponse.json({ error: 'A node cannot have a distance to itself' }, { status: 400 })
    }

    const row = await upsertDistance(
      profile.orgId, fromPropertyId, toPropertyId, distanceKm, driveMinutes ?? null,
    )
    return NextResponse.json(row)
  } catch (error) {
    console.error('PUT /api/fleet/distances error:', error)
    return NextResponse.json({ error: 'Failed to save distance' }, { status: 500 })
  }
}
```

- [ ] **Step 5: Write the settings route**

Create `src/app/api/fleet/settings/route.ts` with `GET` returning `await getFleetSettings(profile.orgId)` for any authenticated user, and `PATCH` (admin only) validating:

```typescript
const updateSchema = z.object({
  poolingThresholdKm: z.number().min(0).max(500).optional(),
  planningHorizonDays: z.number().int().min(1).max(90).optional(),
  engineEnabled: z.boolean().optional(),
})
```
and calling `updateFleetSettings(profile.orgId, parsed.data)`.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/fleet
git commit -m "feat(fleet): add vehicle, driver, distance and settings API routes"
```

---

## Task 10: Request API routes

**Files:**
- Create: `src/app/api/fleet/requests/route.ts`, `src/app/api/fleet/requests/[id]/route.ts`

**Interfaces:**
- Consumes: `listRequests`, `createRequest`, `getRequestById`, `updateRequest`, `cancelRequest` (Task 7); `listVehicles` (Task 6); `validateFleetRequest` (Task 4)
- Produces: the endpoints the Task 14 request form calls

The cargo/capacity rules are enforced here, server-side, using the same pure function the form uses for instant feedback.

- [ ] **Step 1: Write the collection route**

Create `src/app/api/fleet/requests/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { listVehicles } from '@/lib/db/queries/fleet'
import { createRequest, listRequests } from '@/lib/db/queries/dispatches'
import { validateFleetRequest } from '@/lib/fleet/constraints'

const createSchema = z
  .object({
    requestType: z.enum(['visit', 'standalone']),
    targetPropertyId: z.string().uuid().nullable().optional(),
    originText: z.string().max(500).nullable().optional(),
    destinationText: z.string().max(500).nullable().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    paxCount: z.number().int().min(0).max(60),
    cargoRequired: z.boolean().default(false),
    purpose: z.string().max(1000).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  })
  .refine((d) => d.requestType !== 'visit' || Boolean(d.targetPropertyId), {
    message: 'A visit needs a target property',
    path: ['targetPropertyId'],
  })
  .refine((d) => d.requestType !== 'standalone' || Boolean(d.destinationText), {
    message: 'A standalone booking needs a destination',
    path: ['destinationText'],
  })

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const status = request.nextUrl.searchParams.get('status')
    const scope = request.nextUrl.searchParams.get('scope') // 'mine' | 'all'

    // Only fleet admins may see the whole org's queue.
    const seesAll = profile.isFleetAdmin || profile.role === 'admin'
    const requestedBy = scope === 'all' && seesAll ? undefined : profile.id

    const requests = await listRequests(profile.orgId, {
      status: status as 'pending' | 'queued' | 'dispatched' | 'completed' | 'cancelled' | undefined,
      requestedBy,
    })
    return NextResponse.json({ requests })
  } catch (error) {
    console.error('GET /api/fleet/requests error:', error)
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.canBookFleet && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    // Fleet constraint check against the real vehicle roster (§5.1).
    const fleet = await listVehicles(profile.orgId)
    const check = validateFleetRequest(
      { cargoRequired: data.cargoRequired, paxCount: data.paxCount },
      fleet.map((v) => ({
        id: v.id,
        name: v.name,
        maxPassengers: v.maxPassengers,
        cargoCapable: v.cargoCapable,
        isRestricted: v.isRestricted,
        status: v.status,
        currentLocationPropertyId: v.currentLocationPropertyId,
        sortOrder: v.sortOrder,
      })),
    )
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

    const created = await createRequest({
      orgId: profile.orgId,
      requestType: data.requestType,
      requestedBy: profile.id,
      targetPropertyId: data.requestType === 'visit' ? (data.targetPropertyId ?? null) : null,
      originText: data.originText ?? null,
      destinationText: data.requestType === 'standalone' ? (data.destinationText ?? null) : null,
      startDate: data.startDate,
      endDate: data.endDate,
      paxCount: data.paxCount,
      cargoRequired: data.cargoRequired,
      purpose: data.purpose ?? null,
      notes: data.notes ?? null,
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('POST /api/fleet/requests error:', error)
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Write the item route**

Create `src/app/api/fleet/requests/[id]/route.ts`. `PATCH` allows the requester (or a fleet admin) to edit a request that is still `pending`; `DELETE` cancels rather than hard-deletes.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { cancelRequest, getRequestById, updateRequest } from '@/lib/db/queries/dispatches'

type RouteContext = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  targetPropertyId: z.string().uuid().nullable().optional(),
  originText: z.string().max(500).nullable().optional(),
  destinationText: z.string().max(500).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paxCount: z.number().int().min(0).max(60).optional(),
  cargoRequired: z.boolean().optional(),
  purpose: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await getRequestById(id)
    if (!existing || existing.orgId !== profile.orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isOwner = existing.requestedBy === profile.id
    const isFleetAdmin = profile.isFleetAdmin || profile.role === 'admin'
    if (!isOwner && !isFleetAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending requests can be edited. Cancel and raise a new one.' },
        { status: 409 },
      )
    }

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    return NextResponse.json(await updateRequest(id, parsed.data))
  } catch (error) {
    console.error('PATCH /api/fleet/requests/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await getRequestById(id)
    if (!existing || existing.orgId !== profile.orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isOwner = existing.requestedBy === profile.id
    const isFleetAdmin = profile.isFleetAdmin || profile.role === 'admin'
    if (!isOwner && !isFleetAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // A dispatched request can only be cancelled by a fleet admin — the
    // vehicle is already committed and the driver has been notified.
    if (existing.status === 'dispatched' && !isFleetAdmin) {
      return NextResponse.json(
        { error: 'This trip is already dispatched. Ask a fleet admin to cancel it.' },
        { status: 409 },
      )
    }

    return NextResponse.json(await cancelRequest(id))
  } catch (error) {
    console.error('DELETE /api/fleet/requests/[id] error:', error)
    return NextResponse.json({ error: 'Failed to cancel request' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/fleet/requests
git commit -m "feat(fleet): add trip request API with server-side constraint checks"
```

---

## Task 11: Dispatch API and the 5 PM cron

**Files:**
- Create: `src/app/api/fleet/dispatches/route.ts`, `src/app/api/fleet/dispatches/[id]/route.ts`, `src/app/api/fleet/dispatches/run-engine/route.ts`
- Create: `src/app/api/cron/fleet-optimize/route.ts`

**Interfaces:**
- Consumes: Task 7 queries, `planDispatches` (Task 5), `colomboToday` (Task 2), `notify` (Task 8)
- Produces: `runFleetEngine(orgId: string): Promise<{ created: number; unassignable: UnassignableRequest[] }>` exported from `src/app/api/fleet/dispatches/run-engine/route.ts`'s sibling helper — see step 1

- [ ] **Step 1: Write the shared engine runner**

Both the button and the cron need identical behaviour, so the logic lives in one place. Create `src/lib/fleet/run-engine.ts`:

```typescript
import { colomboToday } from './dates'
import { planDispatches } from './engine'
import { loadEngineInput, replaceDraftDispatches } from '@/lib/db/queries/dispatches'
import { getFleetSettings } from '@/lib/db/queries/fleet'
import type { UnassignableRequest } from './types'

export interface EngineRunResult {
  skipped: boolean
  created: number
  unassignable: UnassignableRequest[]
}

/**
 * One full planning cycle for an org. Safe to call repeatedly: only draft
 * dispatches are rebuilt, approved ones are untouched.
 */
export async function runFleetEngine(orgId: string): Promise<EngineRunResult> {
  const settings = await getFleetSettings(orgId)
  if (!settings.engineEnabled) return { skipped: true, created: 0, unassignable: [] }

  const input = await loadEngineInput(orgId, colomboToday())
  const result = planDispatches(input)
  const persisted = await replaceDraftDispatches(orgId, result)

  return {
    skipped: false,
    created: persisted.createdDispatchIds.length,
    unassignable: result.unassignable,
  }
}
```

- [ ] **Step 2: Write the run-engine route**

Create `src/app/api/fleet/dispatches/run-engine/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { runFleetEngine } from '@/lib/fleet/run-engine'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isFleetAdmin && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await runFleetEngine(profile.orgId)
    if (result.skipped) {
      return NextResponse.json({ error: 'The pooling engine is disabled in fleet settings.' }, { status: 409 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('POST /api/fleet/dispatches/run-engine error:', error)
    return NextResponse.json({ error: 'Engine run failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Write the dispatch collection and item routes**

Create `src/app/api/fleet/dispatches/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { createManualDispatch, listDispatches } from '@/lib/db/queries/dispatches'

const createSchema = z.object({
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestIds: z.array(z.string().uuid()).default([]),
  notes: z.string().max(2000).nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isFleetAdmin && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const status = request.nextUrl.searchParams.get('status')
    const dispatches = await listDispatches(profile.orgId, {
      status: status as 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled' | undefined,
    })
    return NextResponse.json({ dispatches })
  } catch (error) {
    console.error('GET /api/fleet/dispatches error:', error)
    return NextResponse.json({ error: 'Failed to fetch dispatches' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isFleetAdmin && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    if (parsed.data.endDate < parsed.data.startDate) {
      return NextResponse.json({ error: 'End date cannot be before the start date' }, { status: 400 })
    }

    const dispatch = await createManualDispatch(profile.orgId, {
      ...parsed.data,
      notes: parsed.data.notes ?? null,
    })
    return NextResponse.json(dispatch, { status: 201 })
  } catch (error) {
    console.error('POST /api/fleet/dispatches error:', error)
    return NextResponse.json({ error: 'Failed to create dispatch' }, { status: 500 })
  }
}
```

Create `src/app/api/fleet/dispatches/[id]/route.ts` with a `POST` that approves and notifies:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { approveDispatch, getDispatchWithStops, getRequestById } from '@/lib/db/queries/dispatches'
import { notify } from '@/lib/fleet/push'
import { formatDayMonth } from '@/lib/fleet/dates'

type RouteContext = { params: Promise<{ id: string }> }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tvpl.morpheusds.com'

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isFleetAdmin && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const approved = await approveDispatch(id, profile.id)
    if (!approved) {
      return NextResponse.json({ error: 'Dispatch not found or already approved' }, { status: 409 })
    }

    // Notifications are best-effort — a push failure must never undo the
    // approval, so this block never throws.
    try {
      const full = await getDispatchWithStops(id)
      const window = `${formatDayMonth(approved.startDate)}–${formatDayMonth(approved.endDate)}`

      await notify({
        orgId: profile.orgId,
        driverId: approved.driverId,
        type: 'dispatch_assigned',
        title: 'New trip assigned',
        body: `You have a trip on ${window}. Open your manifest for details.`,
        linkUrl: `${APP_URL}/d/`,
      })

      const notified = new Set<string>()
      for (const stop of full?.stops ?? []) {
        if (!stop.requestId) continue
        const req = await getRequestById(stop.requestId)
        if (!req || notified.has(req.requestedBy)) continue
        notified.add(req.requestedBy)
        await notify({
          orgId: profile.orgId,
          profileId: req.requestedBy,
          type: 'request_dispatched',
          title: 'Your trip is confirmed',
          body: `Transport confirmed for ${window}.`,
          linkUrl: `${APP_URL}/fleet`,
        })
      }
    } catch (notifyError) {
      console.error('Dispatch approved but notification failed:', notifyError)
    }

    return NextResponse.json(approved)
  } catch (error) {
    console.error('POST /api/fleet/dispatches/[id] error:', error)
    return NextResponse.json({ error: 'Failed to approve dispatch' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Write the cron route**

Create `src/app/api/cron/fleet-optimize/route.ts`, following the Bearer-token shape of `src/app/api/cron/electricity-autofill/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import { runFleetEngine } from '@/lib/fleet/run-engine'

export const dynamic = 'force-dynamic'

function bearerOk(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run() {
  const orgs = await db.select({ id: organizations.id }).from(organizations)
  const results: { orgId: string; created: number; unassignable: number; skipped: boolean }[] = []

  for (const org of orgs) {
    const r = await runFleetEngine(org.id)
    results.push({
      orgId: org.id,
      created: r.created,
      unassignable: r.unassignable.length,
      skipped: r.skipped,
    })
  }

  return results
}

export async function GET(request: NextRequest) {
  if (!bearerOk(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, results: await run() })
  } catch (error) {
    console.error('GET /api/cron/fleet-optimize error:', error)
    return NextResponse.json({ error: 'Engine run failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fleet/run-engine.ts src/app/api/fleet/dispatches src/app/api/cron/fleet-optimize
git commit -m "feat(fleet): add dispatch approval, manual assign and 5pm optimisation cron"
```

---

## Task 12: Driver token API

**Files:**
- Create: `src/app/api/fleet/driver/[token]/route.ts`
- Create: `src/app/api/fleet/driver/[token]/status/route.ts`
- Create: `src/app/api/fleet/driver/[token]/push/route.ts`

**Interfaces:**
- Consumes: `getDriverByToken` (Task 6); `getDriverDispatches`, `markDispatchStarted`, `markStopArrived`, `completeDispatch` (Task 7); `saveSubscription` (Task 8)
- Produces: the endpoints the Task 16 manifest page calls

Every write is scoped by `driverId` resolved from the token, so a valid token can only ever touch its own driver's dispatches.

- [ ] **Step 1: Write the manifest read route**

Create `src/app/api/fleet/driver/[token]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDriverByToken } from '@/lib/db/queries/fleet'
import { getDriverDispatches } from '@/lib/db/queries/dispatches'
import { colomboToday } from '@/lib/fleet/dates'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ token: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params
    const driver = await getDriverByToken(token)
    if (!driver || !driver.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const dispatches = await getDriverDispatches(driver.id, colomboToday())
    return NextResponse.json({
      driver: {
        fullName: driver.fullName,
        preferredLanguage: driver.preferredLanguage,
      },
      dispatches,
    })
  } catch (error) {
    console.error('GET /api/fleet/driver/[token] error:', error)
    return NextResponse.json({ error: 'Failed to load manifest' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Write the status progression route**

Create `src/app/api/fleet/driver/[token]/status/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDriverByToken } from '@/lib/db/queries/fleet'
import {
  completeDispatch,
  getDispatchWithStops,
  getRequestById,
  markDispatchStarted,
  markStopArrived,
} from '@/lib/db/queries/dispatches'
import { notify } from '@/lib/fleet/push'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ token: string }> }

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), dispatchId: z.string().uuid() }),
  z.object({ action: z.literal('arrive'), stopId: z.string().uuid() }),
  z.object({ action: z.literal('complete'), dispatchId: z.string().uuid() }),
])

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params
    const driver = await getDriverByToken(token)
    if (!driver || !driver.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    const body = parsed.data

    if (body.action === 'start') {
      const updated = await markDispatchStarted(body.dispatchId, driver.id)
      if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'arrive') {
      const updated = await markStopArrived(body.stopId, driver.id)
      if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ ok: true })
    }

    const full = await getDispatchWithStops(body.dispatchId)
    const completed = await completeDispatch(body.dispatchId, driver.id)
    if (!completed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    try {
      const notified = new Set<string>()
      for (const stop of full?.stops ?? []) {
        if (!stop.requestId) continue
        const req = await getRequestById(stop.requestId)
        if (!req || notified.has(req.requestedBy)) continue
        notified.add(req.requestedBy)
        await notify({
          orgId: completed.orgId,
          profileId: req.requestedBy,
          type: 'trip_completed',
          title: 'Trip completed',
          body: `${driver.fullName} has completed your trip.`,
          linkUrl: '/fleet',
        })
      }
    } catch (notifyError) {
      console.error('Trip completed but notification failed:', notifyError)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('POST /api/fleet/driver/[token]/status error:', error)
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Write the push subscription route**

Create `src/app/api/fleet/driver/[token]/push/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDriverByToken } from '@/lib/db/queries/fleet'
import { saveSubscription } from '@/lib/db/queries/notifications'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ token: string }> }

const subscriptionSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params
    const driver = await getDriverByToken(token)
    if (!driver || !driver.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    await saveSubscription({
      driverId: driver.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: request.headers.get('user-agent'),
    })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error('POST /api/fleet/driver/[token]/push error:', error)
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/fleet/driver
git commit -m "feat(fleet): add token-scoped driver manifest, status and push APIs"
```

---

## Task 13: Admin configuration pages

**Files:**
- Create: `src/app/(portal)/admin/fleet/vehicles/page.tsx`, `drivers/page.tsx`, `distances/page.tsx`
- Create: `src/components/fleet/vehicles-client.tsx`, `drivers-client.tsx`, `distances-grid.tsx`

**Interfaces:**
- Consumes: Task 9 API routes; `listVehicles`, `listDrivers`, `listDistances` (Task 6); `getProperties` from `@/lib/db/queries/properties`
- Produces: seeded vehicle and driver data for every later task

Mirror `src/components/admin/user-table.tsx` for table layout, dialog handling and delete confirmation. Do not invent a new pattern.

- [ ] **Step 1: Write the vehicles page**

Create `src/app/(portal)/admin/fleet/vehicles/page.tsx`:

```typescript
import { requireRole } from '@/lib/auth/guards'
import { listVehicles } from '@/lib/db/queries/fleet'
import { getProperties } from '@/lib/db/queries/properties'
import { VehiclesClient } from '@/components/fleet/vehicles-client'

export const dynamic = 'force-dynamic'

export default async function FleetVehiclesPage() {
  const profile = await requireRole(['admin'])
  const [vehicles, properties] = await Promise.all([
    listVehicles(profile.orgId),
    getProperties(profile.orgId),
  ])

  return <VehiclesClient vehicles={vehicles} properties={properties} />
}
```

- [ ] **Step 2: Write the vehicles client component**

Create `src/components/fleet/vehicles-client.tsx`. A table of vehicles plus a create/edit dialog. Required fields and behaviours:

- Columns: Name, Registration, Seats, Cargo (badge when `cargoCapable`), Restricted (badge when `isRestricted`), Status, Currently at (property name or "Head office"), row actions.
- Create/edit dialog fields: `name` (text, required), `registrationNo` (text), `maxPassengers` (number, required, min 0), `cargoCapable` (switch), `isRestricted` (switch, with helper text "Only executives with restricted-vehicle access can book this"), `status` (select of active/maintenance/retired), `currentLocationPropertyId` (select of properties plus a "Head office" option mapping to `null`), `sortOrder` (number).
- Submit posts to `/api/fleet/vehicles` (create) or PATCHes `/api/fleet/vehicles/${id}` (edit), then `toast.success(...)` and `router.refresh()`.
- Delete uses the `AlertDialog` confirmation pattern. On a `409` response, surface the server's message with `toast.error()` — that is the "vehicle has dispatches" case, and it is expected, not a bug.
- Empty state: `Truck` icon from lucide-react, "No vehicles yet", "Add the Bolero Lorry, Car 1 and Car 2 to get started.", primary button opening the create dialog.

Follow the form/submit/toast shape shown in the skill's component template and in `src/components/admin/user-table.tsx`.

- [ ] **Step 3: Write the drivers page and client**

Create `src/app/(portal)/admin/fleet/drivers/page.tsx`:

```typescript
import { requireRole } from '@/lib/auth/guards'
import { listDrivers, listVehicles } from '@/lib/db/queries/fleet'
import { DriversClient } from '@/components/fleet/drivers-client'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tvpl.morpheusds.com'

export default async function FleetDriversPage() {
  const profile = await requireRole(['admin'])
  const [drivers, vehicles] = await Promise.all([
    listDrivers(profile.orgId),
    listVehicles(profile.orgId),
  ])

  return <DriversClient drivers={drivers} vehicles={vehicles} appUrl={APP_URL} />
}
```

Create `src/components/fleet/drivers-client.tsx`:

- Columns: Name, Phone, Language, Licensed for (vehicle name badges), Active, Manifest link, actions.
- Create/edit dialog: `fullName`, `phone`, `preferredLanguage` (select en/si/ta), `isActive` (switch), and **a checkbox per vehicle** bound to `vehicleIds`. Label the checkbox group "Licensed to drive" with helper text "A driver can only be dispatched with a vehicle ticked here."
- The manifest link cell shows a copy button that writes `${appUrl}/d/${driver.accessToken}` to the clipboard via `navigator.clipboard.writeText` and fires `toast.success('Manifest link copied')`.
- Add a "Show QR" action that renders the same URL as a QR code. Reuse the existing approach from the asset registry — the `qrcode` package is already a dependency; look at how `src/components/assets/` generates its labels and follow it exactly rather than introducing a second QR approach.
- Include a short instruction block above the table, because driver onboarding is the most failure-prone part of this feature:

  > Send the driver their manifest link. They must open it **in Chrome or Samsung Internet** (not inside WhatsApp), choose **Add to Home Screen**, then tap **Allow** when asked about notifications. Without those steps they will not receive trip alerts.

- [ ] **Step 4: Write the distances page and grid**

Create `src/app/(portal)/admin/fleet/distances/page.tsx`:

```typescript
import { requireRole } from '@/lib/auth/guards'
import { listDistances } from '@/lib/db/queries/fleet'
import { getProperties } from '@/lib/db/queries/properties'
import { DistancesGrid } from '@/components/fleet/distances-grid'

export const dynamic = 'force-dynamic'

export default async function FleetDistancesPage() {
  const profile = await requireRole(['admin'])
  const [distances, properties] = await Promise.all([
    listDistances(profile.orgId),
    getProperties(profile.orgId),
  ])

  return <DistancesGrid distances={distances} properties={properties} />
}
```

Create `src/components/fleet/distances-grid.tsx`:

- Nodes are `[{ id: null, name: 'Head Office' }, ...properties]` — head office first.
- Render an upper-triangular grid: rows and columns are nodes, the diagonal shows a dash, and only cells above the diagonal are editable (the lower half mirrors them, since lookups are symmetric).
- Each editable cell is a small numeric input holding km. On blur, if the value changed, `PUT /api/fleet/distances` with `{ fromPropertyId, toPropertyId, distanceKm, driveMinutes: null }`, then `toast.success('Saved')` on success.
- Wrap the grid in `<div className="overflow-x-auto">` — 11 columns will not fit a phone.
- Show a hint above it: "Distances are used to decide which trips can share a vehicle. Blank pairs are treated as too far apart to pool."

That last sentence matters and must appear: it is the user-facing consequence of `lookupDistanceKm` returning `null`.

- [ ] **Step 5: Seed the initial fleet**

With the app running (`npm run dev`), sign in as an admin and create the three starting vehicles through the UI:

| Name | Seats | Cargo | Restricted |
|---|---|---|---|
| Bolero Lorry | 1 | yes | no |
| Car 1 | 4 | no | yes |
| Car 2 | 4 | no | yes |

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit clean.

Then manually: create a vehicle, edit it, try to delete one referenced by nothing (succeeds), create a driver with one vehicle ticked, copy the manifest link, enter a distance and confirm it persists after a page reload.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(portal)/admin/fleet" src/components/fleet
git commit -m "feat(fleet): add vehicle, driver and distance admin pages"
```

---

## Task 14: Request page and form

**Files:**
- Create: `src/app/(portal)/fleet/page.tsx`
- Create: `src/components/fleet/request-form.tsx`, `src/components/fleet/requests-table.tsx`

**Interfaces:**
- Consumes: Task 10 API routes; `listRequests` (Task 7); `listVehicles` (Task 6); `validateFleetRequest` (Task 4)
- Produces: the request queue the dispatch board consumes

- [ ] **Step 1: Write the page**

Create `src/app/(portal)/fleet/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { listRequests } from '@/lib/db/queries/dispatches'
import { listVehicles } from '@/lib/db/queries/fleet'
import { getProperties } from '@/lib/db/queries/properties'
import { RequestsTable } from '@/components/fleet/requests-table'

export const dynamic = 'force-dynamic'

export default async function FleetPage() {
  const profile = await requireAuth()
  if (!profile) return null

  const isFleetAdmin = profile.isFleetAdmin || profile.role === 'admin'
  if (!profile.canBookFleet && !isFleetAdmin) redirect('/surveys')

  const [requests, vehicles, properties] = await Promise.all([
    listRequests(profile.orgId, isFleetAdmin ? {} : { requestedBy: profile.id }),
    listVehicles(profile.orgId),
    getProperties(profile.orgId),
  ])

  return (
    <RequestsTable
      requests={requests}
      vehicles={vehicles}
      properties={properties}
      currentUserId={profile.id}
      isFleetAdmin={isFleetAdmin}
    />
  )
}
```

- [ ] **Step 2: Write the request form**

Create `src/components/fleet/request-form.tsx`. This is where §5.1 becomes visible to users, so the constraint feedback must be immediate.

Required behaviour:

- Two tabs at the top of the dialog: **Property visit** and **Other trip**, setting `requestType` to `visit` / `standalone`.
- Visit fields: `targetPropertyId` (select of active properties), `startDate`, `endDate` (date inputs), `paxCount` (number), `cargoRequired` (switch, labelled "Needs cargo transport"), `purpose` (textarea), `notes` (textarea).
- Standalone fields: `originText`, `destinationText` (text inputs, e.g. "Head Office" → "Bandaranaike Airport"), same dates, pax, cargo, notes.
- **Live constraint check.** Import `validateFleetRequest` from `@/lib/fleet/constraints` and run it on every change of `cargoRequired` or `paxCount`, passing the `vehicles` prop mapped to `EngineVehicle` shape. When it returns `{ ok: false }`, render the error under the passenger field in `text-sm text-destructive` and disable the submit button. This is the same function the API enforces, so the message the user sees is exactly the message the server would return.
- Submit `POST /api/fleet/requests`; on failure read `body.error` and `toast.error()` it; on success `toast.success('Request submitted')`, call `onSuccess?.()`, and `router.refresh()`.
- Disable the submit button while `isSubmitting`, with the label switching to "Submitting…".

Map vehicles for the validator like this — the prop arrives as Drizzle rows, and the validator wants engine types:

```typescript
const engineVehicles = vehicles.map((v) => ({
  id: v.id,
  name: v.name,
  maxPassengers: v.maxPassengers,
  cargoCapable: v.cargoCapable,
  isRestricted: v.isRestricted,
  status: v.status,
  currentLocationPropertyId: v.currentLocationPropertyId,
  sortOrder: v.sortOrder,
}))
```

- [ ] **Step 3: Write the requests table**

Create `src/components/fleet/requests-table.tsx`:

- Header row with a "New request" button opening the `RequestForm` in a `Dialog`.
- Status filter via nuqs `useQueryState('status', { shallow: false })`, options: All, Pending, Queued, Dispatched, Completed, Cancelled.
- For fleet admins, a second filter toggling "My requests" / "All requests" (nuqs key `scope`).
- Columns: Type (badge), Destination (property name, or `destinationText` for standalone), Dates (`formatDayMonth(start)`–`formatDayMonth(end)`), Pax, Cargo (badge when true), Requester, Status (colour-coded badge), actions.
- Status badge colours, following the codebase convention:

```typescript
const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  queued: 'bg-blue-100 text-blue-800',
  dispatched: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-slate-100 text-slate-800',
  cancelled: 'bg-red-100 text-red-800',
}
```

- Cancel action on rows the user owns (or any row for a fleet admin) using the `AlertDialog` pattern, calling `DELETE /api/fleet/requests/${id}`.
- Empty state with the `CarFront` icon: "No trip requests yet" / "Raise a request and the fleet team will assign a vehicle."

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

Then manually: raise a visit request; set cargo on with 2 passengers and confirm the exact message *"Lorry cargo transport standard limits maximum passenger count to 1."* appears and blocks submission; drop to 1 passenger and confirm it submits.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(portal)/fleet/page.tsx" src/components/fleet/request-form.tsx src/components/fleet/requests-table.tsx
git commit -m "feat(fleet): add trip request page with live constraint validation"
```

---

## Task 15: Dispatch review board

**Files:**
- Create: `src/app/(portal)/fleet/dispatch/page.tsx`
- Create: `src/components/fleet/dispatch-board.tsx`, `src/components/fleet/dispatch-editor-dialog.tsx`

**Interfaces:**
- Consumes: Task 11 API routes; `listDispatches`, `listRequests` (Task 7); `listVehicles`, `listDrivers` (Task 6); `driverHasSubscription` (Task 8)
- Produces: the approval action that triggers driver and requester notifications

This is the brief's "Admin Review Canvas". Per the spec's deviation 4, it is a click-to-reassign timeline, not drag-and-drop.

- [ ] **Step 1: Write the page**

Create `src/app/(portal)/fleet/dispatch/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { listDispatches, listRequests } from '@/lib/db/queries/dispatches'
import { listDrivers, listVehicles } from '@/lib/db/queries/fleet'
import { driverHasSubscription } from '@/lib/db/queries/notifications'
import { DispatchBoard } from '@/components/fleet/dispatch-board'

export const dynamic = 'force-dynamic'

export default async function DispatchPage() {
  const profile = await requireAuth()
  if (!profile) return null
  if (!profile.isFleetAdmin && profile.role !== 'admin') redirect('/fleet')

  const [dispatches, pendingRequests, vehicles, drivers] = await Promise.all([
    listDispatches(profile.orgId),
    listRequests(profile.orgId, { status: 'pending' }),
    listVehicles(profile.orgId),
    listDrivers(profile.orgId),
  ])

  const driversWithPush = await Promise.all(
    drivers.map(async (d) => ({ ...d, hasPush: await driverHasSubscription(d.id) })),
  )

  return (
    <DispatchBoard
      dispatches={dispatches}
      pendingRequests={pendingRequests}
      vehicles={vehicles}
      drivers={driversWithPush}
    />
  )
}
```

- [ ] **Step 2: Write the board**

Create `src/components/fleet/dispatch-board.tsx`. Sections, top to bottom:

1. **Toolbar** — a "Run engine now" button (`POST /api/fleet/dispatches/run-engine`), and a "New dispatch" button opening `DispatchEditorDialog`. While the engine runs, disable the button and label it "Planning…". On success:

```typescript
toast.success(
  result.created === 0
    ? 'Engine ran — no new dispatches to draft'
    : `Engine drafted ${result.created} dispatch${result.created === 1 ? '' : 'es'}`,
)
router.refresh()
```

On a `409`, the engine is disabled in settings — surface `body.error` via `toast.error()`.

2. **Timeline** — one row per vehicle, columns for the next 14 days starting today (`colomboToday()` then `addDays`). A dispatch renders as a bar spanning its date range inside its vehicle's row, showing driver name and stop count. Colour by status using the badge convention: draft amber, approved emerald, in_progress blue, completed slate. Wrap in `overflow-x-auto`. Clicking a bar opens `DispatchEditorDialog` for that dispatch.

3. **Drafts awaiting approval** — a card list of `status === 'draft'` dispatches. Each card shows vehicle, driver, window, and an ordered stop list with property, requester and pax. Two actions:
   - **Approve & Dispatch** → `POST /api/fleet/dispatches/${id}` → `toast.success('Dispatched — driver notified')` → `router.refresh()`
   - **Edit** → opens the editor dialog
   
   Next to the driver name, render the push status. This is the operationally important bit — an admin must be able to see who cannot be reached before relying on a notification:

```typescript
{driver.hasPush ? (
  <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
    <BellRing className="size-3" /> Push enabled
  </span>
) : (
  <span className="inline-flex items-center gap-1 text-xs text-amber-600">
    <BellOff className="size-3" /> No push — contact the driver directly
  </span>
)}
```

4. **Unassigned requests** — pending requests not attached to any draft, each with its engine reason if one was returned by the last run, plus an "Assign manually" button opening the editor dialog pre-filled with that request. The reasons come back from the run-engine response; hold them in component state keyed by `requestId` after a run.

5. **Empty state** — `CalendarClock` icon, "Nothing scheduled", "Run the engine to draft dispatches from pending requests."

- [ ] **Step 3: Write the editor dialog**

Create `src/components/fleet/dispatch-editor-dialog.tsx`:

- Fields: `vehicleId` (select), `driverId` (select), `startDate`, `endDate`, and a multi-select checkbox list of pending requests to attach.
- **The driver select must be filtered by the chosen vehicle.** Compute it from the `drivers` prop's `vehicleIds`:

```typescript
const eligibleDrivers = drivers.filter(
  (d) => d.isActive && vehicleId !== '' && d.vehicleIds.includes(vehicleId),
)
```

When a vehicle is selected and `eligibleDrivers` is empty, show `No driver is licensed for this vehicle.` in `text-sm text-destructive` and disable submit. This makes the licence rule impossible to violate from the UI, matching what the engine enforces server-side.

- Warn (do not block) when the summed pax of the attached requests exceeds the vehicle's `maxPassengers`, in `text-sm text-amber-600`: `Selected trips carry N passengers but this vehicle seats M.` A fleet admin overriding deliberately is legitimate; silently allowing it without a warning is not.
- Submit `POST /api/fleet/dispatches`, then `toast.success('Dispatch created')` and `router.refresh()`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

Then manually: raise two nearby overlapping visit requests, click "Run engine now", confirm one draft appears with two stops, approve it, and confirm both requests move to `dispatched` on `/fleet`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(portal)/fleet/dispatch" src/components/fleet/dispatch-board.tsx src/components/fleet/dispatch-editor-dialog.tsx
git commit -m "feat(fleet): add dispatch review board with engine run and approval"
```

---

## Task 16: Driver manifest

**Files:**
- Create: `src/lib/fleet/manifest-strings.ts`
- Create: `src/app/(public)/d/[token]/page.tsx`
- Create: `src/components/fleet/driver-manifest.tsx`, `src/components/fleet/push-setup-banner.tsx`

**Interfaces:**
- Consumes: Task 12 API routes; `getDriverByToken` (Task 6); `getDriverDispatches` (Task 7)
- Produces: nothing downstream

- [ ] **Step 1: Write the string map**

Create `src/lib/fleet/manifest-strings.ts`. The Sinhala and Tamil values are **unreviewed drafts** — the UI must say so until a native speaker signs them off.

```typescript
export type ManifestLanguage = 'en' | 'si' | 'ta'

export interface ManifestStrings {
  todaysTrip: string
  upcomingTrips: string
  noTrips: string
  startTrip: string
  arrived: string
  arrivedAt: string
  completeTrip: string
  vehicle: string
  passengers: string
  cargo: string
  stops: string
  inProgress: string
  enableNotifications: string
  notificationsOn: string
  setupTitle: string
  setupStep1: string
  setupStep2: string
  setupStep3: string
  loading: string
  loadError: string
  retry: string
  draftNotice: string
}

/**
 * SI and TA are first-pass drafts pending native-speaker review. Correcting
 * them is a data edit here — no component changes required.
 */
export const MANIFEST_STRINGS: Record<ManifestLanguage, ManifestStrings> = {
  en: {
    todaysTrip: "Today's trip",
    upcomingTrips: 'Upcoming trips',
    noTrips: 'No trips assigned',
    startTrip: 'Start trip',
    arrived: 'Arrived',
    arrivedAt: 'Arrived at',
    completeTrip: 'Complete trip',
    vehicle: 'Vehicle',
    passengers: 'Passengers',
    cargo: 'Cargo',
    stops: 'Stops',
    inProgress: 'In progress',
    enableNotifications: 'Turn on trip alerts',
    notificationsOn: 'Trip alerts are on',
    setupTitle: 'Get trip alerts on this phone',
    setupStep1: 'Open this page in Chrome (not inside WhatsApp)',
    setupStep2: 'Tap the menu and choose "Add to Home screen"',
    setupStep3: 'Tap Allow when asked about notifications',
    loading: 'Loading…',
    loadError: 'Could not load your trips',
    retry: 'Try again',
    draftNotice: 'Sinhala and Tamil wording is a draft pending review.',
  },
  si: {
    todaysTrip: 'අද ගමන',
    upcomingTrips: 'ඉදිරි ගමන්',
    noTrips: 'ගමන් පවරා නැත',
    startTrip: 'ගමන අරඹන්න',
    arrived: 'පැමිණියා',
    arrivedAt: 'පැමිණි වේලාව',
    completeTrip: 'ගමන අවසන් කරන්න',
    vehicle: 'වාහනය',
    passengers: 'මගීන්',
    cargo: 'බඩු',
    stops: 'නැවතුම්',
    inProgress: 'ගමනේ යෙදී සිටී',
    enableNotifications: 'ගමන් දැනුම්දීම් සක්‍රීය කරන්න',
    notificationsOn: 'ගමන් දැනුම්දීම් සක්‍රීයයි',
    setupTitle: 'මෙම දුරකථනයෙන් ගමන් දැනුම්දීම් ලබාගන්න',
    setupStep1: 'මෙම පිටුව Chrome තුළ විවෘත කරන්න (WhatsApp තුළ නොවේ)',
    setupStep2: 'මෙනුව තට්ටු කර "Add to Home screen" තෝරන්න',
    setupStep3: 'දැනුම්දීම් ගැන විමසූ විට Allow තට්ටු කරන්න',
    loading: 'පූරණය වෙමින්…',
    loadError: 'ඔබගේ ගමන් පූරණය කළ නොහැකි විය',
    retry: 'නැවත උත්සාහ කරන්න',
    draftNotice: 'සිංහල හා දෙමළ පරිවර්තන සමාලෝචනය අපේක්ෂාවෙන් පවතී.',
  },
  ta: {
    todaysTrip: 'இன்றைய பயணம்',
    upcomingTrips: 'வரவிருக்கும் பயணங்கள்',
    noTrips: 'பயணங்கள் ஒதுக்கப்படவில்லை',
    startTrip: 'பயணத்தைத் தொடங்கு',
    arrived: 'வந்துவிட்டேன்',
    arrivedAt: 'வந்த நேரம்',
    completeTrip: 'பயணத்தை முடி',
    vehicle: 'வாகனம்',
    passengers: 'பயணிகள்',
    cargo: 'சரக்கு',
    stops: 'நிறுத்தங்கள்',
    inProgress: 'பயணத்தில்',
    enableNotifications: 'பயண அறிவிப்புகளை இயக்கு',
    notificationsOn: 'பயண அறிவிப்புகள் இயக்கத்தில்',
    setupTitle: 'இந்தத் தொலைபேசியில் பயண அறிவிப்புகளைப் பெறுங்கள்',
    setupStep1: 'இந்தப் பக்கத்தை Chrome இல் திறக்கவும் (WhatsApp இல் அல்ல)',
    setupStep2: 'மெனுவைத் தட்டி "Add to Home screen" என்பதைத் தேர்வுசெய்க',
    setupStep3: 'அறிவிப்புகள் பற்றி கேட்கும்போது Allow என்பதைத் தட்டவும்',
    loading: 'ஏற்றுகிறது…',
    loadError: 'உங்கள் பயணங்களை ஏற்ற முடியவில்லை',
    retry: 'மீண்டும் முயற்சிக்கவும்',
    draftNotice: 'சிங்களம் மற்றும் தமிழ் மொழிபெயர்ப்புகள் மதிப்பாய்வுக்கு உட்பட்டவை.',
  },
}
```

- [ ] **Step 2: Write the page**

Create `src/app/(public)/d/[token]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { getDriverByToken } from '@/lib/db/queries/fleet'
import { getDriverDispatches } from '@/lib/db/queries/dispatches'
import { colomboToday } from '@/lib/fleet/dates'
import { DriverManifest } from '@/components/fleet/driver-manifest'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ token: string }> }

export default async function DriverManifestPage({ params }: PageProps) {
  const { token } = await params
  const driver = await getDriverByToken(token)
  if (!driver || !driver.isActive) notFound()

  const dispatches = await getDriverDispatches(driver.id, colomboToday())

  return (
    <DriverManifest
      token={token}
      driverName={driver.fullName}
      initialLanguage={driver.preferredLanguage}
      initialDispatches={dispatches}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''}
    />
  )
}
```

- [ ] **Step 3: Write the push setup banner**

Create `src/components/fleet/push-setup-banner.tsx`. This owns all service-worker and subscription logic.

```typescript
'use client'

import { useEffect, useState } from 'react'
import { BellRing, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ManifestStrings } from '@/lib/fleet/manifest-strings'

/** VAPID keys are base64url; PushManager wants a Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

interface PushSetupBannerProps {
  token: string
  vapidPublicKey: string
  strings: ManifestStrings
}

export function PushSetupBanner({ token, vapidPublicKey, strings }: PushSetupBannerProps) {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window
    setSupported(ok)
    if (!ok) return

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSupported(false))
  }, [])

  async function enable() {
    if (!vapidPublicKey) {
      toast.error('Notifications are not configured. Contact the office.')
      return
    }
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Notifications were blocked. Enable them in your browser settings.')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      const res = await fetch(`/api/fleet/driver/${token}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!res.ok) throw new Error('Could not save subscription')

      setSubscribed(true)
      toast.success(strings.notificationsOn)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not turn on alerts')
    } finally {
      setBusy(false)
    }
  }

  // A browser without push support (or WhatsApp's in-app view) still gets the
  // manifest — it just cannot be alerted, so say so rather than showing a
  // button that will never work.
  if (!supported) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">{strings.setupTitle}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>{strings.setupStep1}</li>
          <li>{strings.setupStep2}</li>
          <li>{strings.setupStep3}</li>
        </ol>
      </div>
    )
  }

  if (subscribed) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="size-4" /> {strings.notificationsOn}
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="mb-3 text-sm font-medium text-amber-900">{strings.setupTitle}</p>
      <Button onClick={enable} disabled={busy} size="lg" className="w-full">
        <BellRing className="mr-2 size-5" />
        {busy ? '…' : strings.enableNotifications}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Write the manifest component**

Create `src/components/fleet/driver-manifest.tsx`. Built for a Samsung Galaxy A06 held in one hand: minimum `text-base`, buttons at least `h-14`, generous spacing, no dense tables.

Required behaviour:

- Language toggle: three buttons (English / සිංහල / தமிழ்) in a row at the top. Selected language persists to `localStorage` under `taru-driver-lang`, read on mount with `initialLanguage` as the fallback. Look up copy via `MANIFEST_STRINGS[lang]`.
- Render `<PushSetupBanner token={token} vapidPublicKey={vapidPublicKey} strings={strings} />` directly beneath the toggle.
- Show `strings.draftNotice` in small muted text at the foot of the page whenever `lang !== 'en'`.
- Today's trip (a dispatch whose window contains today) renders as a large card: vehicle name + registration, window, then the ordered stops. Each stop shows property name, location, pax and a cargo badge, plus an **Arrived** button (`POST /api/fleet/driver/${token}/status` with `{ action: 'arrive', stopId }`) that becomes a timestamp once `arrivedAt` is set.
- A primary action button at the bottom of the today card: **Start trip** when `status === 'approved'`, **Complete trip** when `status === 'in_progress'`. Both POST to the status endpoint with the matching action.
- After any successful status write, call `router.refresh()` so the server component re-fetches. Show a toast on failure.
- Upcoming trips render as a simple list below, read-only.
- Empty state: large centred `strings.noTrips`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fleet/manifest-strings.ts "src/app/(public)/d" src/components/fleet/driver-manifest.tsx src/components/fleet/push-setup-banner.tsx
git commit -m "feat(fleet): add trilingual driver manifest with web push setup"
```

---

## Task 17: Navigation, middleware and end-to-end verification

**Files:**
- Modify: `src/middleware.ts:41-52` (isPublicRoute)
- Modify: `src/components/layout/app-sidebar.tsx:64-86` (nav arrays) and `:141-145` (visibility filter)
- Modify: `src/components/layout/header.tsx:17-37` (segmentLabels)

**Interfaces:**
- Consumes: every prior task
- Produces: the shipped feature

- [ ] **Step 1: Open the driver routes in middleware**

In `src/middleware.ts`, add two lines to the `isPublicRoute` expression, after the existing `/u/` entry:

```typescript
    request.nextUrl.pathname.startsWith('/d/') ||
```

and after `/api/utilities/extract-reading`:

```typescript
    request.nextUrl.pathname.startsWith('/api/fleet/driver/') ||
```

Without both, a driver opening their link is bounced to `/login` and the feature is dead on arrival.

- [ ] **Step 2: Add sidebar navigation**

In `src/components/layout/app-sidebar.tsx`, add `Truck` and `CalendarClock` to the existing `lucide-react` import, then add to `mainNavItems` after the Asset Registry entry:

```typescript
  { title: 'Fleet', href: '/fleet', icon: Truck },
  { title: 'Dispatch', href: '/fleet/dispatch', icon: CalendarClock },
```

Add to `adminNavItems`:

```typescript
  { title: 'Vehicles', href: '/admin/fleet/vehicles', icon: Truck },
  { title: 'Drivers', href: '/admin/fleet/drivers', icon: Users },
  { title: 'Distances', href: '/admin/fleet/distances', icon: Route },
```

(`Route` also needs adding to the icon import; `Users` is already imported.)

Then extend the visibility filter at `:141-145` so the two new main entries respect the fleet permissions:

```typescript
  const isFleetAdmin = profile.isFleetAdmin || profile.role === 'admin'
  const canSeeFleet = profile.canBookFleet || isFleetAdmin

  const visibleMainNavItems = mainNavItems.filter((item) => {
    if (item.href === '/dashboard') return showAdminSection
    if (item.href === '/issues') return showIssuesNav
    if (item.href === '/fleet') return canSeeFleet
    if (item.href === '/fleet/dispatch') return isFleetAdmin
    return true
  })
```

One wrinkle: `isActive()` uses `pathname.startsWith(href)`, so `/fleet/dispatch` would light up the `/fleet` entry too. Add a case alongside the existing `/dashboard` and `/sops` exceptions:

```typescript
    if (href === '/fleet') {
      return pathname === '/fleet'
    }
```

- [ ] **Step 3: Add breadcrumb labels**

In `src/components/layout/header.tsx`, add to `segmentLabels`:

```typescript
  fleet: 'Fleet',
  dispatch: 'Dispatch',
  vehicles: 'Vehicles',
  drivers: 'Drivers',
  distances: 'Distances',
```

- [ ] **Step 4: Grant fleet permissions to real users**

The migration gave every `admin` both `isFleetAdmin` and `canBookFleet`. Visiting executives who are not admins need `canBookFleet` set. There is no UI for these flags in this slice, so set them in the Supabase SQL editor:

```sql
UPDATE profiles SET can_book_fleet = true
WHERE email IN ('exec1@taruvillas.com', 'exec2@taruvillas.com');

UPDATE profiles SET can_use_restricted_vehicles = true
WHERE email = 'ceo@taruvillas.com';
```

Substitute the real addresses. Adding these as toggles on `/admin/users` is a deferred follow-up.

- [ ] **Step 5: Full verification**

```bash
npx tsc --noEmit
npm run lint
npm run test
```

Expected: tsc silent, lint clean, all vitest suites pass (the four pre-existing `src/lib/assets/*` files plus the four new `src/lib/fleet/*` files).

Do not run `npm run build` locally — it hangs on macOS. Coolify's build is authoritative.

- [ ] **Step 6: Manual end-to-end pass**

Run `npm run dev` and walk the whole flow. Every line here has failed in some system at some point; check them off individually.

1. As admin, create the three vehicles and two drivers, one licensed only for cars.
2. Enter a distance between two properties under the 40 km threshold, and another over it.
3. Raise a visit request with cargo on and 2 passengers → confirm the block with the exact string *"Lorry cargo transport standard limits maximum passenger count to 1."*
4. Raise two visit requests to the two nearby properties, overlapping dates.
5. Click **Run engine now** → confirm a single draft with two stops.
6. Raise a third visit to the far property → run again → confirm it drafts separately.
7. Confirm a non-privileged requester is never assigned Car 1 or Car 2.
8. Set `canUseRestrictedVehicles` on your own profile, re-run, confirm the restricted cars become eligible.
9. Approve a dispatch → both requests flip to `dispatched` on `/fleet`.
10. Open the driver manifest link **on a real Android phone**, add to home screen, allow notifications, and confirm the dispatch board now shows "Push enabled" for that driver.
11. Approve another dispatch for that driver → confirm the push notification actually arrives on the phone.
12. Tap **Start trip**, mark a stop **Arrived**, tap **Complete trip**.
13. Confirm the vehicle's "Currently at" on `/admin/fleet/vehicles` updated to the last stop's property.
14. Switch the manifest to Sinhala and Tamil; confirm no layout breaks and the draft notice shows.
15. Open a second driver's token URL and confirm it shows only that driver's trips.
16. Test the cron by hand:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/fleet-optimize
```
Expected: `200` with a JSON results array. Then without the header: `401`.

- [ ] **Step 7: Commit and deploy**

```bash
git add src/middleware.ts src/components/layout/app-sidebar.tsx src/components/layout/header.tsx
git commit -m "feat(fleet): wire fleet navigation, breadcrumbs and public driver route"
```

Before merging to `main`, confirm the migration from Task 1 is already applied in Supabase. Coolify deploys on merge, and code that reaches missing tables takes the app down.

Then set these in Coolify:

| Variable | Buildtime? | Notes |
|---|---|---|
| `VAPID_PUBLIC_KEY` | no | from `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | no | secret |
| `VAPID_SUBJECT` | no | `mailto:admin@taruvillas.com` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | **yes — "Available at Buildtime"** | same value as the public key |
| `CRON_SECRET` | no | may already exist for the other crons |

And add the Coolify scheduled task:

```
Schedule:  30 11 * * *
Command:   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tvpl.morpheusds.com/api/cron/fleet-optimize
```

`11:30 UTC` is 17:00 Asia/Colombo. Coolify schedules run in UTC — setting `17 00` here would fire at 22:30 local and quietly plan a day late.

---

## Self-Review

**Spec coverage.** Every section of the design spec maps to a task:

| Spec section | Task |
|---|---|
| §5 data model, all 10 tables + profile columns | 1 |
| §6 constraint rules, verbatim error string | 4, enforced in 10, surfaced in 14 |
| §7 pooling engine, cron, idempotency | 2, 3, 5, 11 |
| §8 routes, pages, navigation, middleware | 9–15, 17 |
| §9 driver manifest, status progression, languages, vehicle repositioning | 16 (+ `completeDispatch` in 7) |
| §10 notifications, push, service worker, VAPID, best-effort delivery | 8, 11, 12, 16 |
| §11 `vehicles.assetId` bridge, declared unused | 1 |
| §13 risk mitigations (push visibility, draft translations, migration ordering, lint, timezone) | 15, 16, 1, every task, 2 |
| §14 testing | 2–5 unit, 17 manual E2E |

**Deviations recorded during planning**, both narrower than the spec's language:

1. The spec describes driver fairness as "fewest dispatches that week". The engine implements "fewest dispatches known in this planning window" — existing approved dispatches plus drafts placed earlier in the same run. Same intent, no ISO-week arithmetic, and directly testable.
2. The spec says cargo requests "never pool beyond the cargo vehicle's passenger limit". The engine takes the simpler line that cargo requests never pool at all, since a 1-seat cargo vehicle makes any pooling a breach. Standalone requests also never pool, because a free-text destination has no distance and unknown distance must not read as "nearby". Both are asserted in tests.

**Placeholder scan.** No TBD/TODO. Tasks 13–16 describe UI components as required behaviour plus the non-obvious code (constraint wiring, push subscription, driver filtering, string map) rather than full JSX, and name the existing file to mirror for layout — consistent with how this codebase's components are already structured.

**Type consistency.** `EngineVehicle` / `EngineDriver` / `EngineRequest` field names are identical in Tasks 2, 4, 5, 7, 10 and 14. `planDispatches`, `runFleetEngine`, `replaceDraftDispatches`, `loadEngineInput`, `notify`, `validateFleetRequest`, `generateDriverToken`, `colomboToday` and `formatDayMonth` are each defined once and referenced by the same name everywhere. Drizzle `numeric` columns are parsed to `number` at exactly one boundary — `listDistances` and `getFleetSettings` in Task 6 — so the engine only ever sees numbers.

