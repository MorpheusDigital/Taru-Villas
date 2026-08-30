# Cloudflare Workers Compatibility Spike

## Scope and guardrails

This is an isolated compatibility preview for the Taru Villas Cloudflare
account (`047e2794fec50b24de44ff655c8154ec`). It must never use production
Supabase credentials or data, alter production DNS, change Supabase production
redirects, or serve production traffic.

The preview needs its own Supabase project with synthetic data, a Hyperdrive
binding, and Worker secrets before the P0 matrix can be exercised.

## Reproducible baseline

- Commit: `43e11a1adc6fb77236d76d3c5c67e0964c3f2ee3`
- Timestamp: `2026-08-30T05:32:01Z`
- Commands: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`, and
  `npm run build`
- Result: all commands exited 0. Lint reported 53 existing warnings and no
  errors; Vitest passed 155 tests. `npm ci` reported 24 dependency audit
  findings (2 low, 6 moderate, 16 high); these are recorded separately from
  Workers compatibility and require a dependency-security follow-up.

## P0 compatibility matrix

Run every row only against the non-production Worker URL using a synthetic
user. Replace the log reference with the exact Worker log/tail URL or time
range before deciding the spike.

| P0 workflow | Test route/user | Expected result | Actual result | Timestamp | Log reference |
| --- | --- | --- | --- | --- | --- |
| Password login, session refresh, logout | Preview invite-only user at `/login` | Login persists through refresh; logout ends the session | Not run — preview Supabase required | — | — |
| OAuth callback | Preview OAuth user at `/callback` | Callback completes and route is authenticated | Not run — preview Supabase required | — | — |
| Module rendering | Synthetic admin: `/dashboard`, `/tasks`, `/surveys`, `/fleet`, `/admin/fleet/vehicles` | Every enabled page renders; no disabled module is available | Not run — preview deployment required | — | — |
| Authenticated GET and mutation | Preview `/api/tasks` | GET succeeds; valid mutation is persisted only in preview data | Not run — preview deployment required | — | — |
| Drizzle query and transaction | Preview task mutation | Query and transaction succeed through Hyperdrive | Not run — Hyperdrive binding required | — | — |
| Fleet push | Synthetic Fleet driver | Subscription and a test push notify the driver | Not run — preview VAPID secrets required | — | — |
| Authenticated OCR | Preview utility endpoint with valid and oversized files | Valid request behaves normally; oversized request is rejected safely | Not run — preview secrets/deployment required | — | — |
| Bounded scheduled invocation | Preview cron route with valid secret, called once | One idempotent run succeeds without duplicate effects | Not run — preview CRON_SECRET/deployment required | — | — |

## Adapter decision

`npx vinext check` ran on `2026-08-30T05:35:19Z` with vinext
`1.0.0-beta.8`. It reported 93% compatibility: the project needs ESM mode and
`next/font/google` is partial because fonts load from a CDN. The later
initializer was a hard blocker: npm could not resolve vinext's Vite 8 React
plugin dependency graph with this repository's Babel 7 `shadcn` toolchain. The
conflict was reproducible as `ERESOLVE` between `@babel/core@7.29.0` and the
Babel 8 peer brought by `@vitejs/plugin-react@6.1.1`.

No forced or legacy peer-resolution was used. The partial vinext-generated
files were discarded. The selected fallback is OpenNext `1.18.0`, pinned
because it explicitly supports Next.js `^16.1.5`; the current OpenNext release
requires Next.js `>=16.3.3` and is not compatible with this app's `16.1.6`.

| Adapter | Version | Build command | Result | Timestamp |
| --- | --- | --- | --- | --- |
| vinext | 1.0.0-beta.8 | `npx vinext check` | Blocked by dependency resolution; no preview artifact | 2026-08-30T05:35:19Z |
| OpenNext Cloudflare | 1.18.0 | `npm run build:cloudflare` | Passed; emitted `.open-next/worker.js` locally | 2026-08-30T05:39:11Z |

OpenNext uses Wrangler `4.127.1`, `nodejs_compat`, compatibility date
`2026-08-30`, static assets at `.open-next/assets`, and observability. Its
only configured Worker name is `taru-client1-preview`; there is no route,
custom domain, or production environment in this configuration.

The final status must be exactly `READY_FOR_PRODUCTION_PLAN` only after every
P0 row passes with no runtime compatibility error and no production secret.
Otherwise it is `BLOCKED`.
