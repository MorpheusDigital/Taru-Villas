import { NextResponse } from 'next/server'

import { getProfile } from '@/lib/auth/guards'
import { getCyclePreview } from '@/lib/db/queries/rostering-cycles'
import {
  canViewManagementCycle,
  getRosteringAccess,
} from '@/lib/rostering/access'
import { buildManagementRosterCsv } from '@/lib/rostering/exports'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!profile.isActive || profile.role === 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const [access, preview] = await Promise.all([
    getRosteringAccess(profile.id, profile.role, profile.orgId),
    getCyclePreview(profile.orgId, id),
  ])
  if (
    !preview ||
    !canViewManagementCycle(
      access,
      preview.children.map((child) => child.propertyId),
    )
  ) {
    return NextResponse.json({ error: 'Roster cycle not found' }, { status: 404 })
  }

  const participantById = new Map(
    preview.participants.map((participant) => [participant.id, participant]),
  )
  const propertyById = new Map(
    preview.editOptions?.properties.map((property) => [property.id, property]) ??
      preview.children.map((child) => [
        child.propertyId,
        { id: child.propertyId, name: child.propertyName },
      ]),
  )
  const roleById = new Map(
    preview.editOptions?.roles.map((role) => [role.id, role]) ?? [],
  )
  const templateById = new Map(
    preview.editOptions?.shiftTemplates.map((template) => [
      template.id,
      template,
    ]) ?? [],
  )
  const assignments = preview.assignments.filter(
    (assignment) =>
      access.propertyIds === null ||
      access.propertyIds.includes(assignment.dutyPropertyId),
  )
  const csv = buildManagementRosterCsv(
    assignments.map((assignment) => {
      const participant = participantById.get(assignment.participantId)
      return {
        employeeNumber: participant?.employeeNumber ?? '',
        employeeName: participant?.fullName ?? '',
        date: assignment.assignmentDate,
        dutyCode: assignment.dutyCode,
        propertyName:
          propertyById.get(assignment.dutyPropertyId)?.name ??
          assignment.dutyPropertyId,
        roleName:
          roleById.get(assignment.roleId)?.name ?? participant?.roleCode ?? '',
        shiftCode: assignment.shiftTemplateId
          ? (templateById.get(assignment.shiftTemplateId)?.code ?? '')
          : '',
        shiftTimes: assignment.segments
          .map(
            (segment) =>
              `${segment.startTime.slice(0, 5)}-${segment.endTime.slice(0, 5)}${segment.endsNextDay ? '+1' : ''}`,
          )
          .join(' / '),
        workingMinutes: assignment.workingMinutes,
        explanation: assignment.explanation,
      }
    }),
  )

  return new Response(`\uFEFF${csv}`, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${preview.cycle.hubName.replaceAll('"', '')}-${preview.cycle.month.slice(0, 7)}-r${preview.cycle.revision}.csv"`,
      'Content-Type': 'text/csv; charset=utf-8',
    },
  })
}
