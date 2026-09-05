import { isDeepStrictEqual } from 'node:util'
import { eq } from 'drizzle-orm'
import { organizations, vehicles } from '../schema'
import { matchImportedVehicle, type ImportedVehicle } from '../../fleet/vehicle-import'
import { saveVehicleInTransaction, type FleetTransaction } from './vehicle-renewals'

// A single transaction makes the sheet all-or-nothing. The organization lock
// serializes importer runs; normal vehicle writes are protected by row locks.
export async function importVehiclesInTransaction(tx: FleetTransaction, orgId: string, imports: ImportedVehicle[]) {
  const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).for('update')
  if (!org) throw new Error('Import organization not found')
  const existing = await tx.select().from(vehicles).where(eq(vehicles.orgId, orgId)).for('update')
  const planned = imports.map(vehicle => ({ vehicle, match: matchImportedVehicle(vehicle, existing) }))
  const matchedIds = planned.flatMap(p => p.match ? [p.match.id] : [])
  if (new Set(matchedIds).size !== matchedIds.length) throw new Error('Multiple sheet entries match one vehicle')
  const results: { id: string; name: string; registration: string | null; action: 'created' | 'updated' | 'skipped'; warnings: string[] }[] = []
  for (const { vehicle, match } of planned) {
    const source = vehicle.compliance.sourceRecord
    if (!source) throw new Error('Import source snapshot is required')
    if (match?.compliance.sourceRecord && match.compliance.sourceRecord.digest !== source.digest) {
      throw new Error(`Changed source for ${vehicle.name}; review before overwriting an earlier import`)
    }
    const skipped = match?.compliance.sourceRecord?.digest === source.digest
    const saved = skipped ? match : await saveVehicleInTransaction(tx, orgId, {
      // Preserve names and dispatch settings on matched vehicles.
      ...(!match ? { name: vehicle.name, maxPassengers: 0, status: 'maintenance' as const,
        renewalLeadDays: 30, sortOrder: source.column,
      } : {}),
      registrationNo: vehicle.registrationNo ?? match?.registrationNo ?? null,
      compliance: { ...vehicle.compliance, ...(!match ? {
        recordNotes: 'Imported with passenger capacity, cargo capability and current location unconfirmed. Held in Maintenance (unavailable for dispatch) until an administrator confirms operational details. No Administration Manager assigned.',
      } : {}) },
    }, match?.id)
    if (!saved) throw new Error('Vehicle disappeared during import')
    // Re-read the committed representation before this transaction can finish.
    const [persisted] = await tx.select().from(vehicles).where(eq(vehicles.id, saved.id))
    if (!isDeepStrictEqual(persisted.compliance, saved.compliance)) throw new Error('Vehicle details did not round-trip')
    results.push({ id: saved.id, name: saved.name, registration: saved.registrationNo,
      action: skipped ? 'skipped' : match ? 'updated' : 'created', warnings: source.warnings })
  }
  return results
}
