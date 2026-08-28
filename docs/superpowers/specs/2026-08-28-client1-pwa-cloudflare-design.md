# Client 1 PWA and Cloudflare launch design

**Date:** 2026-08-28  
**Status:** Approved architecture; implementation not yet started

## Goal

Launch Client 1 as a mobile-installable web application on its own custom
portal domain. Ship only the Dashboard, Task Manager, Surveys, and Fleet
Management modules. Keep one shared product codebase and release future
features to individual clients safely.

The launch must use a client-owned Cloudflare account. The current Supabase
Auth and PostgreSQL backend stays in place for Client 1; replacing it with
Cloudflare-native data and authentication is a later platform milestone.

## Decisions

| Area | Decision |
| --- | --- |
| Source control | One private product repository; no forks or per-client branches. |
| Releases | Protected `main`, short-lived PR branches, and commit promotion into protected client environments. |
| Client isolation | Dedicated Cloudflare account, custom domain, and Supabase project/database per client. |
| Client 1 modules | Dashboard, Tasks, Surveys, Fleet only. |
| Access | Invite-only. Retain `admin`, `property_manager`, and `staff` roles. |
| Product rollout | Server-side, organization-scoped feature flags; default off until explicitly enabled. |
| PWA v1 | Installable, mobile-friendly, push-capable, online-first. |
| Offline sync | Deferred as a dedicated offline-first capability, including local drafts, media queues, retries, and resumable uploads. |
| Cloudflare-native platform | Deferred until the Client 1 launch path is proven. |

## Target architecture for Client 1

```text
GitHub repository
  main + reviewed feature PRs
          |
          | promote tested commit using protected GitHub environment
          v
Client-owned Cloudflare account
  custom portal domain -> Next.js Worker -> Hyperdrive -> Client Supabase Postgres
                                  |                    -> Supabase Auth
                                  |
                                  +-> Worker logs, WAF, rate limits, Turnstile

Later as needed: R2 for files, Queues for asynchronous work, scheduled Workers
```

The app runs on Cloudflare Workers, not Cloudflare Pages. A compatibility
spike must determine whether OpenNext or vinext is the compatible deployment
adapter for this specific Next.js 16 app. It must validate rendering, route
handlers, middleware, Supabase SSR cookies and OAuth, the database driver over
Hyperdrive, `web-push`, OCR code, and existing cron behavior before traffic is
cut over.

Hyperdrive is the database connection layer between Workers and the client
Supabase PostgreSQL instance. The client database connection should use the
database configuration that passes the compatibility spike rather than
assuming the present Node-server configuration works unchanged at the edge.

## Client environment and domain

Every client owns a separate Cloudflare account. It contains only that
client's Worker, custom domain configuration, secrets, logs, and future
Cloudflare resources. The client account should be client-owned, with the
delivery team granted least-privilege administration access.

The client portal is hosted on a first-party subdomain such as
`portal.clientdomain.com`. The custom domain is used as the PWA origin, so its
cookies, service-worker scope, icons, and push subscriptions are isolated from
other clients. It must also be configured as an allowed production redirect
URL in the client Supabase project.

Each deployment token is a dedicated, scoped Cloudflare API token stored only
in that client's protected GitHub deployment environment. Do not use personal
global API keys.

## Repository and release model

`main` is the only long-lived source branch. Feature work happens on
short-lived branches and is merged through PRs after automated checks. A
shared internal staging environment validates every merged change.

Production delivery is promotion of an already-tested commit into a selected
client GitHub environment. A client never receives a fork, a custom branch, or
an unreviewed build. A client-specific Cloudflare account is an environment,
not a source-code variant.

Feature eligibility is separate from code deployment:

1. Ship additive, backward-compatible database changes.
2. Deploy the new code with the feature disabled.
3. Validate it in staging and, when appropriate, in the target client
   environment.
4. Enable the organization feature flag.
5. Remove superseded paths only in a later release.

Use Cloudflare gradual deployment to reduce runtime release risk. Use
organization feature flags to decide which client is allowed to use a product
feature. Feature flags must be checked server-side in addition to controlling
navigation, pages, and user-interface affordances.

## Client 1 tenancy and onboarding

Before Client 1 launches, create its organization in its dedicated database
and invite its named administrator. There is no public registration or generic
self-provisioning flow.

An invitation must bind the email address, organization, and intended role.
On acceptance, the user profile is created or linked to that exact
organization. This replaces the existing first-organization provisioning
assumption, which is unsafe for a second client.

The Client 1 organization initially enables only these modules:

- Dashboard
- Tasks
- Surveys
- Fleet

Module checks apply in four places: navigation, page rendering, API handlers,
and background/scheduled work. They are not cosmetic sidebar controls.

The existing roles remain the initial authorization model:

