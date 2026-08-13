import { and, asc, desc, eq, inArray } from 'drizzle-orm'

import { calculateDemand } from '../../rostering/demand'
import type { GenerationInput } from '../../rostering/types'
import { db } from '..'
import {
  properties,
  rosterAssignments,
  rosterAssignmentSegments,
  rosterCycles,
  rosterHubs,
  rosterInputSnapshots,
  rosterParticipants,
  rosters,
  rosterViolations,
} from '../schema'

export async function listCycles(
  orgId: string,
  accessiblePropertyIds: string[] | null,
) {
  if (accessiblePropertyIds?.length === 0) return []

  const cycleRows = await db
    .selectDistinct({
      id: rosterCycles.id,
      hubId: rosterCycles.hubId,
      hubName: rosterHubs.name,
      month: rosterCycles.month,
      revision: rosterCycles.revision,
      status: rosterCycles.status,
      version: rosterCycles.version,
      createdAt: rosterCycles.createdAt,
      updatedAt: rosterCycles.updatedAt,
    })
    .from(rosterCycles)
    .innerJoin(rosterHubs, eq(rosterHubs.id, rosterCycles.hubId))
    .innerJoin(rosters, eq(rosters.cycleId, rosterCycles.id))
    .where(
      accessiblePropertyIds === null
        ? eq(rosterCycles.orgId, orgId)
        : and(
            eq(rosterCycles.orgId, orgId),
            inArray(rosters.propertyId, accessiblePropertyIds),
          ),
    )
    .orderBy(desc(rosterCycles.month), desc(rosterCycles.revision))

  if (cycleRows.length === 0) return []
  const cycleIds = cycleRows.map((row) => row.id)
  const [childRows, violationRows] = await Promise.all([
    db
      .select({
        cycleId: rosters.cycleId,
        propertyId: rosters.propertyId,
        propertyName: properties.name,
        status: rosters.status,
      })
      .from(rosters)
      .innerJoin(properties, eq(properties.id, rosters.propertyId))
      .where(inArray(rosters.cycleId, cycleIds))
      .orderBy(asc(properties.name)),
    db
      .select({
        cycleId: rosterViolations.cycleId,
        severity: rosterViolations.severity,
        resolution: rosterViolations.resolution,
      })
      .from(rosterViolations)
      .where(inArray(rosterViolations.cycleId, cycleIds)),
  ])

  return cycleRows.map((cycle) => ({
    ...cycle,
    properties: childRows.filter((row) => row.cycleId === cycle.id),
    openHardViolations: violationRows.filter(
      (row) =>
        row.cycleId === cycle.id &&
        row.severity === 'hard' &&
        row.resolution === 'open',
    ).length,
    openSoftViolations: violationRows.filter(
      (row) =>
        row.cycleId === cycle.id &&
        row.severity === 'soft' &&
        row.resolution === 'open',
    ).length,
  }))
}

export async function getCyclePreview(orgId: string, cycleId: string) {
  const [cycle] = await db
    .select({
      id: rosterCycles.id,
      orgId: rosterCycles.orgId,
      hubId: rosterCycles.hubId,
      hubName: rosterHubs.name,
      month: rosterCycles.month,
      revision: rosterCycles.revision,
      status: rosterCycles.status,
      version: rosterCycles.version,
      policyVersionId: rosterCycles.policyVersionId,
      createdAt: rosterCycles.createdAt,
      updatedAt: rosterCycles.updatedAt,
    })
    .from(rosterCycles)
    .innerJoin(rosterHubs, eq(rosterHubs.id, rosterCycles.hubId))
    .where(and(eq(rosterCycles.id, cycleId), eq(rosterCycles.orgId, orgId)))
    .limit(1)
  if (!cycle) return null

  const [children, participants, assignments, violations, snapshots] =
    await Promise.all([
      db
        .select({
          id: rosters.id,
          propertyId: rosters.propertyId,
          propertyName: properties.name,
          status: rosters.status,
          submittedAt: rosters.submittedAt,
        })
        .from(rosters)
        .innerJoin(properties, eq(properties.id, rosters.propertyId))
        .where(eq(rosters.cycleId, cycleId))
        .orderBy(asc(properties.name)),
      db
        .select()
        .from(rosterParticipants)
        .where(eq(rosterParticipants.cycleId, cycleId))
        .orderBy(asc(rosterParticipants.employeeNumber)),
      db
        .select()
        .from(rosterAssignments)
        .where(eq(rosterAssignments.cycleId, cycleId))
        .orderBy(
          asc(rosterAssignments.participantId),
          asc(rosterAssignments.assignmentDate),
        ),
      db
        .select()
        .from(rosterViolations)
        .where(eq(rosterViolations.cycleId, cycleId))
        .orderBy(
          asc(rosterViolations.severity),
          asc(rosterViolations.ruleCode),
          asc(rosterViolations.violationDate),
        ),
      db
        .select()
        .from(rosterInputSnapshots)
        .where(eq(rosterInputSnapshots.cycleId, cycleId))
        .limit(1),
    ])

  const assignmentIds = assignments.map((row) => row.id)
  const segments = assignmentIds.length
    ? await db
        .select()
        .from(rosterAssignmentSegments)
        .where(inArray(rosterAssignmentSegments.assignmentId, assignmentIds))
        .orderBy(
          asc(rosterAssignmentSegments.assignmentId),
          asc(rosterAssignmentSegments.sortOrder),
        )
    : []
  const snapshot = snapshots[0]
  const input = snapshot?.normalizedInput as GenerationInput | undefined
  const demandCoverage = (input ? calculateDemand(input) : []).map((demand) => ({
      ...demand,
      assigned: assignments.filter(
        (assignment) =>
          assignment.dutyPropertyId === demand.propertyId &&
          assignment.assignmentDate === demand.date &&
          assignment.roleId === demand.roleId &&
          ['W', 'S'].includes(assignment.dutyCode) &&
          assignment.shiftTemplateId !== null,
      ).length,
    }))

  return {
    cycle,
    children,
    participants,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      segments: segments.filter(
        (segment) => segment.assignmentId === assignment.id,
      ),
    })),
    violations,
    inputChecksum: snapshot?.checksum ?? null,
    demandCoverage,
    editOptions: input
      ? {
          properties: input.properties.map(({ id, name, kind }) => ({
            id,
            name,
            kind,
          })),
          roles: input.roles.map(({ id, code, name }) => ({ id, code, name })),
          shiftTemplates: input.shiftTemplates.map(
            ({ id, code, roleId, workingMinutes, segments: templateSegments }) => ({
              id,
              code,
              roleId,
              workingMinutes,
              segments: templateSegments,
            }),
          ),
          employeeSkills: Object.fromEntries(
            input.employees.map((employee) => [
              employee.id,
              employee.skillRoleIds,
            ]),
          ),
        }
      : null,
  }
}
