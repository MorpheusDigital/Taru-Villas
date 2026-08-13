# TaruShift Roster Foundation — Design Specification

**Date:** 2026-08-13

**Status:** Approved, ready for implementation planning

**Source brief:** TARUSHIFT v10.0 — Master Technical Specification

**Delivery slice:** Phase 1 of 4

## 1. Summary

TaruShift Phase 1 adds an authenticated rostering domain to the existing Taru Villas Portal. It establishes the workforce master, hub-and-spoke topology, property constraints, approved policy versions, daily demand forecasts, approved unavailability, deterministic monthly roster generation, controlled manual overrides, admin approval, immutable publication, employee self-service viewing, and print/CSV output.

This is a **Roster Foundation**, not the whole v10 platform. It deliberately proves the operating model and policy rules before live PMS, HR, biometric, payroll, or cross-hub automation is introduced.

The management workspace uses the approved hybrid layout: a compact employee-by-day month matrix and a selected-day inspector showing shift timing, coverage, explanations, and violations. Property managers prepare drafts. An admin must approve and publish every completed hub cycle. Linked staff accounts can view only their own published assignments.

## 2. Why v10 is decomposed

The source brief contains four coupled but independently deliverable systems:

| Phase | Scope | Depends on |
|---|---|---|
| **1 — Roster Foundation** (this specification) | Workforce, hubs, policies, forecasts, unavailability, deterministic monthly generation, same-hub relief, approval, publication, staff view, print/CSV | Nothing external |
| 2 — OPERA Intelligence | OHIP occupancy/arrival/departure ingestion, annual RAG planning, smart prompts, leave blackouts | Confirmed OPERA payloads and credentials |
| 3 — Portfolio Exchange | Automated surplus routing and cross-hub like-for-like matching | Proven Phase 1 rules and travel/dormitory policy |
| 4 — MiHCM Reconciliation | Employee/leave sync, biometric ingestion, roster reconciliation, payroll export | Confirmed MiHCM API and HR/payroll sign-off |

The existing Oracle client and cron patterns remain reusable, but live OPERA writes are outside Phase 1. The Phase 1 forecast interface is designed so OPERA can later upsert the same canonical daily records without changing the roster engine.

## 3. Goals

Phase 1 must:

1. Keep HR employees separate from authenticated Portal profiles while allowing an optional one-to-one link for My Roster.
2. Import employee master data from a MiHCM-shaped CSV with a safe preview and idempotent commit.
3. Model the five-hub topology without requiring all hubs to be configured for the preview.
4. Capture property constraints, cadre, occupancy bands, shift templates, and compliance rules as versioned configuration.
5. Accept daily forecasts and approved unavailability by both manual entry and CSV.
6. Generate the same roster for the same frozen inputs every time.
7. Include same-hub spoke duty and the Area Manager 10-day/7-day-overlap rule.
8. Enforce hard rules, expose soft warnings, and audit every override reason.
9. Require admin publication and preserve every published revision immutably.
10. Give linked staff a privacy-safe, mobile-first view of their published assignments.
11. Provide full-roster browser print/PDF output and CSV export.
12. Ship an explicit, rerunnable demo seed for one hub, one spoke, and roughly 18–24 synthetic employees.

## 4. Non-goals

Phase 1 does not include:

- Live OPERA/OHIP forecast synchronization.
- Annual April–March RAG forecasting.
- OPERA smart prompts, leave blackouts, or Poya wage decisions.
- Automated cross-hub exchange (`X-HUB`).
- MiHCM API synchronization.
- Leave requests, approvals, accruals, or balance management.
- Biometric punches, attendance reconciliation, payable-hours clipping, or payroll export.
- Silent legal conclusions. The application executes an organization-approved policy and is not legal advice.
- Authentication-account creation from employee imports.
- NIC, salary, medical details, or other HR data not needed for rostering.

## 5. Resolved product decisions

| Question | Decision |
|---|---|
| Employee master | MiHCM-style CSV import plus controlled manual correction |
| Preview data | Explicit seed for one hub property, one spoke, and roughly 18–24 synthetic employees |
| Access | Admins and PMs manage; linked staff view their own published roster |
| Approval | PMs prepare and submit; admins approve and publish |
| Month rule | Calendar-month planning; 24 workdays is a target subject to weekly-rest and hour rules |
| Demand before OPERA | Manual/CSV daily forecasts plus configurable property/role occupancy bands |
| Overrides | Hard violations block; soft warnings require a reason and immutable audit entry |
| Relief | Same-hub relief plus Area Manager 10-day/7-overlap rule; cross-hub deferred |
| Compliance | Weekly-rest-first; continuous blocks only represent approved leave |
| Policies | Versioned configuration; only HR-approved active policy produces publishable rosters |
| Unavailability | Approved CSV/manual records; no leave-request workflow |
| Workspace | Hybrid month matrix and selected-day inspector |
| Publication output | Portal view, print/PDF-friendly view, and CSV |
| Engine | Deterministic staged TypeScript pipeline |

