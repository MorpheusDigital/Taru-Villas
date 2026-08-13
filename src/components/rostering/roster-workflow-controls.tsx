'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Check,
  Loader2,
  Send,
  ShieldCheck,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface WorkflowChild {
  id: string
  propertyId: string
  propertyName: string
  status: 'draft' | 'submitted'
}

interface WorkflowViolation {
  id: string
  severity: 'hard' | 'soft'
  resolution: 'open' | 'overridden' | 'resolved_by_edit'
  ruleCode: string
  message: string
}

interface RosterWorkflowControlsProps {
  cycleId: string
  version: number
  status: 'draft' | 'submitted' | 'published' | 'superseded'
  propertyRosters: WorkflowChild[]
  violations: WorkflowViolation[]
  isAdmin: boolean
  accessiblePropertyIds: string[] | null
}

export function RosterWorkflowControls({
  cycleId,
  version,
  status,
  propertyRosters,
  violations,
  isAdmin,
  accessiblePropertyIds,
}: RosterWorkflowControlsProps) {
  const router = useRouter()
  const [workingKey, setWorkingKey] = useState<string | null>(null)
  const [overrideViolation, setOverrideViolation] =
    useState<WorkflowViolation | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectComments, setRejectComments] = useState('')

  const accessible =
    accessiblePropertyIds === null ? null : new Set(accessiblePropertyIds)
  const openHard = violations.filter(
    (row) => row.severity === 'hard' && row.resolution === 'open',
  )
  const openSoft = violations.filter(
    (row) => row.severity === 'soft' && row.resolution === 'open',
  )

  async function postAction(
    key: string,
    url: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) {
    setWorkingKey(key)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: version, ...body }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) throw new Error(result.error ?? 'Roster action failed')
      toast.success(successMessage)
      router.refresh()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Roster action failed')
      return false
    } finally {
      setWorkingKey(null)
    }
  }

  async function submitChild(child: WorkflowChild) {
    await postAction(
      `submit-${child.id}`,
      `/api/rostering/cycles/${cycleId}/children/${child.id}/submit`,
      {},
      `${child.propertyName} submitted for approval`,
    )
  }

  async function overrideWarning() {
    if (!overrideViolation) return
    const succeeded = await postAction(
      `override-${overrideViolation.id}`,
      `/api/rostering/cycles/${cycleId}/violations/${overrideViolation.id}/override`,
      { reason: overrideReason },
      'Warning overridden with an audit reason',
    )
    if (succeeded) {
      setOverrideViolation(null)
      setOverrideReason('')
    }
  }

  async function rejectCycle() {
    const succeeded = await postAction(
      'reject',
      `/api/rostering/cycles/${cycleId}/reject`,
      {
        rosterIds: propertyRosters.map((child) => child.id),
        comments: rejectComments,
      },
      'Roster returned to draft',
    )
    if (succeeded) {
      setRejectOpen(false)
      setRejectComments('')
    }
  }

  async function publishCycle() {
    if (
      !window.confirm(
        'Publish this roster to linked staff? The current published revision will be superseded.',
      )
    ) {
      return
    }
    await postAction(
      'publish',
      `/api/rostering/cycles/${cycleId}/publish`,
      {},
      'Roster published to staff',
    )
  }

  return (
    <>
      <Card className="gap-4 border-slate-200 bg-slate-50/70 py-0 dark:border-slate-800 dark:bg-slate-950/30">
        <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> Approval workflow
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Property rosters are submitted individually; an admin publishes the complete hub cycle.
            </p>
          </div>
          <Badge variant="outline" className="capitalize">{status}</Badge>
        </CardHeader>
        <CardContent className="grid gap-4 px-5 pb-5 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex flex-wrap gap-2">
            {propertyRosters.map((child) => {
              const canSubmit =
                status === 'draft' &&
                child.status === 'draft' &&
                (accessible === null || accessible.has(child.propertyId))
              return (
                <div
                  key={child.id}
                  className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"
                >
                  <span className="text-sm font-medium">{child.propertyName}</span>
                  {child.status === 'submitted' ? (
                    <Badge className="bg-teal-600 hover:bg-teal-600">
                      <Check /> Submitted
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Draft</Badge>
                  )}
                  {canSubmit && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => submitChild(child)}
                      disabled={workingKey !== null || openHard.length > 0 || openSoft.length > 0}
                    >
                      {workingKey === `submit-${child.id}` ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Send />
                      )}
                      Submit
                    </Button>
                  )}
                </div>
              )
            })}
          </div>

          {isAdmin && status === 'submitted' && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(true)}>
                <Undo2 /> Return to draft
              </Button>
              <Button
                onClick={publishCycle}
                disabled={workingKey !== null || openHard.length > 0 || openSoft.length > 0}
              >
                {workingKey === 'publish' ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ShieldCheck />
                )}
                Publish
              </Button>
            </div>
          )}
        </CardContent>

        {status === 'draft' && (openHard.length > 0 || openSoft.length > 0) && (
          <div className="border-t px-5 py-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4 text-amber-600" />
              Submission blockers
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {[...openHard, ...openSoft].map((violation) => (
                <div
                  key={violation.id}
                  className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide">
                      {violation.severity} · {violation.ruleCode}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {violation.message}
                    </p>
                  </div>
                  {isAdmin && violation.severity === 'soft' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOverrideViolation(violation)}
                    >
                      Override
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Dialog
        open={overrideViolation !== null}
        onOpenChange={(open) => !open && setOverrideViolation(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Override soft warning</DialogTitle>
            <DialogDescription>
              The reason is mandatory and will remain in the roster audit history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="override-reason">Override reason</Label>
            <Textarea
              id="override-reason"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="Explain why this warning is acceptable for this roster…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideViolation(null)}>
              Cancel
            </Button>
            <Button
              onClick={overrideWarning}
              disabled={overrideReason.trim().length < 5 || workingKey !== null}
            >
              {workingKey?.startsWith('override-') && (
                <Loader2 className="animate-spin" />
              )}
              Save override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Return roster to draft</DialogTitle>
            <DialogDescription>
              All property rosters will reopen for correction. Your comments are saved to the audit history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-comments">Review comments</Label>
            <Textarea
              id="reject-comments"
              value={rejectComments}
              onChange={(event) => setRejectComments(event.target.value)}
              placeholder="Describe the changes required before resubmission…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={rejectCycle}
              disabled={rejectComments.trim().length < 5 || workingKey !== null}
            >
              {workingKey === 'reject' && <Loader2 className="animate-spin" />}
              Return all to draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
