import { redirect } from 'next/navigation'

import { ForecastGrid } from '@/components/rostering/forecast-grid'
import { ImportPanel } from '@/components/rostering/import-panel'
import { ProfileLinkManager } from '@/components/rostering/profile-link-manager'
import { UnavailabilityManager } from '@/components/rostering/unavailability-manager'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { requireAuth } from '@/lib/auth/guards'
import {
  getRosterProfileLinkDirectory,
  getRosteringSetupDirectory,
} from '@/lib/db/queries/rostering-imports'
import { getRosteringAccess } from '@/lib/rostering/access'

export const dynamic = 'force-dynamic'

function currentColomboMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`
}

export default async function RosteringSetupPage() {
  const profile = await requireAuth()
  if (!profile) return null
  if (!profile.isActive || profile.role === 'staff') redirect('/surveys')

  const access = await getRosteringAccess(profile.id, profile.role, profile.orgId)
  const [directory, linkDirectory] = await Promise.all([
    getRosteringSetupDirectory(profile.orgId, access.propertyIds),
    access.isAdmin
      ? getRosterProfileLinkDirectory(profile.orgId)
      : Promise.resolve(null),
  ])

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
          Source data
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Rostering setup
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Import workforce and planning inputs, or enter forecasts and approved
          unavailability manually. These records are treated as already approved;
          this screen does not manage leave requests or balances.
        </p>
      </div>

      <Tabs defaultValue="imports" className="gap-5">
        <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="imports">CSV imports</TabsTrigger>
          <TabsTrigger value="forecasts">Occupancy forecast</TabsTrigger>
          <TabsTrigger value="unavailability">Approved unavailability</TabsTrigger>
          {access.isAdmin && (
            <TabsTrigger value="profile-links">Staff account links</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="imports">
          <ImportPanel
            isAdmin={access.isAdmin}
            defaultMonth={currentColomboMonth()}
            propertyCodes={directory.properties.map((property) => property.code)}
            employeeNumbers={directory.employees.map((employee) => employee.employeeNumber)}
          />
        </TabsContent>
        <TabsContent value="forecasts">
          <ForecastGrid
            properties={directory.properties}
            defaultMonth={currentColomboMonth()}
          />
        </TabsContent>
        <TabsContent value="unavailability">
          <UnavailabilityManager
            employees={directory.employees}
            initialRecords={directory.unavailability}
          />
        </TabsContent>
        {linkDirectory && (
          <TabsContent value="profile-links">
            <ProfileLinkManager
              employees={linkDirectory.employees}
              profiles={linkDirectory.profiles}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
