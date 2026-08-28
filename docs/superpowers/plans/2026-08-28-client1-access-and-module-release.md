# Client 1 Access and Module Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make Client 1 invite-only and restrict its deployment to Dashboard, Tasks, Surveys, Fleet, and required administration.

**Architecture:** Use a deployment-scoped module policy that is safe for Next middleware, then pass that policy to the portal navigation. The client’s dedicated deployment/database makes this the launch-time enforcement boundary; later multi-org deployments can move the same policy to organization configuration.

**Tech Stack:** Next.js 16, TypeScript, Vitest, Supabase Auth Admin API, Drizzle/PostgreSQL.

**Spec:** docs/superpowers/specs/2026-08-28-client1-pwa-cloudflare-design.md

## Global Constraints

- Client 1 enables Dashboard, Tasks, Surveys, Fleet, plus core User and Property administration.
- Enforce disabled modules before page/API handlers and hide their navigation links.
- Client 1 uses CLIENT_ENABLED_MODULES=dashboard,tasks,surveys,fleet.
- There is no public sign-up or automatic profile provisioning.
- Keep admin, property_manager, and staff roles.
- Do not stage unrelated untracked files.

---

## File structure

- Create src/lib/client-release/modules.ts: module keys, route map, parser, and guard.
- Create src/lib/client-release/modules.test.ts: policy unit tests.
- Modify src/middleware.ts: module guard at request boundary.
- Modify src/app/(portal)/layout.tsx, src/components/providers/auth-provider.tsx, and src/components/layout/app-sidebar.tsx: safely expose and render the allowed modules.
- Modify src/app/(auth)/login/page.tsx and src/app/(auth)/callback/route.ts; delete src/app/api/auth/provision/route.ts: invitation-only auth.
- Create src/lib/auth/invitations.ts and src/lib/auth/invitations.test.ts: reusable invite validation.
- Modify src/app/api/users/route.ts: organization-safe admin invitation.
- Create .github/workflows/ci.yml and update .env.production.example and README.md.

### Task 1: Create a tested route-to-module policy

**Files:**
- Create: src/lib/client-release/modules.ts
- Create: src/lib/client-release/modules.test.ts

**Interfaces:**
- Produces ClientModule, getEnabledClientModules(value?: string), moduleForPath(pathname: string), and isPathEnabled(pathname, enabled).
- Paths with no module mapping remain available; core administration remains available.

- [ ] **Step 1: Write the failing tests**

~~~ts
import { describe, expect, it } from 'vitest'
import { getEnabledClientModules, isPathEnabled, moduleForPath } from './modules'

describe('Client module policy', () => {
  it('normalizes the Client 1 setting', () => {
    expect([...getEnabledClientModules(' dashboard, tasks ,surveys,fleet ')]).toEqual([
      'dashboard', 'tasks', 'surveys', 'fleet',
    ])
  })

  it('maps protected and public routes', () => {
    expect(moduleForPath('/fleet/dispatch')).toBe('fleet')
    expect(moduleForPath('/api/surveys/guest/example')).toBe('surveys')
    expect(moduleForPath('/m/example-menu')).toBe('menus')
  })

  it('keeps core admin routes while rejecting disabled products', () => {
    const enabled = getEnabledClientModules('dashboard,tasks,surveys,fleet')
    expect(isPathEnabled('/admin/users', enabled)).toBe(true)
    expect(isPathEnabled('/fleet/dispatch', enabled)).toBe(true)
    expect(isPathEnabled('/sops', enabled)).toBe(false)
    expect(isPathEnabled('/m/example-menu', enabled)).toBe(false)
  })
})
~~~

- [ ] **Step 2: Run it to verify it fails**

Run: npx vitest run src/lib/client-release/modules.test.ts

Expected: FAIL because the policy module is absent.

- [ ] **Step 3: Implement the policy**

Define ClientModule as the literal union dashboard, tasks, surveys, fleet, rostering, sops, daily-records, assets, menus, excursions, guest-profiles, utilities, settings, and core. moduleForPath must evaluate the nested property regular expressions before generic prefixes, then choose the longest matching prefix. Cover every application route with these exact rules:

