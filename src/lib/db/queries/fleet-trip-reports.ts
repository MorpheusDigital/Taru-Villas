import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { db } from '..'
import { dispatches, dispatchStops, fleetRequests, fleetTripReports, fleetReportTaskLinks, profiles, projects, properties, taskAssignees, tasks } from '../schema'
import { reportDeadline, visitReportSubmissionSchema, type VisitReportSubmission } from '../../fleet/reports'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export class VisitReportError extends Error {}

export async function ensureTripReportsInTransaction(tx: Transaction, dispatchId: string, completedAt: Date) {
  const [dispatch] = await tx.select().from(dispatches).where(and(eq(dispatches.id, dispatchId), eq(dispatches.status, 'completed')))
  if (!dispatch) return []
  const requests = await tx.select().from(fleetRequests).where(and(
    eq(fleetRequests.orgId, dispatch.orgId), eq(fleetRequests.status, 'completed'),
    inArray(fleetRequests.id, tx.select({ id: dispatchStops.requestId }).from(dispatchStops).where(eq(dispatchStops.dispatchId, dispatchId))),
  )).orderBy(asc(fleetRequests.id)).for('update')
  const created = []
  for (const request of requests) {
    const [existing] = await tx.select().from(fleetTripReports).where(eq(fleetTripReports.requestId, request.id))
    if (existing) continue
    const ownerId = request.reportOwnerId ?? request.requestedBy
    // Keep responsibility if deactivated after booking; never silently reassign.
    const [owner] = await tx.select().from(profiles).where(and(eq(profiles.id, ownerId), eq(profiles.orgId, request.orgId)))
    if (!owner) throw new VisitReportError('Report owner must belong to the ride organization')
    const [property] = request.targetPropertyId ? await tx.select().from(properties).where(and(eq(properties.id, request.targetPropertyId), eq(properties.orgId, request.orgId))) : []
    const dueAt = reportDeadline(completedAt)
    const dueDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dueAt)
    const exactDeadline = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' }).format(dueAt)
    const [project] = await tx.insert(projects).values({ orgId: request.orgId, name: 'Visit Reports', description: 'Reports required within 48 hours of completing a ride.' })
      .onConflictDoUpdate({ target: [projects.orgId, projects.name], set: { status: 'active', updatedAt: new Date() } }).returning()
    const [task] = await tx.insert(tasks).values({ orgId: request.orgId, projectId: project.id,
      title: `Submit visit report — ${(property?.name ?? request.destinationText ?? 'Ride').slice(0, 200)} (${request.id.slice(0, 8)})`,
      description: `Submit the visit report within 48 hours. Due ${exactDeadline} Sri Lanka time.\nReport: /fleet/reports/${request.id}`,
      dueDate, priority: 'high', propertyId: property?.id ?? null,
    }).returning()
    await tx.insert(taskAssignees).values({ taskId: task.id, profileId: ownerId }).returning()
    const [reason] = request.taskId ? await tx.select().from(tasks).where(and(eq(tasks.id, request.taskId), eq(tasks.orgId, request.orgId))) : []
    const [report] = await tx.insert(fleetTripReports).values({ orgId: request.orgId, requestId: request.id,
      taskId: reason?.id ?? null, reportingTaskId: task.id, submittedBy: ownerId, dueAt,
      details: { visitPurpose: request.purpose ?? '', visitLocation: property?.name ?? request.destinationText ?? '', visitDate: request.endDate },
    }).returning()
    if (reason) await tx.insert(fleetReportTaskLinks).values({ orgId: request.orgId, reportId: report.id, taskId: reason.id }).returning()
    created.push(report)
  }
  return created
}

export async function ensureTripReportsForDispatch(dispatchId: string, completedAt: Date) {
  return db.transaction(tx => ensureTripReportsInTransaction(tx, dispatchId, completedAt))
}

export async function getTripReportForRequest(requestId: string, orgId: string) {
  const [report] = await db.select().from(fleetTripReports).where(and(eq(fleetTripReports.requestId, requestId), eq(fleetTripReports.orgId, orgId))).limit(1)
  return report
}