## 6. Existing Portal foundations

The implementation stays within the current Next.js 16 App Router, React 19, Supabase PostgreSQL, Drizzle, Zod v4, shadcn/Radix, Tailwind, date-fns, TanStack Table, nuqs, and Vitest stack.

It reuses established Portal patterns:

- `profiles` and `propertyAssignments` for authentication and property access.
- `properties.oracleHotelId` and the Oracle client as future OPERA integration points.
- `dailyOccupancy` only as historical operational data; roster forecasts remain a separate forward-looking model.
- Server Components with `force-dynamic` for fresh data.
- Server-side API authorization with `getProfile()` and property-access checks.
- Existing pure CSV utilities, adding domain-specific validation rather than a new dependency.
- Fleet-engine patterns for deterministic allocation, explanations, manual intervention, and tests.
- Browser print styles for PDF creation; no PDF-generation package is introduced.

## 7. Domain architecture

The Phase 1 domain is split into six bounded modules.

### 7.1 Workforce

Owns employee identity, primary role, base property, classification, skills, active dates, and optional Portal-profile link. It does not own authentication or leave balances.

### 7.2 Operating setup

Owns hubs, hub/spoke property membership, property trap-door constraints, role definitions, cadre, demand bands, policy versions, rule definitions, and shift templates.

### 7.3 Planning inputs

Owns forward-looking property/date forecasts and approved employee unavailability. These records exist independently of rosters and retain their source and import history.

### 7.4 Generation engine

A pure TypeScript function receives a fully normalized, frozen input object and returns either a complete candidate hub cycle plus violations or blocking preflight errors. It performs no database access and has no dependence on UI or API code.

### 7.5 Roster lifecycle

Owns hub-month planning cycles, property views, frozen participant/assignment snapshots, validation results, state transitions, publication, revisions, and append-only events.

### 7.6 Read and export

Owns management views, approval review, employee self-view, print layout, and CSV serialization. It never mutates roster state.

## 8. Hub-cycle consistency

Same-hub relief cannot be generated safely as independent property transactions: an employee could otherwise be double-booked or the Area Manager overlap could depend on a stale spoke draft. Therefore generation and publication use a **hub-month cycle**.

- A `roster_cycle` represents one hub and calendar month.
- It contains one child `roster` for every active property in that hub.
- Managers edit only child rosters for properties they are assigned to.
- Inbound relief is visible in the duty property's view, even though the participant retains their base property.
- Any cross-property edit revalidates the entire cycle.
- Each child roster is submitted by an authorized PM or admin.
- The cycle becomes reviewable only when every active child roster is submitted.
- Admin approval publishes all child rosters atomically. This prevents one property from publishing an assignment that conflicts with an unpublished hub partner.

The Approvals queue groups work by hub and month while displaying the readiness of each property. This is the consistency mechanism for Phase 1; it is not the deferred cross-hub exchange.

## 9. Data model

All top-level records are tenant-scoped by `orgId`. Child records inherit tenant scope through a non-null parent foreign key. Tables follow existing Drizzle conventions with UUID primary keys, timestamps, explicit relations, and `.returning()` for mutations.

### 9.1 Workforce and topology

#### `roster_hubs`

- `orgId`, `name`, `code`, `isActive`, audit timestamps.
- Unique `(orgId, code)`.

#### `roster_hub_properties`

- `hubId`, `propertyId`, `kind` (`hub` or `spoke`), `isActive`.
- Unique property membership: a property belongs to at most one active roster hub.
- Exactly one active hub property per active hub; enforced transactionally.

#### `roster_departments`

- `orgId`, `name`, `code`, `sortOrder`, `isActive`.
- Unique `(orgId, code)`.

#### `roster_roles`

- `orgId`, `departmentId`, `name`, `code`.
- `laborTier`: `fixed` or `variable`.
- Flags for `sameHubReliefEligible`, `isAreaManager`, `isPropertyManager`, and `isMinimumFloorRole`.
- `defaultSkillCodes` are not duplicated here; role equivalence is represented by employee skills.
- Unique `(orgId, code)`.

#### `roster_employees`

