# TaruShift Foundation, Engine & Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the TaruShift persistence foundation, deterministic hub-month generator, idempotent demo seed, and an authenticated read-only generated-roster preview using the approved hybrid matrix/day-inspector layout.

**Architecture:** A pure TypeScript engine under `src/lib/rostering/` consumes normalized data and produces a complete hub-cycle candidate without database access. Drizzle queries build the input and transactionally replace only unpublished draft snapshots. A small Portal surface lets authorized admins/property managers generate and inspect demo cycles; imports, manual edits, submission, publication, My Roster, and exports are delivered by the two follow-up plans.

**Tech Stack:** Next.js 16.1.6 App Router, React 19, TypeScript 5, Supabase PostgreSQL, Drizzle ORM 0.45, Zod 4, shadcn/Radix, Tailwind CSS 4, date-fns 4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-13-tarushift-roster-foundation-design.md`

## Global Constraints

- Keep employees separate from authenticated `profiles`; `profileId` is nullable and unique.
- Use existing dependencies only; add no runtime package.
- Every data-fetching page exports `dynamic = 'force-dynamic'`.
- APIs use `getProfile()` and enforce `orgId` plus property assignment server-side.
- Dynamic route params are awaited under Next.js 16.
- Use `zod/v4` for new validation code.
- Every mutation uses `.returning()` and every multi-row generation save is transactional.
- Engine code is pure, deterministic, and independent of database, API, UI, current time, locale, and random values.
- Published records are immutable. This plan writes draft cycles only.
- Store dates as `YYYY-MM-DD`, months as first-of-month ISO dates, and operating times in `Asia/Colombo` local time.
- Preserve user-owned untracked files and unrelated worktree changes.
- Run `npm test`, `npx tsc --noEmit`, and `npm run build` before completion.

## Delivery boundaries

This plan includes schema, migration, pure engine, generation queries/service, demo seed, generation API, navigation, draft list, and read-only hybrid preview.

It deliberately excludes CSV imports, setup CRUD screens, manual roster edits, overrides, submission/rejection/publication, revisions, employee self-view, print styling, and CSV export. Those features consume the exact schema and engine interfaces defined here.

---

### Task 1: Pure date, demand, and policy primitives

**Files:**
- Create: `src/lib/rostering/types.ts`
- Create: `src/lib/rostering/dates.ts`
- Create: `src/lib/rostering/demand.ts`
- Create: `src/lib/rostering/dates.test.ts`
- Create: `src/lib/rostering/demand.test.ts`

**Interfaces:**
- Produces: `GenerationInput`, `GenerationResult`, `EnginePolicy`, `EngineEmployee`, `RoleDemand`, `Violation`, `Assignment`, `ShiftSegment`.
- Produces: `datesInMonth(month)`, `previousBoundaryDates(month, weekStartsOn)`, `workWeekKey(date, weekStartsOn)`.
- Produces: `calculateDemand(input): RoleDemand[]`.
- Consumes: no database types.

- [ ] **Step 1: Write failing date tests**

```ts
import { describe, expect, it } from 'vitest'
import { datesInMonth, previousBoundaryDates, workWeekKey } from './dates'

describe('rostering dates', () => {
  it('returns all dates for leap February', () => {
    const dates = datesInMonth('2028-02-01')
    expect(dates).toHaveLength(29)
    expect(dates.at(-1)).toBe('2028-02-29')
  })

  it('returns the preceding dates needed for a Monday work week', () => {
    expect(previousBoundaryDates('2026-09-01', 1)).toEqual(['2026-08-31'])
  })

  it('groups Sunday and Monday into different Monday-start weeks', () => {
    expect(workWeekKey('2026-09-06', 1)).not.toBe(workWeekKey('2026-09-07', 1))
  })
})
```

- [ ] **Step 2: Run date tests and verify failure**

Run: `npx vitest run src/lib/rostering/dates.test.ts`

Expected: FAIL because `./dates` does not exist.

- [ ] **Step 3: Define engine contracts in `types.ts`**

Define these discriminants and interfaces exactly:

```ts
export type IsoDate = string
export type DutyCode = 'W' | 'O' | 'H' | 'AL' | 'SL' | 'LIEU' | 'TRN' | 'T' | 'S'
export type LaborTier = 'fixed' | 'variable'
export type ResidencyType = 'resident' | 'commuter'
export type ViolationSeverity = 'hard' | 'soft'

