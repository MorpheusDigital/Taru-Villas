import { notFound } from 'next/navigation'
import { requireAuth, getUserProperties } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import { DailyRecordsPageClient } from '@/components/daily-records/daily-records-page-client'
import { getDailyRecordTab } from '@/lib/daily-records/tabs'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Daily Records | Taru Villas',
}

export default async function DailyRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { propertyId } = await params
  const { tab } = await searchParams
  const profile = await requireAuth()
  if (!profile) return null

  if (profile.role !== 'admin') {
    const userProps = await getUserProperties(
      profile.id,
      profile.role as 'admin' | 'property_manager' | 'staff'
    )
    if (userProps && !userProps.includes(propertyId)) notFound()
  }

  const property = await getPropertyById(propertyId)
  if (!property) notFound()

  return (
    <DailyRecordsPageClient
      property={{ id: property.id, name: property.name, code: property.code, slug: property.slug }}
      isAdmin={profile.role === 'admin'}
      initialTab={getDailyRecordTab(tab)}
    />
  )
}
