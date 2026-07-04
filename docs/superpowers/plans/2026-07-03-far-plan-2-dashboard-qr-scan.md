# Fixed Asset Registry — Plan 2: Dashboard, QR Labels & Mobile Scan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Finance/management **dashboard** (KPIs + charts + activity feed), **QR label generation** on asset detail, and the **mobile QR scan flow** (camera scanner + auth-gated quick-view card with Verify Present / Move Location / Flag for Repair), plus maintenance-log resolution.

**Architecture:** Builds directly on Plan 1's schema, query layer, and `/assets` area shell. Adds a dashboard-aggregates query, a pure "recent activity" merge, QR rendering with the `qrcode` library, a camera scanner with `html5-qrcode`, and thin scan-action API routes that write `maintenance_logs`/`asset_events` and flip asset status/room/audit timestamp.

**Tech Stack:** Next.js 16, Drizzle + postgres.js, recharts (installed), `qrcode` (new), `html5-qrcode` (new), vitest for pure logic.

## Global Constraints

Same as Plan 1 — repeated verbatim, all tasks inherit these:
- Use the shared `db` from `src/lib/db` (`{ prepare: false }`).
- Hand-write migrations if any; none expected in this plan (no new tables — `maintenance_logs` and `asset_events` already exist from Plan 1).
- Enum values lowercase; display-format in UI.
- **RBAC server-side**: dashboard = admin + PM (scoped); staff never receive financials. Scan quick-view = any authenticated user (staff+); scan actions are the only asset mutations staff may perform.
- Money is `numeric(12,2)` → string from postgres.js; `Number(...)` only in calc/format code.
- ESLint fails Coolify build on unused imports/vars (`_`-prefix intentionally-unused).
- Do not rely on local `next build`/`tsc`/`lint` (they deadlock). `npm test` (vitest) is the only local automated check.
- Timezone for depreciation "today" is Asia/Colombo.
- `NEXT_PUBLIC_APP_URL` drives `qrUrl` (set in Plan 1 Task 15).

**Depends on Plan 1** being merged/applied: schema, `computeDepreciation`, `listAssets`, `getAssetById`, `logAssetEvent`, `getRoomsForProperty`, label maps, the `/assets` area shell and `AssetsAreaTabs` (Dashboard + Scan tabs already declared there).

---

### Task 1: Dashboard aggregates query + recent-activity merge (TDD for the pure part)

**Files:**
- Modify: `src/lib/db/queries/assets.ts` (add `getDashboardData`)
- Create: `src/lib/assets/activity.ts` (pure merge/format of events + maintenance into a feed)
- Test: `src/lib/assets/activity.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // assets.ts
  export interface DashboardData {
    totalNbv: number
    totalAccumulatedDepreciation: number
    activeCount: number
    inRepairCount: number
    byProperty: { propertyId: string; propertyName: string; totalNbv: number }[]
    byCategory: { category: AssetCategory; count: number }[]
    recentRaw: {
      events: { id: string; assetId: string; assetName: string; eventType: string; detail: string | null; actorName: string | null; createdAt: Date }[]
    }
  }
  export function getDashboardData(propertyIds: string[] | null): Promise<DashboardData>

  // activity.ts
  export interface FeedItem { id: string; assetId: string; label: string; when: Date }
  export function buildActivityFeed(events: DashboardData['recentRaw']['events']): FeedItem[]
  ```
- Consumed by: dashboard page (Task 2).

