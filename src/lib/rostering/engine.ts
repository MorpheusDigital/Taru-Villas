import { buildAvailability } from './availability'
import { datesInMonth, workWeekKey } from './dates'
import { calculateDemand } from './demand'
import { selectShiftTemplate } from './shifts'
import type {
  Assignment,
  DutyCode,
  EngineEmployee,
  EngineRole,
  GenerationInput,
  GenerationResult,
  IsoDate,
  RoleDemand,
  Violation,
} from './types'

function assignmentKey(employeeId: string, date: IsoDate): string {
  return `${employeeId}/${date}`
}

function demandKey(demand: RoleDemand): string {
  return `${demand.propertyId}/${demand.date}/${demand.roleId}`
}

function emptyAssignment(
  employee: EngineEmployee,
  date: IsoDate,
  dutyCode: DutyCode,
  reasonCode: string,
): Assignment {
  return {
    employeeId: employee.id,
    date,
    basePropertyId: employee.basePropertyId,
    dutyPropertyId: employee.basePropertyId,
    roleId: employee.roleId,
    dutyCode,
    shiftTemplateId: null,
    scheduledMinutes: 0,
    breakMinutes: 0,
    workingMinutes: 0,
    segments: [],
    reasonCodes: [reasonCode],
    explanation: reasonCode.replaceAll('_', ' ').toLowerCase(),
  }
}

function isUnallocated(assignment: Assignment): boolean {
  return (
    assignment.dutyCode === 'O' &&
    assignment.reasonCodes.includes('UNALLOCATED_AVAILABLE')
  )
}

function isQualified(employee: EngineEmployee, roleId: string): boolean {
  return employee.roleId === roleId || employee.skillRoleIds.includes(roleId)
}

function workAssignment(
  assignment: Assignment,
  dutyPropertyId: string,
  roleId: string,
  dutyCode: Extract<DutyCode, 'W' | 'S'>,
  reasonCode: string,
): void {
  assignment.dutyPropertyId = dutyPropertyId
  assignment.roleId = roleId
  assignment.dutyCode = dutyCode
  assignment.reasonCodes = [reasonCode]
  assignment.explanation = reasonCode.replaceAll('_', ' ').toLowerCase()
}

function violation(
  ruleCode: string,
  severity: 'hard' | 'soft',
  message: string,
  details: Partial<Violation> = {},
): Violation {
  return {
    ruleCode,
    severity,
    message,
    employeeId: details.employeeId ?? null,
    propertyId: details.propertyId ?? null,
    date: details.date ?? null,
    evidence: details.evidence ?? {},
  }
}

function sortedEmployees(input: GenerationInput): EngineEmployee[] {
  return [...input.employees].sort(
    (left, right) =>
      left.employeeNumber.localeCompare(right.employeeNumber) ||
      left.id.localeCompare(right.id),
  )
}

