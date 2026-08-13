export type IsoDate = string
export type DutyCode =
  | 'W'
  | 'O'
  | 'H'
  | 'AL'
  | 'SL'
  | 'LIEU'
  | 'TRN'
  | 'T'
  | 'S'
export type LaborTier = 'fixed' | 'variable'
export type ResidencyType = 'resident' | 'commuter'
export type ViolationSeverity = 'hard' | 'soft'

export interface EngineProperty {
  id: string
  name: string
  kind: 'hub' | 'spoke'
  barCloseTime: string
  transportCutoff: string
  multiZoneSeparation: boolean
  safariFocus: boolean
  outsourcedSecurity: boolean
}

export interface EngineRole {
  id: string
  code: string
  name: string
  departmentCode: string
  laborTier: LaborTier
  sameHubReliefEligible: boolean
  isAreaManager: boolean
  isPropertyManager: boolean
  minimumFloor: number
}

export interface EngineEmployee {
  id: string
  employeeNumber: string
  fullName: string
  roleId: string
  skillRoleIds: string[]
  basePropertyId: string
  residencyType: ResidencyType
  homeDistanceKm: number
  employmentStartDate: IsoDate
  employmentEndDate: IsoDate | null
}

export interface EngineForecast {
  propertyId: string
  date: IsoDate
  occupancyPercent: number
  arrivalsCount: number
  departuresCount: number
}

export interface EngineUnavailability {
  employeeId: string
  startDate: IsoDate
  endDate: IsoDate
  dutyCode: Extract<DutyCode, 'AL' | 'SL' | 'LIEU' | 'TRN'>
}

export interface EngineBoundaryAssignment {
  employeeId: string
  date: IsoDate
  workingMinutes: number
  restCategory: 'none' | 'full' | 'half'
}

export interface EngineCadre {
  propertyId: string
  roleId: string
  requiredDailyActive: number
  reliefMultiplier: number
}

export interface EngineStaffingBand {
  propertyId: string
  roleId: string
  occupancyMin: number
  occupancyMax: number
  requiredActive: number
}

export interface EngineShiftTemplate {
  id: string
  code: string
  roleId: string
  scheduledMinutes: number
  breakMinutes: number
  workingMinutes: number
  segments: Array<{
    startTime: string
    endTime: string
    endsNextDay: boolean
  }>
}

export interface EnginePolicy {
  id: string
  workWeekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
  monthlyWorkdayTarget: number
  maxWorkingMinutesPerDay: number
  maxWorkingMinutesPerWeek: number
  fullRestDaysPerWeek: number
  halfRestDaysPerWeek: number
  travelDistanceThresholdKm: number
  areaManagerSpokeDays: number
  areaManagerOverlapDays: number
  residentTargetPercent: number
  commuterTargetPercent: number
}

export interface GenerationInput {
  hubId: string
  month: IsoDate
  policy: EnginePolicy
  properties: EngineProperty[]
  roles: EngineRole[]
  employees: EngineEmployee[]
  forecasts: EngineForecast[]
  unavailability: EngineUnavailability[]
  boundaryAssignments: EngineBoundaryAssignment[]
  cadre: EngineCadre[]
  staffingBands: EngineStaffingBand[]
  shiftTemplates: EngineShiftTemplate[]
}

export interface RoleDemand {
  propertyId: string
  date: IsoDate
  roleId: string
  requiredActive: number
  budgetedHeadcount: number
}

export interface ShiftSegment {
  startTime: string
  endTime: string
  endsNextDay: boolean
  sortOrder: number
}

export interface Assignment {
  employeeId: string
  date: IsoDate
  basePropertyId: string
  dutyPropertyId: string
  roleId: string
  dutyCode: DutyCode
  shiftTemplateId: string | null
  scheduledMinutes: number
  breakMinutes: number
  workingMinutes: number
  segments: ShiftSegment[]
  reasonCodes: string[]
  explanation: string
}

export interface Violation {
  ruleCode: string
  severity: ViolationSeverity
  message: string
  employeeId: string | null
  propertyId: string | null
  date: IsoDate | null
  evidence: Record<string, string | number | boolean | null>
}

export interface GenerationResult {
  assignments: Assignment[]
  demand: RoleDemand[]
  violations: Violation[]
}
