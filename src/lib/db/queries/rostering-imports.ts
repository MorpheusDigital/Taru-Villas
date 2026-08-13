import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import {
  canCommitRosterImport,
  previewRosterImport,
  type BoundaryImportRow,
  type EmployeeImportRow,
  type ForecastImportRow,
  type RosterImportType,
  type UnavailabilityImportRow,
} from '../../rostering/imports'
import { db } from '..'
import {
  properties,
  profiles,
  rosterBoundaryAssignments,
  rosterCycles,
  rosterDepartments,
  rosterEmployees,
  rosterEmployeeSkills,
  rosterEvents,
  rosterForecasts,
  rosterImportBatches,
  rosterRoles,
  rosters,
  rosterUnavailability,
  rosterViolations,
} from '../schema'

export interface CommitRosterImportArgs {
  orgId: string
  actorId: string
  role: 'admin' | 'property_manager' | 'staff'
  accessiblePropertyIds: string[] | null
  type: RosterImportType
  csv: string
  checksum: string
  sourceFileName: string
  month?: string
}

interface CommitCounts {
  added: number
  updated: number
  unchanged: number
}

function emptyCounts(): CommitCounts {
  return { added: 0, updated: 0, unchanged: 0 }
}

function sameStrings(left: string[], right: string[]): boolean {
  return [...left].sort().join('|') === [...right].sort().join('|')
}

async function appendImportEvents(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orgId: string,
  propertyIds: string[],
  actorId: string,
  batchId: string,
  type: RosterImportType,
  checksum: string,
) {
  if (propertyIds.length === 0) return
  const cycles = await tx
    .selectDistinct({ id: rosterCycles.id, version: rosterCycles.version })
    .from(rosterCycles)
    .innerJoin(rosters, eq(rosters.cycleId, rosterCycles.id))
    .where(
      and(
        eq(rosterCycles.orgId, orgId),
        eq(rosterCycles.status, 'draft'),
        inArray(rosters.propertyId, propertyIds),
      ),
    )
  if (cycles.length === 0) return

  await tx
    .delete(rosterViolations)
    .where(
      and(
        inArray(
          rosterViolations.cycleId,
          cycles.map((cycle) => cycle.id),
        ),
        eq(rosterViolations.ruleCode, 'SOURCE_DATA_CHANGED'),
      ),
    )
    .returning()
  await tx
    .insert(rosterViolations)
    .values(
      cycles.map((cycle) => ({
        cycleId: cycle.id,
        ruleCode: 'SOURCE_DATA_CHANGED',
        severity: 'hard' as const,
        resolution: 'open' as const,
        message:
          'Approved source data changed after generation. Regenerate this draft before submission.',
        evidence: {
          batchId: batchId === 'manual' ? null : batchId,
          type,
          checksum: checksum === 'manual' ? null : checksum,
        },
      })),
    )
    .returning()

  await tx
    .insert(rosterEvents)
    .values(
      cycles.map((cycle) => ({
        cycleId: cycle.id,
        actorId,
        cycleVersion: cycle.version,
        eventType:
          batchId === 'manual'
            ? 'source_data_updated'
            : 'source_import_committed',
        context: {
          batchId: batchId === 'manual' ? null : batchId,
          type,
          checksum: checksum === 'manual' ? null : checksum,
        },
      })),
    )
    .returning()
}

