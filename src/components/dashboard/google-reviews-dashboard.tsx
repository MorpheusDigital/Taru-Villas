import Link from 'next/link'
import { Star, ArrowUpRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { getGoogleReviewPage, getGoogleReviewStats } from '@/lib/db/queries/google-reviews'
import { getProperties } from '@/lib/db/queries/properties'
import { reviewDateLabel, reviewListingUrl } from '@/lib/reviews/display'

export async function GoogleReviewsDashboard({ orgId, property, page, showPortfolioLink = true }: {
  orgId: string
  property?: { id: string; name: string }
  page?: string
  showPortfolioLink?: boolean
}) {
  const [stats, reviewPage, allProperties] = await Promise.all([
    getGoogleReviewStats(orgId, property?.id),
    property ? getGoogleReviewPage(orgId, property.id, page) : Promise.resolve(null),
    property ? Promise.resolve([]) : getProperties(orgId),
  ])
  const total = stats.reduce((sum, row) => sum + row.count, 0)
  const average = total ? stats.reduce((sum, row) => sum + row.ratingSum, 0) / total : null
  const written = stats.reduce((sum, row) => sum + row.written, 0)
  const histogram = ['one', 'two', 'three', 'four', 'five'].map(key =>
    stats.reduce((sum, row) => sum + row[key as 'one'], 0))
  const latestCollection = stats.map(row => new Date(row.collectedAt)).sort((a, b) => b.getTime() - a.getTime())[0]
  const base = property ? `/dashboard/${property.id}` : '/dashboard'
  const collectedLabel = latestCollection?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

  return <div className="space-y-6">
    <div className="space-y-3">
      {property && showPortfolioLink && <Link href="/dashboard?surveyType=google" className="text-sm text-muted-foreground hover:underline">← All property reviews</Link>}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{property?.name ?? 'Dashboard'}</h1>
        <p className="text-muted-foreground">Google reviews {property ? 'for this property' : 'across the portfolio'}</p>
      </div>
      <nav aria-label="Dashboard views" className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
        <Link href={base} className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground">Internal</Link>
        <Link href={`${base}?surveyType=guest`} className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground">Guest</Link>
        <Link href={`${base}?surveyType=google`} aria-current="page" className="rounded-md bg-background px-3 py-1.5 font-medium shadow-sm">Google Reviews</Link>
      </nav>
    </div>

    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[
        ['Average rating', average === null ? '—' : `${average.toFixed(2)} / 5`],
        ['Google reviews', total.toLocaleString()],
        ['Written reviews', written.toLocaleString()],
        ['1–3 star reviews', histogram.slice(0, 3).reduce((sum, count) => sum + count, 0).toLocaleString()],
      ].map(([label, value]) => <Card key={label}><CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent></Card>)}
    </div>

    <Card><CardHeader><CardTitle>Rating distribution</CardTitle></CardHeader><CardContent className="space-y-3">
      {[5, 4, 3, 2, 1].map(rating => <div key={rating} className="flex items-center gap-3 text-sm">
        <span className="flex w-10 shrink-0 items-center gap-1">{rating}<Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden="true" /></span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-amber-400" style={{ width: `${total ? histogram[rating - 1] / total * 100 : 0}%` }} /></div>
        <span className="w-12 text-right tabular-nums">{histogram[rating - 1]}</span>
      </div>)}
    </CardContent></Card>

    <p className="text-sm text-muted-foreground">
      {collectedLabel ? `Collected snapshot, last imported ${collectedLabel}. ` : 'No Google reviews have been imported yet. '}
      Review dates are approximate where Google displayed relative dates. Text is shown as collected and may include Google translations.
    </p>

    {!property && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {allProperties.map(item => {
        const row = stats.find(stat => stat.propertyId === item.id)
        return <Link key={item.id} href={`/dashboard/${item.id}?surveyType=google`} className="group rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
          <Card className="h-full transition-colors group-hover:border-primary/40"><CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">{item.name}<ArrowUpRight className="size-4 shrink-0 text-muted-foreground" /></CardTitle>
          </CardHeader><CardContent className="flex items-end justify-between gap-2">
            <span className="text-2xl font-semibold">{row ? `${(row.ratingSum / row.count).toFixed(2)} / 5` : '—'}</span>
            <span className="text-sm text-muted-foreground">{row?.count ?? 0} reviews</span>
          </CardContent></Card>
        </Link>
      })}
    </div>}

    {reviewPage && <section aria-label="Google reviews" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Guest reviews</h2>
        <span className="text-sm text-muted-foreground">{reviewPage.total ? `${reviewPage.offset + 1}–${Math.min(reviewPage.offset + reviewPage.reviews.length, reviewPage.total)} of ${reviewPage.total}` : 'No reviews'} · Newest first</span>
      </div>
      {reviewPage.reviews.map(review => {
        const sourceUrl = reviewListingUrl(review.metadata)
        return <Card key={review.id}><CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="font-medium">{review.authorName || 'Google reviewer'}</h3>
              <p className="text-xs text-muted-foreground">{reviewDateLabel(review.reviewedAt, review.metadata)}</p></div>
            <span className="flex items-center gap-1 text-sm font-medium" aria-label={`${review.rating} out of 5 stars`}><Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />{review.rating} / 5</span>
          </div>
          {review.text?.trim() ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{review.text}</p> : <p className="text-sm italic text-muted-foreground">Rating only. No written review.</p>}
          {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">View property on Google Maps<ArrowUpRight className="size-3" /></a>}
        </CardContent></Card>
      })}
      {!reviewPage.total && <Card><CardContent className="py-12 text-center text-muted-foreground">No Google reviews have been imported for this property.</CardContent></Card>}
      {reviewPage.pages > 1 && <nav aria-label="Review pages" className="flex items-center justify-between gap-3">
        {reviewPage.page > 1 ? <Link className={buttonVariants({ variant: 'outline' })} href={`${base}?surveyType=google&reviewPage=${reviewPage.page - 1}`}>Previous</Link> : <span />}
        <span className="text-sm text-muted-foreground">Page {reviewPage.page} of {reviewPage.pages}</span>
        {reviewPage.page < reviewPage.pages ? <Link className={buttonVariants({ variant: 'outline' })} href={`${base}?surveyType=google&reviewPage=${reviewPage.page + 1}`}>Next</Link> : <span />}
      </nav>}
    </section>}
  </div>
}
