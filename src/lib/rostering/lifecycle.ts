export type LifecycleValidation =
  | { ok: true }
  | {
      ok: false
      code: string
      message: string
    }

export function validateLifecycleVersion(
  status: 'draft' | 'submitted' | 'published' | 'superseded',
  actualVersion: number,
  expectedVersion: number,
): LifecycleValidation {
  if (status !== 'draft') {
    return {
      ok: false,
      code: 'CYCLE_NOT_EDITABLE',
      message: 'Only draft roster cycles can be changed.',
    }
  }
  if (actualVersion !== expectedVersion) {
    return {
      ok: false,
      code: 'VERSION_CONFLICT',
      message: 'This roster changed after it was opened. Refresh and try again.',
    }
  }
  return { ok: true }
}

export interface AssignmentEditContext {
  cycleStatus: 'draft' | 'submitted' | 'published' | 'superseded'
  cycleVersion: number
  expectedVersion: number
  participantId: string
  employeeId: string
  date: string
  dutyPropertyId: string
  roleId: string
  shiftTemplateId: string | null
  dutyCode: string
  hubPropertyIds: string[]
  skillRoleIds: string[]
  unavailability: Array<{ startDate: string; endDate: string }>
  residencyType: 'resident' | 'commuter'
  template: {
    roleId: string
    workingMinutes: number
    segments: Array<{
      startTime: string
      endTime: string
      endsNextDay: boolean
    }>
  } | null
  transportCutoff: string
  existingAssignmentParticipantIds: string[]
  currentWeekMinutes: number
  maxWeekMinutes: number
  priorWorkingMinutes: number
}

function invalid(code: string, message: string): LifecycleValidation {
  return { ok: false, code, message }
}

export function validateAssignmentEdit(
  context: AssignmentEditContext,
): LifecycleValidation {
  const lifecycle = validateLifecycleVersion(
    context.cycleStatus,
    context.cycleVersion,
    context.expectedVersion,
  )
  if (!lifecycle.ok) return lifecycle

  if (!context.hubPropertyIds.includes(context.dutyPropertyId)) {
    return invalid(
      'PROPERTY_OUTSIDE_HUB',
      'Duty property must belong to the same roster hub.',
    )
  }
  if (!context.skillRoleIds.includes(context.roleId)) {
    return invalid(
      'ROLE_NOT_QUALIFIED',
      'Employee is not qualified for the selected role.',
    )
  }
  if (
    context.unavailability.some(
      (row) => context.date >= row.startDate && context.date <= row.endDate,
    )
  ) {
    return invalid(
      'APPROVED_UNAVAILABILITY',
      'Approved source data blocks assignment on this date.',
    )
  }
  if (
    context.existingAssignmentParticipantIds.includes(context.participantId)
  ) {
    return invalid(
      'DOUBLE_BOOKED',
      'Employee already has another assignment on this date.',
    )
  }
  if (['W', 'S'].includes(context.dutyCode)) {
    if (!context.template || context.shiftTemplateId === null) {
      return invalid(
        'SHIFT_TEMPLATE_REQUIRED',
        'Working duty requires a valid shift template.',
      )
    }
    if (context.template.roleId !== context.roleId) {
      return invalid(
        'SHIFT_ROLE_MISMATCH',
        'Shift template does not belong to the selected role.',
      )
    }
    if (context.residencyType === 'commuter') {
      if (context.template.segments.length > 1) {
        return invalid(
          'COMMUTER_SPLIT_SHIFT',
          'Commuters cannot be assigned split shifts.',
        )
      }
      if (
        context.template.segments.some(
          (segment) =>
            segment.endsNextDay ||
            segment.endTime > context.transportCutoff,
        )
      ) {
        return invalid(
          'COMMUTER_CUTOFF',
          'Commuter shift ends after the property transport cutoff.',
        )
      }
    }
    const nextWeekMinutes =
      context.currentWeekMinutes -
      context.priorWorkingMinutes +
      context.template.workingMinutes
    if (nextWeekMinutes > context.maxWeekMinutes) {
      return invalid(
        'WEEKLY_MINUTES_EXCEEDED',
        'Assignment would exceed the weekly working-minute limit.',
      )
    }
  }

  return { ok: true }
}

export interface PublicationReadiness {
  cycleStatus: 'draft' | 'submitted' | 'published' | 'superseded'
  childStatuses: Array<'draft' | 'submitted'>
  openHardViolations: number
  openSoftViolations: number
  policyStatus: 'draft' | 'awaiting_hr_approval' | 'approved' | 'active' | 'retired'
}

export function validatePublicationReadiness(
  context: PublicationReadiness,
): LifecycleValidation {
  if (context.cycleStatus !== 'submitted') {
    return invalid(
      'CYCLE_NOT_SUBMITTED',
      'The hub cycle must be submitted before publication.',
    )
  }
  if (
    context.childStatuses.length === 0 ||
    context.childStatuses.some((status) => status !== 'submitted')
  ) {
    return invalid(
      'CHILDREN_NOT_SUBMITTED',
      'Every active property roster must be submitted.',
    )
  }
  if (context.openHardViolations > 0) {
    return invalid(
      'OPEN_HARD_VIOLATIONS',
      'Hard violations must be resolved before publication.',
    )
  }
  if (context.openSoftViolations > 0) {
    return invalid(
      'OPEN_SOFT_WARNINGS',
      'Soft warnings must be resolved or overridden before publication.',
    )
  }
  if (context.policyStatus !== 'active') {
    return invalid(
      'POLICY_NOT_ACTIVE',
      'Publication requires an active HR-approved policy.',
    )
  }
  return { ok: true }
}
