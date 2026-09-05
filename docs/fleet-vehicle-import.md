# Vehicle sheet import

The vehicle editor supports chassis, purchase/transfer, ownership, lease, custody,
driver licence and compliance details. These optional fields use the existing
validated `vehicles.compliance` JSONB column; no SQL migration is required.
Amounts are decimal strings without thousands separators. Currency is not inferred.
Finance and driver details, including the original sheet snapshot, remain within
the admin-only vehicle configuration data.

## Importing a TVPL vehicle CSV

Use the transposed export with `VEHICLE TYPE` in column B and vehicles starting in
column D. Run with Node 22.12+ and the project's development dependencies installed:

```sh
node scripts/seed-vehicle-sheet.mjs --file /absolute/path/vehicles.csv --env-file /absolute/path/local.env --org-id ORGANIZATION_UUID
```

The default is a dry run: every write is rolled back. Review the reported matches,
counts and warnings. Add `--apply` to commit the entire sheet in one transaction.
The environment file must contain `POSTGRES_URL` or `DATABASE_URL`. Never commit
that file or the private CSV.

- Data belongs to the selected database and organization, not a Git branch.
- Registrations match ignoring spacing, hyphens and supported province prefixes.
  The existing unregistered `Bolero Lorry` can match `MAHINDRA BOLERO`. Ambiguous
  or conflicting matches abort the transaction. Generic cars are left alone.
- Matched vehicles retain their name, capacity, cargo/restriction flags, status,
  location, Administration Manager and any details not provided by the source.
- New vehicles have zero unconfirmed seats and Maintenance status, making them
  unavailable for dispatch until operational details are confirmed. This includes
  name-only entries such as a buggy or electric bike. Notes explain this hold.
- Custodian and driver labels do not create users, driver access tokens or renewal
  assignments. Assign an active Administration Manager in the editor for tasks.
- Dates use the source's month/day/year format, except an explicit `TRF -` transfer
  date, which uses day/month/year. Invalid/reversed renewal dates stay in the source
  snapshot with warnings, not in scheduling fields. Historical dates stay historical.
- Electric vehicle emission tests recorded `N/A` are shown as not applicable and
  excluded from future renewal task generation.
- All labeled source cells, including blanks and `-`, are retained in the editor's
  original-values section. It remains an import-time snapshot after later edits.
- An identical source digest is skipped on re-import, preserving manual edits.
  Changed source data for an already-imported vehicle aborts for review rather than
  silently overwriting corrections. Resolve changes through the editor.

## Verification

```sh
npm test
npx tsc --noEmit
npm run build
```

With database credentials supplied privately, the opt-in integration test
`src/lib/fleet/vehicle-import.integration.test.ts` (`RUN_FLEET_DB_TESTS=true`)
creates isolated fixtures, tests matching, holds and idempotency, and rolls back
all fixtures even on failure.
