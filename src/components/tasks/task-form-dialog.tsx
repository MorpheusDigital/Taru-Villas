'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm, Controller } from 'react-hook-form'
import { toast } from 'sonner'
import { format } from 'date-fns'

import type { TaskWithRelations } from '@/lib/db/queries/tasks'
import {
  STATUSES,
  STATUS_META,
  PRIORITIES,
  PRIORITY_META,
  type TaskStatus,
  type TaskPriority,
} from './task-meta'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: TaskWithRelations | null
  properties: { id: string; name: string }[]
  teams: { id: string; name: string }[]
  users: { id: string; fullName: string }[]
  projects: { id: string; name: string }[]
  defaultProjectId?: string
  canDelete?: boolean
  onSaved: () => void
}

type FormValues = {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  projectId: string  // required; defaults to defaultProjectId
  propertyId: string // '' maps to null on submit
  dueDate: string    // '' maps to null on submit
}

// Sentinel for the Radix Select "no property" option (Radix forbids empty-string values)
const NONE = '_none_'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

function multiLabel(count: number, singular: string, plural: string): string {
  if (count === 0) return `No ${plural}`
  if (count === 1) return `1 ${singular}`
  return `${count} ${plural}`
}

function reportStatus(report: TaskWithRelations['fleetReports'][number]) {
  if (report.submittedAt) return { label: 'Submitted', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
  if (new Date(report.dueAt) < new Date()) return { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' }
  return { label: 'Pending', className: 'bg-amber-100 text-amber-700 border-amber-200' }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  properties,
  teams,
  users,
  projects,
  defaultProjectId,
  canDelete,
  onSaved,
}: TaskFormDialogProps) {
  const router = useRouter()
  const isEditing = !!task

  const [isPending, setIsPending] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [teamIds, setTeamIds] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      title: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      projectId: defaultProjectId ?? '',
      propertyId: '',
      dueDate: '',
    },
  })

  // Prefill / clear when the dialog opens or the target task changes
  useEffect(() => {
    reset({
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? 'todo',
      priority: task?.priority ?? 'medium',
      projectId: task?.projectId ?? defaultProjectId ?? '',
      propertyId: task?.propertyId ?? '',
      dueDate: task?.dueDate ?? '',
    })
    setAssigneeIds(task?.assignees.map((a) => a.id) ?? [])
    setTeamIds(task?.teams.map((t) => t.id) ?? [])
  }, [open, task?.id, defaultProjectId, reset])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function onSubmit(values: FormValues) {
    if (!values.projectId) {
      toast.error('Project is required')
      return
    }
    setIsPending(true)
    try {
      const body = {
        title: values.title,
        description: values.description || null,
        status: values.status,
        priority: values.priority,
        projectId: values.projectId,
        propertyId: values.propertyId || null,
        dueDate: values.dueDate || null,
        assigneeIds,
        teamIds,
      }

      const url = task ? `/api/tasks/${task.id}` : '/api/tasks'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errBody: { error?: string } = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? 'Failed to save task')
      }

      toast.success(isEditing ? 'Task updated' : 'Task created')
      onSaved()
      router.refresh()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setIsPending(false)
    }
  }

  async function handleDelete() {
    if (!task) return
    setIsPending(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })

      if (!res.ok) {
        const errBody: { error?: string } = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? 'Failed to delete task')
      }

      toast.success('Task deleted')
      onSaved()
      router.refresh()
      setShowDelete(false)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete task')
    } finally {
      setIsPending(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Task' : 'Create Task'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {task?.vehicleRenewal && <div className="rounded-md border p-3 text-sm">
              <Link className="font-medium underline underline-offset-2" href={`/fleet/vehicles/${task.vehicleRenewal.vehicleId}`}>View vehicle renewal details</Link>
              <p className="mt-1 text-muted-foreground">Expiry: {task.vehicleRenewal.expiryDate}. Dates and the Administration Manager are managed on the vehicle record.</p>
            </div>}
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="task-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="task-title"
                placeholder="Task title"
                {...register('title', { required: 'Title is required' })}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                placeholder="Optional description"
                rows={3}
                {...register('description')}
              />
            </div>

            {/* Status + Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_META[s].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {PRIORITY_META[p].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Project */}
            <div className="space-y-1.5">
              <Label>
                Project <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="projectId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!!task?.vehicleRenewal}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Property */}
            <div className="space-y-1.5">
              <Label>Property</Label>
              <Controller
                control={control}
                name="propertyId"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>General (no property)</SelectItem>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <Label htmlFor="task-due-date">Due Date</Label>
              <Input
                id="task-due-date"
                type="date"
                readOnly={!!task?.vehicleRenewal}
                {...register('dueDate')}
              />
            </div>

            {isEditing && (task.sourceIssue || task.fleetReports.length > 0) && (
              <>
                <Separator />

                {task.sourceIssue && (
                  <section className="space-y-2" aria-label="Source survey issue">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Source survey issue</Label>
                      <Link
                        href={`/issues/${task.sourceIssue.id}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        View issue
                      </Link>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">{task.sourceIssue.title}</p>
                        <Badge variant="secondary" className="capitalize">{task.sourceIssue.status}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{task.sourceIssue.questionText}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Survey score: {task.sourceIssue.responseScore}/10</p>
                    </div>
                  </section>
                )}

                {task.fleetReports.length > 0 && (
                  <section className="space-y-2" aria-label="Linked fleet report history">
                    <Label>Linked fleet report history</Label>
                    <div className="space-y-2">
                      {task.fleetReports.map((report) => {
                        const status = reportStatus(report)
                        return (
                          <div key={report.id} className="rounded-md border p-3 text-sm">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">Fleet request #{report.requestId.slice(0, 8)}</p>
                                <p className="text-xs text-muted-foreground capitalize">Request status: {report.requestStatus}</p>
                              </div>
                              <Badge variant="outline" className={status.className}>{status.label}</Badge>
                            </div>
                            {report.purpose && <p className="mt-2 text-muted-foreground">{report.purpose}</p>}
                            <p className="mt-2 text-xs text-muted-foreground">
                              Trip: {format(new Date(report.startDate), 'd MMM yyyy')} – {format(new Date(report.endDate), 'd MMM yyyy')}
                            </p>
                            <p className="text-xs text-muted-foreground">Due: {format(new Date(report.dueAt), 'd MMM yyyy, p')}</p>
                            {report.submittedAt && <p className="text-xs text-muted-foreground">Submitted: {format(new Date(report.submittedAt), 'd MMM yyyy, p')}</p>}
                            {report.summary && <p className="mt-2 whitespace-pre-wrap">{report.summary}</p>}
                            {report.attachmentUrls.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                {report.attachmentUrls.map((url, index) => (
                                  <a key={url} href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                    Attachment {index + 1}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* Assignees multi-select */}
            <div className="space-y-1.5">
              <Label>Assignees</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-normal"
                    disabled={!!task?.vehicleRenewal}
                  >
                    {multiLabel(assigneeIds.length, 'person', 'assignees')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  {users.length === 0 ? (
                    <p className="px-2 py-1 text-sm text-muted-foreground">
                      No users available
                    </p>
                  ) : (
                    <div className="max-h-48 space-y-0.5 overflow-y-auto">
                      {users.map((u) => (
                        <label
                          key={u.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Checkbox
                            checked={assigneeIds.includes(u.id)}
                            onCheckedChange={() =>
                              setAssigneeIds((ids) => toggleId(ids, u.id))
                            }
                          />
                          {u.fullName}
                        </label>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Teams multi-select */}
            <div className="space-y-1.5">
              <Label>Teams</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-normal"
                  >
                    {multiLabel(teamIds.length, 'team', 'teams')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  {teams.length === 0 ? (
                    <p className="px-2 py-1 text-sm text-muted-foreground">
                      No teams available
                    </p>
                  ) : (
                    <div className="max-h-48 space-y-0.5 overflow-y-auto">
                      {teams.map((t) => (
                        <label
                          key={t.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Checkbox
                            checked={teamIds.includes(t.id)}
                            onCheckedChange={() =>
                              setTeamIds((ids) => toggleId(ids, t.id))
                            }
                          />
                          {t.name}
                        </label>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Footer row */}
            <div className="flex items-center gap-2 pt-2">
              {canDelete && isEditing && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDelete(true)}
                  disabled={isPending}
                >
                  Delete
                </Button>
              )}
              <div className="flex-1" />
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? isEditing
                    ? 'Saving…'
                    : 'Creating…'
                  : isEditing
                    ? 'Save Changes'
                    : 'Create Task'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — rendered outside the main Dialog to avoid nesting */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{task?.title}&quot;. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
