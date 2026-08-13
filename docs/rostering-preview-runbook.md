# TaruShift Preview Runbook

This runbook prepares and exercises the Phase 1 TaruShift workflow from source data through staff publication.

## Prerequisites

- A development or staging database with two active properties in the same organization.
- Their UUIDs: one selected as the demo hub property and one as its spoke.
- `POSTGRES_URL` or `DATABASE_URL` configured in `.env.local`.
- An admin Portal account. A property manager can generate only when assigned to every active property in the roster hub.

Do not apply the demo seed to an environment where either property already belongs to a different roster hub or a non-demo active policy covers the selected month.

## Prepare the database

1. Apply [drizzle/0028_tarushift_foundation.sql](../drizzle/0028_tarushift_foundation.sql) to the target database using the environment's normal migration process.

2. Seed the deterministic two-property preview for September 2026:

   ```bash
   npm run seed:tarushift-demo -- HUB_PROPERTY_UUID SPOKE_PROPERTY_UUID 2026-09
   ```

   The seed upserts demo-only configuration with stable `DEMO_` codes and employees `DEMO-001` through `DEMO-022`. It does not create Supabase users or Portal profiles. Reruns refresh only the selected demo rows and planning month.

3. Confirm the command reports both property names, `Employees: 22`, the policy version, shift-template count, and `Preview: /rostering`.

## Generate and inspect the draft

1. Start the Portal:

   ```bash
   npm run dev
   ```

2. Sign in as an admin and open `/rostering`.

3. Select the seeded hub and September 2026, then choose **Generate draft**.

4. Open the generated cycle and verify:

   - the employee ledger contains every employee and every September date;
   - hub and spoke property filters show base staff and inbound duty where applicable;
   - Area Manager `S` duty, approved leave, weekly rest, and any paid travel day are explicit cells;
   - selecting a cell shows property, shift segments, working/break totals, explanation, reason codes, and scoped violations;
   - hard violations and soft warnings are separately counted and labeled with text as well as color.

5. Choose **Regenerate draft**, accept the replacement warning, and confirm the resulting assignments and violations remain deterministic for unchanged input. The cycle version increments while the draft revision remains the same.

## Import and maintain source data

1. Open `/rostering/setup`. Each CSV contract provides a downloadable template and server-side preview before commit.
2. Admins may commit Employees and Boundary context. Admins and appropriately scoped property managers may commit Forecasts and Approved unavailability.
3. Forecasts and approved unavailability can also be entered from the calendar forms. Phase 1 treats these records as already approved and does not implement leave requests or balances.
4. Any source change affecting an existing draft creates a hard `SOURCE_DATA_CHANGED` blocker. Regenerate that draft before submission.
5. Employee import never creates or automatically links Portal accounts. Admins use **Staff account links** to explicitly connect one existing Portal profile to one employee.

## Edit, submit, and publish

1. In a draft, select a working cell and choose **Edit assignment**. The server rechecks hub scope, role qualification, approved unavailability, commuter cutoff/split-shift rules, and weekly minutes including prior-month boundary time.
2. Clear hard violations. An admin may override a soft warning only with a required reason; the resolver, time, and reason remain in the event history.
3. A property manager or admin submits each property roster. Open hard violations or unresolved soft warnings affecting that property block submission.
4. When every child roster is submitted, the hub cycle moves to the admin queue at `/rostering/approvals`.
5. An admin may return the cycle to draft with review comments or publish it atomically. Publication supersedes the former active revision and sends an in-app notification to linked staff.
6. To correct a published roster, choose **Create correction revision**. TaruShift copies the frozen participants and assignments into revision `n + 1`; the published source revision remains intact. Previously overridden warnings reopen and require a fresh decision.

## Staff view and outputs

- Linked users open `/my-roster`. Only their most recent published assignment set is returned; drafts and other employees are never queried.
- **Download CSV** on My Roster exports only that linked employee. Management **Export CSV** is tenant-checked and property-scoped for property managers.
- Management **Print** opens an A3 landscape matrix with cycle identity, revision/status, legend, and generated timestamp.

## Rollback and recovery

- Do not edit published assignment rows. Create a correction revision, make the correction, submit, and publish it.
- A draft can be regenerated from current source data; this replaces only that draft's generated snapshot and assignments and increments its optimistic version.
- A submitted cycle can be returned to draft only by an admin with audit comments.
- If a migration rollback is required, take a database backup first and use the environment's normal migration procedure. The explicit Phase 1 schema migration is `drizzle/0028_tarushift_foundation.sql`.

## Phase 1 boundaries

- OPERA and MiHCM are future input writers; the foundation accepts their source values but does not integrate with either service.
- Cross-hub staff exchange is not automated. Same-hub spoke duty is supported.
- PDF files are not generated server-side; the print view is designed for browser print/PDF output.
- The demo policy is marked for preview and is not legal advice. Production policy activation requires the approved HR/legal process described in the TaruShift specification.
