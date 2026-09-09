import { describe, expect, it } from 'vitest'
import { consolidateFeedback, normalizeRating, googleAspects, googleChronologyEligible, mapSurveyCategory, filterFeedback } from './consolidated'
import type { FeedbackEntry } from './consolidated'
const entry = (id: string, source: FeedbackEntry['source'], score: number, extra: Partial<FeedbackEntry> = {}): FeedbackEntry => ({
  id, source, score, propertyId: 'p', propertyName: 'Villa', author: 'Reviewer', text: '', date: '2026-08-01', dateLabel: '1 Aug 2026', chronologyEligible: true, aspects: [], ...extra,
})
describe('consolidated review scores', () => {
  it('gives each available source equal weight regardless of review volume', () => {
    const data = consolidateFeedback([entry('i','internal',2), ...Array.from({length:100}, (_, i) => entry(`g${i}`,'google',10))])
    expect(data.score).toBe(6)
    expect(data.sources.find(s => s.source === 'internal')?.weight).toBe(.5)
    expect(data.sources.find(s => s.source === 'guest')?.weight).toBe(0)
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
      entry('i','internal',4,{aspects:[{key:'staff',label:'Staff & service',score:2,kind:'rated'}]}),
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
