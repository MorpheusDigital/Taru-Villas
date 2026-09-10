'use client'

import { forwardFillScores } from '@/lib/reviews/trend-display'
import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SOURCE_LABELS, SOURCES, type consolidateFeedback } from '@/lib/reviews/consolidated'

type Summary = ReturnType<typeof consolidateFeedback>
const colors = {internal:'#2563eb',guest:'#059669',reviews:'#0d9488'}
export function ConsolidatedTrendChart({ trends, categories }: {trends:Summary['trends'];categories:Summary['categories']}) {
  const [category,setCategory]=useState('overall')
  const data=forwardFillScores(trends.map(point=>{
    const selected=category==='overall'?point:point.categories[category]
    return {month:point.month,label:new Date(`${point.month}-01T00:00:00Z`).toLocaleDateString('en-GB',{month:'short',year:'2-digit',timeZone:'UTC'}),
      score:selected?.score??null,
      ...Object.fromEntries(SOURCES.map(source=>[source,selected?.sources.find(s=>s.source===source)?.score??null])),
      counts:Object.fromEntries(SOURCES.map(source=>[source,selected?.sources.find(s=>s.source===source)?.count??0])),
    }
  }), ['score', ...SOURCES])
  return <Card>
    <CardHeader className="flex flex-wrap items-center justify-between gap-3 sm:flex-row">
      <CardTitle className="text-base">Score trends over time</CardTitle>
      <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Measure</span>
        <select value={category} onChange={event=>setCategory(event.target.value)} className="max-w-52 rounded-md border bg-background px-2 py-1.5" aria-label="Trend measure">
          <option value="overall">Overall score</option>
          {categories.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </label>
    </CardHeader>
    <CardContent>
      {data.some(point=>point.score!==null)?<div className="h-72 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:10,right:12,bottom:4,left:-22}} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{fontSize:11}} minTickGap={25} />
          <YAxis domain={[0,10]} tick={{fontSize:11}} />
          <Tooltip content={({active,label})=>{
            if(!active)return null
            const point=data.find(p=>p.label===label)
            if(!point)return null
            return <div className="rounded-lg border bg-background p-3 text-xs shadow-md">
              <p className="mb-2 font-medium">{label}</p>
              <p className="font-semibold">Combined: {point.score?.toFixed(2)??'No data'} / 10{point.carriedFrom.score ? ` · Carried forward from ${point.carriedFrom.score}` : ''}</p>
              {SOURCES.map(source=>{
                const score=point[source as keyof typeof point]
                return <p key={source} className="mt-1">{SOURCE_LABELS[source]}: {typeof score==='number'?score.toFixed(2):'No data'} ({point.counts[source]} {category==='overall'?'entries':'mentions'}){point.carriedFrom[source] ? ` · Carried forward from ${point.carriedFrom[source]}` : ''}</p>
              })}
            </div>
          }} />
          <Legend wrapperStyle={{fontSize:12,paddingTop:10}} />
          {SOURCES.map(source=><Line key={source} type="linear" dataKey={source} name={SOURCE_LABELS[source]} stroke={colors[source]} strokeWidth={1.5} strokeDasharray="4 3" dot={{r:2}} connectNulls={false} />)}
          <Line type="linear" dataKey="score" name="Combined" stroke="var(--foreground)" strokeWidth={2.5} dot={{r:3}} connectNulls={false} />
        </LineChart></ResponsiveContainer>
      </div>:<p className="py-16 text-center text-sm text-muted-foreground">No dated evidence for this measure in the selected period.</p>}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Monthly averages. Google and Tripadvisor dates retain the precision provided by each source; some months are approximate. Periods without a score carry forward the last available score for each line. Carried-forward values are labeled in the tooltip and do not add feedback or change averages. Lines start at the first available score.{category!=='overall'?' Category scores include labeled AI-inferred sentiment.':''}</p>
    </CardContent>
  </Card>
}
