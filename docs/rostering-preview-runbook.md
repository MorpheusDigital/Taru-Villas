# TaruShift Preview Runbook

This runbook prepares the Phase 1 TaruShift foundation and opens a generated, read-only roster draft. It does not submit, approve, or publish a roster.

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

## Phase 1 boundaries

- The preview is read-only. There are no assignment edit, override, submit, reject, approve, or publish actions.
- CSV import contracts and management screens are not included yet; this seed supplies preview data directly.
- Published cycles are not mutated by the generation service. Revision creation belongs to the lifecycle implementation.
- Staff-linked employee self-view, print/PDF styling, and CSV export are not included yet.
- OPERA and MiHCM are future input writers; the foundation accepts their source values but does not integrate with either service.
- The demo policy is marked for preview and is not legal advice. Production policy activation requires the approved HR/legal process described in the TaruShift specification.
