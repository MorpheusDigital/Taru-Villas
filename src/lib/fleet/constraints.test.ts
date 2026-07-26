import { describe, it, expect } from 'vitest'
import {
  LORRY_PAX_ERROR,
  NO_CARGO_VEHICLE_ERROR,
  maxFleetCapacity,
  validateFleetRequest,
  eligibleVehiclesFor,
  eligibleDriversFor,
} from './constraints'
import type { EngineVehicle, EngineDriver } from './types'

const lorry: EngineVehicle = {
  id: 'v-lorry', name: 'Bolero Lorry', maxPassengers: 1, cargoCapable: true,
  isRestricted: false, status: 'active', currentLocationPropertyId: null, sortOrder: 0,
}
const car1: EngineVehicle = {
  id: 'v-car1', name: 'Car 1', maxPassengers: 4, cargoCapable: false,
  isRestricted: true, status: 'active', currentLocationPropertyId: null, sortOrder: 1,
}
const van: EngineVehicle = {
  id: 'v-van', name: 'Van', maxPassengers: 8, cargoCapable: false,
  isRestricted: false, status: 'active', currentLocationPropertyId: null, sortOrder: 2,
}
const fleet = [lorry, car1, van]

const baseCluster = {
  startDate: '2026-08-12', endDate: '2026-08-14', totalPax: 2,
  cargoRequired: false, allowsRestricted: false, destinationPropertyId: 'p1',
}

describe('validateFleetRequest', () => {
  it('rejects cargo with more than one passenger using the exact brief wording', () => {
    const r = validateFleetRequest({ cargoRequired: true, paxCount: 2 }, fleet)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Lorry cargo transport standard limits maximum passenger count to 1.')
  })

  it('exports that same string as LORRY_PAX_ERROR', () => {
    expect(LORRY_PAX_ERROR).toBe('Lorry cargo transport standard limits maximum passenger count to 1.')
  })

  it('accepts cargo with one passenger', () => {
    expect(validateFleetRequest({ cargoRequired: true, paxCount: 1 }, fleet).ok).toBe(true)
  })

  it('accepts a cargo-only run with zero passengers', () => {
    expect(validateFleetRequest({ cargoRequired: true, paxCount: 0 }, fleet).ok).toBe(true)
  })

  it('rejects cargo when no cargo-capable vehicle exists', () => {
    const r = validateFleetRequest({ cargoRequired: true, paxCount: 1 }, [car1, van])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe(NO_CARGO_VEHICLE_ERROR)
  })

  it('rejects a passenger request exceeding the whole fleet', () => {
    const r = validateFleetRequest({ cargoRequired: false, paxCount: 12 }, fleet)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('No vehicle in the fleet seats 12 passengers.')
  })

  it('rejects a non-cargo request with no passengers', () => {
    const r = validateFleetRequest({ cargoRequired: false, paxCount: 0 }, fleet)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Passenger count must be at least 1.')
  })

  it('ignores retired and in-maintenance vehicles when sizing the fleet', () => {
    const grounded: EngineVehicle[] = [{ ...van, status: 'maintenance' }, car1]
    expect(maxFleetCapacity(grounded)).toBe(4)
  })
})

describe('eligibleVehiclesFor', () => {
  it('returns only cargo-capable vehicles for a cargo cluster', () => {
    const r = eligibleVehiclesFor(
      { ...baseCluster, cargoRequired: true, totalPax: 1 }, fleet, new Set(),
    )
    expect(r.map((v) => v.id)).toEqual(['v-lorry'])
  })

  it('excludes restricted vehicles when nobody on the trip is privileged', () => {
    const r = eligibleVehiclesFor(baseCluster, fleet, new Set())
    expect(r.map((v) => v.id)).toEqual(['v-van'])
  })

  it('includes restricted vehicles when a privileged passenger is aboard', () => {
    const r = eligibleVehiclesFor({ ...baseCluster, allowsRestricted: true }, fleet, new Set())
    expect(r.map((v) => v.id)).toEqual(['v-car1', 'v-van'])
  })

  it('excludes vehicles without enough seats', () => {
    const r = eligibleVehiclesFor(
      { ...baseCluster, totalPax: 6, allowsRestricted: true }, fleet, new Set(),
    )
    expect(r.map((v) => v.id)).toEqual(['v-van'])
  })

  it('excludes vehicles already busy in the window', () => {
    const r = eligibleVehiclesFor(baseCluster, fleet, new Set(['v-van']))
    expect(r).toEqual([])
  })

  it('excludes vehicles that are not active', () => {
    const r = eligibleVehiclesFor(baseCluster, [{ ...van, status: 'maintenance' }], new Set())
    expect(r).toEqual([])
  })
})

describe('eligibleDriversFor', () => {
  const drivers: EngineDriver[] = [
    { id: 'd1', fullName: 'Nimal', isActive: true, vehicleIds: ['v-car1', 'v-van'] },
    { id: 'd2', fullName: 'Sunil', isActive: true, vehicleIds: ['v-lorry', 'v-van'] },
    { id: 'd3', fullName: 'Retired', isActive: false, vehicleIds: ['v-lorry'] },
  ]

  it('returns only drivers licensed for the vehicle', () => {
    expect(eligibleDriversFor('v-lorry', drivers, new Set()).map((d) => d.id)).toEqual(['d2'])
  })

  it('excludes inactive drivers', () => {
    const r = eligibleDriversFor('v-lorry', [drivers[2]], new Set())
    expect(r).toEqual([])
  })

  it('excludes drivers already booked in the window', () => {
    expect(eligibleDriversFor('v-van', drivers, new Set(['d1'])).map((d) => d.id)).toEqual(['d2'])
  })
})