export interface EngineProperty {
  id: string
  name: string
  kind: 'hub' | 'spoke'
  barCloseTime: string
  transportCutoff: string
  multiZoneSeparation: boolean
  safariFocus: boolean
  outsourcedSecurity: boolean
}

export interface EngineRole {
  id: string
  code: string
  name: string
  departmentCode: string
  laborTier: LaborTier
  sameHubReliefEligible: boolean
  isAreaManager: boolean
  isPropertyManager: boolean
  minimumFloor: number
}

export interface EngineEmployee {
  id: string
  employeeNumber: string
  fullName: string
  roleId: string
  skillRoleIds: string[]
  basePropertyId: string
  residencyType: ResidencyType
  homeDistanceKm: number
  employmentStartDate: IsoDate
  employmentEndDate: IsoDate | null
}

export interface EngineForecast {
  propertyId: string
  date: IsoDate
  occupancyPercent: number
  arrivalsCount: number
  departuresCount: number
}

export interface EngineUnavailability {
  employeeId: string
  startDate: IsoDate
  endDate: IsoDate
  dutyCode: Extract<DutyCode, 'AL' | 'SL' | 'LIEU' | 'TRN'>
}

export interface EngineBoundaryAssignment {
  employeeId: string
  date: IsoDate
  workingMinutes: number
  restCategory: 'none' | 'full' | 'half'
}

export interface EngineCadre {
  propertyId: string
  roleId: string
  requiredDailyActive: number
  reliefMultiplier: number
}

export interface EngineStaffingBand {
  propertyId: string
  roleId: string
  occupancyMin: number
  occupancyMax: number
  requiredActive: number
}

export interface EngineShiftTemplate {
  id: string
  code: string
  roleId: string
  scheduledMinutes: number
  breakMinutes: number
  workingMinutes: number
  segments: Array<{ startTime: string; endTime: string; endsNextDay: boolean }>
}

export interface EnginePolicy {
  id: string
  workWeekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
  monthlyWorkdayTarget: number
  maxWorkingMinutesPerDay: number
  maxWorkingMinutesPerWeek: number
  fullRestDaysPerWeek: number
  halfRestDaysPerWeek: number
  travelDistanceThresholdKm: number
  areaManagerSpokeDays: number
  areaManagerOverlapDays: number
  residentTargetPercent: number
  commuterTargetPercent: number
}

export interface GenerationInput {
  hubId: string
  month: IsoDate
  policy: EnginePolicy
  properties: EngineProperty[]
  roles: EngineRole[]
  employees: EngineEmployee[]
  forecasts: EngineForecast[]
  unavailability: EngineUnavailability[]
  boundaryAssignments: EngineBoundaryAssignment[]
  cadre: EngineCadre[]
  staffingBands: EngineStaffingBand[]
  shiftTemplates: EngineShiftTemplate[]
}

export interface RoleDemand {
  propertyId: string
  date: IsoDate
  roleId: string
  requiredActive: number
  budgetedHeadcount: number
}

export interface ShiftSegment {
  startTime: string
  endTime: string
  endsNextDay: boolean
  sortOrder: number
}

export interface Assignment {
  employeeId: string
  date: IsoDate
  basePropertyId: string
  dutyPropertyId: string
  roleId: string
  dutyCode: DutyCode
  shiftTemplateId: string | null
  scheduledMinutes: number
  breakMinutes: number
  workingMinutes: number
  segments: ShiftSegment[]
  reasonCodes: string[]
  explanation: string
}

