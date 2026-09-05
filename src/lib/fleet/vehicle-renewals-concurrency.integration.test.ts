import { expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { profiles, tasks, vehicleRenewals, vehicles } from '../db/schema'
import { reconcileVehicle } from '../db/queries/vehicle-renewals'
import { colomboToday } from './dates'

it.skipIf(process.env.RUN_FLEET_CONCURRENCY_TEST !== 'true')('concurrent check transactions create exactly one task', async () => {
  const [manager] = await db.select().from(profiles).where(eq(profiles.isActive, true)).limit(1)
  const [vehicle] = await db.insert(vehicles).values({ orgId: manager.orgId,
    name: `Disposable concurrency verification ${crypto.randomUUID()}`, maxPassengers: 1,
    administrationManagerId: manager.id, compliance: { insuranceEnd: colomboToday() },
  }).returning()
  try {
    const results = await Promise.all([1, 2, 3].map(() => db.transaction(tx => reconcileVehicle(tx, vehicle.id, manager.orgId))))
    expect(results.map(r => r.created).sort()).toEqual([0, 0, 1])
    const cycles = await db.select().from(vehicleRenewals).where(eq(vehicleRenewals.vehicleId, vehicle.id))
    expect(cycles).toHaveLength(1)
    expect(await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, cycles[0].taskId))).toHaveLength(1)
  } finally {
    // Exact IDs from this test only; foreign keys cascade their assignments.
    await db.transaction(async tx => {
      const cycles = await tx.delete(vehicleRenewals).where(eq(vehicleRenewals.vehicleId, vehicle.id)).returning()
      if (cycles.length) await tx.delete(tasks).where(inArray(tasks.id, cycles.map(c => c.taskId))).returning()
      await tx.delete(vehicles).where(eq(vehicles.id, vehicle.id)).returning()
    })
  }
}, 60_000)
