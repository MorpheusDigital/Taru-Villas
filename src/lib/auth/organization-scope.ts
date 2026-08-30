interface OrganizationRecord {
  id: string
  orgId: string
}

export function belongsToOrganization(
  record: OrganizationRecord | undefined,
  orgId: string
): boolean {
  return record?.orgId === orgId
}

export function referencesBelongToOrganization(
  requestedIds: readonly string[],
  records: readonly OrganizationRecord[],
  orgId: string
): boolean {
  const requested = new Set(requestedIds)
  const matching = new Set(
    records
      .filter((record) => record.orgId === orgId && requested.has(record.id))
      .map((record) => record.id)
  )

  return matching.size === requested.size
}