export interface Violation {
  ruleCode: string
  severity: ViolationSeverity
  message: string
  employeeId: string | null
  propertyId: string | null
  date: IsoDate | null
  evidence: Record<string, string | number | boolean | null>
}

export interface GenerationResult {
  assignments: Assignment[]
  demand: RoleDemand[]
  violations: Violation[]
}
```

- [ ] **Step 4: Implement date helpers**

Use UTC construction and formatting so host time zone cannot alter results. Reject a non-first-of-month input with `Error('month must be the first calendar date')`. `previousBoundaryDates` returns the ordered dates between the policy week start and the day before the month.

- [ ] **Step 5: Run date tests and verify pass**

Run: `npx vitest run src/lib/rostering/dates.test.ts`

Expected: PASS.

- [ ] **Step 6: Write failing demand tests**

Cover variable-band selection, FIXED protection, MVF, and cadre budget without silently lowering demand:

```ts
expect(calculateDemand(input)).toContainEqual({
  propertyId: 'hub', date: '2026-09-01', roleId: 'waiter',
  requiredActive: 1, budgetedHeadcount: 3,
})
```

Add a FIXED role whose 10% occupancy band says zero and assert `requiredActive` equals `requiredDailyActive`.

- [ ] **Step 7: Run demand tests and verify failure**

Run: `npx vitest run src/lib/rostering/demand.test.ts`

Expected: FAIL because `calculateDemand` does not exist.

- [ ] **Step 8: Implement `calculateDemand`**

Sort properties, dates, and roles by ID. For each tuple select exactly one matching inclusive band, calculate `ceil(requiredDailyActive * reliefMultiplier)`, protect FIXED demand with `requiredDailyActive`, and protect variable demand with `minimumFloor`. Throw exact errors for missing/overlapping bands or cadre.

- [ ] **Step 9: Run Task 1 tests**

Run: `npx vitest run src/lib/rostering/dates.test.ts src/lib/rostering/demand.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit Task 1**

```bash
git add src/lib/rostering/types.ts src/lib/rostering/dates.ts src/lib/rostering/demand.ts src/lib/rostering/*.test.ts
git commit -m "feat(rostering): add deterministic date and demand primitives"
```

---

### Task 2: Availability, rest, Area Manager relief, and shift allocation engine

**Files:**
- Create: `src/lib/rostering/availability.ts`
- Create: `src/lib/rostering/shifts.ts`
- Create: `src/lib/rostering/engine.ts`
- Create: `src/lib/rostering/availability.test.ts`
- Create: `src/lib/rostering/engine.test.ts`

**Interfaces:**
- Consumes: all Task 1 types and helpers.
- Produces: `buildAvailability(input): Map<string, Map<IsoDate, AvailabilityDay>>`.
- Produces: `generateRoster(input: GenerationInput): GenerationResult`.

- [ ] **Step 1: Write failing availability tests**

Test approved absence precedence, a September Monday–Sunday week, commuter no-split eligibility, eligible resident travel day replacing an available day, and deterministic rest placement. Assert every employee/date has exactly one availability state.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/rostering/availability.test.ts`

Expected: FAIL because `buildAvailability` does not exist.

- [ ] **Step 3: Implement availability state**

```ts
export interface AvailabilityDay {
  available: boolean
  fixedDutyCode: DutyCode | null
  reasonCode: string
}
```

Apply employment dates, approved unavailability, fixed weekly full/half rest, and travel-day eligibility in that precedence. Sort ties by employee number and ISO date. A half-rest day remains eligible only for a policy-valid half-day template; a full-rest day is unavailable.

- [ ] **Step 4: Run availability tests**

Run: `npx vitest run src/lib/rostering/availability.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing engine tests**