export async function getVisitReportPage(requestId: string, orgId: string, userId: string) {
  const report = await getTripReportForRequest(requestId, orgId)
  if (!report) return null
  const [request] = await db.select().from(fleetRequests).where(and(eq(fleetRequests.id, requestId), eq(fleetRequests.orgId, orgId)))
  if (!request) return null
  const [links, taskOptions, projectOptions, people] = await Promise.all([
    db.select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId }).from(fleetReportTaskLinks)
      .innerJoin(tasks, eq(tasks.id, fleetReportTaskLinks.taskId)).where(and(eq(fleetReportTaskLinks.reportId, report.id), eq(tasks.orgId, orgId))),
    db.select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId }).from(tasks).where(and(eq(tasks.orgId, orgId), report.reportingTaskId ? ne(tasks.id, report.reportingTaskId) : undefined)).orderBy(asc(tasks.title)),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(and(eq(projects.orgId, orgId), eq(projects.status, 'active'))).orderBy(asc(projects.name)),
    db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles).where(and(eq(profiles.orgId, orgId), eq(profiles.isActive, true))).orderBy(asc(profiles.fullName)),
  ])
  const linkedTasks = [...links]
  const original = taskOptions.find(t => t.id === report.taskId)
  if (original && !linkedTasks.some(t => t.id === original.id)) linkedTasks.push(original)
  return { report, request, linkedTasks, taskOptions, projectOptions, people, canSubmit: report.submittedBy === userId && !report.submittedAt }
}

export async function submitVisitReportInTransaction(tx: Transaction, requestId: string, orgId: string, ownerId: string, input: VisitReportSubmission) {
  const [report] = await tx.select().from(fleetTripReports).where(and(eq(fleetTripReports.requestId, requestId), eq(fleetTripReports.orgId, orgId))).for('update')
  if (!report) throw new VisitReportError('Report not found')
  if (report.submittedBy !== ownerId) throw new VisitReportError('Only the report owner can submit this report')
  // Row lock serializes submissions and retries, including new task creation.
  if (report.submittedAt) return report
  const data = visitReportSubmissionSchema.parse(input)
  const [request] = await tx.select().from(fleetRequests).where(and(eq(fleetRequests.id, requestId), eq(fleetRequests.orgId, orgId), eq(fleetRequests.status, 'completed')))
  if (!request) throw new VisitReportError('The ride must be completed before reporting')
  const linkedIds = [...new Set([...data.linkedTaskIds, ...(report.taskId ? [report.taskId] : [])])]
  if (report.reportingTaskId && linkedIds.includes(report.reportingTaskId)) throw new VisitReportError('The reporting task cannot be a follow-up linked task')
  const validLinks = linkedIds.length ? await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.orgId, orgId), inArray(tasks.id, linkedIds))).for('share') : []
  if (validLinks.length !== linkedIds.length) throw new VisitReportError('Choose a linked task in your organization')
  for (const follow of data.newTasks) {
    const [project] = await tx.select().from(projects).where(and(eq(projects.id, follow.projectId), eq(projects.orgId, orgId), eq(projects.status, 'active'))).for('share')
    if (!project) throw new VisitReportError('Choose an active project in your organization')
    const ids = [...new Set(follow.assigneeIds)]
    const people = await tx.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.orgId, orgId), eq(profiles.isActive, true), inArray(profiles.id, ids))).for('share')
    if (people.length !== ids.length) throw new VisitReportError('Choose active assignees in your organization')
  }
  for (const follow of data.newTasks) {
    const [task] = await tx.insert(tasks).values({ orgId, projectId: follow.projectId, title: follow.title,
      description: `${follow.description ?? ''}\nVisit report: /fleet/reports/${requestId}`.trim(), priority: follow.priority,
      dueDate: follow.dueDate ?? null, createdBy: ownerId, propertyId: request.targetPropertyId,
    }).returning()
    await tx.insert(taskAssignees).values([...new Set(follow.assigneeIds)].map(profileId => ({ taskId: task.id, profileId }))).returning()
    linkedIds.push(task.id)
  }
  if (linkedIds.length) await tx.insert(fleetReportTaskLinks).values(linkedIds.map(taskId => ({ orgId, reportId: report.id, taskId })))
    .onConflictDoNothing({ target: [fleetReportTaskLinks.reportId, fleetReportTaskLinks.taskId] }).returning()
  const now = new Date()
  const [saved] = await tx.update(fleetTripReports).set({ summary: data.summary, details: data.details, attachmentUrls: data.attachmentUrls, submittedAt: now, updatedAt: now })
    .where(eq(fleetTripReports.id, report.id)).returning()
  if (report.reportingTaskId) await tx.update(tasks).set({ status: 'done', completedAt: now, updatedAt: now })
    .where(and(eq(tasks.id, report.reportingTaskId), eq(tasks.orgId, orgId))).returning()
  return saved
}

export async function submitTripReport(requestId: string, orgId: string, ownerId: string, data: VisitReportSubmission) {
  return db.transaction(tx => submitVisitReportInTransaction(tx, requestId, orgId, ownerId, data))
}