- `admin`: organization-wide administration and all approved modules.
- `property_manager`: access to their assigned properties and permitted
  workflows.
- `staff`: restricted operational access as defined by existing feature rules.

Authorization and tenant isolation are launch gates. The current application
relies substantially on application-level `orgId` checks with broad database
credentials, so the Client 1 implementation must audit ownership checks,
property-assignment checks, and public-token routes. Database RLS or an
equivalent hardening strategy must be explicitly evaluated; it is not assumed
to exist.

## PWA v1

PWA v1 makes the portal installable and native-feeling without claiming offline
data entry support.

It includes:

- a client-branded web manifest, icons, name, theme color, and standalone
  display;
- one globally registered service worker, retaining the present Fleet push
  notification behavior;
- cached static app-shell and versioned build assets only;
- connection-loss messaging that tells a user to reconnect before attempting
  an online workflow; and
- controlled service-worker updates that prompt the user to refresh when a new
  version is ready.

PWA v1 deliberately does not persist authenticated API data, user account
data, meter photos, form submissions, or uploads for offline use. This avoids
presenting an unreliable partial-sync experience or caching client data on
shared devices.

### Deferred offline-first platform

A later milestone will provide a reusable sync layer for meter readings and
future connectivity-dependent workflows. It will store local drafts and media
in IndexedDB, assign idempotency keys, display explicit sync states, retry
safely when the PWA returns online, and resume pending downloads. Mobile
browsers, particularly iOS, cannot guarantee completion while the PWA is fully
closed; the design must guarantee safe resumption when the app opens or returns
to the foreground rather than promise invisible background completion.

## Cloudflare services and security controls

Use Worker secrets and bindings for credentials; no client secret belongs in
the source repository. Enable Worker observability at launch.

Protect public and paid endpoints with the appropriate controls. The
meter-image OCR endpoint is a priority because it accepts user payloads and
can invoke paid processing: enforce file type and size limits, rate limits,
and Turnstile or a suitable authenticated route design before Client 1 uses
it.

Adopt services only when the product needs them:

- **R2:** future durable file and attachment storage.
- **Queues:** OCR, integration synchronization, and other retryable side
  effects.
- **Scheduled Workers:** replace cron HTTP endpoints; handlers must be
  bounded and idempotent.

## Future Cloudflare-native platform

Cloudflare can eventually replace the remaining backend services with D1 for
SQL, R2 for objects, Queues/scheduled Workers for jobs, and Cloudflare Access
with the client's Google Workspace or Microsoft identity provider at the
front door.

This is deliberately a later platform migration. D1 is SQLite, while the
current code uses Supabase Auth, PostgreSQL, PostgreSQL-specific Drizzle
schema/query patterns, arrays, enums, and manual database migrations. The
migration therefore requires a schema/data conversion, database-layer rewrite,
authentication and invitation redesign, role/profile mapping, and a tested
data-migration plan. It is not a deployment configuration change.

Cloudflare Access can supply verified user identity and application access
policies but does not remove the need for application profiles and roles. Do
not require ordinary client staff to hold Cloudflare accounts as a login
strategy.

## Delivery sequence

1. Harden Client 1 onboarding, authorization, tenant/property checks, and
   module gating.
2. Establish GitHub CI and the internal staging environment, including
   migration review and application checks.
3. Run the Cloudflare Workers compatibility spike and choose the deployment
   adapter based on evidence.
4. Implement PWA v1 and validate install, update, push, and offline-error
   behavior on Android and iOS.
5. Provision the client Cloudflare account, custom domain, Supabase project,
   GitHub deployment environment, secrets, monitoring, and protective rules.
6. Deploy the four approved modules dark, conduct client acceptance testing,
   then enable them for the Client 1 organization.
7. Plan the offline-first sync platform and Cloudflare-native data/auth
   migration as separate future specifications.

## Launch verification

- A non-invited user cannot create an account or access the portal.
- An invited administrator lands in the correct organization and can invite
  permitted users.
- Dashboard, Tasks, Surveys, and Fleet work for each approved role and
  property assignment.
- Disabled modules are inaccessible through both the interface and direct API
  requests.
- PWA installs correctly under the client domain on iOS and Android and opens
  in standalone mode.
- Fleet push notifications work after the global service-worker change.
- Losing connectivity displays a clear error state without silently losing
  data or implying an offline save occurred.
- Login/session refresh, OAuth redirects, database access, OCR protections,
  scheduled work, and deployment rollback are exercised in the Worker target.
- Cloudflare logs and client deployment approvals are available to operators.

## Out of scope

- Offline drafts, queued media, resumable uploads/downloads, and conflict
  resolution.
- A D1 migration, Supabase Auth replacement, or full Cloudflare-native
  backend.
- Features outside Dashboard, Tasks, Surveys, and Fleet.
- Per-client forks, branches, or bespoke source-code variants.
