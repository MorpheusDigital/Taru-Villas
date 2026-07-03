import { eq, desc } from 'drizzle-orm'
import { db } from '..'
import { maintenanceLogs, profiles } from '../schema'
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

// Plan 2 will extend this file with create/update/resolve mutations for
// maintenance logs — kept intentionally minimal for now.
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
