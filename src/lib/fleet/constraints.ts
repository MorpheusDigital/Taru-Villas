import type { EngineDriver, EngineVehicle } from './types'

/**
 * Required verbatim by the brief (§5.1). Do not reword — it is quoted in the
 * source SRS and in the acceptance tests.
 */
export const LORRY_PAX_ERROR =
  'Lorry cargo transport standard limits maximum passenger count to 1.'

export const NO_CARGO_VEHICLE_ERROR = 'No cargo-capable vehicle is configured.'

export type ValidationResult = { ok: true } | { ok: false; error: string }

export interface ClusterSpec {
  startDate: string
  endDate: string
  totalPax: number
  cargoRequired: boolean
  /** True when at least one requester on the trip may use restricted vehicles. */
  allowsRestricted: boolean
  destinationPropertyId: string | null
}

function usable(vehicles: EngineVehicle[]): EngineVehicle[] {
  return vehicles.filter((v) => v.status === 'active')
}

/** Largest passenger capacity available anywhere in the active fleet. */
export function maxFleetCapacity(vehicles: EngineVehicle[]): number {
  return usable(vehicles).reduce((max, v) => Math.max(max, v.maxPassengers), 0)
}

function maxCargoCapacity(vehicles: EngineVehicle[]): number | null {
  const cargo = usable(vehicles).filter((v) => v.cargoCapable)
  if (cargo.length === 0) return null
  return cargo.reduce((max, v) => Math.max(max, v.maxPassengers), 0)
}

/**
 * Validates a request at submission time, before any vehicle is chosen.
 * The cargo passenger cap is derived from the cargo fleet's own capacity
 * rather than hardcoded to the Bolero Lorry, so buying a second lorry with a
 * different cab does not require a code change.
 */
export function validateFleetRequest(
  input: { cargoRequired: boolean; paxCount: number },
  vehicles: EngineVehicle[],
): ValidationResult {
  const { cargoRequired, paxCount } = input

  if (paxCount < 0) return { ok: false, error: 'Passenger count cannot be negative.' }

  if (cargoRequired) {
    const cap = maxCargoCapacity(vehicles)
    if (cap === null) return { ok: false, error: NO_CARGO_VEHICLE_ERROR }
    if (paxCount > cap) return { ok: false, error: LORRY_PAX_ERROR }
    return { ok: true }
  }

  if (paxCount < 1) return { ok: false, error: 'Passenger count must be at least 1.' }

  const cap = maxFleetCapacity(vehicles)
  if (paxCount > cap) {
    return { ok: false, error: `No vehicle in the fleet seats ${paxCount} passengers.` }
  }
  return { ok: true }
}

/**
 * Vehicles that could serve this cluster. Busy ids are supplied by the caller,
 * which knows about both already-approved dispatches and drafts planned
 * earlier in the same engine run.
 */
export function eligibleVehiclesFor(
  cluster: ClusterSpec,
  vehicles: EngineVehicle[],
  busyVehicleIds: Set<string>,
): EngineVehicle[] {
  return usable(vehicles).filter((v) => {
    if (busyVehicleIds.has(v.id)) return false
    if (cluster.cargoRequired && !v.cargoCapable) return false
    if (v.maxPassengers < cluster.totalPax) return false
    if (v.isRestricted && !cluster.allowsRestricted) return false
    return true
  })
}

export function eligibleDriversFor(
  vehicleId: string,
  drivers: EngineDriver[],
  busyDriverIds: Set<string>,
): EngineDriver[] {
  return drivers.filter(
    (d) => d.isActive && !busyDriverIds.has(d.id) && d.vehicleIds.includes(vehicleId),
  )
}
