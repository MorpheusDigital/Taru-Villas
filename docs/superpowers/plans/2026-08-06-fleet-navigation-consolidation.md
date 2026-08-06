# Fleet Navigation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present every accessible fleet destination in one permission-aware Fleet Management sidebar group.

**Architecture:** Keep the visual sidebar component responsible for rendering groups. Add one small, pure fleet-navigation selector that accepts the two existing permission facts and returns the ordered links; this makes the authorization matrix unit-testable without introducing a browser test harness. The sidebar imports that selector and removes fleet links from the unrelated Main and Setup groups.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, lucide-react, existing shadcn Sidebar components.

## Global Constraints

- Do not change routes, API behavior, database schema, or authorization predicates.
- `isFleetAdmin` remains `profile.isFleetAdmin || profile.role === 'admin'`.
- Fleet access remains `profile.canBookFleet || isFleetAdmin`.
- Keep the existing icons, active-route behavior, styling, tooltips, and mobile navigation close behavior.
- Do not add packages or component-test infrastructure.

---

### Task 1: Define and test fleet navigation selection

**Files:**
- Create: `src/lib/fleet/navigation.ts`
- Create: `src/lib/fleet/navigation.test.ts`

**Interfaces:**
- Consumes: `canBookFleet: boolean`, `isFleetAdmin: boolean`
- Produces: `getFleetNavigationItems(canBookFleet, isFleetAdmin): FleetNavigationItem[]`
- `FleetNavigationItem` is `{ title: 'Fleet' | 'Dispatch' | 'Vehicles' | 'Drivers' | 'Distances'; href: string; icon: LucideIcon }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { getFleetNavigationItems } from './navigation'

describe('getFleetNavigationItems', () => {
  it('returns no links for a user without fleet access', () => {
    expect(getFleetNavigationItems(false, false)).toEqual([])
  })

  it('returns Fleet only for a fleet booker', () => {
    expect(getFleetNavigationItems(true, false).map((item) => item.href)).toEqual(['/fleet'])
  })

  it('returns all fleet links in operational order for a fleet admin', () => {
    expect(getFleetNavigationItems(false, true).map((item) => item.href)).toEqual([
      '/fleet',
      '/fleet/dispatch',
      '/admin/fleet/vehicles',
      '/admin/fleet/drivers',
      '/admin/fleet/distances',
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/fleet/navigation.test.ts`

Expected: FAIL because `./navigation` does not exist.

- [ ] **Step 3: Write the minimal selector**

```ts
import { CalendarClock, Route, Truck, Users, type LucideIcon } from 'lucide-react'

export interface FleetNavigationItem {
  title: 'Fleet' | 'Dispatch' | 'Vehicles' | 'Drivers' | 'Distances'
  href: string
  icon: LucideIcon
}

export function getFleetNavigationItems(
  canBookFleet: boolean,
  isFleetAdmin: boolean
): FleetNavigationItem[] {
  if (!canBookFleet && !isFleetAdmin) return []

  const items: FleetNavigationItem[] = [{ title: 'Fleet', href: '/fleet', icon: Truck }]
  if (!isFleetAdmin) return items

  return [
    ...items,
    { title: 'Dispatch', href: '/fleet/dispatch', icon: CalendarClock },
    { title: 'Vehicles', href: '/admin/fleet/vehicles', icon: Truck },
    { title: 'Drivers', href: '/admin/fleet/drivers', icon: Users },
    { title: 'Distances', href: '/admin/fleet/distances', icon: Route },
  ]
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- src/lib/fleet/navigation.test.ts`

Expected: PASS with three tests.

- [ ] **Step 5: Commit the selector and its tests**

```bash
git add src/lib/fleet/navigation.ts src/lib/fleet/navigation.test.ts
git commit -m "feat(fleet): define consolidated navigation links"
```

### Task 2: Render the consolidated sidebar group

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Test: `src/lib/fleet/navigation.test.ts`

**Interfaces:**
- Consumes: `getFleetNavigationItems(canBookFleet, isFleetAdmin)` from `src/lib/fleet/navigation.ts`
- Produces: a single Fleet Management sidebar group rendered only when its selector returns entries.

- [ ] **Step 1: Use the selector in the sidebar**

```ts
const isFleetAdmin = profile.isFleetAdmin || profile.role === 'admin'
const canSeeFleet = profile.canBookFleet || isFleetAdmin
const fleetNavItems = getFleetNavigationItems(canSeeFleet, isFleetAdmin)
```

Remove Fleet and Dispatch from `mainNavItems`, and Vehicles, Drivers, and Distances from
`adminNavItems`. Render `fleetNavItems` as a `SidebarGroup` labelled `Fleet Management` immediately
after Main when `fleetNavItems.length > 0`, using the same `SidebarMenuButton` and `Link` markup as
the existing groups. Preserve the explicit `/fleet` branch in `isActive` so Dispatch remains an
independent active item.

The selector's three red-green tests cover the group visibility and the precise entry order. This
task wires its already-tested output into existing sidebar rendering primitives; it introduces no
new behavior branch beyond the selector.

- [ ] **Step 2: Run focused and full tests**

Run: `npm test -- src/lib/fleet/navigation.test.ts && npm test`

Expected: the focused navigation tests and all project tests pass.

- [ ] **Step 3: Run source checks and inspect the patch**

Run: `npm run lint -- src/components/layout/app-sidebar.tsx src/lib/fleet/navigation.ts src/lib/fleet/navigation.test.ts && git diff --check`

Expected: no new lint errors in touched source files and no whitespace errors. Record any existing
repository-wide lint or TypeScript failures separately.

- [ ] **Step 4: Commit the sidebar integration**

```bash
git add src/components/layout/app-sidebar.tsx src/lib/fleet/navigation.test.ts
git commit -m "feat(fleet): consolidate sidebar navigation"
```
