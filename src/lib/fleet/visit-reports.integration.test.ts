import { describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { dispatches, dispatchStops, drivers, fleetRequests, fleetTripReports, fleetReportTaskLinks, profiles, projects, taskAssignees, tasks, vehicles } from '../db/schema'
import { completeDispatchInTransaction, cancelRequestInTransaction, createManualDispatchInTransaction, updateRequestInTransaction } from '../db/queries/dispatches'
import { ensureTripReportsInTransaction, submitVisitReportInTransaction, saveVisitReportDraftInTransaction } from '../db/queries/fleet-trip-reports'

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
        const [request] = await tx.insert(fleetRequests).values({ orgId: booker.orgId, requestType: 'standalone', requestedBy: booker.id, reportOwnerId: owner.id,
          destinationText: 'Inspection', startDate: '2026-09-08', endDate: '2026-09-08', status: 'dispatched', taskId: reason.id }).returning()
        const [unlinked, cancelled] = await tx.insert(fleetRequests).values([
          { orgId: booker.orgId, requestType: 'standalone', requestedBy: booker.id, destinationText: 'Second visit', startDate: '2026-09-08', endDate: '2026-09-08', status: 'dispatched' },
          { orgId: booker.orgId, requestType: 'standalone', requestedBy: booker.id, destinationText: 'Cancelled visit', startDate: '2026-09-08', endDate: '2026-09-08', status: 'cancelled' },
        ]).returning()
        const ride = await createManualDispatchInTransaction(tx, booker.orgId, { vehicleId: vehicle.id, driverId: driver.id, startDate: '2026-09-08', endDate: '2026-09-08', requestIds: [request.id, unlinked.id, cancelled.id] })
        const early = await tx.select().from(fleetTripReports).where(eq(fleetTripReports.requestId, request.id))
        expect(early).toHaveLength(1)
        expect(early[0].dueAt).toBeNull()
        expect((await tx.select().from(tasks).where(eq(tasks.id, early[0].reportingTaskId!)))[0].dueDate).toBeNull()
        const draft = { summary: 'Initial observations', details: { visitPurpose: 'Inspection', visitLocation: 'Site', visitDate: '2026-09-08', outcomes: '' },
          linkedTaskIds: [reason.id], attachmentUrls: [], newTasks: [{ title: '', projectId: '', priority: 'medium' as const, assigneeIds: [], dueDate: null }] }
        await expect(saveVisitReportDraftInTransaction(tx, request.id, booker.orgId, booker.id, draft)).rejects.toThrow('report owner')
        await saveVisitReportDraftInTransaction(tx, request.id, booker.orgId, owner.id, draft)
        // A removed assignment permits edits: responsibility and generated defaults follow them.
        await tx.update(fleetRequests).set({ status: 'pending' }).where(eq(fleetRequests.id, request.id))
        await updateRequestInTransaction(tx, request.id, { reportOwnerId: booker.id, destinationText: 'Updated destination', purpose: 'Updated purpose' })
        const [reassigned] = await tx.select().from(fleetTripReports).where(eq(fleetTripReports.requestId, request.id))
        expect(reassigned.submittedBy).toBe(booker.id)
        expect(reassigned.details?.visitLocation).toBe('Updated destination')
        expect(reassigned.draft).toEqual(draft)
        expect(await tx.select({ id: taskAssignees.profileId }).from(taskAssignees).where(eq(taskAssignees.taskId, reassigned.reportingTaskId!))).toEqual([{ id: booker.id }])
        await expect(saveVisitReportDraftInTransaction(tx, request.id, booker.orgId, owner.id, draft)).rejects.toThrow('report owner')
        await updateRequestInTransaction(tx, request.id, { reportOwnerId: owner.id })
        await tx.update(fleetRequests).set({ status: 'queued' }).where(eq(fleetRequests.id, request.id))
        await ensureTripReportsInTransaction(tx, ride.id)
        expect((await tx.select().from(fleetTripReports).where(eq(fleetTripReports.requestId, request.id)))[0].draft).toEqual(draft)
        await expect(submitVisitReportInTransaction(tx, request.id, booker.orgId, owner.id, { ...draft, details: { ...draft.details, outcomes: 'Finished' }, newTasks: [] })).rejects.toThrow('completed')
        await tx.update(dispatches).set({ status: 'in_progress' }).where(eq(dispatches.id, ride.id)).returning()
        await tx.insert(dispatchStops).values({ dispatchId: ride.id, requestId: request.id }).returning()
        expect(await completeDispatchInTransaction(tx, ride.id, crypto.randomUUID())).toBeUndefined()
        expect(await tx.select().from(fleetTripReports).where(eq(fleetTripReports.requestId, request.id))).toHaveLength(1)
        const completed = await completeDispatchInTransaction(tx, ride.id, driver.id, new Date('2026-09-08T20:30:00Z'))
        expect(completed?.status).toBe('completed')
        // A stale cancellation preflight must not reverse a completed ride.
        expect(await cancelRequestInTransaction(tx, request.id, true)).toBeUndefined()
        await ensureTripReportsInTransaction(tx, ride.id, completed!.completedAt!)
        const reports = await tx.select().from(fleetTripReports).where(eq(fleetTripReports.requestId, request.id))
        expect(reports).toHaveLength(1)
        const report = reports[0]
        expect(report.id).toBe(early[0].id)
        expect(report.draft).toEqual(draft)
        expect(report.dueAt!.toISOString()).toBe('2026-09-10T20:30:00.000Z')
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
        // Keep edit tests independent of the calendar date on which this suite runs.
        await tx.update(fleetTripReports).set({ dueAt: new Date(Date.now() + 172800000) }).where(eq(fleetTripReports.id, report.id)).returning()
        await expect(submitVisitReportInTransaction(tx, request.id, booker.orgId, booker.id, data)).rejects.toThrow('Only the report owner')
        await expect(submitVisitReportInTransaction(tx, request.id, crypto.randomUUID(), owner.id, data)).rejects.toThrow('Report not found')
        await expect(submitVisitReportInTransaction(tx, request.id, booker.orgId, owner.id, { ...data, linkedTaskIds: [crypto.randomUUID()] })).rejects.toThrow('linked task')
        await expect(submitVisitReportInTransaction(tx, request.id, booker.orgId, owner.id, { ...data, newTasks: [{ ...data.newTasks[0], projectId: crypto.randomUUID() }] })).rejects.toThrow('active project')
        await expect(submitVisitReportInTransaction(tx, request.id, booker.orgId, owner.id, { ...data, newTasks: [{ ...data.newTasks[0], assigneeIds: [crypto.randomUUID()] }] })).rejects.toThrow('active assignees')
        await submitVisitReportInTransaction(tx, request.id, booker.orgId, owner.id, data)
        const revision = { ...data, summary: 'Updated inspection notes', newTasks: [] }
        await expect(saveVisitReportDraftInTransaction(tx, request.id, booker.orgId, booker.id, revision)).rejects.toThrow('report owner')
        await expect(saveVisitReportDraftInTransaction(tx, request.id, booker.orgId, owner.id, data)).rejects.toThrow('Task Manager')
        const edited = await saveVisitReportDraftInTransaction(tx, request.id, booker.orgId, owner.id, revision)
        expect(edited.summary).toBe('Updated inspection notes')
        expect(edited.submittedAt).not.toBeNull()
        await saveVisitReportDraftInTransaction(tx, request.id, booker.orgId, owner.id, revision)
        await submitVisitReportInTransaction(tx, request.id, booker.orgId, owner.id, data)
        expect((await tx.select().from(tasks).where(eq(tasks.id, report.reportingTaskId!)))[0].status).toBe('done')
        expect((await tx.select().from(tasks).where(eq(tasks.id, reason.id)))[0].status).toBe('todo')
        const follows = await tx.select().from(tasks).where(and(eq(tasks.projectId, project.id), eq(tasks.title, 'Follow up')))
        expect(follows).toHaveLength(1)
        expect(follows[0].status).toBe('todo')
        expect(await tx.select().from(fleetReportTaskLinks).where(eq(fleetReportTaskLinks.reportId, report.id))).toHaveLength(2)
        await tx.update(fleetTripReports).set({ dueAt: new Date('2020-01-01T00:00:00Z') }).where(eq(fleetTripReports.id, report.id)).returning()
        await expect(saveVisitReportDraftInTransaction(tx, request.id, booker.orgId, owner.id, revision)).rejects.toThrow('editing window')
        await tx.update(fleetTripReports).set({ dueAt: new Date('2020-01-01T00:00:00Z') }).where(eq(fleetTripReports.id, unlinkedReport.id)).returning()
        await expect(saveVisitReportDraftInTransaction(tx, unlinked.id, booker.orgId, booker.id, draft)).rejects.toThrow('editing window')
        await expect(submitVisitReportInTransaction(tx, unlinked.id, booker.orgId, booker.id, revision)).rejects.toThrow('editing window')
        expect(await completeDispatchInTransaction(tx, ride.id, driver.id)).toBeUndefined()
        throw rollback
      })
    } catch (error) { if (error !== rollback) throw error }
  }, 120_000)
})