- [ ] **Step 1: Write the failing test for `buildActivityFeed`**
```typescript
// src/lib/assets/activity.test.ts
import { describe, it, expect } from 'vitest'
import { buildActivityFeed } from './activity'

describe('buildActivityFeed', () => {
  it('maps event types to human labels, newest first', () => {
    const feed = buildActivityFeed([
      { id: '1', assetId: 'a', assetName: 'Teak Bed', eventType: 'created', detail: null, actorName: 'Alvin', createdAt: new Date('2026-07-01T10:00:00Z') },
      { id: '2', assetId: 'a', assetName: 'Teak Bed', eventType: 'repair_flagged', detail: 'Broken leg', actorName: 'Sunil', createdAt: new Date('2026-07-02T10:00:00Z') },
      { id: '3', assetId: 'b', assetName: 'AC Unit', eventType: 'moved', detail: 'Room 2', actorName: null, createdAt: new Date('2026-07-03T10:00:00Z') },
    ])
    expect(feed[0].label).toBe('AC Unit moved to Room 2')
    expect(feed[1].label).toBe('Teak Bed flagged for repair: Broken leg')
    expect(feed[2].label).toBe('Teak Bed added by Alvin')
  })
})
```
- [ ] **Step 2: Run → FAIL.** `npm test`
- [ ] **Step 3: Implement `activity.ts`**
```typescript
// src/lib/assets/activity.ts
import type { DashboardData } from '@/lib/db/queries/assets'

export interface FeedItem { id: string; assetId: string; label: string; when: Date }

export function buildActivityFeed(
  events: DashboardData['recentRaw']['events'],
): FeedItem[] {
  const items = events.map((e) => {
    const by = e.actorName ? ` by ${e.actorName}` : ''
    let label: string
    switch (e.eventType) {
      case 'created': label = `${e.assetName} added${by}`; break
      case 'audited': label = `${e.assetName} verified present${by}`; break
      case 'moved': label = `${e.assetName} moved to ${e.detail ?? 'a new location'}`; break
      case 'repair_flagged': label = `${e.assetName} flagged for repair${e.detail ? `: ${e.detail}` : ''}`; break
      case 'status_changed': label = `${e.assetName} ${e.detail ?? 'status changed'}`; break
      default: label = `${e.assetName} updated${by}`
    }
    return { id: e.id, assetId: e.assetId, label, when: e.createdAt }
  })
  return items.sort((a, b) => b.when.getTime() - a.when.getTime())
}
```
- [ ] **Step 4: Run → PASS.** `npm test`

- [ ] **Step 5: Implement `getDashboardData` in `assets.ts`** — reuse `listAssets(filter, true)` to get financial rows, then aggregate in JS (small data volume, avoids duplicating depreciation SQL):
```typescript
// append to src/lib/db/queries/assets.ts
import { assetEvents, profiles } from '../schema' // ensure profiles imported
import type { AssetCategory } from '@/lib/assets/labels'

export interface DashboardData {
  totalNbv: number
  totalAccumulatedDepreciation: number
  activeCount: number
  inRepairCount: number
  byProperty: { propertyId: string; propertyName: string; totalNbv: number }[]
  byCategory: { category: AssetCategory; count: number }[]
  recentRaw: {
    events: {
      id: string; assetId: string; assetName: string; eventType: string
      detail: string | null; actorName: string | null; createdAt: Date
    }[]
  }
}

export async function getDashboardData(propertyIds: string[] | null): Promise<DashboardData> {
  const rows = (await listAssets({ propertyIds }, true)) as AssetFinancialRow[]

  const byPropertyMap = new Map<string, { propertyName: string; totalNbv: number }>()
  const byCategoryMap = new Map<AssetCategory, number>()
  let totalNbv = 0, totalAcc = 0, activeCount = 0, inRepairCount = 0

  for (const r of rows) {
    totalNbv += r.netBookValue
    totalAcc += r.accumulatedDepreciation
    if (r.status === 'active') activeCount++
    if (r.status === 'in_repair') inRepairCount++
    const p = byPropertyMap.get(r.propertyId) ?? { propertyName: r.propertyName, totalNbv: 0 }
    p.totalNbv += r.netBookValue
    byPropertyMap.set(r.propertyId, p)
    byCategoryMap.set(r.category, (byCategoryMap.get(r.category) ?? 0) + 1)
  }

  // recent events, scoped to accessible assets when propertyIds !== null
  const assetIds = rows.map((r) => r.id)
  let events: DashboardData['recentRaw']['events'] = []
  if (propertyIds === null || assetIds.length > 0) {
    const evRows = await db
      .select({
        id: assetEvents.id, assetId: assetEvents.assetId, eventType: assetEvents.eventType,
        detail: assetEvents.detail, createdAt: assetEvents.createdAt,
        assetName: assets.name, actorName: profiles.fullName,
      })
      .from(assetEvents)
      .innerJoin(assets, eq(assetEvents.assetId, assets.id))
      .leftJoin(profiles, eq(assetEvents.actorId, profiles.id))
      .where(propertyIds === null ? undefined : inArray(assetEvents.assetId, assetIds))
      .orderBy(desc(assetEvents.createdAt))
      .limit(20)
    events = evRows.map((e) => ({
      id: e.id, assetId: e.assetId, assetName: e.assetName, eventType: e.eventType,
      detail: e.detail, actorName: e.actorName ?? null, createdAt: e.createdAt,
    }))
  }

  return {
    totalNbv, totalAccumulatedDepreciation: totalAcc, activeCount, inRepairCount,
    byProperty: [...byPropertyMap.entries()].map(([propertyId, v]) => ({ propertyId, propertyName: v.propertyName, totalNbv: v.totalNbv })),
    byCategory: [...byCategoryMap.entries()].map(([category, count]) => ({ category, count })),
    recentRaw: { events },
  }
}
```
> Ensure `profiles` and `assetEvents` are in the import block at the top of `assets.ts` (add if missing).

