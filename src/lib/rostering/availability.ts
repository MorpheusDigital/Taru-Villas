import { datesInMonth, workWeekKey } from './dates'
import type { DutyCode, GenerationInput, IsoDate } from './types'

export interface AvailabilityDay {
  available: boolean
  fixedDutyCode: DutyCode | null
  reasonCode: string
}

export type AvailabilityByEmployee = Map<
  string,
  Map<IsoDate, AvailabilityDay>
>

function addDays(date: IsoDate, amount: number): IsoDate {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + amount)
  return parsed.toISOString().slice(0, 10)
}

function rotated<T>(values: T[], offset: number): T[] {
  if (values.length === 0) return []
  const start = offset % values.length
  return [...values.slice(start), ...values.slice(0, start)]
}

function setFixed(
  calendar: Map<IsoDate, AvailabilityDay>,
  date: IsoDate,
  dutyCode: DutyCode,
  reasonCode: string,
  available = false,
): void {
  if (!calendar.has(date)) return
  calendar.set(date, { available, fixedDutyCode: dutyCode, reasonCode })
}

function placeTravelDay(
  input: GenerationInput,
  employeeId: string,
  residencyType: 'resident' | 'commuter',
  homeDistanceKm: number,
  calendar: Map<IsoDate, AvailabilityDay>,
): void {
  if (
    residencyType !== 'resident' ||
    homeDistanceKm <= input.policy.travelDistanceThresholdKm
  ) {
    return
  }

  const annualLeave = input.unavailability
    .filter(
      (row) => row.employeeId === employeeId && row.dutyCode === 'AL',
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  if (!annualLeave) return

  const candidates = [
    addDays(annualLeave.startDate, -1),
    addDays(annualLeave.endDate, 1),
  ]
  const date = candidates.find(
    (candidate) => calendar.get(candidate)?.fixedDutyCode === null,
  )
  if (date) setFixed(calendar, date, 'T', 'PAID_TRAVEL_DAY')
}

function placeWeeklyRest(
  input: GenerationInput,
  employeeId: string,
  employeeIndex: number,
  calendar: Map<IsoDate, AvailabilityDay>,
): void {
  const datesByWeek = new Map<string, IsoDate[]>()
  for (const date of calendar.keys()) {
    const week = workWeekKey(date, input.policy.workWeekStartsOn)
    const dates = datesByWeek.get(week) ?? []
    dates.push(date)
    datesByWeek.set(week, dates)
  }

  const weeks = [...datesByWeek.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )
  weeks.forEach(([week, weekDates], weekIndex) => {
    const boundary = input.boundaryAssignments.filter(
      (row) =>
        row.employeeId === employeeId &&
        workWeekKey(row.date, input.policy.workWeekStartsOn) === week,
    )
    const fullAlready = boundary.filter(
      (row) => row.restCategory === 'full',
    ).length
    const halfAlready = boundary.filter(
      (row) => row.restCategory === 'half',
    ).length
    const fullNeeded = Math.max(
      0,
      input.policy.fullRestDaysPerWeek - fullAlready,
    )
    const halfNeeded = Math.max(
      0,
      input.policy.halfRestDaysPerWeek - halfAlready,
    )

    const candidates = rotated(
      weekDates.filter((date) => calendar.get(date)?.fixedDutyCode === null),
      employeeIndex + weekIndex,
    )
    let cursor = 0
    for (let count = 0; count < fullNeeded && cursor < candidates.length; count++) {
      setFixed(calendar, candidates[cursor++], 'O', 'WEEKLY_FULL_REST')
    }
    for (let count = 0; count < halfNeeded && cursor < candidates.length; count++) {
      setFixed(
        calendar,
        candidates[cursor++],
        'H',
        'WEEKLY_HALF_REST',
        true,
      )
    }
  })
}

export function buildAvailability(input: GenerationInput): AvailabilityByEmployee {
  const monthDates = datesInMonth(input.month)
  const calendars: AvailabilityByEmployee = new Map()
  const employees = [...input.employees].sort(
    (a, b) =>
      a.employeeNumber.localeCompare(b.employeeNumber) ||
      a.id.localeCompare(b.id),
  )

  employees.forEach((employee, employeeIndex) => {
    const calendar = new Map<IsoDate, AvailabilityDay>()
    for (const date of monthDates) {
      const employed =
        date >= employee.employmentStartDate &&
        (employee.employmentEndDate === null || date <= employee.employmentEndDate)
      calendar.set(
        date,
        employed
          ? { available: true, fixedDutyCode: null, reasonCode: 'AVAILABLE' }
          : {
              available: false,
              fixedDutyCode: 'O',
              reasonCode: 'OUTSIDE_EMPLOYMENT',
            },
      )
    }

    for (const row of input.unavailability
      .filter((item) => item.employeeId === employee.id)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))) {
      for (const date of monthDates) {
        if (date >= row.startDate && date <= row.endDate) {
          setFixed(
            calendar,
            date,
            row.dutyCode,
            'APPROVED_UNAVAILABILITY',
          )
        }
      }
    }

    placeTravelDay(
      input,
      employee.id,
      employee.residencyType,
      employee.homeDistanceKm,
      calendar,
    )
    placeWeeklyRest(input, employee.id, employeeIndex, calendar)
    calendars.set(employee.id, calendar)
  })

  return calendars
}