function allocateAreaManagers(
  input: GenerationInput,
  assignments: Map<string, Assignment>,
  violations: Violation[],
): void {
  const roles = new Map(input.roles.map((item) => [item.id, item]))
  const employees = sortedEmployees(input)
  const spokes = input.properties
    .filter((property) => property.kind === 'spoke')
    .sort((left, right) => left.id.localeCompare(right.id))

  for (const manager of employees.filter(
    (employee) => roles.get(employee.roleId)?.isAreaManager,
  )) {
    const spoke = spokes[0]
    if (!spoke) continue

    const spokeManagers = employees.filter(
      (employee) =>
        employee.basePropertyId === spoke.id &&
        roles.get(employee.roleId)?.isPropertyManager,
    )
    const candidates = datesInMonth(input.month).filter((date) =>
      isUnallocated(assignments.get(assignmentKey(manager.id, date))!),
    )
    const overlapCandidates = candidates.filter((date) =>
      spokeManagers.some((spokeManager) => {
        const assignment = assignments.get(assignmentKey(spokeManager.id, date))!
        return ['O', 'H', 'AL', 'SL', 'LIEU', 'TRN'].includes(
          assignment.dutyCode,
        ) && !assignment.reasonCodes.includes('UNALLOCATED_AVAILABLE')
      }),
    )
    const overlapSet = new Set(overlapCandidates)
    const selected = [
      ...overlapCandidates.slice(0, input.policy.areaManagerOverlapDays),
      ...candidates.filter((date) => !overlapSet.has(date)),
    ].slice(0, input.policy.areaManagerSpokeDays)

    for (const date of selected) {
      workAssignment(
        assignments.get(assignmentKey(manager.id, date))!,
        spoke.id,
        manager.roleId,
        'S',
        'AREA_MANAGER_SPOKE_DUTY',
      )
    }

    const overlapCount = selected.filter((date) => overlapSet.has(date)).length
    if (
      selected.length !== input.policy.areaManagerSpokeDays ||
      overlapCount < input.policy.areaManagerOverlapDays
    ) {
      violations.push(
        violation(
          'AREA_MANAGER_COVERAGE',
          'hard',
          `Area Manager ${manager.employeeNumber} cannot meet the spoke-duty overlap rule.`,
          {
            employeeId: manager.id,
            propertyId: spoke.id,
            evidence: {
              requiredSpokeDays: input.policy.areaManagerSpokeDays,
              assignedSpokeDays: selected.length,
              requiredOverlapDays: input.policy.areaManagerOverlapDays,
              assignedOverlapDays: overlapCount,
            },
          },
        ),
      )
    }
  }
}

function candidateOrder(
  employees: EngineEmployee[],
  roleId: string,
): EngineEmployee[] {
  return [...employees].sort(
    (left, right) =>
      Number(right.roleId === roleId) - Number(left.roleId === roleId) ||
      left.employeeNumber.localeCompare(right.employeeNumber) ||
      left.id.localeCompare(right.id),
  )
}

function allocateDemand(
  input: GenerationInput,
  demand: RoleDemand[],
  assignments: Map<string, Assignment>,
): void {
  const employees = sortedEmployees(input)
  const roleById = new Map(input.roles.map((role) => [role.id, role]))
  const remaining = new Map<string, number>()

  for (const row of demand) {
    const baseCandidates = candidateOrder(
      employees.filter(
        (employee) =>
          employee.basePropertyId === row.propertyId &&
          isQualified(employee, row.roleId) &&
          isUnallocated(assignments.get(assignmentKey(employee.id, row.date))!),
      ),
      row.roleId,
    )
    const selected = baseCandidates.slice(0, row.requiredActive)
    for (const employee of selected) {
      workAssignment(
        assignments.get(assignmentKey(employee.id, row.date))!,
        row.propertyId,
        row.roleId,
        'W',
        'BASE_PROPERTY_DEMAND',
      )
    }
    remaining.set(demandKey(row), row.requiredActive - selected.length)
  }

  for (const row of demand) {
    const shortage = remaining.get(demandKey(row)) ?? 0
    const role = roleById.get(row.roleId)
    if (shortage <= 0 || !role?.sameHubReliefEligible || role.laborTier === 'fixed') {
      continue
    }

    const reliefCandidates = candidateOrder(
      employees.filter((employee) => {
        const primaryRole = roleById.get(employee.roleId)
        return (
          employee.basePropertyId !== row.propertyId &&
          primaryRole?.laborTier !== 'fixed' &&
          isQualified(employee, row.roleId) &&
          isUnallocated(assignments.get(assignmentKey(employee.id, row.date))!)
        )
      }),
      row.roleId,
    )
    const selected = reliefCandidates.slice(0, shortage)
    for (const employee of selected) {
      workAssignment(
        assignments.get(assignmentKey(employee.id, row.date))!,
        row.propertyId,
        row.roleId,
        'W',
        'SAME_HUB_RELIEF',
      )
    }
    remaining.set(demandKey(row), shortage - selected.length)
  }
}

