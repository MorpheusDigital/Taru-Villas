import { redirect } from 'next/navigation'
import { buildDailyRecordsPath } from '@/lib/daily-records/tabs'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Daily Records | Taru Villas' }

export default async function UtilitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  const { propertyId } = await params
  const { range, from, to } = await searchParams
  const query = new URLSearchParams()
  if (range) query.set('range', range)
  if (from) query.set('from', from)
  if (to) query.set('to', to)

  redirect(buildDailyRecordsPath(propertyId, 'water', query))
}
