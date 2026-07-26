# Fleet & Visit Command — Design Spec

**Date:** 2026-07-26
**Status:** Approved, ready for implementation planning
**Source brief:** Taru Villas — Enterprise Operations & Fleet Command Center, Technical SRS v1.0
**Slice:** A of E (see §2)

## 1. Summary

A unified visit scheduler and fleet dispatch module inside the existing Taru Villas Next.js portal. Head-office
executives raise trip requests (visits to properties, or standalone runs such as airport pickups and cargo
deliveries). A nightly rules-based engine pools compatible requests into vehicle dispatches, honouring cargo,
capacity, licence and executive-restriction constraints. A fleet admin reviews the draft schedule and approves
it. Drivers receive a push notification and open a tokenised, trilingual manifest page on their phone, where
they progress trip status.

This delivers Route Map A and §5.1 of the SRS in full, plus the notification substrate that later slices reuse.

## 2. Scope decomposition

The SRS is not one feature. It decomposes into five slices, each needing its own spec → plan → build cycle:

| Slice | Content | Blocked on |
|---|---|---|
| **A — Fleet & Visit Command** (this spec) | Route Map A, §5.1 | Nothing |
| B — Offline PWA tier | Route Map B — service worker caching, IndexedDB queue, client-side image compression | Nothing; cross-cutting regression risk |
| C — Governance + SLA engine | Route Map C, §5.2 — committee tagging, agendas, 24h escalation, 08:00 reminder loop | Email provider (this slice ships the push half) |
| D — PMS/ERP KPIs + exception report | §6 — Opera Cloud + Prologic ingest, Monday red-flag gate | Opera field paths unconfirmed; Prologic access unknown |
| E — Full permissions-table RBAC | §3, if slices C/D need real departmental scoping | Firm governance requirements |

RBAC groundwork needed by slice A is folded into slice A (§5) rather than specced separately.

## 3. Deliberate deviations from the brief

Five intentional departures. Each preserves the brief's *behaviour* while fitting the existing codebase.

1. **Stack.** §2 specifies React/Vue + Node/Express or FastAPI on AWS/GCP, with the frontend as a PWA. This is
   built into the existing Next.js 16 App Router portal on Supabase Postgres + Drizzle, deployed on Coolify.
   Every functional requirement survives intact; only infrastructure names change. The PWA requirement is
   partially honoured here (a push-only service worker) and completed in slice B.
2. **Constraints as configuration, not hardcoded values.** §5 instructs the developer to hardcode the fleet
   rules. Hardcoding the string `"Bolero Lorry"` breaks the first time a second lorry is bought — and the user
   has confirmed there can be more than one. The rules are therefore driven by vehicle attributes
   (`cargoCapable`, `maxPassengers`, `isRestricted`), which produce identical behaviour for today's fleet.
   The user-facing error string is preserved verbatim.
3. **Static distance table instead of Google Maps Distance Matrix.** Origins and destinations are 11 fixed
   nodes (10 properties + head office). A seeded, admin-editable 11×11 table gives the engine everything it
   needs with no API key, no per-call billing, no network dependency inside a cron job, and no failure mode
   when the API is unavailable.
4. **Click-to-reassign timeline instead of a drag-and-drop calendar.** §4 asks for drag-and-drop. No DnD
   library is installed; adding one (`@dnd-kit`) plus touch-target and collision handling is meaningful work
   for an interaction used a few times per day. The timeline presents identical information and affords the
   same actions. Drag-and-drop is a deferred follow-up (§12).
5. **Drivers are not portal users.** §3 lists Fleet Driver as a system role. Auth here is email/password gated
   by `allowed_emails`, and the invite flow is known-broken. Drivers instead get a permanent tokenised URL,
   the same pattern already proven by guest survey links and asset QR scans. No accounts to provision, no
   passwords on a shared low-end device.

## 4. Resolved decisions

