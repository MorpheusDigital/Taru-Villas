import { describe, expect, it } from 'vitest'

import {
  validateAssignmentEdit,
  validateLifecycleVersion,
  validatePublicationReadiness,
  validateRevisionCreation,
} from './lifecycle'

const context = {
  cycleStatus: 'draft' as const,
  cycleVersion: 4,
  expectedVersion: 4,
  participantId: 'participant-1',
  employeeId: 'employee-1',
  date: '2026-09-01',
  dutyPropertyId: 'spoke',
  roleId: 'waiter',
  shiftTemplateId: 'waiter-morning',
  dutyCode: 'W',
  hubPropertyIds: ['hub', 'spoke'],
  skillRoleIds: ['waiter'],
  unavailability: [] as Array<{ startDate: string; endDate: string }>,
  residencyType: 'resident' as const,
  template: {
    roleId: 'waiter',
    workingMinutes: 480,
    segments: [{ startTime: '07:00', endTime: '16:00', endsNextDay: false }],
  },
  transportCutoff: '19:00',
  existingAssignmentParticipantIds: [] as string[],
  currentWeekMinutes: 1_920,
  maxWeekMinutes: 3_000,
  priorWorkingMinutes: 480,
}

describe('rostering lifecycle validation', () => {
  it('rejects non-draft mutation and stale expected versions', () => {
    expect(validateLifecycleVersion('published', 4, 4)).toEqual(
      expect.objectContaining({ ok: false, code: 'CYCLE_NOT_EDITABLE' }),
    )
    expect(validateLifecycleVersion('draft', 5, 4)).toEqual(
      expect.objectContaining({ ok: false, code: 'VERSION_CONFLICT' }),
    )
  })

  it('accepts an available qualified same-hub assignment', () => {
    expect(validateAssignmentEdit(context)).toEqual({ ok: true })
  })

  it('rejects cross-hub, unqualified, unavailable, and double-booked assignments', () => {
    expect(
      validateAssignmentEdit({ ...context, dutyPropertyId: 'other-hub' }),
    ).toEqual(expect.objectContaining({ ok: false, code: 'PROPERTY_OUTSIDE_HUB' }))
    expect(validateAssignmentEdit({ ...context, roleId: 'chef' })).toEqual(
      expect.objectContaining({ ok: false, code: 'ROLE_NOT_QUALIFIED' }),
    )
    expect(
      validateAssignmentEdit({
        ...context,
        unavailability: [{ startDate: '2026-09-01', endDate: '2026-09-03' }],
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: 'APPROVED_UNAVAILABILITY' }))
    expect(
      validateAssignmentEdit({
        ...context,
        existingAssignmentParticipantIds: ['participant-1'],
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: 'DOUBLE_BOOKED' }))
  })

  it('rejects commuter split/cutoff and weekly minute overflow', () => {
    expect(
      validateAssignmentEdit({
        ...context,
        residencyType: 'commuter',
        template: {
          ...context.template,
          segments: [
            { startTime: '07:00', endTime: '12:00', endsNextDay: false },
            { startTime: '18:00', endTime: '22:00', endsNextDay: false },
          ],
        },
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: 'COMMUTER_SPLIT_SHIFT' }))
    expect(
      validateAssignmentEdit({
        ...context,
        residencyType: 'commuter',
        template: {
          ...context.template,
          segments: [{ startTime: '14:00', endTime: '23:00', endsNextDay: false }],
        },
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: 'COMMUTER_CUTOFF' }))
    expect(
      validateAssignmentEdit({
        ...context,
        currentWeekMinutes: 3_000,
        template: { ...context.template, workingMinutes: 600 },
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: 'WEEKLY_MINUTES_EXCEEDED' }))
  })

  it('requires submitted children, no hard violations, and resolved soft warnings to publish', () => {
    expect(
      validatePublicationReadiness({
        cycleStatus: 'submitted',
        childStatuses: ['submitted', 'submitted'],
        openHardViolations: 0,
        openSoftViolations: 0,
        policyStatus: 'active',
      }),
    ).toEqual({ ok: true })
    expect(
      validatePublicationReadiness({
        cycleStatus: 'submitted',
        childStatuses: ['submitted', 'draft'],
        openHardViolations: 0,
        openSoftViolations: 0,
        policyStatus: 'active',
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: 'CHILDREN_NOT_SUBMITTED' }))
    expect(
      validatePublicationReadiness({
        cycleStatus: 'submitted',
        childStatuses: ['submitted'],
        openHardViolations: 1,
        openSoftViolations: 0,
        policyStatus: 'active',
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: 'OPEN_HARD_VIOLATIONS' }))
    expect(
      validatePublicationReadiness({
        cycleStatus: 'submitted',
        childStatuses: ['submitted'],
        openHardViolations: 0,
        openSoftViolations: 1,
        policyStatus: 'active',
      }),
    ).toEqual(expect.objectContaining({ ok: false, code: 'OPEN_SOFT_WARNINGS' }))
  })

  it('creates revisions only from the current published version', () => {
    expect(validateRevisionCreation('published', 6, 6, 3, 3)).toEqual({
      ok: true,
    })
    expect(validateRevisionCreation('draft', 6, 6, 3, 3)).toEqual(
      expect.objectContaining({ ok: false, code: 'SOURCE_NOT_PUBLISHED' }),
    )
    expect(validateRevisionCreation('published', 6, 5, 3, 3)).toEqual(
      expect.objectContaining({ ok: false, code: 'VERSION_CONFLICT' }),
    )
    expect(validateRevisionCreation('published', 6, 6, 3, 4)).toEqual(
      expect.objectContaining({ ok: false, code: 'NEWER_REVISION_EXISTS' }),
    )
  })
})
