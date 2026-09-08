import { eq, and, asc, desc, ilike, inArray, or, sql } from 'drizzle-orm'
import { db } from '..'
import {
  fleetRequests, fleetTripReports, fleetReportTaskLinks, issues, surveyQuestions, surveyResponses,
  tasks, taskTeams, taskAssignees, taskTeamLinks, properties, profiles, vehicleRenewals,
  type Task, type NewTask, type TaskTeam,
} from '../schema'

export class TaskReportConflict extends Error {}
export function assertVisitReportTaskEdit(
  current: Pick<Task, 'status' | 'projectId' | 'dueDate'>,
  report: { submittedAt: Date | null } | null,
  data: Partial<NewTask>, currentAssigneeIds: string[], assigneeIds?: string[],
) {
  if (!report) return
  if (report.submittedAt && data.status !== undefined && data.status !== 'done') throw new TaskReportConflict('A submitted visit report cannot be reopened.')
  if (!report.submittedAt && data.status === 'done') throw new TaskReportConflict('Submit the visit report to complete this task.')
  if ((data.projectId !== undefined && data.projectId !== current.projectId) ||
      (data.dueDate !== undefined && data.dueDate !== current.dueDate) ||
      (assigneeIds !== undefined && JSON.stringify([...new Set(assigneeIds)].sort()) !== JSON.stringify([...new Set(currentAssigneeIds)].sort()))) {
    throw new TaskReportConflict('The project, deadline and assignee are managed by the visit report.')
  }
}
export function assertTaskReportDeletion(hasReports: boolean) {
  if (hasReports) throw new TaskReportConflict('Tasks linked to visit reports are retained as report history.')
}

export interface TaskFilters {
  propertyId?: string
  projectId?: string
  status?: 'todo' | 'in_progress' | 'stuck' | 'done'
  teamId?: string
  priority?: 'low' | 'medium' | 'high'
  assigneeId?: string
  search?: string
}

export interface TaskWithRelations extends Task {
  visitReport?: { requestId: string; dueAt: Date; submittedAt: Date | null } | null
  vehicleRenewal?: { vehicleId: string; kind: string; expiryDate: string } | null
  propertyName: string | null
  assignees: { id: string; fullName: string }[]
  teams: { id: string; name: string }[]
  sourceIssue: {
    id: string
    title: string
    status: 'open' | 'investigating' | 'closed'
    questionText: string
    responseScore: number
  } | null
  fleetReports: {
    id: string
    requestId: string
    requestStatus: 'pending' | 'queued' | 'dispatched' | 'completed' | 'cancelled'
    purpose: string | null
    startDate: string
    endDate: string
    dueAt: Date
    submittedAt: Date | null
    summary: string | null
    attachmentUrls: string[]
  }[]
}

