import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { organizations, vehicles } from '../db/schema'
import { importVehiclesInTransaction } from '../db/queries/vehicle-import'
import { parseVehicleSheet } from './vehicle-import'

describe.skipIf(process.env.RUN_FLEET_DB_TESTS !== 'true')('vehicle import (rollback only)', () => {
  it('updates matched vehicles, creates held records, preserves unrelated data and skips identical reruns', async () => {
    const rollback = new Error('rollback-import-fixtures')
    try {
      await db.transaction(async tx => {
        const [org] = await tx.insert(organizations).values({ name: 'Import test', slug: `import-test-${crypto.randomUUID()}` }).returning()
        const [hilux] = await tx.insert(vehicles).values({ orgId: org.id, name: 'Toyota Hilux', registrationNo: 'PF1234', maxPassengers: 5, cargoCapable: true, compliance: { gpsSim: 'existing-sim' } }).returning()
        const [generic] = await tx.insert(vehicles).values({ orgId: org.id, name: 'Car 1', maxPassengers: 4 }).returning()
        const imports = parseVehicleSheet(',VEHICLE TYPE,,TOYOTA - HILLUX,BUGGY\n,VEHICLE NUMBER,,WP PF 1234,\n,CHASSIS NO,,TEST-CHASSIS,', 'test.csv')
        const first = await importVehiclesInTransaction(tx, org.id, imports)
        expect(first.map(r => r.action)).toEqual(['updated', 'created'])
        const rows = await tx.select().from(vehicles).where(eq(vehicles.orgId, org.id))
        expect(rows).toHaveLength(3)
        expect(rows.find(v => v.id === hilux.id)).toMatchObject({ name: 'Toyota Hilux', maxPassengers: 5, cargoCapable: true, compliance: { chassisNo: 'TEST-CHASSIS', gpsSim: 'existing-sim' } })
        expect(rows.find(v => v.name === 'BUGGY')).toMatchObject({ status: 'maintenance', maxPassengers: 0, administrationManagerId: null, renewalLeadDays: 30 })
        expect(rows.find(v => v.id === generic.id)).toEqual(generic)
        await tx.update(vehicles).set({ compliance: { ...rows.find(v => v.id === hilux.id)!.compliance, driverName: 'Manual correction' } }).where(eq(vehicles.id, hilux.id)).returning()
        expect((await importVehiclesInTransaction(tx, org.id, imports)).map(r => r.action)).toEqual(['skipped', 'skipped'])
        expect((await tx.select().from(vehicles).where(eq(vehicles.id, hilux.id)))[0].compliance.driverName).toBe('Manual correction')
        const changed = parseVehicleSheet(',VEHICLE TYPE,,TOYOTA - HILLUX\n,VEHICLE NUMBER,,WP PF 1234\n,CHASSIS NO,,DIFFERENT', 'test.csv')
        await expect(importVehiclesInTransaction(tx, org.id, changed)).rejects.toThrow(/changed source/i)
        throw rollback
      })
    } catch (error) { if (error !== rollback) throw error }
  }, 60_000)
})
