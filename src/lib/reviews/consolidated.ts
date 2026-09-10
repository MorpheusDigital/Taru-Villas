export const SOURCES = ['guest', 'internal', 'reviews'] as const
export type FeedbackGroup = typeof SOURCES[number]
export type FeedbackSource = 'guest' | 'internal' | 'google' | 'tripadvisor'
// The two submissions the user identified as dummy data remain excluded.
export const INTERNAL_TEST_IDS = ['54e6b32c-89d5-4aa1-b578-31d19057b17c', '7faed1d8-1289-41b8-a59e-513c387d56d0']
export const feedbackGroup = (source: FeedbackSource): FeedbackGroup => source === 'google' || source === 'tripadvisor' ? 'reviews' : source
export function dashboardSource(source?: string): FeedbackGroup | 'all' {
  if (source === 'google' || source === 'tripadvisor') return 'reviews'
  return SOURCES.includes(source as FeedbackGroup) ? source as FeedbackGroup : 'all'
}
const isLiveFeedback = (entry: FeedbackEntry) => ['guest','internal','google','tripadvisor'].includes(entry.source) && !(entry.source === 'internal' && INTERNAL_TEST_IDS.includes(entry.id))
export const SOURCE_LABELS = { internal: 'Internal', guest: 'Guest', google: 'Google', tripadvisor: 'Tripadvisor', reviews: 'Reviews' }
export const CATEGORY_LABELS: Record<string, string> = {
  cleanliness: 'Cleanliness', staff: 'Staff & service', food: 'Food & dining',
  location: 'Location', value: 'Value for money', comfort: 'Room comfort', facilities: 'Facilities',
}
export interface FeedbackAspect {
  key: string; label: string; score: number; kind: 'rated' | 'inferred'; evidence?: string; confidence?: string
}
export interface FeedbackEntry {
  id: string; propertyId: string; propertyName: string; source: FeedbackSource
  author: string; text: string; score: number | null; originalRating?: number
  date: string; dateLabel: string; chronologyEligible: boolean; aspects: FeedbackAspect[]
  sourceUrl?: string | null; collectedAt?: string; analyzed?: boolean
}
export interface InferredAspect { key: string; score: number; evidence: string; confidence: string }
export type ReviewPeriod = 'all' | '3m' | '6m' | '12m'

export function normalizeRating(score: number, min: number, max: number) {
  if (![score,min,max].every(Number.isFinite) || max <= min || score < min || score > max) return null
  return (score - min) / (max - min) * 10
}
const mean = (values: number[]) => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null

export function mapSurveyCategory(name: string) {
  const normalized = name.trim().toLowerCase()
  const mapping: Record<string,string> = {
    housekeeping:'cleanliness', cleanliness:'cleanliness', staff:'staff', service:'staff',
    'staff & service':'staff', 'staff communication':'staff', dining:'food', 'food & dining':'food',
    food:'food', location:'location', value:'value', 'value for money':'value',
    room:'comfort', rooms:'comfort', 'room comfort':'comfort', comfort:'comfort',
    facilities:'facilities', 'facilities & amenities':'facilities',
  }
  const key = mapping[normalized]
  return key ? { key, label: CATEGORY_LABELS[key] } : { key:`survey:${normalized}`, label: name.trim() }
}

export function googleAspects(metadata: Record<string, unknown> | null, inferred: InferredAspect[]): FeedbackAspect[] {
  const text = typeof metadata?.text === 'string' ? metadata.text : ''
  const byKey = new Map<string, FeedbackAspect>()
  for (const aspect of inferred) {
    if (!CATEGORY_LABELS[aspect.key] || !Number.isFinite(aspect.score) || aspect.score < 0 || aspect.score > 10 ||
      !aspect.evidence?.trim() || !text.includes(aspect.evidence) || !['high','medium'].includes(aspect.confidence)) continue
    byKey.set(aspect.key, { ...aspect, label: CATEGORY_LABELS[aspect.key], kind: 'inferred' })
  }
  const details = typeof metadata?.details === 'string' ? metadata.details : ''
  // Only the metadata suffix, never a quoted rating inside the review's prose.
  const suffix = text && details.startsWith(text) ? details.slice(text.length) : (!text ? details : '')
  for (const match of suffix.matchAll(/(?:^|\n)(Rooms|Service|Location):\s*([1-5])(?:\/5)?(?=\s*(?:\n|$))/g)) {
    const key = ({Rooms:'comfort',Service:'staff',Location:'location'} as Record<string,string>)[match[1]]
    byKey.set(key, {key, label:CATEGORY_LABELS[key], score:normalizeRating(Number(match[2]),1,5)!, kind:'rated', evidence:match[0].trim()})
  }
  return [...byKey.values()]
}

