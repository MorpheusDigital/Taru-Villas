import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseReviewDate, validateTripadvisorFile} from './tripadvisor-import.mjs'
const collected='2026-09-10T10:00:00Z'
test('published month and yearless day preserve precision and ignore stay date',()=>{
  assert.deepEqual(parseReviewDate('Aug 2026',collected),{reviewedAt:'2026-08-01T00:00:00.000Z',precision:'month',estimated:true})
  assert.equal(parseReviewDate('Sep 3',collected).reviewedAt,'2026-09-03T00:00:00.000Z')
  assert.equal(parseReviewDate('Dec 30',collected).reviewedAt,'2025-12-30T00:00:00.000Z')
  assert.equal(parseReviewDate('Yesterday',collected).reviewedAt,'2026-09-09T00:00:00.000Z')
  assert.equal(parseReviewDate('2024',collected).precision,'year')
  assert.throws(()=>parseReviewDate('Feb 30, 2026',collected))
  assert.throws(()=>parseReviewDate('not a date',collected))
})
const make=()=>({propertyId:'11111111-1111-4111-8111-111111111111',locationId:'123',listingName:'Villa',url:'https://www.tripadvisor.com/Hotel_Review-g1-d123-Reviews-Villa.html',collectedAt:collected,expectedCount:1,reviews:[{id:'456',name:'A',title:'Lovely',text:'Great staff',rating:5,reviewDateLabel:'Aug 2026',stayDateLabel:'July 2026',subratings:{Service:5},reviewUrl:'https://www.tripadvisor.com/ShowUserReviews-g1-d123-r456-Villa.html',translated:false}]})
test('validates count, identity, URL and evidence, preserving raw review and title',()=>{
  const file=make();const analysis={propertyId:file.propertyId,rubricVersion:'hospitality-v1',reviews:[{id:'456',aspects:[{key:'staff',score:8,evidence:'Great staff',confidence:'high'}]}]}
  const [row]=validateTripadvisorFile(file,analysis)
  assert.equal(row.text,'Lovely\n\nGreat staff')
  assert.equal(row.raw.stayDateLabel,'July 2026')
  assert.equal(row.raw.date_precision,'month')
  assert.equal(row.aspects.length,1)
  assert.throws(()=>validateTripadvisorFile({...file,expectedCount:2},analysis))
  assert.throws(()=>validateTripadvisorFile({...file,reviews:[...file.reviews,...file.reviews]},analysis))
  assert.throws(()=>validateTripadvisorFile(file,{...analysis,reviews:[{id:'456',aspects:[{key:'staff',score:8,evidence:'invented',confidence:'high'}]}]}))
  assert.throws(()=>validateTripadvisorFile({...file,reviews:[{...file.reviews[0],reviewUrl:'https://www.tripadvisor.com/ShowUserReviews-g1-d999-r456-Villa.html'}]},analysis))
})
test('permits only explicitly evidenced positive pagination discrepancies',()=>{
 const file=make();file.expectedCount=0
 assert.throws(()=>validateTripadvisorFile(file))
 assert.equal(validateTripadvisorFile({...file,observedCount:1,paginationComplete:true,countDiscrepancy:'New review not in header'}).length,1)
 assert.throws(()=>validateTripadvisorFile({...file,observedCount:2,paginationComplete:true,countDiscrepancy:'stale'}))
})
