const categories = new Set(['cleanliness','staff','food','location','value','comfort','facilities'])
const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const numericId = value => typeof value === 'string' && /^\d+$/.test(value)

export function parseReviewDate(label, collectedAt) {
  const collected = new Date(collectedAt)
  if (typeof label !== 'string' || !label.trim() || !Number.isFinite(collected.getTime())) throw Error('Invalid published date')
  const today = new Date(Date.UTC(collected.getUTCFullYear(),collected.getUTCMonth(),collected.getUTCDate()))
  const text = label.trim().replace(/^Written\s+/i,'').replace(/,/g,'').replace(/\s+/g,' ')
  let date, precision='day'
  if (/^(today|yesterday)$/i.test(text)) {
    date=new Date(today); if (/yesterday/i.test(text)) date.setUTCDate(date.getUTCDate()-1)
  } else if (/^(\d+)\s+(day|week|month|year)s?\s+ago$/i.test(text)) {
    const [,amount,unit]=text.match(/^(\d+)\s+(day|week|month|year)s?\s+ago$/i)
    date=new Date(today)
    if (/^(day|week)$/i.test(unit)) date.setUTCDate(date.getUTCDate()-Number(amount)*(unit.toLowerCase()==='week'?7:1))
    else {date.setUTCDate(1);if(unit.toLowerCase()==='month'){date.setUTCMonth(date.getUTCMonth()-Number(amount));precision='month'}else{date.setUTCMonth(0);date.setUTCFullYear(date.getUTCFullYear()-Number(amount));precision='year'}}
  } else {
    let year,month,day
    const yearOnly=text.match(/^(20\d{2}|19\d{2})$/)
    const monthYear=text.match(/^([A-Za-z]+) (\d{4})$/)
    const monthDay=text.match(/^([A-Za-z]+) (\d{1,2})(?: (\d{4}))?$/)
    const dayMonth=text.match(/^(\d{1,2}) ([A-Za-z]+)(?: (\d{4}))?$/)
    if(yearOnly){year=Number(yearOnly[1]);month=0;day=1;precision='year'}
    else if(monthYear){year=Number(monthYear[2]);month=months.indexOf(monthYear[1].slice(0,3).toLowerCase());day=1;precision='month'}
    else if(monthDay || dayMonth){
      const parts=monthDay || dayMonth
      month=months.indexOf(parts[monthDay?1:2].slice(0,3).toLowerCase());day=Number(parts[monthDay?2:1]);year=Number(parts[3] || today.getUTCFullYear())
      if(!parts[3] && new Date(Date.UTC(year,month,day))>today) year--
    } else throw Error(`Unsupported published date label: ${label}`)
    date=new Date(Date.UTC(year,month,day))
    if(month<0 || date.getUTCFullYear()!==year || date.getUTCMonth()!==month || date.getUTCDate()!==day) throw Error(`Invalid published date label: ${label}`)
  }
  if (!Number.isFinite(date.getTime()) || date>today || date.getUTCFullYear()<2000) throw Error(`Out-of-range published date: ${label}`)
  // Midnight is a storage boundary for the displayed date, never a claimed publication timestamp.
  return {reviewedAt:date.toISOString(),precision,estimated:true}
}

function validateUrl(value, locationId, reviewId) {
  let url
  try {url=new URL(value)} catch {throw Error('Invalid Tripadvisor URL')}
  if(url.protocol!=='https:' || !['www.tripadvisor.com','tripadvisor.com'].includes(url.hostname) || url.username || url.password ||
    !new RegExp(`-d${locationId}(?:-|\\.)`).test(url.pathname) || (reviewId && !new RegExp(`-r${reviewId}(?:-|\\.)`).test(url.pathname))) throw Error('Tripadvisor URL identity mismatch')
}

export function validateTripadvisorFile(file, analysis) {
  if(!uuid.test(file.propertyId || '') || !numericId(file.locationId) || typeof file.listingName!=='string' || !file.listingName.trim() ||
    !Number.isInteger(file.expectedCount) || file.expectedCount<0 || !Array.isArray(file.reviews) || !Number.isFinite(new Date(file.collectedAt).getTime())) throw Error('Invalid Tripadvisor envelope')
  validateUrl(file.url,file.locationId)
  const positiveDiscrepancy=file.reviews.length>file.expectedCount && file.paginationComplete===true && file.observedCount===file.reviews.length && typeof file.countDiscrepancy==='string' && file.countDiscrepancy.trim()
  if(file.reviews.length!==file.expectedCount && !positiveDiscrepancy) throw Error('Tripadvisor review count mismatch')
  if(file.observedCount!==undefined && file.observedCount!==file.reviews.length) throw Error('Observed count mismatch')
  if(analysis && (analysis.propertyId!==file.propertyId || analysis.rubricVersion!=='hospitality-v1' || !Array.isArray(analysis.reviews))) throw Error('Invalid analysis envelope')
  const analysisById=new Map()
  for(const item of analysis?.reviews || []) {
    if(!numericId(item.id) || analysisById.has(item.id) || !Array.isArray(item.aspects)) throw Error('Invalid or duplicate analysis ID')
    analysisById.set(item.id,item.aspects)
  }
  const seen=new Set();const histogram={'1':0,'2':0,'3':0,'4':0,'5':0}
  const rows=file.reviews.map(review=>{
    if(!numericId(review.id) || seen.has(review.id) || !Number.isInteger(review.rating) || review.rating<1 || review.rating>5 ||
      typeof review.title!=='string' || typeof review.text!=='string' || typeof review.name!=='string' || typeof review.translated!=='boolean' ||
      !review.subratings || typeof review.subratings!=='object' || Array.isArray(review.subratings)) throw Error('Invalid or duplicate Tripadvisor review')
    seen.add(review.id);histogram[review.rating]++
    validateUrl(review.reviewUrl,file.locationId,review.id)
    if(Object.values(review.subratings).some(value=>!Number.isInteger(value) || value<1 || value>5)) throw Error('Invalid Tripadvisor subrating')
    const text=`${review.title}\n\n${review.text}`
    const date=parseReviewDate(review.reviewDateLabel,file.collectedAt)
    const aspects=analysisById.get(review.id)
    if(analysis && !aspects) throw Error('Missing review analysis')
    const aspectKeys=new Set()
    for(const aspect of aspects || []) {
      if(!categories.has(aspect.key) || aspectKeys.has(aspect.key) || ![0,2,4,5,6,8,10].includes(aspect.score) ||
        !['high','medium'].includes(aspect.confidence) || typeof aspect.evidence!=='string' || !aspect.evidence.trim() || aspect.evidence.length>220 || !text.includes(aspect.evidence)) throw Error(`Invalid review evidence: ${review.id}`)
      aspectKeys.add(aspect.key)
    }
    return {id:review.id,author:review.name,rating:review.rating,text,reviewedAt:date.reviewedAt,aspects,
      raw:{...review,source:'tripadvisor',location_id:file.locationId,listing_name:file.listingName,listing_url:file.url,collected_at:file.collectedAt,
        declared_review_count:file.expectedCount,observed_review_count:file.reviews.length,pagination_complete:file.paginationComplete??null,count_discrepancy:file.countDiscrepancy??null,
        reviewed_at_is_estimate:date.estimated,date_precision:date.precision,date_event:'published'}}
  })
  if(analysis && analysisById.size!==rows.length) throw Error('Unexpected analysis review ID')
  const expectedHistogram=file.histogram || file.ratingHistogram
  if(expectedHistogram && [1,2,3,4,5].some(rating=>expectedHistogram[rating]!==histogram[rating])) throw Error('Rating histogram mismatch')
  return rows
}