- **Driver access:** tokenised link, no login. 22-char base64url token, same generation as `guestSurveyLinks`.
- **Pooling engine:** rules-based with a static property distance table. Deterministic and unit-testable.
- **Notification channels (v1):** in-app + Web Push. No email in this slice; the schema is channel-agnostic so
  slice C's "structured corporate email" bolts on without rework.
- **RBAC:** the three core roles (`admin` / `property_manager` / `staff`) are untouched. Fleet permissions are
  additive boolean columns on `profiles`. Zero blast radius on existing guards, pages, APIs and sidebar logic.
- **Request types:** both property visits and standalone bookings (airport runs, cargo-only drops) feed one
  queue. Visit-only modelling was rejected because non-visit vehicle use would then happen off-system,
  silently corrupting the availability check for everyone else.
- **Demand/supply split:** a `fleet_request` is demand (one exec, one destination, one date window); a
  `dispatch` is supply (one vehicle + one driver) serving one or more requests via ordered `dispatch_stops`.
  Multi-stop runs therefore emerge from pooling without a multi-stop request form.
- **Approval:** nightly cron drafts, fleet admin approves. Plus two escape hatches — "Run engine now", and
  direct manual assign-and-dispatch for emergencies. All paths log actor and timestamp.
- **Driver manifest languages:** English, Sinhala and Tamil in v1. SI/TA ship as unreviewed drafts, flagged in
  the UI, corrected later as pure data edits.
- **Property activation:** more properties are activating soon, so proximity clustering is built and seeded for
  all 10 properties + head office.

## 5. Data model — migration `0024_fleet_command.sql`

Additive only: 5 new enums, 10 new tables, 3 new columns on `profiles`. No existing table is altered
destructively.

**Enums**
- `fleet_request_type`: `visit | standalone`
- `fleet_request_status`: `pending | queued | dispatched | completed | cancelled`
- `dispatch_status`: `draft | approved | in_progress | completed | cancelled`
- `vehicle_status`: `active | maintenance | retired`
- `driver_language`: `en | si | ta`

Lowercase values per codebase convention, display-formatted in the UI (matching `issue_status` etc.).

### `vehicles`
Org-level fleet resources.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `orgId` | uuid NOT NULL → `organizations.id` | |
| `name` | varchar(255) NOT NULL | "Bolero Lorry", "Car 1" |
| `registrationNo` | varchar(50) | |
| `maxPassengers` | integer NOT NULL | Lorry = 1 |
| `cargoCapable` | boolean NOT NULL default false | Drives the cargo rule |
| `isRestricted` | boolean NOT NULL default false | The Motor Car protection lock |
| `status` | `vehicle_status` NOT NULL default `active` | |
| `currentLocationPropertyId` | uuid → `properties.id` ON DELETE SET NULL | NULL = head office |
| `assetId` | uuid → `assets.id` ON DELETE SET NULL | Nullable bridge, see §11 |
| `sortOrder` | integer NOT NULL default 0 | |
| `createdAt` / `updatedAt` | timestamptz NOT NULL | |

Unique: (`orgId`, `name`).

### `drivers`
Deliberately **not** in `profiles` — drivers do not log in.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `orgId` | uuid NOT NULL → `organizations.id` | |
| `fullName` | text NOT NULL | |
| `phone` | varchar(50) | |
| `preferredLanguage` | `driver_language` NOT NULL default `en` | Initial toggle state |
| `accessToken` | varchar(32) NOT NULL UNIQUE | 22-char base64url |
| `isActive` | boolean NOT NULL default true | |
| `createdAt` / `updatedAt` | timestamptz NOT NULL | |

### `driver_vehicles`
Licence eligibility. A driver with no lorry licence simply has no lorry row, making the invalid pairing
unselectable in the dispatcher rather than merely discouraged.

`driverId` + `vehicleId`, both ON DELETE CASCADE. Unique on the pair.

### `property_distances`
Symmetric 11×11 grid (10 properties + head office). Head office is represented by `NULL` node id.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `orgId` | uuid NOT NULL | |
| `fromPropertyId` | uuid → `properties.id` ON DELETE CASCADE | NULL = head office |
| `toPropertyId` | uuid → `properties.id` ON DELETE CASCADE | NULL = head office |
| `distanceKm` | numeric(6,1) NOT NULL | |
| `driveMinutes` | integer | Optional |

