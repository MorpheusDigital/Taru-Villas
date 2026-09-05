import { z } from 'zod/v4'
import { addDays } from './dates'

const text = z.string().trim().max(255).nullable().optional()
const flag = z.boolean().nullable().optional()
const calendarDate = z.iso.date().nullable().optional()
// Decimal strings preserve source precision and avoid floating-point currency rounding.
const money = z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, 'Enter a non-negative amount without commas').nullable().optional()

export const complianceSchema = z.object({
  originalBookAvailable: flag, bookOwner: text, ownership: z.enum(['leased', 'owned', 'refinanced']).nullable().optional(),
  chassisNo: text, purchaseDate: calendarDate, transferDate: calendarDate,
  ownershipNotes: text, absoluteOwner: text, purchaseValue: money, leasedValue: money,
  leaseTenureMonths: z.string().regex(/^\d{1,4}$/, 'Enter whole months').nullable().optional(),
  leaseStart: calendarDate, leaseEnd: calendarDate, assignedCustodian: text,
  driverName: text, driverLicenceNo: text, driverLicenceExpiry: calendarDate,
  emissionRequired: flag, insuranceStatusNote: text,
  recordNotes: z.string().max(4000).nullable().optional(),
  sourceRecord: z.object({
    fileName: z.string().max(255), digest: z.string().regex(/^[a-f0-9]{64}$/), column: z.number().int().min(3),
    cells: z.array(z.object({ row: z.number().int().positive(), section: z.string().max(255), detail: z.string().max(255), value: z.string().max(2000) })).max(200),
    warnings: z.array(z.string().max(1000)).max(100),
  }).nullable().optional(),
  revenueLicenceValid: flag, revenueLicenceType: text, revenueLicenceStart: calendarDate, revenueLicenceEnd: calendarDate,
  insuranceValid: flag, insurancePolicyNo: text, insuranceStart: calendarDate, insuranceEnd: calendarDate, insuranceProvider: text,
  emissionValid: flag, emissionStart: calendarDate, emissionEnd: calendarDate,
  key1: text, key2: text, rearKey: text, gpsAvailable: flag, gpsSim: text, serviceProvider: text,
  bookCopy: flag, insuranceCopy: flag, revenueLicenceCopy: flag, emissionCopy: flag,
}).superRefine((data, ctx) => {
  for (const kind of ['revenueLicence', 'insurance', 'emission'] as const) {
    const start = data[`${kind}Start`]
    const end = data[`${kind}End`]
    if (start && end && start > end) ctx.addIssue({ code: 'custom', path: [`${kind}End`], message: 'Expiry must be on or after the start date' })
  }
})
export type VehicleCompliance = z.infer<typeof complianceSchema>

export const vehicleInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  registrationNo: z.string().trim().max(50).nullable().optional(),
  maxPassengers: z.number().int().min(0).max(60),
  cargoCapable: z.boolean().default(false), isRestricted: z.boolean().default(false),
  status: z.enum(['active', 'maintenance', 'retired']).default('active'),
  currentLocationPropertyId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().default(0),
  administrationManagerId: z.string().uuid().nullable().optional(),
  renewalLeadDays: z.number().int().min(0).max(365).default(30),
  compliance: complianceSchema.optional(),
})

// Zod v4 applies defaults even inside partial(). Updates must not reintroduce
// create defaults and reset fields omitted by callers.
export const vehiclePatchSchema = vehicleInputSchema.extend({
  cargoCapable: z.boolean(), isRestricted: z.boolean(),
  status: z.enum(['active', 'maintenance', 'retired']),
  sortOrder: z.number().int(), renewalLeadDays: z.number().int().min(0).max(365),
}).partial()

export const renewalKinds = [
  { kind: 'revenueLicence', label: 'Revenue licence' },
  { kind: 'insurance', label: 'Insurance' },
  { kind: 'emission', label: 'Emission test' },
] as const
export type RenewalKind = typeof renewalKinds[number]['kind']

export function renewalCandidates(vehicle: {
  status: string; administrationManagerId: string | null; renewalLeadDays: number; compliance: VehicleCompliance
}, today: string) {
  if (vehicle.status === 'retired' || !vehicle.administrationManagerId) return []
  return renewalKinds.flatMap(({ kind, label }) => {
    if (kind === 'emission' && vehicle.compliance.emissionRequired === false) return []
    const expiry = vehicle.compliance[`${kind}End`]
    if (!expiry) return []
    const start = addDays(expiry, -vehicle.renewalLeadDays)
    return start <= today ? [{ kind, label, expiry, start }] : []
  })
}

export function documentStatus(expiry: string | null | undefined, valid: boolean | null | undefined, today: string, leadDays: number) {
  if (expiry && expiry < today) return 'Expired'
  if (valid === false) return 'Invalid'
  if (expiry && addDays(expiry, -leadDays) <= today) return 'Renewal due'
  if (!expiry) return 'Not recorded'
  return 'Current'
}
