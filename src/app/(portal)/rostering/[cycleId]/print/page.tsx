import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PrintButton } from '@/components/rostering/print-button'
import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth/guards'
import { getCyclePreview } from '@/lib/db/queries/rostering-cycles'
import {
  canViewManagementCycle,
  getRosteringAccess,
} from '@/lib/rostering/access'

export const dynamic = 'force-dynamic'

export default async function RosterPrintPage({
  params,
}: {
  params: Promise<{ cycleId: string }>
}) {
  const profile = await requireAuth()
  if (!profile) return null
  if (!profile.isActive || profile.role === 'staff') redirect('/my-roster')

  const { cycleId } = await params
  const [access, preview] = await Promise.all([
    getRosteringAccess(profile.id, profile.role, profile.orgId),
    getCyclePreview(profile.orgId, cycleId),
  ])
  if (
    !preview ||
    !canViewManagementCycle(
      access,
      preview.children.map((child) => child.propertyId),
    )
  ) {
    notFound()
  }

  const assignments = preview.assignments.filter(
    (assignment) =>
      access.propertyIds === null ||
      access.propertyIds.includes(assignment.dutyPropertyId),
  )
  const visibleParticipantIds = new Set(
    assignments.map((assignment) => assignment.participantId),
  )
  const participants = preview.participants.filter((participant) =>
    visibleParticipantIds.has(participant.id),
  )
  const dates = [
    ...new Set(assignments.map((assignment) => assignment.assignmentDate)),
  ].sort()
  const assignmentByParticipantDate = new Map(
    assignments.map((assignment) => [
      `${assignment.participantId}/${assignment.assignmentDate}`,
      assignment,
    ]),
  )

  return (
    <main className="mx-auto max-w-[1600px] bg-white p-6 text-slate-950 print:max-w-none print:p-0">
      <style>{`
        @page { size: A3 landscape; margin: 8mm; }
        @media print {
          body { background: white !important; }
          [data-print-hide] { display: none !important; }
          table { break-inside: auto; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
      `}</style>
      <div data-print-hide className="mb-6 flex items-center justify-between gap-3">
        <Button asChild variant="ghost">
          <Link href={`/rostering/${preview.cycle.id}`}>Back to roster</Link>
        </Button>
        <PrintButton />
      </div>

      <header className="mb-5 flex items-end justify-between border-b-2 border-slate-950 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">TaruShift roster</p>
          <h1 className="mt-1 text-2xl font-bold">{preview.cycle.hubName}</h1>
          <p className="mt-1 text-sm">
            {preview.cycle.month.slice(0, 7)} · Revision {preview.cycle.revision} · {preview.cycle.status}
          </p>
        </div>
        <div className="text-right text-xs">
          <p>Cycle {preview.cycle.id}</p>
          <p>Printed {new Date().toISOString()}</p>
        </div>
      </header>

      <table className="w-full border-collapse text-[8px]">
        <thead>
          <tr>
            <th className="min-w-40 border border-slate-500 bg-slate-900 px-2 py-2 text-left text-white">
              Employee
            </th>
            {dates.map((date) => (
              <th key={date} className="border border-slate-500 bg-slate-900 px-1 py-2 text-white">
                {date.slice(8, 10)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {participants.map((participant) => (
            <tr key={participant.id}>
              <th className="border border-slate-400 px-2 py-1.5 text-left">
                <span className="block font-semibold">{participant.fullName}</span>
                <span className="font-normal text-slate-600">
                  {participant.employeeNumber} · {participant.roleCode.replace(/^DEMO_/, '')}
                </span>
              </th>
              {dates.map((date) => {
                const assignment = assignmentByParticipantDate.get(
                  `${participant.id}/${date}`,
                )
                return (
                  <td
                    key={date}
                    className="border border-slate-400 px-1 py-1.5 text-center font-mono font-semibold"
                  >
                    {assignment?.dutyCode ?? '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-[9px]">
        {[
          ['W', 'Working'],
          ['S', 'Spoke duty'],
          ['O', 'Full rest'],
          ['H', 'Half-day rest'],
          ['AL', 'Annual leave'],
          ['SL', 'Sick leave'],
          ['LIEU', 'Lieu leave'],
          ['TRN', 'Training'],
          ['T', 'Paid travel'],
        ].map(([code, label]) => (
          <span key={code}><strong>{code}</strong> {label}</span>
        ))}
      </footer>
    </main>
  )
}
