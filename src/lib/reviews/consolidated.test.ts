import { describe, expect, it } from 'vitest'
import { INTERNAL_TEST_IDS, dashboardSource, categoryScoreColors, consolidateFeedback, normalizeRating, googleAspects, googleChronologyEligible, mapSurveyCategory, filterFeedback } from './consolidated'
import type { FeedbackEntry } from './consolidated'
const entry = (id: string, source: FeedbackEntry['source'], score: number, extra: Partial<FeedbackEntry> = {}): FeedbackEntry => ({
  id, source, score, propertyId: 'p', propertyName: 'Villa', author: 'Reviewer', text: '', date: '2026-08-01', dateLabel: '1 Aug 2026', chronologyEligible: true, aspects: [], ...extra,
})
describe('consolidated review scores', () => {
  it('gives each available source equal weight regardless of review volume', () => {
    const data = consolidateFeedback([entry('i','guest',2), ...Array.from({length:100}, (_, i) => entry(`g${i}`,'google',10))])
    expect(data.score).toBe(6)
    expect(data.sources.find(s => s.source === 'guest')?.weight).toBe(.5)
    expect(data.sources).toHaveLength(3)
  })
  it('distinguishes a real zero from unavailable data', () => {
    expect(consolidateFeedback([]).score).toBeNull()
    expect(consolidateFeedback([entry('g','google',0)]).score).toBe(0)
    expect(normalizeRating(1,1,5)).toBe(0)
    expect(normalizeRating(5,1,5)).toBe(10)
    expect(normalizeRating(3,1,5)).toBe(5)
    expect(normalizeRating(5,5,5)).toBeNull()
  })
  it('uses explicit Google subratings over inference without copying stars to unmentioned categories', () => {
    const aspects = googleAspects({ details: 'Lovely staff\nRooms: 4\nService: 5\nLocation: 3', text: 'Lovely staff' }, [{key:'staff',score:8,evidence:'Lovely staff',confidence:'high'}])
    expect(aspects.map(a => [a.key,a.score,a.kind])).toEqual([['staff',10,'rated'],['comfort',7.5,'rated'],['location',5,'rated']])
    expect(googleAspects({text:'Great stay',rating:'5/5'}, [])).toEqual([])
  })
  it('rejects unsupported AI excerpts', () => {
    expect(googleAspects({text:'Great stay'}, [{key:'food',score:10,evidence:'Perfect dinner',confidence:'high'}])).toEqual([])
  })
  it('leaves broad survey categories unmapped rather than claiming equivalence', () => {
    expect(mapSurveyCategory('Housekeeping')).toEqual({key:'cleanliness',label:'Cleanliness'})
    expect(mapSurveyCategory('Finance & Compliance')).toEqual({key:'survey:finance & compliance',label:'Finance & Compliance'})
  })
  it('does not assign year-only or edited reviews to historical months', () => {
    expect(googleChronologyEligible({reviewed_at_is_estimate:true,date_precision:'year'})).toBe(false)
    expect(googleChronologyEligible({date_event:'edited',date_precision:'day'})).toBe(false)
    expect(googleChronologyEligible({reviewed_at_is_estimate:true,date_precision:'month'})).toBe(true)
    const coarse = entry('g','google',10,{chronologyEligible:false})
    expect(filterFeedback([coarse], 'all', 'all', new Date('2026-09-09'))).toHaveLength(1)
    expect(filterFeedback([coarse], 'all', '12m', new Date('2026-09-09'))).toHaveLength(0)
    expect(consolidateFeedback([coarse]).trends).toEqual([])
  })
  it('balances category sources and does not double count inferred categories in overall score', () => {
    const data = consolidateFeedback([
      entry('i','guest',4,{aspects:[{key:'staff',label:'Staff & service',score:2,kind:'rated'}]}),
      entry('g','google',8,{aspects:[{key:'staff',label:'Staff & service',score:10,kind:'inferred',evidence:'Excellent service'}]}),
      entry('g2','google',8,{aspects:[{key:'staff',label:'Staff & service',score:10,kind:'inferred',evidence:'Excellent service'}]}),
    ])
    expect(data.score).toBe(6)
    expect(data.categories[0].score).toBe(6)
    expect(data.categories[0].count).toBe(3)
    expect(data.categories[0].inferredCount).toBe(2)
    expect(data.trends[0].score).toBe(6)
  })
})

describe('dummy internal feedback exclusion', () => {
  it('excludes internal entries from counts, scores, categories and history', () => {
    const entries = [entry(INTERNAL_TEST_IDS[0],'internal',2,{aspects:[{key:'survey:test',label:'Test',score:2,kind:'rated'}]}),entry('g','google',10)]
    expect(filterFeedback(entries,'all','all')).toHaveLength(1)
    const summary = consolidateFeedback(entries)
    expect(summary.count).toBe(1)
    expect(summary.score).toBe(10)
    expect(summary.categories).toEqual([])
    expect(summary.sources.find(source=>source.source==='internal')?.count).toBe(0)
  })
})

describe('category score colors', () => {
  it.each([[0,'red'],[8,'red'],[8.01,'yellow'],[8.99,'yellow'],[9,'green-600'],[9.5,'green-600'],[9.504,'green-600'],[9.51,'green-900'],[10,'green-900']] as const)('colors %s as %s', (score,color) => {
    expect(categoryScoreColors(score).text).toContain(color)
    expect(categoryScoreColors(score).bar).toContain(color==='green-600'?'green-500':color)
  })
})


describe('dashboard source groups', () => {
  it('groups review platforms with equal platform weight inside an equally weighted source', () => {
    const aspect = (score: number) => [{key:'staff',label:'Staff & service',score,kind:'rated' as const}]
    const entries = [entry('guest','guest',2,{aspects:aspect(2)}), entry('internal','internal',4,{aspects:aspect(4)}),
      ...Array.from({length:10},(_,i)=>entry(`g${i}`,'google',10,{aspects:aspect(10)})), entry('ta','tripadvisor',6,{aspects:aspect(6)})]
    const summary=consolidateFeedback(entries)
    expect(summary.sources.map(s=>s.source)).toEqual(['guest','internal','reviews'])
    expect(summary.sources.map(s=>s.weight)).toEqual([1/3,1/3,1/3])
    expect(summary.sources[2]).toMatchObject({score:8,count:11})
    expect(summary.score).toBeCloseTo(14/3)
    expect(summary.categories[0].score).toBeCloseTo(14/3)
    expect(summary.trends[0].score).toBeCloseTo(14/3)
    expect(summary.trends[0].categories.staff.score).toBeCloseTo(14/3)
    expect(filterFeedback(entries,'reviews','all')).toHaveLength(11)
    expect(filterFeedback(entries,'internal','all')).toHaveLength(1)
    expect(dashboardSource('google')).toBe('reviews')
    expect(dashboardSource('tripadvisor')).toBe('reviews')
    expect(filterFeedback(entries,'google','all')).toHaveLength(11)
  })
})
