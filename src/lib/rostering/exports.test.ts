import { describe, expect, it } from 'vitest'

import { buildPersonalRosterCsv } from './exports'

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
