import { and, eq, inArray, notLike } from 'drizzle-orm'
import { db } from '../index'
import { otaReviews, otaReviewSources, otaReviewAnalyses, properties, surveySubmissions,
  surveyResponses, surveyTemplates, surveyQuestions, surveySubcategories, surveyCategories } from '../schema'
import { type FeedbackEntry, type FeedbackAspect, googleAspects, tripadvisorAspects, googleChronologyEligible, mapSurveyCategory, normalizeRating } from '../../reviews/consolidated'
import { reviewDateLabel, reviewListingUrl } from '../../reviews/display'

export async function getConsolidatedFeedback(orgId: string, propertyId?: string): Promise<FeedbackEntry[]> {
  const scope = and(eq(properties.orgId, orgId), eq(properties.isActive,true), propertyId ? eq(properties.id,propertyId) : undefined)
  const [online, surveyRows] = await Promise.all([
    db.select({source:otaReviewSources.source,id:otaReviews.id, propertyId:properties.id, propertyName:properties.name,
      author:otaReviews.authorName, text:otaReviews.text, rating:otaReviews.rating,
      reviewedAt:otaReviews.reviewedAt, fetchedAt:otaReviews.fetchedAt, metadata:otaReviews.rawPayload,
      aspects:otaReviewAnalyses.aspects, analysisId:otaReviewAnalyses.reviewId,
    }).from(otaReviews)
      .innerJoin(properties,eq(properties.id,otaReviews.propertyId))
      .innerJoin(otaReviewSources,and(eq(otaReviewSources.id,otaReviews.sourceId),eq(otaReviewSources.propertyId,properties.id)))
      .leftJoin(otaReviewAnalyses,and(eq(otaReviewAnalyses.reviewId,otaReviews.id),eq(otaReviewAnalyses.rubricVersion,'hospitality-v1')))
      .where(and(scope,inArray(otaReviewSources.source,['google','tripadvisor']),notLike(otaReviews.externalReviewId,'manual-%'))),
    db.select({id:surveySubmissions.id, propertyId:properties.id, propertyName:properties.name,
      source:surveyTemplates.surveyType, author:surveySubmissions.guestName,
      date:surveySubmissions.visitDate, notes:surveySubmissions.notes,
      question:surveyQuestions.text, responseScore:surveyResponses.score, min:surveyQuestions.scaleMin,max:surveyQuestions.scaleMax,
      category:surveyCategories.name, weight:surveyCategories.weight,
      note:surveyResponses.note, issue:surveyResponses.issueDescription,
    }).from(surveySubmissions)
      .innerJoin(properties,eq(properties.id,surveySubmissions.propertyId))
      .innerJoin(surveyTemplates,and(eq(surveyTemplates.id,surveySubmissions.templateId),eq(surveyTemplates.orgId,orgId)))
      .leftJoin(surveyResponses,eq(surveyResponses.submissionId,surveySubmissions.id))
      .leftJoin(surveyQuestions,eq(surveyQuestions.id,surveyResponses.questionId))
      .leftJoin(surveySubcategories,eq(surveySubcategories.id,surveyQuestions.subcategoryId))
      .leftJoin(surveyCategories,and(eq(surveyCategories.id,surveySubcategories.categoryId),eq(surveyCategories.templateId,surveySubmissions.templateId)))
      .where(and(scope,eq(surveySubmissions.status,'submitted'),eq(surveyTemplates.surveyType,'guest'))),
  ])
  const entries: FeedbackEntry[] = online.map(row => ({
    id:row.id,propertyId:row.propertyId,propertyName:row.propertyName,source:row.source as 'google' | 'tripadvisor',author:row.author || `${row.source === 'tripadvisor' ? 'Tripadvisor' : 'Google'} reviewer`,
    text:row.text || '',score:normalizeRating(row.rating,1,5),originalRating:row.rating,
    date:row.reviewedAt.toISOString().slice(0,10),dateLabel:reviewDateLabel(row.reviewedAt,row.metadata),
    chronologyEligible:googleChronologyEligible(row.metadata),aspects:(row.source === 'tripadvisor' ? tripadvisorAspects : googleAspects)({...row.metadata,text:row.text || ''}, row.aspects ?? []),
    sourceUrl:reviewListingUrl({...row.metadata,source:row.source}),collectedAt:row.fetchedAt.toISOString(),analyzed:row.analysisId !== null,
  }))
  const groups = new Map<string, typeof surveyRows>()
  for (const row of surveyRows) {const group=groups.get(row.id)??[];group.push(row);groups.set(row.id,group)}
  for (const rows of groups.values()) {
    const first=rows[0]
    const scored=rows.flatMap(row => {
      if (row.responseScore===null || row.min===null || row.max===null || row.category===null) return []
      const score=normalizeRating(row.responseScore,row.min,row.max)
      const weight=Number(row.weight)
      return score===null || !Number.isFinite(weight) || weight<=0 ? [] : [{...row,score,weight}]
    })
    const weight=scored.reduce((sum,r)=>sum+r.weight,0)
    const categoryGroups=new Map<string,{label:string;values:typeof scored}>()
    for (const row of scored) {
      const category=mapSurveyCategory(row.category!)
      const group=categoryGroups.get(category.key)??{label:category.label,values:[]}
      group.values.push(row);categoryGroups.set(category.key,group)
    }
    const aspects:FeedbackAspect[]=[...categoryGroups.entries()].map(([key,group])=>({key,label:group.label,
      score:group.values.reduce((sum,r)=>sum+r.score*r.weight,0)/group.values.reduce((sum,r)=>sum+r.weight,0),kind:'rated'}))
    const text=[first.notes,...rows.flatMap(row=>[row.note ? `${row.question ?? row.category}: ${row.note}`:null,row.issue ? `${row.question ?? row.category}: ${row.issue}`:null])]
      .filter((note):note is string=>Boolean(note?.trim()))
    entries.push({id:first.id,propertyId:first.propertyId,propertyName:first.propertyName,
      source:first.source,author:first.source==='internal'?'Internal survey':first.author || 'Guest survey',
      text:[...new Set(text)].join('\n\n'),score:weight?scored.reduce((sum,r)=>sum+r.score*r.weight,0)/weight:null,
      date:first.date,dateLabel:new Date(`${first.date}T00:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}),
      chronologyEligible:true,aspects,
    })
  }
  return entries.sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))
}