- `orgId`, stable `employeeNumber`, `fullName`, `roleId`, `basePropertyId`.
- `residencyType`: `resident` or `commuter`.
- `homeDistanceKm`, `employmentStartDate`, nullable `employmentEndDate`, `isActive`.
- Nullable, unique `profileId` with `onDelete: set null`.
- `isDemo` distinguishes preview data without changing engine behavior.
- Unique `(orgId, employeeNumber)`.

An employee is not a Portal profile. CSV import never creates Supabase users or profiles. Profile linking requires an explicit preview confirmation and an active profile in the same organization.

#### `roster_employee_skills`

- `employeeId`, `roleId`, `isPrimary`.
- Unique `(employeeId, roleId)`.
- The employee's `roleId` is also recorded as the single primary skill for simple queries.

### 9.2 Property and demand configuration

#### `roster_property_settings`

One active record per property:

- `barCloseTime`.
- `transportCutoff`.
- `multiZoneSeparation`.
- `safariFocus`.
- `outsourcedSecurity`.
- Time zone fixed to `Asia/Colombo` for Phase 1.

Physical constraints are hard rules once a policy binds behavior to them. A missing required setting blocks generation rather than falling back silently.

#### `roster_cadre_requirements`

- `propertyId`, `roleId`, `requiredDailyActive`, `reliefMultiplier`, `effectiveFrom`, nullable `effectiveTo`.
- Unique non-overlapping effective record per property/role/date.
- Default relief multiplier is seeded as `1.5`, but is policy/configuration rather than code.
- `budgetedHeadcount = ceil(requiredDailyActive × reliefMultiplier)`.

Cadre is a workforce budget. Daily demand remains visible when it exceeds cadre; the engine does not hide uncovered demand by silently lowering it.

#### `roster_staffing_bands`

- `propertyId`, `roleId`, `occupancyMin`, `occupancyMax`, `requiredActive`, effective dates.
- Bands for one property/role cannot overlap and must cover 0–100% before generation.
- FIXED roles ignore occupancy reduction and retain their configured active requirement.
- Variable waiter, chef, and housekeeper roles apply a minimum viable floor of one where configured.

### 9.3 Versioned policies

#### `roster_policy_versions`

- `orgId`, `name`, integer `version`.
- Status: `draft`, `awaiting_hr_approval`, `approved`, `active`, or `retired`.
- `effectiveFrom`, nullable `effectiveTo`.
- HR approval fields: `approvedByName`, `approvedAt`, `evidenceReference`.
- Portal audit fields: `createdBy`, `activatedBy`, timestamps.
- Unique `(orgId, name, version)`.

Only one policy is active for a date. An approved policy is immutable. Editing creates a new draft version. Activation is admin-only and requires all HR approval fields. Retiring a policy does not alter historical rosters.

Unapproved policies may be used only by admins in a clearly labeled simulation that does not create a publishable roster.

#### `roster_policy_rules`

Structured, version-owned rule configuration includes:

- Maximum working minutes per day and policy-defined fixed work week.
- Required full and half-weekly-rest quantities and their measurement windows.
- Default monthly workday target.
- Meal/rest break thresholds and minutes.
- Minimum split-shift gap and maximum spreadover.
- Commuter straight-shift and cutoff constraints.
- Resident travel-day eligibility threshold.
- Resident/commuter composition target.
- Area Manager spoke-duty count and required overlap count.
- Rule severity (`hard` or `soft`) and stable rule code.

Rule code and core calculation type are application-defined; numerical thresholds and severity belong to the policy version. Rules required for identity integrity, double-booking, approved unavailability, physical property boundaries, and publication authorization cannot be downgraded below hard.

#### `roster_shift_templates` and `roster_shift_segments`

Templates belong to a policy version and role or operational lock. They hold duty code, label, applicability, scheduled minutes, break minutes, payable minutes, and one or more ordered time segments.

The initial draft policy seeds, but does not activate without HR approval:

- Bridge Commis 11:00–20:00 straight shift.
- Night Auditor 22:00–07:00.
- Morning GSA 07:00–16:00.
- Evening GSA 14:00–23:00.
- Solo PIC 11:00–16:00 and 19:00–23:00.
- Active-rank waiter/housekeeping morning, close, and split patterns.
- Safari early-start templates.

Scheduled elapsed minutes, unpaid break minutes, and payable/working minutes are distinct. The expected default straight shift is nine elapsed hours with a one-hour meal break and eight payable hours, subject to HR approval of the policy version.

### 9.4 Planning inputs and imports

#### `roster_forecasts`

