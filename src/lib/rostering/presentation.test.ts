import { describe, expect, it } from 'vitest'

import {
  buildDayInspection,
  buildMatrixRows,
  dutyLabel,
  formatMinutes,
  formatSegment,
  groupViolations,
} from './presentation'

const participant = {
  id: 'participant-1',
  employeeNumber: 'E-001',
  fullName: 'Kasun Perera',
  basePropertyId: 'hub',
  primaryRoleId: 'night',
  roleCode: 'NIGHT_AUDITOR',
  departmentCode: 'FRONT_OFFICE',
  laborTier: 'fixed' as const,
  residencyType: 'resident' as const,
  skillCodes: ['NIGHT_AUDITOR'],
}

const assignment = {
  id: 'assignment-1',
  participantId: participant.id,
  assignmentDate: '2026-09-01',
  dutyCode: 'W',
  dutyPropertyId: 'hub',
  roleId: 'night',
  shiftTemplateId: 'night-template',
  scheduledMinutes: 540,
  breakMinutes: 60,
  workingMinutes: 480,
  explanation: 'Dedicated overnight coverage',
  reasonCodes: ['NIGHT_COVERAGE'],
  segments: [
    {
      id: 'segment-1',
      assignmentId: 'assignment-1',
      sortOrder: 0,
      startTime: '22:00:00',
      endTime: '07:00:00',
      endsNextDay: true,
    },
  ],
}

describe('rostering presentation', () => {
  it('formats duty labels, overnight segments, and minute totals', () => {
    expect(dutyLabel('S')).toBe('Spoke duty')
    expect(dutyLabel('AL')).toBe('Annual leave')
    expect(formatSegment(assignment.segments[0])).toBe('22:00–07:00 (+1)')
    expect(formatMinutes(480, 60)).toBe('8h working · 1h break')
  })

  it('builds date-keyed matrix rows and filters by property group', () => {
    const second = {
      ...participant,
      id: 'participant-2',
      employeeNumber: 'E-002',
      fullName: 'Nimali Silva',
      basePropertyId: 'spoke',
    }
    const rows = buildMatrixRows(
      [participant, second],
      [
        assignment,
        {
          ...assignment,
          id: 'assignment-2',
          participantId: second.id,
          dutyPropertyId: 'spoke',
        },
      ],
      { propertyId: 'spoke' },
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].participant.fullName).toBe('Nimali Silva')
    expect(rows[0].assignmentsByDate['2026-09-01']?.id).toBe('assignment-2')
  })

  it('builds selected-day inspection with scoped and grouped violations', () => {
    const violations = [
      {
        id: 'violation-1',
        ruleCode: 'WEEKLY_LIMIT',
        severity: 'hard' as const,
        resolution: 'open' as const,
        message: 'Weekly minutes exceeded',
        participantId: participant.id,
        propertyId: 'hub',
        violationDate: '2026-09-01',
        evidence: { minutes: 3120 },
      },
      {
        id: 'violation-2',
        ruleCode: 'MIX',
        severity: 'soft' as const,
        resolution: 'open' as const,
        message: 'Residency mix differs',
        participantId: null,
        propertyId: null,
        violationDate: null,
        evidence: {},
      },
    ]
    const inspection = buildDayInspection(
      participant,
      assignment,
      violations,
    )
    const grouped = groupViolations(violations)

    expect(inspection?.violations).toHaveLength(1)
    expect(inspection?.timeSummary).toBe('8h working · 1h break')
    expect(grouped.hard).toHaveLength(1)
    expect(grouped.soft).toHaveLength(1)
  })
})
