export const ASSET_CATEGORIES = ['ffe', 'machinery', 'kitchen', 'it', 'vehicles'] as const
export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

export const ASSET_STATUSES = ['active', 'in_repair', 'missing', 'disposed'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

export const MAINTENANCE_STATUSES = ['pending', 'resolved'] as const
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  ffe: 'FF&E',
  machinery: 'Machinery',
  kitchen: 'Kitchen',
  it: 'IT',
  vehicles: 'Vehicles',
}
const CATEGORY_ABBR: Record<AssetCategory, string> = {
  ffe: 'FFE',
  machinery: 'MAC',
  kitchen: 'KIT',
  it: 'IT',
  vehicles: 'VEH',
}
const STATUS_LABELS: Record<AssetStatus, string> = {
  active: 'Active',
  in_repair: 'In Repair',
  missing: 'Missing',
  disposed: 'Disposed',
}

export function categoryLabel(c: AssetCategory): string {
  return CATEGORY_LABELS[c]
}
export function categoryAbbr(c: AssetCategory): string {
  return CATEGORY_ABBR[c]
}
export function statusLabel(s: AssetStatus): string {
  return STATUS_LABELS[s]
}
