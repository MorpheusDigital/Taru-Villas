'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Droplets, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UtilitiesPageClient } from '@/components/admin/utilities-page-client'
import { WastePageClient } from '@/components/waste/waste-page-client'
import { buildDailyRecordsPath, type DailyRecordTab } from '@/lib/daily-records/tabs'

interface DailyRecordsPageClientProps {
  property: { id: string; name: string; code: string; slug: string }
  isAdmin: boolean
  initialTab: DailyRecordTab
}

export function DailyRecordsPageClient({
  property,
  isAdmin,
  initialTab,
}: DailyRecordsPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleTabChange = (tab: string) => {
    router.replace(buildDailyRecordsPath(property.id, tab, new URLSearchParams(searchParams.toString())))
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/daily-records')}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Records — {property.name}</h1>
          <p className="text-sm text-muted-foreground">
            Track water, electricity, and daily wastage records
          </p>
        </div>
      </div>

      <Tabs value={initialTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="water" className="gap-2">
            <Droplets className="size-4" />
            Water
          </TabsTrigger>
          <TabsTrigger value="electricity" className="gap-2">
            <Zap className="size-4" />
            Electricity
          </TabsTrigger>
          <TabsTrigger value="waste" className="gap-2">
            <Trash2 className="size-4" />
            Daily Wastage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="water" className="mt-6">
          <UtilitiesPageClient
            property={property}
            isAdmin={isAdmin}
            initialUtilityType="water"
            showHeader={false}
            showUtilityTabs={false}
            embedded
          />
        </TabsContent>
        <TabsContent value="electricity" className="mt-6">
          <UtilitiesPageClient
            property={property}
            isAdmin={isAdmin}
            initialUtilityType="electricity"
            showHeader={false}
            showUtilityTabs={false}
            embedded
          />
        </TabsContent>
        <TabsContent value="waste" className="mt-6">
          <WastePageClient property={property} isAdmin={isAdmin} showHeader={false} embedded />
        </TabsContent>
      </Tabs>
    </div>
  )
}
