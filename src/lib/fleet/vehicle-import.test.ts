import { describe, expect, it } from 'vitest'
import { parseVehicleSheet, matchImportedVehicle } from './vehicle-import'

const sheet = `,VEHICLE TYPE,,TEST CAR,BUGGY
,VEHICLE NUMBER,,WP PF 1234,
,CHASSIS NO,,CHASSIS-1,
,PURCHASED DATE,,TRF - 20/3/2023,
,OWNERSHIP TYPE,,REFINANCE - 03rd,
,PURCHASED VALUE,,"4,536,142.98",
,LEASED VALUE,,0.00,
,TENURE OF LEASE,,60 M,
,ASSIGNED TO,,MGR - PURCHASING,
,DRIVER LICENCE,,TEST-LICENCE,
,REVENUE LICENCE - RL,VALID,Yes,
,,PERIOD START,9/23/2025,
,,PERIOD END,9/22/2025,
,INSURANCE,VALID,COVER,
,,PERIOD START,8/15/2025,
,,PERIOD END,8/14/2026,
,EMISSION TEST,VALID,N/A,
,,PERIOD END,N/A,
,KEY,KEY - 1,"Safe, ""office""",
`

describe('vehicle sheet import', () => {
  it('imports every column and preserves each source cell without guessing missing values', () => {
    const result = parseVehicleSheet(sheet, 'vehicles.csv')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ name: 'TEST CAR', registrationNo: 'WP PF 1234', compliance: {
      chassisNo: 'CHASSIS-1', transferDate: '2023-03-20', ownership: 'refinanced',
      ownershipNotes: 'REFINANCE - 03rd', purchaseValue: '4536142.98', leasedValue: '0.00',
      leaseTenureMonths: '60', assignedCustodian: 'MGR - PURCHASING', driverLicenceNo: 'TEST-LICENCE',
      insuranceStatusNote: 'COVER', emissionRequired: false, key1: 'Safe, "office"',
      insuranceStart: '2025-08-15', insuranceEnd: '2026-08-14',
    } })
    expect(result[0].compliance.revenueLicenceStart).toBeUndefined()
    expect(result[0].compliance.revenueLicenceEnd).toBeUndefined()
    expect(result[0].compliance.sourceRecord?.cells).toContainEqual({ row: 13, section: 'REVENUE LICENCE - RL', detail: 'PERIOD END', value: '9/22/2025' })
    expect(result[0].compliance.sourceRecord?.warnings.some(w => /revenueLicence/.test(w))).toBe(true)
    expect(result[1]).toMatchObject({ name: 'BUGGY', registrationNo: null })
    expect(result[1].compliance.purchaseValue).toBeUndefined()
    expect(result[0]).not.toHaveProperty('administrationManagerId')
  })

  it('matches province-prefixed registrations without touching generic cars', () => {
    const existing = [{ id: 'hilux', name: 'Toyota Hilux', registrationNo: 'PF1234', compliance: {} },
      { id: 'generic', name: 'Car 1', registrationNo: null, compliance: {} }]
    const [vehicle, buggy] = parseVehicleSheet(sheet, 'vehicles.csv')
    expect(matchImportedVehicle(vehicle, existing)?.id).toBe('hilux')
    expect(matchImportedVehicle(buggy, existing)).toBeUndefined()
  })

  it('rejects duplicate registrations, invalid CSV and ambiguous existing matches', () => {
    expect(() => parseVehicleSheet(sheet.replace('WP PF 1234,', 'WP PF 1234,PF1234'), 'vehicles.csv')).toThrow(/duplicate/i)
    expect(() => parseVehicleSheet(sheet + '"unclosed', 'vehicles.csv')).toThrow(/CSV/)
    const [vehicle] = parseVehicleSheet(sheet, 'vehicles.csv')
    expect(() => matchImportedVehicle(vehicle, [
      { id: 'a', name: 'A', registrationNo: 'PF1234', compliance: {} },
      { id: 'b', name: 'B', registrationNo: 'WP PF 1234', compliance: {} },
    ])).toThrow(/ambiguous/i)
  })

  it('keeps unparseable dates in the original source, with a warning', () => {
    const [vehicle] = parseVehicleSheet(sheet.replace('8/15/2025', '2/30/2025'), 'vehicles.csv')
    expect(vehicle.compliance.insuranceStart).toBeUndefined()
    expect(vehicle.compliance.sourceRecord?.warnings.some(w => /insuranceStart/.test(w))).toBe(true)
  })
})
