import { and, asc, desc, eq, notLike, sql } from 'drizzle-orm'
import { db } from '../index'
import { otaReviews, otaReviewSources, properties } from '../schema'
import { REVIEW_PAGE_SIZE, reviewPagination } from '../../reviews/display'

// Both the review and source must belong to the same active property in this org.
// Paused collectors still have valid historical reviews. Manual demo rows do not.
function reviewScope(orgId: string, propertyId?: string) {
  return and(
    eq(properties.orgId, orgId), eq(properties.isActive, true),
    eq(otaReviewSources.propertyId, properties.id), eq(otaReviewSources.source, 'google'),
    notLike(otaReviews.externalReviewId, 'manual-%'),
    propertyId ? eq(properties.id, propertyId) : undefined,
  )
}

export async function getGoogleReviewStats(orgId: string, propertyId?: string) {
  return db.select({
    propertyId: properties.id,
    propertyName: properties.name,
    count: sql<number>`count(*)::int`,
    ratingSum: sql<number>`sum(${otaReviews.rating})::int`,
    written: sql<number>`count(*) filter (where nullif(trim(${otaReviews.text}), '') is not null)::int`,
    one: sql<number>`count(*) filter (where ${otaReviews.rating} = 1)::int`,
    two: sql<number>`count(*) filter (where ${otaReviews.rating} = 2)::int`,
    three: sql<number>`count(*) filter (where ${otaReviews.rating} = 3)::int`,
    four: sql<number>`count(*) filter (where ${otaReviews.rating} = 4)::int`,
    five: sql<number>`count(*) filter (where ${otaReviews.rating} = 5)::int`,
    collectedAt: sql<string>`max(${otaReviews.fetchedAt})`,
  }).from(otaReviews)
    .innerJoin(properties, eq(otaReviews.propertyId, properties.id))
    .innerJoin(otaReviewSources, eq(otaReviews.sourceId, otaReviewSources.id))
    .where(reviewScope(orgId, propertyId))
    .groupBy(properties.id, properties.name).orderBy(asc(properties.name))
}

export async function getGoogleReviewPage(orgId: string, propertyId: string, requestedPage?: string) {
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(otaReviews)
    .innerJoin(properties, eq(otaReviews.propertyId, properties.id))
    .innerJoin(otaReviewSources, eq(otaReviews.sourceId, otaReviewSources.id))
    .where(reviewScope(orgId, propertyId))
  const pagination = reviewPagination(requestedPage, count.total)
  const reviews = await db.select({
    id: otaReviews.id, authorName: otaReviews.authorName, rating: otaReviews.rating,
    text: otaReviews.text, reviewedAt: otaReviews.reviewedAt, metadata: otaReviews.rawPayload,
  }).from(otaReviews)
    .innerJoin(properties, eq(otaReviews.propertyId, properties.id))
    .innerJoin(otaReviewSources, eq(otaReviews.sourceId, otaReviewSources.id))
    .where(reviewScope(orgId, propertyId))
    .orderBy(desc(otaReviews.reviewedAt), desc(otaReviews.id))
    .limit(REVIEW_PAGE_SIZE).offset(pagination.offset)
  return { reviews, total: count.total, ...pagination }
}
