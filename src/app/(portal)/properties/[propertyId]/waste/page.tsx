import { redirect } from 'next/navigation'
import { buildDailyRecordsPath } from '@/lib/daily-records/tabs'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Daily Records | Taru Villas' }

export default async function PropertyWastePage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const { propertyId } = await params
  redirect(buildDailyRecordsPath(propertyId, 'waste'))
}
