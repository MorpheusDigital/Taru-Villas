import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import postgres from 'postgres'
import {validateTripadvisorFile} from './lib/tripadvisor-import.mjs'

const inputDir=process.argv.find(arg=>arg.startsWith('--input-dir='))?.slice(12)
const apply=process.argv.includes('--apply')
if(!inputDir || !process.env.DATABASE_URL) throw Error('Provide --input-dir and DATABASE_URL')
const slugs=['kandy','levita','maia','mawella','rampart','the-long-house','villu']
// Every property and its analysis must validate before opening the write transaction.
const files=await Promise.all(slugs.map(async slug=>{
  const [file,analysis]=await Promise.all([
    fs.readFile(path.join(inputDir,`${slug}.json`),'utf8').then(JSON.parse),
    fs.readFile(path.join(inputDir,`${slug}-analysis.json`),'utf8').then(JSON.parse),
  ])
  return {slug,file,rows:validateTripadvisorFile(file,analysis)}
}))
if(new Set(files.map(({file})=>file.propertyId)).size!==slugs.length || new Set(files.map(({file})=>file.locationId)).size!==slugs.length) throw Error('Duplicate property or Tripadvisor location')
const ids=files.flatMap(({rows})=>rows.map(row=>row.id))
if(new Set(ids).size!==ids.length) throw Error('Review ID occurs at multiple properties')
const db=postgres(process.env.DATABASE_URL,{prepare:false,max:1,connect_timeout:15})
try {
  const result=await db.begin(apply?'':'read only',async tx=>{
    if(apply) await tx`select pg_advisory_xact_lock(922337202)`
    const properties=await tx`select id,org_id,slug from properties where is_active=true and id in ${tx(files.map(({file})=>file.propertyId))}`
    if(properties.length!==slugs.length || new Set(properties.map(property=>property.org_id)).size!==1) throw Error('Properties must be active and belong to one organization')
    for(const {slug,file} of files) if(!properties.some(property=>property.id===file.propertyId && property.slug===slug)) throw Error(`Property identity mismatch: ${slug}`)
    const existingSources=await tx`select id,property_id,external_id from ota_review_sources where source='tripadvisor' and property_id in ${tx(files.map(({file})=>file.propertyId))}`
    for(const source of existingSources) if(!files.some(({file})=>file.propertyId===source.property_id && file.locationId===source.external_id)) throw Error('Existing Tripadvisor source identity mismatch')
    const existingReviews=await tx`select r.external_review_id,r.property_id from ota_reviews r join ota_review_sources s on s.id=r.source_id
      where s.source='tripadvisor' and r.property_id in ${tx(files.map(({file})=>file.propertyId))}`
    for(const review of existingReviews) if(!files.some(({file,rows})=>file.propertyId===review.property_id && rows.some(row=>row.id===review.external_review_id))) throw Error('Input snapshot would omit an existing Tripadvisor review')
    if(apply) {
      await tx.unsafe(await fs.readFile(new URL('../drizzle/0033_tripadvisor_review_source.sql',import.meta.url),'utf8'))
      for(const {file,rows} of files) {
        await tx`insert into ota_review_sources (property_id,source,external_id,is_active,last_fetched_at)
          values (${file.propertyId},'tripadvisor',${file.locationId},false,${file.collectedAt})
          on conflict (property_id,source) do update set last_fetched_at=excluded.last_fetched_at,last_fetch_error=null,updated_at=now()
          where ota_review_sources.last_fetched_at is distinct from excluded.last_fetched_at or ota_review_sources.last_fetch_error is not null returning id`
        const [source]=await tx`select id from ota_review_sources where property_id=${file.propertyId} and source='tripadvisor' and external_id=${file.locationId}`
        if(!source) throw Error('Source verification failed')
        for(const row of rows) {
          const [review]=await tx`insert into ota_reviews (source_id,property_id,external_review_id,author_name,rating,text,reviewed_at,fetched_at,raw_payload)
            values (${source.id},${file.propertyId},${row.id},${row.author},${row.rating},${row.text},${row.reviewedAt},${file.collectedAt},${tx.json(row.raw)})
            on conflict (source_id,external_review_id) do update set property_id=excluded.property_id,author_name=excluded.author_name,
              rating=excluded.rating,text=excluded.text,reviewed_at=excluded.reviewed_at,fetched_at=excluded.fetched_at,raw_payload=excluded.raw_payload
            returning id,text`
          // Validate provenance against the actual persisted text, not only the input envelope.
          if(review.text!==row.text || row.aspects.some(aspect=>!review.text.includes(aspect.evidence))) throw Error('Persisted evidence mismatch')
          const hash=createHash('sha256').update(review.text).digest('hex')
          await tx`insert into ota_review_analyses (review_id,rubric_version,model,input_hash,aspects)
            values (${review.id},'hospitality-v1','gpt-6; offline review analysis',${hash},${tx.json(row.aspects)})
            on conflict (review_id) do update set rubric_version=excluded.rubric_version,model=excluded.model,input_hash=excluded.input_hash,aspects=excluded.aspects,updated_at=now()
            where ota_review_analyses.input_hash is distinct from excluded.input_hash or ota_review_analyses.rubric_version is distinct from excluded.rubric_version
              or ota_review_analyses.aspects is distinct from excluded.aspects returning review_id`
        }
        const persisted=await tx`select r.external_review_id,r.rating,a.review_id analysis_id from ota_reviews r
          left join ota_review_analyses a on a.review_id=r.id and a.rubric_version='hospitality-v1'
          where r.source_id=${source.id} and r.property_id=${file.propertyId}`
        if(persisted.length!==rows.length || persisted.some(item=>!item.analysis_id || !rows.some(row=>row.id===item.external_review_id && row.rating===item.rating))) throw Error('Post-import identity, rating or analysis mismatch')
      }
    }
    return {mode:apply?'applied':'validated',reviewCount:ids.length,analysisCount:ids.length,
      aspectCount:files.reduce((sum,{rows})=>sum+rows.reduce((count,row)=>count+row.aspects.length,0),0),
      properties:files.map(({slug,file,rows})=>({slug,propertyId:file.propertyId,locationId:file.locationId,declaredCount:file.expectedCount,observedCount:rows.length,
        countDiscrepancy:file.countDiscrepancy??null,histogram:Object.fromEntries([1,2,3,4,5].map(rating=>[rating,rows.filter(row=>row.rating===rating).length]))}))}
  })
  console.log(JSON.stringify(result,null,2))
} finally {await db.end()}
