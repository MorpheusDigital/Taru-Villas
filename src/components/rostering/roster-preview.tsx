'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  Download,
  History,
  Loader2,
  Printer,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { toast } from 'sonner'

import { AssignmentEditDialog } from '@/components/rostering/assignment-edit-dialog'
import { DayInspector } from '@/components/rostering/day-inspector'
import { RosterMatrix } from '@/components/rostering/roster-matrix'
import { RosterWorkflowControls } from '@/components/rostering/roster-workflow-controls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { getCyclePreview } from '@/lib/db/queries/rostering-cycles'
import {
  groupViolations,
  type MatrixFilters,
  type PresentationAssignment,
  type PresentationParticipant,
  type PresentationViolation,
} from '@/lib/rostering/presentation'

type PreviewData = NonNullable<Awaited<ReturnType<typeof getCyclePreview>>>

interface RosterPreviewProps {
  preview: PreviewData
  isAdmin: boolean
  accessiblePropertyIds: string[] | null
}

function monthLabel(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function stringsFromJson(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function RosterPreview({
  preview,
  isAdmin,
  accessiblePropertyIds,
}: RosterPreviewProps) {
  const router = useRouter()
  const participants: PresentationParticipant[] = preview.participants.map(
    (participant) => ({
      id: participant.id,
      employeeNumber: participant.employeeNumber,
      fullName: participant.fullName,
      basePropertyId: participant.basePropertyId,
      primaryRoleId: participant.primaryRoleId,
      roleCode: participant.roleCode,
      departmentCode: participant.departmentCode,
      laborTier: participant.laborTier,
      residencyType: participant.residencyType,
      skillCodes: participant.skillCodes,
    }),
  )
  const assignments: PresentationAssignment[] = preview.assignments.map(
    (assignment) => ({
      id: assignment.id,
      participantId: assignment.participantId,
      assignmentDate: assignment.assignmentDate,
      dutyCode: assignment.dutyCode,
      dutyPropertyId: assignment.dutyPropertyId,
      roleId: assignment.roleId,
      shiftTemplateId: assignment.shiftTemplateId,
      scheduledMinutes: assignment.scheduledMinutes,
      breakMinutes: assignment.breakMinutes,
      workingMinutes: assignment.workingMinutes,
      explanation: assignment.explanation,
      reasonCodes: stringsFromJson(assignment.reasonCodes),
      segments: assignment.segments,
    }),
  )
  const violations: PresentationViolation[] = preview.violations.map(
    (violation) => ({
      id: violation.id,
      ruleCode: violation.ruleCode,
      severity: violation.severity,
      resolution: violation.resolution,
      message: violation.message,
      participantId: violation.participantId,
      propertyId: violation.propertyId,
      violationDate: violation.violationDate,
      evidence: violation.evidence,
    }),
  )

  const [propertyId, setPropertyId] = useState('all')
  const [departmentCode, setDepartmentCode] = useState('all')
  const [roleCode, setRoleCode] = useState('all')
  const [issueState, setIssueState] = useState('all')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(
    assignments[0]?.id ?? null,
  )
  const [isRegenerating, setIsRegenerating] = useState(false)

  const departments = [...new Set(participants.map((item) => item.departmentCode))].sort()
  const roles = [...new Set(participants.map((item) => item.roleCode))].sort()
  const openIssueParticipantIds = useMemo(
    () =>
      new Set(
        violations
          .filter(
            (violation) =>
              violation.resolution === 'open' && violation.participantId !== null,
          )
          .map((violation) => violation.participantId!),
      ),
    [violations],
  )
  const filters: MatrixFilters = {
    propertyId: propertyId === 'all' ? undefined : propertyId,
    departmentCode:
      departmentCode === 'all' ? undefined : departmentCode,
    roleCode: roleCode === 'all' ? undefined : roleCode,
    issueParticipantIds:
      issueState === 'open' ? openIssueParticipantIds : undefined,
  }
  const selectedAssignment =
    assignments.find((item) => item.id === selectedAssignmentId) ?? null
  const selectedParticipant = selectedAssignment
    ? participants.find(
        (item) => item.id === selectedAssignment.participantId,
      ) ?? null
    : null
  const selectedSourceParticipant = selectedAssignment
    ? preview.participants.find(
        (item) => item.id === selectedAssignment.participantId,
      ) ?? null
    : null
  const selectedEmployeeId = selectedSourceParticipant?.employeeId ?? null
  const propertyNames = Object.fromEntries(
    preview.children.map((child) => [child.propertyId, child.propertyName]),
  )
  const groupedViolations = groupViolations(violations)
  const coverageRequired = preview.demandCoverage.reduce(
    (total, row) => total + row.requiredActive,
    0,
  )
  const coverageAssigned = preview.demandCoverage.reduce(
    (total, row) => total + Math.min(row.assigned, row.requiredActive),
    0,
  )
  const canManageWholeHub =
    isAdmin ||
    preview.children.every((child) =>
      accessiblePropertyIds?.includes(child.propertyId),
    )
  const canEditSelected =
    preview.cycle.status === 'draft' &&
    selectedAssignment !== null &&
    selectedSourceParticipant !== null &&
    selectedEmployeeId !== null &&
    preview.editOptions !== null &&
    (accessiblePropertyIds === null ||
      accessiblePropertyIds.includes(selectedAssignment.dutyPropertyId))

  async function regenerate() {
    const replace = window.confirm(
      'Regenerate this draft? The current generated snapshot and any draft-only changes will be replaced.',
    )
    if (!replace) return

    setIsRegenerating(true)
    try {
      const response = await fetch('/api/rostering/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hubId: preview.cycle.hubId,
          month: preview.cycle.month,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) throw new Error(body.error ?? 'Regeneration failed')
      toast.success('Draft roster regenerated')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Regeneration failed')
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2 text-muted-foreground">
            <Link href="/rostering"><ArrowLeft /> Roster cycles</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {preview.cycle.hubName}
            </h1>
            <Badge variant="outline" className="capitalize">
              {preview.cycle.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {monthLabel(preview.cycle.month)} · Revision {preview.cycle.revision} ·
            Policy {preview.cycle.policyVersionId.slice(0, 8)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/rostering/cycles/${preview.cycle.id}/export`}>
              <Download /> Export CSV
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/rostering/${preview.cycle.id}/print`}>
              <Printer /> Print
            </Link>
          </Button>
          {preview.cycle.status === 'draft' && canManageWholeHub && (
            <Button variant="outline" onClick={regenerate} disabled={isRegenerating}>
              {isRegenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {isRegenerating ? 'Regenerating…' : 'Regenerate draft'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="gap-0 py-0">
          <CardContent className="flex items-center gap-3 px-4 py-4">
            <CalendarRange className="size-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Employees</p>
              <p className="font-mono text-lg font-semibold tabular-nums">{participants.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardContent className="flex items-center gap-3 px-4 py-4">
            <CheckCircle2 className="size-5 text-teal-600" />
            <div>
              <p className="text-xs text-muted-foreground">Demand coverage</p>
              <p className="font-mono text-lg font-semibold tabular-nums">
                {coverageAssigned}/{coverageRequired}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0 border-rose-200 py-0 dark:border-rose-900">
          <CardContent className="flex items-center gap-3 px-4 py-4">
            <ShieldAlert className="size-5 text-rose-600" />
            <div>
              <p className="text-xs text-muted-foreground">Hard violations</p>
              <p className="font-mono text-lg font-semibold tabular-nums">{groupedViolations.hard.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0 border-amber-200 py-0 dark:border-amber-900">
          <CardContent className="flex items-center gap-3 px-4 py-4">
            <AlertTriangle className="size-5 text-amber-600" />
            <div>
              <p className="text-xs text-muted-foreground">Soft warnings</p>
              <p className="font-mono text-lg font-semibold tabular-nums">{groupedViolations.soft.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <RosterWorkflowControls
        cycleId={preview.cycle.id}
        version={preview.cycle.version}
        status={preview.cycle.status}
        propertyRosters={preview.children}
        violations={preview.violations}
        isAdmin={isAdmin}
        accessiblePropertyIds={accessiblePropertyIds}
      />

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="size-4" /> Audit history
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y px-0 py-0">
          {preview.events.map((event) => (
            <details key={event.id} className="group px-5 py-3">
              <summary className="cursor-pointer list-none text-sm">
                <span className="font-medium">
                  {event.eventType.replaceAll('_', ' ')}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  v{event.cycleVersion} · {event.createdAt.toLocaleString('en-GB', {
                    timeZone: 'Asia/Colombo',
                  })}
                </span>
              </summary>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-[180px_1fr]">
                <p>Actor: {event.actorId ?? 'System'}</p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-[11px] text-foreground">
                  {JSON.stringify(event.context, null, 2)}
                </pre>
              </div>
            </details>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setPropertyId('all')}
          className={`rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
            propertyId === 'all' ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950' : 'bg-background hover:bg-muted'
          }`}
        >
          All properties
        </button>
        {preview.children.map((child) => (
          <button
            key={child.propertyId}
            type="button"
            onClick={() => setPropertyId(child.propertyId)}
            className={`rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              propertyId === child.propertyId ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950' : 'bg-background hover:bg-muted'
            }`}
          >
            {child.propertyName}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={departmentCode} onValueChange={setDepartmentCode}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((department) => (
              <SelectItem key={department} value={department}>
                {department.replace(/^DEMO_/, '').replaceAll('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleCode} onValueChange={setRoleCode}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role} value={role}>
                {role.replace(/^DEMO_/, '').replaceAll('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={issueState} onValueChange={setIssueState}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            <SelectItem value="open">Open issues only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <RosterMatrix
          participants={participants}
          assignments={assignments}
          filters={filters}
          selectedAssignmentId={selectedAssignmentId}
          onSelect={(assignment) => setSelectedAssignmentId(assignment.id)}
        />
        <DayInspector
          participant={selectedParticipant}
          assignment={selectedAssignment}
          violations={violations}
          propertyNames={propertyNames}
          footer={
            canEditSelected &&
            selectedAssignment &&
            selectedSourceParticipant &&
            selectedEmployeeId &&
            preview.editOptions ? (
              <AssignmentEditDialog
                key={selectedAssignment.id}
                cycleId={preview.cycle.id}
                version={preview.cycle.version}
                assignment={selectedAssignment}
                qualifiedRoleIds={
                  preview.editOptions.employeeSkills[
                    selectedEmployeeId
                  ] ?? []
                }
                properties={preview.editOptions.properties.filter(
                  (property) =>
                    accessiblePropertyIds === null ||
                    accessiblePropertyIds.includes(property.id),
                )}
                roles={preview.editOptions.roles}
                shiftTemplates={preview.editOptions.shiftTemplates}
              />
            ) : undefined
          }
        />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        {[
          ['W', 'Working'],
          ['S', 'Spoke duty'],
          ['O', 'Full rest'],
          ['H', 'Half-day rest'],
          ['AL', 'Annual leave'],
          ['T', 'Paid travel'],
        ].map(([code, label]) => (
          <span key={code}><strong className="font-mono text-foreground">{code}</strong> {label}</span>
        ))}
      </div>
    </div>
  )
}
