# Taru Villas Vercel release

Release branch: `codex/taru-release`, based on `main` at `79cc1b2`.
Vercel team/project: `taru-vi-llas/taru-villas`.

The release fixes `CLIENT_ENABLED_MODULES` in `next.config.ts` to
`dashboard,tasks,fleet,daily-records`. This ensures the sidebar and middleware
share the same policy even when Vercel variables are absent or differ.

Enabled products:

- Dashboard (existing dashboard reporting)
- Task Manager
- Fleet Management, including dispatch, vehicles, drivers, distances, driver
  links, and fleet APIs, subject to existing role permissions
- Daily Records: water, electricity, and wastage, including their backing APIs

Users and Property Settings remain available to admins as core infrastructure.
Other product pages and APIs return 404, including Surveys, SOPs, Rostering,
Assets, Menus, Excursions, Guest Profiles, and standalone Utilities pages.
The sign-in provisioning endpoint remains available under its existing checks.
Non-admin users land on Tasks instead of the disabled Surveys module.

Preview uses the existing Supabase Auth/database. A separate Git branch and
Vercel release do not isolate database records or user accounts. This release
does not change shared Supabase settings or migrate data.

## Deployment

From this branch's checkout, link to the existing new-team project and run
`vercel deploy --yes`. Keep this as Preview until production is explicitly
requested. Ensure the deployment source is this branch rather than `main`.

Required Preview variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `POSTGRES_URL` (or `DATABASE_URL`), and
`SUPABASE_SERVICE_ROLE_KEY`. Parse dotenv values before importing; copying raw
quoted assignments with awk preserves literal quotes and breaks Supabase URLs.

Acceptance: login renders, signed-in admin navigation shows approved products,
Daily Records APIs pass the module gate, disabled pages/APIs return 404, and
non-admin redirects avoid Surveys. Keep existing authorization guards in force.
