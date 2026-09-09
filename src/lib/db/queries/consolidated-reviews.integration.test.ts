import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../index'
import { properties } from '../schema'
import { getConsolidatedFeedback } from './consolidated-reviews'
import { consolidateFeedback, filterFeedback } from '../../reviews/consolidated'

describe.skipIf(process.env.RUN_GOOGLE_REVIEW_DB_TESTS!=='true')('unified dashboard snapshot (read only)',()=>{
  it('loads complete authorized evidence with current synthesis and equal source weighting',async()=>{
    const [maia]=await db.select().from(properties).where(eq(properties.slug,'maia')).limit(1)
    const all=await getConsolidatedFeedback(maia.orgId)
    expect(all.filter(entry=>entry.source==='google')).toHaveLength(888)
    expect(all.filter(entry=>entry.source==='google'&&entry.analyzed)).toHaveLength(888)
    expect(all.filter(entry=>entry.source==='internal')).toHaveLength(0)
    expect(all.filter(entry=>entry.source==='guest')).toHaveLength(0)
    expect(await getConsolidatedFeedback('00000000-0000-0000-0000-000000000000',maia.id)).toEqual([])
    expect((await getConsolidatedFeedback(maia.orgId,maia.id)).every(entry=>entry.propertyId===maia.id)).toBe(true)
    const summary=consolidateFeedback(all)
    const google=summary.sources.find(s=>s.source==='google')!
    expect(google.weight).toBe(1)
    expect(summary.score).toBeCloseTo(google.score!)
    expect(summary.categories.filter(c=>c.inferredCount>0)).toHaveLength(7)
    expect(summary.trends.length).toBeGreaterThan(0)
    expect(summary.excludedFromTrends).toBeGreaterThan(0)
    expect(filterFeedback(all,'all','12m').every(entry=>entry.chronologyEligible)).toBe(true)
    expect(all.every(entry=>!('metadata' in entry)&&!('rawPayload' in entry))).toBe(true)
    console.log(JSON.stringify({count:all.length,score:summary.score,sources:summary.sources,categories:summary.categories.map(c=>({name:c.label,count:c.count,inferred:c.inferredCount})),months:summary.trends.length,excluded:summary.excludedFromTrends}))
  },30_000)
})
