import { createHash } from 'node:crypto'

export type RosterImportType =
  | 'employees'
  | 'forecasts'
  | 'unavailability'
  | 'boundary'

export interface ImportError {
  row: number
  field: string
  message: string
}

export interface EmployeeImportRow {
  employeeNumber: string
  fullName: string
  departmentCode: string
  roleCode: string
  basePropertyCode: string
  residencyType: 'resident' | 'commuter'
  homeDistanceKm: number
  startDate: string
  isActive: boolean
  endDate: string | null
  secondaryRoleCodes: string[]
  portalEmail: string | null
}

export interface ForecastImportRow {
  propertyCode: string
  date: string
  occupancyPercent: number
  arrivalsCount: number
  departuresCount: number
}

export interface UnavailabilityImportRow {
  employeeNumber: string
  startDate: string
  endDate: string
  type:
    | 'annual_leave'
    | 'sick_leave'
    | 'lieu'
    | 'training'
    | 'travel_restriction'
    | 'other'
  reference: string | null
  note: string | null
}

export interface BoundaryImportRow {
  employeeNumber: string
  date: string
  workingMinutes: number
  restCategory: 'none' | 'full' | 'half'
}

export type RosterImportRow =
  | EmployeeImportRow
  | ForecastImportRow
  | UnavailabilityImportRow
  | BoundaryImportRow

export interface ImportPreview {
  type: RosterImportType
  checksum: string
  headers: string[]
  rows: RosterImportRow[]
  summary: {
    totalRows: number
    validRows: number
    errorCount: number
  }
  errors: ImportError[]
}

interface PreviewOptions {
  month?: string
}

const contracts: Record<
  RosterImportType,
  { required: string[]; optional: string[] }
> = {
  employees: {
    required: [
      'employee_number',
      'full_name',
      'department_code',
      'role_code',
      'base_property_code',
      'residency_type',
      'home_distance_km',
      'start_date',
      'is_active',
    ],
    optional: ['end_date', 'secondary_role_codes', 'portal_email'],
  },
  forecasts: {
    required: [
      'property_code',
      'date',
      'occupancy_percent',
      'arrivals_count',
      'departures_count',
    ],
    optional: [],
  },
  unavailability: {
    required: [
      'employee_number',
      'start_date',
      'end_date',
      'type',
      'reference',
      'note',
    ],
    optional: [],
  },
  boundary: {
    required: [
      'employee_number',
      'date',
      'working_minutes',
      'rest_category',
    ],
    optional: [],
  },
}

export function canCommitRosterImport(
  type: RosterImportType,
  role: 'admin' | 'property_manager' | 'staff',
  accessiblePropertyIds: string[] | null,
  targetPropertyIds: string[],
): boolean {
  if (role === 'admin') return true
  if (role !== 'property_manager') return false
  if (type === 'employees' || type === 'boundary') return false

  const accessible = new Set(accessiblePropertyIds ?? [])
  return targetPropertyIds.every((propertyId) => accessible.has(propertyId))
}

function parseCsv(csv: string): { records: string[][]; parseError: string | null } {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < csv.length; index++) {
    const character = csv[index]
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"'
          index++
        } else {
          quoted = false
        }
      } else {
        field += character
      }
      continue
    }

    if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ',') {
      record.push(field)
      field = ''
    } else if (character === '\n') {
      record.push(field.replace(/\r$/, ''))
      if (record.some((value) => value.trim() !== '')) records.push(record)
      record = []
      field = ''
    } else {
      field += character
    }
  }

  if (quoted) return { records, parseError: 'Unclosed quoted field' }
  record.push(field.replace(/\r$/, ''))
  if (record.some((value) => value.trim() !== '')) records.push(record)
  return { records, parseError: null }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function requiredText(
  value: string,
  row: number,
  field: string,
  errors: ImportError[],
): string {
  const normalized = value.trim()
  if (!normalized) errors.push({ row, field, message: 'Value is required' })
  return normalized
}

function dateValue(
  value: string,
  row: number,
  field: string,
  errors: ImportError[],
): string {
  const normalized = value.trim()
  if (!isIsoDate(normalized)) {
    errors.push({ row, field, message: 'Use a valid YYYY-MM-DD date' })
  }
  return normalized
}

