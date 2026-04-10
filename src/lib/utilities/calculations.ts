/**
 * Tier input for cost calculations.
 */
export interface TierInput {
  tierNumber: number
  minUnits: number
  maxUnits: number | null // null = unlimited (last tier)
  ratePerUnit: number
}

/**
 * Breakdown of cost per tier.
 */
export interface TierBreakdown {
  tierNumber: number
  unitsInTier: number
  ratePerUnit: number
  cost: number
}

/**
 * Result of a tiered cost calculation.
 */
export interface TieredCostResult {
  totalCost: number
  totalConsumption: number
  breakdown: TierBreakdown[]
}

/**
 * Result of a monthly prediction.
 */
export interface MonthlyPrediction {
  actualConsumption: number
  actualCost: number
  predictedConsumption: number
  predictedCost: number
  avgDailyConsumption: number
  daysElapsed: number
  daysInMonth: number
  costBreakdown: TierBreakdown[]
  predictedBreakdown: TierBreakdown[]
}

/**
 * Calculate cost using progressive/marginal tiered pricing (like tax brackets).
 * Each unit of consumption is priced at the rate of the tier it falls into.
 *
 * Example: consumption = 75, tiers = [0-30 @ $5, 31-60 @ $10, 61-90 @ $15]
 *   Tier 1: 30 * $5  = $150
 *   Tier 2: 30 * $10 = $300
 *   Tier 3: 15 * $15 = $225
 *   Total: $675
 *
 * @param consumption - Total units consumed
 * @param tiers - Array of tier definitions, sorted by tierNumber ascending
 * @returns Total cost and per-tier breakdown
 */
export function calculateTieredCost(
  consumption: number,
  tiers: TierInput[]
): TieredCostResult {
  if (consumption <= 0 || tiers.length === 0) {
    return { totalCost: 0, totalConsumption: consumption, breakdown: [] }
  }

  const sorted = [...tiers].sort((a, b) => a.tierNumber - b.tierNumber)
  let remaining = consumption
  const breakdown: TierBreakdown[] = []

  for (const tier of sorted) {
    if (remaining <= 0) break

    const tierWidth = tier.maxUnits !== null
      ? tier.maxUnits - tier.minUnits
      : remaining // Last tier: uncapped

    const unitsInTier = Math.min(remaining, tierWidth)
    const cost = unitsInTier * tier.ratePerUnit

    breakdown.push({
      tierNumber: tier.tierNumber,
      unitsInTier,
      ratePerUnit: tier.ratePerUnit,
      cost,
    })

    remaining -= unitsInTier
  }

  const totalCost = breakdown.reduce((sum, b) => sum + b.cost, 0)
  return { totalCost, totalConsumption: consumption, breakdown }
}

/**
 * Predict the full month's bill based on readings entered so far.
 *
 * Algorithm:
 * 1. Actual consumption = last reading - first reading of the period
 * 2. Days elapsed = date of last reading - date of first reading
 * 3. Average daily consumption = actual consumption / days elapsed
 * 4. Predicted monthly consumption = avg daily * total days in month
 * 5. Apply tiered rates to both actual and predicted consumption
 *
 * @param readings - Array of { date, value } sorted by date ascending
 * @param tiers - Tier definitions for cost calculation
 * @param year - Year of the month to predict
 * @param month - Month to predict (1-indexed: 1 = January)
 * @returns Prediction with actual vs predicted consumption and costs
 */
export function predictMonthlyBill(
  readings: { date: string; value: number }[],
  tiers: TierInput[],
  year: number,
  month: number // 1-indexed
): MonthlyPrediction {
  const daysInMonth = new Date(year, month, 0).getDate() // month is 1-indexed, so (year, month, 0) gives last day of that month

  const empty: MonthlyPrediction = {
    actualConsumption: 0,
    actualCost: 0,
    predictedConsumption: 0,
    predictedCost: 0,
    avgDailyConsumption: 0,
    daysElapsed: 0,
    daysInMonth,
    costBreakdown: [],
    predictedBreakdown: [],
  }

  if (readings.length < 2) return empty

  const firstReading = readings[0]
  const lastReading = readings[readings.length - 1]
  const actualConsumption = lastReading.value - firstReading.value

  if (actualConsumption < 0) return empty // Invalid: meter went backwards

  const firstDate = new Date(firstReading.date)
  const lastDate = new Date(lastReading.date)
  const daysElapsed = Math.round(
    (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (daysElapsed <= 0) return empty

  const avgDailyConsumption = actualConsumption / daysElapsed
  const predictedConsumption = avgDailyConsumption * daysInMonth

  const actualResult = calculateTieredCost(actualConsumption, tiers)
  const predictedResult = calculateTieredCost(predictedConsumption, tiers)

  return {
    actualConsumption,
    actualCost: actualResult.totalCost,
    predictedConsumption,
    predictedCost: predictedResult.totalCost,
    avgDailyConsumption,
    daysElapsed,
    daysInMonth,
    costBreakdown: actualResult.breakdown,
    predictedBreakdown: predictedResult.breakdown,
  }
}

/**
 * Calculate daily consumption from consecutive meter readings.
 * Returns an array of { date, consumption } pairs.
 *
 * @param readings - Array of { date, value } sorted by date ascending
 * @returns Array of daily consumption values
 */
export function calculateDailyConsumption(
  readings: { date: string; value: number }[]
): { date: string; consumption: number }[] {
  if (readings.length < 2) return []

  return readings.slice(1).map((reading, i) => ({
    date: reading.date,
    consumption: reading.value - readings[i].value,
  }))
}
