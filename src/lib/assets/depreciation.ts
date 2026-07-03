export interface DepreciationInput {
  purchaseCost: number
  salvageValue: number
  usefulLifeYears: number
  purchaseDate: Date | string
}

export interface DepreciationResult {
  annualDepreciation: number
  monthlyDepreciation: number
  monthsActive: number
  accumulatedDepreciation: number
  netBookValue: number
}

function toDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(`${d}T00:00:00Z`) : d
}

/** Whole calendar months between two dates (never negative). */
function wholeMonthsBetween(start: Date, end: Date): number {
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth())
  if (end.getUTCDate() < start.getUTCDate()) months -= 1
  return Math.max(0, months)
}

/**
 * Straight-line depreciation. NBV never falls below salvage; accumulated
 * depreciation never exceeds the depreciable base (cost - salvage). If the
 * asset has passed its useful life, NBV equals salvage regardless of extra time.
 */
export function computeDepreciation(
  input: DepreciationInput,
  asOf: Date = new Date(),
): DepreciationResult {
  const { purchaseCost, salvageValue, usefulLifeYears } = input
  const depreciableBase = Math.max(0, purchaseCost - salvageValue)
  const monthsActive = wholeMonthsBetween(toDate(input.purchaseDate), asOf)

  // Guard: zero/negative life => immediately fully depreciated.
  if (usefulLifeYears <= 0) {
    return {
      annualDepreciation: depreciableBase,
      monthlyDepreciation: depreciableBase,
      monthsActive,
      accumulatedDepreciation: depreciableBase,
      netBookValue: purchaseCost - depreciableBase,
    }
  }

  const annualDepreciation = depreciableBase / usefulLifeYears
  const monthlyDepreciation = annualDepreciation / 12
  const accumulatedDepreciation = Math.min(
    monthlyDepreciation * monthsActive,
    depreciableBase,
  )
  const netBookValue = purchaseCost - accumulatedDepreciation

  return {
    annualDepreciation,
    monthlyDepreciation,
    monthsActive,
    accumulatedDepreciation,
    netBookValue,
  }
}
