import { eq, desc } from 'drizzle-orm'
import { db } from '..'
import { maintenanceLogs, profiles, type MaintenanceLog, type NewMaintenanceLog } from '../schema'
import type { MaintenanceStatus } from '@/lib/assets/labels'

export interface MaintenanceLogRow {
  id: string
  issueDescription: string
  serviceDate: string | null
  repairCost: string | null
  resolutionStatus: MaintenanceStatus
  createdAt: Date
  resolvedAt: Date | null
  reporterName: string | null
}

export async function createMaintenanceLog(input: NewMaintenanceLog): Promise<MaintenanceLog> {
  const [row] = await db.insert(maintenanceLogs).values(input).returning()
  return row
}

export async function getMaintenanceLogById(id: string): Promise<MaintenanceLog | undefined> {
  const [row] = await db.select().from(maintenanceLogs).where(eq(maintenanceLogs.id, id)).limit(1)
  return row
}

export async function resolveMaintenanceLog(
  logId: string,
  resolvedBy: string,
): Promise<MaintenanceLog | undefined> {
  const [row] = await db
    .update(maintenanceLogs)
    .set({ resolutionStatus: 'resolved', resolvedBy, resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(maintenanceLogs.id, logId))
    .returning()
  return row
}

export async function getMaintenanceLogsForAsset(assetId: string): Promise<MaintenanceLogRow[]> {
  return db
    .select({
      id: maintenanceLogs.id,
      issueDescription: maintenanceLogs.issueDescription,
      serviceDate: maintenanceLogs.serviceDate,
      repairCost: maintenanceLogs.repairCost,
      resolutionStatus: maintenanceLogs.resolutionStatus,
      createdAt: maintenanceLogs.createdAt,
      resolvedAt: maintenanceLogs.resolvedAt,
      reporterName: profiles.fullName,
    })
    .from(maintenanceLogs)
    .leftJoin(profiles, eq(maintenanceLogs.reportedBy, profiles.id))
    .where(eq(maintenanceLogs.assetId, assetId))
    .orderBy(desc(maintenanceLogs.createdAt))
}
