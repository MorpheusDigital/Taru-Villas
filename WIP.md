# Work in Progress

Last updated: 2026-08-06

## Current release status

The fleet navigation consolidation and survey/fleet task-accountability work are merged into `main` and pushed through commit `a2ab4d9`.

- Fleet navigation consolidation: `013a1eb`, `ad9b069`, `7f0c8c6`
- Survey and fleet accountability: `aa5d715`, `228b913`, `a2ab4d9`
- Deployment: pushing to `main` triggers the Coolify deployment. The push completed; Coolify runtime status was not independently inspected from this workspace.

## Delivered

### Fleet Management navigation

- A single **Fleet Management** sidebar group replaces scattered fleet items.
- Fleet bookers see Fleet; fleet administrators additionally see Dispatch, Vehicles, Drivers, and Distances.

### Survey issues and Task Manager

- Internal survey responses scored `<= 6` with an issue description create both an Issue and a linked Task.
- Generated tasks use the per-organisation **Survey Issues** project, inherit the survey property and details, and are assigned to that property's primary manager when one exists.
- The Issue and Task remain independently managed; their statuses do not synchronise automatically.
- Task detail shows the originating survey Issue.

### Fleet request accountability

- Every new ride request must reference an eligible existing task or create a new task in an active project.
- The task is property-linked and the requester is assigned when they create a task from the ride form.
- When a dispatch is completed, every live request on that dispatch receives its own trip-report obligation, due 72 hours after completion.
- The requester can submit the required report summary and optional external file URLs; uploaded files are not stored by the application.
- Fleet and Task Manager surfaces show the report status and full task/report traceability.

## Database

- `drizzle/0026_survey_fleet_task_accountability.sql` was applied to the production Supabase database before the code was pushed.
- It adds `issues.task_id`, `fleet_requests.task_id`, and `fleet_trip_reports`.

## Verification

- `npm test`: 11 files, 87 tests passed.
- Targeted lint across changed files completed with no errors. One pre-existing `react-hooks/exhaustive-deps` warning remains in `src/components/tasks/task-form-dialog.tsx`.
- `git diff --check` passed before the feature commits.
- Local `npx tsc --noEmit` and the final type phase of `npm run build` remain blocked by malformed duplicate directories in `node_modules/@types` (for example `react 2` and `chai 2`). This is a local dependency-installation issue, not a reported application type error.

## Follow-ups / known limits

- Historic fleet requests with no linked task do not receive retroactive trip-report obligations.
- There are no automated reminders, email notifications, or booking blocks for overdue trip reports.
- Attachment fields intentionally accept external URLs only; there is no upload or file-storage workflow.
- Production deployment health should be checked in Coolify after the automatic deployment completes.
