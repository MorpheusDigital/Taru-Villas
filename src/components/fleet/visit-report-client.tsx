'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ReportDetails {
  visitPurpose: string
  visitLocation: string
  visitDate: string
  peopleMet: string
  findings: string
  outcomes: string
  followUpActions: string
}
interface FollowUpTask {
  title: string
  description: string
  projectId: string
  assigneeIds: string[]
  priority: 'low' | 'medium' | 'high'
  dueDate: string
}
interface ReportData {
  report: {
    id: string
    requestId: string
    taskId: string | null
    reportingTaskId: string | null
    dueAt: string | null
    submittedAt: string | null
    summary: string | null
    attachmentUrls: string[] | null
    details: Partial<ReportDetails> | null
    draft: { summary: string; details: Partial<ReportDetails>; attachmentUrls: string[]; linkedTaskIds: string[]; newTasks: (Omit<FollowUpTask, 'dueDate'> & { dueDate: string | null })[] } | null
  }
  request: { purpose: string | null; destinationText: string | null; startDate: string; endDate: string; targetPropertyId: string | null; status: string }
  linkedTasks: { id: string; title: string; projectId: string }[]
  taskOptions: { id: string; title: string; projectId: string }[]
  projectOptions: { id: string; name: string }[]
  people: { id: string; fullName: string }[]
  canSubmit: boolean
  canEdit: boolean
}

const emptyDetails: ReportDetails = { visitPurpose: '', visitLocation: '', visitDate: '', peopleMet: '', findings: '', outcomes: '', followUpActions: '' }
const detailFields = [
  ['visitPurpose', 'Visit purpose', true, 2000],
  ['visitLocation', 'Visit location', true, 1000],
  ['peopleMet', 'People met', false, 3000],
  ['findings', 'Findings and observations', false, 5000],
  ['outcomes', 'Outcomes', true, 5000],
  ['followUpActions', 'Follow-up actions', false, 5000],
] as const

function safeUrl(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

function colomboTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' }).format(new Date(value))
}

function visitDateInput(value: string): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parts = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Colombo' }).formatToParts(new Date(value))
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

async function readResponse(res: Response): Promise<ReportData> {
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to load visit report')
  return body as ReportData
}