- [ ] **Step 6: Commit**
```bash
git add src/lib/assets/activity.ts src/lib/assets/activity.test.ts src/lib/db/queries/assets.ts
git commit -m "feat(far): dashboard aggregates + activity feed builder"
```

---

### Task 2: Dashboard page (KPIs, charts, feed)

**Files:**
- Create: `src/app/(portal)/assets/dashboard/page.tsx` (RSC — admin + PM)
- Create: `src/components/assets/asset-dashboard.tsx` (client — recharts)

**Interfaces:**
- Consumes: `getDashboardData` (Task 1), `buildActivityFeed`, `getUserProperties`, LKR formatter, `categoryLabel`.
- Produces: the Dashboard tab content.

- [ ] **Step 1: Build the server page** — `requireRole(['admin','property_manager'])`; `propertyIds = await getUserProperties(profile.id, profile.role)`; `const data = await getDashboardData(propertyIds)`; `const feed = buildActivityFeed(data.recentRaw.events)`; `export const dynamic = 'force-dynamic'`; render `<AssetDashboard data={data} feed={feed} />`.
- [ ] **Step 2: Build `asset-dashboard.tsx`**:
  - **KPI row** (4 shadcn `Card`s): Total Asset Value (NBV, LKR) = `data.totalNbv`; Accumulated Depreciation = `data.totalAccumulatedDepreciation`; Total Active Assets = `data.activeCount`; In Repair = `data.inRepairCount`. Format LKR with `new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 })`.
  - **Bar chart** (recharts `BarChart`): NBV by property (`data.byProperty`, x = `propertyName`, y = `totalNbv`).
  - **Pie chart** (recharts `PieChart`): count by category (`data.byCategory`, label via `categoryLabel`).
  - **Recent Activity feed:** list `feed` items (`label` + relative/formatted `when`), each linking to `/assets/${item.assetId}`.
  - Mirror the existing dashboard chart components in `src/components/dashboard/` for recharts styling/ResponsiveContainer conventions.
- [ ] **Step 3: Manual check** — visit `/assets/dashboard` as admin: KPIs sum correctly, both charts render, feed shows recent creates. Commit.
```bash
git add "src/app/(portal)/assets/dashboard/page.tsx" src/components/assets/asset-dashboard.tsx
git commit -m "feat(far): asset registry dashboard (KPIs, charts, activity feed)"
```

---

### Task 3: QR label generation on asset detail

**Files:**
- Modify: `package.json` (add `qrcode` + `@types/qrcode` dev)
- Create: `src/components/assets/asset-qr-label.tsx` (client — renders QR + printable label)
- Modify: `src/app/(portal)/assets/[id]/page.tsx` / `asset-detail.tsx` (embed the label block)

**Interfaces:**
- Consumes: the asset's `qrUrl` and `assetCode`/`name` (already loaded on the detail page).
- Produces: an on-screen QR + a "Print label" affordance.

