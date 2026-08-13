export interface PersonalRosterExportRow {
  date: string
  dutyCode: string
  propertyName: string
  roleName: string
  shiftCode: string
  shiftTimes: string
  workingMinutes: number
  explanation: string
}

export interface ManagementRosterExportRow extends PersonalRosterExportRow {
  employeeNumber: string
  employeeName: string
}

function spreadsheetSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function csvCell(value: string | number): string {
  const normalized = spreadsheetSafe(String(value))
  return /[",\n\r]/.test(normalized)
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized
}

export function buildPersonalRosterCsv(
  rows: PersonalRosterExportRow[],
): string {
  const header = [
    'date',
    'duty_code',
    'property',
    'role',
    'shift',
    'shift_times',
    'working_minutes',
    'explanation',
  ]
  const body = rows.map((row) =>
    [
      row.date,
      row.dutyCode,
      row.propertyName,
      row.roleName,
      row.shiftCode,
      row.shiftTimes,
      row.workingMinutes,
      row.explanation,
    ]
      .map(csvCell)
      .join(','),
  )
  return `${[header.join(','), ...body].join('\n')}\n`
}

export function buildManagementRosterCsv(
  rows: ManagementRosterExportRow[],
): string {
  const header = [
    'employee_number',
    'employee_name',
    'date',
    'duty_code',
    'property',
    'role',
    'shift',
    'shift_times',
    'working_minutes',
    'explanation',
  ]
  const body = rows.map((row) =>
    [
      row.employeeNumber,
      row.employeeName,
      row.date,
      row.dutyCode,
      row.propertyName,
      row.roleName,
      row.shiftCode,
      row.shiftTimes,
      row.workingMinutes,
      row.explanation,
    ]
      .map(csvCell)
      .join(','),
  )
  return `${[header.join(','), ...body].join('\n')}\n`
}