Unique on (`orgId`, `fromPropertyId`, `toPropertyId`) declared **`NULLS NOT DISTINCT`** (Postgres 15+, which
Supabase runs). Without that clause Postgres treats each NULL as distinct and every head-office pair could be
inserted repeatedly. Rows are written in both directions on save, so lookups need no ordering logic.

### `fleet_requests`
Demand. One table, two flavours.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `orgId` | uuid NOT NULL | |
| `requestType` | `fleet_request_type` NOT NULL | |
| `requestedBy` | uuid NOT NULL → `profiles.id` | |
| `targetPropertyId` | uuid → `properties.id` | Required when `visit` |
| `originText` / `destinationText` | text | Required when `standalone` |
| `startDate` / `endDate` | date NOT NULL | Date-only; windows computed in Asia/Colombo |
| `paxCount` | integer NOT NULL default 1 | |
| `cargoRequired` | boolean NOT NULL default false | |
| `purpose` | text | |
| `notes` | text | |
| `status` | `fleet_request_status` NOT NULL default `pending` | |
| `createdAt` / `updatedAt` | timestamptz NOT NULL | |

Flavour requirements (`targetPropertyId` for visits, `destinationText` for standalone) are enforced in the Zod
layer, not as DB check constraints, consistent with how the codebase validates elsewhere.

**Status transitions**, stated explicitly because the engine reruns:
`pending` → `queued` when an engine or manual draft includes the request → `dispatched` on Approve & Dispatch
→ `completed` when its dispatch completes. `cancelled` is reachable from `pending` or `queued` by the
requester, and from `dispatched` by a fleet admin only. When a draft is regenerated, every request that was
`queued` solely by a discarded draft returns to `pending` — so a request can never be stranded in `queued`
with no dispatch pointing at it.

### `dispatches`
Supply.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `orgId` | uuid NOT NULL | |
| `vehicleId` | uuid NOT NULL → `vehicles.id` ON DELETE RESTRICT | |
| `driverId` | uuid NOT NULL → `drivers.id` ON DELETE RESTRICT | |
| `startDate` / `endDate` | date NOT NULL | |
| `status` | `dispatch_status` NOT NULL default `draft` | |
| `generatedBy` | varchar(16) NOT NULL | `engine` or `manual` — lets you measure how often engine drafts survive review |
| `approvedBy` | uuid → `profiles.id` ON DELETE SET NULL | |
| `approvedAt` / `dispatchedAt` / `startedAt` / `completedAt` | timestamptz | |
| `notes` | text | |
| `createdAt` / `updatedAt` | timestamptz NOT NULL | |

### `dispatch_stops`
Ordered stops. This is the mechanism that makes pooling real.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `dispatchId` | uuid NOT NULL → `dispatches.id` ON DELETE CASCADE | |
| `requestId` | uuid → `fleet_requests.id` ON DELETE SET NULL | Null for repositioning legs |
| `propertyId` | uuid → `properties.id` ON DELETE SET NULL | Null when free-text destination |
| `label` | text | Free-text destination for standalone stops |
| `sortOrder` | integer NOT NULL default 0 | |
| `arrivedAt` | timestamptz | Driver-tapped |

### `fleet_settings`
Per-org engine configuration, one row per organization. Exists so the pooling threshold and horizon are
tunable without a deploy.

`id`, `orgId` (NOT NULL UNIQUE → `organizations.id`), `poolingThresholdKm` (numeric(6,1) NOT NULL default
`40.0`), `planningHorizonDays` (integer NOT NULL default 14), `engineEnabled` (boolean NOT NULL default true —
lets an admin pause the nightly run without touching Coolify), `createdAt`, `updatedAt`.

### `push_subscriptions`
Keyed to a profile **or** a driver — exactly one must be set, enforced by a DB CHECK constraint
(`num_nonnulls(profile_id, driver_id) = 1`) as well as in the API layer.

