# Fixed Asset Registry (FAR) — Design Spec

**Date:** 2026-07-03
**Status:** Approved, ready for implementation planning
**Source brief:** Taru Villas FAR Master Project Blueprint

## 1. Summary

A Fixed Asset Registry built as a **feature module inside the existing Taru Villas Next.js app** (not a
separate project). It replaces spreadsheet tracking of high-value FF&E, machinery, kitchen equipment, IT,
and vehicles across all properties. It gives:

- **Finance/Admin** — accurate straight-line depreciation, valuation KPIs, and cross-property reporting.
- **Property Managers** — real-time inventory visibility scoped to their assigned properties.
- **Housekeeping/Maintenance staff** — a mobile-first QR scanning flow to audit presence, move assets,
  and flag repairs on the floor.

The brief's stack (Next.js, Tailwind, shadcn/ui, Supabase Postgres) **is** the app's existing stack, so this
reuses existing infrastructure rather than standing up anything parallel.

## 2. Deliberate deviations from the brief

Two intentional departures, both to stay consistent with the existing codebase:

1. **No Supabase RLS.** The app enforces access in the **server-side guard/query layer**
   (`requireRole`, `getUserProperties`) and connects via a postgres.js service connection that bypasses
   RLS anyway. All role rules (including hiding financial fields from staff) are enforced there, consistent
   with every other feature. Adding RLS for one module would be inconsistent and would not take effect.
2. **Depreciation computed on read, not via cron snapshots.** Net Book Value is fully deterministic from
   `purchaseCost + purchaseDate + usefulLifeYears + salvageValue + today`. A pure function (mirroring
   `src/lib/utilities/calculations.ts`) is always correct with zero stale-data risk. No cron, no stored NBV
   column. Monthly point-in-time snapshots can be added later if Finance needs valuation history (deferred).

A third, smaller schema improvement over the brief: **assets carry their own `propertyId` (NOT NULL) in
addition to a nullable `roomId`.** The brief hangs property off the room only, but `roomId` is nullable
(in-transit / unassigned assets), which would orphan them from any property. Property-direct keeps
Property-Manager scoping clean and rooms optional.

## 3. Resolved decisions

- **Asset code:** auto-generated and editable. Scheme `{PROPERTYCODE}-{ROOM}-{CAT}-{seq}`
  (e.g. `RAMPART-R1-FFE-001`). Suggested on the Add form, user can override. DB enforces uniqueness.
  Editable so legacy spreadsheet codes can be carried over.
- **Categories:** fixed Postgres enum per the brief — `ffe`, `machinery`, `kitchen`, `it`, `vehicles`.
- **Asset images:** real Supabase Storage upload (bucket `asset-images`). This is the one genuinely new
  piece of infrastructure — the app currently stores images only as plain URL columns, with no Storage
  usage. A small client upload helper is required.
- **Scan target route is auth-gated** (staff and above), not public. Staff already have accounts.

## 4. Data model — migration `0023_fixed_asset_registry.sql`

Additive only: 3 new enums + 4 new tables. Enum values are lowercase per codebase convention and
display-formatted in the UI (matching `issue_status` etc.).

**Enums**
- `asset_category`: `ffe | machinery | kitchen | it | vehicles`
- `asset_status`: `active | in_repair | missing | disposed`
- `maintenance_status`: `pending | resolved`

