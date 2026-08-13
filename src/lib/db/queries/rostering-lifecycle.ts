import { and, asc, desc, eq, inArray } from 'drizzle-orm'

import { calculateDemand } from '../../rostering/demand'
import { workWeekKey } from '../../rostering/dates'
import {
  validateAssignmentEdit,
  validateLifecycleVersion,
  validatePublicationReadiness,
  validateRevisionCreation,
} from '../../rostering/lifecycle'
import type { GenerationInput } from '../../rostering/types'
import { db } from '..'
import {
  notifications,
  rosterAssignments,
  rosterAssignmentSegments,
  rosterCycles,
  rosterEmployees,
  rosterEmployeeSkills,
  rosterEvents,
  rosterInputSnapshots,
  rosterParticipants,
  rosterPolicyRules,
  rosterPolicyVersions,
  rosters,
  rosterShiftTemplateSegments,
  rosterShiftTemplates,
  rosterUnavailability,
  rosterViolations,
} from '../schema'

export class RosterLifecycleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

function ensurePropertyAccess(
  accessiblePropertyIds: string[] | null,
  propertyIds: string[],
) {
  if (accessiblePropertyIds === null) return
  const accessible = new Set(accessiblePropertyIds)
  if (propertyIds.some((propertyId) => !accessible.has(propertyId))) {
    throw new RosterLifecycleError(
      'FORBIDDEN',
      'You do not manage every affected property.',
    )
  }
}

export interface UpdateAssignmentArgs {
  orgId: string
  actorId: string
  accessiblePropertyIds: string[] | null
  cycleId: string
  assignmentId: string
  expectedVersion: number
  dutyPropertyId: string
  roleId: string
  dutyCode: 'W' | 'S'
  shiftTemplateId: string
  explanation: string
}

