import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { getConsolidatedFeedback } from '@/lib/db/queries/consolidated-reviews'
import { getProperties } from '@/lib/db/queries/properties'
import { dashboardSource, feedbackGroup, categoryScoreColors, consolidateFeedback, filterFeedback, SOURCE_LABELS, SOURCES, type ReviewPeriod } from '@/lib/reviews/consolidated'
import { REVIEW_PAGE_SIZE, reviewPagination } from '@/lib/reviews/display'
import { ConsolidatedTrendChart } from './consolidated-trend-chart'

export type DashboardFilters = { source?:string; period?:string; reviewPage?:string }
const badgeColors = {reviews:'bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-200',internal:'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200',guest:'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',google:'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',tripadvisor:'bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-200'}
export async function ConsolidatedDashboard({orgId,property,filters,showPortfolioLink=true}:{
  orgId:string;property?:{id:string;name:string};filters:DashboardFilters;showPortfolioLink?:boolean
}) {
  const [all,allProperties]=await Promise.all([getConsolidatedFeedback(orgId,property?.id),property?Promise.resolve([]):getProperties(orgId)])
  const source=dashboardSource(filters.source)
  const period:ReviewPeriod=['3m','6m','12m'].includes(filters.period??'')?filters.period as ReviewPeriod:'all'
  const entries=filterFeedback(all,source,period)
  const summary=consolidateFeedback(entries)
  const pagination=reviewPagination(filters.reviewPage,entries.length)
  const page=entries.slice(pagination.offset,pagination.offset+REVIEW_PAGE_SIZE)
  const base=property?`/dashboard/${property.id}`:'/dashboard'
  const query=`source=${source}&period=${period}`
  const snapshots=(['google','tripadvisor'] as const).map(source=>({source,count:all.filter(item=>item.source===source).length,analyzed:all.filter(item=>item.source===source&&item.analyzed).length,lastCollected:all.filter(item=>item.source===source).map(item=>item.collectedAt).filter((value):value is string=>Boolean(value)).sort().at(-1)}))
  const excluded=all.filter(item=>(source==='all'||feedbackGroup(item.source)===source)&&!item.chronologyEligible).length
  const formattedScore=(score:number|null)=>score===null?'—':score.toFixed(2)
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        {property&&showPortfolioLink&&<Link href={`/dashboard?${query}`} className="text-sm text-muted-foreground hover:underline">All properties</Link>}
        <h1 className="text-2xl font-bold tracking-tight">{property?.name??'Quality overview'}</h1>
        <p className="text-sm text-muted-foreground">Guest feedback across surveys, Google and Tripadvisor reviews.</p>
      </div>
      <form action={base} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-muted-foreground"><span className="block">Source</span><select name="source" defaultValue={source} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
          <option value="all">All sources</option>{SOURCES.map(item=><option key={item} value={item}>{SOURCE_LABELS[item]}</option>)}
        </select></label>
        <label className="space-y-1 text-xs text-muted-foreground"><span className="block">Period</span><select name="period" defaultValue={period} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
          <option value="all">All time</option><option value="3m">Last 3 months</option><option value="6m">Last 6 months</option><option value="12m">Last 12 months</option>
        </select></label>
        <button className={buttonVariants({variant:'outline',size:'sm'})} type="submit">Apply</button>
      </form>
    </div>

    <Card><CardContent className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_2fr]">
      <div>
        <p className="text-sm font-medium">Consolidated score</p>
        <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{formattedScore(summary.score)}<span className="ml-2 text-base font-normal text-muted-foreground">/ 10</span></p>
        <p className="mt-2 text-sm text-muted-foreground">{summary.count.toLocaleString()} reviews and surveys</p>
        <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer hover:text-foreground">How the score is calculated</summary>
          <p className="mt-2 max-w-prose leading-relaxed">Guest, Internal and Reviews each have equal weight when available. Within Reviews, Google and Tripadvisor have equal weight. Survey responses use their configured scales and category weights, then each submission counts once. Google and Tripadvisor stars are normalized from 1–5 to 0–10, so 1 star = 0 and 5 stars = 10. Missing sources have no weight. AI category estimates do not change this score.</p>
        </details>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {summary.sources.map(item=><div key={item.source} className="border-l-2 pl-4">
          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${badgeColors[item.source]}`}>{SOURCE_LABELS[item.source]}</span>
          <p className="mt-3 text-2xl font-semibold tabular-nums">{formattedScore(item.score)}<span className="ml-1 text-xs font-normal text-muted-foreground">/ 10</span></p>
          <p className="mt-1 text-xs text-muted-foreground">{item.count} scored entries · {Math.round(item.weight*100)}% weight</p>
          {item.source==='reviews'&&<p className="mt-1 text-xs text-muted-foreground">Google + Tripadvisor</p>}
          {item.score===null&&<p className="mt-1 text-xs text-muted-foreground">No scored feedback in this view</p>}
        </div>)}
      </div>
    </CardContent></Card>

    {!property&&<section aria-label="Property scores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {allProperties.map(item=>{
        const data=consolidateFeedback(entries.filter(entry=>entry.propertyId===item.id))
        return <Link key={item.id} href={`/dashboard/${item.id}?${query}`} className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring">
          <div className="flex items-center justify-between gap-2"><h2 className="font-medium">{item.name}</h2><ArrowUpRight className="size-4 text-muted-foreground" /></div>
          <div className="mt-3 flex items-baseline justify-between gap-2"><span className="text-2xl font-semibold tabular-nums">{formattedScore(data.score)}<span className="ml-1 text-xs font-normal text-muted-foreground">/ 10</span></span><span className="text-xs text-muted-foreground">{data.count} entries</span></div>
          <p className="mt-2 text-xs text-muted-foreground">{data.sources.filter(s=>s.count>0).map(s=>`${SOURCE_LABELS[s.source]} ${s.count}`).join(' · ')||'No feedback yet'}</p>
        </Link>
      })}
    </section>}

    <ConsolidatedTrendChart trends={summary.trends} categories={summary.categories} />
    {excluded>0&&<p className="text-xs leading-relaxed text-muted-foreground">{excluded} reviews have only a coarse year estimate or an edited date. They contribute to all-time scores but are excluded from monthly trends and period filters.</p>}

    <Card><CardHeader><CardTitle className="text-base">Category overview</CardTitle>
      <p className="text-xs leading-relaxed text-muted-foreground">Survey scores and direct subratings from Google and Tripadvisor are combined with AI-inferred sentiment from written reviews. Only mentioned categories contribute; available sources have equal weight within each category.</p>
      <p className="text-xs text-muted-foreground"><span className="text-emerald-700 dark:text-emerald-400">Green: above 8</span> · <span className="text-yellow-700 dark:text-yellow-400">Yellow: 5–8</span> · <span className="text-red-700 dark:text-red-400">Red: below 5</span></p>
    </CardHeader><CardContent>
      {summary.categories.length?<div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
        {summary.categories.map(item=><div key={item.key}>
          <div className="flex items-center justify-between gap-2 text-sm"><h3 className="font-medium">{item.label}</h3><span className={`font-semibold tabular-nums ${categoryScoreColors(item.score).text}`}>{formattedScore(item.score)} / 10</span></div>
          <div className="mt-2 h-1.5 rounded-full bg-muted" aria-hidden="true"><div className={`h-full rounded-full ${categoryScoreColors(item.score).bar}`} style={{width:`${(item.score??0)*10}%`}} /></div>
          <p className="mt-2 text-xs text-muted-foreground">{item.count} assessments{item.inferredCount?`, ${item.inferredCount} AI-inferred`:''}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.sources.filter(s=>s.count>0).map(s=>`${SOURCE_LABELS[s.source]} ${formattedScore(s.score)} (${s.count})`).join(' · ')}</p>
        </div>)}
      </div>:<p className="py-8 text-center text-sm text-muted-foreground">No category evidence in the selected feedback.</p>}
      <details className="mt-5 text-xs text-muted-foreground"><summary className="cursor-pointer hover:text-foreground">About the review synthesis</summary>
        <p className="mt-2 max-w-prose leading-relaxed">{snapshots.filter(item=>item.count>0).map(item=>`${SOURCE_LABELS[item.source]}: ${item.analyzed} of ${item.count} reviews analyzed`).join(' · ')}. AI-inferred scores describe sentiment, not ratings given by the reviewer: 10 exceptional praise, 8 positive, 6 mildly positive, 5 mixed or neutral, 4 mildly negative, 2 negative, 0 severe complaint. Unsupported categories are left blank. Explicit source subratings take priority; Tripadvisor Rooms and Sleep Quality are averaged into one room comfort assessment. Supporting excerpts are available with each review below. This is a one-time analysis of the current snapshot.</p>
      </details>
    </CardContent></Card>

    <section aria-label="Reviews and surveys" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">Reviews & surveys</h2>
        <span className="text-xs text-muted-foreground">{entries.length?`${pagination.offset+1}–${pagination.offset+page.length} of ${entries.length}`:'No entries'} · Newest displayed dates first</span>
      </div>
      {page.map(entry=><Card key={`${entry.source}:${entry.id}`}><CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{entry.author}</h3><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${badgeColors[entry.source]}`}>{SOURCE_LABELS[entry.source]}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">{!property?`${entry.propertyName} · `:''}{entry.dateLabel}</p></div>
          <span className="text-sm font-semibold tabular-nums">{entry.originalRating!==undefined?`${entry.originalRating} / 5 stars`:`${formattedScore(entry.score)} / 10`}</span>
        </div>
        {entry.text?<p className="max-w-prose whitespace-pre-wrap break-words text-sm leading-relaxed">{entry.text}</p>:<p className="text-sm italic text-muted-foreground">Scored feedback without written comments.</p>}
        {entry.aspects.length>0&&<details className="text-xs"><summary className="cursor-pointer text-muted-foreground hover:text-foreground">Category evidence ({entry.aspects.length})</summary><ul className="mt-3 space-y-3">
          {entry.aspects.map(aspect=><li key={aspect.key}><p className="font-medium">{aspect.label}: <span className={categoryScoreColors(aspect.score).text}>{aspect.score.toFixed(1)} / 10</span> <span className="font-normal text-muted-foreground">({aspect.kind==='inferred'?'AI-inferred':'Direct score'})</span></p>{aspect.evidence&&<blockquote className="mt-1 max-w-prose border-l-2 pl-3 text-muted-foreground">{aspect.evidence}</blockquote>}</li>)}
        </ul></details>}
        {entry.sourceUrl&&<a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">{entry.source==='tripadvisor'?'View review on Tripadvisor':'View property on Google Maps'}<ArrowUpRight className="size-3" /></a>}
      </CardContent></Card>)}
      {!entries.length&&<p className="rounded-lg border py-12 text-center text-sm text-muted-foreground">No feedback matches these filters. Try all sources or a longer period.</p>}
      {pagination.pages>1&&<nav aria-label="Feedback pages" className="flex items-center justify-between gap-2">
        {pagination.page>1?<Link href={`${base}?${query}&reviewPage=${pagination.page-1}`} className={buttonVariants({variant:'outline'})}>Previous</Link>:<span />}
        <span className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.pages}</span>
        {pagination.page<pagination.pages?<Link href={`${base}?${query}&reviewPage=${pagination.page+1}`} className={buttonVariants({variant:'outline'})}>Next</Link>:<span />}
      </nav>}
    </section>
    {snapshots.filter(item=>item.lastCollected).map(item=><p key={item.source} className="text-xs text-muted-foreground">{SOURCE_LABELS[item.source]} snapshot last imported {new Date(item.lastCollected!).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}. Review text may include source translations.</p>)}
  </div>
}