Build one hub, one spoke, Area Manager, spoke manager, waiter, housekeeper, chef, GSA, Night Auditor, and Bridge Commis fixtures. Add tests for:

- Stable output after reversing every input array.
- One waiter/chef/housekeeper minimum floor at low occupancy.
- Bridge Commis template selection.
- GSA morning/evening and Night Auditor coverage.
- Commuter cutoff and no split.
- Multi-zone waiter no split.
- Same-hub like-for-like relief only.
- Ordinary FIXED employee never transferred.
- Exactly ten Area Manager `S` days and at least seven spoke-manager rest/leave overlaps.
- Hard `UNCOVERED_DEMAND` violation when staff is insufficient.
- Soft `WORKDAY_TARGET_VARIANCE` and `RESIDENCY_MIX_VARIANCE` warnings.
- No employee/date duplicates and no weekly minute overflow.

- [ ] **Step 6: Run engine tests and verify failure**

Run: `npx vitest run src/lib/rostering/engine.test.ts`

Expected: FAIL because `generateRoster` does not exist.

- [ ] **Step 7: Implement shift selection helpers**

`selectShiftTemplate` accepts employee, role, property, date, active rank, active count, and policy templates. It applies named template codes in this precedence:

1. `BRIDGE_COMMIS`
2. `NIGHT_AUDITOR`
3. `GSA_MORNING` / `GSA_EVENING`
4. `SOLO_PIC`
5. `SAFARI_EARLY`
6. `ACTIVE_1_SPLIT`
7. `ACTIVE_2_MORNING` / `ACTIVE_2_CLOSE`
8. `ACTIVE_3_PLUS_MORNING` / `ACTIVE_3_PLUS_CLOSE` / `ACTIVE_3_PLUS_SPLIT`
9. Role default straight template

Reject a template that violates commuter, transport cutoff, bar close, or multi-zone rules. Return no template so the engine records a hard `NO_VALID_SHIFT` violation.

- [ ] **Step 8: Implement staged `generateRoster`**

Execute: validate normalized input → demand → availability → Area Manager spoke routing → base-property allocation → same-hub relief → shift timing → deterministic balancing → validation. Use the exact tie-break order from the specification. Create one assignment for every employee/date, including rest and approved absence codes, so the matrix has no implicit blanks.

- [ ] **Step 9: Run engine tests**

Run: `npx vitest run src/lib/rostering/*.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

```bash
git add src/lib/rostering
git commit -m "feat(rostering): add deterministic hub roster engine"
```

---

### Task 3: Rostering schema and migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0028_tarushift_foundation.sql`

**Interfaces:**
- Consumes: enum/value names in the approved specification and Task 1 types.
- Produces: Drizzle tables/types used by Tasks 4–8.

- [ ] **Step 1: Add schema enums**

Add enums with these values:

```ts
rosterHubPropertyKind: ['hub', 'spoke']
rosterLaborTier: ['fixed', 'variable']
rosterResidencyType: ['resident', 'commuter']
rosterPolicyStatus: ['draft', 'awaiting_hr_approval', 'approved', 'active', 'retired']
rosterInputSource: ['manual', 'csv', 'opera', 'mihcm']
rosterCycleStatus: ['draft', 'submitted', 'published', 'superseded']
rosterChildStatus: ['draft', 'submitted']
rosterViolationSeverity: ['hard', 'soft']
rosterViolationResolution: ['open', 'overridden', 'resolved_by_edit']
rosterAssignmentSource: ['generated', 'manual']
rosterRestCategory: ['none', 'full', 'half']
```

- [ ] **Step 2: Add topology/workforce/config tables**

Implement the specification's columns, indexes, and relations for:

`rosterHubs`, `rosterHubProperties`, `rosterDepartments`, `rosterRoles`, `rosterEmployees`, `rosterEmployeeSkills`, `rosterPropertySettings`, `rosterCadreRequirements`, `rosterStaffingBands`, `rosterPolicyVersions`, `rosterPolicyRules`, `rosterShiftTemplates`, and `rosterShiftTemplateSegments`.