export async function updateRosterAssignment(args: UpdateAssignmentArgs) {
  return db.transaction(async (tx) => {
    const [cycle] = await tx
      .select()
      .from(rosterCycles)
      .where(
        and(
          eq(rosterCycles.id, args.cycleId),
          eq(rosterCycles.orgId, args.orgId),
        ),
      )
      .limit(1)
      .for('update')
    if (!cycle) throw new RosterLifecycleError('NOT_FOUND', 'Roster cycle not found.')

    const lifecycle = validateLifecycleVersion(
      cycle.status,
      cycle.version,
      args.expectedVersion,
    )
    if (!lifecycle.ok) {
      throw new RosterLifecycleError(lifecycle.code, lifecycle.message)
    }

    const [current] = await tx
      .select({
        assignment: rosterAssignments,
        participant: rosterParticipants,
      })
      .from(rosterAssignments)
      .innerJoin(
        rosterParticipants,
        eq(rosterParticipants.id, rosterAssignments.participantId),
      )
      .where(
        and(
          eq(rosterAssignments.id, args.assignmentId),
          eq(rosterAssignments.cycleId, cycle.id),
        ),
      )
      .limit(1)
    if (!current) {
      throw new RosterLifecycleError('NOT_FOUND', 'Roster assignment not found.')
    }
    ensurePropertyAccess(args.accessiblePropertyIds, [
      current.assignment.dutyPropertyId,
      args.dutyPropertyId,
    ])

    const [snapshot] = await tx
      .select()
      .from(rosterInputSnapshots)
      .where(eq(rosterInputSnapshots.cycleId, cycle.id))
      .limit(1)
    const input = snapshot?.normalizedInput as GenerationInput | undefined
    if (!input) {
      throw new RosterLifecycleError(
        'SNAPSHOT_MISSING',
        'The frozen generation input is missing.',
      )
    }
    const employeeId = current.participant.employeeId
    const employee = input.employees.find((row) => row.id === employeeId)
    const property = input.properties.find((row) => row.id === args.dutyPropertyId)
    if (!employee || !property) {
      throw new RosterLifecycleError(
        'SNAPSHOT_MISMATCH',
        'Employee or property is absent from the frozen cycle snapshot.',
      )
    }

    const [template] = await tx
      .select()
      .from(rosterShiftTemplates)
      .where(
        and(
          eq(rosterShiftTemplates.id, args.shiftTemplateId),
          eq(rosterShiftTemplates.policyVersionId, cycle.policyVersionId),
          eq(rosterShiftTemplates.roleId, args.roleId),
          eq(rosterShiftTemplates.isPublished, true),
        ),
      )
      .limit(1)
    if (!template) {
      throw new RosterLifecycleError(
        'SHIFT_TEMPLATE_INVALID',
        'Shift template is not available for this policy and role.',
      )
    }
    const segments = await tx
      .select()
      .from(rosterShiftTemplateSegments)
      .where(eq(rosterShiftTemplateSegments.shiftTemplateId, template.id))
      .orderBy(asc(rosterShiftTemplateSegments.sortOrder))
    const skillRows = employeeId
      ? await tx
          .select({ roleId: rosterEmployeeSkills.roleId })
          .from(rosterEmployeeSkills)
          .where(eq(rosterEmployeeSkills.employeeId, employeeId))
      : []
    const unavailableRows = employeeId
      ? await tx
          .select({
            startDate: rosterUnavailability.startDate,
            endDate: rosterUnavailability.endDate,
          })
          .from(rosterUnavailability)
          .where(eq(rosterUnavailability.employeeId, employeeId))
      : []
    const policyRows = await tx
      .select()
      .from(rosterPolicyRules)
      .where(eq(rosterPolicyRules.policyVersionId, cycle.policyVersionId))
    const maxWeekMinutes = policyRows.find(
      (row) => row.maxWorkingMinutesPerWeek !== null,
    )?.maxWorkingMinutesPerWeek
    const weekStartsOn = policyRows.find(
      (row) => row.workWeekStartsOn !== null,
    )?.workWeekStartsOn
    if (maxWeekMinutes == null || weekStartsOn == null) {
      throw new RosterLifecycleError(
        'POLICY_INCOMPLETE',
        'Weekly minute policy is incomplete.',
      )
    }
    const participantAssignments = await tx
      .select()
      .from(rosterAssignments)
      .where(
        and(
          eq(rosterAssignments.cycleId, cycle.id),
          eq(rosterAssignments.participantId, current.participant.id),
        ),
      )
    const targetWeek = workWeekKey(
      current.assignment.assignmentDate,
      weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    )
    const cycleWeekMinutes = participantAssignments
      .filter(
        (row) =>
          workWeekKey(
            row.assignmentDate,
            weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6,
          ) === targetWeek,
      )
      .reduce((total, row) => total + row.workingMinutes, 0)
    const boundaryWeekMinutes = input.boundaryAssignments
      .filter(
        (row) =>
          row.employeeId === employeeId &&
          workWeekKey(
            row.date,
            weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6,
          ) === targetWeek,
      )
      .reduce((total, row) => total + row.workingMinutes, 0)
    const currentWeekMinutes = cycleWeekMinutes + boundaryWeekMinutes

    const editValidation = validateAssignmentEdit({
      cycleStatus: cycle.status,
      cycleVersion: cycle.version,
      expectedVersion: args.expectedVersion,
      participantId: current.participant.id,
      employeeId: employee.id,
      date: current.assignment.assignmentDate,
      dutyPropertyId: args.dutyPropertyId,
      roleId: args.roleId,
      shiftTemplateId: template.id,
      dutyCode: args.dutyCode,
      hubPropertyIds: input.properties.map((row) => row.id),
      skillRoleIds: skillRows.map((row) => row.roleId),
      unavailability: unavailableRows,
      residencyType: employee.residencyType,
      template: {
        roleId: template.roleId,
        workingMinutes: template.workingMinutes,
        segments: segments.map((segment) => ({
          startTime: segment.startTime.slice(0, 5),
          endTime: segment.endTime.slice(0, 5),
          endsNextDay: segment.endsNextDay,
        })),
      },
      transportCutoff: property.transportCutoff,
      existingAssignmentParticipantIds: [],
      currentWeekMinutes,
      maxWeekMinutes,
      priorWorkingMinutes: current.assignment.workingMinutes,
    })
    if (!editValidation.ok) {
      throw new RosterLifecycleError(
        editValidation.code,
        editValidation.message,
      )
    }

    const before = current.assignment
    const [updated] = await tx
      .update(rosterAssignments)
      .set({
        dutyPropertyId: args.dutyPropertyId,
        roleId: args.roleId,
        dutyCode: args.dutyCode,
        shiftTemplateId: template.id,
        scheduledMinutes: template.scheduledMinutes,
        breakMinutes: template.breakMinutes,
        workingMinutes: template.workingMinutes,
        source: 'manual',
        explanation: args.explanation,
        reasonCodes: ['MANUAL_ASSIGNMENT'],
        updatedAt: new Date(),
      })
      .where(eq(rosterAssignments.id, current.assignment.id))
      .returning()
    await tx
      .delete(rosterAssignmentSegments)
      .where(
        eq(rosterAssignmentSegments.assignmentId, current.assignment.id),
      )
      .returning()
    if (segments.length > 0) {
      await tx
        .insert(rosterAssignmentSegments)
        .values(
          segments.map((segment) => ({
            assignmentId: updated.id,
            sortOrder: segment.sortOrder,
            startTime: segment.startTime,
            endTime: segment.endTime,
            endsNextDay: segment.endsNextDay,
          })),
        )
        .returning()
    }

    await tx
      .delete(rosterViolations)
      .where(
        and(
          eq(rosterViolations.cycleId, cycle.id),
          eq(rosterViolations.ruleCode, 'UNCOVERED_DEMAND'),
        ),
      )
      .returning()
    const allAssignments = await tx
      .select()
      .from(rosterAssignments)
      .where(eq(rosterAssignments.cycleId, cycle.id))
    const uncovered = calculateDemand(input).flatMap((demand) => {
      const covered = allAssignments.filter(
        (assignment) =>
          assignment.assignmentDate === demand.date &&
          assignment.dutyPropertyId === demand.propertyId &&
          assignment.roleId === demand.roleId &&
          ['W', 'S'].includes(assignment.dutyCode) &&
          assignment.shiftTemplateId !== null,
      ).length
      if (covered >= demand.requiredActive) return []
      return [
        {
          cycleId: cycle.id,
          ruleCode: 'UNCOVERED_DEMAND',
          severity: 'hard' as const,
          resolution: 'open' as const,
          message: `${demand.requiredActive - covered} required assignment(s) remain uncovered.`,
          propertyId: demand.propertyId,
          violationDate: demand.date,
          evidence: {
            roleId: demand.roleId,
            requiredActive: demand.requiredActive,
            covered,
          },
        },
      ]
    })
    if (uncovered.length > 0) {
      await tx.insert(rosterViolations).values(uncovered).returning()
    }

    const nextVersion = cycle.version + 1
    await tx
      .update(rosterCycles)
      .set({ version: nextVersion, updatedAt: new Date() })
      .where(eq(rosterCycles.id, cycle.id))
      .returning()
    await tx
      .insert(rosterEvents)
      .values({
        cycleId: cycle.id,
        actorId: args.actorId,
        cycleVersion: nextVersion,
        eventType: 'assignment_edited',
        context: { before, after: updated },
      })
      .returning()
    return { assignment: updated, version: nextVersion }
  })
}

