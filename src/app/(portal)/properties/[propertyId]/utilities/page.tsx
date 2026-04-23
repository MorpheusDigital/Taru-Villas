import { notFound } from 'next/navigation'
import { requireAuth, getUserProperties } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import { UtilitiesPageClient } from '@/components/admin/utilities-page-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Meter Readings | Taru Villas',
}

export default async function UtilitiesPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const { propertyId } = await params
  const profile = await requireAuth()
  if (!profile) return null

  // Check property access for non-admins
  if (profile.role !== 'admin') {
    const userProps = await getUserProperties(profile.id, profile.role as 'admin' | 'property_manager' | 'staff')
    if (userProps && !userProps.includes(propertyId)) {
      notFound()
    }
  }

  const property = await getPropertyById(propertyId)
  if (!property) {
    notFound()
  }

  return (
    <UtilitiesPageClient
      property={{ id: property.id, name: property.name, code: property.code, slug: property.slug }}
      isAdmin={profile.role === 'admin'}
    />
  )
}