- `propertyId`, `forecastDate`, `occupancyPercent`, `arrivalsCount`, `departuresCount`.
- `source`: `manual`, `csv`, or future `opera`.
- `importBatchId`, `updatedBy`, timestamps.
- Unique `(propertyId, forecastDate)`.

Forecasts are forward-looking and remain separate from historical `dailyOccupancy`.
Phase 1 demand bands consume `occupancyPercent`; arrival and departure counts are retained for the future OPERA intelligence phase and shown as planning context only.

#### `roster_unavailability`

- `employeeId`, `startDate`, `endDate` inclusive.
- `type`: `annual_leave`, `sick_leave`, `lieu`, `training`, `travel_restriction`, or `other`.
- `source`: `manual`, `csv`, or future `mihcm`.
- Optional external reference and operational note.
- `importBatchId`, `createdBy`, timestamps.

Every record is treated as already approved source data and blocks assignment for its dates. Phase 1 does not calculate balances or approve requests. Annual-leave blocks may be continuous; the generator does not manufacture annual leave to satisfy monthly targets.

#### `roster_boundary_assignments`

This table provides the minimum schedule context needed for the first system-managed month:

- `employeeId`, `assignmentDate`, working minutes, and rest category.
- Source `manual` or `csv`, recorder, and timestamps.
- Unique `(employeeId, assignmentDate)`.

It accepts only dates before an employee's first published TaruShift cycle and is not an attendance record. Once prior published TaruShift assignments exist, those immutable assignments are the boundary source and manual boundary rows are ignored for the covered dates.

#### `roster_import_batches`

- `orgId`, import type, source file name, file checksum.
- Status, total/add/update/unchanged/error counts.
- Normalized preview summary and commit metadata.
- The raw uploaded file is not retained after commit; normalized audit facts are retained.

### 9.5 Roster cycles and immutable snapshots

#### `roster_cycles`

- `orgId`, `hubId`, `month` stored as the first calendar date, `revision`.
- Status: `draft`, `submitted`, `published`, or `superseded`.
- `policyVersionId`, optimistic `version` integer.
- Created/submitted/published actors and timestamps.
- Unique `(hubId, month, revision)`.

#### `rosters`

- `cycleId`, `propertyId`, child status (`draft` or `submitted`).
- Submitter and timestamp.
- Unique `(cycleId, propertyId)`.

Admin rejection returns one or more child rosters to `draft` and records mandatory comments. The cycle remains `draft` until every child is submitted again.

#### `roster_input_snapshots`

Stores a normalized JSON snapshot and checksum of policy, topology, property settings, cadre, bands, forecasts, unavailability, and employee availability used for generation. The JSON is historical evidence; normalized tables remain the operational source.

#### `roster_participants`

Freezes employee number, name, base property, primary role, department, labor tier, residency type, and skill codes for that cycle revision. Later workforce edits cannot rewrite a historical publication.

#### `roster_assignments`

- Participant, assignment date, duty code, duty property.
- Shift-template reference when applicable.
- Scheduled, break, payable/working minutes.
- `source`: `generated` or `manual`.
- Stable human-readable explanation plus machine-readable reason codes.
- Unique `(cycleId, participantId, assignmentDate)`.

Duty codes initially include regular work (`W`), full rest (`O`), policy-defined half-holiday duty (`H`), approved absence codes, paid travel (`T`), and same-hub spoke duty (`S`). `X-HUB` is reserved but not generated in Phase 1.

#### `roster_assignment_segments`

One or more ordered local-time segments per working assignment. Overnight segments explicitly indicate next-day end. Segments support straight and split shifts without encoding times into duty strings.

#### `roster_violations`

- Stable rule code, severity, scope, affected participant/date/property.
- Human-readable message and structured evidence.
- Resolution: `open`, `overridden`, or `resolved_by_edit`.
- Override reason and resolver fields for soft warnings.

Hard violations cannot be overridden. Changing an assignment revalidates affected days, participants, properties, and cycle totals and retains prior actions in events.

#### `roster_events`

Append-only events for generation, manual edits, warning overrides, rejected override attempts, child submission, admin rejection, publication, revision creation, imports affecting a later revision, and exports. Each event records actor, timestamp, cycle version, event type, and structured before/after context where relevant.

### 9.6 Publication and revisions

Published data is immutable.

- Approval and publication are one atomic admin action.
- Publication requires every child roster submitted, zero hard violations, every soft warning resolved or overridden, and an active HR-approved policy.
- Creating a revision copies the published cycle, participants, assignments, segments, and unresolved context into revision `n + 1` as a new draft.
- The old publication remains visible until the new revision publishes.
- Publishing the new revision marks the prior cycle `superseded`; it never edits its snapshot rows.
- The UI term **Unlock / Create revision** always means create a new revision, never mutate a published record.

