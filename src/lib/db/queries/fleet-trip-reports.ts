import { and, eq, ne } from 'drizzle-orm'
import { db } from '..'
import { dispatchStops, fleetRequests, fleetTripReports } from '../schema'

const REPORT_DUE_MS = 72 * 60 * 60 * 1000

/**
 * Creates one report obligation for every live request on a completed dispatch.
 * The unique request constraint makes this safe to call more than once.
 */
export async function ensureTripReportsForDispatch(dispatchId: string, completedAt: Date) {
  const stops = await db
    .select({
      requestId: fleetRequests.id,
      orgId: fleetRequests.orgId,
      ownerId: fleetRequests.requestedBy,
      taskId: fleetRequests.taskId,
    })
    .from(dispatchStops)
    .innerJoin(fleetRequests, eq(dispatchStops.requestId, fleetRequests.id))
    .where(and(eq(dispatchStops.dispatchId, dispatchId), ne(fleetRequests.status, 'cancelled')))

  const dueAt = new Date(completedAt.getTime() + REPORT_DUE_MS)
  const reportsByRequest = new Map(stops.map((stop) => [stop.requestId, stop]))
  const values = [...reportsByRequest.values()]
    // New requests are linked to a Task before dispatch. Historic requests
    // without that required relation cannot satisfy fleet_trip_reports.task_id.
    .filter((stop): stop is typeof stop & { taskId: string } => stop.taskId !== null)
    .map((stop) => ({
      orgId: stop.orgId,
      requestId: stop.requestId,
      taskId: stop.taskId,
      submittedBy: stop.ownerId,
      dueAt,
    }))

  if (values.length === 0) return []

  return db
    .insert(fleetTripReports)
    .values(values)
    .onConflictDoNothing({ target: fleetTripReports.requestId })
    .returning()
}

export async function getTripReportForRequest(requestId: string, orgId: string) {
  const [report] = await db
    .select()
    .from(fleetTripReports)
    .where(and(eq(fleetTripReports.requestId, requestId), eq(fleetTripReports.orgId, orgId)))
    .limit(1)
  return report
}

export async function submitTripReport(
  requestId: string,
  ownerId: string,
  data: { summary: string; attachmentUrls: string[] },
) {
  const now = new Date()
  const [report] = await db
    .update(fleetTripReports)
    .set({
      summary: data.summary,
      attachmentUrls: data.attachmentUrls,
      submittedAt: now,
      updatedAt: now,
    })
    .where(and(eq(fleetTripReports.requestId, requestId), eq(fleetTripReports.submittedBy, ownerId)))
    .returning()
  return report
}