export function VisitReportClient({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState<ReportDetails>(emptyDetails)
  const [urls, setUrls] = useState<string[]>([''])
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>([])
  const [newTasks, setNewTasks] = useState<FollowUpTask[]>([])
  const [pending, setPending] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    setData(null)
    fetch(`/api/fleet/reports/${requestId}`, { signal: controller.signal, cache: 'no-store' })
      .then(readResponse)
      .then((result) => {
        if (controller.signal.aborted) return
        setData(result)
        const draft = result.report.submittedAt ? null : result.report.draft
        const savedDetails = draft?.details ?? result.report.details
        const savedUrls = draft?.attachmentUrls ?? result.report.attachmentUrls
        setSummary(draft?.summary ?? result.report.summary ?? '')
        setDetails({ ...emptyDetails, visitPurpose: result.request.purpose ?? '', visitLocation: result.request.destinationText ?? '', ...savedDetails, visitDate: visitDateInput(savedDetails?.visitDate ?? result.request.endDate) })
        setUrls(savedUrls?.length ? savedUrls : [''])
        setLinkedTaskIds(draft?.linkedTaskIds ?? result.linkedTasks.map((task) => task.id))
        setNewTasks(draft?.newTasks.map((task) => ({ ...task, dueDate: task.dueDate ?? '' })) ?? [])
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load visit report') })
    return () => controller.abort()
  }, [requestId, reload])

  function updateTask(index: number, patch: Partial<FollowUpTask>) {
    setNewTasks((current) => current.map((task, i) => i === index ? { ...task, ...patch } : task))
  }

  async function saveDraft() {
    if (!data?.canEdit || data.report.submittedAt || pending) return
    const attachments = urls.map((url) => url.trim()).filter(Boolean)
    if (attachments.length > 20 || attachments.some((url) => !safeUrl(url))) { toast.error('Use up to 20 valid HTTP or HTTPS supporting URLs.'); return }
    setPending(true)
    setSavingDraft(true)
    try {
      const res = await fetch(`/api/fleet/reports/${requestId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, details, attachmentUrls: attachments, linkedTaskIds, newTasks: newTasks.map((task) => ({ ...task, dueDate: task.dueDate || null })) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to save draft')
      }
      toast.success('Visit report draft saved')
      router.refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Failed to save draft')
    } finally { setPending(false); setSavingDraft(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data?.canSubmit || data.report.submittedAt || pending) return
    const attachments = urls.map((url) => url.trim()).filter(Boolean)
    if (!summary.trim() || !details.visitPurpose.trim() || !details.visitLocation.trim() || !details.visitDate || !details.outcomes.trim()) {
      toast.error('Complete the required visit details, work done and outcomes.'); return
    }
    if (attachments.length > 20 || attachments.some((url) => !safeUrl(url))) { toast.error('Use up to 20 valid HTTP or HTTPS supporting URLs.'); return }
    if (linkedTaskIds.length > 20) { toast.error('Link up to 20 existing tasks.'); return }
    if (newTasks.some((task) => !task.title.trim() || !task.projectId || task.assigneeIds.length === 0 || task.assigneeIds.length > 20)) {
      toast.error('Every follow-up task needs a title, project and 1–20 assignees.'); return
    }
    setPending(true)
    try {
      const res = await fetch(`/api/fleet/reports/${requestId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: summary.trim(), attachmentUrls: attachments,
          details,
          linkedTaskIds,
          newTasks: newTasks.map((task) => ({ ...task, title: task.title.trim(), dueDate: task.dueDate || null })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to submit visit report')
      }
      toast.success('Visit report submitted')
      setData({ ...data, canEdit: false, canSubmit: false, report: { ...data.report, submittedAt: new Date().toISOString(), summary, details, attachmentUrls: attachments } })
      setReload((value) => value + 1)
      router.refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Failed to submit visit report')
    } finally { setPending(false) }
  }

  if (error) return <div className="space-y-4"><h1 className="text-2xl font-semibold">Visit report</h1><p role="alert" className="text-destructive">{error}</p><Button variant="outline" onClick={() => setReload((value) => value + 1)}>Try again</Button></div>
  if (!data) return <p role="status" className="text-muted-foreground">Loading visit report…</p>
  const submitted = !!data.report.submittedAt
  const cancelled = data.request.status === 'cancelled'
  const readOnly = !data.canEdit || submitted || cancelled
  const overdue = !submitted && !cancelled && !!data.report.dueAt && new Date(data.report.dueAt) < new Date()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Visit report</h1>
        <Badge variant={overdue ? 'destructive' : 'secondary'}>{cancelled ? 'Cancelled' : submitted ? 'Submitted' : overdue ? 'Overdue' : 'Draft'}</Badge>
        {!cancelled && <p className="text-sm text-muted-foreground">{data.report.dueAt ? `Due ${colomboTime(data.report.dueAt)} (Asia/Colombo)${data.report.reportingTaskId ? ' · 48 hours after trip completion' : ' · Original reporting deadline'}` : 'Deadline starts after trip completion — due within 48h'}</p>}
        {cancelled && <p className="text-sm text-muted-foreground">This trip was cancelled. The report is read-only.</p>}
        {submitted && <p className="text-sm text-muted-foreground">Submitted {colomboTime(data.report.submittedAt!)} (Asia/Colombo). This report is final.</p>}
        {!submitted && !cancelled && !data.canEdit && <p className="text-sm text-muted-foreground">Only the designated report owner can edit and submit this report.</p>}
        {!submitted && !cancelled && data.canEdit && !data.canSubmit && <p className="text-sm text-muted-foreground">You can start drafting now. Submit the final report after the trip is completed.</p>}
      </div>
      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Visit details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label htmlFor="visitDate">Visit date *</Label><Input id="visitDate" type="date" required disabled={readOnly || pending} value={details.visitDate} onChange={(e) => setDetails({ ...details, visitDate: e.target.value })} /></div>
            {detailFields.map(([key, label, required, maxLength]) => <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}{required ? ' *' : ''}</Label>
              {readOnly ? <p className="whitespace-pre-wrap break-words text-sm">{details[key] || '—'}</p> : <Textarea id={key} required={required} disabled={pending} maxLength={maxLength} value={details[key]} onChange={(e) => setDetails({ ...details, [key]: e.target.value })} />}
            </div>)}
            <div className="space-y-2"><Label htmlFor="report-summary">Work done *</Label>
              {readOnly ? <p className="whitespace-pre-wrap break-words text-sm">{summary || '—'}</p> : <Textarea id="report-summary" required rows={5} maxLength={5000} disabled={pending} value={summary} onChange={(e) => setSummary(e.target.value)} />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Supporting files</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {readOnly ? (urls.filter((url) => safeUrl(url)).length ? urls.filter((url) => safeUrl(url)).map((url, index) => <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="block break-all text-sm underline">{url}</a>) : <p className="text-sm text-muted-foreground">No supporting files.</p>) : <>
              <p className="text-sm text-muted-foreground">Add up to 20 HTTP or HTTPS links to supporting files.</p>
              {urls.map((url, index) => <div key={index} className="flex gap-2"><Input aria-label={`Supporting URL ${index + 1}`} type="url" placeholder="https://…" value={url} disabled={pending} onChange={(e) => setUrls((current) => current.map((value, i) => i === index ? e.target.value : value))} /><Button type="button" variant="ghost" size="icon" aria-label={`Remove URL ${index + 1}`} disabled={pending} onClick={() => setUrls((current) => current.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button></div>)}
              <Button type="button" variant="outline" disabled={pending || urls.length >= 20} onClick={() => setUrls([...urls, ''])}><Plus className="size-4" />Add URL</Button>
            </>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Linked tasks</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Link tasks supported by this visit. Linking a task does not complete it. The original ride-related task stays linked.</p>
            {data.linkedTasks.map((task) => <Link key={task.id} href={`/tasks/${task.projectId}?task=${task.id}`} className="block text-sm underline">{task.title}</Link>)}
            {!readOnly && <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">{data.taskOptions.length ? data.taskOptions.map((task) => <label key={task.id} className="flex items-start gap-2 text-sm"><Checkbox checked={linkedTaskIds.includes(task.id)} disabled={pending || task.id === data.report.taskId || (!linkedTaskIds.includes(task.id) && linkedTaskIds.length >= 20)} onCheckedChange={(checked) => setLinkedTaskIds((current) => checked ? [...new Set([...current, task.id])] : current.filter((id) => id !== task.id))} /><span>{task.title}</span></label>) : <p className="text-sm text-muted-foreground">No additional tasks available.</p>}</div>}
            {readOnly && !data.linkedTasks.length && <p className="text-sm text-muted-foreground">No linked tasks.</p>}
          </CardContent>
        </Card>
        {!readOnly && <Card>
          <CardHeader><CardTitle>Create follow-up tasks</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">These tasks will be created when you submit the report. Add up to 10.</p>
            {newTasks.map((task, index) => <fieldset key={index} disabled={pending} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between"><span className="font-medium">Follow-up task {index + 1}</span><Button type="button" variant="ghost" size="icon" aria-label={`Remove task ${index + 1}`} onClick={() => setNewTasks((current) => current.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button></div>
              <div className="space-y-2"><Label htmlFor={`task-title-${index}`}>Title *</Label><Input id={`task-title-${index}`} required maxLength={500} value={task.title} onChange={(e) => updateTask(index, { title: e.target.value })} /></div>
              <div className="space-y-2"><Label>Project *</Label><Select value={task.projectId} disabled={pending} onValueChange={(projectId) => updateTask(index, { projectId })}><SelectTrigger className="w-full"><SelectValue placeholder="Select project" /></SelectTrigger><SelectContent>{data.projectOptions.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Assignees * (up to 20)</Label><div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">{data.people.map((person) => <label key={person.id} className="flex items-center gap-2 text-sm"><Checkbox checked={task.assigneeIds.includes(person.id)} disabled={pending || (!task.assigneeIds.includes(person.id) && task.assigneeIds.length >= 20)} onCheckedChange={(checked) => updateTask(index, { assigneeIds: checked ? [...task.assigneeIds, person.id] : task.assigneeIds.filter((id) => id !== person.id) })} />{person.fullName}</label>)}</div></div>
              <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Priority</Label><Select value={task.priority} disabled={pending} onValueChange={(priority) => updateTask(index, { priority: priority as FollowUpTask['priority'] })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor={`task-due-${index}`}>Due date (Asia/Colombo)</Label><Input id={`task-due-${index}`} type="date" value={task.dueDate} onChange={(e) => updateTask(index, { dueDate: e.target.value })} /></div></div>
              <div className="space-y-2"><Label htmlFor={`task-description-${index}`}>Description</Label><Textarea id={`task-description-${index}`} maxLength={5000} value={task.description} onChange={(e) => updateTask(index, { description: e.target.value })} /></div>
            </fieldset>)}
            <Button type="button" variant="outline" disabled={pending || newTasks.length >= 10 || !data.projectOptions.length || !data.people.length} onClick={() => setNewTasks([...newTasks, { title: '', description: '', projectId: '', assigneeIds: [], priority: 'medium', dueDate: '' }])}><Plus className="size-4" />Add follow-up task</Button>
          </CardContent>
        </Card>}
        {!readOnly && <div className="space-y-2"><p className="text-sm text-muted-foreground">Submission is final. Review the report and follow-up tasks before submitting.</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={pending} onClick={saveDraft}>{savingDraft ? 'Saving…' : 'Save draft'}</Button><Button type="submit" disabled={pending || !data.canSubmit}>{pending && !savingDraft ? 'Submitting…' : 'Submit visit report'}</Button></div></div>}
      </form>
    </div>
  )
}
