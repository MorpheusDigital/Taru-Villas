# Fleet Navigation Consolidation

**Date:** 2026-08-06
**Status:** Approved, not yet implemented

## Problem

Fleet functionality is currently split across two unrelated sidebar sections. Operations users find
`Fleet` and `Dispatch` under Main, while fleet administrators must then switch to Setup &
Permissions to find `Vehicles`, `Drivers`, and `Distances`. The split obscures that these are parts
of one workflow: request a journey, dispatch it, and maintain the resources and distance data that
make dispatch possible.

## Decision

Replace the scattered entries with one sidebar section titled **Fleet Management**. The group
contains its existing destinations in operational order; no page, route, authorization rule, or
underlying fleet behavior changes.

| Entry | Route | Visibility |
|---|---|---|
| Fleet | `/fleet` | Users who can book fleet, and fleet admins |
| Dispatch | `/fleet/dispatch` | Fleet admins |
| Vehicles | `/admin/fleet/vehicles` | Fleet admins |
| Drivers | `/admin/fleet/drivers` | Fleet admins |
| Distances | `/admin/fleet/distances` | Fleet admins |

The Fleet Management group appears only when the signed-in user can see at least one of these
entries. For a non-admin fleet booker, it contains Fleet alone. A fleet admin sees the complete
group. Existing admins retain their implicit fleet-admin access.

## UI behavior

- Remove Fleet and Dispatch from the Main navigation configuration.
- Remove Vehicles, Drivers, and Distances from Setup & Permissions.
- Add the Fleet Management section after Main and before Property Content, avoiding a large gap
  between a booking flow and the controls needed to operate it.
- Keep the current icons, active-route behavior, button styling, mobile-close behavior, and
  tooltips unchanged.
- Do not add nested menus, accordions, or a new fleet landing route. The existing Fleet page stays
  the entry point, and the sidebar remains equally direct on desktop and mobile.

## Authorization

The existing permission predicates remain the source of truth:

```ts
const isFleetAdmin = profile.isFleetAdmin || profile.role === 'admin'
const canSeeFleet = profile.canBookFleet || isFleetAdmin
```

The implementation must not relax access by showing dispatch or configuration links to ordinary
fleet bookers. Conversely, fleet admins must not lose access if `canBookFleet` is false.

## Testing and acceptance criteria

1. A non-fleet user sees no Fleet Management group.
2. A fleet booker who is not a fleet admin sees Fleet only.
3. A fleet admin sees all five fleet destinations in the defined order.
4. Fleet-related routes no longer appear in Main or Setup & Permissions.
5. The active state for `/fleet` does not incorrectly mark the Dispatch entry active.
6. Existing 81-unit-test suite remains green, plus a focused navigation test if the sidebar can be
   tested without introducing disproportionate UI-test infrastructure.

## Out of scope

- New fleet roles, changes to `canBookFleet` or `isFleetAdmin`, or route-level authorization.
- A fleet-settings page, dispatch cancellation, distance-grid behavior, or any item recorded in the
  Fleet Command follow-up documents.
- Changes to the information architecture of non-fleet navigation.
