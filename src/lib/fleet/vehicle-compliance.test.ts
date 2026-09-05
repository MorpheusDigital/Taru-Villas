import { describe, expect, it } from 'vitest'
import { complianceSchema, vehicleInputSchema, vehiclePatchSchema, renewalCandidates, documentStatus } from './vehicle-compliance'

describe('vehicle compliance validation', () => {
  it('keeps unknown metadata distinct from false and preserves SIM leading zeros', () => {
    expect(complianceSchema.parse({ gpsAvailable: false, gpsSim: '0761479625' })).toEqual({ gpsAvailable: false, gpsSim: '0761479625' })
    expect(complianceSchema.parse({})).toEqual({})
  })
  it.each(['2026-02-30', '2026-13-01', '09/05/2026'])('rejects impossible/non-ISO date %s', (date) => {
    expect(complianceSchema.safeParse({ insuranceEnd: date }).success).toBe(false)
  })
  it('rejects an inverted period', () => {
    expect(complianceSchema.safeParse({ insuranceStart: '2026-10-01', insuranceEnd: '2026-09-01' }).success).toBe(false)
  })
  it('defaults lead time and accepts legacy vehicle creates', () => {
    expect(vehicleInputSchema.parse({ name: 'Car', maxPassengers: 4 }).renewalLeadDays).toBe(30)
  })
  it('partial updates do not reset existing vehicle settings with create defaults', () => {
    expect(vehiclePatchSchema.parse({ compliance: { gpsAvailable: true } })).toEqual({ compliance: { gpsAvailable: true } })
    expect(vehiclePatchSchema.parse({})).toEqual({})
  })
  it.each([-1, 366, 1.5])('rejects invalid lead time %s', (renewalLeadDays) => {
    expect(vehicleInputSchema.safeParse({ name: 'Car', maxPassengers: 4, renewalLeadDays }).success).toBe(false)
  })
})

describe('renewal calendar', () => {
  const base = { status: 'active', administrationManagerId: 'manager', renewalLeadDays: 30 }
  it('includes the boundary and overdue documents, excluding future ones', () => {
    expect(renewalCandidates({ ...base, compliance: { revenueLicenceEnd: '2026-10-05', insuranceEnd: '2026-10-06', emissionEnd: '2026-09-04' } }, '2026-09-05')).toEqual([
      { kind: 'revenueLicence', label: 'Revenue licence', expiry: '2026-10-05', start: '2026-09-05' },
      { kind: 'emission', label: 'Emission test', expiry: '2026-09-04', start: '2026-08-05' },
    ])
  })
  it('handles leap days and custom lead times', () => {
    expect(renewalCandidates({ ...base, renewalLeadDays: 1, compliance: { insuranceEnd: '2028-03-01' } }, '2028-02-29')[0]?.start).toBe('2028-02-29')
  })
  it('does not schedule without a manager or for retired vehicles', () => {
    const compliance = { insuranceEnd: '2026-09-01' }
    expect(renewalCandidates({ ...base, compliance, administrationManagerId: null }, '2026-09-05')).toEqual([])
    expect(renewalCandidates({ ...base, compliance, status: 'retired' }, '2026-09-05')).toEqual([])
  })
  it('does not treat a manually valid but expired document as current', () => {
    expect(documentStatus('2026-09-04', true, '2026-09-05', 30)).toBe('Expired')
    expect(documentStatus(null, null, '2026-09-05', 30)).toBe('Not recorded')
    expect(documentStatus('2026-10-05', true, '2026-09-05', 30)).toBe('Renewal due')
  })
})
