import { createHash } from 'node:crypto'

import { and, desc, eq, inArray } from 'drizzle-orm'

import { db } from '../db'
import { buildGenerationInput } from '../db/queries/rostering-setup'
import {
  rosterAssignments,
  rosterAssignmentSegments,
  rosterCycles,
  rosterEvents,
  rosterInputSnapshots,
  rosterParticipants,
  rosters,
  rosterViolations,
} from '../db/schema'
import { generateRoster } from './engine'

export interface GenerateAndSaveDraftArgs {
  orgId: string
  hubId: string
  month: string
  actorId: string
}

function inputChecksum(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

export async function generateAndSaveDraft({
  orgId,
  hubId,
  month,
  actorId,
}: GenerateAndSaveDraftArgs): Promise<{ cycleId: string; revision: number }> {
  const input = await buildGenerationInput(orgId, hubId, month)
  const result = generateRoster(input)
  const checksum = inputChecksum(input)

  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select()
      .from(rosterCycles)
      .where(
        and(
          eq(rosterCycles.orgId, orgId),
          eq(rosterCycles.hubId, hubId),
          eq(rosterCycles.month, month),
        ),
      )
      .orderBy(desc(rosterCycles.revision))
      .limit(1)
      .for('update')

    if (latest && latest.status !== 'draft') {
      throw new Error(
        latest.status === 'published' || latest.status === 'superseded'
          ? 'Published roster cycles require a new revision'
          : 'Only draft roster cycles can be regenerated',
      )
    }

    const [cycle] = latest
      ? await tx
          .update(rosterCycles)
          .set({
            policyVersionId: input.policy.id,
            version: latest.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(rosterCycles.id, latest.id))
          .returning()
      : await tx
          .insert(rosterCycles)
          .values({
            orgId,
            hubId,
            month,
            revision: 1,
            status: 'draft',
            policyVersionId: input.policy.id,
            version: 1,
            createdBy: actorId,
          })
          .returning()

    const oldAssignments = await tx
      .select({ id: rosterAssignments.id })
      .from(rosterAssignments)
      .where(eq(rosterAssignments.cycleId, cycle.id))
    if (oldAssignments.length > 0) {
      await tx
        .delete(rosterAssignmentSegments)
        .where(
          inArray(
            rosterAssignmentSegments.assignmentId,
            oldAssignments.map((row) => row.id),
          ),
        )
        .returning()
    }
    await tx
      .delete(rosterViolations)
      .where(eq(rosterViolations.cycleId, cycle.id))
      .returning()
    await tx
      .delete(rosterAssignments)
      .where(eq(rosterAssignments.cycleId, cycle.id))
      .returning()
    await tx
      .delete(rosterParticipants)
      .where(eq(rosterParticipants.cycleId, cycle.id))
      .returning()
    await tx
      .delete(rosterInputSnapshots)
      .where(eq(rosterInputSnapshots.cycleId, cycle.id))
      .returning()
    await tx.delete(rosters).where(eq(rosters.cycleId, cycle.id)).returning()

    await tx
      .insert(rosters)
      .values(
        input.properties.map((property) => ({
          cycleId: cycle.id,
          propertyId: property.id,
          status: 'draft' as const,
        })),
      )
      .returning()
    await tx
      .insert(rosterInputSnapshots)
      .values({ cycleId: cycle.id, checksum, normalizedInput: input })
      .returning()

    const roleById = new Map(input.roles.map((role) => [role.id, role]))
    const employeeById = new Map(
      input.employees.map((employee) => [employee.id, employee]),
    )
    const participantRows = input.employees.length
      ? await tx
          .insert(rosterParticipants)
          .values(
            input.employees.map((employee) => {
              const role = roleById.get(employee.roleId)!
              return {
                cycleId: cycle.id,
                employeeId: employee.id,
                employeeNumber: employee.employeeNumber,
                fullName: employee.fullName,
                basePropertyId: employee.basePropertyId,
                primaryRoleId: employee.roleId,
                roleCode: role.code,
                departmentCode: role.departmentCode,
                laborTier: role.laborTier,
                residencyType: employee.residencyType,
                skillCodes: employee.skillRoleIds.map(
                  (roleId) => roleById.get(roleId)?.code ?? roleId,
                ),
              }
            }),
          )
          .returning({
            id: rosterParticipants.id,
            employeeId: rosterParticipants.employeeId,
          })
      : []
    const participantByEmployee = new Map(
      participantRows
        .filter((row): row is typeof row & { employeeId: string } => row.employeeId !== null)
        .map((row) => [row.employeeId, row.id]),
    )

    const assignmentRows = result.assignments.length
      ? await tx
          .insert(rosterAssignments)
          .values(
            result.assignments.map((assignment) => ({
              cycleId: cycle.id,
              participantId: participantByEmployee.get(assignment.employeeId)!,
              assignmentDate: assignment.date,
              dutyCode: assignment.dutyCode,
              dutyPropertyId: assignment.dutyPropertyId,
              roleId: assignment.roleId,
              shiftTemplateId: assignment.shiftTemplateId,
              scheduledMinutes: assignment.scheduledMinutes,
              breakMinutes: assignment.breakMinutes,
              workingMinutes: assignment.workingMinutes,
              source: 'generated' as const,
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
      assignmentRows.map((row) => [
        `${row.participantId}/${row.assignmentDate}`,
        row.id,
      ]),
    )
    const segmentValues = result.assignments.flatMap((assignment) => {
      const participantId = participantByEmployee.get(assignment.employeeId)!
      const assignmentId = assignmentIdByParticipantDate.get(
        `${participantId}/${assignment.date}`,
      )!
      return assignment.segments.map((segment) => ({
        assignmentId,
        sortOrder: segment.sortOrder,
        startTime: segment.startTime,
        endTime: segment.endTime,
        endsNextDay: segment.endsNextDay,
      }))
    })
    if (segmentValues.length > 0) {
      await tx
        .insert(rosterAssignmentSegments)
        .values(segmentValues)
        .returning()
    }

    if (result.violations.length > 0) {
      await tx
        .insert(rosterViolations)
        .values(
          result.violations.map((item) => ({
            cycleId: cycle.id,
            ruleCode: item.ruleCode,
            severity: item.severity,
            resolution: 'open' as const,
            message: item.message,
            participantId: item.employeeId
              ? participantByEmployee.get(item.employeeId)
              : null,
            propertyId: item.propertyId,
            violationDate: item.date,
            evidence: item.evidence,
          })),
        )
        .returning()
    }

    await tx
      .insert(rosterEvents)
      .values({
        cycleId: cycle.id,
        actorId,
        cycleVersion: cycle.version,
        eventType: latest ? 'draft_regenerated' : 'draft_generated',
        context: {
          inputChecksum: checksum,
          assignmentCount: result.assignments.length,
          hardViolationCount: result.violations.filter(
            (item) => item.severity === 'hard',
          ).length,
          softViolationCount: result.violations.filter(
            (item) => item.severity === 'soft',
          ).length,
          employeeCount: employeeById.size,
        },
      })
      .returning()

    return { cycleId: cycle.id, revision: cycle.revision }
  })
}
