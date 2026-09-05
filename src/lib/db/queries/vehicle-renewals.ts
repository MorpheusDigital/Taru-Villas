import { and, asc, eq, gt } from 'drizzle-orm'
import { db } from '..'
import { profiles, projects, properties, taskAssignees, tasks, vehicleRenewals, vehicles, type NewVehicle } from '../schema'
import { addDays, colomboToday } from '../../fleet/dates'
import { complianceSchema, renewalCandidates, renewalKinds } from '../../fleet/vehicle-compliance'

export type FleetTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export class VehicleValidationError extends Error {}

// Called inside the same transaction as the vehicle write, so a task failure
// cannot leave a saved vehicle with silently missing renewal tasks.
export async function reconcileVehicle(tx: FleetTransaction, id: string, orgId: string, today = colomboToday()) {
  const [vehicle] = await tx.select().from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId))).for('update')
  if (!vehicle) return { created: 0 }
  const [manager] = vehicle.administrationManagerId
    ? await tx.select({ id: profiles.id }).from(profiles).where(and(
      eq(profiles.id, vehicle.administrationManagerId), eq(profiles.orgId, orgId), eq(profiles.isActive, true),
    )).for('share') : []
  const cycles = await tx.select({ renewal: vehicleRenewals, task: tasks }).from(vehicleRenewals)
    .innerJoin(tasks, eq(tasks.id, vehicleRenewals.taskId))
    .where(and(eq(vehicleRenewals.vehicleId, id), eq(vehicleRenewals.orgId, orgId)))

  for (const { renewal, task } of cycles) {
    if (task.status === 'done') continue
    const currentExpiry = vehicle.compliance[`${renewal.kind}End`]
    // A later recorded expiry is evidence of the next cycle. An earlier date
    // is a correction, not proof of renewal; keep the earlier obligation open.
    if (currentExpiry && currentExpiry > renewal.expiryDate) {
      await tx.update(tasks).set({ status: 'done', completedAt: new Date(), updatedAt: new Date(),
        description: `${task.description ?? ''}\nRenewal recorded on vehicle; next expiry ${currentExpiry}.`,
      }).where(eq(tasks.id, task.id)).returning()
      continue
    }
    if (currentExpiry && currentExpiry < renewal.expiryDate && !cycles.some(c => c.renewal.kind === renewal.kind && c.renewal.expiryDate === currentExpiry)) {
      await tx.update(vehicleRenewals).set({ expiryDate: currentExpiry, updatedAt: new Date() })
        .where(eq(vehicleRenewals.id, renewal.id)).returning()
      renewal.expiryDate = currentExpiry
    }
    await tx.update(tasks).set({
      dueDate: renewal.expiryDate, startDate: addDays(renewal.expiryDate, -vehicle.renewalLeadDays), updatedAt: new Date(),
    }).where(eq(tasks.id, task.id)).returning()
    // Only touch generated tasks. If a manager was removed/deactivated, clear
    // the stale assignment instead of silently assigning an inactive account.
    await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, task.id)).returning()
    if (manager) await tx.insert(taskAssignees).values({ taskId: task.id, profileId: manager.id }).returning()
  }

  let created = 0
  for (const candidate of renewalCandidates({ ...vehicle, administrationManagerId: manager?.id ?? null }, today)) {
    if (cycles.some(c => c.renewal.kind === candidate.kind && c.renewal.expiryDate === candidate.expiry)) continue
    // Upsert serializes project creation across different vehicles in one org.
    const [project] = await tx.insert(projects).values({ orgId, name: 'Fleet Renewals', description: 'Vehicle licence, insurance and emission-test renewals.' })
      .onConflictDoUpdate({ target: [projects.orgId, projects.name], set: { status: 'active', updatedAt: new Date() } }).returning()
    const [task] = await tx.insert(tasks).values({
      orgId, projectId: project.id, title: `Renew ${candidate.label.toLowerCase()} — ${vehicle.name}${vehicle.registrationNo ? ` (${vehicle.registrationNo})` : ''}`,
      description: `${candidate.label} expires on ${candidate.expiry}. Renew the document, update the vehicle's coverage dates, and complete this task.\nVehicle: /fleet/vehicles/${id}`,
      dueDate: candidate.expiry, startDate: candidate.start, priority: 'high',
    }).returning()
    await tx.insert(taskAssignees).values({ taskId: task.id, profileId: manager!.id }).returning()
    await tx.insert(vehicleRenewals).values({ orgId, vehicleId: id, kind: candidate.kind, expiryDate: candidate.expiry, taskId: task.id }).returning()
    created++
  }
  return { created }
}