Use effective-date columns on cadre/bands. Store policy rule numeric settings as explicit typed columns on `rosterPolicyRules`—not an unvalidated JSON blob. Store shift applicability code and template code as `varchar` so future policy versions do not require enum migrations.

- [ ] **Step 3: Add input/snapshot tables**

Implement:

`rosterImportBatches`, `rosterForecasts`, `rosterUnavailability`, `rosterBoundaryAssignments`, `rosterCycles`, `rosters`, `rosterInputSnapshots`, `rosterParticipants`, `rosterAssignments`, `rosterAssignmentSegments`, `rosterViolations`, and `rosterEvents`.

Use `jsonb` only for normalized historical snapshots, violation evidence, reason-code arrays, and event context. Add unique keys from the specification, including `(hubId, month, revision)` and `(cycleId, participantId, assignmentDate)`.

- [ ] **Step 4: Export inferred types**

Export select/insert types for every rostering table needed by query code, following existing `Vehicle`/`NewVehicle` conventions.

- [ ] **Step 5: Create migration SQL**

Write explicit PostgreSQL DDL matching the Drizzle schema, including enum creation, FK delete behavior, unique constraints, and indexes for:

- active employee lookup by org/base property;
- forecast property/date range;
- unavailability employee/date range;
- cycle hub/month/revision;
- assignment cycle/date/duty property;
- violations cycle/severity/resolution.

- [ ] **Step 6: Verify schema and migration**

Run:

```bash
npx tsc --noEmit
npx drizzle-kit check
```

