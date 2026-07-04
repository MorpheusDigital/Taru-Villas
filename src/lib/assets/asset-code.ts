import { categoryAbbr, type AssetCategory } from './labels'

export function buildAssetCode(
  propertyCode: string,
  category: AssetCategory,
  sequence: number,
): string {
  const prefix = propertyCode.toUpperCase().replace(/\s+/g, '')
  const seq = String(sequence).padStart(3, '0')
  return `${prefix}-${categoryAbbr(category)}-${seq}`
}
