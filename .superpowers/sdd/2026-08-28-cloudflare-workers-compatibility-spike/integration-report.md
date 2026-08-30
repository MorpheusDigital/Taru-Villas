# Cloudflare Workers compatibility spike integration report

**Integration date:** 2026-08-30

**Target branch:** `codex/taru-launch`

**Target before merge:** `2cce621` (`chore(cloudflare): add workers preview target`)

**Merged source:** `main` at `39215736ff9c2b5345d5e7c73ff8fc6dec04516d`

**Merge commit:** `merge: integrate Client 1 access with Cloudflare preview`

## Result

The Client 1 invite-only access, organization scoping, module gating, and
callback changes are integrated with the existing PWA and OpenNext Workers
preview target. The PWA manifest and service worker remain public, while
middleware retains the stricter Client 1 configuration checks and disabled
module handling.

The Worker target remains a non-production compatibility preview. No Worker
was deployed, no Cloudflare or Supabase resources were provisioned, no
production traffic or DNS was changed, and no environment file or secret is
part of this integration commit.

## Conflicts resolved

Nine textual conflicts were resolved:

- `src/app/api/sops/categories/[id]/route.ts` and
  `src/app/api/sops/categories/route.ts`: retained organization ownership
  checks and the typed PostgreSQL unique-violation guard.
- `src/components/admin/sop-builder.tsx`: retained explicit React Hook Form
  types used by the incoming access release.
- `src/components/dashboard/dashboard-overview.tsx` and
  `src/components/dashboard/property-dashboard.tsx`: retained the calendar
  date calculation from the incoming branch while preserving the existing PWA
  component tree.
- `src/components/ui/sidebar.tsx`: retained deterministic skeleton widths
  without reintroducing random render output.
- `src/lib/db/queries/sops.ts`: retained the shared typed unique-violation
  handling.
- `src/lib/oracle/client.ts` and `src/lib/oracle/reservations.ts`: retained the
  incoming defensive unknown-data normalization helpers.

`src/middleware.ts` merged without textual conflict and was reviewed to
confirm that both behaviors survive: strict invite-only/module configuration
enforcement and public access to `/manifest.webmanifest` and `/sw.js`.

## Verification

| Command | Result |
| --- | --- |
| `npm run lint` | Exit 0; 0 errors and 51 existing warnings |
| `npx tsc --noEmit` | Exit 0 |
| `npm test` | Exit 0; 31 files and 184 tests passed |
| `npm run build` | Exit 0; Next.js 16.1.6 production build completed |
| `npm run build:cloudflare` | Exit 0; OpenNext 1.18.0 generated `.open-next/worker.js` |

The first sandboxed Next build attempt could not download Geist fonts from
Google. Re-running the same command with network access completed successfully.
No stale Next type artifacts required manual removal.

## Production blockers

- Database row-level security remains unresolved and is a production launch
  blocker. Current application-level organization checks are not a substitute
  for a verified RLS or equivalent database hardening strategy.
- The dedicated preview Supabase project, synthetic dataset, and Hyperdrive
  binding have not been provisioned in this integration.
- The runtime P0 matrix has not been executed against a deployed preview,
  including login/session/OAuth, authenticated pages and mutations, Drizzle
  transaction behavior through Hyperdrive, Fleet push, OCR limits, and bounded
  scheduled work.

Accordingly, this integration does not authorize production deployment or a
`READY_FOR_PRODUCTION_PLAN` decision. The compatibility spike remains blocked
until the production blockers above are closed with preview evidence.
