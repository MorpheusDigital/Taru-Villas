export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth/guards'
import { getProperties, getPropertiesForUser } from '@/lib/db/queries/properties'
import { getRoomsForProperties } from '@/lib/db/queries/rooms'
import { RoomsManager } from '@/components/assets/rooms-manager'

export default async function RoomsPage() {
  const profile = await requireRole(['admin', 'property_manager'])

  const properties =
    profile.role === 'admin'
      ? await getProperties(profile.orgId)
      : await getPropertiesForUser(profile.id)

  const rooms = await getRoomsForProperties(properties.map((p) => p.id))

  return <RoomsManager properties={properties} rooms={rooms} />
}
