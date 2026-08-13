import { describe, expect, it } from 'vitest'

import { previewRosterImport } from './imports'

describe('previewRosterImport', () => {
  it('parses quoted employee fields and normalizes optional values', () => {
    const csv = [
      'employee_number,full_name,department_code,role_code,base_property_code,residency_type,home_distance_km,start_date,is_active,end_date,secondary_role_codes,portal_email',
      'E-001,"Perera, Kasun",FB,WAITER,TV906,resident,52.5,2026-01-02,true,,"GSA; SUPPORT",kasun@taruvillas.com',
    ].join('\n')

    const result = previewRosterImport('employees', csv)

    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([
      expect.objectContaining({
        employeeNumber: 'E-001',
        fullName: 'Perera, Kasun',
        homeDistanceKm: 52.5,
        isActive: true,
        endDate: null,
        secondaryRoleCodes: ['GSA', 'SUPPORT'],
      }),
    ])
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('reports missing employee headers and duplicate stable keys', () => {
    const missing = previewRosterImport(
      'employees',
      'employee_number,full_name\nE-001,Kasun',
    )
    const duplicate = previewRosterImport(
      'employees',
      [
        'employee_number,full_name,department_code,role_code,base_property_code,residency_type,home_distance_km,start_date,is_active',
        'E-001,Kasun,FB,WAITER,TV906,resident,5,2026-01-01,true',
        'E-001,Nimal,FB,WAITER,TV906,commuter,4,2026-01-01,true',
      ].join('\n'),
    )

    expect(missing.errors).toContainEqual(
      expect.objectContaining({ row: 1, field: 'department_code' }),
    )
    expect(duplicate.errors).toContainEqual(
      expect.objectContaining({ row: 3, field: 'employee_number' }),
    )
  })

  it('validates employee residency, dates, booleans, and non-negative distance', () => {
    const result = previewRosterImport(
      'employees',
      [
        'employee_number,full_name,department_code,role_code,base_property_code,residency_type,home_distance_km,start_date,is_active,end_date',
        'E-001,Kasun,FB,WAITER,TV906,remote,-2,01/01/2026,yes,2025-12-31',
      ].join('\n'),
    )

    expect(result.errors.map((error) => error.field)).toEqual(
      expect.arrayContaining([
        'residency_type',
        'home_distance_km',
        'start_date',
        'is_active',
      ]),
    )
  })

  it('validates forecast values and selected month', () => {
    const result = previewRosterImport(
      'forecasts',
      [
        'property_code,date,occupancy_percent,arrivals_count,departures_count',
        'TV906,2026-09-01,76.5,3,2',
        'TV906,2026-10-01,110,-1,1.5',
      ].join('\n'),
      { month: '2026-09' },
    )

    expect(result.rows[0]).toEqual(
      expect.objectContaining({ occupancyPercent: 76.5, arrivalsCount: 3 }),
    )
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 3, field: 'date' }),
        expect.objectContaining({ row: 3, field: 'occupancy_percent' }),
        expect.objectContaining({ row: 3, field: 'arrivals_count' }),
        expect.objectContaining({ row: 3, field: 'departures_count' }),
      ]),
    )
  })

  it('validates inclusive unavailability ranges and known types', () => {
    const result = previewRosterImport(
      'unavailability',
      [
        'employee_number,start_date,end_date,type,reference,note',
        'E-001,2026-09-10,2026-09-08,holiday,REF-1,Approved',
      ].join('\n'),
    )

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, field: 'end_date' }),
        expect.objectContaining({ row: 2, field: 'type' }),
      ]),
    )
  })

  it('validates boundary minutes and rest category with row evidence', () => {
    const result = previewRosterImport(
      'boundary',
      [
        'employee_number,date,working_minutes,rest_category',
        'E-001,2026-08-31,-30,weekend',
      ].join('\n'),
    )

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, field: 'working_minutes' }),
        expect.objectContaining({ row: 2, field: 'rest_category' }),
      ]),
    )
  })
})
