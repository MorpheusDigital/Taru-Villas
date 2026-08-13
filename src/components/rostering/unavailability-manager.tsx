'use client'

import { useMemo, useState } from 'react'
import { CalendarOff, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface EmployeeOption {
  id: string
  employeeNumber: string
  fullName: string
  basePropertyId: string
  roleCode: string
}

interface UnavailabilityRecord {
  id: string
  employeeId: string
  startDate: string
  endDate: string
  type: string
  reference: string | null
  note: string | null
  source: string
  createdAt: Date
}

interface UnavailabilityManagerProps {
  employees: EmployeeOption[]
  initialRecords: UnavailabilityRecord[]
}

export function UnavailabilityManager({
  employees,
  initialRecords,
}: UnavailabilityManagerProps) {
  const [records, setRecords] = useState(initialRecords)
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [type, setType] = useState('annual_leave')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const employeesById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  )

  async function save() {
    if (!employeeId || !startDate || !endDate) {
      return toast.error('Choose an employee and date range')
    }
    setIsSaving(true)
    try {
      const response = await fetch('/api/rostering/unavailability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          startDate,
          endDate,
          type,
          reference: reference || null,
          note: note || null,
        }),
      })
      const body = (await response.json()) as {
        error?: string
        unavailability?: UnavailabilityRecord
      }
      if (!response.ok || !body.unavailability) {
        throw new Error(body.error ?? 'Failed to save approved unavailability')
      }
      setRecords((current) => [body.unavailability!, ...current.filter((row) => row.id !== body.unavailability!.id)])
      setStartDate('')
      setEndDate('')
      setReference('')
      setNote('')
      toast.success('Approved unavailability saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save approved unavailability')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-5 py-5">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarOff className="size-5 text-teal-700" /> Add approved source record</CardTitle>
          <CardDescription>This immediately blocks roster assignment for the inclusive date range.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-5 py-5">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="No employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>{employee.employeeNumber} · {employee.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="unavailable-start">Start</Label><Input id="unavailable-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="unavailable-end">End</Label><Input id="unavailable-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['annual_leave', 'sick_leave', 'lieu', 'training', 'travel_restriction', 'other'].map((value) => (
                  <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label htmlFor="unavailable-reference">Reference</Label><Input id="unavailable-reference" value={reference} onChange={(event) => setReference(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="unavailable-note">Operational note</Label><Textarea id="unavailable-note" value={note} onChange={(event) => setNote(event.target.value)} /></div>
          <Button onClick={save} disabled={isSaving || employees.length === 0} className="w-full">
            {isSaving ? <Loader2 className="animate-spin" /> : <Plus />}{isSaving ? 'Saving…' : 'Add approved record'}
          </Button>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-5 py-5">
          <CardTitle className="text-base">Recent approved records</CardTitle>
          <CardDescription>No request or balance status is calculated here.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y px-0">
          {records.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">No approved unavailability records.</p>
          ) : records.map((record) => {
            const employee = employeesById.get(record.employeeId)
            return (
              <div key={record.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-medium">{employee?.fullName ?? 'Employee'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{record.startDate} → {record.endDate}</p>
                  {record.note && <p className="mt-1 text-sm">{record.note}</p>}
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="capitalize">{record.type.replaceAll('_', ' ')}</Badge>
                  <Badge variant="outline" className="capitalize">{record.source}</Badge>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