`id`, `profileId` (→ `profiles.id` ON DELETE CASCADE, nullable), `driverId` (→ `drivers.id` ON DELETE CASCADE,
nullable), `endpoint` (text NOT NULL UNIQUE), `p256dh` (text NOT NULL), `auth` (text NOT NULL), `userAgent`
(text), `createdAt`, `lastSeenAt`.

### `notifications`
Channel-agnostic on purpose; slice C reuses it verbatim.

`id`, `orgId`, `profileId` (nullable), `driverId` (nullable), `type` (varchar), `title` (text NOT NULL), `body`
(text), `linkUrl` (text), `channel` (varchar — `in_app` / `push`), `sentAt`, `readAt`, `deliveryError` (text),
`createdAt`.

### Additive columns on `profiles`
- `isFleetAdmin` boolean NOT NULL default false — approves and dispatches
- `canBookFleet` boolean NOT NULL default false — raises requests
- `canUseRestrictedVehicles` boolean NOT NULL default false — unlocks restricted vehicles

Migration backfills `canBookFleet = true` and `isFleetAdmin = true` for existing `admin` profiles so the module
is usable immediately after deploy. All other profiles default to false, so no existing behaviour changes.

### Relations
Drizzle `relations()` declared for every table, matching the file's existing style. `vehicles`, `drivers`,
`fleet_requests` and `dispatches` all relate to `organizations`; `dispatch_stops` relates up to `dispatches`
and across to `fleet_requests` and `properties`.

## 6. Constraint rules (§5.1 of the brief)

| Brief rule | Implementation |
|---|---|
| `Cargo = True ⟹ Force Fleet Allocation = "Bolero Lorry"` | Cargo requests match only vehicles with `cargoCapable = true`. Generalises to a second lorry. |
| `Enforce: Total Passengers ≤ 1` | Falls out of the lorry's `maxPassengers = 1`. Submission blocked with the verbatim string: **"Lorry cargo transport standard limits maximum passenger count to 1."** |
| `User Role ≠ Executive Director / CEO ⟹ Exclude Motor Car 1 & 2` | Vehicles with `isRestricted = true` are filtered from selection unless the requester has `canUseRestrictedVehicles`. |

**Restricted-vehicle pooling** — an interpretation the brief does not specify. A restricted vehicle may only be
allocated to a dispatch carrying at least one person with `canUseRestrictedVehicles`. The car is reserved for
the CEO/Executive Director, but others may ride along with them. Reviewed and accepted; tighten to
never-pooled if operational practice differs.

Validation lives in two places, deliberately: the Zod schema on the API (authoritative) and the request form
(immediate feedback). The engine re-checks every constraint independently, since it allocates vehicles the
requester never chose.

## 7. The pooling engine

`src/lib/fleet/engine.ts` — a **pure function**. It receives pending requests, vehicles, drivers, eligibility
pairs, the distance table and existing approved dispatches; it returns draft dispatches plus unassignable
requests with human-readable reasons. No DB access inside, so it is fully unit-testable with the installed
vitest. This matters because "why did it pick that van" is a question that will be asked.

Algorithm — greedy and deterministic:

1. Select pending requests whose window starts inside the planning horizon (`fleet_settings.planningHorizonDays`,
   default 14).
2. Group by overlapping date windows.
3. Within a group, cluster by destination proximity using `property_distances` against
   `fleet_settings.poolingThresholdKm` (default 40 km).
4. Split any cluster whose summed `paxCount` exceeds the largest available capacity.
5. Cargo requests never pool beyond the cargo vehicle's passenger limit.
6. **Vehicle selection** — eligible on cargo capability, capacity, restriction, `status = active`, and no
   overlapping approved dispatch. Tiebreak: (a) already parked at/nearest the origin, (b) smallest sufficient
   capacity — never send a lorry for one passenger, (c) `sortOrder`.