**`rooms`** (the brief's `locations_rooms`)
- `id` uuid PK
- `propertyId` uuid NOT NULL → `properties.id`
- `name` text NOT NULL (e.g. "Room 1", "Main Kitchen", "Pool Deck")
- `floorLevel` text NULL
- `createdAt`, `updatedAt`
- UNIQUE `(propertyId, name)`

**`assets`** (core)
- `id` uuid PK
- `assetCode` text UNIQUE NOT NULL
- `name` text NOT NULL
- `category` `asset_category` NOT NULL
- `propertyId` uuid NOT NULL → `properties.id`
- `roomId` uuid NULL → `rooms.id`
- `purchaseDate` date NOT NULL
- `purchaseCost` numeric(12,2) NOT NULL  — LKR
- `usefulLifeYears` integer NOT NULL
- `salvageValue` numeric(12,2) NOT NULL DEFAULT 0
- `status` `asset_status` NOT NULL DEFAULT `active`
- `serialNumber` text NULL
- `vendorName` text NULL
- `warrantyExpiry` date NULL
- `imageUrl` text NULL  — Supabase Storage
- `qrUrl` text UNIQUE  — `${APP_URL}/scan/asset/{id}`, written on insert
- `lastAuditedAt` timestamptz NULL
- `createdBy` uuid → `profiles.id`
- `createdAt`, `updatedAt`

**`maintenance_logs`**
- `id` uuid PK
- `assetId` uuid NOT NULL → `assets.id` (ON DELETE CASCADE)
- `reportedBy` uuid → `profiles.id`
- `serviceDate` date
- `issueDescription` text NOT NULL
- `repairCost` numeric(12,2) NULL
- `resolutionStatus` `maintenance_status` NOT NULL DEFAULT `pending`
- `resolvedBy` uuid NULL → `profiles.id`
- `resolvedAt` timestamptz NULL
- `createdAt`, `updatedAt`

**`asset_events`** (powers the Recent Activity feed + audit trail)
- `id` uuid PK
- `assetId` uuid NOT NULL → `assets.id` (ON DELETE CASCADE)
- `actorId` uuid → `profiles.id`
- `eventType` text — `created | audited | moved | status_changed | repair_flagged`
- `detail` text NULL
- `createdAt`

## 5. Depreciation engine — `src/lib/assets/depreciation.ts`

Pure function, no DB, Asia/Colombo "today". Mirrors the utilities calculations pattern.

```
annual       = (purchaseCost − salvageValue) / usefulLifeYears
monthly      = annual / 12
monthsActive = whole months between purchaseDate and today
accumulated  = min(monthly × monthsActive, purchaseCost − salvageValue)
NBV          = purchaseCost − accumulated
// Edge cases:
if usefulLifeYears <= 0 → treat as fully depreciated (guard against divide-by-zero)
if monthsActive >= usefulLifeYears × 12 → accumulated = purchaseCost − salvageValue, NBV = salvageValue
// Invariants: NBV never below salvageValue; accumulated never exceeds (cost − salvage).
```

Returns `{ annualDepreciation, monthlyDepreciation, monthsActive, accumulatedDepreciation, netBookValue }`.

## 6. QR generation + scanning

- **Label generation:** new dep `qrcode`. Render QR (SVG/data-URL) on the asset detail page and a
  printable label. `qrUrl` written on insert as `${APP_URL}/scan/asset/{id}` (APP_URL from env, prod
  `https://tvpl.morpheusds.com`).
- **Camera scanning:** new dep `html5-qrcode`. `/assets/scan` renders a large "Tap to Scan" button using
  the device camera (`capture="environment"` pattern already used for meter reads) → on decode, routes to
  `/scan/asset/[id]`.
- **`/scan/asset/[id]`** — auth-gated (staff+), mobile-optimized Quick-View Card: asset image, name,
  assigned room, and three actions:
  - **Verify Present** → set `lastAuditedAt = now`; write `asset_event(audited)`.
  - **Move Location** → dropdown to update `roomId`; write `asset_event(moved)`.
  - **Flag for Repair** → create `maintenance_logs` row (pending) + set asset `status = in_repair`;
    write `asset_event(repair_flagged)`.

## 7. RBAC — guard/query layer

| Role | Access |
|---|---|
| **admin** (Admin/Finance) | Global read/write, all financial fields, resolve maintenance, CSV financial export |
| **property_manager** | Read/write assets in assigned properties (`getUserProperties`); sees financials; **cannot edit `purchaseCost` / `usefulLifeYears` after creation** (fields stripped server-side on update) |
| **staff** (Housekeeping/Maintenance) | **No financial fields** (`purchaseCost`, `salvageValue`, NBV, accumulated depreciation) in query results or UI; can view physical details, scan, Verify/Move/Flag, create maintenance logs |

Implementation: two query projections — a **financial** read (admin/PM) and a **physical-only** read
(staff) — selected by role server-side, so staff never receive cost data over the wire. Update endpoints
strip fields PMs are not allowed to change.

## 8. Information architecture / routes

Follows the existing "one sidebar entry per domain, sub-views as tabs" convention.

- Sidebar **Main** section → **"Asset Registry"** at `/assets` (visible to all authenticated users; staff
  need the scanner).
- `/assets` area tabs (nav-style `Link` + `usePathname`, role-gated):
  - **Dashboard** (admin + PM) — KPI row (Total NBV LKR, Accumulated Depreciation, Active count,
    In-Repair count), bar chart (NBV by property), pie chart (count by category), recent activity feed.
    PM scoped to assigned properties.
  - **Directory** (all; staff = no-financials view) — TanStack table: global search (name/code/serial),
    multi-select filters (property/category/status), sort (purchase date / NBV), CSV export
    (financial export admin/PM only). "Add Asset" button (admin + PM).
  - **Rooms** (admin + PM) — manage rooms per property.
  - **Scan** (all) — "Tap to Scan" camera page.
- **Add Asset** — 3-step form: General (name, category, image upload, serial) → Location (cascading
  Property → Room dropdowns) → Financials (purchase date, cost, useful life, salvage; live annual-
  depreciation preview). Asset code auto-suggested and editable.
- **Asset detail** `/assets/[id]` — full record, QR label (printable), maintenance history, edit form.
- **`/scan/asset/[id]`** — mobile Quick-View Card (see §6).

Public routes: none added — `/scan/asset/[id]` is authenticated.

## 9. Code organization

- Schema: extend `src/lib/db/schema.ts` (enums, 4 tables, relations, inferred types).
- Migration: hand-written `drizzle/0023_fixed_asset_registry.sql` (IF NOT EXISTS, `--> statement-breakpoint`
  convention). Additive-only → low crash-window risk; still applied in Supabase **before** merge.
- Queries: `src/lib/db/queries/assets.ts` (asset CRUD with financial/physical projections, rooms CRUD,
  maintenance logs, events, dashboard aggregates).
- Depreciation: `src/lib/assets/depreciation.ts` (pure).
- Storage: `asset-images` Supabase bucket + small client upload helper.
- API routes under `src/app/api/assets/…`, `…/rooms/…`, `…/maintenance/…`, plus scan actions.
- UI: `src/app/(portal)/assets/…` pages + `src/components/assets/…` (area tabs, directory table,
  add-asset wizard, dashboard, rooms manager, quick-view card, QR label).

## 10. New dependencies / infrastructure

- `qrcode` — QR label generation.
- `html5-qrcode` — camera scanning.
- Supabase Storage bucket `asset-images` (new; app has no Storage usage today).
- `@tanstack/react-table` and `recharts` already installed — reused for directory and charts.
- CSV export built without a new dependency (string builder).

## 11. Out of scope (v1 — YAGNI)

- Cron depreciation snapshots / point-in-time valuation history (computed on read instead).
- E-signature and rate contracting (belongs to the separate B2B portal).
- CRM / Salesforce sync.
- Bulk historical import can reuse the existing `BulkImportCard` CSV pattern but is a follow-up, not v1
  core.
