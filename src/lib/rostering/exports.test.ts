import { describe, expect, it } from 'vitest'

import {
  buildManagementRosterCsv,
  buildPersonalRosterCsv,
} from './exports'

describe('buildPersonalRosterCsv', () => {
  it('exports stable headers and safely quotes spreadsheet content', () => {
    const csv = buildPersonalRosterCsv([
      {
        date: '2026-09-01',
        dutyCode: 'W',
        propertyName: 'Taru, Villas',
        roleName: 'Host',
        shiftCode: 'DAY',
        shiftTimes: '07:00–16:00',
        workingMinutes: 480,
        explanation: '=unsafe formula',
      },
    ])

    expect(csv.split('\n')[0]).toBe(
      'date,duty_code,property,role,shift,shift_times,working_minutes,explanation',
    )
    expect(csv).toContain('"Taru, Villas"')
    expect(csv).toContain("'=unsafe formula")
  })
})

describe('buildManagementRosterCsv', () => {
  it('orders employee identity before assignment details', () => {
    const csv = buildManagementRosterCsv([
      {
        employeeNumber: 'TV-001',
        employeeName: 'Ada Silva',
        date: '2026-09-01',
        dutyCode: 'S',
        propertyName: 'The Muse',
        roleName: 'Host',
        shiftCode: 'DAY',
        shiftTimes: '07:00–16:00',
        workingMinutes: 480,
        explanation: 'Same-hub relief',
      },
    ])

    expect(csv.split('\n')[0]).toBe(
      'employee_number,employee_name,date,duty_code,property,role,shift,shift_times,working_minutes,explanation',
    )
    expect(csv.split('\n')[1]).toContain('TV-001,Ada Silva,2026-09-01,S')
  })
})
