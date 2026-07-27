import { randomBytes } from 'crypto'
import { asc, eq } from 'drizzle-orm'
import { db } from '..'
import {
  drivers,
  driverVehicles,
  fleetSettings,
  propertyDistances,
  vehicles,
  type NewDriver,
  type NewVehicle,
} from '../schema'

/** 22-char base64url token, matching the guest-link scheme. */
export function generateDriverToken(): string {
  return randomBytes(16).toString('base64url')
}

// --- Vehicles --------------------------------------------------------------

export async function listVehicles(orgId: string) {
  return db
    .select()
    .from(vehicles)
    .where(eq(vehicles.orgId, orgId))
    .orderBy(asc(vehicles.sortOrder), asc(vehicles.name))
}

export async function createVehicle(data: NewVehicle) {
  const [inserted] = await db.insert(vehicles).values(data).returning()
  return inserted
}

export async function updateVehicle(id: string, data: Partial<NewVehicle>) {
  const [updated] = await db
    .update(vehicles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(vehicles.id, id))
    .returning()
  return updated
}

export async function deleteVehicle(id: string) {
  const [deleted] = await db.delete(vehicles).where(eq(vehicles.id, id)).returning()
  return deleted
}

// --- Drivers ---------------------------------------------------------------

/** Drivers with the vehicle ids they are licensed for, in one round trip. */
export async function listDrivers(orgId: string) {
  const rows = await db
    .select({
      id: drivers.id,
      orgId: drivers.orgId,
      fullName: drivers.fullName,
      phone: drivers.phone,
      preferredLanguage: drivers.preferredLanguage,
      accessToken: drivers.accessToken,
      isActive: drivers.isActive,
      vehicleId: driverVehicles.vehicleId,
    })
    .from(drivers)
    .leftJoin(driverVehicles, eq(driverVehicles.driverId, drivers.id))
    .where(eq(drivers.orgId, orgId))
    .orderBy(asc(drivers.fullName))

  const byId = new Map<string, {
    id: string
    orgId: string
    fullName: string
    phone: string | null
    preferredLanguage: 'en' | 'si' | 'ta'
    accessToken: string
    isActive: boolean
    vehicleIds: string[]
  }>()

  for (const row of rows) {
    const existing = byId.get(row.id)
    if (existing) {
      if (row.vehicleId) existing.vehicleIds.push(row.vehicleId)
      continue
    }
    byId.set(row.id, {
      id: row.id,
      orgId: row.orgId,
      fullName: row.fullName,
      phone: row.phone,
      preferredLanguage: row.preferredLanguage,
      accessToken: row.accessToken,
      isActive: row.isActive,
      vehicleIds: row.vehicleId ? [row.vehicleId] : [],
    })
  }

  return [...byId.values()]
}

export async function getDriverByToken(token: string) {
  const rows = await db.select().from(drivers).where(eq(drivers.accessToken, token)).limit(1)
  return rows[0]
}

export async function getDriverById(id: string) {
  const rows = await db.select().from(drivers).where(eq(drivers.id, id)).limit(1)
  return rows[0]
}

export async function createDriver(data: NewDriver) {
  const [inserted] = await db.insert(drivers).values(data).returning()
  return inserted
}

export async function updateDriver(id: string, data: Partial<NewDriver>) {
  const [updated] = await db
    .update(drivers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(drivers.id, id))
    .returning()
  return updated
}

export async function deleteDriver(id: string) {
  const [deleted] = await db.delete(drivers).where(eq(drivers.id, id)).returning()
  return deleted
}

/** Replaces the driver's licence set wholesale. */
export async function setDriverVehicles(driverId: string, vehicleIds: string[]) {
  return db.transaction(async (tx) => {
    await tx.delete(driverVehicles).where(eq(driverVehicles.driverId, driverId)).returning()
    if (vehicleIds.length === 0) return []
    return tx
      .insert(driverVehicles)
      .values(vehicleIds.map((vehicleId) => ({ driverId, vehicleId })))
      .returning()
  })
}

// --- Distances -------------------------------------------------------------

export async function listDistances(orgId: string) {
  const rows = await db
    .select()
    .from(propertyDistances)
    .where(eq(propertyDistances.orgId, orgId))
  return rows.map((r) => ({
    fromPropertyId: r.fromPropertyId,
    toPropertyId: r.toPropertyId,
    distanceKm: parseFloat(r.distanceKm),
    driveMinutes: r.driveMinutes,
  }))
}

/**
 * Upserts one leg. Null property id means head office; because the unique
 * constraint is NULLS NOT DISTINCT, a null-bearing pair still conflicts
 * correctly. Written in one direction only — lookups are symmetric.
 */
export async function upsertDistance(
  orgId: string,
  fromPropertyId: string | null,
  toPropertyId: string | null,
  distanceKm: number,
  driveMinutes: number | null,
) {
  const [row] = await db
    .insert(propertyDistances)
    .values({
      orgId,
      fromPropertyId,
      toPropertyId,
      distanceKm: distanceKm.toFixed(1),
      driveMinutes,
    })
    .onConflictDoUpdate({
      target: [
        propertyDistances.orgId,
        propertyDistances.fromPropertyId,
        propertyDistances.toPropertyId,
      ],
      set: { distanceKm: distanceKm.toFixed(1), driveMinutes, updatedAt: new Date() },
    })
    .returning()
  return { ...row, distanceKm: parseFloat(row.distanceKm) }
}

// --- Settings --------------------------------------------------------------

/** Returns the org's settings, creating the default row on first read. */
export async function getFleetSettings(orgId: string) {
  const rows = await db
    .select()
    .from(fleetSettings)
    .where(eq(fleetSettings.orgId, orgId))
    .limit(1)

  const row =
    rows[0] ??
    (await db.insert(fleetSettings).values({ orgId }).onConflictDoNothing().returning())[0] ??
    (await db.select().from(fleetSettings).where(eq(fleetSettings.orgId, orgId)).limit(1))[0]

  return {
    id: row.id,
    orgId: row.orgId,
    poolingThresholdKm: parseFloat(row.poolingThresholdKm),
    planningHorizonDays: row.planningHorizonDays,
    engineEnabled: row.engineEnabled,
  }
}

export async function updateFleetSettings(
  orgId: string,
  data: { poolingThresholdKm?: number; planningHorizonDays?: number; engineEnabled?: boolean },
) {
  const [updated] = await db
    .update(fleetSettings)
    .set({
      ...(data.poolingThresholdKm !== undefined
        ? { poolingThresholdKm: data.poolingThresholdKm.toFixed(1) }
        : {}),
      ...(data.planningHorizonDays !== undefined
        ? { planningHorizonDays: data.planningHorizonDays }
        : {}),
      ...(data.engineEnabled !== undefined ? { engineEnabled: data.engineEnabled } : {}),
      updatedAt: new Date(),
    })
    .where(eq(fleetSettings.orgId, orgId))
    .returning()
  if (!updated) return undefined
  return { ...updated, poolingThresholdKm: parseFloat(updated.poolingThresholdKm) }
}
