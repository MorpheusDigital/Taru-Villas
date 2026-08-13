import { describe, expect, it } from 'vitest'

import { buildAvailability } from './availability'
import type { EngineEmployee, GenerationInput } from './types'

const resident: EngineEmployee = {
  id: 'employee-1',
  employeeNumber: 'E-001',
  fullName: 'Kasun Perera',
  roleId: 'waiter',
  skillRoleIds: ['waiter'],
  basePropertyId: 'property-1',
  residencyType: 'resident',
  homeDistanceKm: 75,
  employmentStartDate: '2026-01-01',
  employmentEndDate: null,
}

const commuter: EngineEmployee = {
  ...resident,
  id: 'employee-2',
  employeeNumber: 'E-002',
  fullName: 'Nadeesha Silva',
  residencyType: 'commuter',
  homeDistanceKm: 12,
}

function input(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    hubId: 'hub-1',
    month: '2026-09-01',
    policy: {
      id: 'policy-1',
      workWeekStartsOn: 1,
      monthlyWorkdayTarget: 24,
      maxWorkingMinutesPerDay: 480,
      maxWorkingMinutesPerWeek: 2700,
      fullRestDaysPerWeek: 1,
      halfRestDaysPerWeek: 1,
      travelDistanceThresholdKm: 60,
      areaManagerSpokeDays: 10,
      areaManagerOverlapDays: 7,
      residentTargetPercent: 60,
      commuterTargetPercent: 40,
    },
    properties: [],
    roles: [],
    employees: [resident, commuter],
    forecasts: [],
    unavailability: [],
    boundaryAssignments: [],
    cadre: [],
    staffingBands: [],
    shiftTemplates: [],
    ...overrides,
  }
}

function state(
  result: ReturnType<typeof buildAvailability>,
  employeeId: string,
  date: string,
) {
  const day = result.get(employeeId)?.get(date)
  expect(day).toBeDefined()
  return day!
}

describe('buildAvailability', () => {
  it('blocks approved absence and still assigns a separate weekly rest day', () => {
    const result = buildAvailability(
      input({
        employees: [commuter],
        unavailability: [
          {
            employeeId: commuter.id,
            startDate: '2026-09-02',
            endDate: '2026-09-02',
            dutyCode: 'AL',
          },
        ],
      }),
    )

    expect(state(result, commuter.id, '2026-09-02')).toEqual({
      available: false,
      fixedDutyCode: 'AL',
      reasonCode: 'APPROVED_UNAVAILABILITY',
    })

    const firstWeek = [...result.get(commuter.id)!.entries()].filter(
      ([date]) => date >= '2026-09-01' && date <= '2026-09-06',
    )
    expect(firstWeek.filter(([, day]) => day.fixedDutyCode === 'O')).toHaveLength(1)
    expect(firstWeek.filter(([, day]) => day.fixedDutyCode === 'H')).toHaveLength(1)
  })

  it('uses prior-month rest context before placing rest in a partial week', () => {
    const result = buildAvailability(
      input({
        employees: [commuter],
        boundaryAssignments: [
          {
            employeeId: commuter.id,
            date: '2026-08-31',
            workingMinutes: 0,
            restCategory: 'full',
          },
        ],
      }),
    )

    const firstWeek = [...result.get(commuter.id)!.entries()].filter(
      ([date]) => date >= '2026-09-01' && date <= '2026-09-06',
    )
    expect(firstWeek.filter(([, day]) => day.fixedDutyCode === 'O')).toHaveLength(0)
    expect(firstWeek.filter(([, day]) => day.fixedDutyCode === 'H')).toHaveLength(1)
  })

  it('places one paid travel day next to annual leave for an eligible resident', () => {
    const result = buildAvailability(
      input({
        employees: [resident],
        unavailability: [
          {
            employeeId: resident.id,
            startDate: '2026-09-10',
            endDate: '2026-09-12',
            dutyCode: 'AL',
          },
        ],
      }),
    )

    expect(state(result, resident.id, '2026-09-09')).toEqual({
      available: false,
      fixedDutyCode: 'T',
      reasonCode: 'PAID_TRAVEL_DAY',
    })
    const travelDays = [...result.get(resident.id)!.values()].filter(
      (day) => day.fixedDutyCode === 'T',
    )
    expect(travelDays).toHaveLength(1)
  })

  it('produces identical employee calendars regardless of employee input order', () => {
    const forward = buildAvailability(input())
    const reversed = buildAvailability(
      input({ employees: [commuter, resident] }),
    )

    expect([...forward.get(resident.id)!.entries()]).toEqual([
      ...reversed.get(resident.id)!.entries(),
    ])
    expect([...forward.get(commuter.id)!.entries()]).toEqual([
      ...reversed.get(commuter.id)!.entries(),
    ])
  })
})
