import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import postgres from 'postgres'

const inputDir = process.argv.find(arg => arg.startsWith('--input-dir='))?.slice(12)
const apply = process.argv.includes('--apply')
if (!inputDir || !process.env.DATABASE_URL) throw new Error('Provide --input-dir and DATABASE_URL')
const keys = new Set(['cleanliness','staff','food','location','value','comfort','facilities'])
const slugs = ['kandy','levita','maia','mawella','rampart','the-long-house','villu']
const files = await Promise.all(slugs.map(async slug => JSON.parse(await fs.readFile(path.join(inputDir,`${slug}.json`),'utf8'))))
const db = postgres(process.env.DATABASE_URL,{prepare:false,max:1,connect_timeout:15})
try {
  const result = await db.begin(apply ? '' : 'read only', async tx => {
    if (apply) await tx`select pg_advisory_xact_lock(922337201)`
    const reviews = await tx`select r.id,r.external_review_id,r.property_id,r.text,p.slug from ota_reviews r
      join properties p on p.id=r.property_id join ota_review_sources s on s.id=r.source_id and s.property_id=p.id
      where p.is_active=true and s.source='google' and r.external_review_id not like 'manual-%' and p.slug in ${tx(slugs)}`
    const records=[]; const seen=new Set(); const countByProperty={}
    for (const file of files) {
      if (file.rubricVersion!=='hospitality-v1' || !Array.isArray(file.reviews)) throw Error('Invalid analysis envelope')
      for (const item of file.reviews) {
        const review=reviews.find(r=>r.property_id===file.propertyId && r.external_review_id===item.id)
        if (!review || seen.has(review.id) || !Array.isArray(item.aspects)) throw Error('Unknown or duplicate review')
        seen.add(review.id)
        const aspectKeys=new Set()
        for (const aspect of item.aspects) {
          if (!keys.has(aspect.key) || aspectKeys.has(aspect.key) || ![0,2,4,5,6,8,10].includes(aspect.score) ||
            !['high','medium'].includes(aspect.confidence) || typeof aspect.evidence!=='string' || !aspect.evidence.trim() ||
            aspect.evidence.length>220 || !(review.text || '').includes(aspect.evidence)) throw Error(`Invalid evidence: ${review.slug} ${item.id} ${aspect.key}`)
          aspectKeys.add(aspect.key)
        }
        records.push({review_id:review.id,rubric_version:'hospitality-v1',model:'gpt-6; offline review analysis',
          input_hash:createHash('sha256').update(review.text || '').digest('hex'),aspects:item.aspects})
        countByProperty[review.slug]=(countByProperty[review.slug] || 0)+1
      }
    }
    if (seen.size!==reviews.length || reviews.length!==888) throw Error(`Coverage mismatch: ${seen.size}/${reviews.length}, expected snapshot 888`)
    if (apply) {
      await tx.unsafe(await fs.readFile(new URL('../drizzle/0032_google_review_analyses.sql',import.meta.url),'utf8'))
      // A rerun updates only analyses whose inputs, rubric or inferred evidence changed.
      await tx`insert into ota_review_analyses ${tx(records,'review_id','rubric_version','model','input_hash','aspects')}
        on conflict (review_id) do update set rubric_version=excluded.rubric_version,model=excluded.model,
        input_hash=excluded.input_hash,aspects=excluded.aspects,updated_at=now()
        where ota_review_analyses.input_hash is distinct from excluded.input_hash or ota_review_analyses.rubric_version is distinct from excluded.rubric_version
          or ota_review_analyses.aspects is distinct from excluded.aspects returning review_id`
      const [verified]=await tx`select count(*)::int count from ota_review_analyses where review_id in ${tx(records.map(r=>r.review_id))}`
      if(verified.count!==888) throw Error('Post-import count mismatch')
    }
    return {mode:apply?'applied':'validated',reviewCount:records.length,aspectCount:records.reduce((sum,r)=>sum+r.aspects.length,0),countByProperty}
  })
  console.log(JSON.stringify(result,null,2))
} finally { await db.end() }
