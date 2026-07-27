export type OriginKind = 'head_office' | 'property' | 'other'

export interface OriginFields {
  originKind: OriginKind
  originPropertyName: string | null
  originText: string | null
}

export interface DestinationFields {
  requestType: 'visit' | 'standalone'
  propertyName: string | null
  destinationText: string | null
}

/**
 * Where a trip starts. `head_office` is the null-property-id node the
 * distance grid already uses (see distances-grid.tsx), so the three kinds
 * cover the whole node set plus anything that is neither — the airport being
 * the case that motivated `other`.
 *
 * A `property` pick-up whose property row was deleted arrives here with a
 * null name (the FK is ON DELETE SET NULL) and degrades to "Unknown
 * property", matching how a deleted target property already reads.
 */
export function formatOriginLabel(o: OriginFields): string {
  switch (o.originKind) {
    case 'head_office':
      return 'Head Office'
    case 'property':
      return o.originPropertyName?.trim() || 'Unknown property'
    case 'other':
      return o.originText?.trim() || '—'
  }
}

/** Where a trip goes. Absorbs the ternary formerly repeated at three call sites. */
export function formatDestinationLabel(d: DestinationFields): string {
  return d.requestType === 'visit'
    ? (d.propertyName?.trim() || 'Unknown property')
    : (d.destinationText?.trim() || '—')
}

/** "Head Office → The Long House". Both halves always render. */
export function formatTripRoute(r: OriginFields & DestinationFields): string {
  return `${formatOriginLabel(r)} → ${formatDestinationLabel(r)}`
}
