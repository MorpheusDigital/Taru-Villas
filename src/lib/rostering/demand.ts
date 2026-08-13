import type {
  EngineCadre,
  EngineRole,
  EngineStaffingBand,
  GenerationInput,
  RoleDemand,
} from './types'

function key(propertyId: string, roleId: string): string {
  return `${propertyId}/${roleId}`
}

function indexSingleCadre(rows: EngineCadre[]): Map<string, EngineCadre> {
  const index = new Map<string, EngineCadre>()
  for (const row of rows) {
    const rowKey = key(row.propertyId, row.roleId)
    if (index.has(rowKey)) throw new Error(`duplicate cadre for ${rowKey}`)
    index.set(rowKey, row)
  }
  return index
}

function matchingBand(
  bands: EngineStaffingBand[],
  propertyId: string,
  roleId: string,
  occupancyPercent: number,
): EngineStaffingBand {
  const matches = bands.filter(
    (band) =>
      band.propertyId === propertyId &&
      band.roleId === roleId &&
      occupancyPercent >= band.occupancyMin &&
      occupancyPercent <= band.occupancyMax,
  )

  if (matches.length === 0) {
    throw new Error(
      `missing staffing band for ${key(propertyId, roleId)} at ${occupancyPercent}%`,
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `overlapping staffing bands for ${key(propertyId, roleId)} at ${occupancyPercent}%`,
    )
  }
  return matches[0]
}

function requiredActive(
  role: EngineRole,
  cadre: EngineCadre,
  band: EngineStaffingBand,
): number {
  if (role.laborTier === 'fixed') {
    return Math.max(cadre.requiredDailyActive, band.requiredActive)
  }
  return Math.max(role.minimumFloor, band.requiredActive)
}

export function calculateDemand(input: GenerationInput): RoleDemand[] {
  const cadreByPropertyRole = indexSingleCadre(input.cadre)
  const forecasts = [...input.forecasts].sort(
    (a, b) =>
      a.propertyId.localeCompare(b.propertyId) || a.date.localeCompare(b.date),
  )
  const roles = [...input.roles].sort((a, b) => a.id.localeCompare(b.id))
  const demand: RoleDemand[] = []

  for (const forecast of forecasts) {
    for (const role of roles) {
      const rowKey = key(forecast.propertyId, role.id)
      const cadre = cadreByPropertyRole.get(rowKey)
      if (!cadre) throw new Error(`missing cadre for ${rowKey}`)

      const band = matchingBand(
        input.staffingBands,
        forecast.propertyId,
        role.id,
        forecast.occupancyPercent,
      )
      demand.push({
        propertyId: forecast.propertyId,
        date: forecast.date,
        roleId: role.id,
        requiredActive: requiredActive(role, cadre, band),
        budgetedHeadcount: Math.ceil(
          cadre.requiredDailyActive * cadre.reliefMultiplier,
        ),
      })
    }
  }

  return demand
}
