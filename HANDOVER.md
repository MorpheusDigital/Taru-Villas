# Engineering Handover

Last updated: 2026-08-06

## Handover point

`main` is at `a2ab4d9` (`fix(fleet): remove duplicate trip report dialog`). The working tree is clean apart from unrelated, untracked local files:

- `.probe.tmp 2.mjs` through `.probe.tmp 5.mjs`
- `package-lock 2.json`

Do not remove or commit those files as part of the fleet/task work.

## Release summary

This release delivers two connected outcomes:

1. Fleet navigation is consolidated under a single **Fleet Management** sidebar group.
2. Survey issues, fleet ride reasons, and post-trip reports are all traceable through Task Manager.

The design and implementation records are:

- `docs/superpowers/specs/2026-08-06-fleet-navigation-consolidation-design.md`
- `docs/superpowers/plans/2026-08-06-fleet-navigation-consolidation.md`
- `docs/superpowers/specs/2026-08-06-survey-fleet-task-accountability-design.md`
- `docs/superpowers/plans/2026-08-06-survey-fleet-task-accountability.md`

## Important implementation details

### Survey-generated work

`src/lib/db/queries/issues.ts` creates the survey Issue and Task atomically. It finds or creates the organisation's `Survey Issues` project and reactivates it if it had been archived. The task links back through `issues.task_id` and is assigned to the property's primary manager when configured.

### Fleet request task reason

`POST /api/fleet/requests` requires `taskReason`:

- `existing`: validates the task belongs to the organisation, is property-linked, is in an active project, and is not done.
- `new`: validates the selected active project/property and creates a task before creating the request.

The request's `task_id` is persisted in `fleet_requests`.

### Trip reports

`src/lib/db/queries/fleet-trip-reports.ts` creates one report obligation per live request when a dispatch is completed. The deadline is `completedAt + 72 hours`. The report API is owner-only and accepts a required summary plus optional URL strings. It does not upload or store files.

Task detail (`src/components/tasks/task-form-dialog.tsx`) displays its source Issue and fleet report history. Fleet requests display pending/submitted/overdue report status and give the ride requester a submission action.

## Database and deployment

- Migration: `drizzle/0026_survey_fleet_task_accountability.sql`
- The migration was successfully applied to the production Supabase database using the `postgres` driver before source was pushed.
- `git push origin main` succeeded for `a2ab4d9`; Coolify auto-deploys pushes to `main`.
- The older Vercel instructions in `CLAUDE.md` and the engineering skill are stale for this deployment path. Do not use them as confirmation of the active production process.

## Verification and caveat

- 87 tests across 11 Vitest files passed after implementation.
- Changed-file lint had no errors; a pre-existing hooks warning remains in `src/components/tasks/task-form-dialog.tsx`.
- Local TypeScript/build verification cannot complete because `node_modules/@types` contains malformed duplicate directories (such as `react 2` and `chai 2`). Repair the local dependency installation before treating a local full type/build run as authoritative.

## If work resumes

1. Check the Coolify deployment log/health for the `a2ab4d9` release.
2. Manually exercise one new low-score internal survey response, one fleet request against an existing task, and one inline-created fleet task.
3. Complete a dispatch and submit the requester's trip report; confirm report history appears on the linked task.
4. If product scope expands, decide separately whether overdue report reminders, email, a booking block, or file uploads are needed. None are implemented by design.
