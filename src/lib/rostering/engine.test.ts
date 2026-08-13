import { describe, expect, it } from 'vitest'

import { generateRoster } from './engine'
import type {
  EngineEmployee,
  EngineRole,
  EngineShiftTemplate,
  GenerationInput,
} from './types'

const hub = {
  id: 'hub',
  name: 'Taru Hub',
  kind: 'hub' as const,
  barCloseTime: '23:00',
  transportCutoff: '19:00',
  multiZoneSeparation: false,
  safariFocus: false,
  outsourcedSecurity: false,
}

const spoke = {
  ...hub,
  id: 'spoke',
  name: 'Taru Spoke',
  kind: 'spoke' as const,
}

function role(
  code: string,
  overrides: Partial<EngineRole> = {},
): EngineRole {
  return {
    id: code.toLowerCase(),
    code,
    name: code,
    departmentCode: 'OPS',
    laborTier: 'variable',
    sameHubReliefEligible: true,
    isAreaManager: false,
    isPropertyManager: false,
    minimumFloor: 0,
    ...overrides,
  }
}

function employee(
  number: string,
  employeeRole: EngineRole,
  basePropertyId = hub.id,
  overrides: Partial<EngineEmployee> = {},
): EngineEmployee {
  return {
    id: `employee-${number}`,
    employeeNumber: number,
    fullName: `Employee ${number}`,
    roleId: employeeRole.id,
    skillRoleIds: [employeeRole.id],
    basePropertyId,
    residencyType: 'resident',
    homeDistanceKm: 10,
    employmentStartDate: '2026-01-01',
    employmentEndDate: null,
    ...overrides,
  }
}

function template(
  templateRole: EngineRole,
  code = 'DEFAULT',
  startTime = '07:00',
  endTime = '16:00',
  segments = 1,
): EngineShiftTemplate {
  return {
    id: `${templateRole.id}-${code.toLowerCase()}`,
    code,
    roleId: templateRole.id,
    scheduledMinutes: 540,
    breakMinutes: 60,
    workingMinutes: 480,
    segments:
      segments === 1
        ? [{ startTime, endTime, endsNextDay: endTime < startTime }]
        : [
            { startTime: '07:00', endTime: '12:00', endsNextDay: false },
            { startTime: '18:00', endTime: '22:00', endsNextDay: false },
          ],
  }
}

function inputFor({
  roles,
  employees,
  forecastPropertyIds = [hub.id],
  required = {},
  templates = roles.map((item) => template(item)),
}: {
  roles: EngineRole[]
  employees: EngineEmployee[]
  forecastPropertyIds?: string[]
  required?: Record<string, number>
  templates?: EngineShiftTemplate[]
}): GenerationInput {
  const date = '2026-09-01'
  return {
    hubId: hub.id,
    month: '2026-09-01',
    policy: {
      id: 'policy-1',
      workWeekStartsOn: 1,
      monthlyWorkdayTarget: 24,
      maxWorkingMinutesPerDay: 600,
      maxWorkingMinutesPerWeek: 3_000,
      fullRestDaysPerWeek: 0,
      halfRestDaysPerWeek: 0,
      travelDistanceThresholdKm: 50,
      areaManagerSpokeDays: 10,
      areaManagerOverlapDays: 7,
      residentTargetPercent: 60,
      commuterTargetPercent: 40,
    },
    properties: [hub, spoke],
    roles,
    employees,
    forecasts: forecastPropertyIds.map((propertyId) => ({
      propertyId,
      date,
      occupancyPercent: 20,
      arrivalsCount: 0,
      departuresCount: 0,
    })),
    unavailability: [],
    boundaryAssignments: [],
    cadre: forecastPropertyIds.flatMap((propertyId) =>
      roles.map((item) => ({
        propertyId,
        roleId: item.id,
        requiredDailyActive: required[item.id] ?? 0,
        reliefMultiplier: 1.25,
      })),
    ),
    staffingBands: forecastPropertyIds.flatMap((propertyId) =>
      roles.map((item) => ({
        propertyId,
        roleId: item.id,
        occupancyMin: 0,
        occupancyMax: 100,
        requiredActive: required[item.id] ?? 0,
      })),
    ),
    shiftTemplates: templates,
  }
}

