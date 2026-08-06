# Survey & Fleet Task Accountability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link survey Issues and fleet trips to accountable Task Manager work, with per-request 72-hour trip reports.

**Architecture:** Add nullable links for historic compatibility, but enforce both new flows in their write services. `createIssuesFromSubmission` becomes a transaction that creates/reuses Survey Issues and links every new Issue to its Task. Fleet request creation resolves an existing eligible Task or atomically creates one, while dispatch completion creates idempotent report obligations.

**Tech Stack:** Next.js 16, TypeScript, Drizzle ORM, PostgreSQL, Zod v4, React Hook Form, Vitest, shadcn/ui.

## Global Constraints

- Preserve Issues as survey audit records; do not synchronize Issue and Task status.
- New fleet requests require an eligible existing Task or an inline property-linked Task.
- New inline tasks require an active project and assign the requester.
- Report submission is owner-only, requires a summary, accepts optional URL arrays, and is due 72 hours after dispatch completion.
- Do not add packages, file uploads, Storage, scheduled reminders, or booking blocks.
- All DB mutations use `.returning()`; dynamic route params are awaited; Zod URL fields use `z.string()`.

---

### Task 1: Persist traceability links and report obligations

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0026_survey_fleet_task_accountability.sql`
- Create: `src/lib/fleet/reports.ts`
- Create: `src/lib/fleet/reports.test.ts`

**Interfaces:**
- Produces `getReportStatus(dueAt: Date, submittedAt: Date | null, now = new Date()): 'pending' | 'submitted' | 'overdue'`.
- Adds `issues.taskId`, `fleetRequests.taskId`, and `fleetTripReports` with a unique `requestId`.

- [ ] **Step 1: Write the failing status test**

```ts
expect(getReportStatus(new Date('2026-08-09T12:00:00Z'), null, new Date('2026-08-08T12:00:00Z'))).toBe('pending')
expect(getReportStatus(new Date('2026-08-09T12:00:00Z'), null, new Date('2026-08-10T12:00:00Z'))).toBe('overdue')
expect(getReportStatus(new Date('2026-08-09T12:00:00Z'), new Date('2026-08-08T12:00:00Z'))).toBe('submitted')
```

- [ ] **Step 2: Run `npm test -- src/lib/fleet/reports.test.ts`; verify it fails because `./reports` is absent.**
- [ ] **Step 3: Implement the pure status helper, then add migration/schema fields and relations.**

```ts
export function getReportStatus(dueAt: Date, submittedAt: Date | null, now = new Date()) {
  if (submittedAt) return 'submitted' as const
  return now > dueAt ? 'overdue' as const : 'pending' as const
}
```

- [ ] **Step 4: Re-run the focused test; it must pass. Commit schema, migration, helper, and test.**

### Task 2: Create linked Survey Issues Tasks

**Files:**
- Modify: `src/lib/db/queries/issues.ts`
- Modify: `src/app/api/surveys/route.ts`
- Modify: `src/app/api/surveys/[id]/route.ts`

**Interfaces:**
- `createIssuesFromSubmission(...)` inserts the Issue, gets or creates `Survey Issues`, creates the Task, writes `issues.taskId`, and returns linked issues.
- The auto task uses `projectId`, `propertyId`, `createdBy`, `assignedTo` as its sole assignee, `todo`, and `medium`.

- [ ] **Step 1: Write a focused query/service test using a transaction test double that proves the returned issue carries its newly-created task link and the primary PM is passed as an assignee.**
- [ ] **Step 2: Run that test; verify it fails against the current Issue-only flow.**
- [ ] **Step 3: Add `getOrCreateSurveyIssuesProject(tx, orgId, createdBy)` and perform Issue, Task, assignment, and Issue update inside one `db.transaction`.**

```ts
const [issue] = await tx.insert(issues).values(issueData).returning()
const task = await createTaskWithExecutor(tx, taskData, assignedTo ? [assignedTo] : [])
const [linked] = await tx.update(issues).set({ taskId: task.id }).where(eq(issues.id, issue.id)).returning()
```

- [ ] **Step 4: Re-run the focused test and `npm test`; commit the survey-task flow.**

### Task 3: Require a Task reason for fleet requests

**Files:**
- Modify: `src/lib/db/queries/dispatches.ts`
- Modify: `src/app/api/fleet/requests/route.ts`
- Modify: `src/app/(portal)/fleet/page.tsx`
- Modify: `src/components/fleet/request-form.tsx`
- Modify: `src/components/fleet/requests-table.tsx`
- Create: `src/lib/fleet/task-reason.ts`
- Create: `src/lib/fleet/task-reason.test.ts`

**Interfaces:**
- `resolveFleetTaskReason(tx, input)` returns the selected or newly-created Task id.
- Existing tasks must be org-scoped, active-project, non-`done`, and property-linked.
- Inline task input is `{ projectId, propertyId, title, description? }` and assigns the requester.

- [ ] **Step 1: Write failing pure validation tests for rejecting a done/unscoped task and accepting a matching property Visit task.**
- [ ] **Step 2: Run `npm test -- src/lib/fleet/task-reason.test.ts`; verify it fails because the validator is absent.**
- [ ] **Step 3: Implement validator and transaction resolver; extend request Zod schema with a discriminated `taskReason` union.**

```ts
taskReason: z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), taskId: z.string().uuid() }),
  z.object({ mode: z.literal('new'), projectId: z.string().uuid(), propertyId: z.string().uuid(), title: z.string().min(1), description: z.string().nullable().optional() }),
])
```

- [ ] **Step 4: Render the two-choice Task Reason section; load active projects and linkable tasks into Fleet page props. Add task title to the request table.**
- [ ] **Step 5: Run focused tests and `npm test`; commit the fleet-task requirement.**

### Task 4: Create and submit fleet trip reports

**Files:**
- Modify: `src/lib/db/queries/dispatches.ts`
- Modify: `src/app/api/fleet/driver/[token]/status/route.ts`
- Create: `src/lib/db/queries/fleet-trip-reports.ts`
- Create: `src/app/api/fleet/reports/[requestId]/route.ts`
- Modify: `src/components/fleet/requests-table.tsx`
- Create: `src/components/fleet/trip-report-dialog.tsx`

**Interfaces:**
- `ensureTripReportsForDispatch(dispatchId, completedAt)` inserts one report obligation per non-cancelled stop request using conflict-safe `requestId` uniqueness.
- `submitTripReport(requestId, ownerId, { summary, attachmentUrls })` verifies ownership and stores `submittedAt`.

- [ ] **Step 1: Write failing tests for 72-hour due calculation, one report per distinct request, and report-status idempotency.**
- [ ] **Step 2: Run the focused report test and verify it fails.**
- [ ] **Step 3: Implement obligation creation after the driver-owned dispatch completion and update the completion notification to state the deadline.**

```ts
const dueAt = new Date(completedAt.getTime() + 72 * 60 * 60 * 1000)
await tx.insert(fleetTripReports).values(rows).onConflictDoNothing({ target: fleetTripReports.requestId }).returning()
```

- [ ] **Step 4: Add owner-only report API and dialog with required `summary` plus `attachmentUrls: string[]`; normalize absent URLs to `[]`.**
- [ ] **Step 5: Add pending/submitted/overdue badges and Submit trip report action to the requester’s completed rows. Re-run focused and full tests; commit.**

### Task 5: Show traceability in Task Manager and verify release state

**Files:**
- Modify: `src/lib/db/queries/tasks.ts`
- Modify: `src/components/tasks/task-form-dialog.tsx`
- Modify: `src/components/tasks/task-card.tsx`
- Add tests to: `src/lib/fleet/reports.test.ts`, `src/lib/fleet/task-reason.test.ts`

**Interfaces:**
- `TaskWithRelations` gains `sourceIssue` and `fleetReports` traceability fields.
- Task dialog renders the Issue source and every linked fleet report’s request, due state, summary, submission time, and URL attachments.

- [ ] **Step 1: Write a failing mapper test that exposes submitted and overdue report data for a Task.**
- [ ] **Step 2: Run its focused test; verify it fails.**
- [ ] **Step 3: Hydrate links in `getTasks`/`getTaskById` and render compact source/report sections in the Task dialog/card.**
- [ ] **Step 4: Run `npm test`, lint every touched file, `npx tsc --noEmit`, `npm run build`, and `git diff --check`. Record the known malformed local `@types/* 2` failure separately if it remains.**
- [ ] **Step 5: Commit UI traceability and the implementation plan.**