async function hydrate(rows: Task[]): Promise<TaskWithRelations[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const propIds = Array.from(new Set(rows.map((r) => r.propertyId).filter(Boolean))) as string[]

  const [assigneeRows, teamRows, propRows, issueRows, reportRows, renewalRows] = await Promise.all([
    db.select({ taskId: taskAssignees.taskId, id: profiles.id, fullName: profiles.fullName })
      .from(taskAssignees)
      .innerJoin(profiles, eq(taskAssignees.profileId, profiles.id))
      .where(inArray(taskAssignees.taskId, ids)),
    db.select({ taskId: taskTeamLinks.taskId, id: taskTeams.id, name: taskTeams.name })
      .from(taskTeamLinks)
      .innerJoin(taskTeams, eq(taskTeamLinks.teamId, taskTeams.id))
      .where(inArray(taskTeamLinks.taskId, ids)),
    propIds.length
      ? db.select({ id: properties.id, name: properties.name }).from(properties).where(inArray(properties.id, propIds))
      : Promise.resolve([] as { id: string; name: string }[]),
    db.select({
      taskId: issues.taskId,
      id: issues.id,
      title: issues.title,
      status: issues.status,
      questionText: surveyQuestions.text,
      responseScore: surveyResponses.score,
    })
      .from(issues)
      .innerJoin(surveyQuestions, eq(issues.questionId, surveyQuestions.id))
      .innerJoin(surveyResponses, eq(issues.responseId, surveyResponses.id))
      .where(inArray(issues.taskId, ids)),
    db.select({
      id: fleetTripReports.id,
      reportTaskId: fleetTripReports.taskId,
      reportingTaskId: fleetTripReports.reportingTaskId,
      linkedTaskId: fleetReportTaskLinks.taskId,
      requestId: fleetRequests.id,
      requestTaskId: fleetRequests.taskId,
      requestStatus: fleetRequests.status,
      purpose: fleetRequests.purpose,
      startDate: fleetRequests.startDate,
      endDate: fleetRequests.endDate,
      dueAt: fleetTripReports.dueAt,
      submittedAt: fleetTripReports.submittedAt,
      summary: fleetTripReports.summary,
      attachmentUrls: fleetTripReports.attachmentUrls,
    })
      .from(fleetTripReports)
      .innerJoin(fleetRequests, eq(fleetTripReports.requestId, fleetRequests.id))
      .leftJoin(fleetReportTaskLinks, eq(fleetReportTaskLinks.reportId, fleetTripReports.id))
      .where(or(inArray(fleetTripReports.taskId, ids), inArray(fleetRequests.taskId, ids), inArray(fleetTripReports.reportingTaskId, ids), inArray(fleetReportTaskLinks.taskId, ids)))
      .orderBy(desc(fleetTripReports.createdAt)),
    db.select().from(vehicleRenewals).where(inArray(vehicleRenewals.taskId, ids)),
  ])

  const aByTask = new Map<string, { id: string; fullName: string }[]>()
  for (const a of assigneeRows) {
    const arr = aByTask.get(a.taskId) ?? []
    arr.push({ id: a.id, fullName: a.fullName }); aByTask.set(a.taskId, arr)
  }
  const tByTask = new Map<string, { id: string; name: string }[]>()
  for (const t of teamRows) {
    const arr = tByTask.get(t.taskId) ?? []
    arr.push({ id: t.id, name: t.name }); tByTask.set(t.taskId, arr)
  }
  const propName = new Map(propRows.map((p) => [p.id, p.name]))
  const issueByTask = new Map(
    issueRows
      .filter((issue): issue is typeof issue & { taskId: string } => issue.taskId !== null)
      .map((issue) => [issue.taskId, {
        id: issue.id,
        title: issue.title,
        status: issue.status,
        questionText: issue.questionText,
        responseScore: issue.responseScore,
      }]),
  )
  const reportsByTask = new Map<string, TaskWithRelations['fleetReports']>()
  for (const report of reportRows) {
    const associatedIds = new Set([report.reportTaskId, report.requestTaskId, report.reportingTaskId, report.linkedTaskId].filter((id): id is string => !!id && ids.includes(id)))
    for (const taskId of associatedIds) {
    const list = reportsByTask.get(taskId) ?? []
    if (list.some((existing) => existing.id === report.id)) continue
    list.push({
      id: report.id,
      requestId: report.requestId,
      requestStatus: report.requestStatus,
      purpose: report.purpose,
      startDate: report.startDate,
      endDate: report.endDate,
      dueAt: report.dueAt,
      submittedAt: report.submittedAt,
      summary: report.summary,
      attachmentUrls: report.attachmentUrls,
    })
    reportsByTask.set(taskId, list)
    }
  }

  return rows.map((r) => ({
    ...r,
    vehicleRenewal: renewalRows.find(renewal => renewal.taskId === r.id) ?? null,
    visitReport: (() => {
      const report = reportRows.find(report => report.reportingTaskId === r.id)
      return report ? { requestId: report.requestId, dueAt: report.dueAt, submittedAt: report.submittedAt } : null
    })(),
    propertyName: r.propertyId ? propName.get(r.propertyId) ?? null : null,
    assignees: aByTask.get(r.id) ?? [],
    teams: tByTask.get(r.id) ?? [],
    sourceIssue: issueByTask.get(r.id) ?? null,
    fleetReports: reportsByTask.get(r.id) ?? [],
  }))
}

export async function getTasks(orgId: string, filters: TaskFilters = {}): Promise<TaskWithRelations[]> {
  const conditions = [eq(tasks.orgId, orgId)]
  if (filters.propertyId) conditions.push(eq(tasks.propertyId, filters.propertyId))
  if (filters.projectId) conditions.push(eq(tasks.projectId, filters.projectId))
  if (filters.status) conditions.push(eq(tasks.status, filters.status))
  if (filters.priority) conditions.push(eq(tasks.priority, filters.priority))
  if (filters.search) conditions.push(ilike(tasks.title, `%${filters.search}%`))

  // team/assignee filters require a membership subquery
  if (filters.teamId) {
    conditions.push(sql`exists (select 1 from task_team_links ttl where ttl.task_id = ${tasks.id} and ttl.team_id = ${filters.teamId})`)
  }
  if (filters.assigneeId) {
    conditions.push(sql`exists (select 1 from task_assignees ta where ta.task_id = ${tasks.id} and ta.profile_id = ${filters.assigneeId})`)
  }

  const rows = await db.select().from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.status), asc(tasks.position), desc(tasks.createdAt))
  return hydrate(rows)
}