export async function overrideRosterViolation(args: {
  orgId: string
  actorId: string
  cycleId: string
  violationId: string
  expectedVersion: number
  reason: string
}) {
  return db.transaction(async (tx) => {
    const [cycle] = await tx
      .select()
      .from(rosterCycles)
      .where(
        and(
          eq(rosterCycles.id, args.cycleId),
          eq(rosterCycles.orgId, args.orgId),
        ),
      )
      .limit(1)
      .for('update')
    if (!cycle) throw new RosterLifecycleError('NOT_FOUND', 'Roster cycle not found.')
    const validation = validateLifecycleVersion(
      cycle.status,
      cycle.version,
      args.expectedVersion,
    )
    if (!validation.ok) {
      throw new RosterLifecycleError(validation.code, validation.message)
    }
    const [violation] = await tx
      .select()
      .from(rosterViolations)
      .where(
        and(
          eq(rosterViolations.id, args.violationId),
          eq(rosterViolations.cycleId, cycle.id),
        ),
      )
      .limit(1)
    if (!violation) {
      throw new RosterLifecycleError('NOT_FOUND', 'Roster violation not found.')
    }
    if (violation.severity !== 'soft' || violation.resolution !== 'open') {
      throw new RosterLifecycleError(
        'VIOLATION_NOT_OVERRIDABLE',
        'Only open soft warnings can be overridden.',
      )
    }
    const nextVersion = cycle.version + 1
    const [updated] = await tx
      .update(rosterViolations)
      .set({
        resolution: 'overridden',
        overrideReason: args.reason,
        resolvedBy: args.actorId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rosterViolations.id, violation.id))
      .returning()
    await tx
      .update(rosterCycles)
      .set({ version: nextVersion, updatedAt: new Date() })
      .where(eq(rosterCycles.id, cycle.id))
      .returning()
    await tx
      .insert(rosterEvents)
      .values({
        cycleId: cycle.id,
        actorId: args.actorId,
        cycleVersion: nextVersion,
        eventType: 'soft_warning_overridden',
        context: {
          violationId: violation.id,
          ruleCode: violation.ruleCode,
          reason: args.reason,
        },
      })
      .returning()
    return { violation: updated, version: nextVersion }
  })
}

