import type { DistanceEntry } from './types'

const HEAD_OFFICE = 'HO'

function nodeId(id: string | null): string {
  return id ?? HEAD_OFFICE
}

/** Order-independent key so a single stored row answers both directions. */
function pairKey(a: string | null, b: string | null): string {
  return [nodeId(a), nodeId(b)].sort().join('|')
}

export function buildDistanceIndex(entries: DistanceEntry[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const e of entries) {
    index.set(pairKey(e.fromPropertyId, e.toPropertyId), e.distanceKm)
  }
  return index
}

/**
 * Distance between two nodes in km. Returns 0 for identical nodes and null
 * when the pair has not been entered — callers must treat null as "unknown",
 * never as "close", or the engine would pool trips across the island.
 */
export function lookupDistanceKm(
  index: Map<string, number>,
  a: string | null,
  b: string | null,
): number | null {
  if (nodeId(a) === nodeId(b)) return 0
  return index.get(pairKey(a, b)) ?? null
}