function applyShiftTemplates(
  input: GenerationInput,
  assignments: Map<string, Assignment>,
  violations: Violation[],
): void {
  const employeeById = new Map(input.employees.map((item) => [item.id, item]))
  const roleById = new Map(input.roles.map((item) => [item.id, item]))
  const propertyById = new Map(input.properties.map((item) => [item.id, item]))
  const groups = new Map<string, Assignment[]>()

  for (const assignment of assignments.values()) {
    if (!['W', 'S'].includes(assignment.dutyCode)) continue
    const key = `${assignment.date}/${assignment.dutyPropertyId}/${assignment.roleId}`
    const group = groups.get(key) ?? []
    group.push(assignment)
    groups.set(key, group)
  }

  for (const group of [...groups.values()].sort((left, right) => {
    const a = left[0]
    const b = right[0]
    return (
      a.date.localeCompare(b.date) ||
      a.dutyPropertyId.localeCompare(b.dutyPropertyId) ||
      a.roleId.localeCompare(b.roleId)
    )
  })) {
    group.sort((left, right) => {
      const a = employeeById.get(left.employeeId)!
      const b = employeeById.get(right.employeeId)!
      return a.employeeNumber.localeCompare(b.employeeNumber) || a.id.localeCompare(b.id)
    })

    group.forEach((assignment, activeRank) => {
      const employee = employeeById.get(assignment.employeeId)!
      const role = roleById.get(assignment.roleId)!
      const property = propertyById.get(assignment.dutyPropertyId)!
      const template = selectShiftTemplate({
        employee,
        role,
        property,
        activeRank,
        activeCount: group.length,
        templates: input.shiftTemplates,
      })

      if (!template) {
        violations.push(
          violation(
            'NO_VALID_SHIFT',
            'hard',
            `No valid shift is available for ${employee.employeeNumber}.`,
            {
              employeeId: employee.id,
              propertyId: property.id,
              date: assignment.date,
              evidence: { roleCode: role.code },
            },
          ),
        )
        return
      }

      assignment.shiftTemplateId = template.id
      assignment.scheduledMinutes = template.scheduledMinutes
      assignment.breakMinutes = template.breakMinutes
      assignment.workingMinutes = template.workingMinutes
      assignment.segments = template.segments.map((segment, sortOrder) => ({
        ...segment,
        sortOrder,
      }))
    })
  }
}

function validateCoverage(
  demand: RoleDemand[],
  assignments: Assignment[],
  violations: Violation[],
): void {
  for (const row of demand) {
    const covered = assignments.filter(
      (assignment) =>
        assignment.date === row.date &&
        assignment.dutyPropertyId === row.propertyId &&
        assignment.roleId === row.roleId &&
        ['W', 'S'].includes(assignment.dutyCode) &&
        assignment.shiftTemplateId !== null,
    ).length
    if (covered >= row.requiredActive) continue

    violations.push(
      violation(
        'UNCOVERED_DEMAND',
        'hard',
        `${row.requiredActive - covered} required assignment(s) remain uncovered.`,
        {
          propertyId: row.propertyId,
          date: row.date,
          evidence: {
            roleId: row.roleId,
            requiredActive: row.requiredActive,
            covered,
          },
        },
      ),
    )
  }
}