describe('generateRoster', () => {
  it('is stable when every normalized input array is reversed', () => {
    const waiter = role('WAITER', { minimumFloor: 1 })
    const input = inputFor({
      roles: [waiter],
      employees: [employee('002', waiter), employee('001', waiter)],
      templates: [template(waiter, 'ACTIVE_1_SPLIT', '07:00', '22:00', 2)],
    })
    const reversed: GenerationInput = {
      ...input,
      properties: [...input.properties].reverse(),
      roles: [...input.roles].reverse(),
      employees: [...input.employees].reverse(),
      forecasts: [...input.forecasts].reverse(),
      unavailability: [...input.unavailability].reverse(),
      boundaryAssignments: [...input.boundaryAssignments].reverse(),
      cadre: [...input.cadre].reverse(),
      staffingBands: [...input.staffingBands].reverse(),
      shiftTemplates: [...input.shiftTemplates].reverse(),
    }

    expect(generateRoster(reversed)).toEqual(generateRoster(input))
  })

  it('protects minimum viable waiter, chef, and housekeeper coverage', () => {
    const roles = [
      role('WAITER', { minimumFloor: 1 }),
      role('CHEF', { minimumFloor: 1 }),
      role('HOUSEKEEPER', { minimumFloor: 1 }),
    ]
    const input = inputFor({
      roles,
      employees: roles.map((item, index) => employee(`00${index + 1}`, item)),
      templates: roles.flatMap((item) => [
        template(item),
        template(item, 'ACTIVE_1_SPLIT', '07:00', '22:00', 2),
      ]),
    })
    const result = generateRoster(input)
    const working = result.assignments.filter(
      (item) => item.date === '2026-09-01' && item.dutyCode === 'W',
    )

    expect(working.map((item) => item.roleId).sort()).toEqual(
      roles.map((item) => item.id).sort(),
    )
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({ ruleCode: 'UNCOVERED_DEMAND' }),
    )
  })

  it('applies Bridge Commis, GSA pair, and Night Auditor templates', () => {
    const bridge = role('BRIDGE_COMMIS')
    const gsa = role('GSA')
    const night = role('NIGHT_AUDITOR')
    const roles = [bridge, gsa, night]
    const input = inputFor({
      roles,
      employees: [
        employee('001', bridge),
        employee('002', gsa),
        employee('003', gsa),
        employee('004', night),
      ],
      required: { [bridge.id]: 1, [gsa.id]: 2, [night.id]: 1 },
      templates: [
        template(bridge, 'BRIDGE_COMMIS', '11:00', '20:00'),
        template(gsa, 'GSA_MORNING', '07:00', '16:00'),
        template(gsa, 'GSA_EVENING', '14:00', '23:00'),
        template(night, 'NIGHT_AUDITOR', '22:00', '07:00'),
      ],
    })

    const codes = generateRoster(input).assignments
      .filter((item) => item.date === '2026-09-01')
      .map((item) => item.shiftTemplateId)

    expect(codes).toEqual(
      expect.arrayContaining([
        'bridge_commis-bridge_commis',
        'gsa-gsa_morning',
        'gsa-gsa_evening',
        'night_auditor-night_auditor',
      ]),
    )
  })

  it('uses same-hub like-for-like relief but never transfers an ordinary fixed role', () => {
    const waiter = role('WAITER')
    const fixed = role('FIXED_HOST', { laborTier: 'fixed' })
    const input = inputFor({
      roles: [waiter, fixed],
      employees: [employee('001', waiter), employee('002', fixed)],
      forecastPropertyIds: [spoke.id],
      required: { [waiter.id]: 1, [fixed.id]: 1 },
      templates: [template(waiter, 'ACTIVE_1_SPLIT', '07:00', '22:00', 2), template(fixed)],
    })
    const result = generateRoster(input)
    const onDate = result.assignments.filter((item) => item.date === '2026-09-01')

    expect(onDate).toContainEqual(
      expect.objectContaining({
        employeeId: 'employee-001',
        dutyPropertyId: spoke.id,
        dutyCode: 'W',
      }),
    )
    expect(onDate).not.toContainEqual(
      expect.objectContaining({
        employeeId: 'employee-002',
        dutyPropertyId: spoke.id,
        dutyCode: 'W',
      }),
    )
    expect(result.violations).toContainEqual(
      expect.objectContaining({ ruleCode: 'UNCOVERED_DEMAND', propertyId: spoke.id }),
    )
  })

  it('allocates exactly ten Area Manager spoke days with seven manager overlaps', () => {
    const areaManager = role('AREA_MANAGER', {
      laborTier: 'fixed',
      isAreaManager: true,
    })
    const propertyManager = role('PROPERTY_MANAGER', {
      laborTier: 'fixed',
      isPropertyManager: true,
    })
    const input = inputFor({
      roles: [areaManager, propertyManager],
      employees: [
        employee('001', areaManager),
        employee('002', propertyManager, spoke.id),
      ],
      forecastPropertyIds: [],
    })
    input.unavailability = [
      {
        employeeId: 'employee-002',
        startDate: '2026-09-01',
        endDate: '2026-09-07',
        dutyCode: 'AL',
      },
    ]

    const result = generateRoster(input)
    const spokeDays = result.assignments.filter(
      (item) => item.employeeId === 'employee-001' && item.dutyCode === 'S',
    )
    const overlapDates = new Set(
      result.assignments
        .filter(
          (item) =>
            item.employeeId === 'employee-002' &&
            ['AL', 'O', 'H'].includes(item.dutyCode) &&
            !item.reasonCodes.includes('UNALLOCATED_AVAILABLE'),
        )
        .map((item) => item.date),
    )

    expect(spokeDays).toHaveLength(10)
    expect(spokeDays.filter((item) => overlapDates.has(item.date))).toHaveLength(7)
    expect(result.violations).not.toContainEqual(
      expect.objectContaining({ ruleCode: 'AREA_MANAGER_COVERAGE' }),
    )
  })

  it('records coverage and optimization violations without duplicate or overflowing assignments', () => {
    const waiter = role('WAITER', { minimumFloor: 1 })
    const input = inputFor({ roles: [waiter], employees: [] })
    const result = generateRoster(input)

    expect(result.violations).toContainEqual(
      expect.objectContaining({ ruleCode: 'UNCOVERED_DEMAND', severity: 'hard' }),
    )

    const staffedInput = inputFor({
      roles: [waiter],
      employees: [employee('001', waiter)],
      templates: [template(waiter, 'ACTIVE_1_SPLIT', '07:00', '22:00', 2)],
    })
    const staffed = generateRoster(staffedInput)
    const keys = staffed.assignments.map((item) => `${item.employeeId}/${item.date}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(staffed.violations).toContainEqual(
      expect.objectContaining({ ruleCode: 'WORKDAY_TARGET_VARIANCE', severity: 'soft' }),
    )
    expect(staffed.violations).toContainEqual(
      expect.objectContaining({ ruleCode: 'RESIDENCY_MIX_VARIANCE', severity: 'soft' }),
    )
    expect(staffed.violations).not.toContainEqual(
      expect.objectContaining({ ruleCode: 'WEEKLY_MINUTES_EXCEEDED' }),
    )
  })
})