7. **Driver selection** — eligible for that vehicle via `driver_vehicles`, active, and not already assigned in
   the window. Tiebreak: fewest dispatches that week, giving cheap fairness rotation.
8. Unassignable requests surface with plain-English reasons: *"No cargo-capable vehicle free 12–14 Aug"*,
   *"No lorry-licensed driver available"*.

**Cron** — `/api/cron/fleet-optimize`, Bearer `CRON_SECRET`, matching the two existing cron routes.
17:00 Asia/Colombo = **11:30 UTC** in the Coolify scheduled task.

**Idempotency** — a run deletes and regenerates `draft` dispatches only. `approved` and later statuses are
never touched, so "Run engine now" is always safe.

## 8. Routes and pages

| Route | Access | Purpose |
|---|---|---|
| `/fleet` | `canBookFleet` | My requests + "New request" dialog (visit / standalone tabs). Fleet admins additionally see the full pending queue. Filters via nuqs. |
| `/fleet/dispatch` | `isFleetAdmin` | Admin Review Canvas — vehicle rows × day columns, draft dispatches, unassignable panel, "Run engine now", "Approve & Dispatch", manual assign dialog, per-driver push-subscription status. |
| `/admin/fleet/vehicles` | `admin` | Vehicle CRUD. |
| `/admin/fleet/drivers` | `admin` | Driver CRUD + vehicle eligibility checkboxes + copyable manifest link + QR (reusing the existing `qrcode` setup from the asset registry). |
| `/admin/fleet/distances` | `admin` | 11×11 distance grid. |
| `/d/[token]` | public | Driver manifest. |

API routes under `/api/fleet/` (requests, dispatches, vehicles, drivers, distances, engine run) and
`/api/fleet/driver/[token]/` (manifest read, status writes, push subscribe).

Every `page.tsx` that fetches data carries `export const dynamic = 'force-dynamic'`.

**Navigation** — one `mainNavItems` entry, "Fleet", gated on `canBookFleet || isFleetAdmin`. Admin config
pages join `adminNavItems`. Breadcrumb segment labels added in `header.tsx` for `fleet`, `dispatch`,
`vehicles`, `drivers`, `distances`.

**Middleware** — `/d/` and `/api/fleet/driver/` added to `isPublicRoute`. Driver writes are authorised by
token and scoped to that driver's own dispatches; a valid token can never read or mutate another driver's data.

## 9. Driver manifest (`/d/[token]`)

Text-minimal, high-contrast, large touch targets, built for a Samsung Galaxy A06 held in one hand.

- Today's trip prominent; upcoming trips collapsed below.
- Per trip: vehicle, date window, ordered stops with property name and contact, pax count, cargo flag.
- Status progression: **Start trip** → per-stop **Arrived** → **Complete trip**. Each writes a timestamp.
- On completion, the vehicle's `currentLocationPropertyId` is set to the last stop's property — this is what
  keeps the engine's "already parked nearest" tiebreak honest over time.
- Language toggle EN / SI / TA, persisted to `localStorage`, initialised from `drivers.preferredLanguage`.
  Strings live in a single `{ en, si, ta }` map in `src/lib/fleet/manifest-strings.ts`. No i18n library, no
  impact on the rest of the portal. SI/TA drafts carry a visible "translation pending review" marker until
  signed off.

## 10. Notifications and Web Push

- **Service worker** — `public/sw.js`, containing only `push` and `notificationclick` handlers. No caching.
  Slice B extends this file rather than replacing it.
