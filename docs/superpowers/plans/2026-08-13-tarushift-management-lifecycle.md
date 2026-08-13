# TaruShift Management Lifecycle Implementation Plan

**Goal:** Complete the approved Phase 1 management workflow on top of the verified roster foundation: CSV/manual source inputs, draft assignment changes, soft-warning overrides, property submission, admin rejection/publication, immutable revisions, staff self-view, and CSV/print output.

**Architecture:** Pure CSV and lifecycle validation helpers remain independent of HTTP and React. Tenant/property authorization is resolved server-side for every route. Draft mutations lock the hub-month cycle, increment its optimistic version, revalidate the complete candidate, and append events. Publication is a single transaction that requires every child submitted, zero open hard violations, all soft warnings resolved or overridden, and an active approved policy. Published rows are never updated; corrections create revision `n + 1`.

**Stack:** Existing Next.js 16 App Router, React 19, TypeScript, Drizzle/PostgreSQL, Zod v4, shadcn/Radix, Tailwind, Vitest. No new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-08-13-tarushift-roster-foundation-design.md`

## Global constraints

- Use existing `src/lib/assets/csv.ts` parsing conventions where compatible; add no CSV dependency.
- Preview and commit both parse and validate server-side. Commit resubmits CSV plus preview checksum, preventing client-tampered normalized rows.
- Imported/manual forecast and unavailability records are approved source data and immediately block/recompute roster availability; no leave balances or requests.
- Employee import never creates Portal profiles. Linking remains an explicit admin action outside CSV commit.
- All mutations use `.returning()` and all multi-row changes use transactions.
- Require the caller's expected cycle `version` for every draft/lifecycle mutation; return `409` on stale versions.
- PM scope is child-property based. Admin-only: override acceptance policy decisions, rejection, publication, and revision creation.
- Hard violations are never overridable. Soft overrides require a non-empty reason and append an event.
- Published cycles and their child rows, snapshots, participants, assignments, segments, and violations are immutable.
- Data pages export `dynamic = 'force-dynamic'`; dynamic params are awaited.
- Tests, type check, feature-scoped lint, Drizzle check, and production build gate completion.

---

## Task 1: Pure CSV contracts and import previews

**Files:**
- Create `src/lib/rostering/imports.ts`
- Create `src/lib/rostering/imports.test.ts`
- Create `src/app/api/rostering/imports/[type]/preview/route.ts`

1. Write failing tests for quoted fields, required headers, duplicate stable keys, ISO dates, month/date range, residency values, non-negative counts/percentages, and row-numbered errors.
2. Define parsers for employee, forecast, unavailability, and boundary CSV contracts from the specification.
3. Return `{ checksum, headers, rows, summary, errors }`; checksum is SHA-256 over canonical normalized input.
4. Preview route accepts `{ csv, month? }`, limits payload/row count, requires active admin/PM, and returns 400 with row evidence when invalid.
5. Verify tests and types.

## Task 2: Transactional import commits and manual source entry

**Files:**
- Create `src/lib/db/queries/rostering-imports.ts`
- Create `src/app/api/rostering/imports/[type]/commit/route.ts`
- Create `src/app/api/rostering/forecasts/route.ts`
- Create `src/app/api/rostering/unavailability/route.ts`

1. Reparse CSV on commit and compare the supplied preview checksum.
2. Employee commit is admin-only; forecast/unavailability/boundary commit allows PMs only for fully assigned properties/employees in their accessible hub scope.
3. Upsert by stable keys, create an import batch with counts and normalized audit summary, and never create/delete profiles.
4. Manual forecast and unavailability APIs use the same validators and source `manual`; all writes are tenant/property scoped.
5. Append an import event to any affected draft cycle without mutating published cycles.

## Task 3: Input management UI

**Files:**
- Create `src/app/(portal)/rostering/setup/page.tsx`
- Create `src/components/rostering/import-panel.tsx`
- Create `src/components/rostering/forecast-grid.tsx`
- Create `src/components/rostering/unavailability-manager.tsx`
- Modify sidebar/header labels and Rostering landing actions

1. Add setup tabs for Employees, Forecast, Approved unavailability, and Boundary context.
2. Implement CSV download templates, drag/select upload, preview summary, row errors, checksum-backed commit, and exact server errors.
3. Add compact calendar/grid entry for daily occupancy forecasts and approved unavailability.
4. Clearly state that source records are already approved and leave balance/request workflows are absent.

## Task 4: Draft revalidation and manual assignment editing

**Files:**
- Create `src/lib/rostering/lifecycle.ts`
- Create `src/lib/rostering/lifecycle.test.ts`
- Create `src/lib/db/queries/rostering-lifecycle.ts`
- Create `src/app/api/rostering/cycles/[id]/assignments/[assignmentId]/route.ts`

1. Write pure tests for published immutability, version conflicts, qualification/property/unavailability checks, no double booking, minutes, and hard/soft revalidation.
2. PATCH accepts duty property, duty code, role, shift template, explanation, and expected cycle version.
3. Lock draft cycle, authorize the caller for both affected child properties, update assignment/segments, mark source `manual`, recompute affected and cycle-level violations, increment version, and append before/after event.
4. UI adds an edit drawer only for editable draft cells; read-only behavior remains for submitted/published records.

## Task 5: Soft-warning overrides and child submission

**Files:**
- Create `src/app/api/rostering/cycles/[id]/violations/[violationId]/override/route.ts`
- Create `src/app/api/rostering/cycles/[id]/children/[rosterId]/submit/route.ts`
- Extend lifecycle query/service and preview UI

1. Override API is admin-only, soft/open-only, requires reason plus expected version, writes resolver/timestamp and event.
2. Child submission permits an assigned PM or admin, rejects open hard violations affecting the child and open soft warnings without override/resolution, and records submitter/time.
3. When every active child is submitted, atomically mark the cycle submitted.
4. UI shows exact blockers, override history, and property-specific submit action; no publication control for PMs.

## Task 6: Admin rejection, atomic publication, and immutable revisions

**Files:**
- Create approval/reject/publish/revision API routes under `src/app/api/rostering/cycles/[id]/`
- Create `src/app/(portal)/rostering/approvals/page.tsx`
- Create `src/components/rostering/approval-queue.tsx`
- Extend lifecycle service/tests

1. Rejection is admin-only, requires comments and one or more child IDs, returns those children and cycle to draft, increments version, and appends an event.
2. Publication locks the cycle and active policy, requires all child rosters submitted, zero open hard violations, zero unresolved soft warnings, and status submitted.
3. Publish every child/cycle atomically and supersede only the prior published revision for the same hub/month.
4. Revision creation copies frozen participants, assignments, segments, and unresolved context into revision `n + 1` draft without changing the existing publication.
5. Approval queue groups hub/month readiness and exposes admin-only reject/publish controls.

## Task 7: Employee self-view and publication notifications

**Files:**
- Create `src/app/(portal)/my-roster/page.tsx`
- Create `src/components/rostering/my-roster.tsx`
- Create `src/app/api/rostering/my-roster/route.ts`
- Modify navigation and publication service

1. Staff access resolves `rosterEmployees.profileId = profile.id` within the same org.
2. Return only published assignments for that linked employee; never expose draft cycles or other employees.
3. Mobile-first month agenda shows duty code, property, local segments, explanation, rest/leave/travel, and publication/revision marker.
4. Publication inserts in-app notifications for linked participants using the existing notification table.

## Task 8: CSV export and print view

**Files:**
- Create `src/lib/rostering/export.ts`
- Create `src/lib/rostering/export.test.ts`
- Create cycle CSV route and print page/styles
- Extend preview controls

1. Test stable CSV headers/order, quoting, duty property, overnight segments, and published-only staff-safe export behavior.
2. Management export enforces cycle visibility; staff export returns only their published row.
3. Print page includes cycle identity, revision/status, legend, matrix, and generated timestamp, with print-safe sticky-column reset and repeated table headers.

## Task 9: Verification and runbook update

1. Update runbook with import templates, lifecycle roles, publication/revision checks, staff linking, export, and rollback guidance.
2. Run focused red/green tests throughout.
3. Final gates: `npm test`, `npx tsc --noEmit`, feature-scoped ESLint, `npx drizzle-kit check`, `npm run build`, and `git diff --check`.
4. Confirm tenant/property scoping, immutable publication, expected-version checks, event coverage, no auth-user creation from employee CSV, and no cross-hub generation.