Expected: both exit 0. Do not apply the migration to production in this task.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/lib/db/schema.ts drizzle/0028_tarushift_foundation.sql
git commit -m "feat(rostering): add TaruShift persistence schema"
```

---

### Task 4: Generation input queries and transactional draft persistence

**Files:**
- Create: `src/lib/db/queries/rostering-setup.ts`
- Create: `src/lib/db/queries/rostering-cycles.ts`
- Create: `src/lib/rostering/service.ts`
- Create: `src/lib/rostering/access.ts`
- Create: `src/lib/rostering/access.test.ts`

**Interfaces:**
- Produces: `getRosteringAccess(profileId, role, orgId): Promise<RosteringAccess>`.
- Produces: `buildGenerationInput(orgId, hubId, month): Promise<GenerationInput>`.
- Produces: `generateAndSaveDraft(args): Promise<{ cycleId: string; revision: number }>`.
- Produces: `getCyclePreview(orgId, cycleId)` and `listCycles(orgId, accessiblePropertyIds)`.
- Consumes: `generateRoster` from Task 2 and schema tables from Task 3.

- [ ] **Step 1: Write access tests**

Define a pure `canGenerateHub` helper and assert:

- admin can generate every hub;
- PM can generate only when assigned to every active property in the hub;
- PM can view a cycle when assigned to at least one child property;
- staff cannot generate or view management cycles.

- [ ] **Step 2: Run access tests and verify failure**

Run: `npx vitest run src/lib/rostering/access.test.ts`

Expected: FAIL because access helpers do not exist.

- [ ] **Step 3: Implement access helpers and query adapter**

```ts
export interface RosteringAccess {
  isAdmin: boolean
  propertyIds: string[] | null
  canManage: boolean
}
```

Admins use `propertyIds: null`. PMs use their existing property assignments. Staff receive `canManage: false`.

- [ ] **Step 4: Implement `buildGenerationInput`**

Load one active hub, active member properties, exactly one effective active policy and rule row, effective settings/cadre/bands, active employees/skills, every forecast date, overlapping unavailability, prior published assignments or boundary rows, and policy shift templates/segments. Convert numeric Drizzle strings to numbers. Sort all arrays before returning.

Throw exact domain errors:

- `Hub not found`
- `No active approved roster policy covers this month`
- `Forecast missing for PROPERTY on YYYY-MM-DD`
- `Prior-week boundary context missing for EMPLOYEE on YYYY-MM-DD`
- `Rostering setup is incomplete: DETAIL`

- [ ] **Step 5: Implement transactional draft save**

Generate before opening the transaction. In the transaction:

1. Lock/select the current highest revision for hub/month.
2. Reject replacement when the latest cycle is `published` or `superseded`; revision creation belongs to Plan 2.
3. Insert or update the draft cycle and increment optimistic version.
4. Delete only the current draft's child snapshot rows in FK-safe parent order.
5. Insert child rosters, input checksum/snapshot, participants, assignments, segments, violations, and one generation event.
6. Return the draft cycle ID/revision.

All inserts use `.returning()` where the returned ID is consumed.

- [ ] **Step 6: Implement preview reads**

`getCyclePreview` returns cycle metadata, property children, frozen participants, assignments with segments, violations, and per-property/date demand coverage. Ensure `orgId` is in the cycle predicate.

- [ ] **Step 7: Run tests and TypeScript**

Run:

```bash
npx vitest run src/lib/rostering/access.test.ts src/lib/rostering/*.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/lib/db/queries/rostering-setup.ts src/lib/db/queries/rostering-cycles.ts src/lib/rostering/service.ts src/lib/rostering/access.ts src/lib/rostering/access.test.ts
git commit -m "feat(rostering): persist generated draft cycles"
```

---

### Task 5: Idempotent demo hub seed

**Files:**
- Create: `scripts/seed-tarushift-demo.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: migrated rostering tables and two existing property UUIDs.
- Produces: deterministic demo setup for `YYYY-MM` and command `npm run seed:tarushift-demo -- HUB_ID SPOKE_ID YYYY-MM`.

- [ ] **Step 1: Add argument and safety validation**

Require exactly three arguments: hub property UUID, spoke property UUID, and `YYYY-MM`. Reject equal property IDs, invalid UUIDs/months, missing `POSTGRES_URL`/`DATABASE_URL`, properties outside one organization, or inactive properties.

- [ ] **Step 2: Implement stable demo identities**

Use stable codes prefixed `DEMO_` and employee numbers `DEMO-001` through `DEMO-022`. Include Area Manager, spoke manager/PIC, Night Auditor, GSAs, Bridge Commis, chefs, waiters, housekeepers, maintenance, driver/gardener/sweeper/support roles. Ensure a 60:40-near resident/commuter mix, FIXED/VARIABLE roles, and secondary skills.

- [ ] **Step 3: Seed policy/configuration**

Upsert one hub and property membership, departments/roles, property settings, 1.5 cadre multiplier, full 0–100 occupancy bands, an active demo-approved policy, policy rules, and all named shift templates. Use explicit local times and segment rows.

- [ ] **Step 4: Seed planning inputs**

Upsert every month date for both properties with a deterministic occupancy wave, arrivals/departures, at least two approved unavailability blocks, and the preceding boundary dates for every employee. Do not create profiles or auth users.

- [ ] **Step 5: Make reruns idempotent**

Use transaction plus `ON CONFLICT DO UPDATE` on stable codes/keys. Delete/reinsert only demo-owned shift segments and employee skills whose parent stable demo row is being refreshed. Never delete a non-demo employee or non-`DEMO_` configuration row.

- [ ] **Step 6: Add npm script and document output**

Add:

```json
"seed:tarushift-demo": "node scripts/seed-tarushift-demo.mjs"
```

Print selected properties, month, employee count, policy version, and the `/rostering` path on success.

- [ ] **Step 7: Verify script syntax**

Run: `node --check scripts/seed-tarushift-demo.mjs`

Expected: exit 0. Run against a database only after migration is applied to the chosen environment.

- [ ] **Step 8: Commit Task 5**

```bash
git add scripts/seed-tarushift-demo.mjs package.json
git commit -m "feat(rostering): add idempotent TaruShift demo seed"
```

---

### Task 6: Generation API and cycle read API

**Files:**
- Create: `src/app/api/rostering/generate/route.ts`
- Create: `src/app/api/rostering/cycles/route.ts`
- Create: `src/app/api/rostering/cycles/[id]/route.ts`

**Interfaces:**
- Consumes: Task 4 access/service/query functions.
- Produces: authenticated JSON APIs used by the Portal preview.

- [ ] **Step 1: Implement generation validation**

```ts
const schema = z.object({
  hubId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-01$/, 'Use the first date of the month'),
})
```

- [ ] **Step 2: Implement `POST /api/rostering/generate`**

Require active admin or property manager. Resolve active hub properties and apply `canGenerateHub`. Return 403 when the PM lacks any member property. Call `generateAndSaveDraft` and return `{ cycleId, revision }` with 201. Map known setup errors to 400; unexpected errors use correlation ID and 500.

- [ ] **Step 3: Implement cycle list/read**

`GET /api/rostering/cycles` lists only cycles with at least one accessible child property. `GET /api/rostering/cycles/[id]` awaits params and returns 404 rather than leaking a cycle outside org/property scope.

- [ ] **Step 4: Verify route types**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/app/api/rostering
git commit -m "feat(rostering): expose draft generation APIs"
```

---

### Task 7: Rostering landing page and navigation

**Files:**
- Create: `src/app/(portal)/rostering/page.tsx`
- Create: `src/components/rostering/rostering-home.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/header.tsx`

**Interfaces:**
- Consumes: list/read queries and generation API.
- Produces: `/rostering` hub/month readiness and existing draft list.

- [ ] **Step 1: Add sidebar and breadcrumb**

Add a `CalendarClock` Rostering main item visible to admins and property managers. Staff do not see management Rostering in the sidebar; Plan 3 adds their My Roster entry. Add `rostering: 'Rostering'` and `approvals: 'Approvals'` labels.

- [ ] **Step 2: Implement server page**

Use `requireAuth()`, reject staff to `/surveys`, load accessible hubs/properties and recent cycles directly from queries, export `force-dynamic`, and render `RosteringHome`.

- [ ] **Step 3: Implement generation form**

Use existing Select/Button/Card components. Admin chooses any active hub; PM sees only hubs for which they can generate. Month input normalizes to first-of-month. POST to generation API, toast exact server error, then `router.push('/rostering/' + cycleId)` and `router.refresh()`.

- [ ] **Step 4: Implement draft list**

Show hub, month, revision, status, policy, hard/soft counts, generated timestamp, and Open action. Include an empty state explaining that setup/demo data is required before generation.

- [ ] **Step 5: Verify page types**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add 'src/app/(portal)/rostering/page.tsx' src/components/rostering/rostering-home.tsx src/components/layout/app-sidebar.tsx src/components/layout/header.tsx
git commit -m "feat(rostering): add generation landing page"
```

---

### Task 8: Read-only hybrid roster preview

**Files:**
- Create: `src/app/(portal)/rostering/[cycleId]/page.tsx`
- Create: `src/components/rostering/roster-preview.tsx`
- Create: `src/components/rostering/roster-matrix.tsx`
- Create: `src/components/rostering/day-inspector.tsx`
- Create: `src/lib/rostering/presentation.ts`
- Create: `src/lib/rostering/presentation.test.ts`

**Interfaces:**
- Consumes: `getCyclePreview` and frozen snapshot rows.
- Produces: the approved employee-by-day matrix with selected-day inspector.

- [ ] **Step 1: Write presentation tests**

Test duty labels, overnight segment formatting, scheduled/break/working-minute formatting, property-group filtering, and violation grouping. Assert `22:00–07:00 (+1)` for an overnight segment and `8h working · 1h break` for 480/60 minutes.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/rostering/presentation.test.ts`

Expected: FAIL because `presentation.ts` does not exist.

- [ ] **Step 3: Implement pure presentation helpers**

Export `formatSegment`, `formatMinutes`, `dutyLabel`, `buildMatrixRows`, and `buildDayInspection`. Keep these free of React so output behavior is unit-tested.

- [ ] **Step 4: Implement server page**

Await `cycleId`, require admin/PM, enforce org/property visibility through the query, return `notFound()` when inaccessible, export `force-dynamic`, and pass serializable preview data to `RosterPreview`.

- [ ] **Step 5: Implement matrix**

Use a semantic table in a horizontally contained responsive area. Freeze the employee identity column with CSS, render all calendar days, and provide text/tooltips for every duty code. Filters cover property, department, role, and issue state. A cell button selects employee/date; do not implement editing in this plan.

- [ ] **Step 6: Implement selected-day inspector**

Show employee, base/duty property, role, duty label, ordered segments, scheduled/break/working totals, explanation, reason codes, and hard/soft violations. Use destructive/warning labels with icons and text, not color alone.

- [ ] **Step 7: Add cycle summary**

Show status, month, revision, policy version, coverage count, hard/soft counts, property tabs, and a Regenerate button that warns that the current draft snapshot is replaced. Do not show submit/publish actions yet.

- [ ] **Step 8: Run preview tests and type check**

Run:

```bash
npx vitest run src/lib/rostering/presentation.test.ts src/lib/rostering/*.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit Task 8**

```bash
git add 'src/app/(portal)/rostering/[cycleId]/page.tsx' src/components/rostering src/lib/rostering/presentation.ts src/lib/rostering/presentation.test.ts
git commit -m "feat(rostering): add hybrid roster preview"
```

---

### Task 9: Plan 1 verification and operator handoff

**Files:**
- Modify: `CLAUDE.md`
- Create: `docs/rostering-preview-runbook.md`

**Interfaces:**
- Documents: migration, demo seed, route, permissions, known Plan 1 limits, and verification evidence.

- [ ] **Step 1: Document environment/run sequence**

Write exact steps:

1. Apply `drizzle/0028_tarushift_foundation.sql` to the target database.
2. Run `npm run seed:tarushift-demo -- HUB_PROPERTY_UUID SPOKE_PROPERTY_UUID 2026-09`.
3. Start the Portal and open `/rostering` as admin.
4. Generate September 2026 and open the preview.
5. Confirm hub/spoke assignments, violations, and deterministic regeneration.

State that Plan 1 previews drafts only and does not publish.

- [ ] **Step 2: Update project guide**

Add the rostering domain, route, schema group, demo-seed command, and Phase 1 status to `CLAUDE.md`. Do not describe deferred integrations as shipped.

- [ ] **Step 3: Run focused tests**

Run: `npx vitest run src/lib/rostering`

Expected: all rostering tests pass.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm test
npx tsc --noEmit
npm run build
git diff --check
```

Expected: all exit 0.

- [ ] **Step 5: Inspect requirements**

Confirm:

- engine contains no DB/current-time/random access;
- every data page has `force-dynamic`;
- APIs enforce org/property scope;
- no published-row mutation exists;
- generated arrays are deterministic;
- preview has no edit/submit/publish controls;
- unrelated untracked files remain untouched.

- [ ] **Step 6: Commit Task 9**

```bash
git add CLAUDE.md docs/rostering-preview-runbook.md
git commit -m "docs(rostering): add preview runbook"
```

## Follow-up plans

After this plan passes:

1. **Management imports and lifecycle:** employee/forecast/unavailability preview-and-commit imports, setup CRUD, manual assignment edits, soft overrides, property-child submission, admin rejection, atomic publication, and revision creation.
2. **Staff view and exports:** My Roster authorization/mobile UI, publication notifications, print/PDF styles, published CSV export, and full acceptance journey.
