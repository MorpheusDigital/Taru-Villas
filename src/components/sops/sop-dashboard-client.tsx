'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  Search,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'

import { isOverdue } from '@/lib/sops/types'
import type { SopDashboardRow } from '@/lib/sops/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PropertyOption {
  id: string
  name: string
}

interface UserOption {
  id: string
  fullName: string
}

interface SopDashboardClientProps {
  completions: SopDashboardRow[]
  properties: PropertyOption[]
  users: UserOption[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
  dueDate,
  deadlineTime,
}: {
  status: string
  dueDate: string
  deadlineTime: string
}) {
  if (status === 'completed') {
    return (
      <Badge
        variant="outline"
        className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
      >
        Completed
      </Badge>
    )
  }

  if (isOverdue(dueDate, deadlineTime)) {
    return (
      <Badge
        variant="outline"
        className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
      >
        Overdue
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
    >
      Pending
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SopDashboardClient({
  completions,
  properties,
  users,
}: SopDashboardClientProps) {
  const [search, setSearch] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const filteredRows = useMemo(() => {
    return completions.filter((row) => {
      const matchesSearch =
        !search ||
        row.template.name.toLowerCase().includes(search.toLowerCase()) ||
        row.user.fullName.toLowerCase().includes(search.toLowerCase()) ||
        row.property.name.toLowerCase().includes(search.toLowerCase())

      const matchesProperty =
        propertyFilter === 'all' || row.property.id === propertyFilter

      const matchesUser =
        userFilter === 'all' || row.user.id === userFilter

      const matchesStatus = (() => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'completed')
          return row.completion.status === 'completed'
        if (statusFilter === 'overdue')
          return (
            row.completion.status === 'pending' &&
            isOverdue(row.completion.dueDate, row.assignment.deadlineTime)
          )
        if (statusFilter === 'pending')
          return (
            row.completion.status === 'pending' &&
            !isOverdue(row.completion.dueDate, row.assignment.deadlineTime)
          )
        return true
      })()

      return matchesSearch && matchesProperty && matchesUser && matchesStatus
    })
  }, [completions, search, propertyFilter, userFilter, statusFilter])

  // Summary stats
  const completedCount = completions.filter(
    (r) => r.completion.status === 'completed'
  ).length
  const overdueCount = completions.filter(
    (r) =>
      r.completion.status === 'pending' &&
      isOverdue(r.completion.dueDate, r.assignment.deadlineTime)
  ).length
  const onTimeCount = completions.filter(
    (r) =>
      r.completion.status === 'pending' &&
      !isOverdue(r.completion.dueDate, r.assignment.deadlineTime)
  ).length
  const completionRate =
    completions.length > 0
      ? Math.round((completedCount / completions.length) * 100)
      : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SOP Progress</h1>
        <p className="text-sm text-muted-foreground">
          Monitor SOP completion across properties and users
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-bold">{completionRate}%</div>
          <div className="text-xs text-muted-foreground">Completion Rate</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
          <div className="text-xs text-muted-foreground">Overdue</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-bold text-blue-600">{onTimeCount}</div>
          <div className="text-xs text-muted-foreground">Pending</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-2xl font-bold text-emerald-600">
            {completedCount}
          </div>
          <div className="text-xs text-muted-foreground">Completed</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Property" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="User" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filteredRows.length > 0 ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>SOP</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => {
                const progressPct =
                  row.totalItems > 0
                    ? Math.round(
                        (row.checkedCount / row.totalItems) * 100
                      )
                    : 0
                const rowIsOverdue =
                  row.completion.status === 'pending' &&
                  isOverdue(
                    row.completion.dueDate,
                    row.assignment.deadlineTime
                  )

                return (
                  <TableRow
                    key={row.completion.id}
                    className={
                      rowIsOverdue
                        ? 'bg-red-50/50 dark:bg-red-950/20'
                        : ''
                    }
                  >
                    <TableCell className="font-medium">
                      {row.user.fullName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.property.name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.template.name}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={row.completion.status}
                        dueDate={row.completion.dueDate}
                        deadlineTime={row.assignment.deadlineTime}
                      />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {format(new Date(row.completion.dueDate + 'T00:00:00'), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {row.completion.completedAt
                        ? format(
                            new Date(row.completion.completedAt),
                            'MMM d, h:mm a'
                          )
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <Progress value={progressPct} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                          {row.checkedCount}/{row.totalItems}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <ClipboardList className="size-10 text-muted-foreground/50" />
          <h3 className="mt-4 text-sm font-semibold">No completions found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {search ||
            propertyFilter !== 'all' ||
            userFilter !== 'all' ||
            statusFilter !== 'all'
              ? 'Try adjusting your search or filter criteria.'
              : 'Completion records will appear here when users start working on assigned SOPs.'}
          </p>
        </div>
      )}
    </div>
  )
}
