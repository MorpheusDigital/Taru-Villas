'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  ListChecks,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Building2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { SopCompletion } from './sop-completion'
import { SopsAreaTabs } from './sops-area-tabs'
import { isOverdue } from '@/lib/sops/types'
import type { SopAssignmentForUser } from '@/lib/sops/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MySopsClientProps {
  assignments: SopAssignmentForUser[]
}

type SopGroup = 'overdue' | 'dueToday' | 'completed'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MySopsClient({ assignments }: MySopsClientProps) {
  const [selectedAssignment, setSelectedAssignment] =
    useState<SopAssignmentForUser | null>(null)

  const grouped = useMemo(() => {
    const result: Record<SopGroup, SopAssignmentForUser[]> = {
      overdue: [],
      dueToday: [],
      completed: [],
    }

    for (const a of assignments) {
      const completion = a.currentCompletion
      if (completion?.status === 'completed') {
        result.completed.push(a)
      } else if (isOverdue(a.currentDueDate, a.deadlineTime)) {
        result.overdue.push(a)
      } else {
        result.dueToday.push(a)
      }
    }

    return result
  }, [assignments])

  const getProgress = (a: SopAssignmentForUser) => {
    const total = a.template.items.length
    if (total === 0) return 0
    const checked =
      a.currentCompletion?.itemCompletions.filter((ic) => ic.isChecked).length ??
      0
    return Math.round((checked / total) * 100)
  }

  const getCheckedCount = (a: SopAssignmentForUser) => {
    return (
      a.currentCompletion?.itemCompletions.filter((ic) => ic.isChecked).length ??
      0
    )
  }

  if (selectedAssignment) {
    return (
      <SopCompletion
        assignment={selectedAssignment}
        onBack={() => setSelectedAssignment(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SOPs</h1>
          <p className="text-sm text-muted-foreground">
            Complete your assigned standard operating procedures
          </p>
        </div>
        <SopsAreaTabs />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-bold text-red-600">
            {grouped.overdue.length}
          </div>
          <div className="text-xs text-muted-foreground">Overdue</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-bold text-blue-600">
            {grouped.dueToday.length}
          </div>
          <div className="text-xs text-muted-foreground">Due Today</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-bold text-emerald-600">
            {grouped.completed.length}
          </div>
          <div className="text-xs text-muted-foreground">Completed</div>
        </div>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ListChecks className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No SOPs assigned</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              You don&apos;t have any SOPs assigned to you yet. Contact your
              admin if you believe this is an error.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          {grouped.overdue.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-red-600" />
                <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wide">
                  Overdue
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.overdue.map((a) => (
                  <SopCard
                    key={a.id}
                    assignment={a}
                    variant="overdue"
                    progress={getProgress(a)}
                    checkedCount={getCheckedCount(a)}
                    onClick={() => setSelectedAssignment(a)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Due Today */}
          {grouped.dueToday.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-blue-600 uppercase tracking-wide">
                  Due Today
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.dueToday.map((a) => (
                  <SopCard
                    key={a.id}
                    assignment={a}
                    variant="due"
                    progress={getProgress(a)}
                    checkedCount={getCheckedCount(a)}
                    onClick={() => setSelectedAssignment(a)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {grouped.completed.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <h2 className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">
                  Completed
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.completed.map((a) => (
                  <SopCard
                    key={a.id}
                    assignment={a}
                    variant="completed"
                    progress={100}
                    checkedCount={a.template.items.length}
                    onClick={() => setSelectedAssignment(a)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SOP Card
// ---------------------------------------------------------------------------

function SopCard({
  assignment,
  variant,
  progress,
  checkedCount,
  onClick,
}: {
  assignment: SopAssignmentForUser
  variant: 'overdue' | 'due' | 'completed'
  progress: number
  checkedCount: number
  onClick: () => void
}) {
  const total = assignment.template.items.length
  const borderClass =
    variant === 'overdue'
      ? 'border-red-200 dark:border-red-900'
      : variant === 'completed'
        ? 'border-emerald-200 dark:border-emerald-900'
        : ''

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-muted/50 ${borderClass}`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base truncate">
          {assignment.template.name}
        </CardTitle>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="size-3" />
          {assignment.property.name}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {checkedCount}/{total} items
          </span>
          <Badge variant="outline" className="text-[10px] capitalize">
            {assignment.frequency}
          </Badge>
        </div>
        <Progress value={progress} className="h-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Due: {assignment.deadlineTime}</span>
          {variant === 'completed' && (
            <span className="text-emerald-600 font-medium">Done</span>
          )}
          {variant === 'overdue' && (
            <span className="text-red-600 font-medium">Overdue</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