export async function commitRosterImport({
  orgId,
  actorId,
  role,
  accessiblePropertyIds,
  type,
  csv,
  checksum,
  sourceFileName,
  month,
}: CommitRosterImportArgs) {
  const preview = previewRosterImport(type, csv, { month })
  if (preview.errors.length > 0) {
    throw new Error('Import contains validation errors')
  }
  if (preview.checksum !== checksum) {
    throw new Error('Import preview checksum does not match')
  }

  return db.transaction(async (tx) => {
    const propertyCodes = [
      ...new Set(
        preview.rows.flatMap((row) => {
          if ('propertyCode' in row) return [row.propertyCode]
          if ('basePropertyCode' in row) return [row.basePropertyCode]
          return []
        }),
      ),
    ]
    const propertyRows = propertyCodes.length
      ? await tx
          .select({ id: properties.id, code: properties.code })
          .from(properties)
          .where(
            and(
              eq(properties.orgId, orgId),
              eq(properties.isActive, true),
              inArray(properties.code, propertyCodes),
            ),
          )
          .orderBy(asc(properties.code))
      : []
    const propertyByCode = new Map(
      propertyRows.map((property) => [property.code.toUpperCase(), property.id]),
    )
    const missingProperty = propertyCodes.find(
      (code) => !propertyByCode.has(code.toUpperCase()),
    )
    if (missingProperty) {
      throw new Error(`Property code not found: ${missingProperty}`)
    }

    let employeeRows: Array<{
      id: string
      employeeNumber: string
      basePropertyId: string
    }> = []
    if (type === 'unavailability' || type === 'boundary') {
      const numbers = preview.rows.map(
        (row) => (row as UnavailabilityImportRow | BoundaryImportRow).employeeNumber,
      )
      employeeRows = numbers.length
        ? await tx
            .select({
              id: rosterEmployees.id,
              employeeNumber: rosterEmployees.employeeNumber,
              basePropertyId: rosterEmployees.basePropertyId,
            })
            .from(rosterEmployees)
            .where(
              and(
                eq(rosterEmployees.orgId, orgId),
                inArray(rosterEmployees.employeeNumber, numbers),
              ),
            )
            .orderBy(asc(rosterEmployees.employeeNumber))
        : []
      const found = new Set(employeeRows.map((employee) => employee.employeeNumber))
      const missingEmployee = numbers.find((number) => !found.has(number))
      if (missingEmployee) {
        throw new Error(`Employee number not found: ${missingEmployee}`)
      }
    }

    const targetPropertyIds = [
      ...new Set([
        ...propertyRows.map((property) => property.id),
        ...employeeRows.map((employee) => employee.basePropertyId),
      ]),
    ]
    if (
      !canCommitRosterImport(
        type,
        role,
        accessiblePropertyIds,
        targetPropertyIds,
      )
    ) {
      throw new Error('Forbidden')
    }

    const [batch] = await tx
      .insert(rosterImportBatches)
      .values({
        orgId,
        importType: type,
        sourceFileName,
        fileChecksum: checksum,
        status: 'committing',
        totalCount: preview.summary.totalRows,
        previewSummary: preview.summary,
      })
      .returning()
    const counts = emptyCounts()
    if (type === 'employees') {
      const rows = preview.rows as EmployeeImportRow[]
      const roleCodes = [
        ...new Set(
          rows.flatMap((row) => [row.roleCode, ...row.secondaryRoleCodes]),
        ),
      ]
      const roleRows = await tx
        .select({
          id: rosterRoles.id,
          code: rosterRoles.code,
          departmentCode: rosterDepartments.code,
        })
        .from(rosterRoles)
        .innerJoin(
          rosterDepartments,
          eq(rosterDepartments.id, rosterRoles.departmentId),
        )
        .where(
          and(
            eq(rosterRoles.orgId, orgId),
            eq(rosterRoles.isActive, true),
            inArray(rosterRoles.code, roleCodes),
          ),
        )
      const roleByCode = new Map(
        roleRows.map((row) => [row.code.toUpperCase(), row]),
      )
      for (const row of rows) {
        const primaryRole = roleByCode.get(row.roleCode)
        if (!primaryRole) throw new Error(`Role code not found: ${row.roleCode}`)
        if (primaryRole.departmentCode.toUpperCase() !== row.departmentCode) {
          throw new Error(
            `Role ${row.roleCode} does not belong to department ${row.departmentCode}`,
          )
        }
        const missingSkill = row.secondaryRoleCodes.find(
          (code) => !roleByCode.has(code),
        )
        if (missingSkill) throw new Error(`Role code not found: ${missingSkill}`)
      }

      const existing = rows.length
        ? await tx
            .select()
            .from(rosterEmployees)
            .where(
              and(
                eq(rosterEmployees.orgId, orgId),
                inArray(
                  rosterEmployees.employeeNumber,
                  rows.map((row) => row.employeeNumber),
                ),
              ),
            )
        : []
      const existingByNumber = new Map(
        existing.map((employee) => [employee.employeeNumber, employee]),
      )
      const existingSkills = existing.length
        ? await tx
            .select()
            .from(rosterEmployeeSkills)
            .where(
              inArray(
                rosterEmployeeSkills.employeeId,
                existing.map((employee) => employee.id),
              ),
            )
        : []

      for (const row of rows) {
        const prior = existingByNumber.get(row.employeeNumber)
        const roleId = roleByCode.get(row.roleCode)!.id
        const basePropertyId = propertyByCode.get(row.basePropertyCode)!
        const skillRoleIds = [
          roleId,
          ...row.secondaryRoleCodes.map((code) => roleByCode.get(code)!.id),
        ]
        const priorSkillRoleIds = prior
          ? existingSkills
              .filter((skill) => skill.employeeId === prior.id)
              .map((skill) => skill.roleId)
          : []
        const unchanged =
          prior !== undefined &&
          prior.fullName === row.fullName &&
          prior.roleId === roleId &&
          prior.basePropertyId === basePropertyId &&
          prior.residencyType === row.residencyType &&
          Number(prior.homeDistanceKm) === row.homeDistanceKm &&
          prior.employmentStartDate === row.startDate &&
          prior.employmentEndDate === row.endDate &&
          prior.isActive === row.isActive &&
          sameStrings(priorSkillRoleIds, skillRoleIds)
        if (!prior) counts.added++
        else if (unchanged) counts.unchanged++
        else counts.updated++

        const [saved] = await tx
          .insert(rosterEmployees)
          .values({
            orgId,
            employeeNumber: row.employeeNumber,
            fullName: row.fullName,
            roleId,
            basePropertyId,
            residencyType: row.residencyType,
            homeDistanceKm: row.homeDistanceKm.toFixed(2),
            employmentStartDate: row.startDate,
            employmentEndDate: row.endDate,
            isActive: row.isActive,
            isDemo: false,
          })
          .onConflictDoUpdate({
            target: [rosterEmployees.orgId, rosterEmployees.employeeNumber],
            set: {
              fullName: sql`excluded.full_name`,
              roleId: sql`excluded.role_id`,
              basePropertyId: sql`excluded.base_property_id`,
              residencyType: sql`excluded.residency_type`,
              homeDistanceKm: sql`excluded.home_distance_km`,
              employmentStartDate: sql`excluded.employment_start_date`,
              employmentEndDate: sql`excluded.employment_end_date`,
              isActive: sql`excluded.is_active`,
              updatedAt: new Date(),
            },
          })
          .returning({ id: rosterEmployees.id })
        await tx
          .delete(rosterEmployeeSkills)
          .where(eq(rosterEmployeeSkills.employeeId, saved.id))
          .returning()
        await tx
          .insert(rosterEmployeeSkills)
          .values(
            skillRoleIds.map((skillRoleId) => ({
              employeeId: saved.id,
              roleId: skillRoleId,
              isPrimary: skillRoleId === roleId,
            })),
          )
          .returning()
      }
    } else if (type === 'forecasts') {
      const rows = preview.rows as ForecastImportRow[]
      const existing = rows.length
        ? await tx
            .select()
            .from(rosterForecasts)
            .where(
              and(
                inArray(rosterForecasts.propertyId, targetPropertyIds),
                inArray(
                  rosterForecasts.forecastDate,
                  rows.map((row) => row.date),
                ),
              ),
            )
        : []
      const existingByKey = new Map(
        existing.map((row) => [`${row.propertyId}/${row.forecastDate}`, row]),
      )
      for (const row of rows) {
        const propertyId = propertyByCode.get(row.propertyCode)!
        const prior = existingByKey.get(`${propertyId}/${row.date}`)
        const unchanged =
          prior !== undefined &&
          Number(prior.occupancyPercent) === row.occupancyPercent &&
          prior.arrivalsCount === row.arrivalsCount &&
          prior.departuresCount === row.departuresCount
        if (!prior) counts.added++
        else if (unchanged) counts.unchanged++
        else counts.updated++
      }
      if (rows.length) {
        await tx
          .insert(rosterForecasts)
          .values(
            rows.map((row) => ({
              propertyId: propertyByCode.get(row.propertyCode)!,
              forecastDate: row.date,
              occupancyPercent: row.occupancyPercent.toFixed(2),
              arrivalsCount: row.arrivalsCount,
              departuresCount: row.departuresCount,
              source: 'csv' as const,
              importBatchId: batch.id,
              updatedBy: actorId,
            })),
          )
          .onConflictDoUpdate({
            target: [rosterForecasts.propertyId, rosterForecasts.forecastDate],
            set: {
              occupancyPercent: sql`excluded.occupancy_percent`,
              arrivalsCount: sql`excluded.arrivals_count`,
              departuresCount: sql`excluded.departures_count`,
              source: 'csv',
              updatedBy: actorId,
              importBatchId: batch.id,
              updatedAt: new Date(),
            },
          })
          .returning()
      }
    } else if (type === 'unavailability') {
      const rows = preview.rows as UnavailabilityImportRow[]
      const employeeByNumber = new Map(
        employeeRows.map((employee) => [employee.employeeNumber, employee]),
      )
      const existing = employeeRows.length
        ? await tx
            .select()
            .from(rosterUnavailability)
            .where(
              inArray(
                rosterUnavailability.employeeId,
                employeeRows.map((employee) => employee.id),
              ),
            )
        : []
      for (const row of rows) {
        const employeeId = employeeByNumber.get(row.employeeNumber)!.id
        const prior = existing.find(
          (item) =>
            item.employeeId === employeeId &&
            item.startDate === row.startDate &&
            item.endDate === row.endDate &&
            item.type === row.type &&
            (item.externalReference ?? '') === (row.reference ?? ''),
        )
        if (!prior) {
          counts.added++
          await tx
            .insert(rosterUnavailability)
            .values({
              employeeId,
              startDate: row.startDate,
              endDate: row.endDate,
              type: row.type,
              source: 'csv',
              externalReference: row.reference,
              operationalNote: row.note,
              importBatchId: batch.id,
              createdBy: actorId,
            })
            .returning()
        } else if (prior.operationalNote === row.note && prior.source === 'csv') {
          counts.unchanged++
        } else {
          counts.updated++
          await tx
            .update(rosterUnavailability)
            .set({
              operationalNote: row.note,
              source: 'csv',
              importBatchId: batch.id,
              createdBy: actorId,
              updatedAt: new Date(),
            })
            .where(eq(rosterUnavailability.id, prior.id))
            .returning()
        }
      }
    } else {
      const rows = preview.rows as BoundaryImportRow[]
      const employeeByNumber = new Map(
        employeeRows.map((employee) => [employee.employeeNumber, employee]),
      )
      const existing = employeeRows.length
        ? await tx
            .select()
            .from(rosterBoundaryAssignments)
            .where(
              and(
                inArray(
                  rosterBoundaryAssignments.employeeId,
                  employeeRows.map((employee) => employee.id),
                ),
                inArray(
                  rosterBoundaryAssignments.assignmentDate,
                  rows.map((row) => row.date),
                ),
              ),
            )
        : []
      const existingByKey = new Map(
        existing.map((row) => [`${row.employeeId}/${row.assignmentDate}`, row]),
      )
      for (const row of rows) {
        const employeeId = employeeByNumber.get(row.employeeNumber)!.id
        const prior = existingByKey.get(`${employeeId}/${row.date}`)
        const unchanged =
          prior !== undefined &&
          prior.workingMinutes === row.workingMinutes &&
          prior.restCategory === row.restCategory
        if (!prior) counts.added++
        else if (unchanged) counts.unchanged++
        else counts.updated++
      }
      if (rows.length) {
        await tx
          .insert(rosterBoundaryAssignments)
          .values(
            rows.map((row) => ({
              employeeId: employeeByNumber.get(row.employeeNumber)!.id,
              assignmentDate: row.date,
              workingMinutes: row.workingMinutes,
              restCategory: row.restCategory,
              source: 'csv' as const,
              recordedBy: actorId,
              importBatchId: batch.id,
            })),
          )
          .onConflictDoUpdate({
            target: [
              rosterBoundaryAssignments.employeeId,
              rosterBoundaryAssignments.assignmentDate,
            ],
            set: {
              workingMinutes: sql`excluded.working_minutes`,
              restCategory: sql`excluded.rest_category`,
              source: 'csv',
              recordedBy: actorId,
              importBatchId: batch.id,
              updatedAt: new Date(),
            },
          })
          .returning()
      }
    }

    const [committedBatch] = await tx
      .update(rosterImportBatches)
      .set({
        status: 'committed',
        addCount: counts.added,
        updateCount: counts.updated,
        unchangedCount: counts.unchanged,
        errorCount: 0,
        committedBy: actorId,
        committedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rosterImportBatches.id, batch.id))
      .returning()
    await appendImportEvents(
      tx,
      orgId,
      targetPropertyIds,
      actorId,
      committedBatch.id,
      type,
      checksum,
    )

    return { batchId: committedBatch.id, ...counts }
  })
}

