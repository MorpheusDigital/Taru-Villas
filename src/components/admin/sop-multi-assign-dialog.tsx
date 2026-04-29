'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Frequency = 'daily' | 'weekly' | 'monthly'

interface UserOption {
  id: string
  fullName: string | null
  email?: string | null
}

interface PropertyOption {
  id: string
  name: string
}

interface RowState {
  userId: string
  propertyId: string
  frequency: Frequency
  deadlineTime: string
  deadlineDay: number | null
  exists: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string
  users: UserOption[]
  properties: PropertyOption[]
  onCreated: () => void
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
]

export function SopMultiAssignDialog({
  open,
  onOpenChange,
  templateId,
  users,
  properties,
  onCreated,
}: Props) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([])
  const [defaultFrequency, setDefaultFrequency] = useState<Frequency>('daily')
  const [defaultTime, setDefaultTime] = useState('09:00')
  const [defaultDay, setDefaultDay] = useState<number | null>(null)
  const [notifyOnOverdue, setNotifyOnOverdue] = useState(false)
  const [rows, setRows] = useState<RowState[]>([])
  const [existingPairs, setExistingPairs] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedUserIds([])
      setSelectedPropertyIds([])
      setDefaultFrequency('daily')
      setDefaultTime('09:00')
      setDefaultDay(null)
      setNotifyOnOverdue(false)
      setRows([])
      // Fetch existing pairs
      fetch(`/api/sops/assignments/existing?templateId=${templateId}`)
        .then((r) => r.ok ? r.json() : [])
        .then((pairs: Array<{ userId: string; propertyId: string }>) => {
          setExistingPairs(new Set(pairs.map((p) => `${p.userId}|${p.propertyId}`)))
        })
        .catch(() => setExistingPairs(new Set()))
    }
  }, [open, templateId])

  // Regenerate matrix when chip selections change
  useEffect(() => {
    const next: RowState[] = []
    for (const userId of selectedUserIds) {
      for (const propertyId of selectedPropertyIds) {
        const exists = existingPairs.has(`${userId}|${propertyId}`)
        const prev = rows.find((r) => r.userId === userId && r.propertyId === propertyId)
        if (prev && !exists) {
          next.push(prev)
        } else {
          next.push({
            userId,
            propertyId,
            frequency: defaultFrequency,
            deadlineTime: defaultTime,
            deadlineDay: defaultFrequency === 'daily' ? null : defaultDay,
            exists,
          })
        }
      }
    }
    setRows(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserIds, selectedPropertyIds, existingPairs])

  function handleDefaultChange<K extends 'frequency' | 'time' | 'day'>(
    field: K,
    value: K extends 'frequency' ? Frequency : K extends 'time' ? string : number | null
  ) {
    if (field === 'frequency') setDefaultFrequency(value as Frequency)
    if (field === 'time') setDefaultTime(value as string)
    if (field === 'day') setDefaultDay(value as number | null)
    if (rows.some((r) => !r.exists) && confirm('Apply this default to all new rows?')) {
      const nextFreq = field === 'frequency' ? (value as Frequency) : defaultFrequency
      const nextTime = field === 'time' ? (value as string) : defaultTime
      const nextDay = field === 'day' ? (value as number | null) : defaultDay
      setRows(rows.map((r) =>
        r.exists
          ? r
          : {
              ...r,
              frequency: nextFreq,
              deadlineTime: nextTime,
              deadlineDay: nextFreq === 'daily' ? null : nextDay,
            }
      ))
    }
  }

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const newRowCount = rows.filter((r) => !r.exists).length
  const skipCount = rows.filter((r) => r.exists).length

  async function handleSubmit() {
    const newRows = rows.filter((r) => !r.exists)
    if (newRows.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/sops/assignments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          rows: newRows.map((r) => ({
            userId: r.userId,
            propertyId: r.propertyId,
            frequency: r.frequency,
            deadlineTime: r.deadlineTime,
            deadlineDay: r.deadlineDay,
            notifyOnOverdue,
          })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? 'Failed to create assignments')
        return
      }
      const result = await res.json()
      toast.success(`Created ${result.created} assignment${result.created === 1 ? '' : 's'}${result.skipped > 0 ? ` (${result.skipped} skipped)` : ''}`)
      onCreated()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  function toggleUser(id: string) {
    setSelectedUserIds(selectedUserIds.includes(id)
      ? selectedUserIds.filter((u) => u !== id)
      : [...selectedUserIds, id])
  }
  function toggleProperty(id: string) {
    setSelectedPropertyIds(selectedPropertyIds.includes(id)
      ? selectedPropertyIds.filter((p) => p !== id)
      : [...selectedPropertyIds, id])
  }

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const propertyMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add Assignments</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Users */}
          <div>
            <Label>Users</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {users.map((u) => {
                const selected = selectedUserIds.includes(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUser(u.id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted'
                    )}
                  >
                    {u.fullName ?? u.email}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Properties */}
          <div>
            <Label>Properties</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {properties.map((p) => {
                const selected = selectedPropertyIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProperty(p.id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted'
                    )}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Default schedule */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Default schedule (applies to new rows below)</div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Frequency</Label>
                <Select value={defaultFrequency} onValueChange={(v) => handleDefaultChange('frequency', v as Frequency)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {defaultFrequency === 'weekly' && (
                <div>
                  <Label className="text-xs">Day</Label>
                  <Select
                    value={String(defaultDay ?? 1)}
                    onValueChange={(v) => handleDefaultChange('day', Number(v))}
                  >
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {defaultFrequency === 'monthly' && (
                <div>
                  <Label className="text-xs">Day of month</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={defaultDay ?? 1}
                    onChange={(e) => handleDefaultChange('day', Math.max(1, Math.min(31, Number(e.target.value))))}
                    className="w-20"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">Deadline</Label>
                <Input
                  type="time"
                  value={defaultTime}
                  onChange={(e) => handleDefaultChange('time', e.target.value)}
                  className="w-28"
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Checkbox
                  id="notify"
                  checked={notifyOnOverdue}
                  onCheckedChange={(v) => setNotifyOnOverdue(Boolean(v))}
                />
                <Label htmlFor="notify" className="text-xs cursor-pointer">Notify on overdue</Label>
              </div>
            </div>
          </div>

          {/* Matrix */}
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">User</th>
                    <th className="px-3 py-2 text-left">Property</th>
                    <th className="px-3 py-2 text-left">Frequency</th>
                    <th className="px-3 py-2 text-left">Day</th>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const user = userMap.get(row.userId)
                    const prop = propertyMap.get(row.propertyId)
                    return (
                      <tr key={`${row.userId}|${row.propertyId}`} className={cn('border-t', row.exists && 'opacity-50')}>
                        <td className="px-3 py-2">{user?.fullName ?? user?.email}</td>
                        <td className="px-3 py-2">{prop?.name}</td>
                        <td className="px-3 py-2">
                          <Select
                            value={row.frequency}
                            disabled={row.exists}
                            onValueChange={(v) => updateRow(idx, {
                              frequency: v as Frequency,
                              deadlineDay: v === 'daily' ? null : (row.deadlineDay ?? 1),
                            })}
                          >
                            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          {row.frequency === 'daily' ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : row.frequency === 'weekly' ? (
                            <Select
                              value={String(row.deadlineDay ?? 1)}
                              disabled={row.exists}
                              onValueChange={(v) => updateRow(idx, { deadlineDay: Number(v) })}
                            >
                              <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {DAYS_OF_WEEK.map((d) => (
                                  <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type="number"
                              min={1}
                              max={31}
                              value={row.deadlineDay ?? 1}
                              disabled={row.exists}
                              onChange={(e) => updateRow(idx, {
                                deadlineDay: Math.max(1, Math.min(31, Number(e.target.value))),
                              })}
                              className="h-8 w-16"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="time"
                            value={row.deadlineTime}
                            disabled={row.exists}
                            onChange={(e) => updateRow(idx, { deadlineTime: e.target.value })}
                            className="h-8 w-28"
                          />
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.exists
                            ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Exists — will skip</span>
                            : <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">New</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Will create {newRowCount}.{skipCount > 0 && ` ${skipCount} already exist${skipCount === 1 ? 's' : ''} — will skip.`}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={newRowCount === 0 || submitting}>
            {submitting ? 'Creating…' : `Create ${newRowCount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