- **Env** — `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  which **must be marked "Available at Buildtime" in Coolify** (same trap previously hit with
  `NEXT_PUBLIC_APP_URL`).
- **Dependency** — adds `web-push`. This breaks the codebase's usual no-new-dependencies rule; accepted
  because the alternative is hand-rolling ECDH + HKDF + AES-GCM payload encryption. Small, mature,
  single-purpose.
- **Triggers** — Approve & Dispatch notifies each requester and the assigned driver. Trip completion notifies
  the requester and fleet admin. An unassignable request notifies the fleet admin.
- **Delivery is best-effort and never blocks a transaction.** Failures are recorded in
  `notifications.deliveryError`. A `410 Gone` or `404` from the push service deletes the dead subscription.
- **Driver onboarding is a three-step ritual, not a link tap**: open the link *in Chrome or Samsung Internet*
  → "Add to Home Screen" → tap **Allow**. Opened inside WhatsApp's in-app browser, push silently will not
  work. The manifest page detects an unsubscribed state and renders a setup banner walking through it; the
  dispatch board shows each driver's live subscription status so an admin can see who will not be reached.

## 11. Relationship to the existing Asset Registry

Fleet vehicles are **not** rows in `assets`, despite `asset_category` already including `vehicles`. Assets are
property-scoped with rooms and depreciation schedules; fleet vehicles are org-level and mobile by definition.
Forcing them together would bend both models. The nullable `vehicles.assetId` column is the clean bridge if
Finance later wants vehicle depreciation on the balance sheet — declared in the schema, unused in v1.

## 12. Non-goals

Out of this slice, listed so the plan does not quietly grow:

- Offline/IndexedDB queuing and image compression (slice B)
- Google Maps Distance Matrix integration
- Committee tagging, agendas, SLA escalation, the 08:00 reminder loop (slice C)
- Opera Cloud / Prologic KPI ingest and the Monday exception report (slice D)
- Email delivery (schema ready, not wired)
- Full permissions-table RBAC (slice E)
- Drag-and-drop dispatch calendar
- The CEO "Live Fleet Map" — needs real GPS pings from driver devices; its own project
- Fuel, mileage and trip cost tracking
- Vehicle service scheduling beyond the `maintenance` status flag

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Push does not reach a driver (permission denied, WhatsApp in-app browser, storage cleared) | Setup banner detects unsubscribed state; dispatch board shows live subscription status; the manifest page remains the source of truth regardless of push |
| Sinhala/Tamil drafts are wrong | Marked unreviewed in the UI until sign-off; corrections are data edits, no code change |
| Drizzle migration history is broken in this repo | Hand-write `drizzle/0024_fleet_command.sql` and apply via the Supabase SQL editor **before** merge, per the established crash-window rule |
| Coolify build fails on ESLint `no-unused-vars` | `npx tsc --noEmit` plus a lint pass before push; local `npm run build` hangs on macOS, so Coolify is authoritative |
| Timezone drift in the 17:00 cron and date-window maths | Date-only columns for request windows; all window arithmetic done explicitly in Asia/Colombo, with tests pinning boundary cases |
| Engine allocates a vehicle that is physically unavailable | `status = maintenance` excludes it; overlapping approved dispatches exclude it; the admin approval step is the final human check |

## 14. Testing

**Unit (vitest, on the pure engine):**
- Cargo request matches only cargo-capable vehicles
- Cargo + pax > 1 blocked with the exact SRS error string
- Restricted vehicles excluded for non-privileged requesters; permitted when a privileged passenger is aboard
- Driver without lorry eligibility never paired with a lorry
- Proximity clustering pools inside the threshold and refuses outside it
- Capacity overflow splits a cluster into two dispatches
- Overlapping approved dispatch removes a vehicle from the candidate pool
- Every unassignable reason string is produced by its intended condition
- Asia/Colombo window boundary cases

**Manual E2E:** create both request types → run engine → review draft → approve → confirm push lands on a
real Android device → driver starts trip, marks stops arrived, completes → vehicle location updates → verify a
second driver's token cannot read the first driver's manifest.

**Verification before completion:** `npx tsc --noEmit`, lint pass, `npm run test`, then the Coolify build.

## 15. Deferred follow-ups

- Drag-and-drop dispatch calendar (§4 of the brief)
- Email channel on `notifications` (arrives with slice C)
- Vehicle service scheduling with date-range unavailability blocks
- `vehicles.assetId` linkage to the Fixed Asset Registry for depreciation
- Fuel and mileage logging per dispatch
- Driver accounts, should per-driver audit identity ever be required
