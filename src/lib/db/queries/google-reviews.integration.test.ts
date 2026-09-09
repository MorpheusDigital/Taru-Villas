import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../index'
import { properties } from '../schema'
import { getGoogleReviewPage, getGoogleReviewStats } from './google-reviews'

// Opt-in, read-only verification of the September 2026 imported snapshot.
describe.skipIf(process.env.RUN_GOOGLE_REVIEW_DB_TESTS !== 'true')('Google review import dashboard', () => {
  it('includes paused sources, excludes manual demos, scopes orgs and paginates without duplicates', async () => {
    const [maia] = await db.select().from(properties).where(eq(properties.slug, 'maia')).limit(1)
    expect(maia).toBeDefined()
    const stats = await getGoogleReviewStats(maia.orgId)
    expect(stats).toHaveLength(7)
    expect(stats.reduce((sum, item) => sum + item.count, 0)).toBe(888)
    const maiaStats = stats.find(item => item.propertyId === maia.id)!
    expect(maiaStats.count).toBe(287)
    expect([maiaStats.one, maiaStats.two, maiaStats.three, maiaStats.four, maiaStats.five]).toEqual([4, 1, 4, 11, 267])
    expect(await getGoogleReviewStats('00000000-0000-0000-0000-000000000000')).toEqual([])
    const denied = await getGoogleReviewPage('00000000-0000-0000-0000-000000000000', maia.id)
    expect(denied.total).toBe(0)
    expect(denied.reviews).toEqual([])
    const first = await getGoogleReviewPage(maia.orgId, maia.id)
    const second = await getGoogleReviewPage(maia.orgId, maia.id, '2')
    const last = await getGoogleReviewPage(maia.orgId, maia.id, '9999')
    expect(first.reviews).toHaveLength(25)
    expect(second.reviews).toHaveLength(25)
    expect(new Set([...first.reviews, ...second.reviews].map(review => review.id)).size).toBe(50)
    expect(last.page).toBe(12)
    expect(last.reviews).toHaveLength(12)
    expect(first.reviews.every(review => review.metadata?.reviewed_at_is_estimate === true)).toBe(true)
  }, 30_000)
})