export async function submitChildRoster(args: {
  orgId: string
  actorId: string
  accessiblePropertyIds: string[] | null
  cycleId: string
  rosterId: string
  expectedVersion: number
}) {
  return db.transaction(async (tx) => {
    const [cycle] = await tx
      .select()
      .from(rosterCycles)
      .where(
        and(
          eq(rosterCycles.id, args.cycleId),
          eq(rosterCycles.orgId, args.orgId),
        ),
      )
      .limit(1)
      .for('update')
    if (!cycle) throw new RosterLifecycleError('NOT_FOUND', 'Roster cycle not found.')
    const validation = validateLifecycleVersion(
      cycle.status,
      cycle.version,
      args.expectedVersion,
    )
    if (!validation.ok) {
      throw new RosterLifecycleError(validation.code, validation.message)
    }
    const [child] = await tx
      .select()
      .from(rosters)
      .where(
        and(eq(rosters.id, args.rosterId), eq(rosters.cycleId, cycle.id)),
      )
      .limit(1)
    if (!child) throw new RosterLifecycleError('NOT_FOUND', 'Property roster not found.')
    ensurePropertyAccess(args.accessiblePropertyIds, [child.propertyId])

    const blocking = await tx
      .select()
      .from(rosterViolations)
      .where(
        and(
          eq(rosterViolations.cycleId, cycle.id),
          eq(rosterViolations.resolution, 'open'),
        ),
      )
    const childBlocking = blocking.filter(
      (row) => row.propertyId === null || row.propertyId === child.propertyId,
    )
    if (childBlocking.some((row) => row.severity === 'hard')) {
      throw new RosterLifecycleError(
        'OPEN_HARD_VIOLATIONS',
        'Resolve hard violations for this property before submission.',
      )
    }
    if (childBlocking.some((row) => row.severity === 'soft')) {
      throw new RosterLifecycleError(
        'OPEN_SOFT_WARNINGS',
        'Resolve or override soft warnings before submission.',
      )
    }
    await tx
      .update(rosters)
      .set({
        status: 'submitted',
        submittedBy: args.actorId,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rosters.id, child.id))
      .returning()
    const children = await tx
      .select()
      .from(rosters)
      .where(eq(rosters.cycleId, cycle.id))
    const allSubmitted = children.every((row) =>
      row.id === child.id ? true : row.status === 'submitted',
    )
    const nextVersion = cycle.version + 1
    await tx
      .update(rosterCycles)
      .set({
        status: allSubmitted ? 'submitted' : 'draft',
        version: nextVersion,
        submittedBy: allSubmitted ? args.actorId : null,
        submittedAt: allSubmitted ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(rosterCycles.id, cycle.id))
      .returning()
    await tx
      .insert(rosterEvents)
      .values({
        cycleId: cycle.id,
        actorId: args.actorId,
        cycleVersion: nextVersion,
        eventType: 'child_roster_submitted',
        context: { rosterId: child.id, propertyId: child.propertyId, allSubmitted },
      })
      .returning()
    return { version: nextVersion, cycleStatus: allSubmitted ? 'submitted' : 'draft' }
  })
}

export async function rejectSubmittedRosters(args: {
  orgId: string
  actorId: string
  cycleId: string
  expectedVersion: number
  rosterIds: string[]
  comments: string
}) {
  return db.transaction(async (tx) => {
    const [cycle] = await tx
      .select()
      .from(rosterCycles)
      .where(
        and(
          eq(rosterCycles.id, args.cycleId),
          eq(rosterCycles.orgId, args.orgId),
        ),
      )
      .limit(1)
      .for('update')
    if (!cycle) throw new RosterLifecycleError('NOT_FOUND', 'Roster cycle not found.')
    if (cycle.version !== args.expectedVersion) {
      throw new RosterLifecycleError(
        'VERSION_CONFLICT',
        'This roster changed after it was opened. Refresh and try again.',
      )
    }
    if (cycle.status !== 'submitted') {
      throw new RosterLifecycleError(
        'CYCLE_NOT_SUBMITTED',
        'Only a submitted cycle can be rejected.',
      )
    }
    const rejected = await tx
      .update(rosters)
      .set({
        status: 'draft',
        submittedBy: null,
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(rosters.cycleId, cycle.id),
          inArray(rosters.id, args.rosterIds),
        ),
      )
      .returning()
    if (rejected.length !== args.rosterIds.length) {
      throw new RosterLifecycleError('NOT_FOUND', 'One or more property rosters were not found.')
    }
    const nextVersion = cycle.version + 1
    await tx
      .update(rosterCycles)
      .set({
        status: 'draft',
        version: nextVersion,
        submittedBy: null,
        submittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(rosterCycles.id, cycle.id))
      .returning()
    await tx
      .insert(rosterEvents)
      .values({
        cycleId: cycle.id,
        actorId: args.actorId,
        cycleVersion: nextVersion,
        eventType: 'cycle_rejected',
        context: { rosterIds: args.rosterIds, comments: args.comments },
      })
      .returning()
    return { version: nextVersion }
  })
}

export async function publishRosterCycle(args: {
  orgId: string
  actorId: string
  cycleId: string
  expectedVersion: number
}) {
  return db.transaction(async (tx) => {
    const [cycle] = await tx
      .select()
      .from(rosterCycles)
      .where(
        and(
          eq(rosterCycles.id, args.cycleId),
          eq(rosterCycles.orgId, args.orgId),
        ),
      )
      .limit(1)
      .for('update')
    if (!cycle) throw new RosterLifecycleError('NOT_FOUND', 'Roster cycle not found.')
    if (cycle.version !== args.expectedVersion) {
      throw new RosterLifecycleError(
        'VERSION_CONFLICT',
        'This roster changed after it was opened. Refresh and try again.',
      )
    }
    const [children, violations, policyRows] = await Promise.all([
      tx.select().from(rosters).where(eq(rosters.cycleId, cycle.id)),
      tx
        .select()
        .from(rosterViolations)
        .where(eq(rosterViolations.cycleId, cycle.id)),
      tx
        .select()
        .from(rosterPolicyVersions)
        .where(eq(rosterPolicyVersions.id, cycle.policyVersionId))
        .limit(1),
    ])
    const readiness = validatePublicationReadiness({
      cycleStatus: cycle.status,
      childStatuses: children.map((row) => row.status),
      openHardViolations: violations.filter(
        (row) => row.severity === 'hard' && row.resolution === 'open',
      ).length,
      openSoftViolations: violations.filter(
        (row) => row.severity === 'soft' && row.resolution === 'open',
      ).length,
      policyStatus: policyRows[0]?.status ?? 'draft',
    })
    if (!readiness.ok) {
      throw new RosterLifecycleError(readiness.code, readiness.message)
    }
    const now = new Date()
    const nextVersion = cycle.version + 1
    await tx
      .update(rosterCycles)
      .set({
        status: 'superseded',
        updatedAt: now,
      })
      .where(
        and(
          eq(rosterCycles.orgId, args.orgId),
          eq(rosterCycles.hubId, cycle.hubId),
          eq(rosterCycles.month, cycle.month),
          eq(rosterCycles.status, 'published'),
        ),
      )
      .returning()
    await tx
      .update(rosterCycles)
      .set({
        status: 'published',
        version: nextVersion,
        publishedBy: args.actorId,
        publishedAt: now,
        updatedAt: now,
      })
      .where(eq(rosterCycles.id, cycle.id))
      .returning()
    await tx
      .insert(rosterEvents)
      .values({
        cycleId: cycle.id,
        actorId: args.actorId,
        cycleVersion: nextVersion,
        eventType: 'cycle_published',
        context: { revision: cycle.revision, publishedAt: now.toISOString() },
      })
      .returning()

    const linkedProfiles = await tx
      .selectDistinct({ profileId: rosterEmployees.profileId })
      .from(rosterParticipants)
      .innerJoin(
        rosterEmployees,
        eq(rosterEmployees.id, rosterParticipants.employeeId),
      )
      .where(eq(rosterParticipants.cycleId, cycle.id))
    const profileIds = linkedProfiles
      .map((row) => row.profileId)
      .filter((profileId): profileId is string => profileId !== null)
    if (profileIds.length > 0) {
      await tx
        .insert(notifications)
        .values(
          profileIds.map((profileId) => ({
            orgId: args.orgId,
            profileId,
            type: 'roster_published',
            title: `Your ${cycle.month.slice(0, 7)} roster is published`,
            body: `Revision ${cycle.revision} is now available in My Roster.`,
            linkUrl: '/my-roster',
            channel: 'in_app',
            sentAt: now,
          })),
        )
        .returning()
    }

    return { version: nextVersion, status: 'published' as const }
  })
}

export async function createRosterRevision(args: {
  orgId: string
  actorId: string
  cycleId: string
  expectedVersion: number
}) {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(rosterCycles)
      .where(
        and(
          eq(rosterCycles.id, args.cycleId),
          eq(rosterCycles.orgId, args.orgId),
        ),
      )
      .limit(1)
      .for('update')
    if (!source) {
      throw new RosterLifecycleError('NOT_FOUND', 'Roster cycle not found.')
    }

    const [latest] = await tx
      .select({ revision: rosterCycles.revision })
      .from(rosterCycles)
      .where(
        and(
          eq(rosterCycles.orgId, args.orgId),
          eq(rosterCycles.hubId, source.hubId),
          eq(rosterCycles.month, source.month),
        ),
      )
      .orderBy(desc(rosterCycles.revision))
      .limit(1)
      .for('update')
    const validation = validateRevisionCreation(
      source.status,
      source.version,
      args.expectedVersion,
      source.revision,
      latest?.revision ?? source.revision,
    )
    if (!validation.ok) {
      throw new RosterLifecycleError(validation.code, validation.message)
    }

    const [sourceChildren, snapshot, sourceParticipants, sourceAssignments] =
      await Promise.all([
        tx.select().from(rosters).where(eq(rosters.cycleId, source.id)),
        tx
          .select()
          .from(rosterInputSnapshots)
          .where(eq(rosterInputSnapshots.cycleId, source.id))
          .limit(1),
        tx
          .select()
          .from(rosterParticipants)
          .where(eq(rosterParticipants.cycleId, source.id)),
        tx
          .select()
          .from(rosterAssignments)
          .where(eq(rosterAssignments.cycleId, source.id)),
      ])
    if (!snapshot[0]) {
      throw new RosterLifecycleError(
        'SNAPSHOT_MISSING',
        'The published roster has no frozen input snapshot.',
      )
    }

    const sourceAssignmentIds = sourceAssignments.map((row) => row.id)
    const [sourceSegments, sourceViolations] = await Promise.all([
      sourceAssignmentIds.length
        ? tx
            .select()
            .from(rosterAssignmentSegments)
            .where(
              inArray(
                rosterAssignmentSegments.assignmentId,
                sourceAssignmentIds,
              ),
            )
        : Promise.resolve([]),
      tx
        .select()
        .from(rosterViolations)
        .where(eq(rosterViolations.cycleId, source.id)),
    ])

    const [cycle] = await tx
      .insert(rosterCycles)
      .values({
        orgId: source.orgId,
        hubId: source.hubId,
        month: source.month,
        revision: source.revision + 1,
        status: 'draft',
        policyVersionId: source.policyVersionId,
        version: 1,
        createdBy: args.actorId,
      })
      .returning()
    if (sourceChildren.length > 0) {
      await tx
        .insert(rosters)
        .values(
          sourceChildren.map((child) => ({
            cycleId: cycle.id,
            propertyId: child.propertyId,
            status: 'draft' as const,
          })),
        )
        .returning()
    }
    await tx
      .insert(rosterInputSnapshots)
      .values({
        cycleId: cycle.id,
        checksum: snapshot[0].checksum,
        normalizedInput: snapshot[0].normalizedInput,
      })
      .returning()

    const copiedParticipants = sourceParticipants.length
      ? await tx
          .insert(rosterParticipants)
          .values(
            sourceParticipants.map((participant) => ({
              cycleId: cycle.id,
              employeeId: participant.employeeId,
              employeeNumber: participant.employeeNumber,
              fullName: participant.fullName,
              basePropertyId: participant.basePropertyId,
              primaryRoleId: participant.primaryRoleId,
              roleCode: participant.roleCode,
              departmentCode: participant.departmentCode,
              laborTier: participant.laborTier,
              residencyType: participant.residencyType,
              skillCodes: participant.skillCodes,
            })),
          )
          .returning({
            id: rosterParticipants.id,
            employeeNumber: rosterParticipants.employeeNumber,
          })
      : []
    const participantIdByNumber = new Map(
      copiedParticipants.map((row) => [row.employeeNumber, row.id]),
    )
    const sourceParticipantById = new Map(
      sourceParticipants.map((row) => [row.id, row]),
    )

    const copiedAssignments = sourceAssignments.length
      ? await tx
          .insert(rosterAssignments)
          .values(
            sourceAssignments.map((assignment) => ({
              cycleId: cycle.id,
              participantId: participantIdByNumber.get(
                sourceParticipantById.get(assignment.participantId)!
                  .employeeNumber,
              )!,
              assignmentDate: assignment.assignmentDate,
              dutyCode: assignment.dutyCode,
              dutyPropertyId: assignment.dutyPropertyId,
              roleId: assignment.roleId,
              shiftTemplateId: assignment.shiftTemplateId,
              scheduledMinutes: assignment.scheduledMinutes,
              breakMinutes: assignment.breakMinutes,
              workingMinutes: assignment.workingMinutes,
              source: assignment.source,
              explanation: assignment.explanation,
              reasonCodes: assignment.reasonCodes,
            })),
          )
          .returning({
            id: rosterAssignments.id,
            participantId: rosterAssignments.participantId,
            assignmentDate: rosterAssignments.assignmentDate,
          })
      : []
    const assignmentIdByParticipantDate = new Map(
      copiedAssignments.map((row) => [
        `${row.participantId}/${row.assignmentDate}`,
        row.id,
      ]),
    )
    if (sourceSegments.length > 0) {
      const sourceAssignmentById = new Map(
        sourceAssignments.map((row) => [row.id, row]),
      )
      await tx
        .insert(rosterAssignmentSegments)
        .values(
          sourceSegments.map((segment) => {
            const sourceAssignment = sourceAssignmentById.get(
              segment.assignmentId,
            )!
            const sourceParticipant = sourceParticipantById.get(
              sourceAssignment.participantId,
            )!
            const participantId = participantIdByNumber.get(
              sourceParticipant.employeeNumber,
            )!
            return {
              assignmentId: assignmentIdByParticipantDate.get(
                `${participantId}/${sourceAssignment.assignmentDate}`,
              )!,
              sortOrder: segment.sortOrder,
              startTime: segment.startTime,
              endTime: segment.endTime,
              endsNextDay: segment.endsNextDay,
            }
          }),
        )
        .returning()
    }

    const participantIdByOldId = new Map(
      sourceParticipants.map((participant) => [
        participant.id,
        participantIdByNumber.get(participant.employeeNumber)!,
      ]),
    )
    const copiedWarnings = sourceViolations.filter(
      (violation) =>
        violation.severity === 'soft' && violation.resolution === 'overridden',
    )
    if (copiedWarnings.length > 0) {
      await tx
        .insert(rosterViolations)
        .values(
          copiedWarnings.map((violation) => ({
            cycleId: cycle.id,
            ruleCode: violation.ruleCode,
            severity: violation.severity,
            resolution: 'open' as const,
            message: violation.message,
            participantId: violation.participantId
              ? participantIdByOldId.get(violation.participantId)
              : null,
            propertyId: violation.propertyId,
            violationDate: violation.violationDate,
            evidence: violation.evidence,
          })),
        )
        .returning()
    }

    await tx
      .insert(rosterEvents)
      .values({
        cycleId: cycle.id,
        actorId: args.actorId,
        cycleVersion: 1,
        eventType: 'revision_created',
        context: {
          sourceCycleId: source.id,
          sourceRevision: source.revision,
          copiedAssignmentCount: sourceAssignments.length,
          reopenedWarningCount: copiedWarnings.length,
        },
      })
      .returning()

    return { cycleId: cycle.id, revision: cycle.revision, version: cycle.version }
  })
}
