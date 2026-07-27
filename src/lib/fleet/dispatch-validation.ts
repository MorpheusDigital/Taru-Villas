import { and, eq, inArray, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { fleetRequests, profiles } from '@/lib/db/schema'
import { listDrivers, listVehicles } from '@/lib/db/queries/fleet'
import { validateVehicleForCluster } from './constraints'

type OrgVehicle = Awaited<ReturnType<typeof listVehicles>>[number]
type OrgDriver = Awaited<ReturnType<typeof listDrivers>>[number]

/**
 * The same requests createManualDispatch/updateDraftDispatch will actually
 * attach — org match, not cancelled — loaded here with the requester's
 * canUseRestrictedVehicles flag so the chosen vehicle can be checked
 * against the REAL attached load, not just the caller-supplied requestIds
 * array. Was previously defined inline in dispatches/route.ts; moved here
 * so the create and edit routes share exactly one copy.
 */
async function loadAttachedRequests(orgId: string, requestIds: string[]) {
  if (requestIds.length === 0) return []
  return db
    .select({
      id: fleetRequests.id,
      paxCount: fleetRequests.paxCount,
      cargoRequired: fleetRequests.cargoRequired,
      requesterCanUseRestricted: profiles.canUseRestrictedVehicles,
    })
    .from(fleetRequests)
    .leftJoin(profiles, eq(fleetRequests.requestedBy, profiles.id))
    .where(
      and(
        inArray(fleetRequests.id, requestIds),
        eq(fleetRequests.orgId, orgId),
        ne(fleetRequests.status, 'cancelled'),
      ),
    )
}

export type ManualDispatchValidationResult =
  | { ok: true; vehicle: OrgVehicle; driver: OrgDriver }
  | { ok: false; status: number; error: string }

/**
 * Every rule a manual vehicle+driver+requests pairing must satisfy before
 * touching the database. Shared by `POST /api/fleet/dispatches` (create a
 * new dispatch) and `PATCH /api/fleet/dispatches/[id]` (edit an existing
 * draft) — both are "a fleet admin hand-picks a vehicle, a driver, and a
 * set of requests" and both must be refused the exact same pairings, or
 * whichever one skips a check becomes the way to bypass a legal/safety
 * rule the other one enforces.
 *
 * The engine enforces the same rules for every dispatch IT plans
 * (constraints.ts: `eligibleVehiclesFor`/`eligibleDriversFor`), so this is
 * the third caller of `validateVehicleForCluster`, not a parallel
 * reimplementation of it — the org/active/licence checks below are the part
 * `validateVehicleForCluster` itself doesn't cover (it assumes the vehicle
 * and driver are already known-valid, org-scoped entities), so both halves
 * are required together.
 */
export async function validateManualDispatchInput(
  orgId: string,
  input: { vehicleId: string; driverId: string; requestIds: string[] },
): Promise<ManualDispatchValidationResult> {
  const [orgVehicles, orgDrivers] = await Promise.all([listVehicles(orgId), listDrivers(orgId)])

  const vehicle = orgVehicles.find((v) => v.id === input.vehicleId)
  if (!vehicle) {
    return { ok: false, status: 400, error: 'Unknown vehicle.' }
  }
  // Matches the engine's own eligibility filter (constraints.ts: usable()
  // only ever plans against status === 'active') — a `maintenance` vehicle
  // is excluded from automatic planning, so the manual path must reject it
  // too, or hand-assignment becomes the way to put a vehicle that's
  // physically in the garage back on the road.
  if (vehicle.status !== 'active') {
    const reason = vehicle.status === 'maintenance' ? 'is in maintenance' : 'is retired'
    return { ok: false, status: 400, error: `${vehicle.name} ${reason} and cannot be dispatched.` }
  }

  const driver = orgDrivers.find((d) => d.id === input.driverId)
  if (!driver) {
    return { ok: false, status: 400, error: 'Unknown driver.' }
  }
  if (!driver.isActive) {
    return { ok: false, status: 400, error: 'This driver is inactive and cannot be dispatched.' }
  }
  if (!driver.vehicleIds.includes(vehicle.id)) {
    return { ok: false, status: 400, error: `${driver.fullName} is not licensed for ${vehicle.name}.` }
  }

  // Same class as the org/active/licence checks above: total attached
  // passengers vs seats, a cargo request on a non-cargo vehicle, and a
  // restricted vehicle with no cleared requester aboard — or hand-
  // assignment stays the way to put five people on a one-seat lorry.
  // validateVehicleForCluster is the exact function eligibleVehiclesFor
  // uses internally, so the engine and every manual path share one
  // definition of "eligible" and cannot drift apart.
  const attachedRequests = await loadAttachedRequests(orgId, input.requestIds)
  const clusterCheck = validateVehicleForCluster(vehicle, {
    totalPax: attachedRequests.reduce((sum, r) => sum + r.paxCount, 0),
    cargoRequired: attachedRequests.some((r) => r.cargoRequired),
    allowsRestricted: attachedRequests.some((r) => r.requesterCanUseRestricted),
  })
  if (!clusterCheck.ok) {
    return { ok: false, status: 400, error: clusterCheck.error }
  }

  return { ok: true, vehicle, driver }
}