- [ ] **Step 1: Install**
```bash
npm install qrcode
npm install -D @types/qrcode
```
- [ ] **Step 2: Build `asset-qr-label.tsx`** — `'use client'`; on mount, `import QRCode from 'qrcode'` and `QRCode.toDataURL(qrUrl, { width: 320, margin: 1 })` into an `<img>`. Render a compact printable card: the QR image, `assetCode` (large monospace), and `name`. Add a "Print label" button → `window.print()` scoped to a print stylesheet (`@media print`) that isolates the label. Guard the effect against `qrUrl == null` (assets created pre-`qrUrl` — none expected, but be safe).
- [ ] **Step 3: Embed** the `<AssetQrLabel qrUrl={asset.qrUrl} assetCode={asset.assetCode} name={asset.name} />` in the detail view (visible to all roles — staff may need to reprint labels).
- [ ] **Step 4: Manual check** — open an asset; QR renders; scanning it with a phone opens `NEXT_PUBLIC_APP_URL/scan/asset/<id>` (will 404 until Task 5). "Print label" shows just the label. Commit.
```bash
git add package.json package-lock.json src/components/assets/asset-qr-label.tsx "src/app/(portal)/assets/[id]/page.tsx" src/components/assets/asset-detail.tsx
git commit -m "feat(far): QR label generation + print on asset detail"
```

---

### Task 4: Scan-action API routes (verify / move / flag-repair) + maintenance resolve

**Files:**
- Create: `src/app/api/assets/[id]/verify/route.ts` (POST — set `lastAuditedAt`, event `audited`)
- Create: `src/app/api/assets/[id]/move/route.ts` (POST — update `roomId`, event `moved`)
- Create: `src/app/api/assets/[id]/flag-repair/route.ts` (POST — create maintenance log + `status='in_repair'`, event `repair_flagged`)
- Create: `src/app/api/assets/[id]/maintenance/[logId]/resolve/route.ts` (POST — admin/PM resolve a log, optionally set asset back to `active`)
- Modify: `src/lib/db/queries/maintenance.ts` (add `createMaintenanceLog`, `resolveMaintenanceLog`)

**Interfaces:**
- Consumes: `getProfile`, `getAssetById`, `updateAsset`, `logAssetEvent`, `getRoomsForProperty` (for move validation), maintenance queries.
- Produces: the four scan/maintenance actions. **Verify/Move/Flag are allowed for any authenticated active user (staff+)**; Resolve is admin/PM only.

- [ ] **Step 1: Add maintenance query helpers** to `src/lib/db/queries/maintenance.ts`:
```typescript
import { eq, desc } from 'drizzle-orm'
import { db } from '..'
import { maintenanceLogs, profiles, type NewMaintenanceLog } from '../schema'

export async function createMaintenanceLog(input: NewMaintenanceLog) {
  const [row] = await db.insert(maintenanceLogs).values(input).returning()
  return row
}

export async function resolveMaintenanceLog(logId: string, resolvedBy: string) {
  const [row] = await db
    .update(maintenanceLogs)
    .set({ resolutionStatus: 'resolved', resolvedBy, resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(maintenanceLogs.id, logId))
    .returning()
  return row
}

export async function getMaintenanceLogsForAsset(assetId: string) {
  return db
    .select({
      id: maintenanceLogs.id, issueDescription: maintenanceLogs.issueDescription,
      serviceDate: maintenanceLogs.serviceDate, repairCost: maintenanceLogs.repairCost,
      resolutionStatus: maintenanceLogs.resolutionStatus, createdAt: maintenanceLogs.createdAt,
      resolvedAt: maintenanceLogs.resolvedAt, reporterName: profiles.fullName,
    })
    .from(maintenanceLogs)
    .leftJoin(profiles, eq(maintenanceLogs.reportedBy, profiles.id))
    .where(eq(maintenanceLogs.assetId, assetId))
    .orderBy(desc(maintenanceLogs.createdAt))
}
```
> If Plan 1 Task 13 already added `getMaintenanceLogsForAsset`, keep one copy — do not duplicate.

