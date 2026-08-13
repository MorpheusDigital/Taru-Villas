import { CalendarDays, Clock3, Download, MapPin } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuth } from '@/lib/auth/guards'
import { getMyPublishedRoster } from '@/lib/db/queries/rostering-self'

export const dynamic = 'force-dynamic'

const dutyLabels: Record<string, string> = {
  W: 'Working',
  S: 'Spoke duty',
  O: 'Full rest',
  H: 'Half-day rest',
  AL: 'Annual leave',
  SL: 'Sick leave',
  LIEU: 'Lieu leave',
  TRN: 'Training',
  T: 'Paid travel',
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function segmentLabel(segment: {
  startTime: string
  endTime: string
  endsNextDay: boolean
}) {
  return `${segment.startTime.slice(0, 5)}–${segment.endTime.slice(0, 5)}${segment.endsNextDay ? ' +1' : ''}`
}

export default async function MyRosterPage() {
  const profile = await requireAuth()
  if (!profile) return null

  const roster = await getMyPublishedRoster(profile.orgId, profile.id)

  if (!roster) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div>
          <p className="text-sm font-medium text-teal-700 dark:text-teal-400">
            TaruShift
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">My roster</h1>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <CalendarDays className="size-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No published roster yet</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Your roster will appear here after an administrator publishes it.
              If your colleagues can see theirs, ask an administrator to link your
              portal email to your employee record.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const workingDays = roster.assignments.filter((row) =>
    ['W', 'S'].includes(row.dutyCode),
  ).length
  const workingMinutes = roster.assignments.reduce(
    (total, row) => total + row.workingMinutes,
    0,
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-teal-700 dark:text-teal-400">
            TaruShift · {roster.hubName}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">My roster</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {monthLabel(roster.month)} · Published revision {roster.revision}
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/api/rostering/my-roster/export">
            <Download /> Download CSV
          </a>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="py-0">
          <CardContent className="px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Employee</p>
            <p className="mt-1 font-semibold">{roster.fullName}</p>
            <p className="text-xs text-muted-foreground">{roster.employeeNumber}</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Working days</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{workingDays}</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Working hours</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
              {(workingMinutes / 60).toFixed(1)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden py-0">
        <CardHeader className="border-b bg-slate-950 px-5 py-5 text-white">
          <CardTitle className="text-base">Published schedule</CardTitle>
          <p className="text-sm text-slate-400">
            Only administrator-published assignments appear here.
          </p>
        </CardHeader>
        <CardContent className="divide-y px-0 py-0">
          {roster.assignments.map((assignment) => {
            const isWorking = ['W', 'S'].includes(assignment.dutyCode)
            return (
              <div
                key={assignment.id}
                className="grid gap-3 px-5 py-4 sm:grid-cols-[140px_100px_minmax(0,1fr)_180px] sm:items-center"
              >
                <div>
                  <p className="font-medium">{dayLabel(assignment.assignmentDate)}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {assignment.assignmentDate}
                  </p>
                </div>
                <div>
                  <Badge
                    variant={isWorking ? 'default' : 'secondary'}
                    className={isWorking ? 'bg-teal-700 hover:bg-teal-700' : ''}
                  >
                    {assignment.dutyCode}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dutyLabels[assignment.dutyCode] ?? assignment.dutyCode}
                  </p>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    {assignment.propertyName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {assignment.roleName}
                    {assignment.shiftCode ? ` · ${assignment.shiftCode}` : ''}
                  </p>
                </div>
                <div className="text-sm">
                  {assignment.segments.length > 0 ? (
                    assignment.segments.map((segment) => (
                      <p
                        key={`${segment.assignmentId}-${segment.sortOrder}`}
                        className="flex items-center gap-2 font-mono text-xs tabular-nums"
                      >
                        <Clock3 className="size-3.5 text-muted-foreground" />
                        {segmentLabel(segment)}
                      </p>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No shift time</span>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
