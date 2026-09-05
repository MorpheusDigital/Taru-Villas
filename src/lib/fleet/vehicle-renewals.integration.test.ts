import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { profiles, tasks, taskAssignees, vehicleRenewals, vehicles } from '../db/schema'
import { reconcileVehicle, saveVehicleInTransaction } from '../db/queries/vehicle-renewals'
import { addDays, colomboToday } from './dates'

// Explicit opt-in only; every fixture and mutation is rolled back, even on failure.
describe.skipIf(process.env.RUN_FLEET_DB_TESTS !== 'true')('renewal transactions (rollback-only)', () => {
  it('round trips metadata, deduplicates, reassigns, preserves history and rejects foreign assignments', async () => {
    const rollback = new Error('rollback-test-fixtures')
    try {
      await db.transaction(async tx => {
        const [manager] = await tx.select().from(profiles).where(eq(profiles.isActive, true)).limit(1)
        expect(manager).toBeDefined()
        const users = await tx.select().from(profiles).where(and(eq(profiles.orgId, manager.orgId), eq(profiles.isActive, true))).limit(2)
        expect(users.length).toBe(2)
        const today = colomboToday()
        const expiry = addDays(today, 30)
        const vehicle = await saveVehicleInTransaction(tx, manager.orgId, {
          name: `Renewal test ${crypto.randomUUID()}`, maxPassengers: 4,
          administrationManagerId: manager.id, compliance: { insuranceEnd: expiry, gpsSim: '0761479625', bookCopy: false },
        })
        expect(vehicle?.compliance.gpsSim).toBe('0761479625')
        const id = vehicle!.id
        expect(await reconcileVehicle(tx, id, manager.orgId, today)).toEqual({ created: 0 })
        expect(await reconcileVehicle(tx, id, manager.orgId, today)).toEqual({ created: 0 })
        let cycles = await tx.select().from(vehicleRenewals).where(eq(vehicleRenewals.vehicleId, id))
        expect(cycles).toHaveLength(1)
        const taskId = cycles[0].taskId
        const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId))
        expect(task.dueDate).toBe(expiry)
        expect(task.startDate).toBe(today)
        await saveVehicleInTransaction(tx, manager.orgId, { administrationManagerId: users[1].id }, id)
        expect(await tx.select({ profileId: taskAssignees.profileId }).from(taskAssignees).where(eq(taskAssignees.taskId, taskId))).toEqual([{ profileId: users[1].id }])
        const [saved] = await tx.select().from(vehicles).where(eq(vehicles.id, id))
        expect(saved.compliance).toEqual({ insuranceEnd: expiry, gpsSim: '0761479625', bookCopy: false })
        await tx.update(tasks).set({ status: 'done', completedAt: new Date() }).where(eq(tasks.id, taskId)).returning()
        expect(await reconcileVehicle(tx, id, manager.orgId, today)).toEqual({ created: 0 })
        await saveVehicleInTransaction(tx, manager.orgId, { compliance: { insuranceEnd: addDays(expiry, 365) } }, id)
        expect(await reconcileVehicle(tx, id, manager.orgId, addDays(expiry, 335))).toEqual({ created: 1 })
        cycles = await tx.select().from(vehicleRenewals).where(eq(vehicleRenewals.vehicleId, id))
        expect(cycles).toHaveLength(2)
        expect((await tx.select().from(tasks).where(eq(tasks.id, taskId)))[0].status).toBe('done')
        await expect(saveVehicleInTransaction(tx, crypto.randomUUID(), { name: 'Foreign manager', maxPassengers: 4, administrationManagerId: manager.id })).rejects.toThrow('active user in your organization')
        await expect(saveVehicleInTransaction(tx, manager.orgId, { administrationManagerId: crypto.randomUUID() }, id)).rejects.toThrow('active user in your organization')
        expect(await saveVehicleInTransaction(tx, crypto.randomUUID(), { name: 'Not yours' }, id)).toBeNull()
        throw rollback
      })
    } catch (error) { if (error !== rollback) throw error }
  }, 60_000)
})
