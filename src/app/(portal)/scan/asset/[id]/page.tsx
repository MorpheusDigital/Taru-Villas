export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { getAssetById } from '@/lib/db/queries/assets'
import { getRoomsForProperty } from '@/lib/db/queries/rooms'
import { AssetQuickView } from '@/components/assets/asset-quick-view'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ScanAssetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireAuth()
  if (!profile) redirect('/login')

  // Physical projection only — this is the on-the-floor mobile surface,
  // available to any authenticated active user (staff+), so financial
  // fields must never be fetched here.
  const asset = await getAssetById(id, false)

  if (!asset) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-10">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Asset not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This QR code doesn&apos;t match any asset in the system. It may have been
              removed, or the label may be damaged. Please check with your property
              manager.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const rooms = await getRoomsForProperty(asset.propertyId)

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <AssetQuickView asset={asset} rooms={rooms} />
    </div>
  )
}
