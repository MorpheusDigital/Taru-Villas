# Fleet visit reports

## Workflow

Choose the **Report owner / traveller** when requesting a ride. It defaults to
the requester and must be an active person in the same organization. The owner
can be changed while the request is pending.

When a vehicle is assigned, each non-cancelled request receives its
own visit report and a high-priority task in the **Visit Reports** project.
Creation is part of the assignment transaction, including draft dispatches. Multiple stops for the same
request do not create duplicates, and a ride without an original task still
receives a reporting task.

The task is assigned to the designated traveller and is due **48 elapsed hours**
after completion. The full deadline is shown in Asia/Colombo time on the report
and task description; Task Manager's date column shows its local calendar date.
Until completion the deadline is unset. No cron job is required for creation.
The traveller can save partial drafts immediately, but final submission is only
available after completion. Reassignments retain the report and its draft;
pending-request owner changes transfer the reporting task too. Cancellation
closes the obligation and retains its read-only draft for reference.

Open the report from Fleet Management or its Task Manager task. The designated
traveller records the purpose, location, date, work done and outcomes, with
optional people met, findings, follow-up actions and supporting HTTP/HTTPS URLs.
Supporting files are linked, not uploaded by this feature.

Before final submission, link up to 20 existing organization tasks or create up
to 10 follow-up tasks with a project, assignees, priority and optional due date.
The original ride-related task remains linked. Submitting completes only the
generated reporting task; all original and follow-up task statuses are preserved.
Submission is final. A repeated submission does not create duplicate tasks.

Report tasks cannot be manually marked done, reopened after submission,
reassigned, moved to another project or given a different deadline. Tasks with
report history cannot be deleted. Active organization members may view reports;
only the assigned report owner may submit one.

## Deployment and verification

Apply `drizzle/0030_fleet_visit_report_tasks.sql` transactionally before deploying
this code, followed by `drizzle/0031_visit_report_assignment_drafts.sql` (nullable
deadline and saved draft payload). The first migration is additive except for making the original task link nullable and
changing its delete action to SET NULL. New report-task and linked-task foreign
keys retain task history. The new link table has RLS enabled; access is through
the application's organization-scoped server queries.

Existing reports, their deadlines and submitted content are retained. Historical
rides are not backfilled with new tasks. The 48-hour rule applies to reports
created by assignments after this release, with completion as a fallback for older assignments.

Run `npm test`, `npx tsc --noEmit` and `npm run build`. To exercise the full workflow
against a migrated database, set the connection variables securely and run:

```sh
RUN_VISIT_REPORT_DB_TESTS=true npm test -- src/lib/fleet/visit-reports.integration.test.ts
```

The integration test creates temporary fixtures inside a transaction and always
rolls them back. It requires two active profiles in one organization and checks
pooled requests, owner assignment, cancellation, precise deadlines, task linking,
follow-up creation, authorization and duplicate prevention. It sends no pushes.

Ship the same feature changes on `main` and `codex/taru-release`; preserve the
Taru release's existing module restrictions and deployment configuration.
