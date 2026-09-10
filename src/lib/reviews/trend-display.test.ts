import { describe, expect, it } from 'vitest'
import { forwardFillScores } from './trend-display'

describe('carried-forward score display', () => {
  it('fills each series independently, preserving zero and leaving leading gaps empty', () => {
    const rows=[{date:'Jan',score:null,guest:null,count:0},{date:'Feb',score:8,guest:null,count:2},
      {date:'Mar',score:null,guest:0,count:1},{date:'Apr',score:null,guest:null,count:0},
      {date:'May',score:9,guest:6,count:3}]
    const result=forwardFillScores(rows,['score','guest'])
    expect(result.map(p=>[p.score,p.guest])).toEqual([[null,null],[8,null],[8,0],[8,0],[9,6]])
    expect(result[3].carriedFrom).toEqual({score:'Feb',guest:'Mar'})
    expect(result[4].carriedFrom).toEqual({})
    expect(result.map(p=>p.count)).toEqual([0,2,1,0,3])
    expect(rows[3].score).toBeNull()
  })
  it('does not reuse another measure or property’s previous score', () => {
    forwardFillScores([{date:'Jan',score:10}],['score'])
    expect(forwardFillScores([{date:'Feb',score:null}],['score'])[0].score).toBeNull()
  })
})
