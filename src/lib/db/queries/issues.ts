import { eq, and, desc, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '..'
import {
  issues,
  projects,
  properties,
  profiles,
  surveyQuestions,
  surveySubmissions,
  surveyResponses,
  propertyAssignments,
  taskAssignees,
  tasks,
  type NewIssue,
} from '../schema'

// Alias for joining profiles a second time (submitter vs assignee)
const submitterProfiles = alias(profiles, 'submitter_profiles')

// ---------------------------------------------------------------------------
// Create issues from a submitted survey
// ---------------------------------------------------------------------------

/**
 * For each response with score <= 6 and an issueDescription, create an issue.
 * Looks up question text for title, property's primaryPmId for assignment,
 * checks for repeat issues (existing closed issues with same questionId + propertyId),
 * and creates a linked task in the shared Survey Issues project.
 */
export async function createIssuesFromSubmission(
  submissionId: string,
  orgId: string,
  propertyId: string,
  responses: {
    responseId: string
    questionId: string
    score: number
    issueDescription?: string | null
  }[]
) {
  const lowScoreResponses = responses.filter(
    (r) => r.score <= 6 && r.issueDescription
  )

  if (lowScoreResponses.length === 0) return []

  return db.transaction(async (tx) => {
    // Look up question texts
    const questionIds = lowScoreResponses.map((r) => r.questionId)
    const questionRows = await tx
      .select({ id: surveyQuestions.id, text: surveyQuestions.text })
      .from(surveyQuestions)
      .where(inArray(surveyQuestions.id, questionIds))

    const questionTextMap = new Map(questionRows.map((q) => [q.id, q.text]))

    // Look up property's primary PM
    const [prop] = await tx
      .select({ primaryPmId: properties.primaryPmId })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1)

    const assignedTo = prop?.primaryPmId ?? null

    // Check for repeat issues: existing closed issues with same questionId + propertyId
    const existingClosedIssues = await tx
      .select({ questionId: issues.questionId })
      .from(issues)
      .where(
        and(
          eq(issues.propertyId, propertyId),
          eq(issues.status, 'closed'),
          inArray(issues.questionId, questionIds)
        )
      )

    const repeatQuestionIds = new Set(existingClosedIssues.map((i) => i.questionId))

    // Reuse the organization-wide project, creating it on the first survey issue.
    const [createdProject] = await tx
      .insert(projects)
      .values({ orgId, name: 'Survey Issues', description: 'Tasks generated from internal survey issues.' })
      .onConflictDoUpdate({
        target: [projects.orgId, projects.name],
        set: { status: 'active', updatedAt: new Date() },
      })
      .returning()
    const project = createdProject

    if (!project) throw new Error('Failed to create or find the Survey Issues project')

    const inserted: typeof issues.$inferSelect[] = []
    for (const response of lowScoreResponses) {
      const title = questionTextMap.get(response.questionId) ?? 'Issue flagged'
      const [issue] = await tx.insert(issues).values({
        orgId,
        propertyId,
        submissionId,
        responseId: response.responseId,
        questionId: response.questionId,
        title,
        description: response.issueDescription!,
        assignedTo,
        isRepeatIssue: repeatQuestionIds.has(response.questionId),
      } satisfies NewIssue).returning()

      const [task] = await tx.insert(tasks).values({
        orgId,
        projectId: project.id,
        title,
        description: response.issueDescription!,
        propertyId,
        createdBy: assignedTo,
      }).returning()

      if (assignedTo) {
        await tx.insert(taskAssignees).values({ taskId: task.id, profileId: assignedTo })
      }

      const [linkedIssue] = await tx
        .update(issues)
        .set({ taskId: task.id, updatedAt: new Date() })
        .where(eq(issues.id, issue.id))
        .returning()
      inserted.push(linkedIssue)
    }

    return inserted
  })
}

// ---------------------------------------------------------------------------
// Get issues for admin (all org issues)
// ---------------------------------------------------------------------------

export interface IssueFilters {
  propertyId?: string
  status?: 'open' | 'investigating' | 'closed'
  isRepeatIssue?: boolean
}

export async function getIssuesForAdmin(orgId: string, filters: IssueFilters = {}) {
  const conditions = [eq(issues.orgId, orgId)]

  if (filters.propertyId) {
    conditions.push(eq(issues.propertyId, filters.propertyId))
  }
  if (filters.status) {
    conditions.push(eq(issues.status, filters.status))
  }
  if (filters.isRepeatIssue !== undefined) {
    conditions.push(eq(issues.isRepeatIssue, filters.isRepeatIssue))
  }

  const rows = await db
    .select({
      id: issues.id,
      orgId: issues.orgId,
      propertyId: issues.propertyId,
      submissionId: issues.submissionId,
      responseId: issues.responseId,
      questionId: issues.questionId,
      title: issues.title,
      description: issues.description,
      status: issues.status,
      assignedTo: issues.assignedTo,
      isRepeatIssue: issues.isRepeatIssue,
      closingNotes: issues.closingNotes,
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
      closedAt: issues.closedAt,
      closedBy: issues.closedBy,
      propertyName: properties.name,
      assigneeName: profiles.fullName,
      raisedByName: submitterProfiles.fullName,
    })
    .from(issues)
    .innerJoin(properties, eq(issues.propertyId, properties.id))
    .innerJoin(surveySubmissions, eq(issues.submissionId, surveySubmissions.id))
    .leftJoin(profiles, eq(issues.assignedTo, profiles.id))
    .leftJoin(submitterProfiles, eq(surveySubmissions.submittedBy, submitterProfiles.id))
    .where(and(...conditions))
    .orderBy(desc(issues.createdAt))

  return rows
}

