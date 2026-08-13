import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
} from 'drizzle-orm'

import { datesInMonth, previousBoundaryDates } from '../../rostering/dates'
import type {
  DutyCode,
  EnginePolicy,
  GenerationInput,
} from '../../rostering/types'
import { db } from '..'
import {
  properties,
  rosterAssignments,
  rosterBoundaryAssignments,
  rosterCadreRequirements,
  rosterCycles,
  rosterDepartments,
  rosterEmployees,
  rosterEmployeeSkills,
  rosterForecasts,
  rosterHubProperties,
  rosterHubs,
  rosterParticipants,
  rosterPolicyRules,
  rosterPolicyVersions,
  rosterPropertySettings,
  rosterRoles,
  rosterShiftTemplateSegments,
  rosterShiftTemplates,
  rosterStaffingBands,
  rosterUnavailability,
} from '../schema'

function monthEnd(month: string): string {
  return datesInMonth(month).at(-1)!
}

function asNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function requiredNumber(
  rows: Array<Record<string, unknown>>,
  field: string,
): number {
  for (const row of rows) {
    const value = asNumber(row[field] as string | number | null | undefined)
    if (value !== null) return value
  }
  throw new Error(`Rostering setup is incomplete: policy rule ${field}`)
}

function buildPolicy(
  policyVersionId: string,
  rules: Array<Record<string, unknown>>,
): EnginePolicy {
  return {
    id: policyVersionId,
    workWeekStartsOn: requiredNumber(rules, 'workWeekStartsOn') as EnginePolicy['workWeekStartsOn'],
    monthlyWorkdayTarget: requiredNumber(rules, 'monthlyWorkdayTarget'),
    maxWorkingMinutesPerDay: requiredNumber(rules, 'maxWorkingMinutesPerDay'),
    maxWorkingMinutesPerWeek: requiredNumber(rules, 'maxWorkingMinutesPerWeek'),
    fullRestDaysPerWeek: requiredNumber(rules, 'fullRestDaysPerWeek'),
    halfRestDaysPerWeek: requiredNumber(rules, 'halfRestDaysPerWeek'),
    travelDistanceThresholdKm: requiredNumber(rules, 'travelDistanceThresholdKm'),
    areaManagerSpokeDays: requiredNumber(rules, 'areaManagerSpokeDays'),
    areaManagerOverlapDays: requiredNumber(rules, 'areaManagerOverlapDays'),
    residentTargetPercent: requiredNumber(rules, 'residentTargetPercent'),
    commuterTargetPercent: requiredNumber(rules, 'commuterTargetPercent'),
  }
}

function unavailabilityDutyCode(type: string): Extract<
  DutyCode,
  'AL' | 'SL' | 'LIEU' | 'TRN'
> {
  if (type === 'annual_leave') return 'AL'
  if (type === 'sick_leave') return 'SL'
  if (type === 'lieu') return 'LIEU'
  return 'TRN'
}

export async function listActiveRosteringHubs(orgId: string) {
  const rows = await db
    .select({
      hubId: rosterHubs.id,
      hubName: rosterHubs.name,
      hubCode: rosterHubs.code,
      propertyId: properties.id,
      propertyName: properties.name,
      propertyCode: properties.code,
      kind: rosterHubProperties.kind,
    })
    .from(rosterHubs)
    .innerJoin(
      rosterHubProperties,
      eq(rosterHubProperties.hubId, rosterHubs.id),
    )
    .innerJoin(properties, eq(properties.id, rosterHubProperties.propertyId))
    .where(
      and(
        eq(rosterHubs.orgId, orgId),
        eq(rosterHubs.isActive, true),
        eq(rosterHubProperties.isActive, true),
        eq(properties.isActive, true),
      ),
    )
    .orderBy(asc(rosterHubs.name), asc(properties.name))

  const hubs = new Map<
    string,
    {
      id: string
      name: string
      code: string
      properties: Array<{
        id: string
        name: string
        code: string
        kind: 'hub' | 'spoke'
      }>
    }
  >()
  for (const row of rows) {
    const hub = hubs.get(row.hubId) ?? {
      id: row.hubId,
      name: row.hubName,
      code: row.hubCode,
      properties: [],
    }
    hub.properties.push({
      id: row.propertyId,
      name: row.propertyName,
      code: row.propertyCode,
      kind: row.kind,
    })
    hubs.set(row.hubId, hub)
  }
  return [...hubs.values()]
}

