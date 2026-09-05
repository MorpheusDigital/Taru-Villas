import { createHash } from 'node:crypto'
import { z } from 'zod/v4'
import { complianceSchema, type VehicleCompliance } from './vehicle-compliance'

export type ImportedVehicle = { name: string; registrationNo: string | null; compliance: VehicleCompliance }
type ExistingVehicle = { id: string; name: string; registrationNo: string | null; compliance: VehicleCompliance }

// The source is a transposed CSV, not one vehicle per row. Preserve quoted
// commas, escaped quotes, empty cells and embedded newlines before transposing.
function csvRows(input: string) {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false
  const source = input.replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { value += '"'; i++ }
      else if (quoted || value === '') quoted = !quoted
      else throw new Error('Invalid CSV quotation')
    } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
      row.push(value); value = ''
      if (char !== ',') { rows.push(row); row = []; if (char === '\r' && source[i + 1] === '\n') i++ }
    } else value += char
  }
  if (quoted) throw new Error('Unclosed CSV quotation')
  if (value || row.length) { row.push(value); rows.push(row) }
  return rows
}

export function normalizeRegistration(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(WP|CP|SP|NP|EP|NW|NC|SG|UP)(?=[A-Z])/, '')
}

export function matchImportedVehicle<T extends ExistingVehicle>(vehicle: ImportedVehicle, existing: T[]): T | undefined {
  const registration = vehicle.registrationNo && normalizeRegistration(vehicle.registrationNo)
  const matches = existing.filter(row => registration && row.registrationNo && normalizeRegistration(row.registrationNo) === registration)
  if (matches.length > 1) throw new Error(`Ambiguous registration match: ${vehicle.registrationNo}`)
  if (matches.length) return matches[0]
  const nameMatches = existing.filter(row => row.name.toUpperCase() === vehicle.name.toUpperCase()
    || (!row.registrationNo && row.name === 'Bolero Lorry' && vehicle.name === 'MAHINDRA BOLERO'))
  if (nameMatches.length > 1) throw new Error(`Ambiguous name match: ${vehicle.name}`)
  const matched = nameMatches[0]
  if (matched?.registrationNo && registration && normalizeRegistration(matched.registrationNo) !== registration) {
    throw new Error(`Conflicting registration for ${vehicle.name}`)
  }
  return matched
}