~~~ts
[
  ['/admin/fleet', 'fleet'], ['/fleet', 'fleet'], ['/api/fleet', 'fleet'], ['/d/', 'fleet'],
  ['/api/surveys', 'surveys'], ['/api/templates', 'surveys'], ['/api/admin/guest-links', 'surveys'], ['/g/', 'surveys'], ['/surveys', 'surveys'],
  ['/api/tasks', 'tasks'], ['/api/projects', 'tasks'], ['/api/issues', 'tasks'], ['/tasks', 'tasks'], ['/issues', 'tasks'],
  ['/api/dashboard', 'dashboard'], ['/dashboard', 'dashboard'],
  ['/admin/users', 'core'], ['/api/users', 'core'], ['/admin/properties', 'core'], ['/api/properties', 'core'], ['/properties', 'core'],
  ['/api/rostering', 'rostering'], ['/rostering', 'rostering'], ['/my-roster', 'rostering'],
  ['/api/sops', 'sops'], ['/sops', 'sops'],
  ['/api/utilities', 'utilities'], ['/utilities', 'utilities'], ['/u/', 'utilities'],
  ['/api/waste', 'daily-records'], ['/waste', 'daily-records'], ['/daily-records', 'daily-records'],
  ['/api/assets', 'assets'], ['/assets', 'assets'], ['/scan/asset', 'assets'],
  ['/api/menus', 'menus'], ['/m/', 'menus'], ['/menus', 'menus'],
  ['/api/excursions', 'excursions'], ['/e/', 'excursions'], ['/excursions', 'excursions'],
  ['/api/guest-profiles', 'guest-profiles'], ['/api/oracle', 'guest-profiles'], ['/guest-profiles', 'guest-profiles'],
  ['/settings', 'settings'],
  ['/api/cron/fleet-optimize', 'fleet'], ['/api/cron/guest-profiles-sync', 'guest-profiles'], ['/api/cron/electricity-autofill', 'utilities'],
]
~~~

The nested property regular expressions are: /^\\/properties\\/[^/]+\\/daily-records(?:\\/|$)/ and /^\\/properties\\/[^/]+\\/(?:utilities|waste)(?:\\/|$)/ map to daily-records; /^\\/properties\\/[^/]+\\/menus(?:\\/|$)/ maps to menus; /^\\/properties\\/[^/]+\\/excursions(?:\\/|$)/ maps to excursions; and /^\\/properties\\/[^/]+\\/guest-profiles(?:\\/|$)/ maps to guest-profiles. The generic /properties rule is core only after these checks.

getEnabledClientModules must trim comma-separated input, ignore unrecognized names, and preserve the declared module order. isPathEnabled returns true for unmapped paths and core, and otherwise requires the mapped module to be enabled.

- [ ] **Step 4: Verify and commit**

Run: npx vitest run src/lib/client-release/modules.test.ts

Expected: PASS.

~~~bash
git add src/lib/client-release/modules.ts src/lib/client-release/modules.test.ts
git commit -m "feat(release): define client module policy"
~~~

### Task 2: Enforce the policy and filter navigation

**Files:**
- Modify: src/middleware.ts
- Modify: src/app/(portal)/layout.tsx
- Modify: src/components/providers/auth-provider.tsx
- Modify: src/components/layout/app-sidebar.tsx
- Test: src/lib/client-release/modules.test.ts

**Interfaces:**
- AuthProvider gains enabledModules: readonly ClientModule[].
- Middleware returns 404 before Supabase session work for a disabled mapped path.

- [ ] **Step 1: Extend the failing policy test**

~~~ts
it('never blocks auth or PWA infrastructure', () => {
  const enabled = getEnabledClientModules('dashboard,tasks,surveys,fleet')
  expect(isPathEnabled('/login', enabled)).toBe(true)
  expect(isPathEnabled('/manifest.webmanifest', enabled)).toBe(true)
  expect(isPathEnabled('/sw.js', enabled)).toBe(true)
})
~~~

- [ ] **Step 2: Run the focused test**

Run: npx vitest run src/lib/client-release/modules.test.ts

Expected: FAIL until unrecognised/infrastructure paths are allowed.

- [ ] **Step 3: Add the request-boundary guard**

After the DEV_BYPASS_AUTH branch and before createServerClient, add:

~~~ts
const enabledModules = getEnabledClientModules()
if (enabledModules.size > 0 && !isPathEnabled(request.nextUrl.pathname, enabledModules)) {
  return new NextResponse('Not Found', { status: 404 })
}
~~~