## 10. CSV contracts

All imports use a two-step preview/commit flow and the existing CSV parser. Templates use UTF-8, a header row, ISO dates, stable property/role codes, and quoted-field support.

### 10.1 Employee CSV

Required columns:

`employee_number,full_name,department_code,role_code,base_property_code,residency_type,home_distance_km,start_date,is_active`

Optional columns:

`end_date,secondary_role_codes,portal_email`

- `secondary_role_codes` is a semicolon-separated list of valid role codes.
- `portal_email` never creates an account. Preview shows the matched active same-org profile and requires explicit confirmation before linking.
- Commit upserts by `(orgId, employeeNumber)`.
- Missing employees are not deactivated merely because they are absent from a file.

### 10.2 Forecast CSV

Columns:

`property_code,date,occupancy_percent,arrivals_count,departures_count`

Commit upserts by property/date. Occupancy must be 0–100; counts are non-negative integers.

### 10.3 Unavailability CSV

Columns:

`employee_number,start_date,end_date,type,reference,note`

The date range is inclusive. Logical duplicates match employee, start, end, type, and reference. A re-import updates the note/source metadata rather than creating another block.

### 10.4 Initial boundary-assignment CSV

Columns:

`employee_number,date,working_minutes,rest_category`

`rest_category` is `none`, `full`, or `half`. This import is admin-only, accepts only the small pre-cutover date window needed by the active policy, and cannot overwrite a published TaruShift assignment.

### 10.5 Import guarantees

1. Parse and normalize in memory.
2. Validate headers, row values, references, duplicate keys, date ranges, and tenant ownership.
3. Show additions, updates, unchanged rows, and exact row errors.
4. Commit only after explicit confirmation.
5. Commit all rows in one transaction or none.
6. Repeating an identical committed file is idempotent.

## 11. Deterministic generation pipeline

The engine accepts a canonical `GenerationInput` and returns a `GenerationResult`. Array order is normalized before calculation. No random choices, database calls, current-time reads, or locale-dependent behavior occur inside the engine.

### Stage 1 — Preflight

Require:

- An active HR-approved policy effective for the month.
- One complete forecast per active property/date in the hub cycle.
- Complete, non-overlapping staffing bands for required roles.
- Valid topology, property settings, cadre, employees, role skills, and approved unavailability.
- Complete prior-week boundary context from the previous published cycle or initial boundary-assignment records.
- No contradictory active effective-dated records.

Preflight failures prevent generation and identify the exact property, date, employee, or configuration record.

### Stage 2 — Demand calculation

For every property/date/role:

1. Select the occupancy band.
2. Protect FIXED-role daily requirements from occupancy reductions.
3. Apply configured minimum viable floors, initially waiter, chef, and housekeeper minimum one.
4. Compare demand with budgeted cadre and eligible active headcount.
5. Preserve unmet demand as a coverage violation; never lower it silently.

### Stage 3 — Availability and rest

1. Exclude employment dates outside the month and approved unavailability.
2. Place mandatory weekly full and half-rest requirements from the policy.
3. Treat 24 workdays as an upper planning target, not a legal entitlement or hard minimum. Weekly-rest and minute limits take precedence, so short months may legitimately produce fewer workdays.
4. Place an eligible paid travel day by replacing an otherwise available day; it never extends the calendar.
5. Apply commuter straight-shift, daytime, cutoff, and no-split constraints.
6. Prefer continuous blocks only where approved annual leave already exists; ordinary rest remains distributed.

The policy defines one fixed work week, initially Monday through Sunday. For a month that begins midweek, the engine includes the preceding days from the prior published cycle or initial boundary assignments. For the partial week at month end, the current cycle is validated on its known days; generation of the next month includes those published days and must place the remaining work/rest without exceeding the same weekly limits. This makes the boundary rule deterministic and prevents a monthly reset from hiding excess scheduled time.

### Stage 4 — Area Manager spoke duty

- Allocate exactly ten `S` days within the Area Manager's workday target.
- At least seven `S` days overlap the spoke manager's approved leave or generated rest/half-holiday coverage need.
- Duty stays within the same hub.
- An infeasible 10/7 combination is a hard cycle violation; the engine does not fake leave or move days outside the month.

The Area Manager is the explicit policy exception to the normal FIXED non-transfer rule.

### Stage 5 — Active employee allocation

1. Prefer an employee's primary role at their base property.
2. Use approved secondary skills only for like-for-like eligible demand.
3. Fill same-hub spoke shortages from eligible surplus after base-property hard floors are protected.
4. Never route ordinary FIXED roles away from their base property.
5. Never double-book an employee across properties on one date.

