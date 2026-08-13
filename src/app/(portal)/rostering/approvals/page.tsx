import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, CheckCircle2, Inbox, ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuth } from '@/lib/auth/guards'
import { listCycles } from '@/lib/db/queries/rostering-cycles'

export const dynamic = 'force-dynamic'

function monthLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

export default async function RosterApprovalsPage() {
  const profile = await requireAuth()
  if (!profile) return null
  if (!profile.isActive || profile.role !== 'admin') redirect('/rostering')

  const cycles = (await listCycles(profile.orgId, null)).filter(
    (cycle) => cycle.status === 'submitted',
  )

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
          <Link href="/rostering">Roster cycles</Link>
        </Button>
        <p className="text-sm font-medium text-teal-700 dark:text-teal-400">
          TaruShift · Admin
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Approval queue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Submitted hub cycles waiting for final review and publication.
        </p>
      </div>

      {cycles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Inbox className="size-9 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">Queue clear</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              There are no fully submitted roster cycles awaiting approval.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {cycles.map((cycle) => {
            const ready =
              cycle.openHardViolations === 0 && cycle.openSoftViolations === 0
            return (
              <Card key={cycle.id} className="gap-0 py-0">
                <CardHeader className="flex flex-row items-center justify-between gap-4 border-b px-5 py-4">
                  <div>
                    <CardTitle className="text-base">{cycle.hubName}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {monthLabel(cycle.month)} · Revision {cycle.revision}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      ready
                        ? 'border-teal-600/30 bg-teal-50 text-teal-800 dark:bg-teal-950/30 dark:text-teal-200'
                        : 'border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                    }
                  >
                    {ready ? <CheckCircle2 /> : <ShieldAlert />}
                    {ready ? 'Ready to publish' : 'Review required'}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    {cycle.properties.map((property) => (
                      <Badge key={property.propertyId} variant="secondary">
                        {property.propertyName}
                      </Badge>
                    ))}
                    <span className="self-center text-xs text-muted-foreground">
                      {cycle.openHardViolations} hard · {cycle.openSoftViolations} soft open
                    </span>
                  </div>
                  <Button asChild>
                    <Link href={`/rostering/${cycle.id}`}>
                      Review cycle <ArrowRight />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
