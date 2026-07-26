import { addDays, formatDayMonth, windowsOverlap } from './dates'
import { buildDistanceIndex, lookupDistanceKm } from './distance'
import {
  eligibleDriversFor,
  eligibleVehiclesFor,
  maxFleetCapacity,
  type ClusterSpec,
} from './constraints'
import type {
  DraftDispatch,
  DraftStop,
  EngineInput,
  EngineRequest,
  EngineResult,
  EngineVehicle,
  UnassignableRequest,
} from './types'

interface Cluster {
  requests: EngineRequest[]
  startDate: string
  endDate: string
}

interface Booking {
  vehicleId: string
  driverId: string
  startDate: string
  endDate: string
}

function clusterPax(c: Cluster): number {
  return c.requests.reduce((sum, r) => sum + r.paxCount, 0)
}

function describeWindow(start: string, end: string): string {
  return `${formatDayMonth(start)}–${formatDayMonth(end)}`
}

/**
 * Cargo and standalone requests are never pooled: cargo because the cargo
 * vehicle seats one, standalone because a free-text destination has no
 * distance and an unknown distance must never read as "nearby".
 */
function poolable(r: EngineRequest): boolean {
  return !r.cargoRequired && r.requestType === 'visit'
}

function canJoin(
  cluster: Cluster,
  r: EngineRequest,
  index: Map<string, number>,
  thresholdKm: number,
  fleetCapacity: number,
): boolean {
  if (!poolable(r) || !cluster.requests.every(poolable)) return false
  if (clusterPax(cluster) + r.paxCount > fleetCapacity) return false
  // Every existing member's own window must overlap the newcomer's window —
  // not just the cluster's running union — or a chain of sequential trips
  // (12–14, 14–16, 16–18) would merge into one dispatch spanning all of
  // them even though the first and last members share no day at all.
  const windowsOk = cluster.requests.every((existing) =>
    windowsOverlap(existing.startDate, existing.endDate, r.startDate, r.endDate),
  )
  if (!windowsOk) return false
  return cluster.requests.every((existing) => {
    const km = lookupDistanceKm(index, existing.targetPropertyId, r.targetPropertyId)
    return km !== null && km <= thresholdKm
  })
}

function busyIn(bookings: Booking[], start: string, end: string) {
  const vehicleIds = new Set<string>()
  const driverIds = new Set<string>()
  for (const b of bookings) {
    if (windowsOverlap(b.startDate, b.endDate, start, end)) {
      vehicleIds.add(b.vehicleId)
      driverIds.add(b.driverId)
    }
  }
  return { vehicleIds, driverIds }
}

/**
 * Orders candidate vehicles: when the cluster does NOT need cargo capacity,
 * cargo-capable vehicles (the lorry) sort last, so a plain passenger trip
 * never consumes the fleet's only cargo vehicle and strands a genuine cargo
 * request. Within that: already parked nearest to the destination first,
 * then the smallest vehicle that still fits (never send the van for one
 * passenger when a car will do), then admin sort order, then id so runs
 * are reproducible.
 */
function rankVehicles(
  candidates: EngineVehicle[],
  destinationPropertyId: string | null,
  index: Map<string, number>,
  cargoRequired: boolean,
): EngineVehicle[] {
  const distanceOf = (v: EngineVehicle): number => {
    const km = lookupDistanceKm(index, v.currentLocationPropertyId, destinationPropertyId)
    return km ?? Number.POSITIVE_INFINITY
  }
  const cargoPenalty = (v: EngineVehicle): number =>
    !cargoRequired && v.cargoCapable ? 1 : 0
  return [...candidates].sort(
    (a, b) =>
      cargoPenalty(a) - cargoPenalty(b) ||
      distanceOf(a) - distanceOf(b) ||
      a.maxPassengers - b.maxPassengers ||
      a.sortOrder - b.sortOrder ||
      a.id.localeCompare(b.id),
  )
}

/**
 * Explains why no vehicle is available. Distinguishes the case where the
 * only idle candidates are restricted-access vehicles from a genuine
 * capacity/availability shortage, so a dispatcher isn't told "no vehicle
 * seats 2" when a free 4-seater is sitting on the board, merely off-limits
 * to this requester.
 */
function describeVehicleShortage(
  spec: ClusterSpec,
  vehicles: EngineVehicle[],
  busyVehicleIds: Set<string>,
  windowLabel: string,
): string {
  if (spec.cargoRequired) {
    return `No cargo-capable vehicle free ${windowLabel}`
  }
  const onlyRestrictedCandidatesExist =
    !spec.allowsRestricted &&
    vehicles.some((v) => {
      if (v.status !== 'active') return false
      if (busyVehicleIds.has(v.id)) return false
      if (v.maxPassengers < spec.totalPax) return false
      return v.isRestricted
    })
  if (onlyRestrictedCandidatesExist) {
    return `No available vehicle for ${spec.totalPax} free ${windowLabel} — the only candidates are restricted`
  }
  return `No vehicle seating ${spec.totalPax} free ${windowLabel}`
}

/** Breaks a cluster into one single-request cluster per member. */
function splitIntoSingles(cluster: Cluster): Cluster[] {
  return cluster.requests.map((r) => ({
    requests: [r],
    startDate: r.startDate,
    endDate: r.endDate,
  }))
}