export async function getTaskById(id: string): Promise<TaskWithRelations | null> {
  const rows = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!rows[0]) return null
  const [h] = await hydrate(rows)
  return h
}

export async function createTask(data: NewTask, assigneeIds: string[], teamIds: string[]): Promise<Task> {
  return db.transaction(async (tx) => {
    const [task] = await tx.insert(tasks).values(data).returning()
    if (assigneeIds.length)
      await tx.insert(taskAssignees).values(assigneeIds.map((profileId) => ({ taskId: task.id, profileId })))
    if (teamIds.length)
      await tx.insert(taskTeamLinks).values(teamIds.map((teamId) => ({ taskId: task.id, teamId })))
    return task
  })
}

export async function updateTask(
  id: string, data: Partial<NewTask>, assigneeIds?: string[], teamIds?: string[], orgId?: string,
): Promise<Task> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(tasks).where(and(eq(tasks.id, id), orgId ? eq(tasks.orgId, orgId) : undefined)).for('update')
    if (!current) throw new TaskReportConflict('Task not found.')
    // Lock only the task. Submission locks the report first, then this task;
    // a plain report read avoids an opposing lock order and deadlocks.
    const [report] = await tx.select().from(fleetTripReports).where(and(eq(fleetTripReports.reportingTaskId, id), eq(fleetTripReports.orgId, current.orgId)))
    const currentAssignees = report && assigneeIds !== undefined ? await tx.select().from(taskAssignees).where(eq(taskAssignees.taskId, id)) : []
    assertVisitReportTaskEdit(current, report ?? null, data, currentAssignees.map(a => a.profileId), assigneeIds)
    const set: Partial<NewTask> = { ...data, updatedAt: new Date() }
    if (report) { delete set.projectId; delete set.dueDate; delete set.completedAt }
    if (data.status !== undefined && !report) {
      set.completedAt = data.status === 'done' ? new Date() : null
    }
    const [task] = await tx.update(tasks).set(set).where(eq(tasks.id, id)).returning()
    if (assigneeIds && !report) {
      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, id))
      if (assigneeIds.length)
        await tx.insert(taskAssignees).values(assigneeIds.map((profileId) => ({ taskId: id, profileId })))
    }
    if (teamIds) {
      await tx.delete(taskTeamLinks).where(eq(taskTeamLinks.taskId, id))
      if (teamIds.length)
        await tx.insert(taskTeamLinks).values(teamIds.map((teamId) => ({ taskId: id, teamId })))
    }
    return task
  })
}

export async function deleteTask(id: string, orgId?: string): Promise<Task | undefined> {
  return db.transaction(async tx => {
    const [current] = await tx.select().from(tasks).where(and(eq(tasks.id, id), orgId ? eq(tasks.orgId, orgId) : undefined)).for('update')
    if (!current) return undefined
    const [report] = await tx.select({ id: fleetTripReports.id }).from(fleetTripReports)
      .leftJoin(fleetReportTaskLinks, eq(fleetReportTaskLinks.reportId, fleetTripReports.id))
      .where(or(eq(fleetTripReports.taskId, id), eq(fleetTripReports.reportingTaskId, id), eq(fleetReportTaskLinks.taskId, id))).limit(1)
    assertTaskReportDeletion(!!report)
    const [deleted] = await tx.delete(tasks).where(eq(tasks.id, id)).returning()
    return deleted
  })
}

export async function reorderTask(
  id: string, status: 'todo' | 'in_progress' | 'stuck' | 'done', position: number, orgId?: string,
): Promise<Task> {
  return updateTask(id, { status, position }, undefined, undefined, orgId)
}

export async function getTaskTeams(orgId: string): Promise<TaskTeam[]> {
  return db.select().from(taskTeams).where(eq(taskTeams.orgId, orgId))
    .orderBy(asc(taskTeams.sortOrder), asc(taskTeams.name))
}

export async function createTaskTeam(orgId: string, name: string, sortOrder = 0): Promise<TaskTeam> {
  const [t] = await db.insert(taskTeams).values({ orgId, name, sortOrder }).returning()
  return t
}

export async function updateTaskTeam(id: string, data: { name?: string; sortOrder?: number }): Promise<TaskTeam> {
  const [t] = await db.update(taskTeams).set({ ...data, updatedAt: new Date() }).where(eq(taskTeams.id, id)).returning()
  return t
}

export async function deleteTaskTeam(id: string): Promise<TaskTeam | undefined> {
  const [t] = await db.delete(taskTeams).where(eq(taskTeams.id, id)).returning()
  return t
}
