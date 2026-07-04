import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'
import { QrScanner } from '@/components/assets/qr-scanner'

export default async function AssetScanPage() {
  const profile = await requireAuth()
  if (!profile) redirect('/login')

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Scan an asset</h2>
        <p className="text-sm text-muted-foreground">
          Point the camera at an asset&apos;s QR label to open its quick-view card.
        </p>
      </div>
      <QrScanner />
    </div>
  )
}
