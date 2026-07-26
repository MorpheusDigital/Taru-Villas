import { colomboToday } from './dates'
import { planDispatches } from './engine'
import { loadEngineInput, replaceDraftDispatches } from '@/lib/db/queries/dispatches'
import { getFleetSettings } from '@/lib/db/queries/fleet'
import type { UnassignableRequest } from './types'

export interface EngineRunResult {
  skipped: boolean
  created: number
  unassignable: UnassignableRequest[]
}

/**
 * One full planning cycle for an org. Safe to call repeatedly: only draft
 * dispatches are rebuilt, approved ones are untouched.
 *
 * This is the ONLY entry point into the pooling engine reachable from HTTP —
 * both the "Run engine now" button (run-engine/route.ts) and the 5pm cron
 * (cron/fleet-optimize/route.ts) call this function and nothing else, so
 * their behaviour cannot drift apart.
 *
 * Always resolves "today" via colomboToday() — never a bare `new Date()` —
 * because the cron fires at 11:30 UTC (17:00 Asia/Colombo) and a UTC "today"
 * would be wrong for roughly the first 5.5 hours of the Colombo day.
 */
export async function runFleetEngine(orgId: string): Promise<EngineRunResult> {
  const settings = await getFleetSettings(orgId)
  if (!settings.engineEnabled) return { skipped: true, created: 0, unassignable: [] }

  const input = await loadEngineInput(orgId, colomboToday())
  const result = planDispatches(input)
  const persisted = await replaceDraftDispatches(orgId, result)

  return {
    skipped: false,
    created: persisted.createdDispatchIds.length,
    unassignable: result.unassignable,
  }
}