- [ ] **Step 2: `verify/route.ts`**
```typescript
// src/app/api/assets/[id]/verify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { getAssetById, updateAsset, logAssetEvent } from '@/lib/db/queries/assets'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile || !profile.isActive) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const asset = await getAssetById(id, false)
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await updateAsset(id, { lastAuditedAt: new Date() })
  await logAssetEvent(id, profile.id, 'audited')
  return NextResponse.json({ ok: true, lastAuditedAt: new Date().toISOString() })
}
```

- [ ] **Step 3: `move/route.ts`** — body `{ roomId: string | null }` (Zod). Validate the room belongs to the asset's property (fetch `getRoomsForProperty(asset.propertyId)` and check membership, or allow `null` to unassign). `updateAsset(id, { roomId })`; `logAssetEvent(id, profile.id, 'moved', <roomName or 'Unassigned'>)`. Return the new room.

- [ ] **Step 4: `flag-repair/route.ts`** — body `{ issueDescription: string; serviceDate?: string }` (Zod, `issueDescription` required, min 1). `createMaintenanceLog({ assetId: id, reportedBy: profile.id, issueDescription, serviceDate })`; `updateAsset(id, { status: 'in_repair' })`; `logAssetEvent(id, profile.id, 'repair_flagged', issueDescription)`. Return the created log id. Allowed for staff+.

- [ ] **Step 5: `maintenance/[logId]/resolve/route.ts`** — admin/PM only (staff → 403). Body `{ repairCost?: string; setActive?: boolean }`. `resolveMaintenanceLog(logId, profile.id)`; if `setActive`, `updateAsset(id, { status: 'active' })` + `logAssetEvent(id, profile.id, 'status_changed', 'repair resolved')`.

- [ ] **Step 6: Manual smoke** (dev server, admin): POST verify → `lastAuditedAt` updates; POST flag-repair → asset `status=in_repair` + a maintenance log appears on detail; POST resolve with `setActive` → back to `active`. Commit.
```bash
git add src/app/api/assets/[id]/verify src/app/api/assets/[id]/move src/app/api/assets/[id]/flag-repair src/app/api/assets/[id]/maintenance src/lib/db/queries/maintenance.ts
git commit -m "feat(far): scan-action + maintenance-resolve API routes"
```

---

### Task 5: Mobile quick-view card `/scan/asset/[id]`

**Files:**
- Create: `src/app/(portal)/scan/asset/[id]/page.tsx` (RSC — auth-gated)
- Create: `src/components/assets/asset-quick-view.tsx` (client — the three action buttons)

**Interfaces:**
- Consumes: `getAssetById(id, false)` (physical projection — safe for staff), `getRoomsForProperty(asset.propertyId)` for the Move dropdown, the three scan-action routes (Task 4).
- Produces: the mobile Quick-View Card. Auth-gated by middleware (not in `isPublicRoute`) + `requireAuth()` in the page.

- [ ] **Step 1: Build the server page** — `const profile = await requireAuth(); if(!profile) redirect('/login')`; `const asset = await getAssetById(id, false)`; if null → a friendly "Asset not found" card; else load `getRoomsForProperty(asset.propertyId)`; render `<AssetQuickView asset={asset} rooms={rooms} />`. Full-width mobile layout (no dependence on the sidebar; it renders inside the portal layout but the card is self-contained and centered).
- [ ] **Step 2: Build `asset-quick-view.tsx`**:
  - Header: asset image (if `imageUrl`), `name`, `assetCode`, current room (`roomName ?? 'Unassigned'`), status badge, and `lastAuditedAt` ("Last verified …").
  - **Verify Present** button → `POST /api/assets/[id]/verify` → on success show a toast + update the "Last verified" line.
  - **Move Location** → a `Select` of `rooms` (+ "Unassigned") → `POST /api/assets/[id]/move` → update displayed room.
  - **Flag for Repair** → opens a small textarea (issue description) + submit → `POST /api/assets/[id]/flag-repair` → on success show status flip to "In Repair".
  - Large tap targets (min-h-12), single column — this is the on-the-floor mobile surface.
