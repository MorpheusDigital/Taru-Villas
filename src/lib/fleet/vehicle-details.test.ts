import { describe, expect, it } from 'vitest'
import { complianceSchema, renewalCandidates } from './vehicle-compliance'

describe('extended vehicle details', () => {
  it('retains purchase, finance, custody and driver fields through validation', () => {
    const details = {
      chassisNo: 'TEST-CHASSIS', purchaseDate: '2024-12-23', transferDate: '2023-03-20',
      ownership: 'refinanced', ownershipNotes: 'Third refinance', absoluteOwner: 'Example bank',
      purchaseValue: '4536142.98', leasedValue: '0.00', leaseTenureMonths: '60',
      leaseStart: '2024-08-29', leaseEnd: '2029-08-28', assignedCustodian: 'Purchasing manager',
      driverName: 'Example driver', driverLicenceNo: 'TEST-LICENCE', driverLicenceExpiry: '2028-01-22',
      emissionRequired: false, insuranceStatusNote: 'COVER', recordNotes: 'Capacity not supplied',
      sourceRecord: { fileName: 'vehicles.csv', digest: 'a'.repeat(64), column: 3,
        cells: [{ row: 12, section: 'Vehicle', detail: 'Registration', value: 'WP TEST 1234' }],
        warnings: ['Expiry precedes start; see original values.'] },
    }
    expect(complianceSchema.parse(details)).toEqual(details)
  })

  it('validates money and lease tenure without rounding or treating missing as zero', () => {
    expect(complianceSchema.safeParse({ purchaseValue: '-100' }).success).toBe(false)
    expect(complianceSchema.safeParse({ leasedValue: '1,000.00' }).success).toBe(false)
    expect(complianceSchema.safeParse({ leaseTenureMonths: '1.5' }).success).toBe(false)
    expect(complianceSchema.parse({ purchaseValue: null }).purchaseValue).toBeNull()
  })

  it('does not schedule emission tasks for vehicles recorded as not applicable', () => {
    expect(renewalCandidates({ status: 'active', administrationManagerId: 'manager', renewalLeadDays: 30,
      compliance: { emissionRequired: false, emissionEnd: '2025-01-01' } }, '2026-09-05')).toEqual([])
  })
})
