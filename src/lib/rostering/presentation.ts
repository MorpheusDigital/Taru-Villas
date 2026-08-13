export interface PresentationSegment {
  id: string
  assignmentId: string
  sortOrder: number
  startTime: string
  endTime: string
  endsNextDay: boolean
}

export interface PresentationParticipant {
  id: string
  employeeNumber: string
  fullName: string
  basePropertyId: string
  primaryRoleId: string
  roleCode: string
  departmentCode: string
  laborTier: 'fixed' | 'variable'
  residencyType: 'resident' | 'commuter'
  skillCodes: string[]
}

export interface PresentationAssignment {
  id: string
  participantId: string
  assignmentDate: string
  dutyCode: string
  dutyPropertyId: string
  roleId: string
  shiftTemplateId: string | null
  scheduledMinutes: number
  breakMinutes: number
  workingMinutes: number
  explanation: string
  reasonCodes: string[]
  segments: PresentationSegment[]
}

export interface PresentationViolation {
  id: string
  ruleCode: string
  severity: 'hard' | 'soft'
  resolution: 'open' | 'overridden' | 'resolved_by_edit'
  message: string
  participantId: string | null
  propertyId: string | null
  violationDate: string | null
  evidence: unknown
}

export interface MatrixFilters {
  propertyId?: string
  departmentCode?: string
  roleCode?: string
  issueParticipantIds?: Set<string>
}

const dutyLabels: Record<string, string> = {
  W: 'Working',
  O: 'Full rest',
  H: 'Half-day rest',
  AL: 'Annual leave',
  SL: 'Sick leave',
  LIEU: 'Lieu day',
  TRN: 'Training',
  T: 'Paid travel day',
  S: 'Spoke duty',
}

export function dutyLabel(code: string): string {
  return dutyLabels[code] ?? code
}

export function formatSegment(segment: {
  startTime: string
  endTime: string
  endsNextDay: boolean
}): string {
  const suffix = segment.endsNextDay ? ' (+1)' : ''
  return `${segment.startTime.slice(0, 5)}–${segment.endTime.slice(0, 5)}${suffix}`
}

function minutePart(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${remainder}m`
  if (remainder === 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}

export function formatMinutes(
  workingMinutes: number,
  breakMinutes: number,
): string {
  const working = `${minutePart(workingMinutes)} working`
  return breakMinutes > 0
    ? `${working} · ${minutePart(breakMinutes)} break`
    : working
}

export function buildMatrixRows(
  participants: PresentationParticipant[],
  assignments: PresentationAssignment[],
  filters: MatrixFilters = {},
) {
  return [...participants]
    .filter((participant) => {
      if (
        filters.propertyId &&
        participant.basePropertyId !== filters.propertyId &&
        !assignments.some(
          (assignment) =>
            assignment.participantId === participant.id &&
            assignment.dutyPropertyId === filters.propertyId &&
            ['W', 'S'].includes(assignment.dutyCode),
        )
      ) {
        return false
      }
      if (
        filters.departmentCode &&
        participant.departmentCode !== filters.departmentCode
      ) {
        return false
      }
      if (filters.roleCode && participant.roleCode !== filters.roleCode) {
        return false
      }
      if (
        filters.issueParticipantIds &&
        !filters.issueParticipantIds.has(participant.id)
      ) {
        return false
      }
      return true
    })
    .sort(
      (left, right) =>
        left.employeeNumber.localeCompare(right.employeeNumber) ||
        left.id.localeCompare(right.id),
    )
    .map((participant) => ({
      participant,
      assignmentsByDate: Object.fromEntries(
        assignments
          .filter((assignment) => assignment.participantId === participant.id)
          .sort((left, right) =>
            left.assignmentDate.localeCompare(right.assignmentDate),
          )
          .map((assignment) => [assignment.assignmentDate, assignment]),
      ),
    }))
}

export function groupViolations(violations: PresentationViolation[]) {
  return {
    hard: violations.filter((violation) => violation.severity === 'hard'),
    soft: violations.filter((violation) => violation.severity === 'soft'),
  }
}

export function buildDayInspection(
  participant: PresentationParticipant | null,
  assignment: PresentationAssignment | null,
  violations: PresentationViolation[],
) {
  if (!participant || !assignment) return null

  return {
    participant,
    assignment,
    dutyLabel: dutyLabel(assignment.dutyCode),
    segmentLabels: [...assignment.segments]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(formatSegment),
    timeSummary: formatMinutes(
      assignment.workingMinutes,
      assignment.breakMinutes,
    ),
    violations: violations.filter(
      (violation) =>
        violation.participantId === participant.id &&
        (violation.violationDate === null ||
          violation.violationDate === assignment.assignmentDate),
    ),
  }
}