An empty setting preserves legacy/internal environments until their explicit module setting is supplied.

- [ ] **Step 4: Pass and consume module eligibility**

In the portal layout, pass [...getEnabledClientModules()] to AuthProvider. Add enabledModules to its context value. Add module: ClientModule to each sidebar item. Filter main, property, and admin items by enabledModules.includes(item.module) || item.module === 'core'. Also require enabledModules.includes('fleet') before rendering Fleet navigation.

- [ ] **Step 5: Verify and commit**

Run: npx vitest run src/lib/client-release/modules.test.ts && npm run lint && npx tsc --noEmit

Expected: all commands exit 0.

~~~bash
git add src/middleware.ts src/app/'(portal)'/layout.tsx src/components/providers/auth-provider.tsx src/components/layout/app-sidebar.tsx src/lib/client-release
git commit -m "feat(release): enforce client module access"
~~~

### Task 3: Remove public registration and harden invitations

**Files:**
- Create: src/lib/auth/invitations.ts
- Create: src/lib/auth/invitations.test.ts
- Modify: src/app/api/users/route.ts
- Modify: src/app/(auth)/login/page.tsx
- Modify: src/app/(auth)/callback/route.ts
- Delete: src/app/api/auth/provision/route.ts

**Interfaces:**
- parseInviteUser(body: unknown) returns the Zod safe-parse result for email, fullName, role, and propertyIds.
- POST /api/users is the only application profile creation path, and writes profile.orgId from the administrator profile.

- [ ] **Step 1: Write the failing invitation tests**

~~~ts
import { expect, it } from 'vitest'
import { parseInviteUser } from './invitations'

it('accepts a valid client email and rejects malformed mail', () => {
  expect(parseInviteUser({
    email: 'manager@client.example', fullName: 'Client Manager',
    role: 'property_manager', propertyIds: [],
  }).success).toBe(true)
  expect(parseInviteUser({
    email: 'not-an-email', fullName: 'Client Manager', role: 'staff', propertyIds: [],
  }).success).toBe(false)
})
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npx vitest run src/lib/auth/invitations.test.ts

Expected: FAIL because parseInviteUser is absent.

- [ ] **Step 3: Implement organisation-safe invitations**

Implement the parser with z.string().email(), z.string().min(1).max(255), the existing role enum, and UUID propertyIds; do not retain the Taru-only domain refinement. In POST /api/users, use this parser and fetch getProperties(profile.orgId). Reject any submitted property ID outside that set with 403 before calling Supabase. Retain createProfile with orgId: profile.orgId immediately after the successful invite.

- [ ] **Step 4: Remove self-signup and auto-provisioning**

Remove isSignUp, whitelist fetch, auth.signUp, provision fetch, and the sign-up UI from the login page. In the callback, exchange the code, then query profiles by authenticated user id. Redirect profiles to next/dashboard and non-profiles to /login?error=no_profile. Delete the provision route after this command returns no references:

Run: rg -n "/api/auth/provision|isSignUp|signUp\\(" src

Expected: no output.

- [ ] **Step 5: Verify and commit**

Run: npx vitest run src/lib/auth/invitations.test.ts && npm run lint && npx tsc --noEmit && npm run build

Expected: all commands exit 0.

~~~bash
git add src/lib/auth/invitations.ts src/lib/auth/invitations.test.ts src/app/api/users/route.ts src/app/'(auth)'/login/page.tsx src/app/'(auth)'/callback/route.ts
git rm src/app/api/auth/provision/route.ts
git commit -m "feat(auth): make client access invite-only"
~~~

### Task 4: Create the CI and environment contract

**Files:**
- Create: .github/workflows/ci.yml
- Modify: .env.production.example
- Modify: README.md

- [ ] **Step 1: Add required GitHub checks**

~~~yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build
~~~

- [ ] **Step 2: Document the exact Client 1 setting**

Add this block to .env.production.example and README.md:

~~~bash
# Client 1 production modules; leave unset only in the legacy internal environment.
CLIENT_ENABLED_MODULES=dashboard,tasks,surveys,fleet
~~~

- [ ] **Step 3: Verify and commit**

Run: npm run lint && npx tsc --noEmit && npm test && npm run build

Expected: all commands exit 0.

~~~bash
git add .github/workflows/ci.yml .env.production.example README.md
git commit -m "ci: verify client release builds"
~~~
