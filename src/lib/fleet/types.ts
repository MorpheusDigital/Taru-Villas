export interface EngineVehicle {
  id: string
  name: string
  maxPassengers: number
  cargoCapable: boolean
  isRestricted: boolean
  status: 'active' | 'maintenance' | 'retired'
  currentLocationPropertyId: string | null
  sortOrder: number
}

export interface EngineDriver {
  id: string
  fullName: string
  isActive: boolean
  /** Vehicle ids this driver is licensed for, from driver_vehicles. */
  vehicleIds: string[]
}

export interface EngineRequest {
  id: string
  requestType: 'visit' | 'standalone'
  requestedById: string
  /** From profiles.canUseRestrictedVehicles, resolved by the caller. */
  requesterCanUseRestricted: boolean
  targetPropertyId: string | null
  /** Free-text destination for standalone requests. */
  destinationLabel: string | null
  startDate: string
  endDate: string
  paxCount: number
  cargoRequired: boolean
}

export interface ExistingDispatch {
  id: string
  vehicleId: string
  driverId: string
  startDate: string
  endDate: string
}

export interface DistanceEntry {
  /** null means head office. */
  fromPropertyId: string | null
  toPropertyId: string | null
  distanceKm: number
}

export interface EngineSettings {
  poolingThresholdKm: number
  planningHorizonDays: number
}

export interface EngineInput {
  requests: EngineRequest[]
  vehicles: EngineVehicle[]
  drivers: EngineDriver[]
  distances: DistanceEntry[]
  existingDispatches: ExistingDispatch[]
  settings: EngineSettings
  /** Today in Asia/Colombo, YYYY-MM-DD. */
  today: string
}

export interface DraftStop {
  requestId: string
  propertyId: string | null
  label: string | null
  sortOrder: number
}

export interface DraftDispatch {
  vehicleId: string
  driverId: string
  startDate: string
  endDate: string
  stops: DraftStop[]
}

export interface UnassignableRequest {
  requestId: string
  reason: string
}

export interface EngineResult {
  drafts: DraftDispatch[]
  unassignable: UnassignableRequest[]
}
