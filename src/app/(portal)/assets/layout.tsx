import { requireAuth } from '@/lib/auth/guards'
import { Separator } from '@/components/ui/separator'
import { AssetsAreaTabs } from '@/components/assets/assets-area-tabs'

export default async function AssetsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Asset Registry</h1>
        <p className="text-muted-foreground">
          Track fixed assets, rooms and inventory across your properties.
        </p>
      </div>

      <AssetsAreaTabs />

      <Separator />

      {children}
    </div>
  )
}