export interface ManualForecastRow {
  propertyId: string
  date: string
  occupancyPercent: number
  arrivalsCount: number
  departuresCount: number
}

export async function upsertManualForecasts(args: {
  orgId: string
  actorId: string
  role: 'admin' | 'property_manager' | 'staff'
  accessiblePropertyIds: string[] | null
  forecasts: ManualForecastRow[]
}) {
  return db.transaction(async (tx) => {
    const propertyIds = [...new Set(args.forecasts.map((row) => row.propertyId))]
    const ownedProperties = propertyIds.length
      ? await tx
          .select({ id: properties.id })
          .from(properties)
          .where(
            and(
              eq(properties.orgId, args.orgId),
              eq(properties.isActive, true),
              inArray(properties.id, propertyIds),
            ),
          )
      : []
    if (ownedProperties.length !== propertyIds.length) {
      throw new Error('Property not found')
    }
    if (
      !canCommitRosterImport(
        'forecasts',
        args.role,
        args.accessiblePropertyIds,
        propertyIds,
      )
    ) {
      throw new Error('Forbidden')
    }

    const saved = args.forecasts.length
      ? await tx
          .insert(rosterForecasts)
          .values(
            args.forecasts.map((row) => ({
              propertyId: row.propertyId,
              forecastDate: row.date,
              occupancyPercent: row.occupancyPercent.toFixed(2),
              arrivalsCount: row.arrivalsCount,
              departuresCount: row.departuresCount,
              source: 'manual' as const,
              updatedBy: args.actorId,
            })),
          )
          .onConflictDoUpdate({
            target: [rosterForecasts.propertyId, rosterForecasts.forecastDate],
            set: {
              occupancyPercent: sql`excluded.occupancy_percent`,
              arrivalsCount: sql`excluded.arrivals_count`,
              departuresCount: sql`excluded.departures_count`,
              source: 'manual',
              importBatchId: null,
              updatedBy: args.actorId,
              updatedAt: new Date(),
            },
          })
          .returning()
      : []
    await appendImportEvents(
      tx,
      args.orgId,
      propertyIds,
      args.actorId,
      'manual',
      'forecasts',
      'manual',
    )
    return saved
  })
}

