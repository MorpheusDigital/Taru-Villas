import { NextResponse } from 'next/server'

import { getProfile } from '@/lib/auth/guards'
import { getMyPublishedRoster } from '@/lib/db/queries/rostering-self'
import { buildPersonalRosterCsv } from '@/lib/rostering/exports'

export async function GET() {
  const profile = await getProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!profile.isActive) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const roster = await getMyPublishedRoster(profile.orgId, profile.id)
  if (!roster) {
    return NextResponse.json(
      { error: 'No published roster found' },
      { status: 404 },
    )
  }

  const csv = buildPersonalRosterCsv(
    roster.assignments.map((assignment) => ({
      date: assignment.assignmentDate,
      dutyCode: assignment.dutyCode,
      propertyName: assignment.propertyName,
      roleName: assignment.roleName,
      shiftCode: assignment.shiftCode ?? '',
      shiftTimes: assignment.segments
        .map(
          (segment) =>
            `${segment.startTime.slice(0, 5)}-${segment.endTime.slice(0, 5)}${segment.endsNextDay ? '+1' : ''}`,
        )
        .join(' / '),
      workingMinutes: assignment.workingMinutes,
      explanation: assignment.explanation,
    })),
  )

  return new Response(`\uFEFF${csv}`, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="my-roster-${roster.month.slice(0, 7)}-r${roster.revision}.csv"`,
      'Content-Type': 'text/csv; charset=utf-8',
    },
  })
}
