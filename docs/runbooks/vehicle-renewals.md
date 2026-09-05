# Vehicle compliance and renewal tasks

Available in the dev code and Taru release. Taru retains its four-module policy.

## Administration

Open Fleet → Vehicles → Add/Edit. Record the book/ownership, revenue licence,
insurance, emission test, keys, GPS/SIM, service provider and document-copy details.
Missing metadata is unknown, not No. Select an active organization user as the
Administration Manager and set the advance notice (default 30 days; 0–365 allowed).

The three period-end dates drive tasks. A manually selected Valid flag cannot
override an expired date. Saving a vehicle reconciles tasks immediately; daily
checks catch vehicles that enter their reminder window later. Check renewals now
is an admin-only recovery/manual-run action.

Tasks appear in Fleet Renewals, assigned to the manager, due on expiry and linked
back to the vehicle. Renewal dates/assignment must be changed on the vehicle, not
the task. Repeated or concurrent checks cannot create another task for the same
vehicle/document/expiry. Completing a task does not invent new expiry dates.
Recording a later expiry completes the outstanding prior cycle with an explanatory
note; existing completed history remains. Earlier date corrections reschedule an
outstanding cycle. Removing/deactivating a manager leaves outstanding tasks
unassigned; the vehicle list flags missing active managers. Retired vehicles do
not create new tasks. Vehicles/tasks with renewal history cannot be deleted.

Key custody, SIM details and policy metadata are available through the vehicle
admin form/API, not ordinary booking/dispatch vehicle payloads. The linked
read-only renewal page exposes dates/status to authenticated users in the same org.

## Database and deployment

Apply `drizzle/0029_vehicle_compliance_renewals.sql` transactionally before deploying.
It adds nullable manager, default-30 lead days, typed JSONB metadata and a renewal
ledger. Existing vehicles remain unchanged and unassigned. The deployed database
is shared by dev and Taru; apply this migration once, not once per branch.

Production needs the existing five Supabase/DB environment variables plus a
random, server-only `CRON_SECRET`. `vercel.json` registers
`GET /api/cron/vehicle-renewals` at `30 1 * * *` (07:00 Asia/Colombo).
Vercel supplies `Authorization: Bearer <CRON_SECRET>`; missing/wrong tokens get 401.
Partial failures return 500. Monitor the job in Vercel → project → Cron Jobs and
runtime logs. Vercel Hobby schedules may run within the scheduled hour rather than
at the exact minute. Preview deployments do not execute native cron jobs.

Deploy production from `codex/taru-release`, never from unrestricted main.
No Supabase Cron/HTTP extensions are needed for production. The schedule runs
across organizations in this deployment's configured database; do not point it at
an unrelated client database. Repeated production/dev checks are idempotent.

## Verification

`npm test`, `npx tsc --noEmit`, `npm run build`.
`RUN_FLEET_DB_TESTS=true npm test -- src/lib/fleet/vehicle-renewals.integration.test.ts`
performs rollback-only tests with at least two active users in one org.
`RUN_FLEET_CONCURRENCY_TEST=true npm test -- src/lib/fleet/vehicle-renewals-concurrency.integration.test.ts`
temporarily commits one uniquely named test vehicle and removes that vehicle,
its task and ledger afterward. Run only against an explicitly approved database;
the Fleet Renewals project may remain empty after verification.