export async function saveManualUnavailability(args: {
  orgId: string
  actorId: string
  role: 'admin' | 'property_manager' | 'staff'
  accessiblePropertyIds: string[] | null
  employeeId: string
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
}) {
  return db.transaction(async (tx) => {
    const [employee] = await tx
      .select({
        id: rosterEmployees.id,
        basePropertyId: rosterEmployees.basePropertyId,
      })
      .from(rosterEmployees)
      .where(
        and(
          eq(rosterEmployees.id, args.employeeId),
          eq(rosterEmployees.orgId, args.orgId),
          eq(rosterEmployees.isActive, true),
        ),
      )
      .limit(1)
    if (!employee) throw new Error('Employee not found')
    if (
      !canCommitRosterImport(
        'unavailability',
        args.role,
        args.accessiblePropertyIds,
        [employee.basePropertyId],
      )
    ) {
      throw new Error('Forbidden')
    }

    const existing = await tx
      .select()
      .from(rosterUnavailability)
      .where(
        and(
          eq(rosterUnavailability.employeeId, employee.id),
          eq(rosterUnavailability.startDate, args.startDate),
          eq(rosterUnavailability.endDate, args.endDate),
          eq(rosterUnavailability.type, args.type),
        ),
      )
    const prior = existing.find(
      (row) => (row.externalReference ?? '') === (args.reference ?? ''),
    )
    const [saved] = prior
      ? await tx
          .update(rosterUnavailability)
          .set({
            source: 'manual',
            importBatchId: null,
            operationalNote: args.note,
            createdBy: args.actorId,
            updatedAt: new Date(),
          })
          .where(eq(rosterUnavailability.id, prior.id))
          .returning()
      : await tx
          .insert(rosterUnavailability)
          .values({
            employeeId: employee.id,
            startDate: args.startDate,
            endDate: args.endDate,
            type: args.type,
            source: 'manual',
            externalReference: args.reference,
            operationalNote: args.note,
            createdBy: args.actorId,
          })
          .returning()
    await appendImportEvents(
      tx,
      args.orgId,
      [employee.basePropertyId],
      args.actorId,
      'manual',
      'unavailability',
      'manual',
    )
    return saved
  })
}