// ---------------------------------------------------------------------------
// Get issues for a specific user (PM — only issues for their assigned properties)
// ---------------------------------------------------------------------------

export async function getIssuesForUser(userId: string, filters: IssueFilters = {}) {
  // Get user's assigned property IDs
  const assignments = await db
    .select({ propertyId: propertyAssignments.propertyId })
    .from(propertyAssignments)
    .where(eq(propertyAssignments.userId, userId))

  const propertyIds = assignments.map((a) => a.propertyId)
  if (propertyIds.length === 0) return []

  const conditions = [inArray(issues.propertyId, propertyIds)]

  if (filters.propertyId) {
    conditions.push(eq(issues.propertyId, filters.propertyId))
  }
  if (filters.status) {
    conditions.push(eq(issues.status, filters.status))
  }
  if (filters.isRepeatIssue !== undefined) {
    conditions.push(eq(issues.isRepeatIssue, filters.isRepeatIssue))
  }

  const rows = await db
    .select({
      id: issues.id,
      orgId: issues.orgId,
      propertyId: issues.propertyId,
      submissionId: issues.submissionId,
      responseId: issues.responseId,
      questionId: issues.questionId,
      title: issues.title,
      description: issues.description,
      status: issues.status,
      assignedTo: issues.assignedTo,
      isRepeatIssue: issues.isRepeatIssue,
      closingNotes: issues.closingNotes,
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
      closedAt: issues.closedAt,
      closedBy: issues.closedBy,
      propertyName: properties.name,
      assigneeName: profiles.fullName,
      raisedByName: submitterProfiles.fullName,
    })
    .from(issues)
    .innerJoin(properties, eq(issues.propertyId, properties.id))
    .innerJoin(surveySubmissions, eq(issues.submissionId, surveySubmissions.id))
    .leftJoin(profiles, eq(issues.assignedTo, profiles.id))
    .leftJoin(submitterProfiles, eq(surveySubmissions.submittedBy, submitterProfiles.id))
    .where(and(...conditions))
    .orderBy(desc(issues.createdAt))

  return rows
}

// ---------------------------------------------------------------------------
// Get a single issue by ID with full details
// ---------------------------------------------------------------------------

export async function getIssueById(id: string) {
  const rows = await db
    .select({
      id: issues.id,
      orgId: issues.orgId,
      propertyId: issues.propertyId,
      submissionId: issues.submissionId,
      responseId: issues.responseId,
      questionId: issues.questionId,
      title: issues.title,
      description: issues.description,
      status: issues.status,
      assignedTo: issues.assignedTo,
      isRepeatIssue: issues.isRepeatIssue,
      closingNotes: issues.closingNotes,
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
      closedAt: issues.closedAt,
      closedBy: issues.closedBy,
      propertyName: properties.name,
      questionText: surveyQuestions.text,
      assigneeName: profiles.fullName,
      submissionSlug: surveySubmissions.slug,
      responseScore: surveyResponses.score,
    })
    .from(issues)
    .innerJoin(properties, eq(issues.propertyId, properties.id))
    .innerJoin(surveyQuestions, eq(issues.questionId, surveyQuestions.id))
    .innerJoin(surveySubmissions, eq(issues.submissionId, surveySubmissions.id))
    .innerJoin(surveyResponses, eq(issues.responseId, surveyResponses.id))
    .leftJoin(profiles, eq(issues.assignedTo, profiles.id))
    .where(eq(issues.id, id))
    .limit(1)

  if (!rows[0]) return null

  // If there's a closedBy, look up the closer's name separately
  const issue = rows[0]
  let closerName: string | null = null
  if (issue.closedBy) {
    const [closer] = await db
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, issue.closedBy))
      .limit(1)
    closerName = closer?.fullName ?? null
  }

  return { ...issue, closerName }
}

// ---------------------------------------------------------------------------
// Update issue status
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['investigating', 'closed'],
  investigating: ['closed'],
  closed: [],
}

export async function updateIssueStatus(
  id: string,
  newStatus: 'open' | 'investigating' | 'closed',
  closingNotes?: string,
  closedBy?: string
) {
  // Get current issue
  const [current] = await db
    .select({ status: issues.status })
    .from(issues)
    .where(eq(issues.id, id))
    .limit(1)

  if (!current) return null

  const allowed = VALID_TRANSITIONS[current.status] ?? []
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${current.status} -> ${newStatus}`
    )
  }

  const now = new Date()
  const updateData: Partial<NewIssue> & { closedAt?: Date | null; updatedAt: Date } = {
    status: newStatus,
    updatedAt: now,
  }

  if (newStatus === 'closed') {
    updateData.closingNotes = closingNotes ?? null
    updateData.closedAt = now
    updateData.closedBy = closedBy ?? null
  }

  const [updated] = await db
    .update(issues)
    .set(updateData)
    .where(eq(issues.id, id))
    .returning()

  return updated
}