### Stage 6 — Shift timing

Apply the active policy's:

- Bridge Commis lock.
- Front Office Night/Morning/Evening coverage and overlap.
- Solo PIC split.
- Active-rank waiter and housekeeping rules.
- Safari early starts.
- Bar-close, transport-cutoff, and multi-zone constraints.
- A dedicated Night Auditor when security is not outsourced.
- Daily and fixed-work-week working-minute, break, split-gap, and spreadover rules.

### Stage 7 — Deterministic balancing

When multiple employees are equally eligible, sort by:

1. Required primary qualification.
2. Base-property preference.
3. Lowest assigned working minutes in the cycle.
4. Fewest close duties.
5. Fewest split duties.
6. Employee number ascending.

The 60:40 resident/commuter matrix is a workforce-composition warning. The engine reports variance but does not create artificial work or change employee classification to hit the ratio.

### Stage 8 — Validation and persistence

- Validate coverage, overlaps, rest, minutes, property boundaries, Area Manager rules, fairness, and composition.
- Return assignment explanations and violations with the candidate.
- Show regeneration impact before replacing an existing draft.
- Confirm that regeneration removes manual draft edits.
- Persist the complete cycle, input snapshot, participants, assignments, segments, violations, and event in one transaction.
- A failed generation or save leaves the existing draft unchanged.

## 12. Rule severity

### 12.1 Non-overridable hard rules

At minimum:

- Missing or unapproved effective policy for a publishable cycle.
- Tenant/property authorization failure.
- Employee double-booking or assignment during approved unavailability.
- Assignment outside employment dates or without a valid role/skill.
- Weekly rest, daily/weekly working-minute, or required-break failure under the active policy.
- Commuter split-shift or transport-cutoff violation.
- Bar-close, multi-zone, safari, or security trap-door violation where applicable.
- Uncovered FIXED requirement or configured minimum viable floor.
- Like-for-like or same-hub relief violation.
- Area Manager 10-day/7-overlap failure.
- Missing forecasts or demand configuration.
- Conflicting published assignment.

### 12.2 Overridable soft rules

Initially:

- 24-day monthly target variance after hard compliance rules.
- 60:40 workforce-composition variance.
- Workload, close-duty, and split-duty fairness variance.
- Preferred continuous annual-leave or rest distribution where not legally required.
- Surplus staffing beyond calculated demand.

A soft warning requires a non-empty operational reason. The reason, actor, timestamp, and warning evidence are immutable audit data.

## 13. Lifecycle and permissions

### 13.1 Lifecycle

1. Admin or PM creates/generates a hub-month draft.
2. Authorized PMs edit their assigned property child rosters.
3. Each edit increments the optimistic cycle version and revalidates the cycle.
4. Each PM submits their child roster; submission locks that child from PM edits.
5. Admin may reject selected children with mandatory comments, returning them to draft.
6. When all children are submitted, admin reviews the complete hub cycle.
7. Admin publishes atomically or rejects; approval and publication are one action.
8. Any later change begins a new revision while the current publication stays live.

### 13.2 Role permissions

#### Admin

- Manage topology, departments, roles, policy versions, shifts, cadre, bands, property settings, workforce imports, and employee/profile links.
- Manage all forecasts and approved unavailability.
- Generate, edit, submit, reject, publish, export, and create revisions for all hubs.
- Run non-publishable policy simulations.

#### Property manager

- View workforce records needed for assigned properties; no unrelated employee personal data.
- Manage forecasts and approved unavailability for employees/properties in their assignment scope.
- Generate when assigned to every property in the cycle; otherwise edit and submit only assigned child rosters within an admin-created cycle.
- View inbound/outbound same-hub relief needed to understand coverage.
- View and export published assigned-property rosters.
- Cannot manage policies, profile links, global role/cadre configuration, approve, or publish.

#### Linked staff

- View only their own assignments from the current published revision.
- Cannot access drafts, colleague rows, forecasts, unavailability, violations, explanations intended for management, or setup data.

Every page and API performs server-side role, `orgId`, and property-scope checks. Hidden controls are not authorization.

## 14. User experience

### 14.1 Navigation

`Rostering` is a main Portal section with:

- Monthly Rosters.
- My Roster.
- Employees.
- Forecasts.
- Unavailability.
- Approvals (admin only, with pending count).
- Setup & Policies (admin only).

### 14.2 Readiness and generation

The property/hub/month entry screen shows readiness for workforce, forecasts, active policy, topology, settings, cadre, bands, and unavailability. Generation remains disabled until preflight passes. Each failure links to the relevant setup area.