function decimalValue(
  value: string,
  row: number,
  field: string,
  errors: ImportError[],
  minimum = 0,
  maximum = Number.POSITIVE_INFINITY,
): number {
  const normalized = value.trim()
  const parsed = Number(normalized)
  if (
    normalized === '' ||
    !Number.isFinite(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    errors.push({
      row,
      field,
      message: `Use a number from ${minimum} to ${maximum === Number.POSITIVE_INFINITY ? 'any positive value' : maximum}`,
    })
  }
  return parsed
}

function integerValue(
  value: string,
  row: number,
  field: string,
  errors: ImportError[],
): number {
  const normalized = value.trim()
  const parsed = Number(normalized)
  if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(parsed)) {
    errors.push({ row, field, message: 'Use a non-negative whole number' })
  }
  return parsed
}

function booleanValue(
  value: string,
  row: number,
  field: string,
  errors: ImportError[],
): boolean {
  const normalized = value.trim().toLowerCase()
  if (!['true', 'false'].includes(normalized)) {
    errors.push({ row, field, message: 'Use true or false' })
  }
  return normalized === 'true'
}

function rowObject(
  headers: string[],
  values: string[],
  allowedHeaders: Set<string>,
): Record<string, string> {
  return {
    ...Object.fromEntries([...allowedHeaders].map((header) => [header, ''])),
    ...Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? '']),
    ),
  }
}

function employeeRow(
  raw: Record<string, string>,
  row: number,
  errors: ImportError[],
): EmployeeImportRow {
  const startDate = dateValue(raw.start_date, row, 'start_date', errors)
  const endDate = raw.end_date?.trim()
    ? dateValue(raw.end_date, row, 'end_date', errors)
    : null
  if (endDate && isIsoDate(startDate) && isIsoDate(endDate) && endDate < startDate) {
    errors.push({ row, field: 'end_date', message: 'End date cannot precede start date' })
  }
  const residency = raw.residency_type.trim().toLowerCase()
  if (!['resident', 'commuter'].includes(residency)) {
    errors.push({
      row,
      field: 'residency_type',
      message: 'Use resident or commuter',
    })
  }

  return {
    employeeNumber: requiredText(raw.employee_number, row, 'employee_number', errors),
    fullName: requiredText(raw.full_name, row, 'full_name', errors),
    departmentCode: requiredText(raw.department_code, row, 'department_code', errors).toUpperCase(),
    roleCode: requiredText(raw.role_code, row, 'role_code', errors).toUpperCase(),
    basePropertyCode: requiredText(raw.base_property_code, row, 'base_property_code', errors).toUpperCase(),
    residencyType: residency as EmployeeImportRow['residencyType'],
    homeDistanceKm: decimalValue(
      raw.home_distance_km,
      row,
      'home_distance_km',
      errors,
    ),
    startDate,
    isActive: booleanValue(raw.is_active, row, 'is_active', errors),
    endDate,
    secondaryRoleCodes: (raw.secondary_role_codes ?? '')
      .split(';')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
    portalEmail: raw.portal_email?.trim().toLowerCase() || null,
  }
}

function forecastRow(
  raw: Record<string, string>,
  row: number,
  errors: ImportError[],
  month?: string,
): ForecastImportRow {
  const date = dateValue(raw.date, row, 'date', errors)
  if (month && isIsoDate(date) && !date.startsWith(`${month}-`)) {
    errors.push({ row, field: 'date', message: `Date must be within ${month}` })
  }
  return {
    propertyCode: requiredText(raw.property_code, row, 'property_code', errors).toUpperCase(),
    date,
    occupancyPercent: decimalValue(
      raw.occupancy_percent,
      row,
      'occupancy_percent',
      errors,
      0,
      100,
    ),
    arrivalsCount: integerValue(raw.arrivals_count, row, 'arrivals_count', errors),
    departuresCount: integerValue(
      raw.departures_count,
      row,
      'departures_count',
      errors,
    ),
  }
}

function unavailabilityRow(
  raw: Record<string, string>,
  row: number,
  errors: ImportError[],
): UnavailabilityImportRow {
  const startDate = dateValue(raw.start_date, row, 'start_date', errors)
  const endDate = dateValue(raw.end_date, row, 'end_date', errors)
  if (isIsoDate(startDate) && isIsoDate(endDate) && endDate < startDate) {
    errors.push({
      row,
      field: 'end_date',
      message: 'End date cannot precede start date',
    })
  }
  const type = raw.type.trim().toLowerCase()
  const types = [
    'annual_leave',
    'sick_leave',
    'lieu',
    'training',
    'travel_restriction',
    'other',
  ]
  if (!types.includes(type)) {
    errors.push({ row, field: 'type', message: `Use one of: ${types.join(', ')}` })
  }
  return {
    employeeNumber: requiredText(raw.employee_number, row, 'employee_number', errors),
    startDate,
    endDate,
    type: type as UnavailabilityImportRow['type'],
    reference: raw.reference.trim() || null,
    note: raw.note.trim() || null,
  }
}