- [ ] **Step 3: Manual check on a phone/emulator** — scan a printed/rendered QR → lands on the card (after login if needed) → Verify updates timestamp; Move changes room; Flag sets In Repair and creates a log visible on the desktop detail page. Commit.
```bash
git add "src/app/(portal)/scan/asset/[id]/page.tsx" src/components/assets/asset-quick-view.tsx
git commit -m "feat(far): mobile quick-view card with verify/move/flag actions"
```

---

### Task 6: Camera scanner page `/assets/scan`

**Files:**
- Modify: `package.json` (add `html5-qrcode`)
- Create: `src/app/(portal)/assets/scan/page.tsx` (RSC wrapper — heading only)
- Create: `src/components/assets/qr-scanner.tsx` (client — camera scan)

**Interfaces:**
- Consumes: `html5-qrcode`, `next/navigation` router.
- Produces: the "Scan" tab: a big "Tap to Scan" button that opens the rear camera, decodes a QR, extracts the asset id from the decoded URL, and routes to `/scan/asset/[id]`.

- [ ] **Step 1: Install**
```bash
npm install html5-qrcode
```
- [ ] **Step 2: Build `qr-scanner.tsx`** — `'use client'`:
  - A large "Tap to Scan" button that, on click, mounts an `Html5Qrcode` instance on a `<div id="qr-reader">` and calls `.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, onDecode)`.
  - `onDecode(text)`: parse the asset id — the QR encodes `${APP_URL}/scan/asset/<id>`; extract the last path segment (validate it's a UUID). Stop the scanner (`.stop()`), then `router.push('/scan/asset/<id>')`. If the decoded text isn't a recognizable asset URL, show "Unrecognized code" and keep scanning.
  - Provide a "Stop" button; clean up (`.stop()`/`.clear()`) on unmount.
  - Handle camera-permission denial with a clear message and a manual fallback link to the Directory.
- [ ] **Step 3: Build the page wrapper** `assets/scan/page.tsx` — `requireAuth()`, render heading + `<QrScanner />`.
- [ ] **Step 4: Manual check on a device** — Scan tab → Tap to Scan → grant camera → point at an asset QR → routes to the quick-view card. Commit.
```bash
git add package.json package-lock.json "src/app/(portal)/assets/scan/page.tsx" src/components/assets/qr-scanner.tsx
git commit -m "feat(far): camera QR scanner page"
```

---

## Self-Review (author's check against the spec)

- **Spec §5/§8 Dashboard** (KPI row, bar by property, pie by category, recent activity feed) → Tasks 1–2. ✓ Admin/PM-scoped; staff never reach it (tab hidden + `requireRole`).
- **Spec §6 QR generation** (render QR from `qrUrl`, printable label) → Task 3. ✓
- **Spec §6 scan flow + Quick-View actions** (Verify Present → `lastAuditedAt`; Move → `roomId`; Flag for Repair → maintenance log + `status=in_repair`; each writes an `asset_event`) → Tasks 4–5. ✓
- **Spec §6 scan target auth-gated** (not public) → Task 5 page under `(portal)` + `requireAuth`, no `isPublicRoute` entry. ✓
- **Spec §5.4 camera scanner** ("Tap to Scan", rear camera, routes to quick-view) → Task 6. ✓
- **Maintenance lifecycle** (pending → resolved, optional status-back-to-active) → Task 4 resolve route. ✓
- **Placeholder scan:** pure logic (activity feed) carries full test+impl; UI/route tasks give full route code + exact component responsibilities referencing installed libs. No TBDs.
- **Type consistency:** `DashboardData`, `FeedItem`, `buildActivityFeed`, and the Plan-1 `getAssetById`/`updateAsset`/`logAssetEvent` signatures are used consistently. `getMaintenanceLogsForAsset` is de-duplicated against Plan 1 Task 13 (note in Task 4 Step 1). ✓

## Notes for the executor
- `html5-qrcode` manipulates the DOM directly — keep its container stable and always `.stop()` before navigation/unmount to release the camera.
- The quick-view page renders inside the `(portal)` layout (sidebar present). If a chrome-free full-screen mobile card is wanted later, move it to its own minimal route group — deferred, not required for function.
- Camera APIs require HTTPS — works on `https://tvpl.morpheusds.com`, and on `localhost` (treated as secure) for dev, but not over a plain-HTTP LAN IP.
