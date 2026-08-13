import { and, asc, desc, eq } from 'drizzle-orm'

import { db } from '..'
import {
  properties,
  rosterAssignments,
  rosterAssignmentSegments,
  rosterCycles,
  rosterEmployees,
  rosterHubs,
  rosterParticipants,
  rosterRoles,
  rosterShiftTemplates,
} from '../schema'

export async function getMyPublishedRoster(
  orgId: string,
  profileId: string,
) {
  const [published] = await db
    .select({
      cycleId: rosterCycles.id,
      hubName: rosterHubs.name,
      month: rosterCycles.month,
      revision: rosterCycles.revision,
      publishedAt: rosterCycles.publishedAt,
      participantId: rosterParticipants.id,
      employeeNumber: rosterParticipants.employeeNumber,
      fullName: rosterParticipants.fullName,
      roleCode: rosterParticipants.roleCode,
    })
    .from(rosterCycles)
    .innerJoin(rosterHubs, eq(rosterHubs.id, rosterCycles.hubId))
    .innerJoin(
      rosterParticipants,
      eq(rosterParticipants.cycleId, rosterCycles.id),
    )
    .innerJoin(
      rosterEmployees,
      eq(rosterEmployees.id, rosterParticipants.employeeId),
    )
    .where(
      and(
        eq(rosterCycles.orgId, orgId),
        eq(rosterCycles.status, 'published'),
        eq(rosterEmployees.profileId, profileId),
      ),
    )
    .orderBy(desc(rosterCycles.month), desc(rosterCycles.revision))
    .limit(1)

  if (!published) return null

  const assignments = await db
    .select({
      id: rosterAssignments.id,
      assignmentDate: rosterAssignments.assignmentDate,
      dutyCode: rosterAssignments.dutyCode,
      propertyName: properties.name,
      roleName: rosterRoles.name,
      roleCode: rosterRoles.code,
      shiftCode: rosterShiftTemplates.code,
      scheduledMinutes: rosterAssignments.scheduledMinutes,
      breakMinutes: rosterAssignments.breakMinutes,
      workingMinutes: rosterAssignments.workingMinutes,
      explanation: rosterAssignments.explanation,
    })
    .from(rosterAssignments)
    .innerJoin(
      properties,
      eq(properties.id, rosterAssignments.dutyPropertyId),
    )
    .innerJoin(rosterRoles, eq(rosterRoles.id, rosterAssignments.roleId))
    .leftJoin(
      rosterShiftTemplates,
      eq(rosterShiftTemplates.id, rosterAssignments.shiftTemplateId),
    )
    .where(
      and(
        eq(rosterAssignments.cycleId, published.cycleId),
        eq(rosterAssignments.participantId, published.participantId),
      ),
    )
    .orderBy(asc(rosterAssignments.assignmentDate))

  const allSegments = await db
    .select({
      assignmentId: rosterAssignmentSegments.assignmentId,
      sortOrder: rosterAssignmentSegments.sortOrder,
      startTime: rosterAssignmentSegments.startTime,
      endTime: rosterAssignmentSegments.endTime,
      endsNextDay: rosterAssignmentSegments.endsNextDay,
    })
    .from(rosterAssignmentSegments)
    .innerJoin(
      rosterAssignments,
      and(
        eq(rosterAssignments.id, rosterAssignmentSegments.assignmentId),
        eq(rosterAssignments.cycleId, published.cycleId),
        eq(rosterAssignments.participantId, published.participantId),
      ),
    )
    .orderBy(
      asc(rosterAssignmentSegments.assignmentId),
      asc(rosterAssignmentSegments.sortOrder),
    )
  return {
    ...published,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      segments: allSegments.filter(
        (segment) => segment.assignmentId === assignment.id,
      ),
    })),
  }
}
