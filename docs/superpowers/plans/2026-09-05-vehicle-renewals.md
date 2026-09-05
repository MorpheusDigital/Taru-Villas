# Vehicle compliance and renewal tasks

Approved scope: screenshot vehicle metadata; Administration Manager assignment;
30-day configurable renewal lead time; Task Manager integration in main and
codex/taru-release. No Google Reviews work and no extra Taru modules.

## Implementation checklist

- [x] Test and implement typed optional compliance metadata and real calendar-date validation.
- [x] Extend vehicles with manager, lead days and metadata; add renewal-cycle ledger with unique vehicle/document/expiry key and task relationship.
- [x] Transactionally create/update vehicles and reconcile renewal tasks using a vehicle row lock. One task per expiry cycle, preserve completed history, assign only active same-organization users.
- [x] Create due tasks for licence, insurance and emissions within the lead window or overdue. Reconcile outstanding task assignments on manager changes. Completing a task does not invent a new expiry date.
- [x] Extend the existing vehicle dialog with grouped fields and setup/expiry warnings; provide task-to-vehicle navigation without exposing vehicle edit permissions to assignees.
- [x] Add authenticated daily reconciliation endpoint and deployment/scheduler instructions. User chose production deployment with native Vercel Cron instead of adding a Preview scheduler.
- [ ] Run unit tests, transaction integration checks, TypeScript and build. Apply the additive migration, mirror code to the Taru release branch and deploy a preview if authenticated tooling is available.

## Verification cases

Use literal today 2026-09-05: expiry 2026-10-05 is due for task creation;
2026-10-06 is not. Expired 2026-09-04 is due. Missing manager/expiry and retired
vehicles do not create tasks. Concurrent runs create one task. Completed tasks
are not recreated for the same expiry. New expiry creates a new cycle only when
inside its reminder window. Invalid dates, inverted periods, cross-org manager
and property assignments fail validation. Run all existing tests on both branches.

Store metadata as typed JSONB with nullable values (unknown is not false). Keep
manager and lead days as relational columns. The renewal ledger preserves prior
cycles; superseded outstanding cycles are labelled in their task description and
completed when a later expiry is recorded. Date corrections to earlier dates do
not imply renewal completion. Daily checks use Asia/Colombo calendar dates.