/** Direct Tripadvisor subratings override text inference; two comfort ratings form one assessment. */
export function tripadvisorAspects(metadata: Record<string, unknown> | null, inferred: InferredAspect[]): FeedbackAspect[] {
  const byKey = new Map(googleAspects({text: metadata?.text}, inferred).map(aspect => [aspect.key, aspect]))
  const ratings = metadata?.subratings
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) return [...byKey.values()]
  const mapping: Record<string, string> = {Value:'value',Rooms:'comfort','Sleep Quality':'comfort',Location:'location',Cleanliness:'cleanliness',Service:'staff'}
  const direct = new Map<string, {scores:number[]; evidence:string[]}>()
  for (const [label, value] of Object.entries(ratings)) {
    const key = mapping[label]
    if (!key || typeof value !== 'number' || !Number.isInteger(value)) continue
    const score = normalizeRating(value,1,5)
    if (score === null) continue
    const group = direct.get(key) ?? {scores:[],evidence:[]}
    group.scores.push(score); group.evidence.push(`${label}: ${value} / 5`); direct.set(key,group)
  }
  for (const [key,group] of direct) byKey.set(key,{key,label:CATEGORY_LABELS[key],score:mean(group.scores)!,kind:'rated',evidence:group.evidence.join('; ')})
  return [...byKey.values()]
}

export function googleChronologyEligible(metadata: Record<string, unknown> | null) {
  if (metadata?.date_event === 'edited') return false
  return metadata?.reviewed_at_is_estimate !== true || ['hour','day','week','month'].includes(String(metadata.date_precision))
}

export function filterFeedback(entries: FeedbackEntry[], source: FeedbackSource | FeedbackGroup | 'all', period: ReviewPeriod, now = new Date()) {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  // Full calendar months, including the current month, match chart buckets.
  if (period !== 'all') cutoff.setUTCMonth(cutoff.getUTCMonth() - Number(period.slice(0,-1)) + 1)
  const cutoffDate = cutoff.toISOString().slice(0,10)
  const today = now.toISOString().slice(0,10)
  return entries.filter(entry => isLiveFeedback(entry) && (source === 'all' || dashboardSource(source) === feedbackGroup(entry.source)) &&
    (period === 'all' || (entry.chronologyEligible && entry.date >= cutoffDate && entry.date <= today)))
}

function sourceSummary(entries: FeedbackEntry[], category?: string) {
  return SOURCES.map(source => {
    const matching = entries.filter(entry => feedbackGroup(entry.source) === source)
    const values = matching.map(entry => category ? entry.aspects.find(aspect => aspect.key === category)?.score : entry.score)
      .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))
    const platformScores = source === 'reviews' ? (['google','tripadvisor'] as const).map(platform => mean(matching.filter(entry => entry.source === platform)
      .map(entry => category ? entry.aspects.find(aspect => aspect.key === category)?.score : entry.score)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))).filter((value): value is number => value !== null) : []
    return {source, score:source === 'reviews' ? mean(platformScores) : mean(values), count:values.length}
  })
}
export function consolidateFeedback(input: FeedbackEntry[]) {
  const entries = input.filter(isLiveFeedback)
  const sourceScores = sourceSummary(entries)
  const active = sourceScores.filter(source => source.score !== null)
  const score = mean(active.map(source => source.score!))
  const keys = [...new Set(entries.flatMap(entry => entry.aspects.map(aspect => aspect.key)))]
  const categories = keys.map(key => {
    const observations = entries.flatMap(entry => entry.aspects.filter(aspect => aspect.key === key))
    const sources = sourceSummary(entries,key)
    return {key, label:observations[0].label, score:mean(sources.filter(s => s.score !== null).map(s => s.score!)),
      count:observations.length, inferredCount:observations.filter(a => a.kind === 'inferred').length, sources}
  }).sort((a,b) => a.label.localeCompare(b.label))
  const eligible = entries.filter(entry => entry.chronologyEligible && /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
  const months = [...new Set(eligible.map(entry => entry.date.slice(0,7)))].sort()
  // Insert gaps explicitly rather than drawing a line through missing months.
  if (months.length) {
    const first = new Date(`${months[0]}-01T00:00:00Z`)
    const last = months.at(-1)!
    months.length = 0
    while (first.toISOString().slice(0,7) <= last && months.length < 1200) {
      months.push(first.toISOString().slice(0,7)); first.setUTCMonth(first.getUTCMonth()+1)
    }
  }
  const trends = months.map(month => {
    const group = eligible.filter(entry => entry.date.startsWith(month))
    const sources = sourceSummary(group)
    const categoryScores = Object.fromEntries(keys.map(key => {
      const breakdown = sourceSummary(group,key)
      return [key, {score:mean(breakdown.filter(s => s.score !== null).map(s => s.score!)), sources:breakdown}]
    }))
    return {month, score:mean(sources.filter(s => s.score !== null).map(s => s.score!)), sources, categories:categoryScores}
  })
  return {score, count:entries.length,
    sources:sourceScores.map(source => ({...source, weight:source.score !== null ? 1/active.length : 0})),
    categories, trends, excludedFromTrends:entries.length - eligible.length,
    inferredReviews:entries.filter(entry => entry.aspects.some(a => a.kind === 'inferred')).length,
  }
}

export function categoryScoreColors(score: number | null) {
  if (score === null) return {text:'text-muted-foreground',bar:'bg-muted-foreground'}
  const displayed = Number(score.toFixed(2))
  if (displayed > 9.5) return {text:'text-green-900 dark:text-green-400',bar:'bg-green-900 dark:bg-green-400'}
  if (displayed >= 9) return {text:'text-green-600 dark:text-green-300',bar:'bg-green-500 dark:bg-green-300'}
  if (displayed > 8) return {text:'text-yellow-700 dark:text-yellow-400',bar:'bg-yellow-400'}
  return {text:'text-red-700 dark:text-red-400',bar:'bg-red-500'}
}
