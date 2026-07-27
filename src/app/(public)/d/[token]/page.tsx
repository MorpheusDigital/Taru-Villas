import { notFound } from 'next/navigation'
import { getDriverByToken } from '@/lib/db/queries/fleet'
import { getDriverDispatches } from '@/lib/db/queries/dispatches'
import { colomboToday } from '@/lib/fleet/dates'
import { DriverManifest } from '@/components/fleet/driver-manifest'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ token: string }> }

export default async function DriverManifestPage({ params }: PageProps) {
  const { token } = await params
  const driver = await getDriverByToken(token)
  if (!driver || !driver.isActive) notFound()

  const dispatches = await getDriverDispatches(driver.id, colomboToday())

  return (
    <DriverManifest
      token={token}
      driverName={driver.fullName}
      initialLanguage={driver.preferredLanguage}
      initialDispatches={dispatches}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''}
    />
  )
}