export async function getRosteringSetupDirectory(
  orgId: string,
  accessiblePropertyIds: string[] | null,
) {
  if (accessiblePropertyIds?.length === 0) {
    return { properties: [], employees: [], unavailability: [] }
  }
  const propertyRows = await db
    .select({ id: properties.id, name: properties.name, code: properties.code })
    .from(properties)
    .where(
      accessiblePropertyIds === null
        ? and(eq(properties.orgId, orgId), eq(properties.isActive, true))
        : and(
            eq(properties.orgId, orgId),
            eq(properties.isActive, true),
            inArray(properties.id, accessiblePropertyIds),
          ),
    )
    .orderBy(asc(properties.name))
  const propertyIds = propertyRows.map((property) => property.id)
  const employeeRows = propertyIds.length
    ? await db
        .select({
          id: rosterEmployees.id,
          employeeNumber: rosterEmployees.employeeNumber,
          fullName: rosterEmployees.fullName,
          basePropertyId: rosterEmployees.basePropertyId,
          roleCode: rosterRoles.code,
          profileId: rosterEmployees.profileId,
        })
        .from(rosterEmployees)
        .innerJoin(rosterRoles, eq(rosterRoles.id, rosterEmployees.roleId))
        .where(
          and(
            eq(rosterEmployees.orgId, orgId),
            eq(rosterEmployees.isActive, true),
            inArray(rosterEmployees.basePropertyId, propertyIds),
          ),
        )
        .orderBy(asc(rosterEmployees.employeeNumber))
    : []
  const unavailabilityRows = employeeRows.length
    ? await db
        .select({
          id: rosterUnavailability.id,
          employeeId: rosterUnavailability.employeeId,
          startDate: rosterUnavailability.startDate,
          endDate: rosterUnavailability.endDate,
          type: rosterUnavailability.type,
          reference: rosterUnavailability.externalReference,
          note: rosterUnavailability.operationalNote,
          source: rosterUnavailability.source,
          createdAt: rosterUnavailability.createdAt,
        })
        .from(rosterUnavailability)
        .where(
          inArray(
            rosterUnavailability.employeeId,
            employeeRows.map((employee) => employee.id),
          ),
        )
        .orderBy(desc(rosterUnavailability.startDate))
        .limit(100)
    : []

  return {
    properties: propertyRows,
    employees: employeeRows,
    unavailability: unavailabilityRows,
  }
}

