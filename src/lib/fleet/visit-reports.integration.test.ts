import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { dispatches, dispatchStops, drivers, fleetRequests, fleetTripReports, fleetReportTaskLinks, profiles, projects, taskAssignees, tasks, vehicles } from '../db/schema'
import { completeDispatchInTransaction, cancelRequestInTransaction } from '../db/queries/dispatches'
import { ensureTripReportsInTransaction, submitVisitReportInTransaction } from '../db/queries/fleet-trip-reports'

describe.skipIf(process.env.RUN_VISIT_REPORT_DB_TESTS !== 'true')('visit report workflow (rollback only)', () => {
  it('completes rides and creates one 48-hour obligation for the traveller; submission closes only reporting task', async () => {
    const rollback = new Error('rollback-visit-fixtures')
    try {
      await db.transaction(async tx => {
        const [booker] = await tx.select().from(profiles).where(eq(profiles.isActive, true)).limit(1)
        const people = await tx.select().from(profiles).where(and(eq(profiles.orgId, booker.orgId), eq(profiles.isActive, true))).limit(2)
        expect(people.length).toBe(2)
        const owner = people.find(p => p.id !== booker.id)!
        const [project] = await tx.insert(projects).values({ orgId: booker.orgId, name: `Visit test ${crypto.randomUUID()}` }).returning()
        const [reason] = await tx.insert(tasks).values({ orgId: booker.orgId, projectId: project.id, title: 'Original work' }).returning()
        const [vehicle] = await tx.insert(vehicles).values({ orgId: booker.orgId, name: `Visit test ${crypto.randomUUID()}`, maxPassengers: 2 }).returning()
        const [driver] = await tx.insert(drivers).values({ orgId: booker.orgId, fullName: 'Visit test', accessToken: crypto.randomUUID().replaceAll('-', '') }).returning()
        const [ride] = await tx.insert(dispatches).values({ orgId: booker.orgId, vehicleId: vehicle.id, driverId: driver.id, startDate: '2026-09-08', endDate: '2026-09-08', status: 'in_progress' }).returning()
        const [request] = await tx.insert(fleetRequests).values({ orgId: booker.orgId, requestType: 'standalone', requestedBy: booker.id, reportOwnerId: owner.id,
          destinationText: 'Inspection', startDate: '2026-09-08', endDate: '2026-09-08', status: 'dispatched', taskId: reason.id }).returning()
        const [unlinked, cancelled] = await tx.insert(fleetRequests).values([
          { orgId: booker.orgId, requestType: 'standalone', requestedBy: booker.id, destinationText: 'Second visit', startDate: '2026-09-08', endDate: '2026-09-08', status: 'dispatched' },
          { orgId: booker.orgId, requestType: 'standalone', requestedBy: booker.id, destinationText: 'Cancelled visit', startDate: '2026-09-08', endDate: '2026-09-08', status: 'cancelled' },
        ]).returning()
        await tx.insert(dispatchStops).values([request, request, unlinked, cancelled].map(r => ({ dispatchId: ride.id, requestId: r.id }))).returning()
        expect(await completeDispatchInTransaction(tx, ride.id, crypto.randomUUID())).toBeUndefined()
        expect(await tx.select().from(fleetTripReports).where(eq(fleetTripReports.requestId, request.id))).toHaveLength(0)
        const completed = await completeDispatchInTransaction(tx, ride.id, driver.id, new Date('2026-09-08T20:30:00Z'))
        expect(completed?.status).toBe('completed')
        // A stale cancellation preflight must not reverse a completed ride.
        expect(await cancelRequestInTransaction(tx, request.id, true)).toBeUndefined()
        await ensureTripReportsInTransaction(tx, ride.id, completed!.completedAt!)
        const reports = await tx.select().from(fleetTripReports).where(eq(fleetTripReports.requestId, request.id))
        expect(reports).toHaveLength(1)
        const report = reports[0]
        expect(report.dueAt.toISOString()).toBe('2026-09-10T20:30:00.000Z')
        expect(report.submittedBy).toBe(owner.id)
        expect(report.reportingTaskId).not.toBe(reason.id)
        const [unlinkedReport] = await tx.select().from(fleetTripReports).where(eq(fleetTripReports.requestId, unlinked.id))
        expect(unlinkedReport.taskId).toBeNull()
        expect(unlinkedReport.reportingTaskId).toBeTruthy()
        expect(unlinkedReport.reportingTaskId).not.toBe(report.reportingTaskId)
        expect(unlinkedReport.submittedBy).toBe(booker.id)
        expect(await tx.select().from(fleetTripReports).where(eq(fleetTripReports.requestId, cancelled.id))).toHaveLength(0)
        expect((await tx.select().from(fleetRequests).where(eq(fleetRequests.id, cancelled.id)))[0].status).toBe('cancelled')
        expect(await tx.select({ id: taskAssignees.profileId }).from(taskAssignees).where(eq(taskAssignees.taskId, report.reportingTaskId!))).toEqual([{ id: owner.id }])
        const data = { summary: 'Checked equipment', details: { visitPurpose: 'Inspection', visitLocation: 'Site', visitDate: '2026-09-08', outcomes: 'Follow-up needed' },
          linkedTaskIds: [reason.id], attachmentUrls: [], newTasks: [{ title: 'Follow up', projectId: project.id, priority: 'high' as const, assigneeIds: [owner.id], dueDate: '2026-09-12' }] }
        await expect(submitVisitReportInTransaction(tx, request.id, booker.orgId, booker.id, data)).rejects.toThrow('Only the report owner')
        await expect(submitVisitReportInTransaction(tx, request.id, crypto.randomUUID(), owner.id, data)).rejects.toThrow('Report not found')
        await expect(submitVisitReportInTransaction(tx, request.id, booker.orgId, owner.id, { ...data, linkedTaskIds: [crypto.randomUUID()] })).rejects.toThrow('linked task')
        await expect(submitVisitReportInTransaction(tx, request.id, booker.orgId, owner.id, { ...data, newTasks: [{ ...data.newTasks[0], projectId: crypto.randomUUID() }] })).rejects.toThrow('active project')
        await expect(submitVisitReportInTransaction(tx, request.id, booker.orgId, owner.id, { ...data, newTasks: [{ ...data.newTasks[0], assigneeIds: [crypto.randomUUID()] }] })).rejects.toThrow('active assignees')
        await submitVisitReportInTransaction(tx, request.id, booker.orgId, owner.id, data)
        await submitVisitReportInTransaction(tx, request.id, booker.orgId, owner.id, data)
        expect((await tx.select().from(tasks).where(eq(tasks.id, report.reportingTaskId!)))[0].status).toBe('done')
        expect((await tx.select().from(tasks).where(eq(tasks.id, reason.id)))[0].status).toBe('todo')
        const follows = await tx.select().from(tasks).where(and(eq(tasks.projectId, project.id), eq(tasks.title, 'Follow up')))
        expect(follows).toHaveLength(1)
        expect(follows[0].status).toBe('todo')
        expect(await tx.select().from(fleetReportTaskLinks).where(eq(fleetReportTaskLinks.reportId, report.id))).toHaveLength(2)
        expect(await completeDispatchInTransaction(tx, ride.id, driver.id)).toBeUndefined()
        throw rollback
      })
    } catch (error) { if (error !== rollback) throw error }
  }, 120_000)
})