export async function buildGenerationInput(
  orgId: string,
  hubId: string,
  month: string,
): Promise<GenerationInput> {
  const dates = datesInMonth(month)
  const end = monthEnd(month)
  const [hub] = await db
    .select()
    .from(rosterHubs)
    .where(
      and(
        eq(rosterHubs.id, hubId),
        eq(rosterHubs.orgId, orgId),
        eq(rosterHubs.isActive, true),
      ),
    )
    .limit(1)
  if (!hub) throw new Error('Hub not found')

  const propertyRows = await db
    .select({
      id: properties.id,
      name: properties.name,
      kind: rosterHubProperties.kind,
      barCloseTime: rosterPropertySettings.barCloseTime,
      transportCutoff: rosterPropertySettings.transportCutoff,
      multiZoneSeparation: rosterPropertySettings.multiZoneSeparation,
      safariFocus: rosterPropertySettings.safariFocus,
      outsourcedSecurity: rosterPropertySettings.outsourcedSecurity,
    })
    .from(rosterHubProperties)
    .innerJoin(properties, eq(properties.id, rosterHubProperties.propertyId))
    .leftJoin(
      rosterPropertySettings,
      eq(rosterPropertySettings.propertyId, rosterHubProperties.propertyId),
    )
    .where(
      and(
        eq(rosterHubProperties.hubId, hubId),
        eq(rosterHubProperties.isActive, true),
        eq(properties.orgId, orgId),
        eq(properties.isActive, true),
      ),
    )
    .orderBy(asc(properties.id))

  if (propertyRows.length === 0) {
    throw new Error('Rostering setup is incomplete: hub has no active properties')
  }
  const incompleteProperty = propertyRows.find(
    (row) => row.barCloseTime === null || row.transportCutoff === null,
  )
  if (incompleteProperty) {
    throw new Error(
      `Rostering setup is incomplete: property settings for ${incompleteProperty.name}`,
    )
  }
  const propertyIds = propertyRows.map((row) => row.id)

  const policies = await db
    .select()
    .from(rosterPolicyVersions)
    .where(
      and(
        eq(rosterPolicyVersions.orgId, orgId),
        eq(rosterPolicyVersions.status, 'active'),
        lte(rosterPolicyVersions.effectiveFrom, month),
        or(
          isNull(rosterPolicyVersions.effectiveTo),
          gte(rosterPolicyVersions.effectiveTo, end),
        ),
      ),
    )
    .orderBy(asc(rosterPolicyVersions.id))
  if (policies.length !== 1) {
    throw new Error('No active approved roster policy covers this month')
  }
  const policyVersion = policies[0]
  const policyRuleRows = await db
    .select()
    .from(rosterPolicyRules)
    .where(eq(rosterPolicyRules.policyVersionId, policyVersion.id))
    .orderBy(asc(rosterPolicyRules.ruleCode))
  if (policyRuleRows.length === 0) {
    throw new Error('Rostering setup is incomplete: policy rules')
  }
  const policy = buildPolicy(
    policyVersion.id,
    policyRuleRows as unknown as Array<Record<string, unknown>>,
  )

  const roleRows = await db
    .select({
      id: rosterRoles.id,
      code: rosterRoles.code,
      name: rosterRoles.name,
      departmentCode: rosterDepartments.code,
      laborTier: rosterRoles.laborTier,
      sameHubReliefEligible: rosterRoles.sameHubReliefEligible,
      isAreaManager: rosterRoles.isAreaManager,
      isPropertyManager: rosterRoles.isPropertyManager,
      minimumFloor: rosterRoles.minimumFloor,
    })
    .from(rosterRoles)
    .innerJoin(
      rosterDepartments,
      eq(rosterDepartments.id, rosterRoles.departmentId),
    )
    .where(
      and(eq(rosterRoles.orgId, orgId), eq(rosterRoles.isActive, true)),
    )
    .orderBy(asc(rosterRoles.id))
  if (roleRows.length === 0) {
    throw new Error('Rostering setup is incomplete: active roles')
  }
  const roleIds = roleRows.map((row) => row.id)

  const employeeRows = await db
    .select()
    .from(rosterEmployees)
    .where(
      and(
        eq(rosterEmployees.orgId, orgId),
        eq(rosterEmployees.isActive, true),
        inArray(rosterEmployees.basePropertyId, propertyIds),
        lte(rosterEmployees.employmentStartDate, end),
        or(
          isNull(rosterEmployees.employmentEndDate),
          gte(rosterEmployees.employmentEndDate, month),
        ),
      ),
    )
    .orderBy(asc(rosterEmployees.employeeNumber), asc(rosterEmployees.id))
  const employeeIds = employeeRows.map((row) => row.id)
  const skillRows = employeeIds.length
    ? await db
        .select()
        .from(rosterEmployeeSkills)
        .where(inArray(rosterEmployeeSkills.employeeId, employeeIds))
        .orderBy(asc(rosterEmployeeSkills.employeeId), asc(rosterEmployeeSkills.roleId))
    : []

  const forecastRows = await db
    .select()
    .from(rosterForecasts)
    .where(
      and(
        inArray(rosterForecasts.propertyId, propertyIds),
        inArray(rosterForecasts.forecastDate, dates),
      ),
    )
    .orderBy(asc(rosterForecasts.propertyId), asc(rosterForecasts.forecastDate))
  const forecastKeys = new Set(
    forecastRows.map((row) => `${row.propertyId}/${row.forecastDate}`),
  )
  for (const property of propertyRows) {
    for (const date of dates) {
      if (!forecastKeys.has(`${property.id}/${date}`)) {
        throw new Error(`Forecast missing for ${property.name} on ${date}`)
      }
    }
  }

  const cadreRows = await db
    .select()
    .from(rosterCadreRequirements)
    .where(
      and(
        inArray(rosterCadreRequirements.propertyId, propertyIds),
        inArray(rosterCadreRequirements.roleId, roleIds),
        lte(rosterCadreRequirements.effectiveFrom, month),
        or(
          isNull(rosterCadreRequirements.effectiveTo),
          gte(rosterCadreRequirements.effectiveTo, end),
        ),
      ),
    )
    .orderBy(asc(rosterCadreRequirements.propertyId), asc(rosterCadreRequirements.roleId))
  const bandRows = await db
    .select()
    .from(rosterStaffingBands)
    .where(
      and(
        inArray(rosterStaffingBands.propertyId, propertyIds),
        inArray(rosterStaffingBands.roleId, roleIds),
        lte(rosterStaffingBands.effectiveFrom, month),
        or(
          isNull(rosterStaffingBands.effectiveTo),
          gte(rosterStaffingBands.effectiveTo, end),
        ),
      ),
    )
    .orderBy(
      asc(rosterStaffingBands.propertyId),
      asc(rosterStaffingBands.roleId),
      asc(rosterStaffingBands.occupancyMin),
    )
  if (cadreRows.length !== propertyIds.length * roleIds.length) {
    throw new Error('Rostering setup is incomplete: effective cadre')
  }

  const unavailabilityRows = employeeIds.length
    ? await db
        .select()
        .from(rosterUnavailability)
        .where(
          and(
            inArray(rosterUnavailability.employeeId, employeeIds),
            lte(rosterUnavailability.startDate, end),
            gte(rosterUnavailability.endDate, month),
          ),
        )
        .orderBy(asc(rosterUnavailability.employeeId), asc(rosterUnavailability.startDate))
    : []

  const boundaryDates = previousBoundaryDates(month, policy.workWeekStartsOn)
  const publishedBoundaryRows = employeeIds.length && boundaryDates.length
    ? await db
        .select({
          employeeId: rosterParticipants.employeeId,
          date: rosterAssignments.assignmentDate,
          workingMinutes: rosterAssignments.workingMinutes,
          dutyCode: rosterAssignments.dutyCode,
        })
        .from(rosterAssignments)
        .innerJoin(
          rosterCycles,
          eq(rosterCycles.id, rosterAssignments.cycleId),
        )
        .innerJoin(
          rosterParticipants,
          eq(rosterParticipants.id, rosterAssignments.participantId),
        )
        .where(
          and(
            eq(rosterCycles.orgId, orgId),
            inArray(rosterCycles.status, ['published', 'superseded']),
            inArray(rosterParticipants.employeeId, employeeIds),
            inArray(rosterAssignments.assignmentDate, boundaryDates),
          ),
        )
        .orderBy(asc(rosterParticipants.employeeId), asc(rosterAssignments.assignmentDate))
    : []
  const manualBoundaryRows = employeeIds.length && boundaryDates.length
    ? await db
        .select()
        .from(rosterBoundaryAssignments)
        .where(
          and(
            inArray(rosterBoundaryAssignments.employeeId, employeeIds),
            inArray(rosterBoundaryAssignments.assignmentDate, boundaryDates),
          ),
        )
        .orderBy(asc(rosterBoundaryAssignments.employeeId), asc(rosterBoundaryAssignments.assignmentDate))
    : []
  const publishedByKey = new Map(
    publishedBoundaryRows
      .filter((row): row is typeof row & { employeeId: string } => row.employeeId !== null)
      .map((row) => [`${row.employeeId}/${row.date}`, row]),
  )
  const manualByKey = new Map(
    manualBoundaryRows.map((row) => [`${row.employeeId}/${row.assignmentDate}`, row]),
  )
  const boundaryAssignments: GenerationInput['boundaryAssignments'] = []
  for (const employee of employeeRows) {
    for (const date of boundaryDates) {
      const published = publishedByKey.get(`${employee.id}/${date}`)
      const manual = manualByKey.get(`${employee.id}/${date}`)
      if (!published && !manual) {
        throw new Error(
          `Prior-week boundary context missing for ${employee.employeeNumber} on ${date}`,
        )
      }
      boundaryAssignments.push(
        published
          ? {
              employeeId: employee.id,
              date,
              workingMinutes: published.workingMinutes,
              restCategory:
                published.dutyCode === 'O'
                  ? 'full'
                  : published.dutyCode === 'H'
                    ? 'half'
                    : 'none',
            }
          : {
              employeeId: employee.id,
              date,
              workingMinutes: manual!.workingMinutes,
              restCategory: manual!.restCategory,
            },
      )
    }
  }

  const templateRows = await db
    .select()
    .from(rosterShiftTemplates)
    .where(
      and(
        eq(rosterShiftTemplates.policyVersionId, policyVersion.id),
        eq(rosterShiftTemplates.isPublished, true),
      ),
    )
    .orderBy(asc(rosterShiftTemplates.roleId), asc(rosterShiftTemplates.code))
  const templateIds = templateRows.map((row) => row.id)
  const segmentRows = templateIds.length
    ? await db
        .select()
        .from(rosterShiftTemplateSegments)
        .where(inArray(rosterShiftTemplateSegments.shiftTemplateId, templateIds))
        .orderBy(asc(rosterShiftTemplateSegments.shiftTemplateId), asc(rosterShiftTemplateSegments.sortOrder))
    : []

  return {
    hubId,
    month,
    policy,
    properties: propertyRows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      barCloseTime: row.barCloseTime!.slice(0, 5),
      transportCutoff: row.transportCutoff!.slice(0, 5),
      multiZoneSeparation: row.multiZoneSeparation!,
      safariFocus: row.safariFocus!,
      outsourcedSecurity: row.outsourcedSecurity!,
    })),
    roles: roleRows,
    employees: employeeRows.map((row) => ({
      id: row.id,
      employeeNumber: row.employeeNumber,
      fullName: row.fullName,
      roleId: row.roleId,
      skillRoleIds: skillRows
        .filter((skill) => skill.employeeId === row.id)
        .map((skill) => skill.roleId),
      basePropertyId: row.basePropertyId,
      residencyType: row.residencyType,
      homeDistanceKm: Number(row.homeDistanceKm),
      employmentStartDate: row.employmentStartDate,
      employmentEndDate: row.employmentEndDate,
    })),
    forecasts: forecastRows.map((row) => ({
      propertyId: row.propertyId,
      date: row.forecastDate,
      occupancyPercent: Number(row.occupancyPercent),
      arrivalsCount: row.arrivalsCount,
      departuresCount: row.departuresCount,
    })),
    unavailability: unavailabilityRows.map((row) => ({
      employeeId: row.employeeId,
      startDate: row.startDate,
      endDate: row.endDate,
      dutyCode: unavailabilityDutyCode(row.type),
    })),
    boundaryAssignments,
    cadre: cadreRows.map((row) => ({
      propertyId: row.propertyId,
      roleId: row.roleId,
      requiredDailyActive: row.requiredDailyActive,
      reliefMultiplier: Number(row.reliefMultiplier),
    })),
    staffingBands: bandRows.map((row) => ({
      propertyId: row.propertyId,
      roleId: row.roleId,
      occupancyMin: Number(row.occupancyMin),
      occupancyMax: Number(row.occupancyMax),
      requiredActive: row.requiredActive,
    })),
    shiftTemplates: templateRows.map((row) => ({
      id: row.id,
      code: row.code,
      roleId: row.roleId,
      scheduledMinutes: row.scheduledMinutes,
      breakMinutes: row.breakMinutes,
      workingMinutes: row.workingMinutes,
      segments: segmentRows
        .filter((segment) => segment.shiftTemplateId === row.id)
        .map((segment) => ({
          startTime: segment.startTime.slice(0, 5),
          endTime: segment.endTime.slice(0, 5),
          endsNextDay: segment.endsNextDay,
        })),
    })),
  }
}