export async function getRosterProfileLinkDirectory(orgId: string) {
  const [employeeRows, profileRows] = await Promise.all([
    db
      .select({
        id: rosterEmployees.id,
        employeeNumber: rosterEmployees.employeeNumber,
        fullName: rosterEmployees.fullName,
        profileId: rosterEmployees.profileId,
      })
      .from(rosterEmployees)
      .where(
        and(
          eq(rosterEmployees.orgId, orgId),
          eq(rosterEmployees.isActive, true),
        ),
      )
      .orderBy(asc(rosterEmployees.employeeNumber)),
    db
      .select({
        id: profiles.id,
        email: profiles.email,
        fullName: profiles.fullName,
        role: profiles.role,
      })
      .from(profiles)
      .where(and(eq(profiles.orgId, orgId), eq(profiles.isActive, true)))
      .orderBy(asc(profiles.email)),
  ])
  return { employees: employeeRows, profiles: profileRows }
}

export async function linkRosterEmployeeProfile(args: {
  orgId: string
  employeeId: string
  profileId: string | null
}) {
  return db.transaction(async (tx) => {
    const [employee] = await tx
      .select({ id: rosterEmployees.id })
      .from(rosterEmployees)
      .where(
        and(
          eq(rosterEmployees.id, args.employeeId),
          eq(rosterEmployees.orgId, args.orgId),
        ),
      )
      .limit(1)
      .for('update')
    if (!employee) throw new Error('Employee not found')

    if (args.profileId) {
      const [profile] = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(
          and(
            eq(profiles.id, args.profileId),
            eq(profiles.orgId, args.orgId),
            eq(profiles.isActive, true),
          ),
        )
        .limit(1)
      if (!profile) throw new Error('Portal profile not found')

      const [alreadyLinked] = await tx
        .select({ id: rosterEmployees.id })
        .from(rosterEmployees)
        .where(eq(rosterEmployees.profileId, profile.id))
        .limit(1)
      if (alreadyLinked && alreadyLinked.id !== employee.id) {
        throw new Error('Portal profile is already linked to another employee')
      }
    }

    const [updated] = await tx
      .update(rosterEmployees)
      .set({ profileId: args.profileId, updatedAt: new Date() })
      .where(eq(rosterEmployees.id, employee.id))
      .returning({
        id: rosterEmployees.id,
        profileId: rosterEmployees.profileId,
      })
    return updated
  })
}

export async function listForecastsForMonth(args: {
  orgId: string
  propertyId: string
  month: string
  accessiblePropertyIds: string[] | null
}) {
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.id, args.propertyId),
        eq(properties.orgId, args.orgId),
        eq(properties.isActive, true),
      ),
    )
    .limit(1)
  if (
    !property ||
    (args.accessiblePropertyIds !== null &&
      !args.accessiblePropertyIds.includes(args.propertyId))
  ) {
    return null
  }
  const start = `${args.month}-01`
  const endDate = new Date(`${start}T00:00:00.000Z`)
  endDate.setUTCMonth(endDate.getUTCMonth() + 1)
  endDate.setUTCDate(0)
  const end = endDate.toISOString().slice(0, 10)

  return db
    .select()
    .from(rosterForecasts)
    .where(
      and(
        eq(rosterForecasts.propertyId, args.propertyId),
        gte(rosterForecasts.forecastDate, start),
        lte(rosterForecasts.forecastDate, end),
      ),
    )
    .orderBy(asc(rosterForecasts.forecastDate))
}