function boundaryRow(
  raw: Record<string, string>,
  row: number,
  errors: ImportError[],
): BoundaryImportRow {
  const restCategory = raw.rest_category.trim().toLowerCase()
  if (!['none', 'full', 'half'].includes(restCategory)) {
    errors.push({
      row,
      field: 'rest_category',
      message: 'Use none, full, or half',
    })
  }
  return {
    employeeNumber: requiredText(raw.employee_number, row, 'employee_number', errors),
    date: dateValue(raw.date, row, 'date', errors),
    workingMinutes: integerValue(
      raw.working_minutes,
      row,
      'working_minutes',
      errors,
    ),
    restCategory: restCategory as BoundaryImportRow['restCategory'],
  }
}

function stableKey(type: RosterImportType, row: RosterImportRow): string {
  if (type === 'employees') return (row as EmployeeImportRow).employeeNumber
  if (type === 'forecasts') {
    const forecast = row as ForecastImportRow
    return `${forecast.propertyCode}/${forecast.date}`
  }
  if (type === 'boundary') {
    const boundary = row as BoundaryImportRow
    return `${boundary.employeeNumber}/${boundary.date}`
  }
  const unavailable = row as UnavailabilityImportRow
  return [
    unavailable.employeeNumber,
    unavailable.startDate,
    unavailable.endDate,
    unavailable.type,
    unavailable.reference ?? '',
  ].join('/')
}

function keyField(type: RosterImportType): string {
  return type === 'forecasts' ? 'property_code' : 'employee_number'
}

export function previewRosterImport(
  type: RosterImportType,
  csv: string,
  options: PreviewOptions = {},
): ImportPreview {
  const errors: ImportError[] = []
  const parsed = parseCsv(csv.replace(/^\uFEFF/, ''))
  if (parsed.parseError) {
    errors.push({ row: 1, field: 'csv', message: parsed.parseError })
  }
  const headers = (parsed.records[0] ?? []).map((header) =>
    header.trim().toLowerCase(),
  )
  const contract = contracts[type]
  const allowed = new Set([...contract.required, ...contract.optional])
  for (const header of contract.required) {
    if (!headers.includes(header)) {
      errors.push({ row: 1, field: header, message: 'Required column is missing' })
    }
  }
  headers.forEach((header) => {
    if (header && !allowed.has(header)) {
      errors.push({ row: 1, field: header, message: 'Unknown column' })
    }
  })

  const rows: RosterImportRow[] = []
  const keys = new Set<string>()
  if (parsed.records.length <= 1) {
    errors.push({ row: 1, field: 'csv', message: 'CSV has no data rows' })
  }
  parsed.records.slice(1).forEach((values, index) => {
    const rowNumber = index + 2
    const before = errors.length
    if (values.length !== headers.length) {
      errors.push({
        row: rowNumber,
        field: 'csv',
        message: `Expected ${headers.length} columns but found ${values.length}`,
      })
    }
    const raw = rowObject(headers, values, allowed)
    const normalized =
      type === 'employees'
        ? employeeRow(raw, rowNumber, errors)
        : type === 'forecasts'
          ? forecastRow(raw, rowNumber, errors, options.month)
          : type === 'unavailability'
            ? unavailabilityRow(raw, rowNumber, errors)
            : boundaryRow(raw, rowNumber, errors)

    const key = stableKey(type, normalized)
    if (keys.has(key)) {
      errors.push({
        row: rowNumber,
        field: keyField(type),
        message: 'Duplicate stable key in this file',
      })
    }
    keys.add(key)
    if (errors.length === before) rows.push(normalized)
  })

  const checksum = createHash('sha256')
    .update(JSON.stringify({ type, headers, rows }))
    .digest('hex')
  return {
    type,
    checksum,
    headers,
    rows,
    summary: {
      totalRows: Math.max(0, parsed.records.length - 1),
      validRows: rows.length,
      errorCount: errors.length,
    },
    errors,
  }
}