### 14.3 Hybrid management workspace

The approved layout contains:

- Hub, property, month, revision, and status context.
- Employee rows and day columns with compact duty codes.
- Department, role, and issue-state filters.
- Property tabs inside a hub cycle.
- A selected-day inspector with duty property, shift segments, scheduled/break/payable minutes, coverage, reason codes, and violations.
- Manual edit controls for duty code, eligible employee, template, and segments.
- Immediate revalidation after edits.
- Clear hard-block and soft-warning states that never rely on color alone.
- Regenerate, submit, reject, publish, compare revision, print, and CSV actions according to permission/status.

Management is desktop-first. Narrow screens provide read-only inspection rather than forcing dense matrix editing.

### 14.4 Admin approvals

The queue groups submitted cycles by hub/month and shows every child property's submitter, hard-violation count, soft warnings, override reasons, coverage summary, policy version, forecast freshness, and revision comparison.

### 14.5 My Roster

A linked employee receives a mobile-first current/next-shift card and calendar/list view for the current and next month. It shows duty property, duty code, shift segments, break, and publication revision. It never exposes colleague schedules or management data.

### 14.6 Print and CSV

- Full property roster: print stylesheet optimized for landscape browser print/PDF.
- Personal roster: mobile and print-friendly list/calendar.
- CSV is generated from the immutable published revision and contains employee number/name, base property, duty property, date, duty code, segment times, scheduled minutes, break minutes, payable minutes, and revision.
- Exporting a draft is allowed for management but is watermarked/labeled **DRAFT** and never available to staff.

## 15. Manual edit behavior

- A PM/admin may change an unpublished assignment only within their property scope.
- Employee replacement choices include only active, available, qualified, same-org employees eligible under same-hub policy.
- Cross-property edits validate and version the whole cycle.
- Hard-rule failures reject the mutation atomically and return exact evidence.
- A soft-rule result saves only after the user enters a reason.
- Stale clients send the cycle version; a mismatch returns conflict and requires refresh.
- Submitted child rosters are locked to PMs. Admin rejection unlocks only rejected children.
- Published rows cannot be targeted by update/delete APIs.

## 16. Preview dataset

The repository will include an explicit, idempotent demo-seed command. It accepts two existing property IDs rather than assuming property names:

- First property: hub property.
- Second property: spoke property.
- Approximately 18–24 synthetic employees across Area Manager, spoke PIC/manager, Front Office, Culinary, F&B, Housekeeping, Maintenance, and support roles.
- A meaningful FIXED/VARIABLE and resident/commuter mix.
- Secondary-role skills sufficient to demonstrate like-for-like relief.
- One policy draft plus recorded demo HR approval and explicit activation for preview environments.
- Property settings, cadre, occupancy bands, one full forecast month, and approved unavailability.
- At least one soft warning scenario and an optional deliberately infeasible scenario for validation tests.

The command:

- Never runs from migrations, deployment, build, or application startup.
- Never creates auth users or Portal profiles.
- Marks employees/configuration as demo where applicable.
- Upserts by stable demo codes/employee numbers and can be rerun without duplication.
- Does not delete non-demo records.
- May optionally link one seeded employee to an existing test profile only through an explicit admin action after seeding.

## 17. Failure handling and concurrency

- CSV commits, generation saves, manual edits, publication, and revision creation are transactional.
- Failed generation leaves the prior draft intact.
- Failed submission/publication does not advance status.
- Repeated submit/publish requests are idempotent for the same cycle version.
- Optimistic cycle versioning prevents silent last-write-wins edits.
- Publication locks the cycle in the database transaction before final validation.
- Errors identify exact CSV row, employee, date, property, and rule whenever possible.
- Unexpected errors are logged with a correlation ID; the response exposes no stack trace or sensitive payload.
- Append-only events record successful transitions and rejected override attempts.
- Export failures do not change roster state.

## 18. Compliance boundary

TaruShift is a policy-execution and audit system, not legal advice.

The initial compliance-first direction is based on Sri Lanka Department of Labour material indicating that residential hotels fall within the Shop and Office Employees framework and describing weekly holidays and working-hour/meal-interval rules. The authoritative operating values still require Taru Villas HR/legal approval before activation:

