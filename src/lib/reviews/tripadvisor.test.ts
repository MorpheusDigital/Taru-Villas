import { describe, expect, it } from 'vitest'
import { consolidateFeedback, filterFeedback, tripadvisorAspects, type FeedbackEntry } from './consolidated'
import { reviewDateLabel, reviewListingUrl } from './display'

describe('Tripadvisor feedback', () => {
  it('balances the three source groups and excludes unknown sources', () => {
    const entry = (source: string, score: number): FeedbackEntry => ({id:source,source:source as FeedbackEntry['source'],propertyId:'p',propertyName:'P',author:'A',text:'',score,date:'2026-09-01',dateLabel:'Sep',chronologyEligible:true,aspects:[]})
    const entries=[entry('guest',0),entry('google',6),entry('tripadvisor',9),entry('internal',10),entry('unknown',10)]
    const result=consolidateFeedback(entries)
    expect(result.score).toBeCloseTo((0+10+7.5)/3)
    expect(result.count).toBe(4)
    expect(result.sources.map(source=>source.weight)).toEqual([1/3,1/3,1/3])
    expect(filterFeedback(entries,'all','all')).toHaveLength(4)
  })
  it('averages Rooms and Sleep Quality once, with direct scores overriding inference', () => {
    const result=tripadvisorAspects({text:'Comfy room',subratings:{Rooms:5,'Sleep Quality':3,Service:1,Value:4}},[{key:'comfort',score:8,evidence:'Comfy room',confidence:'high'}])
    expect(result.find(a=>a.key==='comfort')).toMatchObject({score:7.5,kind:'rated'})
    expect(result.filter(a=>a.key==='comfort')).toHaveLength(1)
    expect(result.find(a=>a.key==='staff')?.score).toBe(0)
    expect(result.find(a=>a.key==='value')?.score).toBe(7.5)
    expect(result.some(a=>a.key==='food')).toBe(false)
  })
  it('validates evidence and never treats review prose as a direct subrating', () => {
    expect(tripadvisorAspects({text:'Rooms: 5',subratings:{Rooms:6}},[{key:'food',score:8,evidence:'Lovely breakfast',confidence:'high'}])).toEqual([])
  })
  it('retains the original published date label and protects external review URLs', () => {
    expect(reviewDateLabel(new Date('2026-09-09T00:00:00Z'),{source:'tripadvisor',reviewDateLabel:'Yesterday',reviewed_at_is_estimate:true,date_precision:'day'})).toContain('Yesterday')
    expect(reviewListingUrl({source:'tripadvisor',reviewUrl:'https://www.tripadvisor.com/ShowUserReviews-g1-d2-r3.html'})).toContain('tripadvisor.com')
    expect(reviewListingUrl({source:'tripadvisor',reviewUrl:'https://tripadvisor.com.evil.test/review'})).toBeNull()
  })
})
