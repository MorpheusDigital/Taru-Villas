'use client'

import { cn } from '@/lib/utils'
import {
  buildMatrixRows,
  dutyLabel,
  type MatrixFilters,
  type PresentationAssignment,
  type PresentationParticipant,
} from '@/lib/rostering/presentation'

const dutyTone: Record<string, string> = {
  W: 'border-slate-300 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950',
  S: 'border-teal-300 bg-teal-100 text-teal-900 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200',
  O: 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
  H: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
  AL: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  SL: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300',
  LIEU: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
  TRN: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  T: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-300',
}

interface RosterMatrixProps {
  participants: PresentationParticipant[]
  assignments: PresentationAssignment[]
  filters: MatrixFilters
  selectedAssignmentId: string | null
  onSelect: (assignment: PresentationAssignment) => void
}

function dayParts(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return {
    weekday: new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(parsed),
    day: parsed.getUTCDate(),
  }
}

export function RosterMatrix({
  participants,
  assignments,
  filters,
  selectedAssignmentId,
  onSelect,
}: RosterMatrixProps) {
  const dates = [...new Set(assignments.map((item) => item.assignmentDate))].sort()
  const rows = buildMatrixRows(participants, assignments, filters)

  return (
    <div className="overflow-auto rounded-xl border bg-background shadow-sm">
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 min-w-64 border-b border-r bg-slate-950 px-4 py-3 text-left text-white">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-300">
                Employee ledger
              </span>
            </th>
            {dates.map((date) => {
              const parts = dayParts(date)
              return (
                <th
                  key={date}
                  className="sticky top-0 z-20 min-w-14 border-b border-r bg-slate-950 px-1 py-2 text-center text-white last:border-r-0"
                >
                  <span className="block text-[10px] font-medium uppercase text-slate-400">
                    {parts.weekday}
                  </span>
                  <span className="mt-0.5 block font-mono text-sm tabular-nums">
                    {parts.day}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ participant, assignmentsByDate }, rowIndex) => (
            <tr key={participant.id} className={rowIndex % 2 === 1 ? 'bg-muted/20' : undefined}>
              <th className="sticky left-0 z-10 border-b border-r bg-background px-4 py-2 text-left shadow-[6px_0_10px_-10px_rgba(15,23,42,0.8)]">
                <span className="block whitespace-nowrap font-medium">
                  {participant.fullName}
                </span>
                <span className="mt-0.5 block whitespace-nowrap text-[11px] font-normal text-muted-foreground">
                  {participant.employeeNumber} · {participant.roleCode.replace(/^DEMO_/, '').replaceAll('_', ' ')}
                </span>
              </th>
              {dates.map((date) => {
                const assignment = assignmentsByDate[date]
                return (
                  <td key={date} className="border-b border-r p-1 text-center last:border-r-0">
                    {assignment ? (
                      <button
                        type="button"
                        title={`${dutyLabel(assignment.dutyCode)} — ${assignment.explanation}`}
                        aria-label={`${participant.fullName}, ${date}: ${dutyLabel(assignment.dutyCode)}`}
                        onClick={() => onSelect(assignment)}
                        className={cn(
                          'mx-auto flex size-9 items-center justify-center rounded-md border font-mono text-[11px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          dutyTone[assignment.dutyCode] ?? 'border-border bg-muted text-foreground',
                          selectedAssignmentId === assignment.id &&
                            'ring-2 ring-teal-500 ring-offset-2',
                        )}
                      >
                        {assignment.dutyCode}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="p-10 text-center text-sm text-muted-foreground">
          No employees match these filters.
        </div>
      )}
    </div>
  )
}