export function planDispatches(input: EngineInput): EngineResult {
  const { requests, vehicles, drivers, distances, existingDispatches, settings, today } = input

  const index = buildDistanceIndex(distances)
  const fleetCapacity = maxFleetCapacity(vehicles)
  const horizonEnd = addDays(today, settings.planningHorizonDays)
  const unassignable: UnassignableRequest[] = []

  // --- 1. Filter to the planning horizon ------------------------------------
  const candidates: EngineRequest[] = []
  for (const r of requests) {
    if (r.endDate < today) {
      unassignable.push({
        requestId: r.id,
        reason: `Window ${describeWindow(r.startDate, r.endDate)} has already passed`,
      })
      continue
    }
    // Beyond the horizon: leave pending, silently, for a later run.
    if (r.startDate > horizonEnd) continue
    candidates.push(r)
  }
  candidates.sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
  )

  // --- 2. Cluster by window overlap and destination proximity ---------------
  const clusters: Cluster[] = []
  for (const r of candidates) {
    const target = clusters.find((c) =>
      canJoin(c, r, index, settings.poolingThresholdKm, fleetCapacity),
    )
    if (target) {
      target.requests.push(r)
      if (r.startDate < target.startDate) target.startDate = r.startDate
      if (r.endDate > target.endDate) target.endDate = r.endDate
    } else {
      clusters.push({ requests: [r], startDate: r.startDate, endDate: r.endDate })
    }
  }

  // --- 3. Allocate a vehicle and driver to each cluster ---------------------
  const bookings: Booking[] = existingDispatches.map((d) => ({
    vehicleId: d.vehicleId,
    driverId: d.driverId,
    startDate: d.startDate,
    endDate: d.endDate,
  }))
  const driverLoad = new Map<string, number>()
  for (const d of existingDispatches) {
    driverLoad.set(d.driverId, (driverLoad.get(d.driverId) ?? 0) + 1)
  }

  const drafts: DraftDispatch[] = []

  // A work queue, not a plain for-loop: a cluster that fails to allocate as
  // a whole (no eligible vehicle, or no available driver for any eligible
  // vehicle) is split into single-request clusters and requeued rather than
  // dropped outright — two requests sharing a vehicle nobody can spare
  // should not take down a third request that a free vehicle could serve
  // alone. Splits are unshifted so they are retried immediately, ahead of
  // the remaining original clusters, and they share the same `bookings` /
  // `driverLoad` state the rest of the run uses.
  const queue: Cluster[] = [...clusters]

  while (queue.length > 0) {
    const cluster = queue.shift()!
    const totalPax = clusterPax(cluster)
    const cargoRequired = cluster.requests.some((r) => r.cargoRequired)
    const spec: ClusterSpec = {
      startDate: cluster.startDate,
      endDate: cluster.endDate,
      totalPax,
      cargoRequired,
      allowsRestricted: cluster.requests.some((r) => r.requesterCanUseRestricted),
      destinationPropertyId: cluster.requests[0].targetPropertyId,
    }

    const busy = busyIn(bookings, cluster.startDate, cluster.endDate)
    const ranked = rankVehicles(
      eligibleVehiclesFor(spec, vehicles, busy.vehicleIds),
      spec.destinationPropertyId,
      index,
      cargoRequired,
    )

    const windowLabel = describeWindow(cluster.startDate, cluster.endDate)

    if (ranked.length === 0) {
      if (cluster.requests.length > 1) {
        queue.unshift(...splitIntoSingles(cluster))
        continue
      }
      const reason = describeVehicleShortage(spec, vehicles, busy.vehicleIds, windowLabel)
      unassignable.push({ requestId: cluster.requests[0].id, reason })
      continue
    }

    // Walk the ranked vehicles until one has an available licensed driver.
    let placed = false
    for (const vehicle of ranked) {
      const eligible = eligibleDriversFor(vehicle.id, drivers, busy.driverIds)
      if (eligible.length === 0) continue

      const driver = [...eligible].sort(
        (a, b) =>
          (driverLoad.get(a.id) ?? 0) - (driverLoad.get(b.id) ?? 0) ||
          a.id.localeCompare(b.id),
      )[0]

      // A window that straddles today (started before today, still running)
      // drafts from today onward — the elapsed days are gone, and blocking
      // the vehicle across them serves no one.
      const draftStart = cluster.startDate < today ? today : cluster.startDate

      const stops: DraftStop[] = cluster.requests.map((r, i) => ({
        requestId: r.id,
        propertyId: r.targetPropertyId,
        label: r.destinationLabel,
        sortOrder: i,
      }))

      drafts.push({
        vehicleId: vehicle.id,
        driverId: driver.id,
        startDate: draftStart,
        endDate: cluster.endDate,
        stops,
      })
      bookings.push({
        vehicleId: vehicle.id,
        driverId: driver.id,
        startDate: draftStart,
        endDate: cluster.endDate,
      })
      driverLoad.set(driver.id, (driverLoad.get(driver.id) ?? 0) + 1)
      placed = true
      break
    }

    if (!placed) {
      if (cluster.requests.length > 1) {
        queue.unshift(...splitIntoSingles(cluster))
        continue
      }
      const reason = `No licensed driver available ${windowLabel}`
      unassignable.push({ requestId: cluster.requests[0].id, reason })
    }
  }

  return { drafts, unassignable }
}