- [Department of Labour salary, wages and leave guidance](https://labourdept.gov.lk/salary-wages-leave/)
- [Shop and Office Employees regulations](https://labourdept.gov.lk/downloads/labour_code/23.pdf)

Activation requires the approver name, approval date, and evidence reference. A future legal/policy change creates a new version; it never rewrites historical results.

## 19. Testing strategy

### 19.1 Pure engine tests

Cover:

- February, leap February, 30-day, and 31-day months.
- Week windows crossing month boundaries using the active policy's defined calculation method.
- Initial boundary-history import and the transition to immutable prior-month assignments.
- Weekly full/half rest, short-month 24-day-target variance, and working-minute calculations.
- Straight, overnight, and split shift segments; scheduled/break/payable totals.
- Approved unavailability and employment boundaries.
- Commuter cutoff/no-split and resident travel-day rules.
- FIXED protection, MVF, cadre shortage, and occupancy bands.
- Bridge Commis, Front Office overlap, Solo PIC, active-rank, safari, bar-close, multi-zone, and security rules.
- Exactly ten Area Manager spoke duties with at least seven overlaps.
- Like-for-like same-hub relief and no ordinary FIXED transfer.
- Deterministic tie-breaking independent of input array order.
- Feasible and infeasible cycles.
- Hard blocks and soft-warning overrides.
- No double-booking across child property rosters.

### 19.2 CSV and persistence tests

Cover quoting, embedded commas/quotes, header validation, date/number normalization, reference lookup, duplicate rows, idempotent replay, transactional rollback, employee upsert, safe profile linking, and import-batch audit facts.

### 19.3 Lifecycle and authorization tests

Cover valid/invalid state transitions, child submission aggregation, rejection, atomic publication, revision copying, superseding, immutable published records, optimistic conflicts, tenant isolation, PM property scope, and staff self-view isolation.

### 19.4 UI and export checks

Cover readiness, matrix/inspector selection, keyboard access, non-color violation labels, manual-edit validation, approval comparison, mobile My Roster, landscape print output, personal print output, and CSV parity with the published snapshot.

### 19.5 Required verification

Before Phase 1 is considered complete:

```bash
npm test
npx tsc --noEmit
npm run build
```

Manual acceptance also runs through the preview journey in §20.

## 20. Acceptance journey

Using the seeded preview hub:

1. Admin seeds or imports roughly 20 synthetic employees, hub topology, configuration, one forecast month, and approved unavailability.
2. Readiness identifies any missing prerequisite before generation.
3. A PM generates the hub cycle and opens their property in the hybrid workspace.
4. The selected-day inspector explains generated assignments and coverage.
5. A deliberate hard violation is rejected or blocks submission.
6. A soft warning is saved only with a reason and appears in audit history.
7. PMs submit all property children.
8. Admin rejects at least one child with comments; the PM revises and resubmits it.
9. Admin publishes the whole hub cycle atomically.
10. A linked staff test account sees only its own published assignments.
11. Property print/PDF and CSV match the published revision.
12. Admin creates revision 2, edits it, and verifies revision 1 remains unchanged and visible until revision 2 publishes.

## 21. Implementation boundaries

Implementation should follow existing Portal conventions and introduce no new runtime package unless a later plan proves it necessary. Likely code boundaries are:

- Drizzle schema and migration for the rostering domain.
- Domain query files separated into workforce/setup, inputs/imports, and cycles/publication.
- Pure modules under `src/lib/rostering/` for dates, demand, policy validation, generation stages, violations, CSV normalization, and exports.
- Authenticated pages under `src/app/(portal)/rostering/` and APIs under `src/app/api/rostering/`.
- Focused UI components under `src/components/rostering/`.
- Navigation and breadcrumb additions.
- An explicit demo-seed script under `scripts/`.

The implementation plan may divide this specification into ordered milestones, but every milestone uses this data contract and lifecycle so no temporary parallel roster model is introduced.

## 22. Future integration seams

- OPERA writes canonical `roster_forecasts` with source `opera`; it does not call generation logic directly.
- MiHCM employee sync upserts the same employee external keys and preserves explicit profile links.
- MiHCM leave sync writes approved `roster_unavailability` with source `mihcm`.
- Biometric reconciliation consumes immutable published assignments and writes a separate attendance/reconciliation domain; it never edits punches or roster snapshots.
- A future optimizer implements the same normalized generation input/output interface as the deterministic engine.
- Cross-hub exchange adds routing after base/same-hub demand protection and cannot weaken Phase 1 hard rules.

## 23. Success criteria

Phase 1 succeeds when Taru Villas can prepare, validate, approve, publish, view, print, and export an explainable monthly roster for a configured hub without OPERA or MiHCM connectivity; when every published assignment is tied to frozen inputs and an approved policy version; and when the same inputs reproduce the same candidate schedule while hard constraints, privacy boundaries, and publication history remain enforceable.