function validateMinutesAndTargets(
  input: GenerationInput,
  assignments: Assignment[],
  violations: Violation[],
): void {
  const employees = sortedEmployees(input)
  for (const employee of employees) {
    const rows = assignments.filter((item) => item.employeeId === employee.id)
    const workdays = rows.filter((item) => ['W', 'S'].includes(item.dutyCode)).length
    if (workdays !== input.policy.monthlyWorkdayTarget) {
      violations.push(
        violation(
          'WORKDAY_TARGET_VARIANCE',
          'soft',
          `${employee.employeeNumber} is scheduled for ${workdays} workdays against a target of ${input.policy.monthlyWorkdayTarget}.`,
          {
            employeeId: employee.id,
            evidence: {
              target: input.policy.monthlyWorkdayTarget,
              actual: workdays,
            },
          },
        ),
      )
    }

    for (const row of rows.filter(
      (item) => item.workingMinutes > input.policy.maxWorkingMinutesPerDay,
    )) {
      violations.push(
        violation(
          'DAILY_MINUTES_EXCEEDED',
          'hard',
          `${employee.employeeNumber} exceeds the daily working-minute limit.`,
          {
            employeeId: employee.id,
            propertyId: row.dutyPropertyId,
            date: row.date,
            evidence: {
              limit: input.policy.maxWorkingMinutesPerDay,
              actual: row.workingMinutes,
            },
          },
        ),
      )
    }

    const minutesByWeek = new Map<string, number>()
    for (const boundary of input.boundaryAssignments.filter(
      (item) => item.employeeId === employee.id,
    )) {
      const week = workWeekKey(boundary.date, input.policy.workWeekStartsOn)
      minutesByWeek.set(week, (minutesByWeek.get(week) ?? 0) + boundary.workingMinutes)
    }
    for (const row of rows) {
      const week = workWeekKey(row.date, input.policy.workWeekStartsOn)
      minutesByWeek.set(week, (minutesByWeek.get(week) ?? 0) + row.workingMinutes)
    }
    for (const [week, actual] of minutesByWeek) {
      if (actual <= input.policy.maxWorkingMinutesPerWeek) continue
      violations.push(
        violation(
          'WEEKLY_MINUTES_EXCEEDED',
          'hard',
          `${employee.employeeNumber} exceeds the weekly working-minute limit.`,
          {
            employeeId: employee.id,
            date: week,
            evidence: { limit: input.policy.maxWorkingMinutesPerWeek, actual },
          },
        ),
      )
    }
  }

  if (employees.length > 0) {
    const residentPercent = Math.round(
      (employees.filter((item) => item.residencyType === 'resident').length /
        employees.length) *
        100,
    )
    if (residentPercent !== input.policy.residentTargetPercent) {
      violations.push(
        violation(
          'RESIDENCY_MIX_VARIANCE',
          'soft',
          `Resident workforce composition is ${residentPercent}% against a ${input.policy.residentTargetPercent}% target.`,
          {
            evidence: {
              residentTargetPercent: input.policy.residentTargetPercent,
              commuterTargetPercent: input.policy.commuterTargetPercent,
              residentActualPercent: residentPercent,
            },
          },
        ),
      )
    }
  }
}

export function generateRoster(input: GenerationInput): GenerationResult {
  const demand = calculateDemand(input)
  const availability = buildAvailability(input)
  const assignments = new Map<string, Assignment>()
  const violations: Violation[] = []

  for (const employee of sortedEmployees(input)) {
    const calendar = availability.get(employee.id)!
    for (const date of datesInMonth(input.month)) {
      const day = calendar.get(date)!
      assignments.set(
        assignmentKey(employee.id, date),
        emptyAssignment(
          employee,
          date,
          day.fixedDutyCode ?? 'O',
          day.fixedDutyCode === null ? 'UNALLOCATED_AVAILABLE' : day.reasonCode,
        ),
      )
    }
  }

  allocateAreaManagers(input, assignments, violations)
  allocateDemand(input, demand, assignments)
  applyShiftTemplates(input, assignments, violations)

  const orderedAssignments = [...assignments.values()].sort(
    (left, right) =>
      left.employeeId.localeCompare(right.employeeId) ||
      left.date.localeCompare(right.date),
  )
  validateCoverage(demand, orderedAssignments, violations)
  validateMinutesAndTargets(input, orderedAssignments, violations)

  violations.sort(
    (left, right) =>
      left.ruleCode.localeCompare(right.ruleCode) ||
      (left.employeeId ?? '').localeCompare(right.employeeId ?? '') ||
      (left.propertyId ?? '').localeCompare(right.propertyId ?? '') ||
      (left.date ?? '').localeCompare(right.date ?? ''),
  )

  return { assignments: orderedAssignments, demand, violations }
}
