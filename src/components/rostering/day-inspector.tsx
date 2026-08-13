'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, Clock3, MapPin, ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  buildDayInspection,
  type PresentationAssignment,
  type PresentationParticipant,
  type PresentationViolation,
} from '@/lib/rostering/presentation'

interface DayInspectorProps {
  participant: PresentationParticipant | null
  assignment: PresentationAssignment | null
  violations: PresentationViolation[]
  propertyNames: Record<string, string>
  footer?: ReactNode
}

export function DayInspector({
  participant,
  assignment,
  violations,
  propertyNames,
  footer,
}: DayInspectorProps) {
  const inspection = buildDayInspection(participant, assignment, violations)

  if (!inspection) {
    return (
      <Card className="sticky top-20 border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Select a roster cell to inspect its shift and rule evidence.
        </CardContent>
      </Card>
    )
  }

  const { participant: person, assignment: row } = inspection
  return (
    <Card className="sticky top-20 gap-4 overflow-hidden py-0">
      <CardHeader className="border-b bg-slate-950 px-5 py-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
              {row.assignmentDate}
            </p>
            <CardTitle className="mt-2 text-base">{person.fullName}</CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              {person.employeeNumber} · {person.roleCode.replace(/^DEMO_/, '').replaceAll('_', ' ')}
            </p>
          </div>
          <Badge className="bg-white text-slate-950 hover:bg-white">
            {row.dutyCode}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 px-5 py-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Duty
          </p>
          <p className="mt-1 font-medium">{inspection.dutyLabel}</p>
        </div>

        <div className="grid gap-3 text-sm">
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p>{propertyNames[row.dutyPropertyId] ?? row.dutyPropertyId}</p>
              {row.dutyPropertyId !== person.basePropertyId && (
                <p className="text-xs text-muted-foreground">
                  Base: {propertyNames[person.basePropertyId] ?? person.basePropertyId}
                </p>
              )}
            </div>
          </div>
          {inspection.segmentLabels.length > 0 && (
            <div className="flex items-start gap-2.5">
              <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                {inspection.segmentLabels.map((label) => (
                  <p key={label} className="font-mono text-xs tabular-nums">{label}</p>
                ))}
                <p className="mt-1 text-xs text-muted-foreground">
                  {inspection.timeSummary}
                </p>
                <p className="text-xs text-muted-foreground">
                  {Math.floor(row.scheduledMinutes / 60)}h scheduled
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Why this assignment
          </p>
          <p className="mt-1.5 text-sm leading-5">{row.explanation}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.reasonCodes.map((reason) => (
              <Badge key={reason} variant="outline" className="font-mono text-[10px]">
                {reason}
              </Badge>
            ))}
          </div>
        </div>

        {inspection.violations.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rule evidence
            </p>
            {inspection.violations.map((violation) => (
              <div
                key={violation.id}
                className={
                  violation.severity === 'hard'
                    ? 'rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100'
                    : 'rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                }
              >
                <div className="flex items-start gap-2">
                  {violation.severity === 'hard' ? (
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  )}
                  <div>
                    <p className="text-xs font-semibold uppercase">
                      {violation.severity} · {violation.ruleCode}
                    </p>
                    <p className="mt-1 text-sm leading-5">{violation.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {footer}
      </CardContent>
    </Card>
  )
}
