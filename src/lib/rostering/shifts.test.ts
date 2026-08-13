import { describe, expect, it } from 'vitest'

import { selectShiftTemplate } from './shifts'
import type {
  EngineEmployee,
  EngineProperty,
  EngineRole,
  EngineShiftTemplate,
} from './types'

const property: EngineProperty = {
  id: 'property-1',
  name: 'Hub Villa',
  kind: 'hub',
  barCloseTime: '23:00',
  transportCutoff: '19:00',
  multiZoneSeparation: false,
  safariFocus: false,
  outsourcedSecurity: true,
}

const role: EngineRole = {
  id: 'waiter',
  code: 'WAITER',
  name: 'Waiter',
  departmentCode: 'FB',
  laborTier: 'variable',
  sameHubReliefEligible: true,
  isAreaManager: false,
  isPropertyManager: false,
  minimumFloor: 1,
}

const resident: EngineEmployee = {
  id: 'employee-1',
  employeeNumber: 'E-001',
  fullName: 'Kasun Perera',
  roleId: role.id,
  skillRoleIds: [role.id],
  basePropertyId: property.id,
  residencyType: 'resident',
  homeDistanceKm: 70,
  employmentStartDate: '2026-01-01',
  employmentEndDate: null,
}

function template(
  code: string,
  startTime: string,
  endTime: string,
  segments = 1,
): EngineShiftTemplate {
  return {
    id: code.toLowerCase(),
    code,
    roleId: role.id,
    scheduledMinutes: 540,
    breakMinutes: 60,
    workingMinutes: 480,
    segments:
      segments === 1
        ? [{ startTime, endTime, endsNextDay: false }]
        : [
            { startTime: '07:00', endTime: '12:00', endsNextDay: false },
            { startTime: '18:00', endTime: '22:00', endsNextDay: false },
          ],
  }
}

describe('selectShiftTemplate', () => {
  it('uses a split service shift when one resident waiter is active', () => {
    const selected = selectShiftTemplate({
      employee: resident,
      role,
      property,
      activeRank: 0,
      activeCount: 1,
      templates: [template('ACTIVE_1_SPLIT', '07:00', '22:00', 2)],
    })

    expect(selected?.code).toBe('ACTIVE_1_SPLIT')
  })

  it('rejects a split template for a commuter', () => {
    const selected = selectShiftTemplate({
      employee: { ...resident, residencyType: 'commuter' },
      role,
      property,
      activeRank: 0,
      activeCount: 1,
      templates: [template('ACTIVE_1_SPLIT', '07:00', '22:00', 2)],
    })

    expect(selected).toBeNull()
  })

  it('rejects a commuter shift that finishes after the transport cutoff', () => {
    const selected = selectShiftTemplate({
      employee: { ...resident, residencyType: 'commuter' },
      role,
      property,
      activeRank: 1,
      activeCount: 2,
      templates: [template('ACTIVE_2_CLOSE', '14:00', '23:00')],
    })

    expect(selected).toBeNull()
  })

  it('forces the Bridge Commis operational lock before generic ranking', () => {
    const bridgeRole = { ...role, id: 'bridge', code: 'BRIDGE_COMMIS' }
    const selected = selectShiftTemplate({
      employee: { ...resident, roleId: bridgeRole.id, skillRoleIds: [bridgeRole.id] },
      role: bridgeRole,
      property,
      activeRank: 0,
      activeCount: 3,
      templates: [
        { ...template('DEFAULT', '07:00', '16:00'), roleId: bridgeRole.id },
        { ...template('BRIDGE_COMMIS', '11:00', '20:00'), roleId: bridgeRole.id },
      ],
    })

    expect(selected?.code).toBe('BRIDGE_COMMIS')
  })
})