export function parseVehicleSheet(input: string, fileName: string): ImportedVehicle[] {
  const rows = csvRows(input)
  const header = rows.findIndex(row => row[1]?.trim() === 'VEHICLE TYPE')
  if (header < 0) throw new Error('CSV is missing VEHICLE TYPE')
  const vehicles: ImportedVehicle[] = []
  for (let column = 3; column < rows[header].length; column++) {
    const name = rows[header][column].trim()
    if (!name) continue
    let section = ''
    const cells: NonNullable<VehicleCompliance['sourceRecord']>['cells'] = []
    for (let index = header; index < rows.length; index++) {
      const row = rows[index]
      if (!row[1]?.trim() && !row[2]?.trim()) continue
      if (['Description', 'Licence'].includes(row[1]?.trim())) continue
      if (row[1]?.trim()) section = row[1].trim()
      cells.push({ row: index + 1, section, detail: row[2]?.trim() ?? '', value: row[column] ?? '' })
    }
    const get = (section: string, detail = '') => cells.find(cell => cell.section === section && cell.detail === detail)?.value.trim() ?? ''
    const warnings: string[] = []
    const details: Record<string, unknown> = {}
    const present = (value: string) => value !== '' && value !== '-' && value.toUpperCase() !== 'N/A'
    const set = (key: string, value: string) => { if (present(value)) details[key] = value }
    const date = (key: string, value: string, dayFirst = false) => {
      if (!present(value)) return
      const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      const iso = parts && `${parts[3]}-${parts[dayFirst ? 2 : 1].padStart(2, '0')}-${parts[dayFirst ? 1 : 2].padStart(2, '0')}`
      if (iso && z.iso.date().safeParse(iso).success) details[key] = iso
      else warnings.push(`${key}: unrecognized date "${value}"; retained in source.`)
    }
    const flag = (key: string, value: string) => {
      if (/^yes$/i.test(value)) details[key] = true
      else if (/^no$/i.test(value)) details[key] = false
    }
    for (const [key, label] of Object.entries({ chassisNo: 'CHASSIS NO', absoluteOwner: 'ABSOLUTE OWNERSHIP',
      assignedCustodian: 'ASSIGNED TO', driverName: 'DRIVER NAME', driverLicenceNo: 'DRIVER LICENCE', ownershipNotes: 'OWNERSHIP TYPE' })) set(key, get(label))
    const purchased = get('PURCHASED DATE')
    if (/^TRF\s*-/i.test(purchased)) date('transferDate', purchased.replace(/^TRF\s*-\s*/i, ''), true)
    else date('purchaseDate', purchased)
    date('driverLicenceExpiry', get('DRIVER LICENCE VALID'))
    date('leaseStart', get('START OF LEASE')); date('leaseEnd', get('END OF LEASE'))
    for (const [key, label] of Object.entries({ purchaseValue: 'PURCHASED VALUE', leasedValue: 'LEASED VALUE' })) {
      const value = get(label).replace(/,/g, '')
      if (present(value)) {
        if (/^\d{1,15}(\.\d{1,2})?$/.test(value)) details[key] = value
        else warnings.push(`${key}: unrecognized amount; retained in source.`)
      }
    }
    const tenure = get('TENURE OF LEASE')
    if (present(tenure)) {
      const months = tenure.match(/^(\d{1,4})\s*M$/i)
      if (months) details.leaseTenureMonths = months[1]
      else warnings.push('leaseTenureMonths: unrecognized tenure; retained in source.')
    }
    const ownership = get('OWNERSHIP TYPE').toUpperCase()
    if (ownership === 'OWNED') details.ownership = 'owned'
    else if (ownership === 'LEASED') details.ownership = 'leased'
    else if (ownership.startsWith('REFINANCE')) details.ownership = 'refinanced'
    set('bookOwner', get('AVAILABILITY OF ORIGINAL BOOK', 'OWNER OF THE BOOK'))
    for (const [kind, label] of [['revenueLicence', 'REVENUE LICENCE - RL'], ['insurance', 'INSURANCE'], ['emission', 'EMISSION TEST']]) {
      const valid = get(label, 'VALID')
      flag(`${kind}Valid`, valid)
      date(`${kind}Start`, get(label, 'PERIOD START')); date(`${kind}End`, get(label, 'PERIOD END'))
      const start = details[`${kind}Start`], end = details[`${kind}End`]
      if (typeof start === 'string' && typeof end === 'string' && start > end) {
        warnings.push(`${kind}: source expiry ${end} is before start ${start}. Both original dates retained below; confirm dates before scheduling renewals.`)
        delete details[`${kind}Start`]; delete details[`${kind}End`]
      }
      if (kind === 'emission' && valid.toUpperCase() === 'N/A') details.emissionRequired = false
      if (kind === 'insurance' && present(valid) && !/^(yes|no)$/i.test(valid)) set('insuranceStatusNote', valid)
    }
    for (const [key, section, label] of [
      ['revenueLicenceType', 'REVENUE LICENCE - RL', 'TYPE'], ['insurancePolicyNo', 'INSURANCE', 'POLICY NO'],
      ['insuranceProvider', 'INSURANCE', 'SERVICE PROVIDER'], ['key1', 'KEY', 'KEY - 1'], ['key2', 'KEY', 'KEY - 2'],
      ['rearKey', 'KEY', 'Rear Key'], ['gpsSim', 'GPS', 'SIM DETAIL'], ['serviceProvider', 'SERVICE PROVIDER', ''],
    ]) set(key, get(section, label))
    flag('gpsAvailable', get('GPS', 'AVAILABLE'))
    for (const [key, label] of [['bookCopy', 'BOOK COPY'], ['insuranceCopy', 'INSUARANCE'], ['revenueLicenceCopy', 'REVENUE LICENCE'], ['emissionCopy', 'EMISION TEST']]) flag(key, get('COPY AVAILABLE', label))
    if (get('COPY AVAILABLE', 'BOOK COPY') === 'Original - Yes') details.originalBookAvailable = true
    details.sourceRecord = { fileName, column, cells, warnings, digest: createHash('sha256').update(JSON.stringify(cells)).digest('hex') }
    vehicles.push({ name, registrationNo: get('VEHICLE NUMBER') || null, compliance: complianceSchema.parse(details) })
  }
  const registrations = vehicles.flatMap(v => v.registrationNo ? [normalizeRegistration(v.registrationNo)] : [])
  if (new Set(registrations).size !== registrations.length) throw new Error('Duplicate registration in CSV')
  if (new Set(vehicles.map(v => v.name.toUpperCase())).size !== vehicles.length) throw new Error('Duplicate vehicle name in CSV')
  if (!vehicles.length) throw new Error('CSV has no vehicle columns')
  return vehicles
}