export async function saveVehicle(orgId: string, data: Partial<NewVehicle>, id?: string) {
  return db.transaction(async tx => saveVehicleInTransaction(tx, orgId, data, id))
}

export async function saveVehicleInTransaction(tx: FleetTransaction, orgId: string, data: Partial<NewVehicle>, id?: string) {
  const [existing] = id ? await tx.select().from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId))).for('update') : []
  if (id && !existing) return null
  if (data.administrationManagerId) {
    const [manager] = await tx.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.id, data.administrationManagerId), eq(profiles.orgId, orgId), eq(profiles.isActive, true))).for('share')
    if (!manager) throw new VehicleValidationError('Administration Manager must be an active user in your organization')
  }
  if (data.currentLocationPropertyId) {
    const [property] = await tx.select({ id: properties.id }).from(properties).where(and(eq(properties.id, data.currentLocationPropertyId), eq(properties.orgId, orgId)))
    if (!property) throw new VehicleValidationError('Vehicle location must belong to your organization')
  }
  const compliance = complianceSchema.safeParse({ ...existing?.compliance, ...data.compliance })
  if (!compliance.success) throw new VehicleValidationError(compliance.error.issues[0].message)
  const values = { ...data, orgId, compliance: compliance.data, updatedAt: new Date() }
  const [saved] = existing
    ? await tx.update(vehicles).set(values).where(and(eq(vehicles.id, existing.id), eq(vehicles.orgId, orgId))).returning()
    : await tx.insert(vehicles).values({ ...values, name: data.name!, maxPassengers: data.maxPassengers! }).returning()
  await reconcileVehicle(tx, saved.id, orgId)
  return saved
}

// Stable cursor and independent transactions bound locks and isolate failures.
export async function runVehicleRenewals(orgId?: string) {
  let cursor: string | undefined
  let checked = 0, created = 0, failed = 0
  const today = colomboToday()
  while (true) {
    const batch = await db.select({ id: vehicles.id, orgId: vehicles.orgId }).from(vehicles)
      .where(and(orgId ? eq(vehicles.orgId, orgId) : undefined, cursor ? gt(vehicles.id, cursor) : undefined)).orderBy(asc(vehicles.id)).limit(50)
    if (!batch.length) break
    for (const vehicle of batch) {
      try {
        const result = await db.transaction(tx => reconcileVehicle(tx, vehicle.id, vehicle.orgId, today))
        created += result.created
      } catch (error) { failed++; console.error('Vehicle renewal check failed', vehicle.id, error instanceof Error ? error.name : 'Unknown error') }
      checked++
    }
    cursor = batch[batch.length - 1].id
  }
  return { ok: failed === 0, checked, created, failed }
}

export async function getVehicleRenewalDetails(id: string, orgId: string) {
  const [vehicle] = await db.select({ id: vehicles.id, name: vehicles.name, registrationNo: vehicles.registrationNo, administrationManagerId: vehicles.administrationManagerId, renewalLeadDays: vehicles.renewalLeadDays, compliance: vehicles.compliance })
    .from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)))
  if (!vehicle) return null
  const cycles = await db.select({ kind: vehicleRenewals.kind, expiry: vehicleRenewals.expiryDate, taskId: tasks.id, projectId: tasks.projectId, status: tasks.status })
    .from(vehicleRenewals).innerJoin(tasks, eq(tasks.id, vehicleRenewals.taskId))
    .where(and(eq(vehicleRenewals.vehicleId, id), eq(vehicleRenewals.orgId, orgId)))
  return { vehicle, cycles, documents: renewalKinds.map(({ kind, label }) => ({ kind, label, expiry: vehicle.compliance[`${kind}End`] ?? null })) }
}
