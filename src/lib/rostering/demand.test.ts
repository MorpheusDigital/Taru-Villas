import { describe, expect, it } from 'vitest'

import { calculateDemand } from './demand'
import type { GenerationInput } from './types'

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
    properties: [
      {
        id: 'property-1',
        name: 'Hub Villa',
        kind: 'hub',
        barCloseTime: '23:00',
        transportCutoff: '19:00',
        multiZoneSeparation: false,
        safariFocus: false,
        outsourcedSecurity: true,
      },
    ],
    roles: [
      {
        id: 'waiter',
        code: 'WAITER',
        name: 'Waiter',
        departmentCode: 'FB',
        laborTier: 'variable',
        sameHubReliefEligible: true,
        isAreaManager: false,
        isPropertyManager: false,
        minimumFloor: 1,
      },
      {
        id: 'night-auditor',
        code: 'NIGHT_AUDITOR',
        name: 'Night Auditor',
        departmentCode: 'FO',
        laborTier: 'fixed',
        sameHubReliefEligible: false,
        isAreaManager: false,
        isPropertyManager: false,
        minimumFloor: 0,
      },
    ],
    employees: [],
    forecasts: [
      {
        propertyId: 'property-1',
        date: '2026-09-01',
        occupancyPercent: 5,
        arrivalsCount: 0,
        departuresCount: 0,
      },
    ],
    unavailability: [],
    boundaryAssignments: [],
    cadre: [
      {
        propertyId: 'property-1',
        roleId: 'waiter',
        requiredDailyActive: 2,
        reliefMultiplier: 1.5,
      },
      {
        propertyId: 'property-1',
        roleId: 'night-auditor',
        requiredDailyActive: 1,
        reliefMultiplier: 1.5,
      },
    ],
    staffingBands: [
      {
        propertyId: 'property-1',
        roleId: 'waiter',
        occupancyMin: 0,
        occupancyMax: 20,
        requiredActive: 0,
      },
      {
        propertyId: 'property-1',
        roleId: 'night-auditor',
        occupancyMin: 0,
        occupancyMax: 100,
        requiredActive: 0,
      },
    ],
    shiftTemplates: [],
    ...overrides,
  }
}

describe('calculateDemand', () => {
  it('keeps the minimum viable floor for a low-occupancy variable role', () => {
    const demand = calculateDemand(input())

    expect(demand).toContainEqual({
      propertyId: 'property-1',
      date: '2026-09-01',
      roleId: 'waiter',
      requiredActive: 1,
      budgetedHeadcount: 3,
    })
  })

  it('protects fixed-role demand even when its occupancy band says zero', () => {
    const demand = calculateDemand(input())

    expect(demand).toContainEqual({
      propertyId: 'property-1',
      date: '2026-09-01',
      roleId: 'night-auditor',
      requiredActive: 1,
      budgetedHeadcount: 2,
    })
  })

  it('rejects overlapping occupancy bands instead of choosing by input order', () => {
    const base = input()
    expect(() =>
      calculateDemand(
        input({
          staffingBands: [
            ...base.staffingBands,
            {
              propertyId: 'property-1',
              roleId: 'waiter',
              occupancyMin: 5,
              occupancyMax: 50,
              requiredActive: 2,
            },
          ],
        }),
      ),
    ).toThrow('overlapping staffing bands for property-1/waiter at 5%')
  })

  it('rejects missing cadre rather than silently returning zero demand', () => {
    expect(() =>
      calculateDemand(
        input({ cadre: input().cadre.filter((row) => row.roleId !== 'waiter') }),
      ),
    ).toThrow('missing cadre for property-1/waiter')
  })
})
